import { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import ImageZoomViewer from './ImageZoomViewer';

const AUTO_ADVANCE_MS = 3500;
const SWIPE_THRESHOLD_PX = 40;

// A single slide's <img>, tracking its own loaded state so a not-yet-loaded
// photo shows a spinner instead of a blank/white flash - a bare <img> with
// no loading feedback meant swiping to (or auto-advancing onto) a slide
// whose image hadn't finished downloading yet showed nothing but the
// slide's plain background (--card-2, which is pure white in the default
// theme) until it arrived. Resets on `src` change in case this instance
// ever gets reused for a different image instead of remounting.
function CarouselImage({ src, alt, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setLoaded(false);
    // A cache-hit image may already be `.complete` by the time this effect
    // runs (its `load` event fired before React ever attached a listener) -
    // without this check the spinner would spin forever for any image the
    // browser already had cached.
    if (imgRef.current && imgRef.current.complete) setLoaded(true);
  }, [src]);

  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        decoding="async"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {!loaded && (
        <div className="img-carousel-spinner" aria-hidden="true">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
      )}
    </>
  );
}

// Horizontal photo strip for a Product/Shop Details page - auto-advances on
// an infinite loop in both directions (a clone of the last slide prepended,
// a clone of the first slide appended, with a transitionend-triggered
// instant snap back onto the matching real slide at either end - see
// handleTransitionEnd) while still fully swipeable, with a dot row AND a
// "1/N" counter (either one alone satisfies "a clear indicator", showing
// both costs nothing extra). Tap any slide to open the full-screen
// ImageZoomViewer - a swipe past SWIPE_THRESHOLD_PX suppresses the
// following click so a swipe never also opens the viewer. Falls back to a
// single plain image (no carousel chrome, nothing to loop) when there's
// only one photo, still the common case for older listings.
//
// Shared verbatim between the Shop Admin/Super Admin Product Details page
// (App.jsx's ProductDetailsView) and the Pre-Login product details screen
// (PublicMobileApp.jsx's PublicMachineDetailsScreen) - fixing it here fixes
// both surfaces at once.
export default function ImageCarousel({ images, t, className = '' }) {
  const list = (images || []).filter(Boolean);
  // pos 0 is the leading clone (the last real slide), pos 1..list.length are
  // the real slides, pos list.length+1 is the trailing clone (the first
  // real slide). A single trailing-clone-only setup can loop forward
  // seamlessly but has no way to loop backward from the first slide without
  // visibly animating through every other slide to reach the last one -
  // cloning both ends fixes that symmetrically.
  const [pos, setPos] = useState(1);
  const [noTransition, setNoTransition] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const touchStartX = useRef(null);
  const suppressClickRef = useRef(false);
  // Auto-advance pauses for the duration of an active manual touch so the
  // interval can never fire mid-swipe and stack its own position change on
  // top of the user's - letting both compete could land `pos` somewhere
  // unexpected, including skipping past a clone boundary without
  // handleTransitionEnd ever seeing it (which would leave the strip parked
  // on a clone permanently instead of snapping back).
  const touchActiveRef = useRef(false);

  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => {
      if (touchActiveRef.current) return;
      setPos((p) => p + 1);
    }, AUTO_ADVANCE_MS);
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
          <CarouselImage src={list[0]} alt="" onClick={() => setViewerIndex(0)} />
        </div>
        {viewerIndex !== null && (
          <ImageZoomViewer images={list} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} t={t} />
        )}
      </>
    );
  }

  const slides = [list[list.length - 1], ...list, list[0]];
  const activeIndex = (((pos - 1) % list.length) + list.length) % list.length;

  const handleTransitionEnd = () => {
    if (pos === slides.length - 1) {
      setNoTransition(true);
      setPos(1);
    } else if (pos === 0) {
      setNoTransition(true);
      setPos(list.length);
    }
  };

  const goTo = (delta) => setPos((p) => p + delta);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchActiveRef.current = true;
  };
  const handleTouchEnd = (e) => {
    touchActiveRef.current = false;
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
          {slides.map((src, i) => {
            // i=0 is the leading clone, i=slides.length-1 is the trailing
            // clone, everything in between maps straight through via i-1.
            const realIndex = (((i - 1) % list.length) + list.length) % list.length;
            return (
              <div className="img-carousel-slide" key={`${src}-${i}`}>
                <CarouselImage src={src} alt="" onClick={() => handleSlideClick(realIndex)} />
              </div>
            );
          })}
        </div>
        <div className="img-carousel-counter">{activeIndex + 1} / {list.length}</div>
        <div className="img-carousel-dots">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`img-carousel-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => setPos(i + 1)}
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
