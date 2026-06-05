import type { ApiBillingMode, ApiPriceValue, ApiProviderType } from "@/lib/api-models";

export type OfferStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";
export type EffectiveOfferStatus =
  | "available"
  | "low_confidence"
  | "unavailable"
  | "stale"
  | "failed";
export type FreshnessStatus = "fresh" | "aging" | "stale" | "expired" | "failed";

export type CollectionMethod =
  | "public_json"
  | "browser"
  | "http"
  | "manual";

export type CollectorKind =
  | "auto"
  | "kami"
  | "dujiao"
  | "shopApi"
  | "xiaoheiwan"
  | "opensoraHtml"
  | "makerichHtml"
  | "beibeiHtml"
  | "ikunloveApi"
  | "getgptApi"
  | "genericHtml"
  | "browser"
  | "unsupported";

export type Source = {
  id: string;
  name: string;
  baseUrl?: string | null;
  entryUrl: string;
  collectionMethod: CollectionMethod;
  collectorKind?: CollectorKind | null;
  enabled: boolean;
  notes?: string | null;
  healthStatus?: "unknown" | "healthy" | "retrying" | "failing" | "partial" | null;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  consecutiveFailures?: number | null;
  lastError?: string | null;
  updatedAt?: string | null;
};

export type RawOffer = {
  id: string;
  sourceId?: string | null;
  sourceName: string;
  sourceStoreName?: string | null;
  sourceTitle: string;
  price: number | null;
  currency: string;
  status: OfferStatus;
  url: string;
  tags: string[];
  stockCount?: number | null;
  hidden?: boolean;
  canonicalProductId?: string | null;
  categorySlug?: string | null;
  capturedAt?: string | null;
  sourceUpdatedAt?: string | null;
  lastSeenAt?: string | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  sourcePriority?: number | null;
  confidence?: number | null;
  effectiveStatus?: EffectiveOfferStatus | null;
  freshnessStatus?: FreshnessStatus | null;
  lastFailedAt?: string | null;
  failureReason?: string | null;
};

export type CanonicalProduct = {
  id: string;
  slug: string;
  displayName: string;
  platform: string;
  productType: string;
  spec: string;
  summary: string;
  aliases: string[];
  updatedAt?: string | null;
};

export type ProductGroup = CanonicalProduct & {
  offers: RawOffer[];
  offerCount: number;
  inStockCount: number;
  outOfStockCount: number;
  lowestPrice: number | null;
  lowestPriceLabel: string;
  lowestPriceTone: "good" | "warn" | "info" | "muted" | "danger";
  lowestOffer: RawOffer | null;
  latestSeenAt: string | null;
  anomalyFlags: string[];
};

export type ExplorerProductSummary = Omit<ProductGroup, "offers"> & {
  offerSearchText: string;
};

export type ExplorerData = {
  generatedAt: string;
  configured: boolean;
  products: ExplorerProductSummary[];
  sources: Source[];
  offerTotal: number;
};

export type DashboardData = {
  generatedAt: string;
  configured: boolean;
  products: ProductGroup[];
  sources: Source[];
  rawOffers: RawOffer[];
};

export type AdminSummary = DashboardData & {
  isAuthenticated: boolean;
  rawOfferTotal: number;
  hiddenRawOfferTotal: number;
  crawlRuns: CrawlRun[];
  collectionJobs: CollectionJob[];
  officialPrices: OfficialSubscriptionAdminData;
  apiModels: ApiModelAdminData;
  pendingSubmissions: ChannelSubmission[];
  pendingOfferFeedback: OfferFeedback[];
  pendingSiteFeedback: SiteFeedback[];
  sourceOfferStats: SourceOfferStats[];
  hiddenRawOffers: RawOffer[];
};

export type SourceOfferStats = {
  sourceId: string;
  visibleCount: number;
  hiddenCount: number;
  manuallyHiddenCount: number;
  totalCount: number;
};

export type CrawlRun = {
  id: string;
  sourceId?: string | null;
  sourceName?: string | null;
  mode: CollectionMethod | "public_json_import" | "legacy_json_import";
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  successCount: number;
  failureCount: number;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type CollectionJob = {
  id: string;
  jobType: "all" | "source" | "official_prices";
  sourceId?: string | null;
  sourceName?: string | null;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  priority: number;
  attempts: number;
  maxAttempts: number;
  requestedBy?: string | null;
  lockedBy?: string | null;
  lockedUntil?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
  result?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type OfficialSubscriptionPriceStatus =
  | "available"
  | "stale"
  | "missing"
  | "parse_failed"
  | "needs_review";

export type OfficialSubscriptionAdminApp = {
  id: string;
  slug: string;
  displayName: string;
  provider: string;
  appStoreId: string;
  appStoreSlug: string;
  enabled: boolean;
  sortOrder: number;
};

export type OfficialSubscriptionAdminPlan = {
  id: string;
  appId: string;
  appSlug: string;
  slug: string;
  label: string;
  billingPeriod: "monthly" | "annual" | "one_time";
  enabled: boolean;
  sortOrder: number;
};

export type OfficialSubscriptionAdminRegion = {
  id: string;
  countryCode: string;
  storefrontCode: string;
  countryLabel: string;
  currencyCode: string;
  enabled: boolean;
  priority: number;
};

export type OfficialSubscriptionAdminPrice = {
  id: string;
  appSlug: string;
  appName: string;
  planSlug: string;
  planLabel: string;
  billingPeriod: "monthly" | "annual" | "one_time";
  countryCode: string;
  countryLabel: string;
  currencyCode: string | null;
  priceText: string | null;
  priceValue: number | null;
  cnyPrice: number | null;
  fxRateToCny: number | null;
  fxDate: string | null;
  sourceUrl: string;
  status: OfficialSubscriptionPriceStatus;
  rawTitle: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  failureReason: string | null;
};

export type OfficialSubscriptionCollectRun = {
  id: string;
  mode: "manual" | "cron" | "worker";
  targetAppSlug: string | null;
  targetRegionCodes: string[];
  status: "success" | "partial_success" | "failed";
  successCount: number;
  failureCount: number;
  unmatchedCount: number;
  startedAt: string;
  finishedAt: string;
  logs: Record<string, unknown>;
};

export type OfficialSubscriptionUnmatchedItem = {
  appSlug: string | null;
  countryCode: string | null;
  countryLabel: string | null;
  sourceUrl: string | null;
  rawTitle: string | null;
  priceText: string | null;
  reason: string | null;
};

export type OfficialSubscriptionAdminData = {
  configured: boolean;
  tableReady: boolean;
  source: "supabase" | "static";
  generatedAt: string;
  message: string | null;
  apps: OfficialSubscriptionAdminApp[];
  plans: OfficialSubscriptionAdminPlan[];
  regions: OfficialSubscriptionAdminRegion[];
  currentPrices: OfficialSubscriptionAdminPrice[];
  collectRuns: OfficialSubscriptionCollectRun[];
  unmatchedItems: OfficialSubscriptionUnmatchedItem[];
};

export type ApiModelAdminModel = {
  id: string;
  family: string;
  displayName: string;
  modelId: string;
  status: "active" | "inactive" | "needs_review";
  offerCount: number;
  providerCount: number;
  sourceUrl: string;
  sourceLabel: string;
  updatedAt: string;
};

export type ApiModelAdminProvider = {
  id: string;
  name: string;
  type: ApiProviderType;
  billingMode: ApiBillingMode;
  url: string;
  pricingUrl: string | null;
  logoUrl: string | null;
  enabled: boolean;
  offerCount: number;
  modelCount: number;
  planCount: number;
  limitSummary: string;
  limitations: string;
  sourceLabel: string;
  updatedAt: string;
};

export type ApiModelAdminPlan = {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  type: ApiProviderType;
  priceLabel: string;
  modelCount: number;
  enabled: boolean;
  quotaSummary: string;
  limitSummary: string;
  sourceUrl: string;
  sourceLabel: string;
  updatedAt: string;
};

export type ApiModelAdminOffer = {
  id: string;
  modelId: string;
  modelName: string;
  family: string;
  providerId: string;
  providerName: string;
  providerType: ApiProviderType;
  routeModelId: string | null;
  inputPrice: ApiPriceValue;
  outputPrice: ApiPriceValue;
  freeOrPlan: string;
  limitSummary: string;
  pricingUrl: string | null;
  sourceLabel: string;
  status: "active" | "inactive" | "needs_review";
  updatedAt: string;
};

export type ApiModelCollectRun = {
  id: string;
  providerId: string | null;
  providerName: string | null;
  collectorKind: string | null;
  status: "success" | "partial" | "failed";
  modelCount: number;
  offerCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ApiModelAdminData = {
  configured: boolean;
  tableReady: boolean;
  source: "supabase" | "static";
  generatedAt: string;
  message: string | null;
  models: ApiModelAdminModel[];
  providers: ApiModelAdminProvider[];
  plans: ApiModelAdminPlan[];
  offers: ApiModelAdminOffer[];
  collectRuns: ApiModelCollectRun[];
};

export type OfferInput = {
  sourceId?: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceStoreName?: string;
  sourceTitle: string;
  price?: number | null;
  currency?: string;
  status?: OfferStatus;
  url: string;
  tags?: string[];
  stockCount?: number | null;
};

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type OfferFeedbackStatus = "pending" | "resolved" | "ignored";
export type SiteFeedbackStatus = OfferFeedbackStatus;
export type OfferFeedbackReason =
  | "wrong_price"
  | "item_removed"
  | "stock_mismatch"
  | "fraud"
  | "wrong_category"
  | "bad_source"
  | "other";
export type SiteFeedbackType =
  | "feature"
  | "data"
  | "ux"
  | "channel"
  | "bug"
  | "other";

export type ChannelSubmission = {
  id: string;
  url: string;
  name: string | null;
  contact: string | null;
  notes: string | null;
  parsedTitle: string | null;
  parsedMeta: Record<string, unknown>;
  status: SubmissionStatus;
  reviewerNote: string | null;
  approvedSourceId: string | null;
  submitterIp: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type OfferFeedback = {
  id: string;
  productId: string | null;
  productSlug: string | null;
  productName: string | null;
  offerId: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceTitle: string | null;
  offerUrl: string | null;
  reason: OfferFeedbackReason;
  notes: string | null;
  contact: string | null;
  status: OfferFeedbackStatus;
  reviewerNote: string | null;
  submitterIp: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type SiteFeedback = {
  id: string;
  type: SiteFeedbackType;
  message: string;
  contact: string | null;
  pageUrl: string | null;
  status: SiteFeedbackStatus;
  reviewerNote: string | null;
  submitterIp: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
