// src/components/resource-panel/ResourcePanel.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ResourceType, getAllResources, getFavoriteActions } from '../../resources';
import { useResourceCache } from '../../contexts/ResourceCacheContext';

/**
 * Props for the ResourcePanel component
 */
interface ResourcePanelProps {
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** The currently selected resource type to display */
  selectedResourceType: ResourceType | null;
  /** The current Kubernetes namespace */
  namespace: string;
  /** Callback when a resource action is clicked */
  onAction: (actionId: string, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  /** Callback to show context menu for a resource */
  onShowContextMenu: (x: number, y: number, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  /** Callback when the panel is closed */
  onClose: () => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT_PERCENT = 0.5;
const DEFAULT_HEIGHT = 200;

/**
 * Resizable bottom panel component for browsing and interacting with Kubernetes resources.
 * Includes search, resize handle, inline actions, and a context menu trigger per row.
 */
export function ResourcePanel({
  isOpen,
  selectedResourceType,
  namespace,
  onAction,
  onShowContextMenu,
  onClose,
}: ResourcePanelProps) {
  const [height, setHeight] = useState(() => {
    const saved = localStorage.getItem('resourcePanelHeight');
    return saved ? parseInt(saved, 10) : DEFAULT_HEIGHT;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { filterByNamespace, filterByType, isLoading } = useResourceCache();

  // Get resources based on selected type
  const resources = React.useMemo(() => {
    if (!selectedResourceType) return [];

    // CronJobs are cluster-wide, others are namespace-scoped
    if (selectedResourceType === 'cronjob') {
      return filterByType('cronjob');
    }
    return filterByNamespace(namespace).filter(r => r.type === selectedResourceType);
  }, [selectedResourceType, namespace, filterByNamespace, filterByType]);

  // Filter by search query (fuzzy)
  const filteredResources = React.useMemo(() => {
    if (!searchQuery.trim()) return resources;
    const query = searchQuery.toLowerCase();
    return resources.filter(r => r.name.toLowerCase().includes(query));
  }, [resources, searchQuery]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const maxHeight = containerRect.height * MAX_HEIGHT_PERCENT;
      const newHeight = containerRect.bottom - e.clientY;
      const clampedHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, newHeight));
      setHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('resourcePanelHeight', height.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, height]);

  // Clear search when resource type changes
  useEffect(() => {
    setSearchQuery('');
  }, [selectedResourceType]);

  if (!isOpen || !selectedResourceType) return null;

  const resourceDef = getAllResources().find(r => r.type === selectedResourceType);
  const title = resourceDef?.pluralName || selectedResourceType;

  return (
    <div ref={panelRef} style={{ ...styles.panel, height }}>
      {/* Resize handle */}
      <div
        style={styles.resizeHandle}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        <input
          type="text"
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.closeButton} onClick={onClose} title="Close panel">
          ×
        </button>
      </div>

      {/* Resource list */}
      <div style={styles.list}>
        {isLoading ? (
          <div style={styles.loading}>Loading...</div>
        ) : filteredResources.length === 0 ? (
          <div style={styles.empty}>
            {searchQuery ? 'No matching resources' : 'No resources found'}
          </div>
        ) : (
          filteredResources.map(resource => {
            const context = {
              resourceName: resource.name,
              namespace: resource.namespace,
              resourceType: selectedResourceType,
            };
            const actions = getFavoriteActions(selectedResourceType, context);
            const rowKey = `${resource.namespace}/${resource.name}`;
            const isHovered = hoveredRow === rowKey;

            return (
              <div
                key={rowKey}
                style={{
                  ...styles.row,
                  backgroundColor: isHovered ? '#2a2d2e' : 'transparent',
                }}
                onMouseEnter={() => setHoveredRow(rowKey)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <span
                  style={styles.resourceName}
                  onClick={() => onAction('describe', selectedResourceType, resource.name, resource.namespace)}
                >
                  {resource.name}
                </span>
                <div style={styles.actions}>
                  {actions.slice(0, 3).map(action => (
                    <button
                      key={action.id}
                      style={styles.actionButton}
                      onClick={() => onAction(action.id, selectedResourceType, resource.name, resource.namespace)}
                      title={action.description}
                    >
                      {action.label}
                    </button>
                  ))}
                  <button
                    style={styles.moreButton}
                    title="More actions"
                    onClick={(e) => {
                      onShowContextMenu(
                        e.clientX,
                        e.clientY,
                        selectedResourceType,
                        resource.name,
                        resource.namespace
                      );
                    }}
                  >
                    ⋮
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'relative',
    backgroundColor: '#252526',
    borderTop: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  resizeHandle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    cursor: 'ns-resize',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: '1px solid #3e3e42',
    flexShrink: 0,
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#cccccc',
    textTransform: 'uppercase',
  },
  searchInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    outline: 'none',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#858585',
    fontSize: '16px',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  resourceName: {
    fontSize: '12px',
    color: '#cccccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '4px',
  },
  actionButton: {
    padding: '2px 8px',
    fontSize: '11px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    color: '#cccccc',
    cursor: 'pointer',
  },
  moreButton: {
    padding: '2px 6px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#858585',
    cursor: 'pointer',
  },
};
