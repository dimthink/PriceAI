import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginPanel } from "@/components/LoginPanel";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 PriceAI，用于高风险反馈追踪和模型检测任务归属。",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start">
        <div className="pt-2">
          <p className="text-sm font-semibold text-[#5a6061]">公开浏览保持开放</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-normal text-[#202829] sm:text-4xl">
            登录只出现在需要责任边界的地方
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5a6061]">
            你仍然可以不登录查看卡网订阅、官方订阅、官方 API 和中转 API。登录主要用于提交高风险反馈、查看反馈处理进度，以及发起模型检测。
          </p>
          <div className="mt-6 grid gap-3 text-sm leading-6 text-[#2d3435] sm:grid-cols-2">
            <div className="rounded-lg bg-white p-4 ring-1 ring-[#adb3b4]/15">
              <p className="font-semibold">高风险反馈</p>
              <p className="mt-1 text-[#5a6061]">疑似欺诈、售后纠纷、下架请求需要登录后提交。</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-[#adb3b4]/15">
              <p className="font-semibold">模型检测</p>
              <p className="mt-1 text-[#5a6061]">检测会消耗 Key 和服务资源，需要登录和限额。</p>
            </div>
          </div>
          <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[#2d3435] underline decoration-[#adb3b4] underline-offset-4">
            先继续公开浏览
          </Link>
        </div>
        <LoginPanel next={params.next} />
      </section>
    </main>
  );
}
