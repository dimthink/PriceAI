"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCcw,
  Search,
  Server,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import type {
  ApiTransitAdminData,
  ApiTransitAdminOffer,
  ApiTransitAdminRun,
  ApiTransitAdminStation,
  ApiTransitAdminSubmission,
  ApiTransitOfferCandidate,
  ApiTransitOfferStatus,
  ApiTransitSubmissionReviewStatus,
} from "@/lib/api-transit-admin-types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

type AdminTab = "stations" | "candidates" | "rawOffers" | "submissions" | "runs";
type Message = {
  type: "success" | "error" | "info";
  text: string;
};

export function ApiTransitAdminConsole({ data }: { data: ApiTransitAdminData }) {
  return <ApiTransitAdminPanel data={data} framed />;
}

export function ApiTransitAdminPanel({
  data,
  framed = false,
}: {
  data: ApiTransitAdminData;
  framed?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [optimisticAuthed, setOptimisticAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("stations");
  const [query, setQuery] = useState("");
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const authed = data.isAuthenticated || optimisticAuthed;
  const normalizedQuery = query.trim().toLowerCase();

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
      data.stations.filter((station) =>
        matchesQuery(normalizedQuery, [
          station.name,
          station.websiteUrl,
          station.pricingUrl,
          station.collectorKind,
          station.adminNote,
        ]),
      ),
    [data.stations, normalizedQuery],
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

  const filteredSubmissions = useMemo(
    () =>
      data.submissions.filter((submission) =>
        matchesQuery(normalizedQuery, [
          submission.submittedName,
          submission.submittedUrl,
          submission.pricingUrl,
          submission.contact,
          submission.notes,
        ]),
      ),
    [data.submissions, normalizedQuery],
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

  const tabs: Array<{ id: AdminTab; label: string; count: number; icon: ReactNode }> = [
    { id: "stations", label: "站点池", count: data.metrics.pendingStations, icon: <Server size={15} /> },
    { id: "candidates", label: "清洗候选", count: data.metrics.candidateOffers, icon: <Database size={15} /> },
    { id: "rawOffers", label: "原始报价", count: data.metrics.pendingOffers, icon: <ClipboardList size={15} /> },
    { id: "submissions", label: "提交线索", count: data.metrics.pendingSubmissions, icon: <Inbox size={15} /> },
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

  async function updateSubmission(
    submission: ApiTransitAdminSubmission,
    reviewStatus: ApiTransitSubmissionReviewStatus,
  ) {
    setLoadingAction(`submission-${reviewStatus}-${submission.id}`);
    const result = await requestJson("/api/admin/api-transit/submissions", "PATCH", {
      id: submission.id,
      reviewStatus,
      adminNote: defaultSubmissionNote(reviewStatus),
    });
    handleActionResult(result, submissionStatusSuccessText(reviewStatus), "更新提交线索失败。");
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
            <section className="mb-5 grid gap-3 md:grid-cols-4">
              <MetricCard label="待发布站点" value={data.metrics.pendingStations} />
              <MetricCard label="清洗候选" value={data.metrics.candidateOffers} />
              <MetricCard label="原始待审" value={data.metrics.pendingOffers} />
              <MetricCard label="提交线索" value={data.metrics.pendingSubmissions} />
            </section>

            <section className="mb-5 rounded-lg border border-[#adb3b4]/25 bg-white p-3 shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb3b4]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索站点、模型、分组、URL..."
                    className="h-10 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setSelectedOfferIds(new Set());
                      }}
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
                </div>
              </div>
            </section>

            {activeTab === "stations" ? (
              <StationsPanel
                stations={filteredStations}
                pendingOffers={pendingOffers}
                loadingAction={loadingAction}
                onPublish={publishStation}
                onTogglePublished={updateStationPublished}
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

  if (!framed) return content;

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      {content}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#adb3b4]/25 bg-white p-4">
      <span className="text-xs font-medium text-[#5a6061]">{label}</span>
      <strong className="mt-1 block text-2xl font-semibold text-[#202829]">{value}</strong>
    </div>
  );
}

function StationsPanel({
  stations,
  pendingOffers,
  loadingAction,
  onPublish,
  onTogglePublished,
}: {
  stations: ApiTransitAdminStation[];
  pendingOffers: ApiTransitAdminOffer[];
  loadingAction: string | null;
  onPublish: (station: ApiTransitAdminStation) => void;
  onTogglePublished: (station: ApiTransitAdminStation, published: boolean) => void;
}) {
  const pendingCountByStation = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of pendingOffers) {
      counts.set(offer.stationId, (counts.get(offer.stationId) || 0) + 1);
    }
    return counts;
  }, [pendingOffers]);

  return (
    <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)]">
      <div className="grid grid-cols-[minmax(220px,1.5fr)_120px_120px_140px_150px_190px] gap-3 bg-[#f2f4f4] px-4 py-3 text-xs font-semibold text-[#5a6061] max-lg:hidden">
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
          const pendingCount = pendingCountByStation.get(station.id) || station.pendingOfferCount;
          return (
            <article key={station.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(220px,1.5fr)_120px_120px_140px_150px_190px] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-[#202829]">{station.name}</h2>
                  <StatusBadge tone={station.published ? "success" : "warn"}>
                    {station.published ? "已上架" : "待发布"}
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
                {station.adminNote || station.collectionError ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{station.collectionError || station.adminNote}</p>
                ) : null}
              </div>
              <div>
                <MobileLabel>发布</MobileLabel>
                <span className="text-sm font-medium text-[#2d3435]">{station.published ? "前台可见" : "审核池"}</span>
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
                {!station.published ? (
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
                {station.published ? (
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
}: {
  candidates: ApiTransitOfferCandidate[];
  selectedOfferIds: Set<string>;
  allVisibleCandidatesSelected: boolean;
  selectedPendingCandidateOfferIds: string[];
  loadingAction: string | null;
  onToggleAll: () => void;
  onToggle: (candidate: ApiTransitOfferCandidate) => void;
  onUpdateOffers: (ids: string[], status: ApiTransitOfferStatus) => void;
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
                      {formatCurrency(candidate.inputPrice, candidate.currency)} / {formatCurrency(candidate.outputPrice, candidate.currency)}
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
}: {
  offers: ApiTransitAdminOffer[];
  selectedOfferIds: Set<string>;
  allVisibleOffersSelected: boolean;
  selectedPendingOfferIds: string[];
  loadingAction: string | null;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onUpdateOffers: (ids: string[], status: ApiTransitOfferStatus) => void;
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
                    <div className="font-mono text-xs text-[#202829]">{formatCurrency(offer.inputPrice, offer.currency)}</div>
                    <div className="mt-1 font-mono text-xs text-[#5a6061]">{formatCurrency(offer.outputPrice, offer.currency)}</div>
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
          <article key={submission.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(220px,1.5fr)_120px_140px_150px_220px] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-[#202829]">{submission.submittedName || submission.submittedUrl}</h2>
                <StatusBadge tone={submission.reviewStatus === "pending" ? "warn" : submission.reviewStatus === "approved" ? "success" : submission.reviewStatus === "collector_todo" ? "info" : "muted"}>
                  {submissionReviewStatusLabel(submission.reviewStatus)}
                </StatusBadge>
              </div>
              <a href={submission.submittedUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#47657a] hover:text-[#202829]">
                <span className="truncate">{submission.submittedUrl}</span>
                <ExternalLink size={12} />
              </a>
              {submission.notes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{submission.notes}</p> : null}
            </div>
            <div>
              <MobileLabel>类型</MobileLabel>
              <span className="text-sm font-medium text-[#2d3435]">{submission.submissionType === "merchant" ? "站长提交" : "用户推荐"}</span>
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
                disabled={submission.reviewStatus === "approved" || loadingAction === `submission-approved-${submission.id}`}
                onClick={() => onUpdate(submission, "approved")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-medium text-[#f8f8f8] transition-colors hover:bg-[#202829] disabled:opacity-50"
              >
                <CheckCircle2 size={13} />
                通过
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
        ))}
        {!submissions.length ? <EmptyState text="没有匹配的提交线索。" /> : null}
      </div>
    </section>
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

function offerStatusLabel(value: ApiTransitOfferStatus): string {
  if (value === "active") return "已发布";
  if (value === "inactive") return "已下架";
  return "待审核";
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

function defaultSubmissionNote(value: ApiTransitSubmissionReviewStatus): string {
  if (value === "approved") return "人工审核通过，等待站点数据入库或关联。";
  if (value === "collector_todo") return "已加入 API 中转采集器待办。";
  if (value === "rejected") return "人工审核拒绝。";
  return "";
}

function submissionStatusSuccessText(value: ApiTransitSubmissionReviewStatus): string {
  if (value === "approved") return "提交线索已标记为通过。";
  if (value === "collector_todo") return "提交线索已加入采集器待办。";
  if (value === "rejected") return "提交线索已拒绝。";
  return "提交线索已更新。";
}
