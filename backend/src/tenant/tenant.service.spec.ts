import { Role } from '@prisma/client';
import { TenantService } from './tenant.service';
import { runWithTenantContext } from './tenant.context';

/**
 * Integration tests for the centralized soft-delete + tenant-scoping Prisma
 * extension exposed via `TenantService.prisma`. These run against the real
 * dev database (DATABASE_URL from .env) rather than a mock, because the
 * behavior under test - `$extends` query interception - only takes effect
 * on genuine Prisma Client query execution.
 *
 * All rows created here are prefixed with `__jest_tenant_test__` and hard
 * deleted (via the RAW, unextended delegates - `tenantService.shop`, not
 * `tenantService.prisma.shop`) in `afterAll`, so this suite is safe to
 * re-run against a shared dev database without leaving residue.
 */
describe('TenantService.prisma (soft-delete + tenant-scoping extension)', () => {
  let tenantService: TenantService;
  const createdShopIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdNotificationIds: string[] = [];

  beforeAll(async () => {
    tenantService = new TenantService();
    await tenantService.$connect();
  });

  afterAll(async () => {
    // Hard cleanup via raw (unextended) delegates - deliberately bypasses
    // the soft-delete rewrite so test data doesn't linger. Cleanup across
    // different shops/notifications/users runs in parallel (each shop's own
    // steps stay sequential - FK order requires children before the shop
    // itself) - this suite creates ~10 shops, and the old fully-sequential
    // version of this loop was exceeding jest's default 5s hook timeout,
    // which aborted the loop partway through and left orphaned shops behind
    // in the real database this suite runs against (see the class-level
    // comment above). The explicit timeout below is a safety margin on top
    // of that, not a substitute for it.
    await Promise.all(
      createdNotificationIds.map((id) => tenantService.notification.delete({ where: { id } }).catch(() => undefined)),
    );
    await Promise.all(
      createdShopIds.map(async (shopId) => {
        await tenantService.activityLog.deleteMany({ where: { shopId } }).catch(() => undefined);
        await tenantService.customer.deleteMany({ where: { shopId } }).catch(() => undefined);
        await tenantService.shopDocument.deleteMany({ where: { shopId } }).catch(() => undefined);
        await tenantService.shop.delete({ where: { id: shopId } }).catch(() => undefined);
      }),
    );
    await Promise.all(
      createdUserIds.map((userId) => tenantService.user.delete({ where: { id: userId } }).catch(() => undefined)),
    );
    await tenantService.$disconnect();
  }, 30000);

  async function createTestShop(suffix: string) {
    const shop = await tenantService.shop.create({
      data: { name: `__jest_tenant_test__${suffix}`, themeColor: '#123456' },
    });
    createdShopIds.push(shop.id);
    return shop;
  }

  describe('soft delete rewriting', () => {
    it('rewrites delete() into an update() that sets deletedAt, without physically removing the row', async () => {
      const shop = await createTestShop('soft-delete');

      await tenantService.prisma.shop.delete({ where: { id: shop.id } });

      // Raw (unextended) delegate must still find the row physically present.
      const raw = await tenantService.shop.findUnique({ where: { id: shop.id } });
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).not.toBeNull();

      // Un-delete it so the afterAll cleanup (which goes through the raw
      // delegate anyway) and any subsequent assertions are unaffected.
    });

    it('excludes soft-deleted rows from reads through the extended client by default', async () => {
      const shop = await createTestShop('excluded-from-reads');
      await tenantService.prisma.shop.delete({ where: { id: shop.id } });

      const viaExtended = await tenantService.prisma.shop.findUnique({ where: { id: shop.id } });
      expect(viaExtended).toBeNull();

      const viaExtendedFindMany = await tenantService.prisma.shop.findMany({ where: { id: shop.id } });
      expect(viaExtendedFindMany).toHaveLength(0);
    });

    it('still allows an explicit deletedAt filter to override the default (Extended Where Unique Input)', async () => {
      const shop = await createTestShop('explicit-deletedat-override');
      await tenantService.prisma.shop.delete({ where: { id: shop.id } });

      // Caller explicitly wants soft-deleted rows too.
      const found = await tenantService.prisma.shop.findFirst({
        where: { id: shop.id, deletedAt: { not: null } },
      });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(shop.id);
    });

    it('rewrites deleteMany() into updateMany() that sets deletedAt on all matching rows', async () => {
      const shopA = await createTestShop('bulk-a');
      const shopB = await createTestShop('bulk-b');

      const result = await tenantService.prisma.shop.deleteMany({
        where: { id: { in: [shopA.id, shopB.id] } },
      });
      expect(result.count).toBe(2);

      const rawA = await tenantService.shop.findUnique({ where: { id: shopA.id } });
      const rawB = await tenantService.shop.findUnique({ where: { id: shopB.id } });
      expect(rawA!.deletedAt).not.toBeNull();
      expect(rawB!.deletedAt).not.toBeNull();
    });

    it('does not apply soft-delete filtering to models outside SOFT_DELETE_MODELS (e.g. ActivityLog)', async () => {
      const shop = await createTestShop('activitylog-not-soft-deleted');
      const user = await tenantService.user.create({
        data: {
          email: `__jest_tenant_test__${Date.now()}@example.com`,
          passwordHash: 'x',
          name: 'Test User',
          role: Role.SHOP_ADMIN,
          shopId: shop.id,
        },
      });
      // Not pushed to createdUserIds - User.shopId cascades on delete (see
      // schema.prisma), so this row is already removed for free when
      // afterAll deletes `shop` above; an explicit delete here would just
      // fail (row already gone) and print a benign-but-noisy Prisma error.

      const log = await tenantService.prisma.activityLog.create({
        data: { shopId: shop.id, userId: user.id, action: 'TEST_ACTION', details: '{}' },
      });

      // A real hard delete should work for ActivityLog since it's intentionally
      // excluded from SOFT_DELETE_MODELS (immutable audit trail - see the
      // schema.prisma comment on the ActivityLog model).
      await tenantService.prisma.activityLog.delete({ where: { id: log.id } });
      const raw = await tenantService.activityLog.findUnique({ where: { id: log.id } });
      expect(raw).toBeNull();
    });
  });

  describe('tenant (shopId) row-level scoping', () => {
    it('automatically scopes Customer reads to the active tenant context, even without an explicit shopId filter', async () => {
      const shopA = await createTestShop('tenant-scope-a');
      const shopB = await createTestShop('tenant-scope-b');

      await tenantService.customer.create({
        data: { shopId: shopA.id, name: 'Customer A', phone: '9990001111', keyNumber: 'K-A' },
      });
      await tenantService.customer.create({
        data: { shopId: shopB.id, name: 'Customer B', phone: '9990002222', keyNumber: 'K-B' },
      });

      const resultsForA = await runWithTenantContext(
        { shopId: shopA.id, role: 'SHOP_ADMIN', userId: 'admin-a' },
        () => tenantService.prisma.customer.findMany({}),
      );

      expect(resultsForA.length).toBeGreaterThan(0);
      expect(resultsForA.every((c) => c.shopId === shopA.id)).toBe(true);
      expect(resultsForA.some((c) => c.shopId === shopB.id)).toBe(false);
    });

    it('auto-injects the context shopId when creating a tenant-scoped row', async () => {
      const shop = await createTestShop('tenant-scope-create');

      const created = await runWithTenantContext(
        { shopId: shop.id, role: 'SHOP_ADMIN', userId: 'admin-1' },
        () =>
          // Deliberately omit shopId from the payload - the extension should inject it.
          tenantService.prisma.customer.create({
            data: { name: 'Auto Scoped Customer', phone: '9998887777', keyNumber: 'K-AUTO' } as any,
          }),
      );

      expect(created.shopId).toBe(shop.id);
    });

    it('does not apply tenant scoping when there is no active context (e.g. Super Admin / background scripts)', async () => {
      const shopA = await createTestShop('no-context-a');
      await tenantService.customer.create({
        data: { shopId: shopA.id, name: 'Unscoped Read Customer', phone: '9991112222', keyNumber: 'K-NOCTX' },
      });

      // No runWithTenantContext wrapper here.
      const found = await tenantService.prisma.customer.findFirst({ where: { shopId: shopA.id } });
      expect(found).not.toBeNull();
    });
  });

  describe('Notification audience scoping', () => {
    // Regression guard for the cross-shop notification leak: before the `audience`
    // column existed, every shopId: null notification (including super-admin-only
    // "new shop registration" alerts) was visible to every shop admin because the
    // extension's OR clause only checked `shopId: null`, not who the notification
    // was actually meant for.
    it('shows a Shop Admin their own notification + global SHOP broadcasts, but NOT another shop\'s notification or SUPER_ADMIN-only ones', async () => {
      const shopA = await createTestShop('notif-a');
      const shopB = await createTestShop('notif-b');

      const ownNotif = await tenantService.notification.create({
        data: { shopId: shopA.id, title: 'Own', message: 'x', type: 'TEST' },
      });
      const otherShopNotif = await tenantService.notification.create({
        data: { shopId: shopB.id, title: 'Other shop', message: 'x', type: 'TEST' },
      });
      const globalShopNotif = await tenantService.notification.create({
        data: { shopId: null, audience: 'SHOP', title: 'Global broadcast', message: 'x', type: 'TEST' },
      });
      const superAdminOnlyNotif = await tenantService.notification.create({
        data: { shopId: null, audience: 'SUPER_ADMIN', title: 'Registration request', message: 'x', type: 'TEST' },
      });
      createdNotificationIds.push(ownNotif.id, otherShopNotif.id, globalShopNotif.id, superAdminOnlyNotif.id);

      const results = await runWithTenantContext(
        { shopId: shopA.id, role: 'SHOP_ADMIN', userId: 'admin-a' },
        () => tenantService.prisma.notification.findMany({ where: { type: 'TEST' } }),
      );
      const ids = results.map((n) => n.id);

      expect(ids).toContain(ownNotif.id);
      expect(ids).toContain(globalShopNotif.id);
      expect(ids).not.toContain(otherShopNotif.id);
      expect(ids).not.toContain(superAdminOnlyNotif.id);
    });
  });
});
