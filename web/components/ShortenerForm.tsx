import React, { useState, useEffect } from 'react';
import { Link2, Copy, Check, ExternalLink, ArrowRight, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

export interface ShortLinkItem {
  id: string;
  slug: string;
  destination_url: string;
  clicks_count: number;
  created_at: number;
  short_url: string;
}

interface ShortenerFormProps {
  onLinkCreated?: () => void;
}

export const ShortenerForm: React.FC<ShortenerFormProps> = ({ onLinkCreated }) => {
  const [url, setUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<ShortLinkItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLinks = async () => {
    try {
      const res = await fetch('/api/links');
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; links: ShortLinkItem[] };
        if (data.success) {
          setLinks(data.links);
        }
      }
    } catch {
      // Offline mode
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          slug: slug.trim() || undefined,
        }),
      });

      const data = (await res.json()) as { success: boolean; link?: ShortLinkItem; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to create short link');
      } else {
        toast.success(`Short link created: /${data.link?.slug}`);
        setUrl('');
        setSlug('');
        fetchLinks();
        if (onLinkCreated) onLinkCreated();
      }
    } catch {
      toast.error('Network connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (shortUrl: string, id: string) => {
    const effectiveUrl = window.location.hostname.includes('localhost')
      ? `${window.location.origin}/r/${shortUrl.split('/').pop()}`
      : shortUrl;

    navigator.clipboard.writeText(effectiveUrl);
    setCopiedId(id);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col p-5 gap-5 overflow-y-auto">
      {/* Create Short Link Form */}
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col gap-3.5 shadow-sm"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
          <Link2 className="w-4 h-4 text-emerald-400" />
          <span>Shorten a URL</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="destination-url" className="sr-only">
            Destination URL
          </label>
          <input
            id="destination-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/very/long/url..."
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-600 transition-colors"
          />

          <div className="flex gap-2">
            <label htmlFor="custom-slug" className="sr-only">
              Custom slug
            </label>
            <input
              id="custom-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="custom-slug (optional)"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 px-4 py-3 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-600 transition-colors font-mono"
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-3 rounded-lg bg-neutral-100 hover:bg-white disabled:opacity-40 text-neutral-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-neutral-400 border-t-neutral-950 rounded-full animate-spin" />
              ) : (
                <>
                  <span>Shorten</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Existing Short Links */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between text-sm text-neutral-300 px-1 border-b border-neutral-800/80 pb-2">
          <span className="font-semibold text-neutral-200">Active Short Links</span>
          <span className="font-mono text-xs text-neutral-400">{links.length} links</span>
        </div>

        {links.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-neutral-400 text-sm py-10">
            No short links created yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {links.map((link) => {
              const localRedirectUrl = window.location.hostname.includes('localhost')
                ? `/r/${link.slug}`
                : link.short_url;

              return (
                <div
                  key={link.id}
                  className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={localRedirectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 font-mono font-medium text-sm hover:underline flex items-center gap-1"
                      >
                        <span>/{link.slug}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                      </a>
                      <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                        <MousePointerClick className="w-3 h-3 text-neutral-400" />
                        <span>{link.clicks_count}</span>
                      </span>
                    </div>
                    <span className="text-xs text-neutral-400 truncate mt-1">
                      {link.destination_url}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(link.short_url, link.id)}
                    aria-label={`Copy link ${link.slug}`}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium flex items-center gap-1 border border-neutral-800 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedId === link.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
