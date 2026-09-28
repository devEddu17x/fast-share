import type { Env } from "../types";

/**
 * Dispatches an event payload to all clients connected to the default room Durable Object.
 */
export async function broadcastToRoom(
  env: Env,
  event: { type: string; data: unknown },
): Promise<void> {
  try {
    const id = env.ROOM_DO.idFromName("default");
    const room = env.ROOM_DO.get(id);
    await room.fetch(
      new Request("http://internal/broadcast", {
        method: "POST",
        body: JSON.stringify(event),
      }),
    );
  } catch {
    // Fail silently if broadcast fails to not disrupt primary HTTP request
  }
}
