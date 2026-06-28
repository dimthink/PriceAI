import Image from "next/image";
import { Boxes, ImageIcon, Sparkles, Video } from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";

const iconByFamily: Record<string, string> = {
  claude: "/brand-icons/claude.svg",
  gemini: "/brand-icons/gemini.svg",
  deepseek: "/brand-icons/deepseek.png",
};

export function TransitModelIcon({
  family,
  className = "h-6 w-6",
}: {
  family: string;
  className?: string;
}) {
  const normalizedFamily = family.toLowerCase();

  if (normalizedFamily === "gpt") {
    return <BrandIcon platform="ChatGPT" className={className} />;
  }
  if (normalizedFamily === "image") {
    return <ImageIcon className={`${className} shrink-0 text-[#5a6061]`} />;
  }
  if (normalizedFamily === "video") {
    return <Video className={`${className} shrink-0 text-[#5a6061]`} />;
  }
  if (normalizedFamily === "glm") {
    return <Sparkles className={`${className} shrink-0 text-[#5a6061]`} />;
  }

  const src = iconByFamily[normalizedFamily];

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className={`${className} shrink-0 object-contain`}
      />
    );
  }

  return <Boxes className={`${className} shrink-0 text-[#5a6061]`} />;
}
