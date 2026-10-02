import { BadRequestException } from '@nestjs/common';
import { FirestoreVehicleSaleService } from './firestore-vehicle-sale.service';

// Every rejection below happens in the validation step, before any Firestore access, so the database
// can be a stub that explodes if touched.
const explodingFirestore: any = { get db() { throw new Error('database must not be touched for invalid input'); } };
const service = new FirestoreVehicleSaleService(explodingFirestore);

const valid = {
  sellerName: 'Seller',
  buyerName: 'Buyer',
  registrationNumber: 'TN01AB1234',
  vehiclePrice: 50000,
};
const create = (override: Record<string, unknown>) => service.create('shop-1', 'user-1', { ...valid, ...override } as any);

describe('FirestoreVehicleSaleService.create validation', () => {
  it.each([
    ['missing seller name', { sellerName: '' }],
    ['missing buyer name', { buyerName: undefined }],
    ['missing registration number', { registrationNumber: '   ' }],
    ['missing price', { vehiclePrice: undefined }],
    ['zero price', { vehiclePrice: 0 }],
    ['negative price', { vehiclePrice: -5 }],
    ['non-numeric price', { vehiclePrice: 'abc' }],
    ['absurdly large price', { vehiclePrice: 1e12 }],
    ['advance bigger than the price', { advanceAmount: 60000 }],
    ['negative advance', { advanceAmount: -1 }],
    ['negative office commission', { officeCommission: -1 }],
    ['object instead of text', { sellerName: { $set: 1 } }],
    ['over-long name', { buyerName: 'x'.repeat(500) }],
    ['malformed sale date', { saleDate: '02/10/2026' }],
    ['impossible sale date', { saleDate: '2026-13-45' }],
    ['malformed time', { saleTime: '25:99' }],
    ['malformed balance date', { balanceLastDate: 'tomorrow' }],
    ['unsupported language', { lang: 'fr' }],
    ['too-short phone', { buyerPhone: '123' }],
  ])('rejects %s with a 400 before touching the database', async (_label, override) => {
    await expect(create(override as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
