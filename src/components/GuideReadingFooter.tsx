import { ArrowRight, BookOpenText, CheckCircle2, ChevronLeft, ChevronRight, ListTree } from "lucide-react";
import Link from "next/link";
import {
  getGuideCategory,
  getGuideNavigationItems,
  getGuidePathStepEntry,
  getGuideReadingPathForGuide,
  getRelatedGuides,
} from "@/lib/guides";

export function GuideReadingFooter({ currentHref }: { currentHref: string }) {
  const relatedGuides = getRelatedGuides(currentHref, 3);
  const readingPath = getGuideReadingPathForGuide(currentHref);
  const navigationItems = getGuideNavigationItems(currentHref);

  return (
    <section data-guide-no-toc className="mt-12 border-t border-[#dfe4e5] pt-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(300px,0.42fr)]">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#e8f3ec] text-[#2f7a4b]">
            <ListTree size={18} />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold tracking-normal text-[#202829]">
            继续看指南，或回到比价工具。
          </h2>
          <p className="mt-3 max-w-[68ch] text-sm leading-7 text-[#5a6061]">
            指南负责把路径和风险讲清楚；比价工具负责查看当前可见的有货报价、来源和更新时间。
          </p>

          {readingPath ? (
            <div className="mt-6">
              <p className="text-xs font-semibold text-[#7a8182]">当前阅读路径</p>
              <h3 className="mt-2 font-semibold text-[#202829]">{readingPath.title}</h3>
              <div className="mt-4 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
                {readingPath.steps.map((step, index) => {
                  const guide = getGuidePathStepEntry(step);
                  const active = step.href === currentHref;

                  return (
                    <Link
                      key={step.href}
                      href={step.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex gap-3 py-3 transition ${
                        active
                          ? "text-[#202829]"
                          : "text-[#5a6061] hover:text-[#202829]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          active ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#edf0f1] text-[#5a6061]"
                        }`}
                      >
                        {active ? <CheckCircle2 size={14} /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#202829]">{guide?.title ?? step.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#5a6061]">{step.description}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <nav aria-label="指南连续阅读" className="mt-7 grid gap-2 border-y border-[#dfe4e5] py-3 sm:grid-cols-[1fr_auto_1fr]">
            <FooterNavLink direction="previous" item={navigationItems.previous} />
            <Link
              href="/guides"
              className="inline-flex min-h-12 items-center justify-center rounded-md px-3 text-sm font-semibold text-[#2d3435] transition hover:bg-[#edf0f1]"
            >
              指南目录
            </Link>
            <FooterNavLink direction="next" item={navigationItems.next} />
          </nav>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/?stock=available"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#edf0f1] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
            >
              查看有货报价
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#7a8182]">
            <BookOpenText size={15} />
            相关推荐
          </div>
          <div className="mt-4 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
            {relatedGuides.map((guide) => {
              const category = getGuideCategory(guide.categoryId);

              return (
                <Link
                  key={guide.href}
                  href={guide.href}
                  className="group block py-4 transition hover:text-[#202829]"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-6 items-center rounded-md bg-[#e8f3ec] px-2.5 text-xs font-semibold text-[#2f7a4b]">
                      {category?.label ?? "指南"}
                    </span>
                    <span className="text-xs text-[#5a6061]">{guide.intent}</span>
                  </span>
                  <span className="mt-2 block font-semibold text-[#202829]">{guide.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-[#5a6061]">{guide.description}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2d3435]">
                    继续阅读
                    <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterNavLink({
  direction,
  item,
}: {
  direction: "previous" | "next";
  item: ReturnType<typeof getGuideNavigationItems>["previous"];
}) {
  const isPrevious = direction === "previous";
  const label = isPrevious ? "上一篇" : "下一篇";

  if (!item) {
    return (
      <span
        aria-disabled="true"
        className={`inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-sm text-[#9aa1a2] ${
          isPrevious ? "justify-start" : "justify-start sm:justify-end"
        }`}
      >
        {isPrevious ? <ChevronLeft size={16} /> : null}
        <span>{label}</span>
        {!isPrevious ? <ChevronRight size={16} /> : null}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={`group inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#202829] transition hover:bg-[#edf0f1] ${
        isPrevious ? "justify-start" : "justify-start sm:justify-end"
      }`}
    >
      {isPrevious ? <ChevronLeft size={16} className="shrink-0 transition group-hover:-translate-x-0.5" /> : null}
      <span className={isPrevious ? "min-w-0" : "min-w-0 sm:text-right"}>
        <span className="block text-xs font-semibold text-[#7a8182]">{label}</span>
        <span className="mt-0.5 block truncate">{item.label}</span>
      </span>
      {!isPrevious ? <ChevronRight size={16} className="shrink-0 transition group-hover:translate-x-0.5" /> : null}
    </Link>
  );
}
