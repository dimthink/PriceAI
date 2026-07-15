"use client";

import { ImageUp, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { useRef } from "react";
import type { FailedFeedbackEvidenceUpload, UploadedFeedbackEvidence } from "@/lib/use-feedback-evidence-upload";

export function FeedbackEvidenceUploader({
  accountLoaded,
  canUpload,
  description,
  failed,
  maxImages,
  onRemoveFailed,
  onRemoveUploaded,
  onRetryFailed,
  onUpload,
  required,
  uploaded,
  uploading,
}: {
  accountLoaded: boolean;
  canUpload: boolean;
  description: string;
  failed: FailedFeedbackEvidenceUpload[];
  maxImages: number;
  onRemoveFailed: (id: string) => void;
  onRemoveUploaded: (reference: string) => void;
  onRetryFailed: (id: string) => void;
  onUpload: (files: File[]) => void;
  required: boolean;
  uploaded: UploadedFeedbackEvidence[];
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemCount = uploaded.length + failed.length;

  return (
    <div className="rounded-lg border border-[#adb3b4]/25 bg-[#f7f9f9] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#2d3435]">图片证据{required ? "（必填）" : ""}</p>
          <p className="mt-1 text-xs leading-5 text-[#5a6061]">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => canUpload ? inputRef.current?.click() : undefined}
          disabled={!accountLoaded || !canUpload || uploading || itemCount >= maxImages}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/30 transition hover:bg-[#eef1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
          上传图片
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            onUpload(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
      </div>

      {uploaded.length || failed.length ? (
        <div className="mt-3 grid gap-2" aria-live="polite">
          {uploaded.map((item) => (
            <div key={item.url} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-xs text-[#5a6061] ring-1 ring-[#adb3b4]/20">
              <span className="min-w-0 truncate">{item.name} · {formatFileSize(item.size)}</span>
              <span className="inline-flex items-center gap-2">
                <span className="font-semibold text-[#2f7a4b]">已上传</span>
                <button
                  type="button"
                  onClick={() => onRemoveUploaded(item.url)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7a8587] transition hover:bg-[#f2f4f4] hover:text-[#9b3328] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40"
                  aria-label={`删除图片证据 ${item.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
          {failed.map((item) => (
            <div key={item.id} className="rounded-md bg-[#fbe9e7] px-3 py-2 text-xs text-[#8f2f24] ring-1 ring-[#e8c2bd]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{item.file.name} · {formatFileSize(item.file.size)}</span>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRetryFailed(item.id)}
                    disabled={uploading}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-white px-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40 disabled:opacity-60"
                  >
                    <RotateCcw size={12} />
                    重试
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveFailed(item.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40"
                    aria-label={`移除失败图片 ${item.file.name}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
              <p className="mt-1 leading-5">上传失败：{item.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
