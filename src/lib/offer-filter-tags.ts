export const OFFER_FILTER_TAG_GROUPS = {
  proxy: "反代能力",
  warranty: "质保",
} as const;

export type OfferFilterTagGroup = keyof typeof OFFER_FILTER_TAG_GROUPS;

export type OfferFilterTagId = "proxy_supported" | "warranty_long";

export type OfferFilterTagDefinition = {
  id: OfferFilterTagId;
  label: string;
  group: OfferFilterTagGroup;
  description: string;
};

export type OfferFilterTagFacet = OfferFilterTagDefinition & {
  count: number;
};

export const OFFER_FILTER_TAGS: OfferFilterTagDefinition[] = [
  {
    id: "proxy_supported",
    label: "可反代",
    group: "proxy",
    description: "支持反代、Codex、sub2、cpa、json 或 API 格式。",
  },
  {
    id: "warranty_long",
    label: "长期质保",
    group: "warranty",
    description: "15 天、30 天、一个月或全程质保。",
  },
];

export const OFFER_FILTER_TAG_BY_ID = new Map<OfferFilterTagId, OfferFilterTagDefinition>(
  OFFER_FILTER_TAGS.map((tag) => [tag.id, tag]),
);

const OFFER_FILTER_TAG_IDS = new Set<string>(OFFER_FILTER_TAGS.map((tag) => tag.id));

export function parseOfferFilterTags(value: string | string[] | null | undefined): OfferFilterTagId[] {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,，\s]+/);
  const output: OfferFilterTagId[] = [];

  for (const part of parts) {
    const id = part.trim();
    if (!OFFER_FILTER_TAG_IDS.has(id)) continue;
    if (!output.includes(id as OfferFilterTagId)) output.push(id as OfferFilterTagId);
  }

  return OFFER_FILTER_TAGS
    .map((tag) => tag.id)
    .filter((id) => output.includes(id));
}

export function toggleOfferFilterTag(current: OfferFilterTagId[], id: OfferFilterTagId): OfferFilterTagId[] {
  if (current.includes(id)) return current.filter((item) => item !== id);
  return parseOfferFilterTags([...current, id]);
}

export function deriveOfferFilterTags(input: {
  sourceTitle: string;
  tags?: string[] | null;
}): OfferFilterTagId[] {
  const text = normalizeOfferFilterText(`${input.sourceTitle || ""} ${(input.tags || []).join(" ")}`);
  const output = new Set<OfferFilterTagId>();

  if (!hasUnsupportedProxySignal(text) && hasSupportedProxySignal(text)) {
    output.add("proxy_supported");
  }

  if (!hasNoWarrantySignal(text) && !hasShortWarrantySignal(text) && !hasFirstLoginWarrantySignal(text) && hasLongWarrantySignal(text)) {
    output.add("warranty_long");
  }

  return parseOfferFilterTags(Array.from(output));
}

export function buildOfferFilterFacets(offers: Array<{ sourceTitle: string; tags?: string[] | null }>): OfferFilterTagFacet[] {
  const counts = new Map<OfferFilterTagId, number>();

  for (const offer of offers) {
    for (const tag of deriveOfferFilterTags(offer)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return OFFER_FILTER_TAGS
    .map((definition) => ({
      ...definition,
      count: counts.get(definition.id) || 0,
    }))
    .filter((item) => item.count > 0);
}

export function offerMatchesFilterTags(
  offer: { sourceTitle: string; tags?: string[] | null; filterTags?: string[] | null },
  selectedTags: OfferFilterTagId[],
): boolean {
  if (!selectedTags.length) return true;

  const offerTags = new Set(deriveOfferFilterTags(offer));

  return selectedTags.every((tag) => offerTags.has(tag));
}

function normalizeOfferFilterText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[【】\[\]（）()]/g, " ");
}

function hasUnsupportedProxySignal(text: string): boolean {
  return /仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代/.test(text);
}

function hasSupportedProxySignal(text: string): boolean {
  return /可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式/.test(text);
}

function hasNoWarrantySignal(text: string): boolean {
  return /无质保|不质保|不保|不售后|售后不管|一律不售后|无售后/.test(text);
}

function hasFirstLoginWarrantySignal(text: string): boolean {
  return /质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次/.test(text);
}

function hasShortWarrantySignal(text: string): boolean {
  return /质保(?:1|2|3|4|5|6|7|一|二|三|四|五|六|七)天|(?:1|2|3|4|5|6|7|一|二|三|四|五|六|七)天质保|7天售后|七天售后/.test(text);
}

function hasLongWarrantySignal(text: string): boolean {
  return /质保(?:15|30|十五|三十)天|(?:15|30|十五|三十)天质保|质保(?:一个月|1个月|一月)|(?:一个月|1个月|一月)质保|全程质保|包月售后/.test(text);
}
