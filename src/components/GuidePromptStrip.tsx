import { ArrowRight, BookOpenText } from "lucide-react";
import Link from "next/link";

type GuidePromptLink = {
  label: string;
  href: string;
};

export function GuidePromptStrip({
  label = "买前指南",
  links,
  note,
  ctaHref = "/guides",
  ctaLabel = "查看指南",
  className = "",
}: {
  label?: string;
  links: GuidePromptLink[];
  note?: string;
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg bg-white px-4 py-3 shadow-[0_14px_42px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15 ${className}`}
      aria-label={label}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#5a6061]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-semibold text-[#47657a]">
            <BookOpenText className="h-[15px] w-[15px]" />
            {label}
          </span>
          {links.map((link, index) => (
            <span key={`${link.href}-${index}`} className="inline-flex min-w-0 items-center gap-3">
              {index > 0 ? <span className="h-1 w-1 shrink-0 rounded-full bg-[#adb3b4]" aria-hidden="true" /> : null}
              <Link href={link.href} className="font-semibold text-[#202829] transition hover:text-[#2f7a4b]">
                {link.label}
              </Link>
            </span>
          ))}
          {note ? (
            <>
              <span className="hidden h-1 w-1 shrink-0 rounded-full bg-[#adb3b4] sm:inline-block" aria-hidden="true" />
              <span className="text-xs text-[#5a6061]">{note}</span>
            </>
          ) : null}
        </div>
        <Link
          href={ctaHref}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
        >
          {ctaLabel}
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
