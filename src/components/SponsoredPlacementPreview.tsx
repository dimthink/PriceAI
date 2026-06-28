"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Megaphone, X } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import {
  defaultFooterSponsorCreatives,
  getVisibleSponsorCreatives,
  type SponsorCreative,
  type SponsorPlacementKind,
  type SponsorSettingsSummary,
} from "@/lib/sponsor-settings-shared";

type SponsoredPlacementPreviewProps = {
  kind: SponsorPlacementKind;
  settings?: SponsorSettingsSummary | null;
  className?: string;
};

type PlacementCopy = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  slot: string;
  fit: string;
  visualTitle: string;
  visualBody: string;
  visualMeta: string[];
  tone: "green" | "blue" | "amber";
};

const showSponsorPreview = process.env.NEXT_PUBLIC_PRICEAI_SHOW_SPONSOR_PREVIEW === "1";
const dismissStoragePrefix = "priceai.sponsor.preview.dismissed";
const dismissEventName = "priceai:sponsor-dismissed";
const inMemoryDismissedKeys = new Set<string>();

const placementCopy: Record<SponsorPlacementKind, PlacementCopy> = {
  topBanner: {
    id: "top-banner",
    label: "广告",
    eyebrow: "顶部通知条",
    title: "AI 周边赞助位开放",
    body: "适合云服务器、开发者工具、监控、域名、支付、算力等服务，不放卡网订阅或中转站排名型推广。",
    cta: "查看投放要求",
    slot: "首页顶部",
    fit: "AI 周边",
    visualTitle: "AI 周边服务",
    visualBody: "云服务 / 监控 / 开发工具",
    visualMeta: ["可关闭", "明确标识", "不影响排序"],
    tone: "green",
  },
  home: {
    id: "home-ecosystem",
    label: "广告",
    eyebrow: "首页生态合作位",
    title: "PriceAI 生态合作展示",
    body: "承接 AI 周边服务、开发者基础设施或工具类品牌的轻曝光；不参与四个模块的客观排序。",
    cta: "查看合作方式",
    slot: "首页模块下方",
    fit: "生态合作",
    visualTitle: "Developer Stack",
    visualBody: "给购买决策前的开发者一个明确入口",
    visualMeta: ["品牌图", "短标题", "落地页"],
    tone: "blue",
  },
  apiTransit: {
    id: "api-transit-channel",
    label: "赞助",
    eyebrow: "中转 API 频道赞助位",
    title: "API Gateway / 中转站赞助展示",
    body: "适合 OneHop 这类 API Gateway 或中转站展示品牌、优惠码和资料入口；价格、稳定性和准入规则仍独立展示。",
    cta: "查看该位置要求",
    slot: "频道主位",
    fit: "赞助展示",
    visualTitle: "API Gateway",
    visualBody: "公开价格、优惠码、监测资料入口",
    visualMeta: ["赞助标识", "优惠码", "资料核验"],
    tone: "green",
  },
  apiTransitModels: {
    id: "api-transit-models",
    label: "赞助",
    eyebrow: "模型对比页赞助位",
    title: "按模型承接 API Gateway 合作",
    body: "适合强调模型覆盖、协议兼容、公开价格和监测能力，承接正在按主流标准模型横向比较的用户。",
    cta: "查看投放说明",
    slot: "模型页",
    fit: "模型路由",
    visualTitle: "Model Router",
    visualBody: "GPT / Claude / Gemini / DeepSeek 分组说明",
    visualMeta: ["分组披露", "公开倍率", "监测页"],
    tone: "amber",
  },
  apiModels: {
    id: "api-models",
    label: "广告",
    eyebrow: "API 模型雷达合作位",
    title: "模型 API 与开发者工具赞助",
    body: "面向正在比较官方 API、Token Plan、模型路由和开发工具的用户，适合展示 API 周边服务与可核验资料。",
    cta: "查看合作入口",
    slot: "API 模型页",
    fit: "开发者入口",
    visualTitle: "API Toolkit",
    visualBody: "Token Plan、路由、监控、SDK",
    visualMeta: ["开发者", "可核验", "轻曝光"],
    tone: "blue",
  },
  listFooter: {
    id: "list-footer",
    label: "广告",
    eyebrow: "底部赞助展示区",
    title: "低打扰赞助展示",
    body: "适合网络环境检测、云服务器、监控、支付、域名、开发者工具和中转 API 周边服务；中转 API 只能作为独立广告展示，不影响自然排序。",
    cta: "查看投放要求",
    slot: "页面最底部",
    fit: "独立赞助区",
    visualTitle: "Buyer Toolkit",
    visualBody: "购买前的网络、支付与安全检查",
    visualMeta: ["免责声明下方", "可关闭", "不影响排序"],
    tone: "green",
  },
};

export function SponsoredPlacementPreview({ kind, settings = null, className = "" }: SponsoredPlacementPreviewProps) {
  const copy = placementCopy[kind];
  const dismissStorageKey = `${dismissStoragePrefix}.${copy.id}.v2`;
  const previewEnabled = useSponsorPreviewEnabled();
  const dismissed = useDismissedState(dismissStorageKey);
  const visibleCreatives = getVisibleSponsorCreatives(settings, kind);
  const previewCreatives = previewEnabled ? getPreviewCreatives(kind) : [];
  const creatives = visibleCreatives.length ? visibleCreatives : previewCreatives;

  const dismiss = useCallback(() => {
    inMemoryDismissedKeys.add(dismissStorageKey);
    try {
      window.localStorage.setItem(dismissStorageKey, "1");
    } catch {
      // localStorage may be unavailable in private or restricted browser contexts.
    }
    window.dispatchEvent(new Event(dismissEventName));
  }, [dismissStorageKey]);

  if (!creatives.length || dismissed) return null;

  if (kind === "topBanner") {
    return <TopNoticeAd copy={copy} creative={creatives[0]} className={className} onDismiss={dismiss} />;
  }

  if (kind === "listFooter") {
    return <FooterSponsorSection copy={copy} creatives={creatives} className={className} onDismiss={dismiss} />;
  }

  return <DisplayAdCard copy={copy} creative={creatives[0]} className={className} onDismiss={dismiss} />;
}

function useSponsorPreviewEnabled() {
  return useSyncExternalStore(subscribeSponsorPreviewEnabled, getSponsorPreviewEnabledSnapshot, getSponsorPreviewEnabledServerSnapshot);
}

function subscribeSponsorPreviewEnabled() {
  return () => {};
}

function getSponsorPreviewEnabledSnapshot() {
  if (showSponsorPreview) return true;

  return isLocalPreviewHostname(window.location.hostname);
}

function getSponsorPreviewEnabledServerSnapshot() {
  return showSponsorPreview;
}

function isLocalPreviewHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function TopNoticeAd({
  copy,
  creative,
  className,
  onDismiss,
}: {
  copy: PlacementCopy;
  creative: SponsorCreative;
  className: string;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label={`${copy.eyebrow}广告位`}
      className={`border-b border-[#d8e3df] bg-[#edf7f3] text-[#202829] ${className}`}
    >
      <div className="mx-auto flex min-h-11 max-w-[1500px] items-center gap-3 px-4 sm:px-8">
        <Link
          href={creative.targetUrl || "/commercial#slots"}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm leading-6 text-[#2f6247] transition hover:text-[#1d4d34]"
        >
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#2f7a4b] ring-1 ring-[#b9d8c9]">
            <Megaphone className="h-3.5 w-3.5" />
            {copy.label}
          </span>
          <span className="truncate">
            <span className="font-extrabold">{creative.title || copy.title}</span>
            <span className="mx-2 text-[#7d9690]">/</span>
            {creative.description || copy.body}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#5a6061] ring-1 ring-[#d8e3df] transition hover:bg-[#f8f8f8] hover:text-[#202829]"
          aria-label="关闭顶部广告"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function DisplayAdCard({
  copy,
  creative,
  className,
  onDismiss,
}: {
  copy: PlacementCopy;
  creative: SponsorCreative;
  className: string;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label={`${copy.eyebrow}广告位`}
      className={`relative overflow-hidden rounded-lg bg-white p-3 text-[#202829] ring-1 ring-[#dfe4e5] ${className}`}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-[#5a6061] ring-1 ring-[#dfe4e5]">
          {copy.label}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#5a6061] ring-1 ring-[#dfe4e5] transition hover:bg-white hover:text-[#202829]"
          aria-label={`关闭${copy.eyebrow}广告`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
        <div className="min-w-0 px-2 py-2 pr-20 lg:pr-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff7e8] px-2.5 py-1 text-[11px] font-extrabold text-[#7a541b]">
              <Megaphone className="h-3.5 w-3.5" />
              {copy.eyebrow}
            </span>
            <span className="inline-flex rounded-full bg-[#eef3f8] px-2.5 py-1 text-[11px] font-bold text-[#47657a]">
              {copy.slot}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-extrabold leading-tight text-[#202829] md:text-xl">{creative.title || copy.title}</h2>
          <p className="mt-2 max-w-[76ch] text-sm leading-7 text-[#5a6061]">{creative.description || copy.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={creative.targetUrl || "/commercial#slots"}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-bold text-[#f8f8f8] transition hover:bg-[#1f2526]"
            >
              {copy.cta}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/commercial#rules"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#dde4e5] px-3 text-xs font-bold text-[#2d3435] transition hover:bg-[#cfd8d9]"
            >
              合作边界
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <Link
          href={creative.targetUrl || "/commercial#slots"}
          className={`block min-h-[128px] overflow-hidden rounded-md ring-1 ring-[#dfe4e5] transition hover:ring-[#adb3b4] ${visualToneClass(creative.tone || copy.tone)}`}
          aria-label={`查看${copy.eyebrow}投放要求`}
        >
          <div className="relative flex h-full min-h-[128px] flex-col justify-between p-4">
            {creative.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creative.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-extrabold text-[#202829] ring-1 ring-white/70">
                图片位示例
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#5a6061] ring-1 ring-white/60">
                {copy.fit}
              </span>
            </div>
            <div className={`mt-6 ${creative.imageUrl ? "rounded-md bg-white/85 p-2 ring-1 ring-white/70" : ""}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-normal text-[#5a6061]">Sponsor Preview</p>
              <h3 className="mt-1 text-2xl font-black leading-none tracking-normal text-[#202829]">{creative.visualTitle || copy.visualTitle}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#3e484a]">{creative.visualMeta || copy.visualBody}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {copy.visualMeta.map((item) => (
                <span key={item} className="rounded-full bg-white/75 px-2 py-1 text-[11px] font-bold text-[#3e484a] ring-1 ring-white/70">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}

function FooterSponsorSection({
  copy,
  creatives,
  className,
  onDismiss,
}: {
  copy: PlacementCopy;
  creatives: SponsorCreative[];
  className: string;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label={`${copy.eyebrow}广告位`}
      className={`relative border-t border-[#dfe4e5] px-0 pt-6 text-left text-[#202829] ${className}`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-0 top-6 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f2f4f4] text-[#5a6061] transition hover:bg-[#e4e9ea] hover:text-[#202829]"
        aria-label="关闭底部赞助展示区广告"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="pr-9">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff7e8] px-2.5 py-1 text-[11px] font-extrabold text-[#7a541b]">
                <Megaphone className="h-3.5 w-3.5" />
                {copy.label}
              </span>
              <span className="inline-flex rounded-full bg-[#eef3f8] px-2.5 py-1 text-[11px] font-bold text-[#47657a]">
                {copy.slot}
              </span>
              {copy.visualMeta.map((item) => (
                <span key={item} className="rounded-full bg-[#f2f4f4] px-2.5 py-1 text-[11px] font-bold text-[#5a6061]">
                  {item}
                </span>
              ))}
            </div>
            <h2 className="mt-3 text-base font-extrabold text-[#202829]">赞助展示</h2>
            <p className="mt-1 max-w-[72ch] text-xs leading-5 text-[#5a6061]">
              {copy.body}
            </p>
          </div>
          <Link
            href="/commercial#slots"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-3 text-xs font-bold text-[#f8f8f8] transition hover:bg-[#1f2526]"
          >
            {copy.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {creatives.map((card) => (
            <Link
              key={card.id}
              href={card.targetUrl || "/commercial#slots"}
              className="group overflow-hidden rounded-lg bg-white text-[#202829] ring-1 ring-[#dfe4e5] transition hover:-translate-y-0.5 hover:ring-[#adb3b4]"
              aria-label={`${card.title}广告位，查看投放要求`}
            >
              <div className={`relative aspect-[16/7] overflow-hidden ${card.imageUrl ? "bg-[#f2f4f4]" : footerSponsorVisualClass(card.tone)}`}>
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-extrabold text-[#202829] ring-1 ring-white/70">
                    图片位
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-bold text-[#5a6061] ring-1 ring-white/60">
                    {copy.fit}
                  </span>
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <div className={card.imageUrl ? "rounded-md bg-white/85 p-2 ring-1 ring-white/70" : ""}>
                    <p className="text-[11px] font-extrabold text-[#5a6061]">赞助图片位</p>
                    <p className="mt-1 truncate text-2xl font-black leading-none text-[#202829]">{card.visualTitle || card.title}</p>
                    <p className="mt-2 truncate text-xs font-bold text-[#3e484a]">{card.visualMeta || copy.visualBody}</p>
                  </div>
                </div>
              </div>
              <div className="flex min-h-[112px] flex-col justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff7e8] px-2.5 py-1 text-[11px] font-extrabold text-[#7a541b]">
                      <Megaphone className="h-3.5 w-3.5" />
                      {copy.label}
                    </span>
                    <span className="text-[11px] font-bold text-[#7d8586]">页面最底部</span>
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold text-[#202829]">{card.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#5a6061]">{card.description}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2d3435]">
                  查看投放要求
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function footerSponsorVisualClass(tone: SponsorCreative["tone"]) {
  if (tone === "blue") return "bg-[#e8f1fa]";
  if (tone === "amber") return "bg-[#fff2dc]";
  return "bg-[#e8f3ec]";
}

function getPreviewCreatives(kind: SponsorPlacementKind): SponsorCreative[] {
  if (!showSponsorPreview && typeof window !== "undefined" && !isLocalPreviewHostname(window.location.hostname)) return [];
  if (kind === "listFooter") return defaultFooterSponsorCreatives;

  const copy = placementCopy[kind];
  return [{
    id: `${copy.id}-preview`,
    enabled: true,
    status: "live",
    title: copy.title,
    description: copy.body,
    targetUrl: "/commercial#slots",
    visualTitle: copy.visualTitle,
    visualMeta: copy.visualBody,
    tone: copy.tone,
  }];
}

function visualToneClass(tone: PlacementCopy["tone"]) {
  if (tone === "blue") return "bg-[#e8f1fa]";
  if (tone === "amber") return "bg-[#fff2dc]";
  return "bg-[#e8f3ec]";
}

function readDismissed(storageKey: string) {
  if (inMemoryDismissedKeys.has(storageKey)) return true;
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function useDismissedState(storageKey: string) {
  return useSyncExternalStore(
    subscribeToDismissChanges,
    () => readDismissed(storageKey),
    () => false,
  );
}

function subscribeToDismissChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(dismissEventName, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(dismissEventName, onStoreChange);
  };
}
