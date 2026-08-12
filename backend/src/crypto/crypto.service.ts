import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    // Falls back to a default key for development convenience if ENCRYPTION_KEY isn't
    // set. This key protects Customer.idProofNumber and Shop.aadhaarNumber - if this
    // fallback is ever actually in use in a real environment, that PII is only as safe
    // as this publicly-visible source file. Warn loudly rather than silently using it.
    if (!process.env.ENCRYPTION_KEY) {
      console.error('[SECURITY WARNING] ENCRYPTION_KEY is not set - falling back to a hardcoded, publicly-visible key. Set ENCRYPTION_KEY in this environment immediately.');
    }
    const hexKey = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'.substring(0, 64);
    this.key = Buffer.from(hexKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    }
  }

  encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      return encryptedText; // Fallback if not encrypted in expected format
    }
    try {
      const [ivHex, encrypted, tagHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('Decryption failed:', err.message);
      return '********'; // Fallback masked view on error
    }
  }
}
