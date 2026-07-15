"use client";

import { Check, KeyRound, Loader2 } from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import type { AdminSummary } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export type AdminPasswordStatus = AdminSummary["passwordStatus"];

export type AdminPasswordDraft = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function AdminPasswordPanel({
  status,
  draft,
  loading,
  onDraftChange,
  onSubmit,
}: {
  status: AdminPasswordStatus;
  draft: AdminPasswordDraft;
  loading: boolean;
  onDraftChange: Dispatch<SetStateAction<AdminPasswordDraft>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound size={15} className="text-[#5a6061]" />
            <h3 className="text-sm font-semibold text-[#202829]">后台密码</h3>
            <StatusBadge tone={passwordStatusTone(status)}>{status.configured ? "已配置" : "未配置"}</StatusBadge>
            <StatusBadge tone={passwordSourceTone(status.source)}>来源：{passwordSourceLabel(status.source)}</StatusBadge>
          </div>
          <p className="mt-1 max-w-[78ch] text-xs leading-5 text-[#5a6061]">
            新密码会加盐哈希后保存；保存成功后旧后台会话失效，当前会话自动续签。
          </p>
          {status.message ? <p className="mt-1 text-xs text-[#7a541b]">{status.message}</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a9293]">
          <span>最短：{status.minLength} 位</span>
          {status.updatedAt ? <span>更新：{formatRelativeTime(status.updatedAt)}</span> : <span>尚未在后台保存</span>}
        </div>
      </div>

      <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]" onSubmit={onSubmit}>
        <PasswordField
          label="当前密码"
          value={draft.currentPassword}
          autoComplete="current-password"
          onChange={(value) => onDraftChange((prev) => ({ ...prev, currentPassword: value }))}
        />
        <PasswordField
          label="新密码"
          value={draft.newPassword}
          autoComplete="new-password"
          minLength={status.minLength}
          onChange={(value) => onDraftChange((prev) => ({ ...prev, newPassword: value }))}
        />
        <PasswordField
          label="确认新密码"
          value={draft.confirmPassword}
          autoComplete="new-password"
          minLength={status.minLength}
          onChange={(value) => onDraftChange((prev) => ({ ...prev, confirmPassword: value }))}
        />
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !status.configured}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60 lg:w-auto"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            保存
          </button>
        </div>
      </form>

      <div className="mt-4 grid gap-2 rounded-lg bg-[#f2f4f4] p-3 text-xs leading-5 text-[#5a6061] md:grid-cols-3">
        <span>新密码至少包含字母、数字、符号中的两类。</span>
        <span>数据库密码保存后，旧 ADMIN_PASSWORD 自动失效；紧急恢复使用独立 break-glass。</span>
        <span>采集任务继续使用 CRON_SECRET，不依赖后台密码。</span>
      </div>
    </section>
  );
}

function PasswordField({
  label,
  value,
  autoComplete,
  minLength,
  onChange,
}: {
  label: string;
  value: string;
  autoComplete: string;
  minLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5a6061]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete={autoComplete}
        minLength={minLength}
        className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
      />
    </label>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "success" | "danger" | "info" | "warn" | "muted" }) {
  const className = {
    success: "bg-[#e8f3ec] text-[#2f7a4b]",
    danger: "bg-[#fbe9e7] text-[#9b3328]",
    info: "bg-[#eef3f8] text-[#47657a]",
    warn: "bg-[#fff7e8] text-[#7a541b]",
    muted: "bg-[#f2f4f4] text-[#5a6061]",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function passwordSourceLabel(value: AdminPasswordStatus["source"]): string {
  if (value === "database") return "后台配置";
  if (value === "environment") return "环境变量";
  return "未配置";
}

function passwordStatusTone(status: AdminPasswordStatus): "success" | "warn" | "danger" {
  if (!status.configured) return "danger";
  return status.tableReady ? "success" : "warn";
}

function passwordSourceTone(value: AdminPasswordStatus["source"]): "success" | "info" | "danger" {
  if (value === "database") return "success";
  if (value === "environment") return "info";
  return "danger";
}
