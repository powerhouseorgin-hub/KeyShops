import React from 'react';
import { Receipt } from 'lucide-react';
import DashCardGrid from '../components/DashCardGrid';
import { useAuth } from '../context/AuthContext';
import vehicleSalesIcon from '../assets/dashboard-icons/vehicle-sales.png';

// The Vehicle Sale module's dashboard: exactly two cards - Vehicle Sale (record a sale) and All Sales (review them). Same for the Super
// Admin and the Shop Admin; the role only changes what All Sales lists (a shop's own sales vs every sale).
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export default function VehicleDashboardView({ t, setActiveTab }) {
  const { user } = useAuth();
  return (
    <div className="animate-fade-in">
      <div className="page-head reg-wizard-head">
        <div>
          <h1>{greeting()}, {(user?.name || 'Admin').split(' ')[0]} 👋</h1>
          <p className="desc" style={{ marginTop: 6 }}>{t('moduleVehicle')}</p>
        </div>
      </div>
      <DashCardGrid items={[
        { title: t('vehicleSales'), description: t('vehicleServiceDesc'), image: vehicleSalesIcon, imgScale: 0.9, accent: 'var(--blue)', onClick: () => setActiveTab('vehicle-sales') },
        { title: t('allSales'), description: t('allSalesDesc'), icon: Receipt, iconVariant: 'flat-icon', accent: 'var(--maroon)', onClick: () => setActiveTab('all-vehicle-sales') },
      ]} />
    </div>
  );
}
