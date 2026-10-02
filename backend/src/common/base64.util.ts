// Shared helper for decoding base64 data-URI uploads (used by the registration
// wizard and the Super Admin "Provision Shop" flow). Kept dependency-free so it can run both inside Nest
// services and inside standalone ts-node scripts.

export interface ParsedDataUri {
  buffer: Buffer;
  ext: string;
  mimeType: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/**
 * Parses a `data:<mime>;base64,<payload>` string into a Buffer + inferred
 * file extension. Returns null if the input isn't a valid base64 data URI
 * (e.g. it's already a plain URL, or empty).
 */
export function parseBase64DataUri(dataUri: unknown): ParsedDataUri | null {
  if (!dataUri || typeof dataUri !== 'string') return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri.trim());
  if (!match) return null;

  const mimeType = match[1];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (!buffer.length) return null;

  const ext = EXT_BY_MIME[mimeType] || '';
  return { buffer, ext, mimeType };
}
