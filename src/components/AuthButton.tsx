"use client";

import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type HeaderActionLabelFrom = "sm" | "2xl" | "never";
type AccountUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

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

export function AuthButton({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setUser(payload?.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const labelClassName = getLabelClassName(compact, labelFrom);
  const baseClassName = `inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
    compact ? getCompactButtonClassName(labelFrom) : "h-10 gap-2 px-3"
  }`;

  if (!loaded) {
    return (
      <div className={baseClassName} aria-hidden="true">
        <UserRound size={16} />
        <span className={labelClassName}>账户</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Link href="/login" className={baseClassName} aria-label="登录 PriceAI">
        <LogIn size={16} />
        <span className={labelClassName}>登录</span>
      </Link>
    );
  }

  return (
    <div className="group relative">
      <Link href="/account" className={baseClassName} aria-label="打开账户中心">
        <UserRound size={16} />
        <span className={labelClassName}>账户</span>
      </Link>
      <div className="invisible absolute right-0 top-full z-30 w-52 translate-y-2 rounded-lg bg-white p-2 opacity-0 shadow-[0_18px_50px_rgba(32,40,41,0.14)] ring-1 ring-[#adb3b4]/20 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <p className="truncate px-2 py-2 text-xs font-semibold text-[#5a6061]">{user.email || user.displayName || "已登录"}</p>
        <Link href="/account/feedback" className="block rounded-md px-2 py-2 text-sm font-semibold text-[#2d3435] hover:bg-[#f2f4f4]">
          我的反馈
        </Link>
        <Link href="/account/detector-reports" className="block rounded-md px-2 py-2 text-sm font-semibold text-[#2d3435] hover:bg-[#f2f4f4]">
          我的检测
        </Link>
        <form action="/auth/signout" method="post" className="mt-1 border-t border-[#edf0f1] pt-1">
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-[#7a2f28] hover:bg-[#fbe9e7]">
            <LogOut size={15} />
            退出登录
          </button>
        </form>
      </div>
    </div>
  );
}
