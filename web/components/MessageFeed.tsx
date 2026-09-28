import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Code2,
  Send,
  Copy,
  Check,
  Terminal,
  Wifi,
  WifiOff,
  FileIcon,
  Link2,
  ExternalLink,
  UploadCloud,
  Download,
  Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';

interface MessageItem {
  id: string;
  content: string;
  format: 'text' | 'code' | 'url' | 'file';
  sender_type: 'web' | 'telegram';
  created_at: number;
}

interface FilePayload {
  name: string;
  size_bytes?: number;
  mime_type?: string;
  url?: string;
  storage_type?: 'temporal' | 'permanent';
  key?: string;
}

interface UrlPayload {
  slug?: string;
  short_url?: string;
  destination_url?: string;
}

export const MessageFeed: React.FC = () => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'text' | 'code'>('text');
  const [connected, setConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Fetch 24-hour message history from D1
  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; messages: MessageItem[] };
        if (data.success) {
          setMessages(data.messages);
          setTimeout(scrollToBottom, 100);
        }
      }
    } catch {
      // Ignore network errors in dev mode
    }
  };

  // Establish persistent WebSocket connection to RoomDurableObject
  useEffect(() => {
    fetchMessages();

    let isSubscribed = true;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isSubscribed) return;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'new_message' && payload.data) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.data.id)) return prev;
              return [...prev, payload.data];
            });
            setTimeout(scrollToBottom, 50);
          } else if (payload.type === 'file_uploaded' && payload.data) {
            toast.info(`New file dropped: ${payload.data.original_name}`);
          }
        } catch {
          // Ignore invalid JSON payloads
        }
      };

      ws.onclose = () => {
        if (!isSubscribed) return;
        setConnected(false);
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isSubscribed = false;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setContent('');

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, format }),
      });

      if (!res.ok) {
        toast.error('Failed to send message');
        return;
      }

      const json = await res.json<{ success: boolean; message: MessageItem }>();
      if (json.success && json.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === json.message.id)) return prev;
          return [...prev, json.message];
        });
        setTimeout(scrollToBottom, 50);
      }
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (format === 'text') {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // In code mode, allow Ctrl+Enter or Cmd+Enter to send
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Enforce 500 MB maximum size limit
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('File size exceeds maximum 500 MB limit');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploadingFile(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      toast.success('File uploaded and shared to room!', { id: toastId });
    } catch {
      toast.error('Failed to upload file', { id: toastId });
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTime = (epochMs: number) => {
    const d = new Date(epochMs);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full max-w-2xl mt-8 flex flex-col gap-4 text-left">
      {/* Header with live status */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-neutral-200 font-medium text-sm">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>Real-time Room Feed & Activity Logs (24h)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {connected ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Wifi className="w-3.5 h-3.5" />
              <span>Live</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Connecting...</span>
            </span>
          )}
        </div>
      </div>

      {/* Messages Stream Container */}
      <div className="h-96 overflow-y-auto p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="m-auto text-center text-neutral-500 text-xs py-8">
            No activity in the room yet. Drop a file, shorten a URL, or send a message below!
          </div>
        ) : (
          messages.map((msg) => {
            const isCode = msg.format === 'code';
            const isFile = msg.format === 'file';
            const isUrl = msg.format === 'url';
            const isTelegram = msg.sender_type === 'telegram';

            // Parse File log payload
            let fileData: FilePayload = { name: 'Uploaded File' };
            if (isFile) {
              try {
                fileData = JSON.parse(msg.content);
              } catch {
                fileData.name = msg.content;
              }
            }

            // Parse URL log payload
            let urlData: UrlPayload = {};
            if (isUrl) {
              try {
                urlData = JSON.parse(msg.content);
              } catch {
                urlData.destination_url = msg.content;
              }
            }

            const rootDomain = window.location.hostname.replace(/^(admin\.)?share\./, '');
            const fileUrl =
              fileData.url ||
              (fileData.key
                ? window.location.hostname.includes('localhost')
                  ? `/${fileData.key}`
                  : `https://${fileData.storage_type || 'temporal'}.${rootDomain}/${fileData.key.replace(/^(temporal|permanent)\//, '')}`
                : '#');

            const shortUrl =
              urlData.short_url ||
              (urlData.slug
                ? window.location.hostname.includes('localhost')
                  ? `/r/${urlData.slug}`
                  : `https://link.${rootDomain}/${urlData.slug}`
                : '');

            const copyTarget = isFile
              ? fileUrl
              : isUrl
                ? shortUrl || urlData.destination_url || msg.content
                : msg.content;

            return (
              <div
                key={msg.id}
                className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800/80 flex flex-col gap-2 group hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <div className="flex items-center gap-2">
                    {isFile ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <UploadCloud className="w-3 h-3" />
                        <span>File Drop</span>
                      </span>
                    ) : isUrl ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        <span>Short Link</span>
                      </span>
                    ) : isCode ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Code
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                        Text
                      </span>
                    )}

                    {isTelegram && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-md">
                        Telegram
                      </span>
                    )}
                    <span className="text-[11px] text-neutral-500">{formatTime(msg.created_at)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(copyTarget, msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    title="Copy content"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Body depending on message format */}
                {isFile ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                        <FileIcon className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-100 font-medium text-sm hover:text-blue-400 transition-colors truncate max-w-[200px] sm:max-w-xs flex items-center gap-1"
                          >
                            <span>{fileData.name}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                          </a>
                          <span
                            className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${
                              fileData.storage_type === 'permanent'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {fileData.storage_type === 'permanent' ? 'Permanent' : '24h'}
                          </span>
                        </div>
                        {fileData.size_bytes !== undefined && (
                          <span className="text-xs text-neutral-500 mt-0.5">
                            {formatBytes(fileData.size_bytes)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1 transition-colors"
                        title="Open in native viewer"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                      <a
                        href={`${fileUrl}${fileUrl.includes('?') ? '&' : '?'}download=true`}
                        download={fileData.name}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-medium flex items-center gap-1 transition-colors border border-blue-500/30"
                        title="Download file directly"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                ) : isUrl ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                        <Link2 className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        {shortUrl && (
                          <a
                            href={shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-400 font-mono font-medium text-xs hover:underline flex items-center gap-1"
                          >
                            <span>{shortUrl}</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        )}
                        <span className="text-xs text-neutral-400 truncate mt-0.5">
                          ➔ {urlData.destination_url || msg.content}
                        </span>
                      </div>
                    </div>
                    {shortUrl && (
                      <button
                        type="button"
                        onClick={() => handleCopy(shortUrl, msg.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1 transition-colors shrink-0"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : isCode ? (
                  <pre className="p-3 rounded-lg bg-neutral-900 font-mono text-xs text-neutral-200 overflow-x-auto leading-relaxed border border-neutral-800">
                    <code>{msg.content}</code>
                  </pre>
                ) : (
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </p>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Compose Form */}
      <form
        onSubmit={handleSend}
        className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex flex-col gap-2.5"
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 rounded-lg bg-neutral-950 p-1 border border-neutral-800">
            <button
              type="button"
              onClick={() => setFormat('text')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                format === 'text'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Plain Text
            </button>
            <button
              type="button"
              onClick={() => setFormat('code')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                format === 'code'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Code Snippet
            </button>
          </div>

          <span className="text-[11px] text-neutral-500">
            {format === 'text' ? (
              <>
                <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[10px] text-neutral-400">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[10px] text-neutral-400">Shift+Enter</kbd> for newline
              </>
            ) : (
              <>
                <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[10px] text-neutral-400">Ctrl+Enter</kbd> or button to send
              </>
            )}
          </span>
        </div>

        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={format === 'code' ? 4 : 2}
            placeholder={
              format === 'code'
                ? '// Paste code snippet here...'
                : 'Type a message or note to share in real-time...'
            }
            className={`w-full p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 resize-none transition-colors ${
              format === 'code' ? 'font-mono text-xs' : ''
            }`}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            {format === 'code' ? (
              <>
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Monospace formatting enabled</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Synchronized with all open tabs and Telegram</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingFile}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center border border-neutral-700/60 shadow-sm"
              title="Attach and share file (up to 500 MB)"
            >
              {isUploadingFile ? (
                <span className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin block" />
              ) : (
                <Paperclip className="w-4 h-4 text-neutral-300 hover:text-white" />
              )}
            </button>

            {format === 'code' && (
              <button
                type="submit"
                disabled={!content.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                <span>Send Code</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
