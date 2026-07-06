import type { Metadata } from "next";
import { Clock3, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiModelIcon } from "@/components/ApiModelIcon";
import { ReturnToListLink } from "@/components/ReturnToListLink";
import { SiteHeader } from "@/components/SiteHeader";
import {
  apiProviderTypeLabels,
  formatApiDisplayText,
  formatApiPrice,
  getApiBenchmarkPriceLabels,
  formatPlanPriceFrom,
  getPlanMonthlyPriceCny,
  getApiModelOffersByModel,
  getApiModelSummary,
  getApiPlansByModel,
  type ApiCurrency,
  type ApiModelOfferWithRelations,
  type ApiPlan,
  type ApiProviderType,
} from "@/lib/api-models";
import { getApiModelDataset } from "@/lib/api-models-db";
import { formatDateDay } from "@/lib/utils";

export const dynamicParams = true;
export const revalidate = 300;

const API_MODELS_RETURN_KEYS = ["family", "scope", "q", "type", "currency", "sort"] as const;

export async function generateStaticParams() {
  const dataset = await getApiModelDataset();
  return dataset.models.map((model) => ({
    id: model.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getApiModelDataset();
  const summary = getApiModelSummary(id, dataset);

  if (!summary) {
    return {
      title: "API 模型详情",
    };
  }

  return {
    title: `${summary.displayName} API 渠道`,
    description: `查看 ${summary.displayName} 的官方 API、Token Plan 和免费测试入口。`,
    alternates: {
      canonical: `/api-models/${id}`,
    },
    openGraph: {
      title: `${summary.displayName} API 渠道`,
      description: `对比 ${summary.displayName} 的公开 API 渠道和限制。`,
      url: `https://priceai.cc/api-models/${id}`,
    },
  };
}

export default async function ApiModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataset = await getApiModelDataset();
  const summary = getApiModelSummary(id, dataset);
  const currency: ApiCurrency = "CNY";

  if (!summary) notFound();

  const rows = getApiModelOffersByModel(id, dataset);
  const planRows = getApiPlansByModel(id, dataset)
    .filter((plan) => !rows.some((offer) => offer.providerId === plan.providerId))
    .sort(compareApiPlansByMonthlyPrice);
  const detailCount = rows.length + planRows.length;

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader logoCompact activeSection="api" />
      </div>

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ReturnToListLink
            allowedKeys={API_MODELS_RETURN_KEYS}
            basePath="/api-models"
            label="返回 API 模型"
          />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-6 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:items-end">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  <ApiModelIcon family={summary.family} modelName={summary.displayName} className="h-4 w-4" />
                  {summary.family}
                </Badge>
                <Badge>{summary.model.modelId}</Badge>
                {summary.model.contextWindow ? <Badge>{summary.model.contextWindow}</Badge> : null}
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl md:text-5xl">
                {summary.displayName}
              </h1>
              <p className="mt-4 max-w-[75ch] text-sm leading-7 text-[#5a6061]">{summary.model.description}</p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="渠道报价" value={`${summary.offerCount}`} />
              <Metric label="来源渠道" value={`${summary.providerCount}`} />
              <Metric label="官方 API" value={`${summary.officialCount}`} />
              <Metric label="Token Plan" value={`${summary.planCount}`} />
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">API 渠道报价表</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {detailCount} 条公开渠道信息 · 人民币展示，汇率日期 {dataset.fxSummary.date}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatDatasetDate(summary.latestUpdatedAt)}
          </div>
        </div>

        <ApiOfferMobileList rows={rows} currency={currency} />
        <ApiPlanMobileList plans={planRows} currency={currency} />

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
                  <TableHead>渠道</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>额度与限制</TableHead>
                  <TableHead>来源链接</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {rows.map((offer) => (
                  <ApiOfferRow key={offer.id} offer={offer} currency={currency} />
                ))}
                {planRows.map((plan) => (
                  <ApiPlanRow key={plan.id} plan={plan} currency={currency} />
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

function ApiOfferMobileList({ rows, currency }: { rows: ApiModelOfferWithRelations[]; currency: ApiCurrency }) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-3 md:hidden">
      {rows.map((offer) => {
        const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;
        const priceLabels = getApiBenchmarkPriceLabels(offer.model.family);

        return (
          <article key={offer.id} className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/api-models/providers/${offer.providerId}`} className="block truncate text-base font-bold leading-6 text-[#202829]">
                  {offer.provider.name}
                </Link>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#5a6061]">调用：{offer.routeModelId ?? offer.model.modelId}</p>
              </div>
              <TypeChip type={offer.provider.type} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <PriceMetric label={priceLabels.input} value={formatApiPrice(offer.inputPrice, currency)} />
              <PriceMetric label={priceLabels.output} value={formatApiPrice(offer.outputPrice, currency)} />
            </div>
            <div className="mt-2">
              <PriceMetric
                label={priceLabels.cacheRead}
                value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
                helper={offer.cacheWritePrice ? `${priceLabels.cacheWrite}：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
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
                <span className="truncate">查看来源</span>
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

function ApiPlanMobileList({ plans, currency }: { plans: ApiPlan[]; currency: ApiCurrency }) {
  if (!plans.length) return null;

  return (
    <section className="mt-5 grid grid-cols-1 gap-3 md:hidden">
      {plans.map((plan) => (
        <article key={plan.id} className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-6 text-[#202829]">{plan.providerName}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#5a6061]">{plan.name}</p>
            </div>
            <TypeChip type={plan.type} />
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#202829]">{formatPlanPriceFrom(plan, currency)}</p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(plan.quotaSummary)}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(plan.limitSummary)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={plan.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
            >
              <span className="truncate">查看来源</span>
              <ExternalLink size={13} className="shrink-0" />
            </a>
            <span className="text-xs text-[#5a6061]">{formatDatasetDate(plan.updatedAt)}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function ApiOfferRow({ offer, currency }: { offer: ApiModelOfferWithRelations; currency: ApiCurrency }) {
  const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;
  const priceLabels = getApiBenchmarkPriceLabels(offer.model.family);

  return (
    <tr className="align-top transition hover:bg-[#f7f9f9]">
      <td className="px-5 py-4">
        <Link href={`/api-models/providers/${offer.providerId}`} className="block truncate font-semibold leading-6 text-[#202829] transition hover:text-[#2f7a4b]">
          {offer.provider.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeChip type={offer.provider.type} />
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">调用：{offer.routeModelId ?? offer.model.modelId}</p>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <PriceMetric label={priceLabels.input} value={formatApiPrice(offer.inputPrice, currency)} />
          <PriceMetric label={priceLabels.output} value={formatApiPrice(offer.outputPrice, currency)} />
          <PriceMetric
            label={priceLabels.cacheRead}
            value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
            helper={offer.cacheWritePrice ? `${priceLabels.cacheWrite}：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
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
            <span className="truncate">查看来源</span>
            <ExternalLink size={13} className="shrink-0" />
          </a>
          <span className="text-xs font-medium text-[#5a6061]">{formatDatasetDate(offer.updatedAt)}</span>
        </div>
      </td>
    </tr>
  );
}

function ApiPlanRow({ plan, currency }: { plan: ApiPlan; currency: ApiCurrency }) {
  return (
    <tr className="align-top transition hover:bg-[#f7f9f9]">
      <td className="px-5 py-4">
        <p className="block truncate font-semibold leading-6 text-[#202829]">{plan.providerName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeChip type={plan.type} />
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">{plan.name}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold leading-6 text-[#202829]">{formatPlanPriceFrom(plan, currency)}</p>
        <p className="mt-1 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(plan.resetSummary)}</p>
      </td>
      <td className="px-5 py-4">
        <p className="line-clamp-3 text-sm font-medium leading-6 text-[#2d3435]">{formatApiDisplayText(plan.quotaSummary)}</p>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5a6061]">{formatApiDisplayText(plan.limitSummary)}</p>
      </td>
      <td className="px-5 py-4">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <a
            href={plan.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 py-2 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            <span className="truncate">查看来源</span>
            <ExternalLink size={13} className="shrink-0" />
          </a>
          <span className="text-xs font-medium text-[#5a6061]">{formatDatasetDate(plan.updatedAt)}</span>
        </div>
      </td>
    </tr>
  );
}

function compareApiPlansByMonthlyPrice(a: ApiPlan, b: ApiPlan) {
  const aPrice = getPlanMonthlyPriceCny(a);
  const bPrice = getPlanMonthlyPriceCny(b);
  if (aPrice === null && bPrice === null) return a.name.localeCompare(b.name, "zh-CN");
  if (aPrice === null) return 1;
  if (bPrice === null) return -1;
  return aPrice - bPrice || a.name.localeCompare(b.name, "zh-CN");
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
  return price ? formatApiPrice(price, currency, { maximumFractionDigits: 3 }) : "-";
}

function formatDatasetDate(value: string) {
  return formatDateDay(value);
}
