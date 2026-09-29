import { Hono } from "hono";
import type { Env } from "../types";
import {
  listShortLinks,
  deleteShortLink,
  listRecentFiles,
  deleteFileMetadata,
  purgeExpiredMessages,
  deleteRoomMessage,
  purgeAllMessages,
  listRoomMessages,
} from "../core/db";
import { rateLimiter } from "../core/rate-limit";
import { broadcastToRoom } from "../core/broadcast";

export const adminApi = new Hono<{ Bindings: Env }>();

/**
 * Generates a signed HMAC-SHA256 admin session token with a 24-hour expiration.
 */
async function signAdminToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `v1.${exp}.${crypto.randomUUID()}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${payload}.${sigBase64}`;
}

/**
 * Validates the HMAC-SHA256 signature and expiration of an admin session token.
 */
async function verifyAdminToken(
  token: string,
  password: string,
): Promise<boolean> {
  if (!token || !password) return false;

  // Direct match for raw password header (backward compatibility for CLI / API scripts)
  if (token === password) return true;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;

  const [version, expStr, nonce, sigBase64] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp < Date.now()) return false;

  const payload = `${version}.${expStr}.${nonce}`;
  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const standardBase64 = sigBase64.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(standardBase64);
    const sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigBytes[i] = binary.charCodeAt(i);
    }

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

// Authentication middleware for administrative routes
adminApi.use("*", async (c, next) => {
  // Public login endpoint does not require pre-existing auth
  if (c.req.path === "/api/admin/login" && c.req.method === "POST") {
    return next();
  }

  const configuredPassword = c.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    return c.json(
      {
        success: false,
        error:
          "Admin interface disabled: Server ADMIN_PASSWORD is not configured.",
      },
      503,
    );
  }

  const authHeader =
    c.req.header("Authorization") || c.req.header("X-Admin-Password");
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : "";

  const isValid = await verifyAdminToken(token, configuredPassword);
  if (!isValid) {
    return c.json(
      { success: false, error: "Unauthorized. Invalid admin credentials." },
      401,
    );
  }

  return next();
});

// Admin login verification with rate limiting and signed HMAC tokens
adminApi.post("/login", async (c) => {
  const clientIp =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    "127.0.0.1";
  const deviceId = c.req.header("x-client-id");

  // Rate limit protection against brute force attacks
  const rateCheck = rateLimiter.check("admin_login", deviceId, clientIp);
  if (!rateCheck.allowed) {
    return c.json(
      {
        success: false,
        error: rateCheck.error,
        retry_after: rateCheck.retryAfterSeconds,
      },
      429,
    );
  }

  const configuredPassword = c.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    return c.json(
      {
        success: false,
        error:
          "Admin login is disabled: ADMIN_PASSWORD is not configured on the server.",
      },
      503,
    );
  }

  try {
    const body = await c.req.json<{ password?: string }>();
    if (body?.password && body.password === configuredPassword) {
      const signedToken = await signAdminToken(configuredPassword);
      return c.json({ success: true, token: signedToken });
    }
    return c.json(
      { success: false, error: "Incorrect administrator password" },
      401,
    );
  } catch {
    return c.json({ success: false, error: "Invalid login request" }, 400);
  }
});

// Admin stats summary
adminApi.get("/stats", async (c) => {
  const links = await listShortLinks(c.env.DB, 1000);
  const files = await listRecentFiles(c.env.DB, 1000);

  const totalClicks = links.reduce(
    (acc, link) => acc + (link.clicks_count || 0),
    0,
  );
  const permanentFiles = files.filter(
    (f) => f.storage_type === "permanent",
  ).length;
  const temporalFiles = files.filter(
    (f) => f.storage_type === "temporal",
  ).length;

  return c.json({
    success: true,
    stats: {
      total_links: links.length,
      total_clicks: totalClicks,
      total_files: files.length,
      permanent_files: permanentFiles,
      temporal_files: temporalFiles,
    },
  });
});

// Delete a short link
adminApi.delete("/links/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteShortLink(c.env.DB, id);

  if (!deleted) {
    return c.json(
      { success: false, error: "Short link not found or already deleted" },
      404,
    );
  }

  await broadcastToRoom(c.env, {
    type: "link_deleted",
    data: { id },
  });

  return c.json({ success: true, deleted_id: id });
});

// Delete a file from R2 storage, D1 metadata, and associated short links
adminApi.delete("/files", async (c) => {
  try {
    const body = await c.req.json<{ key?: string }>();
    if (!body?.key) {
      return c.json({ success: false, error: "File key is required" }, 400);
    }

    // 1. Delete from R2 bucket
    await c.env.STORAGE.delete(body.key);

    // 2. Delete from D1 metadata table
    await deleteFileMetadata(c.env.DB, body.key);

    // 3. Delete any short links associated with this file key
    await c.env.DB.prepare("DELETE FROM short_links WHERE file_key = ?")
      .bind(body.key)
      .run();

    // 4. Broadcast deletion to active room clients
    await broadcastToRoom(c.env, {
      type: "file_deleted",
      data: { key: body.key },
    });

    return c.json({ success: true, deleted_key: body.key });
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Failed to delete file" },
      500,
    );
  }
});

// List recent room messages for admin inspection
adminApi.get("/messages", async (c) => {
  const limit = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("limit") || "100", 10)),
  );
  const messages = await listRoomMessages(c.env.DB, limit);
  return c.json({ success: true, messages });
});

// Delete an individual room message by ID
adminApi.delete("/messages/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteRoomMessage(c.env.DB, id);

  if (!deleted) {
    return c.json(
      { success: false, error: "Message not found or already deleted" },
      404,
    );
  }

  // Broadcast deletion to all connected room clients so it vanishes in real time
  await broadcastToRoom(c.env, {
    type: "message_deleted",
    data: { id },
  });

  return c.json({ success: true, deleted_id: id });
});

// Delete all room messages immediately
adminApi.delete("/messages", async (c) => {
  const purgedCount = await purgeAllMessages(c.env.DB);

  await broadcastToRoom(c.env, {
    type: "messages_cleared",
    data: {},
  });

  return c.json({ success: true, purged_messages: purgedCount });
});

// Manually trigger purge of expired room messages (> 24 hours old)
adminApi.post("/purge-expired", async (c) => {
  const purgeAll = c.req.query("all") === "true";
  let purgedCount: number;

  if (purgeAll) {
    purgedCount = await purgeAllMessages(c.env.DB);
    await broadcastToRoom(c.env, {
      type: "messages_cleared",
      data: {},
    });
  } else {
    purgedCount = await purgeExpiredMessages(c.env.DB);
  }

  return c.json({ success: true, purged_messages: purgedCount });
});
