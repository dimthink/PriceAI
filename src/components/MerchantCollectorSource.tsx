import { Store } from "lucide-react";
import Image from "next/image";
import type { MerchantCollectorGroup } from "@/lib/types";

export function CollectorSourceLogo({
  group,
  size = "card",
}: {
  group: MerchantCollectorGroup;
  size?: "card" | "table" | "compact";
}) {
  const frameClassName = collectorLogoFrameClassName(size);
  const imageClassName = size === "compact"
    ? "h-5 w-5 shrink-0 object-contain"
    : size === "table"
      ? "h-7 w-7 shrink-0 object-contain"
      : "h-8 w-8 shrink-0 object-contain";
  const logo = collectorSourceLogoAsset(group);

  if (logo) {
    return (
      <span aria-hidden="true" className={`${frameClassName} ${logo.frameClassName}`}>
        <Image src={logo.src} alt="" aria-hidden="true" width={32} height={32} className={imageClassName} />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`${frameClassName} bg-[#f2f4f4] text-[#5a6061] ring-[#adb3b4]/15`}>
      <Store size={size === "compact" ? 14 : size === "table" ? 18 : 19} />
    </span>
  );
}

function collectorLogoFrameClassName(size: "card" | "table" | "compact"): string {
  if (size === "compact") return "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1";
  if (size === "table") return "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1";
  return "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1";
}

function collectorSourceLogoAsset(group: MerchantCollectorGroup): { src: string; frameClassName: string } | null {
  if (group === "shopApi") return { src: "/brand-icons/collector-ldxp.png", frameClassName: "bg-[#fff5ec] ring-[#ffd9bd]" };
  if (group === "dujiao") return { src: "/brand-icons/collector-dujiao.png", frameClassName: "bg-[#f8f8f8] ring-[#adb3b4]/20" };
  if (group === "kami") return { src: "/brand-icons/collector-kami.png", frameClassName: "bg-[#fff4f4] ring-[#ffd0d2]" };
  return null;
}
