import type { Env } from "../types";
import {
  sendTelegramMessage,
  getTelegramFileUrl,
} from "../core/telegram/client";
import {
  handleShortenCommand,
  handleListLinksCommand,
  handleListFilesCommand,
  handleHelpCommand,
} from "../core/telegram/commands";
import { saveRoomMessage, registerFileMetadata } from "../core/db";
import { broadcastToRoom } from "../core/broadcast";
import { generateObjectKey } from "../core/storage/r2";
import { escapeHtml } from "../core/telegram/format";
import { buildServiceUrl } from "../core/utils/url";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    document?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    photo?: Array<{
      file_id: string;
      file_size?: number;
      width: number;
      height: number;
    }>;
  };
}

/**
 * Handles incoming webhooks from Telegram Bot API.
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  const adminId = env.TELEGRAM_ADMIN_ID;

  if (!botToken || !adminId) {
    return new Response("Telegram bot credentials not configured", {
      status: 500,
    });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const msg = update.message;
  if (!msg || !msg.from) {
    return new Response("OK", { status: 200 });
  }

  const senderId = String(msg.from.id);
  const chatId = msg.chat.id;

  // Security whitelist: enforce that only the configured TELEGRAM_ADMIN_ID can interact
  if (senderId !== String(adminId).trim()) {
    // Send polite rejection to unauthorized users
    ctx.waitUntil(
      sendTelegramMessage(
        botToken,
        chatId,
        "⛔ Unauthorized: This bot is private to the administrator.",
      ),
    );
    return new Response("OK", { status: 200 });
  }

  // 1. Handle incoming text commands and messages
  if (msg.text) {
    const text = msg.text.trim();

    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      let reply = "";
      if (command === "/shorten") {
        reply = await handleShortenCommand(env, args);
      } else if (command === "/links") {
        reply = await handleListLinksCommand(env);
      } else if (command === "/files") {
        reply = await handleListFilesCommand(env);
      } else if (command === "/start" || command === "/help") {
        reply = handleHelpCommand();
      } else {
        reply = `Unknown command: <code>${escapeHtml(command)}</code>. Use /help to see available commands.`;
      }

      ctx.waitUntil(
        sendTelegramMessage(botToken, chatId, reply, {
          parse_mode: "HTML",
        }),
      );
      return new Response("OK", { status: 200 });
    }

    // Regular text message or code snippet broadcasted to the room
    const isCode =
      text.includes("\n") &&
      (text.includes("{") ||
        text.includes(";") ||
        text.includes("const ") ||
        text.includes("def "));
    const format = isCode ? "code" : "text";

    const saved = await saveRoomMessage(env.DB, {
      content: text,
      format,
      sender_type: "telegram",
    });

    // Broadcast to room WebSockets
    ctx.waitUntil(
      broadcastToRoom(env, {
        type: "new_message",
        data: saved,
      }),
    );

    ctx.waitUntil(
      sendTelegramMessage(
        botToken,
        chatId,
        `✅ <b>Broadcasted to web room!</b>\nType: <code>${format}</code>`,
        { parse_mode: "HTML" },
      ),
    );

    return new Response("OK", { status: 200 });
  }

  // 2. Handle incoming document or photo upload
  if (msg.document || (msg.photo && msg.photo.length > 0)) {
    let fileId = "";
    let fileName = "telegram_file";
    let mimeType = "application/octet-stream";
    let fileSize = 0;

    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || "document";
      mimeType = msg.document.mime_type || "application/octet-stream";
      fileSize = msg.document.file_size || 0;
    } else if (msg.photo) {
      // Pick highest resolution photo
      const largestPhoto = msg.photo[msg.photo.length - 1];
      fileId = largestPhoto.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      mimeType = "image/jpeg";
      fileSize = largestPhoto.file_size || 0;
    }

    const fileInfo = await getTelegramFileUrl(botToken, fileId);
    if (!fileInfo) {
      ctx.waitUntil(
        sendTelegramMessage(
          botToken,
          chatId,
          "❌ Failed to download file from Telegram servers.",
        ),
      );
      return new Response("OK", { status: 200 });
    }

    // Stream file from Telegram into R2 temporal storage
    const fileRes = await fetch(fileInfo.fileUrl);
    if (!fileRes.ok || !fileRes.body) {
      ctx.waitUntil(
        sendTelegramMessage(
          botToken,
          chatId,
          "❌ Failed to fetch file stream.",
        ),
      );
      return new Response("OK", { status: 200 });
    }

    const storageKey = generateObjectKey("temporal", fileName);

    await env.STORAGE.put(storageKey, fileRes.body, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { originalName: fileName },
    });

    // Register metadata in D1
    const metadata = await registerFileMetadata(env.DB, {
      key: storageKey,
      original_name: fileName,
      mime_type: mimeType,
      size_bytes: fileSize,
      storage_type: "temporal",
    });

    const relativeKey = storageKey.replace(/^temporal\//, "");
    const fileResponse = {
      ...metadata,
      view_url: buildServiceUrl("temporal", relativeKey, env),
    };

    // Save activity log message into room
    const roomMsg = await saveRoomMessage(env.DB, {
      content: JSON.stringify({
        name: fileName,
        size_bytes: fileSize,
        mime_type: mimeType,
        url: fileResponse.view_url,
        storage_type: "temporal",
        key: storageKey,
      }),
      format: "file",
      sender_type: "telegram",
    });

    // Broadcast file drop and activity message to room
    ctx.waitUntil(
      broadcastToRoom(env, {
        type: "new_message",
        data: roomMsg,
      }),
    );
    ctx.waitUntil(
      broadcastToRoom(env, {
        type: "file_uploaded",
        data: fileResponse,
      }),
    );

    ctx.waitUntil(
      sendTelegramMessage(
        botToken,
        chatId,
        `📎 <b>File uploaded and shared to room!</b>\n\n` +
          `• <b>Name:</b> <code>${escapeHtml(fileName)}</code>\n` +
          `• <b>View URL:</b> ${fileResponse.view_url}\n\n` +
          `<i>(Expires in 24h unless promoted to permanent)</i>`,
        { parse_mode: "HTML" },
      ),
    );

    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
