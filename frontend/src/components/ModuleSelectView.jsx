import React from 'react';
import { LogOut } from 'lucide-react';
import DashCardGrid from './DashCardGrid';
import keyShopLogo from '../assets/branding/keyshop-logo.png';
import vehicleSalesIcon from '../assets/dashboard-icons/vehicle-sales.png';

// The first screen after a Super Admin or Shop Admin logs in: two cards, one per module. Each module is its own world - Key Shops (the
// existing dashboard and menu, without any Vehicle Sale item) and Vehicle Sale (a dashboard and menu with only Vehicle Sale and All Sales).
// Role-based permissions are unchanged inside each module; the role only decides what the module's own screens show.
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export default function ModuleSelectView({ t, user, onChoose, onLogout }) {
  return (
    <div className="min-h-[calc(100vh-40px)] flex flex-col" style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '20px 16px 32px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
        <img src={keyShopLogo} alt="Key Shop" className="brand-logo-lg" />
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
    </div>
  );
}
