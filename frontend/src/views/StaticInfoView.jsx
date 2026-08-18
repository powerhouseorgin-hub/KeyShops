import React from 'react';

// Generic static-content screen (Terms & Conditions, About Us) - reused by
// both the authenticated Shop Admin drawer and the pre-login public app's
// hamburger drawer (see PublicMobileApp.jsx's PublicStaticInfoScreen, which
// mirrors this same title/body content rather than importing this component
// directly, since it renders inside a different page shell/back-button model).
function StaticInfoView({ icon: Icon, eyebrow, title, body }) {
  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon /> {eyebrow}</div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {body}
        </p>
      </div>
    </div>
  );
}

export default StaticInfoView;
