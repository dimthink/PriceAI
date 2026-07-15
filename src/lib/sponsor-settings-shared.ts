export const SPONSOR_PLACEMENT_KINDS = [
  "topBanner",
  "home",
  "apiTransit",
  "apiTransitModels",
  "apiModels",
  "listFooter",
] as const;

export type SponsorPlacementKind = (typeof SPONSOR_PLACEMENT_KINDS)[number];
export type SponsorTone = "green" | "blue" | "amber";
export type SponsorCreativeStatus = "draft" | "live" | "paused" | "expired";
export const SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH = 8;
export const sponsorDisclosureLabelOptions = [
  "广告",
  "赞助",
  "广告赞助",
  "活动赞助",
  "生态赞助",
  "合作展示",
] as const;

export type SponsorCreative = {
  id: string;
  enabled: boolean;
  status: SponsorCreativeStatus;
  title: string;
  description: string;
  targetUrl: string;
  appendUtm?: boolean;
  sponsorName?: string | null;
  campaignId?: string | null;
  imageUrl?: string | null;
  visualTitle?: string | null;
  visualMeta?: string | null;
  label?: string | null;
  tone: SponsorTone;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type SponsorPlacementConfig = {
  enabled: boolean;
  creatives: SponsorCreative[];
};

export type SponsorSettingsSummary = {
  configured: boolean;
  tableReady: boolean;
  enabled: boolean;
  updatedAt: string | null;
  message: string | null;
  placements: Record<SponsorPlacementKind, SponsorPlacementConfig>;
};

export const sponsorPlacementLabels: Record<SponsorPlacementKind, string> = {
  topBanner: "全站顶部横幅",
  home: "首页生态合作位",
  apiTransit: "中转 API 频道赞助位",
  apiTransitModels: "中转 API 模型页赞助位",
  apiModels: "官方 API 页赞助位",
  listFooter: "底部赞助展示区",
};

export function defaultSponsorDisclosureLabel(kind: SponsorPlacementKind | string): string {
  return kind === "apiTransit" || kind === "apiTransitModels" ? "赞助" : "广告";
}

export function sponsorCreativeDisclosureLabel(
  creative: Pick<SponsorCreative, "label"> | null | undefined,
  kind: SponsorPlacementKind | string,
): string {
  const label = String(creative?.label || "").trim().slice(0, SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH);
  return label || defaultSponsorDisclosureLabel(kind);
}

export const defaultSponsorCreativesByPlacement: Record<SponsorPlacementKind, SponsorCreative[]> = {
  topBanner: [
    {
      id: "top-ai-ecosystem",
      enabled: true,
      status: "live",
      title: "AI 周边赞助位开放",
      description: "适合云服务器、开发者工具、监控、域名、支付、算力等服务。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "AI 周边服务",
      visualMeta: "云服务 / 监控 / 开发工具",
      tone: "green",
    },
  ],
  home: [
    {
      id: "home-developer-stack",
      enabled: true,
      status: "live",
      title: "PriceAI 生态合作展示",
      description: "适合 AI 周边服务、开发者基础设施或工具类品牌的轻曝光。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "Developer Stack",
      visualMeta: "品牌图 / 短标题 / 落地页",
      tone: "blue",
    },
  ],
  apiTransit: [
    {
      id: "api-transit-gateway",
      enabled: true,
      status: "live",
      title: "API Gateway / 中转站赞助展示",
      description: "适合展示品牌、优惠码和资料入口；价格、稳定性和准入规则仍独立展示。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "API Gateway",
      visualMeta: "公开价格 / 优惠码 / 监测资料",
      tone: "green",
    },
  ],
  apiTransitModels: [
    {
      id: "api-transit-model-router",
      enabled: true,
      status: "live",
      title: "按模型承接 API Gateway 合作",
      description: "适合强调模型覆盖、协议兼容、公开价格和监测能力。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "Model Router",
      visualMeta: "Claude / GPT / Gemini",
      tone: "amber",
    },
  ],
  apiModels: [
    {
      id: "api-models-toolkit",
      enabled: true,
      status: "live",
      title: "模型 API 与开发者工具赞助",
      description: "面向比较官方 API、Token Plan、模型路由和开发工具的用户。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "API Toolkit",
      visualMeta: "Token Plan / 路由 / 监控 / SDK",
      tone: "blue",
    },
  ],
  listFooter: [
    {
      id: "footer-cloud-stack",
      enabled: true,
      status: "live",
      title: "云服务器 / 网络线路",
      description: "适合 VPS、轻量云、CDN、网络线路和基础设施服务。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "Cloud Stack",
      visualMeta: "VPS · CDN · Network",
      tone: "green",
    },
    {
      id: "footer-risk-check",
      enabled: true,
      status: "live",
      title: "购买前检测工具",
      description: "适合 IP 纯净度、支付环境、账号安全和风控检测工具。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "Risk Check",
      visualMeta: "IP · Pay · Safety",
      tone: "blue",
    },
    {
      id: "footer-api-transit-stack",
      enabled: true,
      status: "live",
      title: "中转 API / 模型路由",
      description: "适合公开价格、监测页、优惠码入口和模型路由服务；不影响中转站自然排序。",
      targetUrl: "/commercial#slots",
      appendUtm: true,
      visualTitle: "API Gateway",
      visualMeta: "Transit · Router · Monitor",
      tone: "amber",
    },
  ],
};

export const defaultFooterSponsorCreatives: SponsorCreative[] = defaultSponsorCreativesByPlacement.listFooter;

export function createDefaultSponsorSettingsSummary(
  overrides: Partial<Pick<SponsorSettingsSummary, "configured" | "tableReady" | "enabled" | "updatedAt" | "message">> = {},
): SponsorSettingsSummary {
  return {
    configured: false,
    tableReady: false,
    enabled: false,
    updatedAt: null,
    message: null,
    placements: {
      topBanner: disabledDefaultPlacement("topBanner"),
      home: disabledDefaultPlacement("home"),
      apiTransit: disabledDefaultPlacement("apiTransit"),
      apiTransitModels: disabledDefaultPlacement("apiTransitModels"),
      apiModels: disabledDefaultPlacement("apiModels"),
      listFooter: {
        enabled: false,
        creatives: cloneCreatives(defaultFooterSponsorCreatives),
      },
    },
    ...overrides,
  };
}

export function getVisibleSponsorCreatives(
  settings: SponsorSettingsSummary | null | undefined,
  kind: SponsorPlacementKind,
  now = new Date(),
): SponsorCreative[] {
  if (!settings?.enabled) return [];
  const placement = settings.placements[kind];
  if (!placement?.enabled) return [];

  return placement.creatives.filter((creative) => isSponsorCreativeVisible(creative, now));
}

export function isSponsorCreativeVisible(creative: SponsorCreative, now = new Date()): boolean {
  if (!creative.enabled || creative.status !== "live") return false;
  if (creative.startsAt && Date.parse(creative.startsAt) > now.getTime()) return false;
  if (creative.endsAt && Date.parse(creative.endsAt) < now.getTime()) return false;
  return true;
}

function disabledDefaultPlacement(kind: SponsorPlacementKind): SponsorPlacementConfig {
  return {
    enabled: false,
    creatives: cloneCreatives(defaultSponsorCreativesByPlacement[kind]),
  };
}

function cloneCreatives(creatives: SponsorCreative[]): SponsorCreative[] {
  return creatives.map((creative) => ({ ...creative }));
}
