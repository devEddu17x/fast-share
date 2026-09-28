import { Hono } from "hono";
import type { Env } from "../types";
import {
  listShortLinks,
  deleteShortLink,
  listRecentFiles,
  deleteFileMetadata,
  purgeExpiredMessages,
} from "../core/db";

export const adminApi = new Hono<{ Bindings: Env }>();

// Authentication middleware for administrative routes
adminApi.use("*", async (c, next) => {
  // Public login endpoint does not require pre-existing auth
  if (c.req.path === "/api/admin/login" && c.req.method === "POST") {
    return next();
  }

  const authHeader =
    c.req.header("Authorization") || c.req.header("X-Admin-Password");
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : "";
  const configuredPassword = c.env.ADMIN_PASSWORD || "admin123";

  if (!token || token !== configuredPassword) {
    return c.json(
      { success: false, error: "Unauthorized. Invalid admin credentials." },
      401,
    );
  }

  return next();
});

// Admin login verification
adminApi.post("/login", async (c) => {
  try {
    const body = await c.req.json<{ password?: string }>();
    const configuredPassword = c.env.ADMIN_PASSWORD || "admin123";

    if (body?.password && body.password === configuredPassword) {
      return c.json({ success: true, token: configuredPassword });
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

  return c.json({ success: true, deleted_id: id });
});

// Delete a file from both R2 storage and D1 metadata
adminApi.delete("/files", async (c) => {
  try {
    const body = await c.req.json<{ key?: string }>();
    if (!body?.key) {
      return c.json({ success: false, error: "File key is required" }, 400);
    }

    // Delete from R2 bucket
    await c.env.STORAGE.delete(body.key);

    // Delete from D1 metadata
    await deleteFileMetadata(c.env.DB, body.key);

    return c.json({ success: true, deleted_key: body.key });
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Failed to delete file" },
      500,
    );
  }
});

// Manually trigger purge of expired room messages
adminApi.post("/purge-expired", async (c) => {
  const purgedCount = await purgeExpiredMessages(c.env.DB);
  return c.json({ success: true, purged_messages: purgedCount });
});
