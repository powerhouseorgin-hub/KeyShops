import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Eraser, PenLine, Save, X } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

// A signature field. On the form it is a small box showing the saved signature (or "Tap to sign"); tapping it opens a LARGE popup pad
// to draw on with a finger, a stylus or the mouse, with two buttons under the pad:
//   Clear - wipes the drawing so the person can sign again,
//   Save  - fixes the signature (a PNG cropped to the ink, so it fills its slot on the receipt), closes the popup and shows it in the field.
// Tapping the field again reopens a fresh pad to replace the signature; closing the popup (X / Back) leaves the saved one untouched.
// `value` is null, or { blob, preview } once saved; the parent owns it. The ink is drawn on a canvas that follows the device pixel ratio.
const INK = '#1b1b1b';
const LINE_WIDTH = 3;
const EXPORT_MAX_WIDTH = 560;
const EXPORT_PAD = 10;

function SignatureDialog({ label, T, onSave, onClose }) {
  useBackHandler(true, onClose);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const bounds = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  // size the canvas to its box (the popup is already laid out when this runs); keep the page behind from scrolling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const grow = (p) => {
    const b = bounds.current;
    bounds.current = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  };

  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    grow(p);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(p.x, p.y, LINE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    setHasInk(true);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    grow(p);
  };

  const up = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    bounds.current = null;
    setHasInk(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    const b = bounds.current;
    if (!canvas || !b) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    // crop to the ink (plus a little margin) so the signature fills its slot on the receipt
    const sx = Math.max(0, Math.floor((b.minX - EXPORT_PAD) * ratio));
    const sy = Math.max(0, Math.floor((b.minY - EXPORT_PAD) * ratio));
    const sw = Math.min(canvas.width - sx, Math.ceil((b.maxX - b.minX + EXPORT_PAD * 2) * ratio));
    const sh = Math.min(canvas.height - sy, Math.ceil((b.maxY - b.minY + EXPORT_PAD * 2) * ratio));
    const scale = Math.min(1, EXPORT_MAX_WIDTH / sw);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    out.toBlob((blob) => {
      if (blob) onSave({ blob, preview: URL.createObjectURL(blob) });
    }, 'image/png');
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label}
      style={{ position: 'fixed', inset: 0, zIndex: 65000, background: 'rgba(5,4,3,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="card animate-fade-in" style={{ width: 'min(96vw, 720px)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15 }}><PenLine size={18} /> {label}</div>
          <button type="button" onClick={onClose} aria-label={T.closeLabel} title={T.closeLabel} className="icon-btn"><X className="h-4 w-4" /></button>
        </div>

        <div style={{ position: 'relative', height: 'min(56vh, 380px)', border: '1.5px dashed var(--border-2)', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            aria-label={label}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          />
          {!hasInk && (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--text-3)', fontSize: 14, fontWeight: 700, textAlign: 'center', padding: 12 }}>
              {T.signHere}
            </span>
          )}
          {/* a signing line to write along */}
          <div aria-hidden="true" style={{ position: 'absolute', left: 18, right: 18, bottom: 44, borderBottom: '1px solid #cfc6b5', pointerEvents: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={clear} disabled={!hasInk} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Eraser size={16} /> {T.clearSig}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!hasInk} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Save size={16} /> {T.saveSig}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function SignaturePad({ label, value, onChange, T, disabled = false }) {
  const [open, setOpen] = useState(false);

  const handleSave = (next) => {
    if (value?.preview) URL.revokeObjectURL(value.preview); // the signature it replaces
    onChange(next);
    setOpen(false);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
        <PenLine size={14} /> {label}
        {value && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)', fontSize: 11.5 }}><CheckCircle2 size={13} /> {T.sigSaved}</span>}
      </div>

      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(true); }}
        disabled={disabled}
        aria-label={`${label}: ${value ? T.signTapToChange : T.signTapToSign}`}
        style={{
          width: '100%', height: 130, padding: 8, borderRadius: 12, background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
          border: value ? '1.5px solid var(--green)' : '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {value ? (
          <img src={value.preview} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12.5, fontWeight: 700 }}>
            <PenLine size={22} /> {T.signTapToSign}
          </span>
        )}
      </button>
      {value && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)' }}>{T.signTapToChange}</div>}

      {open && <SignatureDialog label={label} T={T} onSave={handleSave} onClose={() => setOpen(false)} />}
    </div>
  );
}
