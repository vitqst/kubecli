import React, { useEffect } from 'react';
import { useAuthSession } from '../../contexts/AuthSessionContext';
import { authStyles as styles } from './authStyles';

export function AzureSessionsDialog() {
  const session = useAuthSession();
  const { status } = session;

  useEffect(() => {
    if (!session.isSessionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') session.closeSessions();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session.closeSessions, session.isSessionsOpen]);

  if (!session.isSessionsOpen) return null;
  const expiresAt = status.expiresAtEpochSeconds
    ? new Date(status.expiresAtEpochSeconds * 1000).toLocaleString()
    : 'Azure CLI will renew automatically';

  return (
    <div style={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="azure-sessions-title" style={styles.dialog}>
        <div style={styles.header}>
          <div style={{ ...styles.icon, color: status.state === 'active' ? '#6fd39b' : '#e7ad45' }} aria-hidden="true">
            {status.state === 'active' ? '✓' : '!'}
          </div>
          <div>
            <h2 id="azure-sessions-title" style={styles.title}>Azure sessions</h2>
            <p style={styles.copy}>Accounts used by Azure-backed contexts in this kubeconfig.</p>
          </div>
        </div>

        <div style={styles.contextGrid}>
          <div style={styles.contextItem}><span style={styles.label}>Tenant</span><span style={styles.value}>{status.tenantId || 'Unknown'}</span></div>
          <div style={styles.contextItem}><span style={styles.label}>Next token expiry</span><span style={styles.value}>{expiresAt}</span></div>
        </div>

        <div style={localStyles.list}>
          {status.accounts.length > 0 ? status.accounts.map((account) => (
            <div key={`${account.username}-${account.subscriptionId}`} style={localStyles.account}>
              <div style={localStyles.avatar}>AD</div>
              <div style={localStyles.accountCopy}>
                <strong style={localStyles.username}>{account.username}</strong>
                <span style={localStyles.meta}>{account.subscriptionName} · {account.subscriptionId}</span>
                <span style={localStyles.meta}>Contexts: {status.affectedContexts.join(', ') || status.contextName}</span>
              </div>
              {account.isDefault && <span style={localStyles.badge}>Current</span>}
            </div>
          )) : (
            <div style={localStyles.empty}>{status.safeMessage || 'No Azure CLI account is available for this tenant.'}</div>
          )}
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={session.closeSessions} style={styles.button}>Close</button>
          <div style={styles.actionsRight}>
            <button type="button" onClick={() => void session.checkNow()} style={styles.button}>Check again</button>
            {status.state !== 'active' && (
              <button type="button" onClick={() => { session.closeSessions(); session.openReauth(); }} style={styles.primaryButton}>Reconnect</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const localStyles: Record<string, React.CSSProperties> = {
  list: { display: 'grid', gap: '8px', margin: '0 20px 18px' },
  account: { display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: '10px', alignItems: 'center', padding: '11px', border: '1px solid #383d42', borderRadius: '8px', background: '#1e1e1e' },
  avatar: { width: '32px', height: '32px', display: 'grid', placeItems: 'center', borderRadius: '7px', background: '#163b55', color: '#8fd2f5', fontSize: '10px', fontWeight: 800 },
  accountCopy: { minWidth: 0 },
  username: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px' },
  meta: { display: 'block', marginTop: '2px', color: '#858d94', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis' },
  badge: { padding: '4px 7px', borderRadius: '999px', background: 'rgba(111, 211, 155, .12)', color: '#6fd39b', fontSize: '9px' },
  empty: { padding: '16px', border: '1px dashed #454b51', borderRadius: '8px', color: '#9fa7ad', fontSize: '12px', textAlign: 'center' },
};
