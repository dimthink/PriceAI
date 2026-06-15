import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, MessageCircle, ShieldAlert } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink, GitHubLink, TelegramLink } from "@/components/FeedbackLink";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "提交 API 中转站 / 商家入驻",
  description:
    "向 PriceAI 推荐 API 中转站、提交价格修正或申请商家入驻。请不要提交 API Key、账号密码或任何敏感密钥。",
  alternates: { canonical: "/api-transit/submit" },
  openGraph: {
    title: "提交 API 中转站 / 商家入驻 | PriceAI",
    description: "推荐中转站、提交价格修正或申请商家入驻，当前先走人工核验。",
  },
};

const submissionTypes = [
  {
    title: "用户推荐",
    description: "你发现了新的中转站、价格变化、不可用情况或明显风险，可以先通过反馈入口提交。",
    fields: ["站点名称和官网", "你看到的 Claude / GPT 价格截图或页面链接", "充值比例、最低充值、售后入口", "可用性或售后体验说明"],
  },
  {
    title: "商家入驻",
    description: "中转站站长可以提交完整资料。入驻关系会在前台披露，不会包装成客观优选。",
    fields: ["站点主体、官网和售后方式", "Claude / GPT 标准模型报价", "号池来源：Pro / Plus / Max / Team / 官方 API / 混池", "退款规则、余额有效期、测试额度说明"],
  },
  {
    title: "上游 / 批发线索",
    description: "如果你是上游、总渠道商或批发商，可以提交合作线索，但 PriceAI 仍会把商业关系和客观数据分开展示。",
    fields: ["可供给的模型范围", "号池来源和稳定性证明", "价格口径和结算方式", "是否接受小额公开测试"],
  },
];

export default function ApiTransitSubmitPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "提交 API 中转站 / 商家入驻",
          url: "https://priceai.cc/api-transit/submit",
          description: "向 PriceAI 推荐 API 中转站、提交价格修正或申请商家入驻。",
          inLanguage: "zh-CN",
        }}
      />
      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
      </div>

      <main className="mx-auto max-w-[1180px] px-5 py-7 pb-20">
        <div className="mb-6 max-w-[860px]">
          <Link href="/api-transit" className="text-sm font-semibold text-[#5a6061] hover:text-[#202829]">
            返回 API 中转站价格榜
          </Link>
          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-[34px] font-semibold leading-[1.15] text-[#202829]">
            提交 API 中转站 / 商家入驻
          </h1>
          <p className="mt-3 text-sm leading-[1.8] text-[#5a6061]">
            当前先走人工核验。你可以推荐站点、提交价格修正、反馈不可用情况，或申请商家入驻。请只提交公开资料和联系方式，不要发送任何可用密钥。
          </p>
        </div>

        <section className="mb-5 rounded-lg border border-[#fff1cf] bg-[#fff7e8] p-4 text-sm leading-7 text-[#7a541b]">
          <div className="mb-2 flex items-center gap-2 font-extrabold">
            <ShieldAlert className="h-4 w-4" />
            不要提交敏感信息
          </div>
          <p>
            请不要提交 API Key、账号密码、Cookie、支付账户、后台登录凭据或任何能直接调用模型的密钥。需要验证时，后续会使用专用测试额度或公开可复现证据。
          </p>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {submissionTypes.map((item) => (
            <section key={item.title} className="rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
              <h2 className="text-base font-extrabold text-[#202829]">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[#5a6061]">{item.description}</p>
              <div className="mt-4 space-y-2">
                {item.fields.map((field) => (
                  <div key={field} className="flex gap-2 text-xs leading-6 text-[#2d3435]">
                    <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-[#2f7a4b]" />
                    <span>{field}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-5 rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
          <h2 className="text-base font-extrabold text-[#202829]">提交方式</h2>
          <p className="mt-2 max-w-[760px] text-sm leading-7 text-[#5a6061]">
            当前不开放自动入库。你可以先通过站内反馈、Telegram 或 GitHub 提交，PriceAI 会按价格清晰度、站点稳定性、号池来源和风险披露完整度人工整理。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <FeedbackLink />
            <TelegramLink />
            <GitHubLink />
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-[#dfe4e5] bg-white p-5">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#202829]">
              <FileText className="h-4 w-4" />
              核验优先级
            </h2>
            <p className="mt-2 text-sm leading-7 text-[#5a6061]">
              优先处理能提供公开价格页、标准模型名、充值比例、近 7 日可用性样本和售后规则的站点。二级分销、混池、上游未披露可以收录，但会明确标注。
            </p>
          </div>
          <div className="rounded-lg border border-[#dfe4e5] bg-white p-5">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#202829]">
              <AlertTriangle className="h-4 w-4" />
              商业关系披露
            </h2>
            <p className="mt-2 text-sm leading-7 text-[#5a6061]">
              入驻、返佣、广告或合作关系会单独披露，不会直接等同于客观排名。默认排序仍以价格、稳定性、样本数和资料完整度为主。
            </p>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/guides/api-transit"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#dde4e5] px-4 text-sm font-bold text-[#2d3435] transition-colors hover:bg-[#cfd8d9]"
          >
            阅读中转站百科
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/api-transit/models"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f2f4f4] px-4 text-sm font-bold text-[#2d3435] transition-colors hover:bg-[#dde4e5]"
          >
            查看模型维度对比
            <MessageCircle className="h-3.5 w-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
