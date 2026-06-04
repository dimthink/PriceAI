import type { Metadata } from "next";
import { OfficialPricesExplorer } from "@/components/OfficialPricesExplorer";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "官方订阅地区价",
  description: "查看 ChatGPT、Claude、Gemini、Grok 在 Apple App Store 公开页面中的官方订阅地区价和人民币估算价。",
  alternates: {
    canonical: "/official-prices",
  },
  openGraph: {
    title: "PriceAI 官方订阅地区价",
    description: "用 App Store 公开价格做 AI 订阅官方地区价基准。",
    url: "https://priceai.cc/official-prices",
  },
};

export default function OfficialPricesPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader />
      </div>
      <OfficialPricesExplorer />
    </div>
  );
}
