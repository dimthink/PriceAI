import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";

export function DetectorReportShell({
  jsonLdData,
  children,
}: {
  jsonLdData?: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      {jsonLdData ? <JsonLd data={[jsonLdData]} /> : null}
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
      </div>
      <main className="mx-auto max-w-[1500px] px-5 py-6 pb-20">{children}</main>
    </div>
  );
}
