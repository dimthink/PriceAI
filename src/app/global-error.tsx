"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#f7f9f9] text-[#2d3435]">
        <main className="flex min-h-screen items-center justify-center px-5 py-12">
          <section className="w-full max-w-lg rounded-xl bg-white p-7 text-center shadow-[0_20px_60px_rgba(45,52,53,0.08)] ring-1 ring-[#adb3b4]/20">
            <p className="text-sm font-semibold text-[#9b3328]">PriceAI 暂时无法继续加载</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-[#202829]">页面遇到了未预期的问题</h1>
            <p className="mt-4 text-sm leading-7 text-[#5a6061]">可以先重试；如果问题持续存在，返回首页后仍可继续使用公开浏览功能。</p>
            {error.digest ? <p className="mt-3 text-xs text-[#7a8587]">错误编号：{error.digest}</p> : null}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={unstable_retry} className="inline-flex h-10 items-center rounded-full bg-[#202829] px-5 text-sm font-semibold text-white">
                重试
              </button>
              <Link href="/" className="inline-flex h-10 items-center rounded-full bg-[#eef1f1] px-5 text-sm font-semibold text-[#2d3435]">
                返回首页
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
