import { IndianRupee } from 'lucide-react';

// Shared between the authenticated Machines page (App.jsx) and the
// pre-login Machines directory (PublicMobileApp.jsx) so the offer-price
// math and layout only exist in one place.
export function computeOfferPrice(price, discountPercentage) {
  if (price == null || discountPercentage == null || discountPercentage <= 0) return null;
  return price - (price * discountPercentage) / 100;
}

// Renders a product/machine's price. When discountPercentage is set, shows
// the calculated offer price alongside the original price (struck through)
// and a percent-off badge instead of just the plain price.
export default function PriceTag({ price, discountPercentage, size = 'sm', offSuffix = '% off' }) {
  if (price == null) return null;
  const offerPrice = computeOfferPrice(price, discountPercentage);
  const iconClass = size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const priceStyle = size === 'lg' ? { fontSize: 15 } : undefined;

  if (offerPrice == null) {
    return (
      <div className="pub-card-price" style={priceStyle}>
        <IndianRupee className={iconClass} />{Number(price).toLocaleString('en-IN')}
      </div>
    );
  }

  return (
    <div className="pub-card-price-offer">
      <span className="pub-card-price-strike">
        <IndianRupee className="h-3 w-3" />{Number(price).toLocaleString('en-IN')}
      </span>
      <div className="pub-card-price" style={priceStyle}>
        <IndianRupee className={iconClass} />{Math.round(offerPrice).toLocaleString('en-IN')}
      </div>
      <span className="pub-card-offer-badge">{discountPercentage}{offSuffix}</span>
    </div>
  );
}
