"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { QQGroupDialog } from "@/components/FeedbackLink";
import { useCommunitySettings } from "@/lib/community-settings-client";
import {
  isQQGroupPromptHash,
  qqGroupPromptEventName,
  removeQQGroupPromptMarkers,
  wantsQQGroupFromSearch,
} from "@/lib/community";

function subscribeToHashChange(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function subscribeToClientReady(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const frame = window.requestAnimationFrame(onStoreChange);
  return () => window.cancelAnimationFrame(frame);
}

function getHashSnapshot() {
  return typeof window === "undefined" ? "" : window.location.hash.toLowerCase();
}

export function QQGroupAutoPrompt() {
  const settings = useCommunitySettings();
  const router = useRouter();
  const pathname = usePathname();
  const isGuidePage = pathname.startsWith("/guides/self-host-api-transit");
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const clientReady = useSyncExternalStore(subscribeToClientReady, () => true, () => false);
  const hash = useSyncExternalStore(subscribeToHashChange, getHashSnapshot, () => "");
  const [manualPromptIndex, setManualPromptIndex] = useState(0);
  const [dismissedPromptKey, setDismissedPromptKey] = useState<string | null>(null);
  const urlPromptKey = wantsQQGroupFromSearch(queryString) || isQQGroupPromptHash(hash)
    ? `${pathname}?${queryString}${hash}`
    : null;
  const manualPromptKey = manualPromptIndex > 0 ? `manual:${manualPromptIndex}` : null;
  const promptKey = manualPromptKey || urlPromptKey;

  useEffect(() => {
    const openPrompt = () => setManualPromptIndex((current) => current + 1);
    window.addEventListener(qqGroupPromptEventName, openPrompt);
    return () => window.removeEventListener(qqGroupPromptEventName, openPrompt);
  }, []);

  if (isGuidePage) return null;

  function closePrompt() {
    if (!promptKey) return;
    setDismissedPromptKey(promptKey);
    if (urlPromptKey) {
      router.replace(removeQQGroupPromptMarkers(pathname, queryString, hash), { scroll: false });
    }
  }

  return settings.qqGroupEnabled && clientReady && promptKey && dismissedPromptKey !== promptKey
    ? <QQGroupDialog settings={settings} onClose={closePrompt} />
    : null;
}
