import React, { useState, useMemo, useCallback } from 'react';
import { ResourceType } from '../resources';
import { ConfigurationPanel } from './sidebar/ConfigurationPanel';
import { ResourceList } from './sidebar/ResourceList';
import { ContextMenu } from './sidebar/ContextMenu';
import { GlobalSearch } from './sidebar/GlobalSearch';
import { useResourceCache } from '../contexts/ResourceCacheContext';

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
  // Use global resource cache from context
  const { filterByType, filterByNamespace, isLoading: cacheLoading } = useResourceCache();

  // State
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  // Get resources from cache, filtered by namespace
  const pods = useMemo(() => {
    const cached = filterByNamespace(selectedNamespace).filter(r => r.type === 'pod');
    return cached.map(r => ({
      name: r.name,
      ready: r.info.includes('|') ? r.info.split('|')[2]?.trim() || 'N/A' : 'N/A',
      status: r.status,
      restarts: 0, // Not in cache, could add if needed
      age: 'N/A', // Not in cache, could add if needed
    }));
  }, [filterByNamespace, selectedNamespace]);

  const deployments = useMemo(() => {
    const cached = filterByNamespace(selectedNamespace).filter(r => r.type === 'deployment');
    return cached.map(r => ({
      name: r.name,
      ready: r.info.includes('|') ? r.info.split('|')[1]?.trim() || 'N/A' : 'N/A',
      upToDate: 0, // Not in cache
      available: 0, // Not in cache
      age: 'N/A',
    }));
  }, [filterByNamespace, selectedNamespace]);

  const cronJobs = useMemo(() => {
    const cached = filterByType('cronjob');
    return cached.map(r => ({
      name: `${r.namespace}/${r.name}`,
      namespace: r.namespace,
      schedule: r.info.includes('|') ? r.info.split('|')[1]?.trim() || 'N/A' : 'N/A',
      suspend: r.status === 'Suspended',
      active: 0, // Not in cache
      lastSchedule: 'N/A',
    }));
  }, [filterByType]);

  // Toggle section
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
      {/* Custom Scrollbar Styles */}
      <style>{`
        .sidebar-content::-webkit-scrollbar {
          width: 10px;
        }
        .sidebar-content::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        .sidebar-content::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        .sidebar-content::-webkit-scrollbar-thumb:hover {
          background: #4e4e4e;
        }
      `}</style>

      {/* Collapse/Expand Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={styles.collapseButton}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '▶' : '◀'}
      </button>

      {!isCollapsed && (
        <div style={styles.sidebarContent} className="sidebar-content">
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Kubernetes</h3>
          </div>

          {/* Global Search */}
          <GlobalSearch
            selectedContext={selectedContext}
            onSelectResult={(actionId, resourceType, resourceName, namespace) => {
              onResourceAction(actionId, resourceType, resourceName, namespace);
            }}
          />

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
            loading={cacheLoading}
            isCollapsed={!expandedSections.pods}
            isInEditMode={isInEditMode}
            resourceType="pod"
            onToggle={() => toggleSection('pods')}
            onRefresh={() => {}}
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
            loading={cacheLoading}
            isCollapsed={!expandedSections.deployments}
            isInEditMode={isInEditMode}
            resourceType="deployment"
            onToggle={() => toggleSection('deployments')}
            onRefresh={() => {}}
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
            loading={cacheLoading}
            isCollapsed={!expandedSections.cronjobs}
            isInEditMode={isInEditMode}
            resourceType="cronjob"
            onToggle={() => toggleSection('cronjobs')}
            onRefresh={() => {}}
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
    scrollbarGutter: 'stable', // Reserve space for scrollbar to prevent layout shift
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
