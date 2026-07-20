import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalSponsorPlacements } from "@/components/GlobalSponsorPlacements";
import { GlobalSiteFooter } from "@/components/GlobalSiteFooter";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { QQGroupAutoPrompt } from "@/components/QQGroupAutoPrompt";
import { SiteNoticePrompt } from "@/components/SiteNoticePrompt";
import { SupportNudgePrompt } from "@/components/SupportNudgePrompt";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://priceai.cc"),
  title: {
    default: "PriceAI | AI 低价卡网订阅与中转 API 比价雷达",
    template: "%s | PriceAI",
  },
  description: "购买 AI 订阅或接入 API 前，比较卡网订阅、官方订阅、官方 API 和中转 API 的价格、来源、库存和更新时间。",
  applicationName: "PriceAI",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PriceAI | AI 低价卡网订阅与中转 API 比价雷达",
    description: "把卡网订阅、官方订阅、官方 API 和中转 API 整理成可搜索、可比较、可核验的购买前参考。",
    url: "https://priceai.cc",
    siteName: "PriceAI",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PriceAI | AI 低价卡网订阅与中转 API 比价雷达",
    description: "查看 AI 订阅和 API 获取方式的价格、来源、库存和更新时间。",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
  other: {
    "impact-site-verification": "5194cee0-23c8-4dc2-94e8-1a968cb8f93e",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script id="priceai-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <GlobalSponsorPlacements>
          {children}
          <GlobalSiteFooter />
        </GlobalSponsorPlacements>
        <SiteNoticePrompt />
        <SupportNudgePrompt />
        <Suspense fallback={null}>
          <QQGroupAutoPrompt />
        </Suspense>
        <GoogleAnalytics />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
