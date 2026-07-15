import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountDataControls } from "@/components/AccountDataControls";
import { AccountSignOutControls } from "@/components/AccountSignOutControls";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAccountDeletionRequest } from "@/lib/account-data";
import { buildGoogleAuthHref } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "账户与隐私设置",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(buildGoogleAuthHref("/account/settings"));

  const deletionRequest = await getActiveAccountDeletionRequest(user.id).catch(() => null);

  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#5a6061]">账户中心</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">账户与隐私设置</h1>
            <p className="mt-2 text-sm leading-6 text-[#5a6061]">管理当前 Session、下载账户数据副本，或提交可撤销的账号删除申请。</p>
          </div>
          <Link href="/account" className="text-sm font-semibold text-[#2d3435] underline decoration-[#adb3b4] underline-offset-4">返回账户</Link>
        </div>

        <div className="mt-5 rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
          <h2 className="text-lg font-semibold text-[#202829]">登录设备</h2>
          <p className="mt-2 text-sm leading-6 text-[#5a6061]">“退出当前设备”只清理当前浏览器；“退出全部设备”会撤销当前账号可刷新的登录会话，其他设备上的短期访问令牌可能在自然过期前继续有效。</p>
          <AccountSignOutControls />
        </div>

        <div className="mt-5">
          <AccountDataControls initialRequest={deletionRequest} />
        </div>
      </section>
    </main>
  );
}
