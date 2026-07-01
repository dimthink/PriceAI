import type { ComponentProps } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type ActiveSection = ComponentProps<typeof SiteHeader>["activeSection"];

type RouteLoadingStateProps = {
  activeSection: ActiveSection;
  showTabs?: boolean;
  rowCount?: number;
  metricCount?: number;
  variant?: "table" | "article";
};

export function RouteLoadingState({
  activeSection,
  showTabs = true,
  rowCount = 6,
  metricCount = 4,
  variant = "table",
}: RouteLoadingStateProps) {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader activeSection={activeSection} />
        {showTabs ? <TabSkeleton /> : null}
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 md:py-10 lg:py-12">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <Skeleton className="h-10 w-[min(560px,78vw)] rounded-lg" />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="hidden h-4 w-44 rounded-full md:block" />
            </div>
            <Skeleton className="mt-5 hidden h-4 w-[min(780px,72vw)] rounded-full md:block" />
            <Skeleton className="mt-3 hidden h-4 w-[min(520px,60vw)] rounded-full md:block" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[520px]">
            {Array.from({ length: metricCount }).map((_, index) => (
              <div key={index} className="rounded-lg bg-white px-4 py-3 shadow-[0_12px_35px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
                <Skeleton className="h-3 w-14 rounded-full" />
                <Skeleton className="mt-3 h-7 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7 rounded-lg bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-11 w-full rounded-full md:w-[420px]" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-24 rounded-full" />
            </div>
          </div>
        </section>

        {variant === "article" ? <ArticleSkeleton rowCount={rowCount} /> : <TableSkeleton rowCount={rowCount} />}
      </main>
    </div>
  );
}

function TabSkeleton() {
  return (
    <section className="hidden border-y border-[#dfe4e5] py-2 md:block">
      <div className="mx-auto flex max-w-[1500px] gap-2 overflow-hidden px-8">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-full" />
        ))}
      </div>
    </section>
  );
}

function TableSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="hidden grid-cols-[150px_minmax(220px,1.4fr)_120px_120px_140px] gap-5 bg-[#f2f4f4] px-5 py-4 md:grid">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="h-3 w-14 rounded-full" />
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
      {Array.from({ length: rowCount }).map((_, index) => (
        <div key={index} className="grid gap-4 border-b border-[#edf0f1] px-5 py-5 last:border-b-0 md:grid-cols-[150px_minmax(220px,1.4fr)_120px_120px_140px] md:items-center">
          <Skeleton className="h-7 w-24 rounded-full" />
          <div>
            <Skeleton className="h-5 w-[min(360px,70vw)] rounded-full" />
            <Skeleton className="mt-3 h-4 w-[min(520px,58vw)] rounded-full" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      ))}
    </section>
  );
}

function ArticleSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <section className="mt-8 max-w-[900px] divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
      {Array.from({ length: rowCount }).map((_, index) => (
        <div key={index} className="py-5">
          <Skeleton className="h-5 w-[min(360px,74vw)] rounded-full" />
          <Skeleton className="mt-3 h-4 w-[min(760px,78vw)] rounded-full" />
          <Skeleton className="mt-2 h-4 w-[min(560px,66vw)] rounded-full" />
        </div>
      ))}
    </section>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-[#e4e9ea] ${className}`} />;
}
