import Link from "next/link";
import type { OfferFeedback } from "@/lib/types";

export function AccountFeedbackList({
  feedback,
  emptyText = "还没有登录后提交的反馈。普通纠错仍可匿名提交；高风险反馈提交后会出现在这里。",
  limit,
}: {
  feedback: OfferFeedback[];
  emptyText?: string;
  limit?: number;
}) {
  const visibleFeedback = typeof limit === "number" ? feedback.slice(0, limit) : feedback;

  if (!visibleFeedback.length) {
    return (
      <div className="px-5 py-8 text-sm leading-6 text-[#5a6061]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#edf0f1]">
      {visibleFeedback.map((item) => (
        <Link key={item.id} href={`/account/feedback/${encodeURIComponent(item.id)}`} className="block px-5 py-4 transition hover:bg-[#f7f9f9]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_auto] md:items-start">
            <div className="min-w-0">
              <p className="font-semibold text-[#202829]">{feedbackTitle(item)}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{item.sourceTitle || item.sourceName || "未记录渠道"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
              <span className="inline-flex h-7 items-center rounded-full bg-[#eef3f8] px-3 text-xs font-semibold text-[#47657a]">
                {item.feedbackScope === "merchant" ? "商家反馈" : "报价反馈"}
              </span>
              <span className="inline-flex h-7 items-center rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061]">
                {feedbackStatusLabel(item)}
              </span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-[#5a6061] md:grid-cols-3">
            <span>类型：{feedbackReasonLabel(item.reason)}</span>
            <span>期望：{expectedActionLabel(item.userExpectedAction)}</span>
            <span>提交：{formatDate(item.createdAt)}</span>
          </div>
          {item.verificationMessage || item.reviewerNote ? (
            <p className="mt-3 rounded-lg bg-[#f7f9f9] px-3 py-2 text-sm leading-6 text-[#2d3435]">
              {item.reviewerNote || item.verificationMessage}
            </p>
          ) : null}
        </Link>
      ))}
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

function feedbackReasonLabel(value: OfferFeedback["reason"]) {
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
