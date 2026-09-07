"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useRef } from "react";

export function AdminImageUploadButton({
  accept,
  disabled = false,
  loading,
  onSelect,
}: {
  accept: string;
  disabled?: boolean;
  loading: boolean;
  onSelect: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isDisabled = disabled || loading;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isDisabled}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d3435]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
        上传
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={isDisabled}
        onChange={(event) => {
          onSelect(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
