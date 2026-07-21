import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Braces, CheckCircle2, Clock3, Database, ExternalLink, KeyRound, Radar } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-static";
export const revalidate = false;

const pageUrl = "https://priceai.cc/developers/price-radar";
const latestUrl = "https://data.priceai.cc/latest.json";

export const metadata: Metadata = {
  title: "Price Radar 公开 API 文档",
  description: "通过 PriceAI Price Radar 快照获取标准商品最低价、默认 Top 5 和常见快速筛选标签排名，供智能体、脚本和数据工具调用。",
  alternates: { canonical: "/developers/price-radar" },
  openGraph: {
    title: "Price Radar 公开 API 文档 | PriceAI",
    description: "不用爬取页面，直接读取可缓存的价格雷达快照。",
    url: pageUrl,
  },
};

const shellExample = `curl -s https://data.priceai.cc/latest.json

# 读取响应中的 snapshot_url，再下载不可变快照
curl -s https://data.priceai.cc/v1/snapshots/<snapshot-id>.json`;

const javascriptExample = `let etag = null;
let snapshotId = null;

async function refreshPrices() {
  const response = await fetch("https://data.priceai.cc/latest.json", {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (response.status === 304) return null;

  etag = response.headers.get("etag");
  const latest = await response.json();
  if (latest.snapshot_id === snapshotId) return null;

  snapshotId = latest.snapshot_id;
  return fetch(latest.snapshot_url).then((item) => item.json());
}`;

const presetExample = `const product = snapshot.products.find(
  (item) => item.slug === "chatgpt-plus"
);

console.log(product.lowest_price);
console.log(product.top_offers);

const verified = product.presets.find(
  (preset) => preset.id === "account_verified"
);
console.log(verified?.top_offers ?? []);`;

const fields = [
  ["lowest_price", "当前可购买报价中的最低价；没有可用报价时为 null。"],
  ["top_offers", "默认排序下最多 5 条报价，包含价格、渠道、原始链接和状态。"],
  ["presets", "该商品已有快照的常见单标签筛选结果；每个标签最多返回 Top 5。"],
  ["snapshot_generated_at", "该商品默认快照的生成时间，用于判断数据新鲜度。"],
  ["stale", "任一默认商品快照超过 2 小时时为 true。"],
] as const;

export default function PriceRadarDeveloperPage() {
  return (
    <main className="min-h-screen bg-[var(--color-page)] text-[var(--color-text-body)]">
      <JsonLd data={buildJsonLd()} />
      <div className="sticky top-0 z-40 border-b border-[var(--color-border-soft)] bg-[var(--color-page-translucent)] backdrop-blur-xl">
        <SiteHeader />
      </div>

      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[210px_minmax(0,760px)] lg:gap-14 lg:pt-12">
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-1 text-sm" aria-label="Price Radar 文档目录">
            <p className="mb-3 px-3 text-xs font-bold text-[var(--color-text-soft)]">PRICE RADAR V1</p>
            {[
              ["#quick-start", "快速开始"],
              ["#data", "数据内容"],
              ["#cache", "缓存策略"],
              ["#migration", "爬虫迁移"],
              ["#limits", "当前边界"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="block rounded-md px-3 py-2 font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 overflow-hidden">
          <header className="border-b border-[var(--color-border)] pb-9">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-success-text)]">
              <Radar size={16} />
              开发者 / 公开数据
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-normal text-[var(--color-text-primary)] sm:text-5xl">
              Price Radar 公开 API
            </h1>
            <p className="mt-5 max-w-[68ch] text-base leading-8 text-[var(--color-text-muted)]">
              给智能体、脚本和数据工具使用的只读价格快照。无需抓取 PriceAI 页面，也不会在每次请求时查询数据库。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={latestUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-text-primary)] px-4 text-sm font-semibold text-[var(--color-page)] transition hover:opacity-90">
                打开 latest.json <ExternalLink size={15} />
              </a>
              <a href="/price-radar-v1.schema.json" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-hover)]">
                查看 JSON Schema <Braces size={15} />
              </a>
            </div>
          </header>

          <section id="quick-start" className="scroll-mt-28 border-b border-[var(--color-border)] py-10">
            <SectionLabel icon={CheckCircle2}>快速开始</SectionLabel>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)]">两次请求拿到完整快照</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              <Step index="1" title="读取指针">请求 latest.json，获得当前 snapshot_id 和 snapshot_url。</Step>
              <Step index="2" title="判断更新">只有 snapshot_id 变化时，才下载新的完整快照。</Step>
              <Step index="3" title="本地查询">按商品 slug、最低价、Top 5 或 presets 在本地筛选。</Step>
            </ol>
            <CodeBlock code={shellExample} label="Shell" />
            <CodeBlock code={javascriptExample} label="JavaScript" />
          </section>

          <section id="data" className="scroll-mt-28 border-b border-[var(--color-border)] py-10">
            <SectionLabel icon={Database}>数据内容</SectionLabel>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)]">标准商品、最低价、Top 5 和常见标签</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
              当前快照覆盖站内标准商品。每个商品带默认 Top 5，并在 <code className="font-mono text-[var(--color-text-primary)]">presets</code> 中返回已经生成快照的常见快速筛选标签。不同商品拥有的标签可能不同，调用方应以返回值为准。
            </p>
            <dl className="mt-6 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {fields.map(([name, description]) => (
                <div key={name} className="grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <dt className="break-all font-mono text-sm font-semibold text-[var(--color-text-primary)]">{name}</dt>
                  <dd className="text-sm leading-6 text-[var(--color-text-muted)]">{description}</dd>
                </div>
              ))}
            </dl>
            <CodeBlock code={presetExample} label="读取商品与快速标签" />
          </section>

          <section id="cache" className="scroll-mt-28 border-b border-[var(--color-border)] py-10">
            <SectionLabel icon={Clock3}>缓存策略</SectionLabel>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)]">让调用量随数据变化，而不是随访问量增长</h2>
            <div className="mt-5 space-y-3 text-sm leading-7 text-[var(--color-text-muted)]">
              <p><strong className="text-[var(--color-text-primary)]">latest.json：</strong>最多每分钟检查一次，并保存 ETag；支持 <code className="font-mono">If-None-Match</code> 和 304。</p>
              <p><strong className="text-[var(--color-text-primary)]">snapshot_url：</strong>URL 不可变。下载一次后可以长期缓存，只有 snapshot_id 变化才重新下载。</p>
              <p><strong className="text-[var(--color-text-primary)]">刷新节奏：</strong>通常约 5 分钟，具体新鲜度以各层级的生成时间和 stale 字段为准。</p>
            </div>
          </section>

          <section id="migration" className="scroll-mt-28 border-b border-[var(--color-border)] py-10">
            <SectionLabel icon={ArrowRight}>爬虫迁移</SectionLabel>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)]">从页面或旧接口迁移</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
              如果你现在抓取 HTML、RSC 请求，或轮询 <code className="break-all font-mono">/api/explorer</code>、<code className="break-all font-mono">/api/offers</code>、<code className="break-all font-mono">/api/products/:id/offers</code>，请改用 Price Radar。旧接口暂不下线，其响应头会提供文档和公开数据地址，便于程序自动发现迁移入口。
            </p>
            <div className="mt-6 rounded-md bg-[var(--color-surface)] px-4 py-4 ring-1 ring-[var(--color-border-soft)]">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">建议迁移顺序</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">先并行读取并校验一轮快照，再把只读价格任务切到 latest.json；保留本地最后一份有效快照作为网络异常时的降级数据。</p>
            </div>
          </section>

          <section id="limits" className="scroll-mt-28 py-10">
            <SectionLabel icon={KeyRound}>当前边界</SectionLabel>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)]">匿名快照无需 API Key</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
              V1 不支持任意关键词搜索、组合标签、价格区间、深分页、原始全量报价或历史查询。后续会再评估 API Key 版本，用于更灵活的查询、额度管理和调用统计；现有匿名快照会保持简单、可缓存。
            </p>
            <p className="mt-5 rounded-md border-l-4 border-[var(--color-warning-text)] bg-[var(--color-surface)] px-4 py-3 text-sm leading-7 text-[var(--color-text-muted)]">
              PriceAI 提供的是信息与比价参考。价格、库存、交付、质保和售后可能变化，购买前请回到原始渠道再次核验。
            </p>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
              <a href="/.well-known/price-radar.json" className="text-[var(--color-text-primary)] hover:underline">Discovery</a>
              <a href="/price-radar-v1.schema.json" className="text-[var(--color-text-primary)] hover:underline">JSON Schema</a>
              <a href="/price-radar-api.md" className="text-[var(--color-text-primary)] hover:underline">Markdown 文档</a>
              <Link href="/guides" className="text-[var(--color-text-primary)] hover:underline">PriceAI 入门指南</Link>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Radar; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-success-text)]"><Icon size={15} />{children}</div>;
}

function Step({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <li className="border-t-2 border-[var(--color-border-muted)] pt-4">
      <span className="font-mono text-xs font-bold text-[var(--color-text-soft)]">0{index}</span>
      <h3 className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{children}</p>
    </li>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="mt-6 overflow-hidden rounded-md bg-[#202829] ring-1 ring-black/10">
      <div className="border-b border-white/10 px-4 py-2 font-mono text-[11px] font-semibold text-[#adb3b4]">{label}</div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#f2f4f4] sm:text-sm"><code>{code}</code></pre>
    </div>
  );
}

function buildJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    name: "Price Radar 公开 API 文档",
    url: pageUrl,
    inLanguage: "zh-CN",
    description: "PriceAI 标准商品最低价、Top 5 报价与常见快速筛选标签的公开快照接口。",
    about: {
      "@type": "Dataset",
      name: "PriceAI Price Radar v1",
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: latestUrl,
      },
    },
  };
}
