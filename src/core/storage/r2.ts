import type { Env, FileMetadata } from "../../types";
import { getFileMetadata, updateFilePromotion } from "../db";
import { createShortLink } from "../db/links";
import { resolveContentType } from "./mime";
import { buildServiceUrl } from "../utils/url";

/**
 * Sanitizes an uploaded filename to prevent directory traversal or malformed HTTP headers.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

/**
 * Generates an R2 object key with standard prefix.
 */
export function generateObjectKey(
  prefix: "temporal" | "permanent",
  originalName: string,
): string {
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const cleanName = sanitizeFilename(originalName) || "file.bin";
  return `${prefix}/${uniqueId}_${cleanName}`;
}

/**
 * Streams an R2 object directly to the client with native browser viewer headers.
 */
export async function streamR2Object(
  env: Env,
  key: string,
  storageType: "temporal" | "permanent",
  isDownload = false,
): Promise<Response> {
  const object = await env.STORAGE.get(key);

  if (!object) {
    const hubUrl = buildServiceUrl("share", "", env);
    return new Response(renderFileNotFoundHtml(key, hubUrl), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Lookup metadata to get the original filename
  const meta = await getFileMetadata(env.DB, key);
  const filename = meta?.original_name || key.split("/").pop() || "file";
  const rawType = object.httpMetadata?.contentType || meta?.mime_type;
  const contentType = resolveContentType(filename, rawType);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", contentType);

  const dispositionType = isDownload ? "attachment" : "inline";
  headers.set(
    "Content-Disposition",
    `${dispositionType}; filename="${encodeURIComponent(filename)}"`,
  );
  headers.set(
    "Cache-Control",
    storageType === "permanent"
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  );
  headers.set("etag", object.httpEtag);

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

/**
 * Promotes a temporary file to permanent storage and optionally assigns a short link alias.
 */
export async function promoteFile(
  env: Env,
  oldKey: string,
  customSlug?: string,
): Promise<{
  success: boolean;
  metadata?: FileMetadata;
  short_url?: string;
  error?: string;
}> {
  // 1. Verify file exists in metadata
  const meta = await getFileMetadata(env.DB, oldKey);
  if (!meta) {
    return { success: false, error: "File not found in registry" };
  }

  if (meta.storage_type === "permanent") {
    return { success: false, error: "File is already permanent" };
  }

  // 2. Fetch object from R2
  const oldObject = await env.STORAGE.get(oldKey);
  if (!oldObject) {
    return { success: false, error: "File object not found in R2 storage" };
  }

  // 3. Create new permanent key and copy object
  const filename = oldKey.replace(/^temporal\//, "");
  const newKey = `permanent/${filename}`;

  await env.STORAGE.put(newKey, oldObject.body, {
    httpMetadata: oldObject.httpMetadata,
    customMetadata: oldObject.customMetadata,
  });

  // 4. Delete old temporary object
  await env.STORAGE.delete(oldKey);

  // 5. Update D1 database metadata
  let shortUrl: string | undefined;
  let finalSlug: string | null = null;

  if (customSlug || customSlug === "") {
    // Construct destination URL for the permanent object
    const destinationUrl = buildServiceUrl("permanent", newKey, env);
    const linkResult = await createShortLink(env.DB, {
      destination_url: destinationUrl,
      slug: customSlug || undefined,
      target_type: "file",
      file_key: newKey,
    });

    if (linkResult.success && linkResult.link) {
      finalSlug = linkResult.link.slug;
      shortUrl = buildServiceUrl("link", linkResult.link.slug, env);
    }
  }

  await updateFilePromotion(env.DB, oldKey, newKey, finalSlug);

  const updatedMeta: FileMetadata = {
    ...meta,
    key: newKey,
    storage_type: "permanent",
    expires_at: null,
    short_slug: finalSlug,
  };

  return {
    success: true,
    metadata: updatedMeta,
    short_url: shortUrl,
  };
}

function renderFileNotFoundHtml(key: string, hubUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archivo no encontrado | Fast Share</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #ededed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .box { max-width: 420px; padding: 2rem; border-radius: 1rem; background: #141414; border: 1px solid #262626; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f87171; }
    p { font-size: 0.95rem; color: #a3a3a3; margin-bottom: 1.5rem; }
    code { background: #262626; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.9rem; color: #fbbf24; }
    a { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>404 • Archivo no encontrado</h1>
    <p>El archivo solicitado ha expirado o no existe en el almacenamiento.</p>
    <a href="${hubUrl}">Ir a Fast Share</a>
  </div>
</body>
</html>`;
}
