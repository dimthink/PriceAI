"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers3 } from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";
import { CategoryTabBar, type CategoryTabItem } from "@/components/CategoryTabBar";
import { TransitModelIcon } from "@/components/TransitModelIcon";
import type { TransitModelFamily } from "@/data/api-transit/types";
import {
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_MODEL_FAMILY_ORDER,
  isTransitModelFamily,
} from "@/data/api-transit/types";

type FamilyFilter = "all" | TransitModelFamily;

const preferredFamilyOrder: readonly TransitModelFamily[] = TRANSIT_MODEL_FAMILY_ORDER;

function coerceFamily(value: string | null): FamilyFilter {
  return isTransitModelFamily(value) ? value : "all";
}

function displayFamilyLabel(family: TransitModelFamily, fallback: string): string {
  return TRANSIT_MODEL_FAMILY_LABELS[family] || fallback;
}

function familyTabIcon(family: FamilyFilter) {
  const className = "h-[18px] w-[18px]";

  if (family === "all") return <Layers3 className={`${className} shrink-0 text-[#5a6061]`} />;
  if (family === "gpt") return <BrandIcon platform="ChatGPT" className={className} />;
  if (family === "claude") return <BrandIcon platform="Claude" className={className} />;
  return <TransitModelIcon family={family} className={className} />;
}

export function TransitFamilyTabs({
  options,
  className = "",
}: {
  options: { id: TransitModelFamily; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFamily = coerceFamily(searchParams.get("family") ?? searchParams.get("model"));

  const tabs = useMemo<CategoryTabItem[]>(() => {
    const byId = new Map(options.map((option) => [option.id, option]));
    const orderedOptions = preferredFamilyOrder
      .filter((family) => byId.has(family))
      .map((family) => byId.get(family)!);

    options.forEach((option) => {
      if (!orderedOptions.some((item) => item.id === option.id)) orderedOptions.push(option);
    });

    return [
      {
        id: "all",
        label: "全部",
        icon: familyTabIcon("all"),
      },
      ...orderedOptions.map((option) => ({
        id: option.id,
        label: displayFamilyLabel(option.id, option.label),
        icon: familyTabIcon(option.id),
      })),
    ];
  }, [options]);

  function updateFamily(value: string) {
    const nextFamily = coerceFamily(value);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("model");

    if (nextFamily === "all") {
      params.delete("family");
    } else {
      params.set("family", nextFamily);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <CategoryTabBar
      items={tabs}
      value={activeFamily}
      onChange={updateFamily}
      className={className}
    />
  );
}
