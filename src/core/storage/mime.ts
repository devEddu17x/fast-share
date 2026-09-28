/**
 * MIME type resolution and charset utilities for R2 file streaming and downloads.
 */

const EXTENSION_MIME_MAP: Record<string, string> = {
  // Text and documentation formats (always UTF-8)
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  text: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  yaml: "text/yaml; charset=utf-8",
  yml: "text/yaml; charset=utf-8",
  svg: "image/svg+xml; charset=utf-8",

  // Programming languages (served as text/plain with UTF-8 for inline reading)
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  tsx: "text/plain; charset=utf-8",
  jsx: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  bash: "text/plain; charset=utf-8",
  sql: "text/plain; charset=utf-8",
  rs: "text/plain; charset=utf-8",
  go: "text/plain; charset=utf-8",

  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",

  // Media
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",

  // Archives
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
};

/**
 * Resolves the appropriate Content-Type header value for a given file name and raw MIME type.
 * Automatically appends '; charset=utf-8' for text and readable formats to prevent mojibake.
 */
export function resolveContentType(
  filename: string,
  rawMimeType?: string | null,
): string {
  let resolved =
    rawMimeType && rawMimeType !== "application/octet-stream"
      ? rawMimeType.trim()
      : "";

  // Infer from filename extension if raw MIME type is absent or generic
  if (!resolved) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    resolved = EXTENSION_MIME_MAP[ext] || "application/octet-stream";
  }

  // Ensure UTF-8 charset on text and code-related types
  const lower = resolved.toLowerCase();
  const isTextLike =
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("xml") ||
    lower.includes("yaml") ||
    lower.includes("javascript");

  if (isTextLike && !lower.includes("charset")) {
    return `${resolved}; charset=utf-8`;
  }

  return resolved;
}
