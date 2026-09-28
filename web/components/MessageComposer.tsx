import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Code2,
  Send,
  Paperclip,
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface MessageComposerProps {
  onSent?: () => void;
}

interface MatchCoord {
  index: number;
  length: number;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSent }) => {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'text' | 'code'>('text');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // VS Code-style find & replace
  const [showFind, setShowFind] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const lines = format === 'code' ? content.split('\n') : [];
  const lineCount = Math.max(lines.length, 1);

  // Calculate all matches for search query
  const matches = useMemo<MatchCoord[]>(() => {
    if (!searchQuery) return [];
    const results: MatchCoord[] = [];
    let startIndex = 0;
    const lowerContent = content.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const queryLen = searchQuery.length;

    while (startIndex < content.length) {
      const idx = lowerContent.indexOf(lowerQuery, startIndex);
      if (idx === -1) break;
      results.push({ index: idx, length: queryLen });
      startIndex = idx + queryLen;
    }
    return results;
  }, [content, searchQuery]);

  // Keep current match index in bounds
  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(0);
    }
  }, [matches, currentMatchIndex]);

  // Scroll editor to match position without stealing focus away from findInput
  const scrollEditorToMatch = (matchIdx: number) => {
    if (!matches[matchIdx] || !textareaRef.current) return;
    const match = matches[matchIdx];

    // Calculate line number of match
    const textBefore = content.substring(0, match.index);
    const lineNum = textBefore.split('\n').length - 1;
    const lineHeight = 24; // approximate line height in px
    const targetScroll = Math.max(0, lineNum * lineHeight - 60);

    textareaRef.current.scrollTop = targetScroll;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = targetScroll;
    }
  };

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    scrollEditorToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    scrollEditorToMatch(prevIdx);
  };

  const handleReplaceCurrent = () => {
    if (matches.length === 0 || !matches[currentMatchIndex]) return;
    const match = matches[currentMatchIndex];
    const before = content.substring(0, match.index);
    const after = content.substring(match.index + match.length);
    const updated = before + replaceQuery + after;
    setContent(updated);
    toast.success('Replaced 1 match');
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (content.match(regex) || []).length;
    if (count === 0) {
      toast.info('No matches to replace');
      return;
    }
    const updated = content.replaceAll(regex, replaceQuery);
    setContent(updated);
    toast.success(`Replaced ${count} matches`);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

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

      setContent('');
      toast.success(format === 'code' ? 'Code snippet shared' : 'Message sent', { duration: 1500 });
      if (onSent) onSent();
    } catch {
      toast.error('Network error sending message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // VS Code-style Find Bar trigger with Ctrl+F / Cmd+F
    if (format === 'code' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowFind((prev) => {
        const next = !prev;
        if (next) {
          setTimeout(() => findInputRef.current?.focus(), 50);
        }
        return next;
      });
      return;
    }

    // Dismiss Find Bar with Esc
    if (showFind && e.key === 'Escape') {
      e.preventDefault();
      setShowFind(false);
      return;
    }

    if (format === 'text') {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // In code mode, Tab key indentation support
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = e.currentTarget.selectionStart;
        const end = e.currentTarget.selectionEnd;
        const newContent = content.substring(0, start) + '  ' + content.substring(end);
        setContent(newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
          }
        }, 0);
        return;
      }

      // In code mode, Ctrl+Enter or Cmd+Enter to send
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleFindBarKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      e.stopPropagation();
      setShowFind(false);
      textareaRef.current?.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    }
  };

  const uploadFile = async (file: File) => {
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('File size exceeds 500 MB limit');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload error');
      }

      toast.success(`${file.name} uploaded and shared`, { id: toastId });
      if (onSent) onSent();
    } catch {
      toast.error('Failed to upload file', { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  // Sync scrolling between textarea and backdrop highlights
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Render highlights for the code backdrop
  // Current active match is subtle luminous amber ring; other matches are soft amber tint
  const renderHighlightedContent = () => {
    if (!showFind || !searchQuery.trim() || matches.length === 0) {
      return content;
    }

    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      // Unmatched segment before
      if (match.index > lastIndex) {
        segments.push(content.substring(lastIndex, match.index));
      }
      // Highlighted match segment: Active is luminous amber ring; others are soft amber tint
      const isCurrent = idx === currentMatchIndex;
      segments.push(
        <mark
          key={idx}
          className={`${
            isCurrent
              ? 'bg-amber-400/35 ring-1.5 ring-amber-400'
              : 'bg-amber-500/20 ring-1 ring-amber-500/30'
          } rounded-xs text-transparent select-none`}
        >
          {content.substring(match.index, match.index + match.length)}
        </mark>
      );
      lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
      segments.push(content.substring(lastIndex));
    }

    return segments;
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleFileDrop}
      className={`h-full flex-1 flex flex-col justify-between p-5 transition-colors min-w-0 ${
        isDragging ? 'bg-neutral-900/90 ring-2 ring-neutral-500 inset-0' : 'bg-neutral-950'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
        className="hidden"
      />

      {/* Top Controls: Mode Switcher */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0">
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="inline-flex p-1 rounded-xl bg-neutral-900 border border-neutral-800 gap-1">
            <button
              type="button"
              onClick={() => {
                setFormat('text');
                setShowFind(false);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2 ${
                format === 'text'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-neutral-300" />
              <span>Plain Text</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('code')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2 ${
                format === 'code'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Code2 className="w-4 h-4 text-neutral-300" />
              <span>Code</span>
            </button>
          </div>

          <span className="text-xs text-neutral-400 font-mono hidden sm:inline truncate text-right">
            {format === 'code' ? 'Ctrl+F find • Tab indent' : 'Drag & drop supported'}
          </span>
        </div>

        {/* Full-Height Native Workspace Container */}
        <div
          className={`relative flex-1 min-h-0 min-w-0 rounded-xl border bg-neutral-950 overflow-hidden flex flex-col transition-colors shadow-inner ${
            format === 'code'
              ? 'border-neutral-800/90 focus-within:border-amber-500/50'
              : 'border-neutral-800/90 focus-within:border-neutral-600'
          }`}
        >
          {/* Real VS Code Floating Find Widget with Integrated Search Icon */}
          {format === 'code' && showFind && (
            <div className="absolute top-2.5 right-2.5 z-30 p-2 rounded-lg bg-neutral-900/98 border border-neutral-700 shadow-2xl backdrop-blur-md flex flex-col gap-2 text-sm animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100%-20px)] sm:w-80">
              {/* Find row: Search icon strictly inside the input box */}
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="relative flex-1 min-w-0 flex items-center">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 pointer-events-none" />
                  <input
                    ref={findInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleFindBarKeyDown}
                    placeholder="Find (Enter next, Shift+Enter prev)"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full bg-neutral-950 border border-neutral-700/80 pl-8 pr-16 py-1 rounded text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                  {/* Match Counter x/total placed inside right edge of input like VS Code */}
                  <span className="absolute right-2 text-xs font-mono text-neutral-400 select-none">
                    {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0/0'}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrevMatch}
                    disabled={matches.length === 0}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMatch}
                    disabled={matches.length === 0}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="Next match (Enter)"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReplace((v) => !v)}
                    className={`p-1 rounded text-xs font-mono hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer ${
                      showReplace ? 'bg-neutral-800 text-amber-400' : ''
                    }`}
                    title="Toggle Replace"
                  >
                    <Replace className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFind(false);
                      textareaRef.current?.focus();
                    }}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Replace row */}
              {showReplace && (
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-neutral-800">
                  <span className="w-4 text-center text-neutral-500 text-sm shrink-0">↳</span>
                  <input
                    type="text"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    onKeyDown={handleFindBarKeyDown}
                    placeholder="Replace"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="flex-1 bg-neutral-950 border border-neutral-700/80 px-2.5 py-1 rounded text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-amber-400 font-mono min-w-0"
                  />
                  <button
                    type="button"
                    onClick={handleReplaceCurrent}
                    disabled={matches.length === 0}
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                    title="Replace current match"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleReplaceAll}
                    disabled={matches.length === 0}
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                    title="Replace all matches"
                  >
                    All
                  </button>
                </div>
              )}
            </div>
          )}

          {format === 'code' ? (
            <div className="flex h-full flex-1 min-h-0 relative">
              {/* Line numbers column */}
              <div className="w-12 bg-neutral-900/40 border-r border-neutral-800/80 p-3 select-none text-right font-mono text-xs sm:text-sm text-neutral-500 leading-relaxed overflow-hidden shrink-0">
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Dual layer: Highlights backdrop + transparent interactive Textarea */}
              <div className="relative flex-1 h-full min-h-0 overflow-hidden">
                {/* Backdrop with search highlights */}
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  className="absolute inset-0 p-3 font-mono text-sm leading-relaxed overflow-hidden whitespace-pre pointer-events-none text-transparent select-none"
                >
                  {renderHighlightedContent()}
                </div>

                {/* Main Code Textarea */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={handleScroll}
                  placeholder="// Paste or write code snippet here..."
                  className="absolute inset-0 w-full h-full p-3 bg-transparent font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none resize-none leading-relaxed overflow-y-auto whitespace-pre z-10 caret-amber-400 selection:bg-amber-500/30 selection:text-amber-100"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message or note to share... (or drop files here)"
              className="w-full h-full p-4 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none resize-none leading-relaxed overflow-y-auto"
            />
          )}

          {/* Drag Overlay Hint */}
          {isDragging && (
            <div className="absolute inset-0 bg-neutral-900/95 flex flex-col items-center justify-center text-center gap-2 pointer-events-none border-2 border-dashed border-neutral-500 rounded-xl z-40">
              <Paperclip className="w-8 h-8 text-neutral-300 animate-pulse" />
              <p className="text-base font-semibold text-neutral-200">Drop to attach and share file</p>
              <p className="text-sm text-neutral-400">Up to 500 MB (ephemeral for 24 hours)</p>
            </div>
          )}
        </div>
      </div>

      {/* Composer Action Footer */}
      <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Quick Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label="Attach file"
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            title="Attach file (up to 500 MB)"
          >
            {isUploading ? (
              <span className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4 text-neutral-300" />
            )}
            <span>{isUploading ? 'Uploading...' : 'Attach File'}</span>
          </button>

          <span className="text-sm text-neutral-400 font-mono hidden md:inline">
            {format === 'code' ? 'Ctrl+Enter to send' : 'Enter to send'}
          </span>
        </div>

        {/* Send Action */}
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!content.trim()}
          className="px-6 py-2.5 rounded-lg bg-neutral-100 hover:bg-white disabled:opacity-30 disabled:hover:bg-neutral-100 text-neutral-950 text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
        >
          <span>Send</span>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
