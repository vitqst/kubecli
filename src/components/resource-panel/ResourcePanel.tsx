// src/components/resource-panel/ResourcePanel.tsx
import React, { useRef, useEffect, useCallback } from 'react';
import { ResourceType, getResourceDefinition } from '../../resources';
import { useResourceCache } from '../../contexts/ResourceCacheContext';
import { LoadingProgress } from './LoadingProgress';
import type { PanelState } from '../../hooks/useTabs';

/**
 * Props for the ResourcePanel component.
 * Now a controlled component - all state is passed via props.
 */
interface ResourcePanelProps {
  /** Panel state from parent (controlled) */
  panelState: PanelState;
  /** Callback to update panel state */
  onPanelStateChange: (updates: Partial<PanelState>) => void;
  /** All namespaces available for filtering */
  namespaces: string[];
  /** Callback to show context menu for a resource */
  onShowContextMenu: (x: number, y: number, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  /** Callback when the panel is closed */
  onClose: () => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT_PERCENT = 0.5;

/**
 * Resizable bottom panel component for browsing and interacting with Kubernetes resources.
 * Includes search, resize handle, inline actions, and a context menu trigger per row.
 * Now a controlled component - state is passed via panelState prop.
 */
export function ResourcePanel({
  panelState,
  onPanelStateChange,
  namespaces,
  onShowContextMenu,
  onClose,
}: ResourcePanelProps) {
  // Destructure panel state for convenience
  const {
    isOpen,
    selectedResourceType,
    selectedNamespaces,
    searchQuery,
    sortColumn,
    sortDirection,
    height,
  } = panelState;

  const [isResizing, setIsResizing] = React.useState(false);
  const [hoveredRow, setHoveredRow] = React.useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { filterByNamespaces, filterByType, isLoading, loadingStates, refreshType } = useResourceCache();

  // Keep selection in sync with available namespaces
  useEffect(() => {
    const filtered = selectedNamespaces.filter(ns => namespaces.includes(ns));
    if (filtered.length !== selectedNamespaces.length) {
      onPanelStateChange({ selectedNamespaces: filtered });
    }
  }, [namespaces, selectedNamespaces, onPanelStateChange]);

  // Get resources based on selected type and namespaces (default: all namespaces)
  const resources = React.useMemo(() => {
    if (!selectedResourceType) return [];

    if (selectedResourceType === 'cronjob') {
      // CronJobs are cluster-wide; still respect namespace filter if user picked any
      return selectedNamespaces.length
        ? filterByNamespaces(selectedNamespaces, 'cronjob')
        : filterByType('cronjob');
    }

    return filterByNamespaces(selectedNamespaces, selectedResourceType);
  }, [selectedResourceType, selectedNamespaces, filterByNamespaces, filterByType]);

  // Filter by search query (fuzzy)
  const filteredResources = React.useMemo(() => {
    if (!searchQuery.trim()) return resources;
    const query = searchQuery.toLowerCase();
    return resources.filter(r => r.name.toLowerCase().includes(query));
  }, [resources, searchQuery]);

  // Sort resources
  const sortedResources = React.useMemo(() => {
    if (!sortColumn) return filteredResources;

    const resourceDef = selectedResourceType ? getResourceDefinition(selectedResourceType) : null;
    const columnDef = resourceDef?.columns.find(c => c.key === sortColumn);

    return [...filteredResources].sort((a, b) => {
      let aVal = a.columns[sortColumn];
      let bVal = b.columns[sortColumn];

      // Apply transform if available for consistent sorting
      if (columnDef?.transform) {
        aVal = columnDef.transform(aVal);
        bVal = columnDef.transform(bVal);
      }

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredResources, sortColumn, sortDirection, selectedResourceType]);

  // Handle column header click for sorting
  const handleColumnClick = useCallback((columnKey: string) => {
    if (sortColumn === columnKey) {
      // Toggle direction or clear sort
      if (sortDirection === 'asc') {
        onPanelStateChange({ sortDirection: 'desc' });
      } else {
        onPanelStateChange({ sortColumn: null, sortDirection: 'asc' });
      }
    } else {
      onPanelStateChange({ sortColumn: columnKey, sortDirection: 'asc' });
    }
  }, [sortColumn, sortDirection, onPanelStateChange]);

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
      onPanelStateChange({ height: clampedHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onPanelStateChange]);

  const toggleNamespace = useCallback((ns: string) => {
    const newSelected = selectedNamespaces.includes(ns)
      ? selectedNamespaces.filter(item => item !== ns)
      : [...selectedNamespaces, ns];
    onPanelStateChange({ selectedNamespaces: newSelected });
  }, [selectedNamespaces, onPanelStateChange]);

  const clearNamespaces = useCallback(() => {
    onPanelStateChange({ selectedNamespaces: [] });
  }, [onPanelStateChange]);

  if (!isOpen || !selectedResourceType) return null;

  const resourceDef = getResourceDefinition(selectedResourceType);
  const title = resourceDef?.pluralName || selectedResourceType;
  const columns = resourceDef?.columns || [];
  const gridTemplate = columns.map(col => `${col.flex}fr`).join(' ');
  const isAllNamespaces = selectedNamespaces.length === 0;
  const selectedLabel = isAllNamespaces ? 'All' : selectedNamespaces.join(', ');

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
        <span style={styles.selectedNsLabel}>{selectedLabel}</span>
        <div style={styles.headerActions}>
          <input
            type="text"
            placeholder={`Search ${title.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => onPanelStateChange({ searchQuery: e.target.value })}
            style={styles.searchInput}
          />
          <button
            style={styles.refreshButton}
            onClick={() => {
              if (selectedResourceType) {
                refreshType(selectedResourceType);
              }
            }}
            title="Refresh resources"
          >
            ↻
          </button>
          <button style={styles.closeButton} onClick={onClose} title="Close panel">
            ×
          </button>
        </div>
      </div>

      {/* Namespace filter */}
      <div style={styles.filterBar}>
        <div style={styles.filterLabel}>Namespaces</div>
        <div style={styles.checkboxRow}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isAllNamespaces}
              onChange={clearNamespaces}
            />
            All
          </label>
          {namespaces.map(ns => (
            <label key={ns} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedNamespaces.includes(ns)}
                onChange={() => toggleNamespace(ns)}
              />
              {ns}
            </label>
          ))}
        </div>
      </div>

      {/* Resource list */}
      <div style={styles.list}>
        {isLoading ? (
          <LoadingProgress loadingStates={loadingStates} />
        ) : sortedResources.length === 0 ? (
          <div style={styles.empty}>
            {searchQuery ? 'No matching resources' : 'No resources found'}
          </div>
        ) : (
          <>
            <div style={{ ...styles.tableHeader, gridTemplateColumns: gridTemplate }}>
              {columns.map(col => (
                <span
                  key={col.key}
                  style={{
                    ...styles.colHeader,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => handleColumnClick(col.key)}
                >
                  {col.label}
                  {sortColumn === col.key && (
                    <span style={styles.sortIndicator}>
                      {sortDirection === 'asc' ? ' ▲' : ' ▼'}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {sortedResources.map(resource => {
              const rowKey = `${resource.namespace}/${resource.name}`;
              const isHovered = hoveredRow === rowKey;

              return (
                <div
                  key={rowKey}
                  style={{
                    ...styles.row,
                    gridTemplateColumns: gridTemplate,
                    backgroundColor: isHovered ? '#2a2d2e' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredRow(rowKey)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onShowContextMenu(
                      e.clientX,
                      e.clientY,
                      selectedResourceType,
                      resource.name,
                      resource.namespace
                    );
                  }}
                >
                  {columns.map(col => {
                    const rawValue = resource.columns[col.key];
                    const displayValue = col.transform ? col.transform(rawValue) : (rawValue ?? '-');
                    return (
                      <span key={col.key} style={styles.cell}>
                        {String(displayValue)}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </>
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
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
  },
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    backgroundColor: 'transparent',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    fontSize: '14px',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: '4px',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid #3e3e42',
    backgroundColor: '#2d2d30',
  },
  filterLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#cccccc',
    textTransform: 'uppercase',
  },
  checkboxRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#cccccc',
  },
  selectedNsLabel: {
    fontSize: '11px',
    color: '#858585',
  },
  tableHeader: {
    display: 'grid',
    padding: '6px 12px',
    color: '#858585',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #3e3e42',
    position: 'sticky',
    top: 0,
    backgroundColor: '#252526',
    zIndex: 1,
  },
  colHeader: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sortIndicator: {
    fontSize: '8px',
    marginLeft: '2px',
    color: '#0078d4',
  },
  row: {
    display: 'grid',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
  },
  cell: {
    fontSize: '12px',
    color: '#cccccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
