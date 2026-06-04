"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/AppLogo";
import { FeedbackLink, GitHubLink } from "@/components/FeedbackLink";

export function ProductDetailHeader() {
  const [returnHref, setReturnHref] = useState("/");

  useEffect(() => {
    window.queueMicrotask(() => {
      setReturnHref(buildReturnHref(new URLSearchParams(window.location.search).get("back") || undefined));
    });
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1300px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href={returnHref} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-[#5a6061] hover:bg-[#edf0f1] hover:text-[#2d3435] sm:px-3">
          <ArrowLeft size={17} />
          返回首页
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <Link href="/about" className="inline-flex h-10 shrink-0 items-center rounded-full bg-white px-3.5 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829]">
              关于
            </Link>
          </div>
          <div className="hidden sm:block">
            <FeedbackLink compact />
          </div>
          <div className="hidden sm:block">
            <GitHubLink compact />
          </div>
          <Link href={returnHref} aria-label="PriceAI 首页" className="shrink-0">
            <AppLogo compact />
          </Link>
        </div>
      </div>
    </header>
  );
}

function buildReturnHref(back: string | undefined): string {
  if (!back) return "/";

  const source = new URLSearchParams(back.replace(/^\?/, ""));
  const safe = new URLSearchParams();
  const allowedKeys = ["q", "platform", "type", "stock", "sort", "min", "max", "view", "scope"];

  allowedKeys.forEach((key) => {
    const value = source.get(key);
    if (value) safe.set(key, value);
  });

  const query = safe.toString();
  return query ? `/?${query}` : "/";
}
