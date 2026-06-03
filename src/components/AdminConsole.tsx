"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Clock,
  Database,
  Trash2,
  ExternalLink,
  FileInput,
  History,
  Inbox,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Store,
  TerminalSquare,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminSummary,
  ChannelSubmission,
  CollectionMethod,
  CollectorKind,
  CrawlRun,
  OfferStatus,
  RawOffer,
  Source,
  SourceOfferStats,
} from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

/* ─── Types ─── */

type Message = {
  type: "success" | "error" | "info";
  text: string;
};

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

type AdminTab = "review" | "todo" | "history" | "collect" | "sources" | "manual" | "logs";

type RowFeedback = {
  id: string;
  type: "success" | "error" | "info";
  text: string;
};

const statusOptions: Array<[OfferStatus, string]> = [
  ["in_stock", "有货"],
  ["out_of_stock", "缺货"],
];

const collectorKindOptions: Array<[CollectorKind, string]> = [
  ["auto", "自动识别"],
  ["kami", "Kami"],
  ["dujiao", "独角数卡"],
  ["shopApi", "ShopApi"],
  ["xiaoheiwan", "小黑万"],
  ["opensoraHtml", "OpenSora HTML"],
  ["makerichHtml", "Makerich HTML"],
  ["beibeiHtml", "贝贝 HTML"],
  ["ikunloveApi", "IkunLove API"],
  ["getgptApi", "GetGPT API"],
  ["browser", "本机浏览器"],
  ["unsupported", "暂不支持"],
];

const OFFER_EMERGENCY_PAGE_SIZE = 50;

/* ─── Main Component ─── */

export function AdminConsole({ data }: { data: AdminSummary }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<Message | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<ChannelSubmission[]>(data.pendingSubmissions || []);
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
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
  const [offerSearchQuery, setOfferSearchQuery] = useState("");
  const [visibleOfferLimit, setVisibleOfferLimit] = useState(OFFER_EMERGENCY_PAGE_SIZE);
  const [hiddenOfferLimit, setHiddenOfferLimit] = useState(OFFER_EMERGENCY_PAGE_SIZE);
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
      const existing = sourceById.get(suggestedSourceIdForSubmission(s) || "");
      const suggestedCollector = collectorKindMeta(meta, "suggested_collector_kind");
      if (existing || (probe?.status === "success" && probe.offerCount > 0) || isRunnableCollector(suggestedCollector)) {
        ids.add(s.id);
      }
    }
    return ids;
  }, [filteredReview, probeResults, sourceById]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem("ai-price-hub-admin");
      if (stored) {
        setPassword(stored);
        setAuthed(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (rowFeedback) {
      const timer = window.setTimeout(() => setRowFeedback(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [rowFeedback]);

  const showRowFeedback = useCallback((id: string, type: RowFeedback["type"], text: string) => {
    setRowFeedback({ id, type, text });
  }, []);

  const summary = useMemo(
    () => [
      { label: "渠道源", value: sources.length, icon: <Store key="s" size={15} /> },
      { label: "标准商品", value: data.products.length, icon: <Database key="d" size={15} /> },
      { label: "报价", value: data.rawOffers.length, icon: <FileInput key="f" size={15} /> },
      { label: "待审核", value: reviewSubmissions.length, icon: <Inbox key="i" size={15} /> },
      { label: "采集待办", value: collectorTodoSubmissions.length, icon: <TerminalSquare key="t" size={15} /> },
    ],
    [collectorTodoSubmissions.length, data.products.length, data.rawOffers.length, reviewSubmissions.length, sources.length],
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
  const matchedVisibleOffers = useMemo(
    () => filterAdminOffers(data.rawOffers, offerSearchQuery),
    [data.rawOffers, offerSearchQuery],
  );
  const matchedHiddenOffers = useMemo(
    () => filterAdminOffers(data.hiddenRawOffers || [], offerSearchQuery),
    [data.hiddenRawOffers, offerSearchQuery],
  );
  const filteredVisibleOffers = useMemo(
    () => matchedVisibleOffers.slice(0, visibleOfferLimit),
    [matchedVisibleOffers, visibleOfferLimit],
  );
  const filteredHiddenOffers = useMemo(
    () => matchedHiddenOffers.slice(0, hiddenOfferLimit),
    [matchedHiddenOffers, hiddenOfferLimit],
  );
  const sourceGroups = useMemo(() => groupSources(sources), [sources]);
  const selectedSources = useMemo(
    () => sources.filter((source) => selectedSourceIds.has(source.id)),
    [selectedSourceIds, sources],
  );
  const failedRunCount = useMemo(
    () => data.crawlRuns.filter((r) => r.status === "failed").length,
    [data.crawlRuns],
  );
  const adminTabs: Array<{ id: AdminTab; label: string; count: number | null; icon: ReactNode }> = useMemo(
    () => [
      { id: "review", label: "审核", count: reviewSubmissions.length, icon: <Inbox size={15} /> },
      { id: "todo", label: "待办", count: collectorTodoSubmissions.length, icon: <ClipboardList size={15} /> },
      { id: "history", label: "历史", count: null, icon: <History size={15} /> },
      { id: "collect", label: "采集", count: failedRunCount || null, icon: <RefreshCcw size={15} /> },
      { id: "sources", label: "渠道", count: sources.length, icon: <Store size={15} /> },
      { id: "manual", label: "维护", count: null, icon: <Plus size={15} /> },
      { id: "logs", label: "日志", count: data.crawlRuns.length, icon: <Clock size={15} /> },
    ],
    [collectorTodoSubmissions.length, data.crawlRuns.length, failedRunCount, reviewSubmissions.length, sources.length],
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
      window.sessionStorage.setItem("ai-price-hub-admin", password);
      setAuthed(true);
      setGlobalMessage({ type: "success", text: "后台已解锁。" });
      void refreshSubmissions(password);
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
    setGlobalMessage({ type: "info", text: "正在采集所有卡网最新价格，请稍候..." });
    try {
      const response = await fetch("/api/cron/collect-prices", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (response.ok && json.ok) {
        const summaries: Array<{ source?: string; status?: string; offers?: number }> =
          Array.isArray(json.summary) ? json.summary : [];
        const success = summaries.filter((item) => item.status === "success").length;
        const failed = summaries.length - success;
        const totalOffers = summaries.reduce((sum, item) => sum + (item.offers || 0), 0);
        setGlobalMessage({
          type: failed ? "info" : "success",
          text: `采集完成：${success}/${summaries.length} 个来源成功，共 ${totalOffers} 条报价。${failed ? `失败 ${failed} 个，可在日志查看原因。` : ""}`,
        });
      } else {
        setGlobalMessage({ type: "error", text: json.message || "采集失败。" });
      }
    } catch (error) {
      setGlobalMessage({ type: "error", text: error instanceof Error ? error.message : "网络错误。" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function runSourceCollection(source: Source): Promise<{ ok: boolean; offers?: number; message?: string }> {
    const response = await fetch(`/api/cron/collect-prices?source=${encodeURIComponent(source.id)}`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
    const summary = Array.isArray(json.summary) ? json.summary[0] : null;

    if (response.ok && json.ok && summary?.status === "success") {
      return { ok: true, offers: summary.offers || 0 };
    }

    return {
      ok: false,
      message: summary?.message || json.message || `HTTP ${response.status}`,
    };
  }

  async function collectSource(source: Source) {
    setLoadingAction(`collect-source-${source.id}`);
    showRowFeedback(source.id, "info", `正在重采「${source.name}」...`);

    try {
      const result = await runSourceCollection(source);
      if (result.ok) {
        showRowFeedback(source.id, "success", `重采成功：采集到 ${result.offers || 0} 条报价。`);
        router.refresh();
      } else {
        showRowFeedback(source.id, "error", result.message || "重采失败。");
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
    setGlobalMessage({ type: "info", text: `正在重采 ${targets.length} 个渠道...` });

    let success = 0;
    let totalOffers = 0;
    const failures: string[] = [];

    for (const source of targets) {
      const result = await runSourceCollection(source);
      if (result.ok) {
        success++;
        totalOffers += result.offers || 0;
      } else {
        failures.push(`${source.name}: ${result.message || "失败"}`);
      }
    }

    setLoadingAction(null);
    setGlobalMessage({
      type: failures.length ? "info" : "success",
      text: `批量重采完成：${success}/${targets.length} 个成功，共 ${totalOffers} 条报价。${failures.length ? `失败 ${failures.length} 个。` : ""}`,
    });
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

  async function refreshSubmissions(currentPassword: string) {
    try {
      const response = await fetch("/api/admin/submissions?status=pending", {
        headers: { "x-admin-password": currentPassword },
      });
      const json = await response.json().catch(() => ({ ok: false }));
      if (response.ok && json.ok) {
        setSubmissions(json.submissions || []);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const [approvedRes, rejectedRes] = await Promise.all([
        fetch("/api/admin/submissions?status=approved", {
          headers: { "x-admin-password": password },
        }),
        fetch("/api/admin/submissions?status=rejected", {
          headers: { "x-admin-password": password },
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
      setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
      showRowFeedback(submission.id, "success", "已重新解析该提交，旧的未反查状态已刷新。");
    } else {
      showRowFeedback(submission.id, "error", result.message || "重新解析失败。");
    }
  }

  async function reparseFilteredReview() {
    const items = filteredReview;
    if (!items.length) return;
    setLoadingAction("batch-reparse");
    let successCount = 0;
    for (const item of items) {
      const result = await request("/api/admin/submissions/reparse", password, { id: item.id });
      if (result.ok && result.submission) {
        successCount++;
        setSubmissions((prev) => replaceSubmission(prev, result.submission as ChannelSubmission));
      }
    }
    setLoadingAction(null);
    setGlobalMessage({
      type: successCount === items.length ? "success" : "info",
      text: `重新解析完成：${successCount}/${items.length} 条成功。`,
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
      const result = await request("/api/admin/submissions/approve", password, {
        id: item.id,
        name: item.name || stringMeta(meta, "suggested_source_name") || item.parsedTitle || null,
        sourceUrl: stringMeta(meta, "canonical_source_url") || item.url,
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
    if (selectedSourceIds.size === sources.length && sources.every((source) => selectedSourceIds.has(source.id))) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(sources.map((source) => source.id)));
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

        {!authed ? (
          <section className="mx-auto mt-8 max-w-md rounded-lg border border-[#adb3b4]/30 bg-white p-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-[#202829]">
              <KeyRound size={19} />
              后台密码
            </div>
            <p className="mt-2 text-sm text-[#5a6061]">
              使用 `.env.local` 里的 `ADMIN_PASSWORD`。未配置时，本地默认密码为 `ai-price-hub-local`。
            </p>
            <form onSubmit={login} className="mt-4 flex gap-2">
              <input
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
                    onClick={() => refreshSubmissions(password)}
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
                        existingSource={sourceById.get(suggestedSourceIdForSubmission(submission) || "") || null}
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
                          </div>
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
                      description="手动触发跟 Vercel Cron 相同的采集流程。"
                      buttonLabel="立即采集"
                      buttonIcon={<RefreshCcw size={15} />}
                      loading={loadingAction === "collect-prices"}
                      onClick={collectPrices}
                      primary
                    />
                  </Panel>

                  <Panel title="自动采集与浏览器兜底" icon={<TerminalSquare size={17} />}>
                    <p className="text-sm leading-6 text-[#5a6061]">
                      部署后由 `/api/cron/collect-prices` 定时采集真实价格和库存；接口失败、WAF 或登录页才切换到本机浏览器半自动采集。
                    </p>
                    <div className="mt-3 space-y-2">
                      <code className="block overflow-x-auto rounded-lg bg-[#202829] px-3 py-2.5 font-mono text-xs leading-6 text-[#f2f4f4]">
                        GET /api/cron/collect-prices
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

                <RecentRunsPanel runs={data.crawlRuns.slice(0, 8)} />
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
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                    >
                      <Check size={14} />
                      {selectedSourceIds.size ? "取消全选" : "全选渠道"}
                    </button>
                    <button
                      type="button"
                      onClick={batchCollectSelectedSources}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-collect-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2d3435] px-3 text-xs font-medium text-white transition-colors hover:bg-[#202829] disabled:opacity-50"
                    >
                      {loadingAction === "batch-collect-sources" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      批量重采
                    </button>
                    <button
                      type="button"
                      onClick={copySelectedBrowserCommands}
                      disabled={!selectedSourceIds.size}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      <TerminalSquare size={14} />
                      复制采集命令
                    </button>
                    <button
                      type="button"
                      onClick={copySelectedCollectorContexts}
                      disabled={!selectedSourceIds.size}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      <Copy size={14} />
                      复制上下文
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSources(false)}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-disable-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      停用
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSources(true)}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-enable-sources"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4] disabled:opacity-50"
                    >
                      启用
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSourceOffers(true)}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-hide-source-offers"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#9b3328]/20 bg-white px-3 text-xs font-medium text-[#9b3328] transition-colors hover:bg-[#fbe9e7] disabled:opacity-50"
                    >
                      下架报价
                    </button>
                    <button
                      type="button"
                      onClick={() => batchToggleSelectedSourceOffers(false)}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-restore-source-offers"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7a4b]/20 bg-white px-3 text-xs font-medium text-[#2f7a4b] transition-colors hover:bg-[#e8f3ec] disabled:opacity-50"
                    >
                      恢复报价
                    </button>
                    <button
                      type="button"
                      onClick={batchDeleteSelectedSources}
                      disabled={!selectedSourceIds.size || loadingAction === "batch-delete-sources"}
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
                    groups={sourceGroups}
                    offerCountBySource={offerCountBySource}
                    sourceStatsById={sourceStatsById}
                    loadingAction={loadingAction}
                    feedback={rowFeedback}
                    selectedIds={selectedSourceIds}
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
                          onChange={(event) => {
                            setOfferSearchQuery(event.target.value);
                            setVisibleOfferLimit(OFFER_EMERGENCY_PAGE_SIZE);
                            setHiddenOfferLimit(OFFER_EMERGENCY_PAGE_SIZE);
                          }}
                          placeholder="搜索商品、渠道或链接"
                          className="h-9 w-full rounded-lg border border-[#adb3b4]/30 bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2d3435]"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <OfferEmergencyList
                        title="当前可见报价"
                        emptyText="没有匹配的可见报价。"
                        offers={filteredVisibleOffers}
                        totalCount={matchedVisibleOffers.length}
                        loadingAction={loadingAction}
                        actionLabel="下架"
                        actionTone="danger"
                        hiddenAction
                        onLoadMore={() => setVisibleOfferLimit((value) => value + OFFER_EMERGENCY_PAGE_SIZE)}
                        onToggleHidden={toggleOfferHidden}
                      />
                      <OfferEmergencyList
                        title="手动下架报价"
                        emptyText="没有匹配的手动下架报价。"
                        offers={filteredHiddenOffers}
                        totalCount={matchedHiddenOffers.length}
                        loadingAction={loadingAction}
                        actionLabel="恢复"
                        actionTone="success"
                        hiddenAction={false}
                        onLoadMore={() => setHiddenOfferLimit((value) => value + OFFER_EMERGENCY_PAGE_SIZE)}
                        onToggleHidden={toggleOfferHidden}
                      />
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && <div role="tabpanel" id="tabpanel-logs"><RecentRunsPanel runs={data.crawlRuns} /></div>}
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
  const canonicalSourceUrl = stringMeta(meta, "canonical_source_url");
  const canonicalSourceStatus = stringMeta(meta, "canonical_source_status");
  const canonicalSourceReason = stringMeta(meta, "canonical_source_reason");
  const submittedUrlType = stringMeta(meta, "submitted_url_type");
  const parseError = typeof meta.parse_error === "string" ? meta.parse_error : null;
  const currentProbe = probeResult || probeResultFromMeta(meta);
  const hasSuccessfulProbe = currentProbe?.status === "success" && currentProbe.offerCount > 0;
  const hasKnownCollector = isRunnableCollector(suggestedCollector);
  const canApprove = Boolean(existingSource || hasSuccessfulProbe || hasKnownCollector);

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
          </div>

          {submission.notes && <p className="mt-2 text-xs text-[#5a6061]">备注：{submission.notes}</p>}

          {currentProbe && <ProbePreview result={currentProbe} />}

          {/* Next-step recommendation for probe failures */}
          {currentProbe && currentProbe.status !== "success" && mode === "idle" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#fff7e8] px-3 py-2.5 text-xs text-[#7a541b]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {hasKnownCollector
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
              {currentProbe && !canApprove && (
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

function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "info" | "warn" }) {
  const styles =
    tone === "info"
      ? "bg-[#eef3f8] text-[#47657a]"
      : tone === "warn"
        ? "bg-[#fff7e8] text-[#7a541b]"
        : "bg-[#f2f4f4] text-[#5a6061]";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{children}</span>;
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
  groups,
  offerCountBySource,
  sourceStatsById,
  loadingAction,
  feedback,
  selectedIds,
  onToggleSelect,
  onRetry,
  onCopyBrowserCommand,
  onCopyCollectorContext,
  onToggleEnabled,
  onToggleOffersVisibility,
  onDeleteSource,
}: {
  groups: Array<{ label: string; sources: Source[] }>;
  offerCountBySource: Map<string, number>;
  sourceStatsById: Map<string, SourceOfferStats>;
  loadingAction: string | null;
  feedback: RowFeedback | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRetry: (source: Source) => void;
  onCopyBrowserCommand: (source: Source) => void;
  onCopyCollectorContext: (source: Source) => void;
  onToggleEnabled: (source: Source, enabled?: boolean) => void;
  onToggleOffersVisibility: (source: Source, hidden: boolean) => void;
  onDeleteSource: (source: Source) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
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
        {groups.map((group) => (
          <div key={group.label}>
            <div className="bg-[#f2f4f4] px-3 py-2 text-xs font-semibold text-[#5a6061]">
              {group.label} · {group.sources.length} 个
            </div>
            {group.sources.map((source) => (
              <SourceTableRow
                key={source.id}
                source={source}
                offerCount={offerCountBySource.get(source.id) || 0}
                stats={sourceStatsById.get(source.id)}
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
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceTableRow({
  source,
  offerCount,
  stats,
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
        </div>
        <span className="text-sm font-medium text-[#5a6061]">
          <span className="mr-1 text-xs text-[#adb3b4] md:hidden">报价</span>
          {offerCount}
          {stats?.manuallyHiddenCount ? (
            <span className="mt-0.5 block text-xs font-normal text-[#9b3328]">下架 {stats.manuallyHiddenCount}</span>
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

function RecentRunsPanel({ runs }: { runs: CrawlRun[] }) {
  return (
    <Panel title="最近采集记录" icon={<RefreshCcw size={17} />}>
      {runs.length ? (
        <div className="divide-y divide-[#adb3b4]/15 rounded-lg border border-[#adb3b4]/20">
          {runs.map((run) => (
            <div key={run.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[#2d3435]">{run.sourceName || run.sourceId || "未知来源"}</span>
                <Badge>{collectionMethodLabel(run.mode)}</Badge>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${crawlStatusClass(run.status)}`}>
                  {crawlStatusLabel(run.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#5a6061]">
                成功 {run.successCount} 条，失败 {run.failureCount} 条 · {formatRelativeTime(run.finishedAt || run.startedAt)}
              </p>
              {run.message && <p className="mt-1 break-words text-xs leading-5 text-[#adb3b4]">{run.message}</p>}
            </div>
          ))}
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
  totalCount,
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
  totalCount: number;
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

  return (
    <div className="overflow-hidden rounded-lg border border-[#adb3b4]/20">
      <div className="flex items-center justify-between border-b border-[#adb3b4]/15 bg-[#f2f4f4] px-3 py-2.5">
        <span className="text-xs font-semibold text-[#5a6061]">{title}</span>
        <span className="text-xs text-[#adb3b4]">显示 {offers.length} / {totalCount} 条</span>
      </div>
      {offers.length ? (
        <>
          <div className="max-h-[520px] divide-y divide-[#adb3b4]/15 overflow-auto">
            {offers.map((offer) => {
              const actionLoading = loadingAction === `${hiddenAction ? "hide" : "restore"}-offer-${offer.id}`;
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
          </div>
          {offers.length < totalCount && (
            <div className="border-t border-[#adb3b4]/15 p-3">
              <button
                  type="button"
                  onClick={onLoadMore}
                  className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-xs font-medium text-[#5a6061] transition-colors hover:bg-[#f2f4f4]"
                >
                  加载更多
                </button>
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-10 text-center text-sm text-[#adb3b4]">{emptyText}</div>
      )}
    </div>
  );
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

async function request(path: string, password: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
    },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ ok: false, message: response.statusText }));
}

async function requestWithMethod(path: string, method: string, password: string, body: unknown) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
    },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ ok: false, message: response.statusText }));
}

function rowFeedbackClass(value: RowFeedback["type"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "info") return "bg-[#eef3f8] text-[#47657a]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function filterAdminOffers(offers: RawOffer[], query: string): RawOffer[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return offers;

  return offers.filter((offer) => {
    const haystack = [
      offer.sourceTitle,
      offer.sourceName,
      offer.sourceStoreName || "",
      offer.url,
      offer.failureReason || "",
      offer.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).host;
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

function isCollectorKind(value: string | null): value is CollectorKind {
  return Boolean(value && collectorKindOptions.some(([kind]) => kind === value));
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

function collectorKindLabel(value: string): string {
  return collectorKindOptions.find(([kind]) => kind === value)?.[1] || value;
}

function crawlStatusLabel(value: CrawlRun["status"]): string {
  return value === "success" ? "成功" : value === "partial" ? "部分成功" : "失败";
}

function crawlStatusClass(value: CrawlRun["status"]): string {
  if (value === "success") return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (value === "partial") return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

function sourceHealthLabel(source: Source): string {
  if (!source.enabled) return "停用";
  if (source.healthStatus === "healthy") return "正常";
  if (source.healthStatus === "partial") return "部分成功";
  if (source.healthStatus === "retrying") return `重试 ${source.consecutiveFailures || 1}`;
  if (source.healthStatus === "failing") return `异常 ${source.consecutiveFailures || 0}`;
  return "启用";
}

function sourceHealthClass(source: Source): string {
  const base = "w-fit rounded-full px-2 py-0.5 text-xs font-medium";
  if (!source.enabled) return `${base} bg-[#f2f4f4] text-[#5a6061]`;
  if (source.healthStatus === "healthy") return `${base} bg-[#e8f3ec] text-[#2f7a4b]`;
  if (source.healthStatus === "partial" || source.healthStatus === "retrying") return `${base} bg-[#fff7e8] text-[#7a541b]`;
  if (source.healthStatus === "failing") return `${base} bg-[#fbe9e7] text-[#9b3328]`;
  return `${base} bg-[#e8f3ec] text-[#2f7a4b]`;
}

const knownAutoCollectorHosts = new Set([
  "ai666.dnxb.cc",
  "aifk.opensora.de",
  "aisou.pro",
  "bei-bei.shop",
  "burstpro-ai.online",
  "caowo.store",
  "card.kxandyou.com",
  "faka.redeemgpt.com",
  "feifei.shop",
  "getgpt.pro",
  "ikunlove.best",
  "kapay.shop",
  "ldxp.cn",
  "makerich.club",
  "pay.ldxp.cn",
  "pay.qxvx.cn",
  "shop.aitonse.com",
  "shop.auto-subscribe.com",
  "shopcardai.click",
  "talkai.cyou",
  "ultra.makelove.cloud",
  "upgrade.xiaoheiwan.com",
  "yh-mo.xyz",
  "zhang520.store",
  "zzshu.com",
]);

function sourceHost(source: Source): string {
  const host = safeDomain(source.entryUrl || source.baseUrl || "") || "";
  return host.replace(/^www\./, "").toLowerCase();
}

function inferCollectorKindFromSource(source: Source): CollectorKind | null {
  const host = sourceHost(source);
  const text = `${source.id} ${source.name} ${source.entryUrl} ${source.baseUrl || ""}`.toLowerCase();
  if (["ai666.dnxb.cc", "aisou.pro", "caowo.store", "faka.redeemgpt.com", "feifei.shop", "shopcardai.click", "talkai.cyou", "yh-mo.xyz", "zzshu.com"].includes(host)) return "kami";
  if (["burstpro-ai.online", "card.kxandyou.com", "kapay.shop", "shop.aitonse.com", "shop.auto-subscribe.com", "ultra.makelove.cloud", "zhang520.store"].includes(host)) return "dujiao";
  if (host === "pay.qxvx.cn" || host === "pay.ldxp.cn" || host === "ldxp.cn") return "shopApi";
  if (host === "upgrade.xiaoheiwan.com") return "xiaoheiwan";
  if (host === "aifk.opensora.de") return "opensoraHtml";
  if (host === "makerich.club") return "makerichHtml";
  if (host === "bei-bei.shop") return "beibeiHtml";
  if (host === "ikunlove.best") return "ikunloveApi";
  if (host === "getgpt.pro") return "getgptApi";
  if (text.includes("burstpro")) return "dujiao";
  return null;
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

function classifySourceGroup(source: Source): string {
  const text = `${source.id} ${source.name} ${source.baseUrl || ""} ${source.entryUrl} ${source.notes || ""}`.toLowerCase();
  if (source.collectionMethod === "public_json") return "数据入口";
  if (text.includes("ai666.dnxb.cc") || text.includes("gmail批发")) return "自有配置";
  if (text.includes("ldxp") || text.includes("pay.ldxp.cn")) return "LDXP 系";
  if (
    text.includes("auto-subscribe") ||
    text.includes("burstpro") ||
    text.includes("aitonse") ||
    text.includes("makelove") ||
    text.includes("kxandyou")
  ) return "Auto Subscribe 系";
  if (source.collectionMethod === "http") return "HTTP 优先";
  return "自有配置";
}

function groupSources(sources: Source[]) {
  const order = ["数据入口", "LDXP 系", "Auto Subscribe 系", "HTTP 优先", "独立渠道", "自有配置"];
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const label = classifySourceGroup(source);
    const items = groups.get(label) || [];
    items.push(source);
    groups.set(label, items);
  }
  return order
    .map((label) => ({
      label,
      sources: (groups.get(label) || []).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    }))
    .filter((group) => group.sources.length);
}
