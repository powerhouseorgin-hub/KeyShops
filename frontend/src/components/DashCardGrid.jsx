import React from 'react';

// Generic 2-column "info card" grid used across the dashboards - an icon
// badge top-left, a bold title, and a short description underneath. Used for
// the product-type shortcuts, the shop-admin quick actions, and the
// subscription/inventory shortcuts so all of these read as one consistent
// card language. When an item provides an `image` (see
// DASHBOARD_PRODUCT_CARDS), that photo fills the badge instead of the
// lucide icon, so cards like "Used Machines" show an actual product photo
// rather than a generic outline glyph.
export default function DashCardGrid({ items }) {
  return (
    <div className="dash-card-grid">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <button
            key={idx}
            type="button"
            className={`dash-card animate-fade-in${item.fullWidth ? ' dash-card-full' : ''}${item.accent ? ' dash-card-tint' : ''}`}
            style={{ animationDelay: `${idx * 0.05}s`, ...(item.accent ? { '--tint': item.accent } : {}) }}
            onClick={item.onClick}
          >
            {item.image ? (
              <div className={`icon-badge photo${item.compact ? ' compact' : ''}`}>
                <img src={item.image} alt="" style={item.imgScale ? { transform: `scale(${item.imgScale})` } : undefined} />
              </div>
            ) : (
              <div className={`icon-badge big${item.iconVariant ? ` ${item.iconVariant}` : ''}${item.compact ? ' compact' : ''}`}><Icon /></div>
            )}
            <div className="dash-card-title">{item.title}</div>
            <div className="dash-card-desc">{item.description}</div>
          </button>
        );
      })}
    </div>
  );
}
