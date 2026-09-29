# ⚡ Fast Share

Fast Share is a high-performance, open-source personal and team sharing hub, 500 MB file drop, and URL shortener built 100% on **Cloudflare's serverless edge ecosystem** (Workers, D1, R2, and Durable Objects) designed to operate completely within Cloudflare's **Free Tier**.

---

## 🌟 Key Features

1. **Real-time Live Room (Zero-Idle CPU)**:
   - WebSocket room backed by Cloudflare Durable Objects with **WebSocket Hibernation API**.
   - Immediate sharing of plain text notes, URLs, and code snippets with syntax highlighting.
   - 24-hour message history hydrated on connection.

2. **Dual R2 Storage (Up to 500 MB per file)**:
   - **Ephemeral (24 hours)**: Direct streaming under `temporal.<domain>/{key}` with native browser viewer (`Content-Disposition: inline`). Auto-purged via native R2 Lifecycle Rules.
   - **Permanent**: One-click promotion to `permanent.<domain>/{key}` with immutable caching.
   - Direct downloads via query parameter (`?download=true`) and dedicated UI download buttons.

3. **High-Speed URL Shortener**:
   - Zero-latency 302 redirects under `link.<domain>/{slug}`.
   - Custom aliases or random memorable slugs.
   - Background click telemetry and analytics recorded asynchronously (`ctx.waitUntil`).

4. **Telegram Bot Bridge**:
   - Private bidirectional bot (secured by `TELEGRAM_ADMIN_ID` whitelist).
   - `/shorten <url> [slug]` command for instant link creation.
   - Media forwarding: send files or photos to the bot and have them appear live in the web room.

5. **Isolated Admin Dashboard**:
   - Password-protected management dashboard under `admin.share.<domain>`.
   - Telemetry overview, link deletion, and storage file cleanup.

---

## 🌐 Subdomain Architecture

Fast Share maps all functionality onto a single unified Worker using Cloudflare Custom Domains:

| Subdomain                          | Purpose                                                  | Access                       |
| :--------------------------------- | :------------------------------------------------------- | :--------------------------- |
| `share.<yourdomain.com>`           | **Main Web Interface** (Live room, file drop, shortener) | Public                       |
| `admin.share.<yourdomain.com>`     | **Admin Portal** (Telemetry & management)                | Protected (`ADMIN_PASSWORD`) |
| `link.<yourdomain.com>/{slug}`     | **URL Shortener Redirection Engine**                     | Public                       |
| `temporal.<yourdomain.com>/{key}`  | **Ephemeral Files** (24h lifecycle)                      | Public (24h)                 |
| `permanent.<yourdomain.com>/{key}` | **Permanent Files** (Direct stream)                      | Public                       |
| `<yourdomain.com>`                 | **Root Domain / Portfolio**                              | Untouched / Independent      |

---

## 🚀 Quickstart

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/)
- A Cloudflare account with a domain configured in Cloudflare DNS
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) logged in:
  ```bash
  wrangler login
  ```

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/open-fast-share.git
cd open-fast-share
pnpm install
```

### 2. Configure Your Environment

Copy `wrangler.jsonc.example` to `wrangler.jsonc`:

```bash
cp wrangler.jsonc.example wrangler.jsonc
```

Edit `wrangler.jsonc` to set your domain in `routes` and `vars`:

```jsonc
{
  "name": "fast-share",
  "vars": {
    "BASE_DOMAIN": "yourdomain.com",
  },
  "routes": [
    { "pattern": "share.yourdomain.com", "custom_domain": true },
    { "pattern": "admin.share.yourdomain.com", "custom_domain": true },
    { "pattern": "link.yourdomain.com", "custom_domain": true },
    { "pattern": "temporal.yourdomain.com", "custom_domain": true },
    { "pattern": "permanent.yourdomain.com", "custom_domain": true },
  ],
}
```

### 3. Provision Cloudflare Infrastructure

Run the automated idempotent provisioning script:

```bash
pnpm run infra:init
```

This script will:

- Create the R2 bucket (`fast-share-storage`).
- Configure the 24h expiration lifecycle rule for `temporal/` objects.
- Create the D1 SQL database (`fast-share-db`) and inject its `database_id` into `wrangler.jsonc`.
- Apply all remote database migrations (`migrations/0001_initial_schema.sql`).

### 4. Set Production Secrets

```bash
# Telegram Bot Token (from @BotFather)
wrangler secret put TELEGRAM_BOT_TOKEN

# Your numerical Telegram user ID (from @userinfobot)
wrangler secret put TELEGRAM_ADMIN_ID

# Admin Dashboard Password
wrangler secret put ADMIN_PASSWORD
```

### 5. Deploy to Cloudflare

```bash
pnpm run deploy
```

### 6. Register Telegram Webhook

```bash
curl -F "url=https://share.yourdomain.com/api/telegram/webhook" https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

---

## 💻 Local Development

Run the local development stack:

```bash
pnpm run dev
```

Open `http://localhost:8787/` to access the local web room.

Simulated local routes:

- Web Room: `http://localhost:8787/`
- Admin Dashboard: `http://localhost:8787/admin`
- Short Link Redirect: `http://localhost:8787/r/{slug}`
- Ephemeral Storage Stream: `http://localhost:8787/temporal/{key}`
- Permanent Storage Stream: `http://localhost:8787/permanent/{key}`

---

## 📄 License

MIT
