import { PriceExplorer } from "@/components/PriceExplorer";
import type { ExplorerInitialState } from "@/components/PriceExplorer";
import { SubmissionFloater } from "@/components/SubmissionFloater";
import { platformOptions, productTypeOptions } from "@/lib/catalog";
import { getExplorerData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HomeSearchParams = Promise<Record<string, string | string[] | undefined>>;

const stockOptions = ["all", "available", "out_of_stock"] as const;
const sortOptions = ["available_price", "price", "updated", "channels"] as const;
const viewOptions = ["cards", "table"] as const;
const scopeOptions = ["products", "offers"] as const;

export default async function Home({
  searchParams,
}: {
  searchParams?: HomeSearchParams;
}) {
  const params = await searchParams;
  const data = await getExplorerData();
  const initialState = parseInitialState(params || {});

  return (
    <>
      <PriceExplorer data={data} initialState={initialState} />
      <SubmissionFloater />
    </>
  );
}

function parseInitialState(params: Record<string, string | string[] | undefined>): ExplorerInitialState {
  return {
    query: stringParam(params.q),
    platform: pickParam(stringParam(params.platform), ["全部", ...platformOptions], "全部"),
    productType: pickParam(stringParam(params.type), ["全部", ...productTypeOptions], "全部"),
    stock: pickParam(stringParam(params.stock), stockOptions, "all"),
    sort: pickParam(stringParam(params.sort), sortOptions, "available_price"),
    minPrice: numericParam(stringParam(params.min)),
    maxPrice: numericParam(stringParam(params.max)),
    viewMode: pickParam(stringParam(params.view), viewOptions, "table"),
    scopeMode: pickParam(stringParam(params.scope), scopeOptions, "products"),
  };
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function pickParam<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function numericParam(value: string): string {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Number(normalized))) return "";
  return Number(normalized) >= 0 ? normalized : "";
}
