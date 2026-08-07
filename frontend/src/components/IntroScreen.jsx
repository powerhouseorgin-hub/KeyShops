import introVideo from '../assets/keyintro.mp4';

// keyintro.mp4 has a genuine solid black background baked into the footage
// itself (confirmed by sampling frame pixels directly - corners/edges are a
// consistent pure rgb(0,0,0) across the whole clip, unlike the previous
// intro.mp4 which had a light/dark-gray transparency-preview checkerboard
// mistakenly baked in instead of real alpha). Since the color is solid and
// known, this just needs the screen behind it to match - no per-frame
// canvas keying required this time.

// One-time animated splash shown before the login/dashboard on every app
// launch (see App() in App.jsx - gated by a plain useState so it only
// appears once per session, not on internal navigation, and only on the
// native app - the web landing page never shows it).
export default function IntroScreen({ onFinish }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000000',
      }}
    >
      <video
        src={introVideo}
        autoPlay
        muted
        playsInline
        onEnded={onFinish}
        onError={onFinish}
        style={{ width: '80%', maxWidth: 420, height: 'auto' }}
      />
    </div>
  );
}
