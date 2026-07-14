"use client";

import { ArrowRight, BookOpenText, Handshake, HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supportPagePath } from "@/lib/support";

const footerLinks = [
  {
    title: "第一次使用 PriceAI？",
    body: "先分清官方订阅、卡网订阅、官方 API 和中转 API。",
    href: "/guides",
    label: "看入门指南",
    icon: BookOpenText,
  },
  {
    title: "赞助位与商业合作",
    body: "适合云服务、开发者工具和 API 周边服务做清晰标注的展示。",
    href: "/commercial",
    label: "查看合作方式",
    icon: Handshake,
  },
  {
    title: "支持 PriceAI 继续维护",
    body: "GitHub Star、爱发电或 Ko-fi；个人支持不影响排序和风险提示。",
    href: supportPagePath,
    label: "支持作者",
    icon: HeartHandshake,
  },
] as const;

export function GlobalSiteFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="bg-[var(--color-page)] px-5 pb-5 pt-5 sm:px-8" aria-label="PriceAI 站点入口">
      <div className="mx-auto grid max-w-[1500px] gap-5 border-t border-[var(--color-border-soft)] pt-6 lg:grid-cols-[minmax(240px,0.65fr)_minmax(0,1fr)] lg:items-start">
        <section className="min-w-0">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">PriceAI 是购买前参考工具。</h2>
          <p className="mt-2 max-w-[58ch] text-sm leading-7 text-[var(--color-text-muted)]">
            本站不卖货、不担保；赞助与商业合作会明确标注，不影响价格、库存、排序和风险提示。
          </p>
        </section>

        <nav className="grid gap-2 md:grid-cols-3" aria-label="站点底部导航">
          {footerLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-[132px] flex-col justify-between rounded-lg bg-[var(--color-panel)] p-4 ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)] hover:ring-[var(--color-border-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
              >
                <span>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-info-text)] ring-1 ring-[var(--color-border-soft)]">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{item.title}</span>
                  <span className="mt-1.5 block text-xs leading-5 text-[var(--color-text-muted)]">{item.body}</span>
                </span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
                  {item.label}
                  <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
