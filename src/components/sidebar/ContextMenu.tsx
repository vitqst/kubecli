import React, { useEffect } from 'react';
import { ResourceType, getContextMenuActions, getFavoriteActions } from '../../resources';

interface ContextMenuProps {
  x: number;
  y: number;
  resourceType: ResourceType;
  resourceName: string;
  namespace: string;
  customNamespace?: string;
  onAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  resourceType,
  resourceName,
  namespace,
  customNamespace,
  onAction,
  onClose,
}: ContextMenuProps) {
  // Close on click outside
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const favorites = getFavoriteActions(resourceType, {
    resourceName,
    namespace: customNamespace || namespace,
    resourceType,
  });

  const actions = getContextMenuActions(resourceType, {
    resourceName,
    namespace: customNamespace || namespace,
    resourceType,
  });

  const margin = 8;
  const estimatedHeight = 320; // approximate to keep menu onscreen
  const menuWidth = 240;
  const clampedLeft = Math.max(margin, Math.min(x + 4, window.innerWidth - menuWidth - margin));
  const clampedTop = Math.max(margin, Math.min(y + 4, window.innerHeight - estimatedHeight - margin));

  return (
    <div
      style={{
        ...styles.contextMenu,
        left: `${clampedLeft}px`,
        top: `${clampedTop}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={styles.contextMenuHeader}>
        <div style={styles.contextMenuTitle}>{resourceName}</div>
        <div style={styles.contextMenuSubtitle}>
          {resourceType} · {customNamespace || namespace}
        </div>
      </div>

      <div style={styles.contextMenuSectionTitle}>Quick actions</div>
      {favorites.length === 0 && (
        <div style={styles.contextMenuEmpty}>No quick actions</div>
      )}
      {favorites.map((action) => (
        <div
          key={`fav-${action.id}`}
          style={styles.contextMenuItem}
          onClick={() => {
            onAction(action.id, resourceType, resourceName, customNamespace);
            onClose();
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

      <div style={styles.contextMenuDivider} />
      <div style={styles.contextMenuSectionTitle}>More actions</div>
      {actions.length === 0 && (
        <div style={styles.contextMenuEmpty}>No additional actions</div>
      )}
      {actions.map((action) => (
        <div
          key={action.id}
          style={styles.contextMenuItem}
          onClick={() => {
            onAction(action.id, resourceType, resourceName, customNamespace);
            onClose();
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  contextMenu: {
    position: 'fixed',
    backgroundColor: '#2d2d30',
    border: '1px solid #454545',
    borderRadius: '4px',
    padding: '2px 0',
    zIndex: 10000,
    minWidth: '200px',
    maxWidth: '320px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  contextMenuHeader: {
    padding: '8px 12px 6px 12px',
  },
  contextMenuTitle: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  contextMenuSubtitle: {
    color: '#9ba3b0',
    fontSize: '11px',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  contextMenuSectionTitle: {
    padding: '4px 12px 2px 12px',
    color: '#9ba3b0',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.35px',
  },
  contextMenuDivider: {
    height: '1px',
    backgroundColor: '#3e3e42',
    margin: '6px 0 4px 0',
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    color: '#cccccc',
    fontSize: '12px',
    transition: 'background-color 0.1s',
  },
  contextMenuIcon: {
    marginRight: '8px',
    fontSize: '14px',
  },
  contextMenuLabel: {
    flex: 1,
  },
  contextMenuEmpty: {
    padding: '6px 12px',
    color: '#7f858f',
    fontSize: '11px',
    fontStyle: 'italic',
  },
};
