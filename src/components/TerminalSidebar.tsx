import React, { useState, useEffect, useCallback } from 'react';
import { 
  ResourceType, 
  getFavoriteActions,
  getContextMenuActions,
} from '../resources';

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
  namespace: string;
  lastSchedule: string;
}

interface Context {
  name: string;
  cluster?: string;
  user?: string;
}

interface KubeconfigFile {
  path: string;
  name: string;
  isDefault: boolean;
}

interface TerminalSidebarProps {
  kubeconfigPath: string;
  availableConfigs: KubeconfigFile[];
  selectedContext: string;
  contexts: Context[];
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  isInEditMode: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
}

export function TerminalSidebar({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  isInEditMode,
  onConfigChange,
  onContextChange,
  onNamespaceChange,
  onResourceAction,
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
    pods: false,
    deployments: false,
    cronjobs: false,
  });
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({
    pods: false,
    deployments: false,
    cronjobs: false,
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    resourceType: ResourceType;
    resourceName: string;
    customNamespace?: string;
  } | null>(null);

  // Show context menu
  const showContextMenu = useCallback((x: number, y: number, resourceType: ResourceType, resourceName: string, customNamespace?: string) => {
    setContextMenu({ x, y, resourceType, resourceName, customNamespace });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // Load pods when namespace or context changes
  const loadPods = useCallback(async () => {
    if (!selectedContext || !selectedNamespace || !window.kube) return;
    
    setLoadingPods(true);
    try {
      // Use custom-columns for faster parsing (no JSON overhead)
      const result = await window.kube.runCommand(
        selectedContext,
        `get pods -n ${selectedNamespace} --no-headers -o custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[*].ready,TOTAL:.status.containerStatuses[*].name,STATUS:.status.phase,RESTARTS:.status.containerStatuses[*].restartCount,AGE:.metadata.creationTimestamp`
      );
      
      if (result.code === 0 && result.stdout) {
        const lines = result.stdout.trim().split('\n').filter(line => line.trim());
        const podList: Pod[] = lines.map(line => {
          const parts = line.split(/\s+/);
          if (parts.length < 6) return null;
          
          const [name, readyStr, totalStr, status, restartsStr, ageStr] = parts;
          
          // Parse ready count (true,false,true -> 2/3)
          const readyArr = readyStr.split(',').filter(r => r === 'true');
          const totalArr = totalStr.split(',');
          const ready = `${readyArr.length}/${totalArr.length}`;
          
          // Parse restarts (sum of all containers)
          const restarts = restartsStr.split(',').reduce((sum, r) => sum + (parseInt(r) || 0), 0);
          
          // Calculate age
          const age = calculateAge(ageStr);
          
          return { name, ready, status, restarts, age };
        }).filter((pod): pod is Pod => pod !== null);
        
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
      // Use custom-columns for faster parsing (no JSON overhead)
      const result = await window.kube.runCommand(
        selectedContext,
        `get deployments -n ${selectedNamespace} --no-headers -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas,UPTODATE:.status.updatedReplicas,AVAILABLE:.status.availableReplicas,AGE:.metadata.creationTimestamp`
      );
      
      if (result.code === 0 && result.stdout) {
        const lines = result.stdout.trim().split('\n').filter(line => line.trim());
        const deploymentList: Deployment[] = lines.map(line => {
          const parts = line.split(/\s+/);
          if (parts.length < 6) return null;
          
          const [name, readyStr, desiredStr, upToDateStr, availableStr, ageStr] = parts;
          
          const ready = parseInt(readyStr) || 0;
          const desired = parseInt(desiredStr) || 0;
          const upToDate = parseInt(upToDateStr) || 0;
          const available = parseInt(availableStr) || 0;
          const age = calculateAge(ageStr);
          
          return {
            name,
            ready: `${ready}/${desired}`,
            upToDate,
            available,
            age,
          };
        }).filter((dep): dep is Deployment => dep !== null);
        
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
      // Use custom-columns for faster parsing (no JSON overhead)
      const result = await window.kube.runCommand(
        selectedContext,
        `get cronjobs -A --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,SCHEDULE:.spec.schedule,SUSPEND:.spec.suspend,ACTIVE:.status.active,LASTSCHEDULE:.status.lastScheduleTime`
      );
      
      if (result.code === 0 && result.stdout) {
        const lines = result.stdout.trim().split('\n').filter(line => line.trim());
        const cronJobList: CronJob[] = lines.map(line => {
          const parts = line.split(/\s+/);
          if (parts.length < 6) return null;
          
          const [namespace, name, schedule, suspendStr, activeStr, lastScheduleStr] = parts;
          
          const suspend = suspendStr === 'true';
          const active = parseInt(activeStr) || 0;
          const lastSchedule = lastScheduleStr && lastScheduleStr !== '<none>' 
            ? calculateAge(lastScheduleStr) + ' ago' 
            : 'Never';
          
          return {
            name: `${namespace}/${name}`,
            namespace,
            schedule,
            suspend,
            active,
            lastSchedule,
          };
        }).filter((cj): cj is CronJob => cj !== null);
        
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

  // Preload all resources in background when context/namespace is ready
  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;
    
    // Small delay to let terminal initialize first
    const timer = setTimeout(() => {
      // Load pods in background
      if (!loadedSections.pods) {
        void loadPods();
      }
      
      // Load deployments in background (stagger by 500ms)
      setTimeout(() => {
        if (!loadedSections.deployments) {
          void loadDeployments();
        }
      }, 500);
      
      // Load cronjobs in background (stagger by 1000ms)
      setTimeout(() => {
        if (!loadedSections.cronjobs) {
          void loadCronJobs();
        }
      }, 1000);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [selectedContext, selectedNamespace, loadedSections.pods, loadedSections.deployments, loadedSections.cronjobs, loadPods, loadDeployments, loadCronJobs]);

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

          {/* Kubeconfig File Selector */}
          {availableConfigs.length > 1 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Kubeconfig File</div>
              <select
                value={kubeconfigPath}
                onChange={(e) => onConfigChange(e.target.value)}
                style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
                disabled={isInEditMode}
                title={isInEditMode ? 'Cannot change config while in edit mode' : ''}
              >
                {availableConfigs.map((config) => (
                  <option key={config.path} value={config.path}>
                    {config.name} {config.isDefault ? '(default)' : ''}
                  </option>
                ))}
              </select>
              <div style={styles.hint}>
                {kubeconfigPath.split('/').pop()}
              </div>
            </div>
          )}

          {/* Context Selector */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Context</div>
            {contexts.length > 0 ? (
              <>
                <select
                  value={selectedContext}
                  onChange={(e) => onContextChange(e.target.value)}
                  style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
                  disabled={isInEditMode}
                  title={isInEditMode ? 'Cannot change context while in edit mode' : ''}
                >
                  {contexts.map((ctx) => (
                    <option key={ctx.name} value={ctx.name}>
                      {ctx.name}
                    </option>
                  ))}
                </select>
                <div style={styles.hint}>
                  Cluster: {contexts.find(c => c.name === selectedContext)?.cluster || 'N/A'}
                </div>
              </>
            ) : (
              <div style={styles.noData}>No contexts available</div>
            )}
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
                  style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
                  disabled={isInEditMode}
                  title={isInEditMode ? 'Cannot change namespace while in edit mode' : ''}
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
                          {/* Favorite actions */}
                          {getFavoriteActions('pod', {
                            resourceName: pod.name,
                            namespace: selectedNamespace,
                            resourceType: 'pod',
                          }).map((action) => (
                            <button
                              key={action.id}
                              onClick={() => onResourceAction(action.id, 'pod', pod.name)}
                              style={isInEditMode ? {...styles.actionButton, ...styles.disabledButton} : styles.actionButton}
                              title={isInEditMode ? 'Cannot perform actions while in edit mode' : action.description}
                              disabled={isInEditMode}
                            >
                              {action.icon} {action.label}
                            </button>
                          ))}
                          {/* More actions button */}
                          {getContextMenuActions('pod', {
                            resourceName: pod.name,
                            namespace: selectedNamespace,
                            resourceType: 'pod',
                          }).length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Show context menu
                                const rect = e.currentTarget.getBoundingClientRect();
                                showContextMenu(e.clientX, e.clientY, 'pod', pod.name);
                              }}
                              style={isInEditMode ? {...styles.moreButton, ...styles.disabledButton} : styles.moreButton}
                              title={isInEditMode ? 'Cannot perform actions while in edit mode' : 'More actions'}
                              disabled={isInEditMode}
                            >
                              ⋯
                            </button>
                          )}
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
                          {/* Favorite actions */}
                          {getFavoriteActions('deployment', {
                            resourceName: dep.name,
                            namespace: selectedNamespace,
                            resourceType: 'deployment',
                          }).map((action) => (
                            <button
                              key={action.id}
                              onClick={() => onResourceAction(action.id, 'deployment', dep.name)}
                              style={isInEditMode ? {...styles.actionButton, ...styles.disabledButton} : styles.actionButton}
                              title={isInEditMode ? 'Cannot perform actions while in edit mode' : action.description}
                              disabled={isInEditMode}
                            >
                              {action.icon} {action.label}
                            </button>
                          ))}
                          {/* More actions button */}
                          {getContextMenuActions('deployment', {
                            resourceName: dep.name,
                            namespace: selectedNamespace,
                            resourceType: 'deployment',
                          }).length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                showContextMenu(e.clientX, e.clientY, 'deployment', dep.name);
                              }}
                              style={isInEditMode ? {...styles.moreButton, ...styles.disabledButton} : styles.moreButton}
                              title={isInEditMode ? 'Cannot perform actions while in edit mode' : 'More actions'}
                              disabled={isInEditMode}
                            >
                              ⋯
                            </button>
                          )}
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
                          {(() => {
                            const [ns, name] = cj.name.split('/');
                            const favorites = getFavoriteActions('cronjob', {
                              resourceName: name,
                              namespace: ns,
                              resourceType: 'cronjob',
                            });
                            const contextActions = getContextMenuActions('cronjob', {
                              resourceName: name,
                              namespace: ns,
                              resourceType: 'cronjob',
                            });
                            return (
                              <>
                                {/* Favorite actions */}
                                {favorites.map((action) => (
                                  <button
                                    key={action.id}
                                    onClick={() => onResourceAction(action.id, 'cronjob', name, ns)}
                                    style={isInEditMode ? {...styles.actionButton, ...styles.disabledButton} : styles.actionButton}
                                    title={isInEditMode ? 'Cannot perform actions while in edit mode' : action.description}
                                    disabled={isInEditMode}
                                  >
                                    {action.icon} {action.label}
                                  </button>
                                ))}
                                {/* More actions button */}
                                {contextActions.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      showContextMenu(e.clientX, e.clientY, 'cronjob', name, ns);
                                    }}
                                    style={isInEditMode ? {...styles.moreButton, ...styles.disabledButton} : styles.moreButton}
                                    title={isInEditMode ? 'Cannot perform actions while in edit mode' : 'More actions'}
                                    disabled={isInEditMode}
                                  >
                                    ⋯
                                  </button>
                                )}
                              </>
                            );
                          })()}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {getContextMenuActions(contextMenu.resourceType, {
            resourceName: contextMenu.resourceName,
            namespace: contextMenu.customNamespace || selectedNamespace,
            resourceType: contextMenu.resourceType,
          }).map((action) => (
            <div
              key={action.id}
              style={styles.contextMenuItem}
              onClick={() => {
                onResourceAction(action.id, contextMenu.resourceType, contextMenu.resourceName, contextMenu.customNamespace);
                closeContextMenu();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#094771';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={styles.contextMenuIcon}>{action.icon}</span>
              <span style={styles.contextMenuLabel}>{action.label}</span>
            </div>
          ))}
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
  disabledSelect: {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: '#2d2d2d',
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
  moreButton: {
    padding: '4px 8px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
  contextMenu: {
    position: 'fixed',
    backgroundColor: '#2d2d30',
    border: '1px solid #454545',
    borderRadius: '4px',
    padding: '4px 0',
    zIndex: 10000,
    minWidth: '180px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    color: '#cccccc',
    fontSize: '13px',
    transition: 'background-color 0.1s',
  },
  contextMenuIcon: {
    marginRight: '8px',
    fontSize: '14px',
  },
  contextMenuLabel: {
    flex: 1,
  },
};
