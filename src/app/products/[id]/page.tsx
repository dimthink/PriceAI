import { Clock3, Layers3 } from "lucide-react";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { ProductDetailHeader, ProductReturnLink } from "@/components/ProductDetailHeader";
import { ProductOffersPanel } from "@/components/ProductOffersPanel";
import { getPublicProductSummary, listPublicProductOffers } from "@/lib/data";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const dynamicParams = true;

const productTypeLabels: Record<string, string> = {
  "订阅/会员": "订阅/会员",
  会员充值: "订阅/会员",
  成品账号: "成品账号",
  成品号: "成品账号",
  "邮箱/账号": "邮箱/账号",
  API额度: "API额度",
  "接码/验证": "接码/验证",
  虚拟卡: "虚拟卡",
  工具账号: "工具账号",
  其他: "其他",
};

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, initialOffers] = await Promise.all([
    getPublicProductSummary(id),
    listPublicProductOffers(id, { limit: 80, offset: 0 }),
  ]);

  if (!product) notFound();

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <ProductDetailHeader />

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ProductReturnLink />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-6 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:items-end">
            <div className="min-w-0 max-w-3xl">
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

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
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
              {product.offerCount} 条报价 · 只区分有货和缺货
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatRelativeTime(product.latestSeenAt)}
          </div>
        </div>

        <ProductOffersPanel
          productId={product.id}
          productSlug={product.slug}
          productName={product.displayName}
          initialCount={product.offerCount}
          initialData={initialOffers}
        />

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：本站仅聚合公开采集或审核通过的报价信息，不参与交易，实际价格、库存、质保和售后规则以原平台为准。
        </p>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-4 py-3 shadow-[0_12px_35px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[#5a6061]">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-[#202829]">{value}</p>
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

function productTypeLabel(productType: string): string {
  return productTypeLabels[productType] || productType;
}
