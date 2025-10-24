import React, { useEffect } from 'react';
import { ResourceType, getContextMenuActions } from '../../resources';

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

  const actions = getContextMenuActions(resourceType, {
    resourceName,
    namespace: customNamespace || namespace,
    resourceType,
  });

  return (
    <div
      style={{
        ...styles.contextMenu,
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
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
