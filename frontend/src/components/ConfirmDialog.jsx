import React from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// A small confirm popup: a question with Cancel and a confirming button. Cancel, tapping outside it and the Android Back button all just close it.
function Body({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  useBackHandler(true, onCancel);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title || message}
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(5,4,3,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, padding: 22, textAlign: 'center' }}>
        <div className="icon-badge solid" style={{ margin: '0 auto 12px' }}><LogOut /></div>
        {title && <h3 style={{ marginBottom: 6 }}>{title}</h3>}
        <p style={{ margin: '0 0 18px', fontSize: 14.5, fontWeight: 700, lineHeight: 1.45 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel} style={{ flex: 1 }}>{cancelLabel}</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} style={{ flex: 1 }} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ConfirmDialog({ open, ...props }) {
  return open ? <Body {...props} /> : null;
}
