import React from 'react';
import { useAuthSession } from '../../contexts/AuthSessionContext';

const statePresentation = {
  checking: { label: 'Checking…', color: '#65b9e8' },
  active: { label: 'Ready', color: '#6fd39b' },
  expiringSoon: { label: 'Renew soon', color: '#e7ad45' },
  expired: { label: 'Sign in required', color: '#f27d72' },
  signedOut: { label: 'Sign in', color: '#f27d72' },
  error: { label: 'Needs attention', color: '#e7ad45' },
} as const;

export function AuthStatusButton() {
  const { status, openSessions } = useAuthSession();
  if (status.state === 'notAzure') return null;
  const presentation = statePresentation[status.state];
  const account = status.account?.username;

  return (
    <button
      type="button"
      onClick={openSessions}
      aria-label={`Azure session ${presentation.label}${account ? ` for ${account}` : ''}`}
      title={account || status.safeMessage || 'Azure session'}
      style={styles.button}
    >
      <span style={{ ...styles.dot, background: presentation.color, boxShadow: `0 0 0 3px ${presentation.color}22` }} />
      <span style={styles.text}>Azure · {presentation.label}</span>
      <span aria-hidden="true" style={styles.chevron}>⌄</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px 10px',
    border: '1px solid #3e3e42', borderRadius: '6px', background: '#1e1e1e', color: '#d4d4d4',
    cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap',
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  text: { overflow: 'hidden', textOverflow: 'ellipsis' },
  chevron: { color: '#858585' },
};
