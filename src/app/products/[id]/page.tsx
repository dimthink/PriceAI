import type { Metadata } from "next";
import { ArrowRight, Clock3, ExternalLink, HelpCircle, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { JsonLd } from "@/components/JsonLd";
import { ProductDetailHeader, ProductReturnLink } from "@/components/ProductDetailHeader";
import { ProductOffersPanel } from "@/components/ProductOffersPanel";
import { canonicalCatalog } from "@/lib/catalog";
import { getPublicProductSummary, listPublicProductOffers } from "@/lib/data";
import {
  getOfficialPricePlanSummaryFromDataset,
  getOfficialPriceRowsByIdFromDataset,
  officialPricePlanId,
  type OfficialPricePlanSummary,
  type OfficialPriceRow,
  type OfficialPricesDataset,
} from "@/lib/official-prices";
import { getOfficialPricesDataset } from "@/lib/official-prices-db";
import type { ExplorerProductSummary } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return canonicalCatalog.map((product) => ({ id: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProductSummary(id);

  if (!product) {
    return {
      title: "商品详情",
    };
  }

  const priceText = product.lowestPrice !== null
    ? `${formatCurrency(product.lowestPrice, product.lowestOffer?.currency)} 起`
    : "暂无有货报价";
  const seoProfile = getProductSeoProfile(product);
  const detailText = getOfficialPricePlanMapping(product)
    ? "有货最低价、渠道报价、官方参考价和最近更新时间"
    : "有货最低价、渠道报价和最近更新时间";
  const title = seoProfile?.metadataTitle || `${product.displayName} 价格对比`;
  const description = seoProfile
    ? `${seoProfile.metadataDescription} 当前参考：${priceText}。`
    : `查看 ${product.displayName} 的${detailText}。当前参考：${priceText}。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      title,
      description: seoProfile?.metadataDescription || `对比 ${product.displayName} 的渠道报价、库存状态和更新时间。`,
      url: `https://priceai.cc/products/${product.slug}`,
    },
  };
}

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
  const [product, initialOffers, officialPricesDataset] = await Promise.all([
    getPublicProductSummary(id),
    listPublicProductOffers(id, { limit: 80, offset: 0 }),
    getOfficialPricesDataset(),
  ]);

  if (!product) notFound();

  const officialReference = buildOfficialPriceReference(product, officialPricesDataset);
  const seoProfile = getProductSeoProfile(product);

  return (
    <>
    <JsonLd data={buildProductJsonLd(product, officialReference, seoProfile)} />
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <ProductDetailHeader />

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ProductReturnLink />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-5 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-6">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{platformIcon(product.platform, product.id)} {product.platform}</Badge>
              <Badge>{productTypeLabel(product.productType)}</Badge>
              <Badge>{product.spec}</Badge>
            </div>
            <h1 className="mt-4 font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl">
              {product.displayName}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#5a6061]">{product.summary}</p>
          </div>
        </section>

        <ProductAvailabilityStrip product={product} />

        {officialReference ? (
          <OfficialPriceReferenceStrip reference={officialReference} product={product} />
        ) : null}

        {seoProfile ? <ProductSeoBrief product={product} profile={seoProfile} /> : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">渠道报价表</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {product.offerCount} 条报价 · {product.inStockCount} 有货 · 按有货优先和低价排序
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

        <ProductRelatedCta product={product} />

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：本站仅聚合公开采集或审核通过的报价信息，不参与交易，实际价格、库存、质保和售后规则以原平台为准。
        </p>
      </div>
    </main>
    </>
  );
}

type OfficialPriceReference = {
  summary: OfficialPricePlanSummary;
  rows: OfficialPriceRow[];
  usRow: OfficialPriceRow | null;
};

type ProductSeoProfile = {
  metadataTitle: string;
  metadataDescription: string;
  lead: string;
  points: string[];
  faq: Array<{
    question: string;
    answer: string;
  }>;
  links: Array<{
    label: string;
    href: string;
    description: string;
  }>;
};

const productSeoProfiles: Record<string, ProductSeoProfile> = {
  "chatgpt-plus": {
    metadataTitle: "ChatGPT Plus 价格对比：有货最低价、代充、成品号和 CDK",
    metadataDescription: "查看 ChatGPT Plus 有货最低价、渠道报价、Plus 代充、成品号、卡密/CDK 和更新时间。",
    lead:
      "ChatGPT Plus 是用户最常比较的 AI 订阅。PriceAI 会把 Plus 直充、代充、成品号、卡密/CDK 等报价聚合到同一个标准商品下，外层价格优先显示有货最低价。",
    points: [
      "先看有货最低价，再点进原渠道确认库存、质保和售后规则。",
      "Plus 成品号、代充和卡密/CDK 的交付方式不同，低价不代表风险相同。",
      "如果想自己走官方路径，可以同时参考官方地区价和支付方式指南。",
    ],
    faq: [
      {
        question: "ChatGPT Plus 代充、成品号和 CDK 是一回事吗？",
        answer:
          "不是。代充通常是给已有账号开通会员，成品号是直接交付账号，CDK 或卡密更偏兑换或自助开通。不同渠道的售后、登录方式和封号风险不同，购买前要看原平台说明。",
      },
      {
        question: "这个页面的最低价为什么和某些缺货报价不同？",
        answer:
          "商品页主价格优先取当前有货报价的最低价。缺货、隐藏或下架报价不会作为可购买最低价展示，但可能仍保留在历史报价表里供核对。",
      },
      {
        question: "ChatGPT Plus 适合直接买第三方渠道吗？",
        answer:
          "如果你追求省心和稳定，优先理解官网订阅和官方地区价；如果选择第三方渠道，应先核验售后群、联系方式、原站订单投诉入口和质保说明。",
      },
    ],
    links: [
      { label: "ChatGPT 平台页", href: "/platforms/chatgpt", description: "查看 Plus、Pro、Team、普号和 API/CDK 的整体价格入口。" },
      { label: "ChatGPT 获取方式指南", href: "/guides/chatgpt-subscription-options", description: "理解官方订阅、代充、成品号、Team 和 API/CDK 的区别。" },
      { label: "卡网渠道判断", href: "/guides/are-ai-subscription-card-shops-reliable", description: "购买第三方渠道前先看核验清单。" },
    ],
  },
  "chatgpt-team-business": {
    metadataTitle: "ChatGPT Team / Business 价格对比：团队邀请、母号和渠道报价",
    metadataDescription: "查看 ChatGPT Team / Business 有货最低价、团队邀请、母号、自动拉和渠道报价。",
    lead:
      "ChatGPT Team / Business 通常会被渠道写成 Team、Business、团队号、母号、邀请或自动拉。它和 Plus、Pro 不是同一类商品，购买前要确认交付方式和成员权限。",
    points: [
      "Team / Business 报价经常和邀请、母号、自动拉相关，务必看清是否需要提供账号邮箱。",
      "不要把 Team / Business 误当成 Plus；它对应的是团队/商业订阅权益。",
      "如果只想个人使用，先比较 Plus、Pro 和 Team 的权益差异再决定。",
    ],
    faq: [
      {
        question: "ChatGPT Team / Business 和 Plus 有什么区别？",
        answer:
          "Plus 是个人订阅，Team / Business 面向团队或商业场景。第三方渠道里常见的 Team 邀请、母号、自动拉，本质上是围绕团队席位或团队账号交付，和 Plus 成品号不是一类商品。",
      },
      {
        question: "Team 邀请为什么会比官方订阅便宜？",
        answer:
          "便宜价格可能来自地区价、批量席位、活动资格或第三方库存。PriceAI 只聚合价格和入口，不判断渠道来源是否合法或长期稳定。",
      },
      {
        question: "购买 Team / Business 前应该确认什么？",
        answer:
          "至少确认交付方式、是否需要提供邮箱、是否支持退出或换绑、质保多久、售后在哪里，以及原站是否支持订单投诉。",
      },
    ],
    links: [
      { label: "ChatGPT 平台页", href: "/platforms/chatgpt", description: "回到 ChatGPT 订阅与渠道总览。" },
      { label: "ChatGPT 获取方式指南", href: "/guides/chatgpt-subscription-options", description: "理解 Team、Plus、Pro、代充和成品号的关系。" },
      { label: "价格为什么不同", href: "/guides/why-ai-subscription-prices-differ", description: "了解官网价、地区价、资格价和第三方渠道价。" },
    ],
  },
  "openai-api-cdk": {
    metadataTitle: "API / CDK / 额度价格对比：OpenAI API、Codex API 和中转额度",
    metadataDescription: "查看 API/CDK、OpenAI API、Codex API、余额、额度和模型中转渠道报价。",
    lead:
      "API / CDK / 额度类商品更适合想把模型接入 Codex、Cursor、OpenCode 或自建工具的用户。它和 ChatGPT Plus 这类网页订阅不同，核心要看模型、额度、计费方式和可用限制。",
    points: [
      "先确认商品是官方 API 额度、CDK、余额，还是第三方模型路由或中转额度。",
      "如果要接入编程工具，还要看是否兼容 OpenAI API 格式、是否限制模型和速率。",
      "免费或低价 API 可能有额度、并发、模型版本和有效期限制。",
    ],
    faq: [
      {
        question: "API / CDK / 额度和 ChatGPT Plus 有什么区别？",
        answer:
          "ChatGPT Plus 是网页或 App 里的订阅权益，API / CDK / 额度用于程序调用模型。能不能在 Codex、Cursor、OpenCode 等工具里使用，取决于它是否提供兼容接口和可用模型。",
      },
      {
        question: "低价 API 额度一定划算吗？",
        answer:
          "不一定。要同时看可用模型、输入输出价格、有效期、速率限制、是否支持流式输出、是否有稳定文档和售后。",
      },
      {
        question: "PriceAI 会收录灰色中转 API 吗？",
        answer:
          "当前策略优先收录官方或公开文档可核验的 API 渠道。第三方中转会更谨慎，重点看来源、文档、稳定性和风险边界。",
      },
    ],
    links: [
      { label: "模型 API 雷达", href: "/api-models", description: "查看官方 API、免费 API、模型路由和 Token Plan。" },
      { label: "ChatGPT 平台页", href: "/platforms/chatgpt", description: "区分 ChatGPT 订阅、API/CDK 和账号类商品。" },
      { label: "指南目录", href: "/guides", description: "后续 API 和编程工具接入指南会集中收录在这里。" },
    ],
  },
  "gemini-pro-year": {
    metadataTitle: "Gemini Pro 价格对比：Google AI Pro、年卡、CDK 和渠道报价",
    metadataDescription: "查看 Gemini Pro / Google AI Pro 有货最低价、年卡、成品号、CDK、渠道报价和更新时间。",
    lead:
      "Gemini Pro / Google AI Pro 的低价来源可能包括官方地区价、学生或活动资格、第三方成品号、CDK 或代开渠道。对比时不要只看标价，也要看账号归属和续费方式。",
    points: [
      "Gemini Pro 常和 Google AI Pro、年卡、学生价、CDK 等表达混在一起。",
      "如果涉及 Google 账号或地区价，要额外注意账号地区、支付方式和续费限制。",
      "第三方渠道价格仅供参考，实际权益和售后以原平台说明为准。",
    ],
    faq: [
      {
        question: "Gemini Pro 和 Google AI Pro 是一回事吗？",
        answer:
          "很多渠道会混用 Gemini Pro 和 Google AI Pro。实际购买前应以原平台商品说明为准，确认是订阅权益、账号、CDK 还是其他形式。",
      },
      {
        question: "Gemini Pro 年卡为什么价格差很多？",
        answer:
          "价格差异可能来自官方地区价、活动资格、学生资格、账号库存或第三方渠道策略。低价不等于同款，必须看交付方式和质保。",
      },
      {
        question: "购买 Gemini Pro 前应该看哪些信息？",
        answer:
          "重点看是否需要提供 Google 账号、是否支持续费、是否有地区限制、是否能换绑，以及售后和退款规则。",
      },
    ],
    links: [
      { label: "官方地区价", href: "/official-prices", description: "查看 Gemini / Google AI 的公开地区价参考。" },
      { label: "Google Play 订阅指南", href: "/guides/google-play-ai-subscription", description: "理解 Google Play 国家/地区、付款资料和续费限制。" },
      { label: "地区价风险", href: "/guides/ai-subscription-region-price-risks", description: "判断低价区、税费、汇率和账号地区风险。" },
    ],
  },
  "claude-pro-month": {
    metadataTitle: "Claude Pro 价格对比：月卡、直充、成品号和渠道报价",
    metadataDescription: "查看 Claude Pro 有货最低价、月卡、直充、成品号、渠道报价、官方参考价和更新时间。",
    lead:
      "Claude Pro 是 Claude 用户最常比较的个人订阅。渠道里可能写成 Pro 月卡、直充、成品号或地区价代订，需要确认账号归属、支付方式和续费方式。",
    points: [
      "Claude Pro 和 Claude Max 不是同一档套餐，购买前先确认权益。",
      "如果是成品号，要看账号是否可改密、是否绑定邮箱、是否支持售后。",
      "如果是直充或代订，要确认是否需要提供账号，以及续费失败如何处理。",
    ],
    faq: [
      {
        question: "Claude Pro 和 Claude Max 有什么区别？",
        answer:
          "Claude Pro 是个人订阅档，Claude Max 通常是更高额度的套餐。第三方渠道有时会把 Pro、Max、账号和代订混写，购买前应确认实际权益。",
      },
      {
        question: "Claude Pro 低价渠道靠谱吗？",
        answer:
          "PriceAI 不为任何渠道背书。你可以把卡网当作信息源，先看售后群、联系方式、质保时间和原站投诉入口，再决定是否交易。",
      },
      {
        question: "Claude Pro 是否适合走官方订阅？",
        answer:
          "如果你更看重稳定和账号安全，官方订阅通常更稳；如果看重价格，可以用 PriceAI 对比第三方渠道，但要接受相应风险。",
      },
    ],
    links: [
      { label: "官方地区价", href: "/official-prices", description: "查看 Claude Pro 和 Max 的官方公开价格参考。" },
      { label: "卡网渠道判断", href: "/guides/are-ai-subscription-card-shops-reliable", description: "购买第三方 Claude 渠道前先看风险清单。" },
      { label: "价格为什么不同", href: "/guides/why-ai-subscription-prices-differ", description: "理解正价、地区价和第三方渠道价。" },
    ],
  },
  "chatgpt-pro-20x": {
    metadataTitle: "ChatGPT Pro 20x 价格对比：Pro 高额度、代开和渠道报价",
    metadataDescription: "查看 ChatGPT Pro 20x 有货最低价、Pro 高额度、代开、卡密、渠道报价、官方参考价和更新时间。",
    lead:
      "ChatGPT Pro 20x 通常指更高额度的 Pro 档位或相关渠道交付。它和 Plus、Team / Business 都不是同一类商品，价格差异很大时尤其要确认交付方式、权益描述和售后规则。",
    points: [
      "先确认原渠道写的是 Pro 20x、高额度 Pro、代开、充值还是卡密。",
      "Pro 20x 单价通常高于 Plus，异常低价要回到原站核验是否同款。",
      "如果原渠道有官方价、地区价或代订说明，要同时看续费方式和质保范围。",
    ],
    faq: [
      {
        question: "ChatGPT Pro 20x 和 Plus 有什么区别？",
        answer:
          "Plus 是常见个人会员档，Pro 20x 通常指更高额度或更高价格的 Pro 相关权益。第三方渠道可能用代开、充值、卡密等方式交付，购买前要确认是否真的是 Pro 20x。",
      },
      {
        question: "为什么 ChatGPT Pro 20x 的价格差异会很大？",
        answer:
          "价格可能受到官方价、地区价、渠道库存、交付方式和售后承诺影响。过低价格不一定是同款，应该点进原渠道核对商品详情。",
      },
      {
        question: "Pro 20x 适合优先看官方参考价吗？",
        answer:
          "适合。官方参考价可以作为价格基准，再用 PriceAI 查看第三方有货报价。最终是否购买第三方渠道，需要结合质保、售后和原站交易规则判断。",
      },
    ],
    links: [
      { label: "ChatGPT 平台页", href: "/platforms/chatgpt", description: "比较 Plus、Pro、Team 和 API/CDK 的整体价格。" },
      { label: "官方地区价", href: "/official-prices", description: "查看 ChatGPT 公开地区价和人民币估算价。" },
      { label: "价格为什么不同", href: "/guides/why-ai-subscription-prices-differ", description: "理解正价、地区价和第三方渠道价。" },
    ],
  },
  "super-grok": {
    metadataTitle: "Super Grok 价格对比：Grok 会员、激活码、月卡和渠道报价",
    metadataDescription: "查看 Super Grok 有货最低价、Grok 会员、激活码、月卡、年卡、渠道报价和官方地区价。",
    lead:
      "Super Grok 是 Grok 的订阅类权益。第三方渠道里可能写成 SuperGrok、Grok Super、激活码、月卡、年卡、直充或成品号，对比时要先确认具体权益和交付方式。",
    points: [
      "先确认是 Super Grok、SuperGrok Heavy，还是普通 Grok 体验号。",
      "如果是激活码、卡密或直充，要看是否限制账号地区、设备或续费方式。",
      "Grok 订阅有官方地区价参考，可以先用官方价作为价格锚点，再比较第三方有货报价。",
    ],
    faq: [
      {
        question: "Super Grok 和普通 Grok 账号有什么区别？",
        answer:
          "Super Grok 是订阅权益，普通 Grok 账号或体验号通常只是账号交付。第三方渠道可能混用描述，购买前要确认是否包含订阅、订阅档位和有效期。",
      },
      {
        question: "Super Grok 低价一般来自哪里？",
        answer:
          "价格差异可能来自官方地区价、渠道库存、激活码、活动资格或第三方成品号。PriceAI 只聚合公开报价，最终权益要以原渠道详情为准。",
      },
      {
        question: "购买 Super Grok 前应该核验什么？",
        answer:
          "建议核验有效期、是否可登录自己的账号、是否支持续费或换绑、质保多久、售后在哪里，以及原站是否支持订单投诉。",
      },
    ],
    links: [
      { label: "官方地区价", href: "/official-prices", description: "查看 Grok / SuperGrok 的公开地区价参考。" },
      { label: "价格为什么不同", href: "/guides/why-ai-subscription-prices-differ", description: "理解官网价、地区价和第三方渠道价的来源。" },
      { label: "卡网渠道判断", href: "/guides/are-ai-subscription-card-shops-reliable", description: "购买第三方渠道前先看售后和投诉入口。" },
    ],
  },
};

const officialPlanByProductId: Record<string, { appSlug: "chatgpt" | "claude" | "gemini" | "grok"; planSlug: string }> = {
  "chatgpt-plus-recharge": { appSlug: "chatgpt", planSlug: "plus-monthly" },
  "chatgpt-pro-5x": { appSlug: "chatgpt", planSlug: "pro-5x" },
  "chatgpt-pro-20x": { appSlug: "chatgpt", planSlug: "pro-20x" },
  "claude-pro-month": { appSlug: "claude", planSlug: "pro-monthly" },
  "claude-max-5x": { appSlug: "claude", planSlug: "max-5x-monthly" },
  "claude-max-20x": { appSlug: "claude", planSlug: "max-20x-monthly" },
  "gemini-pro-year": { appSlug: "gemini", planSlug: "ai-pro" },
  "gemini-ultra": { appSlug: "gemini", planSlug: "ai-ultra" },
  "super-grok": { appSlug: "grok", planSlug: "supergrok" },
};

function buildOfficialPriceReference(
  product: ExplorerProductSummary,
  dataset: OfficialPricesDataset,
): OfficialPriceReference | null {
  const mapping = getOfficialPricePlanMapping(product);
  if (!mapping) return null;

  const id = officialPricePlanId(mapping.appSlug, mapping.planSlug);
  const summary = getOfficialPricePlanSummaryFromDataset(dataset, id);
  if (!summary?.lowestRow) return null;

  const rows = getOfficialPriceRowsByIdFromDataset(dataset, id);
  return {
    summary,
    rows,
    usRow: rows.find((row) => row.countryCode === "US") || null,
  };
}

function getOfficialPricePlanMapping(product: Pick<ExplorerProductSummary, "id" | "slug">) {
  return officialPlanByProductId[product.id] || officialPlanByProductId[product.slug] || null;
}

function getProductSeoProfile(product: Pick<ExplorerProductSummary, "id" | "slug">): ProductSeoProfile | null {
  return productSeoProfiles[product.id] || productSeoProfiles[product.slug] || null;
}

function ProductSeoBrief({
  product,
  profile,
}: {
  product: ExplorerProductSummary;
  profile: ProductSeoProfile;
}) {
  return (
    <section className="mt-5 rounded-lg bg-white p-5 shadow-[0_18px_48px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15 lg:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f3ec] px-3 py-1 text-xs font-semibold text-[#2f7a4b]">
            <HelpCircle size={14} />
            商品解释
          </p>
          <h2 className="mt-4 font-serif text-2xl font-semibold tracking-normal text-[#202829]">
            如何理解 {product.displayName}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[#5a6061]">{profile.lead}</p>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#5a6061]">
            {profile.points.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#45bf78]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 rounded-lg bg-[#f2f4f4] p-4 ring-1 ring-[#adb3b4]/15">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">相关入口</p>
          <div className="mt-3 grid gap-2">
            {profile.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group block rounded-md bg-white px-3 py-3 ring-1 ring-[#adb3b4]/10 transition hover:-translate-y-0.5 hover:ring-[#45bf78]/35"
              >
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[#202829]">
                  {link.label}
                  <ArrowRight size={15} className="shrink-0 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#5a6061]">{link.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-[#edf0f1] pt-5">
        <h3 className="font-serif text-xl font-semibold tracking-normal text-[#202829]">常见问题</h3>
        <div className="mt-3 grid gap-3">
          {profile.faq.map((item) => (
            <details key={item.question} className="group rounded-lg bg-[#f9fafa] px-4 py-3 ring-1 ring-[#adb3b4]/15">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[#202829] marker:hidden">
                <span className="inline-flex w-full items-center justify-between gap-3">
                  {item.question}
                  <ArrowRight size={15} className="shrink-0 transition group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-2 text-sm leading-6 text-[#5a6061]">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function OfficialPriceReferenceStrip({
  reference,
  product,
}: {
  reference: OfficialPriceReference;
  product: ExplorerProductSummary;
}) {
  const { summary, rows, usRow } = reference;
  const lowest = summary.lowestRow;
  if (!lowest) return null;

  return (
    <section className="mt-4 rounded-lg bg-white px-4 py-3 shadow-[0_14px_42px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#5a6061]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-semibold text-[#47657a]">
            <BrandIcon platform={summary.platform} className="h-[15px] w-[15px]" />
            官方参考
          </span>
          <ReferenceText label="第三方有货最低" value={formatCurrency(product.lowestPrice, product.lowestOffer?.currency)} />
          <ReferenceText label="官方最低" value={formatCurrency(lowest.cnyPrice, "CNY")} detail={`${lowest.countryLabel} ${lowest.priceText}`} />
          <ReferenceText
            label="美国公开价"
            value={usRow ? formatCurrency(usRow.cnyPrice, "CNY") : "暂无"}
            detail={usRow ? `${usRow.priceText} · ${usRow.currencyCode}` : undefined}
          />
          <span className="text-xs text-[#adb3b4]">{rows.length} 个地区 · 汇率 {lowest.fxDate}</span>
        </div>
        <Link
          href={`/official-prices/${summary.id}`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
        >
          查看地区价
          <ExternalLink size={15} />
        </Link>
      </div>
    </section>
  );
}

function ReferenceText({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-xs text-[#5a6061]">{label}</span>
      <span className="font-semibold text-[#202829]">{value}</span>
      {detail ? <span className="hidden max-w-[180px] truncate text-xs text-[#adb3b4] sm:inline">{detail}</span> : null}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15">
      {children}
    </span>
  );
}

function ProductAvailabilityStrip({ product }: { product: ExplorerProductSummary }) {
  return (
    <section className="mt-4 rounded-lg bg-white px-4 py-4 shadow-[0_14px_42px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.15fr_0.75fr_0.75fr_0.9fr]">
        <ProductMetric
          label="当前有货最低"
          value={product.lowestPrice !== null ? formatCurrency(product.lowestPrice, product.lowestOffer?.currency) : "暂无有货"}
          tone={product.lowestPrice !== null ? "good" : "danger"}
          detail={product.lowestOffer ? `${product.lowestOffer.sourceStoreName || product.lowestOffer.sourceName} · 缺货不参与最低价` : "缺货或下架报价不参与最低价"}
        />
        <ProductMetric label="有货报价" value={`${product.inStockCount}`} detail="可作为当前购买参考" />
        <ProductMetric label="总报价" value={`${product.offerCount}`} detail={`${product.outOfStockCount} 条缺货或不可用`} />
        <ProductMetric label="最近记录" value={formatRelativeTime(product.latestSeenAt)} detail="以来源更新时间和采集记录为准" />
      </div>
    </section>
  );
}

function ProductMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "danger";
}) {
  return (
    <div className="rounded-lg bg-[#f2f4f4] px-4 py-3">
      <p className="text-xs font-semibold text-[#5a6061]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "good" ? "text-[#2f7a4b]" : tone === "danger" ? "text-[#9b3328]" : "text-[#202829]"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#5a6061]">{detail}</p>
    </div>
  );
}

function platformIcon(platform: string, productId?: string) {
  const className = "h-[15px] w-[15px]";

  if (productId) return <BrandIcon platform={platform} productId={productId} className={className} />;
  if (platform !== "其他") return <BrandIcon platform={platform} className={className} />;
  return <Layers3 className={`${className} text-[#5a6061]`} />;
}

function productTypeLabel(productType: string): string {
  return productTypeLabels[productType] || productType;
}

type RelatedCta = {
  title: string;
  description: string;
  links: Array<{
    label: string;
    href: string;
    tone?: "primary" | "secondary";
  }>;
};

function ProductRelatedCta({ product }: { product: ExplorerProductSummary }) {
  const cta = getRelatedCta(product);
  if (!cta) return null;

  return (
    <section className="mt-8 rounded-lg bg-[#f2f4f4] p-5 ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-normal text-[#202829]">{cta.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#5a6061]">{cta.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cta.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                link.tone === "primary"
                  ? "bg-[#2d3435] text-[#f8f8f8] hover:bg-[#202829]"
                  : "bg-[#dde4e5] text-[#2d3435] hover:bg-[#d3dcdd]"
              }`}
            >
              {link.label}
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function getRelatedCta(product: ExplorerProductSummary): RelatedCta | null {
  if (product.platform === "ChatGPT") {
    return {
      title: "想先弄清 ChatGPT 各种获取方式？",
      description: "可以先看平台价格页和新手指南，再回到这里核验具体渠道报价。",
      links: [
        { label: "平台页", href: "/platforms/chatgpt" },
        { label: "指南", href: "/guides/chatgpt-subscription-options", tone: "primary" },
      ],
    };
  }

  if (product.platform === "Gemini") {
    return {
      title: "想先弄清 Gemini 和 Google AI 的价格路径？",
      description: "可以先看 Gemini 平台页、Google Play 指南和地区价风险，再核验具体渠道报价。",
      links: [
        { label: "Gemini 平台页", href: "/platforms/gemini" },
        { label: "Google Play 指南", href: "/guides/google-play-ai-subscription" },
        { label: "地区价风险", href: "/guides/ai-subscription-region-price-risks", tone: "primary" },
      ],
    };
  }

  if (product.platform === "Claude") {
    return {
      title: "想先分清 Claude Pro、Max 和账号类商品？",
      description: "可以先看 Claude 平台页和官方参考价，再回到这里比较渠道报价和库存状态。",
      links: [
        { label: "Claude 平台页", href: "/platforms/claude" },
        { label: "官方地区价", href: "/official-prices" },
        { label: "渠道判断", href: "/guides/are-ai-subscription-card-shops-reliable", tone: "primary" },
      ],
    };
  }

  if (product.platform === "API/CDK" || product.id === "openai-api-cdk") {
    return {
      title: "想接入 Codex、Cursor 或自建工具？",
      description: "可以先看 API 平台页和模型 API 雷达，分清官方 API、免费 API、Token Plan 和渠道额度。",
      links: [
        { label: "API 平台页", href: "/platforms/api" },
        { label: "模型 API 雷达", href: "/api-models", tone: "primary" },
      ],
    };
  }

  return null;
}

function buildProductJsonLd(
  product: ExplorerProductSummary,
  officialReference: OfficialPriceReference | null,
  seoProfile: ProductSeoProfile | null,
) {
  const productUrl = `https://priceai.cc/products/${product.slug}`;
  const lowestOffer = product.lowestPrice !== null && product.lowestOffer
    ? {
        "@type": "AggregateOffer",
        lowPrice: product.lowestPrice,
        priceCurrency: product.lowestOffer.currency || "CNY",
        offerCount: Math.max(product.inStockCount, 1),
        availability: "https://schema.org/InStock",
        url: productUrl,
      }
    : {
        "@type": "AggregateOffer",
        offerCount: 0,
        availability: "https://schema.org/OutOfStock",
        url: productUrl,
      };

  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.displayName,
    description: seoProfile?.metadataDescription || product.summary,
    category: `${product.platform} / ${product.productType}`,
    brand: {
      "@type": "Brand",
      name: product.platform,
    },
    url: productUrl,
    offers: lowestOffer,
  };

  if (officialReference?.summary.lowestRow) {
    productSchema.additionalProperty = [
      {
        "@type": "PropertyValue",
        name: "官方最低地区价参考",
        value: formatCurrency(officialReference.summary.lowestRow.cnyPrice, "CNY"),
      },
      {
        "@type": "PropertyValue",
        name: "官方最低地区",
        value: officialReference.summary.lowestRow.countryLabel,
      },
    ];
  }

  const schemas: Record<string, unknown>[] = [
    productSchema,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "PriceAI",
          item: "https://priceai.cc",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: product.platform,
          item: `https://priceai.cc/?platform=${encodeURIComponent(product.platform)}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: product.displayName,
          item: productUrl,
        },
      ],
    },
  ];

  if (seoProfile?.faq.length) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: seoProfile.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return schemas;
}
