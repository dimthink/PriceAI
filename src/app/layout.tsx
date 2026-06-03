import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { UmamiAnalytics } from "@/components/UmamiAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 比价雷达",
  description: "AI 订阅卡网报价聚合与半自动采集工具",
  applicationName: "PriceAI",
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
        <GoogleAnalytics />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
