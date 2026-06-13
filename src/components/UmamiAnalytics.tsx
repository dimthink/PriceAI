import Script from "next/script";
import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_ALLOWED_DOMAINS = ["priceai.cc", "www.priceai.cc"];

function getAllowedDomains(): string[] {
  const configured = getRuntimeEnv("NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS");
  if (!configured) return DEFAULT_ALLOWED_DOMAINS;

  return configured
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function UmamiAnalytics() {
  const websiteId = getRuntimeEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID");
  const scriptUrl = getRuntimeEnv("NEXT_PUBLIC_UMAMI_SCRIPT_URL");
  const allowedDomains = getAllowedDomains();

  if (!websiteId || !scriptUrl) return null;

  return (
    <Script
      id="umami-domain-loader"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `
          (function () {
            var allowedDomains = ${JSON.stringify(allowedDomains)};
            var hostname = window.location.hostname.toLowerCase();
            if (allowedDomains.indexOf(hostname) === -1) return;
            if (document.querySelector('script[data-priceai-umami="true"]')) return;
            var script = document.createElement('script');
            script.defer = true;
            script.src = ${JSON.stringify(scriptUrl)};
            script.setAttribute('data-website-id', ${JSON.stringify(websiteId)});
            script.setAttribute('data-priceai-umami', 'true');
            document.head.appendChild(script);
          })();
        `,
      }}
    />
  );
}
