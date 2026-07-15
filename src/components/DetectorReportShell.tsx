import { Suspense, type ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { TransitFamilyTabs } from "@/components/TransitFamilyTabs";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";

export function DetectorReportShell({
  familyOptions,
  jsonLdData,
  children,
}: {
  familyOptions: ReturnType<typeof getTransitModelFamilyOptions>;
  jsonLdData?: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      {jsonLdData ? <JsonLd data={[jsonLdData]} /> : null}
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
        <Suspense fallback={<TransitFamilyTabsFallback />}>
          <TransitFamilyTabs options={familyOptions} />
        </Suspense>
      </div>
      <main className="mx-auto max-w-[1500px] px-5 py-6 pb-20">{children}</main>
    </div>
  );
}

function TransitFamilyTabsFallback() {
  return (
    <section className="border-y border-[#dfe4e5] py-2">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
        <div className="h-10" />
      </div>
    </section>
  );
}
