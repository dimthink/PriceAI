import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Info, UserRoundPlus } from "lucide-react";
import { buildGoogleAuthHref, getAuthCancelPath } from "@/lib/auth-paths";

export function LoginPanel({
  next = "/account",
  errorMessage,
}: {
  next?: string;
  errorMessage?: string;
}) {
  const cancelHref = getAuthCancelPath(next);

  return (
    <div className="w-full">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e8f3ec] text-[#2f7a4b] ring-1 ring-[#45bf78]/20" aria-hidden="true">
        <UserRoundPlus size={19} />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#202829] text-balance">登录 PriceAI</h1>
      <p className="mt-2 text-sm leading-6 text-[#5a6061] text-pretty">登录后可以追踪反馈处理进度，并保存模型检测记录。</p>

      {errorMessage ? (
        <p role="alert" className="mt-5 rounded-lg bg-[#fbe9e7] px-3 py-2.5 text-sm leading-6 text-[#9b3328]">
          {errorMessage}
        </p>
      ) : null}

      <a
        href={buildGoogleAuthHref(next)}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/55 focus-visible:ring-offset-2"
      >
        <Image src="/brand-icons/google.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
        使用 Google 继续
      </a>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-[#fff7e8] px-3 py-3 text-[#7a541b]">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-6 text-pretty">
          当前仅支持 Google 登录。继续后将前往 Google；如果页面无法打开，请先检查当前网络是否能正常访问 Google。
        </p>
      </div>

      <Link
        href={cancelHref}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-[#2d3435] transition hover:bg-[#f2f4f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/45"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        暂不登录，继续浏览
      </Link>

      <p className="mt-3 text-center text-xs leading-5 text-[#5a6061]">浏览价格、库存和公开指南无需登录。</p>
    </div>
  );
}
