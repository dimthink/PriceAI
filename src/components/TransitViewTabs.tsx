"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Boxes } from "lucide-react";
import { isTransitModelFamily } from "@/data/api-transit/types";

export function TransitViewTabs({
  active,
  className = "",
  itemClassName = "",
}: {
  active: "stations" | "models";
  className?: string;
  itemClassName?: string;
}) {
  const searchParams = useSearchParams();
  const stationHref = buildViewHref("/api-transit", searchParams);
  const modelHref = buildViewHref("/api-transit/models", searchParams);

  return (
    <nav className={`inline-flex h-11 items-center gap-1 rounded-full bg-[#e4e9ea] p-1 ${className}`} aria-label="中转 API 视图切换">
      <Link
        href={stationHref}
        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${itemClassName} ${
          active === "stations"
            ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
            : "text-[#5a6061] hover:text-[#202829]"
        }`}
        aria-current={active === "stations" ? "page" : undefined}
      >
        <Building2 className="h-4 w-4" />
        站点
      </Link>
      <Link
        href={modelHref}
        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${itemClassName} ${
          active === "models"
            ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
            : "text-[#5a6061] hover:text-[#202829]"
        }`}
        aria-current={active === "models" ? "page" : undefined}
      >
        <Boxes className="h-4 w-4" />
        模型
      </Link>
    </nav>
  );
}

function buildViewHref(pathname: string, searchParams: Pick<URLSearchParams, "get">): string {
  const params = new URLSearchParams();
  const query = searchParams.get("q");
  const family = searchParams.get("family") ?? searchParams.get("model");

  if (query) params.set("q", query);
  if (isTransitModelFamily(family)) params.set("family", family);

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
