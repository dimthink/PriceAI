"use client";

import { useEffect } from "react";

export function HomeUrlCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== "/" || url.searchParams.get("home") !== "1") return;

    url.searchParams.delete("home");
    const search = url.searchParams.toString();
    window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  }, []);

  return null;
}
