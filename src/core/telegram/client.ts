export interface SendMessageOptions {
  parse_mode?: "Markdown" | "HTML";
  reply_markup?: unknown;
}

/**
 * Sends a text message to a Telegram chat using Telegram Bot API.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: SendMessageOptions,
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode,
        reply_markup: options?.reply_markup,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Retrieves the direct download URL for a file from Telegram servers.
 */
export async function getTelegramFileUrl(
  botToken: string,
  fileId: string,
): Promise<{ fileUrl: string; filePath: string } | null> {
  try {
    const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const res = await fetch(getFileUrl);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };
    if (!data.ok || !data.result?.file_path) return null;

    const filePath = data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    return { fileUrl: downloadUrl, filePath };
  } catch {
    return null;
  }
}
