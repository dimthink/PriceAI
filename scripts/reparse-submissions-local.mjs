import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const targetIds = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => arg.trim())
  .filter(Boolean);

const supabase = createClient(supabaseUrl, serviceRoleKey);

const query = supabase
  .from("channel_submissions")
  .select("id,url,name,parsed_title,parsed_meta,status")
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(100);

const { data: submissions, error } = targetIds.length
  ? await query.in("id", targetIds)
  : await query;

if (error) throw error;

let resolved = 0;
let skipped = 0;
let failed = 0;

for (const submission of submissions || []) {
  try {
    const parsedUrl = safeUrl(submission.url);
    if (!parsedUrl || getSubmittedUrlType(parsedUrl) !== "product") {
      skipped++;
      continue;
    }

    const host = normalizeHostname(parsedUrl.hostname);
    if (host !== "pay.ldxp.cn" && host !== "pay.qxvx.cn") {
      skipped++;
      continue;
    }

    const goodsKey = getGoodsKey(parsedUrl.pathname);
    if (!goodsKey) {
      skipped++;
      continue;
    }

    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const goods = await fetchShopGoods(baseUrl, parsedUrl.toString(), goodsKey);
    if (!goods.token) {
      console.log(`${submission.id}: unresolved ${submission.url}`);
      skipped++;
      continue;
    }

    const shopUrl = `${baseUrl}/shop/${encodeURIComponent(goods.token)}`;
    const sourceName = inferSourceName(host, submission.name || goods.title, goods.token, goods.nickname);
    const meta = submission.parsed_meta && typeof submission.parsed_meta === "object"
      ? submission.parsed_meta
      : {};
    const nextMeta = {
      ...meta,
      normalized_url: parsedUrl.toString(),
      submitted_url_type: "product",
      base_url: baseUrl,
      canonical_source_status: "resolved",
      canonical_source_reason: "已通过本机重解析从商品接口反查到店铺入口。",
      canonical_source_url: shopUrl,
      shop_token: goods.token,
      suggested_source_name: sourceName,
      suggested_source_id: inferSourceId(host, sourceName, goods.token),
      suggested_collection_method: "http",
      suggested_collector_kind: "shopApi",
      support_status: "supported",
      support_reason: "已识别 shopApi 采集器，可通过自动采集拉取商品。",
      reparsed_at: new Date().toISOString(),
    };

    console.log(`${submission.id}: ${submission.url} -> ${shopUrl} (${sourceName})`);
    resolved++;

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("channel_submissions")
        .update({
          parsed_title: submission.parsed_title || goods.title,
          parsed_meta: nextMeta,
        })
        .eq("id", submission.id)
        .eq("status", "pending");
      if (updateError) throw updateError;
    }
  } catch (err) {
    failed++;
    console.error(`${submission.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(JSON.stringify({ ok: failed === 0, dryRun, checked: submissions?.length || 0, resolved, skipped, failed }, null, 2));

async function fetchShopGoods(baseUrl, itemUrl, goodsKey) {
  const response = await fetch(`${baseUrl}/shopApi/Shop/goodsInfo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      origin: baseUrl,
      referer: itemUrl,
      visitorid: `local${Math.random().toString(36).slice(2, 10)}`,
    },
    body: JSON.stringify({ goods_key: goodsKey, trade_no: "" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`goodsInfo HTTP ${response.status}`);

  const payload = await response.json();
  const user = payload?.data?.user || {};
  let token = typeof user.token === "string" ? user.token.trim() : "";
  if (!token && typeof user.link === "string") {
    const linkUrl = safeUrl(user.link);
    token = linkUrl ? getShopToken(linkUrl.pathname) || "" : "";
  }
  return {
    token,
    nickname: typeof user.nickname === "string" ? user.nickname.trim() : "",
    title: typeof payload?.data?.name === "string" ? payload.data.name.trim() : null,
  };
}

function inferSourceName(host, title, token, nickname) {
  if (host === "pay.ldxp.cn" && nickname) return `LDXP / ${nickname}`;
  if (host === "pay.qxvx.cn" && nickname) return `QXVX / ${nickname}`;
  if (host === "pay.ldxp.cn" && token) return `LDXP / ${token}`;
  if (host === "pay.qxvx.cn" && token) return `QXVX / ${token}`;
  return title || host;
}

function inferSourceId(host, sourceName, token) {
  if (host === "pay.ldxp.cn") return `ldxp-${slugify(token || sourceName) || stableHostId(host)}`;
  if (host === "pay.qxvx.cn") return `qxvx-${slugify(token || sourceName) || stableHostId(host)}`;
  return slugify(sourceName) || stableHostId(host);
}

function getSubmittedUrlType(parsed) {
  if (getShopToken(parsed.pathname)) return "source";
  if (getGoodsKey(parsed.pathname)) return "product";
  if (parsed.searchParams.has("commodity") || parsed.searchParams.has("id")) return "product";
  if (parsed.pathname.match(/\/products\/[^/?#]+/i)) return "product";
  return parsed.pathname === "/" || parsed.pathname === "" ? "source" : "unknown";
}

function getGoodsKey(pathname) {
  const match = pathname.match(/\/item\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getShopToken(pathname) {
  const match = pathname.match(/\/shop\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizeHostname(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableHostId(host) {
  return String(host || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
