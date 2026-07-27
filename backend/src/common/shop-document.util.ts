import { FileService } from '../customer/file.service';
import { parseBase64DataUri } from './base64.util';

// Conventional ShopDocument.documentType values used across registration,
// provisioning, and Shop Settings uploads. documentType itself is a free-form
// string column (see schema.prisma) so new categories can be introduced
// without a migration - these are just the values the application currently
// understands.
export const SHOP_DOCUMENT_TYPES = {
  SHOP_PHOTO: 'SHOP_PHOTO',
  SHOP_LICENSE: 'SHOP_LICENSE',
  OWNER_AADHAAR: 'OWNER_AADHAAR',
  // Single unified document type used by the Shop Admin -> Shop Settings
  // upload UI. SHOP_PHOTO/SHOP_LICENSE/OWNER_AADHAAR are still written at
  // registration/provisioning time and remain readable, but are no longer
  // editable from Shop Settings, which now only manages this one document.
  VERIFICATION_DOCUMENT: 'VERIFICATION_DOCUMENT',
} as const;

export interface ShopDocumentInput {
  shopPhoto?: string;
  shopLicense?: string;
  ownerAadhaar?: string;
}

/**
 * Decodes any base64 shop documents supplied at shop-creation time (public
 * registration wizard or Super Admin "Provision Shop") and persists them as
 * real files + ShopDocument rows - the relational replacement for the legacy
 * Shop.companyDetails.{shopPhoto,shopLicense,ownerAadhaar} JSON fields.
 *
 * Intended to be called with a Prisma transaction client (`tx`) so document
 * rows are created atomically alongside the Shop/User/Subscription rows.
 * File-system writes themselves aren't part of the DB transaction (disk I/O
 * can't be rolled back), but that's an acceptable trade-off shared by every
 * upload-then-persist flow in this codebase (see CustomerService for the
 * same pattern with customer documents).
 */
export async function persistShopDocuments(
  fileService: FileService,
  tx: any,
  shopId: string,
  docs: ShopDocumentInput,
): Promise<void> {
  const entries: Array<[string, string | undefined]> = [
    [SHOP_DOCUMENT_TYPES.SHOP_PHOTO, docs.shopPhoto],
    [SHOP_DOCUMENT_TYPES.SHOP_LICENSE, docs.shopLicense],
    [SHOP_DOCUMENT_TYPES.OWNER_AADHAAR, docs.ownerAadhaar],
  ];

  for (const [documentType, value] of entries) {
    const parsed = parseBase64DataUri(value);
    if (!parsed) continue; // not provided, or not a valid base64 data URI

    const originalName = `${documentType.toLowerCase()}${parsed.ext}`;
    const upload = await fileService.uploadFile(originalName, parsed.buffer, shopId);

    await tx.shopDocument.create({
      data: {
        shopId,
        documentType,
        fileUrl: upload.fileUrl,
        fileKey: upload.fileKey,
        fileSize: parsed.buffer.length,
        originalName,
      },
    });
  }
}
