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
  crawlRuns: CrawlRun[];
  pendingSubmissions: ChannelSubmission[];
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
