import React, { useState, useEffect } from 'react';
import { supportConfigCache } from '../utils/supportConfigCache';
import { MessageCircle, Mail } from 'lucide-react';

// Feedback & Suggestions - no dedicated backend endpoint for this, so it
// routes into the same support email/WhatsApp already configured for
// Customer Service rather than a form that would go nowhere.
function FeedbackView({ t, api }) {
  const [config, setConfig] = useState(supportConfigCache.current);

  useEffect(() => {
    api.getSupportConfig().then((res) => { setConfig(res); supportConfigCache.current = res; }).catch(() => {});
  }, []);

  const subject = encodeURIComponent('Key Shops - Feedback & Suggestions');
  const mailHref = config?.email ? `mailto:${config.email}?subject=${subject}` : null;
  const waHref = config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}?text=${subject}` : null;

  return (
    <div className="animate-fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow"><MessageCircle /> {t('feedbackTitle')}</div>
          <h1>{t('feedbackTitle')}</h1>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 520 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.7, marginBottom: 18 }}>
          {t('feedbackBody')}
        </p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {mailHref && (
            <a href={mailHref} className="btn btn-primary btn-sm">
              <Mail className="h-4 w-4" /> {t('sendFeedbackBtn')}
            </a>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default FeedbackView;
