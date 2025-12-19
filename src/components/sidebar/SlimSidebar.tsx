// src/components/sidebar/SlimSidebar.tsx
import React from 'react';
import { ResourceType, getAllResources } from '../../resources';
import { Select } from '../common/Select';

/**
 * Props for the SlimSidebar component
 */
interface SlimSidebarProps {
  /** Currently selected Kubernetes context */
  selectedContext: string;
  /** List of available contexts */
  contexts: Array<{ name: string; cluster?: string }>;
  /** Currently selected resource type */
  selectedResourceType: ResourceType | null;
  /** Callback when context is changed */
  onContextChange: (context: string) => void;
  /** Callback when a resource type is clicked */
  onResourceTypeClick: (type: ResourceType) => void;
}

const RESOURCE_ICONS: Record<ResourceType, string> = {
  pod: '📦',
  deployment: '🚀',
  service: '🌐',
  job: '⚡',
  cronjob: '⏰',
  statefulset: '📊',
  daemonset: '👹',
  configmap: '📝',
  secret: '🔐',
  ingress: '🚪',
};

/**
 * Compact sidebar component for context selection and resource type navigation.
 * Replaces the full sidebar when using tabbed terminal interface.
 */
export function SlimSidebar({
  selectedContext,
  contexts,
  selectedResourceType,
  onContextChange,
  onResourceTypeClick,
}: SlimSidebarProps) {
  const resources = getAllResources();

  return (
    <div style={styles.sidebar}>
      {/* Context Selector */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Context</div>
        <Select
          value={selectedContext}
          onChange={onContextChange}
          options={contexts.map(ctx => ({
            value: ctx.name,
            label: ctx.name,
          }))}
        />
      </div>

      {/* Resource Types */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Resources</div>
        <div style={styles.resourceList}>
          {resources.map(resource => (
            <button
              key={resource.type}
              style={{
                ...styles.resourceButton,
                ...(selectedResourceType === resource.type ? styles.activeResource : {}),
              }}
              onClick={() => onResourceTypeClick(resource.type)}
            >
              <span style={styles.resourceIcon}>
                {RESOURCE_ICONS[resource.type] || '📄'}
              </span>
              <span style={styles.resourceLabel}>{resource.pluralName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '160px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '12px',
    gap: '16px',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#858585',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  resourceButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#cccccc',
    fontSize: '12px',
    textAlign: 'left',
    transition: 'background-color 0.15s',
  },
  activeResource: {
    backgroundColor: '#094771',
  },
  resourceIcon: {
    fontSize: '14px',
  },
  resourceLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
