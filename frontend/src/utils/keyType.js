import { VEHICLE_CATEGORIES } from './vehicleCategory';

// Maps a Customer.vehicleCategory value to its existing display label -
// shared by KeysCatalogView and KeysSearchView.
export function keyTypeDisplayLabel(t, vehicleCategory) {
  switch (vehicleCategory) {
    case VEHICLE_CATEGORIES.TWO_WHEELER: return t('twoWheelerLabel');
    case VEHICLE_CATEGORIES.FOUR_WHEELER: return t('fourWheelerLabel');
    case VEHICLE_CATEGORIES.TRUCK_LORRY: return t('truckLorryLabel');
    case VEHICLE_CATEGORIES.HOME: return t('homeCategoryLabel');
    case VEHICLE_CATEGORIES.OFFICE: return t('officeCategoryLabel');
    default: return null;
  }
}
