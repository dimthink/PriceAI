"use client";

import { useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { createSupabaseAuthBrowserClient } from "@/lib/auth-client";

export function LoginPanel({ next = "/account" }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loginWithGoogle() {
    setLoading(true);
    setMessage("");
    const supabase = createSupabaseAuthBrowserClient();
    if (!supabase) {
      setMessage("登录服务尚未配置，请稍后再试。");
      setLoading(false);
      return;
    }

    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", safeNextPath(next));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
      },
    });

    if (error) {
      setMessage(error.message || "Google 登录启动失败。");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[460px] rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/18">
      <div>
        <p className="text-sm font-semibold text-[#5a6061]">PriceAI 账户</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#202829]">登录 PriceAI</h1>
        <p className="mt-3 text-sm leading-7 text-[#5a6061]">
          登录只用于高风险反馈追踪、模型检测任务归属和后续补充材料，不影响公开浏览、搜索、比价和跳转购买。
        </p>
      </div>

      <button
        type="button"
        onClick={loginWithGoogle}
        disabled={loading}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white transition hover:bg-[#2d3435] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        使用 Google 登录
      </button>

      {message ? <p className="mt-3 rounded-lg bg-[#fbe9e7] px-3 py-2 text-sm text-[#9b3328]">{message}</p> : null}

      <div className="mt-4 rounded-lg bg-[#f7f9f9] px-3 py-3 text-xs leading-6 text-[#5a6061] ring-1 ring-[#adb3b4]/12">
        第一版不做会员、积分和隐藏价格。高风险反馈仍需要证据和联系方式，登录不等于内容自动采纳。
      </div>
    </div>
  );
}

function safeNextPath(value: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}
