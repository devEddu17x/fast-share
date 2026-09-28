import { Hono } from "hono";
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
import { buildServiceUrl } from "../core/utils/url";

export const shareApi = new Hono<{ Bindings: Env }>();

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

    if (!body || !body.url) {
      return c.json(
        { success: false, error: "Destination URL is required" },
        400,
      );
    }

    let expiresAt: number | null = null;
    if (body.expires_in_hours && body.expires_in_hours > 0) {
      expiresAt = Date.now() + body.expires_in_hours * 3600 * 1000;
    }

    const result = await createShortLink(c.env.DB, {
      destination_url: body.url,
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
    const body = await c.req.json<{
      content?: string;
      format?: "text" | "code" | "url";
    }>();

    if (!body || !body.content || !body.content.trim()) {
      return c.json({ success: false, error: "Content is required" }, 400);
    }

    const message = await saveRoomMessage(c.env.DB, {
      content: body.content.trim(),
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
shareApi.post("/files/upload", async (c) => {
  try {
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
});

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
