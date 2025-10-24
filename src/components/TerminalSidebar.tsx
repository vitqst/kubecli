import React, { useState, useEffect, useCallback } from 'react';
import { ResourceType } from '../resources';
import { ConfigurationPanel } from './sidebar/ConfigurationPanel';
import { ResourceList } from './sidebar/ResourceList';
import { ContextMenu } from './sidebar/ContextMenu';

// Type definitions
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

// Helper function to calculate age
function calculateAge(timestamp: string): string {
  const now = new Date();
  const created = new Date(timestamp);
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSecs}s`;
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
  // State
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pods, setPods] = useState<Pod[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loadingPods, setLoadingPods] = useState(false);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [loadingCronJobs, setLoadingCronJobs] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
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

  // Load pods
  const loadPods = useCallback(async () => {
    if (!selectedContext || !selectedNamespace || !window.kube) return;
    
    setLoadingPods(true);
    try {
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
          const readyArr = readyStr.split(',').filter(r => r === 'true');
          const totalArr = totalStr.split(',');
          const ready = `${readyArr.length}/${totalArr.length}`;
          const restarts = restartsStr.split(',').reduce((sum, r) => sum + (parseInt(r) || 0), 0);
          const age = calculateAge(ageStr);
          
          return { name, ready, status, restarts, age };
        }).filter((pod): pod is Pod => pod !== null);
        
        setPods(podList);
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
          
          return { name, ready: `${ready}/${desired}`, upToDate, available, age };
        }).filter((dep): dep is Deployment => dep !== null);
        
        setDeployments(deploymentList);
      }
    } catch (error) {
      console.error('Failed to load deployments:', error);
      setDeployments([]);
    } finally {
      setLoadingDeployments(false);
    }
  }, [selectedContext, selectedNamespace]);

  // Load cronjobs
  const loadCronJobs = useCallback(async () => {
    if (!selectedContext || !window.kube) return;
    
    setLoadingCronJobs(true);
    try {
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
      }
    } catch (error) {
      console.error('Failed to load cronjobs:', error);
      setCronJobs([]);
    } finally {
      setLoadingCronJobs(false);
    }
  }, [selectedContext]);

  // Toggle section
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const newExpanded = { ...prev, [section]: !prev[section] };
      
      // Load data when expanding
      if (newExpanded[section]) {
        if (section === 'pods') loadPods();
        if (section === 'deployments') loadDeployments();
        if (section === 'cronjobs') loadCronJobs();
      }
      
      return newExpanded;
    });
  }, [loadPods, loadDeployments, loadCronJobs]);

  // Show context menu
  const showContextMenu = useCallback((x: number, y: number, resourceType: ResourceType, resourceName: string, customNamespace?: string) => {
    setContextMenu({ x, y, resourceType, resourceName, customNamespace });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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
        <div style={styles.sidebarContent}>
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Kubernetes</h3>
          </div>

          {/* Configuration Panel */}
          <ConfigurationPanel
            kubeconfigPath={kubeconfigPath}
            availableConfigs={availableConfigs}
            selectedContext={selectedContext}
            contexts={contexts}
            selectedNamespace={selectedNamespace}
            namespaces={namespaces}
            loadingNamespaces={loadingNamespaces}
            isInEditMode={isInEditMode}
            onConfigChange={onConfigChange}
            onContextChange={onContextChange}
            onNamespaceChange={onNamespaceChange}
          />

          {/* Pods List */}
          <ResourceList
            title="Pods"
            icon="📦"
            items={pods}
            loading={loadingPods}
            isCollapsed={!expandedSections.pods}
            isInEditMode={isInEditMode}
            resourceType="pod"
            onToggle={() => toggleSection('pods')}
            onRefresh={loadPods}
            onResourceAction={onResourceAction}
            onShowContextMenu={showContextMenu}
            renderItem={(pod) => ({
              name: pod.name,
              displayName: pod.name,
              info: (
                <>
                  <span style={styles.itemStat}>
                    {pod.ready} | {pod.status} | Restarts: {pod.restarts}
                  </span>
                  <span style={styles.itemStat}>Age: {pod.age}</span>
                </>
              ),
            })}
          />

          {/* Deployments List */}
          <ResourceList
            title="Deployments"
            icon="🚀"
            items={deployments}
            loading={loadingDeployments}
            isCollapsed={!expandedSections.deployments}
            isInEditMode={isInEditMode}
            resourceType="deployment"
            onToggle={() => toggleSection('deployments')}
            onRefresh={loadDeployments}
            onResourceAction={onResourceAction}
            onShowContextMenu={showContextMenu}
            renderItem={(dep) => ({
              name: dep.name,
              displayName: dep.name,
              info: (
                <>
                  <span style={styles.itemStat}>
                    Ready: {dep.ready} | Up-to-date: {dep.upToDate} | Available: {dep.available}
                  </span>
                  <span style={styles.itemStat}>Age: {dep.age}</span>
                </>
              ),
            })}
          />

          {/* CronJobs List */}
          <ResourceList
            title="CronJobs"
            icon="⏰"
            items={cronJobs}
            loading={loadingCronJobs}
            isCollapsed={!expandedSections.cronjobs}
            isInEditMode={isInEditMode}
            resourceType="cronjob"
            onToggle={() => toggleSection('cronjobs')}
            onRefresh={loadCronJobs}
            onResourceAction={onResourceAction}
            onShowContextMenu={showContextMenu}
            renderItem={(cj) => {
              const [ns, name] = cj.name.split('/');
              return {
                name,
                displayName: cj.name,
                namespace: ns,
                info: (
                  <>
                    <span style={styles.itemStat}>
                      {cj.schedule} | Active: {cj.active} | {cj.suspend ? 'Suspended' : 'Active'}
                    </span>
                    <span style={styles.itemStat}>Last: {cj.lastSchedule}</span>
                  </>
                ),
              };
            }}
          />
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          resourceType={contextMenu.resourceType}
          resourceName={contextMenu.resourceName}
          namespace={selectedNamespace}
          customNamespace={contextMenu.customNamespace}
          onAction={onResourceAction}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '320px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flexShrink: 0,
  },
  sidebarCollapsed: {
    width: '40px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    flexShrink: 0,
  },
  collapseButton: {
    position: 'absolute',
    top: '12px',
    right: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    cursor: 'pointer',
    zIndex: 10,
  },
  sidebarContent: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px',
  },
  header: {
    marginBottom: '16px',
    paddingTop: '24px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#cccccc',
    margin: 0,
  },
  itemStat: {
    fontSize: '10px',
    color: '#858585',
    display: 'block',
  },
};
