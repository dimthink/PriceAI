import type { MerchantCollectorFilter, MerchantCollectorGroup, Source } from "@/lib/types";

export const MERCHANT_COLLECTOR_GROUPS: MerchantCollectorGroup[] = ["shopApi", "dujiao", "kami", "other"];
export const MERCHANT_COLLECTOR_FILTERS: MerchantCollectorFilter[] = ["all", ...MERCHANT_COLLECTOR_GROUPS];

export function merchantCollectorGroup(kind: Source["collectorKind"] | null | undefined): MerchantCollectorGroup {
  if (kind === "shopApi") return "shopApi";
  if (kind === "dujiao") return "dujiao";
  if (kind === "kami") return "kami";
  return "other";
}

export function merchantCollectorLabel(group: MerchantCollectorFilter): string {
  if (group === "all") return "全部来源";
  if (group === "shopApi") return "链动小铺";
  if (group === "dujiao") return "独角数卡";
  if (group === "kami") return "Kami";
  return "其他";
}

export function parseMerchantCollectorFilter(value: string | null | undefined): MerchantCollectorFilter {
  const normalized = String(value || "").trim();
  return MERCHANT_COLLECTOR_FILTERS.includes(normalized as MerchantCollectorFilter)
    ? normalized as MerchantCollectorFilter
    : "all";
}
