#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { pruneOperationalLogs } from "./operational-log-retention.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configDir = path.join(repoRoot, "config", "official-prices");
const defaultOutPath = path.join(repoRoot, "data", "official-prices", "latest.json");
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) PriceAI/1.0";

const DEFAULT_TIMEOUT_MS = 25000;
const FETCH_DELAY_MS = 250;
const APPLE_STOREFRONT_IDS = {
  AR: "143505",
  AT: "143445",
  AU: "143460",
  BE: "143446",
  BR: "143503",
  CA: "143455",
  CH: "143459",
  CO: "143501",
  CZ: "143489",
  DE: "143443",
  DK: "143458",
  EG: "143516",
  ES: "143454",
  FI: "143447",
  FR: "143442",
  GB: "143444",
  GR: "143448",
  HK: "143463",
  HU: "143482",
  ID: "143476",
  IE: "143449",
  IL: "143491",
  IN: "143467",
  IT: "143450",
  JP: "143462",
  KR: "143466",
  MX: "143468",
  MY: "143473",
  NG: "143561",
  NL: "143452",
  NO: "143457",
  NZ: "143461",
  PE: "143507",
  PH: "143474",
  PK: "143477",
  PL: "143478",
  PT: "143453",
  RO: "143487",
  SE: "143456",
  SG: "143464",
  TH: "143475",
  TR: "143480",
  TW: "143470",
  UA: "143492",
  US: "143441",
  VN: "143471",
  ZA: "143472",
};

if (isCli()) {
  const args = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = args.fxOnly ? await refreshOfficialPriceFxRates(args) : await collectOfficialPrices(args);
    printSummary(result);

    if (args.dryRun) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const outPath = path.resolve(repoRoot, args.out || defaultOutPath);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      console.log(`Snapshot written to ${path.relative(repoRoot, outPath)}`);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function collectOfficialPrices(options = {}) {
  options = normalizeOptions(options);

  const configs = await loadConfig();
  const apps = selectApps(configs.apps, options);
  const regions = selectRegions(configs.regions, options);
  const rules = configs.rules.filter((rule) => apps.some((app) => app.slug === rule.appSlug));

  if (!apps.length) throw new Error("No enabled apps matched. Use --all or --app chatgpt.");
  if (!regions.length) throw new Error("No enabled regions matched. Use --regions US,TR,PH.");

  const fx = await fetchFxSnapshot(regions);
  const fetchedAt = new Date().toISOString();
  const rows = [];
  const unmatchedItems = [];
  const failures = [];
  const runItems = [];

  for (const app of apps) {
    const appRules = rules.filter((rule) => rule.appSlug === app.slug);

    for (const region of regions) {
      const sourceUrl = buildAppStoreUrl(app, region);
      const startedAt = Date.now();

      try {
        const html = await fetchText(sourceUrl, {
          timeoutMs: Number(options.timeoutMs || options.timeout || DEFAULT_TIMEOUT_MS),
          headers: appStoreRequestHeaders(region),
        });
        assertExpectedAppStorePage(html, app, region, sourceUrl);
        const rawItems = extractInAppPurchasePairs(html, sourceUrl);

        if (!rawItems.length) {
          const failure = buildFailure({
            app,
            region,
            sourceUrl,
            status: "parse_failed",
            failureReason: "No App Store in-app purchase text-pair items were found.",
            fetchedAt,
          });
          failures.push(failure);
          runItems.push(runItem(app, region, "parse_failed", 0, rawItems.length, Date.now() - startedAt, failure.failureReason));
          await delay(FETCH_DELAY_MS);
          continue;
        }

        const matchedItemIndexes = new Set();

        for (const rule of appRules) {
          const candidates = rawItems
            .map((item, index) => ({ item, index, score: scoreCandidate(item, rule, region, fx) }))
            .filter((candidate) => candidate.score.matched);

          const chosen = chooseCandidate(candidates);
          if (!chosen) {
            rows.push(
              buildMissingRow({
                app,
                rule,
                region,
                sourceUrl,
                fetchedAt,
                failureReason: "No in-app purchase candidate matched this plan rule.",
              }),
            );
            continue;
          }

          if (chosen.status === "needs_review") {
            rows.push(
              buildReviewRow({
                app,
                rule,
                region,
                sourceUrl,
                fetchedAt,
                candidates: chosen.candidates.map((candidate) => candidate.item),
              }),
            );
            for (const candidate of chosen.candidates) matchedItemIndexes.add(candidate.index);
            continue;
          }

          const rawItem = chosen.candidate.item;
          matchedItemIndexes.add(chosen.candidate.index);
          rows.push(
            buildAvailableRow({
              app,
              rule,
              region,
              rawItem,
              sourceUrl,
              fetchedAt,
              fx,
            }),
          );
        }

        rawItems.forEach((item, index) => {
          if (matchedItemIndexes.has(index)) return;
          unmatchedItems.push({
            appSlug: app.slug,
            countryCode: region.countryCode,
            countryLabel: region.countryLabel,
            sourceUrl,
            rawTitle: item.title,
            priceText: item.priceText,
            priceValue: parsePriceValue(item.priceText),
            rawSnippetHash: hashSnippet(`${item.title} ${item.priceText}`),
            reason: "No plan rule consumed this in-app purchase item.",
          });
        });

        runItems.push(runItem(app, region, "success", appRules.length, rawItems.length, Date.now() - startedAt));
      } catch (error) {
        const failureReason = errorMessage(error);
        if (httpStatus(error) === 404) {
          for (const rule of appRules) {
            rows.push(
              buildMissingRow({
                app,
                rule,
                region,
                sourceUrl,
                fetchedAt,
                failureReason: "App Store returned HTTP 404 for this app and region.",
              }),
            );
          }
          runItems.push(runItem(app, region, "missing", 0, 0, Date.now() - startedAt, failureReason));
          await delay(FETCH_DELAY_MS);
          continue;
        }

        const failure = buildFailure({
          app,
          region,
          sourceUrl,
          status: "parse_failed",
          failureReason,
          fetchedAt,
        });
        failures.push(failure);
        runItems.push(runItem(app, region, "failed", 0, 0, Date.now() - startedAt, failureReason));
      }

      await delay(FETCH_DELAY_MS);
    }
  }

  const result = {
    generatedAt: fetchedAt,
    dryRun: Boolean(options.dryRun),
    source: {
      kind: "apple_app_store_public_html",
      evidenceSource: "app_store_html",
      fxSource: fx.source,
      fxSourceUrl: fx.sourceUrl,
      fxFallback: Boolean(fx.fallback),
      fxFallbackReason: fx.fallbackReason || null,
      fxFallbackGeneratedAt: fx.fallbackGeneratedAt || null,
    },
    scope: {
      apps: apps.map((app) => app.slug),
      regions: regions.map((region) => region.countryCode),
      plans: rules.length,
    },
    fx,
    rows,
    unmatchedItems,
    failures,
    run: {
      status: failures.length ? (rows.some((row) => row.status === "available") ? "partial_success" : "failed") : "success",
      appCount: apps.length,
      regionCount: regions.length,
      rowCount: rows.length,
      availableCount: rows.filter((row) => row.status === "available").length,
      missingCount: rows.filter((row) => row.status === "missing").length,
      needsReviewCount: rows.filter((row) => row.status === "needs_review").length,
      unmatchedCount: unmatchedItems.length,
      failureCount: failures.length,
      items: runItems,
    },
  };

  if (options.post || options.db) {
    result.database = await postOfficialPriceSnapshot(result, configs, options);
  }

  return result;
}

export async function refreshOfficialPriceFxRates(options = {}) {
  options = normalizeOptions(options);

  const configs = await loadConfig();
  const regions = selectRegions(configs.regions, options);
  if (!regions.length) throw new Error("No enabled regions matched. Use --regions US,TR,PH.");

  const fx = await fetchFxSnapshot(regions);
  const generatedAt = new Date().toISOString();
  const result = {
    generatedAt,
    dryRun: Boolean(options.dryRun),
    source: {
      kind: "official_price_fx_refresh",
      fxSource: fx.source,
      fxSourceUrl: fx.sourceUrl,
      fxFallback: Boolean(fx.fallback),
      fxFallbackReason: fx.fallbackReason || null,
      fxFallbackGeneratedAt: fx.fallbackGeneratedAt || null,
    },
    scope: {
      regions: regions.map((region) => region.countryCode),
      currencies: Array.from(new Set(["USD", ...regions.map((region) => region.currencyCode).filter(Boolean)])).sort(),
    },
    fx,
    run: {
      status: "success",
      regionCount: regions.length,
      fxRateCount: Object.keys(fx.rates || {}).length,
      currentPriceCount: 0,
      updatedCurrentPriceCount: 0,
      skippedCurrentPriceCount: 0,
    },
  };

  if (options.post || options.db) {
    result.database = await postOfficialFxRefresh(result, options);
  }

  return result;
}

async function loadConfig() {
  const [apps, regions, rules] = await Promise.all([
    readJson(path.join(configDir, "apps.json")),
    readJson(path.join(configDir, "regions.json")),
    readJson(path.join(configDir, "plan-match-rules.json")),
  ]);

  return {
    apps: apps.filter((item) => item.enabled !== false).sort((a, b) => numericSort(a.sortOrder, b.sortOrder)),
    regions: regions.filter((item) => item.enabled !== false).sort((a, b) => numericSort(a.priority, b.priority)),
    rules: rules.sort((a, b) => numericSort(a.sortOrder, b.sortOrder)),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function postOfficialPriceSnapshot(result, configs, options) {
  const dbRows = expandRowsForDatabase(result, configs);
  const plan = {
    dryRun: Boolean(options.dryRun),
    apps: configs.apps.length,
    regions: configs.regions.length,
    plans: configs.rules.length,
    currentRows: dbRows.length,
    availableRows: dbRows.filter((row) => row.status === "available").length,
    nonAvailableRows: dbRows.filter((row) => row.status !== "available").length,
    snapshots: dbRows.length,
    fxRates: Object.keys(result.fx.rates || {}).length,
    runLog: true,
  };

  if (options.dryRun) {
    return {
      status: "planned",
      ...plan,
      message: "--post --dry-run only builds the database write plan; no Supabase credentials or remote writes are required.",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");
  }

  const appMap = await upsertOfficialApps(supabase, configs.apps);
  const regionMap = await upsertOfficialRegions(supabase, configs.regions);
  const planMap = await upsertOfficialPlans(supabase, configs.rules, appMap);
  const runId = await insertOfficialCollectRun(supabase, result, options);
  const existingByKey = await listExistingCurrentPrices(supabase, dbRows, appMap, regionMap, planMap);
  const currentRows = buildCurrentPriceRows(dbRows, appMap, regionMap, planMap, existingByKey);
  const snapshotRows = buildSnapshotRows(dbRows, appMap, regionMap, planMap, runId);
  const fxRows = buildFxRows(result.fx, result.generatedAt);

  await upsertRows(supabase, "official_subscription_region_prices", currentRows, {
    onConflict: "app_id,plan_id,region_id",
  });
  await insertRows(supabase, "official_subscription_price_snapshots", snapshotRows);
  await upsertRows(supabase, "fx_rates", fxRows, {
    onConflict: "base_currency,target_currency,date,source",
  });
  await pruneOperationalLogs(supabase, readEnvFile(path.join(repoRoot, ".env.local")));

  return {
    status: "posted",
    ...plan,
    currentRowsWritten: currentRows.length,
    snapshotsWritten: snapshotRows.length,
    fxRatesWritten: fxRows.length,
    runId,
  };
}

async function postOfficialFxRefresh(result, options) {
  const fxRows = buildFxRows(result.fx, result.generatedAt);
  const plan = {
    dryRun: Boolean(options.dryRun),
    fxRates: fxRows.length,
    currentRows: 0,
    updatedCurrentRows: 0,
    skippedCurrentRows: 0,
  };

  if (options.dryRun) {
    return {
      status: "planned",
      ...plan,
      message: "--fx-only --post --dry-run only builds the FX refresh plan; no Supabase credentials or remote writes are required.",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");
  }

  const currentRows = await listOfficialCurrentPricesForFxRefresh(supabase);
  const { updatedRows, skippedCurrentRows } = buildOfficialFxRefreshRows(currentRows, result.fx, result.generatedAt);

  await upsertRows(supabase, "fx_rates", fxRows, {
    onConflict: "base_currency,target_currency,date,source",
  });
  const updatedCurrentRows = await updateOfficialCurrentPriceFxRows(supabase, updatedRows);
  await pruneOperationalLogs(supabase, readEnvFile(path.join(repoRoot, ".env.local")));

  result.run.currentPriceCount = currentRows.length;
  result.run.updatedCurrentPriceCount = updatedCurrentRows;
  result.run.skippedCurrentPriceCount = skippedCurrentRows;

  return {
    status: "posted",
    ...plan,
    currentRows: currentRows.length,
    updatedCurrentRows,
    skippedCurrentRows,
    fxRatesWritten: fxRows.length,
  };
}

export function buildOfficialFxRefreshRows(currentRows, fx, generatedAt) {
  const updatedRows = [];
  let skippedCurrentRows = 0;

  for (const row of currentRows) {
    if (row.price_value === null || row.price_value === undefined || row.price_value === "") {
      skippedCurrentRows++;
      continue;
    }

    const priceValue = Number(row.price_value);
    const currencyCode = String(row.currency_code || "");
    if (!Number.isFinite(priceValue) || !currencyCode) {
      skippedCurrentRows++;
      continue;
    }

    const fxRateToCny = rateToCny(currencyCode, fx);
    updatedRows.push({
      id: row.id,
      cny_price: roundCurrency(priceValue * fxRateToCny),
      fx_rate_to_cny: fxRateToCny,
      fx_date: fx.date,
      updated_at: generatedAt,
    });
  }

  return { updatedRows, skippedCurrentRows };
}

async function updateOfficialCurrentPriceFxRows(supabase, rows) {
  let updatedCount = 0;

  for (const row of rows) {
    const { id, ...update } = row;
    if (!id) throw new Error("official_subscription_region_prices FX update row is missing id.");

    const { count, error } = await supabase
      .from("official_subscription_region_prices")
      .update(update, { count: "exact" })
      .eq("id", id);

    if (error) throw new Error(`official_subscription_region_prices update failed: ${errorMessage(error)}`);
    updatedCount += typeof count === "number" ? count : 1;
  }

  return updatedCount;
}

async function listOfficialCurrentPricesForFxRefresh(supabase) {
  const output = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("official_subscription_region_prices")
      .select("id,price_value,currency_code,status")
      .in("status", ["available", "stale"])
      .not("price_value", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    output.push(...rows);
    if (rows.length < pageSize) break;
  }

  return output;
}

function expandRowsForDatabase(result, configs) {
  const rows = [...result.rows];
  const rulesByApp = new Map();
  const regionByCode = new Map(configs.regions.map((region) => [region.countryCode, region]));

  for (const rule of configs.rules) {
    const appRules = rulesByApp.get(rule.appSlug) || [];
    appRules.push(rule);
    rulesByApp.set(rule.appSlug, appRules);
  }

  for (const failure of result.failures || []) {
    const rules = rulesByApp.get(failure.appSlug) || [];
    const region = regionByCode.get(failure.countryCode) || {};
    for (const rule of rules) {
      rows.push({
        appSlug: failure.appSlug,
        planSlug: rule.planSlug,
        countryCode: failure.countryCode,
        countryLabel: failure.countryLabel,
        currencyCode: region.currencyCode || null,
        priceText: null,
        priceValue: null,
        cnyPrice: null,
        fxRateToCny: null,
        fxDate: result.fx.date || null,
        sourceUrl: failure.sourceUrl,
        evidenceSource: failure.evidenceSource || "app_store_html",
        rawTitle: null,
        rawSnippetHash: null,
        fetchedAt: failure.fetchedAt || result.generatedAt,
        status: "parse_failed",
        failureReason: failure.failureReason,
      });
    }
  }

  return rows;
}

async function upsertOfficialApps(supabase, apps) {
  const rows = apps.map((app) => ({
    slug: app.slug,
    display_name: app.displayName,
    provider: app.provider,
    app_store_id: app.appStoreId,
    app_store_slug: app.appStoreSlug,
    enabled: app.enabled !== false,
    sort_order: Number(app.sortOrder || 0),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("official_subscription_apps")
    .upsert(rows, { onConflict: "slug" })
    .select("id,slug");

  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.slug), String(row.id)]));
}

async function upsertOfficialRegions(supabase, regions) {
  const rows = regions.map((region) => ({
    country_code: region.countryCode,
    storefront_code: region.storefrontCode,
    country_label: region.countryLabel,
    currency_code: region.currencyCode,
    enabled: region.enabled !== false,
    priority: Number(region.priority || 0),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("official_subscription_regions")
    .upsert(rows, { onConflict: "country_code" })
    .select("id,country_code");

  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.country_code), String(row.id)]));
}

async function upsertOfficialPlans(supabase, rules, appMap) {
  const rows = rules.map((rule) => {
    const appId = appMap.get(rule.appSlug);
    if (!appId) throw new Error(`Cannot upsert plan ${rule.appSlug}/${rule.planSlug}: app is missing.`);

    return {
      app_id: appId,
      slug: rule.planSlug,
      label: rule.label,
      billing_period: rule.billingPeriod || "monthly",
      aliases: Array.from(new Set([rule.label, ...(rule.include || [])].filter(Boolean))),
      match_rules: {
        include: rule.include || [],
        exclude: rule.exclude || [],
        preferPriceBandUsd: rule.preferPriceBandUsd || null,
      },
      enabled: rule.enabled !== false,
      sort_order: Number(rule.sortOrder || 0),
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("official_subscription_plans")
    .upsert(rows, { onConflict: "app_id,slug" })
    .select("id,app_id,slug");

  if (error) throw error;
  const output = new Map();
  for (const row of data || []) {
    output.set(`${row.app_id}/${row.slug}`, String(row.id));
  }
  return output;
}

async function insertOfficialCollectRun(supabase, result, options) {
  const { data, error } = await supabase
    .from("official_subscription_collect_runs")
    .insert({
      mode: officialCollectRunMode(options.mode),
      target_app_slug: result.scope.apps.length === 1 ? result.scope.apps[0] : null,
      target_region_codes: result.scope.regions,
      status: result.run.status,
      success_count: result.run.availableCount,
      failure_count: result.run.failureCount + result.run.missingCount + result.run.needsReviewCount,
      unmatched_count: result.run.unmatchedCount,
      started_at: result.generatedAt,
      finished_at: new Date().toISOString(),
      logs: {
        source: result.source,
        scope: result.scope,
        items: result.run.items,
        failures: result.failures,
        unmatchedItems: result.unmatchedItems,
      },
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export function officialCollectRunMode(value) {
  const mode = String(value || "").trim();
  if (mode === "manual" || mode === "cron" || mode === "worker") return mode;
  if (mode === "github-actions" || mode === "github_actions" || mode === "ci") return "worker";
  return "manual";
}

async function listExistingCurrentPrices(supabase, dbRows, appMap, regionMap, planMap) {
  const planIds = new Set();
  const regionIds = new Set();

  for (const row of dbRows) {
    const appId = appMap.get(row.appSlug);
    const planId = planMap.get(`${appId}/${row.planSlug}`);
    const regionId = regionMap.get(row.countryCode);
    if (planId) planIds.add(planId);
    if (regionId) regionIds.add(regionId);
  }

  if (!planIds.size || !regionIds.size) return new Map();

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
        "last_success_at",
      ].join(","),
    )
    .in("plan_id", [...planIds])
    .in("region_id", [...regionIds]);

  if (error) throw error;
  return new Map((data || []).map((row) => [priceKey(row.app_id, row.plan_id, row.region_id), row]));
}

function buildCurrentPriceRows(dbRows, appMap, regionMap, planMap, existingByKey) {
  return dbRows.map((row) => {
    const ids = resolvePriceIds(row, appMap, regionMap, planMap);
    const key = priceKey(ids.appId, ids.planId, ids.regionId);
    const existing = existingByKey.get(key);
    const hasHistoricalPrice = existing?.price_text && existing?.last_success_at;
    const status = row.status === "available" ? "available" : hasHistoricalPrice ? "stale" : row.status;
    const checkedAt = row.fetchedAt || new Date().toISOString();

    return {
      app_id: ids.appId,
      plan_id: ids.planId,
      region_id: ids.regionId,
      price_text: status === "stale" ? existing.price_text : row.priceText,
      price_value: status === "stale" ? existing.price_value : row.priceValue,
      currency_code: status === "stale" ? existing.currency_code : row.currencyCode,
      cny_price: status === "stale" ? existing.cny_price : row.cnyPrice,
      fx_rate_to_cny: status === "stale" ? existing.fx_rate_to_cny : row.fxRateToCny,
      fx_date: status === "stale" ? existing.fx_date : row.fxDate,
      source_url: row.sourceUrl,
      evidence_source: row.evidenceSource || "app_store_html",
      status,
      raw_title: row.rawTitle,
      raw_snippet_hash: row.rawSnippetHash,
      last_success_at: row.status === "available" ? checkedAt : existing?.last_success_at || null,
      last_checked_at: checkedAt,
      failure_reason: row.status === "available" ? null : row.failureReason,
      updated_at: checkedAt,
    };
  });
}

function buildSnapshotRows(dbRows, appMap, regionMap, planMap, runId) {
  return dbRows.map((row) => {
    const ids = resolvePriceIds(row, appMap, regionMap, planMap);
    return {
      run_id: runId,
      app_id: ids.appId,
      plan_id: ids.planId,
      region_id: ids.regionId,
      price_text: row.priceText,
      price_value: row.priceValue,
      currency_code: row.currencyCode,
      cny_price: row.cnyPrice,
      fx_rate_to_cny: row.fxRateToCny,
      fx_date: row.fxDate,
      source_url: row.sourceUrl,
      evidence_source: row.evidenceSource || "app_store_html",
      raw_title: row.rawTitle,
      raw_snippet_hash: row.rawSnippetHash,
      fetched_at: row.fetchedAt || new Date().toISOString(),
      status: row.status,
      failure_reason: row.failureReason,
    };
  });
}

function buildFxRows(fx, fetchedAt) {
  return Object.entries(fx.rates || {}).map(([targetCurrency, rate]) => ({
    base_currency: fx.baseCurrency || "USD",
    target_currency: targetCurrency,
    rate,
    date: fx.date,
    source: fx.source || "Frankfurter",
    fetched_at: fetchedAt,
  }));
}

function resolvePriceIds(row, appMap, regionMap, planMap) {
  const appId = appMap.get(row.appSlug);
  const regionId = regionMap.get(row.countryCode);
  const planId = planMap.get(`${appId}/${row.planSlug}`);

  if (!appId || !regionId || !planId) {
    throw new Error(`Cannot map official price row ${row.appSlug}/${row.planSlug}/${row.countryCode} to database ids.`);
  }

  return { appId, planId, regionId };
}

async function upsertRows(supabase, table, rows, options = {}) {
  for (const chunk of chunks(rows, 500)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (error) throw new Error(`${table} upsert failed: ${errorMessage(error)}`);
  }
}

async function insertRows(supabase, table, rows) {
  for (const chunk of chunks(rows, 500)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${errorMessage(error)}`);
  }
}

function priceKey(appId, planId, regionId) {
  return `${appId}/${planId}/${regionId}`;
}

function getSupabaseClient() {
  const env = readEnvFile(path.join(repoRoot, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function selectApps(apps, options) {
  if (options.all || !options.app) return apps;
  const wanted = splitList(options.app).map((item) => item.toLowerCase());
  return apps.filter((app) => wanted.includes(app.slug.toLowerCase()));
}

function selectRegions(regions, options) {
  if (!options.regions) return regions;
  const wanted = new Set(splitList(options.regions).map((item) => item.toUpperCase()));
  return regions.filter((region) => wanted.has(region.countryCode.toUpperCase()) || wanted.has(region.storefrontCode.toUpperCase()));
}

async function fetchFxSnapshot(regions) {
  const currencies = Array.from(new Set(["CNY", ...regions.map((region) => region.currencyCode).filter((code) => code !== "USD")]));
  const sourceUrl = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${encodeURIComponent(currencies.join(","))}`;
  try {
    const data = JSON.parse(await fetchText(sourceUrl));
    const rates = { USD: 1, ...data.rates };
    const missing = missingFxCurrencies(currencies, rates);

    if (missing.length) {
      return await fetchOpenExchangeFxSnapshot(currencies, {
        fallbackReason: `Frankfurter missing rates for ${missing.join(", ")}.`,
      });
    }

    return {
      baseCurrency: data.base || "USD",
      date: data.date,
      source: "Frankfurter",
      sourceUrl,
      rates,
    };
  } catch (error) {
    const fallback = loadFallbackFxSnapshot(currencies);
    if (!fallback) throw error;

    return {
      ...fallback,
      sourceUrl,
      fallback: true,
      fallbackReason: errorMessage(error),
    };
  }
}

async function fetchOpenExchangeFxSnapshot(currencies, options = {}) {
  const sourceUrl = "https://open.er-api.com/v6/latest/USD";
  const data = JSON.parse(await fetchText(sourceUrl));
  const rawRates = data.rates || {};
  const rates = {
    USD: 1,
    ...Object.fromEntries(currencies.map((currency) => [currency, Number(rawRates[currency])]).filter(([, rate]) => Number.isFinite(rate))),
  };
  const missing = missingFxCurrencies(currencies, rates);
  if (missing.length) {
    throw new Error(`open.er-api.com missing FX rates for ${missing.join(", ")}.`);
  }

  return {
    baseCurrency: data.base_code || "USD",
    date: fxDateFromOpenExchange(data.time_last_update_utc),
    source: "open.er-api.com",
    sourceUrl,
    rates,
    fallback: Boolean(options.fallbackReason),
    fallbackReason: options.fallbackReason || null,
  };
}

function missingFxCurrencies(currencies, rates) {
  return currencies.filter((currency) => currency !== "USD" && !Number.isFinite(Number(rates[currency])));
}

export function loadFallbackFxSnapshot(currencies, latestPath = defaultOutPath) {
  if (!existsSync(latestPath)) return null;

  try {
    const latest = JSON.parse(readFileSync(latestPath, "utf8"));
    const fx = latest.fx || latest.fxSummary;
    const rates = fx?.rates || {};
    const missing = currencies.filter((currency) => currency !== "USD" && !Number.isFinite(Number(rates[currency])));
    if (!fx?.date || missing.length) return null;

    return {
      baseCurrency: fx.baseCurrency || "USD",
      date: fx.date,
      source: `${fx.source || "Frankfurter"} local snapshot`,
      rates: {
        USD: 1,
        ...Object.fromEntries(Object.entries(rates).map(([currency, rate]) => [currency, Number(rate)])),
      },
      fallbackGeneratedAt: latest.generatedAt || null,
    };
  } catch {
    return null;
  }
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": userAgent,
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} for ${url}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function extractInAppPurchasePairs(html, sourceUrl = "") {
  const output = [];
  const seen = new Set();
  const pairPattern = /<div class="text-pair[^"]*"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<\/div>/g;

  for (const item of extractAddOnPurchaseItems(html, sourceUrl)) {
    const key = `${item.title}\u0000${item.priceText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  for (const match of html.matchAll(pairPattern)) {
    const title = decodeHtmlText(match[1]);
    const priceText = normalizePriceText(decodeHtmlText(match[2]));
    if (!title || !looksLikePrice(priceText)) continue;

    const key = `${title}\u0000${priceText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      title,
      priceText,
      sourceUrl,
      rawSnippetHash: hashSnippet(match[0]),
    });
  }

  return output;
}

function appStoreRequestHeaders(region) {
  const countryCode = String(region.countryCode || "").toUpperCase();
  const storefrontId = APPLE_STOREFRONT_IDS[countryCode];
  if (!storefrontId) return {};

  return {
    "x-apple-store-front": `${storefrontId},29`,
  };
}

function assertExpectedAppStorePage(html, app, region, sourceUrl) {
  const appStoreId = String(app.appStoreId || "");
  const expectedRegion = String(region.storefrontCode || region.countryCode || "").toLowerCase();
  const hasExpectedApp =
    appStoreId &&
    (html.includes(`"id":"${appStoreId}"`) ||
      html.includes(`"adamId":"${appStoreId}"`) ||
      html.includes(`appAdamId=${appStoreId}`) ||
      html.includes(`/id${appStoreId}`));
  const looksLikeWrongStorefront =
    html.includes("/iphone/today") ||
    html.includes(`"pageType":"Today"`) ||
    (expectedRegion && html.includes(`"storeFront":"cn"`) && expectedRegion !== "cn");

  if (!hasExpectedApp || looksLikeWrongStorefront) {
    throw new Error(`App Store returned an unrelated page for ${app.slug}/${region.countryCode}: ${sourceUrl}`);
  }
}

function extractAddOnPurchaseItems(html, sourceUrl) {
  const output = [];
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const arrayText = extractJsonArrayAfterKey(html, '"addOns"', searchFrom);
    if (!arrayText) break;
    searchFrom = arrayText.endIndex;

    try {
      const addOns = JSON.parse(arrayText.value);
      for (const addOn of addOns) {
        const title = normalizePriceText(String(addOn?.name || ""));
        const priceText = normalizePriceText(String(addOn?.price || ""));
        if (!title || !looksLikePrice(priceText)) continue;

        output.push({
          title,
          priceText,
          sourceUrl,
          rawSnippetHash: hashSnippet(`${title} ${priceText} ${addOn?.buyParams || ""}`),
        });
      }
    } catch {
      // Keep the older text-pair parser as a fallback when an embedded blob is incomplete.
    }
  }

  return output;
}

function extractJsonArrayAfterKey(text, key, fromIndex = 0) {
  const keyIndex = text.indexOf(key, fromIndex);
  if (keyIndex < 0) return null;
  const colonIndex = text.indexOf(":", keyIndex + key.length);
  if (colonIndex < 0) return null;
  const startIndex = text.indexOf("[", colonIndex + 1);
  if (startIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: text.slice(startIndex, index + 1),
          endIndex: index + 1,
        };
      }
    }
  }

  return null;
}

function scoreCandidate(rawItem, rule, region, fx) {
  const normalizedTitle = normalizeText(rawItem.title);
  const include = (rule.include || []).map(normalizeText).filter(Boolean);
  const exclude = (rule.exclude || []).map(normalizeText).filter(Boolean);
  const includesMatched = include.every((term) => normalizedTitle.includes(term));
  const excludesMatched = exclude.some((term) => normalizedTitle.includes(term));

  if (!includesMatched || excludesMatched) {
    return { matched: false, reason: "include/exclude" };
  }

  const priceValue = parsePriceValue(rawItem.priceText);
  const usdValue = priceValue == null ? null : convertCurrency(priceValue, region.currencyCode, "USD", fx);
  const priceBand = rule.preferPriceBandUsd;
  const inBand =
    !Array.isArray(priceBand) ||
    priceBand.length !== 2 ||
    usdValue == null ||
    (usdValue >= Number(priceBand[0]) && usdValue <= Number(priceBand[1]));
  const score = include.length * 10 + (inBand ? 4 : -4) + (normalizedTitle === normalizeText(rule.label) ? 3 : 0);

  return {
    matched: true,
    score,
    inBand,
    usdValue,
    reason: inBand ? "matched" : "matched_outside_price_band",
  };
}

function chooseCandidate(candidates) {
  if (!candidates.length) return null;

  const inBand = candidates.filter((candidate) => candidate.score.inBand);
  const pool = inBand.length ? inBand : candidates;
  const sorted = pool.toSorted((a, b) => b.score.score - a.score.score);
  const best = sorted[0];
  const ambiguous = sorted.filter((candidate) => candidate.score.score === best.score.score && candidate.score.inBand === best.score.inBand);

  if (ambiguous.length > 1) {
    const byPrice = ambiguous
      .filter((candidate) => Number.isFinite(candidate.score.usdValue))
      .toSorted((a, b) => a.score.usdValue - b.score.usdValue);

    if (byPrice.length) {
      const cheapest = byPrice[0];
      const second = byPrice[1];
      if (!second || cheapest.score.usdValue < second.score.usdValue) {
        return { status: "available", candidate: cheapest };
      }
    }

    return { status: "needs_review", candidates: ambiguous };
  }

  return { status: "available", candidate: best };
}

function buildAvailableRow({ app, rule, region, rawItem, sourceUrl, fetchedAt, fx }) {
  const priceValue = parsePriceValue(rawItem.priceText);
  const fxRateToCny = rateToCny(region.currencyCode, fx);

  return {
    appSlug: app.slug,
    planSlug: rule.planSlug,
    countryCode: region.countryCode,
    countryLabel: region.countryLabel,
    currencyCode: region.currencyCode,
    priceText: rawItem.priceText,
    priceValue,
    cnyPrice: priceValue == null ? null : roundCurrency(priceValue * fxRateToCny),
    fxRateToCny,
    fxDate: fx.date,
    sourceUrl,
    evidenceSource: "app_store_html",
    rawTitle: rawItem.title,
    rawSnippetHash: rawItem.rawSnippetHash,
    fetchedAt,
    status: "available",
    failureReason: null,
  };
}

function buildMissingRow({ app, rule, region, sourceUrl, fetchedAt, failureReason }) {
  return {
    appSlug: app.slug,
    planSlug: rule.planSlug,
    countryCode: region.countryCode,
    countryLabel: region.countryLabel,
    currencyCode: region.currencyCode,
    priceText: null,
    priceValue: null,
    cnyPrice: null,
    fxRateToCny: null,
    fxDate: null,
    sourceUrl,
    evidenceSource: "app_store_html",
    rawTitle: null,
    rawSnippetHash: null,
    fetchedAt,
    status: "missing",
    failureReason,
  };
}

function buildReviewRow({ app, rule, region, sourceUrl, fetchedAt, candidates }) {
  return {
    appSlug: app.slug,
    planSlug: rule.planSlug,
    countryCode: region.countryCode,
    countryLabel: region.countryLabel,
    currencyCode: region.currencyCode,
    priceText: null,
    priceValue: null,
    cnyPrice: null,
    fxRateToCny: null,
    fxDate: null,
    sourceUrl,
    evidenceSource: "app_store_html",
    rawTitle: candidates.map((candidate) => candidate.title).join(" | "),
    rawSnippetHash: hashSnippet(candidates.map((candidate) => `${candidate.title} ${candidate.priceText}`).join("\n")),
    fetchedAt,
    status: "needs_review",
    failureReason: `Multiple candidates matched: ${candidates.map((candidate) => `${candidate.title} ${candidate.priceText}`).join("; ")}`,
  };
}

function buildFailure({ app, region, sourceUrl, status, failureReason, fetchedAt }) {
  return {
    appSlug: app.slug,
    countryCode: region.countryCode,
    countryLabel: region.countryLabel,
    sourceUrl,
    evidenceSource: "app_store_html",
    fetchedAt,
    status,
    failureReason,
  };
}

function runItem(app, region, status, matchedCount, rawItemCount, ms, failureReason = null) {
  return {
    appSlug: app.slug,
    countryCode: region.countryCode,
    status,
    matchedCount,
    rawItemCount,
    ms,
    failureReason,
  };
}

function buildAppStoreUrl(app, region) {
  return `https://apps.apple.com/${region.storefrontCode}/app/${app.appStoreSlug}/id${app.appStoreId}`;
}

function rateToCny(currencyCode, fx) {
  if (currencyCode === "CNY") return 1;
  const cnyPerUsd = fx.rates.CNY;
  const currencyPerUsd = fx.rates[currencyCode];
  if (!currencyPerUsd) throw new Error(`Missing FX rate for ${currencyCode}.`);
  return cnyPerUsd / currencyPerUsd;
}

function convertCurrency(value, fromCurrency, toCurrency, fx) {
  if (fromCurrency === toCurrency) return value;
  if (toCurrency === "USD") {
    if (fromCurrency === "USD") return value;
    const fromPerUsd = fx.rates[fromCurrency];
    if (!fromPerUsd) return null;
    return value / fromPerUsd;
  }
  if (fromCurrency === "USD") {
    const toPerUsd = fx.rates[toCurrency];
    if (!toPerUsd) return null;
    return value * toPerUsd;
  }
  const usd = convertCurrency(value, fromCurrency, "USD", fx);
  return usd == null ? null : convertCurrency(usd, "USD", toCurrency, fx);
}

export function parsePriceValue(text) {
  if (!text) return null;
  const multiplier = localizedPriceMultiplier(text);
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
  if (!normalized) return null;

  if (multiplier) {
    const separatorIndex = Math.max(normalized.lastIndexOf(","), normalized.lastIndexOf("."));
    const numberText =
      separatorIndex > -1
        ? `${normalized.slice(0, separatorIndex).replace(/[,.]/g, "")}.${normalized.slice(separatorIndex + 1).replace(/[,.]/g, "")}`
        : normalized.replace(/[,.]/g, "");
    const value = Number(numberText);
    return Number.isFinite(value) ? value * multiplier : null;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  let decimalSeparator = null;

  if (lastComma > -1 && lastDot > -1) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma > -1) {
    decimalSeparator = normalized.length - lastComma - 1 <= 2 ? "," : null;
  } else if (lastDot > -1) {
    decimalSeparator = normalized.length - lastDot - 1 <= 2 ? "." : null;
  }

  let numberText = normalized;
  if (decimalSeparator) {
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    numberText = numberText.replaceAll(thousandsSeparator, "");
    if (decimalSeparator === ",") numberText = numberText.replace(",", ".");
  } else {
    numberText = numberText.replace(/[,.]/g, "");
  }

  const value = Number(numberText);
  return Number.isFinite(value) ? value : null;
}

function localizedPriceMultiplier(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("juta")) return 1_000_000;
  if (normalized.includes("ribu")) return 1_000;
  return null;
}

function normalizePriceText(text) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikePrice(text) {
  return (
    parsePriceValue(text) != null &&
    /(?:[A-Z]{3}|[$€£¥₺₱₩￦₹₪₦₫฿]|HK\$|S\$|CA\$|A\$|NT\$|S\/|Rs\.?|RM|Rp)\s*\d|\d[\d\s,.]*\s*(?:[A-Z]{3}|[$€£¥₺₱₩￦₹₪₦₫฿]|đ|ribu|juta)/i.test(text)
  );
}

function decodeHtmlText(value) {
  return value
    .replace(/<!-- HTML_TAG_START -->|<!-- HTML_TAG_END -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[()（）\-_·,，.。/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashSnippet(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function fxDateFromOpenExchange(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericSort(a, b) {
  return Number(a || 0) - Number(b || 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function readEnvFile(filePath) {
  const output = {};
  if (!existsSync(filePath)) return output;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    output[match[1]] = unquote(match[2].trim());
  }

  return output;
}

function unquote(value) {
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }

  return value;
}

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const rawKey = item.slice(2);
    const [key, inlineValue] = rawKey.split("=", 2);
    const next = values[index + 1];

    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}

function normalizeOptions(options) {
  return {
    ...options,
    all: truthyOption(options.all),
    fxOnly: truthyOption(options.fxOnly ?? options["fx-only"]),
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    post: truthyOption(options.post),
    db: truthyOption(options.db),
    timeoutMs: options.timeoutMs ?? options["timeout-ms"] ?? options.timeout,
  };
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function printSummary(result) {
  if (result.source?.kind === "official_price_fx_refresh") {
    console.log(
      [
        `Official price FX refresh ${result.run.status}.`,
        `regions=${result.run.regionCount}`,
        `currencies=${result.scope.currencies.length}`,
        `fx_rates=${result.run.fxRateCount}`,
        `current_prices=${result.run.currentPriceCount || 0}`,
        `updated=${result.run.updatedCurrentPriceCount || 0}`,
        `skipped=${result.run.skippedCurrentPriceCount || 0}`,
      ].join(" "),
    );
    if (result.source.fxFallback) {
      const fallbackLabel = result.source.fxFallbackGeneratedAt ? `local snapshot ${result.source.fxFallbackGeneratedAt}` : result.source.fxSource;
      console.log(`FX fallback used: ${result.fx.date} from ${fallbackLabel} (${result.source.fxFallbackReason})`);
    }
    return;
  }

  console.log(
    [
      `Official price collection ${result.run.status}.`,
      `apps=${result.scope.apps.length}`,
      `regions=${result.scope.regions.length}`,
      `rows=${result.run.rowCount}`,
      `available=${result.run.availableCount}`,
      `missing=${result.run.missingCount}`,
      `needs_review=${result.run.needsReviewCount}`,
      `unmatched=${result.run.unmatchedCount}`,
      `failures=${result.run.failureCount}`,
    ].join(" "),
  );
  if (result.source.fxFallback) {
    const fallbackLabel = result.source.fxFallbackGeneratedAt ? `local snapshot ${result.source.fxFallbackGeneratedAt}` : result.source.fxSource;
    console.log(`FX fallback used: ${result.fx.date} from ${fallbackLabel} (${result.source.fxFallbackReason})`);
  }
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const parts = ["message", "code", "details", "hint"]
      .map((key) => {
        const value = error[key];
        return value ? `${key}=${String(value)}` : null;
      })
      .filter(Boolean);

    if (parts.length) return parts.join(" ");

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function httpStatus(error) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number(error.status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}
