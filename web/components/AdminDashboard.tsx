import React, { useState, useEffect } from 'react';
import { Shield, KeyRound, Trash2, ExternalLink, BarChart3, Database, RefreshCw, LogOut, Check, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { MessageItem } from './MessageFeed';

interface AdminStats {
  total_links: number;
  total_clicks: number;
  total_files: number;
  permanent_files: number;
  temporal_files: number;
}

interface ShortLinkItem {
  id: string;
  slug: string;
  destination_url: string;
  clicks_count: number;
  created_at: number;
  short_url: string;
}

interface FileItem {
  key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_type: 'temporal' | 'permanent';
  view_url: string;
}

export const AdminDashboard: React.FC = () => {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('admin_token'));
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [links, setLinks] = useState<ShortLinkItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const fetchAdminData = async (authToken: string) => {
    try {
      // 1. Fetch stats
      const statsRes = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (statsRes.status === 401) {
        setToken(null);
        sessionStorage.removeItem('admin_token');
        toast.error('Session expired. Please log in again.');
        return;
      }

      if (statsRes.ok) {
        const statsData = (await statsRes.json()) as { success: boolean; stats: AdminStats };
        setStats(statsData.stats);
      }

      // 2. Fetch links
      const linksRes = await fetch('/api/links');
      if (linksRes.ok) {
        const linksData = (await linksRes.json()) as { success: boolean; links: ShortLinkItem[] };
        setLinks(linksData.links);
      }

      // 3. Fetch files
      const filesRes = await fetch('/api/files');
      if (filesRes.ok) {
        const filesData = (await filesRes.json()) as { success: boolean; files: FileItem[] };
        setFiles(filesData.files);
      }

      // 4. Fetch messages
      const msgsRes = await fetch('/api/messages');
      if (msgsRes.ok) {
        const msgsData = (await msgsRes.json()) as { success: boolean; messages: MessageItem[] };
        setMessages(msgsData.messages || []);
      }
    } catch {
      toast.error('Failed to load administrative data');
    }
  };

  useEffect(() => {
    if (token) {
      fetchAdminData(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = (await res.json()) as { success: boolean; token?: string; error?: string };

      if (!res.ok || !data.success || !data.token) {
        toast.error(data.error || 'Invalid password');
      } else {
        setToken(data.token);
        sessionStorage.setItem('admin_token', data.token);
        toast.success('Admin authentication successful');
        setPassword('');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    sessionStorage.removeItem('admin_token');
    toast.info('Logged out of admin panel');
  };

  const handleDeleteLink = async (id: string, slug: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete short link /${slug}?`)) return;

    try {
      const res = await fetch(`/api/admin/links/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast.success(`Deleted link: /${slug}`);
        setLinks((prev) => prev.filter((l) => l.id !== id));
        fetchAdminData(token);
      } else {
        toast.error('Failed to delete short link');
      }
    } catch {
      toast.error('Network error while deleting');
    }
  };

  const handleDeleteFile = async (key: string, name: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to permanently delete ${name}?`)) return;

    try {
      const res = await fetch('/api/admin/files', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key }),
      });

      if (res.ok) {
        toast.success(`Deleted file: ${name}`);
        setFiles((prev) => prev.filter((f) => f.key !== key));
        fetchAdminData(token);
      } else {
        toast.error('Failed to delete file from storage');
      }
    } catch {
      toast.error('Network error while deleting');
    }
  };

  const handlePurgeExpired = async () => {
    if (!token) return;

    try {
      const res = await fetch('/api/admin/purge-expired', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = (await res.json()) as { success: boolean; purged_messages?: number };
      if (res.ok && data.success) {
        toast.success(`Purge complete! Removed ${data.purged_messages || 0} expired messages.`);
        fetchAdminData(token);
      } else {
        toast.error('Failed to execute purge');
      }
    } catch {
      toast.error('Network error during purge');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to permanently delete this message?')) return;

    try {
      const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast.success('Message deleted successfully');
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } else {
        toast.error('Failed to delete message');
      }
    } catch {
      toast.error('Network error while deleting');
    }
  };

  const handleClearAllMessages = async () => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete ALL messages in the room? This action cannot be undone.')) return;

    try {
      const res = await fetch('/api/admin/messages', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = (await res.json()) as { success: boolean; purged_messages?: number };
      if (res.ok && data.success) {
        toast.success(`Cleared all messages! Removed ${data.purged_messages || 0} messages.`);
        setMessages([]);
      } else {
        toast.error('Failed to clear messages');
      }
    } catch {
      toast.error('Network error while clearing messages');
    }
  };

  // If not authenticated, render login prompt
  if (!token) {
    return (
      <div className="w-full max-w-md mt-10 p-6 rounded-2xl bg-neutral-900/80 border border-neutral-800 shadow-xl flex flex-col gap-4 text-left">
        <div className="flex items-center gap-2 text-neutral-100 font-semibold text-base">
          <Shield className="w-5 h-5 text-red-400" />
          <span>Admin Access Required</span>
        </div>
        <p className="text-xs text-neutral-400">
          Enter the master administrator password to manage links and delete storage objects.
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3 mt-2">
          <div className="relative">
            <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Administrator Password"
              required
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-sm transition-colors cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Unlock Admin Panel'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mt-8 flex flex-col gap-6 text-left">
      {/* Admin Header with Actions */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-400" />
          <span className="font-semibold text-sm text-neutral-100">Administrator Console</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePurgeExpired}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clean up messages past 24h"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Purge Expired</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase font-semibold">Total Links</span>
            <div className="text-xl font-bold text-neutral-100 mt-1">{stats.total_links}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase font-semibold">Total Clicks</span>
            <div className="text-xl font-bold text-amber-400 mt-1">{stats.total_clicks}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase font-semibold">Permanent Files</span>
            <div className="text-xl font-bold text-blue-400 mt-1">{stats.permanent_files}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase font-semibold">Ephemeral Files</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">{stats.temporal_files}</div>
          </div>
        </div>
      )}

      {/* Manage Short Links Table */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-1">
          Manage Short Links ({links.length})
        </h2>
        <div className="flex flex-col gap-2">
          {links.length === 0 ? (
            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-500 text-center">
              No short links available.
            </div>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-blue-400">/{link.slug}</span>
                    <span className="text-neutral-500">({link.clicks_count} clicks)</span>
                  </div>
                  <span className="text-neutral-400 truncate mt-0.5">{link.destination_url}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteLink(link.id, link.slug)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  title="Delete short link"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manage Storage Files Table */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-1">
          Manage Storage Objects ({files.length})
        </h2>
        <div className="flex flex-col gap-2">
          {files.length === 0 ? (
            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-500 text-center">
              No files in storage.
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.key}
                className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-200 truncate">{file.original_name}</span>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        file.storage_type === 'permanent'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {file.storage_type}
                    </span>
                  </div>
                  <span className="text-neutral-500 truncate mt-0.5">{file.key}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteFile(file.key, file.original_name)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  title="Delete file permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manage Room Messages Table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Manage Room Messages ({messages.length})
          </h2>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllMessages}
              className="text-[11px] text-red-400 hover:text-red-300 font-medium cursor-pointer"
            >
              Clear All Messages
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {messages.length === 0 ? (
            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-500 text-center">
              No messages in room.
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                      {msg.format || 'text'}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-medium">
                      via {msg.sender_type || 'web'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-neutral-300 truncate mt-1 font-mono text-[11px]">
                    {msg.content}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteMessage(msg.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer shrink-0"
                  title="Delete message permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
