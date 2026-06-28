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
