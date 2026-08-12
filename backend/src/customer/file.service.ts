import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

@Injectable()
export class FileService implements OnModuleInit {
  private readonly uploadDir = path.join(process.cwd(), 'public', 'uploads');
  private supabase: SupabaseClient | null = null;
  private bucket = '';

  onModuleInit() {
    // Local-disk fallback dir. Always created so local dev / tests keep
    // working out of the box without any Supabase setup — only used when
    // Supabase Storage isn't configured.
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;

    if (supabaseUrl && serviceRoleKey && bucket) {
      // Service role key is required (not the anon key) because uploads/
      // deletes happen server-side and must bypass the bucket's RLS
      // policies — the bucket itself is private, files are only ever
      // reachable via short-lived signed URLs (see uploadFile below).
      this.supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      this.bucket = bucket;
      console.log(`FileService: using Supabase Storage bucket "${bucket}" for uploads.`);
    } else {
      console.log(
        'FileService: no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_STORAGE_BUCKET env vars set — using local disk for uploads. ' +
        'This is fine for local dev, but on ephemeral hosts (Render, Railway, Cloud Run) uploaded files are lost on every restart/redeploy.',
      );
    }
  }

  // expirySeconds defaults to 7 days, matching the original behavior for
  // one-off documents (ID proofs, shop licenses) that are typically viewed
  // shortly after upload and re-fetched/regenerated as needed. Callers
  // storing a URL that needs to stay valid indefinitely (e.g. a product
  // listing photo shown on every page load) should pass a much longer value
  // - see uploadLongLivedFile below - rather than relying on the short
  // default and having the image go dead a week later.
  async uploadFile(
    originalname: string,
    buffer: Buffer,
    shopId: string,
    expirySeconds = 60 * 60 * 24 * 7,
  ): Promise<{ fileUrl: string; fileKey: string }> {
    const fileExt = path.extname(originalname);
    const cleanShopId = shopId.replace(/[^a-zA-Z0-9]/g, '');
    const uniqueName = `${cleanShopId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${fileExt}`;

    if (this.supabase) {
      const contentType = CONTENT_TYPE_BY_EXT[fileExt.toLowerCase()] || 'application/octet-stream';
      const { error: uploadError } = await this.supabase.storage
        .from(this.bucket)
        .upload(uniqueName, buffer, { contentType, upsert: false });
      if (uploadError) {
        throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
      }

      // The bucket is private, so files are only ever served via a signed
      // URL rather than a public one - expirySeconds controls how long that
      // URL stays valid (see the parameter doc above).
      const safeName = (originalname || uniqueName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const { data: signedData, error: signError } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(uniqueName, expirySeconds, { download: safeName });
      if (signError || !signedData) {
        throw new Error(`Supabase Storage signing failed: ${signError?.message}`);
      }
      return { fileUrl: signedData.signedUrl, fileKey: uniqueName };
    }

    const filePath = path.join(this.uploadDir, uniqueName);
    await fs.promises.writeFile(filePath, buffer);
    const fileUrl = `/api/uploads/${uniqueName}`;
    return { fileUrl, fileKey: uniqueName };
  }

  // For assets that need to stay reachable indefinitely - marketplace
  // listing photos and banner ad images shown on every page load, not
  // one-off documents. 10 years is effectively permanent for this app's
  // purposes without requiring a second, publicly-readable bucket just to
  // avoid Supabase Storage's private-bucket signed-URL expiry.
  async uploadLongLivedFile(originalname: string, buffer: Buffer, namespace: string) {
    return this.uploadFile(originalname, buffer, namespace, 60 * 60 * 24 * 365 * 10);
  }

  // Re-signs a fresh, short-lived download URL for an already-uploaded file -
  // used by the customer report download link, which needs to stay valid
  // indefinitely (shared once via WhatsApp, possibly opened weeks later)
  // without ever handing out a long-lived signed URL up front. `downloadName`
  // becomes the browser's actual saved filename via Supabase's `download`
  // option, which is what makes the link auto-download instead of just
  // opening the PDF inline.
  async getSignedDownloadUrl(fileKey: string, downloadName: string, expirySeconds = 120): Promise<string> {
    const safeName = (downloadName || fileKey).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(fileKey, expirySeconds, { download: safeName });
      if (error || !data) {
        throw new Error(`Supabase Storage signing failed: ${error?.message}`);
      }
      return data.signedUrl;
    }
    // Local-disk fallback - already served with Content-Disposition:
    // attachment by the static /api/uploads handler in main.ts, though the
    // saved filename there is the stored fileKey rather than `downloadName`.
    return `/api/uploads/${fileKey}`;
  }

  async deleteFile(fileKey: string): Promise<void> {
    if (this.supabase) {
      const { error } = await this.supabase.storage.from(this.bucket).remove([fileKey]);
      // Supabase doesn't error on deleting an already-missing object, so no
      // not-found special-casing is needed here (unlike the old Firebase path).
      if (error) {
        console.warn(`FileService: Supabase Storage delete failed for "${fileKey}":`, error.message);
      }
      return;
    }

    const filePath = path.join(this.uploadDir, fileKey);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}
