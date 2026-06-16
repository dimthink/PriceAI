"use client";

import { ArrowLeft } from "lucide-react";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export function ProductDetailHeader() {
  return (
    <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
      <SiteHeader logoCompact activeSection="channels" />
    </div>
  );
}

export function ProductReturnLink() {
  const [returnHref, setReturnHref] = useState("/channels");

  useEffect(() => {
    window.queueMicrotask(() => {
      const back = new URLSearchParams(window.location.search).get("back") || undefined;
      setReturnHref(buildReturnHref(back));
    });
  }, []);

  return (
    <a href={returnHref} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-[#5a6061] hover:bg-[#edf0f1] hover:text-[#2d3435] sm:px-3">
      <ArrowLeft size={17} />
      返回卡网订阅
    </a>
  );
}

function buildReturnHref(back: string | undefined): string {
  if (!back) return "/channels";

  const source = new URLSearchParams(back.replace(/^\?/, ""));
  const safe = new URLSearchParams();
  const allowedKeys = ["q", "platform", "type", "stock", "sort", "min", "max", "view", "scope"];

  allowedKeys.forEach((key) => {
    const value = source.get(key);
    if (value) safe.set(key, value);
  });

  const query = safe.toString();
  return query ? `/channels?${query}` : "/channels";
}
