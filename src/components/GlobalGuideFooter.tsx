"use client";

import { ArrowRight, BookOpenText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function GlobalGuideFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-[var(--color-page)] px-5 pb-8 pt-4 sm:px-8" aria-label="入门指南入口">
      <div className="mx-auto max-w-[1500px] border-t border-[var(--color-border-soft)] pt-5">
        <Link
          href="/guides"
          className="group mx-auto flex max-w-3xl flex-col gap-3 rounded-lg bg-[var(--color-panel)] px-4 py-4 text-left ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)] hover:ring-[var(--color-border-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-info-text)] ring-1 ring-[var(--color-border-soft)]">
              <BookOpenText size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--color-text-primary)]">第一次使用 PriceAI？先看入门指南</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">
                用几分钟分清官方订阅、卡网订阅、官方 API 和中转 API。
              </span>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            进入
            <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </footer>
  );
}
