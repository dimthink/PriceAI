import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountFeedbackList } from "@/components/AccountFeedbackList";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { buildGoogleAuthHref } from "@/lib/auth-paths";
import { listUserDetectorJobs, listUserOfferFeedback } from "@/lib/account";
import type { OfferFeedback, TransitDetectorJob } from "@/lib/types";

export const metadata: Metadata = {
  title: "账户",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(buildGoogleAuthHref("/account"));

  let feedback: OfferFeedback[] = [];
  let feedbackError = "";
  let detectorJobs: TransitDetectorJob[] = [];
  let detectorError = "";

  try {
    feedback = await listUserOfferFeedback(user.id);
  } catch (error) {
    feedbackError = error instanceof Error ? error.message : "读取反馈失败。";
  }

  try {
    detectorJobs = await listUserDetectorJobs(user.id);
  } catch (error) {
    detectorError = error instanceof Error ? error.message : "读取检测记录失败。";
  }

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/18">
          <p className="text-sm font-semibold text-[#5a6061]">当前登录</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">{user.displayName || user.email || "PriceAI 用户"}</h1>
          <p className="mt-1 text-sm text-[#5a6061]">{user.email}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#e8ecec]">
              退出登录
            </button>
          </form>
        </div>

        <div className="mt-5 space-y-4">
          <AccountSection
            title="我的反馈"
            description="登录后提交的高风险反馈、处理状态和撤销入口会直接显示在这里。"
            href="/account/feedback"
            actionLabel="查看全部"
          >
            {feedbackError ? (
              <div className="px-5 py-4 text-sm text-[#9b3328]">{feedbackError}</div>
            ) : (
              <AccountFeedbackList feedback={feedback} limit={5} />
            )}
          </AccountSection>

          <AccountSection
            title="我的检测"
            description="模型检测任务会绑定到当前账号，完成后的公开报告可分享给未登录用户。"
            href="/account/detector-reports"
            actionLabel="查看全部"
            secondaryHref="/api-transit/detector"
            secondaryLabel="发起检测"
          >
            {detectorError ? (
              <div className="px-5 py-4 text-sm text-[#9b3328]">{detectorError}</div>
            ) : (
              <AccountDetectorSummary jobs={detectorJobs} />
            )}
          </AccountSection>
        </div>
      </section>
    </main>
  );
}

function AccountSection({
  title,
  description,
  href,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-3 border-b border-[#edf0f1] px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#202829]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#5a6061]">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className="inline-flex h-9 items-center justify-center rounded-full bg-[#202829] px-4 text-xs font-semibold text-white transition hover:bg-[#2d3435]">
              {secondaryLabel}
            </Link>
          ) : null}
          <Link href={href} className="inline-flex h-9 items-center justify-center rounded-full bg-[#f2f4f4] px-4 text-xs font-semibold text-[#2d3435] transition hover:bg-[#e8ecec]">
            {actionLabel}
          </Link>
        </div>
      </div>
      {children}
    </section>
  );
}

function AccountDetectorSummary({ jobs }: { jobs: TransitDetectorJob[] }) {
  const visibleJobs = jobs.slice(0, 3);

  if (!visibleJobs.length) {
    return (
      <div className="px-5 py-8 text-sm leading-6 text-[#5a6061]">
        还没有检测记录。登录后从模型检测页发起检测，任务会显示在这里。
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#edf0f1]">
      {visibleJobs.map((job) => (
        <Link key={job.id} href="/account/detector-reports" className="block px-5 py-4 transition hover:bg-[#f7f9f9]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_auto] md:items-start">
            <div className="min-w-0">
              <p className="font-semibold text-[#202829]">{job.targetModel}</p>
              <p className="mt-1 truncate text-sm leading-6 text-[#5a6061]">{job.baseUrl || "未记录接口地址"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
              <span className="inline-flex h-7 items-center rounded-full bg-[#eef3f8] px-3 text-xs font-semibold text-[#47657a]">
                {protocolLabel(job.protocol)}
              </span>
              <span className="inline-flex h-7 items-center rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061]">
                {detectorStatusLabel(job.status)}
              </span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-[#5a6061] md:grid-cols-3">
            <span>强度：{job.intensity}</span>
            <span>提交：{formatDate(job.submittedAt)}</span>
            <span>{job.errorMessage ? `错误：${job.errorMessage}` : "点击查看检测记录"}</span>
          </div>
        </Link>
      ))}
    </div>
  );
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

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
