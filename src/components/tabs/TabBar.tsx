// src/components/tabs/TabBar.tsx
import React from 'react';
import { Tab } from '../../hooks/useTabs';

/**
 * Props for the TabBar component
 */
interface TabBarProps {
  /** List of tabs to display */
  tabs: Tab[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** Callback when a tab is clicked */
  onTabClick: (id: string) => void;
  /** Callback when a tab close button is clicked */
  onTabClose: (id: string) => void;
  /** Callback when the add tab button is clicked */
  onAddTab: () => void;
}

/**
 * TabBar component for displaying and managing terminal tabs.
 * Shows active state, close buttons (except default tab), and an add button.
 */
export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onAddTab,
}: TabBarProps) {
  return (
    <div style={styles.tabBar}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            ...styles.tab,
            ...(tab.id === activeTabId ? styles.activeTab : {}),
          }}
          onClick={() => onTabClick(tab.id)}
        >
          <span style={styles.tabLabel}>{tab.label}</span>
          {tab.id !== 'default' && (
            <button
              style={styles.closeButton}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              title="Close tab"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        style={styles.addButton}
        onClick={onAddTab}
        title="New terminal tab"
      >
        +
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#252526',
    borderBottom: '1px solid #3e3e42',
    padding: '0 8px',
    height: '36px',
    gap: '2px',
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#2d2d2d',
    border: '1px solid transparent',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    color: '#858585',
    fontSize: '12px',
    maxWidth: '150px',
    transition: 'background-color 0.15s',
  },
  activeTab: {
    backgroundColor: '#1e1e1e',
    color: '#cccccc',
    borderColor: '#3e3e42',
  },
  tabLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '2px',
    color: '#858585',
    fontSize: '14px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#858585',
    fontSize: '18px',
    cursor: 'pointer',
    marginLeft: '4px',
  },
};
