"use client";

import { BookOpenText, Handshake, HeartHandshake, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supportPagePath } from "@/lib/support";

type FooterLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const footerLinks: readonly FooterLink[] = [
  {
    label: "入门指南",
    href: "/guides",
    icon: BookOpenText,
  },
  {
    label: "商业合作",
    href: "/commercial",
    icon: Handshake,
  },
  {
    label: "支持作者",
    href: supportPagePath,
    icon: HeartHandshake,
  },
] as const;

export function GlobalSiteFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-[var(--color-page)] px-5 pb-2 pt-3 sm:px-8 sm:pb-3 sm:pt-4" aria-label="PriceAI 站点入口">
      <div className="mx-auto max-w-[1500px] border-t border-[var(--color-border-soft)] pt-2 sm:pt-3">
        <p className="mx-auto max-w-[72ch] text-center text-[11px] leading-4 text-[var(--color-text-soft)] sm:text-xs sm:leading-5">
          PriceAI 只整理公开信息，不售卖、不代下单；赞助与合作明确标注，不影响自然排序。
        </p>

        <nav
          className="mt-1.5 flex min-h-10 flex-wrap items-center justify-center gap-1.5 border-y border-[var(--color-border-soft)] px-1 py-1 text-[11px] text-[var(--color-text-soft)] sm:mt-2 sm:min-h-11 sm:gap-2 sm:px-2 sm:py-2 sm:text-sm"
          aria-label="站点底部导航"
        >
          {footerLinks.map((item) => {
            const Icon = item.icon;
            const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)] sm:min-h-9 sm:px-3 ${
                  isCurrent
                    ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                }`}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 sm:h-6 sm:w-6 ${
                    isCurrent
                      ? "bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-[var(--color-border-muted)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-soft)] ring-[var(--color-border-soft)]"
                  }`}
                >
                  <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
