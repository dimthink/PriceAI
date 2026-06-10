import type { Metadata } from "next";
import { Clock3, Database, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReturnToListLink } from "@/components/ReturnToListLink";
import { SiteHeader } from "@/components/SiteHeader";
import { API_MODELS_RETURN_INTENT_KEY } from "@/lib/list-return";
import {
  apiProviderTypeLabels,
  formatApiDisplayText,
  formatApiPrice,
  formatPlanPrice,
  getApiModelOffersByProvider,
  getApiPlansByProvider,
  getApiProviderSummary,
  type ApiCurrency,
  type ApiModelOfferWithRelations,
  type ApiPlan,
  type ApiProviderType,
} from "@/lib/api-models";
import { getApiModelDataset } from "@/lib/api-models-db";
import { formatDateMinute } from "@/lib/utils";

export const dynamicParams = true;
export const revalidate = 1800;

const API_MODELS_RETURN_KEYS = ["family", "scope", "q", "type", "currency", "sort"] as const;

export async function generateStaticParams() {
  const dataset = await getApiModelDataset();
  return dataset.providers.map((provider) => ({
    id: provider.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getApiModelDataset();
  const summary = getApiProviderSummary(id, dataset);

  if (!summary) {
    return {
      title: "API 渠道详情",
    };
  }

  return {
    title: `${summary.provider.name} API 模型覆盖`,
    description: `查看 ${summary.provider.name} 覆盖的 API 模型、Token Plan、价格和限制。`,
    alternates: {
      canonical: `/api-models/providers/${id}`,
    },
    openGraph: {
      title: `${summary.provider.name} API 模型覆盖`,
      description: `对比 ${summary.provider.name} 的公开模型、Token Plan 和限制。`,
      url: `https://priceai.cc/api-models/providers/${id}`,
    },
  };
}

export default async function ApiProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataset = await getApiModelDataset();
  const summary = getApiProviderSummary(id, dataset);
  const currency: ApiCurrency = "CNY";

  if (!summary) notFound();

  const provider = summary.provider;
  const rows = getApiModelOffersByProvider(id, dataset);
  const plans = getApiPlansByProvider(id, dataset);

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader maxWidthClassName="max-w-[1300px]" logoCompact activeSection="api" />
      </div>

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ReturnToListLink
            allowedKeys={API_MODELS_RETURN_KEYS}
            basePath="/api-models"
            intentKey={API_MODELS_RETURN_INTENT_KEY}
            label="返回 API 模型"
          />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-6 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:items-end">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  <ProviderLogo provider={provider} size="sm" />
                  {apiProviderTypeLabels[provider.type]}
                </Badge>
                {summary.families.map((family) => (
                  <Badge key={family}>{family}</Badge>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-4">
                <ProviderLogo provider={provider} size="lg" />
                <h1 className="font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl md:text-5xl">
                  {provider.name}
                </h1>
              </div>
              <p className="mt-4 max-w-[75ch] text-sm leading-7 text-[#5a6061]">{formatApiDisplayText(provider.description)}</p>
              <p className="mt-3 max-w-[75ch] text-sm leading-7 text-[#7a541b]">{formatApiDisplayText(provider.limitations)}</p>
              <a
                href={provider.pricingUrl ?? provider.url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
              >
                查看来源
                <ExternalLink size={15} />
              </a>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="模型覆盖" value={`${summary.modelCount}`} />
              <Metric label="报价明细" value={`${summary.offerCount}`} />
              <Metric label="Token Plan" value={`${summary.planCount}`} />
              <Metric label="类型" value={apiProviderTypeLabels[provider.type]} />
            </div>
          </div>
        </section>

        {plans.length ? (
          <section className="mt-8">
            <div className="mb-3">
              <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">Token Plan 与额度</h2>
              <p className="mt-2 text-sm text-[#5a6061]">先看这个渠道的 Token Plan 口径，再决定是否适合你的调用方式。</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {plans.map((plan) => (
                <PlanPanel key={plan.id} plan={plan} currency={currency} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">覆盖模型明细</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {rows.length} 条公开渠道信息 · 人民币展示，汇率日期 {dataset.fxSummary.date}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatDatasetDate(summary.latestUpdatedAt)}
          </div>
        </div>

        <ApiOfferMobileList rows={rows} currency={currency} />

        <section className="mt-5 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[30%]" />
                <col className="w-[27%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
                <tr>
                  <TableHead>模型</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>额度与限制</TableHead>
                  <TableHead>来源</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {rows.map((offer) => (
                  <ApiOfferRow key={offer.id} offer={offer} currency={currency} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：PriceAI 只整理公开文档和公开页面中的 API 渠道信息，不售卖 API，不承诺可用性，不替任何渠道提供 SLA。免费和低价渠道可能存在限流、排队、模型下线、地区限制或条款变化。
        </p>
      </div>
    </main>
  );
}

function PlanPanel({ plan, currency }: { plan: ApiPlan; currency: ApiCurrency }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-[#202829]">{plan.providerName}</p>
          <h3 className="mt-1 text-lg font-bold text-[#202829]">{plan.name}</h3>
        </div>
        <TypeChip type={plan.type} />
      </div>
      <p className="mt-4 text-sm font-semibold text-[#202829]">{formatPlanPrice(plan, currency)}</p>
      <p className="mt-2 text-sm leading-6 text-[#5a6061]">{formatApiDisplayText(plan.quotaSummary)}</p>
      <p className="mt-1 text-sm leading-6 text-[#5a6061]">{formatApiDisplayText(plan.resetSummary)}</p>
      <p className="mt-3 text-xs leading-5 text-[#7a541b]">{formatApiDisplayText(plan.limitSummary)}</p>
      {plan.coverageLabel ? <p className="mt-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(plan.coverageLabel)}</p> : null}
      <a
        href={plan.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
      >
        {plan.sourceLabel}
        <ExternalLink size={13} />
      </a>
    </article>
  );
}

function ApiOfferMobileList({ rows, currency }: { rows: ApiModelOfferWithRelations[]; currency: ApiCurrency }) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-3 md:hidden">
      {rows.map((offer) => {
        const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;

        return (
          <article key={offer.id} className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/api-models/${offer.modelId}`} className="block truncate text-base font-bold leading-6 text-[#202829]">
                  {offer.model.displayName}
                </Link>
                <p className="mt-0.5 text-sm text-[#5a6061]">{offer.model.family}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">调用：{offer.routeModelId ?? offer.model.modelId}</p>
              </div>
              <TypeChip type={offer.provider.type} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <PriceMetric label="输入" value={formatApiPrice(offer.inputPrice, currency)} />
              <PriceMetric label="输出" value={formatApiPrice(offer.outputPrice, currency)} />
            </div>
            <div className="mt-2">
              <PriceMetric
                label="缓存"
                value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
                helper={offer.cacheWritePrice ? `写入：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
              />
            </div>

            <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">{formatApiDisplayText(offer.freeOrPlan)}</p>
            {offer.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(offer.notes)}</p> : null}
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(offer.limitSummary)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={sourceHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
              >
                <span className="truncate">{offer.sourceLabel}</span>
                <ExternalLink size={13} className="shrink-0" />
              </a>
              <span className="text-xs text-[#5a6061]">{formatDatasetDate(offer.updatedAt)}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ApiOfferRow({ offer, currency }: { offer: ApiModelOfferWithRelations; currency: ApiCurrency }) {
  const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;

  return (
    <tr className="align-top transition hover:bg-[#f7f9f9]">
      <td className="px-5 py-4">
        <Link href={`/api-models/${offer.modelId}`} className="block truncate font-semibold leading-6 text-[#202829] hover:text-[#2f7a4b]">
          {offer.model.displayName}
        </Link>
        <p className="mt-1 text-xs font-medium text-[#5a6061]">{offer.model.family}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">调用：{offer.routeModelId ?? offer.model.modelId}</p>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <PriceMetric label="输入" value={formatApiPrice(offer.inputPrice, currency)} />
          <PriceMetric label="输出" value={formatApiPrice(offer.outputPrice, currency)} />
          <PriceMetric
            label="缓存"
            value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
            helper={offer.cacheWritePrice ? `写入：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
          />
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">{formatApiDisplayText(offer.freeOrPlan)}</p>
        {offer.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(offer.notes)}</p> : null}
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5a6061]">{formatApiDisplayText(offer.limitSummary)}</p>
      </td>
      <td className="px-5 py-4">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <a
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 py-2 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            <span className="truncate">{offer.sourceLabel}</span>
            <ExternalLink size={13} className="shrink-0" />
          </a>
          <span className="text-xs font-medium text-[#5a6061]">{formatDatasetDate(offer.updatedAt)}</span>
        </div>
      </td>
    </tr>
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

function ProviderLogo({
  provider,
  size,
}: {
  provider: { name: string; logoUrl?: string };
  size: "sm" | "lg";
}) {
  const boxClassName =
    size === "lg"
      ? "h-14 w-14 rounded-lg bg-white shadow-[0_12px_35px_rgba(45,52,53,0.04)]"
      : "h-5 w-5 rounded-full bg-[#f2f4f4]";
  const imageClassName = size === "lg" ? "h-9 w-9" : "h-4 w-4";

  return (
    <span className={`grid shrink-0 place-items-center ring-1 ring-[#adb3b4]/15 ${boxClassName}`}>
      {provider.logoUrl ? (
        <Image
          src={provider.logoUrl}
          alt=""
          aria-hidden="true"
          width={size === "lg" ? 36 : 16}
          height={size === "lg" ? 36 : 16}
          className={`${imageClassName} object-contain`}
        />
      ) : (
        <Database size={size === "lg" ? 22 : 14} />
      )}
    </span>
  );
}

function TypeChip({ type }: { type: ApiProviderType }) {
  const classNameByType: Record<ApiProviderType, string> = {
    official: "bg-[#e8f3ec] text-[#2f7a4b]",
    subscription: "bg-[#e4e9ea] text-[#2d3435]",
    router: "bg-[#eef3f8] text-[#47657a]",
    free: "bg-[#fff7e8] text-[#7a541b]",
  };

  return (
    <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold ${classNameByType[type]}`}>
      {apiProviderTypeLabels[type]}
    </span>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function PriceMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f7f9f9] px-3 py-2 ring-1 ring-[#adb3b4]/10">
      <p className="text-[0.68rem] font-semibold text-[#5a6061]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#202829]">{value}</p>
      {helper ? <p className="mt-1 break-words text-xs leading-5 text-[#5a6061]">{helper}</p> : null}
    </div>
  );
}

function formatCacheApiPrice(price: ApiModelOfferWithRelations["cacheReadPrice"], currency: ApiCurrency) {
  return price ? formatApiPrice(price, currency, { maximumFractionDigits: 3 }) : "待确认";
}

function formatDatasetDate(value: string) {
  return formatDateMinute(value);
}
