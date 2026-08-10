import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';

describe('CustomerService', () => {
  let service: CustomerService;
  let prismaMock: any;
  let tenantServiceMock: any;
  let cryptoServiceMock: any;
  let fileServiceMock: any;

  let txMock: any;

  beforeEach(() => {
    txMock = {
      masterKey: { upsert: jest.fn() },
      customer: { create: jest.fn() },
      activityLog: { create: jest.fn() },
      notification: { create: jest.fn() },
    };
    prismaMock = {
      customer: { findFirst: jest.fn() },
      customerDocument: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
      activityLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(txMock)),
    };
    tenantServiceMock = { prisma: prismaMock };
    cryptoServiceMock = { encrypt: jest.fn(), decrypt: jest.fn() };
    fileServiceMock = { uploadFile: jest.fn(), deleteFile: jest.fn() };

    service = new CustomerService(tenantServiceMock, cryptoServiceMock, fileServiceMock);
  });

  describe('createCustomer', () => {
    // Regression guard for the TN69097 orphaned-key bug: a manually-typed key that
    // isn't in the existing catalog must be registered in the SAME transaction as
    // the customer, so it can never be persisted without an owning customer.
    it('registers a manual key and the customer atomically inside one $transaction', async () => {
      txMock.masterKey.upsert.mockResolvedValue({ id: 'key-1', shopId: 'shop-1', keyNumber: 'TN12345' });
      txMock.customer.create.mockResolvedValue({ id: 'cust-1', name: 'Alice', masterKeyId: 'key-1' });

      await service.createCustomer('shop-1', {
        name: 'Alice',
        phone: '9999999999',
        keyNumber: 'TN12345',
        manualKey: { category: 'Vehicle Keys' },
      } as any);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.masterKey.upsert).toHaveBeenCalledWith({
        where: { shopId_keyNumber: { shopId: 'shop-1', keyNumber: 'TN12345' } },
        update: {},
        create: {
          shopId: 'shop-1',
          keyNumber: 'TN12345',
          category: 'Vehicle Keys',
        },
      });
      expect(txMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ masterKeyId: 'key-1' }) }),
      );
    });

    it('does not touch masterKey when an existing catalog masterKeyId is supplied', async () => {
      txMock.customer.create.mockResolvedValue({ id: 'cust-1', name: 'Bob', masterKeyId: 'key-existing' });

      await service.createCustomer('shop-1', {
        name: 'Bob',
        phone: '8888888888',
        keyNumber: 'TN99999',
        masterKeyId: 'key-existing',
      } as any);

      expect(txMock.masterKey.upsert).not.toHaveBeenCalled();
      expect(txMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ masterKeyId: 'key-existing' }) }),
      );
    });
  });

  describe('deleteCustomerDocument', () => {
    it('throws NotFoundException when the customer does not belong to the shop', async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(service.deleteCustomerDocument('shop-1', 'cust-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the document does not exist for that customer', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-1', shopId: 'shop-1' });
      prismaMock.customerDocument.findFirst.mockResolvedValue(null);

      await expect(service.deleteCustomerDocument('shop-1', 'cust-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the document WITHOUT physically deleting the underlying file', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-1', shopId: 'shop-1' });
      prismaMock.customerDocument.findFirst.mockResolvedValue({ id: 'doc-1', customerId: 'cust-1', fileKey: 'some-file.png' });
      prismaMock.customerDocument.delete.mockResolvedValue({ id: 'doc-1' });

      await service.deleteCustomerDocument('shop-1', 'cust-1', 'doc-1');

      // Regression guard: the physical file must be RETAINED on soft delete so a
      // soft-deleted document can be restored later. See the comment in
      // CustomerService.deleteCustomerDocument for the rationale.
      expect(fileServiceMock.deleteFile).not.toHaveBeenCalled();
      expect(prismaMock.customerDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });
  });

  describe('addCustomerDocument', () => {
    it('throws NotFoundException when the customer does not belong to the shop', async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.addCustomerDocument('shop-1', 'cust-1', 'Aadhaar Card', { originalname: 'a.png', buffer: Buffer.from('x'), size: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(fileServiceMock.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads the file and creates a CustomerDocument row scoped to the customer', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-1', shopId: 'shop-1' });
      fileServiceMock.uploadFile.mockResolvedValue({ fileUrl: '/api/uploads/doc.png', fileKey: 'doc.png' });
      prismaMock.customerDocument.create.mockResolvedValue({ id: 'doc-1' });

      const file = { originalname: 'aadhaar.png', buffer: Buffer.from('x'), size: 123 };
      await service.addCustomerDocument('shop-1', 'cust-1', 'Aadhaar Card', file);

      expect(fileServiceMock.uploadFile).toHaveBeenCalledWith('aadhaar.png', file.buffer, 'shop-1');
      expect(prismaMock.customerDocument.create).toHaveBeenCalledWith({
        data: {
          customerId: 'cust-1',
          documentType: 'Aadhaar Card',
          fileUrl: '/api/uploads/doc.png',
          fileKey: 'doc.png',
          fileSize: 123,
          originalName: 'aadhaar.png',
        },
      });
    });
  });
});
