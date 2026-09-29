import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";
import { saveRoomMessage } from "./db";
import { sendTelegramMessage } from "./telegram/client";
import { escapeHtml } from "./telegram/format";
import { rateLimiter } from "./rate-limit";

export class RoomDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        "127.0.0.1";
      server.serializeAttachment({ ip });

      // Accept connection using WebSocket Hibernation API (zero CPU consumption while idle)
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.text();
      this.broadcast(payload);
      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    try {
      if (typeof message === "string") {
        const payload = JSON.parse(message);
        if (payload.type === "send_message" && payload.content?.trim()) {
          const content = payload.content.trim();
          const format = payload.format || "text";
          const deviceId = payload.device_id || null;

          const attachment = ws.deserializeAttachment() as {
            ip?: string;
          } | null;
          const clientIp = attachment?.ip || "127.0.0.1";

          // Rate limit check
          const rateCheck = rateLimiter.check("messages", deviceId, clientIp);
          if (!rateCheck.allowed) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: rateCheck.error,
              }),
            );
            return;
          }

          const MAX_LENGTH = format === "code" ? 65536 : 8192; // 64 KB code, 8 KB plain text
          if (content.length > MAX_LENGTH) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  format === "code"
                    ? "Code snippet exceeds maximum length of 64 KB. Please upload as a file instead."
                    : "Plain text note exceeds maximum length of 8 KB (8,192 chars). Switch to Code mode or upload as a file.",
              }),
            );
            return;
          }
          const saved = await saveRoomMessage(this.env.DB, {
            content,
            format,
            sender_type: "web",
          });

          this.broadcast(
            JSON.stringify({
              type: "new_message",
              data: saved,
            }),
          );

          if (this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_ADMIN_ID) {
            const text =
              format === "code"
                ? `💻 <b>Web Room Code Snippet</b>\n\n<pre><code>${escapeHtml(content)}</code></pre>`
                : `💬 <b>Web Room Message</b>\n\n${escapeHtml(content)}`;

            this.ctx.waitUntil(
              sendTelegramMessage(
                this.env.TELEGRAM_BOT_TOKEN,
                this.env.TELEGRAM_ADMIN_ID,
                text,
                { parse_mode: "HTML" },
              ),
            );
          }
          return;
        }
      }
    } catch {
      // Ignore JSON parse error and fallback to raw broadcast
    }

    this.broadcast(message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, "Closed");
    } catch {
      // Ignore errors on close
    }
  }

  broadcast(message: string | ArrayBuffer): void {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch {
        // Closed socket, ignore
      }
    }
  }
}
