import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Radar,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { platformOptions } from "@/lib/catalog";
import { getExplorerData } from "@/lib/data";
import type { ExplorerProductSummary } from "@/lib/types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "PriceAI 是什么",
  description:
    "PriceAI 是一个 AI 订阅价格雷达，聚合 ChatGPT、Claude、Gemini、Grok 等渠道报价，帮助用户购买前查看有货最低价、原始来源和更新时间。",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "PriceAI 是什么",
    description: "买 AI 订阅前，先看清真实价格、原始来源和更新时间。",
    url: "https://priceai.cc/about",
  },
};

const platformIconMap: Record<string, string> = {
  ChatGPT: "/brand-icons/chatgpt.svg",
  Claude: "/brand-icons/claude.svg",
  Gemini: "/brand-icons/gemini.svg",
  Grok: "/brand-icons/grok.svg",
  Google: "/brand-icons/google.png",
  "API/CDK": "/brand-icons/chatgpt.svg",
  邮箱: "/brand-icons/gmail.png",
};

const problems = [
  {
    title: "价格差异大",
    text: "同一个 AI 会员可能有官网正价、地区价、资格价、代订价和第三方渠道价，普通用户很难判断哪个才是合理区间。",
  },
  {
    title: "渠道太分散",
    text: "报价散落在卡网、Telegram 群、闲鱼、私域链接和不同店铺里，每次购买前都要打开很多页面手动对比。",
  },
  {
    title: "风险不透明",
    text: "便宜可能来自地区权益、设备权益、批量渠道，也可能来自不稳定号源。价格低不等于一定有问题，价格高也不等于一定靠谱。",
  },
];

const features = [
  {
    title: "有货最低价",
    text: "外层列表优先展示有货报价里的最低价，缺货报价不会冒充可购买价格。",
    icon: <CheckCircle2 size={18} />,
  },
  {
    title: "原始来源",
    text: "保留来源渠道、原始商品名和跳转链接，让用户能回到原站自行核验。",
    icon: <Radar size={18} />,
  },
  {
    title: "更新时间",
    text: "每条报价都尽量展示最近采集或确认时间，避免把过期信息当成当前行情。",
    icon: <Search size={18} />,
  },
  {
    title: "渠道提交",
    text: "用户发现新渠道后可以提交，系统会先解析和试采集，再决定是否纳入比价。",
    icon: <Send size={18} />,
  },
];

const steps = [
  ["搜索商品", "输入 ChatGPT Plus、Gemini Pro、Claude Pro、Grok、Gmail 等关键词。"],
  ["比较来源", "查看有货最低价、渠道数量、原始商品名、库存状态和更新时间。"],
  ["跳转原站", "回到原渠道确认交付方式、售后规则和最终价格，再决定是否购买。"],
];

const faqs = [
  [
    "PriceAI 是卖 AI 订阅的吗？",
    "不是。PriceAI 不卖货、不收款、不参与交易，只做购买前的价格和来源整理。",
  ],
  [
    "这些渠道靠谱吗？",
    "PriceAI 不替任何渠道做担保。页面会尽量展示原始来源、商品名、库存和更新时间，最终仍需要用户自行判断。",
  ],
  [
    "为什么同一个商品价格差这么多？",
    "AI 订阅可能来自官网正价、地区价、资格价、设备权益、代订、成品号、卡密、CDK 或第三方渠道，不同来源的成本和风险都不同。",
  ],
  [
    "缺货商品为什么还显示？",
    "缺货报价可以作为历史和来源参考，但不会参与外层的有货最低价展示。",
  ],
  [
    "我可以提交新渠道吗？",
    "可以。提交后系统会先解析链接和试采集，审核通过后才会进入比价来源。",
  ],
];

export default async function AboutPage() {
  const data = await getExplorerData();
  const availableCount = data.products.reduce((sum, product) => sum + product.inStockCount, 0);
  const previewProducts = data.products
    .filter((product) => product.inStockCount > 0 && product.lowestPrice !== null)
    .slice(0, 4);

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <header className="sticky top-0 z-30 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="PriceAI 首页" className="shrink-0">
            <AppLogo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5a6061] md:flex">
            <a href="#problems" className="transition hover:text-[#202829]">
              痛点
            </a>
            <a href="#features" className="transition hover:text-[#202829]">
              能力
            </a>
            <a href="#faq" className="transition hover:text-[#202829]">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/?submit=channel"
              className="hidden h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] sm:inline-flex"
            >
              提交渠道
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] shadow-[0_10px_30px_rgba(45,52,53,0.08)] transition hover:-translate-y-0.5 hover:bg-[#202829]"
            >
              开始比价
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-10 sm:px-8 lg:pb-18 lg:pt-16">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)] lg:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ec] px-3 py-1.5 text-xs font-semibold text-[#2f7a4b] ring-1 ring-[#45bf78]/15">
              <Radar size={14} />
              AI 订阅价格雷达
            </div>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-5xl lg:text-[3.5rem]">
              买 AI 订阅前，先看清真实价格。
            </h1>
            <p className="mt-6 max-w-[66ch] text-base leading-8 text-[#5a6061]">
              ChatGPT、Claude、Gemini、Grok 这些 AI 订阅，可能同时存在官网正价、地区价、代订价和第三方渠道价。PriceAI 把分散报价聚合到一起，让你购买前先看到有货最低价、原始来源和更新时间。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#2d3435] px-6 text-sm font-semibold text-[#f8f8f8] transition hover:-translate-y-0.5 hover:bg-[#202829]"
              >
                开始比价
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/?submit=channel"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#dde4e5] px-6 text-sm font-semibold text-[#2d3435] transition hover:-translate-y-0.5 hover:bg-[#d3dcdd]"
              >
                提交渠道
                <Send size={16} />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {platformOptions.slice(0, 7).map((platform) => (
                <span
                  key={platform}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15"
                >
                  {platformIconMap[platform] ? (
                    <Image src={platformIconMap[platform]} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                  ) : (
                    <Radar size={14} />
                  )}
                  {platform}
                </span>
              ))}
            </div>
          </div>

          <ProductPreview products={previewProducts} productTotal={data.products.length} offerTotal={data.offerTotal} availableCount={availableCount} />
        </section>

        <section id="problems" className="mt-18 scroll-mt-28">
          <SectionHeader
            eyebrow="Why PriceAI"
            title="AI 订阅价格不是一个统一市场。"
            text="小白第一次买会被名词绕晕，熟手也会被渠道数量拖慢。PriceAI 先把问题拆清楚，再把可比的信息放到同一个界面里。"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {problems.map((item, index) => (
              <ProblemCard key={item.title} index={index + 1} title={item.title} text={item.text} />
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 rounded-lg bg-[#202829] p-6 text-[#f8f8f8] shadow-[0_24px_70px_rgba(45,52,53,0.12)] md:grid-cols-[0.74fr_1fr] md:p-8">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f8f8]/10 text-[#45bf78]">
              <ShieldAlert size={19} />
            </div>
            <h2 className="mt-5 font-serif text-3xl font-semibold leading-tight tracking-normal">
              便宜不等于靠谱，贵也不等于安全。
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#d7dddd]">
              第三方渠道可能来自代订、地区权益、资格权益、设备权益，也可能来自更不稳定的号源。PriceAI 的价值不是替你背书，而是让你购买前看到更多可核验信息。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Boundary title="PriceAI 会做" items={["聚合多个渠道报价", "展示有货 / 缺货", "保留原始商品名", "显示更新时间"]} />
            <Boundary title="PriceAI 不做" items={["不卖货", "不收款", "不替渠道担保", "不承诺售后"]} />
          </div>
        </section>

        <section id="features" className="mt-18 scroll-mt-28">
          <SectionHeader
            eyebrow="What it does"
            title="把购买前最需要核验的信息放在前面。"
            text="PriceAI 不追求复杂的可信度标签，只保留用户真的会用来判断的信息：价格、库存、来源、原始标题和更新时间。"
          />
          <div className="mt-8 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            {features.map((feature) => (
              <FeatureRow key={feature.title} icon={feature.icon} title={feature.title} text={feature.text} />
            ))}
          </div>
        </section>

        <section className="mt-18 grid gap-10 lg:grid-cols-[0.7fr_1fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">How it works</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-normal text-[#202829]">
              三步完成购买前比价。
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#5a6061]">
              它适合第一次听说卡网的人，也适合已经收藏很多渠道、每次都要手动打开页面比价的人。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
            {steps.map(([title, text], index) => (
              <StepCard key={title} index={index + 1} title={title} text={text} />
            ))}
          </div>
        </section>

        <section className="mt-18 rounded-lg bg-[#f2f4f4] p-6 ring-1 ring-[#adb3b4]/15 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">Who uses it</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-normal text-[#202829]">
                如果你买之前会犹豫，它就有用。
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Audience title="小白用户" text="先理解为什么同一个订阅会有不同价格。" />
              <Audience title="比价用户" text="少打开几个渠道站，先看有货最低价。" />
              <Audience title="渠道发现者" text="发现新来源后提交，让系统后续尝试纳入。" />
            </div>
          </div>
        </section>

        <section id="faq" className="mt-18 scroll-mt-28">
          <SectionHeader
            eyebrow="FAQ"
            title="几个购买前最常见的问题。"
            text="这部分会尽量讲清楚 PriceAI 的边界。它是价格雷达，不是卖家，也不是担保平台。"
          />
          <div className="mt-8 divide-y divide-[#edf0f1] overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            {faqs.map(([question, answer]) => (
              <FaqItem key={question} question={question} answer={answer} />
            ))}
          </div>
        </section>

        <section className="mt-16 flex flex-col gap-5 rounded-lg bg-[#202829] px-6 py-7 text-[#f8f8f8] sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-normal">买之前，多看一个来源。</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d7dddd]">
              价格仅供参考，实际价格、库存和售后规则以原平台为准。发现新渠道，也可以提交给 PriceAI。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#f8f8f8] px-5 text-sm font-semibold text-[#202829] transition hover:-translate-y-0.5 hover:bg-[#edf0f1]"
            >
              开始比价
              <ArrowRight size={16} />
            </Link>
            <a
              href="https://github.com/physics-dimension/PriceAI"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#f8f8f8]/10 px-5 text-sm font-semibold text-[#f8f8f8] ring-1 ring-[#f8f8f8]/20 transition hover:-translate-y-0.5 hover:bg-[#f8f8f8]/15"
            >
              GitHub
              <ExternalLink size={15} />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductPreview({
  products,
  productTotal,
  offerTotal,
  availableCount,
}: {
  products: ExplorerProductSummary[];
  productTotal: number;
  offerTotal: number;
  availableCount: number;
}) {
  return (
    <aside className="rounded-lg bg-white p-4 shadow-[0_24px_70px_rgba(45,52,53,0.08)] ring-1 ring-[#adb3b4]/15">
      <div className="rounded-lg bg-[#f2f4f4] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">Live price desk</p>
            <h2 className="mt-1 text-base font-bold text-[#202829]">当前报价预览</h2>
          </div>
          <span className="rounded-full bg-[#e8f3ec] px-3 py-1 text-xs font-semibold text-[#2f7a4b]">
            有货优先
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniMetric label="商品" value={formatCount(productTotal)} />
          <MiniMetric label="报价" value={formatCount(offerTotal)} />
          <MiniMetric label="有货" value={formatCount(availableCount)} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-[#edf0f1]">
        <div className="grid grid-cols-[1fr_90px_72px] bg-[#f2f4f4] px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#5a6061]">
          <span>标准商品</span>
          <span>最低价</span>
          <span>状态</span>
        </div>
        <div className="divide-y divide-[#edf0f1] bg-white">
          {(products.length ? products : []).map((product) => (
            <div key={product.id} className="grid grid-cols-[1fr_90px_72px] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#202829]">{product.displayName}</p>
                <p className="mt-1 truncate text-xs text-[#5a6061]">
                  {product.lowestOffer?.sourceStoreName || product.lowestOffer?.sourceName || "原始渠道"} · {product.offerCount} 个报价
                </p>
              </div>
              <p className="text-sm font-bold text-[#202829]">{formatCurrency(product.lowestPrice, product.lowestOffer?.currency)}</p>
              <span className="w-fit rounded-full bg-[#e8f3ec] px-2 py-1 text-xs font-semibold text-[#2f7a4b]">
                有货
              </span>
            </div>
          ))}
          {!products.length ? (
            <div className="px-4 py-8 text-center text-sm text-[#5a6061]">暂无可预览报价。</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-[#fff7e8] px-4 py-3 text-xs leading-5 text-[#7a541b]">
        PriceAI 不参与交易。跳转原站前，请自行确认交付方式、售后规则和最终价格。
      </div>
    </aside>
  );
}

function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-[#5a6061]">{text}</p>
    </div>
  );
}

function ProblemCard({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f4f4] text-sm font-bold text-[#202829]">
        {index}
      </span>
      <h3 className="mt-4 text-base font-bold text-[#202829]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[#5a6061]">{text}</p>
    </article>
  );
}

function Boundary({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8]/8 p-4 ring-1 ring-[#f8f8f8]/12">
      <p className="text-sm font-bold text-[#f8f8f8]">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-[#d7dddd]">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <ShieldCheck size={14} className="shrink-0 text-[#45bf78]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="grid gap-3 border-b border-[#edf0f1] px-5 py-5 last:border-b-0 sm:grid-cols-[220px_1fr] sm:items-start">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f3ec] text-[#2f7a4b]">
          {icon}
        </span>
        <h3 className="text-base font-bold text-[#202829]">{title}</h3>
      </div>
      <p className="text-sm leading-7 text-[#5a6061]">{text}</p>
    </div>
  );
}

function StepCard({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <article className="grid gap-3 rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 sm:grid-cols-[44px_1fr]">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#202829] text-sm font-bold text-[#f8f8f8]">
        {index}
      </span>
      <div>
        <h3 className="text-base font-bold text-[#202829]">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-[#5a6061]">{text}</p>
      </div>
    </article>
  );
}

function Audience({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-lg bg-white p-4 ring-1 ring-[#adb3b4]/15">
      <h3 className="text-sm font-bold text-[#202829]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#5a6061]">{text}</p>
    </article>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <article className="grid gap-2 px-5 py-5 sm:grid-cols-[280px_1fr] sm:gap-6">
      <h3 className="font-semibold text-[#202829]">{question}</h3>
      <p className="text-sm leading-7 text-[#5a6061]">{answer}</p>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#5a6061]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#202829]">{value}</p>
    </div>
  );
}

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatCurrency(value: number | null, currency = "CNY"): string {
  if (value === null) return "暂无";
  const normalizedCurrency = currency || "CNY";
  const prefix = normalizedCurrency === "CNY" ? "¥" : `${normalizedCurrency} `;
  return `${prefix}${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
}
