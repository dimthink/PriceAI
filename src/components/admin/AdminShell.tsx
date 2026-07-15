"use client";

import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useSyncExternalStore } from "react";

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

export function AdminShell({ sections, activeItemId, onSelectItem, children }: AdminShellProps) {
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getServerSidebarCollapsedSnapshot,
  );
  const activeSection = sections.find((section) => section.items.some((item) => item.id === activeItemId));
  const activeItem = activeSection?.items.find((item) => item.id === activeItemId);

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
    <div className={`grid gap-4 lg:gap-5 ${sidebarCollapsed ? "lg:grid-cols-[56px_minmax(0,1fr)]" : "lg:grid-cols-[264px_minmax(0,1fr)]"}`}>
      <aside className="lg:sticky lg:top-5 lg:self-start">
        <nav
          aria-label="后台分区导航"
          className={`rounded-lg border border-[#adb3b4]/20 bg-white shadow-[0_3px_8px_rgba(45,52,53,0.025)] ${sidebarCollapsed ? "lg:p-2" : "p-3"}`}
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
          <div className={`grid min-w-0 gap-3 md:grid-cols-2 lg:block ${sidebarCollapsed ? "lg:space-y-2" : "lg:space-y-4"}`}>
            {sections.map((section) => (
              <section key={section.id} className="min-w-0">
                <p className={`mb-1.5 px-2 text-[11px] font-semibold text-[#5a6061] ${sidebarCollapsed ? "lg:sr-only" : ""}`}>
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = item.id === activeItemId;
                    const countLabel = formatNavCount(item.count, sidebarCollapsed);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        title={item.description ? `${item.label}: ${item.description}` : item.label}
                        onClick={() => onSelectItem(item.id)}
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

      <section className="min-w-0">
        <div className="mb-3 flex min-h-12 flex-col gap-2 border-b border-[#adb3b4]/15 pb-3 sm:flex-row sm:items-center sm:justify-between">
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
        {children}
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
