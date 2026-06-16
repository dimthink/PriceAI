import { errorText, reloadOnceForChunkLoadFailure } from "@/lib/chunk-load-recovery";

function elementUrl(target: EventTarget | null): string {
  if (!target || typeof target !== "object") return "";
  if ("src" in target && typeof target.src === "string") return target.src;
  if ("href" in target && typeof target.href === "string") return target.href;
  return "";
}

window.addEventListener(
  "error",
  (event) => {
    const errorEvent = event as ErrorEvent;
    const targetUrl = elementUrl(event.target);
    reloadOnceForChunkLoadFailure([
      errorEvent.message,
      errorEvent.filename,
      targetUrl,
      errorText(errorEvent.error),
    ].join(" "));
  },
  true,
);

window.addEventListener("unhandledrejection", (event) => {
  reloadOnceForChunkLoadFailure(event.reason);
});
