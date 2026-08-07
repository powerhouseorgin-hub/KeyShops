import introVideo from '../assets/keyintro.mp4';

// keyintro.mp4's actual 1920x1080 frame has the real maroon "Key Shops" card
// inset within solid black bars - pillarboxed on both sides plus a thin bar
// along the very bottom edge, all baked into the footage itself (confirmed
// by sampling pixels directly: black at the literal edges, but a full
// black-free rectangle from x=300 to x=1530 and y=0 to y=1060 out of the
// 1920x1080 frame). Rendering the raw frame at its native aspect ratio (as a
// plain <video> would) shows those bars as-is - against a matching page
// background they merge into one big void around a small floating logo
// instead of a full, branded card. Cropping to that measured content
// rectangle via object-fit:cover removes the bars entirely instead of
// trying to color-match bars that were never meant to be seen.
const CONTENT_ASPECT_RATIO = '1230 / 1060';

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
        background: 'linear-gradient(160deg, var(--maroon-dark), var(--maroon))',
      }}
    >
      <div
        style={{
          position: 'relative', width: 'min(85vw, 420px)', aspectRatio: CONTENT_ASPECT_RATIO,
          overflow: 'hidden', borderRadius: 14,
        }}
      >
        {/* Sized/positioned as exact percentages of the 1920x1080 source
            frame so the crop lands on the measured x:[300,1530] y:[0,1060]
            content rectangle precisely - object-fit:cover's automatic
            centering would crop a few pixels off-target here since that
            rectangle isn't perfectly centered in the raw frame. */}
        <video
          src={introVideo}
          autoPlay
          muted
          playsInline
          onEnded={onFinish}
          onError={onFinish}
          style={{ position: 'absolute', width: '156.0976%', height: '101.8868%', left: '-24.3902%', top: '0%' }}
        />
      </div>
    </div>
  );
}
