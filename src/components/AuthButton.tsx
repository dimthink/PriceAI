"use client";

import Link from "next/link";
import { CircleUserRound, UserRoundPlus } from "lucide-react";
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
    <Link href="/account" className={baseClassName} aria-label="账户中心">
      <AccountMark user={user} size={16} />
      <span className={labelClassName}>账户中心</span>
    </Link>
  );
}
