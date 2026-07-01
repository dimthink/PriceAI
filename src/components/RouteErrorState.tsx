"use client";

import type { ComponentProps } from "react";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { reloadOnceForChunkLoadFailure } from "@/lib/chunk-load-recovery";

type ActiveSection = ComponentProps<typeof SiteHeader>["activeSection"];

export function RouteErrorState({
  activeSection,
  error,
  reset,
  title = "数据加载遇到问题",
  description = "可以重试当前页面，或先回到首页继续查看其他报价。",
}: {
  activeSection: ActiveSection;
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    reloadOnceForChunkLoadFailure(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader activeSection={activeSection} />
      </div>
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-semibold text-[#9b3328]">页面暂时不可用</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-normal text-[#202829]">{title}</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#5a6061]">{description}</p>
        {error.digest ? <p className="mt-3 text-xs text-[#7a8587]">错误编号：{error.digest}</p> : null}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#202829] px-5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <RotateCcw size={16} />
            重试
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#eef1f1] px-5 text-sm font-semibold text-[#2d3435] transition hover:bg-[#e3e9e9]"
          >
            返回首页
          </Link>
        </div>
      </main>
    </div>
  );
}
