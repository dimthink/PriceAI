import type { ApiBillingMode, ApiPriceValue, ApiProviderType } from "@/lib/api-models";
import type { ApiTransitAdminData } from "@/lib/api-transit-admin-types";
import type { AdminPasswordStatus } from "@/lib/admin-auth";
import type { CommunitySettingsSummary } from "@/lib/community-settings-shared";
import type { SponsorSettingsSummary } from "@/lib/sponsor-settings-shared";

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
  | "publicProductsApi"
  | "shopUserProductsApi"
  | "unicornHtml"
  | "mooncakeCatalog"
  | "blackcatWholesale"
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
  createdAt?: string | null;
  shopCreatedAt?: string | null;
  updatedAt?: string | null;
};

export type RawOffer = {
  id: string;
  sourceId?: string | null;
  sourceName: string;
  sourceStoreName?: string | null;
  sourceIncludedAt?: string | null;
  sourceShopCreatedAt?: string | null;
  collectorKind?: CollectorKind | null;
  sourceTitle: string;
  price: number | null;
  listedPrice?: number | null;
  feeAmount?: number | null;
  priceBasis?: "settled" | "listed" | "listed_fallback" | null;
  currency: string;
  status: OfferStatus;
  url: string;
  tags: string[];
  filterTags?: string[];
  stockCount?: number | null;
  minOrderQuantity?: number | null;
  bulkPricingTiers?: OfferBulkPricingTier[];
  hidden?: boolean;
  canonicalProductId?: string | null;
  categorySlug?: string | null;
  storedCanonicalProductId?: string | null;
  storedCategorySlug?: string | null;
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
  riskFeedback?: PublicRiskFeedback | null;
};

export type OfferBulkPricingTier = {
  minQuantity: number;
  value?: number | null;
  discountType?: number | null;
  label?: string | null;
};

export type PublicRiskFeedback = {
  count: number;
  offerCount?: number;
  sourceCount?: number;
  scope: "offer" | "source" | "mixed";
  latestAt: string | null;
  reasons?: Array<Extract<OfferFeedbackReason, "description_mismatch" | "aftersales_shipping" | "fraud" | "bad_source">>;
  summaries?: string[];
  offerSummaries?: string[];
  sourceSummaries?: string[];
  status?: "user_report_pending_verification";
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
  warrantyLowestPrice: number | null;
  warrantyLowestOffer: RawOffer | null;
  warrantyOfferCount: number;
  latestSeenAt: string | null;
  anomalyFlags: string[];
};

export type PublicOfferSummary = Pick<
  RawOffer,
  | "id"
  | "sourceId"
  | "sourceName"
  | "sourceStoreName"
  | "collectorKind"
  | "sourceTitle"
  | "price"
  | "currency"
  | "status"
  | "url"
  | "minOrderQuantity"
  | "bulkPricingTiers"
>;

export type ExplorerProductSummary = Omit<ProductGroup, "offers" | "lowestOffer" | "warrantyLowestOffer"> & {
  lowestOffer: PublicOfferSummary | null;
  warrantyLowestOffer: PublicOfferSummary | null;
  offerSearchText: string;
};

export type MerchantCollectorGroup = "shopApi" | "dujiao" | "kami" | "other";
export type MerchantCollectorPlatformFilter = "liandongShop" | "yunmaoConsignment" | "qxvx";
export type MerchantCollectorFilter = "all" | MerchantCollectorGroup | MerchantCollectorPlatformFilter;

export type PublicMerchantSummary = {
  id: string;
  sourceId?: string | null;
  name: string;
  storeName?: string | null;
  sourceName: string;
  entryUrl: string;
  shopUrl?: string | null;
  host?: string | null;
  collectorKind?: CollectorKind | null;
  collectorGroup: MerchantCollectorGroup;
  collectorLabel: string;
  healthStatus?: Source["healthStatus"] | null;
  lastSuccessAt?: string | null;
  consecutiveFailures?: number | null;
  productCount: number;
  offerCount: number;
  inStockCount: number;
  outOfStockCount: number;
  platformCount: number;
  platforms: string[];
  productTypes: string[];
  lowestHitCount: number;
  warrantyLowestHitCount: number;
  riskFeedbackCount: number;
  latestSeenAt: string | null;
  observationStartedAt: string | null;
  includedAt?: string | null;
  shopCreatedAt?: string | null;
  representativeProduct?: string | null;
  representativeOfferTitle?: string | null;
  representativePrice?: number | null;
  representativeCurrency?: string | null;
  hasPlatformAftersalesMechanism: boolean;
};

export type ExplorerData = {
  generatedAt: string;
  configured: boolean;
  degraded?: boolean;
  message?: string | null;
  products: ExplorerProductSummary[];
  sources: Source[];
  offerTotal: number;
};

export type DashboardData = {
  generatedAt: string;
  configured: boolean;
  degraded?: boolean;
  message?: string | null;
  products: ProductGroup[];
  sources: Source[];
  rawOffers: RawOffer[];
};

export type AdminSummary = DashboardData & {
  isAuthenticated: boolean;
  loadErrors: AdminLoadError[];
  rawOfferTotal: number;
  hiddenRawOfferTotal: number;
  hiddenOfferDiagnostics: HiddenOfferDiagnostics;
  crawlRuns: CrawlRun[];
  collectionJobs: CollectionJob[];
  collectorHealth: CollectorHealthSummary;
  collectionMonitoring: CollectionMonitoringSummary;
  sourceQuality: SourceQualitySummary;
  officialPrices: OfficialSubscriptionAdminData;
  apiModels: ApiModelAdminData;
  apiTransit: ApiTransitAdminData;
  pendingSubmissions: ChannelSubmission[];
  pendingOfferFeedback: OfferFeedback[];
  pendingSiteFeedback: SiteFeedback[];
  sourceOfferStats: SourceOfferStats[];
  hiddenRawOffers: RawOffer[];
  feedbackRawOffers: RawOffer[];
  riskReviewSettings: RiskReviewSettingsSummary;
  sponsorSettings: SponsorSettingsSummary;
  communitySettings: CommunitySettingsSummary;
  passwordStatus: AdminPasswordStatus;
};

export type HiddenOfferDiagnostics = {
  visibleTotal: number;
  hiddenTotal: number;
  manualHiddenTotal: number;
  systemHiddenTotal: number;
  legacyHiddenTotal: number;
  pendingMissingCandidateTotal: number;
};

export type AdminCollectorStatus = {
  generatedAt: string;
  crawlRuns: CrawlRun[];
  collectorHealth: CollectorHealthSummary;
  latestCrawlAt: string | null;
  latestSuccessfulCrawlAt: string | null;
  latestCrawlStatus: CrawlRun["status"] | null;
};

export type RiskReviewSettingsSummary = {
  configured: boolean;
  tableReady: boolean;
  source: "database" | "environment" | "default" | "unconfigured";
  provider: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  updatedAt: string | null;
  message: string | null;
};

export type AdminLoadError = {
  key: string;
  label: string;
  message: string;
};

export type SourceOfferStats = {
  sourceId: string;
  visibleCount: number;
  hiddenCount: number;
  manuallyHiddenCount: number;
  collectorFailureCount: number;
  totalCount: number;
};

export type SourceQualityQueueKind =
  | "priority_keep"
  | "valuable_lead"
  | "needs_review"
  | "low_quality_candidate"
  | "duplicate_or_no_advantage"
  | "collection_environment_issue"
  | "downfrequency_candidate"
  | "disable_candidate";

export type SourceQualityEvidence = {
  visibleCount: number;
  hiddenCount: number;
  manuallyHiddenCount: number;
  collectorFailureCount: number;
  totalCount: number;
  purchaseClicks: number;
  sampleFrontRankOfferCount: number;
  successAgeMinutes: number | null;
  checkedAgeMinutes: number | null;
  sourceAgeDays: number | null;
  consecutiveFailures: number;
  healthStatus: Source["healthStatus"];
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  latestJobStatus: CollectionJob["status"] | null;
  latestJobAt: string | null;
  latestRunStatus: CrawlRun["status"] | null;
  latestRunAt: string | null;
  latestError: string | null;
};

export type SourceQualitySource = {
  sourceId: string;
  kind: SourceQualityQueueKind;
  label: string;
  tone: "default" | "info" | "warn" | "success" | "danger" | "muted";
  score: number;
  reasons: string[];
  nextAction: string;
  evidence: SourceQualityEvidence;
};

export type SourceQualitySegment = {
  kind: SourceQualityQueueKind;
  label: string;
  description: string;
  count: number;
  visibleOfferCount: number;
  purchaseClicks: number;
  sampleFrontRankOfferCount: number;
  topSources: SourceQualitySource[];
};

export type SourceQualitySummary = {
  generatedAt: string;
  behaviorWindowDays: number;
  sourceCount: number;
  segments: SourceQualitySegment[];
  sources: SourceQualitySource[];
};

export type CrawlRun = {
  id: string;
  sourceId?: string | null;
  sourceName?: string | null;
  mode: CollectionMethod | "public_json_import" | "legacy_json_import";
  status: "success" | "partial" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string | null;
  successCount: number;
  failureCount: number;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type CollectionJob = {
  id: string;
  jobType:
    | "all"
    | "source"
    | "official_prices"
    | "api_models"
    | "api_transit_public_pricing";
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

export type CollectorNodeInfo = {
  id: string;
  name: string;
  type?: string | null;
  runtime?: string | null;
  region?: string | null;
};

export type CollectorHeartbeatStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "idle"
  | "unknown";

export type CollectorHeartbeat = {
  node: CollectorNodeInfo;
  scope?: string | null;
  status: CollectorHeartbeatStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastSeenAt: string;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  offerCount: number;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type CollectorHealthTone = "success" | "info" | "warn" | "danger" | "muted";

export type CollectorHealthSource = {
  id: string;
  name: string;
  host: string;
  collectorKind: string;
  enabled: boolean;
  status: "fresh" | "aging" | "stale" | "critical" | "never" | "disabled";
  tone: CollectorHealthTone;
  ageMinutes: number | null;
  lastSuccessAt?: string | null;
  lastCheckedAt?: string | null;
  consecutiveFailures?: number | null;
  lastError?: string | null;
  checkAgeMinutes: number | null;
  isAttemptStale: boolean;
};

export type CollectorHealthKindSummary = {
  kind: string;
  label: string;
  total: number;
  fresh: number;
  aging: number;
  stale: number;
  critical: number;
  never: number;
  failed: number;
  recentAttempts: number;
  staleAttempts: number;
  latestSuccessAt?: string | null;
  latestAgeMinutes: number | null;
};

export type CollectorHealthNodeSummary = {
  node: CollectorNodeInfo;
  scope?: string | null;
  status: CollectorHeartbeatStatus;
  health: "online" | "quiet" | "stale" | "down" | "unknown";
  tone: CollectorHealthTone;
  lastSeenAt?: string | null;
  lastRunAt?: string | null;
  ageMinutes: number | null;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  offerCount: number;
  message?: string | null;
  failureKind?: "source" | "writeback" | "task_fetch" | "node" | "unknown";
};

export type CollectorHealthRunSummary = {
  id: string;
  sourceId?: string | null;
  sourceName?: string | null;
  status: CrawlRun["status"];
  collector?: string | null;
  node: CollectorNodeInfo;
  finishedAt?: string | null;
  ageMinutes: number | null;
  successCount: number;
  failureCount: number;
  message?: string | null;
};

export type CollectorHealthSummary = {
  generatedAt: string;
  overall: {
    status: "healthy" | "warning" | "critical";
    tone: CollectorHealthTone;
    label: string;
    totalSources: number;
    enabledSources: number;
    freshSources: number;
    agingSources: number;
    staleSources: number;
    criticalSources: number;
    failedSources: number;
    writebackFailures: number;
    taskFetchFailures: number;
    nodeFailures: number;
    recentlyCheckedSources: number;
    staleCheckSources: number;
    latestSuccessAt?: string | null;
    latestAgeMinutes: number | null;
    onlineNodes: number;
    staleNodes: number;
    downNodes: number;
  };
  kindSummaries: CollectorHealthKindSummary[];
  nodeSummaries: CollectorHealthNodeSummary[];
  sources: CollectorHealthSource[];
  staleSources: CollectorHealthSource[];
  recentFailures: CollectorHealthRunSummary[];
  recentRuns: CollectorHealthRunSummary[];
  heartbeats: CollectorHeartbeat[];
};

export type CollectionMonitoringFreshnessBand =
  | "fresh_30"
  | "fresh_60"
  | "fresh_120"
  | "stale_360"
  | "stale_over_360"
  | "never";

export type CollectionMonitoringSource = {
  id: string;
  name: string;
  host: string;
  collectorKind: string;
  enabled: boolean;
  healthStatus: Source["healthStatus"];
  freshnessBand: CollectionMonitoringFreshnessBand;
  lastSuccessAt?: string | null;
  lastCheckedAt?: string | null;
  successAgeMinutes: number | null;
  checkedAgeMinutes: number | null;
  consecutiveFailures: number;
  lastError?: string | null;
  latestJobStatus?: CollectionJob["status"] | null;
  latestJobAt?: string | null;
  latestJobError?: string | null;
};

export type CollectionMonitoringBehaviorStatus = "ok" | "unconfigured" | "error";

export type CollectionMonitoringBehaviorProperty = {
  propertyName: string;
  label: string;
  required: boolean;
  observedValueCount: number;
  topValues: Array<{
    value: string;
    count: number;
  }>;
};

export type CollectionMonitoringBehaviorEvent = {
  eventName: string;
  label: string;
  required: boolean;
  status: "tracked" | "missing" | "unknown";
  total: number;
  properties: CollectionMonitoringBehaviorProperty[];
};

export type CollectionMonitoringSourceHeat = {
  sourceId: string;
  sourceName: string;
  host: string;
  purchaseClicks: number;
  freshnessBand: CollectionMonitoringFreshnessBand;
  lastSuccessAt?: string | null;
  successAgeMinutes: number | null;
  healthStatus: Source["healthStatus"];
  consecutiveFailures: number;
  lastError?: string | null;
};

export type CollectionMonitoringFailureReason = {
  key: "challenge" | "http_500" | "timeout" | "no_offers" | "lock_expired" | "other";
  label: string;
  count: number;
  latestMessage?: string | null;
};

export type CollectionMonitoringSummary = {
  generatedAt: string;
  scopeLabel: string;
  collectorKind: string;
  sourceCount: number;
  enabledSourceCount: number;
  freshness: {
    targetMinutes: number;
    within30: number;
    within60: number;
    within120: number;
    within360: number;
    staleOver360: number;
    never: number;
    coverage30Percent: number;
    coverage60Percent: number;
    coverage120Percent: number;
  };
  health: {
    healthy: number;
    retrying: number;
    failing: number;
    partial: number;
    unknown: number;
  };
  recentJobs: {
    windowHours: number;
    total: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
    staleLocked: number;
    lockExpiredFailures: number;
  };
  behavior: {
    provider: "umami";
    status: CollectionMonitoringBehaviorStatus;
    configured: boolean;
    baseUrl: string | null;
    websiteId: string | null;
    windowDays: number;
    startAt: string;
    endAt: string;
    message: string | null;
    events: CollectionMonitoringBehaviorEvent[];
    totals: {
      trackedEventCount: number;
      missingEventCount: number;
      productDetailOpens: number;
      platformProductDetailOpens: number;
      purchaseLinkClicks: number;
      platformFilterChanges: number;
      scopeChanges: number;
    };
    sourceHeat: CollectionMonitoringSourceHeat[];
    hotStaleSources: CollectionMonitoringSourceHeat[];
    hotFailedSources: CollectionMonitoringSourceHeat[];
  };
  recentRuns: {
    windowHours: number;
    total: number;
    success: number;
    partial: number;
    failed: number;
    skipped: number;
    successRatePercent: number;
  };
  failureReasons: CollectionMonitoringFailureReason[];
  problemSources: CollectionMonitoringSource[];
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
  contextWindow: string | null;
  description: string;
  status: "active" | "inactive" | "needs_review";
  offerCount: number;
  providerCount: number;
  sourceUrl: string;
  sourceLabel: string;
  capabilities: string[];
  suitableTools: string[];
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
  description: string;
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
  priceUsdMonthly: number | null;
  priceCnyMonthly: number | null;
  modelCount: number;
  modelIds: string[];
  enabled: boolean;
  quotaSummary: string;
  resetSummary: string;
  limitSummary: string;
  limitations: string;
  coverageLabel: string | null;
  compatibility: string[];
  suitableTools: string[];
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
  cacheReadPrice: ApiPriceValue | null;
  cacheWritePrice: ApiPriceValue | null;
  freeOrPlan: string;
  limitSummary: string;
  limitations: string;
  compatibility: string[];
  suitableTools: string[];
  pricingUrl: string | null;
  sourceLabel: string;
  status: "active" | "inactive" | "needs_review";
  notes: string | null;
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

export type ApiProviderCandidateStatus =
  | "candidate"
  | "needs_review"
  | "collector_todo"
  | "supported"
  | "blocked";

export type ApiProviderCandidate = {
  id: string;
  name: string;
  type: ApiProviderType;
  billingMode: ApiBillingMode;
  url: string;
  pricingUrl: string | null;
  logoUrl: string | null;
  status: ApiProviderCandidateStatus;
  priority: "high" | "medium" | "low";
  evidenceStatus: "verified_url" | "needs_pricing_parse" | "needs_official_source" | "not_supported";
  sourceLabel: string;
  reason: string;
  nextStep: string;
  notes: string;
  updatedAt: string;
};

export type ApiProviderSubmissionStatus = "pending" | "approved" | "collector_todo" | "rejected";

export type ApiProviderSubmissionParseStatus =
  | "pending"
  | "matched_existing"
  | "parsed"
  | "needs_review"
  | "invalid";

export type ApiProviderSubmission = {
  id: string;
  submittedUrl: string;
  submittedName: string | null;
  submittedContact: string | null;
  submittedNote: string | null;
  parsedProviderUrl: string | null;
  parsedProviderName: string | null;
  parsedType: ApiProviderType | null;
  parseStatus: ApiProviderSubmissionParseStatus;
  probeStatus: "pending" | "success" | "failed" | "unsupported";
  reviewStatus: ApiProviderSubmissionStatus;
  adminNote: string | null;
  providerId: string | null;
  parsedMeta: Record<string, unknown>;
  submitterIp: string | null;
  createdAt: string;
  updatedAt: string;
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
  providerCandidates: ApiProviderCandidate[];
  providerSubmissions: ApiProviderSubmission[];
};

export type OfferInput = {
  sourceId?: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceStoreName?: string;
  sourceShopCreatedAt?: string | null;
  sourceTitle: string;
  price?: number | null;
  listedPrice?: number | null;
  feeAmount?: number | null;
  priceBasis?: "settled" | "listed" | "listed_fallback" | null;
  currency?: string;
  status?: OfferStatus;
  effectiveStatus?: EffectiveOfferStatus | null;
  freshnessStatus?: FreshnessStatus | null;
  failureReason?: string | null;
  url: string;
  tags?: string[];
  stockCount?: number | null;
  minOrderQuantity?: number | null;
  bulkPricingTiers?: OfferBulkPricingTier[];
};

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type OfferFeedbackStatus = "pending" | "resolved" | "ignored";
export type SiteFeedbackStatus = OfferFeedbackStatus;
export type OfferFeedbackScope = "offer" | "merchant";
export type OfferFeedbackPublicStatus =
  | "not_public"
  | "pending_review"
  | "public"
  | "withdrawn";
export const offerFeedbackReasonValues = [
  "wrong_price",
  "item_removed",
  "stock_mismatch",
  "wrong_category",
  "description_mismatch",
  "aftersales_shipping",
  "fraud",
  "bad_source",
  "other",
] as const;
export type OfferFeedbackReason = (typeof offerFeedbackReasonValues)[number];
export type OfferFeedbackUserExpectedAction =
  | "recheck"
  | "hide_offer"
  | "hide_source"
  | "unsure";
export type OfferFeedbackSuggestedAction =
  | "recollect"
  | "reclassify"
  | "hide_offer"
  | "hide_source"
  | "todo"
  | "ignore";
export type OfferFeedbackVerificationStatus =
  | "not_needed"
  | "pending"
  | "running"
  | "auto_fixed"
  | "recollection_created"
  | "manual_review"
  | "failed";
export type OfferFeedbackVerificationResult =
  | "offer_changed"
  | "item_removed"
  | "out_of_stock"
  | "still_available"
  | "recollection_created"
  | "inconclusive"
  | "blocked";
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
  feedbackScope: OfferFeedbackScope;
  productId: string | null;
  productSlug: string | null;
  productName: string | null;
  offerId: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceTitle: string | null;
  offerUrl: string | null;
  offerPrice: number | null;
  offerCurrency: string | null;
  offerStatus: OfferStatus | null;
  offerCapturedAt: string | null;
  offerSourceUpdatedAt: string | null;
  offerLastSeenAt: string | null;
  reason: OfferFeedbackReason;
  userExpectedAction: OfferFeedbackUserExpectedAction;
  suggestedAction: OfferFeedbackSuggestedAction;
  evidenceText: string | null;
  evidenceUrls: string[];
  aiReviewResult: Record<string, unknown> | null;
  riskPrecheck: OfferFeedbackRiskPrecheck | null;
  verificationStatus: OfferFeedbackVerificationStatus;
  verificationResult: OfferFeedbackVerificationResult | null;
  verifiedAt: string | null;
  verificationMessage: string | null;
  createdCollectionJobId: string | null;
  notes: string | null;
  contact: string | null;
  status: OfferFeedbackStatus;
  publicStatus: OfferFeedbackPublicStatus;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  reviewerNote: string | null;
  submitterIp: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type FeedbackFollowup = {
  id: string;
  feedbackId: string;
  userId: string | null;
  role: "user" | "admin";
  message: string;
  evidenceUrls: string[];
  createdAt: string;
};

export type TransitDetectorJobStatus = "queued" | "running" | "done" | "error";

export type TransitDetectorJob = {
  id: string;
  userId: string;
  userEmail: string | null;
  protocol: string;
  baseUrl: string | null;
  targetModel: string;
  intensity: string;
  includeLongContext: boolean;
  upstreamType: string | null;
  status: TransitDetectorJobStatus;
  detectorJobId: string | null;
  statusUrl: string | null;
  resultUrl: string | null;
  jsonUrl: string | null;
  imageUrl: string | null;
  errorMessage: string | null;
  submittedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type OfferFeedbackRiskPrecheck = {
  status: "ready" | "skipped" | "failed";
  provider: string;
  model: string;
  reviewedAt: string;
  canShowPublicly: boolean;
  riskLevel: "low" | "medium" | "high";
  riskScope: "offer" | "source" | "mixed";
  riskCategory: Extract<OfferFeedbackReason, "description_mismatch" | "aftersales_shipping" | "fraud" | "bad_source">;
  confidence: number;
  abuseRisk: "low" | "medium" | "high";
  evidenceQuality: "none" | "low" | "medium" | "high";
  publicSummary: string;
  offerSummary?: string | null;
  offerPublicSummary?: string | null;
  sourceCanShowPublicly?: boolean;
  sourcePublicSummary?: string | null;
  imageEvidenceCount?: number;
  imageEvidenceUsedCount?: number;
  publicHidden?: boolean;
  publicHiddenAt?: string | null;
  publicHiddenReason?: string | null;
  privateReason: string;
  expiresAt: string | null;
  error?: string;
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
