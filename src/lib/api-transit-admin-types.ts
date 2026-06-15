export type ApiTransitAdminLoadError = {
  key: string;
  label: string;
  message: string;
};

export type ApiTransitStationStatus = "active" | "limited" | "unavailable" | "unknown";
export type ApiTransitDataStatus = "sample" | "pending_review" | "verified";
export type ApiTransitUsageAdvice = "try_small" | "cautious" | "not_recommended" | "pending";
export type ApiTransitCollectionStatus = "pending" | "success" | "partial" | "failed" | "manual_review";
export type ApiTransitOfferStatus = "active" | "needs_review" | "inactive";
export type ApiTransitSubmissionReviewStatus = "pending" | "collector_todo" | "approved" | "rejected";
export type ApiTransitSubmissionType = "user" | "merchant";
export type ApiTransitProbeStatus = "pending" | "public_pricing_found" | "needs_login" | "failed";
export type ApiTransitParseStatus = "pending" | "parsed" | "failed";
export type ApiTransitRunStatus = "success" | "partial" | "failed";

export type ApiTransitAdminStation = {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  apiBaseUrl: string | null;
  pricingUrl: string | null;
  status: ApiTransitStationStatus;
  sourceType: string;
  commercialRelation: string;
  summary: string;
  channelTypes: string[];
  accountPools: string[];
  riskLabels: string[];
  usageAdvice: ApiTransitUsageAdvice;
  dataStatus: ApiTransitDataStatus;
  collectorKind: string;
  collectionStatus: ApiTransitCollectionStatus;
  collectionError: string | null;
  lastCollectedAt: string | null;
  lastUpdatedAt: string | null;
  published: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string | null;
  offerCount: number;
  activeOfferCount: number;
  pendingOfferCount: number;
  inactiveOfferCount: number;
  latestRunStatus: ApiTransitRunStatus | null;
  latestRunAt: string | null;
};

export type ApiTransitAdminOffer = {
  id: string;
  stationId: string;
  stationName: string;
  stationPublished: boolean;
  family: string;
  standardModel: string;
  rawModelName: string;
  groupName: string;
  rechargeRatio: string | null;
  modelMultiplier: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
  currency: string;
  accountPool: string;
  channelType: string;
  priceSource: string;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  status: ApiTransitOfferStatus;
  createdAt: string;
  updatedAt: string | null;
};

export type ApiTransitOfferCandidate = {
  id: string;
  stationId: string;
  stationName: string;
  stationPublished: boolean;
  family: string;
  standardModel: string;
  representativeOfferId: string;
  rawOfferIds: string[];
  rawOfferCount: number;
  groupName: string;
  rechargeRatio: string | null;
  modelMultiplier: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
  currency: string;
  accountPool: string;
  channelType: string;
  priceSource: string;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  status: ApiTransitOfferStatus;
  candidateScore: number;
  reviewReason: string;
  qualityFlags: string[];
  hiddenRawCount: number;
};

export type ApiTransitAdminSubmission = {
  id: string;
  submissionType: ApiTransitSubmissionType;
  submittedUrl: string;
  submittedName: string | null;
  apiBaseUrl: string | null;
  pricingUrl: string | null;
  contact: string | null;
  notes: string | null;
  submittedModels: string[];
  parseStatus: ApiTransitParseStatus;
  probeStatus: ApiTransitProbeStatus;
  reviewStatus: ApiTransitSubmissionReviewStatus;
  stationId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ApiTransitAdminRun = {
  id: string;
  stationId: string | null;
  stationName: string | null;
  runType: string;
  status: ApiTransitRunStatus;
  modelCount: number;
  offerCount: number;
  errorMessage: string | null;
  sourceUrl: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ApiTransitAdminMetrics = {
  totalStations: number;
  publishedStations: number;
  pendingStations: number;
  totalOffers: number;
  activeOffers: number;
  pendingOffers: number;
  candidateOffers: number;
  pendingSubmissions: number;
  successfulRuns: number;
  failedRuns: number;
};

export type ApiTransitAdminData = {
  isAuthenticated: boolean;
  configured: boolean;
  generatedAt: string;
  loadErrors: ApiTransitAdminLoadError[];
  metrics: ApiTransitAdminMetrics;
  stations: ApiTransitAdminStation[];
  offers: ApiTransitAdminOffer[];
  offerCandidates: ApiTransitOfferCandidate[];
  submissions: ApiTransitAdminSubmission[];
  runs: ApiTransitAdminRun[];
};
