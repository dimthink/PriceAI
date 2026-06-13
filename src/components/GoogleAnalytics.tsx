import Script from "next/script";
import { getRuntimeEnv } from "@/lib/runtime-env";

export function GoogleAnalytics() {
  const measurementId = getRuntimeEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID");

  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="lazyOnload"
      />
      <Script
        id="google-analytics"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}', { send_page_view: true });
          `.trim(),
        }}
      />
    </>
  );
}
