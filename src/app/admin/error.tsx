"use client";

import Link from "next/link";

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f9] px-5">
      <section className="w-full max-w-lg rounded-xl bg-white p-7 text-center ring-1 ring-[#adb3b4]/20">
        <h1 className="text-2xl font-semibold text-[#202829]">后台数据暂时无法读取</h1>
        <p className="mt-3 text-sm leading-7 text-[#5a6061]">认证状态、数据库或运行指标可能刚发生变化。重试不会执行写操作。</p>
        {error.digest ? <p className="mt-3 text-xs text-[#7a8587]">错误编号：{error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={unstable_retry} className="inline-flex h-10 items-center rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white">重试</button>
          <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-[#eef1f1] px-4 text-sm font-semibold text-[#2d3435]">返回公开站点</Link>
        </div>
      </section>
    </main>
  );
}
