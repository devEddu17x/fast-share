import type { ShortLink } from "../../types";
import { generateRandomSlug, isValidCustomSlug } from "../utils/slug";
import { isValidHttpUrl } from "../utils/url";

export interface CreateLinkParams {
  destination_url: string;
  slug?: string;
  target_type?: "url" | "file";
  file_key?: string;
  expires_at?: number | null;
}

export interface CreateLinkResult {
  success: boolean;
  link?: ShortLink;
  error?: string;
}

/**
 * Creates a new short link entry in Cloudflare D1.
 */
export async function createShortLink(
  db: D1Database,
  data: CreateLinkParams,
): Promise<CreateLinkResult> {
  if (!data.destination_url || !isValidHttpUrl(data.destination_url)) {
    return {
      success: false,
      error: "Invalid destination URL. Must start with http:// or https://",
    };
  }

  let finalSlug = data.slug ? data.slug.trim().toLowerCase() : "";

  if (finalSlug) {
    if (!isValidCustomSlug(finalSlug)) {
      return {
        success: false,
        error:
          "Slug must contain only alphanumeric characters, dashes, and underscores (2-64 chars)",
      };
    }

    const existing = await db
      .prepare("SELECT id FROM short_links WHERE slug = ?")
      .bind(finalSlug)
      .first();

    if (existing) {
      return { success: false, error: "Custom alias is already in use" };
    }
  } else {
    // Generate unique random slug
    let attempts = 0;
    while (attempts < 5) {
      const candidate = generateRandomSlug(5);
      const existing = await db
        .prepare("SELECT id FROM short_links WHERE slug = ?")
        .bind(candidate)
        .first();

      if (!existing) {
        finalSlug = candidate;
        break;
      }
      attempts++;
    }

    if (!finalSlug) {
      finalSlug = generateRandomSlug(8);
    }
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const targetType = data.target_type || "url";
  const fileKey = data.file_key || null;
  const expiresAt = data.expires_at || null;

  await db
    .prepare(
      `INSERT INTO short_links (id, slug, destination_url, target_type, file_key, created_at, expires_at, clicks_count, last_clicked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    )
    .bind(
      id,
      finalSlug,
      data.destination_url,
      targetType,
      fileKey,
      now,
      expiresAt,
    )
    .run();

  const createdLink: ShortLink = {
    id,
    slug: finalSlug,
    destination_url: data.destination_url,
    target_type: targetType,
    file_key: fileKey,
    created_at: now,
    expires_at: expiresAt,
    clicks_count: 0,
    last_clicked_at: null,
  };

  return { success: true, link: createdLink };
}

/**
 * Retrieves a short link by slug.
 */
export async function getShortLinkBySlug(
  db: D1Database,
  slug: string,
): Promise<ShortLink | null> {
  const row = await db
    .prepare("SELECT * FROM short_links WHERE slug = ?")
    .bind(slug.trim().toLowerCase())
    .first<ShortLink>();

  return row || null;
}

/**
 * Atomically increments the click counter and updates last_clicked_at timestamp.
 */
export async function recordLinkClick(
  db: D1Database,
  id: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      "UPDATE short_links SET clicks_count = clicks_count + 1, last_clicked_at = ? WHERE id = ?",
    )
    .bind(now, id)
    .run();
}

/**
 * Lists the most recently created short links.
 */
export async function listShortLinks(
  db: D1Database,
  limit = 50,
): Promise<ShortLink[]> {
  const { results } = await db
    .prepare("SELECT * FROM short_links ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<ShortLink>();

  return results || [];
}

/**
 * Deletes a short link by its ID.
 */
export async function deleteShortLink(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM short_links WHERE id = ?")
    .bind(id)
    .run();
  return (res.meta.changes || 0) > 0;
}
