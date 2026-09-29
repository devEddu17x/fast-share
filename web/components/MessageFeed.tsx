import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Code2,
  Copy,
  Check,
  UploadCloud,
  FileIcon,
  Link2,
  ExternalLink,
  Download,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowDown,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

export interface MessageItem {
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

interface MessageFeedProps {
  messages: MessageItem[];
  connected: boolean;
  onRefresh?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({ messages, connected }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState('');
  const [failedImageKeys, setFailedImageKeys] = useState<Record<string, boolean>>({});
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialMountRef = useRef(true);
  const initialLastMsgIdRef = useRef<string | null>(null);
  const wasScrolledUpRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior,
      });
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (messages.length > 0) {
      if (isInitialMountRef.current) {
        // Record last message at initial arrival to anchor "New messages" divider
        initialLastMsgIdRef.current = messages[messages.length - 1].id;
        scrollToBottom('auto');
        isInitialMountRef.current = false;
      } else {
        // If user wasn't scrolled up, scroll smoothly to bottom for all message types (including tall code blocks)
        if (!wasScrolledUpRef.current) {
          scrollToBottom('smooth');
          // Multi-frame tick to ensure full height calculation of code snippets
          const timer = setTimeout(() => scrollToBottom('smooth'), 60);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 100;
    wasScrolledUpRef.current = isUp;
    setShowScrollBottomBtn(isUp);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard', { duration: 1500 });
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatTime = (epochMs: number) => {
    const d = new Date(epochMs);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleImageError = (msgId: string) => {
    setFailedImageKeys((prev) => ({ ...prev, [msgId]: true }));
  };

  const filteredMessages = searchFilter.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchFilter.toLowerCase()))
    : messages;

  // Find the first message that arrived AFTER the user entered the room
  const initialIndex = initialLastMsgIdRef.current
    ? filteredMessages.findIndex((m) => m.id === initialLastMsgIdRef.current)
    : -1;
  const firstNewMessageId =
    initialIndex !== -1 && initialIndex < filteredMessages.length - 1
      ? filteredMessages[initialIndex + 1].id
      : null;

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 select-text relative">
      {/* Top Feed Bar with Clean Minimal Stream Info */}
      <div className="h-14 px-5 border-b border-neutral-800/80 flex items-center justify-between gap-3 shrink-0 bg-neutral-950/80 backdrop-blur-sm z-10 select-text">
        <div className="flex items-center gap-2 min-w-0 select-text">
          <span className="text-xs font-mono text-neutral-400 select-text">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </div>

        {/* Search bar inside feed */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search feed..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-40 sm:w-60 pl-9 pr-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700 transition-all select-text"
            />
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0"
      >
        {/* Beginning of Room History Banner: High contrast and recognizable */}
        {filteredMessages.length > 0 && !searchFilter && (
          <div className="flex items-center justify-center my-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-xs font-medium shadow-sm">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Start of 24h room activity</span>
            </div>
          </div>
        )}

        {filteredMessages.length === 0 ? (
          <div className="m-auto flex flex-col items-center justify-center text-center p-8 text-neutral-400 max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 mb-3 shadow-inner">
              <MessageSquare className="w-6 h-6 text-neutral-300" />
            </div>
            <p className="text-base font-semibold text-neutral-200 mb-1">
              {searchFilter ? 'No matching events found' : 'No activity in room yet'}
            </p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {searchFilter
                ? 'Try searching with different keywords.'
                : 'Send a message, paste a code snippet, or drop a file from the right panel to start sharing.'}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isCode = msg.format === 'code';
            const isFile = msg.format === 'file';
            const isUrl = msg.format === 'url';
            const isTelegram = msg.sender_type === 'telegram';
            const isExpanded = !!expandedIds[msg.id];
            const isFirstNewMessage = msg.id === firstNewMessageId;

            // Parse File payload
            let fileData: FilePayload = { name: 'Uploaded File' };
            if (isFile) {
              try {
                fileData = JSON.parse(msg.content);
              } catch {
                fileData.name = msg.content;
              }
            }

            // Parse URL payload
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

            const isImage =
              isFile &&
              !failedImageKeys[msg.id] &&
              (fileData.mime_type?.startsWith('image/') ||
                /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileData.name));

            // Line count for code snippets
            const lines = isCode ? msg.content.split('\n') : [];
            const isLongContent = (isCode && lines.length > 8) || (!isCode && msg.content.length > 320);

            // Distinct semantic border and accent styles
            const cardStyle = isFile
              ? 'border-blue-900/40 bg-neutral-900/80 hover:border-blue-700/60'
              : isUrl
              ? 'border-emerald-900/40 bg-neutral-900/80 hover:border-emerald-700/60'
              : isCode
              ? 'border-amber-900/40 bg-neutral-900/80 hover:border-amber-700/60'
              : 'border-neutral-800/80 bg-neutral-900/60 hover:border-neutral-700/90';

            return (
              <React.Fragment key={msg.id}>
                {/* WhatsApp-style New Messages Divider: anchored where new messages start since room entry */}
                {isFirstNewMessage && !searchFilter && (
                  <div className="flex items-center gap-3 my-3 select-none">
                    <div className="h-px bg-emerald-500/40 flex-1" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/50 shadow-sm flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>New messages</span>
                    </span>
                    <div className="h-px bg-emerald-500/40 flex-1" />
                  </div>
                )}

                <div
                  className={`group relative rounded-xl border p-4 flex flex-col gap-3 shadow-sm message-enter ${cardStyle}`}
                >
                  {/* Meta Header */}
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Distinct Semantic Type Badges */}
                      {isFile ? (
                        <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                          <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                          <span>File Drop</span>
                        </span>
                      ) : isUrl ? (
                        <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Short Link</span>
                        </span>
                      ) : isCode ? (
                        <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Code2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Code ({lines.length} lines)</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-md bg-neutral-800 text-neutral-200 border border-neutral-700/70 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Text Note</span>
                        </span>
                      )}

                      {isTelegram && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/50">
                          Telegram
                        </span>
                      )}

                      <span className="text-xs font-mono text-neutral-400">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(copyTarget, msg.id)}
                        aria-label="Copy content"
                        className="opacity-80 group-hover:opacity-100 p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-100 transition-all cursor-pointer"
                        title="Copy"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Message Body with Visual Differentiation */}
                  {isFile ? (
                    <div className="flex flex-col gap-2.5">
                      {/* Inline Image Preview */}
                      {isImage && (
                        <div className="relative rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800/80 max-h-72 flex items-center justify-center p-1">
                          <img
                            src={fileUrl}
                            alt={fileData.name}
                            loading="lazy"
                            onError={() => handleImageError(msg.id)}
                            className="max-h-72 w-auto object-contain rounded cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(fileUrl, '_blank')}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-neutral-950/90 border border-blue-900/30">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center shrink-0">
                            <FileIcon className="w-5 h-5 text-blue-400" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-100 font-medium text-sm truncate max-w-xs sm:max-w-md">
                                {fileData.name}
                              </span>
                              <span
                                className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                                  fileData.storage_type === 'permanent'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                                }`}
                              >
                                {fileData.storage_type === 'permanent' ? 'Permanent' : '24h'}
                              </span>
                            </div>
                            {fileData.size_bytes !== undefined && (
                              <span className="text-xs font-mono text-neutral-400 mt-0.5">
                                {formatBytes(fileData.size_bytes)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Download and View Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white text-xs font-medium flex items-center gap-1 border border-neutral-800 transition-colors"
                            title="Open in native viewer"
                          >
                            <span>View</span>
                            <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                          </a>
                          <a
                            href={`${fileUrl}${fileUrl.includes('?') ? '&' : '?'}download=true`}
                            download={fileData.name}
                            className="px-4 py-2 rounded-lg bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                            title="Download file directly"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : isUrl ? (
                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-neutral-950/90 border border-emerald-900/30">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center shrink-0">
                          <Link2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          {shortUrl && (
                            <a
                              href={shortUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 font-mono font-medium text-sm hover:underline flex items-center gap-1 truncate"
                            >
                              <span>{shortUrl}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
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
                          className="px-3.5 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium flex items-center gap-1 border border-neutral-800 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : isCode ? (
                    <div className="flex flex-col rounded-lg overflow-hidden border border-amber-900/30 bg-neutral-950">
                      {/* Code window chrome with distinct syntax amber accent */}
                      <div className="px-3.5 py-1.5 bg-neutral-900 border-b border-amber-900/20 flex items-center justify-between text-xs text-neutral-400 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span className="text-amber-300/90 font-medium">code snippet</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy code'}</span>
                        </button>
                      </div>

                      <div
                        className={`overflow-x-auto p-3.5 text-sm font-mono leading-relaxed transition-all ${
                          !isExpanded && isLongContent ? 'max-h-60 overflow-hidden' : ''
                        }`}
                      >
                        <table className="w-full border-collapse">
                          <tbody>
                            {lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-neutral-900/60">
                                <td className="w-9 pr-4 text-right text-neutral-600 select-none text-xs align-top font-mono">
                                  {idx + 1}
                                </td>
                                <td className="text-neutral-200 whitespace-pre break-all font-mono">
                                  {line || ' '}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {isLongContent && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(msg.id)}
                          className="py-2 px-3 bg-neutral-900/80 border-t border-neutral-800 text-xs text-neutral-300 hover:text-white flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>Show less ({lines.length} lines)</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>Show all {lines.length} lines</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <p
                        className={`text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed ${
                          !isExpanded && isLongContent ? 'line-clamp-5' : ''
                        }`}
                      >
                        {msg.content}
                      </p>
                      {isLongContent && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(msg.id)}
                          className="mt-1 text-xs text-neutral-400 hover:text-neutral-200 inline-flex items-center gap-1 cursor-pointer self-start"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>Show less</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>Show more</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Jump to Bottom Button: Highly visible with shadow & border */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-6 right-6 px-4 py-2.5 rounded-full bg-neutral-900/95 hover:bg-neutral-800 border border-emerald-500/50 text-neutral-100 text-xs font-semibold flex items-center gap-2 shadow-2xl backdrop-blur-md cursor-pointer transition-all animate-in fade-in slide-in-from-bottom-2 z-20"
          title="Scroll to latest messages"
        >
          <ArrowDown className="w-4 h-4 text-emerald-400" />
          <span>Jump to latest</span>
        </button>
      )}
    </div>
  );
};
