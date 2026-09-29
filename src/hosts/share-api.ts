import { Hono, type Context } from "hono";
import type { Env } from "../types";
import {
  createShortLink,
  listShortLinks,
  listRecentFiles,
  registerFileMetadata,
  listRoomMessages,
  saveRoomMessage,
} from "../core/db";
import { generateObjectKey, promoteFile } from "../core/storage/r2";
import { resolveContentType } from "../core/storage/mime";
import { broadcastToRoom } from "../core/broadcast";
import { sendTelegramMessage } from "../core/telegram/client";
import { escapeHtml, formatBytes } from "../core/telegram/format";
import {
  buildServiceUrl,
  getBaseDomain,
  isValidHttpUrl,
} from "../core/utils/url";
import { isValidCustomSlug } from "../core/utils/slug";
import { rateLimiter } from "../core/rate-limit";

export const shareApi = new Hono<{ Bindings: Env }>();

function getClientIdentifiers(c: Context<{ Bindings: Env }>) {
  const deviceId = c.req.header("x-device-id") || null;
  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    "127.0.0.1";
  return { deviceId, ip };
}

// -------------------------------------------------------------
// SHORTENER ROUTES
// -------------------------------------------------------------

// List recently created short links
shareApi.get("/links", async (c) => {
  const links = await listShortLinks(c.env.DB, 50);
  return c.json({
    success: true,
    links: links.map((link) => ({
      ...link,
      short_url: buildServiceUrl("link", link.slug, c.env, c.req.url),
    })),
  });
});

// Create a new short link
shareApi.post("/links", async (c) => {
  try {
    const body = await c.req.json<{
      url?: string;
      slug?: string;
      expires_in_hours?: number;
    }>();

    const { deviceId, ip } = getClientIdentifiers(c);
    const rateCheck = rateLimiter.check("links", deviceId, ip);
    if (!rateCheck.allowed) {
      return c.json({ success: false, error: rateCheck.error }, 429, {
        "Retry-After": String(rateCheck.retryAfterSeconds),
      });
    }

    if (!body || !body.url || typeof body.url !== "string") {
      return c.json(
        { success: false, error: "Destination URL is required" },
        400,
      );
    }

    const trimmedUrl = body.url.trim();

    // Reject URLs longer than 2048 characters
    if (trimmedUrl.length > 2048) {
      return c.json(
        {
          success: false,
          error: "Destination URL exceeds maximum length of 2048 characters",
        },
        400,
      );
    }

    // Validate URL protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return c.json(
        {
          success: false,
          error: "Invalid destination URL. Must start with http:// or https://",
        },
        400,
      );
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return c.json(
        {
          success: false,
          error: "Only http:// and https:// URLs are allowed",
        },
        400,
      );
    }

    // Anti-Self-Chaining & Loop Protection
    const baseDomain = getBaseDomain(c.env, c.req.url);
    const shortenerHost = `link.${baseDomain}`.toLowerCase();
    const targetHost = parsedUrl.hostname.toLowerCase();

    const isShortenerHost =
      targetHost === shortenerHost ||
      ((baseDomain.includes("localhost") || baseDomain.includes("127.0.0.1")) &&
        parsedUrl.pathname.startsWith("/r"));

    if (isShortenerHost) {
      return c.json(
        {
          success: false,
          error:
            "Self-referencing short links or chaining shorteners is not allowed",
        },
        400,
      );
    }

    // SSRF / Loopback protection in non-local environments
    if (
      !baseDomain.includes("localhost") &&
      !baseDomain.includes("127.0.0.1")
    ) {
      if (
        targetHost === "localhost" ||
        targetHost === "127.0.0.1" ||
        targetHost === "0.0.0.0" ||
        targetHost.endsWith(".localhost")
      ) {
        return c.json(
          {
            success: false,
            error: "Localhost and loopback destinations are not allowed",
          },
          400,
        );
      }
    }

    // Validate custom slug if provided
    if (body.slug) {
      const cleanSlug = body.slug.trim().toLowerCase();
      if (!isValidCustomSlug(cleanSlug)) {
        return c.json(
          {
            success: false,
            error:
              "Slug must contain only alphanumeric characters, dashes, and underscores (1-64 chars)",
          },
          400,
        );
      }
    }

    let expiresAt: number | null = null;
    if (body.expires_in_hours && body.expires_in_hours > 0) {
      expiresAt = Date.now() + body.expires_in_hours * 3600 * 1000;
    }

    const result = await createShortLink(c.env.DB, {
      destination_url: trimmedUrl,
      slug: body.slug,
      expires_at: expiresAt,
    });

    if (!result.success || !result.link) {
      return c.json(
        {
          success: false,
          error: result.error || "Failed to create short link",
        },
        400,
      );
    }

    const createdLink = {
      ...result.link,
      short_url: buildServiceUrl("link", result.link.slug, c.env, c.req.url),
    };

    // Save activity log message into room
    const roomMsg = await saveRoomMessage(c.env.DB, {
      content: JSON.stringify({
        slug: result.link.slug,
        short_url: createdLink.short_url,
        destination_url: result.link.destination_url,
      }),
      format: "url",
      sender_type: "web",
    });

    // Broadcast new link and activity message to room
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "new_message",
        data: roomMsg,
      }),
    );
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "link_created",
        data: createdLink,
      }),
    );

    return c.json({ success: true, link: createdLink }, 201);
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Invalid request payload" },
      400,
    );
  }
});

// -------------------------------------------------------------
// ROOM MESSAGES & SNIPPETS (24H RETENTION)
// -------------------------------------------------------------

// List messages from the last 24 hours
shareApi.get("/messages", async (c) => {
  const messages = await listRoomMessages(c.env.DB, 100);
  return c.json({
    success: true,
    messages,
  });
});

// Post a new message or code snippet
shareApi.post("/messages", async (c) => {
  try {
    const { deviceId, ip } = getClientIdentifiers(c);
    const rateCheck = rateLimiter.check("messages", deviceId, ip);
    if (!rateCheck.allowed) {
      return c.json({ success: false, error: rateCheck.error }, 429, {
        "Retry-After": String(rateCheck.retryAfterSeconds),
      });
    }

    const body = await c.req.json<{
      content?: string;
      format?: "text" | "code" | "url";
    }>();

    if (!body || !body.content || !body.content.trim()) {
      return c.json({ success: false, error: "Content is required" }, 400);
    }

    const trimmedContent = body.content.trim();
    const format = body.format || "text";
    const MAX_LENGTH = format === "code" ? 65536 : 8192; // 64 KB code, 8 KB plain text

    if (trimmedContent.length > MAX_LENGTH) {
      return c.json(
        {
          success: false,
          error:
            format === "code"
              ? "Code snippet exceeds maximum length of 64 KB. Please upload as a file instead."
              : "Plain text note exceeds maximum length of 8 KB (8,192 chars). Switch to Code mode or upload as a file.",
        },
        400,
      );
    }

    const message = await saveRoomMessage(c.env.DB, {
      content: trimmedContent,
      format: body.format || "text",
      sender_type: "web",
    });

    // Broadcast message to all active WebSockets
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "new_message",
        data: message,
      }),
    );

    // Forward message to Telegram bot if credentials are configured
    if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_ADMIN_ID) {
      const text =
        body.format === "code"
          ? `💻 <b>Web Room Code Snippet</b>\n\n<pre><code>${escapeHtml(body.content.trim())}</code></pre>`
          : `💬 <b>Web Room Message</b>\n\n${escapeHtml(body.content.trim())}`;

      c.executionCtx.waitUntil(
        sendTelegramMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          c.env.TELEGRAM_ADMIN_ID,
          text,
          { parse_mode: "HTML" },
        ),
      );
    }

    return c.json({ success: true, message }, 201);
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Failed to send message" },
      400,
    );
  }
});

// -------------------------------------------------------------
// FILE STORAGE ROUTES (R2)
// -------------------------------------------------------------

// List recently uploaded files
shareApi.get("/files", async (c) => {
  const files = await listRecentFiles(c.env.DB, 50);
  return c.json({
    success: true,
    files: files.map((f) => ({
      ...f,
      view_url: buildServiceUrl(
        f.storage_type,
        f.key.replace(/^(permanent|temporal)\//, ""),
        c.env,
        c.req.url,
      ),
    })),
  });
});

// Upload a file to R2 (temporal storage by default)
const handleFileUpload = async (c: Context<{ Bindings: Env }>) => {
  try {
    const { deviceId, ip } = getClientIdentifiers(c);
    const rateCheck = rateLimiter.check("files", deviceId, ip);
    if (!rateCheck.allowed) {
      return c.json({ success: false, error: rateCheck.error }, 429, {
        "Retry-After": String(rateCheck.retryAfterSeconds),
      });
    }

    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return c.json({ success: false, error: "File is required" }, 400);
    }

    const fileObj = file as File;
    const originalName = fileObj.name || "unnamed-file";
    const mimeType = resolveContentType(originalName, fileObj.type);
    const sizeBytes = fileObj.size;

    // Check 500 MB maximum size limit
    const MAX_FILE_SIZE = 500 * 1024 * 1024;
    if (sizeBytes > MAX_FILE_SIZE) {
      return c.json(
        { success: false, error: "File size exceeds maximum 500 MB limit" },
        400,
      );
    }

    // Generate unique storage key under temporal/
    const storageKey = generateObjectKey("temporal", originalName);

    // Save directly to R2 bucket
    await c.env.STORAGE.put(storageKey, fileObj.stream(), {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        originalName,
      },
    });

    // Register metadata in D1
    const metadata = await registerFileMetadata(c.env.DB, {
      key: storageKey,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      storage_type: "temporal",
    });

    const relativePath = storageKey.replace(/^temporal\//, "");
    const fileResponse = {
      ...metadata,
      view_url: buildServiceUrl("temporal", relativePath, c.env, c.req.url),
    };

    // Save activity log message into room
    const roomMsg = await saveRoomMessage(c.env.DB, {
      content: JSON.stringify({
        name: originalName,
        size_bytes: sizeBytes,
        mime_type: mimeType,
        url: fileResponse.view_url,
        storage_type: "temporal",
        key: storageKey,
      }),
      format: "file",
      sender_type: "web",
    });

    // Broadcast file drop and activity message to room
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "new_message",
        data: roomMsg,
      }),
    );
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "file_uploaded",
        data: fileResponse,
      }),
    );

    // Forward file upload event to Telegram
    if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_ADMIN_ID) {
      const formattedSize = formatBytes(sizeBytes);
      const text =
        `📎 <b>New file dropped from Web!</b>\n\n` +
        `• <b>Name:</b> <code>${escapeHtml(originalName)}</code>\n` +
        `• <b>Size:</b> ${formattedSize}\n` +
        `• <b>View URL:</b> ${fileResponse.view_url}\n\n` +
        `<i>(Expires in 24h unless promoted to permanent)</i>`;

      c.executionCtx.waitUntil(
        sendTelegramMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          c.env.TELEGRAM_ADMIN_ID,
          text,
          { parse_mode: "HTML" },
        ),
      );
    }

    return c.json(
      {
        success: true,
        file: fileResponse,
        view_url: fileResponse.view_url,
      },
      201,
    );
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Failed to upload file" },
      500,
    );
  }
};

shareApi.post("/files/upload", handleFileUpload);
shareApi.post("/files", handleFileUpload);

// Promote a temporary file to permanent storage
shareApi.post("/files/promote", async (c) => {
  try {
    const body = await c.req.json<{
      key?: string;
      slug?: string;
    }>();

    if (!body || !body.key) {
      return c.json({ success: false, error: "Storage key is required" }, 400);
    }

    const result = await promoteFile(c.env, body.key, body.slug);

    if (!result.success) {
      return c.json(
        { success: false, error: result.error || "Failed to promote file" },
        400,
      );
    }

    const relativeKey = result.metadata?.key.replace(/^permanent\//, "");
    const responsePayload = {
      success: true,
      file: result.metadata,
      view_url: buildServiceUrl("permanent", relativeKey, c.env, c.req.url),
      short_url: result.short_url || null,
    };

    // Broadcast file promotion to room
    c.executionCtx.waitUntil(
      broadcastToRoom(c.env, {
        type: "file_promoted",
        data: responsePayload,
      }),
    );

    return c.json(responsePayload);
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Invalid promotion request" },
      400,
    );
  }
});
