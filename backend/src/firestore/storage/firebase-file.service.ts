import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// File storage on Firebase Storage (a Cloud Storage bucket) for ad images, customer documents, shop documents
// and promotion images: a private bucket, signed URLs with a caller-chosen expiry, and service-account-level
// access through the Admin SDK that bypasses any bucket ACL.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

@Injectable()
export class FirebaseFileService {
  private get bucket() {
    const app = getApps().find((a) => a.name === 'kee-admin');
    if (!app) throw new Error('Firebase admin app not initialized - see FirestoreService');
    // GCF_STORAGE_BUCKET is the deployed-Cloud-Function fallback name -
    // FIREBASE_-prefixed env vars are reserved there (see
    // firebase-auth.service.ts's identical GCF_WEB_API_KEY pattern).
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GCF_STORAGE_BUCKET;
    return bucketName ? getStorage(app).bucket(bucketName) : getStorage(app).bucket();
  }

  async uploadFile(
    originalname: string,
    buffer: Buffer,
    shopId: string,
    expirySeconds = 60 * 60 * 24 * 7,
  ): Promise<{ fileUrl: string; fileKey: string }> {
    const fileExt = path.extname(originalname);
    const cleanShopId = shopId.replace(/[^a-zA-Z0-9]/g, '');
    const uniqueName = `${cleanShopId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const contentType = CONTENT_TYPE_BY_EXT[fileExt.toLowerCase()] || 'application/octet-stream';
    const safeName = (originalname || uniqueName).replace(/[^a-zA-Z0-9._-]/g, '_');

    const file = this.bucket.file(uniqueName);
    await file.save(buffer, {
      contentType,
      metadata: { contentDisposition: `attachment; filename="${safeName}"` },
    });

    const [fileUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expirySeconds * 1000,
    });
    return { fileUrl, fileKey: uniqueName };
  }

  async uploadLongLivedFile(originalname: string, buffer: Buffer, namespace: string) {
    return this.uploadFile(originalname, buffer, namespace, 60 * 60 * 24 * 365 * 10);
  }

  async downloadFileBuffer(fileKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    const fileExt = path.extname(fileKey);
    const contentType = CONTENT_TYPE_BY_EXT[fileExt.toLowerCase()] || 'application/octet-stream';
    const [buffer] = await this.bucket.file(fileKey).download();
    return { buffer, contentType };
  }

  async deleteFile(fileKey: string): Promise<void> {
    try {
      await this.bucket.file(fileKey).delete();
    } catch (err: any) {
      // Deleting an already-missing object is a no-op, not an error - Cloud
      // Storage's Node client throws a 404, so that specific case is swallowed
      // to keep the fail-soft contract callers rely on.
      if (err.code !== 404) {
        console.warn(`FirebaseFileService: delete failed for "${fileKey}":`, err.message);
      }
    }
  }
}
