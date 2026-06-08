"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpenText, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import {
  getGuideCategory,
  guideCategories,
  guideEntries,
} from "@/lib/guides";

export function GuideMobileNav({ currentHref }: { currentHref: string }) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const touchStart = useRef<{ x: number; y: number; mode: "edge-open" | "drawer-close" } | null>(null);
  const currentGuide = guideEntries.find((guide) => guide.href === currentHref);
  const currentCategory = currentGuide ? getGuideCategory(currentGuide.categoryId) : undefined;

  function handleSwipeEnd(touch: { clientX: number; clientY: number } | undefined) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const mostlyHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.4 && Math.abs(deltaY) < 70;

    if (!mostlyHorizontal) return;
    if (start.mode === "edge-open" && deltaX > 64) setOpen(true);
    if (start.mode === "drawer-close" && deltaX < -64) setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) return;

    const startEdgeSwipe = (x: number, y: number) => {
      if (x > 28) return;
      touchStart.current = { x, y, mode: "edge-open" };
    };

    const handleWindowTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startEdgeSwipe(touch.clientX, touch.clientY);
    };

    const handleWindowTouchEnd = (event: TouchEvent) => {
      handleSwipeEnd(event.changedTouches[0]);
    };

    const handleWindowPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.buttons !== 1) return;
      startEdgeSwipe(event.clientX, event.clientY);
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      handleSwipeEnd(event);
    };

    window.addEventListener("touchstart", handleWindowTouchStart, { passive: true });
    window.addEventListener("touchend", handleWindowTouchEnd, { passive: true });
    window.addEventListener("pointerdown", handleWindowPointerDown, { passive: true });
    window.addEventListener("pointerup", handleWindowPointerUp, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleWindowTouchStart);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [open]);

  function handleDrawerTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY, mode: "drawer-close" };
  }

  function handleDrawerTouchEnd(event: React.TouchEvent<HTMLElement>) {
    handleSwipeEnd(event.changedTouches[0]);
  }

  return (
    <>
      <nav aria-label="移动端指南导航" className="border-y border-[#dfe4e5] bg-[#f9f9f9] py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[#2d3435] px-3 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
            aria-expanded={open}
            aria-controls={drawerId}
          >
            <Menu size={16} />
            菜单
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[#7a8182]">
              <span>指南</span>
              {currentCategory ? (
                <>
                  <ChevronRight size={13} className="shrink-0" />
                  <span className="truncate">{currentCategory.label}</span>
                </>
              ) : null}
            </div>
            <p className="mt-1 truncate text-sm font-bold text-[#202829]">{currentGuide?.title ?? "指南总览"}</p>
          </div>
          <Link
            href="/guides"
            className="inline-flex h-10 shrink-0 items-center rounded-md bg-[#edf0f1] px-3 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            总览
          </Link>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="关闭指南菜单"
            className="absolute inset-0 bg-[#202829]/28"
            onClick={() => setOpen(false)}
          />
          <aside
            id={drawerId}
            className="relative h-full w-[min(88vw,360px)] overflow-y-auto border-r border-[#dfe4e5] bg-[#f9f9f9] px-5 py-4 shadow-[18px_0_55px_rgba(45,52,53,0.16)]"
            aria-label="指南菜单"
            onTouchStart={handleDrawerTouchStart}
            onTouchEnd={handleDrawerTouchEnd}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <BookOpenText size={18} className="shrink-0 text-[#2f7a4b]" />
                <p className="truncate text-sm font-bold text-[#202829]">PriceAI 指南</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#edf0f1] text-[#2d3435] transition hover:bg-[#dde4e5]"
                aria-label="关闭菜单"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-5">
              <Link
                href="/guides"
                onClick={() => setOpen(false)}
                className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
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
                              onClick={() => setOpen(false)}
                              className={`block rounded-md px-3 py-2 text-sm leading-5 transition ${
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
            </div>
          </aside>
        </div>
      ) : null}

    </>
  );
}
