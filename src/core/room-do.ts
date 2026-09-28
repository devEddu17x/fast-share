import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";
import { saveRoomMessage } from "./db";
import { sendTelegramMessage } from "./telegram/client";
import { escapeHtml } from "./telegram/format";

export class RoomDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

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
    _ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    try {
      if (typeof message === "string") {
        const payload = JSON.parse(message);
        if (payload.type === "send_message" && payload.content?.trim()) {
          const content = payload.content.trim();
          const format = payload.format || "text";
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
