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

  async uploadFile(
    originalname: string,
    buffer: Buffer,
    shopId: string,
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
      // URL rather than a public one. 7 days (max allowed lifetime is much
      // longer, but this keeps stale links from lingering indefinitely) —
      // callers that need long-lived access re-fetch/regenerate as needed.
      const safeName = (originalname || uniqueName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const { data: signedData, error: signError } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(uniqueName, 60 * 60 * 24 * 7, { download: safeName });
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
