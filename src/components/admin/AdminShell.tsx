"use client";

import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

export type AdminNavItem = {
  id: string;
  label: string;
  count?: number | null;
  icon: ReactNode;
  description?: string;
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

type AdminShellProps = {
  sections: AdminNavSection[];
  activeItemId: string;
  onSelectItem: (itemId: string) => void;
  children: ReactNode;
};

const SIDEBAR_COLLAPSED_KEY = "priceai-admin-sidebar-collapsed";
const SIDEBAR_COLLAPSED_EVENT = "priceai-admin-sidebar-collapsed-change";
const SIDEBAR_SECTIONS_KEY = "priceai-admin-sidebar-expanded-sections";
const SIDEBAR_SECTIONS_EVENT = "priceai-admin-sidebar-expanded-sections-change";

export function AdminShell({ sections, activeItemId, onSelectItem, children }: AdminShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getServerSidebarCollapsedSnapshot,
  );
  const expandedSectionsSnapshot = useSyncExternalStore(
    subscribeExpandedSections,
    getExpandedSectionsSnapshot,
    getServerExpandedSectionsSnapshot,
  );
  const activeSection = sections.find((section) => section.items.some((item) => item.id === activeItemId));
  const activeItem = activeSection?.items.find((item) => item.id === activeItemId);
  const storedExpandedState = useMemo(
    () => parseExpandedSections(expandedSectionsSnapshot),
    [expandedSectionsSnapshot],
  );
  const expandedSectionIds = useMemo(() => {
    const next = new Set(
      storedExpandedState.expanded.filter((id) => sections.some((section) => section.id === id)),
    );
    if (!expandedSectionsSnapshot && activeSection) next.add(activeSection.id);
    if (storedExpandedState.activeItemId !== activeItemId && activeSection) next.add(activeSection.id);
    return next;
  }, [activeItemId, activeSection, expandedSectionsSnapshot, sections, storedExpandedState.activeItemId, storedExpandedState.expanded]);

  const toggleSection = useCallback((sectionId: string) => {
    const current = parseExpandedSections(getExpandedSectionsSnapshot());
    const next = new Set([...current.expanded, ...expandedSectionIds]);
    if (expandedSectionIds.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    writeExpandedSections({ expanded: Array.from(next), activeItemId });
  }, [activeItemId, expandedSectionIds]);

  const selectItem = useCallback((sectionId: string, itemId: string) => {
    const current = parseExpandedSections(getExpandedSectionsSnapshot());
    writeExpandedSections({ expanded: Array.from(new Set([...current.expanded, sectionId])), activeItemId: itemId });
    setMobileNavigationOpen(false);
    onSelectItem(itemId);
  }, [onSelectItem]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavigationOpen]);

  const toggleSidebarCollapsed = useCallback(() => {
    const nextValue = !getSidebarCollapsedSnapshot();
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextValue));
      window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_EVENT));
    } catch {
      // Ignore storage failures; the control should still work when storage is available again.
    }
  }, []);

  return (
    <div className={`grid gap-3 lg:h-[calc(100dvh-88px)] lg:min-h-0 lg:gap-5 ${sidebarCollapsed ? "lg:grid-cols-[56px_minmax(0,1fr)]" : "lg:grid-cols-[264px_minmax(0,1fr)]"}`}>
      {mobileNavigationOpen ? (
        <button
          type="button"
          aria-label="关闭后台导航"
          className="fixed inset-0 z-40 bg-[#202829]/35 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] p-3 transition-transform duration-200 ease-out lg:sticky lg:top-[72px] lg:z-auto lg:h-full lg:min-h-0 lg:w-auto lg:translate-x-0 lg:p-0 ${
          mobileNavigationOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav
          aria-label="后台分区导航"
          className={`flex h-full min-h-0 flex-col rounded-lg border border-[#adb3b4]/20 bg-white shadow-[0_12px_36px_rgba(45,52,53,0.16)] lg:shadow-[0_3px_8px_rgba(45,52,53,0.025)] ${sidebarCollapsed ? "lg:p-2" : "p-3"}`}
        >
          <div className={`mb-3 flex items-center border-b border-[#adb3b4]/15 pb-3 ${sidebarCollapsed ? "lg:justify-center" : "justify-between"}`}>
            <div className={sidebarCollapsed ? "lg:hidden" : ""}>
              <p className="text-sm font-semibold text-[#202829]">后台工作区</p>
              <p className="mt-0.5 text-xs text-[#5a6061]">按运营任务分组</p>
            </div>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[#adb3b4]/25 bg-white text-[#5a6061] transition-colors hover:bg-[#f2f4f4] hover:text-[#202829] focus:outline-none focus:ring-2 focus:ring-[#2d3435]/20 lg:inline-flex"
              aria-label={sidebarCollapsed ? "展开后台导航" : "收起后台导航"}
              title={sidebarCollapsed ? "展开导航" : "收起导航"}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileNavigationOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6061] transition-colors hover:bg-[#f2f4f4] hover:text-[#202829] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d3435]/20 lg:hidden"
              aria-label="关闭后台导航"
            >
              <X size={17} />
            </button>
          </div>
          <form action="/api/admin/logout" method="post" className={`mb-3 ${sidebarCollapsed ? "lg:flex lg:justify-center" : ""}`}>
            <button
              type="submit"
              className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#adb3b4]/25 bg-white text-xs font-medium text-[#5a6061] transition hover:bg-[#f2f4f4] hover:text-[#202829] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d3435]/20 ${sidebarCollapsed ? "h-9 w-9 px-0" : "w-full px-3"}`}
              aria-label="退出后台登录"
              title="退出后台登录"
            >
              <LogOut size={15} />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>退出后台</span>
            </button>
          </form>
          <div className={`min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5 lg:block lg:[scrollbar-gutter:stable] ${sidebarCollapsed ? "lg:space-y-2" : "lg:space-y-2"}`}>
            {sections.map((section) => (
              <section key={section.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={`mb-1 flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[11px] font-semibold text-[#5a6061] transition-colors hover:bg-[#f2f4f4] hover:text-[#202829] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d3435]/20 ${sidebarCollapsed ? "lg:hidden" : ""}`}
                  aria-expanded={expandedSectionIds.has(section.id)}
                  aria-controls={`admin-nav-section-${section.id}`}
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 transition-transform duration-200 ${expandedSectionIds.has(section.id) ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={`admin-nav-section-${section.id}`}
                  className={`space-y-1 ${expandedSectionIds.has(section.id) ? "block" : "hidden"} ${sidebarCollapsed ? "lg:block" : ""}`}
                >
                  {section.items.map((item) => {
                    const active = item.id === activeItemId;
                    const countLabel = formatNavCount(item.count, sidebarCollapsed);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        title={item.description ? `${item.label}: ${item.description}` : item.label}
                        onClick={() => selectItem(section.id, item.id)}
                        className={`group/nav relative flex min-h-10 w-full items-center gap-2 rounded-lg text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#2d3435]/20 ${
                          sidebarCollapsed ? "lg:justify-center lg:px-0 lg:py-2" : "px-2.5 py-2"
                        } ${
                          active
                            ? "bg-[#2d3435] text-[#f8f8f8]"
                            : "text-[#5a6061] hover:bg-[#f2f4f4] hover:text-[#202829]"
                        }`}
                      >
                        <span className={active ? "text-[#f8f8f8]" : "text-[#5a6061]"}>{item.icon}</span>
                        <span className={`min-w-0 flex-1 truncate font-medium ${sidebarCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                        {countLabel ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${sidebarCollapsed ? "lg:absolute lg:right-0.5 lg:top-0.5 lg:max-w-7 lg:truncate lg:px-1 lg:text-[10px]" : ""} ${
                              active ? "bg-white/15 text-[#f8f8f8]" : "bg-[#f2f4f4] text-[#2d3435]"
                            }`}
                          >
                            {countLabel}
                          </span>
                        ) : null}
                        {sidebarCollapsed ? (
                          <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 hidden w-max max-w-[220px] -translate-y-1/2 rounded-lg bg-[#202829] px-2.5 py-1.5 text-xs font-medium leading-5 text-white shadow-lg lg:group-hover/nav:block lg:group-focus-within/nav:block">
                            {item.label}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>
      </aside>

      <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
        <div className="sticky top-[53px] z-30 -mx-4 flex min-h-12 items-center gap-3 border-b border-[#adb3b4]/20 bg-[#f9f9f9]/95 px-4 py-2 backdrop-blur-[14px] sm:-mx-5 sm:px-5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavigationOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#adb3b4]/25 bg-white text-[#2d3435] transition-colors hover:bg-[#f2f4f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d3435]/20"
            aria-label="打开后台导航"
            aria-expanded={mobileNavigationOpen}
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            {activeSection ? <p className="truncate text-[11px] font-medium text-[#5a6061]">{activeSection.label}</p> : null}
            <h2 className="truncate text-sm font-semibold text-[#202829]">{activeItem?.label || "后台管理"}</h2>
          </div>
        </div>
        <div className="mb-3 hidden min-h-12 flex-col gap-2 border-b border-[#adb3b4]/15 pb-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
          <div className="min-w-0">
            {activeSection ? (
              <p className="text-xs font-medium text-[#5a6061]">{activeSection.label}</p>
            ) : null}
            <h2 className="mt-0.5 text-lg font-semibold text-[#202829]">{activeItem?.label || "后台管理"}</h2>
            {activeItem?.description ? (
              <p className="mt-0.5 max-w-4xl text-sm leading-5 text-[#5a6061]">{activeItem.description}</p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 pt-3 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:pt-0">{children}</div>
      </section>
    </div>
  );
}

function formatNavCount(count: number | null | undefined, compact: boolean): string | null {
  if (typeof count !== "number" || count <= 0) return null;
  if (compact && count > 99) return "99+";
  return String(count);
}

function getSidebarCollapsedSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSidebarCollapsedSnapshot(): boolean {
  return false;
}

function subscribeSidebarCollapsed(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_COLLAPSED_KEY) listener();
  };
  const handleLocalChange = () => listener();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_COLLAPSED_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, handleLocalChange);
  };
}

type ExpandedSectionsState = {
  expanded: string[];
  activeItemId: string;
};

function parseExpandedSections(value: string): ExpandedSectionsState {
  try {
    const parsed = JSON.parse(value) as Partial<ExpandedSectionsState>;
    return {
      expanded: Array.isArray(parsed.expanded) ? parsed.expanded.filter((id): id is string => typeof id === "string") : [],
      activeItemId: typeof parsed.activeItemId === "string" ? parsed.activeItemId : "",
    };
  } catch {
    return { expanded: [], activeItemId: "" };
  }
}

function getExpandedSectionsSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SIDEBAR_SECTIONS_KEY) || "";
  } catch {
    return "";
  }
}

function getServerExpandedSectionsSnapshot(): string {
  return "";
}

function subscribeExpandedSections(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_SECTIONS_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_SECTIONS_EVENT, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_SECTIONS_EVENT, listener);
  };
}

function writeExpandedSections(state: ExpandedSectionsState) {
  try {
    window.localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(SIDEBAR_SECTIONS_EVENT));
  } catch {
    // The accordion remains usable when storage is unavailable.
  }
}
