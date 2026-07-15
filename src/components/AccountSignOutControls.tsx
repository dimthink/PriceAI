"use client";

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { notifyAccountChanged } from "@/lib/account-client";

export function AccountSignOutControls() {
  const [scope, setScope] = useState<"local" | "global" | null>(null);
  const [message, setMessage] = useState("");

  async function signOut(nextScope: "local" | "global") {
    setScope(nextScope);
    setMessage("");
    try {
      const response = await fetch("/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: nextScope }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "退出失败，请稍后再试。");
      notifyAccountChanged(null);
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "退出失败，请稍后再试。");
      setScope(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void signOut("local")}
          disabled={Boolean(scope)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#e8ecec] disabled:opacity-60"
        >
          {scope === "local" ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          退出当前设备
        </button>
        <button
          type="button"
          onClick={() => void signOut("global")}
          disabled={Boolean(scope)}
          className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/25 transition hover:bg-[#f7f9f9] disabled:opacity-60"
        >
          {scope === "global" ? "正在退出..." : "退出全部设备"}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-[#9b3328]" role="alert">{message}</p> : null}
    </div>
  );
}
