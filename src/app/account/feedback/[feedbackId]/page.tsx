import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountFeedbackDetailClient } from "@/components/AccountFeedbackDetailClient";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { buildGoogleAuthHref } from "@/lib/auth-paths";
import { getUserOfferFeedback, listUserFeedbackFollowups } from "@/lib/account";

export const metadata: Metadata = {
  title: "反馈详情",
  robots: { index: false, follow: false },
};

export default async function AccountFeedbackDetailPage({
  params,
}: {
  params: Promise<{ feedbackId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(buildGoogleAuthHref("/account/feedback"));

  const { feedbackId } = await params;
  const feedback = await getUserOfferFeedback(user.id, feedbackId);
  if (!feedback) notFound();
  const followups = await listUserFeedbackFollowups(user.id, feedbackId);

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#5a6061]">我的反馈</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">反馈详情</h1>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">查看处理进度、补充材料，或在问题已协商一致后撤销反馈。</p>
          </div>
          <Link href="/account/feedback" className="text-sm font-semibold text-[#2d3435] underline decoration-[#adb3b4] underline-offset-4">
            返回我的反馈
          </Link>
        </div>
        <AccountFeedbackDetailClient feedback={feedback} followups={followups} />
      </section>
    </main>
  );
}
