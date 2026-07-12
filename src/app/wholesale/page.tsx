import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { WholesaleIntakeForm } from "@/components/WholesaleIntakeForm";

export const metadata: Metadata = {
  title: "批发合作",
  description:
    "PriceAI 批发合作入口用于收集 API 中转、卡网订阅渠道和其他源头的买方需求与源头供给线索。",
  alternates: { canonical: "/wholesale" },
  openGraph: {
    title: "批发合作 | PriceAI",
    description: "提交批量采购需求或源头供给信息，PriceAI 先做线索记录和人工核验。",
  },
};

export const revalidate = 3600;

export default function WholesalePage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#202829]">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "批发合作",
            description:
              "PriceAI 批发合作入口收集 API 中转、卡网订阅渠道和其他源头的买方需求与源头供给线索。",
            url: "https://priceai.cc/wholesale",
            isPartOf: {
              "@type": "WebSite",
              name: "PriceAI",
              url: "https://priceai.cc",
            },
          },
        ]}
      />

      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-[18px]">
        <SiteHeader activeSection="wholesale" />
      </div>

      <main className="mx-auto max-w-[980px] px-5 py-8 pb-20 sm:px-6">
        <header className="mb-5">
          <h1 className="font-serif text-3xl font-semibold tracking-normal text-[#202829] md:text-4xl">
            批发合作
          </h1>
          <p className="mt-3 max-w-[720px] text-sm leading-7 text-[#5a6061]">
            提交批量采购需求或源头供给信息。先记录线索，后续由 PriceAI 人工核验。
          </p>
        </header>

        <WholesaleIntakeForm />
      </main>
    </div>
  );
}
