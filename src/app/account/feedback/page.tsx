import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { listUserOfferFeedback } from "@/lib/account";
import type { OfferFeedback } from "@/lib/types";

export const metadata: Metadata = {
  title: "我的反馈",
  robots: { index: false, follow: false },
};

export default async function AccountFeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/feedback");

  let feedback: OfferFeedback[] = [];
  let errorMessage = "";
  try {
    feedback = await listUserOfferFeedback(user.id);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "读取反馈失败。";
  }

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#5a6061]">账户中心</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">我的反馈</h1>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">这里只展示登录后提交的高风险反馈和后续可追踪反馈。</p>
          </div>
          <Link href="/account" className="text-sm font-semibold text-[#2d3435] underline decoration-[#adb3b4] underline-offset-4">
            返回账户
          </Link>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-lg bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b3328]">{errorMessage}</div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
          {feedback.length ? (
            <div className="divide-y divide-[#edf0f1]">
              {feedback.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#202829]">{item.productName || item.productSlug || "未命名商品"}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{item.sourceTitle || item.sourceName || "未记录渠道"}</p>
                    </div>
                    <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061]">
                      {feedbackStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs leading-5 text-[#5a6061] sm:grid-cols-3">
                    <span>类型：{feedbackReasonLabel(item.reason)}</span>
                    <span>期望：{expectedActionLabel(item.userExpectedAction)}</span>
                    <span>提交：{formatDate(item.createdAt)}</span>
                  </div>
                  {item.verificationMessage || item.reviewerNote ? (
                    <p className="mt-3 rounded-lg bg-[#f7f9f9] px-3 py-2 text-sm leading-6 text-[#2d3435]">
                      {item.reviewerNote || item.verificationMessage}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-sm leading-6 text-[#5a6061]">
              还没有登录后提交的反馈。普通纠错仍可匿名提交；高风险反馈提交后会出现在这里。
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function feedbackStatusLabel(value: OfferFeedback["status"]) {
  if (value === "resolved") return "已处理";
  if (value === "ignored") return "已关闭";
  return "待处理";
}

function feedbackReasonLabel(value: OfferFeedback["reason"]) {
  const labels: Record<OfferFeedback["reason"], string> = {
    wrong_price: "价格不准",
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
