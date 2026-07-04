import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "账户",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/18">
          <p className="text-sm font-semibold text-[#5a6061]">当前登录</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">{user.displayName || user.email || "PriceAI 用户"}</h1>
          <p className="mt-1 text-sm text-[#5a6061]">{user.email}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#e8ecec]">
              退出登录
            </button>
          </form>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <AccountLink href="/account/feedback" title="我的反馈" text="查看高风险反馈、处理状态和补充材料入口。" />
          <AccountLink href="/account/detector-reports" title="我的检测" text="查看模型检测任务、状态和报告入口。" />
        </div>
      </section>
    </main>
  );
}

function AccountLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15 transition hover:bg-[#fdfefe]">
      <p className="text-base font-semibold text-[#202829]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#5a6061]">{text}</p>
    </Link>
  );
}
