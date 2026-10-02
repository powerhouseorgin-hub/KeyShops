// Copies only the listed keys (and only when actually present on the object) so a
// client-supplied request body can never write fields the endpoint was not meant
// to touch. The Firestore controllers' DTOs are plain TypeScript interfaces (no
// class-validator decorators), so Nest's ValidationPipe cannot strip unknown
// properties for them - without this, `{ ...dto }` straight into a Firestore
// update lets a caller set any field on the document (e.g. a shop's
// referralPoints/categoryId/isActive, or a promotion's shopId/createdById).
export function pick<T extends object, K extends keyof T & string>(source: T | null | undefined, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && (source as any)[key] !== undefined) {
      out[key] = (source as any)[key];
    }
  }
  return out;
}
