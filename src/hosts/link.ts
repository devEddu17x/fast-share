import type { Env } from "../types";
import { getShortLinkBySlug, recordLinkClick } from "../core/db";
import { buildServiceUrl } from "../core/utils/url";

/**
 * Handles incoming redirection requests for short URLs (e.g. link.<domain>/{slug}).
 */
export async function handleLinkRedirect(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  // Extract slug without leading or trailing slashes
  const slug = url.pathname.replace(/^\/+|\/+$/g, "");

  // If accessing root of shortener domain, redirect to main hub
  if (!slug) {
    return Response.redirect(
      buildServiceUrl("share", "", env, request.url),
      302,
    );
  }

  // Lookup short link in Cloudflare D1
  const link = await getShortLinkBySlug(env.DB, slug);

  // 1. Link not found
  if (!link) {
    const hubUrl = buildServiceUrl("share", "", env, request.url);
    return new Response(renderNotFoundHtml(slug, hubUrl), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline';",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 2. Link expired
  if (link.expires_at && link.expires_at < Date.now()) {
    const hubUrl = buildServiceUrl("share", "", env, request.url);
    return new Response(renderExpiredHtml(slug, hubUrl), {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline';",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 3. Asynchronously record click in background without delaying user redirection
  ctx.waitUntil(recordLinkClick(env.DB, link.id));

  // 4. Perform immediate HTTP 302 redirect to target destination
  return Response.redirect(link.destination_url, 302);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderNotFoundHtml(slug: string, hubUrl: string): string {
  const safeSlug = escapeHtml(slug);
  const safeHubUrl = escapeHtml(hubUrl);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enlace no encontrado | Fast Share</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #ededed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .box { max-width: 420px; padding: 2rem; border-radius: 1rem; background: #141414; border: 1px solid #262626; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f87171; }
    p { font-size: 0.95rem; color: #a3a3a3; margin-bottom: 1.5rem; }
    code { background: #262626; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.9rem; color: #fbbf24; }
    a { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; }
    a:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="box">
    <h1>404 • Enlace no encontrado</h1>
    <p>El enlace corto <code>/${safeSlug}</code> no existe o fue eliminado.</p>
    <a href="${safeHubUrl}">Ir a Fast Share</a>
  </div>
</body>
</html>`;
}

function renderExpiredHtml(slug: string, hubUrl: string): string {
  const safeSlug = escapeHtml(slug);
  const safeHubUrl = escapeHtml(hubUrl);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enlace expirado | Fast Share</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #ededed; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .box { max-width: 420px; padding: 2rem; border-radius: 1rem; background: #141414; border: 1px solid #262626; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #fbbf24; }
    p { font-size: 0.95rem; color: #a3a3a3; margin-bottom: 1.5rem; }
    code { background: #262626; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.9rem; color: #f87171; }
    a { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>410 • Enlace expirado</h1>
    <p>El enlace corto <code>/${safeSlug}</code> ha cumplido su ciclo de vida y ya no está disponible.</p>
    <a href="${safeHubUrl}">Ir a Fast Share</a>
  </div>
</body>
</html>`;
}
