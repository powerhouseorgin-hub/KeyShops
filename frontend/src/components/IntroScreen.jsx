import { useEffect, useRef } from 'react';
import introVideo from '../assets/intro.mp4';

// One-time animated splash shown before the login/dashboard on every app
// launch (see App() in App.jsx - gated by a plain useState so it only
// appears once per session, not on internal navigation). intro.mp4 has a
// transparent background (alpha channel), so it's composited directly over
// the app's own brand gradient here rather than carrying its own background.
export default function IntroScreen({ onFinish }) {
  const videoRef = useRef(null);

  useEffect(() => {
    // Safety net: if the video fails to load/play for any reason (slow
    // storage, autoplay blocked, codec unsupported on some older WebViews),
    // don't leave the user stuck looking at a blank screen - move on after
    // a fixed timeout regardless of whether onEnded ever fires.
    const fallbackTimer = setTimeout(onFinish, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [onFinish]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, var(--maroon-dark), var(--maroon))',
      }}
    >
      <video
        ref={videoRef}
        src={introVideo}
        autoPlay
        muted
        playsInline
        onEnded={onFinish}
        onError={onFinish}
        style={{ width: '60%', maxWidth: 340, height: 'auto' }}
      />
    </div>
  );
}
