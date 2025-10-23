import React, { useState, useEffect, useCallback } from 'react';

interface Pod {
  name: string;
  ready: string;
  status: string;
  restarts: number;
  age: string;
}

interface Deployment {
  name: string;
  ready: string;
  upToDate: number;
  available: number;
  age: string;
}

interface CronJob {
  name: string;
  schedule: string;
  suspend: boolean;
  active: number;
  lastSchedule: string;
}

interface TerminalSidebarProps {
  kubeconfigPath: string;
  selectedContext: string;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  onNamespaceChange: (namespace: string) => void;
  onViewPod: (podName: string) => void;
  onEditPod: (podName: string) => void;
}

export function TerminalSidebar({
  kubeconfigPath,
  selectedContext,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  onNamespaceChange,
  onViewPod,
  onEditPod,
}: TerminalSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pods, setPods] = useState<Pod[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loadingPods, setLoadingPods] = useState(false);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [loadingCronJobs, setLoadingCronJobs] = useState(false);
  const [searchPods, setSearchPods] = useState('');
  const [searchDeployments, setSearchDeployments] = useState('');
  const [searchCronJobs, setSearchCronJobs] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pods: true,
    deployments: false,
    cronjobs: false,
  });
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({
    pods: false,
    deployments: false,
    cronjobs: false,
  });

  // Load pods when namespace or context changes
  const loadPods = useCallback(async () => {
    if (!selectedContext || !selectedNamespace || !window.kube) return;
    
    setLoadingPods(true);
    try {
      const result = await window.kube.runCommand(
        selectedContext,
        `get pods -n ${selectedNamespace} -o json`
      );
      
      if (result.code === 0 && result.stdout) {
        const data = JSON.parse(result.stdout);
        const podList: Pod[] = data.items.map((item: any) => {
          const containerStatuses = item.status.containerStatuses || [];
          const readyCount = containerStatuses.filter((c: any) => c.ready).length;
          const totalCount = containerStatuses.length;
          const restarts = containerStatuses.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0);
          
          return {
            name: item.metadata.name,
            ready: `${readyCount}/${totalCount}`,
            status: item.status.phase,
            restarts,
            age: calculateAge(item.metadata.creationTimestamp),
          };
        });
        setPods(podList);
        setLoadedSections(prev => ({ ...prev, pods: true }));
      }
    } catch (error) {
      console.error('Failed to load pods:', error);
      setPods([]);
    } finally {
      setLoadingPods(false);
    }
  }, [selectedContext, selectedNamespace]);

  // Load deployments
  const loadDeployments = useCallback(async () => {
    if (!selectedContext || !selectedNamespace || !window.kube) return;
    
    setLoadingDeployments(true);
    try {
      const result = await window.kube.runCommand(
        selectedContext,
        `get deployments -n ${selectedNamespace} -o json`
      );
      
      if (result.code === 0 && result.stdout) {
        const data = JSON.parse(result.stdout);
        const deploymentList: Deployment[] = data.items.map((item: any) => {
          const ready = item.status.readyReplicas || 0;
          const desired = item.spec.replicas || 0;
          
          return {
            name: item.metadata.name,
            ready: `${ready}/${desired}`,
            upToDate: item.status.updatedReplicas || 0,
            available: item.status.availableReplicas || 0,
            age: calculateAge(item.metadata.creationTimestamp),
          };
        });
        setDeployments(deploymentList);
        setLoadedSections(prev => ({ ...prev, deployments: true }));
      }
    } catch (error) {
      console.error('Failed to load deployments:', error);
      setDeployments([]);
    } finally {
      setLoadingDeployments(false);
    }
  }, [selectedContext, selectedNamespace]);

  // Load cronjobs (all namespaces)
  const loadCronJobs = useCallback(async () => {
    if (!selectedContext || !window.kube) return;
    
    setLoadingCronJobs(true);
    try {
      const result = await window.kube.runCommand(
        selectedContext,
        `get cronjobs -A -o json`
      );
      
      if (result.code === 0 && result.stdout) {
        const data = JSON.parse(result.stdout);
        const cronJobList: CronJob[] = data.items.map((item: any) => {
          const lastScheduleTime = item.status.lastScheduleTime;
          const lastSchedule = lastScheduleTime ? calculateAge(lastScheduleTime) + ' ago' : 'Never';
          
          return {
            name: `${item.metadata.namespace}/${item.metadata.name}`,
            schedule: item.spec.schedule,
            suspend: item.spec.suspend || false,
            active: item.status.active?.length || 0,
            lastSchedule,
          };
        });
        setCronJobs(cronJobList);
        setLoadedSections(prev => ({ ...prev, cronjobs: true }));
      }
    } catch (error) {
      console.error('Failed to load cronjobs:', error);
      setCronJobs([]);
    } finally {
      setLoadingCronJobs(false);
    }
  }, [selectedContext]);

  // Load pods only on first expand or when context/namespace changes
  useEffect(() => {
    if (selectedContext && selectedNamespace && expandedSections.pods && !loadedSections.pods) {
      void loadPods();
    }
  }, [selectedContext, selectedNamespace, expandedSections.pods, loadedSections.pods, loadPods]);

  // Load deployments only on first expand or when context/namespace changes
  useEffect(() => {
    if (selectedContext && selectedNamespace && expandedSections.deployments && !loadedSections.deployments) {
      void loadDeployments();
    }
  }, [selectedContext, selectedNamespace, expandedSections.deployments, loadedSections.deployments, loadDeployments]);

  // Load cronjobs only on first expand or when context changes
  useEffect(() => {
    if (selectedContext && expandedSections.cronjobs && !loadedSections.cronjobs) {
      void loadCronJobs();
    }
  }, [selectedContext, expandedSections.cronjobs, loadedSections.cronjobs, loadCronJobs]);

  // Reset loaded state when context or namespace changes
  useEffect(() => {
    setLoadedSections({
      pods: false,
      deployments: false,
      cronjobs: false,
    });
  }, [selectedContext, selectedNamespace]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const calculateAge = (timestamp: string): string => {
    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return '<1m';
  };

  // Filter lists based on search
  const filteredPods = pods.filter(pod => 
    pod.name.toLowerCase().includes(searchPods.toLowerCase())
  );
  
  const filteredDeployments = deployments.filter(dep => 
    dep.name.toLowerCase().includes(searchDeployments.toLowerCase())
  );
  
  const filteredCronJobs = cronJobs.filter(cj => 
    cj.name.toLowerCase().includes(searchCronJobs.toLowerCase())
  );

  return (
    <div style={isCollapsed ? styles.sidebarCollapsed : styles.sidebar}>
      {/* Collapse/Expand Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={styles.collapseButton}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '▶' : '◀'}
      </button>

      {!isCollapsed && (
        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Kubernetes</h3>
          </div>

          {/* Context Info */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Context</div>
            <div style={styles.contextInfo}>
              <div style={styles.contextName}>{selectedContext || 'None'}</div>
              <div style={styles.configPath} title={kubeconfigPath}>
                {kubeconfigPath ? kubeconfigPath.split('/').pop() : 'No config'}
              </div>
            </div>
          </div>

          {/* Namespace Selector */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Namespace</div>
            {loadingNamespaces ? (
              <div style={styles.loading}>Loading...</div>
            ) : namespaces.length > 0 ? (
              <>
                <select
                  value={selectedNamespace}
                  onChange={(e) => onNamespaceChange(e.target.value)}
                  style={styles.select}
                >
                  {namespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
                <div style={styles.hint}>
                  kubectl will use -n {selectedNamespace}
                </div>
              </>
            ) : (
              <div style={styles.noData}>No namespaces</div>
            )}
          </div>

          {/* Pods Section */}
          <div style={styles.section}>
            <div 
              style={styles.sectionHeader}
              onClick={() => toggleSection('pods')}
            >
              <span style={styles.sectionTitle}>
                {expandedSections.pods ? '▼' : '▶'} PODS ({filteredPods.length}/{pods.length})
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadPods();
                }}
                style={styles.refreshButton}
                title="Refresh pods"
              >
                🔄
              </button>
            </div>
            
            {expandedSections.pods && (
              <>
                <input
                  type="text"
                  placeholder="Search pods..."
                  value={searchPods}
                  onChange={(e) => setSearchPods(e.target.value)}
                  style={styles.searchInput}
                  onClick={(e) => e.stopPropagation()}
                />
                {loadingPods ? (
                  <div style={styles.loading}>Loading pods...</div>
                ) : filteredPods.length > 0 ? (
                  <div style={styles.podList}>
                    {filteredPods.map((pod) => (
                      <div key={pod.name} style={styles.podItem}>
                        <div style={styles.podHeader}>
                          <span 
                            style={{
                              ...styles.podName,
                              color: pod.status === 'Running' ? '#4ec9b0' : 
                                     pod.status === 'Pending' ? '#dcdcaa' : '#f48771'
                            }}
                            title={pod.name}
                          >
                            {pod.name.length > 25 ? pod.name.substring(0, 25) + '...' : pod.name}
                          </span>
                        </div>
                        <div style={styles.podInfo}>
                          <span style={styles.podStat}>
                            {pod.ready} | {pod.status} | {pod.restarts}↻ | {pod.age}
                          </span>
                        </div>
                        <div style={styles.podActions}>
                          <button
                            onClick={() => onViewPod(pod.name)}
                            style={styles.actionButton}
                            title="View pod YAML"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => onEditPod(pod.name)}
                            style={styles.actionButton}
                            title="Edit pod"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.noData}>No pods found</div>
                )}
              </>
            )}
          </div>

          {/* Deployments Section */}
          <div style={styles.section}>
            <div 
              style={styles.sectionHeader}
              onClick={() => toggleSection('deployments')}
            >
              <span style={styles.sectionTitle}>
                {expandedSections.deployments ? '▼' : '▶'} DEPLOYMENTS ({filteredDeployments.length}/{deployments.length})
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadDeployments();
                }}
                style={styles.refreshButton}
                title="Refresh deployments"
              >
                🔄
              </button>
            </div>
            
            {expandedSections.deployments && (
              <>
                <input
                  type="text"
                  placeholder="Search deployments..."
                  value={searchDeployments}
                  onChange={(e) => setSearchDeployments(e.target.value)}
                  style={styles.searchInput}
                  onClick={(e) => e.stopPropagation()}
                />
                {loadingDeployments ? (
                  <div style={styles.loading}>Loading deployments...</div>
                ) : filteredDeployments.length > 0 ? (
                  <div style={styles.podList}>
                    {filteredDeployments.map((dep) => (
                      <div key={dep.name} style={styles.podItem}>
                        <div style={styles.podHeader}>
                          <span style={styles.podName} title={dep.name}>
                            {dep.name.length > 25 ? dep.name.substring(0, 25) + '...' : dep.name}
                          </span>
                        </div>
                        <div style={styles.podInfo}>
                          <span style={styles.podStat}>
                            {dep.ready} | Up-to-date: {dep.upToDate} | Available: {dep.available} | {dep.age}
                          </span>
                        </div>
                        <div style={styles.podActions}>
                          <button
                            onClick={() => onViewPod(dep.name)}
                            style={styles.actionButton}
                            title="View deployment YAML"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => onEditPod(dep.name)}
                            style={styles.actionButton}
                            title="Edit deployment"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.noData}>No deployments found</div>
                )}
              </>
            )}
          </div>

          {/* CronJobs Section (All Namespaces) */}
          <div style={styles.section}>
            <div 
              style={styles.sectionHeader}
              onClick={() => toggleSection('cronjobs')}
            >
              <span style={styles.sectionTitle}>
                {expandedSections.cronjobs ? '▼' : '▶'} CRONJOBS ({filteredCronJobs.length}/{cronJobs.length})
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadCronJobs();
                }}
                style={styles.refreshButton}
                title="Refresh cronjobs"
              >
                🔄
              </button>
            </div>
            
            {expandedSections.cronjobs && (
              <>
                <input
                  type="text"
                  placeholder="Search cronjobs..."
                  value={searchCronJobs}
                  onChange={(e) => setSearchCronJobs(e.target.value)}
                  style={styles.searchInput}
                  onClick={(e) => e.stopPropagation()}
                />
                {loadingCronJobs ? (
                  <div style={styles.loading}>Loading cronjobs...</div>
                ) : filteredCronJobs.length > 0 ? (
                  <div style={styles.podList}>
                    {filteredCronJobs.map((cj) => (
                      <div key={cj.name} style={styles.podItem}>
                        <div style={styles.podHeader}>
                          <span 
                            style={{
                              ...styles.podName,
                              color: cj.suspend ? '#858585' : '#4ec9b0'
                            }}
                            title={cj.name}
                          >
                            {cj.name.length > 25 ? cj.name.substring(0, 25) + '...' : cj.name}
                          </span>
                        </div>
                        <div style={styles.podInfo}>
                          <span style={styles.podStat}>
                            {cj.schedule} | Active: {cj.active} | {cj.suspend ? 'Suspended' : 'Active'}
                          </span>
                          <span style={styles.podStat}>
                            Last: {cj.lastSchedule}
                          </span>
                        </div>
                        <div style={styles.podActions}>
                          <button
                            onClick={() => {
                              const [ns, name] = cj.name.split('/');
                              if (window.terminal) {
                                window.terminal.write('main', `kubectl get cronjob ${name} -n ${ns} -o yaml\n`);
                              }
                            }}
                            style={styles.actionButton}
                            title="View cronjob YAML"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => {
                              const [ns, name] = cj.name.split('/');
                              if (window.terminal) {
                                window.terminal.write('main', `kubectl edit cronjob ${name} -n ${ns}\n`);
                              }
                            }}
                            style={styles.actionButton}
                            title="Edit cronjob"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.noData}>No cronjobs found</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '280px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'width 0.2s ease',
  },
  sidebarCollapsed: {
    width: '40px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'width 0.2s ease',
  },
  collapseButton: {
    position: 'absolute',
    top: '10px',
    right: '8px',
    width: '24px',
    height: '24px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#cccccc',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    zIndex: 10,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    paddingTop: '40px',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#cccccc',
  },
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#858585',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  refreshButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#858585',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
  },
  contextInfo: {
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  contextName: {
    fontSize: '13px',
    color: '#4ec9b0',
    fontWeight: 500,
    marginBottom: '4px',
  },
  configPath: {
    fontSize: '11px',
    color: '#858585',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    fontSize: '12px',
    marginBottom: '8px',
    outline: 'none',
  },
  hint: {
    fontSize: '11px',
    color: '#858585',
    marginTop: '6px',
    fontStyle: 'italic',
  },
  loading: {
    fontSize: '12px',
    color: '#858585',
    padding: '8px',
  },
  noData: {
    fontSize: '12px',
    color: '#858585',
    padding: '8px',
    fontStyle: 'italic',
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resourceItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  resourceIcon: {
    fontSize: '14px',
    marginRight: '8px',
  },
  resourceLabel: {
    fontSize: '13px',
    color: '#cccccc',
    flex: 1,
  },
  comingSoon: {
    fontSize: '10px',
    color: '#858585',
    fontStyle: 'italic',
  },
  podList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  podItem: {
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  podHeader: {
    marginBottom: '4px',
  },
  podName: {
    fontSize: '12px',
    fontWeight: 500,
    display: 'block',
  },
  podInfo: {
    marginBottom: '6px',
  },
  podStat: {
    fontSize: '10px',
    color: '#858585',
  },
  podActions: {
    display: 'flex',
    gap: '4px',
  },
  actionButton: {
    flex: 1,
    padding: '4px 6px',
    fontSize: '10px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
  },
};
