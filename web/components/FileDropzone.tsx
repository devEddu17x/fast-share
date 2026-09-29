import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, File as FileIcon, ExternalLink, Sparkles, Copy, Check, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getDeviceId } from '../utils/device';

export interface FileItem {
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

interface FileDropzoneProps {
  onFileUploaded?: () => void;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileUploaded }) => {
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
      // Dev mode ignore
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const uploadFile = async (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      toast.error('File size exceeds maximum 500 MB limit');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'x-device-id': getDeviceId(),
        },
        body: formData,
      });

      const data = (await res.json()) as { success: boolean; file?: FileItem; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to upload file');
      } else {
        toast.success(`Uploaded: ${file.name}`);
        fetchFiles();
        if (onFileUploaded) onFileUploaded();
      }
    } catch {
      toast.error('Network error uploading file');
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
      toast.error('Network error promoting file');
    } finally {
      setPromotingKey(null);
    }
  };

  const handleCopy = (url: string, key: string) => {
    const effectiveUrl = window.location.hostname.includes('localhost')
      ? `${window.location.origin}/${key}`
      : url;

    navigator.clipboard.writeText(effectiveUrl);
    setCopiedKey(key);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="h-full flex flex-col p-5 gap-5 overflow-y-auto">
      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        aria-label="File upload dropzone"
        className={`p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3 ${
          isDragging
            ? 'border-neutral-400 bg-neutral-900/90'
            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900/40'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3 py-3">
            <span className="w-8 h-8 border-2 border-neutral-600 border-t-neutral-100 rounded-full animate-spin" />
            <span className="text-sm font-medium text-neutral-300">Uploading to R2...</span>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300">
              <UploadCloud className="w-6 h-6 text-neutral-300" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-neutral-100">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-neutral-400">
                Paste directly with <kbd className="px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-xs border border-neutral-800">Ctrl+V</kbd> (Up to 500 MB)
              </p>
            </div>
          </>
        )}
      </div>

      {/* Files List */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between text-sm text-neutral-300 px-1 border-b border-neutral-800/80 pb-2">
          <span className="font-semibold text-neutral-200">Uploaded Files</span>
          <span className="font-mono text-xs text-neutral-400">{files.length} files</span>
        </div>

        {files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-neutral-400 text-sm py-10">
            No files in the library yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {files.map((file) => {
              const isPermanent = file.storage_type === 'permanent';
              const localViewerUrl = window.location.hostname.includes('localhost')
                ? `/${file.key}`
                : file.view_url;

              return (
                <div
                  key={file.key}
                  className="p-4 rounded-xl bg-neutral-900/60 border border-blue-900/30 hover:border-blue-700/50 flex flex-col gap-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center shrink-0 mt-0.5">
                        <FileIcon className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={localViewerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:text-blue-300 font-medium text-sm hover:underline truncate max-w-xs sm:max-w-md flex items-center gap-1"
                          >
                            <span>{file.original_name}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400/70" />
                          </a>
                        </div>
                        <span className="text-xs font-mono text-neutral-400 mt-0.5">
                          {formatBytes(file.size_bytes)} • {isPermanent ? 'Permanent' : 'Ephemeral (24h)'}
                        </span>
                      </div>
                    </div>

                    {/* Subtle Make Permanent button when ephemeral */}
                    {!isPermanent && (
                      <button
                        type="button"
                        onClick={() => handlePromote(file.key)}
                        disabled={promotingKey === file.key}
                        className="text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                        title="Promote to permanent storage"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{promotingKey === file.key ? 'Saving...' : 'Make permanent'}</span>
                      </button>
                    )}
                  </div>

                  {/* Primary Actions: Download & Copy Link */}
                  <div className="flex items-center justify-end gap-2.5 pt-1.5 border-t border-neutral-800/60">
                    <button
                      type="button"
                      onClick={() => handleCopy(file.view_url, file.key)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium flex items-center gap-1.5 border border-neutral-800 transition-colors cursor-pointer"
                    >
                      {copiedKey === file.key ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy link</span>
                        </>
                      )}
                    </button>

                    <a
                      href={`${localViewerUrl}${localViewerUrl.includes('?') ? '&' : '?'}download=true`}
                      download={file.original_name}
                      className="px-3.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                      title="Download file"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
