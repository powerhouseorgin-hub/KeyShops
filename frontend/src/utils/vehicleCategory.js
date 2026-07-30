// The 5 icon categories shown on Page 1 of the Customer Registration wizard.
// Free-form strings (not an enum) to match the keyType/documentType precedent
// in the backend schema - see Customer.vehicleCategory in schema.prisma.
export const VEHICLE_CATEGORIES = {
  TWO_WHEELER: 'TWO_WHEELER',
  FOUR_WHEELER: 'FOUR_WHEELER',
  TRUCK_LORRY: 'TRUCK_LORRY',
  HOME: 'HOME',
  OFFICE: 'OFFICE',
};

// Two Wheeler/Four Wheeler/Truck-Lorry are grouped as "Automobile" and
// Home/Office as "Domestic" purely in code - these words are never persisted
// or shown anywhere in the UI (see the original feature spec).
export function isAutomobileCategory(category) {
  return category === VEHICLE_CATEGORIES.TWO_WHEELER
    || category === VEHICLE_CATEGORIES.FOUR_WHEELER
    || category === VEHICLE_CATEGORIES.TRUCK_LORRY;
}
