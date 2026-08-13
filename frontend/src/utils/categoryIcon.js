import ecmServiceImg from '../assets/dashboard-icons/ecm-service.png';
import meterServiceImg from '../assets/dashboard-icons/meter-service.png';
import scanningServiceImg from '../assets/dashboard-icons/scanning-service.png';
import dealerIcon from '../assets/dashboard-icons/dealer.png';
import keyShopLogo from '../assets/branding/keyshop-logo.png';

// Maps a shop's category name (ShopCategory.name, e.g. "ECM", "Meter",
// "Scanning"/"Scanner", "Key Shops", "Dealers" - see the public shop
// payload's `category` field, ShopService.mapPublicShop) to its
// category-specific image, so every shop card/row shows an icon matching
// what that shop actually does instead of one generic logo everywhere.
// Falls back to the generic Dealers icon for any category name that isn't
// one of the platform's five built-in ones (a Super Admin can create custom
// categories via the Shop Categories screen).
export function categoryImage(categoryName) {
  const key = (categoryName || '').trim().toLowerCase();
  if (key === 'ecm') return ecmServiceImg;
  if (key === 'meter') return meterServiceImg;
  if (key === 'scanning' || key === 'scanner') return scanningServiceImg;
  if (key === 'key shops' || key === 'key shop') return keyShopLogo;
  return dealerIcon;
}
