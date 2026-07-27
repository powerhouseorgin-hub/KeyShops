import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CryptoService } from '../crypto/crypto.service';
import { FileService } from './file.service';
import { CreateCustomerDto } from './dto/customer.dto';
import { getTenantContext } from '../tenant/tenant.context';

@Injectable()
export class CustomerService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly cryptoService: CryptoService,
    private readonly fileService: FileService,
  ) {}

  // SHOP ADMIN: Create Customer
  async createCustomer(shopId: string, dto: CreateCustomerDto) {
    // Encrypt the sensitive ID Proof Number if provided
    const encryptedIdNumber = dto.idProofNumber ? this.cryptoService.encrypt(dto.idProofNumber) : null;

    let photoUrl = null;

    // Process photo if present (Base64)
    if (dto.photoBase64) {
      try {
        const cleanBase64 = dto.photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const upload = await this.fileService.uploadFile('photo.png', buffer, shopId);
        photoUrl = upload.fileUrl;
      } catch (err) {
        console.error('Failed to save webcam customer photo:', err.message);
      }
    }

    // Save Customer
    const finalLat = dto.latitude ?? 28.6139;
    const finalLng = dto.longitude ?? 77.2090;

    // A MasterKey row must never exist without an owning customer (see CreateCustomerDto.manualKey
    // doc comment for the TN69097 orphaned-key bug this fixes). When the shop admin typed a key
    // number not already in the catalog, register it in the SAME transaction as the customer, so
    // if customer creation fails for any reason the key registration rolls back with it instead of
    // being left dangling.
    const customer = await this.tenantService.prisma.$transaction(async (tx) => {
      let finalMasterKeyId = dto.masterKeyId || null;

      if (!finalMasterKeyId && dto.manualKey) {
        const key = await tx.masterKey.upsert({
          where: { shopId_keyNumber: { shopId, keyNumber: dto.keyNumber } },
          update: {},
          create: {
            shopId,
            keyNumber: dto.keyNumber,
            category: dto.manualKey.category,
          },
        });
        finalMasterKeyId = key.id;
      }

      const created = await tx.customer.create({
        data: {
          shopId,
          name: dto.name,
          phone: dto.phone,
          address: dto.address || null,
          idProofType: dto.idProofType || null,
          idProofNumber: encryptedIdNumber,
          reason: dto.reason || null,
          keyNumber: dto.keyNumber,
          vehicleNumber: dto.vehicleNumber || null,
          masterKeyId: finalMasterKeyId,
          latitude: finalLat,
          longitude: finalLng,
          mapsLink: dto.mapsLink || `https://www.google.com/maps?q=${finalLat},${finalLng}`,
          capturedAddress: dto.capturedAddress || 'Connaught Place, New Delhi, India',
          photoUrl,
        },
      });

      // Log Activity (inside the same transaction so it's consistent with the customer row)
      await tx.activityLog.create({
        data: {
          userId: getTenantContext()?.userId,
          shopId,
          action: 'CUSTOMER_CREATE',
          details: JSON.stringify({ customerId: created.id, name: created.name }),
        },
      });

      // Surface the registration in the Shop Admin's Notifications feed (see
      // NotificationService for the read side). Scoped to this shop only
      // (shopId set, audience 'SHOP') - mirrors the SHOP_REGISTRATION
      // notification auth.service.ts creates for Super Admin on shop signup.
      await tx.notification.create({
        data: {
          title: 'New Customer Registered',
          message: `Customer "${created.name}" (Key: ${created.keyNumber}) has been registered.`,
          type: 'CUSTOMER_REGISTRATION',
          shopId,
          audience: 'SHOP',
        },
      });

      return created;
    });

    return this.decryptCustomerPII(customer);
  }

  // SHOP ADMIN: Update Customer
  async updateCustomer(shopId: string, id: string, dto: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id, shopId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    const updateData: any = {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      idProofType: dto.idProofType,
      reason: dto.reason,
      keyNumber: dto.keyNumber,
      vehicleNumber: dto.vehicleNumber || null,
      masterKeyId: dto.masterKeyId || null,
      latitude: dto.latitude || null,
      longitude: dto.longitude || null,
      mapsLink: dto.mapsLink || null,
      capturedAddress: dto.capturedAddress || null,
    };

    if (dto.idProofNumber) {
      updateData.idProofNumber = this.cryptoService.encrypt(dto.idProofNumber);
    }

    const updated = await this.tenantService.prisma.customer.update({
      where: { id },
      data: updateData,
    });

    await this.tenantService.prisma.activityLog.create({
      data: {
        userId: getTenantContext()?.userId,
        shopId,
        action: 'CUSTOMER_UPDATE',
        details: JSON.stringify({ customerId: id, name: updated.name }),
      },
    });

    return this.decryptCustomerPII(updated);
  }

  // SHOP ADMIN: List / Search Customers
  async getCustomers(shopId: string, query?: string) {
    const whereClause: any = { shopId };

    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { keyNumber: { contains: query, mode: 'insensitive' } },
        { vehicleNumber: { contains: query, mode: 'insensitive' } },
        { capturedAddress: { contains: query, mode: 'insensitive' } },
      ];
    }

    const customers = await this.tenantService.prisma.customer.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
    });

    return customers.map(c => this.decryptCustomerPII(c));
  }

  // SHOP ADMIN: Add Document to Customer
  async addCustomerDocument(shopId: string, customerId: string, documentType: string, file: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id: customerId, shopId },
    });

    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);

    const doc = await this.tenantService.prisma.customerDocument.create({
      data: {
        customerId,
        documentType,
        fileUrl: upload.fileUrl,
        fileKey: upload.fileKey,
        fileSize: file.size,
        originalName: file.originalname || null,
      },
    });

    // Log Activity
    await this.tenantService.prisma.activityLog.create({
      data: {
        userId: getTenantContext()?.userId,
        shopId,
        action: 'DOC_UPLOAD',
        details: JSON.stringify({ customerId, documentId: doc.id, filename: file.originalname }),
      },
    });

    return doc;
  }

  // SUPER ADMIN: Add Document to any customer (cross-shop). The customer's own
  // shopId is used for file storage keying and activity log scoping so this
  // stays consistent with a Shop Admin uploading the same document themselves.
  async addCustomerDocumentSuper(customerId: string, documentType: string, file: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }
    return this.addCustomerDocument(customer.shopId, customerId, documentType, file);
  }

  // SHOP ADMIN: Remove Document from Customer
  async deleteCustomerDocument(shopId: string, customerId: string, documentId: string) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    const doc = await this.tenantService.prisma.customerDocument.findFirst({
      where: { id: documentId, customerId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    // NOTE: the physical file is intentionally NOT deleted here. This is a
    // soft delete (see TenantService's Prisma extension, which rewrites
    // `delete` into `update({ data: { deletedAt } })`), so the underlying
    // file is retained on disk in case the document needs to be restored.
    // Physical cleanup of orphaned files (for documents that stay
    // soft-deleted past a retention window) is expected to be handled by a
    // separate scheduled housekeeping job, not the request path.
    await this.tenantService.prisma.customerDocument.delete({ where: { id: documentId } });

    await this.tenantService.prisma.activityLog.create({
      data: {
        userId: getTenantContext()?.userId,
        shopId,
        action: 'DOC_DELETE',
        details: JSON.stringify({ customerId, documentId }),
      },
    });

    return { success: true };
  }

  // SUPER ADMIN: Get all customers platform-wide
  async getSuperCustomers(query?: string) {
    const whereClause: any = {};
    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { shop: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }
    const customers = await this.tenantService.prisma.customer.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        shop: { select: { name: true } }
      },
    });
    return customers.map(c => this.decryptCustomerPII(c));
  }

  // SUPER ADMIN: Update customer details (any shop)
  async updateSuperCustomer(id: string, dto: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    const updateData: any = {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      idProofType: dto.idProofType,
      reason: dto.reason,
      keyNumber: dto.keyNumber,
      masterKeyId: dto.masterKeyId || null,
      latitude: dto.latitude || null,
      longitude: dto.longitude || null,
      mapsLink: dto.mapsLink || null,
      capturedAddress: dto.capturedAddress || null,
    };

    if (dto.idProofNumber) {
      updateData.idProofNumber = this.cryptoService.encrypt(dto.idProofNumber);
    }

    const updated = await this.tenantService.prisma.customer.update({
      where: { id },
      data: updateData,
    });

    return this.decryptCustomerPII(updated);
  }

  // Decryption Helper
  private decryptCustomerPII(customer: any) {
    if (customer && customer.idProofNumber) {
      customer.idProofNumber = this.cryptoService.decrypt(customer.idProofNumber);
    }
    return customer;
  }
}
