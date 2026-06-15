"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Clock,
  ExternalLink,
  HelpCircle,
  Users,
} from "lucide-react";
import type {
  TransitModelFamily,
  TransitModelPrice,
  TransitStation,
} from "@/data/api-transit/types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_COMMERCIAL_LABELS,
  TRANSIT_DATA_STATUS_LABELS,
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_RISK_LABELS,
  TRANSIT_STATION_STATUS_LABELS,
  TRANSIT_USAGE_ADVICE_LABELS,
} from "@/data/api-transit/types";
import {
  formatAvailability,
  formatPercent,
  formatRate,
  getCombinedRateForPrice,
  getFamilyPrices,
  getFamilyRateSummary,
  getRateBadgeClass,
  getStationRechargeCoefficient,
  getUsageAdviceBadgeClass,
} from "@/lib/api-transit";

interface Props {
  station: TransitStation;
  backHref: string;
}

export default function TransitStationDetail({ station, backHref }: Props) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (backHref.includes("?")) {
      router.push(backHref);
    } else {
      router.back();
    }
  }, [backHref, router]);

  return (
    <div>
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5a6061] transition-colors hover:text-[#2d3435]"
      >
        <ArrowLeft className="h-4 w-4" />
        返回中转站列表
      </button>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-lg bg-[#f2f4f4] text-lg font-black text-[#202829]">
                {station.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-[family-name:var(--font-serif)] text-2xl font-semibold leading-tight text-[#202829]">
                  {station.name}
                </h1>
                <a
                  href={station.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-[#5a6061] transition-colors hover:text-[#2d3435]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {station.websiteUrl}
                </a>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusPill tone={station.status === "active" ? "success" : station.status === "limited" ? "warning" : "muted"}>
                {TRANSIT_STATION_STATUS_LABELS[station.status]}
              </StatusPill>
              <StatusPill tone="info">{TRANSIT_COMMERCIAL_LABELS[station.commercialRelation]}</StatusPill>
              <StatusPill tone={station.dataStatus === "verified" ? "success" : station.dataStatus === "sample" ? "warning" : "muted"}>
                数据状态：{TRANSIT_DATA_STATUS_LABELS[station.dataStatus]}
              </StatusPill>
              <span className="inline-flex items-center gap-1 text-xs text-[#5a6061]">
                <Clock className="h-3 w-3" />
                更新于 {station.lastUpdatedAt}
              </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-[#2d3435]">{station.summary}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={station.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-bold text-[#f8f8f8] transition-colors hover:bg-[#202829]"
              >
                访问站点
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Link
                href="/api-transit/submit"
                className="inline-flex h-10 items-center rounded-full bg-[#dde4e5] px-4 text-sm font-bold text-[#2d3435] transition-colors hover:bg-[#cfd8d9]"
              >
                提交反馈
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="充值系数" value={formatRate(getStationRechargeCoefficient(station))} helper={station.prices[0]?.rechargeRatio ?? "未公开充值比例"} />
            <MetricCard label="近 7 日稳定性" value={formatPercent(station.availability.sevenDayRate)} helper={`样本 ${station.availability.sevenDaySamples}`} />
            <MetricCard label="最后检查" value={station.availability.lastCheckedAt ?? "暂无"} helper={station.availability.note ?? "尚未接入可用性检测"} />
          </section>

          <PriceTable station={station} family="claude" />
          <PriceTable station={station} family="gpt" />
          <AvailabilityTable station={station} />
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-[#202829]">
              <Banknote className="h-4 w-4" />
              渠道与号池
            </h3>
            <InfoGroup label="渠道类型" items={station.channelTypes.map((type) => TRANSIT_CHANNEL_TYPE_LABELS[type])} />
            <InfoGroup label="账号池" items={station.accountPools.map((pool) => TRANSIT_ACCOUNT_POOL_LABELS[pool])} />
            <InfoGroup label="支付方式" items={station.paymentMethods} />
          </section>

          <section className="rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-[#202829]">
              <AlertTriangle className="h-4 w-4" />
              风险与建议
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {station.riskLabels.map((risk) => (
                <span key={risk} className="rounded-full bg-[#fff7e8] px-2.5 py-1 text-[11px] font-bold text-[#7a541b]">
                  {TRANSIT_RISK_LABELS[risk]}
                </span>
              ))}
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${getUsageAdviceBadgeClass(station.usageAdvice)}`}>
                {TRANSIT_USAGE_ADVICE_LABELS[station.usageAdvice]}
              </span>
            </div>

            {station.feedback.publicNotes ? (
              <div className="mt-4 border-t border-[#dfe4e5] pt-4">
                <h4 className="mb-2 flex items-center gap-1 text-xs font-bold text-[#5a6061]">
                  <Users className="h-3.5 w-3.5" />
                  用户反馈
                </h4>
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                  <span className="text-[#7a8182]">
                    待核验：<strong className="text-[#7a541b]">{station.feedback.pendingCount}</strong>
                  </span>
                  <span className="text-[#7a8182]">
                    已核验风险：<strong className="text-[#9b3328]">{station.feedback.verifiedRiskCount}</strong>
                  </span>
                </div>
                {station.feedback.mainThemes.length ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {station.feedback.mainThemes.map((theme) => (
                      <span key={theme} className="rounded-full bg-[#fff7e8] px-2 py-0.5 text-[10px] text-[#7a541b]">
                        {theme}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs leading-relaxed text-[#5a6061]">{station.feedback.publicNotes}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-[#dfe4e5] bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-[#202829]">
              <HelpCircle className="h-4 w-4" />
              售后与规则
            </h3>
            <div className="space-y-2 text-xs">
              <TextLine label="售后渠道" value={station.supportChannels.join("、")} />
              <TextLine label="退款政策" value={station.refundPolicy} />
              <TextLine label="最低充值" value={station.minimumTopUp} />
              <TextLine label="余额有效期" value={station.balanceExpiry} />
            </div>
          </section>

          <div className="rounded-lg border border-[#fff1cf] bg-[#fff7e8] p-4 text-xs leading-relaxed text-[#7a541b]">
            <p className="mb-1 font-bold">免责声明</p>
            <p>
              PriceAI 只整理公开资料、公开价格和用户反馈，不售卖 API，也不替任何商家担保。首次使用建议控制充值金额，并在原站再次核验价格与规则。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PriceTable({
  station,
  family,
}: {
  station: TransitStation;
  family: TransitModelFamily;
}) {
  const prices = getFamilyPrices(station, family);
  const summary = getFamilyRateSummary(station, family);

  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe4e5] bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe4e5] bg-[#f2f4f4] px-5 py-3">
        <h2 className="text-base font-extrabold text-[#202829]">
          {TRANSIT_MODEL_FAMILY_LABELS[family]} 价格表
        </h2>
        <span className="text-xs font-semibold text-[#5a6061]">
          最低综合倍率 {formatRate(summary.combinedRateMin)}
        </span>
      </div>
      {prices.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="bg-[#f2f4f4]/50">
                <TableHead>标准模型</TableHead>
                <TableHead>分组名</TableHead>
                <TableHead>模型倍率</TableHead>
                <TableHead>综合倍率</TableHead>
                <TableHead>输入价</TableHead>
                <TableHead>输出价</TableHead>
                <TableHead>号池</TableHead>
                <TableHead>确认时间</TableHead>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <PriceRow key={`${price.standardModel}-${price.groupName}`} station={station} price={price} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-sm text-[#5a6061]">这个站点暂未收录 {TRANSIT_MODEL_FAMILY_LABELS[family]} 报价。</div>
      )}
    </section>
  );
}

function PriceRow({
  station,
  price,
}: {
  station: TransitStation;
  price: TransitModelPrice;
}) {
  const combinedRate = getCombinedRateForPrice(station, price);

  return (
    <tr className="border-b border-[#dfe4e5]">
      <td className="px-4 py-3 text-xs font-semibold text-[#202829]">{price.standardModel}</td>
      <td className="px-4 py-3 text-xs text-[#2d3435]">{price.groupName}</td>
      <td className="px-4 py-3 text-sm font-semibold text-[#202829]">
        {price.modelMultiplier !== null ? `${price.modelMultiplier.toFixed(2)}x` : "—"}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${getRateBadgeClass(combinedRate)}`}>
          {formatRate(combinedRate)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#2d3435]">{formatCurrency(price.inputPrice)}</td>
      <td className="px-4 py-3 text-sm text-[#2d3435]">{formatCurrency(price.outputPrice)}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-[10px] font-bold text-[#47657a]">
          {TRANSIT_ACCOUNT_POOL_LABELS[price.accountPool]}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-[#5a6061]">{price.lastVerifiedAt}</td>
    </tr>
  );
}

function AvailabilityTable({ station }: { station: TransitStation }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe4e5] bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="border-b border-[#dfe4e5] bg-[#f2f4f4] px-5 py-3">
        <h2 className="text-base font-extrabold text-[#202829]">可用性样本</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="bg-[#f2f4f4]/50">
              <TableHead>范围</TableHead>
              <TableHead>近 7 日可用率</TableHead>
              <TableHead>样本数</TableHead>
              <TableHead>最后检查</TableHead>
              <TableHead>说明</TableHead>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#dfe4e5]">
              <td className="px-4 py-3 text-xs font-semibold text-[#202829]">站点整体</td>
              <td className="px-4 py-3 text-sm text-[#2d3435]">{formatPercent(station.availability.sevenDayRate)}</td>
              <td className="px-4 py-3 text-sm text-[#2d3435]">{station.availability.sevenDaySamples}</td>
              <td className="px-4 py-3 text-xs text-[#5a6061]">{station.availability.lastCheckedAt ?? "—"}</td>
              <td className="px-4 py-3 text-xs text-[#5a6061]">{station.availability.note ?? "—"}</td>
            </tr>
            {(["claude", "gpt"] as const).map((family) => {
              const summary = getFamilyRateSummary(station, family);
              return (
                <tr key={family} className="border-b border-[#dfe4e5]">
                  <td className="px-4 py-3 text-xs font-semibold text-[#202829]">
                    {TRANSIT_MODEL_FAMILY_LABELS[family]}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#2d3435]">{formatPercent(summary.sevenDayRate)}</td>
                  <td className="px-4 py-3 text-sm text-[#2d3435]">{summary.sevenDaySamples}</td>
                  <td className="px-4 py-3 text-xs text-[#5a6061]">{summary.lastCheckedAt ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-[#5a6061]">{formatAvailability({ sevenDayRate: summary.sevenDayRate, sevenDaySamples: summary.sevenDaySamples })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-[#dfe4e5] bg-white p-4">
      <div className="text-xs font-bold text-[#5a6061]">{label}</div>
      <div className="mt-1.5 text-[20px] font-extrabold leading-tight text-[#202829]">{value}</div>
      <div className="mt-1 text-xs text-[#7a8182]">{helper}</div>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "info" | "muted";
  children: React.ReactNode;
}) {
  const className =
    tone === "success"
      ? "bg-[#e8f3ec] text-[#2f7a4b]"
      : tone === "warning"
        ? "bg-[#fff7e8] text-[#7a541b]"
        : tone === "info"
          ? "bg-[#eef3f8] text-[#47657a]"
          : "bg-[#f2f4f4] text-[#5a6061]";

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>{children}</span>;
}

function InfoGroup({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-xs font-bold text-[#5a6061]">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-[#f2f4f4] px-2.5 py-1 text-[11px] font-bold text-[#2d3435]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function TextLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="font-bold text-[#5a6061]">{label}：</span>
      <span className="text-[#2d3435]">{value || "未公开"}</span>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-bold text-[#5a6061]" scope="col">
      {children}
    </th>
  );
}

function formatCurrency(value: number | null) {
  return value === null ? "—" : `¥${value}`;
}
