import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, File as FileIcon, ExternalLink, ShieldAlert, Sparkles, Copy, Check, Clock, Download } from 'lucide-react';
import { toast } from 'sonner';

interface FileItem {
  key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_type: 'temporal' | 'permanent';
  short_slug: string | null;
  created_at: number;
  expires_at: number | null;
  view_url: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const FileDropzone: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [promotingKey, setPromotingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; files: FileItem[] };
        if (data.success) {
          setFiles(data.files);
        }
      }
    } catch {
      // Ignore network errors in offline/dev mode
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const uploadFile = async (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      toast.error('File exceeds maximum size of 500 MB');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as { success: boolean; file?: FileItem; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to upload file');
      } else {
        toast.success(`Uploaded: ${file.name}`);
        fetchFiles();
      }
    } catch {
      toast.error('Upload failed due to network error');
    } finally {
      setUploading(false);
    }
  };

  // Clipboard paste listener (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            toast.info(`Uploading pasted file: ${file.name}...`);
            uploadFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      uploadFile(droppedFiles[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      uploadFile(selectedFiles[0]);
      e.target.value = '';
    }
  };

  const handlePromote = async (fileKey: string) => {
    setPromotingKey(fileKey);
    try {
      const res = await fetch('/api/files/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: fileKey }),
      });

      const data = (await res.json()) as {
        success: boolean;
        file?: FileItem;
        short_url?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to promote file');
      } else {
        toast.success('File promoted to permanent storage!');
        fetchFiles();
      }
    } catch {
      toast.error('Network error while promoting file');
    } finally {
      setPromotingKey(null);
    }
  };

  const handleCopy = (url: string, key: string) => {
    // In local dev, prepend origin to key (e.g. http://localhost:8787/temporal/...)
    const effectiveUrl = window.location.hostname.includes('localhost')
      ? `${window.location.origin}/${key}`
      : url;

    navigator.clipboard.writeText(effectiveUrl);
    setCopiedKey(key);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="w-full max-w-2xl mt-8 flex flex-col gap-6 text-left">
      <div className="flex items-center gap-2 text-neutral-200 font-medium text-sm">
        <UploadCloud className="w-4 h-4 text-emerald-400" />
        <span>Quick File Drop (Up to 500 MB)</span>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
          isDragging
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-sm font-medium text-neutral-300">Uploading to R2 storage...</span>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-neutral-800/80 flex items-center justify-center text-neutral-300 mb-1">
              <UploadCloud className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-neutral-200">
              Drag & drop files here, click to browse, or paste with <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[11px] font-mono text-neutral-300">Ctrl+V</kbd>
            </p>
            <p className="text-xs text-neutral-500">
              Ephemeral files expire in 24 hours unless promoted to permanent.
            </p>
          </>
        )}
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-1">
            Uploaded Files ({files.length})
          </h2>
          <div className="flex flex-col gap-2">
            {files.map((file) => {
              const isPermanent = file.storage_type === 'permanent';
              const localViewerUrl = window.location.hostname.includes('localhost')
                ? `/${file.key}`
                : file.view_url;

              return (
                <div
                  key={file.key}
                  className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5">
                      <FileIcon className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={localViewerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-neutral-100 font-medium text-sm hover:text-emerald-400 transition-colors truncate max-w-[240px] sm:max-w-xs flex items-center gap-1"
                        >
                          <span>{file.original_name}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                        </a>
                        <span
                          className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                            isPermanent
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {isPermanent ? 'Permanent' : 'Ephemeral (24h)'}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500 mt-1">
                        {formatBytes(file.size_bytes)} • {file.mime_type}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {!isPermanent && (
                      <button
                        type="button"
                        onClick={() => handlePromote(file.key)}
                        disabled={promotingKey === file.key}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer border border-emerald-500/30"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{promotingKey === file.key ? 'Saving...' : 'Make Permanent'}</span>
                      </button>
                    )}

                    <a
                      href={`${localViewerUrl}${localViewerUrl.includes('?') ? '&' : '?'}download=true`}
                      download={file.original_name}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Download file directly"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      <span>Download</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(file.view_url, file.key)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedKey === file.key ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
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
