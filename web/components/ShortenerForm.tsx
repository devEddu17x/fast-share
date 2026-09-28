import React, { useState, useEffect } from 'react';
import { Link2, Copy, Check, ExternalLink, ArrowRight, Clock, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

interface ShortLinkItem {
  id: string;
  slug: string;
  destination_url: string;
  clicks_count: number;
  created_at: number;
  short_url: string;
}

export const ShortenerForm: React.FC = () => {
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
      // Ignore network errors in offline/dev mode
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
      }
    } catch {
      toast.error('Network connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (shortUrl: string, id: string) => {
    // In local dev, replace domain with local redirect path if on localhost
    const effectiveUrl = window.location.hostname.includes('localhost')
      ? `${window.location.origin}/r/${shortUrl.split('/').pop()}`
      : shortUrl;

    navigator.clipboard.writeText(effectiveUrl);
    setCopiedId(id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full max-w-2xl mt-8 flex flex-col gap-6 text-left">
      <form
        onSubmit={handleSubmit}
        className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 shadow-xl backdrop-blur-sm flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-neutral-200 font-medium text-sm">
          <Link2 className="w-4 h-4 text-blue-400" />
          <span>Shorten a URL</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/very/long/url..."
            required
            className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="custom-slug (optional)"
            className="w-full sm:w-48 px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Shorten</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {links.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-1">
            Active Short Links ({links.length})
          </h2>
          <div className="flex flex-col gap-2">
            {links.map((link) => {
              const localRedirectUrl = window.location.hostname.includes('localhost')
                ? `/r/${link.slug}`
                : link.short_url;

              return (
                <div
                  key={link.id}
                  className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={localRedirectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 font-semibold text-sm hover:underline flex items-center gap-1"
                      >
                        <span>/{link.slug}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                      </a>
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                        <MousePointerClick className="w-3 h-3" />
                        {link.clicks_count} {link.clicks_count === 1 ? 'click' : 'clicks'}
                      </span>
                    </div>
                    <span className="text-xs text-neutral-500 truncate mt-1">
                      {link.destination_url}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleCopy(link.short_url, link.id)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
