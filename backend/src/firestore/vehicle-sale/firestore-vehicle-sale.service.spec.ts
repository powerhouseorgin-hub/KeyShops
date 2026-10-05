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

// ---- owners: shop vs Super Admin ----------------------------------------------------------------------------
describe('FirestoreVehicleSaleService owners', () => {
  const body = { sellerName: 'Seller', buyerName: 'Buyer', registrationNumber: 'TN01AB1234', vehiclePrice: 50000 };

  it('a shop sale records the shop as owner (id and name)', async () => {
    const { store, firestore } = fakeFirestore();
    const sale: any = await new FirestoreVehicleSaleService(firestore, noFiles).create('shop-1', 'user-1', body as any);
    expect(sale).toMatchObject({ ownerType: 'SHOP', ownerId: 'shop-1', shopId: 'shop-1', ownerName: 'Shop' });
    expect(store.get(`vehicleSaleNumbers/${sale.saleNumber}`)).toMatchObject({ shopId: 'shop-1', ownerId: 'shop-1' });
  });

  it('a Super Admin sale is owned by the Super Admin: no shop, their name, stored under their user document', async () => {
    const { store, firestore } = fakeFirestore();
    store.set('users/admin-1', { name: 'Platform Boss' });
    const sale: any = await new FirestoreVehicleSaleService(firestore, noFiles).create({ type: 'SUPER_ADMIN', id: 'admin-1' }, 'admin-1', body as any);
    expect(sale).toMatchObject({ ownerType: 'SUPER_ADMIN', ownerId: 'admin-1', shopId: null, ownerName: 'Platform Boss' });
    expect(sale.saleNumber).toMatch(/^VS-[1-9]\d{9}$/);
    expect(store.get(`vehicleSaleNumbers/${sale.saleNumber}`)).toMatchObject({ shopId: null, ownerId: 'admin-1' });
    const saved = [...store.entries()].find(([k]) => k.startsWith('users/admin-1/vehicleSales/'));
    expect(saved).toBeDefined();
  });

  it('falls back to the name "Super Admin" when the account has none', async () => {
    const { store, firestore } = fakeFirestore();
    store.set('users/admin-2', {});
    const sale: any = await new FirestoreVehicleSaleService(firestore, noFiles).create({ type: 'SUPER_ADMIN', id: 'admin-2' }, 'admin-2', body as any);
    expect(sale.ownerName).toBe('Super Admin');
  });

  it('refuses to sell for an owner that does not exist', async () => {
    const { firestore } = fakeFirestore();
    await expect(new FirestoreVehicleSaleService(firestore, noFiles).create({ type: 'SUPER_ADMIN', id: 'ghost' }, 'ghost', body as any)).rejects.toThrow('User not found');
    await expect(new FirestoreVehicleSaleService(firestore, noFiles).create('no-such-shop', 'u', body as any)).rejects.toThrow('Shop not found');
  });

  it("never lets a Super Admin's sale be created with a client-chosen owner (the body is not used for ownership)", async () => {
    const { store, firestore } = fakeFirestore();
    store.set('users/admin-1', { name: 'Boss' });
    const sale: any = await new FirestoreVehicleSaleService(firestore, noFiles).create({ type: 'SUPER_ADMIN', id: 'admin-1' }, 'admin-1', { ...body, shopId: 'shop-1', ownerType: 'SHOP', ownerId: 'shop-1', ownerName: 'Hacked' } as any);
    expect(sale).toMatchObject({ ownerType: 'SUPER_ADMIN', ownerId: 'admin-1', shopId: null, ownerName: 'Boss' });
  });
});

describe('FirestoreVehicleSaleService.listAll input checks', () => {
  const svc = new FirestoreVehicleSaleService(explodingFirestore, noFiles);
  it.each([['a path-like shopId', { shopId: 'a/b' }], ['a shopId with spaces', { shopId: 'x y' }]])('rejects %s before touching the database', async (_l, opts) => {
    await expect(svc.listAll(opts as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts the id formats that really exist: auto-ids and migrated UUIDs (with hyphens)', async () => {
    for (const shopId of ['4OctK8RACSWxuTBgv3yr', 'e56d81f4-cd32-4d76-84f1-03c3759eed2c']) {
      await expect(svc.listAll({ shopId })).rejects.not.toBeInstanceOf(BadRequestException);
    }
    for (const cursor of ['shops/e56d81f4-cd32-4d76-84f1-03c3759eed2c/vehicleSales/2eIjpp5wCGvLQqjK7aUV', 'users/aBc123/vehicleSales/xyz']) {
      await expect(svc.listAll({ cursor })).rejects.not.toBeInstanceOf(BadRequestException);
    }
  });
  it('accepts SUPER_ADMIN as a shopId filter (it gets as far as the database)', async () => {
    await expect(svc.listAll({ shopId: 'SUPER_ADMIN' })).rejects.not.toBeInstanceOf(BadRequestException);
  });
  it.each([['a non-sale path', 'customers/abc'], ['a path outside vehicleSales', 'shops/abc/customers/def'], ['path traversal', 'shops/../users/abc/vehicleSales/x'], ['an empty segment', 'shops//vehicleSales/x']])('rejects the cursor %s', async (_l, cursor) => {
    await expect(svc.listAll({ cursor })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('FirestoreVehicleSaleService.listPage cursor checks', () => {
  const svc = new FirestoreVehicleSaleService(explodingFirestore, noFiles);
  it.each([
    ['another shop\'s sale', 'shops/other-shop/vehicleSales/abc'],
    ['a Super Admin sale', 'users/admin-1/vehicleSales/abc'],
    ['a path outside vehicleSales', 'shops/shop-1/customers/abc'],
    ['path traversal', 'shops/shop-1/vehicleSales/../../other/vehicleSales/x'],
  ])('refuses a cursor pointing at %s', async (_l, cursor) => {
    await expect(svc.listPage('shop-1', { cursor })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts a cursor inside the owner\'s own collection (it then reaches the database)', async () => {
    await expect(svc.listPage('shop-1', { cursor: 'shops/shop-1/vehicleSales/abc' })).rejects.not.toBeInstanceOf(BadRequestException);
    await expect(svc.listPage({ type: 'SUPER_ADMIN', id: 'admin-1' }, { cursor: 'users/admin-1/vehicleSales/abc' })).rejects.not.toBeInstanceOf(BadRequestException);
  });
});

// ---- signatures ---------------------------------------------------------------------------------------------
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (over: Record<string, unknown> = {}) => ({ originalname: 's.png', buffer: Buffer.concat([PNG_HEAD, Buffer.from('data')]), size: 12, mimetype: 'image/png', ...over });

describe('FirestoreVehicleSaleService.addSignature', () => {
  it('stores the seller and the buyer signature on the right sale, each under its own field', async () => {
    const { svc, sale } = photoFixture(0);
    const seller = await svc.addSignature('shop-1', 'sale-1', 'seller', png());
    expect(seller.sellerSignature).toMatchObject({ key: 'new0', url: 'https://files/new0' });
    expect(seller.buyerSignature).toBeNull();
    const buyer = await svc.addSignature('shop-1', 'sale-1', 'buyer', png());
    expect(buyer.buyerSignature).toMatchObject({ key: 'new1' });
    expect(buyer.sellerSignature).toMatchObject({ key: 'new0' });
    expect(sale.sellerSignature.key).toBe('new0');
    expect(sale.buyerSignature.key).toBe('new1');
  });

  it('signing again replaces the earlier file (the old one is deleted)', async () => {
    const f = photoFixture(0);
    await f.svc.addSignature('shop-1', 'sale-1', 'seller', png());
    await f.svc.addSignature('shop-1', 'sale-1', 'seller', png());
    expect(f.sale.sellerSignature.key).toBe('new1');
    expect(f.deleted).toEqual(['new0']);
  });

  it.each([
    ['an unknown party', 'witness', png()],
    ['no file', 'seller', undefined],
    ['an empty file', 'seller', png({ buffer: Buffer.alloc(0), size: 0 })],
    ['a JPEG', 'seller', png({ mimetype: 'image/jpeg' })],
    ['a file that only claims to be a PNG', 'seller', png({ buffer: Buffer.from('<svg onload=alert(1)>') })],
    ['a file over 1 MB', 'seller', png({ size: 1024 * 1024 + 1 })],
  ])('rejects %s with a 400 before touching storage', async (_l, party, file) => {
    const { svc, uploaded } = photoFixture(0);
    await expect(svc.addSignature('shop-1', 'sale-1', party as string, file as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(uploaded).toHaveLength(0);
  });

  it('404s for a sale that does not exist or was deleted, without uploading', async () => {
    const missing = photoFixture(0);
    await expect(missing.svc.addSignature('shop-1', 'nope', 'seller', png())).rejects.toThrow('Vehicle sale not found');
    const gone = photoFixture(0, true);
    await expect(gone.svc.addSignature('shop-1', 'sale-1', 'seller', png())).rejects.toThrow('Vehicle sale not found');
    expect(missing.uploaded).toHaveLength(0);
    expect(gone.uploaded).toHaveLength(0);
  });
});
