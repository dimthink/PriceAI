"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { TransitStation } from "@/data/api-transit/types";
import {
  getTransitStationSystem,
  getTransitStationSystemLabel,
} from "@/lib/api-transit";
import { apiTransitLogoDisplayUrl } from "@/lib/api-transit-logo-url";

export function TransitStationSystemIcon({
  station,
  size = "md",
}: {
  station: TransitStation;
  size?: "md" | "lg";
}) {
  const system = getTransitStationSystem(station);
  const label = getTransitStationSystemLabel(station);
  const shellClassName = size === "lg" ? "h-14 w-14 rounded-xl" : "h-10 w-10 rounded-full";
  const imageClassName = size === "lg" ? "h-10 w-10" : "h-7 w-7";
  const customLogoUrl = apiTransitLogoDisplayUrl(station.logoUrl);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const [loadedLogoUrl, setLoadedLogoUrl] = useState<string | null>(null);
  const [failedSystemSrc, setFailedSystemSrc] = useState<string | null>(null);
  const [loadedSystemSrc, setLoadedSystemSrc] = useState<string | null>(null);
  const initial = station.name.trim().charAt(0) || "?";

  useEffect(() => {
    if (!customLogoUrl || failedLogoUrl === customLogoUrl) return;

    let active = true;
    const image = new window.Image();
    image.onload = () => {
      if (!active) return;
      if (image.naturalWidth === 0) {
        setFailedLogoUrl(customLogoUrl);
        return;
      }
      setLoadedLogoUrl(customLogoUrl);
    };
    image.onerror = () => {
      if (active) setFailedLogoUrl(customLogoUrl);
    };
    image.src = customLogoUrl;

    return () => {
      active = false;
    };
  }, [customLogoUrl, failedLogoUrl]);

  if (customLogoUrl && failedLogoUrl !== customLogoUrl) {
    return (
      <span
        className={`relative grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-[#adb3b4]/20 ${shellClassName}`}
        title={`${station.name} Logo`}
      >
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-xs font-bold text-[#73797a]">
          {initial}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customLogoUrl}
          alt=""
          aria-hidden="true"
          className={`relative z-10 object-contain transition-opacity ${imageClassName} ${loadedLogoUrl === customLogoUrl ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoadedLogoUrl(customLogoUrl)}
          onError={(event) => {
            event.currentTarget.hidden = true;
            setFailedLogoUrl(customLogoUrl);
          }}
        />
      </span>
    );
  }

  if (system === "new_api" || system === "sub_to_api") {
    const src = system === "new_api" ? "/brand-icons/new-api.png" : "/brand-icons/sub2api.png";

    if (failedSystemSrc === src) {
      return (
        <span
          className={`grid shrink-0 place-items-center bg-[#f2f4f4] text-sm font-bold text-[#202829] ring-1 ring-[#adb3b4]/15 ${shellClassName}`}
          title={label}
        >
          {initial}
        </span>
      );
    }

    return (
      <span
        className={`relative grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-[#adb3b4]/20 ${shellClassName}`}
        title={label}
      >
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-xs font-bold text-[#73797a]">
          {system === "new_api" ? "N" : "S"}
        </span>
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className={`relative z-10 object-contain transition-opacity ${imageClassName} ${loadedSystemSrc === src ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoadedSystemSrc(src)}
          onError={() => setFailedSystemSrc(src)}
        />
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center bg-[#f2f4f4] text-sm font-bold text-[#202829] ring-1 ring-[#adb3b4]/15 ${shellClassName}`}
      title={label}
    >
      {initial}
    </span>
  );
}
