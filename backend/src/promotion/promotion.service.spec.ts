import { NotFoundException } from '@nestjs/common';
import { PromotionService } from './promotion.service';

describe('PromotionService', () => {
  let service: PromotionService;
  let prismaMock: any;
  let tenantServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      promotion: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    tenantServiceMock = { prisma: prismaMock };
    service = new PromotionService(tenantServiceMock, {} as any);
  });

  describe('getAllPromotions', () => {
    it('lists promotions across every shop (no shopId filter), newest first, with shop/creator joined, excluding expired offers by default', async () => {
      prismaMock.promotion.findMany.mockResolvedValue([]);

      await service.getAllPromotions();

      const callArgs = prismaMock.promotion.findMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({
        OR: [{ type: { not: 'OFFER' } }, { validUntil: null }, { validUntil: { gte: expect.any(Date) } }],
      });
      expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
      expect(callArgs.include.shop).toEqual({ select: { id: true, name: true } });
      expect(callArgs.include.createdBy).toEqual({ select: { id: true, name: true, email: true } });
      expect(callArgs.include.linkedPromotion).toEqual({ select: { id: true, title: true, type: true } });
    });

    it('includes expired offers when includeExpiredOffers is true (Super Admin Offer Management)', async () => {
      prismaMock.promotion.findMany.mockResolvedValue([]);

      await service.getAllPromotions({ includeExpiredOffers: true });

      const callArgs = prismaMock.promotion.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
    });
  });

  describe('createPromotion', () => {
    it('creates a listing tied to the calling shop admin and their shop', async () => {
      prismaMock.promotion.create.mockResolvedValue({ id: 'promo-1' });

      const dto: any = { type: 'PRODUCT', title: 'Spare Key Blanks', price: 99 };
      const result = await service.createPromotion('shop-1', 'user-1', dto);

      expect(prismaMock.promotion.create).toHaveBeenCalledWith({
        data: {
          type: 'PRODUCT',
          title: 'Spare Key Blanks',
          description: undefined,
          imageUrl: undefined,
          price: 99,
          discountPercentage: undefined,
          validUntil: undefined,
          linkedPromotionId: undefined,
          shopId: 'shop-1',
          createdById: 'user-1',
        },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: 'promo-1' });
    });

    it('creates an OFFER listing with a discount, expiry, and an optional link to an existing product/ad', async () => {
      prismaMock.promotion.create.mockResolvedValue({ id: 'offer-1' });

      const dto: any = {
        type: 'OFFER',
        title: '20% off duplicate keys',
        discountPercentage: 20,
        validUntil: '2026-08-01T00:00:00.000Z',
        linkedPromotionId: 'promo-product-1',
      };
      await service.createPromotion('shop-1', 'user-1', dto);

      const callArgs = prismaMock.promotion.create.mock.calls[0][0];
      expect(callArgs.data.type).toBe('OFFER');
      expect(callArgs.data.discountPercentage).toBe(20);
      expect(callArgs.data.validUntil).toEqual(new Date('2026-08-01T00:00:00.000Z'));
      expect(callArgs.data.linkedPromotionId).toBe('promo-product-1');
    });
  });

  describe('updatePromotionAsShop / deletePromotionAsShop (ownership enforcement)', () => {
    it('throws NotFoundException when updating a promotion not owned by the caller shop', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue(null);

      await expect(service.updatePromotionAsShop('promo-1', 'shop-A', { title: 'x' } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.promotion.findFirst).toHaveBeenCalledWith({ where: { id: 'promo-1', shopId: 'shop-A' } });
      expect(prismaMock.promotion.update).not.toHaveBeenCalled();
    });

    it('updates the promotion when it is owned by the caller shop', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue({ id: 'promo-1', shopId: 'shop-A' });
      prismaMock.promotion.update.mockResolvedValue({ id: 'promo-1', title: 'Updated' });

      const result = await service.updatePromotionAsShop('promo-1', 'shop-A', { title: 'Updated' } as any);

      expect(prismaMock.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { title: 'Updated' },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: 'promo-1', title: 'Updated' });
    });

    it('throws NotFoundException when deleting a promotion not owned by the caller shop (cannot cross-delete)', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue(null);

      await expect(service.deletePromotionAsShop('promo-owned-by-shop-B', 'shop-A')).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.promotion.findFirst).toHaveBeenCalledWith({
        where: { id: 'promo-owned-by-shop-B', shopId: 'shop-A' },
      });
      expect(prismaMock.promotion.delete).not.toHaveBeenCalled();
    });

    it('soft-deletes the promotion when owned by the caller shop', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue({ id: 'promo-1', shopId: 'shop-A' });
      prismaMock.promotion.delete.mockResolvedValue({ id: 'promo-1' });

      const result = await service.deletePromotionAsShop('promo-1', 'shop-A');

      expect(prismaMock.promotion.delete).toHaveBeenCalledWith({ where: { id: 'promo-1' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('updatePromotionAsSuperAdmin / deletePromotionAsSuperAdmin (creator-only restriction)', () => {
    it('throws NotFoundException when the promotion does not exist or was not created by this Super Admin', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePromotionAsSuperAdmin('missing', 'super-1', { title: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.promotion.update).not.toHaveBeenCalled();
    });

    it('updates a promotion created by this Super Admin', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue({ id: 'promo-1', createdById: 'super-1' });
      prismaMock.promotion.update.mockResolvedValue({ id: 'promo-1', title: 'Moderated' });

      const result = await service.updatePromotionAsSuperAdmin('promo-1', 'super-1', { title: 'Moderated' } as any);

      expect(prismaMock.promotion.findFirst).toHaveBeenCalledWith({
        where: { id: 'promo-1', createdById: 'super-1' },
      });
      expect(prismaMock.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { title: 'Moderated' },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: 'promo-1', title: 'Moderated' });
    });

    it('deletes a promotion created by this Super Admin', async () => {
      prismaMock.promotion.findFirst.mockResolvedValue({ id: 'promo-1', createdById: 'super-1' });
      prismaMock.promotion.delete.mockResolvedValue({ id: 'promo-1' });

      const result = await service.deletePromotionAsSuperAdmin('promo-1', 'super-1');

      expect(prismaMock.promotion.findFirst).toHaveBeenCalledWith({
        where: { id: 'promo-1', createdById: 'super-1' },
      });
      expect(prismaMock.promotion.delete).toHaveBeenCalledWith({ where: { id: 'promo-1' } });
      expect(result).toEqual({ success: true });
    });
  });
});
