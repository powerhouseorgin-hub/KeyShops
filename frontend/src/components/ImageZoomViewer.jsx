import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBackHandler } from '../utils/backHandler';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SWIPE_THRESHOLD_PX = 60;
const DOUBLE_TAP_MS = 300;

function distanceBetween(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

// Full-screen Amazon-style image viewer, portaled to document.body so it
// always covers the true viewport regardless of any ancestor's CSS
// containing-block quirks (see the FAB overlap fix earlier in this app's
// history for why that matters for any `position: fixed` overlay).
// Plain touch/mouse event math, no gesture library - swipe between images,
// pinch-to-zoom (two-finger distance), double-tap-to-zoom, and drag-to-pan
// once zoomed in. Reused by both the authenticated app (App.jsx) and the
// pre-login PublicMobileApp.jsx product/machine detail screens.
export default function ImageZoomViewer({ images, initialIndex = 0, onClose, t = (k, d) => d || k }) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), images.length - 1));
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState(0); // live swipe-drag preview, px
  const [animate, setAnimate] = useState(true);

  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const gesture = useRef({
    mode: null, // 'swipe' | 'pan' | 'pinch'
    startX: 0, startY: 0,
    startTranslate: { x: 0, y: 0 },
    pinchStartDist: 0,
    pinchStartScale: 1,
    lastTapAt: 0,
  });

  useBackHandler(true, onClose);

  const clampTranslate = useCallback((next, currentScale) => {
    const el = imgRef.current;
    if (!el) return next;
    const rect = el.getBoundingClientRect();
    // Bound so the (scaled) image can never be dragged entirely off-screen -
    // half the overflow in each direction, zero once back at 1x.
    const overflowX = Math.max(0, (rect.width * currentScale - rect.width) / 2 / currentScale);
    const overflowY = Math.max(0, (rect.height * currentScale - rect.height) / 2 / currentScale);
    return {
      x: Math.min(overflowX, Math.max(-overflowX, next.x)),
      y: Math.min(overflowY, Math.max(-overflowY, next.y)),
    };
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((nextIndex) => {
    const clamped = Math.min(Math.max(nextIndex, 0), images.length - 1);
    setAnimate(true);
    setIndex(clamped);
    setDragOffset(0);
    resetZoom();
  }, [images.length, resetZoom]);

  const toggleDoubleTapZoom = useCallback((clientX, clientY) => {
    if (scale > 1) {
      resetZoom();
      return;
    }
    const el = imgRef.current;
    if (!el) { setScale(2); return; }
    const rect = el.getBoundingClientRect();
    // Zoom in centered roughly toward the tapped point (offset from image center).
    const offsetX = (rect.left + rect.width / 2 - clientX) / 2;
    const offsetY = (rect.top + rect.height / 2 - clientY) / 2;
    setScale(2);
    setTranslate(clampTranslate({ x: offsetX, y: offsetY }, 2));
  }, [scale, resetZoom, clampTranslate]);

  // --- Touch handlers ---
  const handleTouchStart = (e) => {
    const touches = e.touches;
    if (touches.length === 2) {
      gesture.current.mode = 'pinch';
      gesture.current.pinchStartDist = distanceBetween(touches[0], touches[1]);
      gesture.current.pinchStartScale = scale;
      return;
    }
    const now = Date.now();
    const touch = touches[0];
    if (now - gesture.current.lastTapAt < DOUBLE_TAP_MS) {
      gesture.current.lastTapAt = 0;
      toggleDoubleTapZoom(touch.clientX, touch.clientY);
      gesture.current.mode = null;
      return;
    }
    gesture.current.lastTapAt = now;
    gesture.current.mode = scale > 1 ? 'pan' : 'swipe';
    gesture.current.startX = touch.clientX;
    gesture.current.startY = touch.clientY;
    gesture.current.startTranslate = translate;
    setAnimate(false);
  };

  const handleTouchMove = (e) => {
    const touches = e.touches;
    if (gesture.current.mode === 'pinch' && touches.length === 2) {
      const dist = distanceBetween(touches[0], touches[1]);
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.current.pinchStartScale * (dist / gesture.current.pinchStartDist)));
      setScale(nextScale);
      if (nextScale === MIN_SCALE) setTranslate({ x: 0, y: 0 });
      return;
    }
    const touch = touches[0];
    if (!touch) return;
    if (gesture.current.mode === 'pan') {
      const dx = (touch.clientX - gesture.current.startX) / scale;
      const dy = (touch.clientY - gesture.current.startY) / scale;
      setTranslate(clampTranslate({ x: gesture.current.startTranslate.x + dx, y: gesture.current.startTranslate.y + dy }, scale));
    } else if (gesture.current.mode === 'swipe') {
      setDragOffset(touch.clientX - gesture.current.startX);
    }
  };

  const handleTouchEnd = () => {
    if (gesture.current.mode === 'swipe') {
      setAnimate(true);
      if (dragOffset < -SWIPE_THRESHOLD_PX && index < images.length - 1) {
        goTo(index + 1);
      } else if (dragOffset > SWIPE_THRESHOLD_PX && index > 0) {
        goTo(index - 1);
      } else {
        setDragOffset(0);
      }
    }
    if (gesture.current.mode === 'pinch' && scale <= MIN_SCALE + 0.01) {
      resetZoom();
    }
    gesture.current.mode = null;
  };

  // --- Mouse handlers (desktop) ---
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    gesture.current.mode = 'pan';
    gesture.current.startX = e.clientX;
    gesture.current.startY = e.clientY;
    gesture.current.startTranslate = translate;
    setAnimate(false);
  };
  const handleMouseMove = (e) => {
    if (gesture.current.mode !== 'pan') return;
    const dx = (e.clientX - gesture.current.startX) / scale;
    const dy = (e.clientY - gesture.current.startY) / scale;
    setTranslate(clampTranslate({ x: gesture.current.startTranslate.x + dx, y: gesture.current.startTranslate.y + dy }, scale));
  };
  const handleMouseUp = () => { gesture.current.mode = null; };

  const handleWheel = (e) => {
    e.preventDefault();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - e.deltaY * 0.002));
    setScale(next);
    if (next === MIN_SCALE) setTranslate({ x: 0, y: 0 });
    else setTranslate((prev) => clampTranslate(prev, next));
  };

  const handleDoubleClick = (e) => toggleDoubleTapZoom(e.clientX, e.clientY);

  const handleBackdropClick = () => {
    if (scale <= 1 && Math.abs(dragOffset) < 5) onClose?.();
  };

  return createPortal(
    <div
      ref={containerRef}
      className="img-zoom-viewer"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <button type="button" className="img-zoom-close" onClick={(e) => { e.stopPropagation(); onClose?.(); }} aria-label={t('btnClose', 'Close')}>
        <X />
      </button>

      {images.length > 1 && (
        <div className="img-zoom-counter">{index + 1} / {images.length}</div>
      )}

      {images.length > 1 && index > 0 && scale <= 1 && (
        <button type="button" className="img-zoom-nav img-zoom-nav-prev" onClick={(e) => { e.stopPropagation(); goTo(index - 1); }} aria-label={t('previousLabel', 'Previous')}>
          <ChevronLeft />
        </button>
      )}
      {images.length > 1 && index < images.length - 1 && scale <= 1 && (
        <button type="button" className="img-zoom-nav img-zoom-nav-next" onClick={(e) => { e.stopPropagation(); goTo(index + 1); }} aria-label={t('nextLabel', 'Next')}>
          <ChevronRight />
        </button>
      )}

      <div className="img-zoom-track" style={{ transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))`, transition: animate ? 'transform .25s ease' : 'none' }}>
        {images.map((src, i) => (
          <div className="img-zoom-slide" key={src + i} onClick={(e) => e.stopPropagation()}>
            <img
              ref={i === index ? imgRef : undefined}
              src={src}
              alt=""
              draggable={false}
              onMouseDown={i === index ? handleMouseDown : undefined}
              onDoubleClick={i === index ? handleDoubleClick : undefined}
              style={i === index ? {
                transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
                transition: animate ? 'transform .2s ease' : 'none',
                cursor: scale > 1 ? 'grab' : 'default',
              } : undefined}
            />
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
