import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { BookOpenText, ShieldCheck } from "lucide-react";
import { GuidePromptStrip } from "@/components/GuidePromptStrip";
import { SiteHeader } from "@/components/SiteHeader";
import { TransitFamilyTabs } from "@/components/TransitFamilyTabs";
import { TransitSubmissionActions } from "@/components/TransitSubmissionDialog";
import { SponsoredPlacementPreview } from "@/components/SponsoredPlacementPreview";
import type { SponsorSettingsSummary } from "@/lib/sponsor-settings-shared";
import type { TransitModelFamily } from "@/data/api-transit/types";

type TransitFamilyOption = {
  id: TransitModelFamily;
  label: string;
};

type ApiTransitPageShellProps = {
  familyOptions: TransitFamilyOption[];
  title: ReactNode;
  meta: ReactNode;
  description: ReactNode;
  sponsorSettings: SponsorSettingsSummary | null;
  children: ReactNode;
};

export function ApiTransitPageShell({
  familyOptions,
  title,
  meta,
  description,
  sponsorSettings,
  children,
}: ApiTransitPageShellProps) {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
        <Suspense fallback={<TransitFamilyTabsFallback />}>
          <TransitFamilyTabs options={familyOptions} />
        </Suspense>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-4 pb-20 sm:py-7">
        <div className="mb-4 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[900px]">
            <h1 className="min-w-0 font-serif text-[1.4rem] font-semibold leading-8 tracking-normal text-[#202829] sm:text-2xl md:text-4xl">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium text-[#5a6061] md:gap-3">
              {meta}
            </div>
            <p className="mt-2 line-clamp-2 max-w-[860px] text-[0.82rem] leading-6 text-[#5a6061] sm:mt-2.5 sm:line-clamp-none sm:text-sm sm:leading-[1.8]">
              {description}
            </p>
            <ActionGroup className="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#47657a] sm:hidden" compactLabels />
          </div>
          <ActionGroup className="hidden w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:flex sm:w-auto" />
        </div>

        <GuidePromptStrip
          className="mb-5 hidden md:block"
          promptId="api-transit-usage-guides"
          label="使用前先看"
          links={[
            { label: "充值系数和综合倍率", href: "/guides/api-transit" },
            { label: "模型真假怎么判断", href: "/guides/api-transit" },
            { label: "为什么要小额试用", href: "/guides/api-transit" },
          ]}
          note="价格榜只做购买前参考，充值前仍要回原站确认余额、退款和售后规则。"
          ctaHref="/guides/api-transit"
          ctaLabel="中转指南"
        />

        <SponsoredPlacementPreview kind="apiTransit" settings={sponsorSettings} className="mb-5 hidden md:block" hideOnMobile />

        <Suspense fallback={<div className="py-12 text-center text-[#5a6061]">加载中...</div>}>
          {children}
        </Suspense>

        <Link
          href="/guides/api-transit"
          className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#202829] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#f5f7f7] md:hidden"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <BookOpenText className="h-4 w-4 shrink-0 text-[#47657a]" />
            <span className="truncate">充值系数、倍率与小额试用说明</span>
          </span>
          <span className="shrink-0 text-xs text-[#5a6061]">查看</span>
        </Link>
      </main>
    </div>
  );
}

function ActionGroup({
  className,
  compactLabels = false,
}: {
  className: string;
  compactLabels?: boolean;
}) {
  return (
    <div className={className}>
      <Link
        href="/api-transit/detector"
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#202829] px-2 text-[0.78rem] font-semibold text-white shadow-[0_12px_30px_rgba(45,52,53,0.08)] transition hover:bg-[#2d3435] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
      >
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {compactLabels ? (
          <>
            <span className="sm:hidden">检测</span>
            <span className="hidden sm:inline">模型检测</span>
          </>
        ) : (
          "模型检测"
        )}
      </Link>
      <Link
        href="/guides/api-transit"
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white px-2 text-[0.78rem] font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#f5f7f7] hover:text-[#202829] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
      >
        <BookOpenText className="h-4 w-4 shrink-0 text-[#5a6061]" />
        {compactLabels ? (
          <>
            <span className="sm:hidden">说明</span>
            <span className="hidden sm:inline">使用前说明</span>
          </>
        ) : (
          "使用前说明"
        )}
      </Link>
      <TransitSubmissionActions
        className="flex flex-wrap items-center gap-2.5"
        buttonSizeClassName="h-10 gap-1.5 px-2 text-[0.78rem] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
        compactLabels={compactLabels}
      />
    </div>
  );
}

function TransitFamilyTabsFallback() {
  return (
    <section className="border-y border-[#dfe4e5] py-2">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
        <div className="h-10" />
      </div>
    </section>
  );
}
