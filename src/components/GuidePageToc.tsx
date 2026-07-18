"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type TocItem = {
  id: string;
  label: string;
};

export function GuidePageToc() {
  const pathname = usePathname();
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;

    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      const content = document.querySelector<HTMLElement>("[data-guide-content]");
      if (!content) {
        setItems([]);
        setActiveId("");
        return;
      }

      const headings = Array.from(content.querySelectorAll<HTMLHeadingElement>("h2")).filter(
        (heading) => Boolean(heading.textContent?.trim()) && !heading.closest("[data-guide-no-toc]"),
      );
      const usedIds = new Set<string>();

      const nextItems = headings.map((heading, index) => {
        const label = heading.dataset.guideTocLabel?.trim() || heading.textContent?.trim() || "";
        const sectionNumber = heading.dataset.guideSectionNumber;
        const baseId = heading.id || toAnchorId(label) || `section-${index + 1}`;
        let id = baseId;
        let suffix = 2;

        while (usedIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }

        usedIds.add(id);
        heading.id = id;

        return {
          id,
          label: sectionNumber ? `${sectionNumber}. ${label}` : label,
        } satisfies TocItem;
      });

      setItems(nextItems);
      setActiveId(nextItems[0]?.id ?? "");

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

          if (visible?.target.id) {
            setActiveId(visible.target.id);
          }
        },
        {
          rootMargin: "-96px 0px -68% 0px",
          threshold: [0, 1],
        },
      );

      headings.forEach((heading) => observer?.observe(heading));
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathname]);

  return (
    <nav aria-label="本文目录" className="border-l border-[#dfe4e5] pl-4">
      <p className="text-xs font-bold tracking-[0.04em] text-[#5a6061]">本文目录</p>
      {items.length ? (
        <div className="mt-3 space-y-0.5">
          {items.map((item) => {
            const active = activeId === item.id;

            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`block rounded-md px-2 py-1.5 text-sm leading-5 transition ${
                  active ? "font-semibold text-[#2f7a4b]" : "text-[#5a6061] hover:bg-[#edf0f1] hover:text-[#202829]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#7a8182]">当前页面暂无可跳转目录。</p>
      )}
    </nav>
  );
}

function toAnchorId(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
