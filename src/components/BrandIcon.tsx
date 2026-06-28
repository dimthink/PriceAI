import { Gift, GraduationCap, Layers3, Mail, MessageCircleMore, type LucideIcon } from "lucide-react";
import Image from "next/image";

const iconByPlatform: Record<string, string> = {
  ChatGPT: "/brand-icons/chatgpt.svg",
  Claude: "/brand-icons/claude.svg",
  Gemini: "/brand-icons/gemini.svg",
  Grok: "/brand-icons/grok.svg",
  Google: "/brand-icons/google.png",
  "API/CDK": "/brand-icons/chatgpt.svg",
  邮箱: "/brand-icons/gmail.png",
};

const iconByProductId: Record<string, string> = {
  "gmail-account": "/brand-icons/gmail.png",
  "outlook-account": "/brand-icons/outlook.png",
  "google-phone-verification": "/brand-icons/google.png",
  "paypal-phone-verification": "/brand-icons/paypal.png",
  "openai-phone-verification": "/brand-icons/chatgpt.svg",
  "virtual-card": "/brand-icons/visa.png",
  "cursor-account": "/brand-icons/cursor.png",
  "kiro-account": "/brand-icons/kiro.png",
  "windsurf-account": "/brand-icons/windsurf.png",
  "perplexity-account": "/brand-icons/perplexity.png",
  "suno-account": "/brand-icons/suno.png",
  "apple-id-account": "/brand-icons/apple.png",
  "x-twitter-account": "/brand-icons/x.png",
  "telegram-account": "/brand-icons/telegram.svg",
};

const semanticIconByProductId: Record<string, LucideIcon> = {
  "education-email": GraduationCap,
  "email-account": Mail,
  "phone-verification": MessageCircleMore,
  "gift-card": Gift,
};

const semanticIconByPlatform: Record<string, LucideIcon> = {
  接码: MessageCircleMore,
};

function OpenAIIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" className={`${className} shrink-0`} fill="currentColor">
      <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z" />
    </svg>
  );
}

function GrokIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 466.04 516.93" aria-hidden="true" className={`${className} shrink-0`} fill="currentColor">
      <polygon points="0.12 182.71 234.14 516.92 338.15 516.92 104.13 182.71 0.12 182.71" />
      <polygon points="0 516.92 104.08 516.92 156.08 442.67 104.04 368.34 0 516.92" />
      <polygon points="466.04 0 361.96 0 182.1 256.86 234.15 331.18 466.04 0" />
      <polygon points="380.78 516.92 466.04 516.92 466.04 37.16 380.78 158.92 380.78 516.92" />
    </svg>
  );
}

export function BrandIcon({
  platform,
  productId,
  className = "h-[18px] w-[18px]",
}: {
  platform: string;
  productId?: string;
  className?: string;
}) {
  const SemanticIcon = productId ? semanticIconByProductId[productId] : semanticIconByPlatform[platform];
  const src = productId ? iconByProductId[productId] || iconByPlatform[platform] : iconByPlatform[platform];

  if (SemanticIcon) {
    return <SemanticIcon aria-hidden="true" className={`${className} shrink-0 text-[#5a6061]`} />;
  }

  // Keep monochrome marks theme-aware; static black SVG files disappear in dark mode.
  if (productId === "openai-phone-verification" || platform === "ChatGPT" || platform === "API/CDK") {
    return <OpenAIIcon className={className} />;
  }

  if (platform === "Grok") {
    return <GrokIcon className={className} />;
  }

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className={`${className} shrink-0 object-contain`}
      />
    );
  }

  return <Layers3 className={`${className} shrink-0 text-[#5a6061]`} />;
}
