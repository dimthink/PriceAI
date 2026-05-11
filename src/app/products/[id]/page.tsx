import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Layers3,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { getProductGroup } from "@/lib/data";
import type { RawOffer } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const productTypeLabels: Record<string, string> = {
  会员充值: "订阅/会员",
  成品号: "成品账号",
  "共享/镜像": "共享/镜像",
  "卡密/CDK": "卡密/CDK",
  "邮箱/账号": "邮箱/账号",
  API额度: "API额度",
  其他: "其他",
};

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductGroup(id);

  if (!product) notFound();

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <header className="sticky top-0 z-30 bg-[#f9f9f9]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1300px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5a6061] hover:text-[#2d3435]">
            <ArrowLeft size={17} />
            返回首页
          </Link>
          <Link href="/" className="font-serif text-2xl font-bold tracking-normal text-[#4c4f50]">
            PriceAI
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1300px] px-5 py-8 sm:px-8 lg:py-12">
        <section className="rounded-lg bg-[#f2f4f4] p-6 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{platformIcon(product.platform)} {product.platform}</Badge>
                <Badge>{productTypeLabel(product.productType)}</Badge>
                <Badge>{product.spec}</Badge>
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl md:text-5xl">
                {product.displayName}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[#5a6061]">{product.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[520px] lg:grid-cols-4">
              <Metric label="最低价" value={formatCurrency(product.lowestPrice, product.lowestOffer?.currency)} />
              <Metric label="有货" value={`${product.inStockCount}`} />
              <Metric label="缺货" value={`${product.outOfStockCount}`} />
              <Metric label="渠道" value={`${product.offerCount}`} />
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">渠道报价表</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {product.offers.length} 条报价 · 只区分有货和缺货
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatRelativeTime(product.latestSeenAt)}
          </div>
        </div>

        <OfferTable offers={product.offers} />
        <section className="mt-5 grid gap-3 md:hidden">
          {product.offers.map((offer) => (
            <OfferListItem key={offer.id} offer={offer} />
          ))}
        </section>

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：本站仅聚合公开页面或手动录入的报价信息，不参与交易，实际价格、库存、质保和售后规则以原平台为准。
        </p>
      </div>
    </main>
  );
}

function OfferTable({ offers }: { offers: RawOffer[] }) {
  return (
    <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>状态</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>原始商品名</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>操作</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {offers.map((offer) => {
              const available = isOfferAvailable(offer);

              return (
                <tr key={offer.id} className={`transition hover:bg-[#f7f9f9] ${available ? "" : "bg-[#fbf7f6]"}`}>
                  <td className="px-5 py-4">
                    <OfferStatusBadge available={available} />
                  </td>
                  <td className="max-w-[210px] px-5 py-4">
                    <span className="block truncate font-semibold text-[#202829]">
                      {sourceLabel(offer)}
                    </span>
                    {sourceSecondaryLabel(offer) ? (
                      <span className="mt-1 block truncate text-xs text-[#5a6061]">{sourceSecondaryLabel(offer)}</span>
                    ) : null}
                  </td>
                  <td className="max-w-[380px] px-5 py-4">
                    <span className="block truncate text-[#2d3435]">{offer.sourceTitle}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-lg font-bold ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
                      {formatCurrency(offer.price, offer.currency)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</td>
                  <td className="px-5 py-4">
                    <OfferLink offer={offer} available={available} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfferListItem({ offer }: { offer: RawOffer }) {
  const available = isOfferAvailable(offer);

  return (
    <article className={`rounded-lg p-4 shadow-[0_16px_45px_rgba(45,52,53,0.04)] ring-1 ${available ? "bg-white ring-[#adb3b4]/15" : "bg-[#fbf7f6] ring-[#ead8d5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#202829]">{sourceLabel(offer)}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
        </div>
        <OfferStatusBadge available={available} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className={`text-2xl font-bold tracking-normal ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
            {formatCurrency(offer.price, offer.currency)}
          </p>
          <p className="mt-1 text-xs text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</p>
        </div>
        <OfferLink offer={offer} available={available} compact />
      </div>
    </article>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function OfferStatusBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
        available ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
      }`}
    >
      {available ? "有货" : "缺货"}
    </span>
  );
}

function OfferLink({
  offer,
  available,
  compact = false,
}: {
  offer: RawOffer;
  available: boolean;
  compact?: boolean;
}) {
  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition hover:opacity-90 ${
        compact ? "h-9 px-3" : "h-11 px-5"
      } ${
        available
          ? "bg-[#2d3435] text-[#f8f8f8]"
          : "bg-[#ead8d5] text-[#8f2f24]"
      }`}
    >
      {available ? "前往购买" : "查看"}
      <ExternalLink size={compact ? 14 : 16} />
    </a>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 shadow-[0_12px_35px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[#5a6061]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#202829]">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15">
      {children}
    </span>
  );
}

function platformIcon(platform: string) {
  const className = "h-[15px] w-[15px]";

  if (platform !== "其他") return <BrandIcon platform={platform} className={className} />;
  return <Layers3 className={`${className} text-[#5a6061]`} />;
}

function isOfferAvailable(offer: RawOffer): boolean {
  return offer.status !== "out_of_stock";
}

function offerTimestamp(offer: RawOffer): string | null | undefined {
  return offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt;
}

function sourceLabel(offer: RawOffer): string {
  return offer.sourceStoreName || offer.sourceName || "未记录渠道";
}

function sourceSecondaryLabel(offer: RawOffer): string | null {
  if (!offer.sourceName || offer.sourceName === sourceLabel(offer)) return null;
  return offer.sourceName;
}

function productTypeLabel(productType: string): string {
  return productTypeLabels[productType] || productType;
}
