import type { RoomMessage } from "../../types";

export interface CreateMessageParams {
  content: string;
  format?: "text" | "code" | "url" | "file";
  sender_type?: "web" | "telegram";
}

/**
 * Saves a new room message in Cloudflare D1 with a 24-hour retention period.
 */
export async function saveRoomMessage(
  db: D1Database,
  data: CreateMessageParams,
): Promise<RoomMessage> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const format = data.format || "text";
  const senderType = data.sender_type || "web";
  const expiresAt = now + 24 * 3600 * 1000; // 24 hours

  await db
    .prepare(
      `INSERT INTO room_messages (id, content, format, sender_type, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, data.content, format, senderType, now, expiresAt)
    .run();

  return {
    id,
    content: data.content,
    format,
    sender_type: senderType,
    created_at: now,
    expires_at: expiresAt,
  };
}

/**
 * Lists messages from the last 24 hours in chronological order.
 */
export async function listRoomMessages(
  db: D1Database,
  limit = 100,
): Promise<RoomMessage[]> {
  const cutoff = Date.now() - 24 * 3600 * 1000;

  const { results } = await db
    .prepare(
      `SELECT * FROM room_messages 
       WHERE created_at >= ? 
       ORDER BY created_at ASC 
       LIMIT ?`,
    )
    .bind(cutoff, limit)
    .all<RoomMessage>();

  return results || [];
}

/**
 * Purges messages older than 24 hours.
 */
export async function purgeExpiredMessages(db: D1Database): Promise<number> {
  const now = Date.now();
  const res = await db
    .prepare("DELETE FROM room_messages WHERE expires_at < ?")
    .bind(now)
    .run();

  return res.meta.changes || 0;
}
