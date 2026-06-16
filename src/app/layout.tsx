import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { SiteNoticePrompt } from "@/components/SiteNoticePrompt";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import "./globals.css";

const themeInitScript = `
(function() {
  try {
    var root = document.documentElement;
    var isAdmin = window.location.pathname.indexOf('/admin') === 0;
    if (isAdmin) {
      root.dataset.theme = 'light';
      root.style.colorScheme = 'light';
      return;
    }
    var stored = window.localStorage.getItem('priceai-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL("https://priceai.cc"),
  title: {
    default: "PriceAI | AI 订阅与 API 购买前决策入口",
    template: "%s | PriceAI",
  },
  description: "购买 AI 订阅或接入 API 前，比较卡网订阅、官方订阅、官方 API 和中转 API 的价格、来源、库存和更新时间。",
  applicationName: "PriceAI",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PriceAI | AI 订阅与 API 购买前决策入口",
    description: "把卡网订阅、官方订阅、官方 API 和中转 API 整理成可搜索、可比较、可核验的购买前参考。",
    url: "https://priceai.cc",
    siteName: "PriceAI",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PriceAI | AI 订阅与 API 购买前决策入口",
    description: "查看 AI 订阅和 API 获取方式的价格、来源、库存和更新时间。",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="priceai-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <SiteNoticePrompt />
        <GoogleAnalytics />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
