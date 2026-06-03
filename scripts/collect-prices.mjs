#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const env = readEnvFile(".env.local");

const KAMI_HOSTS = new Set([
  "ai666.dnxb.cc",
  "aisou.pro",
  "caowo.store",
  "faka.redeemgpt.com",
  "feifei.shop",
  "shopcardai.click",
  "talkai.cyou",
  "yh-mo.xyz",
  "zzshu.com",
]);

const DUJIAO_HOSTS = new Set([
  "burstpro-ai.online",
  "card.kxandyou.com",
  "kapay.shop",
  "shop.aitonse.com",
  "shop.auto-subscribe.com",
  "ultra.makelove.cloud",
  "zhang520.store",
]);

const PRICE_VALUE_PATTERN = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const CURRENCY_PRICE_RE = new RegExp(String.raw`[¥￥]\s*${PRICE_VALUE_PATTERN}`);

export async function runPriceCollection(options = {}) {
  const targets = await loadTargets();
  const selectedTargets = selectTargets(targets, options);
  const logger = options.silent ? null : console;

  if (!selectedTargets.length) {
    throw new Error("No matching supported sources. Use --list to inspect available collectors.");
  }

  const summary = [];

  for (const target of selectedTargets) {
    const startedAt = Date.now();
    logger?.log(`\n==> ${target.sourceName} [${target.kind}]`);

    try {
      const collection = await collectTargetWithRetries(target, options, logger);
      const offers = collection.offers;
      const status = offers.length ? "success" : "failed";
      const message = offers.length
        ? `HTTP collector found ${offers.length} offers after ${collection.attempts.length} attempt(s).`
        : `HTTP collector found no offers after ${collection.attempts.length} attempt(s).`;

      if (logger) printOfferPreview(offers);

      if (options.post) {
        const posted = await postCrawlLogBatched(target, offers, status, message, options, {
          attempts: collection.attempts,
          maxAttempts: collection.maxAttempts,
        });
        logger?.log(`Posted ${posted.successCount} offers.`);
      }

      summary.push({
        sourceId: target.sourceId,
        source: target.sourceName,
        kind: target.kind,
        status,
        offers: offers.length,
        attempts: collection.attempts.length,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      const message = errorMessage(error);
      const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
      logger?.error(`Failed: ${message}`);

      if (options.post) {
        await postCrawlLog(target, [], "failed", message, options, {
          attempts,
          maxAttempts: maxAttemptsFor(options),
        }).catch((postError) => {
          logger?.error(`Failed to post failure log: ${errorMessage(postError)}`);
        });
      }

      summary.push({
        sourceId: target.sourceId,
        source: target.sourceName,
        kind: target.kind,
        status: "failed",
        offers: 0,
        attempts: attempts.length || maxAttemptsFor(options),
        ms: Date.now() - startedAt,
        message,
      });
    }
  }

  return {
    summary,
    targetCount: selectedTargets.length,
    successCount: summary.filter((item) => item.status === "success").length,
    failureCount: summary.filter((item) => item.status !== "success").length,
    offerCount: summary.reduce((sum, item) => sum + item.offers, 0),
    finishedAt: new Date().toISOString(),
  };
}

export async function probeSource(options = {}) {
  const sourceUrl = options.sourceUrl || options.entryUrl || options.url;
  if (!sourceUrl) throw new Error("Missing sourceUrl.");

  const sourceName = options.sourceName || options.name || sourceNameFromUrl(sourceUrl);
  const source = {
    id: options.sourceId || options.id || sourceIdFrom(sourceName, sourceUrl),
    name: sourceName,
    base_url: options.baseUrl || deriveBaseUrl(sourceUrl),
    entry_url: sourceUrl,
    collection_method: "http",
    collector_kind: options.collectorKind || options.kind || null,
  };
  const target = buildTarget(source, Array.isArray(options.rawOffers) ? options.rawOffers : []);
  const startedAt = Date.now();
  const limit = Math.max(1, Math.min(Number(options.limit || 12), 50));

  if (!target.kind) {
    return {
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      baseUrl: target.baseUrl,
      kind: null,
      status: "unsupported",
      offerCount: 0,
      offers: [],
      ms: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: "当前链接暂未识别到自动采集器。若渠道真实，请加入采集器待办，补解析脚本后重新试采集。",
    };
  }

  try {
    const offers = dedupeOffers(await collectTarget(target));
    return {
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      baseUrl: target.baseUrl,
      kind: target.kind,
      status: offers.length ? "success" : "empty",
      offerCount: offers.length,
      offers: offers.slice(0, limit),
      ms: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: offers.length
        ? `试采集成功，识别到 ${offers.length} 条报价。`
        : "已连接到采集器，但没有识别到可比价商品。",
    };
  } catch (error) {
    return {
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      baseUrl: target.baseUrl,
      kind: target.kind,
      status: "failed",
      offerCount: 0,
      offers: [],
      ms: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: errorMessage(error),
    };
  }
}

export { loadTargets, selectTargets };

if (isCli()) {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const targets = await loadTargets();
    printTargetList(targets);
    process.exit(0);
  }

  runPriceCollection({
    ...args,
    all: Boolean(args.all),
    post: Boolean(args.post),
  })
    .then((result) => {
      console.log("\nSummary");
      console.table(result.summary);
    })
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}

async function collectTarget(target) {
  if (target.kind === "kami") return collectKamiLike(target);
  if (target.kind === "dujiao") return collectDujiaoNext(target);
  if (target.kind === "shopApi") return collectShopApi(target);
  if (target.kind === "xiaoheiwan") return collectXiaoheiwan(target);
  if (target.kind === "opensoraHtml") return collectOpensoraHtml(target);
  if (target.kind === "makerichHtml") return collectMakerichHtml(target);
  if (target.kind === "beibeiHtml") return collectBeibeiHtml(target);
  if (target.kind === "ikunloveApi") return collectIkunloveApi(target);
  if (target.kind === "getgptApi") return collectGetgptApi(target);

  throw new Error(`Unsupported collector kind: ${target.kind}`);
}

async function collectTargetWithRetries(target, options = {}, logger = null) {
  const maxAttempts = maxAttemptsFor(options);
  const attempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const offers = dedupeOffers(await collectTarget(target));
      const message = offers.length ? `采集到 ${offers.length} 条报价。` : "采集结果为空。";
      attempts.push({
        attempt,
        status: offers.length ? "success" : "empty",
        offers: offers.length,
        ms: Date.now() - startedAt,
        message,
      });

      if (offers.length) return { offers, attempts, maxAttempts };

      lastError = new Error(message);
    } catch (error) {
      const message = errorMessage(error);
      attempts.push({
        attempt,
        status: "failed",
        offers: 0,
        ms: Date.now() - startedAt,
        message,
      });
      lastError = error;
    }

    if (attempt < maxAttempts) {
      const waitMs = retryDelayMs(attempt);
      logger?.log(`Retrying ${target.sourceName} in ${waitMs}ms (${attempt + 1}/${maxAttempts})...`);
      await delay(waitMs);
    }
  }

  const error = new Error(lastError ? errorMessage(lastError) : "采集失败。");
  error.attempts = attempts;
  throw error;
}

async function collectKamiLike(target) {
  const offers = [];
  const base = target.baseUrl;

  for (let page = 1; page <= 10; page += 1) {
    const payload = await fetchJson(`${base}/user/api/index/commodity?limit=100&page=${page}`);
    const items = Array.isArray(payload.data) ? payload.data : [];
    if (!items.length) break;

    for (const item of items) {
      const title = cleanText(item.name);
      const price = numberOrNull(item.user_price ?? item.price);
      if (!title || price === null || isNonComparableTitle(title)) continue;

      const stockCount = numberOrNull(item.stock);
      const hidden = Number(item.hide || 0) !== 0;
      const disabled = Number(item.status ?? 1) !== 1 || hidden;
      const status = disabled ? "out_of_stock" : statusFromStock(stockCount);
      const categoryName = cleanText(item.category?.name || "");

      offers.push(
        makeOffer(target, {
          title,
          price,
          status,
          stockCount,
          url: kamiCommodityUrl(target, item.id),
          tags: compact([
            categoryName,
            item.delivery_way === 0 ? "自动发货" : null,
            hidden ? "隐藏商品" : null,
          ]),
        }),
      );
    }

    if (items.length < 100) break;
  }

  return offers;
}

async function collectDujiaoNext(target) {
  const payload = await fetchJson(`${target.baseUrl}/api/v1/public/products`);
  const products = Array.isArray(payload.data) ? payload.data : [];
  const offers = [];

  for (const product of products) {
    const productTitle = localized(product.title) || cleanText(product.slug);
    const skus = Array.isArray(product.skus) && product.skus.length ? product.skus : [null];

    skus.forEach((sku, index) => {
      const skuTitle = localized(sku?.title || sku?.name || sku?.label || sku?.spec);
      const title = cleanText(
        skuTitle && skuTitle !== productTitle
          ? `${productTitle} / ${skuTitle}`
          : skus.length > 1 && sku
            ? `${productTitle} / 规格${index + 1}`
            : productTitle,
      );
      const price = numberOrNull(sku?.price_amount ?? product.price_amount);
      if (!title || price === null || isNonComparableTitle(title)) return;

      const stockCount = numberOrNull(
        sku?.auto_stock_available ??
          sku?.manual_stock_available ??
          product.auto_stock_available ??
          product.manual_stock_available,
      );
      const isSoldOut = Boolean(sku?.is_sold_out ?? product.is_sold_out);
      const stockStatus = String(sku?.stock_status || product.stock_status || "");
      const status = isSoldOut || stockStatus === "out_of_stock" ? "out_of_stock" : statusFromStock(stockCount);
      const categoryName = localized(product.category?.name);

      offers.push(
        makeOffer(target, {
          title,
          price,
          status,
          stockCount,
          url: `${target.baseUrl}/products/${encodeURIComponent(String(product.slug || product.id))}`,
          tags: compact([
            categoryName,
            product.fulfillment_type === "auto" ? "自动发货" : null,
            product.fulfillment_type === "manual" ? "人工处理" : null,
          ]),
        }),
      );
    });
  }

  return offers;
}

async function collectShopApi(target) {
  const base = target.baseUrl;
  const tokens = await discoverShopTokens(target);
  const offers = [];

  if (!tokens.length) {
    throw new Error("No shop token found. Need at least one /shop/<token> or /item/<goods_key> URL.");
  }

  for (const token of tokens) {
    const shopInfo = await postJson(`${base}/shopApi/Shop/info`, { token, category_key: "" }, `${base}/shop/${token}`);
    if (shopInfo.code !== 1 || !shopInfo.data) continue;

    const storeName = cleanText(shopInfo.data.nickname || target.sourceStoreName || target.sourceName);
    const sourceUrl = shopInfo.data.link || `${base}/shop/${token}`;
    const categoriesPayload = await postJson(
      `${base}/shopApi/Shop/categoryList`,
      { token, goods_type: "card", category_key: "" },
      sourceUrl,
    );
    const categories = Array.isArray(categoriesPayload.data) ? categoriesPayload.data : [];
    const selectedCategories = categories.filter((category) => Number(category.goods_count || 0) > 0 && Number(category.id) !== 0);
    const categoryIds = selectedCategories.length
      ? selectedCategories.map((category) => Number(category.id))
      : categories.some((category) => Number(category.id) === 0)
        ? [0]
        : [];

    for (const categoryId of categoryIds) {
      for (let page = 1; page <= 10; page += 1) {
        const listPayload = await postJson(
          `${base}/shopApi/Shop/goodsList`,
          {
            token,
            keywords: "",
            category_id: categoryId,
            goods_type: "card",
            current: page,
            pageSize: 100,
          },
          sourceUrl,
        );
        const items = Array.isArray(listPayload.data?.list) ? listPayload.data.list : [];
        if (!items.length) break;

        for (const item of items) {
          const title = cleanText(item.name);
          const price = numberOrNull(item.price ?? item.real_price);
          if (!title || price === null || isNonComparableTitle(title)) continue;

          const stockCount = numberOrNull(item.extend?.stock_count);
          const status = Number(item.status ?? 1) !== 1 ? "out_of_stock" : statusFromStock(stockCount);
          const categoryName = cleanText(item.category?.name || "");

          offers.push(
            makeOffer(
              {
                ...target,
                sourceUrl,
                sourceStoreName: storeName,
              },
              {
                title,
                price,
                status,
                stockCount,
                url: item.link || `${base}/item/${item.goods_key}`,
                tags: compact([
                  categoryName,
                  item.goods_type === "card" ? "卡密" : null,
                  item.extend?.send_order === 0 ? "自动发货" : null,
                ]),
              },
            ),
          );
        }

        if (items.length < 100) break;
      }
    }
  }

  return offers;
}

async function collectXiaoheiwan(target) {
  const products = await fetchJson(`${target.baseUrl}/api/products`);
  const items = Array.isArray(products) ? products : [];

  return items
    .map((item) => {
      const title = cleanText(item.name);
      const price = numberOrNull(item.price ?? item.original_price);
      if (!title || price === null || isNonComparableTitle(title)) return null;

      const stockCount = numberOrNull(item.stock ?? item.stock_count ?? item.count);
      const status = String(item.status || "").toLowerCase() === "active" ? statusFromStock(stockCount) : "out_of_stock";

      return makeOffer(target, {
        title,
        price,
        status,
        stockCount,
        url: `${target.baseUrl}/purchase`,
        tags: compact([item.sku, "官方接口"]),
      });
    })
    .filter(Boolean);
}

async function collectOpensoraHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const pattern =
    new RegExp(String.raw`<img[^>]+alt=["']([^"']+)["'][\s\S]*?<strong>\s*${PRICE_VALUE_PATTERN}\s*<\/strong>[\s\S]*?库存[:：]\s*(\d+)[\s\S]*?<a[^>]+href=["']([^"']*\/buy\/\d+[^"']*)["']`, "gi");
  const offers = [];
  let match;

  while ((match = pattern.exec(html))) {
    const body = html.slice(match.index, pattern.lastIndex);
    const heading = body.match(/<h6 class="card-title[^"]*">\s*([\s\S]*?)<\/h6>/i)?.[1];
    const title = cleanText(heading || match[1]);
    const price = numberOrNull(match[2]);
    const stockCount = numberOrNull(match[3]);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const near = html.slice(Math.max(0, match.index - 600), pattern.lastIndex + 200);

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: statusFromStock(stockCount),
        stockCount,
        url: absolutize(match[4], target.baseUrl),
        tags: compact([
          near.includes("人工处理") ? "人工处理" : null,
          near.includes("自动发货") ? "自动发货" : null,
        ]),
      }),
    );
  }

  return offers;
}

async function collectMakerichHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const blocks = [...html.matchAll(/<a[^>]+href=["']([^"']*(?:\/item\?id=\d+|\/item\/[^"']+))["'][\s\S]*?<\/a>/gi)];
  const offers = [];

  for (const block of blocks) {
    const body = stripHtml(block[0]);
    const priceMatch = body.match(CURRENCY_PRICE_RE);
    const stockMatch = body.match(/库存[:：]\s*(\d+)/);
    if (!priceMatch) continue;

    const price = numberOrNull(priceMatch[1]);
    const stockCount = stockMatch ? numberOrNull(stockMatch[1]) : null;
    const title = cleanText(
      body
        .replace(CURRENCY_PRICE_RE, "")
        .replace(/库存[:：]\s*\d+/, "")
        .replace(/销量[:：]\s*\d+/g, ""),
    );
    if (!title || price === null || isNonComparableTitle(title)) continue;

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: statusFromStock(stockCount),
        stockCount,
        url: absolutize(block[1], target.baseUrl),
        tags: [],
      }),
    );
  }

  return offers;
}

async function collectBeibeiHtml(target) {
  const html = await fetchText(target.sourceUrl);
  const blocks = [...html.matchAll(/<article class="atelier-catalog-card[\s\S]*?<\/article>/gi)];
  const offers = [];

  for (const block of blocks) {
    const body = block[0];
    const title = cleanText(body.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1]);
    const price = numberOrNull(body.match(CURRENCY_PRICE_RE)?.[1]);
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const stockMatch = body.match(/库存\s*(\d+)/);
    const soldOut = /sold-out|售罄|已售罄|action-disabled/i.test(body);
    const stockCount = soldOut ? 0 : numberOrNull(stockMatch?.[1]);
    const checkoutUrl = body.match(/href=["']([^"']*\/checkout\/[^"']+)["']/i)?.[1];
    const detailUrl = body.match(/href=["']([^"']*\/products\/[^"']+)["']/i)?.[1];
    const tags = [...body.matchAll(/<span class="atelier-pill[^"]*">([\s\S]*?)<\/span>/gi)].map((match) =>
      cleanText(match[1]),
    );

    offers.push(
      makeOffer(target, {
        title,
        price,
        status: soldOut ? "out_of_stock" : statusFromStock(stockCount),
        stockCount,
        url: absolutize(checkoutUrl || detailUrl || target.sourceUrl, target.baseUrl),
        tags,
      }),
    );
  }

  return offers;
}

async function collectIkunloveApi(target) {
  const payload = await fetchJson(`${target.baseUrl}/api/shop/products`);
  const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const offers = [];

  for (const product of products) {
    const title = cleanText(product.title);
    const price = numberOrNull(product.priceCents) === null ? null : numberOrNull(product.priceCents) / 100;
    if (!title || price === null || isNonComparableTitle(title)) continue;

    const stockCount = numberOrNull(product.stockCount);
    const hidden = product.isDeleted === true || product.isActive === false;
    const status = hidden ? "out_of_stock" : statusFromStock(stockCount);
    const detailUrl = product.purchaseGuideUrl || product.consolePath || product.tutorialPath || target.sourceUrl;

    offers.push(
      makeOffer(target, {
        title,
        price,
        status,
        stockCount,
        url: absolutize(detailUrl, target.baseUrl),
        tags: compact([
          product.category,
          product.badge,
          product.isActive === false ? "已下架" : null,
          product.isDeleted === true ? "已删除" : null,
        ]),
      }),
    );
  }

  return offers;
}

async function collectGetgptApi(target) {
  const payload = await fetchJson("https://gpt.how2cs.cn/api/order/prices");
  const products = [
    {
      title: "ChatGPT Plus 充值",
      price: payload.gptplus_amount ?? payload.amount,
      originalPrice: payload.gptplus_original_amount ?? payload.original_amount,
      path: "/plus-price",
    },
    {
      title: "ChatGPT Pro 充值",
      price: payload.gptpro_amount,
      originalPrice: payload.gptpro_original_amount,
      path: "/gptpro",
    },
    {
      title: "ChatGPT Pro Lite 充值",
      price: payload.gptprolite_amount,
      originalPrice: payload.gptprolite_original_amount,
      path: "/gptpro",
    },
    {
      title: "ChatGPT Team / Business 充值",
      price: payload.team_amount,
      originalPrice: payload.team_original_amount,
      path: "/price",
    },
    {
      title: "Claude 充值",
      price: payload.claude_amount,
      originalPrice: payload.claude_original_amount,
      path: "/",
    },
  ];

  return products
    .map((product) => {
      const price = numberOrNull(product.price);
      if (price === null) return null;

      return makeOffer(target, {
        title: product.title,
        price,
        status: "in_stock",
        stockCount: null,
        url: absolutize(product.path, target.baseUrl),
        tags: compact([product.originalPrice ? `原价 ${product.originalPrice}` : null, "官方接口"]),
      });
    })
    .filter(Boolean);
}

async function discoverShopTokens(target) {
  const tokens = new Set();
  const entryToken = shopTokenFromUrl(target.sourceUrl);
  if (entryToken) tokens.add(entryToken);

  const itemUrls = target.rawOffers
    .map((offer) => offer.url)
    .filter(Boolean)
    .filter((url) => normalizeHostname(url) === normalizeHostname(target.baseUrl))
    .slice(0, 20);

  for (const itemUrl of itemUrls) {
    const goodsKey = goodsKeyFromUrl(itemUrl);
    if (!goodsKey) continue;

    const payload = await postJson(
      `${target.baseUrl}/shopApi/Shop/goodsInfo`,
      { goods_key: goodsKey, trade_no: "" },
      itemUrl,
    ).catch(() => null);

    const token = payload?.data?.user?.token;
    if (token) tokens.add(String(token));
    if (tokens.size >= 3) break;
  }

  return Array.from(tokens);
}

async function loadTargets() {
  const builtinSources = [
    { id: "ai666-gmail-wholesale", name: "T佬的gmail批发渠道", entry_url: "https://ai666.dnxb.cc/", collection_method: "http", collector_kind: "kami" },
    { id: "aisou-pro", name: "Aisou智充", entry_url: "https://aisou.pro/", collection_method: "http", collector_kind: "kami" },
    { id: "caowo-store", name: "GPT专卖-cw", entry_url: "https://caowo.store/", collection_method: "http", collector_kind: "kami" },
    { id: "auto-subscribe", name: "Auto Subscribe", entry_url: "https://shop.auto-subscribe.com/", collection_method: "http", collector_kind: "dujiao" },
    { id: "opensora-aifk", name: "AUTO FK", entry_url: "https://aifk.opensora.de/", collection_method: "http", collector_kind: "opensoraHtml" },
    { id: "makerich-club", name: "AI创富俱乐部", entry_url: "https://makerich.club/", collection_method: "http", collector_kind: "makerichHtml" },
    { id: "ldxp-jinyao", name: "LDXP 金钥", entry_url: "https://pay.ldxp.cn/shop/jinyao", collection_method: "http", collector_kind: "shopApi" },
    { id: "ldxp-pixelshop", name: "LDXP Pixelshop", entry_url: "https://pay.ldxp.cn/shop/pixelshop", collection_method: "http", collector_kind: "shopApi" },
    { id: "qxvx-pay", name: "QXVX Pay", entry_url: "https://pay.qxvx.cn/", collection_method: "http", collector_kind: "shopApi" },
  ];
  let sources = builtinSources;
  let rawOffers = [];

  const supabase = getSupabaseClient();
  if (supabase) {
    const [sourcesResult, offersResult] = await Promise.all([
      supabase.from("sources").select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,notes").eq("enabled", true),
      supabase.from("raw_offers").select("source_id,source_name,source_store_name,source_title,url").limit(5000),
    ]);

    if (sourcesResult.error) throw sourcesResult.error;
    if (offersResult.error) throw offersResult.error;

    sources = sourcesResult.data || [];
    rawOffers = offersResult.data || [];
  }

  const rawBySource = new Map();
  for (const offer of rawOffers) {
    const sourceId = offer.source_id;
    if (!sourceId) continue;
    const items = rawBySource.get(sourceId) || [];
    items.push({
      sourceId,
      sourceName: offer.source_name,
      sourceStoreName: offer.source_store_name,
      sourceTitle: offer.source_title,
      url: offer.url,
    });
    rawBySource.set(sourceId, items);
  }

  return sources
    .filter((source) => source.collection_method !== "public_json")
    .map((source) => buildTarget(source, rawBySource.get(source.id) || []));
}

function buildTarget(source, rawOffers) {
  const sourceUrl = source.entry_url || source.base_url;
  const baseUrl = source.base_url || deriveBaseUrl(sourceUrl);
  const host = normalizeHostname(baseUrl || sourceUrl);
  const text = `${source.id} ${source.name} ${sourceUrl}`.toLowerCase();
  const configuredKind = normalizeCollectorKind(source.collector_kind);
  const inferredKind = inferCollectorKind(host, text);
  const kind =
    configuredKind && configuredKind !== "auto" && configuredKind !== "browser" && configuredKind !== "unsupported"
      ? configuredKind
      : inferredKind || configuredKind;
  const runnableKind = kind === "browser" || kind === "unsupported" ? null : kind;

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl,
    sourceStoreName: source.name,
    baseUrl,
    kind: runnableKind,
    configuredKind: configuredKind || null,
    rawOffers,
  };
}

function kamiCommodityUrl(target, id) {
  const base = target.baseUrl;
  const host = normalizeHostname(base || target.sourceUrl);
  if (host === "ai666.dnxb.cc") return `${base}/item/${encodeURIComponent(String(id))}`;
  return `${base}/?commodity=${encodeURIComponent(String(id))}`;
}

function makeOffer(target, input) {
  return {
    sourceId: target.sourceId,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    sourceStoreName: target.sourceStoreName || target.sourceName,
    sourceTitle: input.title,
    price: input.price,
    currency: "CNY",
    status: input.status || "unknown",
    url: input.url,
    tags: input.tags || [],
    stockCount: input.stockCount,
  };
}

async function postCrawlLog(target, offers, status, message, options = {}, details = {}) {
  const endpoint =
    options.endpoint ||
    process.env.CRON_PUBLIC_BASE_URL ||
    env.CRON_PUBLIC_BASE_URL ||
    "http://localhost:3000";
  const password =
    options.password ||
    process.env.ADMIN_PASSWORD ||
    env.ADMIN_PASSWORD ||
    "ai-price-hub-local";
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/admin/crawl-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
    },
    body: JSON.stringify({
      sourceId: target.sourceId,
      sourceName: target.sourceName,
      sourceUrl: target.sourceUrl,
      mode: "http",
      status,
      message,
      offers,
      details: {
        collector: target.kind,
        ...details,
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || `Post failed with HTTP ${response.status}`);
  }

  return payload;
}

async function postCrawlLogBatched(target, offers, status, message, options = {}, details = {}) {
  if (status !== "success" || offers.length <= postBatchSizeFor(options)) {
    return postCrawlLog(target, offers, status, message, options, {
      ...details,
      fullSnapshot: status === "success",
      seenOfferIds: status === "success" ? offerIdsForSnapshot(offers) : undefined,
    });
  }

  let successCount = 0;
  const batches = chunks(offers, postBatchSizeFor(options));
  const seenOfferIds = offerIdsForSnapshot(offers);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const isLast = index === batches.length - 1;
    const posted = await postCrawlLog(
      target,
      batch,
      isLast ? "success" : "partial",
      `${message} 分批写入 ${index + 1}/${batches.length}。`,
      options,
      {
        ...details,
        batchIndex: index + 1,
        batchCount: batches.length,
        originalOfferCount: offers.length,
        fullSnapshot: isLast,
        seenOfferIds: isLast ? seenOfferIds : undefined,
      },
    );
    successCount += Number(posted.successCount || 0);
  }

  return { ok: true, successCount };
}

function postBatchSizeFor(options = {}) {
  const value = Number(options.postBatchSize || options["post-batch-size"] || 200);
  if (!Number.isFinite(value)) return 200;
  return Math.max(50, Math.min(Math.trunc(value), 500));
}

function offerIdsForSnapshot(offers) {
  return offers.map((offer) => stableId(offer.sourceName, offer.sourceStoreName, offer.sourceTitle, offer.url));
}

function stableId(...parts) {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `id-${(hash >>> 0).toString(36)}`;
}

function selectTargets(targets, options) {
  const selected = options.source || options.id || options.name;
  const runnable = (target) => target.kind;
  if (!selected && !options.all) return targets.filter(runnable);
  if (options.all) return targets.filter(runnable);

  const query = String(selected).toLowerCase();
  const exact = targets.filter((target) => runnable(target) && String(target.sourceId).toLowerCase() === query);
  if (exact.length) return exact;

  return targets.filter((target) =>
    runnable(target) &&
    [target.sourceId, target.sourceName, target.sourceUrl, target.kind, target.configuredKind]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function inferCollectorKind(host, text = "") {
  if (KAMI_HOSTS.has(host)) return "kami";
  if (DUJIAO_HOSTS.has(host)) return "dujiao";
  if (host === "pay.qxvx.cn" || host === "pay.ldxp.cn" || host === "ldxp.cn") return "shopApi";
  if (host === "upgrade.xiaoheiwan.com") return "xiaoheiwan";
  if (host === "aifk.opensora.de") return "opensoraHtml";
  if (host === "makerich.club") return "makerichHtml";
  if (host === "bei-bei.shop") return "beibeiHtml";
  if (host === "ikunlove.best") return "ikunloveApi";
  if (host === "getgpt.pro") return "getgptApi";
  if (text.includes("burstpro")) return "dujiao";
  return null;
}

function normalizeCollectorKind(value) {
  const text = String(value || "").trim();
  return [
    "auto",
    "kami",
    "dujiao",
    "shopApi",
    "xiaoheiwan",
    "opensoraHtml",
    "makerichHtml",
    "beibeiHtml",
    "ikunloveApi",
    "getgptApi",
    "browser",
    "unsupported",
  ].includes(text)
    ? text
    : null;
}

function maxAttemptsFor(options = {}) {
  const value = Number(options.retries || options.retry || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(Math.trunc(value), 5));
}

function retryDelayMs(attempt) {
  return Math.min(1_000 * 2 ** (attempt - 1), 5_000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printTargetList(targets) {
  console.table(
    targets.map((target) => ({
      id: target.sourceId,
      name: target.sourceName,
      kind: target.kind || "unsupported",
      configured: target.configuredKind || "auto",
      url: target.sourceUrl,
      seedItems: target.rawOffers.length,
    })),
  );
}

function printOfferPreview(offers) {
  console.table(
    offers.slice(0, 8).map((offer) => ({
      title: offer.sourceTitle.slice(0, 42),
      price: offer.price,
      status: offer.status,
      stock: offer.stockCount,
      store: offer.sourceStoreName,
    })),
  );
  if (offers.length > 8) console.log(`... ${offers.length - 8} more`);
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: defaultHeaders(url),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return parseJsonResponse(response, url);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: defaultHeaders(url),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function postJson(url, body, referer) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...defaultHeaders(referer || url),
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      visitorid: `probe${Math.random().toString(36).slice(2, 10)}`,
      referer: referer || url,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return parseJsonResponse(response, url);
}

async function parseJsonResponse(response, url) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (/<html|<script|captcha|verify|challenge|验证|风控|安全/i.test(text)) {
      throw new Error(`${url} 返回验证或风控页面，需要改用本机浏览器采集。`);
    }
    throw new Error(`${url} 返回了非 JSON 内容，暂时无法自动采集。`);
  }
}

function defaultHeaders(url) {
  return {
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
    referer: deriveBaseUrl(url) || url,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };
}

function statusFromStock(stockCount) {
  if (typeof stockCount === "number") {
    if (stockCount <= 0) return "out_of_stock";
    if (stockCount <= 3) return "low_stock";
    return "in_stock";
  }

  return "in_stock";
}

function localized(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "object") {
    return cleanText(value["zh-CN"] || value["zh-TW"] || value["en-US"] || Object.values(value).find(Boolean) || "");
  }

  return cleanText(String(value));
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x?[a-f0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return cleanText(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  );
}

function isNonComparableTitle(title) {
  return ["Logo", "打赏", "测试", "公告", "请查看上方店铺", "其他（直接联系客服"].some((keyword) =>
    title.includes(keyword),
  );
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function compact(values) {
  return values
    .map((value) => cleanText(value || ""))
    .filter(Boolean);
}

function dedupeOffers(offers) {
  const map = new Map();
  for (const offer of offers) {
    const key = `${offer.sourceId}|${offer.url}|${offer.sourceTitle}|${offer.price}`;
    map.set(key, offer);
  }
  return Array.from(map.values());
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function absolutize(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function deriveBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function normalizeHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value || "").replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").toLowerCase();
  }
}

function sourceNameFromUrl(value) {
  try {
    const url = new URL(value);
    const token = shopTokenFromUrl(value);
    if (url.hostname === "ai666.dnxb.cc") return "T佬的gmail批发渠道";
    if (token && url.hostname === "pay.ldxp.cn") return `LDXP / ${token}`;
    if (token && url.hostname === "pay.qxvx.cn") return `QXVX / ${token}`;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Submitted Source";
  }
}

function sourceIdFrom(name, value) {
  const text = `${name || ""}-${normalizeHostname(value) || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return text || `source-${Date.now()}`;
}

function shopTokenFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/shop\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function goodsKeyFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/item\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = values[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}

function readEnvFile(path) {
  const output = {};
  if (!existsSync(path)) return output;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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

function isCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
