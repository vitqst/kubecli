// src/components/tabs/DuplicateTabDialog.tsx
import React from 'react';

interface DuplicateTabDialogProps {
  resourceName: string;
  onSwitch: () => void;
  onOpenNew: () => void;
  onCancel: () => void;
}

export function DuplicateTabDialog({
  resourceName,
  onSwitch,
  onOpenNew,
  onCancel,
}: DuplicateTabDialogProps) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Tab Already Open</h3>
        </div>
        <div style={styles.content}>
          <p style={styles.message}>
            A tab for <strong>{resourceName}</strong> is already open.
          </p>
          <p style={styles.question}>What would you like to do?</p>
        </div>
        <div style={styles.footer}>
          <button style={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.switchButton} onClick={onSwitch}>
            Switch to Tab
          </button>
          <button style={styles.newButton} onClick={onOpenNew}>
            Open New
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },
  dialog: {
    backgroundColor: '#252526',
    border: '1px solid #454545',
    borderRadius: '6px',
    minWidth: '360px',
    maxWidth: '450px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #3e3e42',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#cccccc',
  },
  content: {
    padding: '16px 20px',
  },
  message: {
    margin: '0 0 8px 0',
    color: '#cccccc',
    fontSize: '13px',
  },
  question: {
    margin: 0,
    color: '#858585',
    fontSize: '12px',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #3e3e42',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  cancelButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  switchButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  newButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
