import type { Env } from "../../types";
import {
  createShortLink,
  listShortLinks,
  listRecentFiles,
  saveRoomMessage,
} from "../db";
import { broadcastToRoom } from "../broadcast";
import { escapeHtml } from "./format";
import { buildServiceUrl } from "../utils/url";

/**
 * Handles the /shorten command: /shorten <url> [optional_slug]
 */
export async function handleShortenCommand(
  env: Env,
  args: string[],
): Promise<string> {
  const url = args[0]?.trim();
  const slug = args[1]?.trim();

  if (!url) {
    return "⚠️ <b>Usage:</b> <code>/shorten &lt;url&gt; [optional_slug]</code>\nExample: <code>/shorten https://github.com/torvalds/linux linux</code>";
  }

  const result = await createShortLink(env.DB, {
    destination_url: url,
    slug: slug || undefined,
  });

  if (!result.success || !result.link) {
    return `❌ <b>Error:</b> ${escapeHtml(result.error || "Failed to create short link")}`;
  }

  const shortUrl = buildServiceUrl("link", result.link.slug, env);

  // Log activity into room messages
  try {
    const roomMsg = await saveRoomMessage(env.DB, {
      content: JSON.stringify({
        slug: result.link.slug,
        short_url: shortUrl,
        destination_url: result.link.destination_url,
      }),
      format: "url",
      sender_type: "telegram",
    });

    await broadcastToRoom(env, {
      type: "new_message",
      data: roomMsg,
    });
  } catch {
    // Non-blocking if room broadcast fails
  }

  return (
    `✅ <b>Link created successfully!</b>\n\n` +
    `🔗 <b>Short URL:</b> ${shortUrl}\n` +
    `🎯 <b>Destination:</b> ${escapeHtml(result.link.destination_url)}`
  );
}

/**
 * Handles the /links command: lists the 10 most recent short links.
 */
export async function handleListLinksCommand(env: Env): Promise<string> {
  const links = await listShortLinks(env.DB, 10);

  if (links.length === 0) {
    return "ℹ️ No short links created yet.";
  }

  let text = "🔗 <b>Recent Short Links:</b>\n\n";
  for (const l of links) {
    text += `• <code>/${l.slug}</code> ➔ ${escapeHtml(l.destination_url)}\n  <i>${l.clicks_count} clicks</i>\n`;
  }
  return text;
}

/**
 * Handles the /files command: lists the 10 most recent files.
 */
export async function handleListFilesCommand(env: Env): Promise<string> {
  const files = await listRecentFiles(env.DB, 10);

  if (files.length === 0) {
    return "ℹ️ No files uploaded in storage yet.";
  }

  let text = "📁 <b>Recent Files:</b>\n\n";
  for (const f of files) {
    const isPermanent = f.storage_type === "permanent";
    const tag = isPermanent ? "🔒 Permanent" : "⏳ 24h Ephemeral";
    const url = isPermanent
      ? buildServiceUrl("permanent", f.key.replace(/^permanent\//, ""), env)
      : buildServiceUrl("temporal", f.key.replace(/^temporal\//, ""), env);

    text += `• <b>${escapeHtml(f.original_name)}</b> (${tag})\n  ${url}\n`;
  }
  return text;
}

/**
 * Handles the /help or /start command.
 */
export function handleHelpCommand(): string {
  return (
    `⚡ <b>Fast Share Bot</b>\n\n` +
    `Available commands:\n` +
    `• <code>/shorten &lt;url&gt; [slug]</code> - Create a short link\n` +
    `• <code>/links</code> - View recent short links & click metrics\n` +
    `• <code>/files</code> - View recent files in storage\n` +
    `• Send any text or code snippet to broadcast it live to the web room\n` +
    `• Send any photo or document to upload it directly to R2 storage`
  );
}
