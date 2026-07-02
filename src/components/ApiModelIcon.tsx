import { Boxes, Layers3 } from "lucide-react";
import Image from "next/image";
import { ModelBrandIcon, modelBrandIconForModel } from "@/components/ModelBrandIcon";

const iconByFamily: Record<string, string> = {
  DeepSeek: "/brand-icons/deepseek.png",
  Qwen: "/brand-icons/qwen.png",
  Kimi: "/brand-icons/kimi.png",
  GLM: "/brand-icons/glm.png",
  MiniMax: "/brand-icons/minimax.png",
  MiMo: "/brand-icons/mimo.png",
  StepFun: "/brand-icons/stepfun.png",
};

export function ApiModelIcon({
  family,
  modelName,
  className = "h-6 w-6",
}: {
  family: string;
  modelName?: string;
  className?: string;
}) {
  const normalizedFamily = family.toLowerCase();
  const modelBrand = modelBrandIconForModel(modelName);
  if (normalizedFamily === "图片生成") {
    if (modelBrand) return <ModelBrandIcon icon={modelBrand} className={className} />;
    return <GeneratedMediaIcon kind="image" className={className} />;
  }
  if (normalizedFamily === "视频生成") {
    if (modelBrand) return <ModelBrandIcon icon={modelBrand} className={className} />;
    return <GeneratedMediaIcon kind="video" className={className} />;
  }

  const src = iconByFamily[family];

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

  return <Layers3 className={`${className} shrink-0 text-[#5a6061]`} />;
}

function GeneratedMediaIcon({
  kind,
  className,
}: {
  kind: "image" | "video";
  className: string;
}) {
  if (kind === "video") {
    return <Boxes className={`${className} shrink-0 text-[#2f7580]`} />;
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
    </svg>
  );
}
