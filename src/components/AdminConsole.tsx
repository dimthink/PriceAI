"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Clock,
  Database,
  EyeOff,
  Trash2,
  ExternalLink,
  FileInput,
  Flag,
  History,
  Inbox,
  ImageUp,
  KeyRound,
  Loader2,
  Megaphone,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Store,
  ArrowDown,
  ArrowUp,
  TerminalSquare,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dispatch, FormEvent, ReactNode, SetStateAction, UIEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiTransitAdminPanel } from "@/components/ApiTransitAdminConsole";
import { apiProviderTypeLabels } from "@/lib/api-models";
import { classifyOffer } from "@/lib/catalog";
import {
  collectorKindLabel,
  collectorKindOptions,
  inferCollectorKindFromHost,
  isCollectorKind,
  knownAutoCollectorHosts as createKnownAutoCollectorHosts,
} from "@/lib/collector-registry";
import { sponsorAssetDisplayUrl } from "@/lib/sponsor-asset-url";
import {
  SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH,
  sponsorCreativeDisclosureLabel,
  sponsorDisclosureLabelOptions,
  sponsorPlacementLabels,
  type SponsorCreative,
} from "@/lib/sponsor-settings-shared";
import type {
  AdminCollectorStatus,
  AdminSummary,
  ChannelSubmission,
  CollectionJob,
  CollectionMethod,
  CollectorKind,
  CrawlRun,
  OfferFeedback,
  OfferFeedbackStatus,
  OfferStatus,
  RawOffer,
  SiteFeedback,
  SiteFeedbackStatus,
  Source,
  SourceOfferStats,
} from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

/* ─── Types ─── */

type Message = {
  type: "success" | "error" | "info";
  text: string;
};

type AdminProduct = AdminSummary["products"][number];
type OfferMaintenanceScope = "visible" | "hidden";
type OfferMaintenanceListState = {
  offers: RawOffer[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;
};
type OfficialAdminData = AdminSummary["officialPrices"];
type OfficialAdminApp = OfficialAdminData["apps"][number];
type OfficialAdminPlan = OfficialAdminData["plans"][number];
type OfficialAdminRegion = OfficialAdminData["regions"][number];
type OfficialAdminPrice = OfficialAdminData["currentPrices"][number];
type OfficialAdminRun = OfficialAdminData["collectRuns"][number];
type ApiModelAdminData = AdminSummary["apiModels"];
type ApiModelAdminProvider = ApiModelAdminData["providers"][number];
type ApiModelAdminOffer = ApiModelAdminData["offers"][number];
type ApiModelAdminPlan = ApiModelAdminData["plans"][number];
type ApiModelAdminModel = ApiModelAdminData["models"][number];
type ApiProviderCandidate = ApiModelAdminData["providerCandidates"][number];
type ApiProviderSubmission = ApiModelAdminData["providerSubmissions"][number];
type RiskReviewSettings = AdminSummary["riskReviewSettings"];
type SponsorSettings = AdminSummary["sponsorSettings"];
type PasswordStatus = AdminSummary["passwordStatus"];
type CollectorHealthData = AdminSummary["collectorHealth"];
type CollectorHealthSourceRow = CollectorHealthData["sources"][number];
type CollectorHealthNodeRow = CollectorHealthData["nodeSummaries"][number];
type CollectorHealthRunRow = CollectorHealthData["recentRuns"][number];
type ApiModelEditableTarget = "model" | "provider" | "plan" | "offer";
type ApiModelEditablePayload = Record<string, unknown> & {
  target: ApiModelEditableTarget;
  id: string;
};
type PasswordDraft = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};
type BadgeTone = "default" | "info" | "warn" | "success" | "danger" | "muted";
type CollectorStatusState = Pick<
  AdminCollectorStatus,
  "generatedAt" | "crawlRuns" | "collectorHealth" | "latestCrawlAt" | "latestSuccessfulCrawlAt" | "latestCrawlStatus"
> & {
  loading: boolean;
  error: string | null;
};

const ADMIN_LIST_PREVIEW_ROWS = 8;
const ADMIN_COLLECTOR_STATUS_REFRESH_MS = 60_000;

type ProbeOffer = {
  sourceStoreName?: string | null;
  sourceTitle: string;
  price: number | null;
  currency: string;
  status: OfferStatus;
  url: string;
  tags?: string[];
  stockCount?: number | null;
};

type ProbeResult = {
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  baseUrl?: string;
  kind: string | null;
  status: "success" | "empty" | "failed" | "unsupported";
  offerCount: number;
  offers: ProbeOffer[];
  ms?: number;
  message?: string;
  finishedAt?: string;
};

type SubmissionProductPreview = {
  title?: string;
  sourceName?: string;
  sourceUrl?: string;
  price?: number;
  realPrice?: number;
  currency?: string;
  status?: string;
  statusText?: string;
  category?: string;
  descriptionPreview?: string;
  apiMessage?: string;
  checkedAt?: string;
};

type OfficialProbeResult = {
  ok: boolean;
  message?: string;
  result?: {
    run?: {
      status?: string;
      availableCount?: number;
      missingCount?: number;
      needsReviewCount?: number;
      unmatchedCount?: number;
      failureCount?: number;
    };
    database?: {
      status?: string;
      currentRows?: number;
      snapshots?: number;
      fxRates?: number;
    };
  };
};

type ApiModelProbeResult = {
  ok: boolean;
  message?: string;
  result?: {
    scope?: {
      providers?: string[];
      providerCount?: number;
      modelCount?: number;
      planCount?: number;
      offerCount?: number;
      urlProbeCount?: number;
    };
    run?: {
      status?: string;
      providerCount?: number;
      successfulProviderCount?: number;
      failedProviderCount?: number;
      partialProviderCount?: number;
      modelCount?: number;
      planCount?: number;
      offerCount?: number;
      urlProbeCount?: number;
      okUrlCount?: number;
      skippedUrlCount?: number;
      failedUrlCount?: number;
      firstError?: string | null;
    };
  };
};

type AdminTab = "review" | "todo" | "feedback" | "sponsors" | "security" | "history" | "collect" | "health" | "official" | "apiModels" | "apiTransit" | "sources" | "manual" | "logs";

type RowFeedback = {
  id: string;
  type: "success" | "error" | "info";
  text: string;
};

type SourceGroup = {
  key: string;
  label: string;
  sources: Source[];
  normalCount: number;
  abnormalCount: number;
  disabledCount: number;
};

type SourceStatusFilter = "all" | "normal" | "issue" | "disabled" | "needs_collector";
type SourceOfferFilter = "all" | "zero" | "small" | "medium" | "large";
type SourceSortMode = "offers_desc" | "issue_first" | "stale_first" | "hidden_desc" | "name";
type SourceRiskFlag = "high_volume" | "hidden_many" | "collector_failures" | "issue" | "stale_success";

type SourceFilters = {
  query: string;
  status: SourceStatusFilter;
  offerBand: SourceOfferFilter;
  sort: SourceSortMode;
  riskOnly: boolean;
};

type SourceGroupOverview = SourceGroup & {
  totalVisibleOffers: number;
  totalHiddenOffers: number;
  totalManuallyHiddenOffers: number;
  totalCollectorFailureOffers: number;
  riskCount: number;
};

const statusOptions: Array<[OfferStatus, string]> = [
  ["in_stock", "有货"],
  ["out_of_stock", "缺货"],
];

const OFFER_EMERGENCY_PAGE_SIZE = 50;

type FeedbackWorkFilter = "all" | "precheck" | "transient" | "category" | "aftersales" | "high_risk" | "site";
type OfferFeedbackBucket = "transient" | "category" | "high_risk" | "aftersales" | "other";
type OfferFeedbackVerdictTone = "success" | "info" | "warn" | "danger";
type OfferFeedbackRiskPrecheckResult = NonNullable<OfferFeedback["riskPrecheck"]>;
type OfferFeedbackVerdict = {
  label: string;
  description: string;
  tone: OfferFeedbackVerdictTone;
  batchSafe: boolean;
};

const feedbackStatusOptions: Array<{ value: OfferFeedbackStatus; label: string }> = [
  { value: "pending", label: "待处理" },
  { value: "resolved", label: "已处理" },
  { value: "ignored", label: "已忽略" },
];

const DEFAULT_RISK_REVIEW_ADMIN_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_RISK_REVIEW_ADMIN_MODEL = "mimo-v2.5";

/* ─── Main Component ─── */

export function AdminConsole({ data }: { data: AdminSummary }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [optimisticAuthed, setOptimisticAuthed] = useState(false);
  const authed = data.isAuthenticated || optimisticAuthed;
  const [globalMessage, setGlobalMessage] = useState<Message | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<ChannelSubmission[]>(data.pendingSubmissions || []);
  const [offerFeedback, setOfferFeedback] = useState<OfferFeedback[]>(data.pendingOfferFeedback || []);
  const [feedbackRawOffers, setFeedbackRawOffers] = useState<RawOffer[]>(data.feedbackRawOffers || []);
  const [siteFeedback, setSiteFeedback] = useState<SiteFeedback[]>(data.pendingSiteFeedback || []);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<OfferFeedbackStatus>("pending");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackWorkFilter>("all");
  const [pendingOfferFeedbackCount, setPendingOfferFeedbackCount] = useState((data.pendingOfferFeedback || []).length);
  const [pendingSiteFeedbackCount, setPendingSiteFeedbackCount] = useState((data.pendingSiteFeedback || []).length);
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<Set<string>>(new Set());
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
  const [officialProbeResult, setOfficialProbeResult] = useState<OfficialProbeResult | null>(null);
  const [apiModelProbeResult, setApiModelProbeResult] = useState<ApiModelProbeResult | null>(null);
  const [officialAppPatches, setOfficialAppPatches] = useState<Record<string, Partial<OfficialAdminApp>>>({});
  const [officialPlanPatches, setOfficialPlanPatches] = useState<Record<string, Partial<OfficialAdminPlan>>>({});
  const [officialRegionPatches, setOfficialRegionPatches] = useState<Record<string, Partial<OfficialAdminRegion>>>({});
  const [officialPricePatches, setOfficialPricePatches] = useState<Record<string, Partial<OfficialAdminPrice>>>({});
  const [apiModelPatches, setApiModelPatches] = useState<Record<string, Partial<ApiModelAdminModel>>>({});
  const [apiProviderPatches, setApiProviderPatches] = useState<Record<string, Partial<ApiModelAdminProvider>>>({});
  const [apiPlanPatches, setApiPlanPatches] = useState<Record<string, Partial<ApiModelAdminPlan>>>({});
  const [apiOfferPatches, setApiOfferPatches] = useState<Record<string, Partial<ApiModelAdminOffer>>>({});
  const [apiProviderSubmissions, setApiProviderSubmissions] = useState<ApiProviderSubmission[]>(data.apiModels.providerSubmissions || []);
  const [riskReviewSettings, setRiskReviewSettings] = useState<RiskReviewSettings>(data.riskReviewSettings);
  const [sponsorSettings, setSponsorSettings] = useState<SponsorSettings>(data.sponsorSettings);
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus>(data.passwordStatus);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatusState>({
    generatedAt: data.collectorHealth.generatedAt || data.generatedAt,
    crawlRuns: data.crawlRuns,
    collectorHealth: data.collectorHealth,
    latestCrawlAt: latestCrawlRunTime(data.crawlRuns),
    latestSuccessfulCrawlAt: latestCrawlRunTime(data.crawlRuns.filter((run) => run.status === "success" || run.status === "partial")),
    latestCrawlStatus: latestCrawlRunByTime(data.crawlRuns)?.status || null,
    loading: false,
    error: null,
  });
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [activeTab, setActiveTab] = useState<AdminTab>("review");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<RowFeedback | null>(null);
  const [historySubmissions, setHistorySubmissions] = useState<ChannelSubmission[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sourcePatches, setSourcePatches] = useState<Record<string, Partial<Source>>>({});
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(new Set());
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [activeSourceGroupKey, setActiveSourceGroupKey] = useState<string | null>(null);
  const [sourceFilters, setSourceFilters] = useState<SourceFilters>({
    query: "",
    status: "all",
    offerBand: "all",
    sort: "offers_desc",
    riskOnly: false,
  });
  const [offerSearchQuery, setOfferSearchQuery] = useState("");
  const [debouncedOfferSearchQuery, setDebouncedOfferSearchQuery] = useState("");
  const [offerMaintenance, setOfferMaintenance] = useState<Record<OfferMaintenanceScope, OfferMaintenanceListState>>({
    visible: {
      offers: data.rawOffers,
      total: data.rawOfferTotal,
      loading: false,
      loadingMore: false,
      error: null,
      query: "",
    },
    hidden: {
      offers: data.hiddenRawOffers || [],
      total: data.hiddenRawOfferTotal,
      loading: false,
      loadingMore: false,
      error: null,
      query: "",
    },
  });
  const offerMaintenanceRef = useRef(offerMaintenance);
  const collectorRefreshRequestRef = useRef(0);
  const feedbackStatusFilterRef = useRef<OfferFeedbackStatus>("pending");
  const listRef = useRef<HTMLDivElement>(null);

  const reviewSubmissions = useMemo(
    () => submissions.filter((s) => !isCollectorTodo(s)),
    [submissions],
  );
  const collectorTodoSubmissions = useMemo(
    () => submissions.filter(isCollectorTodo),
    [submissions],
  );
  const sources = useMemo(
    () =>
      (data.sources || [])
        .filter((source) => !deletedSourceIds.has(source.id))
        .map((source) => ({ ...source, ...(sourcePatches[source.id] || {}) })),
    [data.sources, deletedSourceIds, sourcePatches],
  );
  const sourceById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );
  const offerById = useMemo(() => {
    const map = new Map<string, RawOffer>();
    for (const offer of data.rawOffers) map.set(offer.id, offer);
    for (const offer of data.hiddenRawOffers || []) map.set(offer.id, offer);
    for (const offer of feedbackRawOffers) map.set(offer.id, offer);
    return map;
  }, [data.hiddenRawOffers, data.rawOffers, feedbackRawOffers]);
  const productByKey = useMemo(() => {
    const map = new Map<string, AdminProduct>();
    for (const product of data.products) {
      map.set(product.id, product);
      map.set(product.slug, product);
      map.set(product.displayName, product);
    }
    return map;
  }, [data.products]);
  const filteredOfferFeedback = useMemo(
    () => filterOfferFeedbackByWorkFilter(offerFeedback, feedbackFilter, offerById),
    [feedbackFilter, offerById, offerFeedback],
  );
  const selectedOfferFeedback = useMemo(
    () => filteredOfferFeedback.filter((item) => selectedFeedbackIds.has(item.id)),
    [filteredOfferFeedback, selectedFeedbackIds],
  );
  const selectedFeedbackWithOffer = useMemo(
    () => selectedOfferFeedback.filter((item) => Boolean(item.offerId)),
    [selectedOfferFeedback],
  );
  const selectedFeedbackWithSource = useMemo(
    () => selectedOfferFeedback.filter((item) => Boolean(item.sourceId)),
    [selectedOfferFeedback],
  );
  const safeBatchFeedback = useMemo(
    () =>
      selectedOfferFeedback.filter((item) => {
        const verdict = getOfferFeedbackVerdict(item, item.offerId ? offerById.get(item.offerId) : null);
        return verdict.batchSafe;
      }),
    [offerById, selectedOfferFeedback],
  );
  const feedbackFilterCounts = useMemo(
    () => getFeedbackWorkFilterCounts(offerFeedback, siteFeedback, offerById),
    [offerById, offerFeedback, siteFeedback],
  );
  const pendingFeedbackCount = pendingOfferFeedbackCount + pendingSiteFeedbackCount;
  useEffect(() => {
    if (!selectedFeedbackIds.size) return;
    const visibleIds = new Set(filteredOfferFeedback.map((item) => item.id));
    setSelectedFeedbackIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredOfferFeedback, selectedFeedbackIds.size]);
  useEffect(() => {
    setSelectedFeedbackIds(new Set());
    feedbackStatusFilterRef.current = feedbackStatusFilter;
  }, [feedbackStatusFilter, feedbackFilter]);
  const apiModels = useMemo(
    (): ApiModelAdminData => ({
      ...data.apiModels,
      models: (data.apiModels.models || []).map((model) => ({
        ...model,
        ...(apiModelPatches[model.id] || {}),
      })),
      providers: (data.apiModels.providers || []).map((provider) => ({
        ...provider,
        ...(apiProviderPatches[provider.id] || {}),
      })),
      plans: (data.apiModels.plans || []).map((plan) => ({
        ...plan,
        ...(apiPlanPatches[plan.id] || {}),
      })),
      offers: (data.apiModels.offers || []).map((offer) => ({
        ...offer,
        ...(apiOfferPatches[offer.id] || {}),
      })),
      providerSubmissions: apiProviderSubmissions,
    }),
    [apiModelPatches, apiOfferPatches, apiPlanPatches, apiProviderPatches, apiProviderSubmissions, data.apiModels],
  );
  const officialPrices = useMemo(
    (): OfficialAdminData => ({
      ...data.officialPrices,
      apps: (data.officialPrices.apps || []).map((app) => ({
        ...app,
        ...(officialAppPatches[app.id] || {}),
      })),
      plans: (data.officialPrices.plans || []).map((plan) => ({
        ...plan,
        ...(officialPlanPatches[plan.id] || {}),
      })),
      regions: (data.officialPrices.regions || []).map((region) => ({
        ...region,
        ...(officialRegionPatches[region.id] || {}),
      })),
      currentPrices: (data.officialPrices.currentPrices || []).map((price) => ({
        ...price,
        ...(officialPricePatches[price.id] || {}),
      })),
    }),
    [data.officialPrices, officialAppPatches, officialPlanPatches, officialPricePatches, officialRegionPatches],
  );
  const filteredReview = useMemo(() => {
    if (!searchQuery.trim()) return reviewSubmissions;
    const q = searchQuery.toLowerCase();
    return reviewSubmissions.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.parsedTitle || "").toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q),
    );
  }, [reviewSubmissions, searchQuery]);

  const filteredTodo = useMemo(() => {
    if (!searchQuery.trim()) return collectorTodoSubmissions;
    const q = searchQuery.toLowerCase();
    return collectorTodoSubmissions.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.parsedTitle || "").toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q),
    );
  }, [collectorTodoSubmissions, searchQuery]);

  const approvableSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of filteredReview) {
      const meta = s.parsedMeta || {};
      const probe = probeResults[s.id] || probeResultFromMeta(s.parsedMeta || {});
      const existing = existingSourceForSubmission(s, sourceById);
      const suggestedCollector = collectorKindMeta(meta, "suggested_collector_kind");
      const hasValidSourceUrl = Boolean(displayableCanonicalSourceUrlForSubmission(s) || stringMeta(meta, "submitted_url_type") !== "product");
      if (hasValidSourceUrl && (existing || (probe?.status === "success" && probe.offerCount > 0) || isRunnableCollector(suggestedCollector))) {
        ids.add(s.id);
      }
    }
    return ids;
  }, [filteredReview, probeResults, sourceById]);
  const sameChannelSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const submission of filteredReview) {
      if (isSameChannelPendingSubmission(submission)) ids.add(submission.id);
    }
    return ids;
  }, [filteredReview]);
  const selectedSameChannelReviewCount = useMemo(
    () => filteredReview.filter((submission) => selectedIds.has(submission.id) && sameChannelSubmissionIds.has(submission.id)).length,
    [filteredReview, sameChannelSubmissionIds, selectedIds],
  );

  useEffect(() => {
    if (rowFeedback) {
      const timer = window.setTimeout(() => setRowFeedback(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [rowFeedback]);

  const refreshCollectorStatus = useCallback(async () => {
    const requestId = collectorRefreshRequestRef.current + 1;
    collectorRefreshRequestRef.current = requestId;
    setCollectorStatus((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/admin/collector-status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json() as ({ ok: true } & AdminCollectorStatus) | { ok: false; message?: string };
      if (!response.ok || !result.ok) throw new Error(("message" in result && result.message) || "读取采集状态失败。");
      if (collectorRefreshRequestRef.current !== requestId) return;

      setCollectorStatus({
        generatedAt: result.generatedAt,
        crawlRuns: result.crawlRuns,
        collectorHealth: result.collectorHealth,
        latestCrawlAt: result.latestCrawlAt,
        latestSuccessfulCrawlAt: result.latestSuccessfulCrawlAt,
        latestCrawlStatus: result.latestCrawlStatus,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (collectorRefreshRequestRef.current !== requestId) return;
      setCollectorStatus((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "读取采集状态失败。",
      }));
    }
  }, []);

  useEffect(() => {
    if (!authed || !["collect", "health", "logs"].includes(activeTab)) return;
    void refreshCollectorStatus();
    const timer = window.setInterval(() => {
      void refreshCollectorStatus();
    }, ADMIN_COLLECTOR_STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeTab, authed, refreshCollectorStatus]);

  useEffect(() => {
    offerMaintenanceRef.current = offerMaintenance;
  }, [offerMaintenance]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedOfferSearchQuery(offerSearchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [offerSearchQuery]);

  const loadOfferMaintenancePage = useCallback(
    async (scope: OfferMaintenanceScope, options: { reset?: boolean; query?: string } = {}) => {
      const current = offerMaintenanceRef.current[scope];
      const query = options.query ?? current.query;
      const reset = Boolean(options.reset);
      const offset = reset ? 0 : current.offers.length;
      if (!reset && (current.loading || current.loadingMore || current.offers.length >= current.total)) return;

      setOfferMaintenance((prev) => ({
        ...prev,
        [scope]: {
          ...prev[scope],
          loading: reset,
          loadingMore: !reset,
          error: null,
          query,
        },
      }));

      try {
        const result = await fetchAdminOfferMaintenancePage({
          scope,
          query,
          limit: OFFER_EMERGENCY_PAGE_SIZE,
          offset,
        });
        if (!result.ok) throw new Error(result.message || "读取报价失败。");

        setOfferMaintenance((prev) => {
          const nextOffers = reset
            ? result.offers || []
            : dedupeOffers([...prev[scope].offers, ...(result.offers || [])]);
          if (prev[scope].query !== query) return prev;
          return {
            ...prev,
            [scope]: {
              offers: nextOffers,
              total: Number(result.total || nextOffers.length),
              loading: false,
              loadingMore: false,
              error: null,
              query,
            },
          };
        });
      } catch (error) {
        setOfferMaintenance((prev) => ({
          ...prev,
          [scope]: prev[scope].query === query
            ? {
                ...prev[scope],
                loading: false,
                loadingMore: false,
                error: error instanceof Error ? error.message : "读取报价失败。",
              }
            : prev[scope],
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!authed || activeTab !== "manual") return;
    void loadOfferMaintenancePage("visible", { reset: true, query: debouncedOfferSearchQuery });
    void loadOfferMaintenancePage("hidden", { reset: true, query: debouncedOfferSearchQuery });
  }, [activeTab, authed, debouncedOfferSearchQuery, loadOfferMaintenancePage]);

  const showRowFeedback = useCallback((id: string, type: RowFeedback["type"], text: string) => {
    setRowFeedback({ id, type, text });
  }, []);

  const summary = useMemo(
    () => [
      { label: "渠道源", value: sources.length, icon: <Store key="s" size={15} /> },
      { label: "标准商品", value: data.products.length, icon: <Database key="d" size={15} /> },
      { label: "报价", value: data.rawOfferTotal, icon: <FileInput key="f" size={15} /> },
      { label: "官方价", value: officialPrices.currentPrices.length, icon: <Database key="op" size={15} /> },
      { label: "API 模型", value: apiModels.offers.length, icon: <TerminalSquare key="api" size={15} /> },
      { label: "待审核", value: reviewSubmissions.length, icon: <Inbox key="i" size={15} /> },
      { label: "反馈", value: pendingFeedbackCount, icon: <Flag key="fb" size={15} /> },
      { label: "采集待办", value: collectorTodoSubmissions.length, icon: <TerminalSquare key="t" size={15} /> },
    ],
    [apiModels.offers.length, collectorTodoSubmissions.length, data.products.length, data.rawOfferTotal, officialPrices.currentPrices.length, pendingFeedbackCount, reviewSubmissions.length, sources.length],
  );
  const sourceStatsById = useMemo(
    () => new Map((data.sourceOfferStats || []).map((stats) => [stats.sourceId, stats])),
    [data.sourceOfferStats],
  );
  const offerCountBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const source of sources) {
      const stats = sourceStatsById.get(source.id);
      if (stats) map.set(source.id, stats.visibleCount);
    }
    for (const offer of data.rawOffers) {
      if (!offer.sourceId || map.has(offer.sourceId)) continue;
      map.set(offer.sourceId, (map.get(offer.sourceId) || 0) + 1);
    }
    return map;
  }, [data.rawOffers, sourceStatsById, sources]);
  const sourceGroups = useMemo(() => groupSources(sources), [sources]);
  const sourceOverviewGroups = useMemo(
    () => buildSourceOverviewGroups(sourceGroups, sourceStatsById, offerCountBySource),
    [offerCountBySource, sourceGroups, sourceStatsById],
  );
  const activeSourceGroup = useMemo(
    () => sourceOverviewGroups.find((group) => group.key === activeSourceGroupKey) || null,
    [activeSourceGroupKey, sourceOverviewGroups],
  );
  const filteredSourceRows = useMemo(
    () =>
      activeSourceGroup
        ? filterAndSortSources(activeSourceGroup.sources, sourceFilters, sourceStatsById, offerCountBySource)
        : [],
    [activeSourceGroup, offerCountBySource, sourceFilters, sourceStatsById],
  );
  useEffect(() => {
    if (!activeSourceGroupKey) return;
    if (sourceOverviewGroups.some((group) => group.key === activeSourceGroupKey)) return;
    setActiveSourceGroupKey(null);
    setSelectedSourceIds(new Set());
  }, [activeSourceGroupKey, sourceOverviewGroups]);
  const selectedSources = useMemo(
    () => sources.filter((source) => selectedSourceIds.has(source.id)),
    [selectedSourceIds, sources],
  );
  const selectedTodoSubmissions = useMemo(
    () => filteredTodo.filter((submission) => selectedIds.has(submission.id)),
    [filteredTodo, selectedIds],
  );
  const todoProbeTargetCount = selectedTodoSubmissions.length || filteredTodo.length;
  const failedRunCount = useMemo(
    () => collectorStatus.crawlRuns.filter((r) => r.status === "failed").length,
    [collectorStatus.crawlRuns],
  );
  const collectorHealthIssueCount = useMemo(() => {
    const health = collectorStatus.collectorHealth;
    return (
      Number(health.overall.failedSources || 0) +
      Number(health.overall.downNodes || 0) +
      Number(health.overall.staleNodes || 0)
    );
  }, [collectorStatus.collectorHealth]);
  const adminTabs: Array<{ id: AdminTab; label: string; count: number | null; icon: ReactNode }> = useMemo(
    () => [
      { id: "review", label: "审核", count: reviewSubmissions.length, icon: <Inbox size={15} /> },
      { id: "todo", label: "待办", count: collectorTodoSubmissions.length, icon: <ClipboardList size={15} /> },
      { id: "feedback", label: "反馈", count: pendingFeedbackCount, icon: <Flag size={15} /> },
      { id: "sponsors", label: "赞助", count: sponsorSettings.enabled ? activeSponsorPlacementCount(sponsorSettings) || null : null, icon: <Megaphone size={15} /> },
      { id: "security", label: "安全", count: null, icon: <KeyRound size={15} /> },
      { id: "history", label: "历史", count: null, icon: <History size={15} /> },
      { id: "collect", label: "采集", count: failedRunCount || null, icon: <RefreshCcw size={15} /> },
      { id: "health", label: "健康", count: collectorHealthIssueCount || null, icon: <Activity size={15} /> },
      { id: "official", label: "官方价", count: officialPrices.currentPrices.length || null, icon: <Database size={15} /> },
      { id: "apiModels", label: "API 模型", count: apiModels.offers.length || null, icon: <TerminalSquare size={15} /> },
      { id: "apiTransit", label: "中转 API", count: data.apiTransit.metrics.candidateOffers || data.apiTransit.metrics.pendingStations || null, icon: <Server size={15} /> },
      { id: "sources", label: "渠道", count: sources.length, icon: <Store size={15} /> },
      { id: "manual", label: "维护", count: null, icon: <Plus size={15} /> },
      { id: "logs", label: "日志", count: collectorStatus.crawlRuns.length, icon: <Clock size={15} /> },
    ],
    [apiModels.offers.length, collectorHealthIssueCount, collectorStatus.crawlRuns.length, collectorTodoSubmissions.length, data.apiTransit.metrics.candidateOffers, data.apiTransit.metrics.pendingStations, failedRunCount, officialPrices.currentPrices.length, pendingFeedbackCount, reviewSubmissions.length, sources.length, sponsorSettings],
  );

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    if (!authed) return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (activeTab !== "review" && activeTab !== "todo") return;
      const items = activeTab === "review" ? filteredReview : filteredTodo;
      if (!items.length) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const item = items[focusedIndex];
        if (item) setExpandedId((prev) => (prev === item.id ? null : item.id));
      } else if (e.key === "Escape") {
        setExpandedId(null);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [authed, activeTab, filteredReview, filteredTodo, focusedIndex]);

  /* ─── API actions ─── */
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAction("login");
    setGlobalMessage(null);
    const result = await request("/api/admin/login", password, { password });
    setLoadingAction(null);
    if (result.ok) {
      setOptimisticAuthed(true);
      setGlobalMessage({ type: "success", text: "后台已解锁。" });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "登录失败。" });
    }
  }

  async function reclassifyOffers() {
    setLoadingAction("reclassify-offers");
    setGlobalMessage({ type: "info", text: "正在按最新标准商品规则重建分类..." });
    const result = await request("/api/admin/reclassify", password, {});
    setLoadingAction(null);
    if (result.ok) {
      setGlobalMessage({
        type: "success",
        text: `重分类完成：同步 ${result.productCount || 0} 个标准商品，更新 ${result.updatedCount || 0} 条报价。刷新页面后可查看结果。`,
      });
    } else {
      setGlobalMessage({ type: "error", text: result.message || "重分类失败。" });
    }
  }

  async function collectPrices() {
    setLoadingAction("collect-prices");
    setGlobalMessage({ type: "info", text: "正在创建全量采集任务..." });
    try {
      const result = await request("/api/admin/collection-jobs", password, {
        jobType: "all",
        priority: 20,
        maxAttempts: 2,
      });
      if (result.ok) {
        setGlobalMessage({
          type: "success",
          text: `已创建全量采集任务，等待国内 VPS 执行器领取。`,
        });
        router.refresh();
      } else {
        setGlobalMessage({ type: "error", text: result.message || "创建采集任务失败。" });
      }
    } catch (error) {
      setGlobalMessage({ type: "error", text: error instanceof Error ? error.message : "网络错误。" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function probeOfficialPrices() {
    setLoadingAction("official-probe");
    setGlobalMessage({ type: "info", text: "正在试采集 ChatGPT / US 官方地区价，不会写入数据库..." });
    const result = await request("/api/admin/official-prices/probe", password, {
      app: "chatgpt",
      regions: "US",
    });
    setLoadingAction(null);
    setOfficialProbeResult(result);
    if (result.ok) {
      setGlobalMessage({ type: "success", text: "官方地区价试采集完成，结果已在面板中更新。" });
    } else {
      setGlobalMessage({ type: "error", text: result.message || "官方地区价试采集失败。" });
    }
  }

  async function probeApiModels() {
    setLoadingAction("api-models-probe");
    setGlobalMessage({ type: "info", text: "正在试采集 OpenRouter API 模型公开来源，不会写入数据库..." });
    const result = await request("/api/admin/api-models/probe", password, {
      provider: "openrouter",
    });
    setLoadingAction(null);
    setApiModelProbeResult(result);
    if (result.ok) {
      setGlobalMessage({ type: "success", text: "API 模型试采集完成，结果已在面板中更新。" });
    } else {
      setGlobalMessage({ type: "error", text: result.message || "API 模型试采集失败。" });
    }
  }

  async function enqueueOfficialPriceCollection(officialMode: "weekly_full" | "fx_only") {
    const loadingKey = officialMode === "fx_only" ? "official-enqueue-fx" : "official-enqueue-weekly";
    setLoadingAction(loadingKey);
    setGlobalMessage({
      type: "info",
      text: officialMode === "fx_only" ? "正在创建官方地区价汇率刷新任务..." : "正在创建官方地区价周全量采集任务...",
    });

    try {
      const result = await request("/api/admin/collection-jobs", password, {
        jobType: "official_prices",
        officialMode,
        priority: officialMode === "fx_only" ? 15 : 25,
        maxAttempts: 2,
      });
      if (result.ok) {
        setGlobalMessage({
          type: "success",
          text: officialMode === "fx_only" ? "已创建汇率刷新任务，等待 worker 领取。" : "已创建周全量采集任务，等待 worker 领取。",
        });
        router.refresh();
      } else {
        setGlobalMessage({ type: "error", text: result.message || "创建官方地区价任务失败。" });
      }
    } catch (error) {
      setGlobalMessage({ type: "error", text: error instanceof Error ? error.message : "网络错误。" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function enqueueApiModelCollection() {
    setLoadingAction("api-models-enqueue");
    setGlobalMessage({ type: "info", text: "正在创建 API 模型采集任务..." });

    try {
      const result = await request("/api/admin/collection-jobs", password, {
        jobType: "api_models",
        priority: 25,
        maxAttempts: 2,
      });
      if (result.ok) {
        setGlobalMessage({ type: "success", text: "已创建 API 模型采集任务，等待 worker 领取。" });
        router.refresh();
      } else {
        setGlobalMessage({ type: "error", text: result.message || "创建 API 模型任务失败。" });
      }
    } catch (error) {
      setGlobalMessage({ type: "error", text: error instanceof Error ? error.message : "网络错误。" });
    } finally {
      setLoadingAction(null);
    }
  }

  const copyOfficialCollectorCommand = () => {
    const command = "npm run collect:official -- --all --dry-run --post";
    void navigator.clipboard.writeText(command);
    setGlobalMessage({ type: "success", text: "已复制官方地区价 dry-run 命令。" });
  };

  const copyApiModelImportCommand = () => {
    const command = "npm run import:api-models -- --dry-run --post";
    void navigator.clipboard.writeText(command);
    setGlobalMessage({ type: "success", text: "已复制 API 模型 dry-run 导入命令。" });
  };

  const copyApiModelCollectorCommand = () => {
    const command = "npm run collect:api-models -- --all --dry-run";
    void navigator.clipboard.writeText(command);
    setGlobalMessage({ type: "success", text: "已复制 API 模型采集 dry-run 命令。" });
  };

  async function toggleOfficialAppEnabled(app: OfficialAdminApp, enabled: boolean) {
    setLoadingAction(`official-app-${app.id}`);
    const result = await requestWithMethod("/api/admin/official-prices", "PATCH", password, {
      target: "app",
      id: app.id,
      enabled,
    });
    setLoadingAction(null);

    if (result.ok) {
      setOfficialAppPatches((prev) => ({ ...prev, [app.id]: { enabled } }));
      setGlobalMessage({ type: "success", text: enabled ? `已启用官方应用「${app.displayName}」。` : `已停用官方应用「${app.displayName}」。` });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新官方应用失败。" });
    }
  }

  async function toggleOfficialPlanEnabled(plan: OfficialAdminPlan, enabled: boolean) {
    setLoadingAction(`official-plan-${plan.id}`);
    const result = await requestWithMethod("/api/admin/official-prices", "PATCH", password, {
      target: "plan",
      id: plan.id,
      enabled,
    });
    setLoadingAction(null);

    if (result.ok) {
      setOfficialPlanPatches((prev) => ({ ...prev, [plan.id]: { enabled } }));
      setGlobalMessage({ type: "success", text: enabled ? `已启用官方计划「${plan.label}」。` : `已停用官方计划「${plan.label}」。` });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新官方计划失败。" });
    }
  }

  async function toggleOfficialRegionEnabled(region: OfficialAdminRegion, enabled: boolean) {
    setLoadingAction(`official-region-${region.id}`);
    const result = await requestWithMethod("/api/admin/official-prices", "PATCH", password, {
      target: "region",
      id: region.id,
      enabled,
    });
    setLoadingAction(null);

    if (result.ok) {
      setOfficialRegionPatches((prev) => ({ ...prev, [region.id]: { enabled } }));
      setGlobalMessage({ type: "success", text: enabled ? `已启用官方地区「${region.countryLabel}」。` : `已停用官方地区「${region.countryLabel}」。` });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新官方地区失败。" });
    }
  }

  async function updateOfficialPriceStatus(price: OfficialAdminPrice, status: OfficialAdminPrice["status"]) {
    const actionKey = `official-price-${price.id}-${status}`;
    setLoadingAction(actionKey);
    const result = await requestWithMethod("/api/admin/official-prices", "PATCH", password, {
      target: "price",
      id: price.id,
      status,
      failureReason: officialManualStatusReason(status),
    });
    setLoadingAction(null);

    if (result.ok) {
      setOfficialPricePatches((prev) => ({
        ...prev,
        [price.id]: {
          status,
          failureReason: status === "available" ? null : officialManualStatusReason(status),
          lastCheckedAt: new Date().toISOString(),
        },
      }));
      setGlobalMessage({ type: "success", text: `已将官方地区价标记为「${officialPriceStatusLabel(status)}」。` });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新官方地区价状态失败。" });
    }
  }

  async function toggleApiProviderEnabled(provider: ApiModelAdminProvider, enabled: boolean) {
    setLoadingAction(`api-provider-${provider.id}`);
    const result = await requestWithMethod("/api/admin/api-models", "PATCH", password, {
      target: "provider",
      id: provider.id,
      enabled,
    });
    setLoadingAction(null);

    if (result.ok) {
      setApiProviderPatches((prev) => ({ ...prev, [provider.id]: { enabled } }));
      setGlobalMessage({
        type: "success",
        text: enabled ? `已启用 API 来源「${provider.name}」。` : `已停用 API 来源「${provider.name}」，前台会隐藏该来源报价。`,
      });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新 API 来源失败。" });
    }
  }

  async function toggleApiOfferStatus(offer: ApiModelAdminOffer, status: ApiModelAdminOffer["status"]) {
    setLoadingAction(`api-offer-${offer.id}`);
    const result = await requestWithMethod("/api/admin/api-models", "PATCH", password, {
      target: "offer",
      id: offer.id,
      status,
    });
    setLoadingAction(null);

    if (result.ok) {
      setApiOfferPatches((prev) => ({ ...prev, [offer.id]: { status } }));
      setGlobalMessage({
        type: "success",
        text: status === "active" ? "API 模型报价已恢复展示。" : "API 模型报价已从前台隐藏。",
      });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新 API 模型报价失败。" });
    }
  }

  async function saveApiModelEditable(payload: ApiModelEditablePayload): Promise<{ ok: boolean; message?: string }> {
    const actionKey = `api-edit-${payload.target}-${payload.id}`;
    setLoadingAction(actionKey);
    const result = await requestWithMethod("/api/admin/api-models", "PATCH", password, payload);
    setLoadingAction(null);

    if (result.ok) {
      const { target, id, ...patch } = payload;
      if (target === "model") {
        setApiModelPatches((prev) => ({ ...prev, [id]: patch as Partial<ApiModelAdminModel> }));
      } else if (target === "provider") {
        setApiProviderPatches((prev) => ({ ...prev, [id]: patch as Partial<ApiModelAdminProvider> }));
      } else if (target === "plan") {
        setApiPlanPatches((prev) => ({ ...prev, [id]: patch as Partial<ApiModelAdminPlan> }));
      } else {
        setApiOfferPatches((prev) => ({ ...prev, [id]: patch as Partial<ApiModelAdminOffer> }));
      }
      setGlobalMessage({ type: "success", text: "API 模型数据已保存，前台会以数据库记录为准。" });
      router.refresh();
      return { ok: true };
    }

    const message = result.message || "保存 API 模型数据失败。";
    setGlobalMessage({ type: "error", text: message });
    return { ok: false, message };
  }

  async function reviewApiProviderSubmission(
    submission: ApiProviderSubmission,
    reviewStatus: ApiProviderSubmission["reviewStatus"],
  ) {
    const actionKey = `api-submission-${submission.id}-${reviewStatus}`;
    setLoadingAction(actionKey);
    const result = await requestWithMethod("/api/admin/api-models", "PATCH", password, {
      target: "submission",
      id: submission.id,
      reviewStatus,
      adminNote: defaultApiSubmissionAdminNote(submission, reviewStatus),
    });
    setLoadingAction(null);

    if (result.ok && result.submission) {
      const next = result.submission as ApiProviderSubmission;
      setApiProviderSubmissions((prev) =>
        reviewStatus === "collector_todo"
          ? replaceApiProviderSubmission(prev, next)
          : prev.filter((item) => item.id !== submission.id),
      );
      setGlobalMessage({ type: "success", text: apiSubmissionActionSuccessText(next, reviewStatus) });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "更新 API 渠道提交失败。" });
    }
  }

  async function enqueueSourceCollection(source: Source): Promise<{ ok: boolean; jobCount?: number; message?: string }> {
    const result = await request("/api/admin/collection-jobs", password, {
      jobType: "source",
      sourceIds: [source.id],
      priority: 30,
      maxAttempts: 2,
    });
    return result.ok
      ? { ok: true, jobCount: Number(result.jobCount || 1) }
      : { ok: false, message: result.message || "创建采集任务失败。" };
  }

  async function collectSource(source: Source) {
    setLoadingAction(`collect-source-${source.id}`);
    showRowFeedback(source.id, "info", `正在创建「${source.name}」重采任务...`);

    try {
      const result = await enqueueSourceCollection(source);
      if (result.ok) {
        showRowFeedback(source.id, "success", "已加入采集队列，等待国内 VPS 执行器领取。");
        router.refresh();
      } else {
        showRowFeedback(source.id, "error", result.message || "创建采集任务失败。");
        router.refresh();
      }
    } catch (error) {
      showRowFeedback(source.id, "error", error instanceof Error ? error.message : "网络错误。");
    } finally {
      setLoadingAction(null);
    }
  }

  async function batchCollectSelectedSources() {
    const targets = selectedSources.filter(
      (source) =>
        source.enabled &&
        resolvedCollectionMethod(source) === "http" &&
        !sourceNeedsCollector(source),
    );
    if (!targets.length) {
      setGlobalMessage({ type: "error", text: "没有可自动重采的已选渠道。" });
      return;
    }

    setLoadingAction("batch-collect-sources");
    setGlobalMessage({ type: "info", text: `正在创建 ${targets.length} 个渠道重采任务...` });
    const result = await request("/api/admin/collection-jobs", password, {
      jobType: "source",
      sourceIds: targets.map((source) => source.id),
      priority: 30,
      maxAttempts: 2,
    });
    setLoadingAction(null);
    setGlobalMessage(result.ok
      ? {
          type: "success",
          text: `已创建 ${result.jobCount || targets.length} 个采集任务，等待国内 VPS 执行器领取。`,
        }
      : { type: "error", text: result.message || "创建采集任务失败。" });
    router.refresh();
  }

  async function copyBrowserCommand(source: Source) {
    const command = buildBrowserCollectCommand(source);
    try {
      await navigator.clipboard.writeText(command);
      showRowFeedback(source.id, "success", "已复制本机浏览器采集命令。");
    } catch {
      showRowFeedback(source.id, "error", command);
    }
  }

  async function copySourceCollectorContext(source: Source) {
    const context = buildSourceCollectorContext(source);
    try {
      await navigator.clipboard.writeText(context);
      showRowFeedback(source.id, "success", "已复制采集器开发上下文。");
    } catch {
      showRowFeedback(source.id, "error", context);
    }
  }

  async function copySelectedBrowserCommands() {
    if (!selectedSources.length) return;
    const commands = selectedSources
      .map((source) => `# ${source.name}\n${buildSourceCollectCommand(source)}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(commands);
      setGlobalMessage({ type: "success", text: `已复制 ${selectedSources.length} 个渠道的采集命令。` });
    } catch {
      setGlobalMessage({ type: "error", text: commands });
    }
  }

  async function copySelectedCollectorContexts() {
    if (!selectedSources.length) return;
    const context = selectedSources
      .map((source) => buildSourceCollectorContext(source))
      .join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(context);
      setGlobalMessage({ type: "success", text: `已复制 ${selectedSources.length} 个渠道的采集器上下文。` });
    } catch {
      setGlobalMessage({ type: "error", text: context });
    }
  }

  async function toggleSourceEnabled(source: Source, enabled = !source.enabled) {
    setLoadingAction(`toggle-source-${source.id}`);
    const result = await requestWithMethod("/api/admin/sources", "PATCH", password, {
      id: source.id,
      enabled,
    });
    setLoadingAction(null);

    if (result.ok && result.source) {
      setSourcePatches((prev) => ({ ...prev, [source.id]: result.source as Source }));
      showRowFeedback(source.id, "success", enabled ? "渠道已启用。" : "渠道已停用。");
    } else {
      showRowFeedback(source.id, "error", result.message || "更新渠道失败。");
    }
  }

  async function batchToggleSelectedSources(enabled: boolean) {
    if (!selectedSources.length) return;
    setLoadingAction(enabled ? "batch-enable-sources" : "batch-disable-sources");
    let success = 0;
    const updates: Record<string, Source> = {};

    for (const source of selectedSources) {
      const result = await requestWithMethod("/api/admin/sources", "PATCH", password, {
        id: source.id,
        enabled,
      });
      if (result.ok && result.source) {
        success++;
        updates[source.id] = result.source as Source;
      }
    }

    setSourcePatches((prev) => ({ ...prev, ...updates }));
    setLoadingAction(null);
    setGlobalMessage({
      type: success === selectedSources.length ? "success" : "info",
      text: `${enabled ? "启用" : "停用"}完成：${success}/${selectedSources.length} 个渠道成功。`,
    });
    router.refresh();
  }

  async function toggleSourceOffersVisibility(source: Source, hidden: boolean) {
    const stats = sourceStatsById.get(source.id);
    const affectedCount = hidden ? stats?.visibleCount || 0 : stats?.manuallyHiddenCount || 0;
    const confirmed = hidden
      ? window.confirm(`确定下架「${source.name}」的 ${affectedCount} 条可见报价吗？该渠道会同时停用采集，前台会立即隐藏这些报价。`)
      : window.confirm(`确定恢复「${source.name}」的 ${affectedCount} 条手动下架报价吗？该渠道会同时启用采集。`);
    if (!confirmed) return;

    setLoadingAction(`${hidden ? "hide" : "restore"}-source-offers-${source.id}`);
    const result = await requestWithMethod("/api/admin/sources", "PATCH", password, {
      id: source.id,
      offersHidden: hidden,
      reason: "线上反馈/临时处理",
    });
    setLoadingAction(null);

    if (result.ok && result.source) {
      setSourcePatches((prev) => ({ ...prev, [source.id]: result.source as Source }));
      showRowFeedback(
        source.id,
        "success",
        hidden
          ? `已下架 ${result.updatedOfferCount || 0} 条报价，并停用该渠道采集。`
          : `已恢复 ${result.updatedOfferCount || 0} 条报价，并启用该渠道采集。`,
      );
      router.refresh();
    } else {
      showRowFeedback(source.id, "error", result.message || (hidden ? "下架报价失败。" : "恢复报价失败。"));
    }
  }

  async function batchToggleSelectedSourceOffers(hidden: boolean) {
    if (!selectedSources.length) return;
    const total = selectedSources.reduce((sum, source) => {
      const stats = sourceStatsById.get(source.id);
      return sum + (hidden ? stats?.visibleCount || 0 : stats?.manuallyHiddenCount || 0);
    }, 0);
    const confirmed = hidden
      ? window.confirm(`确定批量下架 ${selectedSources.length} 个渠道的 ${total} 条可见报价吗？这些渠道会同时停用采集。`)
      : window.confirm(`确定批量恢复 ${selectedSources.length} 个渠道的 ${total} 条手动下架报价吗？这些渠道会同时启用采集。`);
    if (!confirmed) return;

    setLoadingAction(hidden ? "batch-hide-source-offers" : "batch-restore-source-offers");
    let success = 0;
    let updatedOfferCount = 0;
    const updates: Record<string, Source> = {};

    for (const source of selectedSources) {
      const result = await requestWithMethod("/api/admin/sources", "PATCH", password, {
        id: source.id,
        offersHidden: hidden,
        reason: "线上反馈/临时处理",
      });
      if (result.ok && result.source) {
        success++;
        updatedOfferCount += Number(result.updatedOfferCount || 0);
        updates[source.id] = result.source as Source;
      }
    }

    setSourcePatches((prev) => ({ ...prev, ...updates }));
    setLoadingAction(null);
    setGlobalMessage({
      type: success === selectedSources.length ? "success" : "info",
      text: `${hidden ? "批量下架" : "批量恢复"}完成：${success}/${selectedSources.length} 个渠道成功，处理 ${updatedOfferCount} 条报价。`,
    });
    router.refresh();
  }

  async function toggleOfferHidden(offer: RawOffer, hidden: boolean) {
    const confirmed = hidden
      ? window.confirm(`确定下架这条报价吗？\n${offer.sourceTitle}`)
      : window.confirm(`确定恢复这条报价吗？\n${offer.sourceTitle}`);
    if (!confirmed) return;

    setLoadingAction(`${hidden ? "hide" : "restore"}-offer-${offer.id}`);
    const result = await request("/api/admin/toggle-offer", password, {
      id: offer.id,
      hidden,
      reason: "线上反馈/临时处理",
    });
    setLoadingAction(null);

    if (result.ok) {
      setGlobalMessage({
        type: "success",
        text: hidden ? "报价已下架，前台会立即隐藏。" : "报价已恢复，前台可重新展示。",
      });
      void loadOfferMaintenancePage("visible", { reset: true, query: offerMaintenanceRef.current.visible.query });
      void loadOfferMaintenancePage("hidden", { reset: true, query: offerMaintenanceRef.current.hidden.query });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || (hidden ? "下架报价失败。" : "恢复报价失败。") });
    }
  }

  async function deleteSourceRow(source: Source) {
    const confirmed = window.confirm(`确定删除「${source.name}」这个渠道源吗？历史报价会保留。`);
    if (!confirmed) return;

    setLoadingAction(`delete-source-${source.id}`);
    const result = await requestWithMethod("/api/admin/sources", "DELETE", password, {
      id: source.id,
      deleteOffers: false,
    });
    setLoadingAction(null);

    if (result.ok) {
      setDeletedSourceIds((prev) => new Set([...prev, source.id]));
      setSelectedSourceIds((prev) => { const next = new Set(prev); next.delete(source.id); return next; });
      setGlobalMessage({ type: "success", text: `已删除渠道源「${source.name}」。` });
      router.refresh();
    } else {
      showRowFeedback(source.id, "error", result.message || "删除渠道失败。");
    }
  }

  async function batchDeleteSelectedSources() {
    if (!selectedSources.length) return;
    const confirmed = window.confirm(`确定删除 ${selectedSources.length} 个渠道源吗？历史报价会保留。`);
    if (!confirmed) return;

    setLoadingAction("batch-delete-sources");
    let success = 0;

    for (const source of selectedSources) {
      const result = await requestWithMethod("/api/admin/sources", "DELETE", password, {
        id: source.id,
        deleteOffers: false,
      });
      if (result.ok) success++;
    }

    setDeletedSourceIds((prev) => new Set([...prev, ...selectedSources.map((source) => source.id)]));
    setSelectedSourceIds(new Set());
    setLoadingAction(null);
    setGlobalMessage({
      type: success === selectedSources.length ? "success" : "info",
      text: `批量删除完成：${success}/${selectedSources.length} 个渠道成功。`,
    });
    router.refresh();
  }

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAction("source");
    const form = new FormData(event.currentTarget);
    const result = await request("/api/admin/sources", password, {
      name: String(form.get("name") || ""),
      entryUrl: String(form.get("entryUrl") || ""),
      baseUrl: String(form.get("baseUrl") || "") || null,
      collectionMethod: String(form.get("collectionMethod") || "manual") as CollectionMethod,
      collectorKind: String(form.get("collectorKind") || "auto") as CollectorKind,
      enabled: true,
      notes: String(form.get("notes") || "") || null,
    });
    setLoadingAction(null);
    setGlobalMessage(result.ok ? { type: "success", text: "来源已保存，刷新页面后可查看。" } : { type: "error", text: result.message || "保存失败。" });
  }

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAction("manual-offer");
    const form = new FormData(event.currentTarget);
    const tags = String(form.get("tags") || "")
      .split(/[,，\n|｜]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const priceValue = String(form.get("price") || "");
    const result = await request("/api/admin/manual-offer", password, {
      sourceName: String(form.get("sourceName") || ""),
      sourceUrl: String(form.get("sourceUrl") || ""),
      sourceStoreName: String(form.get("sourceStoreName") || ""),
      sourceTitle: String(form.get("sourceTitle") || ""),
      price: priceValue ? Number(priceValue) : null,
      currency: "CNY",
      status: String(form.get("status") || "unknown") as OfferStatus,
      url: String(form.get("url") || ""),
      tags,
      stockCount: null,
    });
    setLoadingAction(null);
    setGlobalMessage(result.ok ? { type: "success", text: "手动报价已保存，刷新页面后可查看。" } : { type: "error", text: result.message || "保存失败。" });
  }

  async function refreshSubmissions() {
    try {
      const response = await fetch("/api/admin/submissions?status=pending", {
        credentials: "include",
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (response.ok && json.ok) {
        setSubmissions(json.submissions || []);
      }
    } catch {
      /* ignore */
    }
  }

  const refreshOfferFeedback = useCallback(async (status: OfferFeedbackStatus = feedbackStatusFilter) => {
    try {
      const response = await fetch(`/api/admin/feedback?status=${status}`, {
        credentials: "include",
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (response.ok && json.ok) {
        if (status !== feedbackStatusFilterRef.current) return;
        const nextFeedback = json.feedback || [];
        setOfferFeedback(nextFeedback);
        setFeedbackRawOffers(json.offers || []);
        if (status === "pending") setPendingOfferFeedbackCount(nextFeedback.length);
      }
    } catch {
      /* ignore */
    }
  }, [feedbackStatusFilter]);

  const refreshSiteFeedback = useCallback(async (status: SiteFeedbackStatus = feedbackStatusFilter) => {
    try {
      const response = await fetch(`/api/admin/site-feedback?status=${status}`, {
        credentials: "include",
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (response.ok && json.ok) {
        if (status !== feedbackStatusFilterRef.current) return;
        const nextFeedback = json.feedback || [];
        setSiteFeedback(nextFeedback);
        if (status === "pending") setPendingSiteFeedbackCount(nextFeedback.length);
      }
    } catch {
      /* ignore */
    }
  }, [feedbackStatusFilter]);

  useEffect(() => {
    if (activeTab !== "feedback") return;
    void refreshOfferFeedback(feedbackStatusFilter);
    void refreshSiteFeedback(feedbackStatusFilter);
  }, [activeTab, feedbackStatusFilter, refreshOfferFeedback, refreshSiteFeedback]);

  async function updateFeedbackStatus(feedback: OfferFeedback, status: OfferFeedbackStatus, reviewerNote?: string) {
    setLoadingAction(`feedback-${status}-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      id: feedback.id,
      status,
      reviewerNote: reviewerNote || null,
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as OfferFeedback;
      setOfferFeedback((prev) =>
        feedbackStatusFilter === nextFeedback.status
          ? prev.map((item) => (item.id === feedback.id ? nextFeedback : item))
          : prev.filter((item) => item.id !== feedback.id),
      );
      if (feedback.status === "pending" && nextFeedback.status !== "pending") {
        setPendingOfferFeedbackCount((count) => Math.max(0, count - 1));
      }
      showRowFeedback(feedback.id, "success", status === "ignored" ? "反馈已忽略。" : "反馈已标记处理。");
    } else {
      showRowFeedback(feedback.id, "error", result.message || "处理反馈失败。");
    }
  }

  async function updateFeedbackVerification(
    feedback: OfferFeedback,
    verificationStatus: OfferFeedback["verificationStatus"],
    verificationResult: OfferFeedback["verificationResult"],
    verificationMessage: string,
  ) {
    setLoadingAction(`feedback-verification-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      action: "verification",
      id: feedback.id,
      verificationStatus,
      verificationResult,
      verificationMessage,
      reviewerNote: verificationMessage,
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as OfferFeedback;
      setOfferFeedback((prev) => prev.map((item) => (item.id === feedback.id ? nextFeedback : item)));
      showRowFeedback(feedback.id, "success", "核验状态已更新。");
    } else {
      showRowFeedback(feedback.id, "error", result.message || "更新核验状态失败。");
    }
  }

  async function createFeedbackRecollection(feedback: OfferFeedback) {
    setLoadingAction(`feedback-recollect-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      action: "recollect",
      id: feedback.id,
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as OfferFeedback;
      setOfferFeedback((prev) => prev.map((item) => (item.id === feedback.id ? nextFeedback : item)));
      showRowFeedback(feedback.id, "success", result.jobId ? `已创建重采任务：${result.jobId}` : "已创建重采任务。");
    } else {
      showRowFeedback(feedback.id, "error", result.message || "创建重采任务失败。");
    }
  }

  async function runFeedbackAutoVerification(feedback: OfferFeedback) {
    setLoadingAction(`feedback-auto-verify-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      action: "auto_verify",
      id: feedback.id,
    });
    setLoadingAction(null);

    if (result.ok) {
      await refreshOfferFeedback(feedbackStatusFilter);
      showRowFeedback(
        feedback.id,
        result.status === "auto_fixed" ? "success" : "info",
        result.message || "自动复核完成。",
      );
    } else {
      showRowFeedback(feedback.id, "error", result.message || "自动复核失败。");
    }
  }

  async function runFeedbackRiskPrecheck(feedback: OfferFeedback) {
    setLoadingAction(`feedback-risk-precheck-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      action: "risk_precheck",
      id: feedback.id,
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as OfferFeedback;
      setOfferFeedback((prev) => prev.map((item) => (item.id === feedback.id ? nextFeedback : item)));
      showRowFeedback(
        feedback.id,
        "success",
        nextFeedback.riskPrecheck?.canShowPublicly
          ? "模型预审完成，已生成前台临时风险摘要。"
          : "模型预审完成，暂不公开到前台。",
      );
    } else {
      showRowFeedback(feedback.id, "error", result.message || "模型预审失败。");
    }
  }

  async function updateFeedbackRiskVisibility(feedback: OfferFeedback, mode: "hide_public" | "expand_source") {
    const confirmed = mode === "hide_public"
      ? window.confirm("确定撤销这条反馈生成的前台风险提示吗？反馈记录会保留。")
      : window.confirm("确定把这条反馈扩展为商家级风险提示吗？前台会在同商家的报价中展示商家风险。");
    if (!confirmed) return;

    setLoadingAction(`feedback-risk-visibility-${mode}-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
      action: "risk_visibility",
      id: feedback.id,
      riskVisibilityMode: mode,
      reviewerNote: mode === "hide_public" ? "人工撤销前台风险提示" : "人工扩展为商家级风险提示",
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as OfferFeedback;
      setOfferFeedback((prev) => prev.map((item) => (item.id === feedback.id ? nextFeedback : item)));
      showRowFeedback(feedback.id, "success", mode === "hide_public" ? "已撤销前台风险提示。" : "已扩展为商家级风险提示。");
    } else {
      showRowFeedback(feedback.id, "error", result.message || "更新前台风险提示失败。");
    }
  }

  async function saveRiskReviewSettings(formData: FormData) {
    setLoadingAction("risk-review-settings");
    const result = await requestWithMethod("/api/admin/risk-review-settings", "PATCH", password, {
      provider: String(formData.get("provider") || "opencode"),
      baseUrl: String(formData.get("baseUrl") || ""),
      model: String(formData.get("model") || ""),
      timeoutMs: Number(formData.get("timeoutMs") || 12000),
      apiKey: String(formData.get("apiKey") || ""),
    });
    setLoadingAction(null);

    if (result.ok && result.settings) {
      setRiskReviewSettings(result.settings as RiskReviewSettings);
      setGlobalMessage({ type: "success", text: "风险预审模型配置已保存。" });
    } else {
      setGlobalMessage({ type: "error", text: result.message || "保存风险预审模型配置失败。" });
    }
  }

  async function saveSponsorSettings(settings: SponsorSettings) {
    setLoadingAction("sponsor-settings");
    const payload = buildSponsorSettingsPayload(settings);
    const result = await requestWithMethod("/api/admin/sponsor-settings", "PATCH", password, payload);
    setLoadingAction(null);

    if (result.ok && result.settings) {
      setSponsorSettings(result.settings as SponsorSettings);
      setGlobalMessage({ type: "success", text: "赞助位配置已保存，相关前台页面正在刷新。" });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "保存赞助位配置失败。" });
    }
  }

  async function saveAdminPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentPassword = passwordDraft.currentPassword.trim();
    const newPassword = passwordDraft.newPassword.trim();
    const confirmPassword = passwordDraft.confirmPassword.trim();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setGlobalMessage({ type: "error", text: "请完整填写当前密码、新密码和确认密码。" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setGlobalMessage({ type: "error", text: "两次输入的新密码不一致。" });
      return;
    }
    if (newPassword.length < passwordStatus.minLength) {
      setGlobalMessage({ type: "error", text: `新密码至少需要 ${passwordStatus.minLength} 个字符。` });
      return;
    }

    setLoadingAction("admin-password");
    setGlobalMessage(null);
    const result = await requestWithMethod("/api/admin/password", "PATCH", password, {
      currentPassword,
      newPassword,
    });
    setLoadingAction(null);

    if (result.ok && result.passwordStatus) {
      setPasswordStatus(result.passwordStatus as PasswordStatus);
      setPassword("");
      setPasswordDraft({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setGlobalMessage({ type: "success", text: "后台密码已更新，当前会话已续签。" });
      router.refresh();
    } else {
      setGlobalMessage({ type: "error", text: result.message || "修改后台密码失败。" });
    }
  }

  function toggleFeedbackSelect(id: string) {
    setSelectedFeedbackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisibleFeedback() {
    const ids = filteredOfferFeedback.map((item) => item.id);
    if (!ids.length) {
      setSelectedFeedbackIds(new Set());
      return;
    }
    setSelectedFeedbackIds((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }

  function clearCompletedOfferFeedback(succeededIds: Set<string>) {
    if (!succeededIds.size) return;

    setOfferFeedback((prev) => prev.filter((item) => !succeededIds.has(item.id)));
    setSelectedFeedbackIds((prev) => {
      const next = new Set(prev);
      for (const id of succeededIds) next.delete(id);
      return next;
    });
    if (feedbackStatusFilter === "pending") {
      setPendingOfferFeedbackCount((count) => Math.max(0, count - succeededIds.size));
    }
  }

  async function batchUpdateSelectedOfferFeedback(status: OfferFeedbackStatus) {
    const selected = selectedOfferFeedback;
    if (!selected.length) {
      setGlobalMessage({ type: "error", text: "请先选择要处理的报价举报。" });
      return;
    }

    const targets = status === "resolved" ? safeBatchFeedback : selected;
    if (!targets.length) {
      setGlobalMessage({ type: "error", text: "当前没有可安全批量标记已处理的反馈。高风险、分类和需人工核验的反馈请逐条处理。" });
      return;
    }

    const note = status === "resolved" ? "轻量预处理：当前状态已更新或问题已自愈" : "批量忽略";
    const confirmed = window.confirm(
      status === "resolved"
        ? `确定将 ${targets.length} 条低风险反馈批量标记为已处理吗？`
        : `确定忽略 ${targets.length} 条已选反馈吗？`,
    );
    if (!confirmed) return;

    setLoadingAction(status === "resolved" ? "batch-feedback-resolved" : "batch-feedback-ignored");
    let success = 0;
    const succeededIds = new Set<string>();
    for (const item of targets) {
      const result = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
        id: item.id,
        status,
        reviewerNote: note,
      });
      if (result.ok) {
        success++;
        succeededIds.add(item.id);
      }
    }

    clearCompletedOfferFeedback(succeededIds);
    setLoadingAction(null);
    setGlobalMessage({
      type: success === targets.length ? "success" : "info",
      text: `${status === "resolved" ? "批量标记已处理" : "批量忽略"}完成：${success}/${targets.length} 条成功。`,
    });
    router.refresh();
  }

  async function batchHideSelectedFeedbackOffers() {
    if (!selectedOfferFeedback.length) {
      setGlobalMessage({ type: "error", text: "请先选择要下架报价的反馈。" });
      return;
    }
    const targets = selectedFeedbackWithOffer;
    if (!targets.length) {
      setGlobalMessage({ type: "error", text: "已选反馈没有可下架的报价 ID。" });
      return;
    }

    const skipped = selectedOfferFeedback.length - targets.length;
    const confirmed = window.confirm(
      `确定批量下架 ${targets.length} 条报价，并将对应反馈标记为已处理吗？${skipped ? `\n${skipped} 条已选反馈缺少报价 ID，会跳过。` : ""}`,
    );
    if (!confirmed) return;

    setLoadingAction("batch-feedback-hide-offer");
    let hiddenSuccess = 0;
    let resolvedSuccess = 0;
    const succeededIds = new Set<string>();

    for (const item of targets) {
      const hideResult = await request("/api/admin/toggle-offer", password, {
        id: item.offerId,
        hidden: true,
        reason: `用户反馈：${feedbackReasonLabel(item.reason)}`,
      });
      if (!hideResult.ok) continue;

      hiddenSuccess++;
      const feedbackResult = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
        id: item.id,
        status: "resolved",
        reviewerNote: "已批量按用户反馈下架报价",
      });
      if (feedbackResult.ok) {
        resolvedSuccess++;
        succeededIds.add(item.id);
      }
    }

    clearCompletedOfferFeedback(succeededIds);
    setLoadingAction(null);
    setGlobalMessage({
      type: hiddenSuccess === targets.length && resolvedSuccess === targets.length ? "success" : "info",
      text: `批量下架报价完成：下架 ${hiddenSuccess}/${targets.length} 条，标记已处理 ${resolvedSuccess}/${targets.length} 条反馈。`,
    });
    router.refresh();
  }

  async function batchHideSelectedFeedbackSources() {
    if (!selectedOfferFeedback.length) {
      setGlobalMessage({ type: "error", text: "请先选择要下架渠道的反馈。" });
      return;
    }
    const targets = selectedFeedbackWithSource;
    if (!targets.length) {
      setGlobalMessage({ type: "error", text: "已选反馈没有可下架的渠道 ID。" });
      return;
    }

    const feedbackBySource = new Map<string, OfferFeedback[]>();
    for (const item of targets) {
      if (!item.sourceId) continue;
      const items = feedbackBySource.get(item.sourceId) || [];
      items.push(item);
      feedbackBySource.set(item.sourceId, items);
    }

    const skipped = selectedOfferFeedback.length - targets.length;
    const confirmed = window.confirm(
      `确定批量下架 ${feedbackBySource.size} 个渠道的可见报价，并将 ${targets.length} 条反馈标记为已处理吗？${skipped ? `\n${skipped} 条已选反馈缺少渠道 ID，会跳过。` : ""}`,
    );
    if (!confirmed) return;

    setLoadingAction("batch-feedback-hide-source");
    let sourceSuccess = 0;
    let updatedOfferCount = 0;
    let resolvedSuccess = 0;
    const succeededIds = new Set<string>();
    const sourceUpdates: Record<string, Source> = {};

    for (const [sourceId, items] of feedbackBySource) {
      const reasonLabels = Array.from(new Set(items.map((item) => feedbackReasonLabel(item.reason)))).join("、");
      const sourceResult = await requestWithMethod("/api/admin/sources", "PATCH", password, {
        id: sourceId,
        offersHidden: true,
        reason: `用户反馈批量下架渠道：${reasonLabels}`,
      });
      if (!sourceResult.ok) continue;

      sourceSuccess++;
      updatedOfferCount += Number(sourceResult.updatedOfferCount || 0);
      if (sourceResult.source) sourceUpdates[sourceId] = sourceResult.source as Source;

      for (const item of items) {
        const feedbackResult = await requestWithMethod("/api/admin/feedback", "PATCH", password, {
          id: item.id,
          status: "resolved",
          reviewerNote: "已批量按用户反馈下架渠道报价",
        });
        if (feedbackResult.ok) {
          resolvedSuccess++;
          succeededIds.add(item.id);
        }
      }
    }

    if (Object.keys(sourceUpdates).length) {
      setSourcePatches((prev) => ({ ...prev, ...sourceUpdates }));
    }
    clearCompletedOfferFeedback(succeededIds);
    setLoadingAction(null);
    setGlobalMessage({
      type: sourceSuccess === feedbackBySource.size && resolvedSuccess === targets.length ? "success" : "info",
      text: `批量下架渠道完成：下架 ${sourceSuccess}/${feedbackBySource.size} 个渠道，处理 ${updatedOfferCount} 条报价，标记已处理 ${resolvedSuccess}/${targets.length} 条反馈。`,
    });
    router.refresh();
  }

  async function updateSiteFeedbackStatus(feedback: SiteFeedback, status: SiteFeedbackStatus, reviewerNote?: string) {
    setLoadingAction(`site-feedback-${status}-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/site-feedback", "PATCH", password, {
      id: feedback.id,
      status,
      reviewerNote: reviewerNote || null,
    });
    setLoadingAction(null);

    if (result.ok && result.feedback) {
      const nextFeedback = result.feedback as SiteFeedback;
      setSiteFeedback((prev) =>
        feedbackStatusFilter === nextFeedback.status
          ? prev.map((item) => (item.id === feedback.id ? nextFeedback : item))
          : prev.filter((item) => item.id !== feedback.id),
      );
      if (feedback.status === "pending" && nextFeedback.status !== "pending") {
        setPendingSiteFeedbackCount((count) => Math.max(0, count - 1));
      }
      showRowFeedback(feedback.id, "success", status === "ignored" ? "意见已忽略。" : "意见已标记处理。");
    } else {
      showRowFeedback(feedback.id, "error", result.message || "处理意见失败。");
    }
  }

  async function hideOfferFromFeedback(feedback: OfferFeedback) {
    if (!feedback.offerId) {
      showRowFeedback(feedback.id, "error", "这条反馈没有关联报价 ID。");
      return;
    }
    const confirmed = window.confirm(`确定下架这条报价吗？\n${feedback.sourceTitle || feedback.offerUrl || feedback.offerId}`);
    if (!confirmed) return;

    setLoadingAction(`feedback-hide-offer-${feedback.id}`);
    const result = await request("/api/admin/toggle-offer", password, {
      id: feedback.offerId,
      hidden: true,
      reason: `用户反馈：${feedbackReasonLabel(feedback.reason)}`,
    });
    if (result.ok) {
      await updateFeedbackStatus(feedback, "resolved", "已按用户反馈下架报价");
      setGlobalMessage({ type: "success", text: "报价已下架，反馈已标记处理。" });
      router.refresh();
    } else {
      setLoadingAction(null);
      showRowFeedback(feedback.id, "error", result.message || "下架报价失败。");
    }
  }

  async function hideSourceFromFeedback(feedback: OfferFeedback) {
    if (!feedback.sourceId) {
      showRowFeedback(feedback.id, "error", "这条反馈没有关联渠道 ID。");
      return;
    }
    const confirmed = window.confirm(`确定下架「${feedback.sourceName || feedback.sourceId}」整个渠道的可见报价，并停用采集吗？`);
    if (!confirmed) return;

    setLoadingAction(`feedback-hide-source-${feedback.id}`);
    const result = await requestWithMethod("/api/admin/sources", "PATCH", password, {
      id: feedback.sourceId,
      offersHidden: true,
      reason: `用户反馈：${feedbackReasonLabel(feedback.reason)}`,
    });
    if (result.ok) {
      if (result.source) {
        setSourcePatches((prev) => ({ ...prev, [feedback.sourceId!]: result.source as Source }));
      }
      await updateFeedbackStatus(feedback, "resolved", "已按用户反馈下架渠道报价");
      setGlobalMessage({ type: "success", text: `已下架 ${result.updatedOfferCount || 0} 条渠道报价，反馈已标记处理。` });
      router.refresh();
    } else {
      setLoadingAction(null);
      showRowFeedback(feedback.id, "error", result.message || "下架渠道失败。");
    }
  }

  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const [approvedRes, rejectedRes] = await Promise.all([
        fetch("/api/admin/submissions?status=approved", {
          credentials: "include",
        }),
        fetch("/api/admin/submissions?status=rejected", {
          credentials: "include",
        }),
      ]);
      const approvedJson = await approvedRes.json().catch(() => ({ ok: false }));
      const rejectedJson = await rejectedRes.json().catch(() => ({ ok: false }));
      const all: ChannelSubmission[] = [
        ...(approvedJson.ok ? approvedJson.submissions : []),
        ...(rejectedJson.ok ? rejectedJson.submissions : []),
      ];
      all.sort((a, b) => new Date(b.reviewedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.createdAt).getTime());
      setHistorySubmissions(all);
    } catch {
      setGlobalMessage({ type: "error", text: "加载历史记录失败。" });
    } finally {
      setHistoryLoading(false);
    }
  }

  async function approveSubmission(
    submission: ChannelSubmission,
    overrides: { name?: string; sourceUrl?: string; collectionMethod?: CollectionMethod; collectorKind?: CollectorKind },
  ) {
    setLoadingAction(`approve-${submission.id}`);
    const result = await request("/api/admin/submissions/approve", password, {
      id: submission.id,
      name: overrides.name?.trim() || null,
      sourceUrl: overrides.sourceUrl?.trim() || null,
      collectionMethod: overrides.collectionMethod || "manual",
      collectorKind: overrides.collectorKind || "auto",
    });
    setLoadingAction(null);
    if (result.ok) {
      const imported = Number(result.importedOfferCount || 0);
      const merged = Boolean(result.matchedExistingSource);
      showRowFeedback(
        submission.id,
        "success",
        merged
          ? `已合并到已有源：${result.source?.name || submission.url}${imported ? `，入库 ${imported} 条报价` : ""}`
          : imported
            ? `已通过并入库：${result.source?.name || submission.url}，入库 ${imported} 条报价`
            : `已通过并加入渠道：${result.source?.name || submission.url}，等待下次采集`,
      );
      setTimeout(() => {
        setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
        setProbeResults((prev) => omitKey(prev, submission.id));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(submission.id); return next; });
      }, 1500);
    } else {
      if (isAlreadyHandled(result.message)) {
        setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
        setProbeResults((prev) => omitKey(prev, submission.id));
      }
      showRowFeedback(submission.id, "error", result.message || "通过失败。");
    }
  }

  async function probeSubmission(submission: ChannelSubmission) {
    setLoadingAction(`probe-${submission.id}`);
    showRowFeedback(submission.id, "info", "正在试采集，通常需要 10-30 秒...");
    const result = await request("/api/admin/submissions/probe", password, {
      id: submission.id,
    });
    setLoadingAction(null);
    if (result.ok && result.result) {
      const probeResult = result.result as ProbeResult;
      setProbeResults((prev) => ({ ...prev, [submission.id]: probeResult }));
      if (result.submission) {
        setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
      }
      showRowFeedback(
        submission.id,
        probeResult.status === "success" ? "success" : "error",
        probeResult.message || "试采集完成。",
      );
    } else {
      showRowFeedback(submission.id, "error", result.message || "试采集失败。");
    }
  }

  async function reparseSubmission(submission: ChannelSubmission) {
    setLoadingAction(`reparse-${submission.id}`);
    showRowFeedback(submission.id, "info", "正在重新解析渠道入口...");
    const result = await request("/api/admin/submissions/reparse", password, {
      id: submission.id,
    });
    setLoadingAction(null);
    if (result.ok && result.submission) {
      const updatedSubmission = result.submission as ChannelSubmission;
      setSubmissions((prev) => replaceSubmission(prev, updatedSubmission));
      const resolved = stringMeta(updatedSubmission.parsedMeta || {}, "canonical_source_status") === "resolved";
      showRowFeedback(
        submission.id,
        resolved ? "success" : "info",
        reparseFeedbackText(updatedSubmission),
      );
    } else {
      showRowFeedback(submission.id, "error", result.message || "重新解析失败。");
    }
  }

  async function reparseFilteredReview() {
    const items = filteredReview;
    if (!items.length) return;
    setLoadingAction("batch-reparse");
    let successCount = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    for (const item of items) {
      const result = await request("/api/admin/submissions/reparse", password, { id: item.id });
      if (result.ok && result.submission) {
        const updatedSubmission = result.submission as ChannelSubmission;
        successCount++;
        if (stringMeta(updatedSubmission.parsedMeta || {}, "canonical_source_status") === "resolved") resolvedCount++;
        else unresolvedCount++;
        setSubmissions((prev) => replaceSubmission(prev, updatedSubmission));
      }
    }
    setLoadingAction(null);
    setGlobalMessage({
      type: resolvedCount > 0 && unresolvedCount === 0 ? "success" : "info",
      text: `重新解析完成：请求成功 ${successCount}/${items.length}，已反查 ${resolvedCount} 条，仍需处理 ${unresolvedCount} 条。`,
    });
  }

  async function todoSubmission(submission: ChannelSubmission, note: string) {
    setLoadingAction(`todo-${submission.id}`);
    const result = await request("/api/admin/submissions/todo", password, {
      id: submission.id,
      note: note || null,
    });
    setLoadingAction(null);
    if (result.ok && result.submission) {
      setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
      showRowFeedback(submission.id, "success", "已加入采集器待办。");
    } else {
      showRowFeedback(submission.id, "error", result.message || "加入待办失败。");
    }
  }

  async function rejectSubmission(submission: ChannelSubmission, note: string) {
    setLoadingAction(`reject-${submission.id}`);
    const result = await request("/api/admin/submissions/reject", password, {
      id: submission.id,
      reviewerNote: note || null,
    });
    setLoadingAction(null);
    if (result.ok) {
      showRowFeedback(submission.id, "success", "已拒绝该提交。");
      setTimeout(() => {
        setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
        setProbeResults((prev) => omitKey(prev, submission.id));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(submission.id); return next; });
      }, 1500);
    } else {
      if (isAlreadyHandled(result.message)) {
        setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
        setProbeResults((prev) => omitKey(prev, submission.id));
      }
      showRowFeedback(submission.id, "error", result.message || "拒绝失败。");
    }
  }

  async function ignoreSameChannelSubmission(submission: ChannelSubmission) {
    setLoadingAction(`ignore-same-channel-${submission.id}`);
    const result = await request("/api/admin/submissions/reject", password, {
      id: submission.id,
      reviewerNote: sameChannelSubmissionReviewerNote(submission),
    });
    setLoadingAction(null);
    if (result.ok || isAlreadyHandled(result.message)) {
      showRowFeedback(submission.id, "success", "已忽略同渠道提交。");
      setTimeout(() => {
        setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
        setProbeResults((prev) => omitKey(prev, submission.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(submission.id);
          return next;
        });
      }, result.ok ? 900 : 0);
    } else {
      showRowFeedback(submission.id, "error", result.message || "忽略同渠道项失败。");
    }
  }

  async function batchApprove() {
    const items = filteredReview.filter((s) => selectedIds.has(s.id) && approvableSubmissionIds.has(s.id));
    if (!items.length) return;
    setLoadingAction("batch-approve");
    let successCount = 0;
    for (const item of items) {
      const meta = item.parsedMeta || {};
      const suggestedMethod = collectionMethodMeta(meta, "suggested_collection_method");
      const suggestedCollector = collectorKindMeta(meta, "suggested_collector_kind") || "auto";
      const probe = probeResults[item.id] || probeResultFromMeta(meta);
      const method: CollectionMethod = (probe?.status === "success" ? "http" : suggestedMethod) || "http";
      const canonicalSourceUrl = displayableCanonicalSourceUrlForSubmission(item);
      const result = await request("/api/admin/submissions/approve", password, {
        id: item.id,
        name: item.name || stringMeta(meta, "suggested_source_name") || item.parsedTitle || null,
        sourceUrl: canonicalSourceUrl || item.url,
        collectionMethod: method,
        collectorKind: suggestedCollector,
      });
      if (result.ok) {
        successCount++;
        setSubmissions((prev) => prev.filter((s) => s.id !== item.id));
        setProbeResults((prev) => omitKey(prev, item.id));
      }
    }
    setLoadingAction(null);
    setSelectedIds(new Set());
    setGlobalMessage({
      type: "success",
      text: `批量通过完成：${successCount}/${items.length} 条成功。`,
    });
  }

  async function batchTodo() {
    const items = filteredReview.filter((s) => selectedIds.has(s.id));
    if (!items.length) return;
    setLoadingAction("batch-todo");
    let successCount = 0;
    for (const item of items) {
      const result = await request("/api/admin/submissions/todo", password, {
        id: item.id,
        note: "批量转入采集器待办",
      });
      if (result.ok && result.submission) {
        successCount++;
        setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
        setProbeResults((prev) => omitKey(prev, item.id));
      } else if (isAlreadyHandled(result.message)) {
        successCount++;
        setSubmissions((prev) => prev.filter((s) => s.id !== item.id));
        setProbeResults((prev) => omitKey(prev, item.id));
      }
    }
    setLoadingAction(null);
    setSelectedIds(new Set());
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `批量转待办完成：${successCount}/${items.length} 条成功。`,
    });
  }

  async function batchReject() {
    const items = filteredReview.filter((s) => selectedIds.has(s.id));
    if (!items.length) return;
    if (!window.confirm(`确认拒绝选中的 ${items.length} 条提交吗？`)) return;

    setLoadingAction("batch-reject");
    let successCount = 0;
    for (const item of items) {
      const result = await request("/api/admin/submissions/reject", password, {
        id: item.id,
        reviewerNote: "批量拒绝",
      });
      if (result.ok || isAlreadyHandled(result.message)) {
        successCount++;
        setSubmissions((prev) => prev.filter((s) => s.id !== item.id));
        setProbeResults((prev) => omitKey(prev, item.id));
      }
    }
    setLoadingAction(null);
    setSelectedIds(new Set());
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `批量拒绝完成：${successCount}/${items.length} 条成功。`,
    });
  }

  async function batchIgnoreSameChannel() {
    const items = filteredReview.filter((submission) => selectedIds.has(submission.id) && sameChannelSubmissionIds.has(submission.id));
    if (!items.length) return;

    setLoadingAction("batch-ignore-same-channel");
    let successCount = 0;
    for (const item of items) {
      const result = await request("/api/admin/submissions/reject", password, {
        id: item.id,
        reviewerNote: sameChannelSubmissionReviewerNote(item),
      });
      if (result.ok || isAlreadyHandled(result.message)) {
        successCount++;
        setSubmissions((prev) => prev.filter((submission) => submission.id !== item.id));
        setProbeResults((prev) => omitKey(prev, item.id));
      }
    }
    setLoadingAction(null);
    setSelectedIds(new Set());
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `同渠道项忽略完成：${successCount}/${items.length} 条成功。`,
    });
  }

  async function batchRemoveTodo() {
    const items = selectedTodoSubmissions;
    if (!items.length) return;
    if (!window.confirm(`确认从采集器待办移除选中的 ${items.length} 条吗？`)) return;

    setLoadingAction("batch-remove-todo");
    let successCount = 0;

    for (const item of items) {
      const result = await request("/api/admin/submissions/reject", password, {
        id: item.id,
        reviewerNote: "批量从采集器待办移除。",
      });
      if (result.ok || isAlreadyHandled(result.message)) {
        successCount++;
        setSubmissions((prev) => prev.filter((submission) => submission.id !== item.id));
        setProbeResults((prev) => omitKey(prev, item.id));
      }
    }

    setLoadingAction(null);
    setSelectedIds(new Set());
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `待办移除完成：${successCount}/${items.length} 条成功。`,
    });
  }

  async function batchProbeTodo() {
    const items = selectedTodoSubmissions.length ? selectedTodoSubmissions : filteredTodo;
    if (!items.length) return;

    setLoadingAction("batch-probe-todo");
    setGlobalMessage({ type: "info", text: `正在重新试采集 ${items.length} 条待办，请稍等...` });

    let successCount = 0;
    let completedCount = 0;

    for (const item of items) {
      showRowFeedback(item.id, "info", "正在试采集，通常需要 10-30 秒...");
      try {
        const result = await request("/api/admin/submissions/probe", password, { id: item.id });
        completedCount++;
        if (result.ok && result.result) {
          const probeResult = result.result as ProbeResult;
          setProbeResults((prev) => ({ ...prev, [item.id]: probeResult }));
          if (result.submission) {
            setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
          }
          if (probeResult.status === "success") successCount++;
          showRowFeedback(
            item.id,
            probeResult.status === "success" ? "success" : "error",
            probeResult.message || "试采集完成。",
          );
        } else {
          showRowFeedback(item.id, "error", result.message || "试采集失败。");
        }
      } catch (error) {
        completedCount++;
        showRowFeedback(item.id, "error", error instanceof Error ? error.message : "试采集失败。");
      }

      setGlobalMessage({
        type: "info",
        text: `重新试采集中：${completedCount}/${items.length}，成功 ${successCount} 条。`,
      });
    }

    setLoadingAction(null);
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `重新试采集完成：成功 ${successCount}/${items.length} 条。`,
    });
  }

  /* ─── Render ─── */

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllApprovable = () => {
    if (selectedIds.size === approvableSubmissionIds.size && [...approvableSubmissionIds].every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvableSubmissionIds));
    }
  };

  const selectAllReview = () => {
    const reviewIds = filteredReview.map((submission) => submission.id);
    if (reviewIds.length > 0 && reviewIds.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reviewIds));
    }
  };

  const selectAllTodo = () => {
    const todoIds = filteredTodo.map((submission) => submission.id);
    if (todoIds.length > 0 && todoIds.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(todoIds));
    }
  };

  const copyAllTodoContexts = () => {
    if (!filteredTodo.length) return;
    const text = filteredTodo.map(buildCollectorContext).join("\n\n---\n\n");
    void navigator.clipboard.writeText(text);
    setGlobalMessage({ type: "success", text: `已复制 ${filteredTodo.length} 条采集器待办上下文。` });
  };

  const toggleSourceSelect = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSources = () => {
    const selectableSources = activeSourceGroup ? filteredSourceRows : [];
    const selectableIds = selectableSources.map((source) => source.id);
    if (!selectableIds.length) {
      setSelectedSourceIds(new Set());
      return;
    }

    if (selectableIds.every((id) => selectedSourceIds.has(id))) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(selectableIds));
    }
  };

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      {/* Header */}
      <header className="border-b border-[#adb3b4]/30 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-[#5a6061] transition-colors hover:text-[#2d3435]">
              &larr; PriceAI
            </Link>
            <span className="text-[#adb3b4]">/</span>
            <h1 className="font-serif text-lg font-semibold text-[#202829]">后台管理</h1>
          </div>
          {authed && (
            <div className="flex items-center gap-3">
              {summary.map((s) => (
                <div key={s.label} className="hidden items-center gap-1.5 text-xs text-[#5a6061] sm:flex">
                  {s.icon}
                  <span className="font-semibold text-[#2d3435]">{s.value}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Global message */}
        {globalMessage && (
          <div className="mb-4">
            <MessageBox message={globalMessage} onDismiss={() => setGlobalMessage(null)} />
          </div>
        )}

        {!data.configured && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-[#fff7e8] px-4 py-3 text-sm text-[#7a541b]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>还没有配置 Supabase。前台会使用演示数据，后台保存、导入和采集入库会返回配置提示。</span>
          </div>
        )}

        {data.loadErrors.length ? (
          <AdminLoadErrors errors={data.loadErrors} />
        ) : null}

        {!authed ? (
          <section className="mx-auto mt-8 max-w-md rounded-lg border border-[#adb3b4]/30 bg-white p-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-[#202829]">
              <KeyRound size={19} />
              后台密码
            </div>
            <p className="mt-2 text-sm text-[#5a6061]">
              使用后台密码登录。登录后后台操作会走安全 Cookie，不会在每个请求里重复携带明文密码。
            </p>
            <form onSubmit={login} className="mt-4 flex gap-2">
              <label htmlFor="admin-password" className="sr-only">
                后台密码
              </label>
              <input
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="输入后台密码"
                className="h-11 min-w-0 flex-1 rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
              />
              <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#2d3435] px-5 text-sm font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829]">
                {loadingAction === "login" ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                解锁
              </button>
            </form>
          </section>
        ) : (
          <>
            {/* Tab bar */}
            <nav role="tablist" aria-label="管理后台导航" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#adb3b4]/20">
              {adminTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchQuery("");
                    setSelectedIds(new Set());
                    setFocusedIndex(-1);
                    setExpandedId(null);
                    if (tab.id === "history" && !historySubmissions.length) void loadHistory();
                  }}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "border-[#2d3435] text-[#2d3435]"
                      : "border-transparent text-[#5a6061] hover:border-[#adb3b4]/40 hover:text-[#2d3435]"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {typeof tab.count === "number" && tab.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                      activeTab === tab.id
                        ? "bg-[#2d3435] text-white"
                        : "bg-[#f2f4f4] text-[#5a6061]"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Review tab */}
            {activeTab === "review" && (
              <div role="tabpanel" id="tabpanel-review">
                {/* Toolbar */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索渠道名或 URL..."
                      aria-label="搜索渠道名或 URL"
                      className="h-9 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                    />
                  </div>
                  {approvableSubmissionIds.size > 0 && (
                    <button
                      type="button"
                      onClick={selectAllApprovable}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                    >
                      <Check size={14} />
                      {selectedIds.size > 0 ? "取消全选" : `全选可通过 (${approvableSubmissionIds.size})`}
                    </button>
                  )}
                  {filteredReview.length > 0 && (
                    <button
                      type="button"
                      onClick={selectAllReview}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                    >
                      <ClipboardList size={14} />
                      {filteredReview.every((s) => selectedIds.has(s.id)) ? "取消当前" : `全选当前 (${filteredReview.length})`}
                    </button>
                  )}
                  {filteredReview.length > 0 && (
                    <button
                      type="button"
                      onClick={reparseFilteredReview}
                      disabled={loadingAction === "batch-reparse"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                    >
                      {loadingAction === "batch-reparse" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      重解析当前 ({filteredReview.length})
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={batchApprove}
                      disabled={loadingAction === "batch-approve" || !filteredReview.some((s) => selectedIds.has(s.id) && approvableSubmissionIds.has(s.id))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-xs font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
                    >
                      {loadingAction === "batch-approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      批量通过 ({filteredReview.filter((s) => selectedIds.has(s.id) && approvableSubmissionIds.has(s.id)).length})
                    </button>
                  )}
                  {selectedSameChannelReviewCount > 0 && (
                    <button
                      type="button"
                      onClick={batchIgnoreSameChannel}
                      disabled={loadingAction === "batch-ignore-same-channel"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/25 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                    >
                      {loadingAction === "batch-ignore-same-channel" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      忽略同渠道项 ({selectedSameChannelReviewCount})
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={batchTodo}
                      disabled={loadingAction === "batch-todo"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8] disabled:opacity-60"
                    >
                      {loadingAction === "batch-todo" ? <Loader2 size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
                      批量转待办 ({filteredReview.filter((s) => selectedIds.has(s.id)).length})
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={batchReject}
                      disabled={loadingAction === "batch-reject"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/25 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                    >
                      {loadingAction === "batch-reject" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      批量拒绝 ({filteredReview.filter((s) => selectedIds.has(s.id)).length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => refreshSubmissions()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                  >
                    <RefreshCcw size={14} />
                    刷新
                  </button>
                </div>

                {/* Submission list */}
                <div ref={listRef} className="space-y-2">
                  {filteredReview.length ? (
                    filteredReview.map((submission, index) => (
                      <SubmissionCard
                        key={submission.id}
                        submission={submission}
                        existingSource={existingSourceForSubmission(submission, sourceById)}
                        loadingAction={loadingAction}
                        probeResult={probeResults[submission.id]}
                        expanded={expandedId === submission.id}
                        focused={focusedIndex === index}
                        selected={selectedIds.has(submission.id)}
                        selectable
                        feedback={rowFeedback?.id === submission.id ? rowFeedback : null}
                        onToggleExpand={() => setExpandedId((prev) => (prev === submission.id ? null : submission.id))}
                        onToggleSelect={() => toggleSelect(submission.id)}
                        onApprove={approveSubmission}
                        onProbe={probeSubmission}
                        onReparse={reparseSubmission}
                        onTodo={todoSubmission}
                        onReject={rejectSubmission}
                        onIgnoreSameChannel={ignoreSameChannelSubmission}
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon={<Inbox size={32} className="text-[#adb3b4]" />}
                      title="所有提交已处理完毕"
                      description="用户提交的新渠道会出现在这里。"
                    />
                  )}
                </div>

                {/* Keyboard hint */}
                {filteredReview.length > 0 && (
                  <p className="mt-4 text-center text-xs text-[#adb3b4]">
                    <kbd className="rounded border border-[#adb3b4]/30 px-1">j</kbd>/<kbd className="rounded border border-[#adb3b4]/30 px-1">k</kbd> 导航
                    {" "}<kbd className="rounded border border-[#adb3b4]/30 px-1">Enter</kbd> 展开
                    {" "}<kbd className="rounded border border-[#adb3b4]/30 px-1">Esc</kbd> 收起
                  </p>
                )}
              </div>
            )}

            {/* Todo tab */}
            {activeTab === "todo" && (
              <div role="tabpanel" id="tabpanel-todo">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[240px] flex-1 max-w-md">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索待办..."
                      aria-label="搜索待办"
                      className="h-9 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                    />
                  </div>
                  {filteredTodo.length > 0 && (
                    <button
                      type="button"
                      onClick={selectAllTodo}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                    >
                      <Check size={14} />
                      {filteredTodo.every((submission) => selectedIds.has(submission.id)) ? "取消当前" : `全选当前 (${filteredTodo.length})`}
                    </button>
                  )}
                  {selectedTodoSubmissions.length > 0 && (
                    <button
                      type="button"
                      onClick={batchRemoveTodo}
                      disabled={loadingAction === "batch-remove-todo"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/25 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                    >
                      {loadingAction === "batch-remove-todo" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      移除选中 ({selectedTodoSubmissions.length})
                    </button>
                  )}
                  {filteredTodo.length > 0 && (
                    <button
                      type="button"
                      onClick={batchProbeTodo}
                      disabled={loadingAction === "batch-probe-todo"}
                      title={selectedTodoSubmissions.length ? "重新试采集选中的待办" : "重新试采集当前筛选出的全部待办"}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/25 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#eef8f1] disabled:opacity-60"
                    >
                      {loadingAction === "batch-probe-todo" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      一键重新试采集 ({todoProbeTargetCount})
                    </button>
                  )}
                  {filteredTodo.length > 0 && (
                    <button
                      type="button"
                      onClick={copyAllTodoContexts}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8]"
                    >
                      <Copy size={14} />
                      一键复制上下文 ({filteredTodo.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {filteredTodo.length ? (
                    filteredTodo.map((submission) => {
                      const meta = submission.parsedMeta || {};
                      const reason = stringMeta(meta, "collector_todo_reason") || stringMeta(meta, "support_reason");
                      const domain = stringMeta(meta, "domain") || safeDomain(submission.url);
                      const probeLoading = loadingAction === `probe-${submission.id}`;

                      return (
                        <div key={submission.id} className="rounded-lg border border-amber-200/60 bg-white p-4 transition-colors hover:border-amber-300">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={selectedIds.has(submission.id)}
                              aria-label={`选择 ${submission.name || submission.parsedTitle || domain || submission.url}`}
                              onClick={() => toggleSelect(submission.id)}
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                selectedIds.has(submission.id)
                                  ? "border-[#2f7a4b] bg-[#2f7a4b] text-white"
                                  : "border-[#adb3b4]/40 hover:border-[#2d3435]"
                              }`}
                            >
                              {selectedIds.has(submission.id) && <Check size={12} strokeWidth={3} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <a
                                  href={submission.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-[#2d3435] hover:text-[#7a541b]"
                                >
                                  {submission.name || submission.parsedTitle || domain || submission.url}
                                </a>
                                {domain && <span className="text-xs text-[#5a6061]">{domain}</span>}
                              </div>
                              <p className="mt-1 break-all text-xs text-[#adb3b4]">{submission.url}</p>
                              <p className="mt-2 text-xs leading-5 text-[#7a541b]">
                                {reason || "需要新增解析脚本后重新试采集。"}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={probeLoading}
                              onClick={() => probeSubmission(submission)}
                              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8] disabled:opacity-60"
                            >
                              {probeLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                              重新试采集
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(buildCollectorContext(submission));
                                setGlobalMessage({ type: "success", text: "已复制采集器开发上下文。" });
                              }}
                              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                            >
                              <TerminalSquare size={14} />
                              复制上下文
                            </button>
                            <button
                              type="button"
                              disabled={loadingAction === `reject-${submission.id}`}
                              onClick={() => rejectSubmission(submission, "不符合 PriceAI 当前定位，已从采集器待办移除。")}
                              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                            >
                              {loadingAction === `reject-${submission.id}` ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                              移除待办
                            </button>
                          </div>
                          {rowFeedback?.id === submission.id && (
                            <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${rowFeedbackClass(rowFeedback.type)}`}>
                              {rowFeedback.type === "success" ? <CheckCircle2 size={14} /> : rowFeedback.type === "info" ? <Clock size={14} /> : <AlertTriangle size={14} />}
                              {rowFeedback.text}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <EmptyState
                      icon={<ClipboardList size={32} className="text-[#adb3b4]" />}
                      title="暂无采集器待办"
                      description="试采集失败的渠道会放到这里，后续新增解析脚本后再验证。"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Feedback tab */}
            {activeTab === "feedback" && (
              <div role="tabpanel" id="tabpanel-feedback">
                <RiskReviewSettingsPanel
                  settings={riskReviewSettings}
                  loading={loadingAction === "risk-review-settings"}
                  onSave={saveRiskReviewSettings}
                />
                <div className="mb-4 space-y-3 rounded-lg border border-[#adb3b4]/20 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Flag size={15} className="text-[#5a6061]" />
                        <h3 className="text-sm font-semibold text-[#202829]">反馈工作台</h3>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#5a6061]">
                        先按反馈性质分流，轻量核验只给处理建议；下架报价或渠道需要选中后确认执行。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void refreshSiteFeedback(feedbackStatusFilter);
                          void refreshOfferFeedback(feedbackStatusFilter);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                      >
                        <RefreshCcw size={14} />
                        刷新
                      </button>
                      {feedbackStatusFilter === "pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={toggleAllVisibleFeedback}
                            disabled={!filteredOfferFeedback.length || feedbackFilter === "site"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                          >
                            <Check size={14} />
                            {selectedFeedbackIds.size ? "取消选择" : "选择当前"}
                          </button>
                          <button
                            type="button"
                            onClick={() => batchUpdateSelectedOfferFeedback("resolved")}
                            disabled={!safeBatchFeedback.length || loadingAction === "batch-feedback-resolved"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-50"
                          >
                            {loadingAction === "batch-feedback-resolved" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            批量已处理 ({safeBatchFeedback.length})
                          </button>
                          <button
                            type="button"
                            onClick={batchHideSelectedFeedbackOffers}
                            disabled={!selectedFeedbackWithOffer.length || loadingAction === "batch-feedback-hide-offer"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                          >
                            {loadingAction === "batch-feedback-hide-offer" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            批量下架报价 ({selectedFeedbackWithOffer.length})
                          </button>
                          <button
                            type="button"
                            onClick={batchHideSelectedFeedbackSources}
                            disabled={!selectedFeedbackWithSource.length || loadingAction === "batch-feedback-hide-source"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                          >
                            {loadingAction === "batch-feedback-hide-source" ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />}
                            批量下架渠道 ({selectedFeedbackWithSource.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => batchUpdateSelectedOfferFeedback("ignored")}
                            disabled={!selectedFeedbackIds.size || loadingAction === "batch-feedback-ignored"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                          >
                            {loadingAction === "batch-feedback-ignored" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                            批量忽略
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {feedbackStatusOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          feedbackStatusFilterRef.current = item.value;
                          setFeedbackStatusFilter(item.value);
                          void refreshSiteFeedback(item.value);
                          void refreshOfferFeedback(item.value);
                        }}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                          feedbackStatusFilter === item.value
                            ? "bg-[#2d3435] text-white"
                            : "bg-[#f2f4f4] text-[#5a6061] hover:bg-[#e4e9ea]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {feedbackWorkFilters.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setFeedbackFilter(item.value)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                          feedbackFilter === item.value
                            ? "bg-[#2d3435] text-white"
                            : "bg-[#f2f4f4] text-[#5a6061] hover:bg-[#e4e9ea]"
                        }`}
                      >
                        {item.label}
                        <span className={feedbackFilter === item.value ? "text-white/70" : "text-[#adb3b4]"}>
                          {feedbackFilterCounts[item.value]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#adb3b4]">
                    <span>当前状态：{feedbackStatusLabel(feedbackStatusFilter)}</span>
                    <span>{siteFeedback.length} 条站点意见</span>
                    <span>{offerFeedback.length} 条报价举报</span>
                    {feedbackStatusFilter === "pending" ? <span>已选 {selectedFeedbackIds.size} 条</span> : null}
                  </div>
                </div>
                <div className="space-y-6">
                  {(feedbackFilter === "all" || feedbackFilter === "site") && (
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <MessageCircle size={15} className="text-[#5a6061]" />
                      <h3 className="text-sm font-semibold text-[#202829]">站点意见</h3>
                    </div>
                    <SiteFeedbackList
                      feedback={siteFeedback}
                      statusFilter={feedbackStatusFilter}
                      loadingAction={loadingAction}
                      rowFeedback={rowFeedback}
                      onResolve={(item) => updateSiteFeedbackStatus(item, "resolved", "已人工确认处理")}
                      onIgnore={(item) => updateSiteFeedbackStatus(item, "ignored", "已忽略")}
                    />
                  </section>
                  )}
                  {feedbackFilter !== "site" && (
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <Flag size={15} className="text-[#5a6061]" />
                      <h3 className="text-sm font-semibold text-[#202829]">报价举报</h3>
                    </div>
                    <OfferFeedbackList
                      feedback={filteredOfferFeedback}
                      statusFilter={feedbackStatusFilter}
                      offerById={offerById}
                      productByKey={productByKey}
                      loadingAction={loadingAction}
                      rowFeedback={rowFeedback}
                      selectedIds={selectedFeedbackIds}
                      onToggleSelect={toggleFeedbackSelect}
                      onHideOffer={hideOfferFromFeedback}
                      onHideSource={hideSourceFromFeedback}
                      onAutoVerify={runFeedbackAutoVerification}
                      onRecollect={createFeedbackRecollection}
                      onRiskPrecheck={runFeedbackRiskPrecheck}
                      onRiskVisibility={updateFeedbackRiskVisibility}
                      onUpdateVerification={updateFeedbackVerification}
                      onResolve={(item) => updateFeedbackStatus(item, "resolved", "已人工确认处理")}
                      onIgnore={(item) => updateFeedbackStatus(item, "ignored", "已忽略")}
                    />
                  </section>
                  )}
                </div>
              </div>
            )}

            {/* Sponsors tab */}
            {activeTab === "sponsors" && (
              <div role="tabpanel" id="tabpanel-sponsors">
                <SponsorSettingsPanel
                  key={sponsorSettings.updatedAt || sponsorSettings.message || "sponsor-settings"}
                  settings={sponsorSettings}
                  loading={loadingAction === "sponsor-settings"}
                  onSave={saveSponsorSettings}
                />
              </div>
            )}

            {/* Security tab */}
            {activeTab === "security" && (
              <div role="tabpanel" id="tabpanel-security">
                <AdminPasswordPanel
                  status={passwordStatus}
                  draft={passwordDraft}
                  loading={loadingAction === "admin-password"}
                  onDraftChange={setPasswordDraft}
                  onSubmit={saveAdminPassword}
                />
              </div>
            )}

            {/* History tab */}
            {activeTab === "history" && (
              <div role="tabpanel" id="tabpanel-history">
                <div className="mb-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={historyLoading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                  >
                    {historyLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                    刷新
                  </button>
                  <span className="text-xs text-[#adb3b4]">{historySubmissions.length} 条记录</span>
                </div>
                {historyLoading && !historySubmissions.length ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[#adb3b4]" />
                  </div>
                ) : historySubmissions.length ? (
                  <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
                    <div className="hidden grid-cols-[1fr_100px_120px_180px] gap-3 border-b border-[#adb3b4]/20 bg-[#f2f4f4] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#5a6061] md:grid">
                      <span>渠道</span>
                      <span>状态</span>
                      <span>审核人备注</span>
                      <span>处理时间</span>
                    </div>
                    <div className="divide-y divide-[#adb3b4]/15">
                      {historySubmissions.map((s) => (
                        <div key={s.id} className="grid gap-2 bg-white px-4 py-3 md:grid-cols-[1fr_100px_120px_180px] md:items-center">
                          <div className="min-w-0">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-[#2d3435] hover:text-[#47657a]"
                            >
                              {s.name || s.parsedTitle || s.url}
                            </a>
                            <p className="mt-0.5 truncate text-xs text-[#adb3b4]">{s.url}</p>
                          </div>
                          <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.status === "approved"
                              ? "bg-[#e8f3ec] text-[#2f7a4b]"
                              : "bg-[#fbe9e7] text-[#9b3328]"
                          }`}>
                            {s.status === "approved" ? "已通过" : "已拒绝"}
                          </span>
                          <span className="truncate text-xs text-[#5a6061]">{s.reviewerNote || "-"}</span>
                          <span className="text-xs text-[#adb3b4]">{s.reviewedAt ? formatRelativeTime(s.reviewedAt) : "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={<History size={32} className="text-[#adb3b4]" />}
                    title="暂无历史记录"
                    description="审核通过或拒绝的提交会出现在这里。"
                  />
                )}
              </div>
            )}

            {/* Collect tab */}
            {activeTab === "collect" && (
              <div role="tabpanel" id="tabpanel-collect" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="space-y-4">
                  <Panel title="数据同步" icon={<RefreshCcw size={17} />}>
                    <ActionRow
                      title="重建标准商品分类"
                      description="按最新粗粒度规则重新归类已有报价。"
                      buttonLabel="重建分类"
                      buttonIcon={<Database size={15} />}
                      loading={loadingAction === "reclassify-offers"}
                      onClick={reclassifyOffers}
                    />
                    <Divider />
                    <ActionRow
                      title="立即采集所有卡网"
                      description="创建全量采集任务，由国内 VPS 执行器领取并执行。"
                      buttonLabel="加入队列"
                      buttonIcon={<RefreshCcw size={15} />}
                      loading={loadingAction === "collect-prices"}
                      onClick={collectPrices}
                      primary
                    />
                  </Panel>

                  <Panel title="自动采集与浏览器兜底" icon={<TerminalSquare size={17} />}>
                    <p className="text-sm leading-6 text-[#5a6061]">
                      后台按钮只创建采集任务；国内 VPS worker 定时领取 pending 任务并执行。`/api/cron/collect-prices` 保留为调试或特殊备用入口。
                    </p>
                    <div className="mt-3 space-y-2">
                      <code className="block overflow-x-auto rounded-lg bg-[#202829] px-3 py-2.5 font-mono text-xs leading-6 text-[#f2f4f4]">
                        npm run collect:worker
                      </code>
                      <code className="block overflow-x-auto rounded-lg bg-[#202829] px-3 py-2.5 font-mono text-xs leading-6 text-[#f2f4f4]">
                        {"npm run collect:browser -- --url https://aisou.pro/ --password <后台密码> --post"}
                      </code>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#adb3b4]">
                      本页不会显示真实后台密码。生产环境请配置 `CRON_SECRET`。
                    </p>
                  </Panel>
                </section>

                <div className="space-y-5">
                  <CollectionJobsPanel jobs={data.collectionJobs.slice(0, 8)} />
                  <CollectorStatusSnapshot status={collectorStatus} onRefresh={refreshCollectorStatus} />
                  <RecentRunsPanel runs={collectorStatus.crawlRuns.slice(0, 8)} />
                </div>
              </div>
            )}

            {/* Health tab */}
            {activeTab === "health" && (
              <div role="tabpanel" id="tabpanel-health">
                <div className="mb-5">
                  <CollectorStatusSnapshot status={collectorStatus} onRefresh={refreshCollectorStatus} />
                </div>
                <CollectorHealthPanel health={collectorStatus.collectorHealth} />
              </div>
            )}

            {/* Official prices tab */}
            {activeTab === "official" && (
              <div role="tabpanel" id="tabpanel-official">
                <OfficialPricesAdminPanel
                  data={officialPrices}
                  loadingAction={loadingAction}
                  probeResult={officialProbeResult}
                  onProbe={probeOfficialPrices}
                  onEnqueueWeeklyCollection={() => enqueueOfficialPriceCollection("weekly_full")}
                  onEnqueueFxRefresh={() => enqueueOfficialPriceCollection("fx_only")}
                  onCopyCommand={copyOfficialCollectorCommand}
                  onToggleAppEnabled={toggleOfficialAppEnabled}
                  onTogglePlanEnabled={toggleOfficialPlanEnabled}
                  onToggleRegionEnabled={toggleOfficialRegionEnabled}
                  onUpdatePriceStatus={updateOfficialPriceStatus}
                />
              </div>
            )}

            {/* API models tab */}
            {activeTab === "apiModels" && (
              <div role="tabpanel" id="tabpanel-apiModels">
                <ApiModelsAdminPanel
                  data={apiModels}
                  loadingAction={loadingAction}
                  probeResult={apiModelProbeResult}
                  onProbe={probeApiModels}
                  onCopyImportCommand={copyApiModelImportCommand}
                  onCopyCollectorCommand={copyApiModelCollectorCommand}
                  onEnqueueCollection={enqueueApiModelCollection}
                  onToggleProviderEnabled={toggleApiProviderEnabled}
                  onToggleOfferStatus={toggleApiOfferStatus}
                  onReviewProviderSubmission={reviewApiProviderSubmission}
                  onSaveEditable={saveApiModelEditable}
                />
              </div>
            )}

            {/* API transit tab */}
            {activeTab === "apiTransit" && (
              <div role="tabpanel" id="tabpanel-apiTransit">
                <ApiTransitAdminPanel data={data.apiTransit} />
              </div>
            )}

            {/* Sources tab */}
            {activeTab === "sources" && (
              <div role="tabpanel" id="tabpanel-sources">
                <Panel title="总渠道源" icon={<Store size={17} />}>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleAllSources}
                      disabled={!activeSourceGroup || !filteredSourceRows.length}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      <Check size={14} />
                      {selectedSourceIds.size ? "取消全选" : "全选当前"}
                    </button>
                    <button
                      type="button"
                      onClick={batchCollectSelectedSources}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-collect-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2d3435] px-3 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-50"
                    >
                      {loadingAction === "batch-collect-sources" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      批量重采
                    </button>
                    <button
                      type="button"
                      onClick={copySelectedBrowserCommands}
                      disabled={!activeSourceGroup || !selectedSourceIds.size}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      <TerminalSquare size={14} />
                      复制采集命令
                    </button>
                    <button
                      type="button"
                      onClick={copySelectedCollectorContexts}
                      disabled={!activeSourceGroup || !selectedSourceIds.size}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      <Copy size={14} />
                      复制上下文
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSources(false)}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-disable-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      停用
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSources(true)}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-enable-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      启用
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSourceOffers(true)}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-hide-source-offers"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                    >
                      下架报价
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSourceOffers(false)}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-restore-source-offers"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-50"
                    >
                      恢复报价
                    </button>
                    <button
                      type="button"
                      onClick={batchDeleteSelectedSources}
                      disabled={!activeSourceGroup || !selectedSourceIds.size || loadingAction === "batch-delete-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                    {selectedSourceIds.size > 0 && (
                      <span className="text-xs text-[#adb3b4]">已选 {selectedSourceIds.size} 个</span>
                    )}
                  </div>
                  <SourceTable
                    overviewGroups={sourceOverviewGroups}
                    activeGroup={activeSourceGroup}
                    filteredSources={filteredSourceRows}
                    filters={sourceFilters}
                    offerCountBySource={offerCountBySource}
                    sourceStatsById={sourceStatsById}
                    loadingAction={loadingAction}
                    feedback={rowFeedback}
                    selectedIds={selectedSourceIds}
                    onSelectGroup={(groupKey) => {
                      setActiveSourceGroupKey(groupKey);
                      setSelectedSourceIds(new Set());
                    }}
                    onBackToGroups={() => {
                      setActiveSourceGroupKey(null);
                      setSelectedSourceIds(new Set());
                    }}
                    onFiltersChange={setSourceFilters}
                    onToggleSelect={toggleSourceSelect}
                    onRetry={collectSource}
                    onCopyBrowserCommand={copyBrowserCommand}
                    onCopyCollectorContext={copySourceCollectorContext}
                    onToggleEnabled={toggleSourceEnabled}
                    onToggleOffersVisibility={toggleSourceOffersVisibility}
                    onDeleteSource={deleteSourceRow}
                  />
                </Panel>
              </div>
            )}

            {/* Manual tab */}
            {activeTab === "manual" && (
              <div role="tabpanel" id="tabpanel-manual" className="grid gap-5 lg:grid-cols-2">
                <Panel title="新增来源" icon={<Plus size={17} />}>
                  <form onSubmit={submitSource} className="space-y-3">
                    <TextInput name="name" label="来源名称" placeholder="例如 Aisou智充" />
                    <TextInput name="entryUrl" label="入口链接" placeholder="https://example.com/" type="url" />
                    <TextInput name="baseUrl" label="主域名" placeholder="https://example.com" type="url" required={false} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#5a6061]">采集方式</span>
                      <select name="collectionMethod" className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]">
                        <option value="http">自动接口采集</option>
                        <option value="browser">浏览器采集</option>
                        <option value="manual">采集器待办</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#5a6061]">解析器</span>
                      <select name="collectorKind" className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]">
                        {collectorKindOptions.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <TextArea name="notes" label="备注" placeholder="采集限制、WAF、登录要求等" required={false} />
                    <SubmitButton loading={loadingAction === "source"} label="保存来源" />
                  </form>
                </Panel>

                <Panel title="调试补录报价" icon={<FileInput size={17} />}>
                  <p className="mb-3 text-xs leading-5 text-[#adb3b4]">
                    仅用于排查分类和展示，不作为渠道长期维护方式。
                  </p>
                  <form onSubmit={submitOffer} className="space-y-3">
                    <TextInput name="sourceName" label="来源名称" placeholder="例如 LDXP Pixelshop" />
                    <TextInput name="sourceUrl" label="来源入口" placeholder="https://pay.ldxp.cn/shop/pixelshop" type="url" />
                    <TextInput name="sourceStoreName" label="店铺名称" placeholder="可留空" required={false} />
                    <TextArea name="sourceTitle" label="原始商品名" placeholder="复制卡网里的完整商品名" />
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput name="price" label="价格" placeholder="35" type="number" />
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[#5a6061]">状态</span>
                        <select name="status" className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]">
                          {statusOptions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <TextInput name="url" label="购买链接" placeholder="https://example.com/item/xxx" type="url" />
                    <TextInput name="tags" label="标签" placeholder="无质保, 自动发货" required={false} />
                    <SubmitButton loading={loadingAction === "manual-offer"} label="保存报价" />
                  </form>
                </Panel>

                <div className="lg:col-span-2">
                  <Panel title="报价应急处置" icon={<AlertTriangle size={17} />}>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm leading-6 text-[#5a6061]">
                        可临时下架单条异常报价；下架后前台立即隐藏，后续采集不会自动恢复。恢复只影响管理员手动下架的报价。
                      </div>
                      <div className="relative w-full sm:w-80">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
                        <input
                          value={offerSearchQuery}
                          onChange={(event) => setOfferSearchQuery(event.target.value)}
                          placeholder="搜索商品、渠道或链接"
                          className="h-9 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <OfferEmergencyList
                        title="当前可见报价"
                        emptyText="没有匹配的可见报价。"
                        offers={offerMaintenance.visible.offers}
                        productByKey={productByKey}
                        totalCount={offerMaintenance.visible.total}
                        loading={offerMaintenance.visible.loading}
                        loadingMore={offerMaintenance.visible.loadingMore}
                        error={offerMaintenance.visible.error}
                        loadingAction={loadingAction}
                        actionLabel="下架"
                        actionTone="danger"
                        hiddenAction
                        onLoadMore={() => loadOfferMaintenancePage("visible")}
                        onToggleHidden={toggleOfferHidden}
                      />
                      <OfferEmergencyList
                        title="手动下架报价"
                        emptyText="没有匹配的手动下架报价。"
                        offers={offerMaintenance.hidden.offers}
                        productByKey={productByKey}
                        totalCount={offerMaintenance.hidden.total}
                        loading={offerMaintenance.hidden.loading}
                        loadingMore={offerMaintenance.hidden.loadingMore}
                        error={offerMaintenance.hidden.error}
                        loadingAction={loadingAction}
                        actionLabel="恢复"
                        actionTone="success"
                        hiddenAction={false}
                        onLoadMore={() => loadOfferMaintenancePage("hidden")}
                        onToggleHidden={toggleOfferHidden}
                      />
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && (
              <div role="tabpanel" id="tabpanel-logs" className="space-y-5">
                <CollectorStatusSnapshot status={collectorStatus} onRefresh={refreshCollectorStatus} />
                <RecentRunsPanel runs={collectorStatus.crawlRuns} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ─── Shared Components ─── */

function SubmissionCard({
  submission,
  existingSource,
  loadingAction,
  probeResult,
  expanded,
  focused,
  selected,
  selectable,
  feedback,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onProbe,
  onReparse,
  onTodo,
  onReject,
  onIgnoreSameChannel,
}: {
  submission: ChannelSubmission;
  existingSource?: Source | null;
  loadingAction: string | null;
  probeResult?: ProbeResult;
  expanded: boolean;
  focused: boolean;
  selected: boolean;
  selectable: boolean;
  feedback: RowFeedback | null;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onApprove: (submission: ChannelSubmission, overrides: { name?: string; sourceUrl?: string; collectionMethod?: CollectionMethod; collectorKind?: CollectorKind }) => void;
  onProbe: (submission: ChannelSubmission) => void;
  onReparse: (submission: ChannelSubmission) => void;
  onTodo: (submission: ChannelSubmission, note: string) => void;
  onReject: (submission: ChannelSubmission, note: string) => void;
  onIgnoreSameChannel: (submission: ChannelSubmission) => void;
}) {
  const meta = submission.parsedMeta || {};
  const domain = typeof meta.domain === "string" ? meta.domain : safeDomain(submission.url);
  const platform = typeof meta.platform === "string" ? meta.platform : null;
  const productType = typeof meta.product_type === "string" ? meta.product_type : null;
  const suggestedName = stringMeta(meta, "suggested_source_name");
  const suggestedSourceId = stringMeta(meta, "suggested_source_id");
  const suggestedMethod = collectionMethodMeta(meta, "suggested_collection_method");
  const suggestedCollector = collectorKindMeta(meta, "suggested_collector_kind");
  const supportReason = stringMeta(meta, "support_reason");
  const canonicalSourceUrl = displayableCanonicalSourceUrlForSubmission(submission);
  const canonicalSourceStatus = stringMeta(meta, "canonical_source_status");
  const canonicalSourceReason = stringMeta(meta, "canonical_source_reason");
  const sameChannelPendingName = stringMeta(meta, "duplicate_pending_submission_name");
  const sameChannelPendingId = stringMeta(meta, "duplicate_pending_submission_id");
  const submittedUrlType = stringMeta(meta, "submitted_url_type");
  const parseError = typeof meta.parse_error === "string" ? meta.parse_error : null;
  const productPreview = submissionProductPreviewFromMeta(meta);
  const currentProbe = probeResult || probeResultFromMeta(meta);
  const hasSuccessfulProbe = currentProbe?.status === "success" && currentProbe.offerCount > 0;
  const hasKnownCollector = isRunnableCollector(suggestedCollector);
  const hasValidSourceUrl = Boolean(canonicalSourceUrl || submittedUrlType !== "product");
  const sameChannelPending = Boolean(sameChannelPendingName || sameChannelPendingId);
  const canApprove = hasValidSourceUrl && Boolean(existingSource || hasSuccessfulProbe || hasKnownCollector);

  const [mode, setMode] = useState<"idle" | "approve" | "todo" | "reject">("idle");
  const [name, setName] = useState(submission.name || suggestedName || submission.parsedTitle || "");
  const [sourceUrl, setSourceUrl] = useState(canonicalSourceUrl || submission.url);
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>(suggestedMethod || "http");
  const [collectorKind, setCollectorKind] = useState<CollectorKind>(suggestedCollector || "auto");
  const [collectorNote, setCollectorNote] = useState(
    stringMeta(meta, "collector_todo_reason") || stringMeta(meta, "support_reason") || "",
  );
  const [reviewerNote, setReviewerNote] = useState("");

  const recommendedMethod: CollectionMethod = hasSuccessfulProbe || isRunnableCollector(collectorKind) ? "http" : suggestedMethod || collectionMethod || "http";
  const recommendedCollector: CollectorKind = hasSuccessfulProbe
    ? collectorKindMeta({ value: currentProbe?.kind || "" }, "value") || collectorKind || "auto"
    : collectorKind || "auto";
  const approveLoading = loadingAction === `approve-${submission.id}`;
  const probeLoading = loadingAction === `probe-${submission.id}`;
  const reparseLoading = loadingAction === `reparse-${submission.id}`;
  const todoLoading = loadingAction === `todo-${submission.id}`;
  const rejectLoading = loadingAction === `reject-${submission.id}`;
  const ignoreSameChannelLoading = loadingAction === `ignore-same-channel-${submission.id}`;

  const probeStatusBadge = currentProbe ? (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      currentProbe.status === "success"
        ? "bg-[#e8f3ec] text-[#2f7a4b]"
        : currentProbe.status === "failed"
          ? "bg-[#fbe9e7] text-[#9b3328]"
          : "bg-[#fff7e8] text-[#7a541b]"
    }`}>
      {currentProbe.status === "success"
        ? `可采集 ${currentProbe.offerCount} 条`
        : currentProbe.status === "empty"
          ? "未采到报价"
          : currentProbe.status === "unsupported"
            ? "暂不支持"
            : "采集失败"}
    </span>
  ) : null;

  return (
    <div
      className={`rounded-lg border bg-white transition-all ${
        feedback?.type === "success"
          ? "border-[#2f7a4b]/30 bg-[#e8f3ec]/30"
          : feedback?.type === "error"
            ? "border-[#9b3328]/30 bg-[#fbe9e7]/30"
            : focused
              ? "border-[#2d3435]/40 ring-1 ring-[#2d3435]/10"
              : selected
                ? "border-[#2f7a4b]/30"
                : "border-[#adb3b4]/20 hover:border-[#adb3b4]/40"
      }`}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`选择 ${submission.parsedTitle || submission.name || submission.url}`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              selected
                ? "border-[#2f7a4b] bg-[#2f7a4b] text-white"
                : "border-[#adb3b4]/40 hover:border-[#2d3435]"
            }`}
          >
            {selected && <Check size={12} strokeWidth={3} />}
          </button>
        )}
        {!selectable && <div className="w-5 shrink-0" />}

        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#2d3435]">
                {submission.parsedTitle || submission.name || suggestedName || domain || submission.url}
              </span>
              {domain && <span className="text-xs text-[#adb3b4]">{domain}</span>}
              <span className="text-xs text-[#adb3b4]">{formatRelativeTime(submission.createdAt)}</span>
            </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {probeStatusBadge}
              {submittedUrlType === "product" && <Badge tone="info">商品链接</Badge>}
              {canonicalSourceStatus === "resolved" && <Badge tone="info">已反查渠道</Badge>}
              {canonicalSourceStatus === "unresolved" && <Badge tone="warn">未反查渠道</Badge>}
              {platform && <Badge>{platform}</Badge>}
              {productType && <Badge>{productType}</Badge>}
              {existingSource && <Badge tone="info">已有源: {existingSource.name}</Badge>}
              {sameChannelPending && <Badge tone="warn">同渠道还有提交</Badge>}
              {parseError && <Badge tone="warn">解析失败</Badge>}
            </div>
          </div>
          <ChevronDown size={16} className={`shrink-0 text-[#adb3b4] transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        {/* Quick action in collapsed state */}
        {!expanded && (
          <div className="flex shrink-0 gap-1.5">
            {canApprove ? (
              <button
                type="button"
                disabled={approveLoading}
                onClick={(e) => { e.stopPropagation(); onApprove(submission, { name, sourceUrl, collectionMethod: recommendedMethod, collectorKind: recommendedCollector }); }}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#2f7a4b] px-3 text-xs font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
              >
                {approveLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                通过
              </button>
            ) : !currentProbe ? (
              <button
                type="button"
                disabled={probeLoading}
                onClick={(e) => { e.stopPropagation(); onProbe(submission); }}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#2d3435] px-3 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60"
              >
                {probeLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                试采集
              </button>
            ) : sameChannelPending ? (
              <button
                type="button"
                disabled={ignoreSameChannelLoading}
                onClick={(e) => { e.stopPropagation(); onIgnoreSameChannel(submission); }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#9b3328]/25 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
              >
                {ignoreSameChannelLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                忽略此项
              </button>
            ) : (
              <span className="inline-flex h-8 items-center rounded-lg bg-[#fff7e8] px-3 text-xs font-medium text-[#7a541b]">
                建议转待办
              </span>
            )}
          </div>
        )}
      </div>

      {/* Row feedback */}
      {feedback && (
        <div className={`mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${rowFeedbackClass(feedback.type)}`}>
          {feedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {feedback.text}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#adb3b4]/15 px-4 py-4">
          <div className="space-y-1.5 text-xs">
            <UrlLine label="提交链接" href={submission.url} />
            {canonicalSourceUrl && canonicalSourceUrl !== submission.url && (
              <UrlLine label="建议渠道入口" href={canonicalSourceUrl} tone="strong" />
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestedMethod && <Badge tone="info">建议: {collectionMethodLabel(suggestedMethod)}</Badge>}
            {suggestedCollector && <Badge tone="info">采集器: {collectorKindLabel(suggestedCollector)}</Badge>}
            {submission.contact && <Badge tone="info">联系: {submission.contact}</Badge>}
          </div>

          <div className="mt-3 grid gap-2 rounded-lg bg-[#f2f4f4] p-3 text-xs text-[#5a6061] sm:grid-cols-2">
            <p><span className="font-medium text-[#2d3435]">建议渠道名：</span>{suggestedName || submission.name || domain || "未识别"}</p>
            <p><span className="font-medium text-[#2d3435]">建议来源 ID：</span>{suggestedSourceId || "自动生成"}</p>
            <p><span className="font-medium text-[#2d3435]">建议采集方式：</span>{collectionMethodLabel(suggestedMethod || "browser")}</p>
            <p><span className="font-medium text-[#2d3435]">建议解析器：</span>{collectorKindLabel(suggestedCollector || "auto")}</p>
            <p><span className="font-medium text-[#2d3435]">初步判断：</span>{supportReason || "已完成基础链接解析。"}</p>
            {canonicalSourceReason && <p><span className="font-medium text-[#2d3435]">渠道解析：</span>{canonicalSourceReason}</p>}
            {existingSource && <p><span className="font-medium text-[#2d3435]">合并目标：</span>{existingSource.name}</p>}
            {sameChannelPending && <p><span className="font-medium text-[#2d3435]">同渠道提交：</span>{sameChannelPendingName || "还有一条同渠道提交"}</p>}
          </div>

          {sameChannelPending && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#fff7e8]/70 px-3 py-2.5 text-xs text-[#7a541b]">
              <Trash2 size={14} className="mt-0.5 shrink-0" />
              <span>还有一条同渠道提交待处理；这只是提示，不影响当前记录通过。确认要保留另一条时，再忽略当前项。</span>
            </div>
          )}

          {productPreview && <SubmissionProductPreviewPanel preview={productPreview} productUrl={submittedUrlType === "product" ? submission.url : null} />}

          {submission.notes && <p className="mt-2 text-xs text-[#5a6061]">备注：{submission.notes}</p>}

          {currentProbe && <ProbePreview result={currentProbe} />}

          {/* Next-step recommendation for probe failures */}
          {currentProbe && currentProbe.status !== "success" && mode === "idle" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#fff7e8] px-3 py-2.5 text-xs text-[#7a541b]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {sameChannelPending
                  ? "这条还有同渠道提交；如果保留另一条，可以忽略这条。"
                  : hasKnownCollector
                  ? "已识别可用解析器，但本次试采集失败；可以先确认解析器入库，后续云端和本地采集脚本都会继续尝试。"
                  : "该渠道暂不支持自动采集，建议转入采集器待办或拒绝。"}
              </span>
            </div>
          )}

          {/* Action buttons */}
          {mode === "idle" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canApprove && (
                <button
                  type="button"
                  disabled={approveLoading}
                  onClick={() => onApprove(submission, { name, sourceUrl, collectionMethod: recommendedMethod, collectorKind: recommendedCollector })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-xs font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
                >
                  {approveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {existingSource
                    ? `合并到 ${existingSource.name}`
                    : hasSuccessfulProbe
                      ? `通过并入库 ${currentProbe?.offerCount || 0} 条`
                      : "通过并加入渠道"}
                </button>
              )}
              {canApprove && (
                <button
                  type="button"
                  onClick={() => setMode("approve")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                >
                  编辑后通过
                </button>
              )}
              {sameChannelPending && (
                <button
                  type="button"
                  disabled={ignoreSameChannelLoading}
                  onClick={() => onIgnoreSameChannel(submission)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9b3328]/25 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                >
                  {ignoreSameChannelLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  忽略此项
                </button>
              )}
              {!currentProbe && (
                <button
                  type="button"
                  disabled={probeLoading}
                  onClick={() => onProbe(submission)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60"
                >
                  {probeLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  试采集
                </button>
              )}
              <button
                type="button"
                disabled={reparseLoading}
                onClick={() => onReparse(submission)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
              >
                {reparseLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                重新解析
              </button>
              {currentProbe && !canApprove && (
                <button
                  type="button"
                  disabled={probeLoading}
                  onClick={() => onProbe(submission)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                >
                  {probeLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  重新试采集
                </button>
              )}
              {currentProbe && !canApprove && !sameChannelPending && (
                <button
                  type="button"
                  onClick={() => setMode("todo")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7a541b] px-4 text-xs font-medium text-white transition-colors hover:bg-[#5a3d10] disabled:opacity-60"
                >
                  <TerminalSquare size={14} />
                  转入待办
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("reject")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7]"
              >
                <X size={14} />
                拒绝
              </button>
            </div>
          )}

          {/* Approve form */}
          {mode === "approve" && (
            <div className="mt-4 space-y-3 rounded-lg border border-[#2f7a4b]/20 bg-[#e8f3ec]/20 p-4">
              <p className="text-xs leading-5 text-[#2f7a4b]">
                {existingSource
                  ? `合并到已有源「${existingSource.name}」。`
                  : hasSuccessfulProbe
                    ? "该提交会创建渠道，并把试采集结果入库。"
                    : "该提交会创建渠道，后续由已支持解析器自动采集。"}
              </p>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#5a6061]">渠道名称</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                  placeholder={domain || "渠道名称"}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#5a6061]">渠道入口链接</span>
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                  placeholder={canonicalSourceUrl || submission.url}
                />
                <span className="mt-1 block text-[11px] leading-4 text-[#5a6061]">
                  用户误提交商品链接时，在这里填真正的店铺入口；审核通过会按这个入口入库。
                </span>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#5a6061]">采集方式</span>
                <select
                  value={collectionMethod}
                  onChange={(e) => setCollectionMethod(e.target.value as CollectionMethod)}
                  className="h-9 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                >
                  <option value="http">自动接口采集</option>
                  <option value="browser">浏览器采集</option>
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#5a6061]">解析器</span>
                <select
                  value={collectorKind}
                  onChange={(e) => setCollectorKind(e.target.value as CollectorKind)}
                  className="h-9 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                >
                  {collectorKindOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={approveLoading}
                  onClick={() => onApprove(submission, { name, sourceUrl, collectionMethod, collectorKind })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-xs font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
                >
                  {approveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  确认通过并入库
                </button>
                <button
                  type="button"
                  onClick={() => setMode("idle")}
                  className="inline-flex h-9 items-center rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Todo form */}
          {mode === "todo" && (
            <div className="mt-4 space-y-3 rounded-lg border border-amber-200/40 bg-[#fff7e8]/50 p-4">
              <p className="text-xs leading-5 text-[#7a541b]">
                这个渠道暂时不进入比价库，保留为采集器待办。补解析脚本后可以重新试采集。
              </p>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#7a541b]">待办说明</span>
                <input
                  value={collectorNote}
                  onChange={(e) => setCollectorNote(e.target.value)}
                  className="h-9 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm outline-none transition-colors focus:border-[#7a541b]"
                  placeholder="如：需要新增该域名解析脚本"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={todoLoading}
                  onClick={() => onTodo(submission, collectorNote)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#7a541b] px-4 text-xs font-medium text-white transition-colors hover:bg-[#5a3d10] disabled:opacity-60"
                >
                  {todoLoading ? <Loader2 size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
                  加入采集器待办
                </button>
                <button
                  type="button"
                  onClick={() => setMode("idle")}
                  className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8]"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Reject form */}
          {mode === "reject" && (
            <div className="mt-4 space-y-3 rounded-lg border border-[#9b3328]/15 bg-[#fbe9e7]/20 p-4">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-[#9b3328]">拒绝备注（可选）</span>
                <input
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#9b3328]/20 bg-white px-3 text-sm outline-none transition-colors focus:border-[#9b3328]"
                  placeholder="如：重复 / 不相关 / 失效"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={rejectLoading}
                  onClick={() => onReject(submission, reviewerNote)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#9b3328] px-4 text-xs font-medium text-white transition-colors hover:bg-[#7d2820] disabled:opacity-60"
                >
                  {rejectLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  确认拒绝
                </button>
                <button
                  type="button"
                  onClick={() => setMode("idle")}
                  className="inline-flex h-9 items-center rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionProductPreviewPanel({ preview, productUrl }: { preview: SubmissionProductPreview; productUrl?: string | null }) {
  const hasPrice = typeof preview.price === "number";
  const statusText = preview.statusText || preview.status || null;
  return (
    <div className="mt-3 rounded-lg bg-[#f8f8f8] px-3 py-3 text-xs text-[#5a6061] ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-[#2d3435]">商品摘要</span>
            {statusText && (
              <span className={`rounded-full px-2 py-0.5 font-medium ${
                statusText === "上架"
                  ? "bg-[#e8f3ec] text-[#2f7a4b]"
                  : "bg-[#fff7e8] text-[#7a541b]"
              }`}>
                {statusText}
              </span>
            )}
            {preview.category && <Badge>{preview.category}</Badge>}
          </div>
          {preview.title ? (
            <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">{preview.title}</p>
          ) : (
            <p className="mt-1 text-sm font-medium leading-6 text-[#7a541b]">
              {preview.apiMessage || "商品接口未返回可展示商品。"}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {hasPrice ? (
            <p className="text-sm font-semibold text-[#2d3435]">{formatCurrency(preview.price ?? null, preview.currency || "CNY")}</p>
          ) : (
            <p className="text-xs text-[#adb3b4]">暂无价格</p>
          )}
          {preview.realPrice !== undefined && preview.realPrice !== preview.price ? (
            <p className="mt-0.5 text-[11px] text-[#adb3b4]">实付 {formatCurrency(preview.realPrice, preview.currency || "CNY")}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#5a6061]">
        {preview.sourceName && <span>店铺：{preview.sourceName}</span>}
        {preview.sourceUrl && (
          <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#47657a] hover:text-[#2d3435]">
            店铺入口
          </a>
        )}
        {productUrl && (
          <a href={productUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#47657a] hover:text-[#2d3435]">
            商品详情
          </a>
        )}
        {preview.checkedAt && <span>接口：{formatRelativeTime(preview.checkedAt)}</span>}
      </div>
      {preview.descriptionPreview && (
        <p className="mt-2 line-clamp-2 leading-5 text-[#5a6061]">简介：{preview.descriptionPreview}</p>
      )}
      {preview.apiMessage && preview.title && (
        <p className="mt-1 text-[11px] leading-4 text-[#adb3b4]">接口返回：{preview.apiMessage}</p>
      )}
    </div>
  );
}

function ProbePreview({ result }: { result: ProbeResult }) {
  return (
    <div className="mt-3 rounded-lg border border-[#adb3b4]/20 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          result.status === "success"
            ? "bg-[#e8f3ec] text-[#2f7a4b]"
            : result.status === "failed"
              ? "bg-[#fbe9e7] text-[#9b3328]"
              : "bg-[#fff7e8] text-[#7a541b]"
        }`}>
          {result.status === "success" ? "可自动采集" : result.status === "empty" ? "未采到报价" : result.status === "unsupported" ? "暂不支持" : "采集失败"}
        </span>
        <span className="text-xs text-[#adb3b4]">采集器：{collectorKindLabel(result.kind || "auto")}</span>
        <span className="text-xs text-[#adb3b4]">报价：{result.offerCount} 条</span>
        {typeof result.ms === "number" && <span className="text-xs text-[#adb3b4]">耗时：{result.ms}ms</span>}
      </div>
      {result.message && <p className="mt-2 text-xs leading-5 text-[#5a6061]">{result.message}</p>}

      {result.offers.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-[#adb3b4]/20">
          <div className="grid grid-cols-[1fr_86px_64px] gap-2 border-b border-[#adb3b4]/20 bg-[#f2f4f4] px-3 py-2 text-xs font-medium text-[#5a6061]">
            <span>商品预览</span>
            <span>价格</span>
            <span>状态</span>
          </div>
          <div className="divide-y divide-[#adb3b4]/15">
            {result.offers.slice(0, 8).map((offer, index) => (
              <a
                key={`${offer.url}-${offer.sourceTitle}-${index}`}
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-[1fr_86px_64px] gap-2 px-3 py-2 text-xs transition-colors hover:bg-[#f2f4f4]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[#2d3435]">{offer.sourceTitle}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1 text-[#adb3b4]">
                    {offer.sourceStoreName && <span>{offer.sourceStoreName}</span>}
                    {typeof offer.stockCount === "number" && <span>库存 {offer.stockCount}</span>}
                    {(offer.tags || []).slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                  </span>
                </span>
                <span className="font-medium text-[#2d3435]">{formatCurrency(offer.price, offer.currency)}</span>
                <span className={`h-fit w-fit rounded-full px-2 py-0.5 font-medium ${
                  offer.status === "out_of_stock"
                    ? "bg-[#fbe9e7] text-[#9b3328]"
                    : "bg-[#e8f3ec] text-[#2f7a4b]"
                }`}>
                  {offer.status === "out_of_stock" ? "缺货" : "有货"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OfferFeedbackList({
  feedback,
  statusFilter,
  offerById,
  productByKey,
  loadingAction,
  rowFeedback,
  selectedIds,
  onToggleSelect,
  onHideOffer,
  onHideSource,
  onAutoVerify,
  onRecollect,
  onRiskPrecheck,
  onRiskVisibility,
  onUpdateVerification,
  onResolve,
  onIgnore,
}: {
  feedback: OfferFeedback[];
  statusFilter: OfferFeedbackStatus;
  offerById: Map<string, RawOffer>;
  productByKey: Map<string, AdminProduct>;
  loadingAction: string | null;
  rowFeedback: RowFeedback | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onHideOffer: (feedback: OfferFeedback) => void;
  onHideSource: (feedback: OfferFeedback) => void;
  onAutoVerify: (feedback: OfferFeedback) => void;
  onRecollect: (feedback: OfferFeedback) => void;
  onRiskPrecheck: (feedback: OfferFeedback) => void;
  onRiskVisibility: (feedback: OfferFeedback, mode: "hide_public" | "expand_source") => void;
  onUpdateVerification: (
    feedback: OfferFeedback,
    verificationStatus: OfferFeedback["verificationStatus"],
    verificationResult: OfferFeedback["verificationResult"],
    verificationMessage: string,
  ) => void;
  onResolve: (feedback: OfferFeedback) => void;
  onIgnore: (feedback: OfferFeedback) => void;
}) {
  const historyView = statusFilter !== "pending";

  if (!feedback.length) {
    return (
      <EmptyState
        icon={<Flag size={32} className="text-[#adb3b4]" />}
        title={historyView ? `暂无${feedbackStatusLabel(statusFilter)}报价举报` : "暂无待处理反馈"}
        description={historyView ? "这里会保留已处理和已忽略的报价举报记录。" : "用户在商品详情页提交的问题会出现在这里。"}
      />
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => {
        const hideOfferLoading = loadingAction === `feedback-hide-offer-${item.id}`;
        const hideSourceLoading = loadingAction === `feedback-hide-source-${item.id}`;
        const autoVerifyLoading = loadingAction === `feedback-auto-verify-${item.id}`;
        const recollectLoading = loadingAction === `feedback-recollect-${item.id}`;
        const riskPrecheckLoading = loadingAction === `feedback-risk-precheck-${item.id}`;
        const riskHideLoading = loadingAction === `feedback-risk-visibility-hide_public-${item.id}`;
        const riskExpandLoading = loadingAction === `feedback-risk-visibility-expand_source-${item.id}`;
        const verificationLoading = loadingAction === `feedback-verification-${item.id}`;
        const resolveLoading = loadingAction === `feedback-resolved-${item.id}`;
        const ignoreLoading = loadingAction === `feedback-ignored-${item.id}`;
        const rowState = rowFeedback?.id === item.id ? rowFeedback : null;
        const matchedOffer = item.offerId ? offerById.get(item.offerId) : null;
        const verdict = getOfferFeedbackVerdict(item, matchedOffer);
        const matchedProduct =
          (item.productId ? productByKey.get(item.productId) : null) ||
          (item.productSlug ? productByKey.get(item.productSlug) : null) ||
          (item.productName ? productByKey.get(item.productName) : null);
        const currentProduct = matchedOffer?.canonicalProductId ? productByKey.get(matchedOffer.canonicalProductId) : null;
        const sourceName = offerSourceLabel(matchedOffer, item);
        const sourceTitle = item.sourceTitle || matchedOffer?.sourceTitle || "未记录原始商品名";
        const offerUrl = item.offerUrl || matchedOffer?.url || null;
        const snapshotStatus = item.offerStatus ? offerStatusLabel(item.offerStatus) : null;
        const snapshotPrice =
          item.offerPrice !== null && item.offerPrice !== undefined
            ? formatCurrency(item.offerPrice, item.offerCurrency || "CNY")
            : null;
        const snapshotUpdatedAt = item.offerLastSeenAt || item.offerCapturedAt || item.offerSourceUpdatedAt;
        const currentStatus = matchedOffer ? offerStatusLabel(matchedOffer.status) : snapshotStatus || "未记录";
        const currentPrice = matchedOffer ? formatCurrency(matchedOffer.price, matchedOffer.currency) : snapshotPrice || "未记录";
        const updatedAt = matchedOffer ? offerTimestamp(matchedOffer) : snapshotUpdatedAt;
        const ruleProduct = sourceTitle
          ? productByKey.get(
              classifyOffer(sourceTitle, {
                price: matchedOffer?.price ?? item.offerPrice ?? undefined,
              }).id,
            )
          : null;
        const displayProduct = ruleProduct || currentProduct || matchedProduct;
        const categoryText = displayProduct
          ? [displayProduct.platform, displayProduct.productType, displayProduct.spec].filter(Boolean).join(" / ")
          : item.productSlug || item.productId || "未匹配到当前标准商品";
        const snapshotProductName = displayProduct && matchedProduct && displayProduct.id !== matchedProduct.id
          ? matchedProduct.displayName || item.productName
          : null;
        const storedProductName = displayProduct && currentProduct && displayProduct.id !== currentProduct.id
          ? currentProduct.displayName
          : null;
        const productName = displayProduct?.displayName || item.productName || "未记录标准商品";
        const isCategoryFeedback = item.reason === "wrong_category";
        const hasEvidence = Boolean(item.evidenceText || item.evidenceUrls.length);
        const riskPrecheck = item.riskPrecheck;

        return (
          <article key={item.id} className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_12px_34px_rgba(45,52,53,0.035)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              {!historyView ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selectedIds.has(item.id)}
                  aria-label={`选择反馈 ${sourceTitle}`}
                  onClick={() => onToggleSelect(item.id)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selectedIds.has(item.id)
                      ? "border-[#2f7a4b] bg-[#2f7a4b] text-white"
                      : "border-[#adb3b4]/40 hover:border-[#2d3435]"
                  }`}
                >
                  {selectedIds.has(item.id) && <Check size={12} strokeWidth={3} />}
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feedbackStatusClass(item.status)}`}>
                    {feedbackStatusLabel(item.status)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feedbackReasonClass(item.reason)}`}>
                    {feedbackReasonLabel(item.reason)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feedbackActionClass(item.suggestedAction)}`}>
                    建议：{feedbackSuggestedActionLabel(item.suggestedAction)}
                  </span>
                  <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-xs font-semibold text-[#47657a]">
                    用户希望：{feedbackUserExpectedActionLabel(item.userExpectedAction)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${offerFeedbackVerdictClass(verdict.tone)}`}>
                    核验：{verdict.label}
                  </span>
                  {item.verificationStatus !== "not_needed" ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feedbackVerificationClass(item.verificationStatus)}`}>
                      自动核验：{feedbackVerificationStatusLabel(item.verificationStatus)}
                    </span>
                  ) : null}
                  {riskPrecheck ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskPrecheckStatusClass(riskPrecheck)}`}>
                      模型预审：{riskPrecheckStatusLabel(riskPrecheck)}
                    </span>
                  ) : null}
                  <span className="text-xs text-[#adb3b4]">{formatRelativeTime(item.createdAt)}</span>
                </div>
                <p className="mt-2 rounded-lg bg-[#f2f4f4] px-3 py-2 text-xs leading-5 text-[#5a6061]">
                  {verdict.description}
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
                  <div className="rounded-lg bg-[#f2f4f4] px-3 py-2.5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#5a6061]">当前归类</p>
                    <p className="mt-1 text-sm font-semibold text-[#202829]">{productName}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#5a6061]">{categoryText}</p>
                    {snapshotProductName ? (
                      <p className="mt-1 text-[0.7rem] text-[#8a9293]">反馈快照：{snapshotProductName}</p>
                    ) : null}
                    {storedProductName ? (
                      <p className="mt-1 text-[0.7rem] text-[#8a9293]">数据库记录：{storedProductName}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <FeedbackFact label="价格" value={currentPrice} strong />
                    <FeedbackFact label="状态" value={currentStatus} tone={currentStatus === "缺货" ? "danger" : currentStatus === "有货" ? "success" : "muted"} />
                    <FeedbackFact label="更新" value={updatedAt ? formatRelativeTime(updatedAt) : "未记录"} />
                    {item.verificationStatus !== "not_needed" ? (
                      <FeedbackFact
                        label="核验"
                        value={feedbackVerificationStatusLabel(item.verificationStatus)}
                        tone={item.verificationStatus === "failed" ? "danger" : item.verificationStatus === "recollection_created" || item.verificationStatus === "auto_fixed" ? "success" : "muted"}
                      />
                    ) : null}
                    {item.verificationResult ? (
                      <FeedbackFact label="结果" value={feedbackVerificationResultLabel(item.verificationResult)} />
                    ) : null}
                    {item.createdCollectionJobId ? (
                      <FeedbackFact label="重采任务" value={item.createdCollectionJobId} />
                    ) : null}
                  </div>
                </div>
                {item.verificationMessage ? (
                  <p className="mt-2 rounded-lg bg-[#f7f9f9] px-3 py-2 text-xs leading-5 text-[#5a6061]">
                    {item.verificationMessage}
                  </p>
                ) : null}
                {riskPrecheck ? (
                  <div className={`mt-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${riskPrecheckPanelClass(riskPrecheck)}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-[#2d3435]">模型预审：{riskPrecheckStatusLabel(riskPrecheck)}</span>
                      <span>范围：{riskPrecheckScopeLabel(riskPrecheck.riskScope)}</span>
                      <span>类型：{feedbackReasonLabel(riskPrecheck.riskCategory)}</span>
                      <span>风险：{riskPrecheckRiskLevelLabel(riskPrecheck.riskLevel)}</span>
                      <span>置信度：{formatPercent(riskPrecheck.confidence)}</span>
                    </div>
                    {riskPrecheck.publicSummary ? (
                      <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-[#5a6061]">
                        <span className="font-semibold text-[#2d3435]">商品风险摘要：</span>
                        {riskPrecheck.offerPublicSummary || riskPrecheck.publicSummary}
                      </p>
                    ) : null}
                    {riskPrecheck.sourceCanShowPublicly && riskPrecheck.sourcePublicSummary ? (
                      <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-[#5a6061]">
                        <span className="font-semibold text-[#2d3435]">商家风险摘要：</span>
                        {riskPrecheck.sourcePublicSummary}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[#5a6061]">
                      <span className="font-semibold text-[#2d3435]">后台原因：</span>
                      {riskPrecheck.privateReason || "模型未提供判断原因。"}
                    </p>
                    {riskPrecheck.error ? (
                      <p className="mt-1 text-[#9b3328]">错误：{riskPrecheck.error}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-[#8a9293]">
                      <span>证据质量：{riskPrecheckEvidenceQualityLabel(riskPrecheck.evidenceQuality)}</span>
                      <span>图片：{riskPrecheck.imageEvidenceUsedCount ?? 0}/{riskPrecheck.imageEvidenceCount ?? item.evidenceUrls.length}</span>
                      <span>滥用风险：{riskPrecheckAbuseRiskLabel(riskPrecheck.abuseRisk)}</span>
                      <span>模型：{riskPrecheck.model}</span>
                      <span>预审：{formatRelativeTime(riskPrecheck.reviewedAt)}</span>
                      {riskPrecheck.expiresAt ? <span>过期：{formatRelativeTime(riskPrecheck.expiresAt)}</span> : null}
                      {riskPrecheck.publicHidden ? <span>前台已撤销</span> : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-lg border border-[#adb3b4]/15 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5a6061]">
                    <span className="font-semibold text-[#2d3435]">{sourceName}</span>
                    {item.offerId ? <span>报价 ID: {item.offerId}</span> : null}
                    {item.sourceId ? <span>渠道 ID: {item.sourceId}</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">
                    {sourceTitle}
                  </p>
                </div>
                {offerUrl ? (
                  <a
                    href={offerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs text-[#47657a] transition-colors hover:text-[#2d3435]"
                  >
                    <span className="break-all">{offerUrl}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                ) : null}
                {item.notes ? (
                  <p className="mt-2 rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#7a541b]">
                    {item.notes}
                  </p>
                ) : null}
                {hasEvidence ? (
                  <div className="mt-2 rounded-lg bg-[#eef3f8] px-3 py-2 text-xs leading-5 text-[#47657a]">
                    <p className="font-semibold text-[#2d3435]">证据</p>
                    {item.evidenceText ? <p className="mt-1 whitespace-pre-wrap break-words">{item.evidenceText}</p> : null}
                    {item.evidenceUrls.length ? (
                      <div className="mt-2 space-y-2">
                        {item.evidenceUrls.map((url) => (
                          <FeedbackEvidenceLink key={url} url={url} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {isCategoryFeedback ? (
                  <p className="mt-2 rounded-lg bg-[#eef3f8] px-3 py-2 text-xs leading-5 text-[#47657a]">
                    分类问题优先用于修正归类；如果确认这条报价或整个渠道不该展示，也可以直接下架报价或渠道。
                  </p>
                ) : null}
                {item.contact ? (
                  <p className="mt-1 text-xs text-[#adb3b4]">联系方式：{item.contact}</p>
                ) : null}
                {historyView ? (
                  <div className="mt-2 rounded-lg bg-[#f7f9f9] px-3 py-2 text-xs leading-5 text-[#5a6061]">
                    <p><span className="font-semibold text-[#2d3435]">处理时间</span>：{item.reviewedAt ? formatRelativeTime(item.reviewedAt) : "未记录"}</p>
                    {item.reviewerNote ? <p className="mt-1"><span className="font-semibold text-[#2d3435]">处理备注</span>：{item.reviewerNote}</p> : null}
                  </div>
                ) : null}
                {rowState ? (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${rowFeedbackClass(rowState.type)}`}>
                    {rowState.text}
                  </div>
                ) : null}
              </div>

              {!historyView ? (
                <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[360px] xl:justify-end">
                  <button
                    type="button"
                    disabled={!item.offerId || hideOfferLoading}
                    onClick={() => onHideOffer(item)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                      item.suggestedAction === "hide_offer"
                        ? "border-[#9b3328]/30 bg-[#fbe9e7] text-[#9b3328] hover:bg-[#f6d6d2]"
                        : "border-[#9b3328]/20 bg-white text-[#9b3328] hover:bg-[#fbe9e7]"
                    }`}
                  >
                    {hideOfferLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    下架报价
                  </button>
                  <button
                    type="button"
                    disabled={!item.sourceId || hideSourceLoading}
                    onClick={() => onHideSource(item)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                      item.suggestedAction === "hide_source"
                        ? "border-[#9b3328]/30 bg-[#fbe9e7] text-[#9b3328] hover:bg-[#f6d6d2]"
                        : "border-[#9b3328]/20 bg-white text-[#9b3328] hover:bg-[#fbe9e7]"
                    }`}
                  >
                    {hideSourceLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    下架渠道
                  </button>
                  {item.verificationStatus !== "not_needed" ? (
                    <button
                      type="button"
                      disabled={(!item.offerUrl && !matchedOffer?.url) || autoVerifyLoading}
                      onClick={() => onAutoVerify(item)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#47657a]/20 bg-white px-3 text-xs font-medium text-[#47657a] transition-colors hover:bg-[#eef3f8] disabled:opacity-60"
                    >
                      {autoVerifyLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      自动复核
                    </button>
                  ) : null}
                  {item.verificationStatus !== "not_needed" ? (
                    <button
                      type="button"
                      disabled={!item.sourceId || Boolean(item.createdCollectionJobId) || recollectLoading}
                      onClick={() => onRecollect(item)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#47657a]/20 bg-white px-3 text-xs font-medium text-[#47657a] transition-colors hover:bg-[#eef3f8] disabled:opacity-60"
                    >
                      {recollectLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      创建重采
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!hasEvidence || riskPrecheckLoading}
                    onClick={() => onRiskPrecheck(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#47657a]/20 bg-white px-3 text-xs font-medium text-[#47657a] transition-colors hover:bg-[#eef3f8] disabled:opacity-60"
                    title={hasEvidence ? "运行模型风险预审" : "缺少证据，无法运行模型预审"}
                  >
                    {riskPrecheckLoading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                    模型预审
                  </button>
                  {riskPrecheck?.canShowPublicly && !riskPrecheck.publicHidden ? (
                    <button
                      type="button"
                      disabled={riskHideLoading}
                      onClick={() => onRiskVisibility(item, "hide_public")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                    >
                      {riskHideLoading ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
                      撤销前台提醒
                    </button>
                  ) : null}
                  {riskPrecheck?.canShowPublicly && !riskPrecheck.publicHidden && !riskPrecheck.sourceCanShowPublicly ? (
                    <button
                      type="button"
                      disabled={riskExpandLoading}
                      onClick={() => onRiskVisibility(item, "expand_source")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#7a541b]/20 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8] disabled:opacity-60"
                    >
                      {riskExpandLoading ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />}
                      扩展为商家提醒
                    </button>
                  ) : null}
                  {item.verificationStatus !== "not_needed" ? (
                    <button
                      type="button"
                      disabled={verificationLoading}
                      onClick={() => onUpdateVerification(item, "manual_review", "inconclusive", "已转人工确认，暂不自动变更前台报价。")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#7a541b]/20 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8] disabled:opacity-60"
                    >
                      {verificationLoading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                      转人工
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={resolveLoading}
                    onClick={() => onResolve(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-60"
                  >
                    {resolveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    已处理
                  </button>
                  <button
                    type="button"
                    disabled={ignoreLoading}
                    onClick={() => onIgnore(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                  >
                    {ignoreLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    忽略
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SiteFeedbackList({
  feedback,
  statusFilter,
  loadingAction,
  rowFeedback,
  onResolve,
  onIgnore,
}: {
  feedback: SiteFeedback[];
  statusFilter: SiteFeedbackStatus;
  loadingAction: string | null;
  rowFeedback: RowFeedback | null;
  onResolve: (feedback: SiteFeedback) => void;
  onIgnore: (feedback: SiteFeedback) => void;
}) {
  const historyView = statusFilter !== "pending";

  if (!feedback.length) {
    return (
      <EmptyState
        icon={<MessageCircle size={32} className="text-[#adb3b4]" />}
        title={historyView ? `暂无${feedbackStatusLabel(statusFilter)}站点意见` : "暂无待处理意见"}
        description={historyView ? "这里会保留已处理和已忽略的站点意见记录。" : "顶部反馈入口提交的功能建议、体验问题和站点意见会出现在这里。"}
      />
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => {
        const resolveLoading = loadingAction === `site-feedback-resolved-${item.id}`;
        const ignoreLoading = loadingAction === `site-feedback-ignored-${item.id}`;
        const rowState = rowFeedback?.id === item.id ? rowFeedback : null;

        return (
          <article key={item.id} className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_12px_34px_rgba(45,52,53,0.035)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feedbackStatusClass(item.status)}`}>
                    {feedbackStatusLabel(item.status)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${siteFeedbackTypeClass(item.type)}`}>
                    {siteFeedbackTypeLabel(item.type)}
                  </span>
                  <span className="text-xs text-[#adb3b4]">{formatRelativeTime(item.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#2d3435]">
                  {item.message}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5a6061]">
                  {item.pageUrl ? (
                    <a
                      href={item.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 break-all text-[#47657a] transition-colors hover:text-[#2d3435]"
                    >
                      <span className="break-all">{item.pageUrl}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span>未记录页面</span>
                  )}
                  {item.contact ? <span>联系方式：{item.contact}</span> : null}
                </div>
                {historyView ? (
                  <div className="mt-2 rounded-lg bg-[#f7f9f9] px-3 py-2 text-xs leading-5 text-[#5a6061]">
                    <p><span className="font-semibold text-[#2d3435]">处理时间</span>：{item.reviewedAt ? formatRelativeTime(item.reviewedAt) : "未记录"}</p>
                    {item.reviewerNote ? <p className="mt-1"><span className="font-semibold text-[#2d3435]">处理备注</span>：{item.reviewerNote}</p> : null}
                  </div>
                ) : null}
                {rowState ? (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${rowFeedbackClass(rowState.type)}`}>
                    {rowState.text}
                  </div>
                ) : null}
              </div>

              {!historyView ? (
                <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                  <button
                    type="button"
                    disabled={resolveLoading}
                    onClick={() => onResolve(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-60"
                  >
                    {resolveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    已处理
                  </button>
                  <button
                    type="button"
                    disabled={ignoreLoading}
                    onClick={() => onIgnore(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                  >
                    {ignoreLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    忽略
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#202829]">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function MessageBox({ message, onDismiss }: { message: Message; onDismiss?: () => void }) {
  const styles =
    message.type === "success"
      ? "border-[#2f7a4b]/20 bg-[#e8f3ec] text-[#2f7a4b]"
      : message.type === "error"
        ? "border-[#9b3328]/20 bg-[#fbe9e7] text-[#9b3328]"
        : "border-[#47657a]/20 bg-[#eef3f8] text-[#47657a]";
  const Icon = message.type === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message.text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 transition-opacity hover:opacity-100">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function AdminLoadErrors({ errors }: { errors: AdminSummary["loadErrors"] }) {
  return (
    <div className="mb-4 rounded-lg border border-[#9b3328]/20 bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b3328]">
      <div className="flex items-start gap-2">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">后台部分数据加载失败</p>
          <ul className="mt-2 space-y-1">
            {errors.map((error) => (
              <li key={error.key} className="break-words">
                {error.label}：{error.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RiskReviewSettingsPanel({
  settings,
  loading,
  onSave,
}: {
  settings: RiskReviewSettings;
  loading: boolean;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const statusText = settings.hasApiKey
    ? settings.apiKeyLast4
      ? `已配置 Key，尾号 ${settings.apiKeyLast4}`
      : "已配置 Key"
    : "未配置 Key";
  const statusClass = settings.hasApiKey
    ? "bg-[#e8f3ec] text-[#2f7a4b]"
    : "bg-[#fbe9e7] text-[#9b3328]";

  return (
    <section className="mb-4 rounded-lg border border-[#adb3b4]/20 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Activity size={15} className="text-[#5a6061]" />
            <h3 className="text-sm font-semibold text-[#202829]">风险预审模型配置</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{statusText}</span>
            <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-xs font-semibold text-[#5a6061]">
              来源：{riskReviewSettingSourceLabel(settings.source)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#5a6061]">
            用于后台“模型预审”。API Key 加密保存，留空不会覆盖已有 Key。
          </p>
          {settings.message ? <p className="mt-1 text-xs text-[#9b3328]">{settings.message}</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a9293]">
          <span>模型：{settings.model || "-"}</span>
          <span>超时：{settings.timeoutMs}ms</span>
          {settings.updatedAt ? <span>更新：{formatRelativeTime(settings.updatedAt)}</span> : null}
        </div>
      </div>

      <form
        className="mt-3 grid gap-3 lg:grid-cols-[120px_minmax(220px,1.2fr)_minmax(160px,0.8fr)_120px_minmax(220px,1fr)_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          await onSave(new FormData(form));
          const apiKeyInput = form.elements.namedItem("apiKey");
          if (apiKeyInput instanceof HTMLInputElement) apiKeyInput.value = "";
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">Provider</span>
          <input
            name="provider"
            defaultValue={settings.provider || "opencode"}
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">Base URL</span>
          <input
            name="baseUrl"
            type="url"
            required
            defaultValue={settings.baseUrl || DEFAULT_RISK_REVIEW_ADMIN_BASE_URL}
            placeholder={DEFAULT_RISK_REVIEW_ADMIN_BASE_URL}
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">Model</span>
          <input
            name="model"
            required
            defaultValue={settings.model || DEFAULT_RISK_REVIEW_ADMIN_MODEL}
            placeholder={DEFAULT_RISK_REVIEW_ADMIN_MODEL}
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">Timeout</span>
          <input
            name="timeoutMs"
            type="number"
            min={3000}
            max={60000}
            step={1000}
            defaultValue={settings.timeoutMs || 12000}
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">API Key</span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={settings.hasApiKey ? "留空保留当前 Key" : "填写 API Key"}
            className={adminInputClassName}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60 lg:w-auto"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            保存
          </button>
        </div>
      </form>
    </section>
  );
}

function AdminPasswordPanel({
  status,
  draft,
  loading,
  onDraftChange,
  onSubmit,
}: {
  status: PasswordStatus;
  draft: PasswordDraft;
  loading: boolean;
  onDraftChange: Dispatch<SetStateAction<PasswordDraft>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound size={15} className="text-[#5a6061]" />
            <h3 className="text-sm font-semibold text-[#202829]">后台密码</h3>
            <Badge tone={adminPasswordStatusTone(status)}>
              {status.configured ? "已配置" : "未配置"}
            </Badge>
            <Badge tone={adminPasswordSourceTone(status.source)}>
              来源：{adminPasswordSourceLabel(status.source)}
            </Badge>
          </div>
          <p className="mt-1 max-w-[78ch] text-xs leading-5 text-[#5a6061]">
            新密码会加盐哈希后保存；保存成功后旧后台会话失效，当前会话自动续签。
          </p>
          {status.message ? <p className="mt-1 text-xs text-[#7a541b]">{status.message}</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a9293]">
          <span>最短：{status.minLength} 位</span>
          {status.updatedAt ? <span>更新：{formatRelativeTime(status.updatedAt)}</span> : <span>尚未在后台保存</span>}
        </div>
      </div>

      <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">当前密码</span>
          <input
            value={draft.currentPassword}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, currentPassword: event.target.value }))}
            type="password"
            autoComplete="current-password"
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">新密码</span>
          <input
            value={draft.newPassword}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, newPassword: event.target.value }))}
            type="password"
            autoComplete="new-password"
            minLength={status.minLength}
            className={adminInputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5a6061]">确认新密码</span>
          <input
            value={draft.confirmPassword}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            type="password"
            autoComplete="new-password"
            minLength={status.minLength}
            className={adminInputClassName}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !status.configured}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60 lg:w-auto"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            保存
          </button>
        </div>
      </form>

      <div className="mt-4 grid gap-2 rounded-lg bg-[#f2f4f4] p-3 text-xs leading-5 text-[#5a6061] md:grid-cols-3">
        <span>新密码至少包含字母、数字、符号中的两类。</span>
        <span>环境变量 ADMIN_PASSWORD 可作为兜底入口。</span>
        <span>采集任务继续使用 CRON_SECRET，不依赖后台密码。</span>
      </div>
    </section>
  );
}

function SponsorSettingsPanel({
  settings,
  loading,
  onSave,
}: {
  settings: SponsorSettings;
  loading: boolean;
  onSave: (settings: SponsorSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SponsorSettings>(settings);

  const activeDraftPlacementCount = activeSponsorPlacementCount(draft);
  const statusClass = draft.enabled
    ? "bg-[#e8f3ec] text-[#2f7a4b]"
    : "bg-[#f2f4f4] text-[#5a6061]";

  return (
    <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone size={15} className="text-[#5a6061]" />
            <h3 className="text-sm font-semibold text-[#202829]">赞助位配置</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
              {draft.enabled ? "总开关已开启" : "总开关已关闭"}
            </span>
            <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-xs font-semibold text-[#47657a]">
              {activeDraftPlacementCount} 个站位启用
            </span>
          </div>
          <p className="mt-1 max-w-[78ch] text-xs leading-5 text-[#5a6061]">
            控制前台赞助展示。关闭总开关时所有赞助位隐藏；每个站位仍会保留素材草稿。真实外链会自动追加 PriceAI sponsor UTM，并记录曝光、点击和关闭事件。
          </p>
          {settings.message ? <p className="mt-1 text-xs text-[#9b3328]">{settings.message}</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8a9293]">
          {settings.updatedAt ? <span>更新：{formatRelativeTime(settings.updatedAt)}</span> : <span>尚未保存</span>}
        </div>
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave(draft);
        }}
      >
        <label className="flex items-center gap-2 rounded-lg bg-[#f2f4f4] px-3 py-2 text-sm font-medium text-[#2d3435]">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 accent-[#2d3435]"
          />
          开启全站赞助展示
        </label>

        <div className="grid gap-3 xl:grid-cols-2">
          {Object.entries(draft.placements).map(([kind, placement]) => {
            return (
              <fieldset key={kind} className="rounded-lg border border-[#adb3b4]/20 bg-[#f9f9f9] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-[#202829]">{sponsorPlacementLabel(kind)}</h4>
                    <p className="mt-1 text-xs leading-5 text-[#5a6061]">
                      {kind === "listFooter"
                        ? "底部区域支持多张图片卡，可放 AI 周边和中转 API 周边赞助；不得写成榜单推荐或排序权益。"
                        : "展示为轻量横幅或图文卡片。"}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/20">
                    <input
                      type="checkbox"
                      checked={placement.enabled}
                      onChange={(event) => setDraft((current) => updateSponsorPlacement(current, kind, { enabled: event.target.checked }))}
                      className="h-4 w-4 accent-[#2d3435]"
                    />
                    启用站位
                  </label>
                </div>

                {placement.creatives.length ? (
                  <div className="mt-4 space-y-3">
                    {placement.creatives.map((creative, index) => (
                      <div key={creative.id} className="rounded-lg bg-white p-3 ring-1 ring-[#adb3b4]/20">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#2d3435]">素材 {index + 1}</span>
                            <span className="max-w-[16rem] truncate rounded-full bg-[#f2f4f4] px-2 py-0.5 text-[11px] font-semibold text-[#5a6061]">
                              {creative.campaignId || creative.id}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDraft((current) => moveSponsorCreative(current, kind, index, -1))}
                              disabled={index === 0}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f4f4] text-[#5a6061] transition hover:bg-[#e4e9ea] hover:text-[#202829] disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="上移素材"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDraft((current) => moveSponsorCreative(current, kind, index, 1))}
                              disabled={index === placement.creatives.length - 1}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f4f4] text-[#5a6061] transition hover:bg-[#e4e9ea] hover:text-[#202829] disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="下移素材"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDraft((current) => removeSponsorCreative(current, kind, index))}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#fbe9e7] text-[#9b3328] transition hover:bg-[#f5d4d0]"
                              aria-label="删除素材"
                            >
                              <Trash2 size={14} />
                            </button>
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2d3435]">
                              <input
                                type="checkbox"
                                checked={creative.enabled}
                                onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { enabled: event.target.checked }))}
                                className="h-4 w-4 accent-[#2d3435]"
                              />
                              启用素材
                            </label>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">赞助方</span>
                            <input
                              value={creative.sponsorName || ""}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { sponsorName: event.target.value }))}
                              className={adminInputClassName}
                              placeholder="例如 Vultr / OneHop"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">Campaign ID</span>
                            <input
                              value={creative.campaignId || ""}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { campaignId: event.target.value }))}
                              className={adminInputClassName}
                              placeholder="例如 vultr-2026-07"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">素材状态</span>
                            <select
                              value={creative.status}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { status: event.target.value as SponsorCreative["status"] }))}
                              className={adminInputClassName}
                            >
                              <option value="live">上线</option>
                              <option value="draft">草稿</option>
                              <option value="paused">暂停</option>
                              <option value="expired">过期</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">色调</span>
                            <select
                              value={creative.tone}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { tone: event.target.value as SponsorCreative["tone"] }))}
                              className={adminInputClassName}
                            >
                              <option value="green">绿色</option>
                              <option value="blue">蓝色</option>
                              <option value="amber">琥珀色</option>
                            </select>
                          </label>
                          <SponsorDisclosureLabelField
                            kind={kind}
                            index={index}
                            creative={creative}
                            setDraft={setDraft}
                          />
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">标题</span>
                            <input
                              value={creative.title}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { title: event.target.value }))}
                              className={adminInputClassName}
                            />
                          </label>
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">说明</span>
                            <textarea
                              value={creative.description}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { description: event.target.value }))}
                              rows={2}
                              className={`${adminInputClassName} h-auto min-h-20 resize-y py-2 leading-6`}
                            />
                          </label>
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">跳转链接</span>
                            <input
                              value={creative.targetUrl}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { targetUrl: event.target.value }))}
                              className={adminInputClassName}
                            />
                            <span className="mt-1 block text-[11px] leading-5 text-[#8a9293]">外部链接会自动追加 utm_source=priceai、utm_medium=sponsor、utm_campaign 和 utm_content。</span>
                          </label>
                          <SponsorImageField
                            kind={kind}
                            index={index}
                            creative={creative}
                            setDraft={setDraft}
                          />
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">图片主标题</span>
                            <input
                              value={creative.visualTitle || ""}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { visualTitle: event.target.value }))}
                              className={adminInputClassName}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">图片副信息</span>
                            <input
                              value={creative.visualMeta || ""}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { visualMeta: event.target.value }))}
                              className={adminInputClassName}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">开始时间</span>
                            <input
                              value={formatDateTimeLocalValue(creative.startsAt)}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { startsAt: event.target.value || null }))}
                              type="datetime-local"
                              className={adminInputClassName}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-[#5a6061]">到期时间</span>
                            <input
                              value={formatDateTimeLocalValue(creative.endsAt)}
                              onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { endsAt: event.target.value || null }))}
                              type="datetime-local"
                              className={adminInputClassName}
                            />
                          </label>
                        </div>
                        <SponsorCreativePreview creative={creative} kind={kind} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs text-[#5a6061] ring-1 ring-[#adb3b4]/20">
                    当前站位没有默认素材。
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setDraft((current) => addSponsorCreative(current, kind))}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/25 transition hover:bg-[#f2f4f4]"
                >
                  <Plus size={14} />
                  新增素材
                </button>
              </fieldset>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            保存赞助配置
          </button>
        </div>
      </form>
    </section>
  );
}

function SponsorDisclosureLabelField({
  kind,
  index,
  creative,
  setDraft,
}: {
  kind: string;
  index: number;
  creative: SponsorCreative;
  setDraft: Dispatch<SetStateAction<SponsorSettings>>;
}) {
  const fallbackLabel = sponsorCreativeDisclosureLabel({ label: null }, kind);
  const currentLabel = creative.label || "";

  return (
    <div className="md:col-span-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[#5a6061]">角标文案</span>
        <input
          value={currentLabel}
          onChange={(event) => setDraft((current) => updateSponsorCreative(current, kind, index, { label: event.target.value }))}
          className={adminInputClassName}
          maxLength={SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH}
          placeholder={`留空默认显示「${fallbackLabel}」`}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {sponsorDisclosureLabelOptions.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setDraft((current) => updateSponsorCreative(current, kind, index, { label }))}
            className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold transition ${
              currentLabel === label
                ? "bg-[#2d3435] text-white"
                : "bg-[#f2f4f4] text-[#5a6061] hover:bg-[#e4e9ea] hover:text-[#202829]"
            }`}
          >
            {label}
          </button>
        ))}
        {currentLabel ? (
          <button
            type="button"
            onClick={() => setDraft((current) => updateSponsorCreative(current, kind, index, { label: "" }))}
            className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-[11px] font-semibold text-[#8a9293] ring-1 ring-[#adb3b4]/25 transition hover:text-[#2d3435]"
          >
            用默认
          </button>
        ) : null}
      </div>
      <span className="mt-1 block text-[11px] leading-5 text-[#8a9293]">
        用于卡片右侧披露角标，建议保留广告或赞助语义，最多 {SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH} 个字。
      </span>
    </div>
  );
}

function SponsorImageField({
  kind,
  index,
  creative,
  setDraft,
}: {
  kind: string;
  index: number;
  creative: SponsorCreative;
  setDraft: Dispatch<SetStateAction<SponsorSettings>>;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"muted" | "warn" | "danger">("muted");
  const imageUrl = sponsorAssetDisplayUrl(creative.imageUrl);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setTone("muted");

    try {
      const warning = await validateSponsorImageBeforeUpload(file);
      const formData = new FormData();
      formData.append("placement", kind);
      formData.append("creativeId", creative.id);
      formData.append("file", file);

      const response = await fetch("/api/admin/sponsor-assets", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) {
        throw new Error(json.message || "赞助图片上传失败。");
      }

      const nextUrl = String(json.asset?.url || "");
      setDraft((current) => updateSponsorCreative(current, kind, index, { imageUrl: nextUrl }));
      setTone(warning ? "warn" : "muted");
      setMessage(warning || "图片已上传，保存配置后前台生效。");
    } catch (error) {
      setTone("danger");
      setMessage(error instanceof Error ? error.message : "赞助图片上传失败。");
    } finally {
      setUploading(false);
    }
  }

  const messageClassName = tone === "danger"
    ? "text-[#9b3328]"
    : tone === "warn"
      ? "text-[#7a541b]"
      : "text-[#8a9293]";

  return (
    <div className="md:col-span-2">
      <span className="mb-1 block text-xs font-medium text-[#5a6061]">图片 URL</span>
      <div className="flex gap-2">
        <input
          value={creative.imageUrl || ""}
          onChange={(event) => {
            setDraft((current) => updateSponsorCreative(current, kind, index, { imageUrl: event.target.value }));
            setMessage(null);
            setTone("muted");
          }}
          placeholder="可留空，前台显示占位图形"
          className={adminInputClassName}
        />
        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
          上传
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              void uploadImage(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <div className="mt-1 flex flex-col gap-1 text-[11px] leading-5 sm:flex-row sm:items-center sm:justify-between">
        <span className={message ? messageClassName : "text-[#8a9293]"}>
          {message || "推荐 16:5 横幅图，1600x500 px 或 1200x375 px；Logo 和文字放中间 80%，避免边缘被裁切。"}
        </span>
        {imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-[#47657a] hover:text-[#2d3435]">
            打开图片
          </a>
        ) : null}
      </div>
    </div>
  );
}

function SponsorCreativePreview({ creative, kind }: { creative: SponsorCreative; kind: string }) {
  const imageUrl = sponsorAssetDisplayUrl(creative.imageUrl);
  const label = sponsorCreativeDisclosureLabel(creative, kind);

  return (
    <div className="mt-4 rounded-lg bg-[#f9f9f9] p-3 ring-1 ring-[#adb3b4]/20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#2d3435]">素材效果预览</span>
        <span className="rounded-full bg-[#eef3f8] px-2 py-0.5 text-[11px] font-semibold text-[#47657a]">草稿实时预览</span>
      </div>
      <div className="max-w-[320px] overflow-hidden rounded-lg bg-white text-[#202829] ring-1 ring-[#dfe4e5]">
        <div className={`relative aspect-[16/5] overflow-hidden ${imageUrl ? "bg-[#f2f4f4]" : sponsorPreviewToneClass(creative.tone)}`}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <p className="text-[11px] font-extrabold text-[#5a6061]">赞助图片</p>
              <p className="mt-1 max-w-full truncate text-2xl font-black leading-none text-[#202829]">{creative.visualTitle || creative.title || "Sponsor"}</p>
              <p className="mt-2 max-w-full truncate text-xs font-bold text-[#3e484a]">{creative.visualMeta || "品牌图 / 短标题 / 落地页"}</p>
            </div>
          )}
        </div>
        <div className="min-h-[92px] p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-sm font-extrabold leading-5 text-[#202829]">{creative.title || "赞助素材标题"}</h3>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff7e8] px-2 py-0.5 text-[11px] font-extrabold text-[#7a541b]">
              <Megaphone className="h-3 w-3" />
              {label}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">{creative.description || "这里会显示素材说明。"}</p>
        </div>
      </div>
    </div>
  );
}

function FeedbackFact({
  label,
  value,
  tone = "muted",
  strong = false,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "muted";
  strong?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "text-[#2f7a4b]"
      : tone === "danger"
        ? "text-[#9b3328]"
        : "text-[#2d3435]";

  return (
    <div className="rounded-lg bg-[#f2f4f4] px-3 py-2.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#5a6061]">{label}</p>
      <p className={`mt-1 truncate text-sm ${strong ? "font-semibold" : "font-medium"} ${toneClass}`}>{value}</p>
    </div>
  );
}

const adminInputClassName = "h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]";

function riskReviewSettingSourceLabel(value: RiskReviewSettings["source"]): string {
  if (value === "database") return "后台配置";
  if (value === "environment") return "环境变量";
  if (value === "default") return "默认值";
  return "未配置";
}

function adminPasswordSourceLabel(value: PasswordStatus["source"]): string {
  if (value === "database") return "后台配置";
  if (value === "environment") return "环境变量";
  return "未配置";
}

function adminPasswordSourceTone(value: PasswordStatus["source"]): BadgeTone {
  if (value === "database") return "success";
  if (value === "environment") return "info";
  return "danger";
}

function adminPasswordStatusTone(status: PasswordStatus): BadgeTone {
  if (!status.configured) return "danger";
  return status.tableReady ? "success" : "warn";
}

function buildSponsorSettingsPayload(settings: SponsorSettings) {
  const placements = Object.fromEntries(
    Object.entries(settings.placements).map(([kind, placement]) => [kind, {
      enabled: placement.enabled,
      creatives: placement.creatives.map((creative) => ({
        id: creative.id,
        enabled: creative.enabled,
        status: creative.status,
        title: creative.title,
        description: creative.description || "",
        targetUrl: creative.targetUrl || "/commercial#slots",
        sponsorName: emptyToNull(creative.sponsorName),
        campaignId: emptyToNull(creative.campaignId),
        imageUrl: emptyToNull(creative.imageUrl),
        visualTitle: emptyToNull(creative.visualTitle),
        visualMeta: emptyToNull(creative.visualMeta),
        label: emptyToNull(creative.label),
        tone: creative.tone,
        startsAt: emptyToNull(creative.startsAt),
        endsAt: emptyToNull(creative.endsAt),
      })),
    }]),
  );

  return {
    enabled: settings.enabled,
    placements,
  };
}

function activeSponsorPlacementCount(settings: SponsorSettings): number {
  return Object.values(settings.placements).filter((placement) => placement.enabled).length;
}

function updateSponsorPlacement(settings: SponsorSettings, kind: string, patch: Partial<SponsorSettings["placements"][keyof SponsorSettings["placements"]]>): SponsorSettings {
  const placement = settings.placements[kind as keyof SponsorSettings["placements"]];
  if (!placement) return settings;

  return {
    ...settings,
    placements: {
      ...settings.placements,
      [kind]: {
        ...placement,
        ...patch,
      },
    },
  };
}

function updateSponsorCreative(settings: SponsorSettings, kind: string, index: number, patch: Partial<SponsorCreative>): SponsorSettings {
  const placement = settings.placements[kind as keyof SponsorSettings["placements"]];
  if (!placement?.creatives[index]) return settings;

  const creatives = placement.creatives.map((creative, creativeIndex) => (
    creativeIndex === index ? { ...creative, ...patch } : creative
  ));

  return updateSponsorPlacement(settings, kind, { creatives });
}

function addSponsorCreative(settings: SponsorSettings, kind: string): SponsorSettings {
  const placement = settings.placements[kind as keyof SponsorSettings["placements"]];
  if (!placement) return settings;

  const creative: SponsorCreative = {
    id: createSponsorCreativeId(kind, placement.creatives),
    enabled: true,
    status: "draft",
    title: "新赞助素材",
    description: "",
    targetUrl: "/commercial#slots",
    sponsorName: "",
    campaignId: "",
    imageUrl: null,
    visualTitle: "",
    visualMeta: "",
    label: "",
    tone: "green",
    startsAt: null,
    endsAt: null,
  };

  return updateSponsorPlacement(settings, kind, { creatives: [...placement.creatives, creative] });
}

function removeSponsorCreative(settings: SponsorSettings, kind: string, index: number): SponsorSettings {
  const placement = settings.placements[kind as keyof SponsorSettings["placements"]];
  if (!placement?.creatives[index]) return settings;

  return updateSponsorPlacement(settings, kind, {
    creatives: placement.creatives.filter((_, creativeIndex) => creativeIndex !== index),
  });
}

function moveSponsorCreative(settings: SponsorSettings, kind: string, index: number, direction: -1 | 1): SponsorSettings {
  const placement = settings.placements[kind as keyof SponsorSettings["placements"]];
  const nextIndex = index + direction;
  if (!placement?.creatives[index] || nextIndex < 0 || nextIndex >= placement.creatives.length) return settings;

  const creatives = [...placement.creatives];
  const [creative] = creatives.splice(index, 1);
  creatives.splice(nextIndex, 0, creative);

  return updateSponsorPlacement(settings, kind, { creatives });
}

function createSponsorCreativeId(kind: string, creatives: SponsorCreative[]): string {
  const base = `${kind}-sponsor-${Date.now().toString(36)}`;
  const existing = new Set(creatives.map((creative) => creative.id));
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function emptyToNull(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

async function validateSponsorImageBeforeUpload(file: File): Promise<string | null> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("请上传 PNG、JPG 或 WebP 格式。");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("赞助图片不能超过 2MB。");
  }

  const dimensions = await readImageDimensions(file);
  if (dimensions.width < 1200 || dimensions.height < 375) {
    throw new Error(`图片尺寸太小：当前 ${dimensions.width}x${dimensions.height}，最低 1200x375 px。`);
  }

  const ratio = dimensions.width / dimensions.height;
  const targetRatio = 16 / 5;
  if (Math.abs(ratio - targetRatio) > 0.12) {
    return `图片已上传，但当前比例约 ${ratio.toFixed(2)}，推荐 16:5，前台可能裁切。`;
  }

  return null;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片尺寸，请换一张图片。"));
    };
    image.src = url;
  });
}

function sponsorPreviewToneClass(tone: SponsorCreative["tone"]) {
  if (tone === "blue") return "bg-[#e8f1fa]";
  if (tone === "amber") return "bg-[#fff2dc]";
  return "bg-[#e8f3ec]";
}

function sponsorPlacementLabel(kind: string): string {
  return sponsorPlacementLabels[kind as keyof typeof sponsorPlacementLabels] || "底部赞助展示区";
}

function formatDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function FeedbackEvidenceLink({ url }: { url: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (isFeedbackEvidenceImageReference(url)) {
    const imageUrl = `/api/admin/feedback-evidence?ref=${encodeURIComponent(url)}`;
    return (
      <a
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex max-w-full items-center gap-3 rounded-md bg-white px-2 py-2 text-[#47657a] ring-1 ring-[#adb3b4]/20 transition hover:text-[#2d3435] hover:ring-[#adb3b4]/35"
      >
        {imageFailed ? (
          <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded bg-[#f2f4f4] px-2 text-center text-[0.68rem] leading-4 text-[#8a9293] ring-1 ring-[#adb3b4]/20">
            图片暂不可用
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="用户上传的图片证据"
            className="h-16 w-24 shrink-0 rounded object-cover ring-1 ring-[#adb3b4]/20"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        <span className="min-w-0 truncate text-xs font-semibold">
          {imageFailed ? "图片证据未找到" : "图片证据"}
        </span>
        <ExternalLink size={12} className="shrink-0 opacity-70 transition group-hover:opacity-100" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 break-all text-[#47657a] hover:text-[#2d3435]"
    >
      <span className="break-all">{url}</span>
      <ExternalLink size={12} className="shrink-0" />
    </a>
  );
}

function isFeedbackEvidenceImageReference(url: string): boolean {
  return url.startsWith("r2://feedback-evidence/");
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#adb3b4]/30 py-12">
      {icon}
      <p className="mt-3 text-sm font-medium text-[#2d3435]">{title}</p>
      <p className="mt-1 text-xs text-[#adb3b4]">{description}</p>
    </div>
  );
}

function ActionRow({
  title,
  description,
  buttonLabel,
  buttonIcon,
  loading,
  onClick,
  primary,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  buttonIcon: ReactNode;
  loading: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[#2d3435]">{title}</p>
        <p className="mt-1 text-sm text-[#5a6061]">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
          primary
            ? "bg-[#2d3435] text-white hover:bg-[#202829]"
            : "border border-[#adb3b4]/30 bg-white text-[#2d3435] hover:bg-[#f2f4f4]"
        }`}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : buttonIcon}
        {buttonLabel}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="my-4 border-t border-[#adb3b4]/15" />;
}

function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "info" | "warn" | "success" | "danger" | "muted" }) {
  const styles =
    tone === "info"
      ? "bg-[#eef3f8] text-[#47657a]"
      : tone === "warn"
        ? "bg-[#fff7e8] text-[#7a541b]"
        : tone === "success"
          ? "bg-[#e8f3ec] text-[#2f7a4b]"
          : tone === "danger"
            ? "bg-[#fbe9e7] text-[#9b3328]"
            : "bg-[#f2f4f4] text-[#5a6061]";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{children}</span>;
}

function HealthPill({ tone, children }: { tone: CollectorHealthData["overall"]["tone"]; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthPillClass(tone)}`}>{children}</span>;
}

function healthTextClass(tone: CollectorHealthData["overall"]["tone"]): string {
  if (tone === "success") return "text-[#2f7a4b]";
  if (tone === "info") return "text-[#47657a]";
  if (tone === "warn") return "text-[#7a541b]";
  if (tone === "danger") return "text-[#9b3328]";
  return "text-[#2d3435]";
}

function healthPillClass(tone: CollectorHealthData["overall"]["tone"]): string {
  if (tone === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (tone === "info") return "bg-[#eef3f8] text-[#47657a]";
  if (tone === "warn") return "bg-[#fff7e8] text-[#7a541b]";
  if (tone === "danger") return "bg-[#fbe9e7] text-[#9b3328]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function collectorSourceStatusLabel(status: CollectorHealthSourceRow["status"]): string {
  if (status === "fresh") return "正常";
  if (status === "aging") return "变慢";
  if (status === "stale") return "成功过期";
  if (status === "critical") return "长期未成功";
  if (status === "never") return "未成功";
  return "已停用";
}

function collectorNodeHealthLabel(status: CollectorHealthNodeRow["health"]): string {
  if (status === "online") return "在线";
  if (status === "quiet") return "最近失败";
  if (status === "stale") return "延迟";
  if (status === "down") return "离线";
  return "未知";
}

function collectorHeartbeatStatusLabel(status: CollectorHealthNodeRow["status"]): string {
  if (status === "running") return "运行中";
  if (status === "success") return "成功";
  if (status === "partial") return "部分成功";
  if (status === "failed") return "失败";
  if (status === "idle") return "空闲";
  return "未知";
}

function formatAgeMinutes(value: number): string {
  if (value < 1) return "刚刚";
  if (value < 60) return `${value} 分钟前`;
  if (value < 60 * 24) return `${Math.round(value / 60)} 小时前`;
  return `${Math.round(value / 60 / 24)} 天前`;
}

function UrlLine({ label, href, tone = "muted" }: { label: string; href: string; tone?: "muted" | "strong" }) {
  const textClass = tone === "strong" ? "text-[#2f7a4b] hover:text-[#256a3d]" : "text-[#5a6061] hover:text-[#2d3435]";

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="font-medium text-[#2d3435]">{label}：</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex min-w-0 items-center gap-1 break-all transition-colors ${textClass}`}
      >
        <span className="break-all">{href}</span>
        <ExternalLink size={12} className="shrink-0" />
      </a>
    </p>
  );
}

function SourceTable({
  overviewGroups,
  activeGroup,
  filteredSources,
  filters,
  offerCountBySource,
  sourceStatsById,
  loadingAction,
  feedback,
  selectedIds,
  onSelectGroup,
  onBackToGroups,
  onFiltersChange,
  onToggleSelect,
  onRetry,
  onCopyBrowserCommand,
  onCopyCollectorContext,
  onToggleEnabled,
  onToggleOffersVisibility,
  onDeleteSource,
}: {
  overviewGroups: SourceGroupOverview[];
  activeGroup: SourceGroupOverview | null;
  filteredSources: Source[];
  filters: SourceFilters;
  offerCountBySource: Map<string, number>;
  sourceStatsById: Map<string, SourceOfferStats>;
  loadingAction: string | null;
  feedback: RowFeedback | null;
  selectedIds: Set<string>;
  onSelectGroup: (groupKey: string) => void;
  onBackToGroups: () => void;
  onFiltersChange: Dispatch<SetStateAction<SourceFilters>>;
  onToggleSelect: (id: string) => void;
  onRetry: (source: Source) => void;
  onCopyBrowserCommand: (source: Source) => void;
  onCopyCollectorContext: (source: Source) => void;
  onToggleEnabled: (source: Source, enabled?: boolean) => void;
  onToggleOffersVisibility: (source: Source, hidden: boolean) => void;
  onDeleteSource: (source: Source) => void;
}) {
  if (!activeGroup) {
    return (
      <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
        <div className="hidden grid-cols-[1fr_110px_130px_190px_160px_90px] gap-3 border-b border-[#adb3b4]/20 bg-[#f2f4f4] px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#5a6061] md:grid">
          <span>分组</span>
          <span>渠道</span>
          <span>报价</span>
          <span>健康</span>
          <span>风险</span>
          <span>操作</span>
        </div>
        <div className="divide-y divide-[#adb3b4]/15">
          {overviewGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectGroup(group.key)}
              className="grid w-full gap-2 bg-white px-3 py-3 text-left transition-colors hover:bg-[#f7f9f9] md:grid-cols-[1fr_110px_130px_190px_160px_90px] md:items-center"
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <Store size={15} className="shrink-0 text-[#5a6061]" />
                  <span className="truncate text-sm font-semibold text-[#202829]">{group.label}</span>
                  {group.key === SOURCE_OTHER_GROUP_KEY ? (
                    <span className="shrink-0 rounded-full bg-[#eef3f8] px-2 py-0.5 text-xs font-medium text-[#47657a]">零散采集</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-[#adb3b4]">
                  {group.key === SOURCE_OTHER_GROUP_KEY ? "少量采集器合并展示，进入后保留原采集器标签。" : "点击进入该采集器分组。"}
                </span>
              </span>
              <span className="text-sm font-semibold text-[#2d3435]">{group.sources.length}</span>
              <span className="text-sm font-semibold text-[#2d3435]">
                {group.totalVisibleOffers}
                {group.totalManuallyHiddenOffers ? (
                  <span className="ml-2 text-xs font-medium text-[#9b3328]">下架 {group.totalManuallyHiddenOffers}</span>
                ) : null}
                {group.totalCollectorFailureOffers ? (
                  <span className="ml-2 text-xs font-medium text-[#7a541b]">采集失败 {group.totalCollectorFailureOffers}</span>
                ) : null}
              </span>
              <span className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <span className="rounded-full bg-[#e8f3ec] px-2 py-0.5 text-[#2f7a4b]">正常 {group.normalCount}</span>
                {group.abnormalCount > 0 ? <span className="rounded-full bg-[#fbe9e7] px-2 py-0.5 text-[#9b3328]">异常 {group.abnormalCount}</span> : null}
                {group.disabledCount > 0 ? <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-[#5a6061]">停用 {group.disabledCount}</span> : null}
              </span>
              <span className="text-xs font-medium text-[#5a6061]">
                {group.riskCount ? `疑似 ${group.riskCount}` : "暂无明显风险"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2d3435]">
                查看
                <ChevronDown size={14} className="-rotate-90" />
              </span>
            </button>
          ))}
          {!overviewGroups.length && (
            <div className="px-3 py-10 text-center text-sm text-[#adb3b4]">暂无渠道源。</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
      <div className="border-b border-[#adb3b4]/20 bg-white px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBackToGroups}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
            >
              <ChevronDown size={14} className="rotate-90" />
              返回分组
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#202829]">{activeGroup.label}</h3>
              <span className="rounded-full bg-[#f2f4f4] px-2.5 py-1 text-xs font-medium text-[#5a6061]">{activeGroup.sources.length} 个渠道</span>
              <span className="rounded-full bg-[#e4e9ea] px-2.5 py-1 text-xs font-medium text-[#2d3435]">报价 {activeGroup.totalVisibleOffers}</span>
              {activeGroup.riskCount ? <span className="rounded-full bg-[#fff7e8] px-2.5 py-1 text-xs font-medium text-[#7a541b]">疑似低质量 {activeGroup.riskCount}</span> : null}
            </div>
          </div>
          <div className="text-xs text-[#adb3b4]">
            当前筛选 {filteredSources.length} 个，批量操作只作用于当前列表中已选渠道。
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_150px_150px_170px_auto_auto] lg:items-center">
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm">
            <Search size={15} className="shrink-0 text-[#adb3b4]" />
            <input
              value={filters.query}
              onChange={(event) => onFiltersChange((prev) => ({ ...prev, query: event.target.value }))}
              placeholder="搜索渠道名、域名或入口"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#adb3b4]"
            />
          </label>
          <select
            value={filters.status}
            onChange={(event) => onFiltersChange((prev) => ({ ...prev, status: event.target.value as SourceStatusFilter }))}
            className="h-10 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#2d3435] outline-none"
          >
            <option value="all">全部状态</option>
            <option value="normal">正常</option>
            <option value="issue">异常</option>
            <option value="disabled">停用</option>
            <option value="needs_collector">需补采集器</option>
          </select>
          <select
            value={filters.offerBand}
            onChange={(event) => onFiltersChange((prev) => ({ ...prev, offerBand: event.target.value as SourceOfferFilter }))}
            className="h-10 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#2d3435] outline-none"
          >
            <option value="all">全部报价量</option>
            <option value="zero">0 条</option>
            <option value="small">1-10 条</option>
            <option value="medium">10-50 条</option>
            <option value="large">50+ 条</option>
          </select>
          <select
            value={filters.sort}
            onChange={(event) => onFiltersChange((prev) => ({ ...prev, sort: event.target.value as SourceSortMode }))}
            className="h-10 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#2d3435] outline-none"
          >
            <option value="offers_desc">报价数从高到低</option>
            <option value="issue_first">异常优先</option>
            <option value="stale_first">最久未成功优先</option>
            <option value="hidden_desc">下架数从高到低</option>
            <option value="name">名称排序</option>
          </select>
          <button
            type="button"
            onClick={() => onFiltersChange((prev) => ({ ...prev, riskOnly: !prev.riskOnly }))}
            className={`inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors ${
              filters.riskOnly
                ? "bg-[#fff7e8] text-[#7a541b] ring-1 ring-[#efdfbd]"
                : "border border-[#adb3b4]/30 bg-white text-[#5a6061] hover:bg-[#f2f4f4]"
            }`}
          >
            疑似低质量
          </button>
          <button
            type="button"
            onClick={() => onFiltersChange({ query: "", status: "all", offerBand: "all", sort: "offers_desc", riskOnly: false })}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
          >
            重置
          </button>
        </div>
      </div>

      <div className="hidden grid-cols-[28px_1fr_70px_110px_110px_150px_240px] gap-3 border-b border-[#adb3b4]/20 bg-[#f2f4f4] px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#5a6061] md:grid">
        <span />
        <span>来源</span>
        <span>报价</span>
        <span>采集方式</span>
        <span>健康</span>
        <span>最近采集</span>
        <span>操作</span>
      </div>
      <div className="divide-y divide-[#adb3b4]/15">
        {filteredSources.map((source) => (
          <SourceTableRow
            key={source.id}
            source={source}
            offerCount={offerCountBySource.get(source.id) || 0}
            stats={sourceStatsById.get(source.id)}
            riskLabels={sourceRiskFlags(source, sourceStatsById, offerCountBySource).map(sourceRiskFlagLabel)}
            loading={loadingAction === `collect-source-${source.id}` || loadingAction === "batch-collect-sources"}
            toggleLoading={loadingAction === `toggle-source-${source.id}`}
            hideLoading={loadingAction === `hide-source-offers-${source.id}`}
            restoreLoading={loadingAction === `restore-source-offers-${source.id}`}
            deleteLoading={loadingAction === `delete-source-${source.id}`}
            feedback={feedback?.id === source.id ? feedback : null}
            selected={selectedIds.has(source.id)}
            onToggleSelect={onToggleSelect}
            onRetry={onRetry}
            onCopyBrowserCommand={onCopyBrowserCommand}
            onCopyCollectorContext={onCopyCollectorContext}
            onToggleEnabled={onToggleEnabled}
            onToggleOffersVisibility={onToggleOffersVisibility}
            onDeleteSource={onDeleteSource}
          />
        ))}
        {!filteredSources.length && (
          <div className="px-3 py-10 text-center text-sm text-[#adb3b4]">没有符合条件的渠道。</div>
        )}
      </div>
    </div>
  );
}

function SourceTableRow({
  source,
  offerCount,
  stats,
  riskLabels,
  loading,
  toggleLoading,
  hideLoading,
  restoreLoading,
  deleteLoading,
  feedback,
  selected,
  onToggleSelect,
  onRetry,
  onCopyBrowserCommand,
  onCopyCollectorContext,
  onToggleEnabled,
  onToggleOffersVisibility,
  onDeleteSource,
}: {
  source: Source;
  offerCount: number;
  stats?: SourceOfferStats;
  riskLabels: string[];
  loading: boolean;
  toggleLoading: boolean;
  hideLoading: boolean;
  restoreLoading: boolean;
  deleteLoading: boolean;
  feedback: RowFeedback | null;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRetry: (source: Source) => void;
  onCopyBrowserCommand: (source: Source) => void;
  onCopyCollectorContext: (source: Source) => void;
  onToggleEnabled: (source: Source, enabled?: boolean) => void;
  onToggleOffersVisibility: (source: Source, hidden: boolean) => void;
  onDeleteSource: (source: Source) => void;
}) {
  const displayMethod = resolvedCollectionMethod(source);
  const displayCollector = resolvedCollectorKind(source);
  const needsBrowser = sourceNeedsBrowser(source);
  const needsCollector = sourceNeedsCollector(source);
  const canHttpRetry = source.enabled && displayMethod === "http" && !needsCollector;
  const hasIssue = sourceHasIssue(source);

  return (
    <div className={`px-3 py-3 transition-colors ${selected ? "bg-[#e8f3ec]/30" : "bg-white"}`}>
      <div className="grid gap-2 md:grid-cols-[28px_1fr_70px_110px_110px_150px_240px] md:items-center">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`选择 ${source.name}`}
          onClick={() => onToggleSelect(source.id)}
          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-[#2f7a4b] bg-[#2f7a4b] text-white"
              : "border-[#adb3b4]/40 hover:border-[#2d3435]"
          }`}
        >
          {selected && <Check size={12} strokeWidth={3} />}
        </button>
        <div className="min-w-0">
          <p className="font-medium text-[#2d3435]">{source.name}</p>
          <a
            href={source.entryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-xs text-[#adb3b4] transition-colors hover:text-[#47657a]"
          >
            {source.entryUrl}
          </a>
          {source.lastError && <p className="mt-1 line-clamp-2 text-xs text-[#9b3328]">{source.lastError}</p>}
          {riskLabels.length ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {riskLabels.map((label) => (
                <span key={label} className="rounded-full bg-[#fff7e8] px-2 py-0.5 text-xs font-medium text-[#7a541b]">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <span className="text-sm font-medium text-[#5a6061]">
          <span className="mr-1 text-xs text-[#adb3b4] md:hidden">报价</span>
          {offerCount}
          {stats?.manuallyHiddenCount ? (
            <span className="mt-0.5 block text-xs font-normal text-[#9b3328]">下架 {stats.manuallyHiddenCount}</span>
          ) : null}
          {stats?.collectorFailureCount ? (
            <span className="mt-0.5 block text-xs font-normal text-[#7a541b]">采集失败 {stats.collectorFailureCount}</span>
          ) : null}
          {stats?.hiddenCount && stats.hiddenCount !== stats.manuallyHiddenCount ? (
            <span className="mt-0.5 block text-xs font-normal text-[#adb3b4]">隐藏 {stats.hiddenCount}</span>
          ) : null}
        </span>
        <span className="text-xs leading-5 text-[#5a6061]">
          <span className="block text-sm">{collectionMethodLabel(displayMethod)}</span>
          <span className="block text-[#adb3b4]">{collectorKindLabel(displayCollector || "auto")}</span>
        </span>
        <span className={sourceHealthClass(source)}>{sourceHealthLabel(source)}</span>
        <span className="text-xs leading-5 text-[#adb3b4]">
          {source.lastSuccessAt ? `确认 ${formatRelativeTime(source.lastSuccessAt)}` : source.lastCheckedAt ? "未确认成功" : "未采集"}
          {source.lastCheckedAt && <span className="block">检查 {formatRelativeTime(source.lastCheckedAt)}</span>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {canHttpRetry ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => onRetry(source)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                hasIssue
                  ? "bg-[#2d3435] text-white hover:bg-[#202829]"
                  : "border border-[#adb3b4]/30 bg-white text-[#5a6061] hover:bg-[#f2f4f4]"
              }`}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
              {hasIssue ? "重试" : "重采"}
            </button>
          ) : null}
          {needsBrowser ? (
            <button
              type="button"
              onClick={() => onCopyBrowserCommand(source)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
            >
              <TerminalSquare size={14} />
              本机采集
            </button>
          ) : null}
          {needsCollector ? (
            <>
              <span className="rounded-full bg-[#fff7e8] px-2.5 py-1 text-xs font-medium text-[#7a541b]">
                需补采集器
              </span>
              <button
                type="button"
                onClick={() => onCopyCollectorContext(source)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8]"
              >
                <TerminalSquare size={14} />
                复制上下文
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={toggleLoading}
            onClick={() => onToggleEnabled(source)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
          >
            {toggleLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            {source.enabled ? "停用" : "启用"}
          </button>
          <button
            type="button"
            disabled={hideLoading || offerCount <= 0}
            onClick={() => onToggleOffersVisibility(source, true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
          >
            {hideLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            下架报价
          </button>
          <button
            type="button"
            disabled={restoreLoading || !stats?.manuallyHiddenCount}
            onClick={() => onToggleOffersVisibility(source, false)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-50"
          >
            {restoreLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            恢复报价
          </button>
          <button
            type="button"
            disabled={deleteLoading}
            onClick={() => onDeleteSource(source)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
          >
            {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            删除
          </button>
        </div>
      </div>
      {feedback ? (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${rowFeedbackClass(feedback.type)}`}>
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}

function OfficialPricesAdminPanel({
  data,
  loadingAction,
  probeResult,
  onProbe,
  onEnqueueWeeklyCollection,
  onEnqueueFxRefresh,
  onCopyCommand,
  onToggleAppEnabled,
  onTogglePlanEnabled,
  onToggleRegionEnabled,
  onUpdatePriceStatus,
}: {
  data: OfficialAdminData;
  loadingAction: string | null;
  probeResult: OfficialProbeResult | null;
  onProbe: () => void;
  onEnqueueWeeklyCollection: () => void;
  onEnqueueFxRefresh: () => void;
  onCopyCommand: () => void;
  onToggleAppEnabled: (app: OfficialAdminApp, enabled: boolean) => void;
  onTogglePlanEnabled: (plan: OfficialAdminPlan, enabled: boolean) => void;
  onToggleRegionEnabled: (region: OfficialAdminRegion, enabled: boolean) => void;
  onUpdatePriceStatus: (price: OfficialAdminPrice, status: OfficialAdminPrice["status"]) => void;
}) {
  const officialPriceRowsKey = useMemo(() => data.currentPrices.map((price) => price.id).join("|"), [data.currentPrices]);
  const officialPriceRows = useAdminExpandableRows(data.currentPrices, `official-prices:${officialPriceRowsKey}`);
  const latestRuns = data.collectRuns.slice(0, 8);
  const unmatchedItems = data.unmatchedItems.slice(0, 8);
  const failedCount = data.currentPrices.filter((price) => price.status !== "available" && price.status !== "stale").length;
  const disabledAppCount = data.apps.filter((app) => !app.enabled).length;
  const disabledPlanCount = data.plans.filter((plan) => !plan.enabled).length;
  const disabledRegionCount = data.regions.filter((region) => !region.enabled).length;
  const canMutate = data.source === "supabase";

  return (
    <div className="space-y-5">
      <Panel title="官方地区价控制台" icon={<Database size={17} />}>
        {data.message ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fff7e8] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#7a541b]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.message}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <OfficialMetric label="数据源" value={data.source === "supabase" ? "Supabase" : "静态样本"} />
          <OfficialMetric label="平台" value={String(data.apps.length)} tone={disabledAppCount ? "warn" : "default"} />
          <OfficialMetric label="计划" value={String(data.plans.length)} tone={disabledPlanCount ? "warn" : "default"} />
          <OfficialMetric label="地区" value={String(data.regions.length)} tone={disabledRegionCount ? "warn" : "default"} />
          <OfficialMetric label="当前价" value={String(data.currentPrices.length)} tone={failedCount ? "warn" : "default"} />
          <OfficialMetric label="最近更新" value={formatRelativeTime(data.generatedAt)} />
        </div>

        <Divider />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2d3435]">试采集与命令</p>
            <p className="mt-1 text-sm leading-6 text-[#5a6061]">
              后台试采集固定为 dry-run，只读取 Apple App Store 公开页并生成数据库写入计划，不会写入 Supabase。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEnqueueWeeklyCollection}
              disabled={loadingAction === "official-enqueue-weekly"}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
            >
              {loadingAction === "official-enqueue-weekly" ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
              加入周全量采集
            </button>
            <button
              type="button"
              onClick={onEnqueueFxRefresh}
              disabled={loadingAction === "official-enqueue-fx"}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#2f7a4b]/25 bg-white px-4 text-sm font-medium text-[#2f7a4b] transition-colors hover:bg-[#eef8f1] disabled:opacity-60"
            >
              {loadingAction === "official-enqueue-fx" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              刷新汇率估算
            </button>
            <button
              type="button"
              onClick={onProbe}
              disabled={loadingAction === "official-probe"}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-sm font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60"
            >
              {loadingAction === "official-probe" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              试采集 ChatGPT US
            </button>
            <button
              type="button"
              onClick={onCopyCommand}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-4 text-sm font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
            >
              <Copy size={15} />
              复制 dry-run 命令
            </button>
          </div>
        </div>

        {probeResult ? (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${probeResult.ok ? "border-[#2f7a4b]/20 bg-[#e8f3ec] text-[#2f7a4b]" : "border-[#9b3328]/20 bg-[#fbe9e7] text-[#9b3328]"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{probeResult.ok ? "试采集完成" : "试采集失败"}</span>
              {probeResult.result?.run?.status ? <Badge tone="info">{officialRunStatusLabel(probeResult.result.run.status)}</Badge> : null}
              {probeResult.result?.database?.status ? <Badge tone="info">DB {probeResult.result.database.status}</Badge> : null}
            </div>
            <p className="mt-2 leading-6">
              {officialProbeSummaryText(probeResult)}
            </p>
            {probeResult.message ? <p className="mt-1 break-words text-xs leading-5">{probeResult.message}</p> : null}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="应用管理" icon={<Database size={17} />}>
          <OfficialConfigList
            emptyText="暂无官方应用配置。"
            items={data.apps}
            getKey={(app) => app.id}
            renderTitle={(app) => app.displayName}
            renderMeta={(app) => `${app.provider} · App Store ${app.appStoreId}`}
            getEnabled={(app) => app.enabled}
            getLoading={(app) => loadingAction === `official-app-${app.id}`}
            canMutate={canMutate}
            onToggle={(app) => onToggleAppEnabled(app, !app.enabled)}
          />
        </Panel>

        <Panel title="计划管理" icon={<ClipboardList size={17} />}>
          <OfficialConfigList
            emptyText="暂无官方计划配置。"
            items={data.plans}
            getKey={(plan) => plan.id}
            renderTitle={(plan) => plan.label}
            renderMeta={(plan) => `${plan.appSlug} · ${officialBillingPeriodLabel(plan.billingPeriod)}`}
            getEnabled={(plan) => plan.enabled}
            getLoading={(plan) => loadingAction === `official-plan-${plan.id}`}
            canMutate={canMutate}
            onToggle={(plan) => onTogglePlanEnabled(plan, !plan.enabled)}
          />
        </Panel>

        <Panel title="地区管理" icon={<Store size={17} />}>
          <OfficialConfigList
            emptyText="暂无官方地区配置。"
            items={data.regions}
            getKey={(region) => region.id}
            renderTitle={(region) => `${region.countryLabel} · ${region.countryCode}`}
            renderMeta={(region) => `${region.storefrontCode} · ${region.currencyCode}`}
            getEnabled={(region) => region.enabled}
            getLoading={(region) => loadingAction === `official-region-${region.id}`}
            canMutate={canMutate}
            onToggle={(region) => onToggleRegionEnabled(region, !region.enabled)}
          />
        </Panel>
      </div>

      <Panel title="当前官方地区价" icon={<ClipboardList size={17} />}>
        {data.currentPrices.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[1120px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">平台 / 计划</th>
                  <th className="px-4 py-3">地区</th>
                  <th className="px-4 py-3">原价</th>
                  <th className="px-4 py-3">约合人民币</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {officialPriceRows.visibleItems.map((price) => {
                  const reviewLoading = loadingAction === `official-price-${price.id}-needs_review`;
                  const missingLoading = loadingAction === `official-price-${price.id}-missing`;
                  const restoreLoading = loadingAction === `official-price-${price.id}-available`;

                  return (
                    <tr key={price.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{price.appName}</div>
                        <div className="mt-1 text-xs text-[#5a6061]">
                          {price.planLabel} · {officialBillingPeriodLabel(price.billingPeriod)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{price.countryLabel}</div>
                        <div className="mt-1 text-xs text-[#adb3b4]">{price.countryCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{price.priceText || "未解析"}</div>
                        <div className="mt-1 text-xs text-[#adb3b4]">{price.currencyCode || "未知币种"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{formatCurrency(price.cnyPrice, "CNY")}</div>
                        <div className="mt-1 text-xs text-[#adb3b4]">FX {price.fxDate || "未记录"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${officialPriceStatusClass(price.status)}`}>
                          {officialPriceStatusLabel(price.status)}
                        </span>
                        {price.failureReason ? <p className="mt-1 max-w-60 break-words text-xs leading-5 text-[#9b3328]">{price.failureReason}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-[#5a6061]">
                        <div>{formatRelativeTime(price.lastCheckedAt || price.lastSuccessAt)}</div>
                        {price.lastSuccessAt && price.lastCheckedAt !== price.lastSuccessAt ? (
                          <div className="mt-1 text-xs text-[#adb3b4]">成功 {formatRelativeTime(price.lastSuccessAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={price.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
                        >
                          App Store
                          <ExternalLink size={12} />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={!canMutate || reviewLoading || price.status === "needs_review"}
                            onClick={() => onUpdatePriceStatus(price, "needs_review")}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#47657a]/20 bg-white px-2.5 text-xs font-medium text-[#47657a] transition-colors hover:bg-[#eef3f8] disabled:opacity-50"
                          >
                            {reviewLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                            待复核
                          </button>
                          <button
                            type="button"
                            disabled={!canMutate || missingLoading || price.status === "missing"}
                            onClick={() => onUpdatePriceStatus(price, "missing")}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#9b3328]/20 bg-white px-2.5 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                          >
                            {missingLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                            缺失
                          </button>
                          {price.status !== "available" ? (
                            <button
                              type="button"
                              disabled={!canMutate || restoreLoading}
                              onClick={() => onUpdatePriceStatus(price, "available")}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#2f7a4b]/20 bg-white px-2.5 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-50"
                            >
                              {restoreLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                              恢复
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Database size={32} className="text-[#adb3b4]" />}
            title="暂无官方地区价"
            description="应用 migration 并执行 collect:official 后，当前价会出现在这里。"
          />
        )}
        {officialPriceRows.canToggle ? (
          <AdminListPager
            expanded={officialPriceRows.expanded}
            label={officialPriceRows.statusLabel}
            buttonLabel={officialPriceRows.toggleLabel}
            onToggle={officialPriceRows.toggle}
          />
        ) : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="最近官方价采集" icon={<RefreshCcw size={17} />}>
          {latestRuns.length ? (
            <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
              {latestRuns.map((run) => (
                <div key={run.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#2d3435]">{run.targetAppSlug || "全部 App"}</span>
                    <Badge>{run.mode}</Badge>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${officialRunStatusClass(run.status)}`}>
                      {officialRunStatusLabel(run.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#5a6061]">
                    成功 {run.successCount}，失败 {run.failureCount}，未匹配 {run.unmatchedCount} · {formatRelativeTime(run.finishedAt || run.startedAt)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#adb3b4]">
                    {run.targetRegionCodes.length ? run.targetRegionCodes.join(", ") : "全部地区"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Clock size={32} className="text-[#adb3b4]" />}
              title="暂无官方价采集记录"
              description="collect:official --post 成功写入后会生成采集日志。"
            />
          )}
        </Panel>

        <Panel title="待匹配官方价项目" icon={<AlertTriangle size={17} />}>
          {unmatchedItems.length ? (
            <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
              {unmatchedItems.map((item, index) => (
                <div key={`${item.appSlug || "app"}-${item.countryCode || "region"}-${index}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#2d3435]">{item.rawTitle || "未命名项目"}</span>
                    {item.appSlug ? <Badge>{item.appSlug}</Badge> : null}
                    {item.countryLabel || item.countryCode ? <Badge tone="info">{item.countryLabel || item.countryCode}</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-[#5a6061]">{item.priceText || "未记录价格"}</p>
                  {item.reason ? <p className="mt-1 text-xs leading-5 text-[#adb3b4]">{item.reason}</p> : null}
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
                    >
                      查看来源
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 size={32} className="text-[#adb3b4]" />}
              title="暂无待匹配项目"
              description="未被规则消费的 App Store 内购项目会出现在这里，方便后续修正规则。"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ApiModelsAdminPanel({
  data,
  loadingAction,
  probeResult,
  onProbe,
  onCopyImportCommand,
  onCopyCollectorCommand,
  onEnqueueCollection,
  onToggleProviderEnabled,
  onToggleOfferStatus,
  onReviewProviderSubmission,
  onSaveEditable,
}: {
  data: ApiModelAdminData;
  loadingAction: string | null;
  probeResult: ApiModelProbeResult | null;
  onProbe: () => void;
  onCopyImportCommand: () => void;
  onCopyCollectorCommand: () => void;
  onEnqueueCollection: () => void;
  onToggleProviderEnabled: (provider: ApiModelAdminProvider, enabled: boolean) => void;
  onToggleOfferStatus: (offer: ApiModelAdminOffer, status: ApiModelAdminOffer["status"]) => void;
  onReviewProviderSubmission: (submission: ApiProviderSubmission, reviewStatus: ApiProviderSubmission["reviewStatus"]) => void;
  onSaveEditable: (payload: ApiModelEditablePayload) => Promise<{ ok: boolean; message?: string }>;
}) {
  const inactiveProviderCount = data.providers.filter((provider) => !provider.enabled).length;
  const inactiveOfferCount = data.offers.filter((offer) => offer.status !== "active").length;
  const [editorPayload, setEditorPayload] = useState<ApiModelEditablePayload | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const apiSubmissionRowsKey = useMemo(() => data.providerSubmissions.map((submission) => submission.id).join("|"), [data.providerSubmissions]);
  const apiCandidateRowsKey = useMemo(() => data.providerCandidates.map((candidate) => candidate.id).join("|"), [data.providerCandidates]);
  const apiModelRowsKey = useMemo(() => data.models.map((model) => model.id).join("|"), [data.models]);
  const apiProviderRowsKey = useMemo(() => data.providers.map((provider) => provider.id).join("|"), [data.providers]);
  const apiOfferRowsKey = useMemo(() => data.offers.map((offer) => offer.id).join("|"), [data.offers]);
  const apiPlanRowsKey = useMemo(() => data.plans.map((plan) => plan.id).join("|"), [data.plans]);
  const apiSubmissionRows = useAdminExpandableRows(data.providerSubmissions, `api-submissions:${apiSubmissionRowsKey}`);
  const apiCandidateRows = useAdminExpandableRows(data.providerCandidates, `api-candidates:${apiCandidateRowsKey}`);
  const apiModelRows = useAdminExpandableRows(data.models, `api-models:${apiModelRowsKey}`);
  const apiProviderRows = useAdminExpandableRows(data.providers, `api-providers:${apiProviderRowsKey}`);
  const apiOfferRows = useAdminExpandableRows(data.offers, `api-offers:${apiOfferRowsKey}`);
  const apiPlanRows = useAdminExpandableRows(data.plans, `api-plans:${apiPlanRowsKey}`);
  const latestRuns = data.collectRuns.slice(0, 8);
  const pendingApiSubmissions = data.providerSubmissions.filter((submission) => submission.reviewStatus === "pending");
  const todoApiSubmissions = data.providerSubmissions.filter((submission) => submission.reviewStatus === "collector_todo");
  const editorSaving = editorPayload ? loadingAction === `api-edit-${editorPayload.target}-${editorPayload.id}` : false;

  function openEditor(payload: ApiModelEditablePayload) {
    setEditorPayload(payload);
    setEditorText(prettyApiEditablePayload(payload));
    setEditorError(null);
  }

  async function saveEditor() {
    const parsed = parseApiEditablePayload(editorText);
    if (!parsed.ok) {
      setEditorError(parsed.message);
      return;
    }

    const result = await onSaveEditable(parsed.payload);
    if (result.ok) {
      setEditorPayload(null);
      setEditorText("");
      setEditorError(null);
    } else {
      setEditorError(result.message || "保存失败。");
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="API 模型控制台" icon={<TerminalSquare size={17} />}>
        {data.message ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fff7e8] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#7a541b]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.message}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <OfficialMetric label="数据源" value={data.source === "supabase" ? "Supabase" : "静态样本"} />
          <OfficialMetric label="标准模型" value={String(data.models.length)} />
          <OfficialMetric label="来源渠道" value={String(data.providers.length)} tone={inactiveProviderCount ? "warn" : "default"} />
          <OfficialMetric label="候选池" value={String(data.providerCandidates.length)} tone={data.providerCandidates.length ? "warn" : "default"} />
          <OfficialMetric label="套餐" value={String(data.plans.length)} />
          <OfficialMetric label="报价" value={String(data.offers.length)} tone={inactiveOfferCount ? "warn" : "default"} />
          <OfficialMetric label="渠道提交" value={String(data.providerSubmissions.length)} tone={todoApiSubmissions.length ? "warn" : "default"} />
        </div>

        <Divider />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2d3435]">人工维护与来源校验</p>
            <p className="mt-1 text-sm leading-6 text-[#5a6061]">
              API 模型价格以 Supabase api_* 表为最终真相。后台编辑会直接更新数据库；采集和试采集只用于检查来源链接、发现变化和留下校验记录，不自动覆盖价格。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEnqueueCollection}
              disabled={loadingAction === "api-models-enqueue"}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
            >
              {loadingAction === "api-models-enqueue" ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
              加入校验队列
            </button>
            <Link
              href="/api-models"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-sm font-medium text-white transition-colors hover:bg-[#202829]"
            >
              查看前台
              <ExternalLink size={15} />
            </Link>
            <button
              type="button"
              onClick={onProbe}
              disabled={loadingAction === "api-models-probe"}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-sm font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60"
            >
              {loadingAction === "api-models-probe" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              校验 OpenRouter
            </button>
            <button
              type="button"
              onClick={onCopyCollectorCommand}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-4 text-sm font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
            >
              <Copy size={15} />
              复制校验 dry-run
            </button>
            <button
              type="button"
              onClick={onCopyImportCommand}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-4 text-sm font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
            >
              <Copy size={15} />
              复制导入 dry-run
            </button>
          </div>
        </div>

        {probeResult ? (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${probeResult.ok ? "border-[#2f7a4b]/20 bg-[#e8f3ec] text-[#2f7a4b]" : "border-[#9b3328]/20 bg-[#fbe9e7] text-[#9b3328]"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{probeResult.ok ? "来源校验完成" : "来源校验失败"}</span>
              {probeResult.result?.run?.status ? <Badge tone="info">{officialRunStatusLabel(probeResult.result.run.status)}</Badge> : null}
              {probeResult.result?.scope?.providers?.length ? <Badge tone="info">{probeResult.result.scope.providers.join(", ")}</Badge> : null}
            </div>
            <p className="mt-2 leading-6">
              {apiModelProbeSummaryText(probeResult)}
            </p>
            {probeResult.result?.run?.firstError ? (
              <p className="mt-1 break-words text-xs leading-5">{probeResult.result.run.firstError}</p>
            ) : null}
            {probeResult.message ? <p className="mt-1 break-words text-xs leading-5">{probeResult.message}</p> : null}
          </div>
        ) : null}
      </Panel>

      <Panel title="API 标准模型" icon={<Database size={17} />}>
        {data.models.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[980px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">能力 / 工具</th>
                  <th className="px-4 py-3">覆盖</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {apiModelRows.visibleItems.map((model) => (
                  <tr key={model.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#2d3435]">{model.displayName}</div>
                      <p className="mt-1 text-xs text-[#adb3b4]">{model.family} · {model.modelId}{model.contextWindow ? ` · ${model.contextWindow}` : ""}</p>
                      {model.sourceUrl ? (
                        <a
                          href={model.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
                        >
                          {model.sourceLabel || "查看来源"}
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="line-clamp-2 text-[#5a6061]">{model.description || "未记录说明"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {model.capabilities.slice(0, 4).map((item) => <Badge key={item} tone="info">{item}</Badge>)}
                        {model.suitableTools.slice(0, 3).map((item) => <Badge key={item}>{item}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#5a6061]">{model.providerCount} 个来源 · {model.offerCount} 条报价</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiModelStatusClass(model.status)}`}>
                        {apiModelStatusLabel(model.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5a6061]">{formatRelativeTime(model.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEditor(buildApiModelPayload(model))}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                      >
                        <Pencil size={13} />
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Database size={32} className="text-[#adb3b4]" />}
            title="暂无 API 标准模型"
            description="导入 api_models 后，标准模型会出现在这里。"
          />
        )}
        {apiModelRows.canToggle ? (
          <AdminListPager
            expanded={apiModelRows.expanded}
            label={apiModelRows.statusLabel}
            buttonLabel={apiModelRows.toggleLabel}
            onToggle={apiModelRows.toggle}
          />
        ) : null}
      </Panel>

      <Panel title="API 渠道提交" icon={<Inbox size={17} />}>
        {data.providerSubmissions.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[1180px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">提交链接</th>
                  <th className="px-4 py-3">解析结果</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">说明</th>
                  <th className="px-4 py-3">提交时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {apiSubmissionRows.visibleItems.map((submission) => {
                  const meta = submission.parsedMeta || {};
                  const approveLoading = loadingAction === `api-submission-${submission.id}-approved`;
                  const todoLoading = loadingAction === `api-submission-${submission.id}-collector_todo`;
                  const rejectLoading = loadingAction === `api-submission-${submission.id}-rejected`;
                  const supportReason = stringMeta(meta, "support_reason") || "等待管理员确认是否纳入 API 模型渠道。";
                  return (
                    <tr key={submission.id} className="align-top">
                      <td className="max-w-[320px] px-4 py-3">
                        <a
                          href={submission.submittedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-medium text-[#2d3435] transition-colors hover:text-[#2f7a4b]"
                        >
                          {submission.submittedName || submission.parsedProviderName || safeDomain(submission.submittedUrl) || submission.submittedUrl}
                        </a>
                        <p className="mt-1 break-all text-xs leading-5 text-[#5a6061]">{submission.submittedUrl}</p>
                        {submission.submittedContact ? <p className="mt-1 text-xs text-[#adb3b4]">联系方式：{submission.submittedContact}</p> : null}
                      </td>
                      <td className="max-w-[300px] px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#2d3435]">{submission.parsedProviderName || "待确认来源"}</span>
                          {submission.parsedType ? <Badge>{apiProviderTypeLabels[submission.parsedType]}</Badge> : null}
                          {submission.providerId ? <Badge tone="info">已匹配已有来源</Badge> : null}
                        </div>
                        {submission.parsedProviderUrl ? (
                          <a
                            href={submission.parsedProviderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 break-all text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
                          >
                            {submission.parsedProviderUrl}
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                        {submission.submittedNote ? <p className="mt-2 text-xs leading-5 text-[#5a6061]">{submission.submittedNote}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiSubmissionParseStatusClass(submission.parseStatus)}`}>
                            {apiSubmissionParseStatusLabel(submission.parseStatus)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiSubmissionReviewStatusClass(submission.reviewStatus)}`}>
                            {apiSubmissionReviewStatusLabel(submission.reviewStatus)}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-sm leading-6 text-[#5a6061]">{supportReason}</td>
                      <td className="px-4 py-3 text-[#5a6061]">{formatRelativeTime(submission.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {submission.providerId && submission.reviewStatus === "pending" ? (
                            <button
                              type="button"
                              disabled={approveLoading}
                              onClick={() => onReviewProviderSubmission(submission, "approved")}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-60"
                            >
                              {approveLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              通过
                            </button>
                          ) : null}
                          {submission.reviewStatus === "pending" ? (
                            <button
                              type="button"
                              disabled={todoLoading}
                              onClick={() => onReviewProviderSubmission(submission, "collector_todo")}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#7a541b]/20 bg-white px-3 text-xs font-medium text-[#7a541b] transition-colors hover:bg-[#fff7e8] disabled:opacity-60"
                            >
                              {todoLoading ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
                              待办
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(buildApiProviderSubmissionContext(submission));
                            }}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                          >
                            <Copy size={13} />
                            复制上下文
                          </button>
                          <button
                            type="button"
                            disabled={rejectLoading}
                            onClick={() => onReviewProviderSubmission(submission, "rejected")}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-60"
                          >
                            {rejectLoading ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                            拒绝
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Inbox size={32} className="text-[#adb3b4]" />}
            title="暂无 API 渠道提交"
            description="用户在 API 模型页提交官方文档、价格页或公开套餐页后，会出现在这里。"
          />
        )}
        {apiSubmissionRows.canToggle ? (
          <AdminListPager
            expanded={apiSubmissionRows.expanded}
            label={apiSubmissionRows.statusLabel}
            buttonLabel={apiSubmissionRows.toggleLabel}
            onToggle={apiSubmissionRows.toggle}
          />
        ) : null}
        {pendingApiSubmissions.length || todoApiSubmissions.length ? (
          <p className="mt-3 text-xs leading-5 text-[#adb3b4]">
            待审核 {pendingApiSubmissions.length} 条，采集器待办 {todoApiSubmissions.length} 条。未匹配到已有 API 来源的提交不会自动通过，避免产生空渠道。
          </p>
        ) : null}
      </Panel>

      <Panel title="API 候选渠道池" icon={<ClipboardList size={17} />}>
        {data.providerCandidates.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[1180px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">候选渠道</th>
                  <th className="px-4 py-3">类型 / 计费</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">收录理由</th>
                  <th className="px-4 py-3">下一步</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {apiCandidateRows.visibleItems.map((candidate) => (
                  <tr key={candidate.id} className="align-top">
                    <td className="max-w-[280px] px-4 py-3">
                      <div className="font-medium text-[#2d3435]">{candidate.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <a
                          href={candidate.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#47657a] transition-colors hover:text-[#2d3435]"
                        >
                          官网
                          <ExternalLink size={12} />
                        </a>
                        {candidate.pricingUrl ? (
                          <a
                            href={candidate.pricingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#47657a] transition-colors hover:text-[#2d3435]"
                          >
                            价格页
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                      {candidate.notes ? <p className="mt-2 text-xs leading-5 text-[#adb3b4]">{candidate.notes}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge>{apiProviderTypeLabel(candidate.type)}</Badge>
                        <Badge tone="info">{candidate.billingMode}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiProviderCandidateStatusClass(candidate.status)}`}>
                          {apiProviderCandidateStatusLabel(candidate.status)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiProviderCandidateEvidenceClass(candidate.evidenceStatus)}`}>
                          {apiProviderCandidateEvidenceLabel(candidate.evidenceStatus)}
                        </span>
                        <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-xs font-medium text-[#5a6061]">
                          {apiProviderCandidatePriorityLabel(candidate.priority)}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-sm leading-6 text-[#5a6061]">
                      {candidate.reason}
                    </td>
                    <td className="max-w-[300px] px-4 py-3 text-sm leading-6 text-[#5a6061]">
                      {candidate.nextStep}
                    </td>
                    <td className="px-4 py-3 text-[#5a6061]">{formatRelativeTime(candidate.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(buildApiProviderCandidateContext(candidate));
                        }}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                      >
                        <Copy size={13} />
                        复制上下文
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ClipboardList size={32} className="text-[#adb3b4]" />}
            title="暂无 API 候选渠道"
            description="待核验的官方 API、公开套餐和云厂商线索会先沉淀在这里，不直接进入前台报价。"
          />
        )}
        {apiCandidateRows.canToggle ? (
          <AdminListPager
            expanded={apiCandidateRows.expanded}
            label={apiCandidateRows.statusLabel}
            buttonLabel={apiCandidateRows.toggleLabel}
            onToggle={apiCandidateRows.toggle}
          />
        ) : null}
        <p className="mt-3 text-xs leading-5 text-[#adb3b4]">
          候选池只服务后台审核和采集器扩展。没有核验价格、模型覆盖和限制前，不会作为正式 API 模型报价展示给用户。
        </p>
      </Panel>

      <Panel title="API 来源渠道" icon={<Store size={17} />}>
        {data.providers.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[980px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">计费</th>
                  <th className="px-4 py-3">覆盖</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {apiProviderRows.visibleItems.map((provider) => {
                  const loading = loadingAction === `api-provider-${provider.id}`;
                  return (
                    <tr key={provider.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{provider.name}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          <a
                            href={provider.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#47657a] transition-colors hover:text-[#2d3435]"
                          >
                            官网
                            <ExternalLink size={12} />
                          </a>
                          {provider.pricingUrl ? (
                            <a
                              href={provider.pricingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#47657a] transition-colors hover:text-[#2d3435]"
                            >
                              价格页
                              <ExternalLink size={12} />
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{apiProviderTypeLabel(provider.type)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[#5a6061]">{provider.billingMode}</td>
                      <td className="px-4 py-3 text-[#5a6061]">
                        {provider.modelCount} 个模型 · {provider.offerCount} 条报价 · {provider.planCount} 个套餐
                        {provider.limitSummary ? <p className="mt-1 max-w-72 text-xs leading-5 text-[#adb3b4]">{provider.limitSummary}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiProviderStatusClass(provider.enabled)}`}>
                          {provider.enabled ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5a6061]">{formatRelativeTime(provider.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditor(buildApiProviderPayload(provider))}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                          >
                            <Pencil size={13} />
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => onToggleProviderEnabled(provider, !provider.enabled)}
                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                              provider.enabled
                                ? "border-[#9b3328]/20 text-[#9b3328] hover:bg-[#fbe9e7]"
                                : "border-[#2f7a4b]/20 text-[#2f7a4b] hover:bg-[#e8f3ec]"
                            }`}
                          >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                            {provider.enabled ? "停用" : "启用"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Store size={32} className="text-[#adb3b4]" />}
            title="暂无 API 来源渠道"
            description="导入 api_* 静态数据后，来源渠道会出现在这里。"
          />
        )}
        {apiProviderRows.canToggle ? (
          <AdminListPager
            expanded={apiProviderRows.expanded}
            label={apiProviderRows.statusLabel}
            buttonLabel={apiProviderRows.toggleLabel}
            onToggle={apiProviderRows.toggle}
          />
        ) : null}
      </Panel>

      <Panel title="API 模型报价" icon={<ClipboardList size={17} />}>
        {data.offers.length ? (
          <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
            <table className="min-w-[1120px] w-full divide-y divide-[#adb3b4]/15 text-left text-sm">
              <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">输入价</th>
                  <th className="px-4 py-3">输出价</th>
                  <th className="px-4 py-3">套餐 / 免费口径</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 bg-white">
                {apiOfferRows.visibleItems.map((offer) => {
                  const loading = loadingAction === `api-offer-${offer.id}`;
                  const isActive = offer.status === "active";
                  return (
                    <tr key={offer.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{offer.modelName}</div>
                        <div className="mt-1 text-xs text-[#adb3b4]">
                          {offer.family}
                          {offer.routeModelId ? ` · ${offer.routeModelId}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#2d3435]">{offer.providerName}</div>
                        <div className="mt-1">
                          <Badge>{apiProviderTypeLabel(offer.providerType)}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#5a6061]">{apiPriceValueLabel(offer.inputPrice)}</td>
                      <td className="px-4 py-3 text-[#5a6061]">{apiPriceValueLabel(offer.outputPrice)}</td>
                      <td className="px-4 py-3 text-[#5a6061]">
                        {offer.freeOrPlan || "未记录"}
                        {offer.limitSummary ? <p className="mt-1 max-w-72 text-xs leading-5 text-[#adb3b4]">{offer.limitSummary}</p> : null}
                        {offer.pricingUrl ? (
                          <a
                            href={offer.pricingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
                          >
                            来源价格页
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiOfferStatusClass(offer.status)}`}>
                          {apiOfferStatusLabel(offer.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5a6061]">{formatRelativeTime(offer.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditor(buildApiOfferPayload(offer))}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                          >
                            <Pencil size={13} />
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => onToggleOfferStatus(offer, isActive ? "inactive" : "active")}
                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                              isActive
                                ? "border-[#9b3328]/20 text-[#9b3328] hover:bg-[#fbe9e7]"
                                : "border-[#2f7a4b]/20 text-[#2f7a4b] hover:bg-[#e8f3ec]"
                            }`}
                          >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                            {isActive ? "下架" : "恢复"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ClipboardList size={32} className="text-[#adb3b4]" />}
            title="暂无 API 模型报价"
            description="导入 api_model_offers 后，模型报价会出现在这里。"
          />
        )}
        {apiOfferRows.canToggle ? (
          <AdminListPager
            expanded={apiOfferRows.expanded}
            label={apiOfferRows.statusLabel}
            buttonLabel={apiOfferRows.toggleLabel}
            onToggle={apiOfferRows.toggle}
          />
        ) : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="API 套餐摘要" icon={<Database size={17} />}>
          {data.plans.length ? (
            <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
              {apiPlanRows.visibleItems.map((plan) => (
                <ApiPlanRow key={plan.id} plan={plan} onEdit={() => openEditor(buildApiPlanPayload(plan))} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Database size={32} className="text-[#adb3b4]" />}
              title="暂无 API 套餐"
              description="订阅套餐、免费额度和模型路由套餐会在这里汇总。"
            />
          )}
          {apiPlanRows.canToggle ? (
            <AdminListPager
              expanded={apiPlanRows.expanded}
              label={apiPlanRows.statusLabel}
              buttonLabel={apiPlanRows.toggleLabel}
              onToggle={apiPlanRows.toggle}
            />
          ) : null}
        </Panel>

        <Panel title="最近 API 采集" icon={<RefreshCcw size={17} />}>
          {latestRuns.length ? (
            <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
              {latestRuns.map((run) => (
                <div key={run.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#2d3435]">{run.providerName || run.providerId || "全部 API 来源"}</span>
                    {run.collectorKind ? <Badge>{run.collectorKind}</Badge> : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiRunStatusClass(run.status)}`}>
                      {apiRunStatusLabel(run.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#5a6061]">
                    模型 {run.modelCount}，报价 {run.offerCount} · {formatRelativeTime(run.finishedAt || run.startedAt)}
                  </p>
                  {run.errorMessage ? <p className="mt-1 break-words text-xs leading-5 text-[#9b3328]">{run.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Clock size={32} className="text-[#adb3b4]" />}
              title="暂无 API 采集记录"
              description="后续 API 采集器写入 api_collection_runs 后会显示在这里。"
            />
          )}
        </Panel>
      </div>

      {editorPayload ? (
        <ApiModelJsonEditorModal
          payload={editorPayload}
          text={editorText}
          error={editorError}
          saving={editorSaving}
          onChange={(value) => {
            setEditorText(value);
            setEditorError(null);
          }}
          onCancel={() => {
            setEditorPayload(null);
            setEditorText("");
            setEditorError(null);
          }}
          onSave={saveEditor}
        />
      ) : null}
    </div>
  );
}

function ApiPlanRow({ plan, onEdit }: { plan: ApiModelAdminPlan; onEdit: () => void }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[#2d3435]">{plan.name}</span>
            <Badge>{plan.providerName}</Badge>
            <Badge tone="info">{apiProviderTypeLabel(plan.type)}</Badge>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${apiProviderStatusClass(plan.enabled)}`}>
              {plan.enabled ? "启用" : "停用"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
        >
          <Pencil size={13} />
          编辑
        </button>
      </div>
      <p className="mt-2 text-sm text-[#5a6061]">
        {formatApiPlanAdminPrice(plan)} · 覆盖 {plan.modelCount} 个模型
      </p>
      <p className="mt-1 text-xs leading-5 text-[#adb3b4]">
        {plan.quotaSummary || "未记录额度"}
        {plan.limitSummary ? ` · ${plan.limitSummary}` : ""}
      </p>
      <a
        href={plan.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#47657a] transition-colors hover:text-[#2d3435]"
      >
        {plan.sourceLabel || "查看来源"}
        <ExternalLink size={12} />
      </a>
    </div>
  );
}

function ApiModelJsonEditorModal({
  payload,
  text,
  error,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  payload: ApiModelEditablePayload;
  text: string;
  error: string | null;
  saving: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#202829]/45 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-model-json-editor-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#adb3b4]/20 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#adb3b4]/15 px-5 py-4">
          <div>
            <h3 id="api-model-json-editor-title" className="text-base font-semibold text-[#2d3435]">
              编辑 {apiEditableTargetLabel(payload.target)}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#5a6061]">
              这里直接更新 Supabase api_* 表。请保留 target 和 id，只修改需要维护的字段。
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#adb3b4]/30 bg-white text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
            aria-label="关闭编辑弹窗"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <textarea
            value={text}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            className="min-h-[420px] w-full resize-y rounded-lg border border-[#adb3b4]/35 bg-[#202829] px-3 py-3 font-mono text-xs leading-6 text-[#f2f4f4] outline-none transition-colors focus:border-[#2f7a4b]"
          />
          {error ? (
            <p className="mt-3 rounded-lg border border-[#9b3328]/20 bg-[#fbe9e7] px-3 py-2 text-sm leading-6 text-[#9b3328]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#adb3b4]/15 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[#adb3b4]/30 bg-white px-4 text-sm font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2f7a4b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#256a3d] disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function buildApiModelPayload(model: ApiModelAdminModel): ApiModelEditablePayload {
  return {
    target: "model",
    id: model.id,
    displayName: model.displayName,
    modelId: model.modelId,
    contextWindow: model.contextWindow,
    description: model.description,
    status: model.status,
    sourceUrl: model.sourceUrl,
    sourceLabel: model.sourceLabel,
    capabilities: model.capabilities,
    suitableTools: model.suitableTools,
  };
}

function buildApiProviderPayload(provider: ApiModelAdminProvider): ApiModelEditablePayload {
  return {
    target: "provider",
    id: provider.id,
    name: provider.name,
    type: provider.type,
    billingMode: provider.billingMode,
    url: provider.url,
    pricingUrl: provider.pricingUrl,
    description: provider.description,
    limitSummary: provider.limitSummary,
    limitations: provider.limitations,
    sourceLabel: provider.sourceLabel,
    enabled: provider.enabled,
  };
}

function buildApiPlanPayload(plan: ApiModelAdminPlan): ApiModelEditablePayload {
  return {
    target: "plan",
    id: plan.id,
    name: plan.name,
    type: plan.type,
    priceLabel: plan.priceLabel,
    priceUsdMonthly: plan.priceUsdMonthly,
    priceCnyMonthly: plan.priceCnyMonthly,
    quotaSummary: plan.quotaSummary,
    resetSummary: plan.resetSummary,
    limitSummary: plan.limitSummary,
    limitations: plan.limitations,
    coverageLabel: plan.coverageLabel,
    compatibility: plan.compatibility,
    suitableTools: plan.suitableTools,
    sourceUrl: plan.sourceUrl,
    sourceLabel: plan.sourceLabel,
    enabled: plan.enabled,
    modelIds: plan.modelIds,
  };
}

function buildApiOfferPayload(offer: ApiModelAdminOffer): ApiModelEditablePayload {
  return {
    target: "offer",
    id: offer.id,
    routeModelId: offer.routeModelId,
    inputPrice: offer.inputPrice,
    outputPrice: offer.outputPrice,
    cacheReadPrice: offer.cacheReadPrice,
    cacheWritePrice: offer.cacheWritePrice,
    freeOrPlan: offer.freeOrPlan,
    limitSummary: offer.limitSummary,
    limitations: offer.limitations,
    compatibility: offer.compatibility,
    suitableTools: offer.suitableTools,
    pricingUrl: offer.pricingUrl,
    sourceLabel: offer.sourceLabel,
    status: offer.status,
    notes: offer.notes,
  };
}

function prettyApiEditablePayload(payload: ApiModelEditablePayload): string {
  return JSON.stringify(payload, null, 2);
}

function parseApiEditablePayload(text: string): { ok: true; payload: ApiModelEditablePayload } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(text) as Partial<ApiModelEditablePayload>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "JSON 必须是一个对象。" };
    }
    if (!isApiEditableTarget(parsed.target)) {
      return { ok: false, message: "target 必须是 model、provider、plan 或 offer。" };
    }
    if (typeof parsed.id !== "string" || !parsed.id.trim()) {
      return { ok: false, message: "id 不能为空。" };
    }
    return { ok: true, payload: parsed as ApiModelEditablePayload };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "JSON 格式错误。" };
  }
}

function isApiEditableTarget(value: unknown): value is ApiModelEditableTarget {
  return value === "model" || value === "provider" || value === "plan" || value === "offer";
}

function apiEditableTargetLabel(value: ApiModelEditableTarget): string {
  if (value === "model") return "标准模型";
  if (value === "provider") return "来源渠道";
  if (value === "plan") return "套餐";
  return "报价";
}

function apiModelStatusLabel(value: ApiModelAdminModel["status"]): string {
  if (value === "active") return "展示中";
  if (value === "needs_review") return "待复核";
  return "已停用";
}

function apiModelStatusClass(value: ApiModelAdminModel["status"]): string {
  if (value === "active") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "needs_review") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function formatApiPlanAdminPrice(plan: ApiModelAdminPlan) {
  if (typeof plan.priceCnyMonthly === "number") return `¥${formatCompactNumber(plan.priceCnyMonthly)}/月 · ${plan.priceLabel || "人民币月费"}`;
  if (typeof plan.priceUsdMonthly === "number") return `$${formatCompactNumber(plan.priceUsdMonthly)}/月 · ${plan.priceLabel || "美元月费"}`;
  return plan.priceLabel || "未记录价格";
}

function formatCompactNumber(value: number) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function useAdminExpandableRows<T>(items: T[], resetKey: string, initialCount = ADMIN_LIST_PREVIEW_ROWS) {
  const [expandState, setExpandState] = useState({ resetKey: "", expanded: false });
  const expanded = expandState.resetKey === resetKey ? expandState.expanded : false;
  const canToggle = items.length > initialCount;
  const visibleItems = expanded || !canToggle ? items : items.slice(0, initialCount);

  return {
    visibleItems,
    expanded,
    canToggle,
    statusLabel: `已显示 ${visibleItems.length} / ${items.length}`,
    toggleLabel: expanded ? "收起" : "展开全部",
    toggle: () =>
      setExpandState((state) => ({
        resetKey,
        expanded: state.resetKey === resetKey ? !state.expanded : true,
      })),
  };
}

function AdminListPager({
  label,
  buttonLabel,
  expanded,
  onToggle,
}: {
  label: string;
  buttonLabel: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#adb3b4]/20 bg-[#f8f8f8] px-4 py-3 text-xs text-[#5a6061]">
      <span className="font-medium">{label}</span>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function OfficialMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-lg bg-[#f2f4f4] px-3 py-2.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#5a6061]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${tone === "warn" ? "text-[#7a541b]" : "text-[#2d3435]"}`}>{value}</p>
    </div>
  );
}

function CollectorHealthPanel({ health }: { health: CollectorHealthData }) {
  const sourceRowsKey = `${health.generatedAt}:${health.sources.length}:${health.staleSources.length}`;
  const allSourceRows = useAdminExpandableRows(health.sources, `collector-health-sources:${sourceRowsKey}`, 18);
  const staleRows = useAdminExpandableRows(health.staleSources, `collector-health-stale:${sourceRowsKey}`, 10);
  const failureRows = useAdminExpandableRows(health.recentFailures, `collector-health-failures:${health.generatedAt}:${health.recentFailures.length}`, 8);

  return (
    <div className="space-y-5">
      <Panel title="采集健康总览" icon={<Activity size={17} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <HealthMetric label="整体状态" value={health.overall.label} tone={health.overall.tone} />
          <HealthMetric label="启用渠道" value={`${health.overall.enabledSources}/${health.overall.totalSources}`} />
          <HealthMetric label="新鲜 / 变慢" value={`${health.overall.freshSources}/${health.overall.agingSources}`} tone={health.overall.agingSources ? "info" : "success"} />
          <HealthMetric label="成功过期 / 未成功" value={`${health.overall.staleSources}/${health.overall.criticalSources}`} tone={health.overall.criticalSources || health.overall.staleSources ? "warn" : "success"} />
          <HealthMetric label="最近尝试" value={`${health.overall.recentlyCheckedSources}/${health.overall.enabledSources}`} tone={health.overall.staleCheckSources ? "info" : "success"} />
          <HealthMetric label="真实失败" value={String(health.overall.failedSources)} tone={health.overall.failedSources ? "danger" : "success"} />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="采集器分组" icon={<Database size={17} />}>
          {health.kindSummaries.length ? (
            <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f2f4f4] text-xs font-semibold uppercase tracking-wider text-[#5a6061]">
                  <tr>
                    <th className="px-3 py-2.5">采集器</th>
                    <th className="px-3 py-2.5">渠道</th>
                    <th className="px-3 py-2.5">成功状态</th>
                    <th className="px-3 py-2.5">尝试状态</th>
                    <th className="px-3 py-2.5">最近成功</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#adb3b4]/15">
                  {health.kindSummaries.map((summary) => (
                    <tr key={summary.kind}>
                      <td className="px-3 py-3 font-medium text-[#2d3435]">{collectorKindLabel(summary.kind)}</td>
                      <td className="px-3 py-3 text-[#5a6061]">{summary.total}</td>
                      <td className="px-3 py-3 text-[#5a6061]">
                        新鲜 {summary.fresh}，变慢 {summary.aging}
                      </td>
                      <td className="px-3 py-3 text-[#5a6061]">
                        过期 {summary.stale}，未成 {summary.critical + summary.never}，失败 {summary.failed}
                        <span className="block text-xs text-[#adb3b4]">近尝试 {summary.recentAttempts}，待尝试 {summary.staleAttempts}</span>
                      </td>
                      <td className="px-3 py-3 text-[#5a6061]">
                        {summary.latestSuccessAt ? formatRelativeTime(summary.latestSuccessAt) : "未记录"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Database size={32} className="text-[#adb3b4]" />}
              title="暂无采集器分组"
              description="启用渠道采集过后会形成分组统计。"
            />
          )}
        </Panel>

        <Panel title="采集节点" icon={<Server size={17} />}>
          {health.nodeSummaries.length ? (
            <div className="space-y-2">
              {health.nodeSummaries.map((node) => (
                <CollectorNodeCard key={node.node.id} node={node} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Server size={32} className="text-[#adb3b4]" />}
              title="暂无节点心跳"
              description="GitHub Actions 或 VPS 上报后会显示在这里。"
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="需要关注的渠道" icon={<AlertTriangle size={17} />}>
          <CollectorSourceList rows={staleRows.visibleItems} emptyTitle="暂无关注渠道" emptyDescription="已启用渠道的成功确认都在当前健康窗口内。" />
          {staleRows.canToggle ? (
            <AdminListPager
              expanded={staleRows.expanded}
              label={staleRows.statusLabel}
              buttonLabel={staleRows.toggleLabel}
              onToggle={staleRows.toggle}
            />
          ) : null}
        </Panel>

        <Panel title="最近失败" icon={<Clock size={17} />}>
          {failureRows.visibleItems.length ? (
            <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
              {failureRows.visibleItems.map((run) => (
                <CollectorFailureRow key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 size={32} className="text-[#adb3b4]" />}
              title="暂无失败记录"
              description="最近采集日志里没有失败或部分失败记录。"
            />
          )}
          {failureRows.canToggle ? (
            <AdminListPager
              expanded={failureRows.expanded}
              label={failureRows.statusLabel}
              buttonLabel={failureRows.toggleLabel}
              onToggle={failureRows.toggle}
            />
          ) : null}
        </Panel>
      </div>

      <Panel title="全部渠道健康" icon={<Store size={17} />}>
        <CollectorSourceList rows={allSourceRows.visibleItems} emptyTitle="暂无渠道" emptyDescription="渠道源创建后会出现在这里。" />
        {allSourceRows.canToggle ? (
          <AdminListPager
            expanded={allSourceRows.expanded}
            label={allSourceRows.statusLabel}
            buttonLabel={allSourceRows.toggleLabel}
            onToggle={allSourceRows.toggle}
          />
        ) : null}
      </Panel>
    </div>
  );
}

function HealthMetric({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: CollectorHealthData["overall"]["tone"];
}) {
  return (
    <div className="rounded-lg bg-[#f2f4f4] px-3 py-2.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[#5a6061]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${healthTextClass(tone)}`}>{value}</p>
    </div>
  );
}

function CollectorNodeCard({ node }: { node: CollectorHealthNodeRow }) {
  return (
    <div className="rounded-lg border border-[#adb3b4]/20 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[#2d3435]">{node.node.name}</span>
            <HealthPill tone={node.tone}>{collectorNodeHealthLabel(node.health)}</HealthPill>
            <Badge tone="info">{collectorHeartbeatStatusLabel(node.status)}</Badge>
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">
            {node.node.id}
            {node.node.type ? ` · ${collectorNodeTypeLabel(node.node.type)}` : ""}
            {node.node.runtime ? ` · ${collectorNodeRuntimeLabel(node.node.runtime)}` : ""}
            {node.node.region ? ` · ${node.node.region}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-[#5a6061]">{node.lastSeenAt ? formatRelativeTime(node.lastSeenAt) : "未记录"}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#5a6061]">
        <span>成功 {node.successCount}</span>
        <span>失败 {node.failureCount}</span>
        <span>报价 {node.offerCount}</span>
      </div>
      {node.scope ? <p className="mt-2 truncate text-xs text-[#adb3b4]">范围：{node.scope}</p> : null}
      {node.message ? <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">{node.message}</p> : null}
    </div>
  );
}

function CollectorSourceList({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: CollectorHealthSourceRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<Store size={32} className="text-[#adb3b4]" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#adb3b4]/20">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#f2f4f4] text-xs font-semibold uppercase tracking-wider text-[#5a6061]">
          <tr>
            <th className="px-3 py-2.5">渠道</th>
            <th className="px-3 py-2.5">采集器</th>
            <th className="px-3 py-2.5">状态</th>
            <th className="px-3 py-2.5">最近成功</th>
            <th className="px-3 py-2.5">最近尝试</th>
            <th className="px-3 py-2.5">失败</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#adb3b4]/15">
          {rows.map((source) => (
            <tr key={source.id}>
              <td className="min-w-[220px] px-3 py-3">
                <div className="font-medium text-[#2d3435]">{source.name}</div>
                <div className="mt-0.5 truncate text-xs text-[#adb3b4]">{source.host || source.id}</div>
              </td>
              <td className="px-3 py-3 text-[#5a6061]">{collectorKindLabel(source.collectorKind)}</td>
              <td className="px-3 py-3">
                <HealthPill tone={source.tone}>{collectorSourceStatusLabel(source.status)}</HealthPill>
              </td>
              <td className="px-3 py-3 text-[#5a6061]">
                {source.lastSuccessAt ? formatRelativeTime(source.lastSuccessAt) : "未记录"}
                {source.ageMinutes !== null ? <span className="block text-xs text-[#adb3b4]">{formatAgeMinutes(source.ageMinutes)}</span> : null}
              </td>
              <td className="px-3 py-3 text-[#5a6061]">
                {source.lastCheckedAt ? formatRelativeTime(source.lastCheckedAt) : "未尝试"}
                {source.checkAgeMinutes !== null ? <span className="block text-xs text-[#adb3b4]">{formatAgeMinutes(source.checkAgeMinutes)}</span> : null}
                {source.isAttemptStale ? <span className="block text-xs font-medium text-[#7a541b]">待重新尝试</span> : null}
              </td>
              <td className="max-w-[280px] px-3 py-3 text-[#5a6061]">
                {source.consecutiveFailures ? `${source.consecutiveFailures} 次` : "0 次"}
                {source.lastError ? <span className="block truncate text-xs text-[#9b3328]" title={source.lastError}>{source.lastError}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollectorFailureRow({ run }: { run: CollectorHealthRunRow }) {
  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[#2d3435]">{run.sourceName || run.sourceId || "未知来源"}</span>
        {run.collector ? <Badge>{collectorKindLabel(run.collector)}</Badge> : null}
        <Badge tone="info">{run.node.name}</Badge>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${crawlStatusClass(run.status)}`}>
          {crawlStatusLabel(run.status)}
        </span>
      </div>
      <p className="mt-2 text-sm text-[#5a6061]">
        成功 {run.successCount}，失败 {run.failureCount} · {run.finishedAt ? formatRelativeTime(run.finishedAt) : "未记录"}
      </p>
      {run.message ? <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">{run.message}</p> : null}
    </div>
  );
}

function OfficialConfigList<T>({
  items,
  emptyText,
  getKey,
  renderTitle,
  renderMeta,
  getEnabled,
  getLoading,
  canMutate,
  onToggle,
  initialCount = ADMIN_LIST_PREVIEW_ROWS,
}: {
  items: T[];
  emptyText: string;
  getKey: (item: T) => string;
  renderTitle: (item: T) => string;
  renderMeta: (item: T) => string;
  getEnabled: (item: T) => boolean;
  getLoading: (item: T) => boolean;
  canMutate: boolean;
  onToggle: (item: T) => void;
  initialCount?: number;
}) {
  const rowsKey = useMemo(() => items.map(getKey).join("|"), [getKey, items]);
  const rows = useAdminExpandableRows(items, `official-config:${rowsKey}`, initialCount);

  if (!items.length) {
    return <div className="rounded-lg border border-dashed border-[#adb3b4]/30 px-3 py-8 text-center text-sm text-[#adb3b4]">{emptyText}</div>;
  }

  return (
    <>
      <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
        {rows.visibleItems.map((item) => {
          const enabled = getEnabled(item);
          const loading = getLoading(item);

          return (
            <div key={getKey(item)} className="flex items-start justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-[#2d3435]">{renderTitle(item)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${enabled ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"}`}>
                    {enabled ? "启用" : "停用"}
                  </span>
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">{renderMeta(item)}</p>
              </div>
              <button
                type="button"
                disabled={!canMutate || loading}
                onClick={() => onToggle(item)}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : null}
                {enabled ? "停用" : "启用"}
              </button>
            </div>
          );
        })}
      </div>
      {rows.canToggle ? (
        <AdminListPager
          expanded={rows.expanded}
          label={rows.statusLabel}
          buttonLabel={rows.toggleLabel}
          onToggle={rows.toggle}
        />
      ) : null}
    </>
  );
}

function CollectionJobsPanel({ jobs }: { jobs: CollectionJob[] }) {
  return (
    <Panel title="采集任务队列" icon={<ClipboardList size={17} />}>
      {jobs.length ? (
        <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
          {jobs.map((job) => (
            <div key={job.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[#2d3435]">
                  {collectionJobName(job)}
                </span>
                <Badge>{collectionJobTypeLabel(job.jobType)}</Badge>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${collectionJobStatusClass(job.status)}`}>
                  {collectionJobStatusLabel(job.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#5a6061]">
                尝试 {job.attempts}/{job.maxAttempts} 次 · 创建 {formatRelativeTime(job.createdAt)}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#adb3b4]">
                {job.lockedBy ? `执行器 ${job.lockedBy}` : "等待执行器领取"}
                {job.startedAt ? ` · 开始 ${formatRelativeTime(job.startedAt)}` : ""}
                {job.finishedAt ? ` · 完成 ${formatRelativeTime(job.finishedAt)}` : ""}
              </p>
              {job.lastError && <p className="mt-1 break-words text-xs leading-5 text-[#9b3328]">{job.lastError}</p>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList size={32} className="text-[#adb3b4]" />}
          title="暂无采集任务"
          description="后台创建的重采任务会出现在这里，由国内 VPS 执行器领取。"
        />
      )}
    </Panel>
  );
}

function CollectorStatusSnapshot({
  status,
  onRefresh,
}: {
  status: CollectorStatusState;
  onRefresh: () => void;
}) {
  return (
    <Panel title="采集状态" icon={<Activity size={17} />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthMetric
          label="最新采集"
          value={status.latestCrawlAt ? formatRelativeTime(status.latestCrawlAt) : "未记录"}
          tone={status.latestCrawlStatus === "failed" ? "danger" : "success"}
        />
        <HealthMetric
          label="最新成功"
          value={status.latestSuccessfulCrawlAt ? formatRelativeTime(status.latestSuccessfulCrawlAt) : "未记录"}
          tone={status.latestSuccessfulCrawlAt ? "success" : "warn"}
        />
        <HealthMetric
          label="状态生成"
          value={formatRelativeTime(status.generatedAt)}
          tone={status.error ? "warn" : "muted"}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5a6061]">
        <span>
          {status.loading
            ? "正在刷新采集状态..."
            : status.error
              ? `刷新失败：${status.error}`
              : "后台会在采集、健康和日志页低频刷新。"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={status.loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#adb3b4]/25 bg-white px-3 py-1.5 font-medium text-[#2d3435] transition hover:border-[#6f7779]/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
          刷新
        </button>
      </div>
    </Panel>
  );
}

function RecentRunsPanel({ runs }: { runs: CrawlRun[] }) {
  return (
    <Panel title="最近采集记录" icon={<RefreshCcw size={17} />}>
      {runs.length ? (
        <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
          {runs.map((run) => {
            const node = collectorNodeFromRun(run);
            return (
              <div key={run.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#2d3435]">{run.sourceName || run.sourceId || "未知来源"}</span>
                  <Badge>{collectionMethodLabel(run.mode)}</Badge>
                  <Badge tone="info">节点: {node.name}</Badge>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${crawlStatusClass(run.status)}`}>
                    {crawlStatusLabel(run.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#5a6061]">
                  成功 {run.successCount} 条，失败 {run.failureCount} 条 · {formatRelativeTime(run.finishedAt || run.startedAt)}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#adb3b4]">
                  {node.id}
                  {node.type ? ` · ${collectorNodeTypeLabel(node.type)}` : ""}
                  {node.runtime ? ` · ${collectorNodeRuntimeLabel(node.runtime)}` : ""}
                  {node.region ? ` · ${node.region}` : ""}
                </p>
                {run.message && <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">{run.message}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Clock size={32} className="text-[#adb3b4]" />}
          title="暂无采集记录"
          description="采集完成后记录会出现在这里。"
        />
      )}
    </Panel>
  );
}

function OfferEmergencyList({
  title,
  emptyText,
  offers,
  productByKey,
  totalCount,
  loading,
  loadingMore,
  error,
  loadingAction,
  actionLabel,
  actionTone,
  hiddenAction,
  onLoadMore,
  onToggleHidden,
}: {
  title: string;
  emptyText: string;
  offers: RawOffer[];
  productByKey: Map<string, AdminProduct>;
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadingAction: string | null;
  actionLabel: string;
  actionTone: "danger" | "success";
  hiddenAction: boolean;
  onLoadMore: () => void;
  onToggleHidden: (offer: RawOffer, hidden: boolean) => void;
}) {
  const actionClass =
    actionTone === "danger"
      ? "border-[#9b3328]/20 text-[#9b3328] hover:bg-[#fbe9e7]"
      : "border-[#2f7a4b]/20 text-[#2f7a4b] hover:bg-[#e8f3ec]";
  const hasMore = offers.length < totalCount;

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMore || loading || loadingMore) return;
      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom < 180) onLoadMore();
    },
    [hasMore, loading, loadingMore, onLoadMore],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
      <div className="flex items-center justify-between border-b border-[#adb3b4]/15 bg-[#f2f4f4] px-3 py-2.5">
        <span className="text-xs font-semibold text-[#5a6061]">{title}</span>
        <span className="text-xs text-[#adb3b4]">显示 {offers.length} / {totalCount} 条</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-[#adb3b4]">
          <Loader2 size={15} className="animate-spin" />
          正在搜索报价...
        </div>
      ) : offers.length ? (
        <>
          <div className="max-h-[520px] divide-y divide-[#adb3b4]/15 overflow-auto" onScroll={handleScroll}>
            {offers.map((offer) => {
              const actionLoading = loadingAction === `${hiddenAction ? "hide" : "restore"}-offer-${offer.id}`;
              const storedProduct = resolveAdminOfferProduct(productByKey, offer.storedCanonicalProductId);
              const ruleProduct = resolveAdminOfferProduct(productByKey, offer.canonicalProductId);
              const storedProductLabel = adminOfferProductLabel(storedProduct, offer.storedCanonicalProductId, offer.storedCategorySlug);
              const ruleProductLabel = adminOfferProductLabel(ruleProduct, offer.canonicalProductId, offer.categorySlug);
              const categoryMismatch =
                Boolean(offer.storedCanonicalProductId || offer.canonicalProductId) &&
                (offer.storedCanonicalProductId || "") !== (offer.canonicalProductId || "");
              return (
                <div key={offer.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_92px] sm:items-center">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-[#2d3435]">{offer.sourceTitle}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#adb3b4]">
                      <span>{offer.sourceStoreName || offer.sourceName || "未记录渠道"}</span>
                      <span>{formatCurrency(offer.price, offer.currency)}</span>
                      <span>{offer.status === "out_of_stock" ? "缺货" : "有货"}</span>
                      {offer.verifiedAt && <span>{formatRelativeTime(offer.verifiedAt)}</span>}
                    </div>
                    <div className="mt-2 space-y-1 rounded-lg bg-[#f7f9f9] px-2.5 py-2 text-xs leading-5 text-[#5a6061]">
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        <span className="font-semibold text-[#2d3435]">数据库归属</span>
                        <span>{storedProductLabel}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        <span className="font-semibold text-[#2d3435]">规则推断</span>
                        <span>{ruleProductLabel}</span>
                      </div>
                      {categoryMismatch ? (
                        <p className="font-medium text-[#9b3328]">归属不一致：可能需要重建分类或检查规则。</p>
                      ) : null}
                    </div>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-[#47657a] transition-colors hover:text-[#2d3435]"
                    >
                      {offer.url}
                    </a>
                    {offer.failureReason && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#9b3328]">{offer.failureReason}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => onToggleHidden(offer, hiddenAction)}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium transition-colors disabled:opacity-60 ${actionClass}`}
                  >
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    {actionLabel}
                  </button>
                </div>
              );
            })}
            {hasMore && <div aria-hidden className="h-6" />}
          </div>
          {(hasMore || loadingMore || error) && (
            <div className="border-t border-[#adb3b4]/15 p-3">
              {error ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7]"
                >
                  加载失败，点击重试
                </button>
              ) : (
                <div className="flex h-8 items-center justify-center gap-2 text-xs text-[#adb3b4]">
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  {loadingMore ? "正在加载更多..." : "继续下滑自动加载"}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-10 text-center text-sm text-[#adb3b4]">
          {error || emptyText}
        </div>
      )}
    </div>
  );
}

function resolveAdminOfferProduct(
  productByKey: Map<string, AdminProduct>,
  productId: string | null | undefined,
): AdminProduct | null {
  return productId ? productByKey.get(productId) || null : null;
}

function adminOfferProductLabel(
  product: AdminProduct | null,
  productId: string | null | undefined,
  categorySlug: string | null | undefined,
): string {
  if (!product) {
    if (productId && categorySlug) return `${productId} · ${categorySlug}`;
    return productId || categorySlug || "未记录";
  }

  const detail = [product.platform, product.productType, product.spec].filter(Boolean).join(" / ");
  const suffix = product.id ? ` · ${product.id}` : "";
  return detail ? `${product.displayName} · ${detail}${suffix}` : `${product.displayName}${suffix}`;
}

function TextInput({
  label,
  name,
  placeholder,
  type = "text",
  required = true,
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5a6061]">{label}</span>
      <input
        name={name}
        required={required}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5a6061]">{label}</span>
      <textarea
        name={name}
        required={required}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-[#adb3b4]/40 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#2d3435]"
      />
    </label>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 text-sm font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-60">
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
      {label}
    </button>
  );
}

/* ─── Helpers ─── */

async function request(path: string, _password: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ ok: false, message: response.statusText }));
}

async function requestWithMethod(path: string, method: string, _password: string, body: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ ok: false, message: response.statusText }));
}

async function fetchAdminOfferMaintenancePage({
  scope,
  query,
  limit,
  offset,
}: {
  scope: OfferMaintenanceScope;
  query: string;
  limit: number;
  offset: number;
}): Promise<{
  ok: boolean;
  message?: string;
  offers?: RawOffer[];
  total?: number;
}> {
  const params = new URLSearchParams({
    scope,
    q: query,
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`/api/admin/offers?${params.toString()}`, {
    credentials: "include",
  });
  return response.json().catch(() => ({ ok: false, message: response.statusText }));
}

function dedupeOffers(offers: RawOffer[]): RawOffer[] {
  const map = new Map<string, RawOffer>();
  for (const offer of offers) map.set(offer.id, offer);
  return Array.from(map.values());
}

function rowFeedbackClass(value: RowFeedback["type"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "info") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

const feedbackWorkFilters: Array<{ value: FeedbackWorkFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "precheck", label: "待预处理" },
  { value: "transient", label: "临时数据" },
  { value: "category", label: "分类问题" },
  { value: "aftersales", label: "售后/发货" },
  { value: "high_risk", label: "高风险" },
  { value: "site", label: "站点意见" },
];

function getOfferFeedbackBucket(feedback: OfferFeedback): OfferFeedbackBucket {
  if (feedback.reason === "aftersales_shipping") return "aftersales";
  if (feedback.reason === "wrong_category") return "category";
  if (feedback.reason === "fraud" || feedback.reason === "bad_source") return "high_risk";
  if (feedback.reason === "wrong_price" || feedback.reason === "stock_mismatch" || feedback.reason === "item_removed") {
    return "transient";
  }
  return "other";
}

function filterOfferFeedbackByWorkFilter(
  feedback: OfferFeedback[],
  filter: FeedbackWorkFilter,
  offerById: Map<string, RawOffer>,
): OfferFeedback[] {
  if (filter === "all" || filter === "site") return feedback;
  if (filter === "precheck") {
    return feedback.filter((item) => getOfferFeedbackVerdict(item, item.offerId ? offerById.get(item.offerId) : null).batchSafe);
  }
  return feedback.filter((item) => {
    const bucket = getOfferFeedbackBucket(item);
    if (filter === "transient") return bucket === "transient";
    if (filter === "category") return bucket === "category";
    if (filter === "aftersales") return bucket === "aftersales";
    if (filter === "high_risk") return bucket === "high_risk";
    return true;
  });
}

function getFeedbackWorkFilterCounts(
  offerFeedback: OfferFeedback[],
  siteFeedback: SiteFeedback[],
  offerById: Map<string, RawOffer>,
): Record<FeedbackWorkFilter, number> {
  return {
    all: offerFeedback.length + siteFeedback.length,
    precheck: offerFeedback.filter((item) => getOfferFeedbackVerdict(item, item.offerId ? offerById.get(item.offerId) : null).batchSafe).length,
    transient: offerFeedback.filter((item) => getOfferFeedbackBucket(item) === "transient").length,
    category: offerFeedback.filter((item) => getOfferFeedbackBucket(item) === "category").length,
    aftersales: offerFeedback.filter((item) => getOfferFeedbackBucket(item) === "aftersales").length,
    high_risk: offerFeedback.filter((item) => getOfferFeedbackBucket(item) === "high_risk").length,
    site: siteFeedback.length,
  };
}

function getOfferFeedbackVerdict(feedback: OfferFeedback, currentOffer: RawOffer | null | undefined): OfferFeedbackVerdict {
  const bucket = getOfferFeedbackBucket(feedback);
  if (bucket === "category") {
    return {
      label: "分类待修",
      description: "这类反馈优先进入分类规则或模型辅助归类流程；如果用户明确希望下架，也可以手动或批量下架报价/渠道。",
      tone: "info",
      batchSafe: false,
    };
  }

  if (bucket === "aftersales") {
    return {
      label: "售后待核验",
      description: "涉及发货、质保、退款或订单售后争议，需要结合用户证据和原店铺售后规则人工判断，不自动批量下架。",
      tone: "danger",
      batchSafe: false,
    };
  }

  if (bucket === "high_risk") {
    return {
      label: "人工核验",
      description: "涉及虚假或渠道可信度，需要优先人工打开原链接和渠道售后信息核验，不自动批量处理。",
      tone: "danger",
      batchSafe: false,
    };
  }

  if (!currentOffer) {
    return {
      label: "未匹配报价",
      description: "后台当前未找到这条报价记录，建议先打开原始链接或刷新反馈数据后再判断。",
      tone: "warn",
      batchSafe: false,
    };
  }

  if (feedback.reason === "wrong_price") {
    if (feedback.offerPrice !== null && feedback.offerPrice !== undefined && currentOffer.price !== null) {
      const priceChanged = Math.abs(Number(currentOffer.price) - Number(feedback.offerPrice)) >= 0.01;
      if (priceChanged) {
        return {
          label: "价格已更新",
          description: "当前价格和用户反馈时的快照不同，通常表示后续采集已经修正，可批量标记已处理。",
          tone: "success",
          batchSafe: true,
        };
      }
    }
    return {
      label: "建议重采",
      description: "当前价格和用户反馈快照仍接近，建议先重采或人工打开原链接核验。",
      tone: "warn",
      batchSafe: false,
    };
  }

  if (feedback.reason === "stock_mismatch") {
    if (feedback.offerStatus && currentOffer.status !== feedback.offerStatus) {
      return {
        label: "状态已更新",
        description: "当前库存状态已不同于用户提交时的快照，通常表示后续采集已修正，可批量标记已处理。",
        tone: "success",
        batchSafe: true,
      };
    }
    return {
      label: "建议重采",
      description: "当前库存状态仍和用户反馈快照一致，建议先重采；不要直接按临时反馈下架渠道。",
      tone: "warn",
      batchSafe: false,
    };
  }

  if (feedback.reason === "item_removed") {
    if (currentOffer.hidden || currentOffer.status === "out_of_stock") {
      return {
        label: "已不可售",
        description: "当前报价已隐藏或缺货，和用户反馈方向一致，可批量标记已处理。",
        tone: "success",
        batchSafe: true,
      };
    }
    return {
      label: "需核验链接",
      description: "用户反馈原商品下架，但当前报价仍显示有货，建议打开原链接或重采后再决定是否下架报价。",
      tone: "warn",
      batchSafe: false,
    };
  }

  return {
    label: "人工判断",
    description: "这条反馈没有明确的自动判断规则，建议按单条反馈处理。",
    tone: "info",
    batchSafe: false,
  };
}

function offerFeedbackVerdictClass(tone: OfferFeedbackVerdictTone): string {
  if (tone === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (tone === "danger") return "bg-[#fbe9e7] text-[#9b3328]";
  if (tone === "warn") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#eef3f8] text-[#47657a]";
}

function feedbackStatusLabel(value: OfferFeedbackStatus): string {
  if (value === "resolved") return "已处理";
  if (value === "ignored") return "已忽略";
  return "待处理";
}

function feedbackStatusClass(value: OfferFeedbackStatus): string {
  if (value === "resolved") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "ignored") return "bg-[#f2f4f4] text-[#5a6061]";
  return "bg-[#fff7e8] text-[#7a541b]";
}

function feedbackReasonLabel(value: OfferFeedback["reason"]): string {
  const labels: Record<OfferFeedback["reason"], string> = {
    wrong_price: "价格不准",
    item_removed: "商品已下架",
    stock_mismatch: "库存不准",
    aftersales_shipping: "售后/发货",
    fraud: "疑似虚假",
    wrong_category: "分类错误",
    bad_source: "渠道问题",
    other: "其他问题",
  };
  return labels[value] || "其他问题";
}

function feedbackReasonClass(value: OfferFeedback["reason"]): string {
  if (value === "fraud" || value === "bad_source" || value === "aftersales_shipping") return "bg-[#fbe9e7] text-[#9b3328]";
  if (value === "wrong_price" || value === "stock_mismatch" || value === "item_removed") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "wrong_category") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function feedbackVerificationStatusLabel(value: OfferFeedback["verificationStatus"]): string {
  const labels: Record<OfferFeedback["verificationStatus"], string> = {
    not_needed: "无需核验",
    pending: "待核验",
    running: "核验中",
    auto_fixed: "已自动修正",
    recollection_created: "已创建重采",
    manual_review: "转人工",
    failed: "核验失败",
  };
  return labels[value] || "无需核验";
}

function feedbackVerificationResultLabel(value: NonNullable<OfferFeedback["verificationResult"]>): string {
  const labels: Record<NonNullable<OfferFeedback["verificationResult"]>, string> = {
    offer_changed: "报价已变化",
    item_removed: "商品已下架",
    out_of_stock: "已缺货",
    still_available: "仍可购买",
    recollection_created: "已创建重采",
    inconclusive: "无法确认",
    blocked: "受阻",
  };
  return labels[value] || "无法确认";
}

function feedbackVerificationClass(value: OfferFeedback["verificationStatus"]): string {
  if (value === "failed") return "bg-[#fbe9e7] text-[#9b3328]";
  if (value === "recollection_created" || value === "auto_fixed") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "manual_review" || value === "pending" || value === "running") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function riskPrecheckStatusLabel(value: OfferFeedbackRiskPrecheckResult): string {
  if (value.publicHidden) return "前台已撤销";
  if (value.status === "failed") return "失败";
  if (value.status === "skipped") return "跳过";
  return value.canShowPublicly ? "可临时公开" : "待人工";
}

function riskPrecheckStatusClass(value: OfferFeedbackRiskPrecheckResult): string {
  if (value.publicHidden) return "bg-[#f2f4f4] text-[#5a6061]";
  if (value.status === "failed") return "bg-[#fbe9e7] text-[#9b3328]";
  if (value.status === "skipped") return "bg-[#f2f4f4] text-[#5a6061]";
  if (value.canShowPublicly) return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#eef3f8] text-[#47657a]";
}

function riskPrecheckPanelClass(value: OfferFeedbackRiskPrecheckResult): string {
  if (value.publicHidden) return "border-[#adb3b4]/20 bg-[#f7f9f9]";
  if (value.status === "failed") return "border-[#9b3328]/15 bg-[#fbe9e7]/55";
  if (value.canShowPublicly) return "border-[#d58a20]/20 bg-[#fff7e8]";
  return "border-[#47657a]/15 bg-[#eef3f8]/70";
}

function riskPrecheckScopeLabel(value: OfferFeedbackRiskPrecheckResult["riskScope"]): string {
  if (value === "source") return "商家";
  if (value === "mixed") return "商品 + 商家";
  return "商品";
}

function riskPrecheckRiskLevelLabel(value: OfferFeedbackRiskPrecheckResult["riskLevel"]): string {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "低";
}

function riskPrecheckEvidenceQualityLabel(value: OfferFeedbackRiskPrecheckResult["evidenceQuality"]): string {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return "无";
}

function riskPrecheckAbuseRiskLabel(value: OfferFeedbackRiskPrecheckResult["abuseRisk"]): string {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "低";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function feedbackUserExpectedActionLabel(value: OfferFeedback["userExpectedAction"]): string {
  const labels: Record<OfferFeedback["userExpectedAction"], string> = {
    recheck: "重新核查",
    hide_offer: "下架报价",
    hide_source: "下架渠道",
    unsure: "管理员判断",
  };
  return labels[value] || "重新核查";
}

function feedbackSuggestedActionLabel(value: OfferFeedback["suggestedAction"]): string {
  const labels: Record<OfferFeedback["suggestedAction"], string> = {
    recollect: "重新采集",
    reclassify: "重建分类",
    hide_offer: "下架报价",
    hide_source: "下架渠道",
    todo: "转待办",
    ignore: "忽略",
  };
  return labels[value] || "转待办";
}

function feedbackActionClass(value: OfferFeedback["suggestedAction"]): string {
  if (value === "hide_offer" || value === "hide_source") return "bg-[#fbe9e7] text-[#9b3328]";
  if (value === "recollect" || value === "reclassify") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "todo") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function siteFeedbackTypeLabel(value: SiteFeedback["type"]): string {
  const labels: Record<SiteFeedback["type"], string> = {
    feature: "功能建议",
    data: "数据问题",
    ux: "页面体验",
    channel: "渠道建议（旧）",
    bug: "Bug / 报错",
    other: "其他",
  };
  return labels[value] || "其他";
}

function siteFeedbackTypeClass(value: SiteFeedback["type"]): string {
  if (value === "bug" || value === "data") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "feature" || value === "channel") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "ux") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function offerSourceLabel(offer: RawOffer | null | undefined, feedback: OfferFeedback): string {
  return feedback.sourceName || offer?.sourceStoreName || offer?.sourceName || "未记录渠道";
}

function offerStatusLabel(status: OfferStatus): string {
  return status === "out_of_stock" ? "缺货" : "有货";
}

function officialBillingPeriodLabel(value: OfficialAdminPrice["billingPeriod"]): string {
  if (value === "annual") return "年付";
  if (value === "one_time") return "一次性";
  return "月付";
}

function officialPriceStatusLabel(value: OfficialAdminPrice["status"]): string {
  const labels: Record<OfficialAdminPrice["status"], string> = {
    available: "可用",
    stale: "保留旧价",
    missing: "未匹配",
    parse_failed: "解析失败",
    needs_review: "待复核",
  };
  return labels[value] || value;
}

function officialPriceStatusClass(value: OfficialAdminPrice["status"]): string {
  if (value === "available") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "stale") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "needs_review") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function officialManualStatusReason(status: OfficialAdminPrice["status"]): string {
  if (status === "missing") return "管理员标记为该地区/计划未提供。";
  if (status === "needs_review") return "管理员标记为需要复核。";
  if (status === "parse_failed") return "管理员标记为解析失败。";
  if (status === "stale") return "管理员标记为保留历史价格。";
  return "";
}

function officialRunStatusLabel(value: string): string {
  if (value === "success") return "成功";
  if (value === "partial_success") return "部分成功";
  if (value === "failed") return "失败";
  if (value === "skipped") return "已跳过";
  return value;
}

function officialRunStatusClass(value: OfficialAdminRun["status"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "partial_success") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function officialProbeSummaryText(result: OfficialProbeResult): string {
  if (!result.ok) return result.message || "试采集没有返回可用结果。";

  const run = result.result?.run;
  const database = result.result?.database;
  const parts = [
    `可用 ${run?.availableCount ?? 0}`,
    `缺失 ${run?.missingCount ?? 0}`,
    `待复核 ${run?.needsReviewCount ?? 0}`,
    `未匹配 ${run?.unmatchedCount ?? 0}`,
    `失败 ${run?.failureCount ?? 0}`,
  ];
  const dbText = database
    ? `数据库计划：当前价 ${database.currentRows ?? 0}，快照 ${database.snapshots ?? 0}，汇率 ${database.fxRates ?? 0}。`
    : "未生成数据库计划。";

  return `${parts.join("，")}。${dbText}`;
}

function apiModelProbeSummaryText(result: ApiModelProbeResult): string {
  if (!result.ok) return result.message || "试采集没有返回可用结果。";

  const run = result.result?.run;
  const scope = result.result?.scope;
  const parts = [
    `来源 ${run?.providerCount ?? scope?.providerCount ?? 0}`,
    `模型 ${run?.modelCount ?? scope?.modelCount ?? 0}`,
    `套餐 ${run?.planCount ?? scope?.planCount ?? 0}`,
    `报价 ${run?.offerCount ?? scope?.offerCount ?? 0}`,
  ];
  const probeText = [
    `URL 成功 ${run?.okUrlCount ?? 0}`,
    `跳过 ${run?.skippedUrlCount ?? 0}`,
    `失败 ${run?.failedUrlCount ?? 0}`,
    `总计 ${run?.urlProbeCount ?? scope?.urlProbeCount ?? 0}`,
  ];

  return `${parts.join("，")}。${probeText.join("，")}。`;
}

function apiProviderTypeLabel(value: ApiModelAdminProvider["type"] | ApiModelAdminOffer["providerType"] | ApiModelAdminPlan["type"] | ApiProviderCandidate["type"]): string {
  return apiProviderTypeLabels[value] || value;
}

function apiProviderCandidateStatusLabel(value: ApiProviderCandidate["status"]): string {
  if (value === "collector_todo") return "采集待办";
  if (value === "supported") return "已支持";
  if (value === "blocked") return "暂不支持";
  if (value === "needs_review") return "待复核";
  return "候选";
}

function apiProviderCandidateStatusClass(value: ApiProviderCandidate["status"]): string {
  if (value === "supported") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "collector_todo") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "blocked") return "bg-[#fbe9e7] text-[#9b3328]";
  if (value === "needs_review") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function apiProviderCandidateEvidenceLabel(value: ApiProviderCandidate["evidenceStatus"]): string {
  if (value === "verified_url") return "入口已确认";
  if (value === "needs_pricing_parse") return "待解析价格";
  if (value === "needs_official_source") return "待找官方来源";
  if (value === "not_supported") return "证据不足";
  return value;
}

function apiProviderCandidateEvidenceClass(value: ApiProviderCandidate["evidenceStatus"]): string {
  if (value === "verified_url") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "needs_pricing_parse") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "needs_official_source") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function apiProviderCandidatePriorityLabel(value: ApiProviderCandidate["priority"]): string {
  if (value === "high") return "高优先级";
  if (value === "medium") return "中优先级";
  return "低优先级";
}

function apiSubmissionParseStatusLabel(value: ApiProviderSubmission["parseStatus"]): string {
  if (value === "matched_existing") return "已匹配";
  if (value === "parsed") return "已解析";
  if (value === "needs_review") return "待确认";
  if (value === "invalid") return "无效";
  return "待解析";
}

function apiSubmissionParseStatusClass(value: ApiProviderSubmission["parseStatus"]): string {
  if (value === "matched_existing") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "parsed") return "bg-[#eef3f8] text-[#47657a]";
  if (value === "invalid") return "bg-[#fbe9e7] text-[#9b3328]";
  return "bg-[#fff7e8] text-[#7a541b]";
}

function apiSubmissionReviewStatusLabel(value: ApiProviderSubmission["reviewStatus"]): string {
  if (value === "approved") return "已通过";
  if (value === "collector_todo") return "采集待办";
  if (value === "rejected") return "已拒绝";
  return "待审核";
}

function apiSubmissionReviewStatusClass(value: ApiProviderSubmission["reviewStatus"]): string {
  if (value === "approved") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "collector_todo") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "rejected") return "bg-[#fbe9e7] text-[#9b3328]";
  return "bg-[#eef3f8] text-[#47657a]";
}

function defaultApiSubmissionAdminNote(
  submission: ApiProviderSubmission,
  reviewStatus: ApiProviderSubmission["reviewStatus"],
): string {
  if (reviewStatus === "approved") {
    return submission.providerId
      ? `已匹配到现有 API 来源：${submission.parsedProviderName || submission.providerId}`
      : "审核通过。";
  }
  if (reviewStatus === "collector_todo") {
    return "真实 API 渠道，但当前没有完整数据/采集支持，加入采集器待办。";
  }
  if (reviewStatus === "rejected") {
    return "不符合当前 API 模型收录边界，暂不收录。";
  }
  return "";
}

function apiSubmissionActionSuccessText(
  submission: ApiProviderSubmission,
  reviewStatus: ApiProviderSubmission["reviewStatus"],
): string {
  if (reviewStatus === "approved") {
    return `已通过 API 渠道提交：${submission.parsedProviderName || submission.submittedName || safeDomain(submission.submittedUrl) || submission.submittedUrl}`;
  }
  if (reviewStatus === "collector_todo") return "已加入 API 采集器待办。";
  if (reviewStatus === "rejected") return "已拒绝该 API 渠道提交。";
  return "API 渠道提交已更新。";
}

function apiProviderStatusClass(enabled: boolean): string {
  return enabled ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#f2f4f4] text-[#5a6061]";
}

function apiOfferStatusLabel(value: ApiModelAdminOffer["status"]): string {
  if (value === "active") return "展示中";
  if (value === "needs_review") return "待复核";
  return "已下架";
}

function apiOfferStatusClass(value: ApiModelAdminOffer["status"]): string {
  if (value === "active") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "needs_review") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

function apiRunStatusLabel(value: ApiModelAdminData["collectRuns"][number]["status"]): string {
  if (value === "success") return "成功";
  if (value === "partial") return "部分成功";
  return "失败";
}

function apiRunStatusClass(value: ApiModelAdminData["collectRuns"][number]["status"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "partial") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function apiPriceValueLabel(value: ApiModelAdminOffer["inputPrice"]): string {
  if (value.kind === "text") return value.text || "待确认";

  const parts: string[] = [];
  if (typeof value.cnyPerMTokens === "number") {
    parts.push(`¥${formatApiPriceNumber(value.cnyPerMTokens)}/百万 tokens`);
  }
  if (typeof value.usdPerMTokens === "number") {
    parts.push(`$${formatApiPriceNumber(value.usdPerMTokens)}/M tokens`);
  }
  if (value.label) parts.push(value.label);
  return parts.length ? parts.join(" · ") : "待确认";
}

function formatApiPriceNumber(value: number): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: value >= 1 || value === 0 ? 0 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 6,
  });
}

function offerTimestamp(offer: RawOffer): string | null | undefined {
  return offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt;
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function displayableCanonicalSourceUrlForSubmission(submission: ChannelSubmission): string | null {
  const meta = submission.parsedMeta || {};
  const sourceUrl = stringMeta(meta, "canonical_source_url");
  if (!sourceUrl) return null;
  if (isMisleadingSharedShopApiPlatformUrl(sourceUrl, submission.url, meta)) return null;
  return sourceUrl;
}

function isMisleadingSharedShopApiPlatformUrl(
  sourceUrl: string,
  submittedUrl: string,
  meta: Record<string, unknown>,
): boolean {
  if (stringMeta(meta, "submitted_url_type") !== "product") return false;
  const source = safeUrl(sourceUrl);
  if (!source || !isSharedShopApiPlatformHost(source.hostname)) return false;
  if (source.pathname.match(/\/shop\/[^/?#]+/i)) return false;

  const submitted = safeUrl(submittedUrl);
  return Boolean(submitted && isSharedShopApiPlatformHost(submitted.hostname));
}

function isSharedShopApiPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "pay.ldxp.cn" || host === "pay.qxvx.cn" || host === "ldxp.cn" || host === "catfk.com";
}

function safeUrl(value: string | null | undefined): URL | null {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function stringMeta(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectionMethodMeta(meta: Record<string, unknown>, key: string): CollectionMethod | null {
  const value = stringMeta(meta, key);
  if (value === "public_json" || value === "browser" || value === "http" || value === "manual") return value;
  return null;
}

function collectorKindMeta(meta: Record<string, unknown>, key: string): CollectorKind | null {
  const value = stringMeta(meta, key);
  return isCollectorKind(value) ? value : null;
}

function isRunnableCollector(value: CollectorKind | null): boolean {
  return Boolean(value && value !== "auto" && value !== "browser" && value !== "unsupported");
}

function collectionMethodLabel(value: string): string {
  const labels: Record<string, string> = {
    public_json: "公开 JSON",
    browser: "浏览器",
    http: "自动",
    manual: "待开发",
    public_json_import: "公开 JSON",
  };
  return labels[value] || value;
}

function crawlStatusLabel(value: CrawlRun["status"]): string {
  if (value === "success") return "成功";
  if (value === "partial") return "部分成功";
  if (value === "skipped") return "已跳过";
  return "失败";
}

function crawlStatusClass(value: CrawlRun["status"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "partial") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "skipped") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function crawlRunTime(run: CrawlRun): string {
  return run.finishedAt || run.startedAt;
}

function latestCrawlRunByTime(runs: CrawlRun[]): CrawlRun | null {
  return runs.reduce<CrawlRun | null>((latest, run) => {
    if (!latest) return run;
    return crawlRunTime(run) > crawlRunTime(latest) ? run : latest;
  }, null);
}

function latestCrawlRunTime(runs: CrawlRun[]): string | null {
  const latest = latestCrawlRunByTime(runs);
  return latest ? crawlRunTime(latest) : null;
}

function collectionJobStatusLabel(value: CollectionJob["status"]): string {
  const labels: Record<CollectionJob["status"], string> = {
    pending: "待执行",
    running: "执行中",
    success: "成功",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[value] || value;
}

function collectionJobName(job: CollectionJob): string {
  if (job.jobType === "all") return "全部渠道";
  if (job.jobType === "official_prices") return job.sourceName || "官方地区价";
  if (job.jobType === "api_models") return job.sourceName || "API 模型";
  if (job.jobType === "api_transit_public_pricing") return job.sourceName || "API 中转公开倍率";
  return job.sourceName || job.sourceId || "未知渠道";
}

function collectionJobTypeLabel(value: CollectionJob["jobType"]): string {
  if (value === "all") return "全量";
  if (value === "official_prices") return "官方价";
  if (value === "api_models") return "API 模型";
  if (value === "api_transit_public_pricing") return "中转公开";
  return "单渠道";
}

function collectionJobStatusClass(value: CollectionJob["status"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "running") return "bg-[#eef3f8] text-[#47657a]";
  if (value === "pending") return "bg-[#fff7e8] text-[#7a541b]";
  if (value === "cancelled") return "bg-[#f2f4f4] text-[#5a6061]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

type CollectorNodeInfo = {
  id: string;
  name: string;
  type: string | null;
  runtime: string | null;
  region: string | null;
};

function collectorNodeFromRun(run: CrawlRun): CollectorNodeInfo {
  const raw = run.details?.collectorNode;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const id = stringValue(record.id) || "unknown-node";
    return {
      id,
      name: stringValue(record.name) || collectorNodeNameFallback(id),
      type: stringValue(record.type),
      runtime: stringValue(record.runtime),
      region: stringValue(record.region),
    };
  }

  return {
    id: "legacy-unknown",
    name: "未标记节点",
    type: null,
    runtime: null,
    region: null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectorNodeNameFallback(id: string): string {
  const labels: Record<string, string> = {
    "cn-vps-aliyun-guangzhou": "阿里云广州 VPS",
    "github-actions": "GitHub Actions",
    "local-browser": "本机浏览器",
    "local-mac": "本机 Mac",
    "vercel-cron": "Vercel Cron",
  };
  return labels[id] || id;
}

function collectorNodeTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    ci: "CI",
    local: "本机",
    unknown: "未知类型",
    vercel: "Vercel",
    vps: "VPS",
  };
  return labels[value] || value;
}

function collectorNodeRuntimeLabel(value: string): string {
  const labels: Record<string, string> = {
    browser: "浏览器",
    cron: "cron",
    "github-actions": "GitHub Actions",
    launchd: "launchd",
    manual: "手动",
    "vercel-cron": "Vercel Cron",
    worker: "Worker",
  };
  return labels[value] || value;
}

function sourceHealthLabel(source: Source): string {
  if (!source.enabled) return "停用";
  return sourceHasIssue(source) ? "异常" : "正常";
}

function sourceHealthClass(source: Source): string {
  const base = "w-fit rounded-full px-2 py-0.5 text-xs font-medium";
  if (!source.enabled) return `${base} bg-[#f2f4f4] text-[#5a6061]`;
  if (sourceHasIssue(source)) return `${base} bg-[#fbe9e7] text-[#9b3328]`;
  return `${base} bg-[#e8f3ec] text-[#2f7a4b]`;
}

const knownAutoCollectorHosts = createKnownAutoCollectorHosts();

function sourceHost(source: Source): string {
  const host = safeDomain(source.entryUrl || source.baseUrl || "") || "";
  return host.replace(/^www\./, "").toLowerCase();
}

function inferCollectorKindFromSource(source: Source): CollectorKind | null {
  const host = sourceHost(source);
  const text = `${source.id} ${source.name} ${source.entryUrl} ${source.baseUrl || ""}`.toLowerCase();
  return inferCollectorKindFromHost(host, text);
}

function resolvedCollectorKind(source: Source): CollectorKind | null {
  if (source.collectorKind && source.collectorKind !== "auto") return source.collectorKind;
  return inferCollectorKindFromSource(source);
}

function sourceHasKnownAutoCollector(source: Source): boolean {
  if (source.collectorKind === "unsupported") return false;
  if (source.collectorKind === "browser") return false;
  const collector = resolvedCollectorKind(source);
  return isRunnableCollector(collector) || knownAutoCollectorHosts.has(sourceHost(source));
}

function resolvedCollectionMethod(source: Source): CollectionMethod {
  const collector = resolvedCollectorKind(source);
  if (isRunnableCollector(collector)) return "http";
  if (collector === "browser") return "browser";
  return source.collectionMethod;
}

function sourceNeedsBrowser(source: Source): boolean {
  const text = `${source.collectionMethod} ${source.lastError || ""} ${source.notes || ""}`.toLowerCase();
  return (
    text.includes("浏览器") ||
    text.includes("captcha") ||
    text.includes("waf") ||
    text.includes("验证") ||
    text.includes("风控") ||
    (!sourceHasKnownAutoCollector(source) && source.collectionMethod === "browser")
  );
}

function sourceNeedsCollector(source: Source): boolean {
  if (sourceHasKnownAutoCollector(source)) return false;
  if (resolvedCollectorKind(source) === "browser") return false;
  const text = `${source.collectionMethod} ${source.lastError || ""} ${source.notes || ""}`.toLowerCase();
  return (
    source.collectorKind === "unsupported" ||
    source.collectionMethod === "manual" ||
    text.includes("unsupported collector") ||
    text.includes("暂未识别") ||
    text.includes("补解析") ||
    text.includes("补采集")
  );
}

function sourceHasIssue(source: Source): boolean {
  return Boolean(
    source.lastError ||
      source.healthStatus === "retrying" ||
      source.healthStatus === "failing" ||
      source.healthStatus === "partial" ||
      (!source.lastSuccessAt && source.lastCheckedAt),
  );
}

function buildBrowserCollectCommand(source: Source): string {
  const url = source.entryUrl || source.baseUrl || "";
  const name = source.name.replaceAll("\"", "\\\"");
  return `npm run collect:browser -- --url \"${url}\" --name \"${name}\" --password <后台密码> --post`;
}

function buildSourceCollectCommand(source: Source): string {
  if (sourceNeedsBrowser(source)) return buildBrowserCollectCommand(source);
  return `npm run collect:prices -- --source ${source.id} --post`;
}

function buildSourceCollectorContext(source: Source): string {
  return [
    "请为 PriceAI 新增或修复来源采集器：",
    `- 来源 ID：${source.id}`,
    `- 来源名称：${source.name}`,
    `- 入口链接：${source.entryUrl}`,
    `- 主域名：${source.baseUrl || "未记录"}`,
    `- 当前采集方式：${collectionMethodLabel(resolvedCollectionMethod(source))}`,
    `- 当前解析器：${collectorKindLabel(resolvedCollectorKind(source) || "auto")}`,
    `- 最近错误：${source.lastError || "未记录"}`,
    `- 现有报价数需要在后台渠道页确认`,
    "- 期望输出字段：sourceTitle, price, status, url, stockCount",
    `- 验证方式：${buildSourceCollectCommand(source)}`,
  ].join("\n");
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function isAlreadyHandled(message: unknown): boolean {
  return typeof message === "string" && (message.includes("已被处理") || message.includes("不存在"));
}

function replaceSubmission(items: ChannelSubmission[], next: ChannelSubmission): ChannelSubmission[] {
  let replaced = false;
  const updated = items.map((item) => {
    if (item.id !== next.id) return item;
    replaced = true;
    return next;
  });
  return replaced ? updated : [next, ...items];
}

function replaceApiProviderSubmission(items: ApiProviderSubmission[], next: ApiProviderSubmission): ApiProviderSubmission[] {
  let replaced = false;
  const updated = items.map((item) => {
    if (item.id !== next.id) return item;
    replaced = true;
    return next;
  });
  return replaced ? updated : [next, ...items];
}

function buildApiProviderSubmissionContext(submission: ApiProviderSubmission): string {
  const meta = submission.parsedMeta || {};
  const domain = stringMeta(meta, "domain") || safeDomain(submission.submittedUrl) || "未识别";
  const reason = stringMeta(meta, "support_reason") || submission.adminNote || "需要确认是否新增 API 模型数据源。";
  return [
    "请为 PriceAI API 模型模块新增或修复公开 API 渠道数据：",
    `- 提交链接：${submission.submittedUrl}`,
    `- 域名：${domain}`,
    `- 解析来源名：${submission.parsedProviderName || submission.submittedName || "待确认"}`,
    `- 解析来源入口：${submission.parsedProviderUrl || "待确认"}`,
    `- 解析类型：${submission.parsedType ? apiProviderTypeLabels[submission.parsedType] : "待确认"}`,
    `- 已匹配来源 ID：${submission.providerId || "未匹配"}`,
    `- 当前状态：${apiSubmissionReviewStatusLabel(submission.reviewStatus)}`,
    `- 待处理原因：${reason}`,
    "- 收录边界：只收官方 API、公开文档可验证套餐、模型路由或免费测试入口；不收灰色中转。",
    "- 期望输出字段：provider, models, offers, plans, limits, pricingUrl, sourceLabel, updatedAt",
    "- 验证方式：npm run import:api-models -- --dry-run --post",
  ].join("\n");
}

function buildApiProviderCandidateContext(candidate: ApiProviderCandidate): string {
  return [
    "请为 PriceAI API 模型模块核验候选渠道并补齐数据：",
    `- 候选 ID：${candidate.id}`,
    `- 候选名称：${candidate.name}`,
    `- 类型：${apiProviderTypeLabels[candidate.type]}`,
    `- 计费方式：${candidate.billingMode}`,
    `- 官网入口：${candidate.url}`,
    `- 价格页：${candidate.pricingUrl || "待确认"}`,
    `- 当前状态：${apiProviderCandidateStatusLabel(candidate.status)}`,
    `- 证据状态：${apiProviderCandidateEvidenceLabel(candidate.evidenceStatus)}`,
    `- 优先级：${apiProviderCandidatePriorityLabel(candidate.priority)}`,
    `- 来源说明：${candidate.sourceLabel}`,
    `- 收录理由：${candidate.reason}`,
    `- 下一步：${candidate.nextStep}`,
    `- 备注：${candidate.notes || "无"}`,
    "- 收录边界：只收官方 API、公开文档可验证套餐、模型路由或免费测试入口；不收灰色中转。",
    "- 期望输出字段：provider, models, offers, plans, limits, pricingUrl, sourceLabel, updatedAt",
    "- 验证方式：npm run import:api-models -- --dry-run --post && npm run test:api-models",
  ].join("\n");
}

function isCollectorTodo(submission: ChannelSubmission): boolean {
  return stringMeta(submission.parsedMeta || {}, "review_stage") === "collector_todo";
}

function buildCollectorContext(submission: ChannelSubmission): string {
  const meta = submission.parsedMeta || {};
  const probe = probeResultFromMeta(meta);
  const domain = stringMeta(meta, "domain") || safeDomain(submission.url) || "";
  const reason =
    stringMeta(meta, "collector_todo_reason") ||
    stringMeta(meta, "support_reason") ||
    probe?.message ||
    "当前没有可用自动采集器，需要补解析脚本后重新试采集。";

  return [
    "请为 PriceAI 新增采集器支持：",
    `- 来源 URL：${submission.url}`,
    `- 域名：${domain}`,
    `- 失败原因：${reason}`,
    `- 当前识别类型：${stringMeta(meta, "suggested_collector_kind") || probe?.kind || "unsupported"}`,
    `- 推荐渠道名：${stringMeta(meta, "suggested_source_name") || submission.name || submission.parsedTitle || domain}`,
    `- 页面样例：${submission.url}`,
    "- 期望输出字段：sourceTitle, price, status, url, stockCount",
    `- 验证方式：npm run collect:prices -- --source ${stringMeta(meta, "suggested_source_id") || domain || "<source-id>"}`,
  ].join("\n");
}

function existingSourceForSubmission(submission: ChannelSubmission, sourceById: Map<string, Source>): Source | null {
  const meta = submission.parsedMeta || {};
  const sourceId = stringMeta(meta, "existing_source_id") || suggestedSourceIdForSubmission(submission);
  if (!sourceId) return null;

  if (stringMeta(meta, "submitted_url_type") === "product" && !displayableCanonicalSourceUrlForSubmission(submission)) {
    return null;
  }

  return sourceById.get(sourceId) || null;
}

function isSameChannelPendingSubmission(submission: ChannelSubmission): boolean {
  const meta = submission.parsedMeta || {};
  return Boolean(stringMeta(meta, "duplicate_pending_submission_id") || stringMeta(meta, "duplicate_pending_submission_name"));
}

function sameChannelSubmissionReviewerNote(submission: ChannelSubmission): string {
  const meta = submission.parsedMeta || {};
  const sameChannelName = stringMeta(meta, "duplicate_pending_submission_name");
  const sameChannelUrl = stringMeta(meta, "duplicate_pending_submission_url");
  const target = sameChannelName || sameChannelUrl;
  return target ? `同渠道还有提交，已忽略此项；保留主记录：${target}。` : "同渠道还有提交，已忽略此项；保留主记录。";
}

function reparseFeedbackText(submission: ChannelSubmission): string {
  const meta = submission.parsedMeta || {};
  if (stringMeta(meta, "canonical_source_status") === "resolved") {
    const sourceName = stringMeta(meta, "suggested_source_name");
    return sourceName ? `已反查到渠道入口：${sourceName}。` : "已反查到渠道入口。";
  }

  const apiMessage = stringMeta(meta, "shop_api_message");
  const apiError = stringMeta(meta, "shop_api_error");
  if (apiMessage) return `已重新解析，但仍未反查到渠道：${apiMessage}`;
  if (apiError) return `已重新解析，但商品接口失败：${apiError}`;
  return "已重新解析，但仍未反查到渠道入口。";
}

function submissionProductPreviewFromMeta(meta: Record<string, unknown>): SubmissionProductPreview | null {
  const value = meta.submitted_product_preview;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const preview: SubmissionProductPreview = {
    title: stringMeta(record, "title") || undefined,
    sourceName: stringMeta(record, "sourceName") || undefined,
    sourceUrl: stringMeta(record, "sourceUrl") || undefined,
    price: numberMeta(record, "price") ?? undefined,
    realPrice: numberMeta(record, "realPrice") ?? undefined,
    currency: stringMeta(record, "currency") || undefined,
    status: stringMeta(record, "status") || undefined,
    statusText: stringMeta(record, "statusText") || undefined,
    category: stringMeta(record, "category") || undefined,
    descriptionPreview: stringMeta(record, "descriptionPreview") || undefined,
    apiMessage: stringMeta(record, "apiMessage") || undefined,
    checkedAt: stringMeta(record, "checkedAt") || undefined,
  };

  return Object.values(preview).some((item) => item !== undefined) ? preview : null;
}

function suggestedSourceIdForSubmission(submission: ChannelSubmission): string | null {
  return stringMeta(submission.parsedMeta || {}, "suggested_source_id");
}

function probeResultFromMeta(meta: Record<string, unknown>): ProbeResult | null {
  const value = meta.probe_result;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const status = stringMeta(record, "status");
  if (status !== "success" && status !== "empty" && status !== "failed" && status !== "unsupported") return null;
  return {
    sourceId: stringMeta(record, "sourceId") || undefined,
    sourceName: stringMeta(record, "sourceName") || undefined,
    sourceUrl: stringMeta(record, "sourceUrl") || undefined,
    baseUrl: stringMeta(record, "baseUrl") || undefined,
    kind: stringMeta(record, "kind"),
    status,
    offerCount: numberMeta(record, "offerCount") || 0,
    offers: Array.isArray(record.offers)
      ? record.offers.map(mapProbeOffer).filter((o): o is ProbeOffer => Boolean(o))
      : [],
    ms: numberMeta(record, "ms") || undefined,
    message: stringMeta(record, "message") || undefined,
    finishedAt: stringMeta(record, "finishedAt") || undefined,
  };
}

function mapProbeOffer(value: unknown): ProbeOffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceTitle = stringMeta(record, "sourceTitle");
  const url = stringMeta(record, "url");
  if (!sourceTitle || !url) return null;
  return {
    sourceStoreName: stringMeta(record, "sourceStoreName"),
    sourceTitle,
    price: numberMeta(record, "price"),
    currency: stringMeta(record, "currency") || "CNY",
    status: offerStatusMeta(record, "status"),
    url,
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    stockCount: numberMeta(record, "stockCount"),
  };
}

function numberMeta(meta: Record<string, unknown>, key: string): number | null {
  const value = meta[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function offerStatusMeta(meta: Record<string, unknown>, key: string): OfferStatus {
  const value = stringMeta(meta, key);
  return value === "out_of_stock" ? "out_of_stock" : "in_stock";
}

const SOURCE_STANDALONE_GROUP_THRESHOLD = 10;
const SOURCE_OTHER_GROUP_KEY = "collector:other";

function sourceCollectorGroup(source: Source): { key: string; label: string } {
  if (source.collectionMethod === "public_json") {
    return { key: "public_json", label: "公开 JSON" };
  }

  const collector = resolvedCollectorKind(source);
  if (collector) {
    return { key: `collector:${collector}`, label: collectorKindLabel(collector) };
  }

  if (source.collectionMethod === "browser") {
    return { key: "collector:browser", label: collectorKindLabel("browser") };
  }

  return { key: "collector:auto", label: collectorKindLabel("auto") };
}

function sourceSortKey(source: Source): string {
  return `${source.name} ${sourceHost(source)} ${source.id}`;
}

function compareSourcesForOps(a: Source, b: Source): number {
  const issueDelta = Number(sourceHasIssue(b)) - Number(sourceHasIssue(a));
  if (issueDelta) return issueDelta;

  const enabledDelta = Number(b.enabled) - Number(a.enabled);
  if (enabledDelta) return enabledDelta;

  return sourceSortKey(a).localeCompare(sourceSortKey(b), "zh-CN");
}

function sourceVisibleOfferCount(
  source: Source,
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): number {
  return sourceStatsById.get(source.id)?.visibleCount ?? offerCountBySource.get(source.id) ?? 0;
}

function sourceRiskFlags(
  source: Source,
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): SourceRiskFlag[] {
  const stats = sourceStatsById.get(source.id);
  const visibleCount = sourceVisibleOfferCount(source, sourceStatsById, offerCountBySource);
  const totalCount = stats?.totalCount || visibleCount;
  const hiddenCount = stats?.hiddenCount || 0;
  const manuallyHiddenCount = stats?.manuallyHiddenCount || 0;
  const collectorFailureCount = stats?.collectorFailureCount || 0;
  const flags: SourceRiskFlag[] = [];

  if (visibleCount >= 50) flags.push("high_volume");
  if (manuallyHiddenCount >= 5 || (totalCount >= 10 && hiddenCount / totalCount >= 0.3)) flags.push("hidden_many");
  if (collectorFailureCount > 0) flags.push("collector_failures");
  if (sourceHasIssue(source)) flags.push("issue");
  if (!source.lastSuccessAt && source.lastCheckedAt) flags.push("stale_success");
  else if ((source.consecutiveFailures || 0) >= 3) flags.push("stale_success");

  return Array.from(new Set(flags));
}

function sourceRiskFlagLabel(flag: SourceRiskFlag): string {
  const labels: Record<SourceRiskFlag, string> = {
    high_volume: "报价多",
    hidden_many: "下架多",
    collector_failures: "采集失败报价",
    issue: "采集异常",
    stale_success: "长期未成功",
  };
  return labels[flag];
}

function buildSourceOverviewGroups(
  groups: SourceGroup[],
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): SourceGroupOverview[] {
  const standalone: SourceGroupOverview[] = [];
  const smallGroups: SourceGroup[] = [];

  for (const group of groups) {
    if (group.sources.length > SOURCE_STANDALONE_GROUP_THRESHOLD) standalone.push(toSourceGroupOverview(group, sourceStatsById, offerCountBySource));
    else smallGroups.push(group);
  }

  if (smallGroups.length) {
    const otherGroup: SourceGroup = {
      key: SOURCE_OTHER_GROUP_KEY,
      label: "其他",
      sources: smallGroups.flatMap((group) => group.sources),
      normalCount: smallGroups.reduce((sum, group) => sum + group.normalCount, 0),
      abnormalCount: smallGroups.reduce((sum, group) => sum + group.abnormalCount, 0),
      disabledCount: smallGroups.reduce((sum, group) => sum + group.disabledCount, 0),
    };
    standalone.push(toSourceGroupOverview(otherGroup, sourceStatsById, offerCountBySource));
  }

  return standalone.sort((a, b) => {
    if (a.key === SOURCE_OTHER_GROUP_KEY) return 1;
    if (b.key === SOURCE_OTHER_GROUP_KEY) return -1;
    const riskDelta = b.riskCount - a.riskCount;
    if (riskDelta) return riskDelta;
    return b.sources.length - a.sources.length || a.label.localeCompare(b.label, "zh-CN");
  });
}

function toSourceGroupOverview(
  group: SourceGroup,
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): SourceGroupOverview {
  let totalVisibleOffers = 0;
  let totalHiddenOffers = 0;
  let totalManuallyHiddenOffers = 0;
  let totalCollectorFailureOffers = 0;
  let riskCount = 0;

  for (const source of group.sources) {
    const stats = sourceStatsById.get(source.id);
    totalVisibleOffers += sourceVisibleOfferCount(source, sourceStatsById, offerCountBySource);
    totalHiddenOffers += stats?.hiddenCount || 0;
    totalManuallyHiddenOffers += stats?.manuallyHiddenCount || 0;
    totalCollectorFailureOffers += stats?.collectorFailureCount || 0;
    if (sourceRiskFlags(source, sourceStatsById, offerCountBySource).length) riskCount += 1;
  }

  return {
    ...group,
    sources: [...group.sources].sort(compareSourcesForOps),
    totalVisibleOffers,
    totalHiddenOffers,
    totalManuallyHiddenOffers,
    totalCollectorFailureOffers,
    riskCount,
  };
}

function filterAndSortSources(
  sources: Source[],
  filters: SourceFilters,
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): Source[] {
  const query = filters.query.trim().toLowerCase();
  return sources
    .filter((source) => {
      if (query) {
        const searchable = `${source.name} ${source.entryUrl} ${source.baseUrl || ""} ${source.id} ${collectorKindLabel(resolvedCollectorKind(source) || "auto")}`.toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      if (!sourceMatchesStatusFilter(source, filters.status)) return false;
      if (!sourceMatchesOfferFilter(sourceVisibleOfferCount(source, sourceStatsById, offerCountBySource), filters.offerBand)) return false;
      if (filters.riskOnly && !sourceRiskFlags(source, sourceStatsById, offerCountBySource).length) return false;
      return true;
    })
    .sort((a, b) => compareSourcesByFilter(a, b, filters.sort, sourceStatsById, offerCountBySource));
}

function sourceMatchesStatusFilter(source: Source, status: SourceStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "disabled") return !source.enabled;
  if (status === "needs_collector") return sourceNeedsCollector(source);
  if (status === "issue") return source.enabled && sourceHasIssue(source);
  if (status === "normal") return source.enabled && !sourceHasIssue(source) && !sourceNeedsCollector(source);
  return true;
}

function sourceMatchesOfferFilter(offerCount: number, offerBand: SourceOfferFilter): boolean {
  if (offerBand === "all") return true;
  if (offerBand === "zero") return offerCount === 0;
  if (offerBand === "small") return offerCount >= 1 && offerCount <= 10;
  if (offerBand === "medium") return offerCount > 10 && offerCount < 50;
  if (offerBand === "large") return offerCount >= 50;
  return true;
}

function compareSourcesByFilter(
  a: Source,
  b: Source,
  sort: SourceSortMode,
  sourceStatsById: Map<string, SourceOfferStats>,
  offerCountBySource: Map<string, number>,
): number {
  if (sort === "offers_desc") {
    const offerDelta = sourceVisibleOfferCount(b, sourceStatsById, offerCountBySource) - sourceVisibleOfferCount(a, sourceStatsById, offerCountBySource);
    if (offerDelta) return offerDelta;
  }

  if (sort === "issue_first") {
    const issueDelta = Number(sourceHasIssue(b)) - Number(sourceHasIssue(a));
    if (issueDelta) return issueDelta;
  }

  if (sort === "stale_first") {
    const aSuccess = a.lastSuccessAt || "";
    const bSuccess = b.lastSuccessAt || "";
    if (aSuccess !== bSuccess) return aSuccess.localeCompare(bSuccess);
  }

  if (sort === "hidden_desc") {
    const hiddenDelta = (sourceStatsById.get(b.id)?.manuallyHiddenCount || 0) - (sourceStatsById.get(a.id)?.manuallyHiddenCount || 0);
    if (hiddenDelta) return hiddenDelta;
  }

  return sourceSortKey(a).localeCompare(sourceSortKey(b), "zh-CN");
}

function groupSources(sources: Source[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const source of sources) {
    const { key, label } = sourceCollectorGroup(source);
    const group = groups.get(key) || {
      key,
      label,
      sources: [],
      normalCount: 0,
      abnormalCount: 0,
      disabledCount: 0,
    };
    group.sources.push(source);
    if (!source.enabled) group.disabledCount += 1;
    else if (sourceHasIssue(source)) group.abnormalCount += 1;
    else group.normalCount += 1;
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sources: [...group.sources].sort(compareSourcesForOps),
    }))
    .sort((a, b) => {
      const issueDelta = b.abnormalCount - a.abnormalCount;
      if (issueDelta) return issueDelta;
      return a.label.localeCompare(b.label, "zh-CN");
    });
}
