import React, { useEffect, useState } from 'react';
import { Zap, HardDrive, Wifi, Link2, UploadCloud, MessageSquare, Shield } from 'lucide-react';
import { Toaster } from 'sonner';
import { MessageFeed } from './components/MessageFeed';
import { FileDropzone } from './components/FileDropzone';
import { ShortenerForm } from './components/ShortenerForm';
import { AdminDashboard } from './components/AdminDashboard';

export const App: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<string>('Checking...');
  const [activeTab, setActiveTab] = useState<'room' | 'files' | 'shortener'>('room');

  // Check if user is navigating through the dedicated admin host (admin.share.*) or /admin route
  const isAdminMode = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('admin.share.') ||
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/') ||
    window.location.search.includes('admin')
  );

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: any) => setHealthStatus(`Online (${data.service})`))
      .catch(() => setHealthStatus('Offline / Dev'));
  }, []);

  // Isolated Admin Dashboard View
  if (isAdminMode) {
    const returnUrl = typeof window !== 'undefined'
      ? (window.location.hostname.includes('localhost')
          ? '/'
          : `${window.location.protocol}//${window.location.host.replace(/^admin\./, '')}`)
      : '/';

    return (
      <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center text-center">
        <Toaster position="bottom-right" theme="dark" richColors />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium mb-6">
          <Shield className="w-3.5 h-3.5 text-red-400" />
          <span>Admin Portal</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">
          Fast Share Admin
        </h1>
        <p className="text-neutral-400 max-w-lg mb-8 text-sm sm:text-base">
          Protected administrative dashboard for database metrics, file cleanup, and link telemetry.
        </p>

        <AdminDashboard />

        <div className="mt-12">
          <a
            href={returnUrl}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors inline-flex items-center gap-1"
          >
            ← Return to Fast Share
          </a>
        </div>
      </main>
    );
  }

  // Regular Sharing Hub View (Live Room, File Drop, URL Shortener)
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center text-center">
      <Toaster position="bottom-right" theme="dark" richColors />

      {/* Service Health Indicator */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium mb-6">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        {healthStatus}
      </div>

      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">
        Fast Share
      </h1>
      <p className="text-neutral-400 max-w-lg mb-8 text-sm sm:text-base">
        Unified real-time room, fast file drop (up to 500 MB), and URL shortener.
      </p>

      {/* Mode Navigation Tabs */}
      <div className="inline-flex p-1 rounded-xl bg-neutral-900 border border-neutral-800 mb-2 flex-wrap justify-center">
        <button
          type="button"
          onClick={() => setActiveTab('room')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            activeTab === 'room'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>Live Room</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            activeTab === 'files'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-blue-400" />
          <span>File Drop</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shortener')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            activeTab === 'shortener'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Link2 className="w-4 h-4 text-amber-400" />
          <span>URL Shortener</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'room' && <MessageFeed />}
      {activeTab === 'files' && <FileDropzone />}
      {activeTab === 'shortener' && <ShortenerForm />}

      {/* Architecture Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl text-left mt-14">
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold mb-1">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span>Real-time Room</span>
          </div>
          <p className="text-xs text-neutral-400">Durable Objects with WebSocket Hibernation API (zero idle CPU).</p>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold mb-1">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span>R2 Dual Storage</span>
          </div>
          <p className="text-xs text-neutral-400">24h ephemeral under temporal storage or promoted to permanent.</p>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Fast URL Shortener</span>
          </div>
          <p className="text-xs text-neutral-400">Zero-latency redirects with click telemetry and native viewer.</p>
        </div>
      </div>
    </main>
  );
};
