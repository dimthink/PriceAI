import "server-only";

import {
  officialPriceApps,
  officialPriceFxSummary,
  officialPriceGeneratedAt,
  officialPricePlans,
  staticOfficialPricesDataset,
  type OfficialPriceApp,
  type OfficialPriceAppSlug,
  type OfficialPriceFxSummary,
  type OfficialPricePlan,
  type OfficialPriceRow,
  type OfficialPricesDataset,
} from "@/lib/official-prices";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  OfficialSubscriptionAdminApp,
  OfficialSubscriptionAdminData,
  OfficialSubscriptionAdminPlan,
  OfficialSubscriptionAdminPrice,
  OfficialSubscriptionAdminRegion,
  OfficialSubscriptionCollectRun,
  OfficialSubscriptionPriceStatus,
  OfficialSubscriptionUnmatchedItem,
} from "@/lib/types";

type DbRow = Record<string, unknown>;

const OFFICIAL_PRICE_CACHE_TTL_MS = 30_000;

let officialPriceCache: { expiresAt: number; value: OfficialPricesDataset } | null = null;
let officialPricePromise: Promise<OfficialPricesDataset> | null = null;

export function clearOfficialPricesCache() {
  officialPriceCache = null;
  officialPricePromise = null;
}

export async function getOfficialPricesDataset(): Promise<OfficialPricesDataset> {
  const now = Date.now();
  if (officialPriceCache && officialPriceCache.expiresAt > now) {
    return officialPriceCache.value;
  }

  if (officialPricePromise) return officialPricePromise;

  officialPricePromise = readOfficialPricesDataset()
    .then((value) => {
      officialPriceCache = {
        expiresAt: Date.now() + OFFICIAL_PRICE_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      officialPricePromise = null;
    });

  return officialPricePromise;
}

export async function getOfficialSubscriptionAdminData(): Promise<OfficialSubscriptionAdminData> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return buildStaticOfficialAdminData({
      configured: false,
      message: "Supabase 尚未配置，当前展示静态官方地区价样本。",
    });
  }

  try {
    const [appsResult, regionsResult, runsResult] = await Promise.all([
      supabase
        .from("official_subscription_apps")
        .select("id,slug,display_name,provider,app_store_id,app_store_slug,enabled,sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("official_subscription_regions")
        .select("id,country_code,storefront_code,country_label,currency_code,enabled,priority")
        .order("priority", { ascending: true }),
      supabase
        .from("official_subscription_collect_runs")
        .select("*")
        .order("finished_at", { ascending: false })
        .limit(20),
    ]);

    if (appsResult.error || regionsResult.error || runsResult.error) {
      throw appsResult.error || regionsResult.error || runsResult.error;
    }

    const appRows = dbRows(appsResult.data);
    const regionRows = dbRows(regionsResult.data);
    if (!appRows.length || !regionRows.length) {
      return buildStaticOfficialAdminData({
        configured: true,
        message: "official_subscription_* 表已存在，但还没有导入应用或地区配置。",
      });
    }

    const apps = appRows.map(mapOfficialAdminApp);
    const regions = regionRows.map(mapOfficialAdminRegion);
    const appById = new Map(apps.map((app) => [app.id, app]));
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const planRows = await readAdminPlanRows(apps.map((app) => app.id));
    const plans = planRows.map((row) => mapOfficialAdminPlan(row, appById)).filter((plan): plan is OfficialSubscriptionAdminPlan => Boolean(plan));
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const currentPrices = (await readAdminCurrentPriceRows())
      .map((row) => mapOfficialAdminPrice(row, appById, planById, regionById))
      .filter((price): price is OfficialSubscriptionAdminPrice => Boolean(price));
    const collectRuns = dbRows(runsResult.data).map(mapOfficialCollectRun);
    const unmatchedItems = collectRuns.flatMap((run) => unmatchedItemsFromRun(run));

    return {
      configured: true,
      tableReady: true,
      source: "supabase",
      generatedAt: latestOfficialAdminTimestamp(currentPrices, collectRuns),
      message: null,
      apps,
      plans,
      regions,
      currentPrices,
      collectRuns,
      unmatchedItems,
    };
  } catch (error) {
    console.warn("Falling back to static official admin data because Supabase read failed:", error);
    return buildStaticOfficialAdminData({
      configured: true,
      message: "未能读取 official_subscription_* 表，可能还没有应用官方地区价 migration。后台暂时展示静态样本。",
    });
  }
}

async function readOfficialPricesDataset(): Promise<OfficialPricesDataset> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return staticOfficialPricesDataset;

  try {
    const [appsResult, regionsResult] = await Promise.all([
      supabase
        .from("official_subscription_apps")
        .select("id,slug,display_name,provider,app_store_id,app_store_slug,enabled,sort_order,updated_at")
        .eq("enabled", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("official_subscription_regions")
        .select("id,country_code,country_label,currency_code,enabled,priority")
        .eq("enabled", true)
        .order("priority", { ascending: true }),
    ]);

    if (appsResult.error || regionsResult.error) {
      throw appsResult.error || regionsResult.error;
    }

    const appRows = dbRows(appsResult.data);
    const regionRows = dbRows(regionsResult.data);
    if (!appRows.length || !regionRows.length) return staticOfficialPricesDataset;

    const appSlugById = new Map<string, OfficialPriceAppSlug>();
    const apps = appRows
      .map((row): OfficialPriceApp | null => {
        const slug = officialAppSlug(row.slug);
        if (!slug) return null;
        appSlugById.set(String(row.id), slug);
        return {
          slug,
          displayName: stringValue(row.display_name),
          provider: stringValue(row.provider),
          appStoreId: stringValue(row.app_store_id),
          appStoreSlug: stringValue(row.app_store_slug),
          summary: officialPriceApps.find((app) => app.slug === slug)?.summary || "",
        };
      })
      .filter((app): app is OfficialPriceApp => Boolean(app));

    const regionById = new Map(
      regionRows.map((row) => [
        String(row.id),
        {
          countryCode: stringValue(row.country_code),
          countryLabel: stringValue(row.country_label),
          currencyCode: stringValue(row.currency_code),
        },
      ]),
    );

    const planRows = await readPlanRows(Array.from(appSlugById.keys()));
    const planKeyById = new Map<string, { appSlug: OfficialPriceAppSlug; planSlug: string }>();
    const plans = planRows
      .map((row): OfficialPricePlan | null => {
        const appSlug = appSlugById.get(String(row.app_id));
        if (!appSlug) return null;

        const plan: OfficialPricePlan = {
          appSlug,
          slug: stringValue(row.slug),
          label: stringValue(row.label),
          billingPeriod: row.billing_period === "annual" ? "annual" : "monthly",
          notes: nullableString(row.notes) || undefined,
        };
        planKeyById.set(String(row.id), { appSlug, planSlug: plan.slug });
        return plan;
      })
      .filter((plan): plan is OfficialPricePlan => Boolean(plan));

    const priceRows = await readCurrentPriceRows();
    const rows = priceRows
      .map((row): OfficialPriceRow | null => {
        const planKey = planKeyById.get(String(row.plan_id));
        const region = regionById.get(String(row.region_id));
        if (!planKey || !region) return null;
        if (row.status !== "available") return null;

        const priceText = nullableString(row.price_text);
        const priceValue = numberValue(row.price_value);
        const cnyPrice = numberValue(row.cny_price);
        const fxRateToCny = numberValue(row.fx_rate_to_cny);
        if (!priceText || priceValue == null || cnyPrice == null || fxRateToCny == null) return null;

        return {
          ...region,
          appSlug: planKey.appSlug,
          planSlug: planKey.planSlug,
          priceText,
          priceValue,
          sourceUrl: stringValue(row.source_url),
          evidenceSource: "app_store_html",
          fetchedAt: stringValue(row.last_success_at || row.last_checked_at || row.updated_at),
          status: "available",
          cnyPrice,
          fxRateToCny,
          fxDate: stringValue(row.fx_date),
        };
      })
      .filter((row): row is OfficialPriceRow => Boolean(row));

    if (!apps.length || !plans.length || !rows.length) return staticOfficialPricesDataset;

    const fxSummary = await readFxSummary(rows);
    const generatedAt = rows.reduce((latest, row) => (row.fetchedAt > latest ? row.fetchedAt : latest), officialPriceGeneratedAt);

    return {
      configured: true,
      source: "supabase",
      generatedAt,
      apps,
      plans,
      rows,
      fxSummary,
    };
  } catch (error) {
    console.warn("Falling back to static official prices because Supabase read failed:", error);
    return {
      ...staticOfficialPricesDataset,
      configured: true,
    };
  }
}

async function readPlanRows(appIds: string[]): Promise<DbRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !appIds.length) return [];

  const { data, error } = await supabase
    .from("official_subscription_plans")
    .select("id,app_id,slug,label,billing_period,notes,enabled,sort_order")
    .in("app_id", appIds)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return dbRows(data);
}

async function readAdminPlanRows(appIds: string[]): Promise<DbRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !appIds.length) return [];

  const { data, error } = await supabase
    .from("official_subscription_plans")
    .select("id,app_id,slug,label,billing_period,enabled,sort_order")
    .in("app_id", appIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return dbRows(data);
}

async function readCurrentPriceRows(): Promise<DbRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("official_subscription_region_prices")
    .select(
      [
        "app_id",
        "plan_id",
        "region_id",
        "price_text",
        "price_value",
        "currency_code",
        "cny_price",
        "fx_rate_to_cny",
        "fx_date",
        "source_url",
        "evidence_source",
        "status",
        "last_success_at",
        "last_checked_at",
        "updated_at",
      ].join(","),
    )
    .eq("status", "available")
    .not("cny_price", "is", null)
    .order("cny_price", { ascending: true });

  if (error) throw error;
  return dbRows(data);
}

async function readAdminCurrentPriceRows(): Promise<DbRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("official_subscription_region_prices")
    .select(
      [
        "id",
        "app_id",
        "plan_id",
        "region_id",
        "price_text",
        "price_value",
        "currency_code",
        "cny_price",
        "fx_rate_to_cny",
        "fx_date",
        "source_url",
        "status",
        "raw_title",
        "last_success_at",
        "last_checked_at",
        "failure_reason",
        "updated_at",
      ].join(","),
    )
    .order("last_checked_at", { ascending: false })
    .limit(300);

  if (error) throw error;
  return dbRows(data);
}

async function readFxSummary(rows: OfficialPriceRow[]): Promise<OfficialPriceFxSummary> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return officialPriceFxSummary;

  const latestFxDate = rows.reduce((latest, row) => (row.fxDate > latest ? row.fxDate : latest), "");
  if (!latestFxDate) return officialPriceFxSummary;

  const { data, error } = await supabase
    .from("fx_rates")
    .select("base_currency,target_currency,rate,date,source")
    .eq("date", latestFxDate)
    .order("target_currency", { ascending: true });

  if (error || !data?.length) {
    return {
      ...officialPriceFxSummary,
      date: latestFxDate || officialPriceFxSummary.date,
    };
  }

  const rates = Object.fromEntries(
    dbRows(data).map((row) => [stringValue(row.target_currency), numberValue(row.rate) || 0]),
  );

  return {
    baseCurrency: stringValue(data[0]?.base_currency) || "USD",
    source: stringValue(data[0]?.source) || "Frankfurter",
    sourceUrl: officialPriceFxSummary.sourceUrl,
    date: latestFxDate,
    rates: { USD: 1, ...rates },
  };
}

function dbRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function buildStaticOfficialAdminData({
  configured,
  message,
}: {
  configured: boolean;
  message: string;
}): OfficialSubscriptionAdminData {
  const apps: OfficialSubscriptionAdminApp[] = officialPriceApps.map((app, index) => ({
    id: app.slug,
    slug: app.slug,
    displayName: app.displayName,
    provider: app.provider,
    appStoreId: app.appStoreId,
    appStoreSlug: app.appStoreSlug,
    enabled: true,
    sortOrder: (index + 1) * 10,
  }));
  const appBySlug = new Map(apps.map((app) => [app.slug, app]));
  const plans: OfficialSubscriptionAdminPlan[] = officialPricePlans.map((plan, index) => ({
    id: `${plan.appSlug}/${plan.slug}`,
    appId: plan.appSlug,
    appSlug: plan.appSlug,
    slug: plan.slug,
    label: plan.label,
    billingPeriod: plan.billingPeriod,
    enabled: true,
    sortOrder: (index + 1) * 10,
  }));
  const regionByCode = new Map<string, OfficialSubscriptionAdminRegion>();

  for (const row of staticOfficialPricesDataset.rows) {
    if (regionByCode.has(row.countryCode)) continue;
    regionByCode.set(row.countryCode, {
      id: row.countryCode,
      countryCode: row.countryCode,
      storefrontCode: row.countryCode.toLowerCase(),
      countryLabel: row.countryLabel,
      currencyCode: row.currencyCode,
      enabled: true,
      priority: regionByCode.size * 10 + 10,
    });
  }

  const currentPrices: OfficialSubscriptionAdminPrice[] = staticOfficialPricesDataset.rows.map((row, index) => {
    const app = appBySlug.get(row.appSlug);
    const plan = plans.find((item) => item.appSlug === row.appSlug && item.slug === row.planSlug);
    return {
      id: `static-${index}`,
      appSlug: row.appSlug,
      appName: app?.displayName || row.appSlug,
      planSlug: row.planSlug,
      planLabel: plan?.label || row.planSlug,
      billingPeriod: plan?.billingPeriod || "monthly",
      countryCode: row.countryCode,
      countryLabel: row.countryLabel,
      currencyCode: row.currencyCode,
      priceText: row.priceText,
      priceValue: row.priceValue,
      cnyPrice: row.cnyPrice,
      fxRateToCny: row.fxRateToCny,
      fxDate: row.fxDate,
      sourceUrl: row.sourceUrl,
      status: "available",
      rawTitle: null,
      lastSuccessAt: row.fetchedAt,
      lastCheckedAt: row.fetchedAt,
      failureReason: null,
    };
  });

  return {
    configured,
    tableReady: false,
    source: "static",
    generatedAt: staticOfficialPricesDataset.generatedAt,
    message,
    apps,
    plans,
    regions: Array.from(regionByCode.values()),
    currentPrices,
    collectRuns: [],
    unmatchedItems: [],
  };
}

function mapOfficialAdminApp(row: DbRow): OfficialSubscriptionAdminApp {
  return {
    id: stringValue(row.id),
    slug: stringValue(row.slug),
    displayName: stringValue(row.display_name),
    provider: stringValue(row.provider),
    appStoreId: stringValue(row.app_store_id),
    appStoreSlug: stringValue(row.app_store_slug),
    enabled: row.enabled !== false,
    sortOrder: numberValue(row.sort_order) || 0,
  };
}

function mapOfficialAdminRegion(row: DbRow): OfficialSubscriptionAdminRegion {
  return {
    id: stringValue(row.id),
    countryCode: stringValue(row.country_code),
    storefrontCode: stringValue(row.storefront_code),
    countryLabel: stringValue(row.country_label),
    currencyCode: stringValue(row.currency_code),
    enabled: row.enabled !== false,
    priority: numberValue(row.priority) || 0,
  };
}

function mapOfficialAdminPlan(
  row: DbRow,
  appById: Map<string, OfficialSubscriptionAdminApp>,
): OfficialSubscriptionAdminPlan | null {
  const app = appById.get(stringValue(row.app_id));
  if (!app) return null;

  return {
    id: stringValue(row.id),
    appId: stringValue(row.app_id),
    appSlug: app.slug,
    slug: stringValue(row.slug),
    label: stringValue(row.label),
    billingPeriod: officialBillingPeriod(row.billing_period),
    enabled: row.enabled !== false,
    sortOrder: numberValue(row.sort_order) || 0,
  };
}

function mapOfficialAdminPrice(
  row: DbRow,
  appById: Map<string, OfficialSubscriptionAdminApp>,
  planById: Map<string, OfficialSubscriptionAdminPlan>,
  regionById: Map<string, OfficialSubscriptionAdminRegion>,
): OfficialSubscriptionAdminPrice | null {
  const app = appById.get(stringValue(row.app_id));
  const plan = planById.get(stringValue(row.plan_id));
  const region = regionById.get(stringValue(row.region_id));
  if (!app || !plan || !region) return null;

  return {
    id: stringValue(row.id),
    appSlug: app.slug,
    appName: app.displayName,
    planSlug: plan.slug,
    planLabel: plan.label,
    billingPeriod: plan.billingPeriod,
    countryCode: region.countryCode,
    countryLabel: region.countryLabel,
    currencyCode: nullableString(row.currency_code),
    priceText: nullableString(row.price_text),
    priceValue: numberValue(row.price_value),
    cnyPrice: numberValue(row.cny_price),
    fxRateToCny: numberValue(row.fx_rate_to_cny),
    fxDate: nullableString(row.fx_date),
    sourceUrl: stringValue(row.source_url),
    status: officialPriceStatus(row.status),
    rawTitle: nullableString(row.raw_title),
    lastSuccessAt: nullableString(row.last_success_at),
    lastCheckedAt: nullableString(row.last_checked_at || row.updated_at),
    failureReason: nullableString(row.failure_reason),
  };
}

function mapOfficialCollectRun(row: DbRow): OfficialSubscriptionCollectRun {
  return {
    id: stringValue(row.id),
    mode: row.mode === "cron" || row.mode === "worker" ? row.mode : "manual",
    targetAppSlug: nullableString(row.target_app_slug),
    targetRegionCodes: Array.isArray(row.target_region_codes) ? row.target_region_codes.map(String) : [],
    status: row.status === "success" || row.status === "partial_success" ? row.status : "failed",
    successCount: numberValue(row.success_count) || 0,
    failureCount: numberValue(row.failure_count) || 0,
    unmatchedCount: numberValue(row.unmatched_count) || 0,
    startedAt: stringValue(row.started_at || row.created_at),
    finishedAt: stringValue(row.finished_at || row.started_at || row.created_at),
    logs: row.logs && typeof row.logs === "object" ? (row.logs as Record<string, unknown>) : {},
  };
}

function unmatchedItemsFromRun(run: OfficialSubscriptionCollectRun): OfficialSubscriptionUnmatchedItem[] {
  const value = run.logs.unmatchedItems;
  if (!Array.isArray(value)) return [];

  return value.slice(0, 80).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      appSlug: nullableString(row.appSlug),
      countryCode: nullableString(row.countryCode),
      countryLabel: nullableString(row.countryLabel),
      sourceUrl: nullableString(row.sourceUrl),
      rawTitle: nullableString(row.rawTitle),
      priceText: nullableString(row.priceText),
      reason: nullableString(row.reason),
    };
  });
}

function latestOfficialAdminTimestamp(
  prices: OfficialSubscriptionAdminPrice[],
  runs: OfficialSubscriptionCollectRun[],
): string {
  const values = [
    ...prices.map((price) => price.lastCheckedAt || price.lastSuccessAt || ""),
    ...runs.map((run) => run.finishedAt || run.startedAt),
  ].filter(Boolean);

  return values.sort().at(-1) || officialPriceGeneratedAt;
}

function officialBillingPeriod(value: unknown): "monthly" | "annual" | "one_time" {
  if (value === "annual" || value === "one_time") return value;
  return "monthly";
}

function officialPriceStatus(value: unknown): OfficialSubscriptionPriceStatus {
  if (
    value === "available" ||
    value === "stale" ||
    value === "missing" ||
    value === "parse_failed" ||
    value === "needs_review"
  ) {
    return value;
  }
  return "parse_failed";
}

function officialAppSlug(value: unknown): OfficialPriceAppSlug | null {
  return value === "chatgpt" || value === "claude" || value === "gemini" || value === "grok"
    ? value
    : null;
}

function stringValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value);
  return normalized ? normalized : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
