import { useEffect, useRef } from 'react';
import introVideo from '../assets/intro.mp4';

// intro.mp4 was exported without a real alpha channel (plain H.264/MP4
// doesn't support one) - what should have been transparency is instead a
// literal light/dark-gray checkerboard baked into the video's own pixels
// (rgb ~170,170,170 and ~204,204,204, sampled directly from the file).
// Those two tones are both near-neutral gray and sit in a narrow luminance
// band that the logo's actual colors (saturated gold/maroon, near-black key
// body) never touch, so they can be reliably keyed out per-frame on a
// canvas instead of needing the source video re-exported.
function isCheckerboardPixel(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return (maxC - minC) <= 14 && maxC >= 140 && maxC <= 225;
}

// One-time animated splash shown before the login/dashboard on every app
// launch (see App() in App.jsx - gated by a plain useState so it only
// appears once per session, not on internal navigation).
export default function IntroScreen({ onFinish }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let rafId = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (rafId) cancelAnimationFrame(rafId);
      onFinish();
    };

    // Processed at half the source's native resolution - plenty sharp at
    // the size this renders on-screen, and keeps the per-frame pixel loop
    // cheap enough to run smoothly for the video's ~3s duration even on
    // lower-end devices.
    const renderFrame = () => {
      if (video.videoWidth && canvas.width !== video.videoWidth / 2) {
        canvas.width = video.videoWidth / 2;
        canvas.height = video.videoHeight / 2;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;
      for (let i = 0; i < data.length; i += 4) {
        if (isCheckerboardPixel(data[i], data[i + 1], data[i + 2])) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(frame, 0, 0);
      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    video.addEventListener('playing', () => { rafId = requestAnimationFrame(renderFrame); });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);

    // Safety net: if the video fails to load/play for any reason (slow
    // storage, autoplay blocked, codec unsupported on some older WebViews),
    // don't leave the user stuck looking at a blank screen.
    const fallbackTimer = setTimeout(finish, 4500);

    return () => {
      clearTimeout(fallbackTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [onFinish]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, var(--maroon-dark), var(--maroon))',
      }}
    >
      {/* The real pixel source - kept out of the layout and invisible;
          only the keyed-out canvas below is ever shown to the user. */}
      <video
        ref={videoRef}
        src={introVideo}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} style={{ width: '60%', maxWidth: 340, height: 'auto' }} />
    </div>
  );
}
