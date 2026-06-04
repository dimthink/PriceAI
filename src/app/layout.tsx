import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://priceai.cc"),
  title: {
    default: "PriceAI | AI 订阅价格雷达",
    template: "%s | PriceAI",
  },
  description: "聚合 ChatGPT、Claude、Gemini、Grok、邮箱和 API/CDK 等 AI 订阅渠道报价，查看有货最低价、原始来源和更新时间。",
  applicationName: "PriceAI",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PriceAI | AI 订阅价格雷达",
    description: "把分散的 AI 会员渠道报价整理成可搜索、可比较、可核验的价格雷达。",
    url: "https://priceai.cc",
    siteName: "PriceAI",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PriceAI | AI 订阅价格雷达",
    description: "查看 AI 订阅渠道的有货最低价、原始来源和更新时间。",
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
        {children}
        <SpeedInsights />
        <GoogleAnalytics />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
