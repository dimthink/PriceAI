"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { githubRepoUrl, supportPagePath } from "@/lib/support";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

const footerLinks: readonly FooterLink[] = [
  {
    label: "入门指南",
    href: "/guides",
  },
  {
    label: "商业合作",
    href: "/commercial",
  },
  {
    label: "支持作者",
    href: supportPagePath,
  },
  {
    label: "边界与披露",
    href: "/about",
  },
  {
    label: "GitHub",
    href: githubRepoUrl,
    external: true,
  },
] as const;

export function GlobalSiteFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-[var(--color-page)] px-5 pb-2 pt-3 sm:px-8 sm:pb-3 sm:pt-4" aria-label="PriceAI 站点入口">
      <div className="mx-auto max-w-[1500px] border-t border-[var(--color-border-soft)] pt-2 sm:pt-3">
        <p className="mx-auto max-w-[72ch] text-center text-[11px] leading-4 text-[var(--color-text-soft)] sm:text-xs sm:leading-5">
          价格仅供参考，实际价格、库存和售后规则以原平台为准。本工具不构成购买建议。
        </p>

        <nav
          className="mt-1.5 flex min-h-10 flex-wrap items-center justify-center gap-x-1.5 gap-y-0 border-y border-[var(--color-border-soft)] px-1 py-1 text-[11px] text-[var(--color-text-soft)] sm:mt-2 sm:min-h-11 sm:gap-x-3 sm:gap-y-1 sm:px-2 sm:py-2 sm:text-sm"
          aria-label="站点底部导航"
        >
          <Link
            href="/"
            className="inline-flex min-h-7 items-center rounded-md px-1.5 font-serif font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)] sm:min-h-8 sm:px-2"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            PriceAI
          </Link>

          {footerLinks.map((item) => {
            const isCurrent = !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));

            return (
              <Fragment key={item.href}>
                <span className="hidden text-[var(--color-border-muted)] sm:inline" aria-hidden="true">
                  /
                </span>
                <Link
                  href={item.href}
                  className="inline-flex min-h-7 items-center rounded-md px-1.5 font-semibold text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)] sm:min-h-8 sm:px-2"
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </Fragment>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
