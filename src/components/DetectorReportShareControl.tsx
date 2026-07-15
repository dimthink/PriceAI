"use client";

import { Check, Copy, Link2, Loader2, ShieldOff } from "lucide-react";
import { useState } from "react";

export function DetectorReportShareControl({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState<"create" | "revoke" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");

  async function createShare() {
    setLoading("create");
    setMessage("");
    try {
      const response = await fetch(`/api/account/detector-jobs/${encodeURIComponent(jobId)}/share`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.sharePath) throw new Error(payload.message || "创建分享链接失败。");
      const nextUrl = new URL(String(payload.sharePath), window.location.origin).toString();
      setShareUrl(nextUrl);
      setMessage("已生成新的脱敏分享链接；此前链接已撤销。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建分享链接失败。");
    } finally {
      setLoading(null);
    }
  }

  async function revokeShares() {
    setLoading("revoke");
    setMessage("");
    try {
      const response = await fetch(`/api/account/detector-jobs/${encodeURIComponent(jobId)}/share`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "撤销分享失败。");
      setShareUrl("");
      setMessage("这份报告的公开分享已撤销。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "撤销分享失败。");
    } finally {
      setLoading(null);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setMessage("分享链接已复制。");
  }

  return (
    <div className="mt-2 flex max-w-[360px] flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={createShare}
          disabled={Boolean(loading)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#edf8f1] px-3 text-xs font-semibold text-[#2f6f49] disabled:opacity-60"
        >
          {loading === "create" ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
          {shareUrl ? "重新生成" : "生成分享"}
        </button>
        <button
          type="button"
          onClick={revokeShares}
          disabled={Boolean(loading)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061] disabled:opacity-60"
        >
          {loading === "revoke" ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
          撤销分享
        </button>
      </div>
      {shareUrl ? (
        <button type="button" onClick={copyShareUrl} className="inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-[#2f6f49]">
          <Copy size={13} />
          <span className="max-w-[300px] truncate">{shareUrl}</span>
        </button>
      ) : null}
      {message ? (
        <p className="flex items-start gap-1 text-right text-xs leading-5 text-[#5a6061]" aria-live="polite">
          {shareUrl ? <Check size={13} className="mt-1 shrink-0 text-[#2f7a4b]" /> : null}
          {message}
        </p>
      ) : null}
    </div>
  );
}
