import Image from "next/image";
import { Boxes } from "lucide-react";
import { ModelBrandIcon, modelBrandIconForModel } from "@/components/ModelBrandIcon";

const iconByFamily: Record<string, string> = {
  claude: "/brand-icons/claude.svg",
  gemini: "/brand-icons/gemini.svg",
  glm: "/brand-icons/glm.png",
  deepseek: "/brand-icons/deepseek.png",
  kimi: "/brand-icons/kimi.png",
  qwen: "/brand-icons/qwen.png",
};

export function TransitModelIcon({
  family,
  standardModel,
  className = "h-6 w-6",
}: {
  family: string;
  standardModel?: string;
  className?: string;
}) {
  const normalizedFamily = family.toLowerCase();
  const modelBrand = modelBrandIconForModel(standardModel);

  if (modelBrand) return <ModelBrandIcon icon={modelBrand} className={className} />;

  if (normalizedFamily === "gpt") {
    return <ModelBrandIcon icon="openai" className={className} />;
  }
  if (normalizedFamily === "grok") {
    return <ModelBrandIcon icon="grok" className={className} />;
  }
  if (normalizedFamily === "image") {
    return <GeneratedMediaIcon kind="image" className={className} />;
  }
  if (normalizedFamily === "video") {
    return <GeneratedMediaIcon kind="video" className={className} />;
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

function GeneratedMediaIcon({
  kind,
  className,
}: {
  kind: "image" | "video";
  className: string;
}) {
  if (kind === "video") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${className} shrink-0`}
        fill="none"
      >
        <rect x="3.25" y="5" width="17.5" height="14" rx="3.25" fill="#eef6f7" />
        <rect x="3.25" y="5" width="17.5" height="14" rx="3.25" stroke="#2f7580" strokeWidth="1.7" />
        <path d="M9.85 9.1v5.8l5.15-2.9-5.15-2.9Z" fill="#2bb7a8" />
        <path d="M7.2 5.4v13.2M16.8 5.4v13.2" stroke="#2f7580" strokeLinecap="round" strokeWidth="1.25" opacity="0.55" />
        <path d="M17.75 3.8l.38 1.1 1.12.38-1.12.38-.38 1.12-.38-1.12-1.12-.38 1.12-.38.38-1.1Z" fill="#2bb7a8" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} shrink-0`}
      fill="none"
    >
      <rect x="4" y="5" width="16" height="14" rx="3.25" fill="#eaf7ef" />
      <rect x="4" y="5" width="16" height="14" rx="3.25" stroke="#2f7a4b" strokeWidth="1.7" />
      <path
        d="m7.35 15.9 3.03-3.03a1 1 0 0 1 1.42 0l1.2 1.2 1.88-1.88a1 1 0 0 1 1.42 0l2.35 2.35"
        stroke="#2f7a4b"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.45"
      />
      <circle cx="9" cy="9.45" r="1.25" fill="#45bf78" />
      <path d="M17.75 3.8l.38 1.1 1.12.38-1.12.38-.38 1.12-.38-1.12-1.12-.38 1.12-.38.38-1.1Z" fill="#45bf78" />
    </svg>
  );
}
