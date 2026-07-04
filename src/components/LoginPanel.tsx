import Image from "next/image";
import { UserRoundPlus } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { buildGoogleAuthHref } from "@/lib/auth-paths";

export function LoginPanel({
  next = "/account",
  errorMessage,
}: {
  next?: string;
  errorMessage?: string;
}) {

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <AppLogo compact />
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f3ec] text-[#2f7a4b] ring-1 ring-[#45bf78]/20" aria-hidden="true">
          <UserRoundPlus size={18} />
        </span>
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-normal text-[#202829]">登录账户中心</h1>
      <p className="mt-2 text-sm leading-6 text-[#5a6061]">使用 Google 继续，登录后可查看反馈和检测记录。</p>

      <a
        href={buildGoogleAuthHref(next)}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#adb3b4]/25 bg-white px-4 text-sm font-semibold text-[#202829] transition hover:bg-[#f7f9f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/55"
      >
        <Image src="/brand-icons/google.svg" alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
        使用 Google 继续
      </a>

      {errorMessage ? <p className="mt-4 rounded-lg bg-[#fbe9e7] px-3 py-2 text-sm leading-6 text-[#9b3328]">{errorMessage}</p> : null}
    </div>
  );
}
