// Ambiguity-free alphanumeric character set for generated slugs
const SLUG_CHARS = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a cryptographically secure random slug.
 */
export function generateRandomSlug(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  }
  return result;
}

/**
 * Validates custom slug format (alphanumeric, dashes, underscores, 2-64 chars).
 */
export function isValidCustomSlug(slug: string): boolean {
  return /^[a-z0-9-_]{2,64}$/.test(slug);
}
