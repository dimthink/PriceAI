"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Search,
  UserRound,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminUserDetail,
  AdminUserListResult,
  AdminUserMetrics,
  AdminUserSummary,
  FeedbackFollowup,
  OfferFeedback,
  TransitDetectorJob,
} from "@/lib/types";

type Notice = {
  type: "success" | "error" | "info";
  text: string;
};

type AdminUsersPayload = AdminUserListResult & {
  ok?: boolean;
  message?: string;
};

type AdminUserDetailPayload = {
  ok?: boolean;
  detail?: AdminUserDetail;
  message?: string;
};

const emptyMetrics: AdminUserMetrics = {
  totalUsers: 0,
  newUsers24h: 0,
  feedbackUsers: 0,
  detectorUsers: 0,
  openFeedbackUsers: 0,
  activeDetectorJobs: 0,
};

export function AdminUsersPanel() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [metrics, setMetrics] = useState<AdminUserMetrics>(emptyMetrics);
  const [total, setTotal] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const usersRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  const loadUsers = useCallback(async (nextQuery: string) => {
    const requestId = usersRequestRef.current + 1;
    usersRequestRef.current = requestId;
    setLoadingUsers(true);
    setUsersError("");

    try {
      const params = new URLSearchParams({
        q: nextQuery,
        limit: "100",
      });
      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({ ok: false, message: response.statusText }))) as AdminUsersPayload;
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "加载用户列表失败。");
      if (requestId !== usersRequestRef.current) return;

      const nextUsers = payload.users || [];
      setUsers(nextUsers);
      setMetrics(payload.metrics || emptyMetrics);
      setTotal(payload.total || 0);
      if (!nextUsers.length) {
        setSelectedUserId(null);
        setDetail(null);
        return;
      }
      setSelectedUserId((current) => {
        if (current && nextUsers.some((user) => user.id === current)) return current;
        return nextUsers[0]?.id || null;
      });
    } catch (error) {
      if (requestId !== usersRequestRef.current) return;
      setUsersError(error instanceof Error ? error.message : "加载用户列表失败。");
      setUsers([]);
      setTotal(0);
    } finally {
      if (requestId === usersRequestRef.current) setLoadingUsers(false);
    }
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setLoadingDetail(true);
    setDetailError("");
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({ ok: false, message: response.statusText }))) as AdminUserDetailPayload;
      if (!response.ok || payload.ok === false || !payload.detail) throw new Error(payload.message || "加载用户详情失败。");
      if (requestId !== detailRequestRef.current) return;
      setDetail(payload.detail);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      setDetail(null);
      setDetailError(error instanceof Error ? error.message : "加载用户详情失败。");
    } finally {
      if (requestId === detailRequestRef.current) setLoadingDetail(false);
    }
  }, []);

  async function submitFollowup(feedbackId: string, message: string) {
    setNotice(null);
    const response = await fetch("/api/admin/feedback-followups", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId, message }),
    });
    const payload = await response.json().catch(() => ({ ok: false, message: response.statusText }));
    if (!response.ok || !payload.ok) throw new Error(payload.message || "发送补充说明失败。");

    const followup = payload.followup as FeedbackFollowup;
    setDetail((current) => current
      ? { ...current, followups: [...current.followups, followup] }
      : current);
    setNotice({ type: "success", text: "已发送给用户，用户可在反馈详情里看到这条说明。" });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(debouncedQuery);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, loadUsers]);

  useEffect(() => {
    if (!selectedUserId) return;
    const timer = window.setTimeout(() => {
      void loadDetail(selectedUserId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail, selectedUserId]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UserRound size={16} className="text-[#5a6061]" />
              <h3 className="text-sm font-semibold text-[#202829]">用户管理</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#5a6061]">
              只展示 PriceAI 登录用户和其反馈、检测、沟通记录，用于完成第一轮登录闭环。
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadUsers(debouncedQuery)}
            disabled={loadingUsers}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
          >
            {loadingUsers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            刷新
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <MetricTile label="登录用户" value={metrics.totalUsers} />
          <MetricTile label="24h 新增" value={metrics.newUsers24h} tone="info" />
          <MetricTile label="反馈用户" value={metrics.feedbackUsers} />
          <MetricTile label="待处理用户" value={metrics.openFeedbackUsers} tone="warn" />
          <MetricTile label="检测用户" value={metrics.detectorUsers} />
          <MetricTile label="运行中检测" value={metrics.activeDetectorJobs} tone="info" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)]">
        <section className="min-w-0 rounded-lg border border-[#adb3b4]/20 bg-white">
          <div className="flex flex-col gap-3 border-b border-[#edf0f1] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#202829]">用户列表</h3>
              <p className="mt-1 text-xs text-[#5a6061]">当前返回 {users.length} / {total} 个用户</p>
            </div>
            <div className="relative w-full lg:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索邮箱、昵称或用户 ID"
                aria-label="搜索用户"
                className="h-9 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
              />
            </div>
          </div>

          {usersError ? (
            <InlineNotice type="error" text={usersError} />
          ) : loadingUsers && !users.length ? (
            <LoadingRows />
          ) : users.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                  <tr>
                    <th className="px-4 py-3">用户</th>
                    <th className="px-4 py-3">反馈</th>
                    <th className="px-4 py-3">检测</th>
                    <th className="px-4 py-3">最近活动</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f1]">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`cursor-pointer align-top transition-colors ${
                        user.id === selectedUserId ? "bg-[#eef3f8]" : "hover:bg-[#f7f9f9]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <UserIdentity user={user} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#202829]">{user.feedbackCount}</p>
                        <p className="mt-1 text-xs text-[#5a6061]">待处理 {user.openFeedbackCount} · 撤销 {user.withdrawnFeedbackCount}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#202829]">{user.detectorJobCount}</p>
                        <p className="mt-1 text-xs text-[#5a6061]">完成 {user.completedDetectorJobCount} · 失败 {user.failedDetectorJobCount}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-[#5a6061]">
                        {formatRelative(user.lastActivityAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="暂无用户" description="完成 Google 登录并写入用户资料后，用户会出现在这里。" />
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-[#adb3b4]/20 bg-white">
          <div className="border-b border-[#edf0f1] p-4">
            <h3 className="text-sm font-semibold text-[#202829]">用户详情</h3>
            <p className="mt-1 text-xs text-[#5a6061]">
              {selectedUser ? selectedUser.email || selectedUser.id : "选择左侧用户后查看详情。"}
            </p>
          </div>

          {notice ? <InlineNotice type={notice.type} text={notice.text} /> : null}
          {detailError ? <InlineNotice type="error" text={detailError} /> : null}
          {loadingDetail ? (
            <div className="p-5">
              <div className="flex items-center gap-2 text-sm text-[#5a6061]">
                <Loader2 size={16} className="animate-spin" />
                正在加载用户详情...
              </div>
            </div>
          ) : detail ? (
            <AdminUserDetailView detail={detail} onSubmitFollowup={submitFollowup} />
          ) : (
            <EmptyState title="未选择用户" description="从左侧选择一个用户后，可以查看反馈、检测和沟通记录。" />
          )}
        </section>
      </div>
    </div>
  );
}

function AdminUserDetailView({
  detail,
  onSubmitFollowup,
}: {
  detail: AdminUserDetail;
  onSubmitFollowup: (feedbackId: string, message: string) => Promise<void>;
}) {
  const followupsByFeedbackId = useMemo(() => {
    const map = new Map<string, FeedbackFollowup[]>();
    for (const item of detail.followups) {
      const items = map.get(item.feedbackId) || [];
      items.push(item);
      map.set(item.feedbackId, items);
    }
    return map;
  }, [detail.followups]);

  return (
    <div className="divide-y divide-[#edf0f1]">
      <section className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <UserIdentity user={detail.summary} large />
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <SmallStat label="反馈" value={detail.summary.feedbackCount} />
            <SmallStat label="待处理" value={detail.summary.openFeedbackCount} tone="warn" />
            <SmallStat label="检测" value={detail.summary.detectorJobCount} />
            <SmallStat label="失败" value={detail.summary.failedDetectorJobCount} tone="danger" />
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs leading-5 text-[#5a6061] md:grid-cols-3">
          <span>用户 ID：<span className="break-all font-mono text-[#2d3435]">{detail.profile.id}</span></span>
          <span>登录方式：{detail.profile.provider}</span>
          <span>最近登录：{formatDate(detail.profile.lastSignInAt)}</span>
        </div>
      </section>

      <section className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare size={15} className="text-[#5a6061]" />
          <h4 className="text-sm font-semibold text-[#202829]">反馈与沟通</h4>
        </div>
        {detail.feedback.length ? (
          <div className="space-y-3">
            {detail.feedback.map((feedback) => (
              <FeedbackDetailCard
                key={feedback.id}
                feedback={feedback}
                followups={followupsByFeedbackId.get(feedback.id) || []}
                onSubmitFollowup={onSubmitFollowup}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="暂无反馈" description="该用户还没有提交登录后可追踪的反馈。" compact />
        )}
      </section>

      <section className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock size={15} className="text-[#5a6061]" />
          <h4 className="text-sm font-semibold text-[#202829]">检测记录</h4>
        </div>
        {detail.detectorJobs.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#edf0f1]">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-3 py-2.5">模型</th>
                  <th className="px-3 py-2.5">协议</th>
                  <th className="px-3 py-2.5">状态</th>
                  <th className="px-3 py-2.5">提交</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {detail.detectorJobs.slice(0, 20).map((job) => (
                  <DetectorRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="暂无检测" description="该用户还没有发起模型检测。" compact />
        )}
      </section>
    </div>
  );
}

function FeedbackDetailCard({
  feedback,
  followups,
  onSubmitFollowup,
}: {
  feedback: OfferFeedback;
  followups: FeedbackFollowup[];
  onSubmitFollowup: (feedbackId: string, message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSubmitFollowup(feedback.id, message);
      setMessage("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发送补充说明失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-lg border border-[#adb3b4]/20 bg-[#f9f9f9] p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={feedbackStatusLabel(feedback)} tone={feedbackStatusTone(feedback)} />
            <StatusChip label={feedback.feedbackScope === "merchant" ? "商家反馈" : "报价反馈"} tone="info" />
            <StatusChip label={feedbackReasonLabel(feedback.reason)} tone={feedbackReasonTone(feedback.reason)} />
          </div>
          <p className="mt-2 font-semibold text-[#202829]">{feedbackTitle(feedback)}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{feedback.sourceTitle || feedback.sourceName || "未记录渠道"}</p>
        </div>
        <span className="shrink-0 text-xs text-[#7a8587]">{formatRelative(feedback.createdAt)}</span>
      </div>

      {feedback.contact ? (
        <p className="mt-2 text-xs text-[#5a6061]">联系方式：<span className="font-semibold text-[#2d3435]">{feedback.contact}</span></p>
      ) : null}
      {feedback.notes || feedback.evidenceText ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#2d3435]">
          {feedback.evidenceText || feedback.notes}
        </p>
      ) : null}
      {feedback.reviewerNote || feedback.withdrawReason ? (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#5a6061]">
          {feedback.withdrawReason ? `用户撤销：${feedback.withdrawReason}` : `处理备注：${feedback.reviewerNote}`}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {followups.map((item) => (
          <div key={item.id} className="rounded-lg bg-white px-3 py-2 text-xs leading-5">
            <div className="flex flex-wrap items-center gap-2 text-[#7a8587]">
              <span className="font-semibold text-[#2d3435]">{item.role === "admin" ? "PriceAI 后台" : "用户"}</span>
              <span>{formatDate(item.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[#2d3435]">{item.message}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`admin-followup-${feedback.id}`}>给用户发送补充说明</label>
        <input
          id={`admin-followup-${feedback.id}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="给用户发送补充说明或处理进度"
          maxLength={1000}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
        />
        <button
          type="submit"
          disabled={submitting || message.trim().length < 2}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#202829] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#2d3435] disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
          发送
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-[#9b3328]">{error}</p> : null}
    </article>
  );
}

function DetectorRow({ job }: { job: TransitDetectorJob }) {
  return (
    <tr>
      <td className="px-3 py-3">
        <p className="font-semibold text-[#202829]">{job.targetModel}</p>
        <p className="mt-1 max-w-[260px] truncate text-xs text-[#5a6061]">{job.baseUrl || "未记录接口地址"}</p>
      </td>
      <td className="px-3 py-3 text-[#2d3435]">{protocolLabel(job.protocol)}</td>
      <td className="px-3 py-3">
        <StatusChip label={detectorStatusLabel(job.status)} tone={detectorStatusTone(job.status)} />
        {job.errorMessage ? <p className="mt-1 text-xs text-[#9b3328]">{job.errorMessage}</p> : null}
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-xs text-[#5a6061]">{formatDate(job.submittedAt)}</td>
    </tr>
  );
}

function UserIdentity({ user, large = false }: { user: AdminUserSummary; large?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`${large ? "h-11 w-11" : "h-9 w-9"} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/20`}>
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <UserRound size={large ? 20 : 17} className="text-[#5a6061]" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#202829]">{user.displayName || user.email || "未命名用户"}</span>
        <span className="mt-0.5 block truncate text-xs text-[#5a6061]">{user.email || user.id}</span>
      </span>
    </div>
  );
}

function MetricTile({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "info" | "warn" }) {
  const toneClass = tone === "info"
    ? "bg-[#eef3f8] text-[#47657a]"
    : tone === "warn"
      ? "bg-[#fff7e8] text-[#7a541b]"
      : "bg-[#f2f4f4] text-[#2d3435]";
  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
      <p className="text-[0.68rem] font-semibold text-current/80">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-normal">{value}</p>
    </div>
  );
}

function SmallStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" | "danger" }) {
  const toneClass = tone === "danger"
    ? "bg-[#fbe9e7] text-[#9b3328]"
    : tone === "warn"
      ? "bg-[#fff7e8] text-[#7a541b]"
      : "bg-[#f2f4f4] text-[#2d3435]";
  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
      <p className="font-semibold">{value}</p>
      <p className="mt-0.5 text-[#5a6061]">{label}</p>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "success" | "danger" | "warn" | "info" | "muted" }) {
  const toneClass =
    tone === "success"
      ? "bg-[#e8f3ec] text-[#2f7a4b]"
      : tone === "danger"
        ? "bg-[#fbe9e7] text-[#9b3328]"
        : tone === "warn"
          ? "bg-[#fff7e8] text-[#7a541b]"
          : tone === "info"
            ? "bg-[#eef3f8] text-[#47657a]"
            : "bg-[#f2f4f4] text-[#5a6061]";
  return <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${toneClass}`}>{label}</span>;
}

function InlineNotice({ type, text }: Notice) {
  const className = type === "success"
    ? "bg-[#e8f3ec] text-[#2f7a4b]"
    : type === "info"
      ? "bg-[#eef3f8] text-[#47657a]"
      : "bg-[#fbe9e7] text-[#9b3328]";
  return (
    <div className={`m-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${className}`}>
      {type === "success" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-14 rounded-lg bg-[#f2f4f4]" />
      ))}
    </div>
  );
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-lg bg-[#f7f9f9] px-4 py-6" : "px-5 py-10"}>
      <p className="font-semibold text-[#202829]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#5a6061]">{description}</p>
    </div>
  );
}

function feedbackTitle(item: OfferFeedback) {
  if (item.feedbackScope === "merchant") return item.sourceName || item.sourceTitle || "未命名商家";
  return item.productName || item.productSlug || "未命名商品";
}

function feedbackStatusLabel(item: OfferFeedback) {
  if (item.publicStatus === "withdrawn") return "已撤销";
  if (item.status === "resolved") return "已处理";
  if (item.status === "ignored") return "已关闭";
  return "待处理";
}

function feedbackStatusTone(item: OfferFeedback): "success" | "danger" | "warn" | "info" | "muted" {
  if (item.publicStatus === "withdrawn") return "success";
  if (item.status === "resolved") return "success";
  if (item.status === "ignored") return "muted";
  return "warn";
}

function feedbackReasonLabel(value: OfferFeedback["reason"]) {
  const labels: Record<OfferFeedback["reason"], string> = {
    wrong_price: "价格不准",
    description_mismatch: "描述不符",
    item_removed: "商品不可用",
    stock_mismatch: "库存不准",
    wrong_category: "分类错误",
    aftersales_shipping: "售后/交付",
    fraud: "疑似虚假",
    bad_source: "渠道问题",
    other: "其他问题",
  };
  return labels[value] || value;
}

function feedbackReasonTone(value: OfferFeedback["reason"]): "success" | "danger" | "warn" | "info" | "muted" {
  if (value === "fraud" || value === "bad_source" || value === "aftersales_shipping" || value === "description_mismatch") return "danger";
  if (value === "wrong_category") return "info";
  if (value === "other") return "muted";
  return "warn";
}

function protocolLabel(value: string) {
  if (value === "openai_chat") return "Chat Completions";
  if (value === "openai_responses") return "OpenAI Responses";
  if (value === "claude") return "Claude Messages";
  if (value === "gemini") return "Gemini";
  return value;
}

function detectorStatusLabel(value: TransitDetectorJob["status"]) {
  if (value === "done") return "已完成";
  if (value === "error") return "失败";
  if (value === "running") return "运行中";
  return "排队中";
}

function detectorStatusTone(value: TransitDetectorJob["status"]): "success" | "danger" | "warn" | "info" | "muted" {
  if (value === "done") return "success";
  if (value === "error") return "danger";
  if (value === "running") return "info";
  return "warn";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatRelative(value: string | null | undefined) {
  if (!value) return "未记录";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "未记录";
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`;
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.floor(diff / (24 * 60 * 60_000))} 天前`;
  return formatDate(value);
}
