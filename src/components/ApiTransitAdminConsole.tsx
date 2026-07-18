"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  RotateCcw,
  Inbox,
  KeyRound,
  Loader2,
  ImageUp,
  Pencil,
  RefreshCcw,
  Search,
  Server,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiTransitAdminData,
  ApiTransitAdminOffer,
  ApiTransitAdminRun,
  ApiTransitAdminStation,
  ApiTransitAdminSubmission,
  ApiTransitCommercialOffer,
  ApiTransitInvoiceSupport,
  ApiTransitOfferCandidate,
  ApiTransitOfferStatus,
  ApiTransitOperatorType,
  ApiTransitSubmissionReviewStatus,
  ApiTransitVerificationEvent,
  WholesaleAdminMatch,
  WholesaleMatchStatus,
} from "@/lib/api-transit-admin-types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_INVOICE_SUPPORT_LABELS,
  TRANSIT_MODEL_FAMILY_OPTIONS,
  TRANSIT_OPERATOR_TYPE_LABELS,
  TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE,
  TRANSIT_RISK_LABELS,
  TRANSIT_STATION_SYSTEM_LABELS,
  type TransitStationSystem,
} from "@/data/api-transit/types";
import { apiTransitLogoDisplayUrl } from "@/lib/api-transit-logo-url";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import {
  assessWholesaleLead,
  buildWholesaleMatchCandidates,
  groupWholesaleLeads,
  type WholesaleLeadAssessment,
  type WholesaleLeadQuality,
  type WholesaleMatchCandidate,
} from "@/lib/wholesale";

export type ApiTransitAdminTab = "stations" | "candidates" | "rawOffers" | "submissions" | "runs";
type StationBucket = "published" | "pending" | "removed";
type WholesaleLeadRoleFilter = "all" | "buyer" | "seller";
type WholesaleLeadDirectionFilter = "all" | "api_transit" | "subscription_channel" | "other";
type WholesaleLeadStatusFilter = "all" | ApiTransitSubmissionReviewStatus;
type WholesaleLeadQualityFilter = "all" | WholesaleLeadQuality;
type Message = {
  type: "success" | "error" | "info";
  text: string;
};
type EditDialog =
  | { type: "station"; station: ApiTransitAdminStation }
  | { type: "offer"; offer: ApiTransitAdminOffer }
  | null;
type ApiTransitStationEditInput = {
  id: string;
  name: string;
  websiteUrl: string;
  logoUrl: string | null;
  apiBaseUrl: string | null;
  pricingUrl: string | null;
  monitorUrl: string | null;
  summary: string | null;
  sourceType: string;
  commercialRelation: string;
  stationSystem: TransitStationSystem;
  operatorType: ApiTransitOperatorType;
  invoiceSupport: ApiTransitInvoiceSupport;
  collectorKind: string;
  collectionStatus: string;
  channelTypes: string[];
  accountPools: string[];
  paymentMethods: string[];
  minimumTopUp: string | null;
  balanceExpiry: string | null;
  supportChannels: string[];
  refundPolicy: string | null;
  riskLabels: string[];
  status: string;
  dataStatus: string;
  usageAdvice: string;
  published: boolean;
  adminNote: string | null;
  strengths: string[];
  cautions: string[];
  commercialOffers: ApiTransitCommercialOffer[];
  verificationEvents: ApiTransitVerificationEvent[];
};

const WHOLESALE_MATCH_STATUS_OPTIONS: Array<{ value: WholesaleMatchStatus; label: string }> = [
  { value: "draft", label: "待确认双方意愿" },
  { value: "consent_pending", label: "确认意愿中" },
  { value: "connected", label: "已建立联系" },
  { value: "trial", label: "试单中" },
  { value: "deal", label: "已成交" },
  { value: "closed", label: "已关闭" },
];
type ApiTransitOfferEditInput = {
  id: string;
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
  imageOutputPrice: number | null;
  currency: string;
  accountPool: string;
  channelType: string;
  priceSource: string;
  sourceUrl: string | null;
  status: ApiTransitOfferStatus;
};
const adminFieldClassName =
  "h-11 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]";
const transitChannelTypeOptions = Object.entries(TRANSIT_CHANNEL_TYPE_LABELS);
const transitAccountPoolOptions = Object.entries(TRANSIT_ACCOUNT_POOL_LABELS);
const transitModelFamilyOptions = TRANSIT_MODEL_FAMILY_OPTIONS;
const transitRiskLabelOptions = Object.entries(TRANSIT_RISK_LABELS);
const transitStationSystemOptions = Object.entries(TRANSIT_STATION_SYSTEM_LABELS);
const transitOperatorTypeOptions = Object.entries(TRANSIT_OPERATOR_TYPE_LABELS).filter(([value]) => value !== "unknown");
const transitInvoiceSupportOptions = Object.entries(TRANSIT_INVOICE_SUPPORT_LABELS);

export function ApiTransitAdminConsole({ data }: { data: ApiTransitAdminData }) {
  return <ApiTransitAdminPanel data={data} framed />;
}

export function WholesaleAdminPanel({ data }: { data: ApiTransitAdminData }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<WholesaleLeadRoleFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<WholesaleLeadDirectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<WholesaleLeadStatusFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<WholesaleLeadQualityFilter>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [adminNoteDrafts, setAdminNoteDrafts] = useState<Record<string, string>>({});
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const wholesaleLeads = useMemo(
    () => groupWholesaleLeads(
      data.submissions.filter(isWholesaleSubmission),
      (lead) => ({ id: lead.id, duplicateOf: lead.duplicateOf, duplicateCount: lead.duplicateCount }),
    ),
    [data.submissions],
  );
  const leadAssessments = useMemo(
    () => new Map(wholesaleLeads.map((lead) => [lead.id, assessWholesaleSubmission(lead)])),
    [wholesaleLeads],
  );

  const filteredLeads = useMemo(
    () =>
      wholesaleLeads.filter((lead) => {
        const role = wholesaleRoleValue(lead.submittedMeta);
        const direction = wholesaleDirectionValue(lead.submittedMeta);
        const assessment = leadAssessments.get(lead.id);
        if (roleFilter !== "all" && role !== roleFilter) return false;
        if (directionFilter !== "all" && direction !== directionFilter) return false;
        if (statusFilter !== "all" && lead.reviewStatus !== statusFilter) return false;
        if (qualityFilter !== "all" && assessment?.quality !== qualityFilter) return false;
        return matchesQuery(normalizedQuery, [
          lead.submittedName,
          lead.contact,
          lead.notes,
          lead.submittedUrl,
          stringMeta(lead.submittedMeta, "identityType"),
          stringMeta(lead.submittedMeta, "target"),
          stringMeta(lead.submittedMeta, "volume"),
          stringMeta(lead.submittedMeta, "budget"),
          stringMeta(lead.submittedMeta, "pricing"),
          stringMeta(lead.submittedMeta, "sourceDescription"),
          stringMeta(lead.submittedMeta, "evidenceSummary"),
          stringMeta(lead.submittedMeta, "proofUrl"),
        ]);
      }),
    [directionFilter, leadAssessments, normalizedQuery, qualityFilter, roleFilter, statusFilter, wholesaleLeads],
  );

  const selectedLead =
    filteredLeads.find((lead) => lead.id === selectedLeadId) ||
    filteredLeads[0] ||
    null;
  const selectedAdminNoteDraft = selectedLead
    ? adminNoteDrafts[selectedLead.id] ?? selectedLead.adminNote ?? ""
    : "";
  const selectedAssessment = selectedLead ? leadAssessments.get(selectedLead.id) || null : null;
  const selectedCandidates = useMemo(
    () => selectedLead
      ? buildWholesaleMatchCandidates(selectedLead, wholesaleLeads, readWholesaleSubmissionForMatch)
      : [],
    [selectedLead, wholesaleLeads],
  );
  const selectedMatches = selectedLead
    ? data.wholesaleMatches.filter(
      (match) => match.demandSubmissionId === selectedLead.id || match.supplySubmissionId === selectedLead.id,
    )
    : [];

  const pendingCount = wholesaleLeads.filter((lead) => lead.reviewStatus === "pending").length;
  const followUpCount = wholesaleLeads.filter((lead) => lead.reviewStatus === "collector_todo").length;
  const buyerCount = wholesaleLeads.filter((lead) => wholesaleRoleValue(lead.submittedMeta) === "buyer").length;
  const sellerCount = wholesaleLeads.filter((lead) => wholesaleRoleValue(lead.submittedMeta) === "seller").length;
  const insufficientCount = wholesaleLeads.filter((lead) => leadAssessments.get(lead.id)?.quality === "insufficient").length;
  const matchableCount = wholesaleLeads.filter((lead) => leadAssessments.get(lead.id)?.quality === "matchable").length;

  async function updateWholesaleLead(
    lead: ApiTransitAdminSubmission,
    reviewStatus: ApiTransitSubmissionReviewStatus,
  ) {
    setLoadingAction(`wholesale-${reviewStatus}-${lead.id}`);
    const result = await requestJson("/api/admin/api-transit/submissions", "PATCH", {
      id: lead.id,
      reviewStatus,
      adminNote: lead.adminNote || defaultSubmissionNote(reviewStatus, true),
    });
    if (result.ok) {
      setMessage({ type: "success", text: wholesaleStatusSuccessText(reviewStatus) });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "更新批发线索失败。" });
    }
    setLoadingAction(null);
  }

  async function saveAdminNote() {
    if (!selectedLead) return;
    setLoadingAction(`wholesale-note-${selectedLead.id}`);
    const result = await requestJson("/api/admin/api-transit/submissions", "PATCH", {
      id: selectedLead.id,
      reviewStatus: selectedLead.reviewStatus,
      adminNote: selectedAdminNoteDraft,
    });
    if (result.ok) {
      setMessage({ type: "success", text: "后台备注已保存。" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "保存后台备注失败。" });
    }
    setLoadingAction(null);
  }

  async function copyContact(lead: ApiTransitAdminSubmission) {
    const text = lead.contact || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: "success", text: "联系方式已复制。" });
    } catch {
      setMessage({ type: "error", text: "复制失败，请手动选择联系方式。" });
    }
  }

  async function createMatch(candidate: WholesaleMatchCandidate<ApiTransitAdminSubmission>) {
    if (!selectedLead) return;
    const selectedRole = wholesaleRoleValue(selectedLead.submittedMeta);
    const candidateRole = wholesaleRoleValue(candidate.lead.submittedMeta);
    const demand = selectedRole === "buyer" ? selectedLead : candidateRole === "buyer" ? candidate.lead : null;
    const supply = selectedRole === "seller" ? selectedLead : candidateRole === "seller" ? candidate.lead : null;
    if (!demand || !supply) return;
    setLoadingAction(`wholesale-match-${candidate.lead.id}`);
    const result = await requestJson("/api/admin/wholesale-matches", "POST", {
      demandSubmissionId: demand.id,
      supplySubmissionId: supply.id,
      matchScore: candidate.score,
      matchReasons: candidate.reasons,
    });
    if (result.ok) {
      setMessage({ type: "success", text: "已创建撮合记录，下一步先分别确认双方意愿。" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "创建撮合记录失败。" });
    }
    setLoadingAction(null);
  }

  async function updateMatchStatus(match: WholesaleAdminMatch, status: WholesaleMatchStatus) {
    setLoadingAction(`wholesale-match-status-${match.id}`);
    const result = await requestJson("/api/admin/wholesale-matches", "PATCH", {
      id: match.id,
      status,
    });
    if (result.ok) {
      setMessage({ type: "success", text: "撮合进度已更新。" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "更新撮合进度失败。" });
    }
    setLoadingAction(null);
  }

  return (
    <section className="space-y-4">
      {message ? <MessageBox message={message} onDismiss={() => setMessage(null)} /> : null}

      <div className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#202829]">批发线索池</h3>
              <StatusBadge tone={pendingCount ? "warn" : "muted"}>{pendingCount} 待处理</StatusBadge>
              <StatusBadge tone={followUpCount ? "info" : "muted"}>{followUpCount} 待跟进</StatusBadge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5a6061]">
              独立承接买方需求和源头供给；这里先做人工初筛、联系和备注，不进入中转站探测流程。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
            <span className="rounded-lg bg-[#f2f4f4] px-3 py-2 font-medium text-[#2d3435]">全部 {wholesaleLeads.length}</span>
            <span className="rounded-lg bg-[#eef3f8] px-3 py-2 font-medium text-[#47657a]">买方 {buyerCount}</span>
            <span className="rounded-lg bg-[#e8f3ec] px-3 py-2 font-medium text-[#2f7a4b]">源头 {sellerCount}</span>
            <span className="rounded-lg bg-[#fff7e8] px-3 py-2 font-medium text-[#7a541b]">需补充 {insufficientCount}</span>
            <span className="rounded-lg bg-[#e8f3ec] px-3 py-2 font-medium text-[#2f7a4b]">可撮合 {matchableCount}</span>
            <span className="rounded-lg bg-[#fff7e8] px-3 py-2 font-medium text-[#7a541b]">筛选 {filteredLeads.length}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(240px,1fr)_auto] xl:items-start">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa2a3]" />
            <span className="sr-only">搜索批发线索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、联系方式、需求、价格、证明链接..."
              className="h-10 w-full rounded-lg border border-[#adb3b4]/25 bg-white pl-9 pr-3 text-sm text-[#202829] outline-none transition placeholder:text-[#7c8586] focus:border-[#2d3435]"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <WholesaleFilterButton active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>全部角色</WholesaleFilterButton>
            <WholesaleFilterButton active={roleFilter === "buyer"} onClick={() => setRoleFilter("buyer")}>买方需求</WholesaleFilterButton>
            <WholesaleFilterButton active={roleFilter === "seller"} onClick={() => setRoleFilter("seller")}>源头供给</WholesaleFilterButton>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <WholesaleFilterButton active={directionFilter === "all"} onClick={() => setDirectionFilter("all")}>全部方向</WholesaleFilterButton>
          <WholesaleFilterButton active={directionFilter === "api_transit"} onClick={() => setDirectionFilter("api_transit")}>API 中转</WholesaleFilterButton>
          <WholesaleFilterButton active={directionFilter === "subscription_channel"} onClick={() => setDirectionFilter("subscription_channel")}>卡网/订阅</WholesaleFilterButton>
          <WholesaleFilterButton active={directionFilter === "other"} onClick={() => setDirectionFilter("other")}>其他源头</WholesaleFilterButton>
          <span className="mx-1 hidden h-8 w-px bg-[#adb3b4]/25 sm:inline-block" />
          <WholesaleFilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>全部状态</WholesaleFilterButton>
          <WholesaleFilterButton active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")}>待处理</WholesaleFilterButton>
          <WholesaleFilterButton active={statusFilter === "collector_todo"} onClick={() => setStatusFilter("collector_todo")}>待跟进</WholesaleFilterButton>
          <WholesaleFilterButton active={statusFilter === "approved"} onClick={() => setStatusFilter("approved")}>初筛通过</WholesaleFilterButton>
          <WholesaleFilterButton active={statusFilter === "rejected"} onClick={() => setStatusFilter("rejected")}>已拒绝</WholesaleFilterButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#edf0f1] pt-3">
          <span className="text-xs font-semibold text-[#5a6061]">资料质量</span>
          <WholesaleFilterButton active={qualityFilter === "all"} onClick={() => setQualityFilter("all")}>全部</WholesaleFilterButton>
          <WholesaleFilterButton active={qualityFilter === "insufficient"} onClick={() => setQualityFilter("insufficient")}>需补充</WholesaleFilterButton>
          <WholesaleFilterButton active={qualityFilter === "review"} onClick={() => setQualityFilter("review")}>待判断</WholesaleFilterButton>
          <WholesaleFilterButton active={qualityFilter === "matchable"} onClick={() => setQualityFilter("matchable")}>可撮合</WholesaleFilterButton>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-lg border border-[#adb3b4]/20 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
          <div className="flex items-center justify-between border-b border-[#edf0f1] bg-[#f2f4f4] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#202829]">
              <Inbox size={16} />
              线索列表
            </div>
            <span className="text-xs font-medium text-[#5a6061]">{filteredLeads.length} 条</span>
          </div>
          <div className="divide-y divide-[#edf0f1]">
            {filteredLeads.map((lead) => (
              <WholesaleLeadRow
                key={lead.id}
                lead={lead}
                assessment={leadAssessments.get(lead.id) || assessWholesaleSubmission(lead)}
                selected={selectedLead?.id === lead.id}
                loadingAction={loadingAction}
                onSelect={() => setSelectedLeadId(lead.id)}
                onCopyContact={() => copyContact(lead)}
                onUpdate={(reviewStatus) => updateWholesaleLead(lead, reviewStatus)}
              />
            ))}
            {!filteredLeads.length ? <EmptyState text="没有匹配的批发线索。" /> : null}
          </div>
        </section>

        <WholesaleLeadDetailPanel
          lead={selectedLead}
          assessment={selectedAssessment}
          candidates={selectedCandidates}
          matches={selectedMatches}
          adminNoteDraft={selectedAdminNoteDraft}
          loadingAction={loadingAction}
          onAdminNoteDraftChange={(value) => {
            if (!selectedLead) return;
            setAdminNoteDrafts((previous) => ({ ...previous, [selectedLead.id]: value }));
          }}
          onCopyContact={selectedLead ? () => copyContact(selectedLead) : undefined}
          onSaveAdminNote={saveAdminNote}
          onCreateMatch={createMatch}
          onUpdateMatchStatus={updateMatchStatus}
          onUpdate={selectedLead ? (reviewStatus) => updateWholesaleLead(selectedLead, reviewStatus) : undefined}
        />
      </div>
    </section>
  );
}

export function ApiTransitAdminPanel({
  data,
  framed = false,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  hideTabs = false,
}: {
  data: ApiTransitAdminData;
  framed?: boolean;
  activeTab?: ApiTransitAdminTab;
  onActiveTabChange?: (tab: ApiTransitAdminTab) => void;
  hideTabs?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [optimisticAuthed, setOptimisticAuthed] = useState(false);
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<ApiTransitAdminTab>("stations");
  const [stationBucket, setStationBucket] = useState<StationBucket>("pending");
  const [query, setQuery] = useState("");
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [editDialog, setEditDialog] = useState<EditDialog>(null);

  const authed = data.isAuthenticated || optimisticAuthed;
  const activeTab = controlledActiveTab || uncontrolledActiveTab;
  const normalizedQuery = query.trim().toLowerCase();
  const changeActiveTab = (tab: ApiTransitAdminTab) => {
    onActiveTabChange?.(tab);
    if (!controlledActiveTab) setUncontrolledActiveTab(tab);
    setSelectedOfferIds(new Set());
  };

  const pendingOffers = useMemo(
    () => data.offers.filter((offer) => offer.status === "needs_review"),
    [data.offers],
  );

  const filteredCandidates = useMemo(
    () =>
      data.offerCandidates.filter((candidate) =>
        matchesQuery(normalizedQuery, [
          candidate.stationName,
          candidate.standardModel,
          candidate.groupName,
          candidate.accountPool,
          candidate.channelType,
          candidate.reviewReason,
          candidate.qualityFlags.join(" "),
        ]),
      ),
    [data.offerCandidates, normalizedQuery],
  );

  const filteredStations = useMemo(
    () =>
      data.stations
        .filter((station) => stationBucketForStation(station) === stationBucket)
        .filter((station) =>
          matchesQuery(normalizedQuery, [
            station.name,
            station.websiteUrl,
            station.pricingUrl,
            station.monitorUrl,
            station.collectorKind,
            station.adminNote,
            station.removedReason,
            station.commercialOffers.map((offer) => `${offer.title} ${offer.code || ""}`).join(" "),
          ]),
        ),
    [data.stations, normalizedQuery, stationBucket],
  );

  const filteredOffers = useMemo(
    () =>
      data.offers.filter((offer) =>
        matchesQuery(normalizedQuery, [
          offer.stationName,
          offer.standardModel,
          offer.rawModelName,
          offer.groupName,
          offer.accountPool,
          offer.channelType,
        ]),
      ),
    [data.offers, normalizedQuery],
  );

  const visibleTransitSubmissions = useMemo(
    () => groupVisibleSubmissions(data.submissions).filter((submission) => !isWholesaleSubmission(submission)),
    [data.submissions],
  );

  const filteredSubmissions = useMemo(
    () =>
      visibleTransitSubmissions.filter((submission) =>
        matchesQuery(normalizedQuery, [
          submission.submittedName,
          submission.submittedUrl,
          submission.normalizedHost,
          submission.pricingUrl,
          submission.contact,
          submission.notes,
          stringMeta(submission.submittedMeta, "wholesaleRoleLabel"),
          stringMeta(submission.submittedMeta, "wholesaleDirectionLabel"),
          stringMeta(submission.submittedMeta, "identityType"),
          stringMeta(submission.submittedMeta, "target"),
          stringMeta(submission.submittedMeta, "sourceDescription"),
        ]),
      ),
    [normalizedQuery, visibleTransitSubmissions],
  );

  const filteredRuns = useMemo(
    () =>
      data.runs.filter((run) =>
        matchesQuery(normalizedQuery, [
          run.stationName,
          run.sourceUrl,
          run.runType,
          run.errorMessage,
        ]),
      ),
    [data.runs, normalizedQuery],
  );

  const tabs: Array<{ id: ApiTransitAdminTab; label: string; count: number; icon: ReactNode }> = [
    { id: "stations", label: "站点池", count: data.metrics.pendingStations, icon: <Server size={15} /> },
    { id: "candidates", label: "清洗候选", count: data.metrics.candidateOffers, icon: <Database size={15} /> },
    { id: "rawOffers", label: "原始报价", count: data.metrics.pendingOffers, icon: <ClipboardList size={15} /> },
    { id: "submissions", label: "提交线索", count: visibleTransitSubmissions.filter((submission) => submission.reviewStatus === "pending").length, icon: <Inbox size={15} /> },
    { id: "runs", label: "检测记录", count: data.metrics.failedRuns, icon: <Activity size={15} /> },
  ];

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAction("login");
    setMessage(null);

    const result = await requestJson("/api/admin/login", "POST", { password });
    if (result.ok) {
      setOptimisticAuthed(true);
      setPassword("");
      setMessage({ type: "success", text: "已解锁 API 中转审核台。" });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || "后台密码不正确。" });
    }

    setLoadingAction(null);
  }

  async function publishStation(station: ApiTransitAdminStation) {
    setLoadingAction(`station-publish-${station.id}`);
    const offerIds = uniqueIds(
      data.offerCandidates
        .filter((candidate) => candidate.stationId === station.id && candidate.status === "needs_review")
        .flatMap((candidate) => candidate.rawOfferIds),
    );
    const result = await requestJson("/api/admin/api-transit/stations", "PATCH", {
      action: "publish",
      id: station.id,
      offerIds,
    });
    handleActionResult(
      result,
      `已发布 ${station.name}，同步激活 ${result.updatedOfferCount || 0} 条清洗候选报价。`,
      "发布中转站失败。",
    );
  }

  async function updateStationPublished(station: ApiTransitAdminStation, published: boolean) {
    setLoadingAction(`station-visible-${station.id}`);
    const result = await requestJson("/api/admin/api-transit/stations", "PATCH", {
      action: "update",
      id: station.id,
      published,
      dataStatus: published ? "verified" : "pending_review",
      status: published ? "active" : "unknown",
      usageAdvice: published ? "try_small" : "pending",
    });
    handleActionResult(
      result,
      published ? `已上架 ${station.name}。` : `已从前台隐藏 ${station.name}。`,
      "更新中转站失败。",
    );
  }

  async function removeStation(station: ApiTransitAdminStation) {
    setLoadingAction(`station-remove-${station.id}`);
    const result = await requestJson("/api/admin/api-transit/stations", "PATCH", {
      action: "remove",
      id: station.id,
      reason: "后台移除",
    });
    handleActionResult(result, `已移除 ${station.name}。`, "移除中转站失败。");
  }

  async function restoreStation(station: ApiTransitAdminStation) {
    setLoadingAction(`station-restore-${station.id}`);
    const result = await requestJson("/api/admin/api-transit/stations", "PATCH", {
      action: "restore",
      id: station.id,
    });
    handleActionResult(result, `已恢复 ${station.name} 到待发布。`, "恢复中转站失败。");
  }

  async function saveStation(input: ApiTransitStationEditInput) {
    setLoadingAction(`station-edit-${input.id}`);
    const result = await requestJson("/api/admin/api-transit/stations", "PATCH", {
      action: "update",
      ...input,
    });
    if (result.ok) setEditDialog(null);
    handleActionResult(result, "中转站资料已保存。", "保存中转站失败。");
  }

  async function updateOffers(ids: string[], status: ApiTransitOfferStatus) {
    if (!ids.length) return;
    setLoadingAction(`offers-${status}`);
    const result = await requestJson("/api/admin/api-transit/offers", "PATCH", { ids, status });
    handleActionResult(
      result,
      `已更新 ${result.updatedCount || ids.length} 条报价为${offerStatusLabel(status)}。`,
      "更新报价失败。",
    );
    setSelectedOfferIds(new Set());
  }

  async function saveOffer(input: ApiTransitOfferEditInput) {
    setLoadingAction(`offer-edit-${input.id}`);
    const result = await requestJson("/api/admin/api-transit/offers", "PATCH", input);
    if (result.ok) setEditDialog(null);
    handleActionResult(result, "报价资料已保存。", "保存报价失败。");
  }

  async function updateSubmission(
    submission: ApiTransitAdminSubmission,
    reviewStatus: ApiTransitSubmissionReviewStatus,
  ) {
    setLoadingAction(`submission-${reviewStatus}-${submission.id}`);
    const result = await requestJson("/api/admin/api-transit/submissions", "PATCH", {
      id: submission.id,
      reviewStatus,
      adminNote: defaultSubmissionNote(reviewStatus, isWholesaleSubmission(submission)),
    });
    handleActionResult(
      result,
      submissionStatusSuccessText(reviewStatus, result),
      "更新提交线索失败。",
    );
  }

  function handleActionResult(result: ApiResponse, successText: string, fallbackText: string) {
    if (result.ok) {
      setMessage({ type: "success", text: successText });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.message || fallbackText });
    }
    setLoadingAction(null);
  }

  const visibleRawOfferIds = filteredOffers.map((offer) => offer.id);
  const visibleCandidateOfferIds = uniqueIds(filteredCandidates.flatMap((candidate) => candidate.rawOfferIds));
  const allVisibleRawOffersSelected = visibleRawOfferIds.length > 0 && visibleRawOfferIds.every((id) => selectedOfferIds.has(id));
  const allVisibleCandidatesSelected =
    visibleCandidateOfferIds.length > 0 && visibleCandidateOfferIds.every((id) => selectedOfferIds.has(id));
  const selectedPendingOfferIds = filteredOffers
    .filter((offer) => selectedOfferIds.has(offer.id) && offer.status === "needs_review")
    .map((offer) => offer.id);
  const selectedPendingCandidateOfferIds = uniqueIds(
    filteredCandidates
      .filter((candidate) => candidate.status === "needs_review")
      .flatMap((candidate) => candidate.rawOfferIds.filter((id) => selectedOfferIds.has(id))),
  );

  const content = (
    <>
      {framed ? (
        <header className="border-b border-[#adb3b4]/30 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-medium text-[#5a6061] transition-colors hover:text-[#2d3435]">
              &larr; 后台管理
            </Link>
            <span className="text-[#adb3b4]">/</span>
            <h1 className="font-serif text-lg font-semibold text-[#202829]">API 中转审核台</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/api-transit"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
            >
              <ExternalLink size={14} />
              前台预览
            </Link>
            {authed ? (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829]"
              >
                <RefreshCcw size={14} />
                刷新
              </button>
            ) : null}
          </div>
        </div>
      </header>
      ) : null}

      <div className={framed ? "mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8" : ""}>
        {message ? <MessageBox message={message} onDismiss={() => setMessage(null)} /> : null}

        {!data.configured ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-[#fff7e8] px-4 py-3 text-sm text-[#7a541b]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>当前环境没有 Supabase 配置，无法读取 API 中转审核数据。</span>
          </div>
        ) : null}

        {data.loadErrors.length ? <LoadErrors errors={data.loadErrors} /> : null}

        {!authed ? (
          <section className="mx-auto mt-8 max-w-md rounded-lg border border-[#adb3b4]/30 bg-white p-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-[#202829]">
              <KeyRound size={19} />
              后台密码
            </div>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">
              API 中转站审核使用同一套后台密码。登录后可以发布站点、激活报价和处理用户/站长提交。
            </p>
            <form onSubmit={login} className="mt-4 flex gap-2">
              <label htmlFor="api-transit-admin-password" className="sr-only">
                后台密码
              </label>
              <input
                id="api-transit-admin-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="输入后台密码"
                className="h-11 min-w-0 flex-1 rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
              />
              <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#2d3435] px-5 text-sm font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-60">
                {loadingAction === "login" ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                解锁
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className={hideTabs ? "mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#adb3b4]/20 bg-white px-3 py-2" : "mb-5 grid gap-3 md:grid-cols-4"}>
              <MetricCard label="待发布站点" value={data.metrics.pendingStations} compact={hideTabs} />
              <MetricCard label="清洗候选" value={data.metrics.candidateOffers} compact={hideTabs} />
              <MetricCard label="原始待审" value={data.metrics.pendingOffers} compact={hideTabs} />
              <MetricCard label="提交线索" value={data.metrics.pendingSubmissions} compact={hideTabs} />
            </section>

            <section className={hideTabs ? "mb-3 rounded-lg border border-[#adb3b4]/20 bg-white p-2" : "mb-5 rounded-lg border border-[#adb3b4]/25 bg-white p-3 shadow-[0_3px_8px_rgba(45,52,53,0.025)]"}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索站点、模型、分组、URL..."
                    className={`${hideTabs ? "h-9" : "h-10"} w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]`}
                  />
                </div>
                {!hideTabs && <div className="flex gap-1 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => changeActiveTab(tab.id)}
                      className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? "bg-[#2d3435] text-[#f8f8f8]"
                          : "bg-[#f2f4f4] text-[#5a6061] hover:bg-[#dde4e5] hover:text-[#2d3435]"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.count > 0 ? (
                        <span className={activeTab === tab.id ? "text-[#f8f8f8]" : "text-[#2d3435]"}>
                          {tab.count}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>}
              </div>
            </section>

            {activeTab === "stations" ? (
              <StationsPanel
                stations={filteredStations}
                allStations={data.stations}
                activeBucket={stationBucket}
                onBucketChange={setStationBucket}
                pendingOffers={pendingOffers}
                loadingAction={loadingAction}
                onPublish={publishStation}
                onTogglePublished={updateStationPublished}
                onRemove={removeStation}
                onRestore={restoreStation}
                onEdit={(station) => setEditDialog({ type: "station", station })}
              />
            ) : null}

            {activeTab === "candidates" ? (
              <OfferCandidatesPanel
                candidates={filteredCandidates}
                selectedOfferIds={selectedOfferIds}
                allVisibleCandidatesSelected={allVisibleCandidatesSelected}
                selectedPendingCandidateOfferIds={selectedPendingCandidateOfferIds}
                loadingAction={loadingAction}
                onToggleAll={() => {
                  setSelectedOfferIds(allVisibleCandidatesSelected ? new Set() : new Set(visibleCandidateOfferIds));
                }}
                onToggle={(candidate) => {
                  setSelectedOfferIds((previous) => toggleCandidateSelection(previous, candidate));
                }}
                onUpdateOffers={updateOffers}
                onEditOffer={(offerId) => {
                  const offer = data.offers.find((item) => item.id === offerId);
                  if (offer) setEditDialog({ type: "offer", offer });
                }}
              />
            ) : null}

            {activeTab === "rawOffers" ? (
              <OffersPanel
                offers={filteredOffers}
                selectedOfferIds={selectedOfferIds}
                allVisibleOffersSelected={allVisibleRawOffersSelected}
                selectedPendingOfferIds={selectedPendingOfferIds}
                loadingAction={loadingAction}
                onToggleAll={() => {
                  setSelectedOfferIds(allVisibleRawOffersSelected ? new Set() : new Set(visibleRawOfferIds));
                }}
                onToggle={(id) => {
                  setSelectedOfferIds((previous) => {
                    const next = new Set(previous);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onUpdateOffers={updateOffers}
                onEdit={(offer) => setEditDialog({ type: "offer", offer })}
              />
            ) : null}

            {activeTab === "submissions" ? (
              <SubmissionsPanel
                submissions={filteredSubmissions}
                loadingAction={loadingAction}
                onUpdate={updateSubmission}
              />
            ) : null}

            {activeTab === "runs" ? <RunsPanel runs={filteredRuns} /> : null}
          </>
        )}
      </div>
    </>
  );

  const dialogs = (
    <>
      {editDialog?.type === "station" ? (
        <StationEditDialog
          station={editDialog.station}
          loading={loadingAction === `station-edit-${editDialog.station.id}`}
          onClose={() => setEditDialog(null)}
          onSave={saveStation}
        />
      ) : null}
      {editDialog?.type === "offer" ? (
        <OfferEditDialog
          offer={editDialog.offer}
          loading={loadingAction === `offer-edit-${editDialog.offer.id}`}
          onClose={() => setEditDialog(null)}
          onSave={saveOffer}
        />
      ) : null}
    </>
  );

  if (!framed) return <>{content}{dialogs}</>;

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      {content}
      {dialogs}
    </main>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[#f2f4f4] px-3 text-xs">
        <span className="font-medium text-[#5a6061]">{label}</span>
        <strong className="font-semibold text-[#202829]">{value}</strong>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#adb3b4]/25 bg-white p-4">
      <span className="text-xs font-medium text-[#5a6061]">{label}</span>
      <strong className="mt-1 block text-2xl font-semibold text-[#202829]">{value}</strong>
    </div>
  );
}

function stationBucketForStation(station: ApiTransitAdminStation): StationBucket {
  if (station.removedAt) return "removed";
  return station.published ? "published" : "pending";
}

function stationBucketLabel(bucket: StationBucket): string {
  if (bucket === "published") return "已发布";
  if (bucket === "removed") return "已移除";
  return "待发布";
}

function StationsPanel({
  stations,
  allStations,
  activeBucket,
  onBucketChange,
  pendingOffers,
  loadingAction,
  onPublish,
  onTogglePublished,
  onRemove,
  onRestore,
  onEdit,
}: {
  stations: ApiTransitAdminStation[];
  allStations: ApiTransitAdminStation[];
  activeBucket: StationBucket;
  onBucketChange: (bucket: StationBucket) => void;
  pendingOffers: ApiTransitAdminOffer[];
  loadingAction: string | null;
  onPublish: (station: ApiTransitAdminStation) => void;
  onTogglePublished: (station: ApiTransitAdminStation, published: boolean) => void;
  onRemove: (station: ApiTransitAdminStation) => void;
  onRestore: (station: ApiTransitAdminStation) => void;
  onEdit: (station: ApiTransitAdminStation) => void;
}) {
  const pendingCountByStation = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of pendingOffers) {
      counts.set(offer.stationId, (counts.get(offer.stationId) || 0) + 1);
    }
    return counts;
  }, [pendingOffers]);

  const bucketCounts = useMemo(
    () => ({
      published: allStations.filter((station) => stationBucketForStation(station) === "published").length,
      pending: allStations.filter((station) => stationBucketForStation(station) === "pending").length,
      removed: allStations.filter((station) => stationBucketForStation(station) === "removed").length,
    }),
    [allStations],
  );

  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f1] px-4 py-3">
        {(["published", "pending", "removed"] as const).map((bucket) => (
          <button
            key={bucket}
            type="button"
            onClick={() => onBucketChange(bucket)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
              activeBucket === bucket
                ? "bg-[#2d3435] text-[#f8f8f8]"
                : "bg-[#f2f4f4] text-[#5a6061] hover:bg-[#dde4e5] hover:text-[#2d3435]"
            }`}
          >
            {stationBucketLabel(bucket)}
            <span className={activeBucket === bucket ? "text-[#f8f8f8]" : "text-[#2d3435]"}>
              {bucketCounts[bucket]}
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(220px,1.5fr)_120px_120px_140px_150px_250px] gap-3 bg-[#f2f4f4] px-4 py-3 text-xs font-semibold text-[#5a6061] max-lg:hidden">
        <span>站点</span>
        <span>发布</span>
        <span>报价</span>
        <span>采集</span>
        <span>更新时间</span>
        <span className="text-right">操作</span>
      </div>
      <div className="divide-y divide-[#edf0f1]">
        {stations.map((station) => {
          const publishLoading = loadingAction === `station-publish-${station.id}`;
          const visibleLoading = loadingAction === `station-visible-${station.id}`;
          const removeLoading = loadingAction === `station-remove-${station.id}`;
          const restoreLoading = loadingAction === `station-restore-${station.id}`;
          const pendingCount = pendingCountByStation.get(station.id) || station.pendingOfferCount;
          const removed = Boolean(station.removedAt);
          return (
            <article key={station.id} className={`grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(220px,1.5fr)_120px_120px_140px_150px_250px] lg:items-center ${removed ? "bg-[#fafafa]" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-[#202829]">{station.name}</h2>
                  <StatusBadge tone={removed ? "muted" : station.published ? "success" : "warn"}>
                    {removed ? "已移除" : station.published ? "已上架" : "待发布"}
                  </StatusBadge>
                  <StatusBadge tone={station.collectionStatus === "failed" ? "danger" : station.collectionStatus === "success" ? "success" : "info"}>
                    {collectionStatusLabel(station.collectionStatus)}
                  </StatusBadge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5a6061]">
                  <a href={station.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 font-medium text-[#47657a] hover:text-[#202829]">
                    <span className="truncate">{station.websiteUrl}</span>
                    <ExternalLink size={12} />
                  </a>
                  <span>{station.collectorKind}</span>
                </div>
                {station.removedReason || station.adminNote || station.collectionError ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{station.removedReason || station.collectionError || station.adminNote}</p>
                ) : null}
              </div>
              <div>
                <MobileLabel>发布</MobileLabel>
                <span className="text-sm font-medium text-[#2d3435]">{removed ? "已移除" : station.published ? "前台可见" : "审核池"}</span>
              </div>
              <div>
                <MobileLabel>报价</MobileLabel>
                <span className="font-semibold text-[#202829]">{station.offerCount}</span>
                <span className="ml-1 text-xs text-[#5a6061]">待审 {pendingCount}</span>
              </div>
              <div>
                <MobileLabel>采集</MobileLabel>
                <StatusBadge tone={station.latestRunStatus === "failed" ? "danger" : station.latestRunStatus === "success" ? "success" : "info"}>
                  {station.latestRunStatus ? runStatusLabel(station.latestRunStatus) : "未记录"}
                </StatusBadge>
              </div>
              <div>
                <MobileLabel>更新时间</MobileLabel>
                <span className="text-xs text-[#5a6061]">{formatRelativeTime(station.lastCollectedAt || station.lastUpdatedAt || station.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => onEdit(station)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                >
                  <Pencil size={13} />
                  编辑
                </button>
                {removed ? (
                  <button
                    type="button"
                    disabled={restoreLoading}
                    onClick={() => onRestore(station)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-60"
                  >
                    {restoreLoading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    恢复
                  </button>
                ) : !station.published ? (
                  <button
                    type="button"
                    disabled={publishLoading}
                    onClick={() => onPublish(station)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-60"
                  >
                    {publishLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    发布站点
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={visibleLoading}
                    onClick={() => onTogglePublished(station, false)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                  >
                    {visibleLoading ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}
                    隐藏
                  </button>
                )}
                {!removed ? (
                  <button
                    type="button"
                    disabled={removeLoading}
                    onClick={() => onRemove(station)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60"
                  >
                    {removeLoading ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                    移除
                  </button>
                ) : null}
                {station.published && !removed ? (
                  <Link
                    href={`/api-transit/${station.slug}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
                  >
                    <Eye size={13} />
                    查看
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
        {!stations.length ? <EmptyState text="没有匹配的中转站。" /> : null}
      </div>
    </section>
  );
}

function OfferCandidatesPanel({
  candidates,
  selectedOfferIds,
  allVisibleCandidatesSelected,
  selectedPendingCandidateOfferIds,
  loadingAction,
  onToggleAll,
  onToggle,
  onUpdateOffers,
  onEditOffer,
}: {
  candidates: ApiTransitOfferCandidate[];
  selectedOfferIds: Set<string>;
  allVisibleCandidatesSelected: boolean;
  selectedPendingCandidateOfferIds: string[];
  loadingAction: string | null;
  onToggleAll: () => void;
  onToggle: (candidate: ApiTransitOfferCandidate) => void;
  onUpdateOffers: (ids: string[], status: ApiTransitOfferStatus) => void;
  onEditOffer: (offerId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f1] px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#202829]">
            <Database size={16} />
            清洗候选
            <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-xs font-medium text-[#5a6061]">
              {candidates.length} 组
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5a6061]">
            默认只展示站点 + 标准模型 + 关键线路的审核候选；原始报价保留在“原始报价”里追溯。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleAll}
            className="inline-flex h-9 items-center rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
          >
            {allVisibleCandidatesSelected ? "取消选择" : "选择当前候选"}
          </button>
          <button
            type="button"
            disabled={!selectedPendingCandidateOfferIds.length || loadingAction === "offers-active"}
            onClick={() => onUpdateOffers(selectedPendingCandidateOfferIds, "active")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
          >
            {loadingAction === "offers-active" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            发布所选候选
          </button>
          <button
            type="button"
            disabled={!selectedOfferIds.size || loadingAction === "offers-inactive"}
            onClick={() => onUpdateOffers(Array.from(selectedOfferIds), "inactive")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
          >
            <XCircle size={13} />
            下架所选
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th className="w-60 px-3 py-3">站点 / 模型</th>
              <th className="w-44 px-3 py-3">代表线路</th>
              <th className="w-36 px-3 py-3">倍率 / 价格</th>
              <th className="w-72 px-3 py-3">清洗说明</th>
              <th className="w-28 px-3 py-3">状态</th>
              <th className="w-36 px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {candidates.map((candidate) => {
              const selected = candidate.rawOfferIds.every((id) => selectedOfferIds.has(id));
              return (
                <tr key={candidate.id} className={selected ? "bg-[#eef3f8]" : "bg-white hover:bg-[#fbfcfc]"}>
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(candidate)}
                      className="h-4 w-4 rounded border-[#adb3b4]/50"
                      aria-label={`选择 ${candidate.stationName} ${candidate.standardModel}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-semibold text-[#202829]">{candidate.stationName}</div>
                    <div className="mt-1 text-xs text-[#5a6061]">{candidate.standardModel}</div>
                    <div className="mt-1 text-[11px] text-[#7f8889]">
                      原始 {candidate.rawOfferCount} 条
                      {candidate.hiddenRawCount ? ` · 弱化 ${candidate.hiddenRawCount} 条` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-[#2d3435]">{candidate.groupName}</div>
                    <div className="mt-1 text-xs text-[#5a6061]">{candidate.accountPool} / {candidate.channelType}</div>
                    <div className="mt-1 text-xs text-[#adb3b4]">{candidate.priceSource}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="font-mono text-sm font-semibold text-[#202829]">{formatRatio(candidate.modelMultiplier)}</span>
                    <div className="mt-1 text-xs text-[#5a6061]">{candidate.rechargeRatio || "未标"}</div>
                    <div className="mt-1 font-mono text-xs text-[#5a6061]">
                      {formatCurrency(candidate.inputUnitPriceUsd, candidate.unitPriceCurrency)} / {formatCurrency(candidate.outputUnitPriceUsd ?? candidate.imageOutputUnitPriceUsd, candidate.unitPriceCurrency)}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="text-xs leading-5 text-[#5a6061]">{candidate.reviewReason}</p>
                    {candidate.qualityFlags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {candidate.qualityFlags.slice(0, 4).map((flag) => (
                          <StatusBadge key={flag} tone={flag.includes("缺失") || flag.includes("未披露") ? "warn" : "info"}>
                            {flag}
                          </StatusBadge>
                        ))}
                        {candidate.qualityFlags.length > 4 ? <StatusBadge tone="muted">+{candidate.qualityFlags.length - 4}</StatusBadge> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge tone={candidate.status === "active" ? "success" : candidate.status === "inactive" ? "muted" : "warn"}>
                      {offerStatusLabel(candidate.status)}
                    </StatusBadge>
                    <div className="mt-1 text-xs text-[#adb3b4]">{formatRelativeTime(candidate.lastVerifiedAt)}</div>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditOffer(candidate.representativeOfferId)}
                        className="inline-flex h-8 items-center rounded-full border border-[#adb3b4]/30 bg-white px-2.5 text-xs font-medium text-[#2d3435] disabled:opacity-60"
                      >
                        编辑
                      </button>
                      {candidate.status !== "active" ? (
                        <button
                          type="button"
                          disabled={loadingAction === "offers-active"}
                          onClick={() => onUpdateOffers(candidate.rawOfferIds, "active")}
                          className="inline-flex h-8 items-center rounded-full bg-[#2d3435] px-2.5 text-xs font-medium text-[#f8f8f8] disabled:opacity-60"
                        >
                          发布候选
                        </button>
                      ) : null}
                      {candidate.status !== "inactive" ? (
                        <button
                          type="button"
                          disabled={loadingAction === "offers-inactive"}
                          onClick={() => onUpdateOffers(candidate.rawOfferIds, "inactive")}
                          className="inline-flex h-8 items-center rounded-full border border-[#adb3b4]/30 bg-white px-2.5 text-xs font-medium text-[#2d3435] disabled:opacity-60"
                        >
                          下架
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!candidates.length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState text="没有匹配的清洗候选。" />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OffersPanel({
  offers,
  selectedOfferIds,
  allVisibleOffersSelected,
  selectedPendingOfferIds,
  loadingAction,
  onToggleAll,
  onToggle,
  onUpdateOffers,
  onEdit,
}: {
  offers: ApiTransitAdminOffer[];
  selectedOfferIds: Set<string>;
  allVisibleOffersSelected: boolean;
  selectedPendingOfferIds: string[];
  loadingAction: string | null;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onUpdateOffers: (ids: string[], status: ApiTransitOfferStatus) => void;
  onEdit: (offer: ApiTransitAdminOffer) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f1] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#202829]">
          <Database size={16} />
          原始报价
          <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-xs font-medium text-[#5a6061]">{offers.length} 条</span>
        </div>
        <p className="basis-full text-xs text-[#5a6061] md:basis-auto">
          这里保留采集回来的原始模型与分组，主要用于追溯和排错。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleAll}
            className="inline-flex h-9 items-center rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
          >
            {allVisibleOffersSelected ? "取消选择" : "选择当前列表"}
          </button>
          <button
            type="button"
            disabled={!selectedPendingOfferIds.length || loadingAction === "offers-active"}
            onClick={() => onUpdateOffers(selectedPendingOfferIds, "active")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
          >
            {loadingAction === "offers-active" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            发布所选待审
          </button>
          <button
            type="button"
            disabled={!selectedOfferIds.size || loadingAction === "offers-inactive"}
            onClick={() => onUpdateOffers(Array.from(selectedOfferIds), "inactive")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
          >
            <XCircle size={13} />
            下架所选
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-[#f2f4f4] text-xs font-semibold text-[#5a6061]">
            <tr>
              <th className="w-10 px-4 py-3"></th>
              <th className="w-56 px-3 py-3">站点 / 模型</th>
              <th className="w-40 px-3 py-3">分组</th>
              <th className="w-28 px-3 py-3">倍率</th>
              <th className="w-36 px-3 py-3">输入 / 输出</th>
              <th className="w-28 px-3 py-3">来源</th>
              <th className="w-28 px-3 py-3">状态</th>
              <th className="w-32 px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {offers.map((offer) => {
              const selected = selectedOfferIds.has(offer.id);
              return (
                <tr key={offer.id} className={selected ? "bg-[#eef3f8]" : "bg-white hover:bg-[#fbfcfc]"}>
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(offer.id)}
                      className="h-4 w-4 rounded border-[#adb3b4]/50"
                      aria-label={`选择 ${offer.stationName} ${offer.standardModel}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-semibold text-[#202829]">{offer.stationName}</div>
                    <div className="mt-1 text-xs text-[#5a6061]">{offer.standardModel}</div>
                    <div className="mt-1 truncate text-xs text-[#adb3b4]">{offer.rawModelName}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-[#2d3435]">{offer.groupName}</div>
                    <div className="mt-1 text-xs text-[#5a6061]">{offer.accountPool} / {offer.channelType}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="font-mono text-sm text-[#202829]">{formatRatio(offer.modelMultiplier)}</span>
                    <div className="mt-1 text-xs text-[#5a6061]">{offer.rechargeRatio || "未标"}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-mono text-xs text-[#202829]">{formatCurrency(offer.inputUnitPriceUsd, offer.unitPriceCurrency)}</div>
                    <div className="mt-1 font-mono text-xs text-[#5a6061]">{formatCurrency(offer.outputUnitPriceUsd ?? offer.imageOutputUnitPriceUsd, offer.unitPriceCurrency)}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="text-xs text-[#5a6061]">{offer.priceSource}</div>
                    <div className="mt-1 text-xs text-[#adb3b4]">{formatRelativeTime(offer.lastVerifiedAt)}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge tone={offer.status === "active" ? "success" : offer.status === "inactive" ? "muted" : "warn"}>
                      {offerStatusLabel(offer.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(offer)}
                        className="inline-flex h-8 items-center rounded-full border border-[#adb3b4]/30 bg-white px-2.5 text-xs font-medium text-[#2d3435] disabled:opacity-60"
                      >
                        编辑
                      </button>
                      {offer.status !== "active" ? (
                        <button
                          type="button"
                          disabled={loadingAction === "offers-active"}
                          onClick={() => onUpdateOffers([offer.id], "active")}
                          className="inline-flex h-8 items-center rounded-full bg-[#2d3435] px-2.5 text-xs font-medium text-[#f8f8f8] disabled:opacity-60"
                        >
                          发布
                        </button>
                      ) : null}
                      {offer.status !== "inactive" ? (
                        <button
                          type="button"
                          disabled={loadingAction === "offers-inactive"}
                          onClick={() => onUpdateOffers([offer.id], "inactive")}
                          className="inline-flex h-8 items-center rounded-full border border-[#adb3b4]/30 bg-white px-2.5 text-xs font-medium text-[#2d3435] disabled:opacity-60"
                        >
                          下架
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!offers.length ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState text="没有匹配的报价。" />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubmissionsPanel({
  submissions,
  loadingAction,
  onUpdate,
}: {
  submissions: ApiTransitAdminSubmission[];
  loadingAction: string | null;
  onUpdate: (
    submission: ApiTransitAdminSubmission,
    reviewStatus: ApiTransitSubmissionReviewStatus,
  ) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="grid grid-cols-[minmax(220px,1.5fr)_120px_140px_150px_220px] gap-3 bg-[#f2f4f4] px-4 py-3 text-xs font-semibold text-[#5a6061] max-lg:hidden">
        <span>提交内容</span>
        <span>类型</span>
        <span>探测</span>
        <span>时间</span>
        <span className="text-right">操作</span>
      </div>
      <div className="divide-y divide-[#edf0f1]">
        {submissions.map((submission) => (
          <SubmissionRow
            key={submission.id}
            submission={submission}
            loadingAction={loadingAction}
            onUpdate={onUpdate}
          />
        ))}
        {!submissions.length ? <EmptyState text="没有匹配的提交线索。" /> : null}
      </div>
    </section>
  );
}

function WholesaleFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#2d3435]/20 ${
        active
          ? "bg-[#2d3435] text-[#f8f8f8]"
          : "border border-[#adb3b4]/25 bg-white text-[#5a6061] hover:bg-[#f2f4f4] hover:text-[#202829]"
      }`}
    >
      {children}
    </button>
  );
}

function WholesaleLeadRow({
  assessment,
  lead,
  loadingAction,
  onCopyContact,
  onSelect,
  onUpdate,
  selected,
}: {
  assessment: WholesaleLeadAssessment;
  lead: ApiTransitAdminSubmission;
  loadingAction: string | null;
  onCopyContact: () => void;
  onSelect: () => void;
  onUpdate: (reviewStatus: ApiTransitSubmissionReviewStatus) => void;
  selected: boolean;
}) {
  const meta = lead.submittedMeta;
  const proofUrl = wholesaleProofUrl(lead);
  const primaryText = firstWholesaleText(
    stringMeta(meta, "target"),
    stringMeta(meta, "sourceDescription"),
    lead.notes,
  );
  const secondaryRows = [
    ["身份", stringMeta(meta, "identityType")],
    ["量级", stringMeta(meta, "volume")],
    ["预算", stringMeta(meta, "budget")],
    ["价格", stringMeta(meta, "pricing")],
    ["起批", stringMeta(meta, "minimumOrder")],
    ["验真", stringMeta(meta, "testRequirement")],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <article
      className={`grid gap-3 px-4 py-4 text-sm transition-colors lg:grid-cols-[minmax(0,1fr)_180px_170px] lg:items-start ${
        selected ? "bg-[#f8fafa]" : "bg-white hover:bg-[#fafbfb]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 max-w-full truncate text-sm font-semibold text-[#202829]">
            {lead.submittedName || wholesaleRoleLabel(meta) || "批发线索"}
          </h3>
          <StatusBadge tone={wholesaleStatusTone(lead.reviewStatus)}>{wholesaleReviewStatusLabel(lead.reviewStatus)}</StatusBadge>
          <StatusBadge tone={wholesaleRoleValue(meta) === "seller" ? "success" : "info"}>{wholesaleRoleLabel(meta) || "批发线索"}</StatusBadge>
          <StatusBadge tone="muted">{wholesaleDirectionLabel(meta) || "未分类"}</StatusBadge>
          <StatusBadge tone={wholesaleQualityTone(assessment.quality)}>{wholesaleQualityLabel(assessment.quality)}</StatusBadge>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#2d3435]">{primaryText || "暂无摘要内容"}</p>
        {secondaryRows.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {secondaryRows.slice(0, 6).map(([label, value]) => (
              <span key={`${label}-${value}`} className="max-w-full rounded-full bg-[#f2f4f4] px-2 py-0.5 text-xs font-medium text-[#5a6061]">
                {label}：{value}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <MobileLabel>联系</MobileLabel>
        {lead.contact ? (
          <button
            type="button"
            onClick={onCopyContact}
            className="inline-flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-[#202829] transition-colors hover:text-[#47657a]"
          >
            <Copy size={13} />
            <span className="truncate">{lead.contact}</span>
          </button>
        ) : (
          <span className="text-sm text-[#adb3b4]">未填写</span>
        )}
        <div className="mt-1 text-xs text-[#5a6061]">{formatRelativeTime(lead.createdAt)}</div>
        {proofUrl ? (
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#47657a] hover:text-[#202829]"
          >
            <ExternalLink size={12} />
            <span className="truncate">证明链接</span>
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
        >
          <FileText size={13} />
          详情
        </button>
        <button
          type="button"
          disabled={lead.reviewStatus === "collector_todo" || loadingAction === `wholesale-collector_todo-${lead.id}`}
          onClick={() => onUpdate("collector_todo")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
        >
          {loadingAction === `wholesale-collector_todo-${lead.id}` ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
          跟进
        </button>
        <button
          type="button"
          disabled={lead.reviewStatus === "approved" || loadingAction === `wholesale-approved-${lead.id}`}
          onClick={() => onUpdate("approved")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
        >
          {loadingAction === `wholesale-approved-${lead.id}` ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          初筛
        </button>
      </div>
    </article>
  );
}

function WholesaleLeadDetailPanel({
  adminNoteDraft,
  assessment,
  candidates,
  lead,
  loadingAction,
  matches,
  onAdminNoteDraftChange,
  onCopyContact,
  onCreateMatch,
  onSaveAdminNote,
  onUpdate,
  onUpdateMatchStatus,
}: {
  adminNoteDraft: string;
  assessment: WholesaleLeadAssessment | null;
  candidates: Array<WholesaleMatchCandidate<ApiTransitAdminSubmission>>;
  lead: ApiTransitAdminSubmission | null;
  loadingAction: string | null;
  matches: WholesaleAdminMatch[];
  onAdminNoteDraftChange: (value: string) => void;
  onCopyContact?: () => void;
  onCreateMatch: (candidate: WholesaleMatchCandidate<ApiTransitAdminSubmission>) => void;
  onSaveAdminNote: () => void;
  onUpdate?: (reviewStatus: ApiTransitSubmissionReviewStatus) => void;
  onUpdateMatchStatus: (match: WholesaleAdminMatch, status: WholesaleMatchStatus) => void;
}) {
  if (!lead) {
    return (
      <aside className="rounded-lg border border-[#adb3b4]/20 bg-white p-6 text-sm leading-6 text-[#5a6061] shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
        选择一条批发线索后，可以在这里查看完整字段、复制联系方式、打开证明链接和记录后台备注。
      </aside>
    );
  }

  const meta = lead.submittedMeta;
  const proofUrl = wholesaleProofUrl(lead);
  const detailRows: Array<[string, string | null]> = [
    ["角色", wholesaleRoleLabel(meta)],
    ["方向", wholesaleDirectionLabel(meta)],
    ["联系方式", lead.contact],
    ["身份", stringMeta(meta, "identityType")],
    ["目标/供给", stringMeta(meta, "target")],
    ["月量/批量", stringMeta(meta, "volume")],
    ["预算", stringMeta(meta, "budget")],
    ["可接受来源", stringMeta(meta, "acceptableSources")],
    ["源头说明", stringMeta(meta, "sourceDescription")],
    ["起批门槛", stringMeta(meta, "minimumOrder")],
    ["价格/结算", stringMeta(meta, "pricing")],
    ["测试/验真", stringMeta(meta, "testRequirement")],
    ["售后/边界", stringMeta(meta, "afterSales")],
    ["证明材料", stringMeta(meta, "evidenceSummary")],
  ];

  return (
    <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
      <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#202829]">{lead.submittedName || "批发线索"}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge tone={wholesaleStatusTone(lead.reviewStatus)}>{wholesaleReviewStatusLabel(lead.reviewStatus)}</StatusBadge>
              <StatusBadge tone="info">{wholesaleDirectionLabel(meta) || "未分类"}</StatusBadge>
              <StatusBadge tone={wholesaleRoleValue(meta) === "seller" ? "success" : "muted"}>{wholesaleRoleLabel(meta) || "批发线索"}</StatusBadge>
              {assessment ? <StatusBadge tone={wholesaleQualityTone(assessment.quality)}>{wholesaleQualityLabel(assessment.quality)}</StatusBadge> : null}
            </div>
          </div>
          <span className="shrink-0 text-xs text-[#5a6061]">{formatRelativeTime(lead.createdAt)}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!lead.contact}
            onClick={onCopyContact}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
          >
            <Copy size={13} />
            复制联系
          </button>
          {proofUrl ? (
            <a
              href={proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition-colors hover:bg-[#f2f4f4]"
            >
              <ExternalLink size={13} />
              打开证明
            </a>
          ) : null}
          <button
            type="button"
            disabled={!onUpdate || lead.reviewStatus === "collector_todo" || loadingAction === `wholesale-collector_todo-${lead.id}`}
            onClick={() => onUpdate?.("collector_todo")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
          >
            <ClipboardList size={13} />
            待跟进
          </button>
          <button
            type="button"
            disabled={!onUpdate || lead.reviewStatus === "approved" || loadingAction === `wholesale-approved-${lead.id}`}
            onClick={() => onUpdate?.("approved")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            初筛通过
          </button>
          <button
            type="button"
            disabled={!onUpdate || lead.reviewStatus === "rejected" || loadingAction === `wholesale-rejected-${lead.id}`}
            onClick={() => onUpdate?.("rejected")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5b5ad] bg-white px-3 text-xs font-semibold text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
          >
            <XCircle size={13} />
            拒绝
          </button>
        </div>
      </section>

      {assessment ? (
        <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[#202829]">资料完整度</div>
            <span className="text-xs font-semibold text-[#5a6061]">{assessment.score}/100</span>
          </div>
          {assessment.missing.length ? (
            <p className="mt-2 text-xs leading-5 text-[#7a541b]">需补充：{assessment.missing.join("、")}</p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[#2f7a4b]">关键供需信息已完整，可以进入人工撮合判断。</p>
          )}
          {assessment.riskFlags.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assessment.riskFlags.map((flag) => <StatusBadge key={flag} tone="warn">{flag}</StatusBadge>)}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#202829]">
          <ClipboardList size={15} />
          推荐匹配
        </div>
        <p className="mt-1 text-xs leading-5 text-[#5a6061]">系统只给出候选和依据，创建撮合后仍需分别确认双方意愿。</p>
        <div className="mt-3 space-y-2">
          {candidates.map((candidate) => {
            const alreadyMatched = matches.some((match) =>
              match.demandSubmissionId === candidate.lead.id || match.supplySubmissionId === candidate.lead.id,
            );
            return (
              <div key={candidate.lead.id} className="rounded-lg bg-[#f8fafa] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#202829]">{candidate.lead.submittedName || "批发线索"}</div>
                    <p className="mt-1 text-xs leading-5 text-[#5a6061]">{candidate.reasons.join("；") || "资料方向可进一步判断"}</p>
                    {candidate.conflicts.length ? <p className="mt-1 text-xs leading-5 text-[#7a541b]">注意：{candidate.conflicts.join("；")}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-[#47657a]">{candidate.score}</span>
                </div>
                <button
                  type="button"
                  disabled={alreadyMatched || loadingAction === `wholesale-match-${candidate.lead.id}`}
                  onClick={() => onCreateMatch(candidate)}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
                >
                  {loadingAction === `wholesale-match-${candidate.lead.id}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {alreadyMatched ? "已有撮合" : "创建撮合"}
                </button>
              </div>
            );
          })}
          {!candidates.length ? <p className="rounded-lg bg-[#f8fafa] px-3 py-3 text-xs leading-5 text-[#5a6061]">暂无达到推荐门槛的相反角色线索。</p> : null}
        </div>
      </section>

      {matches.length ? (
        <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4">
          <div className="text-sm font-semibold text-[#202829]">撮合进度</div>
          <div className="mt-3 space-y-2">
            {matches.map((match) => (
              <label key={match.id} className="grid gap-1 rounded-lg bg-[#f8fafa] px-3 py-2">
                <span className="text-xs font-medium text-[#5a6061]">匹配度 {match.matchScore} · {match.matchReasons.slice(0, 2).join("、")}</span>
                <select
                  value={match.status}
                  disabled={loadingAction === `wholesale-match-status-${match.id}`}
                  onChange={(event) => onUpdateMatchStatus(match, event.target.value as WholesaleMatchStatus)}
                  className="h-9 rounded-lg border border-[#adb3b4]/30 bg-white px-2 text-xs font-semibold text-[#202829] outline-none focus:border-[#2d3435]"
                  aria-label="更新撮合进度"
                >
                  {WHOLESALE_MATCH_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#202829]">
          <FileText size={15} />
          完整字段
        </div>
        <dl className="mt-3 grid gap-2">
          {detailRows.filter(([, value]) => Boolean(value)).map(([label, value]) => (
            <div key={label} className="grid gap-1 rounded-lg bg-[#f8fafa] px-3 py-2">
              <dt className="text-xs font-semibold text-[#5a6061]">{label}</dt>
              <dd className="break-words text-sm leading-6 text-[#202829]">{value}</dd>
            </div>
          ))}
        </dl>
        {lead.notes ? (
          <div className="mt-3 rounded-lg bg-[#f2f4f4] px-3 py-2">
            <div className="text-xs font-semibold text-[#5a6061]">原始补充</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#202829]">{lead.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-[#adb3b4]/20 bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
        <label className="block">
          <span className="text-sm font-semibold text-[#202829]">后台备注</span>
          <textarea
            value={adminNoteDraft}
            onChange={(event) => onAdminNoteDraftChange(event.target.value)}
            rows={5}
            className="mt-2 w-full resize-y rounded-lg border border-[#adb3b4]/30 bg-white px-3 py-2 text-sm leading-6 text-[#202829] outline-none transition placeholder:text-[#7c8586] focus:border-[#2d3435]"
            placeholder="记录是否已联系、资料是否可信、下一步怎么处理..."
          />
        </label>
        <button
          type="button"
          onClick={onSaveAdminNote}
          disabled={loadingAction === `wholesale-note-${lead.id}`}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-xs font-semibold text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
        >
          {loadingAction === `wholesale-note-${lead.id}` ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          保存备注
        </button>
      </section>
    </aside>
  );
}

function SubmissionRow({
  submission,
  loadingAction,
  onUpdate,
}: {
  submission: ApiTransitAdminSubmission;
  loadingAction: string | null;
  onUpdate: (
    submission: ApiTransitAdminSubmission,
    reviewStatus: ApiTransitSubmissionReviewStatus,
  ) => void;
}) {
  const isWholesale = isWholesaleSubmission(submission);
  const internalWholesaleUrl = isInternalWholesaleLeadUrl(submission);
  const needsStationDraft = !isWholesale && submission.reviewStatus === "approved" && !submission.stationId;
  return (
    <article className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(220px,1.5fr)_120px_140px_150px_220px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-[#202829]">{submission.submittedName || submission.submittedUrl}</h2>
          {isWholesale ? <StatusBadge tone="info">批发线索</StatusBadge> : null}
          <StatusBadge tone={submission.reviewStatus === "pending" ? "warn" : submission.reviewStatus === "approved" ? "success" : submission.reviewStatus === "collector_todo" ? "info" : "muted"}>
            {submissionReviewStatusLabel(submission.reviewStatus)}
          </StatusBadge>
          {submission.duplicateCount > 0 ? (
            <StatusBadge tone="muted">合并 {submission.duplicateCount}</StatusBadge>
          ) : null}
        </div>
        {internalWholesaleUrl ? (
          <div className="mt-1 text-xs font-medium text-[#5a6061]">内部批发线索：{submission.id}</div>
        ) : (
          <a href={submission.submittedUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#47657a] hover:text-[#202829]">
            <span className="truncate">{submission.submittedUrl}</span>
            <ExternalLink size={12} />
          </a>
        )}
        {submission.normalizedHost ? (
          <div className="mt-1 text-xs text-[#adb3b4]">同站口径：{submission.normalizedHost}</div>
        ) : null}
        <SubmissionMetaSummary submission={submission} />
        {submission.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{submission.notes}</p> : null}
      </div>
      <div>
        <MobileLabel>类型</MobileLabel>
        <span className="text-sm font-medium text-[#2d3435]">{submissionTypeLabel(submission)}</span>
        {submission.contact ? <div className="mt-1 text-xs text-[#5a6061]">{submission.contact}</div> : null}
      </div>
      <div>
        <MobileLabel>探测</MobileLabel>
        <StatusBadge tone={submission.probeStatus === "public_pricing_found" ? "success" : submission.probeStatus === "failed" ? "danger" : "info"}>
          {probeStatusLabel(submission.probeStatus)}
        </StatusBadge>
      </div>
      <div>
        <MobileLabel>时间</MobileLabel>
        <span className="text-xs text-[#5a6061]">{formatRelativeTime(submission.createdAt)}</span>
      </div>
      <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
        <button
          type="button"
          disabled={submission.reviewStatus === "collector_todo" || loadingAction === `submission-collector_todo-${submission.id}`}
          onClick={() => onUpdate(submission, "collector_todo")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
        >
          <ClipboardList size={13} />
          待办
        </button>
        <button
          type="button"
          disabled={(isWholesale && submission.reviewStatus === "approved") || (!needsStationDraft && submission.reviewStatus === "approved") || loadingAction === `submission-approved-${submission.id}`}
          onClick={() => onUpdate(submission, "approved")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
        >
          <CheckCircle2 size={13} />
          {needsStationDraft ? "入池" : "通过"}
        </button>
        <button
          type="button"
          disabled={submission.reviewStatus === "rejected" || loadingAction === `submission-rejected-${submission.id}`}
          onClick={() => onUpdate(submission, "rejected")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
        >
          <XCircle size={13} />
          拒绝
        </button>
      </div>
    </article>
  );
}

function RunsPanel({ runs }: { runs: ApiTransitAdminRun[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="grid grid-cols-[minmax(220px,1.5fr)_120px_120px_150px_minmax(180px,1fr)] gap-3 bg-[#f2f4f4] px-4 py-3 text-xs font-semibold text-[#5a6061] max-lg:hidden">
        <span>站点</span>
        <span>状态</span>
        <span>报价</span>
        <span>时间</span>
        <span>信息</span>
      </div>
      <div className="divide-y divide-[#edf0f1]">
        {runs.map((run) => (
          <article key={run.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(220px,1.5fr)_120px_120px_150px_minmax(180px,1fr)] lg:items-center">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[#202829]">{run.stationName || run.stationId || "未知站点"}</h2>
              {run.sourceUrl ? (
                <a href={run.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#47657a] hover:text-[#202829]">
                  <span className="truncate">{run.sourceUrl}</span>
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
            <div>
              <MobileLabel>状态</MobileLabel>
              <StatusBadge tone={run.status === "success" ? "success" : run.status === "partial" ? "warn" : "danger"}>
                {runStatusLabel(run.status)}
              </StatusBadge>
            </div>
            <div>
              <MobileLabel>报价</MobileLabel>
              <span className="font-semibold text-[#202829]">{run.offerCount}</span>
              <span className="ml-1 text-xs text-[#5a6061]">模型 {run.modelCount}</span>
            </div>
            <div>
              <MobileLabel>时间</MobileLabel>
              <span className="text-xs text-[#5a6061]">{formatRelativeTime(run.finishedAt || run.startedAt)}</span>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-[#5a6061]">{run.errorMessage || run.runType}</p>
          </article>
        ))}
        {!runs.length ? <EmptyState text="没有匹配的检测记录。" /> : null}
      </div>
    </section>
  );
}

function StationEditDialog({
  station,
  loading,
  onClose,
  onSave,
}: {
  station: ApiTransitAdminStation;
  loading: boolean;
  onClose: () => void;
  onSave: (input: ApiTransitStationEditInput) => void;
}) {
  return (
    <AdminEditDialog title={`编辑 ${station.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onSave({
            id: station.id,
            name: formText(formData, "name") || station.name,
            websiteUrl: formText(formData, "websiteUrl") || station.websiteUrl,
            logoUrl: formNullableText(formData, "logoUrl"),
            apiBaseUrl: formNullableText(formData, "apiBaseUrl"),
            pricingUrl: formNullableText(formData, "pricingUrl"),
            monitorUrl: formNullableText(formData, "monitorUrl"),
            summary: formNullableText(formData, "summary"),
            sourceType: formText(formData, "sourceType") || station.sourceType,
            commercialRelation: formText(formData, "commercialRelation") || station.commercialRelation,
            stationSystem: stationSystemFromText(formText(formData, "stationSystem")) || station.stationSystem,
            operatorType: operatorTypeFromText(formText(formData, "operatorType")) || station.operatorType,
            invoiceSupport: invoiceSupportFromText(formText(formData, "invoiceSupport")) || station.invoiceSupport,
            collectorKind: formText(formData, "collectorKind") || station.collectorKind,
            collectionStatus: formText(formData, "collectionStatus") || station.collectionStatus,
            channelTypes: formList(formData, "channelTypes"),
            accountPools: formList(formData, "accountPools"),
            paymentMethods: splitList(formText(formData, "paymentMethods")),
            minimumTopUp: formNullableText(formData, "minimumTopUp"),
            balanceExpiry: formNullableText(formData, "balanceExpiry"),
            supportChannels: splitList(formText(formData, "supportChannels")),
            refundPolicy: formNullableText(formData, "refundPolicy"),
            riskLabels: formList(formData, "riskLabels"),
            status: formText(formData, "status") || station.status,
            dataStatus: formText(formData, "dataStatus") || station.dataStatus,
            usageAdvice: formText(formData, "usageAdvice") || station.usageAdvice,
            published: formData.get("published") === "on",
            adminNote: formNullableText(formData, "adminNote"),
            strengths: splitList(formText(formData, "strengths")),
            cautions: splitList(formText(formData, "cautions")),
            commercialOffers: buildCommercialOffersFromForm(formData, station),
            verificationEvents: parseVerificationEvents(formText(formData, "verificationEvents")),
          });
        }}
      >
        <AdminFormSection
          title="基础资料"
          description="前台识别站点的核心信息，运营时最常改。"
        >
          {station.removedAt ? (
            <div className="rounded-lg border border-[#dfe4e5] bg-[#f2f4f4] px-3 py-2 text-xs leading-5 text-[#5a6061]">
              已移除：{formatRelativeTime(station.removedAt)}
              {station.removedReason ? `；原因：${station.removedReason}` : ""}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="站点名称">
              <input name="name" defaultValue={station.name} className={adminFieldClassName} required />
            </AdminField>
            <AdminField label="官网 URL">
              <input name="websiteUrl" defaultValue={station.websiteUrl} className={adminFieldClassName} type="url" required />
            </AdminField>
            <AdminField label="站点 Logo">
              <StationLogoField station={station} />
            </AdminField>
            <AdminField label="站点状态">
              <select name="status" defaultValue={station.status} className={adminFieldClassName}>
                <option value="active">可用</option>
                <option value="limited">受限</option>
                <option value="unavailable">不可用</option>
                <option value="unknown">未知</option>
              </select>
            </AdminField>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm font-medium text-[#2d3435]">
              <input name="published" type="checkbox" defaultChecked={station.published} className="h-4 w-4 accent-[#2d3435]" />
              前台发布
            </label>
          </div>
        </AdminFormSection>

        <AdminFormSection
          title="公开资料"
          description="用户购买前能核验的页面和说明，优先维护公开价格与监测入口。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="公开价格页 / 快照地址">
              <input name="pricingUrl" defaultValue={station.pricingUrl || ""} className={adminFieldClassName} type="url" />
            </AdminField>
            <AdminField label="公开监测页">
              <input name="monitorUrl" defaultValue={station.monitorUrl || ""} className={adminFieldClassName} type="url" />
            </AdminField>
          </div>
          <AdminField label="站点简介">
            <textarea name="summary" defaultValue={station.summary} className={`${adminFieldClassName} min-h-20 resize-y py-2 leading-6`} />
          </AdminField>
        </AdminFormSection>

        <AdminFormSection
          title="计费与售后"
          description="购买前决策信息，能公开确认时尽量补全。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="最低充值">
              <input name="minimumTopUp" defaultValue={station.minimumTopUp || ""} className={adminFieldClassName} />
            </AdminField>
            <AdminField label="余额有效期">
              <input name="balanceExpiry" defaultValue={station.balanceExpiry || ""} className={adminFieldClassName} />
            </AdminField>
            <AdminField label="站点主体">
              <select name="operatorType" defaultValue={station.operatorType} className={adminFieldClassName}>
                {transitOperatorTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="发票支持">
              <select name="invoiceSupport" defaultValue={station.invoiceSupport} className={adminFieldClassName}>
                {transitInvoiceSupportOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="支付方式">
              <input name="paymentMethods" defaultValue={station.paymentMethods.join("，")} className={adminFieldClassName} />
            </AdminField>
            <AdminField label="售后渠道">
              <input name="supportChannels" defaultValue={station.supportChannels.join("，")} className={adminFieldClassName} />
            </AdminField>
          </div>
          <AdminField label="退款说明">
            <textarea name="refundPolicy" defaultValue={station.refundPolicy || ""} className={`${adminFieldClassName} min-h-20 resize-y py-2 leading-6`} />
          </AdminField>
        </AdminFormSection>

        <AdminFormSection
          title="来源标签与使用建议"
          description="前台来源渠道和风险提示优先看这里，代码推断只做兜底。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="资料来源">
              <select name="sourceType" defaultValue={station.sourceType} className={adminFieldClassName}>
                <option value="manual_collected">运营整理</option>
                <option value="user_submitted">用户推荐</option>
                <option value="merchant_submitted">商家入驻</option>
              </select>
            </AdminField>
            <AdminField label="使用建议">
              <select name="usageAdvice" defaultValue={station.usageAdvice} className={adminFieldClassName}>
                <option value="try_small">小额试用</option>
                <option value="cautious">谨慎</option>
                <option value="not_recommended">不推荐</option>
                <option value="pending">待判断</option>
              </select>
            </AdminField>
            <AdminCheckboxGroup
              label="渠道标签"
              name="channelTypes"
              options={transitChannelTypeOptions}
              selected={station.channelTypes}
            />
            <AdminCheckboxGroup
              label="号池标签"
              name="accountPools"
              options={transitAccountPoolOptions}
              selected={station.accountPools}
            />
            <AdminCheckboxGroup
              label="风险标签"
              name="riskLabels"
              options={transitRiskLabelOptions}
              selected={station.riskLabels}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="优点，一行一个">
              <textarea name="strengths" defaultValue={station.strengths.join("\n")} className={`${adminFieldClassName} min-h-24 resize-y py-2 leading-6`} />
            </AdminField>
            <AdminField label="注意事项，一行一个">
              <textarea name="cautions" defaultValue={station.cautions.join("\n")} className={`${adminFieldClassName} min-h-24 resize-y py-2 leading-6`} />
            </AdminField>
          </div>
        </AdminFormSection>

        <AdminFormSection
          title="商业关系与优惠"
          description="AFF、赞助、合作都需要清楚披露，不影响客观排序口径。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="商业关系">
              <select name="commercialRelation" defaultValue={station.commercialRelation} className={adminFieldClassName}>
                <option value="none">无</option>
                <option value="listed">收录</option>
                <option value="partner">合作</option>
                <option value="affiliate">AFF</option>
                <option value="sponsored">赞助</option>
                <option value="unknown">未知</option>
              </select>
            </AdminField>
            <AdminField label="优惠类型">
              <select name="offerType" defaultValue={station.commercialOffers[0]?.type || "coupon"} className={adminFieldClassName}>
                <option value="coupon">优惠码</option>
                <option value="affiliate">AFF 链接</option>
                <option value="sponsored">赞助权益</option>
              </select>
            </AdminField>
            <AdminField label="优惠标题">
              <input name="offerTitle" defaultValue={station.commercialOffers[0]?.title || ""} className={adminFieldClassName} placeholder="例如 首充 9 折 / PriceAI 专属优惠" />
            </AdminField>
            <AdminField label="列表短文案">
              <input name="offerListLabel" defaultValue={station.commercialOffers[0]?.listLabel || ""} className={adminFieldClassName} placeholder="例如 首充 6.8 折 / 注册赠送 $1" />
            </AdminField>
            <AdminField label="优惠码">
              <input name="offerCode" defaultValue={station.commercialOffers[0]?.code || ""} className={adminFieldClassName} />
            </AdminField>
            <AdminField label="优惠 / AFF 链接">
              <input name="offerUrl" defaultValue={station.commercialOffers[0]?.url || ""} className={adminFieldClassName} type="url" />
            </AdminField>
            <AdminField label="有效期">
              <input name="offerValidUntil" defaultValue={station.commercialOffers[0]?.validUntil || ""} className={adminFieldClassName} placeholder="例如 2026-07-01 / 长期有效" />
            </AdminField>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm font-medium text-[#2d3435]">
              <input name="offerEnabled" type="checkbox" defaultChecked={station.commercialOffers[0]?.enabled ?? true} className="h-4 w-4 accent-[#2d3435]" />
              前台展示优惠
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="优惠说明">
              <textarea name="offerDescription" defaultValue={station.commercialOffers[0]?.description || ""} className={`${adminFieldClassName} min-h-20 resize-y py-2 leading-6`} />
            </AdminField>
            <AdminField label="披露文案">
              <textarea
                name="offerDisclosure"
                defaultValue={station.commercialOffers[0]?.disclosure || TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE}
                className={`${adminFieldClassName} min-h-20 resize-y py-2 leading-6`}
                placeholder={TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE}
              />
            </AdminField>
          </div>
        </AdminFormSection>

        <AdminFormSection
          title="采集配置"
          description="内部字段，不直接作为前台合作资料展示。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="API Base URL（内部采集）">
              <input name="apiBaseUrl" defaultValue={station.apiBaseUrl || ""} className={adminFieldClassName} type="url" />
            </AdminField>
            <AdminField label="前台系统标签">
              <select name="stationSystem" defaultValue={station.stationSystem} className={adminFieldClassName}>
                {transitStationSystemOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="采集器类型">
              <input name="collectorKind" defaultValue={station.collectorKind} className={adminFieldClassName} />
            </AdminField>
            <AdminField label="采集状态">
              <select name="collectionStatus" defaultValue={station.collectionStatus} className={adminFieldClassName}>
                <option value="pending">待采集</option>
                <option value="success">成功</option>
                <option value="partial">部分</option>
                <option value="failed">失败</option>
                <option value="manual_review">人工</option>
              </select>
            </AdminField>
          </div>
          <div className="grid gap-2 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#5a6061] sm:grid-cols-3">
            <div>
              <span className="font-semibold text-[#202829]">最后采集：</span>
              {station.lastCollectedAt ? formatRelativeTime(station.lastCollectedAt) : "未记录"}
            </div>
            <div>
              <span className="font-semibold text-[#202829]">最近检测：</span>
              {station.latestRunAt ? formatRelativeTime(station.latestRunAt) : "未记录"}
            </div>
            <div>
              <span className="font-semibold text-[#202829]">检测状态：</span>
              {station.latestRunStatus ? runStatusLabel(station.latestRunStatus) : "未记录"}
            </div>
            {station.collectionError ? (
              <div className="break-words sm:col-span-3">
                <span className="font-semibold text-[#9b3328]">采集错误：</span>
                {station.collectionError}
              </div>
            ) : null}
          </div>
        </AdminFormSection>

        <AdminFormSection
          title="风险审核与备注"
          description="控制数据核验状态，记录人工判断和后续下架依据。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="数据状态">
              <select name="dataStatus" defaultValue={station.dataStatus} className={adminFieldClassName}>
                <option value="sample">样例</option>
                <option value="pending_review">待审核</option>
                <option value="verified">已核验</option>
              </select>
            </AdminField>
          </div>
          <AdminField label="核验记录，一行一条：日期 | 来源 | 状态 | 标题 | 说明">
            <textarea
              name="verificationEvents"
              defaultValue={formatVerificationEventsForInput(station.verificationEvents)}
              className={`${adminFieldClassName} min-h-28 resize-y py-2 leading-6`}
              placeholder="2026-06-17 | priceai | success | 价格页已解析 | 已核验主流模型倍率"
            />
          </AdminField>
          <AdminField label="后台备注">
            <textarea name="adminNote" defaultValue={station.adminNote || ""} className={`${adminFieldClassName} min-h-20 resize-y py-2 leading-6`} />
          </AdminField>
        </AdminFormSection>
        <AdminDialogActions loading={loading} onClose={onClose} submitLabel="保存站点" />
      </form>
    </AdminEditDialog>
  );
}

function StationLogoField({ station }: { station: ApiTransitAdminStation }) {
  const [logoUrl, setLogoUrl] = useState(station.logoUrl || "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const previewUrl = apiTransitLogoDisplayUrl(logoUrl);

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("stationId", station.id);
      formData.append("file", file);

      const response = await fetch("/api/admin/api-transit/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Logo 上传失败。");
      }

      setLogoUrl(String(json.logo?.url || ""));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Logo 上传失败。");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          name="logoUrl"
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          className={adminFieldClassName}
          placeholder="留空则使用系统默认 Logo"
        />
        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4]">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
          上传
          <input
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              void uploadLogo(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex min-h-8 items-center gap-2 text-xs text-[#5a6061]">
        {previewUrl ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dfe4e5] bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              aria-hidden="true"
              className="h-6 w-6 object-contain"
            />
          </span>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#f2f4f4] text-[11px] font-bold text-[#5a6061]">
            默认
          </span>
        )}
        <span>{uploadError || "支持 SVG、PNG、JPG、WebP，建议方形图标。"}</span>
      </div>
    </div>
  );
}

function OfferEditDialog({
  offer,
  loading,
  onClose,
  onSave,
}: {
  offer: ApiTransitAdminOffer;
  loading: boolean;
  onClose: () => void;
  onSave: (input: ApiTransitOfferEditInput) => void;
}) {
  return (
    <AdminEditDialog title={`编辑报价：${offer.stationName}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onSave({
            id: offer.id,
            family: formText(formData, "family") || offer.family,
            standardModel: formText(formData, "standardModel") || offer.standardModel,
            rawModelName: formText(formData, "rawModelName") || offer.rawModelName,
            groupName: formText(formData, "groupName") || offer.groupName,
            rechargeRatio: formNullableText(formData, "rechargeRatio"),
            modelMultiplier: formNullableNumber(formData, "modelMultiplier"),
            inputPrice: formNullableNumber(formData, "inputPrice"),
            outputPrice: formNullableNumber(formData, "outputPrice"),
            cacheReadPrice: formNullableNumber(formData, "cacheReadPrice"),
            cacheWritePrice: formNullableNumber(formData, "cacheWritePrice"),
            imageOutputPrice: formNullableNumber(formData, "imageOutputPrice"),
            currency: formText(formData, "currency") || offer.currency,
            accountPool: formText(formData, "accountPool") || offer.accountPool,
            channelType: formText(formData, "channelType") || offer.channelType,
            priceSource: formText(formData, "priceSource") || offer.priceSource,
            sourceUrl: formNullableText(formData, "sourceUrl"),
            status: offerStatusFromText(formText(formData, "status")) || offer.status,
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <AdminField label="模型族">
            <select name="family" defaultValue={offer.family} className={adminFieldClassName}>
              {transitModelFamilyOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="状态">
            <select name="status" defaultValue={offer.status} className={adminFieldClassName}>
              <option value="active">已发布</option>
              <option value="needs_review">待审核</option>
              <option value="inactive">已下架</option>
            </select>
          </AdminField>
          <AdminField label="标准模型">
            <input name="standardModel" defaultValue={offer.standardModel} className={adminFieldClassName} required />
          </AdminField>
          <AdminField label="原始模型名">
            <input name="rawModelName" defaultValue={offer.rawModelName} className={adminFieldClassName} required />
          </AdminField>
          <AdminField label="分组名">
            <input name="groupName" defaultValue={offer.groupName} className={adminFieldClassName} required />
          </AdminField>
          <AdminField label="充值倍率">
            <input name="rechargeRatio" defaultValue={offer.rechargeRatio || ""} className={adminFieldClassName} placeholder="1:1 / 1.00x" />
          </AdminField>
          <AdminField label="模型倍率">
            <input name="modelMultiplier" defaultValue={numberInputValue(offer.modelMultiplier)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="输入倍率">
            <input name="inputPrice" defaultValue={numberInputValue(offer.inputPrice)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="输出倍率">
            <input name="outputPrice" defaultValue={numberInputValue(offer.outputPrice)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="缓存输入倍率">
            <input name="cacheReadPrice" defaultValue={numberInputValue(offer.cacheReadPrice)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="缓存创建倍率">
            <input name="cacheWritePrice" defaultValue={numberInputValue(offer.cacheWritePrice)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="图片输出倍率">
            <input name="imageOutputPrice" defaultValue={numberInputValue(offer.imageOutputPrice)} className={adminFieldClassName} inputMode="decimal" />
          </AdminField>
          <AdminField label="币种 / 口径">
            <input name="currency" defaultValue={offer.currency} className={adminFieldClassName} />
          </AdminField>
          <AdminField label="号池">
            <select name="accountPool" defaultValue={offer.accountPool} className={adminFieldClassName}>
              {transitAccountPoolOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="渠道类型">
            <select name="channelType" defaultValue={offer.channelType} className={adminFieldClassName}>
              {transitChannelTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="价格来源">
            <input name="priceSource" defaultValue={offer.priceSource} className={adminFieldClassName} />
          </AdminField>
          <AdminField label="来源 URL">
            <input name="sourceUrl" defaultValue={offer.sourceUrl || ""} className={adminFieldClassName} type="url" />
          </AdminField>
        </div>
        <AdminDialogActions loading={loading} onClose={onClose} submitLabel="保存报价" />
      </form>
    </AdminEditDialog>
  );
}

function AdminEditDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#202829]/35 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        className="max-h-[min(820px,calc(100vh-48px))] w-full max-w-3xl overflow-y-auto rounded-lg bg-[#fbfcfc] p-5 shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/20"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-[#202829]">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭编辑弹窗"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e4e9ea] text-[#5a6061] hover:bg-[#dde4e5]"
          >
            <XCircle size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function AdminField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">{label}</span>
      {children}
    </label>
  );
}

function AdminCheckboxGroup({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: Array<[string, string]>;
  selected: string[];
}) {
  const selectedSet = new Set(selected);

  return (
    <fieldset className="md:col-span-2">
      <legend className="mb-1.5 block text-xs font-semibold text-[#5a6061]">{label}</legend>
      <div className="grid gap-2 rounded-lg border border-[#adb3b4]/30 bg-white p-2 sm:grid-cols-2 lg:grid-cols-4">
        {options.map(([value, optionLabel]) => (
          <label
            key={value}
            className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-[#2d3435] transition hover:bg-[#edf1f2]"
          >
            <input
              name={name}
              type="checkbox"
              value={value}
              defaultChecked={selectedSet.has(value)}
              className="h-4 w-4 accent-[#2d3435]"
            />
            <span>{optionLabel}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AdminFormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-[#adb3b4]/25 bg-[#f8fafa] p-3">
      <div>
        <h3 className="text-sm font-semibold text-[#202829]">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-[#5a6061]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AdminDialogActions({
  loading,
  onClose,
  submitLabel,
}: {
  loading: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-10 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
      >
        取消
      </button>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
        {submitLabel}
      </button>
    </div>
  );
}

function SubmissionMetaSummary({ submission }: { submission: ApiTransitAdminSubmission }) {
  const meta = submission.submittedMeta;
  const wholesale = isWholesaleSubmission(submission);
  const wholesaleRows: Array<[string, string | null]> = wholesale
    ? [
        ["方向", wholesaleDirectionLabel(meta)],
        ["角色", wholesaleRoleLabel(meta)],
        ["身份", stringMeta(meta, "identityType")],
        ["目标/供给", stringMeta(meta, "target")],
        ["月量/批量", stringMeta(meta, "volume")],
        ["预算", stringMeta(meta, "budget")],
        ["价格/结算", stringMeta(meta, "pricing")],
        ["可接受来源", stringMeta(meta, "acceptableSources")],
        ["源头说明", stringMeta(meta, "sourceDescription")],
        ["起批门槛", stringMeta(meta, "minimumOrder")],
        ["测试/验真", stringMeta(meta, "testRequirement")],
        ["售后/边界", stringMeta(meta, "afterSales")],
        ["证明", stringMeta(meta, "evidenceSummary")],
        ["证明链接", stringMeta(meta, "proofUrl")],
      ]
    : [];
  const rows = [
    ...wholesaleRows,
    ["接入", accessModeLabel(stringMeta(meta, "accessMode"))],
    ["凭据", credentialStatusSummary(meta)],
    ["系统", stringMeta(meta, "systemType")],
    ["API", submission.apiBaseUrl],
    ["价格页", submission.pricingUrl],
    ["监测", stringMeta(meta, "monitorUrl")],
    ["优惠码", stringMeta(meta, "couponCode")],
    ["优惠链接", stringMeta(meta, "commercialUrl")],
    ["凭据额度", stringMeta(meta, "credentialBudgetLimit")],
    ["过期", stringMeta(meta, "credentialExpiresAt")],
    ["凭据分组", stringMeta(meta, "credentialGroupName")],
    ["分组 ID", stringMeta(meta, "credentialGroupId")],
    ["号池", stringMeta(meta, "credentialAccountPool")],
    ["模型族", stringMeta(meta, "credentialFamily")],
    ["监测频率", stringMeta(meta, "monitorBudgetLimit")],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const chips = [
    ...arrayMeta(meta, "wholesaleTags"),
    ...arrayMeta(meta, "channelClaims"),
    ...arrayMeta(meta, "cooperation"),
    ...arrayMeta(meta, "admission"),
    ...submission.submittedModels,
  ].filter(Boolean);

  if (!rows.length && !chips.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {rows.length ? (
        <div className="grid gap-1 text-xs leading-5 text-[#5a6061] sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <span className="font-medium text-[#202829]">{label}：</span>
              <span className="break-words">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(new Set(chips)).slice(0, 8).map((chip) => (
            <StatusBadge key={chip} tone="info">{chip}</StatusBadge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MessageBox({ message, onDismiss }: { message: Message; onDismiss: () => void }) {
  const className =
    message.type === "error"
      ? "border-[#f3c8c1] bg-[#fbe9e7] text-[#9b3328]"
      : message.type === "success"
        ? "border-[#cbe7d4] bg-[#e8f3ec] text-[#2f7a4b]"
        : "border-[#c9dae8] bg-[#eef3f8] text-[#47657a]";

  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${className}`}>
      <span>{message.text}</span>
      <button type="button" onClick={onDismiss} className="font-medium">
        关闭
      </button>
    </div>
  );
}

function LoadErrors({ errors }: { errors: ApiTransitAdminData["loadErrors"] }) {
  return (
    <div className="mb-4 rounded-lg border border-[#f3c8c1] bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b3328]">
      <div className="font-semibold">部分后台数据读取失败</div>
      <ul className="mt-2 space-y-1">
        {errors.map((error) => (
          <li key={error.key}>{error.label}：{error.message}</li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-sm text-[#5a6061]">{text}</div>;
}

function MobileLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-[#adb3b4] lg:hidden">{children}</span>;
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "success" | "warn" | "danger" | "info" | "muted" }) {
  const className = {
    success: "bg-[#e8f3ec] text-[#2f7a4b]",
    warn: "bg-[#fff7e8] text-[#7a541b]",
    danger: "bg-[#fbe9e7] text-[#9b3328]",
    info: "bg-[#eef3f8] text-[#47657a]",
    muted: "bg-[#f2f4f4] text-[#5a6061]",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

type ApiResponse = {
  ok?: boolean;
  message?: string;
  updatedCount?: number;
  updatedOfferCount?: number;
  offer?: unknown;
  station?: unknown;
  submission?: unknown;
  stationCreated?: boolean;
};

async function requestJson(path: string, method: string, body: unknown): Promise<ApiResponse> {
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

function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function groupVisibleSubmissions(submissions: ApiTransitAdminSubmission[]): ApiTransitAdminSubmission[] {
  const byId = new Map(submissions.map((submission) => [submission.id, submission]));
  const groups = new Map<string, ApiTransitAdminSubmission[]>();

  for (const submission of submissions) {
    const rootId = submission.duplicateOf && byId.has(submission.duplicateOf)
      ? submission.duplicateOf
      : null;
    const key = rootId || submission.normalizedHost || submission.normalizedUrl || submission.submittedUrl || submission.id;
    groups.set(key, [...(groups.get(key) || []), submission]);
  }

  return Array.from(groups.values())
    .map((group) => {
      const root = group.find((submission) => !submission.duplicateOf) || group[0];
      const storedDuplicateCount = Math.max(...group.map((item) => item.duplicateCount || 0));
      const duplicateTotal = Math.max(group.length - 1, storedDuplicateCount);
      return { ...root, duplicateCount: duplicateTotal };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function toggleCandidateSelection(
  previous: Set<string>,
  candidate: ApiTransitOfferCandidate,
): Set<string> {
  const next = new Set(previous);
  const selected = candidate.rawOfferIds.every((id) => next.has(id));
  for (const id of candidate.rawOfferIds) {
    if (selected) next.delete(id);
    else next.add(id);
  }
  return next;
}

function formatRatio(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function formText(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function formNullableText(formData: FormData, name: string): string | null {
  const text = formText(formData, name);
  return text ? text : null;
}

function formList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function formNullableNumber(formData: FormData, name: string): number | null {
  const text = formText(formData, name);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitList(value: string): string[] {
  return value.split(/[,，\n|｜]+/).map((item) => item.trim()).filter(Boolean);
}

function buildCommercialOffersFromForm(
  formData: FormData,
  station: ApiTransitAdminStation,
): ApiTransitCommercialOffer[] {
  const title = formText(formData, "offerTitle");
  const url = formNullableText(formData, "offerUrl");
  const code = formNullableText(formData, "offerCode");
  const description = formNullableText(formData, "offerDescription");
  const listLabel = formNullableText(formData, "offerListLabel");
  const validUntil = formNullableText(formData, "offerValidUntil");
  const enabled = formData.get("offerEnabled") === "on";
  const disclosure = enabled
    ? formNullableText(formData, "offerDisclosure") || TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE
    : null;
  const existing = station.commercialOffers[0];
  if (!title && !url && !code && !description && !listLabel && !validUntil) return [];

  return [
    {
      id: existing?.id || "primary-offer",
      type: commercialOfferTypeFromText(formText(formData, "offerType")),
      title,
      listLabel,
      description,
      code,
      url,
      validUntil,
      disclosure,
      enabled,
    },
  ];
}

function commercialOfferTypeFromText(value: string): ApiTransitCommercialOffer["type"] {
  if (value === "affiliate" || value === "sponsored" || value === "coupon") return value;
  return "coupon";
}

function formatVerificationEventsForInput(events: ApiTransitVerificationEvent[]): string {
  return events
    .map((event) => [
      event.happenedAt,
      event.source,
      event.status,
      event.title,
      event.description || "",
    ].join(" | "))
    .join("\n");
}

function parseVerificationEvents(value: string): ApiTransitVerificationEvent[] {
  return value
    .split(/\n+/)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const [happenedAt, source, status, title, description] = parts;
      if (!title && !parts[0]) return null;
      return {
        id: `event-${index}`,
        happenedAt: happenedAt || new Date().toISOString(),
        source: verificationEventSourceFromText(source),
        status: verificationEventStatusFromText(status),
        title: title || parts[0] || "核验记录",
        description: description || null,
      };
    })
    .filter((event): event is ApiTransitVerificationEvent => Boolean(event));
}

function verificationEventSourceFromText(value: string | undefined): ApiTransitVerificationEvent["source"] {
  if (value === "official" || value === "user" || value === "merchant" || value === "priceai") return value;
  if (value === "官方监测") return "official";
  if (value === "用户反馈") return "user";
  if (value === "商家提交") return "merchant";
  return "priceai";
}

function verificationEventStatusFromText(value: string | undefined): ApiTransitVerificationEvent["status"] {
  if (value === "warning" || value === "failed" || value === "info" || value === "success") return value;
  if (value === "失败") return "failed";
  if (value === "警告") return "warning";
  if (value === "成功") return "success";
  return "info";
}

function isWholesaleSubmission(submission: ApiTransitAdminSubmission): boolean {
  return submission.submittedMeta.workflow === "wholesale";
}

function isInternalWholesaleLeadUrl(submission: ApiTransitAdminSubmission): boolean {
  return (
    isWholesaleSubmission(submission) &&
    /^https:\/\/priceai\.cc\/wholesale\/leads\//.test(submission.submittedUrl)
  );
}

function submissionTypeLabel(submission: ApiTransitAdminSubmission): string {
  if (isWholesaleSubmission(submission)) return wholesaleRoleLabel(submission.submittedMeta) || "批发线索";
  return submission.submissionType === "merchant" ? "站长提交" : "用户推荐";
}

function wholesaleRoleValue(meta: Record<string, unknown>): "buyer" | "seller" | null {
  const value = stringMeta(meta, "wholesaleRole");
  if (value === "buyer" || value === "seller") return value;
  return null;
}

function wholesaleRoleLabel(meta: Record<string, unknown>): string | null {
  const value = wholesaleRoleValue(meta);
  const explicitLabel = stringMeta(meta, "wholesaleRoleLabel");
  if (value === "buyer") return "批发买方";
  if (value === "seller") return "源头供给";
  return explicitLabel;
}

function wholesaleDirectionValue(meta: Record<string, unknown>): "api_transit" | "subscription_channel" | "other" | null {
  const value = stringMeta(meta, "wholesaleDirection");
  if (value === "api_transit" || value === "subscription_channel" || value === "other") return value;
  return null;
}

function wholesaleDirectionLabel(meta: Record<string, unknown>): string | null {
  const value = wholesaleDirectionValue(meta);
  const explicitLabel = stringMeta(meta, "wholesaleDirectionLabel");
  if (value === "api_transit") return "API 中转批发";
  if (value === "subscription_channel") return "卡网/订阅渠道批发";
  if (value === "other") return "其他源头";
  return explicitLabel;
}

function assessWholesaleSubmission(submission: ApiTransitAdminSubmission): WholesaleLeadAssessment {
  const role = wholesaleRoleValue(submission.submittedMeta) || (submission.submissionType === "merchant" ? "seller" : "buyer");
  const direction = wholesaleDirectionValue(submission.submittedMeta) || "other";
  return assessWholesaleLead({
    role,
    direction,
    title: submission.submittedName,
    details: submission.notes || stringMeta(submission.submittedMeta, "target") || "",
    proofUrl: wholesaleProofUrl(submission),
  });
}

function readWholesaleSubmissionForMatch(submission: ApiTransitAdminSubmission) {
  return {
    id: submission.id,
    role: wholesaleRoleValue(submission.submittedMeta),
    direction: wholesaleDirectionValue(submission.submittedMeta),
    title: submission.submittedName || "",
    details: submission.notes || stringMeta(submission.submittedMeta, "target") || "",
    proofUrl: wholesaleProofUrl(submission),
    reviewStatus: submission.reviewStatus,
  };
}

function wholesaleQualityLabel(value: WholesaleLeadQuality): string {
  if (value === "matchable") return "可撮合";
  if (value === "review") return "待判断";
  return "需补充";
}

function wholesaleQualityTone(value: WholesaleLeadQuality): "success" | "warn" | "info" {
  if (value === "matchable") return "success";
  if (value === "review") return "info";
  return "warn";
}

function wholesaleReviewStatusLabel(value: ApiTransitSubmissionReviewStatus): string {
  if (value === "approved") return "初筛通过";
  if (value === "collector_todo") return "待跟进";
  if (value === "rejected") return "已拒绝";
  return "待处理";
}

function wholesaleStatusTone(value: ApiTransitSubmissionReviewStatus): "success" | "warn" | "danger" | "info" | "muted" {
  if (value === "approved") return "success";
  if (value === "collector_todo") return "info";
  if (value === "rejected") return "danger";
  return "warn";
}

function wholesaleStatusSuccessText(value: ApiTransitSubmissionReviewStatus): string {
  if (value === "approved") return "批发线索已通过初筛。";
  if (value === "collector_todo") return "批发线索已标记为待跟进。";
  if (value === "rejected") return "批发线索已拒绝。";
  return "批发线索已更新。";
}

function wholesaleProofUrl(submission: ApiTransitAdminSubmission): string | null {
  return stringMeta(submission.submittedMeta, "proofUrl") ||
    (isInternalWholesaleLeadUrl(submission) ? null : submission.submittedUrl);
}

function firstWholesaleText(...values: Array<string | null | undefined>): string | null {
  return values.find((value) => value && value.trim())?.trim() || null;
}

function stringMeta(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayMeta(meta: Record<string, unknown>, key: string): string[] {
  const value = meta[key];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return splitList(value);
  return [];
}

function accessModeLabel(value: string | null): string | null {
  if (value === "test_key") return "测试 Key 接入";
  if (value === "test_account") return "测试账号接入";
  if (value === "public_only") return "公开资料接入";
  return null;
}

function credentialStatusSummary(meta: Record<string, unknown>): string | null {
  const status = stringMeta(meta, "credentialStatus");
  const type = stringMeta(meta, "credentialType");
  if (!status || !type) return null;

  const typeLabel = type === "test_account" ? "测试账号" : "测试 Key";
  if (status === "submitted") return `${typeLabel} 已加密保存`;
  if (status === "ready") return `${typeLabel} 可用于检测`;
  if (status === "failed") return `${typeLabel} 验证失败`;
  if (status === "revoked") return `${typeLabel} 已撤销`;
  if (status === "deleted") return `${typeLabel} 已删除`;
  return `${typeLabel} ${status}`;
}

function offerStatusLabel(value: ApiTransitOfferStatus): string {
  if (value === "active") return "已发布";
  if (value === "inactive") return "已下架";
  return "待审核";
}

function offerStatusFromText(value: string): ApiTransitOfferStatus | null {
  if (value === "active" || value === "needs_review" || value === "inactive") return value;
  return null;
}

function stationSystemFromText(value: string): TransitStationSystem | null {
  if (value === "new_api" || value === "sub_to_api" || value === "custom" || value === "unknown") return value;
  return null;
}

function operatorTypeFromText(value: string): ApiTransitOperatorType | null {
  if (value === "company" || value === "individual" || value === "unknown") return value;
  return null;
}

function invoiceSupportFromText(value: string): ApiTransitInvoiceSupport | null {
  if (value === "supported" || value === "unsupported" || value === "unknown") return value;
  return null;
}

function collectionStatusLabel(value: string): string {
  if (value === "success") return "成功";
  if (value === "partial") return "部分";
  if (value === "failed") return "失败";
  if (value === "manual_review") return "人工";
  return "待采集";
}

function runStatusLabel(value: string): string {
  if (value === "success") return "成功";
  if (value === "partial") return "部分";
  return "失败";
}

function probeStatusLabel(value: string): string {
  if (value === "public_pricing_found") return "发现公开价格";
  if (value === "needs_login") return "需要登录";
  if (value === "failed") return "失败";
  return "待处理";
}

function submissionReviewStatusLabel(value: ApiTransitSubmissionReviewStatus): string {
  if (value === "approved") return "已通过";
  if (value === "collector_todo") return "采集待办";
  if (value === "rejected") return "已拒绝";
  return "待处理";
}

function defaultSubmissionNote(value: ApiTransitSubmissionReviewStatus, wholesale = false): string {
  if (value === "approved") {
    return wholesale ? "批发线索人工初筛通过。" : "人工审核通过，已生成或关联站点池草稿。";
  }
  if (value === "collector_todo") {
    return wholesale ? "已加入批发线索待办。" : "已加入 API 中转采集器待办。";
  }
  if (value === "rejected") return "人工审核拒绝。";
  return "";
}

function submissionStatusSuccessText(value: ApiTransitSubmissionReviewStatus, result?: ApiResponse): string {
  if (value === "approved") {
    if (isWholesaleSubmissionResponse(result)) return "批发线索已通过初筛。";
    const stationName = responseStationName(result);
    if (stationName) {
      return result?.stationCreated
        ? `提交线索已通过，并已加入站点池：${stationName}。`
        : `提交线索已通过，并已关联站点池：${stationName}。`;
    }
    return "提交线索已通过，并已准备进入站点池。";
  }
  if (value === "collector_todo") {
    return isWholesaleSubmissionResponse(result) ? "批发线索已加入待办。" : "提交线索已加入采集器待办。";
  }
  if (value === "rejected") return "提交线索已拒绝。";
  return "提交线索已更新。";
}

function isWholesaleSubmissionResponse(result?: ApiResponse): boolean {
  const submission = result?.submission;
  if (!submission || typeof submission !== "object") return false;
  const meta = (submission as { submittedMeta?: unknown }).submittedMeta;
  return Boolean(meta && typeof meta === "object" && (meta as { workflow?: unknown }).workflow === "wholesale");
}

function responseStationName(result?: ApiResponse): string | null {
  const station = result?.station;
  if (!station || typeof station !== "object") return null;
  const name = "name" in station ? String(station.name || "").trim() : "";
  return name || null;
}
