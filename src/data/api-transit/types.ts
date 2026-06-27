export type TransitStationStatus = "active" | "limited" | "unavailable" | "unknown";
export type TransitSourceType = "manual_collected" | "user_submitted" | "merchant_submitted";
export type TransitCommercialRelation = "none" | "listed" | "partner" | "affiliate" | "sponsored" | "unknown";
export type TransitDataStatus = "sample" | "pending_review" | "verified";
export type TransitModelFamily = "claude" | "gpt";
export type TransitStationSystem = "new_api" | "sub_to_api" | "custom" | "unknown";
export type TransitChannelType =
  | "official_api"
  | "cloud"
  | "first_party_pool"
  | "reverse_engineered"
  | "first_party_wholesale"
  | "reseller"
  | "mixed"
  | "undisclosed";
export type TransitAccountPool = "pro" | "plus" | "max" | "team" | "kiro" | "enterprise" | "official_api" | "mixed" | "undisclosed";
export type TransitRiskLabel =
  | "sample_data"
  | "insufficient_samples"
  | "mixed_pool"
  | "reseller"
  | "undisclosed_upstream"
  | "third_party_aggregate"
  | "pending_feedback";
export type TransitUsageAdvice = "try_small" | "cautious" | "not_recommended" | "pending";

export interface TransitAvailability {
  sevenDayRate: number | null;
  sevenDaySamples: number;
  firstCheckedAt?: string | null;
  lastCheckedAt: string | null;
  note?: string;
}

export interface TransitMultiplierHistoryPoint {
  observedAt: string;
  rechargeRatio: string | null;
  rechargeCoefficient: number | null;
  modelMultiplier: number | null;
  combinedRate: number | null;
  priceSource: string | null;
}

export interface TransitModelPrice {
  family: TransitModelFamily;
  standardModel:
    | "Claude Sonnet 4.6"
    | "Claude Opus 4.6"
    | "Claude Opus 4.7"
    | "Claude Opus 4.8"
    | "GPT 5.5"
    | "GPT 5.4";
  groupName: string;
  rechargeRatio: string | null;
  modelMultiplier: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
  currency: "CNY";
  accountPool: TransitAccountPool;
  channelType: TransitChannelType;
  priceSource: string;
  lastVerifiedAt: string;
  availability: TransitAvailability;
  history?: TransitMultiplierHistoryPoint[];
}

export interface TransitFeedbackSummary {
  pendingCount: number;
  verifiedRiskCount: number;
  merchantRespondedCount: number;
  mainThemes: string[];
  publicNotes: string | null;
}

export type TransitCommercialOfferType = "coupon" | "affiliate" | "sponsored";
export type TransitVerificationEventSource = "priceai" | "official" | "user" | "merchant";
export type TransitVerificationEventStatus = "success" | "warning" | "failed" | "info";

export interface TransitCommercialOffer {
  id: string;
  type: TransitCommercialOfferType;
  title: string;
  listLabel?: string | null;
  description: string | null;
  code: string | null;
  url: string | null;
  validUntil: string | null;
  disclosure: string | null;
  enabled: boolean;
}

export interface TransitVerificationEvent {
  id: string;
  source: TransitVerificationEventSource;
  status: TransitVerificationEventStatus;
  title: string;
  description: string | null;
  happenedAt: string;
}

export interface TransitStation {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  monitorUrl?: string | null;
  collectorKind?: string | null;
  stationSystem?: TransitStationSystem;
  status: TransitStationStatus;
  sourceType: TransitSourceType;
  commercialRelation: TransitCommercialRelation;
  summary: string;
  channelTypes: TransitChannelType[];
  accountPools: TransitAccountPool[];
  paymentMethods: string[];
  minimumTopUp: string | null;
  balanceExpiry: string | null;
  supportChannels: string[];
  refundPolicy: string | null;
  riskLabels: TransitRiskLabel[];
  usageAdvice: TransitUsageAdvice;
  lastUpdatedAt: string;
  dataStatus: TransitDataStatus;
  availability: TransitAvailability;
  prices: TransitModelPrice[];
  feedback: TransitFeedbackSummary;
  strengths?: string[];
  cautions?: string[];
  commercialOffers?: TransitCommercialOffer[];
  verificationEvents?: TransitVerificationEvent[];
}

export const TRANSIT_MODEL_FAMILY_LABELS: Record<TransitModelFamily, string> = {
  claude: "Claude",
  gpt: "GPT",
};

export const TRANSIT_MODEL_FAMILY_OPTIONS: { id: TransitModelFamily; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "gpt", label: "GPT" },
];

export const TRANSIT_CHANNEL_TYPE_LABELS: Record<TransitChannelType, string> = {
  official_api: "官方 API",
  cloud: "云厂商",
  first_party_pool: "一手自建号池",
  reverse_engineered: "逆向",
  first_party_wholesale: "一手批发",
  reseller: "二级分销",
  mixed: "混合渠道",
  undisclosed: "未披露",
};

export const TRANSIT_ACCOUNT_POOL_LABELS: Record<TransitAccountPool, string> = {
  pro: "Pro",
  plus: "Plus",
  max: "Max",
  team: "Team",
  kiro: "Kiro",
  enterprise: "企业池",
  official_api: "官方 API",
  mixed: "混池",
  undisclosed: "未披露",
};

export const TRANSIT_RISK_LABELS: Record<TransitRiskLabel, string> = {
  sample_data: "样例数据",
  insufficient_samples: "样本不足",
  mixed_pool: "混池需确认",
  reseller: "二级分销",
  undisclosed_upstream: "上游未披露",
  third_party_aggregate: "第三方聚合",
  pending_feedback: "反馈待核验",
};

export const TRANSIT_USAGE_ADVICE_LABELS: Record<TransitUsageAdvice, string> = {
  try_small: "适合小额试用",
  cautious: "谨慎试用",
  not_recommended: "暂不建议",
  pending: "待核验",
};

export const TRANSIT_COMMERCIAL_LABELS: Record<TransitCommercialRelation, string> = {
  none: "无商业关系",
  listed: "免费收录",
  partner: "入驻",
  affiliate: "AFF",
  sponsored: "广告",
  unknown: "未知",
};

export const TRANSIT_COMMERCIAL_OFFER_TYPE_LABELS: Record<TransitCommercialOfferType, string> = {
  coupon: "用户优惠",
  affiliate: "AFF 链接",
  sponsored: "赞助权益",
};

export const TRANSIT_VERIFICATION_EVENT_SOURCE_LABELS: Record<TransitVerificationEventSource, string> = {
  priceai: "PriceAI 核验",
  official: "官方监测",
  user: "用户反馈",
  merchant: "商家提交",
};

export const TRANSIT_DATA_STATUS_LABELS: Record<TransitDataStatus, string> = {
  sample: "样例",
  pending_review: "待核验",
  verified: "已核验",
};

export const TRANSIT_STATION_STATUS_LABELS: Record<TransitStationStatus, string> = {
  active: "可用",
  limited: "受限",
  unavailable: "不可用",
  unknown: "未知",
};
