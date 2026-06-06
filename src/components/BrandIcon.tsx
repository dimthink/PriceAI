import { Layers3 } from "lucide-react";
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
  "education-email": "/brand-icons/google-workspace.png",
  "email-account": "/brand-icons/google-workspace.png",
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
};

export function BrandIcon({
  platform,
  productId,
  className = "h-[18px] w-[18px]",
}: {
  platform: string;
  productId?: string;
  className?: string;
}) {
  const src = productId ? iconByProductId[productId] || iconByPlatform[platform] : iconByPlatform[platform];

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
