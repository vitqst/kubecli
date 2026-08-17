import type React from 'react';

export const authStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 12000, display: 'grid', placeItems: 'center',
    padding: '24px', background: 'rgba(9, 11, 12, 0.72)', backdropFilter: 'blur(3px)',
  },
  dialog: {
    width: 'min(540px, 100%)', maxHeight: 'min(680px, calc(100vh - 48px))', overflow: 'auto',
    border: '1px solid #4a5057', borderRadius: '10px', background: '#252526', color: '#e7e7e7',
    boxShadow: '0 28px 70px rgba(0, 0, 0, 0.58)',
  },
  header: { display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '20px 20px 14px' },
  icon: {
    width: '38px', height: '38px', flexShrink: 0, display: 'grid', placeItems: 'center',
    borderRadius: '9px', background: 'rgba(22, 131, 197, 0.15)', color: '#65b9e8', fontWeight: 800,
  },
  title: { margin: 0, color: '#f0f0f0', fontSize: '16px', fontWeight: 700 },
  copy: { margin: '4px 0 0', color: '#9fa7ad', fontSize: '12px', lineHeight: 1.5 },
  contextGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '0 20px 16px' },
  contextItem: { minWidth: 0, padding: '10px', border: '1px solid #383d42', borderRadius: '7px', background: '#1e1e1e' },
  label: { display: 'block', color: '#777f86', fontSize: '9px', letterSpacing: '.08em', textTransform: 'uppercase' },
  value: { display: 'block', marginTop: '3px', color: '#d7d7d7', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' },
  actions: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px', padding: '13px 20px',
    borderTop: '1px solid #383d42', background: '#202021',
  },
  actionsRight: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginLeft: 'auto' },
  button: {
    padding: '8px 12px', border: '1px solid #454b51', borderRadius: '5px', background: '#2d3033',
    color: '#d7d7d7', fontSize: '11px', cursor: 'pointer',
  },
  primaryButton: {
    padding: '8px 12px', border: '1px solid #1683c5', borderRadius: '5px', background: '#1683c5',
    color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
  },
  progress: { margin: '0 20px 17px', color: '#b8c1c7', fontSize: '12px', lineHeight: 1.5 },
  codeBox: {
    margin: '0 20px 16px', padding: '15px', border: '1px solid rgba(78, 201, 176, .3)',
    borderRadius: '8px', background: 'rgba(78, 201, 176, .07)', textAlign: 'center',
  },
  code: { margin: '6px 0 12px', color: '#d9fff6', fontFamily: 'monospace', fontSize: '24px', fontWeight: 750, letterSpacing: '.1em' },
};
