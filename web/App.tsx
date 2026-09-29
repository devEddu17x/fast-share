import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  UploadCloud,
  Link2,
  Shield,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { MessageFeed, MessageItem } from './components/MessageFeed';
import { MessageComposer } from './components/MessageComposer';
import { FileDropzone } from './components/FileDropzone';
import { ShortenerForm } from './components/ShortenerForm';
import { AdminDashboard } from './components/AdminDashboard';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'composer' | 'files' | 'shortener'>('composer');
  const wsRef = useRef<WebSocket | null>(null);

  // Check if in admin mode (strictly through host or URL parameter, no UI link)
  const isAdminMode =
    typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('admin.share.') ||
      window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/') ||
      window.location.search.includes('admin'));

  // Fetch initial messages
  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; messages: MessageItem[] };
        if (data.success && Array.isArray(data.messages)) {
          setMessages(data.messages.slice(-100));
        }
      }
    } catch {
      // Dev mode ignore
    }
  };

  // Connect to persistent WebSocket
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
              const next = [...prev, payload.data];
              return next.length > 100 ? next.slice(-100) : next;
            });
          } else if (payload.type === 'message_deleted' && payload.data?.id) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.data.id));
          } else if (payload.type === 'messages_cleared') {
            setMessages([]);
          } else if (payload.type === 'file_uploaded' && payload.data) {
            toast.info(`New file dropped: ${payload.data.original_name}`);
            fetchMessages();
          } else if (payload.type === 'error' && payload.message) {
            toast.error(payload.message);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!isSubscribed) return;
        setConnected(false);
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

  // Admin View
  if (isAdminMode) {
    const returnUrl =
      typeof window !== 'undefined'
        ? window.location.hostname.includes('localhost')
          ? '/'
          : `${window.location.protocol}//${window.location.host.replace(/^admin\./, '')}`
        : '/';

    return (
      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center text-center">
        <Toaster position="bottom-right" theme="dark" richColors />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 text-red-400 border border-red-800/60 text-xs font-medium mb-6">
          <Shield className="w-3.5 h-3.5 text-red-400" />
          <span>Admin Portal</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-100 mb-2">
          Fast Share Admin
        </h1>
        <p className="text-neutral-400 max-w-lg mb-8 text-base">
          Protected administrative dashboard for database metrics, file cleanup, and link telemetry.
        </p>

        <AdminDashboard />

        <div className="mt-8">
          <a
            href={returnUrl}
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors inline-flex items-center gap-1 font-mono"
          >
            ← Return to Fast Share
          </a>
        </div>
      </main>
    );
  }

  // Workstation View (2-Column Split: Left Feed / Right Tool Workspace)
  return (
    <div className="h-screen w-full flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Toaster position="bottom-right" theme="dark" richColors toastOptions={{ duration: 1500 }} />

      {/* Top Application Bar - Clean & Seamless (no dividing border, no live clutter) */}
      <header className="h-12 px-5 bg-neutral-950 flex items-center justify-between shrink-0 select-text">
        <div className="flex items-center gap-2.5 select-text">
          <span className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center font-mono text-sm text-neutral-200">
            ⚡
          </span>
          <span className="font-bold text-lg tracking-tight text-white select-text">
            Fast Share
          </span>
        </div>
      </header>

      {/* Main Dual-Column Split Workstation */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 min-w-0 divide-y md:divide-y-0 md:divide-x divide-neutral-800/80 overflow-hidden">
        {/* Left Column: Continuous Live Activity Stream */}
        <section className="flex-1 flex flex-col min-h-0 min-w-0 bg-neutral-950 overflow-hidden">
          <MessageFeed
            messages={messages}
            connected={connected}
            onRefresh={fetchMessages}
          />
        </section>

        {/* Right Column: Active Tool Workspace (Bounded & Non-overflowing) */}
        <section className="w-full md:w-[460px] lg:w-[500px] xl:w-[540px] md:max-w-[50%] flex flex-col min-h-0 min-w-0 bg-neutral-950">
          {/* Tool Workspace Tabs with responsive grid layout */}
          <div className="h-14 px-3 sm:px-4 border-b border-neutral-800/80 flex items-center justify-between shrink-0 bg-neutral-950/80 backdrop-blur-sm min-w-0">
            <div
              role="tablist"
              aria-label="Active Tools"
              className="grid grid-cols-3 p-1 rounded-xl bg-neutral-900 border border-neutral-800 w-full gap-1 min-w-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'composer'}
                onClick={() => setActiveTab('composer')}
                className={`py-2 px-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 min-w-0 select-text ${
                  activeTab === 'composer'
                    ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-neutral-300 shrink-0" />
                <span className="truncate select-text">Send</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'files'}
                onClick={() => setActiveTab('files')}
                className={`py-2 px-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 min-w-0 select-text ${
                  activeTab === 'files'
                    ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <UploadCloud className="w-4 h-4 text-neutral-300 shrink-0" />
                <span className="truncate select-text">Files</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'shortener'}
                onClick={() => setActiveTab('shortener')}
                className={`py-2 px-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 min-w-0 select-text ${
                  activeTab === 'shortener'
                    ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Link2 className="w-4 h-4 text-neutral-300 shrink-0" />
                <span className="truncate select-text">Shorten</span>
              </button>
            </div>
          </div>

          {/* Active Tool Panels: Kept mounted in DOM to preserve state/drafts across tab switches */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            <div className={`h-full flex-1 flex flex-col ${activeTab === 'composer' ? 'flex' : 'hidden'}`}>
              <MessageComposer onSent={fetchMessages} />
            </div>
            <div className={`h-full flex-1 flex flex-col ${activeTab === 'files' ? 'flex' : 'hidden'}`}>
              <FileDropzone onFileUploaded={fetchMessages} />
            </div>
            <div className={`h-full flex-1 flex flex-col ${activeTab === 'shortener' ? 'flex' : 'hidden'}`}>
              <ShortenerForm onLinkCreated={fetchMessages} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
