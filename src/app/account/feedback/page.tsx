import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountFeedbackList } from "@/components/AccountFeedbackList";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { buildGoogleAuthHref } from "@/lib/auth-paths";
import { listUserOfferFeedback } from "@/lib/account";
import type { OfferFeedback } from "@/lib/types";

export const metadata: Metadata = {
  title: "我的反馈",
  robots: { index: false, follow: false },
};

export default async function AccountFeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect(buildGoogleAuthHref("/account/feedback"));

  let feedback: OfferFeedback[] = [];
  let errorMessage = "";
  try {
    feedback = await listUserOfferFeedback(user.id);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "读取反馈失败。";
  }

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#5a6061]">账户中心</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">我的反馈</h1>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">这里只展示登录后提交的高风险反馈和后续可追踪反馈。</p>
          </div>
          <Link href="/account" className="text-sm font-semibold text-[#2d3435] underline decoration-[#adb3b4] underline-offset-4">
            返回账户
          </Link>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-lg bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b3328]">{errorMessage}</div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
          <AccountFeedbackList feedback={feedback} />
        </div>
      </section>
    </main>
  );
}
