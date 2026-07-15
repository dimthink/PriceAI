"use client";

import Link from "next/link";

export default function AccountError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f9] px-5">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 text-center ring-1 ring-[#adb3b4]/18">
        <h1 className="text-xl font-semibold text-[#202829]">账户内容暂时无法读取</h1>
        <p className="mt-3 text-sm leading-6 text-[#5a6061]">登录状态或数据服务可能刚刚发生变化。你可以重试，或先返回公开页面继续浏览。</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={unstable_retry} className="inline-flex h-10 items-center rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white">重试</button>
          <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435]">返回首页</Link>
        </div>
      </div>
    </main>
  );
}
