"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { CircleUserRound, ExternalLink, Handshake, HeartHandshake, LogIn, Menu, MessageCircle, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppLogo } from "@/components/AppLogo";
import { AuthButton } from "@/components/AuthButton";
import { FeedbackDialog, FeedbackLink, GitHubLink, QQGroupDialog, QQGroupLink, TelegramLink } from "@/components/FeedbackLink";
import { IntentPrefetchLink } from "@/components/IntentPrefetchLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AccountUser } from "@/lib/account-client";
import { useAccountUser } from "@/lib/account-client";
import { buildGoogleAuthHref, getBrowserAuthNextPath } from "@/lib/auth-paths";
import { useCommunitySettings } from "@/lib/community-settings-client";
import type { CommunitySettingsSummary } from "@/lib/community-settings-shared";
import { supportPagePath } from "@/lib/support";
import { useDialogFocus } from "@/lib/use-dialog-focus";

const navItems = [
  { key: "channels", href: "/channels", label: "卡网订阅", mobileLabel: "卡网", match: (pathname: string) => pathname.startsWith("/channels") || pathname.startsWith("/products") },
  { key: "official", href: "/official-prices", label: "官方订阅", mobileLabel: "订阅", match: (pathname: string) => pathname.startsWith("/official-prices") },
  { key: "api", href: "/official-api", label: "官方 API", mobileLabel: "API", match: (pathname: string) => pathname.startsWith("/official-api") },
  { key: "transit", href: "/api-transit", label: "中转 API", mobileLabel: "中转", match: (pathname: string) => pathname.startsWith("/api-transit") },
];

type SiteHeaderSection = (typeof navItems)[number]["key"] | "home" | "guides" | "support" | "wholesale";
const homeHref = "/?home=1";
const githubUrl = "https://github.com/physics-dimension/PriceAI";

export function SiteHeader({
  maxWidthClassName = "max-w-[1500px]",
  logoCompact = false,
  activeSection,
  compactActionLabelFrom = "never",
}: {
  maxWidthClassName?: string;
  logoCompact?: boolean;
  activeSection?: SiteHeaderSection;
  compactActionLabelFrom?: "sm" | "2xl" | "never";
}) {
  const pathname = usePathname();
  const supportActive = pathname.startsWith(supportPagePath);
  const wholesaleActive = activeSection === "wholesale" || pathname.startsWith("/wholesale");
  const desktopCenterNavClassName = "hidden items-center rounded-full bg-[#e4e9ea] p-1 text-sm font-semibold text-[#5a6061] min-[720px]:flex";
  const actionGroupGapClassName =
    compactActionLabelFrom === "never" ? "gap-1.5" : compactActionLabelFrom === "2xl" ? "gap-1.5 2xl:gap-3" : "gap-1.5 sm:gap-3";
  const activeNavItem = navItems.find((item) => (activeSection && activeSection !== "home" && activeSection !== "guides" ? item.key === activeSection : item.match(pathname)));
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [qqGroupOpen, setQqGroupOpen] = useState(false);
  const communitySettings = useCommunitySettings();
  const { user: accountUser, loaded: accountLoaded } = useAccountUser();

  return (
    <header>
      <div className={`relative mx-auto grid ${maxWidthClassName} grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2.5 sm:px-8 min-[720px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[720px]:gap-4 min-[720px]:py-4`}>
        <div className="relative z-10 flex min-w-0 items-center gap-2 justify-self-start min-[720px]:col-start-1">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:bg-[#f5f7f7] hover:text-[#202829] min-[720px]:hidden"
            aria-label="打开模块导航"
            aria-haspopup="dialog"
          >
            <Menu size={18} />
          </button>
          <IntentPrefetchLink href={homeHref} aria-label="PriceAI 首页" className="inline-flex min-h-11 min-w-0 shrink-0 items-center">
            <AppLogo compact={logoCompact} />
          </IntentPrefetchLink>
        </div>

        <nav className={`${desktopCenterNavClassName} max-w-full justify-self-center overflow-x-auto min-[720px]:col-start-2 xl:absolute xl:left-1/2 xl:top-1/2 xl:col-start-1 xl:col-end-4 xl:-translate-x-1/2 xl:-translate-y-1/2`}>
          {navItems.map((item) => {
            const active = activeSection ? item.key === activeSection : item.match(pathname);

            return (
              <IntentPrefetchLink
                key={item.href}
                href={item.href}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-full px-3 transition xl:px-4 ${
                  active
                    ? "bg-[#2d3435] text-[#f8f8f8] shadow-[0_10px_30px_rgba(45,52,53,0.10)]"
                    : "hover:bg-[#edf0f1] hover:text-[#202829]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </IntentPrefetchLink>
            );
          })}
        </nav>

        <div className="relative z-10 flex min-w-0 items-center justify-end justify-self-end gap-1.5 min-[720px]:hidden">
          <ThemeToggle compact labelFrom="never" />
        </div>

        <div className={`relative z-10 hidden min-w-0 items-center justify-end justify-self-end min-[720px]:col-start-3 min-[720px]:flex ${actionGroupGapClassName}`}>
          <IntentPrefetchLink
            href="/wholesale"
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${
              wholesaleActive
                ? "bg-[#2d3435] text-[#f8f8f8] shadow-[0_10px_30px_rgba(45,52,53,0.10)]"
                : "bg-white text-[#2d3435] ring-1 ring-[#adb3b4]/25 hover:bg-[#f5f7f7]"
            }`}
            aria-current={wholesaleActive ? "page" : undefined}
            aria-label="批发合作"
            title="批发合作"
          >
            <Handshake size={16} />
            <span className={compactActionLabelFrom === "sm" ? "hidden sm:inline" : "hidden xl:inline"}>
              批发合作
            </span>
          </IntentPrefetchLink>
          <ThemeToggle compact labelFrom={compactActionLabelFrom} />
          <FeedbackLink compact labelFrom={compactActionLabelFrom} />
          <QQGroupLink compact labelFrom={compactActionLabelFrom} />
          <TelegramLink compact labelFrom={compactActionLabelFrom} />
          <GitHubLink compact labelFrom={compactActionLabelFrom} />
          <AuthButton compact labelFrom={compactActionLabelFrom} user={accountUser} loaded={accountLoaded} />
        </div>
      </div>

      {mobileDrawerOpen ? (
        <MobileModuleDrawer
          activeKey={activeNavItem?.key}
          supportActive={supportActive}
          wholesaleActive={wholesaleActive}
          accountUser={accountUser}
          accountLoaded={accountLoaded}
          onClose={() => setMobileDrawerOpen(false)}
          onFeedback={() => {
            setMobileDrawerOpen(false);
            setFeedbackOpen(true);
          }}
          onQQGroup={() => {
            setMobileDrawerOpen(false);
            setQqGroupOpen(true);
          }}
          communitySettings={communitySettings}
        />
      ) : null}
      {feedbackOpen ? <FeedbackDialog onClose={() => setFeedbackOpen(false)} /> : null}
      {qqGroupOpen ? <QQGroupDialog settings={communitySettings} onClose={() => setQqGroupOpen(false)} /> : null}
    </header>
  );
}

function MobileModuleDrawer({
  activeKey,
  supportActive,
  wholesaleActive,
  accountUser,
  accountLoaded,
  onClose,
  onFeedback,
  onQQGroup,
  communitySettings,
}: {
  activeKey?: (typeof navItems)[number]["key"];
  supportActive: boolean;
  wholesaleActive: boolean;
  accountUser: AccountUser | null;
  accountLoaded: boolean;
  onClose: () => void;
  onFeedback: () => void;
  onQQGroup: () => void;
  communitySettings: CommunitySettingsSummary;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus({ dialogRef, onClose });

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-[var(--color-overlay)] backdrop-blur-sm min-[720px]:hidden"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialogRef}
        className="flex h-full w-[min(80vw,312px)] flex-col bg-[var(--color-panel)] px-3 py-4 shadow-[var(--shadow-floating)] ring-1 ring-[var(--color-border-soft)]"
        role="dialog"
        aria-modal="true"
        aria-label="模块导航"
        tabIndex={-1}
      >
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <IntentPrefetchLink href={homeHref} aria-label="PriceAI 首页" className="min-w-0 shrink-0" onClick={onClose}>
            <AppLogo compact />
          </IntentPrefetchLink>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="关闭模块导航"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="space-y-1" aria-label="移动端模块导航">
          {navItems.map((item) => {
            const active = item.key === activeKey;

            return (
              <IntentPrefetchLink
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
                {active ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden="true" /> : null}
              </IntentPrefetchLink>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-[var(--color-border-soft)] pt-3">
          <div className="space-y-1">
            <MobileAccountLinks user={accountUser} loaded={accountLoaded} onClose={onClose} />
            <IntentPrefetchLink
              href="/wholesale"
              onClick={onClose}
              className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold transition ${
                wholesaleActive
                  ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)]"
              }`}
              aria-current={wholesaleActive ? "page" : undefined}
            >
              <span className="inline-flex items-center gap-3">
                <Handshake size={17} />
                批发合作
              </span>
              {wholesaleActive ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden="true" /> : null}
            </IntentPrefetchLink>
            <IntentPrefetchLink
              href={supportPagePath}
              onClick={onClose}
              className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold transition ${
                supportActive
                  ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)]"
              }`}
              aria-current={supportActive ? "page" : undefined}
            >
              <span className="inline-flex items-center gap-3">
                <HeartHandshake size={17} />
                支持作者
              </span>
              {supportActive ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden="true" /> : null}
            </IntentPrefetchLink>
            <button
              type="button"
              onClick={onFeedback}
              className="flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-surface-hover)]"
            >
              <span className="inline-flex items-center gap-3">
                <MessageCircle size={17} />
                意见反馈
              </span>
            </button>
            {communitySettings.qqGroupEnabled ? (
              <button
                type="button"
                onClick={onQQGroup}
                className="flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-surface-hover)]"
                title={`QQ 群：${communitySettings.qqGroupNumber}`}
              >
                <span className="inline-flex items-center gap-3">
                  <Image src="/brand-icons/qq.svg" alt="" aria-hidden="true" width={18} height={18} className="h-[18px] w-[18px] shrink-0 object-contain" />
                  QQ 交流群
                </span>
              </button>
            ) : null}
            {communitySettings.telegramEnabled ? (
              <a
                href={communitySettings.telegramUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-surface-hover)]"
                onClick={onClose}
              >
                <span className="inline-flex items-center gap-3">
                  <Image src="/brand-icons/telegram.svg" alt="" aria-hidden="true" width={18} height={18} className="h-[18px] w-[18px] shrink-0 object-contain" />
                  Telegram 交流群
                </span>
                <ExternalLink size={14} className="text-[var(--color-text-soft)]" />
              </a>
            ) : null}
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-surface-hover)]"
              onClick={onClose}
            >
              <span className="inline-flex items-center gap-3">
                <Image src="/brand-icons/github.svg" alt="" aria-hidden="true" width={18} height={18} className="h-[18px] w-[18px] shrink-0 object-contain" />
                GitHub 开源
              </span>
              <ExternalLink size={14} className="text-[var(--color-text-soft)]" />
            </a>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function MobileAccountLinks({
  user,
  loaded,
  onClose,
}: {
  user: AccountUser | null;
  loaded: boolean;
  onClose: () => void;
}) {
  const rowClassName =
    "flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold text-[var(--color-text-body)] transition hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/35";

  if (!loaded) {
    return (
      <div className="flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold text-[var(--color-text-soft)]" aria-live="polite">
        <span className="inline-flex items-center gap-3">
          <CircleUserRound size={17} />
          读取账户状态
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <a href={buildGoogleAuthHref(getBrowserAuthNextPath())} onClick={onClose} className={rowClassName}>
        <span className="inline-flex items-center gap-3">
          <LogIn size={17} />
          登录
        </span>
      </a>
    );
  }

  return (
    <IntentPrefetchLink href="/account" onClick={onClose} className={rowClassName}>
      <span className="inline-flex items-center gap-3">
        <UserRound size={17} />
        账户中心
      </span>
    </IntentPrefetchLink>
  );
}
