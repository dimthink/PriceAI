import type { OfferStatus } from "./types";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function stableId(...parts: Array<string | number | null | undefined>): string {
  const input = parts.filter((part) => part !== null && part !== undefined).join("|");
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `id-${(hash >>> 0).toString(36)}`;
}

const SHOP_API_OFFER_HOSTS = new Set([
  "catfk.com",
  "ldxp.cn",
  "pay.ldxp.cn",
  "pay.qxvx.cn",
]);

export function stableOfferInputId(offer: {
  sourceName?: string | null;
  sourceStoreName?: string | null;
  sourceTitle?: string | null;
  url?: string | null;
}): string {
  const shopItemUrl = normalizeShopApiItemOfferUrl(offer.url);
  if (shopItemUrl) return stableId("shop-api-offer", shopItemUrl);

  return stableId(offer.sourceName, offer.sourceStoreName, offer.sourceTitle, offer.url);
}

export function publicOfferDedupeKey(offer: {
  canonicalProductId?: string | null;
  sourceTitle?: string | null;
  price?: number | null;
  url?: string | null;
}): string {
  return [
    offer.canonicalProductId || "",
    normalizeOfferUrlForDedupe(offer.url),
    normalizeDedupeText(offer.sourceTitle),
    normalizeDedupePrice(offer.price),
  ].join("|");
}

export function normalizeShopApiItemOfferUrl(value: string | null | undefined): string | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;

  const host = normalizeHostname(parsed.hostname);
  if (!SHOP_API_OFFER_HOSTS.has(host)) return null;

  const pathGoodsKey = parsed.pathname.match(/^\/item\/([^/?#]+)/i)?.[1] || null;
  const goodsKey = pathGoodsKey || parsed.searchParams.get("commodity") || parsed.searchParams.get("id");
  if (!goodsKey) return null;

  return `https://${host}/item/${encodeURIComponent(decodeURIComponent(goodsKey))}`;
}

export function normalizeOfferUrlForDedupe(value: string | null | undefined): string {
  const shopItemUrl = normalizeShopApiItemOfferUrl(value);
  if (shopItemUrl) return shopItemUrl;

  const parsed = parseUrl(value);
  if (!parsed) return String(value || "").trim().replace(/\/+$/, "");

  parsed.hostname = normalizeHostname(parsed.hostname);
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.hash = "";
  return parsed.toString();
}

function normalizeDedupeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function normalizeDedupePrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

function parseUrl(value: string | null | undefined): URL | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

export function parseTags(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  return value
    .split(/[,，\n|｜]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeStatus(value: string | null | undefined): OfferStatus {
  const text = (value || "").toLowerCase();

  if (["in_stock", "有货", "现货", "库存", "available"].some((item) => text.includes(item))) {
    return "in_stock";
  }

  if (["low_stock", "少量", "低库存", "紧张"].some((item) => text.includes(item))) {
    return "low_stock";
  }

  if (["out_of_stock", "缺货", "售罄", "无货", "库存：0", "stock:0"].some((item) => text.includes(item))) {
    return "out_of_stock";
  }

  return "unknown";
}

export function formatCurrency(value: number | null, currency = "CNY"): string {
  if (value === null || Number.isNaN(value)) return "暂无价格";

  const symbol = currency === "CNY" ? "¥" : `${currency} `;
  return `${symbol}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "未记录";

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "未记录";

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "刚刚";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateMinute(value: string | null | undefined): string {
  if (!value) return "未记录";

  const text = value.trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}:${isoMatch[3]}`;

  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (dateMatch) return dateMatch[2] ? `${dateMatch[1]} ${dateMatch[2]}:${dateMatch[3]}` : dateMatch[1];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateDay(value: string | null | undefined): string {
  if (!value) return "未记录";

  const text = value.trim();
  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
