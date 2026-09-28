import { Hono } from "hono";
import type { Env } from "./types";
import { RoomDurableObject } from "./core/room-do";
import { shareApi } from "./hosts/share-api";
import { adminApi } from "./hosts/admin-api";
import { handleLinkRedirect } from "./hosts/link";
import { handleStorageStream } from "./hosts/storage";
import { handleTelegramWebhook } from "./hosts/telegram";

// Export Durable Object for Cloudflare Workers runtime
export { RoomDurableObject };

const app = new Hono<{ Bindings: Env }>();

// API Healthcheck endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: Date.now(),
    service: "fast-share",
  });
});

// Telegram Bot Webhook endpoint
app.post("/api/telegram/webhook", (c) => {
  return handleTelegramWebhook(c.req.raw, c.env, c.executionCtx);
});

// Mount admin API routes
app.route("/api/admin", adminApi);

// Mount share, links, and messages endpoints
app.route("/api", shareApi);

// WebSocket room endpoint (Durable Object with Hibernation API)
app.get("/ws", async (c) => {
  const id = c.env.ROOM_DO.idFromName("default");
  const room = c.env.ROOM_DO.get(id);
  return room.fetch(c.req.raw);
});

// Main worker dispatcher supporting Custom Domains and Static Assets
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // 1. Shortener domain: link.<domain> (or local /r/ route for dev testing)
    if (url.hostname.startsWith("link.") || url.pathname.startsWith("/r/")) {
      let redirectReq = request;
      if (url.pathname.startsWith("/r/")) {
        const localPath = url.pathname.replace(/^\/r/, "");
        redirectReq = new Request(
          new URL(localPath + url.search, request.url),
          request,
        );
      }
      return handleLinkRedirect(redirectReq, env, ctx);
    }

    // 2. Storage domains: temporal.<domain> and permanent.<domain> (or local /temporal and /permanent)
    if (
      url.hostname.startsWith("temporal.") ||
      url.pathname.startsWith("/temporal/")
    ) {
      return handleStorageStream(request, env, "temporal");
    }
    if (
      url.hostname.startsWith("permanent.") ||
      url.pathname.startsWith("/permanent/")
    ) {
      return handleStorageStream(request, env, "permanent");
    }

    // 3. REST API and WebSocket routes processed by Hono
    if (url.pathname.startsWith("/api") || url.pathname === "/ws") {
      return app.fetch(request, env, ctx);
    }

    // 4. Fallback to React static assets (dist/) with SPA routing fallback
    if (env.ASSETS) {
      let assetRes = await env.ASSETS.fetch(request);
      if (
        assetRes.status === 404 &&
        request.method === "GET" &&
        !url.pathname.includes(".")
      ) {
        assetRes = await env.ASSETS.fetch(
          new Request(new URL("/", request.url), request),
        );
      }

      // If serving HTML, rewrite relative OG/Twitter image tags to absolute URLs for Meta & WhatsApp scrapers
      const contentType = assetRes.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const origin = `${url.protocol}//${url.host}`;
        return new HTMLRewriter()
          .on('meta[property^="og:"], meta[name^="twitter:"]', {
            element(element) {
              const prop =
                element.getAttribute("property") ||
                element.getAttribute("name");
              if (
                prop === "og:image" ||
                prop === "og:image:secure_url" ||
                prop === "twitter:image"
              ) {
                const content = element.getAttribute("content");
                if (content && content.startsWith("/")) {
                  element.setAttribute("content", `${origin}${content}`);
                }
              }
              if (prop === "og:url" || prop === "twitter:url") {
                element.setAttribute("content", origin);
              }
            },
          })
          .transform(assetRes);
      }

      return assetRes;
    }

    return new Response("Fast Share API ready", { status: 200 });
  },
};
