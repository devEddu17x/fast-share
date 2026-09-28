import type { FileMetadata } from "../../types";

export interface RegisterFileParams {
  key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_type: "temporal" | "permanent";
  expires_at?: number | null;
  short_slug?: string | null;
}

/**
 * Registers newly uploaded file metadata in Cloudflare D1.
 */
export async function registerFileMetadata(
  db: D1Database,
  data: RegisterFileParams,
): Promise<FileMetadata> {
  const now = Date.now();
  const expiresAt =
    data.expires_at !== undefined ? data.expires_at : now + 24 * 3600 * 1000;

  await db
    .prepare(
      `INSERT INTO files_metadata (key, original_name, mime_type, size_bytes, storage_type, short_slug, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.key,
      data.original_name,
      data.mime_type,
      data.size_bytes,
      data.storage_type,
      data.short_slug || null,
      now,
      expiresAt,
    )
    .run();

  return {
    key: data.key,
    original_name: data.original_name,
    mime_type: data.mime_type,
    size_bytes: data.size_bytes,
    storage_type: data.storage_type,
    short_slug: data.short_slug || null,
    created_at: now,
    expires_at: expiresAt,
  };
}

/**
 * Retrieves file metadata by its storage key.
 */
export async function getFileMetadata(
  db: D1Database,
  key: string,
): Promise<FileMetadata | null> {
  const row = await db
    .prepare("SELECT * FROM files_metadata WHERE key = ?")
    .bind(key)
    .first<FileMetadata>();

  return row || null;
}

/**
 * Lists recently uploaded files (default: last 50).
 */
export async function listRecentFiles(
  db: D1Database,
  limit = 50,
): Promise<FileMetadata[]> {
  const { results } = await db
    .prepare("SELECT * FROM files_metadata ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<FileMetadata>();

  return results || [];
}

/**
 * Updates file metadata when promoted from temporal to permanent storage.
 */
export async function updateFilePromotion(
  db: D1Database,
  oldKey: string,
  newKey: string,
  shortSlug?: string | null,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE files_metadata 
       SET key = ?, storage_type = 'permanent', expires_at = NULL, short_slug = ?
       WHERE key = ?`,
    )
    .bind(newKey, shortSlug || null, oldKey)
    .run();

  return (res.meta.changes || 0) > 0;
}

/**
 * Deletes file metadata entry from D1.
 */
export async function deleteFileMetadata(
  db: D1Database,
  key: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM files_metadata WHERE key = ?")
    .bind(key)
    .run();

  return (res.meta.changes || 0) > 0;
}
