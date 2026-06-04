import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ExternalLink, Radar, Search, Send, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { getExplorerData } from "@/lib/data";
import { platformOptions } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "关于 PriceAI",
  description:
    "PriceAI 是一个 AI 订阅价格雷达，用来聚合 ChatGPT、Claude、Gemini、Grok、邮箱和 API/CDK 等渠道报价，帮助用户在购买前查看有货最低价、原始来源和更新时间。",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "关于 PriceAI",
    description: "把分散的 AI 会员渠道报价整理成可搜索、可比较、可核验的价格雷达。",
    url: "https://priceai.cc/about",
  },
};

const platformIconMap: Record<string, string> = {
  ChatGPT: "/brand-icons/chatgpt.svg",
  Claude: "/brand-icons/claude.svg",
  Gemini: "/brand-icons/gemini.svg",
  Grok: "/brand-icons/grok.svg",
  "API/CDK": "/brand-icons/chatgpt.svg",
  邮箱: "/brand-icons/gmail.svg",
};

export default async function AboutPage() {
  const data = await getExplorerData();
  const availableCount = data.products.reduce((sum, product) => sum + product.inStockCount, 0);
  const latestSeenAt = data.products
    .map((product) => product.latestSeenAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <header className="border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="PriceAI 首页" className="shrink-0">
            <AppLogo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7]"
            >
              进入比价
            </Link>
            <a
              href="https://github.com/physics-dimension/PriceAI"
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] sm:inline-flex"
            >
              GitHub
              <ExternalLink size={14} />
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 lg:py-16">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.72fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">
              AI subscription price radar
            </p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-5xl">
              把分散的 AI 订阅渠道，变成购买前可核验的价格雷达。
            </h1>
            <p className="mt-6 max-w-[68ch] text-base leading-8 text-[#5a6061]">
              PriceAI 聚合 ChatGPT、Claude、Gemini、Grok、邮箱和 API/CDK 等渠道报价，按标准商品整理原始标题、价格、库存、来源和更新时间。它不卖货，也不替渠道担保，只帮助用户在购买前少开几个网页，少踩一点信息差。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:-translate-y-0.5 hover:bg-[#202829]"
              >
                查看当前报价
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/?submit=channel"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#dde4e5] px-5 text-sm font-semibold text-[#2d3435] transition hover:-translate-y-0.5 hover:bg-[#d3dcdd]"
              >
                提交新渠道
                <Send size={16} />
              </Link>
            </div>
          </div>

          <aside className="rounded-lg bg-[#f2f4f4] p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">当前覆盖</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric label="标准商品" value={String(data.products.length)} />
              <Metric label="报价记录" value={String(data.offerTotal)} />
              <Metric label="有货报价" value={String(availableCount)} />
              <Metric label="最近同步" value={latestSeenAt ? "已记录" : "未记录"} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {platformOptions.slice(0, 6).map((platform) => (
                <span
                  key={platform}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15"
                >
                  {platformIconMap[platform] ? (
                    <Image src={platformIconMap[platform]} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                  ) : (
                    <Radar size={15} />
                  )}
                  {platform}
                </span>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-14 grid gap-5 md:grid-cols-3">
          <Principle
            icon={<Search size={19} />}
            title="先回答价格问题"
            text="用户真正想知道的是现在有没有货、有货最低价是多少、来自哪个渠道、多久前确认过。"
          />
          <Principle
            icon={<Radar size={19} />}
            title="保留原始来源"
            text="每条报价都保留来源渠道、原始商品名、价格、库存状态、更新时间和购买链接，方便用户自行核验。"
          />
          <Principle
            icon={<ShieldCheck size={19} />}
            title="边界清楚"
            text="PriceAI 不参与交易，不收款，不承诺售后，也不绕过验证码或风控。价格仅供购买前参考。"
          />
        </section>

        <section className="mt-16 grid gap-10 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">Why it exists</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">
              AI 订阅已经变成一个分层价格市场。
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-8 text-[#5a6061]">
            <p>
              同一个 AI 会员可能同时存在官网正价、地区价、资格价、代订价和第三方渠道价。对国内用户来说，还会遇到海外支付、账号地区、学生权益、设备权益、成品号、卡密、CDK 等交付方式差异。
            </p>
            <p>
              这些报价通常分散在卡网、Telegram 群、闲鱼、私域群和各种链接里。用户每次购买前都要打开多个站点，手动判断商品是不是同一类、库存是否真实、价格是否已经过期。
            </p>
            <p>
              PriceAI 的目标不是替用户决定在哪里买，而是把分散信息整理到一个可以搜索和比较的界面里，让购买前的判断更透明。
            </p>
          </div>
        </section>

        <section className="mt-16 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
          <div className="grid border-b border-[#edf0f1] bg-[#f2f4f4] px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061] sm:grid-cols-[0.8fr_1fr]">
            <span>用户问题</span>
            <span className="hidden sm:block">PriceAI 的处理方式</span>
          </div>
          {[
            ["渠道太分散", "把多个来源站点里的报价聚合到同一个比价入口。"],
            ["商品命名混乱", "按标准商品整理，再保留原始标题供用户核验。"],
            ["缺货价格误导", "外层最低价只看有货报价，缺货需要明确标注。"],
            ["新渠道没人维护", "用户可以提交渠道，能采集的纳入来源，不能采集的进入采集器待办。"],
          ].map(([problem, answer]) => (
            <div key={problem} className="grid gap-2 border-b border-[#edf0f1] px-5 py-4 last:border-b-0 sm:grid-cols-[0.8fr_1fr]">
              <p className="font-semibold text-[#202829]">{problem}</p>
              <p className="text-sm leading-7 text-[#5a6061]">{answer}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 flex flex-col gap-4 rounded-lg bg-[#202829] px-6 py-6 text-[#f8f8f8] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-normal">购买前先查一次价格。</h2>
            <p className="mt-2 text-sm leading-6 text-[#d7dddd]">
              如果你发现新的渠道，也可以提交给 PriceAI，帮助它覆盖更多真实来源。
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#f8f8f8] px-5 text-sm font-semibold text-[#202829] transition hover:-translate-y-0.5 hover:bg-[#edf0f1]"
          >
            打开比价工具
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#5a6061]">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-[#202829]">{value}</p>
    </div>
  );
}

function Principle({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f3ec] text-[#2f7a4b]">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-bold text-[#202829]">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-[#5a6061]">{text}</p>
    </article>
  );
}
