import { useState, useRef } from 'react';
import ImageZoomViewer from './ImageZoomViewer';

// Horizontal, user-paged (no auto-advance/loop - see AdCarousel for that
// pattern) photo strip for a Product/Shop Details page, with dot indicators
// and a tap-to-open full-screen ImageZoomViewer. Falls back to a single
// plain image (no carousel chrome) when there's only one photo, which is
// still the common case for older listings that predate multi-photo upload.
export default function ImageCarousel({ images, t, className = '' }) {
  const list = (images || []).filter(Boolean);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(null);
  const trackRef = useRef(null);

  if (list.length === 0) return null;

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const scrollTo = (i) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

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

  return (
    <>
      <div className={`img-carousel ${className}`}>
        <div className="img-carousel-track" ref={trackRef} onScroll={handleScroll}>
          {list.map((src, i) => (
            <div className="img-carousel-slide" key={src + i}>
              <img src={src} alt="" onClick={() => setViewerIndex(i)} />
            </div>
          ))}
        </div>
        <div className="img-carousel-dots">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`img-carousel-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => scrollTo(i)}
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
