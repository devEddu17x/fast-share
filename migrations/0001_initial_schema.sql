-- Initial Migration: Required

-- 1. Shortened links table
CREATE TABLE IF NOT EXISTS short_links (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    destination_url TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'url', -- 'url' | 'file'
    file_key TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,                     -- NULL = permanent
    clicks_count INTEGER NOT NULL DEFAULT 0,
    last_clicked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);

-- 2. Room messages and code snippets (24h retention)
CREATE TABLE IF NOT EXISTS room_messages (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'text',     -- 'text' | 'code' | 'url'
    sender_type TEXT NOT NULL DEFAULT 'web', -- 'web' | 'telegram'
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL             -- created_at + 24 hours
);

CREATE INDEX IF NOT EXISTS idx_room_messages_created ON room_messages(created_at DESC);

-- 3. File metadata registry (temporary and permanent assets)
CREATE TABLE IF NOT EXISTS files_metadata (
    key TEXT PRIMARY KEY,                    -- e.g. 'temporal/uuid-name' or 'permanent/uuid-name'
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_type TEXT NOT NULL DEFAULT 'temporal', -- 'temporal' | 'permanent'
    short_slug TEXT,                         -- associated slug if promoted
    created_at INTEGER NOT NULL,
    expires_at INTEGER                       -- NULL if permanent
);

CREATE INDEX IF NOT EXISTS idx_files_metadata_created ON files_metadata(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_metadata_type ON files_metadata(storage_type);
