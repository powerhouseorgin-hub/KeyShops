import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// File storage on Firebase Storage (a Cloud Storage bucket) for ad images, customer documents, shop documents,
// promotion images and vehicle-sale photos. The bucket is private (storage.rules deny all client access) and the
// backend reads and writes it through the Admin SDK.
//
// A file's URL is a Firebase "download token" link (https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<key>
// ?alt=media&token=<token>): a random token is stored in the object's metadata at upload time and the link works
// for whoever holds it, until the object is deleted. This is used instead of V4 signed URLs because signing needs
// the iam.serviceAccounts.signBlob permission, which the Cloud Functions runtime account does not have - every
// upload would fail with "Permission 'iam.serviceAccounts.signBlob' denied" - whereas a token link needs no signing.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

// Exported for tests. Against the Storage emulator the link points at the emulator instead.
export function downloadUrl(bucketName: string, fileKey: string, token: string): string {
  const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const origin = emulator ? `http://${emulator}` : 'https://firebasestorage.googleapis.com';
  return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(fileKey)}?alt=media&token=${token}`;
}

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
    _expirySeconds?: number, // kept for the existing call sites; a token link does not expire
  ): Promise<{ fileUrl: string; fileKey: string }> {
    const fileExt = path.extname(originalname);
    const cleanShopId = shopId.replace(/[^a-zA-Z0-9]/g, '');
    const uniqueName = `${cleanShopId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const contentType = CONTENT_TYPE_BY_EXT[fileExt.toLowerCase()] || 'application/octet-stream';
    const safeName = (originalname || uniqueName).replace(/[^a-zA-Z0-9._-]/g, '_');

    const token = randomUUID();
    const bucket = this.bucket;
    await bucket.file(uniqueName).save(buffer, {
      contentType,
      metadata: {
        contentDisposition: `attachment; filename="${safeName}"`,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    return { fileUrl: downloadUrl(bucket.name, uniqueName, token), fileKey: uniqueName };
  }

  // Same as uploadFile; the name is kept because the call sites that want a link that never lapses use it.
  async uploadLongLivedFile(originalname: string, buffer: Buffer, namespace: string) {
    return this.uploadFile(originalname, buffer, namespace);
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
