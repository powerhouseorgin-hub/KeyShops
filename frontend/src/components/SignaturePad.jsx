import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, PenLine, RotateCcw, Save } from 'lucide-react';

// A signature pad: draw with a finger, a stylus or the mouse. Three actions:
//   Clear - wipes what is drawn so far,
//   Save  - fixes the signature (a PNG cropped to the ink, so it fills its slot on the receipt) and shows it,
//   Redo  - throws the saved signature away and opens a fresh pad.
// `value` is null while signing, or { blob, preview } once saved; the parent owns it (and releases `preview`) so the saved
// signature survives the pad being re-rendered. The ink is drawn on a canvas that follows the device pixel ratio.
const INK = '#1b1b1b';
const LINE_WIDTH = 2.6;
const EXPORT_MAX_WIDTH = 560;
const EXPORT_PAD = 10;

export default function SignaturePad({ label, value, onChange, T, disabled = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const bounds = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  // Size the canvas to its box and reset it each time a fresh pad is shown.
  useEffect(() => {
    if (value) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    bounds.current = null;
    setHasInk(false);
  }, [value]);

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
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    grow(p);
    // a tap leaves a dot
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
      if (blob) onChange({ blob, preview: URL.createObjectURL(blob) });
    }, 'image/png');
  };

  const redo = () => {
    if (value?.preview) URL.revokeObjectURL(value.preview);
    onChange(null);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
        <PenLine size={14} /> {label}
        {value && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)', fontSize: 11.5 }}><CheckCircle2 size={13} /> {T.sigSaved}</span>}
      </div>

      {value ? (
        <div style={{ border: '1.5px solid var(--green)', borderRadius: 12, background: '#fff', height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <img src={value.preview} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      ) : (
        <div style={{ position: 'relative', border: '1.5px dashed var(--border-2)', borderRadius: 12, background: '#fff', height: 130, opacity: disabled ? 0.6 : 1 }}>
          <canvas
            ref={canvasRef}
            aria-label={label}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          />
          {!hasInk && (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--text-3)', fontSize: 12, fontWeight: 700, textAlign: 'center', padding: 8 }}>
              {T.signHere}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {value ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={redo} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={14} /> {T.redoSig}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={clear} disabled={disabled || !hasInk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Eraser size={14} /> {T.clearSig}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={disabled || !hasInk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Save size={14} /> {T.saveSig}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
