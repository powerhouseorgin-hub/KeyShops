import { useState, useRef, useEffect } from 'react';
import ImageZoomViewer from './ImageZoomViewer';

const AUTO_ADVANCE_MS = 3500;
const SWIPE_THRESHOLD_PX = 40;

// Horizontal photo strip for a Product/Shop Details page - auto-advances on
// an infinite loop (same clone-first-slide + transitionend-snap-back trick
// as AdCarousel below) while still fully swipeable, with a dot row AND a
// "1/N" counter (either one alone satisfies "a clear indicator", showing
// both costs nothing extra). Tap any slide to open the full-screen
// ImageZoomViewer - a swipe past SWIPE_THRESHOLD_PX suppresses the
// following click so a swipe never also opens the viewer. Falls back to a
// single plain image (no carousel chrome, nothing to loop) when there's
// only one photo, still the common case for older listings.
export default function ImageCarousel({ images, t, className = '' }) {
  const list = (images || []).filter(Boolean);
  const [pos, setPos] = useState(0);
  const [noTransition, setNoTransition] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const touchStartX = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => setPos((p) => p + 1), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  useEffect(() => {
    if (!noTransition) return;
    const id = requestAnimationFrame(() => setNoTransition(false));
    return () => cancelAnimationFrame(id);
  }, [noTransition]);

  if (list.length === 0) return null;

  if (list.length === 1) {
    return (
      <>
        <div className={`img-carousel img-carousel-single ${className}`}>
          <img src={list[0]} alt="" onClick={() => setViewerIndex(0)} />
        </div>
        {viewerIndex !== null && (
          <ImageZoomViewer images={list} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} t={t} />
        )}
      </>
    );
  }

  const slides = [...list, list[0]];
  const activeIndex = ((pos % list.length) + list.length) % list.length;

  const handleTransitionEnd = () => {
    if (pos === list.length) {
      setNoTransition(true);
      setPos(0);
    }
  };

  const goTo = (delta) => {
    setPos((p) => {
      const next = p + delta;
      return next < 0 ? list.length - 1 : next;
    });
  };

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      suppressClickRef.current = true;
      goTo(dx < 0 ? 1 : -1);
    }
    touchStartX.current = null;
  };

  const handleSlideClick = (i) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setViewerIndex(i);
  };

  return (
    <>
      <div className={`img-carousel ${className}`}>
        <div
          className="img-carousel-track"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTransitionEnd={handleTransitionEnd}
          style={{ transform: `translateX(-${pos * 100}%)`, transition: noTransition ? 'none' : undefined }}
        >
          {slides.map((src, i) => (
            <div className="img-carousel-slide" key={`${src}-${i}`}>
              {/* i mod list.length maps the trailing clone slide back to real image 0 */}
              <img src={src} alt="" onClick={() => handleSlideClick(i % list.length)} />
            </div>
          ))}
        </div>
        <div className="img-carousel-counter">{activeIndex + 1} / {list.length}</div>
        <div className="img-carousel-dots">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`img-carousel-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => setPos(i)}
              aria-label={`${i + 1}`}
            />
          ))}
        </div>
      </div>
      {viewerIndex !== null && (
        <ImageZoomViewer images={list} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} t={t} />
      )}
    </>
  );
}
