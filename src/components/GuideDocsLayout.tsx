import type { ReactNode } from "react";
import { BookOpenText } from "lucide-react";
import Link from "next/link";
import { GuideMobileNav } from "@/components/GuideMobileNav";
import { GuidePageToc } from "@/components/GuidePageToc";
import { SiteHeader } from "@/components/SiteHeader";
import { guideCategories, guideEntries } from "@/lib/guides";

export function GuideDocsLayout({
  currentHref = "/guides",
  children,
}: {
  currentHref?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader activeSection="guides" />
      </div>

      <div className="mx-auto max-w-[1500px] px-5 pb-14 pt-4 sm:px-8 lg:pt-6">
        <div className="mb-5 lg:hidden">
          <GuideMobileNav currentHref={currentHref} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,940px)_240px]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
              <GuideSidebar currentHref={currentHref} />
            </div>
          </aside>

          <div className="min-w-0" data-guide-content>
            {children}
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <GuidePageToc />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function GuideSidebar({ currentHref }: { currentHref: string }) {
  return (
    <nav aria-label="指南目录" className="text-sm">
      <Link
        href="/guides"
        className={`flex h-10 items-center gap-2 rounded-md px-3 font-semibold transition ${
          currentHref === "/guides"
            ? "bg-[#2d3435] text-[#f8f8f8]"
            : "text-[#202829] hover:bg-[#edf0f1]"
        }`}
        aria-current={currentHref === "/guides" ? "page" : undefined}
      >
        <BookOpenText size={16} />
        指南总览
      </Link>

      <div className="mt-6 space-y-6">
        {guideCategories.map((category) => {
          const entries = guideEntries.filter((guide) => guide.categoryId === category.id);

          return (
            <section key={category.id}>
              <p className="px-3 text-[11px] font-bold text-[#7a8182]">{category.label}</p>
              <div className="ml-3 mt-2 space-y-0.5 border-l border-[#dfe4e5] pl-2">
                {entries.map((guide) => {
                  const active = guide.href === currentHref;

                  return (
                    <Link
                      key={guide.href}
                      href={guide.href}
                      className={`block rounded-md px-3 py-2 leading-5 transition ${
                        active
                          ? "bg-[#e8f3ec] font-semibold text-[#2f7a4b]"
                          : "text-[#5a6061] hover:bg-[#edf0f1] hover:text-[#202829]"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {guide.title}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </nav>
  );
}
