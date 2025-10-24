import React from 'react';
import { ResourceType } from '../../resources';
import { getFavoriteActions, getContextMenuActions } from '../../resources';

interface ResourceListProps<T> {
  title: string;
  icon: string;
  items: T[];
  loading: boolean;
  isCollapsed: boolean;
  isInEditMode: boolean;
  resourceType: ResourceType;
  onToggle: () => void;
  onRefresh: () => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onShowContextMenu: (x: number, y: number, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  renderItem: (item: T) => {
    name: string;
    displayName: string;
    info: React.ReactNode;
    namespace?: string;
  };
}

export function ResourceList<T>({
  title,
  icon,
  items,
  loading,
  isCollapsed,
  isInEditMode,
  resourceType,
  onToggle,
  onRefresh,
  onResourceAction,
  onShowContextMenu,
  renderItem,
}: ResourceListProps<T>) {
  return (
    <div style={styles.section}>
      <div 
        style={styles.sectionHeader}
        onClick={onToggle}
      >
        <span style={styles.sectionIcon}>{icon}</span>
        <span style={styles.sectionTitle}>{title}</span>
        <span style={styles.sectionCount}>({items.length})</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          style={styles.refreshButton}
          title="Refresh"
        >
          ↻
        </button>
        <span style={styles.collapseIcon}>
          {isCollapsed ? '▶' : '▼'}
        </span>
      </div>
      
      {!isCollapsed && (
        loading ? (
          <div style={styles.loading}>Loading {title.toLowerCase()}...</div>
        ) : items.length > 0 ? (
          <div style={styles.itemList}>
            {items.map((item) => {
              const { name, displayName, info, namespace } = renderItem(item);
              
              const favorites = getFavoriteActions(resourceType, {
                resourceName: name,
                namespace: namespace || '',
                resourceType,
              });
              
              const contextActions = getContextMenuActions(resourceType, {
                resourceName: name,
                namespace: namespace || '',
                resourceType,
              });
              
              return (
                <div key={name} style={styles.item}>
                  <div style={styles.itemHeader}>
                    <span style={styles.itemName} title={displayName}>
                      {displayName.length > 25 ? displayName.substring(0, 25) + '...' : displayName}
                    </span>
                  </div>
                  <div style={styles.itemInfo}>{info}</div>
                  <div style={styles.itemActions}>
                    {/* Favorite actions */}
                    {favorites.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => onResourceAction(action.id, resourceType, name, namespace)}
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
                          onShowContextMenu(e.clientX, e.clientY, resourceType, name, namespace);
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
              );
            })}
          </div>
        ) : (
          <div style={styles.noData}>No {title.toLowerCase()} found</div>
        )
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: '12px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#2d2d30',
    borderRadius: '4px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background-color 0.2s',
  },
  sectionIcon: {
    marginRight: '8px',
    fontSize: '14px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#cccccc',
    flex: 1,
  },
  sectionCount: {
    fontSize: '11px',
    color: '#858585',
    marginRight: '8px',
  },
  refreshButton: {
    padding: '2px 6px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: '#858585',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    marginRight: '4px',
  },
  collapseIcon: {
    fontSize: '10px',
    color: '#858585',
  },
  loading: {
    padding: '12px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#858585',
  },
  itemList: {
    padding: '8px',
  },
  item: {
    padding: '8px',
    marginBottom: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  itemHeader: {
    marginBottom: '4px',
  },
  itemName: {
    fontSize: '12px',
    fontWeight: 500,
    display: 'block',
    color: '#cccccc',
  },
  itemInfo: {
    marginBottom: '6px',
  },
  itemActions: {
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
  noData: {
    padding: '12px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#858585',
    fontStyle: 'italic',
  },
};
