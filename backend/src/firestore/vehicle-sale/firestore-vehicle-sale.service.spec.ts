import { BadRequestException } from '@nestjs/common';
import { FirestoreVehicleSaleService, generateSaleNumber } from './firestore-vehicle-sale.service';

// Every rejection below happens in the validation step, before any Firestore access, so the database
// can be a stub that explodes if touched.
const explodingFirestore: any = { get db() { throw new Error('database must not be touched for invalid input'); } };
const noFiles: any = { uploadLongLivedFile: async () => { throw new Error('storage must not be touched'); }, deleteFile: async () => undefined };
const service = new FirestoreVehicleSaleService(explodingFirestore, noFiles);

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

describe('generateSaleNumber', () => {
  it('is "VS-" followed by 10 digits, the first never 0', () => {
    for (let i = 0; i < 2000; i++) expect(generateSaleNumber()).toMatch(/^VS-[1-9]\d{9}$/);
  });

  it('does not repeat in a large sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(generateSaleNumber());
    expect(seen.size).toBeGreaterThan(19990); // ~1e10 values: a collision in 20k draws is already very unlikely
  });
});

// A tiny in-memory Firestore: just enough of runTransaction / collection / doc / get / set for create().
function fakeFirestore(existingNumbers: string[] = []) {
  const store = new Map<string, any>();
  store.set('shops/shop-1', { name: 'Shop' });
  for (const n of existingNumbers) store.set(`vehicleSaleNumbers/${n}`, { shopId: 'other', saleId: 'x' });
  let idCounter = 0;
  const ref = (path: string): any => ({
    path,
    id: path.split('/').pop(),
    collection: (name: string) => ({ doc: (id?: string) => ref(`${path}/${name}/${id ?? 'auto' + ++idCounter}`) }),
  });
  const db: any = {
    collection: (name: string) => ({ doc: (id?: string) => ref(`${name}/${id ?? 'auto' + ++idCounter}`), add: async () => ({}) }),
    runTransaction: async (fn: any) => {
      const writes: Array<[string, any]> = [];
      const tx = {
        get: async (r: any) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
        set: (r: any, data: any) => writes.push([r.path, data]),
      };
      const result = await fn(tx);
      for (const [p, d] of writes) store.set(p, d);
      return result;
    },
    batch: () => ({}),
  };
  return { store, firestore: { db } as any };
}

describe('FirestoreVehicleSaleService.create receipt numbers', () => {
  const body = { sellerName: 'Seller', buyerName: 'Buyer', registrationNumber: 'TN01AB1234', vehiclePrice: 50000 };

  it('generates the number itself and ignores one sent by the client', async () => {
    const { store, firestore } = fakeFirestore();
    const svc = new FirestoreVehicleSaleService(firestore, noFiles);
    const sale = await svc.create('shop-1', 'user-1', { ...body, saleNumber: 'MY-100' } as any);
    expect(sale.saleNumber).toMatch(/^VS-[1-9]\d{9}$/);
    expect(sale.saleNumber).not.toBe('MY-100');
    // the sale and its number-index document were written together
    expect(store.get(`vehicleSaleNumbers/${sale.saleNumber}`)).toMatchObject({ shopId: 'shop-1', saleId: sale.id });
  });

  it('draws a new number when the first one is already taken', async () => {
    const taken = 'VS-1111111111';
    const { firestore } = fakeFirestore([taken]);
    const svc = new FirestoreVehicleSaleService(firestore, noFiles);
    const draws = [taken, 'VS-2222222222'];
    const spy = jest.spyOn(require('crypto'), 'randomInt');
    // generateSaleNumber() calls randomInt twice per number (leading digit, then the other nine)
    spy.mockImplementationOnce(() => 1).mockImplementationOnce(() => 111111111)
       .mockImplementationOnce(() => 2).mockImplementationOnce(() => 222222222);
    const sale = await svc.create('shop-1', 'user-1', body as any);
    spy.mockRestore();
    expect(draws).toContain(sale.saleNumber);
    expect(sale.saleNumber).toBe('VS-2222222222');
  });

  it('gives up with a 500 if no free number can be found', async () => {
    const taken = 'VS-1111111111';
    const { firestore } = fakeFirestore([taken]);
    const svc = new FirestoreVehicleSaleService(firestore, noFiles);
    const spy = jest.spyOn(require('crypto'), 'randomInt').mockImplementation(((a: number, b?: number) => (b === 10 ? 1 : 111111111)) as any);
    await expect(svc.create('shop-1', 'user-1', body as any)).rejects.toThrow('Could not allocate a receipt number');
    spy.mockRestore();
  });
});

// ---- photos -------------------------------------------------------------------------------------------------
function photoFixture(existingPhotos = 0, deleted = false) {
  const sale: any = { photos: Array.from({ length: existingPhotos }, (_, i) => ({ key: `old${i}`, url: `u${i}`, size: 1, createdAt: 1 })), deletedAt: deleted ? 5 : null };
  const saleRef: any = { get: async () => ({ exists: true, data: () => sale }) };
  const col: any = { doc: (id: string) => (id === 'sale-1' ? saleRef : { get: async () => ({ exists: false }) }) };
  const firestore: any = {
    db: {
      collection: () => ({ doc: () => ({ collection: () => col }) }),
      runTransaction: async (fn: any) => fn({
        get: async () => ({ data: () => sale }),
        update: (_ref: any, data: any) => Object.assign(sale, data),
      }),
    },
  };
  const uploaded: string[] = [];
  const deleted_: string[] = [];
  const files: any = {
    uploadLongLivedFile: async () => { const key = `new${uploaded.length}`; uploaded.push(key); return { fileKey: key, fileUrl: `https://files/${key}` }; },
    deleteFile: async (k: string) => { deleted_.push(k); },
  };
  return { svc: new FirestoreVehicleSaleService(firestore, files), sale, uploaded, deleted: deleted_ };
}
const jpeg = (over: Record<string, unknown> = {}) => ({ originalname: 'p.jpg', buffer: Buffer.from('x'), size: 1, mimetype: 'image/jpeg', ...over });

describe('FirestoreVehicleSaleService.addPhoto', () => {
  it('stores the photo on the sale and returns the list', async () => {
    const { svc, sale } = photoFixture(0);
    const out = await svc.addPhoto('shop-1', 'sale-1', jpeg());
    expect(out.photos).toHaveLength(1);
    expect(sale.photos[0]).toMatchObject({ key: 'new0', url: 'https://files/new0', size: 1 });
  });

  it('accepts the 5th photo but refuses a 6th - without uploading anything for the 6th', async () => {
    const { svc, uploaded } = photoFixture(4);
    await expect(svc.addPhoto('shop-1', 'sale-1', jpeg())).resolves.toBeDefined();
    expect(uploaded).toHaveLength(1);
    const full = photoFixture(5);
    await expect(full.svc.addPhoto('shop-1', 'sale-1', jpeg())).rejects.toThrow('at most 5 photos');
    expect(full.uploaded).toHaveLength(0);
  });

  it('removes the uploaded file again if the sale filled up while it was uploading', async () => {
    const f = photoFixture(4);
    // after the pre-check (4 photos) another request takes the last slot, so the transaction sees 5
    const realUpload = (f.svc as any).files.uploadLongLivedFile;
    (f.svc as any).files.uploadLongLivedFile = async (...a: any[]) => { const r = await realUpload(...a); f.sale.photos.push({ key: 'raced' }); return r; };
    await expect(f.svc.addPhoto('shop-1', 'sale-1', jpeg())).rejects.toThrow('at most 5 photos');
    expect(f.deleted).toEqual(['new0']);
    expect(f.sale.photos).toHaveLength(5);
  });

  it.each([
    ['no file', undefined],
    ['an empty file', jpeg({ buffer: Buffer.alloc(0), size: 0 })],
    ['a PDF', jpeg({ mimetype: 'application/pdf' })],
    ['an SVG', jpeg({ mimetype: 'image/svg+xml' })],
    ['a file over 5 MB', jpeg({ size: 5 * 1024 * 1024 + 1 })],
  ])('rejects %s with a 400 before touching storage', async (_l, file) => {
    const { svc, uploaded } = photoFixture(0);
    await expect(svc.addPhoto('shop-1', 'sale-1', file as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(uploaded).toHaveLength(0);
  });

  it('404s for an unknown or deleted sale', async () => {
    await expect(photoFixture(0).svc.addPhoto('shop-1', 'nope', jpeg())).rejects.toThrow('not found');
    await expect(photoFixture(0, true).svc.addPhoto('shop-1', 'sale-1', jpeg())).rejects.toThrow('not found');
  });
});
