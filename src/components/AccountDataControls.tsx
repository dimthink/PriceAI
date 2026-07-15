"use client";

import Link from "next/link";
import { Download, Loader2, ShieldAlert, Undo2 } from "lucide-react";
import { useState } from "react";
import type { AccountDeletionRequest } from "@/lib/account-data";

export function AccountDataControls({ initialRequest }: { initialRequest: AccountDeletionRequest | null }) {
  const [request, setRequest] = useState(initialRequest);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState<"create" | "cancel" | null>(null);
  const [message, setMessage] = useState("");

  async function createRequest() {
    if (confirmation !== "删除我的账号") {
      setMessage("请输入“删除我的账号”后再提交申请。");
      return;
    }
    await mutateRequest("POST", "create");
  }

  async function cancelRequest() {
    await mutateRequest("DELETE", "cancel");
  }

  async function mutateRequest(method: "POST" | "DELETE", action: "create" | "cancel") {
    setLoading(action);
    setMessage("");
    try {
      const response = await fetch("/api/account/deletion-request", { method });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "请求失败，请稍后再试。");
      setRequest(payload.request || null);
      setConfirmation("");
      setMessage(action === "create" ? "删除申请已提交；冷静期内可以随时取消。" : "删除申请已取消。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请求失败，请稍后再试。");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
        <h2 className="text-lg font-semibold text-[#202829]">导出账户数据</h2>
        <p className="mt-2 text-sm leading-6 text-[#5a6061]">下载当前账号在 PriceAI 中的资料、反馈、检测任务、分享记录和证据元数据。不会导出 OAuth token、Session Cookie、管理员字段或分享 token 明文。</p>
        <a
          href="/api/account/export"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white transition hover:bg-[#2d3435]"
        >
          <Download size={15} />
          下载 JSON 数据副本
        </a>
      </section>

      <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-[#9b3328]" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-[#202829]">删除账号</h2>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">提交后进入至少 7 天冷静期。到期后系统会自动删除 Auth、账户资料、检测任务、报告分享和图片证据，并把必须保留的反馈审核事实匿名化。此处不会立即物理删除数据。</p>
          </div>
        </div>

        {request ? (
          <div className="mt-4 rounded-lg bg-[#fff7e8] px-4 py-3 text-sm leading-6 text-[#6a4b16]">
            <p className="font-semibold">删除申请处理中</p>
            <p>最早处理时间：{formatDate(request.scheduledFor)}</p>
            <button
              type="button"
              onClick={() => void cancelRequest()}
              disabled={Boolean(loading)}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#6a4b16] ring-1 ring-[#e6cf9f] disabled:opacity-60"
            >
              {loading === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
              取消删除申请
            </button>
          </div>
        ) : (
          <div className="mt-4 max-w-md">
            <label className="block text-sm font-medium text-[#2d3435]" htmlFor="account-delete-confirmation">
              输入“删除我的账号”确认申请
            </label>
            <input
              id="account-delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-2 h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm outline-none transition focus:border-[#8aa69a] focus:ring-2 focus:ring-[#dcebe2]"
            />
            <button
              type="button"
              onClick={() => void createRequest()}
              disabled={Boolean(loading)}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-[#9b3328] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading === "create" ? <Loader2 size={15} className="animate-spin" /> : null}
              提交删除申请
            </button>
          </div>
        )}

        {message ? <p className="mt-3 text-sm text-[#5a6061]" aria-live="polite">{message}</p> : null}
        <p className="mt-4 text-xs leading-5 text-[#7a8284]">详细口径见 <Link href="/privacy" className="font-semibold underline underline-offset-4">隐私说明</Link>。</p>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
