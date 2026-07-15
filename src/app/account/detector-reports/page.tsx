import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { buildGoogleAuthHref } from "@/lib/auth-paths";
import { listUserDetectorJobs } from "@/lib/account";
import { buildPriceAiDetectorReportHref } from "@/lib/transit-detector-report";
import type { TransitDetectorJob } from "@/lib/types";

export const metadata: Metadata = {
  title: "我的检测",
  robots: { index: false, follow: false },
};

export default async function AccountDetectorReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(buildGoogleAuthHref("/account/detector-reports"));

  let jobs: TransitDetectorJob[] = [];
  let errorMessage = "";
  try {
    jobs = await listUserDetectorJobs(user.id);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "读取检测记录失败。";
  }

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader activeSection="transit" />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#5a6061]">账户中心</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">我的检测</h1>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">模型检测任务会绑定到当前账号，公开报告仍可分享给未登录用户查看。</p>
          </div>
          <Link href="/api-transit/detector" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white transition hover:bg-[#2d3435]">
            发起检测
          </Link>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-lg bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b3328]">{errorMessage}</div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
          {jobs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse text-left text-sm">
                <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                  <tr>
                    <th className="px-5 py-3">模型</th>
                    <th className="px-5 py-3">协议</th>
                    <th className="px-5 py-3">强度</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">提交时间</th>
                    <th className="px-5 py-3 text-right">报告</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f1]">
                  {jobs.map((job) => {
                    const reportHref = buildPriceAiDetectorReportHref(job.id);
                    return (
                      <tr key={job.id}>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#202829]">{job.targetModel}</p>
                          <p className="mt-1 max-w-[260px] truncate text-xs text-[#5a6061]">{job.baseUrl || "未记录接口地址"}</p>
                        </td>
                        <td className="px-5 py-4 text-[#2d3435]">{protocolLabel(job.protocol)}</td>
                        <td className="px-5 py-4 text-[#2d3435]">{job.intensity}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex h-7 items-center rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061]">
                            {detectorStatusLabel(job.status)}
                          </span>
                          {job.errorMessage ? <p className="mt-1 max-w-[240px] text-xs leading-5 text-[#9b3328]">{job.errorMessage}</p> : null}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-[#5a6061]">{formatDate(job.submittedAt)}</td>
                        <td className="px-5 py-4 text-right">
                          {reportHref && job.status === "done" ? (
                            <div className="flex justify-end gap-2">
                              <Link href={reportHref} className="inline-flex h-9 items-center rounded-full bg-[#202829] px-4 text-xs font-semibold text-white">
                                打开报告
                              </Link>
                            </div>
                          ) : (
                            <span className="text-xs text-[#7a8284]">暂无报告</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-10 text-sm leading-6 text-[#5a6061]">
              还没有检测记录。登录后从模型检测页发起检测，任务会显示在这里。
            </div>
          )}
        </div>
      </section>
    </main>
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
