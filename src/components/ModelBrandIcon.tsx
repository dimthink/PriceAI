import Image from "next/image";
import { BrandIcon } from "@/components/BrandIcon";

export type ModelBrandIconKind = "openai" | "gemini" | "volcengine" | "kling";

const modelBrandIconByPrefix: { prefix: string; icon: ModelBrandIconKind }[] = [
  { prefix: "gpt image", icon: "openai" },
  { prefix: "sora", icon: "openai" },
  { prefix: "nano banana", icon: "gemini" },
  { prefix: "veo", icon: "gemini" },
  { prefix: "gemini omni", icon: "gemini" },
  { prefix: "seedance", icon: "volcengine" },
  { prefix: "kling", icon: "kling" },
];

const modelBrandImageSrc: Partial<Record<ModelBrandIconKind, string>> = {
  gemini: "/brand-icons/gemini.svg",
  kling: "/brand-icons/kling.png",
  volcengine: "/brand-icons/volcengine.png",
};

export function modelBrandIconForModel(modelName?: string): ModelBrandIconKind | null {
  const normalizedModelName = modelName?.toLowerCase() ?? "";
  return modelBrandIconByPrefix.find((item) => normalizedModelName.startsWith(item.prefix))?.icon ?? null;
}

export function ModelBrandIcon({
  icon,
  className = "h-6 w-6",
}: {
  icon: ModelBrandIconKind;
  className?: string;
}) {
  if (icon === "openai") return <BrandIcon platform="ChatGPT" className={className} />;

  const src = modelBrandImageSrc[icon];
  if (!src) return null;

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
