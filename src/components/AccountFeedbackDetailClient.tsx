"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";
import type { FeedbackFollowup, OfferFeedback } from "@/lib/types";

export function AccountFeedbackDetailClient({
  feedback,
  followups,
}: {
  feedback: OfferFeedback;
  followups: FeedbackFollowup[];
}) {
  const [currentFeedback, setCurrentFeedback] = useState(feedback);
  const [currentFollowups, setCurrentFollowups] = useState(followups);
  const [message, setMessage] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [submittingFollowup, setSubmittingFollowup] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const canWithdraw = currentFeedback.publicStatus !== "withdrawn" && currentFeedback.status !== "ignored";

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingFollowup(true);
    setNotice(null);

    try {
      const evidenceUrls = evidenceText
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 10);
      const response = await fetch("/api/account/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackId: currentFeedback.id,
          message,
          evidenceUrls,
        }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) throw new Error(json.message || "补充反馈失败。");
      setCurrentFollowups((items) => [...items, json.followup as FeedbackFollowup]);
      setMessage("");
      setEvidenceText("");
      setNotice({ type: "success", text: "补充说明已提交。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "补充反馈失败。" });
    } finally {
      setSubmittingFollowup(false);
    }
  }

  async function withdrawFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWithdraw) return;
    setWithdrawing(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/account/feedback/${encodeURIComponent(currentFeedback.id)}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: withdrawReason || null }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) throw new Error(json.message || "撤销反馈失败。");
      setCurrentFeedback(json.feedback as OfferFeedback);
      setCurrentFollowups((items) => [
        ...items,
        {
          id: `local-withdraw-${Date.now()}`,
          feedbackId: currentFeedback.id,
          userId: currentFeedback.userId,
          role: "user",
          message: `用户撤销反馈：${withdrawReason || "已与商家协商一致或不再需要继续公开展示。"}`,
          evidenceUrls: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setWithdrawReason("");
      setNotice({ type: "success", text: "已撤销反馈，前台风险提示会在缓存刷新后移除。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "撤销反馈失败。" });
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge feedback={currentFeedback} />
          <span className="rounded-full bg-[#eef3f8] px-2.5 py-1 text-xs font-semibold text-[#47657a]">
            {currentFeedback.feedbackScope === "merchant" ? "商家反馈" : "报价反馈"}
          </span>
          <span className="rounded-full bg-[#f2f4f4] px-2.5 py-1 text-xs font-semibold text-[#5a6061]">
            {publicStatusLabel(currentFeedback)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <FeedbackBlock title="反馈对象">
            <p className="font-semibold text-[#202829]">{feedbackTitle(currentFeedback)}</p>
            <p className="mt-1 text-sm leading-6 text-[#5a6061]">{currentFeedback.sourceTitle || currentFeedback.sourceName || "未记录渠道"}</p>
            {currentFeedback.offerUrl ? (
              <a href={currentFeedback.offerUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex break-all text-xs text-[#47657a] hover:text-[#202829]">
                {currentFeedback.offerUrl}
              </a>
            ) : null}
          </FeedbackBlock>

          <div className="grid gap-3 sm:grid-cols-3">
            <FeedbackFact label="问题类型" value={reasonLabel(currentFeedback.reason)} />
            <FeedbackFact label="希望处理" value={expectedActionLabel(currentFeedback.userExpectedAction)} />
            <FeedbackFact label="提交时间" value={formatDate(currentFeedback.createdAt)} />
          </div>

          {currentFeedback.notes ? (
            <FeedbackBlock title="补充说明">
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#2d3435]">{currentFeedback.notes}</p>
            </FeedbackBlock>
          ) : null}

          {currentFeedback.evidenceText || currentFeedback.evidenceUrls.length ? (
            <FeedbackBlock title="证据">
              {currentFeedback.evidenceText ? <p className="whitespace-pre-wrap text-sm leading-6 text-[#2d3435]">{currentFeedback.evidenceText}</p> : null}
              {currentFeedback.evidenceUrls.length ? (
                <div className="mt-2 space-y-1.5">
                  {currentFeedback.evidenceUrls.map((url) => (
                    <a key={url} href={url.startsWith("http") ? url : undefined} target="_blank" rel="noreferrer" className="block break-all text-xs text-[#47657a]">
                      {url}
                    </a>
                  ))}
                </div>
              ) : null}
            </FeedbackBlock>
          ) : null}

          {currentFeedback.verificationMessage || currentFeedback.reviewerNote || currentFeedback.withdrawReason ? (
            <FeedbackBlock title="处理状态">
              {currentFeedback.verificationMessage ? <p className="text-sm leading-6 text-[#2d3435]">{currentFeedback.verificationMessage}</p> : null}
              {currentFeedback.reviewerNote ? <p className="mt-1 text-sm leading-6 text-[#5a6061]">后台备注：{currentFeedback.reviewerNote}</p> : null}
              {currentFeedback.withdrawReason ? <p className="mt-1 text-sm leading-6 text-[#7a541b]">撤销说明：{currentFeedback.withdrawReason}</p> : null}
            </FeedbackBlock>
          ) : null}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
          <h2 className="text-base font-semibold text-[#202829]">补充说明</h2>
          <form onSubmit={submitFollowup} className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#5a6061]">说明</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                required
                maxLength={1000}
                className="w-full resize-y rounded-lg border border-[#adb3b4]/35 px-3 py-2 text-sm outline-none transition focus:border-[#2d3435]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#5a6061]">证据链接（可选）</span>
              <textarea
                value={evidenceText}
                onChange={(event) => setEvidenceText(event.target.value)}
                rows={2}
                maxLength={1500}
                placeholder="一行或空格分隔多个链接"
                className="w-full resize-y rounded-lg border border-[#adb3b4]/35 px-3 py-2 text-sm outline-none transition focus:border-[#2d3435]"
              />
            </label>
            <button
              type="submit"
              disabled={submittingFollowup}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] disabled:opacity-60"
            >
              {submittingFollowup ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              提交补充
            </button>
          </form>
        </section>

        <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
          <h2 className="text-base font-semibold text-[#202829]">撤销反馈</h2>
          <form onSubmit={withdrawFeedback} className="mt-3 space-y-3">
            <textarea
              value={withdrawReason}
              onChange={(event) => setWithdrawReason(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={!canWithdraw}
              placeholder={canWithdraw ? "例如：商家已补发/退款，问题已协商一致。" : "这条反馈已撤销或已关闭。"}
              className="w-full resize-y rounded-lg border border-[#adb3b4]/35 px-3 py-2 text-sm outline-none transition focus:border-[#2d3435] disabled:bg-[#f2f4f4]"
            />
            <button
              type="submit"
              disabled={!canWithdraw || withdrawing}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#adb3b4]/35 px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4] disabled:opacity-60"
            >
              {withdrawing ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              {currentFeedback.publicStatus === "withdrawn" ? "已撤销" : "撤销反馈"}
            </button>
          </form>
        </section>

        {notice ? (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            notice.type === "success" ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
          }`}>
            {notice.text}
          </div>
        ) : null}
      </aside>

      <section className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15 lg:col-span-2">
        <h2 className="text-base font-semibold text-[#202829]">沟通记录</h2>
        {currentFollowups.length ? (
          <div className="mt-4 space-y-3">
            {currentFollowups.map((item) => (
              <div key={item.id} className="rounded-lg bg-[#f7f9f9] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#7a8587]">
                  <span className="font-semibold text-[#2d3435]">{item.role === "admin" ? "PriceAI 后台" : "我"}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#2d3435]">{item.message}</p>
                {item.evidenceUrls.length ? (
                  <div className="mt-2 space-y-1">
                    {item.evidenceUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-xs text-[#47657a]">{url}</a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#5a6061]">暂无补充记录。后续沟通和撤销记录会出现在这里。</p>
        )}
      </section>
    </div>
  );
}

function FeedbackBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[#f7f9f9] px-4 py-3">
      <p className="text-xs font-semibold text-[#5a6061]">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FeedbackFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f9f9] px-3 py-2">
      <p className="text-xs font-semibold text-[#5a6061]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#202829]">{value}</p>
    </div>
  );
}

function StatusBadge({ feedback }: { feedback: OfferFeedback }) {
  if (feedback.publicStatus === "withdrawn") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f3ec] px-2.5 py-1 text-xs font-semibold text-[#2f7a4b]">
        <CheckCircle2 size={13} />
        已撤销
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#fff7e8] px-2.5 py-1 text-xs font-semibold text-[#7a541b]">
      {feedback.status === "resolved" ? "已处理" : feedback.status === "ignored" ? "已关闭" : "处理中"}
    </span>
  );
}

function feedbackTitle(feedback: OfferFeedback): string {
  if (feedback.feedbackScope === "merchant") return feedback.sourceName || feedback.sourceTitle || "未命名商家";
  return feedback.productName || feedback.productSlug || "未命名商品";
}

function publicStatusLabel(feedback: OfferFeedback): string {
  if (feedback.publicStatus === "withdrawn") return "用户已撤销";
  if (feedback.publicStatus === "pending_review") return "可进入脱敏摘要审核";
  if (feedback.publicStatus === "public") return "已允许公开摘要";
  return "不公开";
}

function reasonLabel(value: OfferFeedback["reason"]) {
  const labels: Record<OfferFeedback["reason"], string> = {
    wrong_price: "价格不准",
    description_mismatch: "描述不符",
    item_removed: "商品已下架",
    stock_mismatch: "库存状态不准",
    wrong_category: "分类错误",
    aftersales_shipping: "售后/发货问题",
    fraud: "疑似虚假/欺诈",
    bad_source: "渠道不可信",
    other: "其他问题",
  };
  return labels[value] || value;
}

function expectedActionLabel(value: OfferFeedback["userExpectedAction"]) {
  if (value === "hide_offer") return "建议下架报价";
  if (value === "hide_source") return "建议下架渠道";
  if (value === "unsure") return "管理员判断";
  return "重新核查";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
