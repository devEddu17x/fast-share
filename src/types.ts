export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  STORAGE: R2Bucket;
  ROOM_DO: DurableObjectNamespace;
  ASSETS: Fetcher;

  // Environment variables and secrets
  BASE_DOMAIN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ADMIN_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_PASSWORD?: string;
}

export interface ShortLink {
  id: string;
  slug: string;
  destination_url: string;
  target_type: "url" | "file";
  file_key: string | null;
  created_at: number;
  expires_at: number | null;
  clicks_count: number;
  last_clicked_at: number | null;
}

export interface RoomMessage {
  id: string;
  content: string;
  format: "text" | "code" | "url" | "file";
  sender_type: "web" | "telegram";
  created_at: number;
  expires_at: number;
}

export interface FileMetadata {
  key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_type: "temporal" | "permanent";
  short_slug: string | null;
  created_at: number;
  expires_at: number | null;
}
