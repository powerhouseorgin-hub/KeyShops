import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Languages, X } from 'lucide-react';

// The "Choose language" dialog (a centre-screen modal), shared by the app's bottom bar and the module-selection screen.
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
];

export default function LanguageDialog({ open, lang, onSelect, onClose, t, cardRef }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex justify-center items-center p-4"
      style={{ background: 'rgba(5,4,3,0.72)', zIndex: 9000 }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="card animate-fade-in"
        style={{ width: '100%', maxWidth: 340, padding: 24, position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="icon-btn" style={{ position: 'absolute', top: 16, right: 16 }}>
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center mb-5" style={{ textAlign: 'center' }}>
          <div className="icon-badge solid" style={{ marginBottom: 10 }}><Languages /></div>
          <h2 style={{ fontSize: 17 }}>{t('chooseLanguage')}</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t('selectLanguageDesc')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => onSelect(l.code)} className={`lang-option-btn ${lang === l.code ? 'active' : ''}`}>
              <span>{l.label}</span>
              {lang === l.code && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
