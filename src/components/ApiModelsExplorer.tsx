"use client";

import {
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  Layers3,
  Loader2,
  PackageCheck,
  Search,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ApiModelIcon } from "@/components/ApiModelIcon";
import { CategoryTabBar, CategoryTabStrip, type CategoryTabItem } from "@/components/CategoryTabBar";
import { CommunityPrompt } from "@/components/FeedbackLink";
import { SiteHeader } from "@/components/SiteHeader";
import { SponsoredPlacementPreview } from "@/components/SponsoredPlacementPreview";
import { useDebouncedValue, useMediaQuery } from "@/lib/client-hooks";
import { listDetailHref, listDetailNavigationHref, shouldHandleListDetailClick } from "@/lib/list-return";
import { saveCurrentListScrollPosition, useListScrollRestoration } from "@/lib/list-scroll-restoration";
import {
  type ApiBillingMode,
  apiProviderTypeLabels,
  formatApiBillingMode,
  formatApiDisplayText,
  formatApiPrice,
  formatPlanPrice,
  getApiBenchmarkPriceLabels,
  getPlanMonthlyPriceCny,
  getApiModelOffers,
  getApiModelFamilyOptions,
  getApiModelSummaries,
  getApiProviderSummaries,
  type ApiCurrency,
  type ApiModelDataset,
  type ApiModelOfferWithRelations,
  type ApiModelScope,
  type ApiModelSummary,
  type ApiPlan,
  type ApiProviderSummary,
  type ApiProviderType,
} from "@/lib/api-models";
import type { SponsorSettingsSummary } from "@/lib/sponsor-settings-shared";
import { formatDateDay } from "@/lib/utils";

const typeFilters = ["subscription", "official", "free", "all"] as const;
const apiScopeOptions = ["models", "offers", "providers"] as const;
const apiCurrencyOptions = ["USD", "CNY"] as const;
const apiSortOptions = ["recommended", "price", "updated", "channels"] as const;
type TypeFilter = (typeof typeFilters)[number];
type ScopeMode = "models" | "offers" | "providers";
type FamilyFilter = "all" | string;
type MobileSortMode = "recommended" | "price" | "updated" | "channels";

const typeFilterLabels: Record<TypeFilter, string> = {
  all: "全部类型",
  official: apiProviderTypeLabels.official,
  subscription: apiProviderTypeLabels.subscription,
  free: apiProviderTypeLabels.free,
};

export function ApiModelsExplorer({
  dataset,
  sponsorSettings = null,
}: {
  dataset: ApiModelDataset;
  sponsorSettings?: SponsorSettingsSummary | null;
}) {
  useListScrollRestoration();
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("providers");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("subscription");
  const [currency, setCurrency] = useState<ApiCurrency>("USD");
  const [mobileSort, setMobileSort] = useState<MobileSortMode>("recommended");
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitUrls, setSubmitUrls] = useState("");
  const [submitName, setSubmitName] = useState("");
  const [submitContact, setSubmitContact] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const familyOptions = useMemo(() => getApiModelFamilyOptions(dataset), [dataset]);
  const familyTabs = useMemo<CategoryTabItem[]>(
    () => [
      {
        id: "all",
        label: "全部",
        icon: <Layers3 size={17} className="text-[#5a6061]" />,
      },
      ...familyOptions.map((option) => ({
        id: option.id,
        label: option.label,
        icon: <ApiModelIcon family={option.label} className="h-[18px] w-[18px]" />,
      })),
    ],
    [familyOptions],
  );
  const allModelCount = useMemo(() => getApiModelSummaries("all", dataset).length, [dataset]);
  const allProviderCount = useMemo(() => getApiProviderSummaries("all", dataset).length, [dataset]);
  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const modelSummaries = useMemo(
    () =>
      getApiModelSummaries(family, dataset)
        .filter((summary) => matchesModelSummary(summary, normalizedQuery)),
    [dataset, family, normalizedQuery],
  );
  const offerRows = useMemo(
    () =>
      getApiModelOffers(family, dataset)
        .filter((offer) => matchesOffer(offer, normalizedQuery))
        .filter((offer) => typeFilter === "all" || offer.provider.type === typeFilter)
        .sort((a, b) => compareApiOffers(a, b, mobileSort)),
    [dataset, family, mobileSort, normalizedQuery, typeFilter],
  );
  const providerSummaries = useMemo(
    () =>
      getApiProviderSummaries(family, dataset)
        .filter((summary) => matchesProviderSummary(summary, normalizedQuery))
        .filter((summary) => typeFilter === "all" || summary.provider.type === typeFilter)
        .sort((a, b) => compareApiProviders(a, b, mobileSort)),
    [dataset, family, mobileSort, normalizedQuery, typeFilter],
  );

  const subscriptionPlanCount = useMemo(() => dataset.plans.filter((plan) => plan.type === "subscription").length, [dataset.plans]);
  const resultCount =
    scopeMode === "models"
      ? modelSummaries.length
      : scopeMode === "offers"
        ? offerRows.length
        : providerSummaries.length;
  const explorerQueryString = useMemo(
    () => buildApiModelsSearchParams({ currency, family, mobileSort, query, scopeMode, typeFilter }).toString(),
    [currency, family, mobileSort, query, scopeMode, typeFilter],
  );

  function handleScopeModeChange(nextScopeMode: ScopeMode) {
    setScopeMode(nextScopeMode);
    setTypeFilter(defaultTypeFilterForScope(nextScopeMode));
    if (nextScopeMode === "models") {
      setCurrency("USD");
    }
  }

  useEffect(() => {
    let readyFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const nextState = parseApiModelsInitialState(new URLSearchParams(window.location.search), familyOptions);
      setFamily(nextState.family);
      setScopeMode(nextState.scopeMode);
      setQuery(nextState.query);
      setTypeFilter(nextState.typeFilter);
      setCurrency(nextState.currency);
      setMobileSort(nextState.mobileSort);
      readyFrameId = window.requestAnimationFrame(() => setUrlStateReady(true));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (readyFrameId !== null) window.cancelAnimationFrame(readyFrameId);
    };
  }, [familyOptions]);

  useEffect(() => {
    if (!urlStateReady) return;
    if (window.location.pathname !== "/official-api") return;

    const nextUrl = explorerQueryString ? `/official-api?${explorerQueryString}` : "/official-api";
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [explorerQueryString, urlStateReady]);

  useEffect(() => {
    if (!submitOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitLoading) {
        setSubmitOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [submitLoading, submitOpen]);

  useEffect(() => {
    if (!filtersOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filtersOpen]);

  async function handleApiProviderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const urls = parseSubmittedUrls(submitUrls);
    if (!urls.length) {
      setSubmitMessage({ type: "error", text: "请至少填写一个 API 渠道链接。" });
      return;
    }

    setSubmitLoading(true);
    setSubmitMessage(null);
    try {
      const response = await fetch("/api/api-model-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          name: submitName.trim() || null,
          contact: submitContact.trim() || null,
          notes: submitNotes.trim() || null,
          website: "",
        }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (json.ok) {
        const summary = json.summary || { accepted: urls.length, failed: 0, total: urls.length };
        setSubmitMessage({
          type: "success",
          text: `已接收 ${summary.accepted}/${summary.total} 个 API 渠道链接${summary.failed ? `，${summary.failed} 个未通过格式或频率检查` : ""}。`,
        });
        if (!summary.failed) {
          setSubmitUrls("");
          setSubmitName("");
          setSubmitContact("");
          setSubmitNotes("");
        }
      } else {
        setSubmitMessage({ type: "error", text: json.message || "提交失败，请稍后再试。" });
      }
    } catch (error) {
      setSubmitMessage({ type: "error", text: error instanceof Error ? error.message : "网络错误，请稍后再试。" });
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader activeSection="api" />
        <CategoryTabBar
          items={familyTabs}
          value={family}
          onChange={(value) => setFamily(value)}
          className="hidden md:block"
        />
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-4 sm:px-8 md:py-10 lg:py-12">
      <div className="mb-4 space-y-3 md:mb-8 md:space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 font-serif text-[1.4rem] font-semibold leading-8 tracking-normal text-[#202829] sm:text-2xl md:text-4xl">
                {buildTitle(family, scopeMode, typeFilter, familyOptions)}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setSubmitOpen(true);
                  setSubmitMessage(null);
                }}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-3.5 text-sm font-semibold text-[#f8f8f8] shadow-[0_14px_40px_rgba(45,52,53,0.16)] md:hidden"
              >
                <Send size={16} />
                提交
              </button>
            </div>
            <p className="mt-3 hidden max-w-[75ch] text-sm leading-7 text-[#5a6061] md:block">
              标准模型是一套官方 API 基准价格库：文本模型按输入、输出和缓存 token 看，图片/视频生成按官方公开的图片或视频计费单位展示；来源渠道页用来查看官方订阅与 Token Plan 额度。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium text-[#5a6061]">
              <span>{dataset.source === "supabase" ? "数据库同步" : "人工维护样本"}：{formatDatasetDate(dataset.generatedAt)}</span>
              <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
              <span>当前显示：{resultCount} {scopeCountLabel(scopeMode)}</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] md:inline-block" />
              <span className="hidden md:inline">汇率日期：{dataset.fxSummary.date}</span>
            </div>
          </div>

          <div className="hidden grid-cols-4 gap-2 md:grid xl:w-[420px]">
            <Metric label="模型" value={`${allModelCount}`} />
            <Metric label="渠道" value={`${allProviderCount}`} />
            <Metric label="报价" value={`${dataset.offers.length}`} />
            <Metric label="订阅" value={`${subscriptionPlanCount}`} />
          </div>
        </div>

        <SponsoredPlacementPreview kind="apiModels" settings={sponsorSettings} className="hidden md:block" hideOnMobile />

        <div className="space-y-3 md:hidden">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
            <Search size={16} className="shrink-0 text-[#5a6061]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder(scopeMode)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2a3]"
            />
          </label>
          <div className="-mx-5 overflow-x-auto px-5">
            <CategoryTabStrip
              className="w-max pb-1"
              items={familyTabs}
              value={family}
              onChange={(value) => setFamily(value)}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <div className="inline-flex h-11 min-w-0 items-center rounded-full bg-[#e4e9ea] p-1">
              <ViewToggleButton
                active={scopeMode === "models"}
                icon={<PackageCheck size={16} />}
                label="标准"
                onClick={() => handleScopeModeChange("models")}
              />
              <ViewToggleButton
                active={scopeMode === "offers"}
                icon={<Database size={16} />}
                label="报价"
                onClick={() => handleScopeModeChange("offers")}
              />
            </div>
            <button
              type="button"
              aria-pressed={scopeMode === "providers"}
              onClick={() => handleScopeModeChange("providers")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${
                scopeMode === "providers"
                  ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)] ring-1 ring-[#adb3b4]/15"
                  : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/15 hover:bg-[#f2f4f4] hover:text-[#202829]"
              }`}
            >
              <Layers3 size={16} />
              渠道
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${
                mobileFilterCount({ currency, scopeMode, typeFilter })
                  ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
                  : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/15 hover:bg-[#f2f4f4] hover:text-[#202829]"
              }`}
            >
              <Filter size={16} />
              筛选{mobileFilterCount({ currency, scopeMode, typeFilter }) ? ` ${mobileFilterCount({ currency, scopeMode, typeFilter })}` : ""}
            </button>
          </div>
        </div>

        <div className="hidden space-y-3 rounded-lg bg-[#f2f4f4] p-3 shadow-[0_18px_50px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/10 md:block">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15 md:min-w-[300px] md:max-w-[430px]">
              <Search size={16} className="shrink-0 text-[#5a6061]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder(scopeMode)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2a3]"
              />
            </label>

            <div className="inline-flex h-12 shrink-0 items-center rounded-full bg-[#e4e9ea] p-1">
              <ViewToggleButton
                active={scopeMode === "models"}
                icon={<PackageCheck size={16} />}
                label="标准模型"
                onClick={() => handleScopeModeChange("models")}
              />
              <ViewToggleButton
                active={scopeMode === "offers"}
                icon={<Database size={16} />}
                label="全部报价"
                onClick={() => handleScopeModeChange("offers")}
              />
              <ViewToggleButton
                active={scopeMode === "providers"}
                icon={<Layers3 size={16} />}
                label="来源渠道"
                onClick={() => handleScopeModeChange("providers")}
              />
            </div>

            <div className="inline-flex h-12 shrink-0 items-center rounded-full bg-[#e4e9ea] p-1">
              {apiCurrencyOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrency(item)}
                  className={`h-10 rounded-full px-3.5 text-sm font-semibold transition ${
                    currency === item ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]" : "text-[#5a6061] hover:text-[#202829]"
                  }`}
                >
                  {item === "CNY" ? "人民币" : "美元"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setSubmitOpen(true);
                setSubmitMessage(null);
              }}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
            >
              <Send size={16} />
              提交 API 渠道
            </button>
          </div>

          {scopeMode !== "models" ? (
            <div className="flex gap-2 overflow-x-auto border-t border-[#dfe4e5] pt-3">
              {typeFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTypeFilter(item)}
                  aria-label={`类型筛选：${typeFilterLabels[item]}`}
                  className={`inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition ${
                    typeFilter === item
                      ? "bg-[#2d3435] text-[#f8f8f8] shadow-[0_10px_30px_rgba(45,52,53,0.10)]"
                      : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/15 hover:bg-[#f7f9f9] hover:text-[#202829]"
                  }`}
                >
                  {typeFilterLabels[item]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {submitOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#202829]/35 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitLoading) {
              setSubmitOpen(false);
            }
          }}
        >
          <section
            aria-modal="true"
            role="dialog"
            aria-labelledby="api-submit-title"
            className="max-h-[min(760px,calc(100vh-48px))] w-full max-w-[560px] overflow-y-auto rounded-lg bg-[#fbfcfc] p-5 shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/20 md:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="api-submit-title" className="text-lg font-bold text-[#202829]">提交 API 渠道</h2>
                <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                  每行一个链接，优先提交官方文档、价格页或公开 Token Plan 页面。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitOpen(false)}
                disabled={submitLoading}
                aria-label="关闭提交弹窗"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e9ea] text-[#5a6061] transition hover:bg-[#dde4e5] hover:text-[#202829] disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleApiProviderSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">API 渠道链接</span>
                <textarea
                  value={submitUrls}
                  onChange={(event) => setSubmitUrls(event.target.value)}
                  rows={5}
                  required
                  placeholder={"https://api-docs.deepseek.com/quick_start/pricing/\nhttps://bigmodel.cn/pricing"}
                  className="w-full resize-y rounded-lg border border-[#adb3b4]/30 bg-white px-3 py-2 text-sm leading-6 text-[#202829] outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">渠道名（可选）</span>
                <input
                  value={submitName}
                  onChange={(event) => setSubmitName(event.target.value)}
                  placeholder="例如 OpenCode Go"
                  className="h-11 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">联系方式（可选）</span>
                <input
                  value={submitContact}
                  onChange={(event) => setSubmitContact(event.target.value)}
                  placeholder="QQ / 微信 / Telegram，任选一种，便于及时联系"
                  className="h-11 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">备注（可选）</span>
                <textarea
                  value={submitNotes}
                  onChange={(event) => setSubmitNotes(event.target.value)}
                  rows={3}
                  placeholder="模型覆盖、免费额度或 Token Plan 说明"
                  className="w-full resize-y rounded-lg border border-[#adb3b4]/30 bg-white px-3 py-2 text-sm leading-6 text-[#202829] outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]"
                />
              </label>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSubmitOpen(false)}
                  disabled={submitLoading}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5] disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2f7a4b] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#256a3d] disabled:opacity-60"
                >
                  {submitLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  提交给管理员审核
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-5 text-[#5a6061]">
              <span>暂不收录灰色中转 API。</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] sm:inline-block" />
              <span>管理员会在后台看到解析结果并决定是否收录。</span>
            </div>
            {submitMessage ? (
              <div className="mt-3 space-y-2">
                <p className={`rounded-lg px-3 py-2 text-sm ${
                  submitMessage.type === "success" ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
                }`}>
                  {submitMessage.text}
                </p>
                {submitMessage.type === "success" ? (
                  <CommunityPrompt>
                    也欢迎加入 PriceAI 交流群，一起补充模型 API 渠道和免费额度信息。
                  </CommunityPrompt>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <ApiMobileFilterSheet
        open={filtersOpen}
        currency={currency}
        typeFilter={typeFilter}
        resultCount={resultCount}
        showTypeFilter={scopeMode !== "models"}
        onClose={() => setFiltersOpen(false)}
        onCurrencyChange={setCurrency}
        onTypeFilterChange={setTypeFilter}
        onReset={() => {
          setCurrency("USD");
          setTypeFilter(scopeMode === "providers" ? "subscription" : "all");
        }}
      />

      {scopeMode === "models" ? (
        modelSummaries.length ? (
          isDesktop === false ? (
            <ApiModelSummaryMobileList summaries={modelSummaries} currency={currency} returnQuery={explorerQueryString} />
          ) : (
            <div className="hidden md:block">
              <ApiModelSummaryTable summaries={modelSummaries} currency={currency} returnQuery={explorerQueryString} />
            </div>
          )
        ) : (
          <EmptyState text="没有符合条件的标准模型" />
        )
      ) : scopeMode === "offers" ? (
        offerRows.length ? (
          isDesktop === false ? (
            <ApiOfferMobileList rows={offerRows} currency={currency} returnQuery={explorerQueryString} />
          ) : (
            <div className="hidden md:block">
              <ApiOfferTable rows={offerRows} currency={currency} returnQuery={explorerQueryString} />
            </div>
          )
        ) : (
          <EmptyState text="没有符合条件的报价明细" />
        )
      ) : providerSummaries.length ? (
        isDesktop === false ? (
          <ApiProviderSummaryMobileList summaries={providerSummaries} currency={currency} returnQuery={explorerQueryString} />
        ) : (
          <div className="hidden md:block">
            <ApiProviderSummaryTable summaries={providerSummaries} currency={currency} returnQuery={explorerQueryString} />
          </div>
        )
      ) : (
        <EmptyState text="没有符合条件的渠道或订阅计划" />
      )}

      <section className="mt-6 rounded-lg bg-[#fff7e8] p-5 text-sm leading-7 text-[#7a541b] ring-1 ring-[#efdfbd]">
        <p className="font-semibold text-[#7a541b]">订阅额度折算提示</p>
        <p className="mt-1">
          ChatGPT、Claude、Gemini 的官方月订阅多是产品内额度，不等同 API token 包；Token Plan 也要同时看月费、模型覆盖、请求窗口、额度刷新和用途限制。
        </p>
      </section>

      <p className="mt-8 text-xs leading-6 text-[#5a6061]">
        免责声明：PriceAI 只整理公开文档和公开页面中的 API 渠道信息，不售卖 API，不承诺可用性，不替任何渠道提供 SLA。免费和低价渠道可能存在限流、排队、模型下线、地区限制或条款变化。
      </p>
    </main>
    </>
  );
}

function ApiOfferTable({
  currency,
  returnQuery,
  rows,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  rows: ApiModelOfferWithRelations[];
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[28%]" />
            <col className="w-[25%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>模型 / 来源渠道</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>额度与限制</TableHead>
              <TableHead>来源链接</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {rows.map((offer) => {
              const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;
              const modelHref = apiModelDetailHref(offer.modelId, returnQuery);
              const providerHref = apiProviderDetailHref(offer.providerId, returnQuery);

              const priceLabels = getApiBenchmarkPriceLabels(offer.model.family);

              return (
                <tr key={offer.id} className="align-top transition hover:bg-[#f7f9f9]">
                  <td className="px-5 py-4">
                    <div className="grid min-w-0 gap-3">
                      <Link
                        href={modelHref}
                        prefetch={false}
                        onClick={listDetailClickHandler(modelHref, returnQuery)}
                        className="group flex min-w-0 items-center gap-3"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
                          <ApiModelIcon family={offer.model.family} modelName={offer.model.displayName} className="h-7 w-7" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#202829] group-hover:text-[#2f7a4b]">{offer.model.displayName}</span>
                          <span className="mt-1 block truncate text-xs text-[#5a6061]">{offer.routeModelId ?? offer.model.modelId}</span>
                        </span>
                      </Link>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 pl-[52px]">
                        <Link
                          href={providerHref}
                          prefetch={false}
                          onClick={listDetailClickHandler(providerHref, returnQuery)}
                          className="group inline-flex min-w-0 items-center gap-2"
                        >
                          <ApiProviderIcon provider={offer.provider} size="sm" />
                          <span className="min-w-0 truncate text-sm font-semibold text-[#202829] group-hover:text-[#2f7a4b]">
                            {offer.provider.name}
                          </span>
                        </Link>
                        <TypeChip type={offer.provider.type} />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <PriceMetric label={priceLabels.input} value={formatApiPrice(offer.inputPrice, currency)} />
                      <PriceMetric label={priceLabels.output} value={formatApiPrice(offer.outputPrice, currency)} />
                      <PriceMetric
                        label={priceLabels.cacheRead}
                        value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
                        helper={offer.cacheWritePrice ? `${priceLabels.cacheWrite}：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">{formatApiDisplayText(offer.freeOrPlan)}</p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5a6061]">{formatApiDisplayText(offer.limitSummary)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 flex-col items-start gap-2">
                      <a
                        href={sourceHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 py-2 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
                      >
                        <span className="truncate">查看来源</span>
                        <ExternalLink size={13} className="shrink-0" />
                      </a>
                      <span className="text-xs font-medium text-[#5a6061]">{formatDatasetDate(offer.updatedAt)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiOfferMobileList({
  currency,
  returnQuery,
  rows,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  rows: ApiModelOfferWithRelations[];
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:hidden">
      {rows.map((offer) => {
        const sourceHref = offer.pricingUrl ?? offer.provider.pricingUrl ?? offer.provider.url;
        const modelHref = apiModelDetailHref(offer.modelId, returnQuery);
        const providerHref = apiProviderDetailHref(offer.providerId, returnQuery);

        const priceLabels = getApiBenchmarkPriceLabels(offer.model.family);

        return (
          <article key={offer.id} className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
                <ApiModelIcon family={offer.model.family} modelName={offer.model.displayName} className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={modelHref}
                      prefetch={false}
                      onClick={listDetailClickHandler(modelHref, returnQuery)}
                      className="block truncate text-base font-bold leading-6 text-[#202829]"
                    >
                      {offer.model.displayName}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-[#5a6061]">{offer.routeModelId ?? offer.model.modelId}</p>
                  </div>
                  <TypeChip type={offer.provider.type} />
                </div>

                <Link
                  href={providerHref}
                  prefetch={false}
                  onClick={listDetailClickHandler(providerHref, returnQuery)}
                  className="mt-3 inline-flex max-w-full items-center gap-2"
                >
                  <ApiProviderIcon provider={offer.provider} size="sm" />
                  <span className="truncate text-sm font-semibold text-[#202829]">{offer.provider.name}</span>
                </Link>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PriceMetric label={priceLabels.input} value={formatApiPrice(offer.inputPrice, currency)} />
                  <PriceMetric label={priceLabels.output} value={formatApiPrice(offer.outputPrice, currency)} />
                </div>
                <div className="mt-2">
                  <PriceMetric
                    label={priceLabels.cacheRead}
                    value={formatCacheApiPrice(offer.cacheReadPrice, currency)}
                    helper={offer.cacheWritePrice ? `${priceLabels.cacheWrite}：${formatCacheApiPrice(offer.cacheWritePrice, currency)}` : undefined}
                  />
                </div>

                <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-[#2d3435]">{formatApiDisplayText(offer.freeOrPlan)}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5a6061]">{formatApiDisplayText(offer.limitSummary)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={sourceHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
                  >
                    <span className="truncate">查看来源</span>
                    <ExternalLink size={13} className="shrink-0" />
                  </a>
                  <span className="text-xs text-[#5a6061]">{formatDatasetDate(offer.updatedAt)}</span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ApiModelSummaryMobileList({
  currency,
  returnQuery,
  summaries,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  summaries: ApiModelSummary[];
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:hidden">
      {summaries.map((summary) => {
        const href = apiModelDetailHref(summary.id, returnQuery);
        const primaryOffer = summary.primaryOffer;
        const inputPrice = primaryOffer ? formatBenchmarkApiPrice(primaryOffer.inputPrice, currency) : "-";
        const outputPrice = primaryOffer ? formatBenchmarkApiPrice(primaryOffer.outputPrice, currency) : "-";
        const cacheWritePrice = formatBenchmarkCacheWritePrice(primaryOffer, currency);
        const cacheReadPrice = formatBenchmarkOptionalApiPrice(primaryOffer?.cacheReadPrice, currency);
        const priceLabels = getApiBenchmarkPriceLabels(summary.family);

        return (
          <Link
            key={summary.id}
            href={href}
            prefetch={false}
            onClick={listDetailClickHandler(href, returnQuery)}
            className="rounded-lg bg-white px-4 py-3.5 ring-1 ring-[#adb3b4]/15 transition active:scale-[0.995]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
                <ApiModelIcon family={summary.family} modelName={summary.displayName} className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-6 text-[#202829]">{summary.displayName}</p>
                    <p className="mt-0.5 truncate text-sm text-[#5a6061]">
                      {summary.model.modelId}{summary.model.contextWindow ? ` · ${summary.model.contextWindow}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PriceMetric label={priceLabels.input} value={inputPrice} />
                  <PriceMetric label={priceLabels.output} value={outputPrice} />
                  <PriceMetric label={priceLabels.cacheWrite} value={cacheWritePrice} />
                  <PriceMetric label={priceLabels.cacheRead} value={cacheReadPrice} />
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#5a6061]">
                  基准来源：{primaryOffer?.provider.name || summary.model.sourceLabel} · {formatDatasetDate(summary.latestUpdatedAt)}
                </p>
              </div>
              <ChevronRight size={17} className="mt-3 shrink-0 text-[#adb3b4]" />
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function ApiModelSummaryTable({
  currency,
  returnQuery,
  summaries,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  summaries: ApiModelSummary[];
}) {
  const priceLabels = getApiBenchmarkPriceLabels(getSummaryTableFamily(summaries));

  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>标准模型</TableHead>
              <TableHead>{priceLabels.input}</TableHead>
              <TableHead>{priceLabels.output}</TableHead>
              <TableHead>{priceLabels.cacheWrite}</TableHead>
              <TableHead>{priceLabels.cacheRead}</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead className="w-[120px] text-center">操作</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {summaries.map((summary) => {
              const href = apiModelDetailHref(summary.id, returnQuery);
              const primaryOffer = summary.primaryOffer;
              const inputPrice = primaryOffer ? formatBenchmarkApiPrice(primaryOffer.inputPrice, currency) : "-";
              const outputPrice = primaryOffer ? formatBenchmarkApiPrice(primaryOffer.outputPrice, currency) : "-";
              const cacheWritePrice = formatBenchmarkCacheWritePrice(primaryOffer, currency);
              const cacheReadPrice = formatBenchmarkOptionalApiPrice(primaryOffer?.cacheReadPrice, currency);

              return (
                <tr key={summary.id} className="align-top transition hover:bg-[#f7f9f9]">
                  <td className="px-5 py-4">
                    <Link href={href} prefetch={false} onClick={listDetailClickHandler(href, returnQuery)} className="group flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
                        <ApiModelIcon family={summary.family} modelName={summary.displayName} className="h-7 w-7" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#202829] group-hover:text-[#2f7a4b]">{summary.displayName}</span>
                        <span className="mt-1 block truncate text-xs text-[#5a6061]">
                          {summary.model.modelId}
                          {summary.model.contextWindow ? ` · ${summary.model.contextWindow}` : ""}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#5a6061]">
                          {primaryOffer?.provider.name || summary.model.sourceLabel}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4"><StandardPriceCell value={inputPrice} /></td>
                  <td className="px-5 py-4"><StandardPriceCell value={outputPrice} /></td>
                  <td className="px-5 py-4"><StandardPriceCell value={cacheWritePrice} /></td>
                  <td className="px-5 py-4"><StandardPriceCell value={cacheReadPrice} /></td>
                  <td className="px-5 py-4 text-[#5a6061]">{formatDatasetDate(summary.latestUpdatedAt)}</td>
                  <td className="w-[120px] px-5 py-4 text-center">
                    <Link
                      href={href}
                      prefetch={false}
                      onClick={listDetailClickHandler(href, returnQuery)}
                      className="inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
                    >
                      查看
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiProviderSummaryTable({
  currency,
  returnQuery,
  summaries,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  summaries: ApiProviderSummary[];
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[38%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>渠道/订阅</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>套餐额度</TableHead>
              <TableHead>覆盖/边界</TableHead>
              <TableHead>最近更新</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {summaries.map((summary) => {
              const href = apiProviderDetailHref(summary.id, returnQuery);
              const provider = summary.provider;

              return (
                <tr key={summary.id} className="align-top transition hover:bg-[#f7f9f9]">
                  <td className="max-w-[330px] px-5 py-4">
                    <Link href={href} prefetch={false} onClick={listDetailClickHandler(href, returnQuery)} className="group flex min-w-0 items-center gap-3">
                      <ApiProviderIcon provider={provider} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#202829] group-hover:text-[#2f7a4b]">{provider.name}</span>
                        <span className="mt-1 block truncate text-xs text-[#5a6061]">{formatApiDisplayText(provider.description)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <TypeChip type={provider.type} />
                  </td>
                  <td className="px-5 py-4">
                    <ProviderPlanRows plans={summary.plans} currency={currency} providerBillingMode={provider.billingMode} />
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#202829]">{summary.modelCount || summary.offerCount || summary.planCount} 个覆盖项</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#5a6061]">
                      {summary.modelNames.join("、") || summary.primaryPlan?.coverageLabel || formatApiDisplayText(provider.limitSummary)}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5a6061]">
                      {formatApiDisplayText(summary.primaryPlan?.limitSummary ?? provider.limitSummary)}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-[#5a6061]">{formatDatasetDate(summary.latestUpdatedAt)}</p>
                    <Link
                      href={href}
                      prefetch={false}
                      onClick={listDetailClickHandler(href, returnQuery)}
                      className="mt-3 inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
                    >
                      查看
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiProviderSummaryMobileList({
  currency,
  returnQuery,
  summaries,
}: {
  currency: ApiCurrency;
  returnQuery: string;
  summaries: ApiProviderSummary[];
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:hidden">
      {summaries.map((summary) => {
        const href = apiProviderDetailHref(summary.id, returnQuery);
        const provider = summary.provider;

        return (
          <Link
            key={summary.id}
            href={href}
            prefetch={false}
            onClick={listDetailClickHandler(href, returnQuery)}
            className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition active:scale-[0.995]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <ApiProviderIcon provider={provider} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-6 text-[#202829]">{provider.name}</p>
                    <p className="mt-0.5 truncate text-sm text-[#5a6061]">{formatApiBillingMode(provider.billingMode)}</p>
                  </div>
                  <TypeChip type={provider.type} />
                </div>
                <p className="mt-2.5 text-sm font-semibold leading-6 text-[#202829]">
                  {summary.planCount ? `${summary.planCount} 个订阅计划` : `${summary.modelCount || summary.offerCount} 个模型`}
                </p>
                <div className="mt-2">
                  <ProviderPlanRows plans={summary.plans} currency={currency} providerBillingMode={provider.billingMode} compact />
                </div>
                <p className="mt-2 line-clamp-1 text-xs leading-5 text-[#5a6061]">
                  {summary.modelNames.join("、") || summary.primaryPlan?.coverageLabel || formatApiDisplayText(provider.limitSummary)}
                </p>
                <p className="mt-2 text-[0.7rem] font-medium text-[#5a6061]">
                  模型 {summary.modelCount || summary.offerCount} · 报价 {summary.offerCount} · 订阅 {summary.planCount}
                </p>
              </div>
              <ChevronRight size={17} className="mt-3 shrink-0 text-[#adb3b4]" />
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function ProviderPlanRows({
  compact = false,
  currency,
  plans,
  providerBillingMode,
}: {
  compact?: boolean;
  currency: ApiCurrency;
  plans: ApiPlan[];
  providerBillingMode: ApiBillingMode;
}) {
  if (!plans.length) {
    return (
      <p className="rounded-lg bg-[#f7f9f9] px-3 py-2 text-sm leading-6 text-[#5a6061] ring-1 ring-[#adb3b4]/10">
        {formatApiBillingMode(providerBillingMode)}
      </p>
    );
  }

  const visiblePlans = compact ? plans.slice(0, 2) : plans;

  return (
    <div className={compact ? "divide-y divide-[#dfe4e5]" : "grid gap-2"}>
      {visiblePlans.map((plan) => (
        <PlanRow
          key={plan.id}
          compact={compact}
          currency={currency}
          plan={plan}
        />
      ))}
      {compact && plans.length > visiblePlans.length ? (
        <span className="text-xs font-medium text-[#5a6061]">还有 {plans.length - visiblePlans.length} 个计划，进入详情查看。</span>
      ) : null}
    </div>
  );
}

function PlanRow({ compact, currency, plan }: { compact: boolean; currency: ApiCurrency; plan: ApiPlan }) {
  const className = compact
    ? "block py-2"
    : "block rounded-lg bg-[#f7f9f9] px-3.5 py-3 ring-1 ring-[#adb3b4]/10 transition hover:bg-[#edf2f1]";
  const content = (
    <>
      <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-sm font-bold text-[#202829]">{shortPlanName(plan.name)}</span>
        <span className="shrink-0 text-sm font-bold text-[#2f7a4b]">{formatCompactPlanPrice(plan, currency)}</span>
      </span>
      <span className={`mt-1 block text-xs leading-5 text-[#5a6061] ${compact ? "line-clamp-1" : "line-clamp-2"}`}>
        {formatApiDisplayText(plan.quotaSummary)}
      </span>
      {compact ? null : (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {planQuotaBadges(plan).map((badge) => (
            <span key={badge} className="rounded-full bg-[#d8f5e4] px-2 py-0.5 text-[0.68rem] font-semibold leading-5 text-[#237a4b]">
              {badge}
            </span>
          ))}
        </span>
      )}
    </>
  );

  if (compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a
      href={plan.url}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {content}
    </a>
  );
}

function ViewToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${
        active
          ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
          : "text-[#5a6061] hover:text-[#202829]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-full bg-white px-3 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/15 md:block md:h-auto md:rounded-lg md:px-3 md:py-3">
      <p className="truncate text-xs font-medium text-[#5a6061] md:text-[0.68rem] md:uppercase md:tracking-[0.14em]">{label}</p>
      <p className="shrink-0 truncate text-sm font-bold tabular-nums text-[#202829] md:mt-1 md:text-xl">{value}</p>
    </div>
  );
}

function ApiMobileFilterSheet({
  open,
  currency,
  typeFilter,
  resultCount,
  showTypeFilter,
  onClose,
  onCurrencyChange,
  onTypeFilterChange,
  onReset,
}: {
  open: boolean;
  currency: ApiCurrency;
  typeFilter: TypeFilter;
  resultCount: number;
  showTypeFilter: boolean;
  onClose: () => void;
  onCurrencyChange: (currency: ApiCurrency) => void;
  onTypeFilterChange: (typeFilter: TypeFilter) => void;
  onReset: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="官方 API 筛选">
      <button
        type="button"
        aria-label="关闭筛选"
        className="absolute inset-0 h-full w-full bg-[#202829]/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl bg-[#f9f9f9] px-5 pb-5 pt-4 shadow-[0_-20px_70px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/20">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#adb3b4]/60" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-[#202829]">筛选与操作</p>
            <p className="mt-1 text-sm text-[#5a6061]">调整币种和报价类型，结果会即时更新。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e9ea] text-[#5a6061] transition hover:bg-[#dde4e5] hover:text-[#202829]"
            aria-label="关闭筛选"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <section>
            <p className="mb-2 text-xs font-semibold text-[#5a6061]">币种</p>
            <div className="inline-flex h-11 items-center rounded-full bg-[#e4e9ea] p-1">
              {apiCurrencyOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onCurrencyChange(item)}
                  className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                    currency === item
                      ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
                      : "text-[#5a6061] hover:text-[#202829]"
                  }`}
                >
                  {item === "CNY" ? "人民币" : "美元"}
                </button>
              ))}
            </div>
          </section>

          {showTypeFilter ? (
            <section>
              <p className="mb-2 text-xs font-semibold text-[#5a6061]">报价类型</p>
              <div className="flex flex-wrap gap-2">
                {typeFilters.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onTypeFilterChange(item)}
                    className={`inline-flex h-10 items-center rounded-full px-3.5 text-xs font-semibold transition ${
                      typeFilter === item
                        ? "bg-[#2d3435] text-[#f8f8f8] shadow-[0_10px_30px_rgba(45,52,53,0.10)]"
                        : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/15 hover:bg-[#f7f9f9] hover:text-[#202829]"
                    }`}
                  >
                    {typeFilterLabels[item]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-[#dfe4e5] pt-4">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            重置
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
          >
            查看 {resultCount} 条结果
          </button>
        </div>
      </section>
    </div>
  );
}

function TypeChip({ type }: { type: ApiProviderType }) {
  const classNameByType: Record<ApiProviderType, string> = {
    official: "bg-[#e8f3ec] text-[#2f7a4b]",
    subscription: "bg-[#e4e9ea] text-[#2d3435]",
    router: "bg-[#eef3f8] text-[#47657a]",
    free: "bg-[#fff7e8] text-[#7a541b]",
  };

  return (
    <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold ${classNameByType[type]}`}>
      {apiProviderTypeLabels[type]}
    </span>
  );
}

function ApiProviderIcon({ provider, size = "md" }: { provider: { name: string; logoUrl?: string }; size?: "sm" | "md" }) {
  const shellClassName = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const imageClassName = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const fallbackSize = size === "sm" ? 14 : 18;

  if (provider.logoUrl) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15 ${shellClassName}`}>
        <Image
          src={provider.logoUrl}
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          className={`${imageClassName} shrink-0 object-contain`}
        />
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] text-[#5a6061] ring-1 ring-[#adb3b4]/15 ${shellClassName}`}>
      <Database size={fallbackSize} />
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-white px-6 py-16 text-center shadow-[0_20px_60px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
      <p className="font-serif text-2xl font-semibold text-[#202829]">{text}</p>
      <p className="mt-3 text-sm text-[#5a6061]">可以切换模型家族，或清空搜索条件后再查看。</p>
    </div>
  );
}

function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
}

function buildTitle(family: ApiModelScope, scopeMode: ScopeMode, typeFilter: TypeFilter, familyOptions: { id: string; label: string }[]) {
  const label = family === "all" ? "全模型" : familyOptions.find((option) => option.id === family)?.label ?? family;
  if (scopeMode === "providers" && typeFilter === "subscription") {
    return family === "all" ? "官方订阅与 Token Plan" : `${label} 官方订阅与 Token Plan`;
  }

  if (scopeMode === "models") {
    return family === "all" ? "官方 API" : `${label} 官方 API`;
  }
  if (scopeMode === "offers") {
    return family === "all" ? "官方 API 报价" : `${label} API 报价`;
  }
  return family === "all" ? "API 来源渠道" : `${label} API 来源渠道`;
}

function apiModelDetailHref(id: string, returnQuery: string): string {
  return listDetailHref(`/official-api/${id}`, returnQuery);
}

function apiProviderDetailHref(id: string, returnQuery: string): string {
  return listDetailHref(`/official-api/providers/${id}`, returnQuery);
}

function listDetailClickHandler(path: string, returnQuery: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleListDetailClick(event)) return;
    event.preventDefault();
    saveCurrentListScrollPosition();
    window.location.assign(listDetailNavigationHref(path, returnQuery));
  };
}

function buildApiModelsSearchParams({
  currency,
  family,
  mobileSort,
  query,
  scopeMode,
  typeFilter,
}: {
  currency: ApiCurrency;
  family: FamilyFilter;
  mobileSort: MobileSortMode;
  query: string;
  scopeMode: ScopeMode;
  typeFilter: TypeFilter;
}): URLSearchParams {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (family !== "all") params.set("family", family);
  if (scopeMode !== "providers") params.set("scope", scopeMode);
  if (normalizedQuery) params.set("q", normalizedQuery);
  if (typeFilter !== defaultTypeFilterForScope(scopeMode)) params.set("type", typeFilter);
  if (currency !== "USD") params.set("currency", currency);
  if (mobileSort !== "recommended") params.set("sort", mobileSort);

  return params;
}

function parseApiModelsInitialState(params: URLSearchParams, familyOptions: { id: string; label: string }[]) {
  const scopeMode = pickParam(params.get("scope") || "", apiScopeOptions, "providers");

  return {
    family: pickApiFamily(params.get("family") || "", familyOptions),
    scopeMode,
    query: params.get("q") || "",
    typeFilter: pickParam(params.get("type") || "", typeFilters, defaultTypeFilterForScope(scopeMode)),
    currency: pickParam(params.get("currency") || "", apiCurrencyOptions, "USD"),
    mobileSort: pickParam(params.get("sort") || "", apiSortOptions, "recommended"),
  };
}

function pickApiFamily(value: string, familyOptions: { id: string; label: string }[]): FamilyFilter {
  if (!value || value === "all") return "all";
  return familyOptions.some((option) => option.id === value) ? value : "all";
}

function pickParam<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function formatDatasetDate(value: string) {
  return formatDateDay(value);
}

function getSummaryTableFamily(summaries: ApiModelSummary[]) {
  const families = new Set(summaries.map((summary) => summary.family));
  return families.size === 1 ? summaries[0]?.family : null;
}

function scopeCountLabel(scopeMode: ScopeMode) {
  return {
    models: "个标准模型",
    offers: "条报价明细",
    providers: "个渠道/订阅计划",
  }[scopeMode];
}

function searchPlaceholder(scopeMode: ScopeMode) {
  return {
    models: "搜索 GPT-5.4、Claude Sonnet、Gemini 3.1",
    offers: "搜索模型、渠道、Token Plan 或限制",
    providers: "搜索 ChatGPT、Claude、Gemini、OpenCode Go",
  }[scopeMode];
}

function matchesModelSummary(summary: ApiModelSummary, query: string) {
  if (!query) return true;

  return [
    summary.displayName,
    summary.family,
    summary.model.modelId,
    summary.model.description,
    summary.model.contextWindow,
    ...summary.providerNames,
    summary.primaryOffer?.provider.name,
    summary.primaryOffer?.freeOrPlan,
    summary.primaryOffer?.limitSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function matchesProviderSummary(summary: ApiProviderSummary, query: string) {
  if (!query) return true;

  return [
    summary.provider.name,
    summary.provider.description,
    summary.provider.limitSummary,
    summary.provider.limitations,
    summary.primaryPlan?.name,
    summary.primaryPlan?.quotaSummary,
    summary.primaryPlan?.limitSummary,
    summary.primaryPlan?.limitations,
    ...summary.plans.flatMap((plan) => [
      plan.name,
      plan.priceLabel,
      plan.quotaSummary,
      plan.limitSummary,
      plan.limitations,
      ...(plan.quotaBadges || []),
    ]),
    ...summary.families,
    ...summary.modelNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function matchesOffer(offer: ApiModelOfferWithRelations, query: string) {
  if (!query) return true;

  return [
    offer.model.displayName,
    offer.model.family,
    offer.model.modelId,
    offer.routeModelId,
    offer.provider.name,
    offer.provider.description,
    apiProviderTypeLabels[offer.provider.type],
    offer.freeOrPlan,
    offer.limitSummary,
    offer.limitations,
    offer.sourceLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function mobileFilterCount({
  currency,
  scopeMode,
  typeFilter,
}: {
  currency: ApiCurrency;
  scopeMode: ScopeMode;
  typeFilter: TypeFilter;
}) {
  return Number(currency !== "USD") + Number(typeFilter !== defaultTypeFilterForScope(scopeMode));
}

function compareApiOffers(a: ApiModelOfferWithRelations, b: ApiModelOfferWithRelations, sort: MobileSortMode) {
  if (sort === "price") {
    const priceDelta = compareOptionalNumber(apiPriceRank(getSortableOfferPrice(a)), apiPriceRank(getSortableOfferPrice(b)));
    if (priceDelta !== 0) return priceDelta;
  }

  if (sort === "updated") {
    const updatedDelta = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
  }

  if (sort === "channels") {
    const providerDelta = a.provider.name.localeCompare(b.provider.name, "zh-CN");
    if (providerDelta !== 0) return providerDelta;
  }

  const typeDelta = providerTypeRank(a.provider.type) - providerTypeRank(b.provider.type);
  if (typeDelta !== 0) return typeDelta;
  return a.model.displayName.localeCompare(b.model.displayName, "zh-CN") || a.provider.name.localeCompare(b.provider.name, "zh-CN");
}

function getSortableOfferPrice(offer: ApiModelOfferWithRelations) {
  return offer.model.family === "图片生成" || offer.model.family === "视频生成" ? offer.outputPrice : offer.inputPrice;
}

function compareApiProviders(a: ApiProviderSummary, b: ApiProviderSummary, sort: MobileSortMode) {
  const subscriptionPriorityDelta = subscriptionProviderPriority(a.provider.id) - subscriptionProviderPriority(b.provider.id);
  if (subscriptionPriorityDelta !== 0) return subscriptionPriorityDelta;

  if (sort === "price") {
    const priceDelta = compareOptionalNumber(
      a.primaryPlan ? getPlanMonthlyPriceCny(a.primaryPlan) : null,
      b.primaryPlan ? getPlanMonthlyPriceCny(b.primaryPlan) : null,
    );
    if (priceDelta !== 0) return priceDelta;
  }

  if (sort === "updated") {
    const updatedDelta = b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
    if (updatedDelta !== 0) return updatedDelta;
  }

  if (sort === "channels") {
    const coverageDelta = (b.modelCount || b.offerCount) - (a.modelCount || a.offerCount);
    if (coverageDelta !== 0) return coverageDelta;
  }

  const typeDelta = providerTypeRank(a.provider.type) - providerTypeRank(b.provider.type);
  if (typeDelta !== 0) return typeDelta;
  return a.provider.name.localeCompare(b.provider.name, "zh-CN");
}

function subscriptionProviderPriority(providerId: string) {
  return {
    "chatgpt-official-subscription": 0,
    "claude-official-subscription": 1,
    "google-ai-official-subscription": 2,
  }[providerId] ?? 10;
}

function defaultTypeFilterForScope(scopeMode: ScopeMode): TypeFilter {
  return scopeMode === "providers" ? "subscription" : "all";
}

function formatCompactPlanPrice(plan: ApiPlan, currency: ApiCurrency) {
  if (plan.priceLabel.length <= 12) return plan.priceLabel;
  return formatPlanPrice(plan, currency).replace(/ · .+$/, "");
}

function shortPlanName(name: string) {
  return name
    .replace(/^ChatGPT\s+/, "")
    .replace(/^Claude\s+/, "")
    .replace(/^Google AI\s+/, "");
}

function planQuotaBadges(plan: ApiPlan) {
  if (plan.quotaBadges?.length) return plan.quotaBadges;

  const text = [plan.quotaSummary, plan.limitSummary].filter(Boolean).join(" ");
  const matches = [
    ...text.matchAll(/(?:5h|周|月)限额\s*[^\s、，。;；]+/g),
    ...text.matchAll(/(?:约\s*)?(?:Pro\s*)?\d+x(?:\s*(?:使用上限|Pro|higher usage limits))?/gi),
    ...text.matchAll(/\d+\s*(?:GB|TB)\s*存储/gi),
    ...text.matchAll(/\$\d+\s*(?:Cloud credits|Google Cloud credits)/gi),
  ].map((match) => match[0].trim());

  return Array.from(new Set(matches)).slice(0, 4);
}

function apiPriceRank(price: ApiModelOfferWithRelations["inputPrice"]) {
  if (price.kind !== "numeric") return null;
  return price.cnyPerMTokens ?? (typeof price.usdPerMTokens === "number" ? price.usdPerMTokens * 7.2 : null);
}

function compareOptionalNumber(a: number | null | undefined, b: number | null | undefined) {
  if (typeof a !== "number" && typeof b !== "number") return 0;
  if (typeof a !== "number") return 1;
  if (typeof b !== "number") return -1;
  return a - b;
}

function providerTypeRank(type: ApiProviderType) {
  return {
    free: 0,
    official: 1,
    subscription: 2,
    router: 3,
  }[type];
}

function PriceMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f7f9f9] px-3 py-2 ring-1 ring-[#adb3b4]/10">
      <p className="text-[0.68rem] font-semibold text-[#5a6061]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#202829]">{value}</p>
      {helper ? <p className="mt-1 break-words text-xs leading-5 text-[#5a6061]">{helper}</p> : null}
    </div>
  );
}

function StandardPriceCell({ value }: { value: string }) {
  const muted = value === "-";

  return (
    <span className={`block break-words text-sm font-semibold leading-6 ${muted ? "text-[#5a6061]" : "text-[#202829]"}`}>
      {value}
    </span>
  );
}

function formatBenchmarkApiPrice(price: ApiModelOfferWithRelations["inputPrice"], currency: ApiCurrency) {
  if (price.kind === "text") return price.text.trim() || "-";
  const formatted = formatApiPrice(price, currency, { maximumFractionDigits: 3 });
  return price.unitLabel === undefined || price.unitLabel === "1M tokens" ? formatted.replace(" / 1M tokens", "") : formatted;
}

function formatBenchmarkOptionalApiPrice(price: ApiModelOfferWithRelations["cacheReadPrice"], currency: ApiCurrency) {
  return price ? formatBenchmarkApiPrice(price, currency) : "-";
}

function formatBenchmarkCacheWritePrice(offer: ApiModelOfferWithRelations | null | undefined, currency: ApiCurrency) {
  if (!offer) return "-";
  if (offer.cacheWritePrice) return formatBenchmarkApiPrice(offer.cacheWritePrice, currency);
  if (offer.cacheReadPrice) return "-";
  return "-";
}

function formatCacheApiPrice(price: ApiModelOfferWithRelations["cacheReadPrice"], currency: ApiCurrency) {
  return price ? formatApiPrice(price, currency, { maximumFractionDigits: 3 }) : "-";
}

function parseSubmittedUrls(value: string): string[] {
  return Array.from(new Set(value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)))
    .slice(0, 10);
}
