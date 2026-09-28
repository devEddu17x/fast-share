import type { Env } from "../types";
import { streamR2Object } from "../core/storage/r2";

/**
 * Handles incoming file streaming requests for temporal and permanent subdomains.
 */
export async function handleStorageStream(
  request: Request,
  env: Env,
  storageType: "temporal" | "permanent",
): Promise<Response> {
  const url = new URL(request.url);
  const isDownload =
    url.searchParams.has("download") || url.searchParams.has("dl");

  // Extract path and clean leading/trailing slashes
  let relativeKey = url.pathname.replace(/^\/+|\/+$/g, "");

  // Strip prefix if route included /temporal/ or /permanent/
  if (relativeKey.startsWith(`${storageType}/`)) {
    relativeKey = relativeKey.replace(new RegExp(`^${storageType}/`), "");
  }

  if (!relativeKey) {
    return new Response("File key is required", { status: 400 });
  }

  const fullKey = `${storageType}/${relativeKey}`;
  return streamR2Object(env, fullKey, storageType, isDownload);
}
