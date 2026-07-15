import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginPanel } from "@/components/LoginPanel";
import { buildGoogleAuthHref, safeAuthNextPath } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 PriceAI，用于高风险反馈追踪和模型检测任务归属。",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeAuthNextPath(params.next);
  if (!params.error) redirect(buildGoogleAuthHref(next));

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto flex max-w-[460px] px-4 pb-16 pt-10 sm:px-8">
        <div className="w-full rounded-xl bg-white p-5 ring-1 ring-[#adb3b4]/18">
          <LoginPanel next={next} errorMessage={loginErrorMessage(params.error)} />
        </div>
      </section>
    </main>
  );
}

function loginErrorMessage(error?: string): string {
  if (error === "auth_config") return "登录服务尚未配置，请稍后再试。";
  if (error === "oauth_cancelled") return "你已取消 Google 登录，当前页面和数据没有发生变化。";
  if (error === "oauth_provider_failed") return "Google 没有完成授权，请返回原页面或重新登录。";
  if (error === "callback_missing_code") return "登录回调缺少授权信息，请重新发起登录。";
  if (error === "callback_exchange_failed") return "授权信息已失效或已被使用，请重新登录。";
  if (error === "callback_network_failed") return "登录服务暂时无法连接，请检查网络后重试。";
  return "Google 登录启动失败，请稍后再试。";
}
