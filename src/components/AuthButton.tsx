"use client";

import Link from "next/link";
import { CircleUserRound, LogOut, UserRoundPlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AccountUser } from "@/lib/account-client";
import { buildGoogleAuthHref, getBrowserAuthNextPath } from "@/lib/auth-paths";

type HeaderActionLabelFrom = "sm" | "2xl" | "never";

function getCompactButtonClassName(labelFrom: HeaderActionLabelFrom) {
  if (labelFrom === "never") return "h-10 w-10 gap-0 px-0";
  return labelFrom === "2xl"
    ? "h-9 w-9 gap-0 px-0 2xl:h-10 2xl:w-auto 2xl:gap-2 2xl:px-3"
    : "h-9 w-9 gap-0 px-0 sm:h-10 sm:w-auto sm:gap-2 sm:px-3";
}

function getLabelClassName(compact: boolean, labelFrom: HeaderActionLabelFrom) {
  if (!compact) return undefined;
  if (labelFrom === "never") return "hidden";
  return labelFrom === "2xl" ? "hidden 2xl:inline" : "hidden sm:inline";
}

function accountInitial(user: AccountUser): string {
  const source = user.displayName || user.email || "";
  const first = source.trim().charAt(0);
  return first ? first.toUpperCase() : "P";
}

function AccountMark({ user, size = 16 }: { user?: AccountUser | null; size?: number }) {
  if (user?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.avatarUrl} alt="" aria-hidden="true" className="h-[1.45em] w-[1.45em] rounded-full object-cover ring-1 ring-[#adb3b4]/30" referrerPolicy="no-referrer" />
    );
  }

  if (user) {
    return (
      <span
        aria-hidden="true"
        className="grid h-[1.35em] w-[1.35em] place-items-center rounded-full bg-[#e8f3ec] text-[0.62rem] font-bold leading-none text-[#2f7a4b] ring-1 ring-[#45bf78]/20"
      >
        {accountInitial(user)}
      </span>
    );
  }

  return <CircleUserRound size={size} />;
}

export function AuthButton({
  compact = false,
  labelFrom = "sm",
  user,
  loaded,
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
  user: AccountUser | null;
  loaded: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const labelClassName = getLabelClassName(compact, labelFrom);
  const baseClassName = `inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/45 ${
    compact ? getCompactButtonClassName(labelFrom) : "h-10 gap-2 px-3"
  }`;

  if (!loaded) {
    return (
      <div className={baseClassName} aria-hidden="true">
        <AccountMark size={16} />
        <span className={labelClassName}>账户</span>
      </div>
    );
  }

  if (!user) {
    return (
      <a href={buildGoogleAuthHref(getBrowserAuthNextPath())} className={baseClassName} aria-label="登录 PriceAI">
        <UserRoundPlus size={16} />
        <span className={labelClassName}>登录</span>
      </a>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className={baseClassName}
        aria-label="打开账户菜单"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <AccountMark user={user} size={16} />
        <span className={labelClassName}>账户</span>
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-56 rounded-lg bg-white p-2 opacity-100 shadow-[0_18px_50px_rgba(32,40,41,0.14)] ring-1 ring-[#adb3b4]/20"
        >
          <p className="truncate px-2 py-2 text-xs font-semibold text-[#5a6061]">{user.email || user.displayName || "已登录"}</p>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-2 py-2 text-sm font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/35"
          >
            账户中心
          </Link>
          <form action="/auth/signout" method="post" className="mt-1 border-t border-[#edf0f1] pt-1">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-[#7a2f28] transition hover:bg-[#fbe9e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b3328]/25"
            >
              <LogOut size={15} />
              退出登录
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
