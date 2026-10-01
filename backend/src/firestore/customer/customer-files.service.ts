import { Injectable, NotFoundException } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { ShopRepository } from '../shop/shop.repository';
import { FirebaseFileService } from '../storage/firebase-file.service';
import { WhatsappInvoiceService } from '../whatsapp-invoice.service';

// The backend's own base URL, used to build the absolute document link a
// WhatsApp template's document header needs (Meta's servers fetch it
// directly, so it can never be a relative path) - see
// WhatsappInvoiceService's doc comment. Defaults to the local bootstrap
// server's own port for dev; set to the real Cloud Run URL once deployed.
const PUBLIC_API_BASE_URL = process.env.PUBLIC_API_BASE_URL || 'http://localhost:4100';

// Firestore port of CustomerService's document/report methods.
// CustomerDocument -> shops/{shopId}/customers/{customerId}/documents/{id}
// (always accessed via shop+customer context, a clean nested fit).
// CustomerReport -> top-level customerReports/{id} collection - see the
// note where this was decided: getReportFile is a PUBLIC, unauthenticated
// lookup by report ID alone (the ID doubles as an unguessable public share
// token - see the original schema comment), which a nested subcollection
// path can't support without already knowing the shop/customer.
@Injectable()
export class CustomerFilesService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly shops: ShopRepository,
    private readonly fileService: FirebaseFileService,
    private readonly whatsappInvoice: WhatsappInvoiceService,
  ) {}

  private customerDoc(shopId: string, customerId: string) {
    return this.shops.customers(shopId).doc(customerId);
  }

  private documents(shopId: string, customerId: string) {
    return this.customerDoc(shopId, customerId).collection('documents');
  }

  private reports() {
    return this.firestore.db.collection('customerReports');
  }

  async addCustomerDocument(shopId: string, customerId: string, actorUserId: string, documentType: string, file: { originalname: string; buffer: Buffer; size: number }) {
    const customerSnap = await this.customerDoc(shopId, customerId).get();
    if (!customerSnap.exists) throw new NotFoundException('Customer record not found');

    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);
    const now = Date.now();
    const data = {
      documentType,
      fileUrl: upload.fileUrl,
      fileKey: upload.fileKey,
      fileSize: file.size,
      originalName: file.originalname || null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await this.documents(shopId, customerId).add(data);

    await this.firestore.db.collection('activityLogs').add({
      shopId,
      userId: actorUserId,
      action: 'DOC_UPLOAD',
      details: JSON.stringify({ customerId, documentId: ref.id, filename: file.originalname }),
      ipAddress: null,
      createdAt: now,
    });

    return { id: ref.id, ...data };
  }

  // Cross-shop variant - resolves the customer's shopId first, via a
  // collectionGroup lookup by document ID (Customer legitimately needs
  // cross-shop addressing for Super Admin, per the migration plan).
  async addCustomerDocumentSuper(customerId: string, actorUserId: string, documentType: string, file: { originalname: string; buffer: Buffer; size: number }) {
    const shopId = await this.findCustomerShopId(customerId);
    if (!shopId) throw new NotFoundException('Customer record not found');
    return this.addCustomerDocument(shopId, customerId, actorUserId, documentType, file);
  }

  async createCustomerReport(shopId: string, customerId: string, fileName: string, file: { originalname: string; buffer: Buffer }) {
    const customerSnap = await this.customerDoc(shopId, customerId).get();
    if (!customerSnap.exists) throw new NotFoundException('Customer record not found');

    const upload = await this.fileService.uploadFile(file.originalname, file.buffer, shopId);
    const data = { customerId, shopId, fileKey: upload.fileKey, fileName, createdAt: Date.now() };
    const ref = await this.reports().add(data);
    return { id: ref.id };
  }

  async createCustomerReportSuper(customerId: string, fileName: string, file: { originalname: string; buffer: Buffer }) {
    const shopId = await this.findCustomerShopId(customerId);
    if (!shopId) throw new NotFoundException('Customer record not found');
    return this.createCustomerReport(shopId, customerId, fileName, file);
  }

  // Sends a previously-uploaded CustomerReport (used here for the customer-
  // facing service invoice, not the Shop Admin's own verification report -
  // see customerInvoicePdf.js) to the customer's own WhatsApp number,
  // automatically, right after registration. `reportId` must be one this
  // customer actually owns - never trust a client-supplied arbitrary
  // document link out to WhatsApp. Fails soft (see WhatsappInvoiceService)
  // so a delivery hiccup never blocks the registration flow that triggered it.
  async sendCustomerInvoice(shopId: string, customerId: string, reportId: string) {
    const [customerSnap, shopSnap, reportSnap] = await Promise.all([
      this.customerDoc(shopId, customerId).get(),
      this.firestore.db.collection('shops').doc(shopId).get(),
      this.reports().doc(reportId).get(),
    ]);
    if (!customerSnap.exists) throw new NotFoundException('Customer record not found');
    if (!reportSnap.exists || (reportSnap.data() as any).customerId !== customerId) {
      throw new NotFoundException('Invoice document not found for this customer');
    }

    const customer = customerSnap.data() as any;
    const shop = shopSnap.data() as any;
    const report = reportSnap.data() as any;
    const documentUrl = `${PUBLIC_API_BASE_URL}/api/public/reports/${reportId}/download`;

    return this.whatsappInvoice.sendInvoiceDocument({
      phone: customer.phone,
      customerName: customer.name,
      shopName: shop?.name || 'Key Shops',
      documentUrl,
      fileName: report.fileName || 'Invoice.pdf',
    });
  }

  async sendCustomerInvoiceSuper(customerId: string, reportId: string) {
    const shopId = await this.findCustomerShopId(customerId);
    if (!shopId) throw new NotFoundException('Customer record not found');
    return this.sendCustomerInvoice(shopId, customerId, reportId);
  }

  async getReportFile(reportId: string) {
    const doc = await this.reports().doc(reportId).get();
    if (!doc.exists) throw new NotFoundException('Report not found');
    const report = doc.data() as any;
    const { buffer, contentType } = await this.fileService.downloadFileBuffer(report.fileKey);
    return { buffer, contentType, fileName: report.fileName };
  }

  async deleteCustomerDocument(shopId: string, customerId: string, actorUserId: string, documentId: string) {
    const customerSnap = await this.customerDoc(shopId, customerId).get();
    if (!customerSnap.exists) throw new NotFoundException('Customer record not found');

    const docRef = this.documents(shopId, customerId).doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException('Document not found');

    // Soft delete - matches the original's deletedAt convention (file
    // retention is a separate housekeeping concern, unchanged here).
    await docRef.update({ deletedAt: Date.now() });

    await this.firestore.db.collection('activityLogs').add({
      shopId,
      userId: actorUserId,
      action: 'DOC_DELETE',
      details: JSON.stringify({ customerId, documentId }),
      ipAddress: null,
      createdAt: Date.now(),
    });
  }

  // Firestore's collectionGroup queries can't filter by documentId() without
  // already knowing the full parent path, so a customerId alone can't be
  // resolved to its shopId by querying 'customers' directly. Resolved via
  // the customerShopIndex lookup collection written at creation time - see
  // customer-registration.service.ts.
  private async findCustomerShopId(customerId: string): Promise<string | null> {
    const doc = await this.firestore.db.collection('customerShopIndex').doc(customerId).get();
    return doc.exists ? (doc.data() as any).shopId : null;
  }
}
