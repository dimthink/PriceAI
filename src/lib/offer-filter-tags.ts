export const OFFER_FILTER_TAG_GROUPS = {
  access: "交付方式",
  proxy: "反代能力",
  warranty: "质保",
} as const;

export type OfferFilterTagGroup = keyof typeof OFFER_FILTER_TAG_GROUPS;

export type OfferFilterTagId = "shared_access" | "proxy_supported" | "warranty_long";

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
    id: "shared_access",
    label: "拼车/团购",
    group: "access",
    description: "多人共享、几人车、拼车、团购、车位或合租类报价。",
  },
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
    description: "15 天以上、一个月、订阅不掉或全程质保。",
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

  if (!hasSharedAccessNegativeSignal(text) && hasSharedAccessSignal(text)) {
    output.add("shared_access");
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

  const offerTags = new Set(
    offer.filterTags && offer.filterTags.length
      ? parseOfferFilterTags(offer.filterTags)
      : deriveOfferFilterTags(offer),
  );

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

function hasSharedAccessNegativeSignal(text: string): boolean {
  return /非拼车|不是拼车|不拼车|无拼车|拒绝拼车|非团购|不是团购|不团购|非共享|不是共享|不共享|无共享|非合租|不是合租|不合租|非车位|不是车位/.test(text);
}

function hasSharedAccessSignal(text: string): boolean {
  return hasStrongSharedAccessSignal(text) || (!hasExclusiveAccessSignal(text) && hasWeakSharedAccessSignal(text));
}

function hasStrongSharedAccessSignal(text: string): boolean {
  return /拼车|团购|拼团|车位|多人共享|多人共用|(?:二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(?:车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车/.test(text);
}

function hasWeakSharedAccessSignal(text: string): boolean {
  return /共享|共用|合租|共享号/.test(text);
}

function hasExclusiveAccessSignal(text: string): boolean {
  return /独享|独立|一人一号|一人一户|专享/.test(text);
}

function hasNoWarrantySignal(text: string): boolean {
  return /无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|售后不管|一律不售后|无售后|不作售后条件|不做售后|不管售后/.test(text);
}

function hasFirstLoginWarrantySignal(text: string): boolean {
  return /质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次|质保购买一小时内首登|质保\d+h?内首登|质保[一二三四五六七八九十]+小时内首登/.test(text);
}

function hasShortWarrantySignal(text: string): boolean {
  return /质保(?:[1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|(?:^|[^0-9])(?:[1-9]|1[0-4])天质保|(?:一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天质保|质保(?:一周|1周|两周|2周|二周)|(?:一周|1周|两周|2周|二周)质保|7天售后|七天售后|质保\d{1,2}h|质保(?:24|48|72)小时|质保\d+小时|\d+h质保|\d+小时质保|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次成功接码|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次接码|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次|质保额度|质保不来码|质保开通|仅质保开通|只质保开通|质保充值成功|质保激活成功|质保到手/.test(text);
}

function hasLongWarrantySignal(text: string): boolean {
  return /质保(?:1[5-9]|[2-9]\d|[1-9]\d{2,})天|(?:1[5-9]|[2-9]\d|[1-9]\d{2,})天质保|质保(?:十五|二十|二十五|二十八|三十|一百八十)天|(?:十五|二十|二十五|二十八|三十|一百八十)天质保|质保(?:半个月|一个月|1个月|一月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|(?:半个月|一个月|1个月|一月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)质保|质保.{0,8}订阅|订阅.{0,8}质保|质保.{0,8}掉订阅|掉订阅.{0,8}质保|质保.{0,8}封号\+?订阅|全程质保|全程保|包月售后|(?:月卡|整月|1个月|一个月|一月|官方直充|正规充值|官方代充|代充|成品号|充值卡密|ios充值|美区ios).{0,18}质保|质保.{0,18}(?:月卡|整月|1个月|一个月|一月|官方直充|正规充值|官方代充|代充|成品号|充值卡密|ios充值|美区ios)/.test(text);
}
