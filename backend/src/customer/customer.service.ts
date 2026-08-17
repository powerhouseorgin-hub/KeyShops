import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CryptoService } from '../crypto/crypto.service';
import { FileService } from './file.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { getTenantContext } from '../tenant/tenant.context';
import { normalizePhone, PHONE_REGEX_MESSAGE } from '../common/validators/phone';

@Injectable()
export class CustomerService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly cryptoService: CryptoService,
    private readonly fileService: FileService,
  ) {}

  // SHOP ADMIN: Create Customer
  async createCustomer(shopId: string, dto: CreateCustomerDto) {
    // Accepts +91/91-prefixed, leading-0, spaced/dashed, or bare 10-digit
    // input and normalizes to the canonical bare 10-digit form stored on
    // Customer.phone.
    const normalizedPhone = normalizePhone(dto.phone);
    if (!normalizedPhone) {
      throw new BadRequestException(PHONE_REGEX_MESSAGE);
    }
    dto.phone = normalizedPhone;

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

      if (!finalMasterKeyId && dto.manualKey && dto.keyNumber) {
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

      let billNumber = null;
      if (dto.billAmount !== null && dto.billAmount !== undefined && (dto.billAmount as any) !== '') {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        billNumber = `BILL-${dateStr}-${randomSuffix}`;
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
          keyNumber: dto.keyNumber || null,
          keyType: dto.keyType || null,
          vehicleNumber: dto.vehicleNumber || null,
          masterKeyId: finalMasterKeyId,
          latitude: finalLat,
          longitude: finalLng,
          mapsLink: dto.mapsLink || `https://www.google.com/maps?q=${finalLat},${finalLng}`,
          capturedAddress: dto.capturedAddress || 'Connaught Place, New Delhi, India',
          photoUrl,
          billAmount: dto.billAmount ?? null,
          billNumber,
          vehicleName: dto.vehicleName || null,
          lostKey: dto.lostKey ?? false,
          addKey: dto.addKey ?? false,
          homeOfficeName: dto.homeOfficeName || null,
          vehicleCategory: dto.vehicleCategory || null,
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
          message: created.keyNumber
            ? `Customer "${created.name}" (Key: ${created.keyNumber}) has been registered.`
            : `Customer "${created.name}" has been registered.`,
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
  async updateCustomer(shopId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id, shopId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    if (dto.phone !== undefined) {
      const normalizedPhone = normalizePhone(dto.phone);
      if (!normalizedPhone) {
        throw new BadRequestException(PHONE_REGEX_MESSAGE);
      }
      dto.phone = normalizedPhone;
    }

    let encryptedIdNumber = undefined;
    if (dto.idProofNumber !== undefined && dto.idProofNumber !== null) {
      encryptedIdNumber = dto.idProofNumber ? this.cryptoService.encrypt(dto.idProofNumber) : null;
    }

    const updateData: any = {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      idProofType: dto.idProofType,
      reason: dto.reason,
      keyNumber: dto.keyNumber || null,
      keyType: dto.keyType || null,
      vehicleNumber: dto.vehicleNumber || null,
      masterKeyId: dto.masterKeyId || null,
      latitude: dto.latitude || null,
      longitude: dto.longitude || null,
      mapsLink: dto.mapsLink || null,
      capturedAddress: dto.capturedAddress || null,
      billAmount: dto.billAmount ?? null,
      vehicleName: dto.vehicleName || null,
      lostKey: dto.lostKey ?? false,
      addKey: dto.addKey ?? false,
      homeOfficeName: dto.homeOfficeName || null,
      vehicleCategory: dto.vehicleCategory || null,
    };
    if (encryptedIdNumber !== undefined) {
      updateData.idProofNumber = encryptedIdNumber;
    }

    if (dto.billAmount !== null && dto.billAmount !== undefined && (dto.billAmount as any) !== '' && !customer.billNumber) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      updateData.billNumber = `BILL-${dateStr}-${randomSuffix}`;
    }

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

  // SHOP ADMIN: List / Search Customers.
  //
  // Pagination is opt-in via `pageOpts.limit`, same additive pattern as
  // CustomerService.getSuperCustomers - omitting it preserves the exact
  // original unpaginated flat-array behavior, since other call sites (the
  // global-search route, the duplicate-key scan, and the revenue-by-date
  // report generator) rely on that shape and aren't part of the Customer
  // History screen this pagination was added for.
  async getCustomers(shopId: string, query?: string, pageOpts: { cursor?: string; limit?: number; keysOnly?: boolean; town?: string } = {}) {
    const { cursor, limit, keysOnly, town } = pageOpts;
    const whereClause: any = { shopId };
    // Master Key Catalog Search (KeysSearchView) - only registrations that
    // actually have a key code count as a "key" (the wizard lets a shop
    // admin skip key-code entry entirely for a visit).
    if (keysOnly) {
      whereClause.keyNumber = { not: null };
    }

    const andConditions: any[] = [];
    if (query) {
      andConditions.push({
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
          { keyNumber: { contains: query, mode: 'insensitive' } },
          { vehicleNumber: { contains: query, mode: 'insensitive' } },
          { capturedAddress: { contains: query, mode: 'insensitive' } },
        ],
      });
    }
    // Customer History's location filter - Customer has no structured
    // town/district column (just free-text address/capturedAddress), so this
    // matches the selected Tamil Nadu district/town name against whichever
    // of those two fields actually holds it, same approximate-match approach
    // as the free-text search above.
    if (town) {
      andConditions.push({
        OR: [
          { address: { contains: town, mode: 'insensitive' } },
          { capturedAddress: { contains: town, mode: 'insensitive' } },
        ],
      });
    }
    if (andConditions.length === 1) {
      Object.assign(whereClause, andConditions[0]);
    } else if (andConditions.length > 1) {
      whereClause.AND = andConditions;
    }

    const include = {
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' as const } },
      masterKey: { select: { category: true } },
      // Mirrors getSuperCustomers()'s shape - the shared KeysSearchView
      // detail panel reads customer.shop.name/companyDetails regardless of
      // which role's endpoint supplied the result.
      shop: { select: { name: true, companyDetails: true } },
    };

    if (!limit) {
      const customers = await this.tenantService.prisma.customer.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include,
      });
      return customers.map(c => this.decryptCustomerPII(c));
    }

    const rows = await this.tenantService.prisma.customer.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page.map(c => this.decryptCustomerPII(c)), nextCursor: hasMore ? page[page.length - 1].id : null };
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

  // SHOP ADMIN: Upload a generated Customer Key Registration Report PDF and
  // get back a stable, shareable download link (CustomerReport.id is the
  // public token - see PublicReportController). The PDF itself is built
  // client-side (html2canvas/jsPDF can't run server-side) and handed here
  // purely for storage once it exists.
  async createCustomerReport(shopId: string, customerId: string, fileName: string, file: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);

    const report = await this.tenantService.prisma.customerReport.create({
      data: {
        customerId,
        fileKey: upload.fileKey,
        fileName,
      },
    });

    return { id: report.id };
  }

  async createCustomerReportSuper(customerId: string, fileName: string, file: any) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }
    return this.createCustomerReport(customer.shopId, customerId, fileName, file);
  }

  // PUBLIC: Resolve a report token to a freshly-signed download URL. No auth
  // - the whole point of the link is that the customer (who never logs in)
  // can open it. Not tenant-scoped for the same reason; the token itself
  // (a random UUID, never the customer/shop id) is what limits access, same
  // trust model as an "anyone with the link" share.
  async getReportDownloadUrl(reportId: string) {
    const report = await this.tenantService.prisma.customerReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    const url = await this.fileService.getSignedDownloadUrl(report.fileKey, report.fileName);
    return { url };
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

  // SUPER ADMIN: Get all customers platform-wide.
  //
  // Pagination is opt-in via `pageOpts.limit`, same additive pattern as
  // PromotionService.getAllPromotions / ShopService.searchPublicShops -
  // omitting it preserves the exact original unpaginated flat-array
  // behavior, since several existing call sites (the global header search,
  // and a couple of single-record "refetch by id" lookups) rely on that
  // shape and aren't part of the Customer Registry screen this pagination
  // was added for. Passing `limit` returns `{ items, nextCursor }` instead.
  async getSuperCustomers(query?: string, pageOpts: { cursor?: string; limit?: number; keysOnly?: boolean } = {}) {
    const { cursor, limit, keysOnly } = pageOpts;
    const whereClause: any = {};
    // Master Key Catalogue (KeysCatalogView) - see getCustomers()'s identical
    // filter for why a null keyNumber is excluded.
    if (keysOnly) {
      whereClause.keyNumber = { not: null };
    }
    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { shop: { name: { contains: query, mode: 'insensitive' } } },
        // Needed so App.jsx's checkDuplicateKey can search by the typed key
        // code server-side instead of fetching every customer on the
        // platform just to run a client-side exact-match check.
        { keyNumber: { contains: query, mode: 'insensitive' } },
      ];
    }
    const include = {
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' as const } },
      shop: { select: { name: true } },
      masterKey: { select: { category: true } },
    };

    if (!limit) {
      const customers = await this.tenantService.prisma.customer.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include,
      });
      return customers.map(c => this.decryptCustomerPII(c));
    }

    const rows = await this.tenantService.prisma.customer.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page.map(c => this.decryptCustomerPII(c)), nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // SUPER ADMIN: Update customer details (any shop)
  async updateSuperCustomer(id: string, dto: UpdateCustomerDto) {
    const customer = await this.tenantService.prisma.customer.findFirst({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException('Customer record not found');
    }

    if (dto.phone !== undefined) {
      const normalizedPhone = normalizePhone(dto.phone);
      if (!normalizedPhone) {
        throw new BadRequestException(PHONE_REGEX_MESSAGE);
      }
      dto.phone = normalizedPhone;
    }

    let encryptedIdNumber = undefined;
    if (dto.idProofNumber !== undefined && dto.idProofNumber !== null) {
      encryptedIdNumber = dto.idProofNumber ? this.cryptoService.encrypt(dto.idProofNumber) : null;
    }

    const updateData: any = {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      idProofType: dto.idProofType,
      reason: dto.reason,
      keyNumber: dto.keyNumber || null,
      keyType: dto.keyType || null,
      vehicleNumber: dto.vehicleNumber || null,
      masterKeyId: dto.masterKeyId || null,
      latitude: dto.latitude || null,
      longitude: dto.longitude || null,
      mapsLink: dto.mapsLink || null,
      capturedAddress: dto.capturedAddress || null,
      billAmount: dto.billAmount ?? null,
      vehicleName: dto.vehicleName || null,
      lostKey: dto.lostKey ?? false,
      addKey: dto.addKey ?? false,
      homeOfficeName: dto.homeOfficeName || null,
      vehicleCategory: dto.vehicleCategory || null,
    };
    if (encryptedIdNumber !== undefined) {
      updateData.idProofNumber = encryptedIdNumber;
    }

    if (dto.billAmount !== null && dto.billAmount !== undefined && (dto.billAmount as any) !== '' && !customer.billNumber) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      updateData.billNumber = `BILL-${dateStr}-${randomSuffix}`;
    }

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
