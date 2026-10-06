import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Headset, Languages, LogOut, Menu, X } from 'lucide-react';
import DashCardGrid from './DashCardGrid';
import { useBackHandler } from '../utils/backHandler';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import vehicleSalesIcon from '../assets/dashboard-icons/vehicle-sales.png';

// The first screen after a Super Admin or Shop Admin logs in: two cards, one per module. Each module is its own world - Key Shops (the
// existing dashboard and menu, without any Vehicle Sale item) and Vehicle Sale (a dashboard and menu with Vehicle Sale and All Sales, plus
// the account/help entries). Role-based permissions are unchanged inside each module.
//
// Like the rest of the app this screen also has a hamburger menu (shop settings, feedback, terms, privacy, customer care - `entries`,
// built by the app for the role) and a bottom bar with Language and Customer Service.
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function MenuDrawer({ t, user, entries, onPick, onLogout, onClose }) {
  useBackHandler(true, onClose);
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(5,4,3,0.7)' }} />
      <aside className="sidebar flex flex-col" style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 8001, width: 'min(82%, 320px)', background: 'var(--card)', overflowY: 'auto' }}>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" />
          <button className="icon-btn" onClick={onClose} aria-label={t('btnClose') || 'Close'}><X /></button>
        </div>
        <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
          {entries.map((e) => (
            <button key={e.id} onClick={() => onPick(e)} className="side-link">
              <span className="nav-ico" style={{ background: e.colour }}><e.Icon /></span>
              <span>{e.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <span className="avatar">{(user?.name || 'U').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>{user?.name}</div>
              {user?.email && <div className="truncate" style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.email}</div>}
            </div>
          </div>
          <button onClick={onLogout} className="side-link" style={{ color: 'var(--red)' }}>
            <LogOut />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}

export default function ModuleSelectView({ t, user, entries, onChoose, onPickEntry, onLanguage, onCustomerService, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-[calc(100vh-40px)] flex flex-col" style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '16px 16px 96px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 22, gap: 10 }}>
        <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Menu" style={{ flexShrink: 0 }}><Menu /></button>
        <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" style={{ marginRight: 'auto' }} />
        <button type="button" onClick={onLogout} className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)' }}>
          <LogOut className="h-4 w-4" /> {t('logout')}
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 4 }}>{greeting()}, {(user?.name || 'Admin').split(' ')[0]} 👋</h1>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '10px 0 2px' }}>{t('moduleSelectTitle')}</h2>
        <p className="desc" style={{ margin: 0 }}>{t('moduleSelectSubtitle')}</p>
      </div>

      <DashCardGrid items={[
        { title: t('moduleKeyShops'), description: t('moduleKeyShopsDesc'), image: keyShopLogo, accent: 'var(--maroon)', onClick: () => onChoose('keyshops') },
        { title: t('moduleVehicle'), description: t('moduleVehicleDesc'), image: vehicleSalesIcon, imgScale: 0.9, accent: 'var(--blue)', onClick: () => onChoose('vehicle') },
      ]} />

      {menuOpen && (
        <MenuDrawer t={t} user={user} entries={entries} onClose={() => setMenuOpen(false)} onLogout={onLogout}
          onPick={(e) => { setMenuOpen(false); onPickEntry(e); }} />
      )}

      {/* bottom bar: Language and Customer Service, as in the rest of the app */}
      <nav className="mobile-bottom-nav" style={{ display: 'flex' }}>
        <button className="mbn-item" onClick={onLanguage}>
          <span className="nav-ico-sm" style={{ background: 'var(--teal)' }}><Languages /></span>
          <span>{t('language')}</span>
        </button>
        <button className="mbn-item" onClick={onCustomerService}>
          <span className="nav-ico-sm" style={{ background: 'var(--rose)' }}><Headset /></span>
          <span>{t('customerService')}</span>
        </button>
      </nav>
    </div>
  );
}
