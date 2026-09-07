"use client";

import { useEffect, useState } from "react";
import type { TransitModelFamily, TransitStation } from "@/data/api-transit/types";
import {
  TransitStationPricingPanels,
  TransitStationPricingSkeleton,
} from "@/components/TransitStationDetail";

type TransitDetailResponse =
  | {
      ok: true;
      station: TransitStation;
    }
  | {
      ok: false;
      message?: string;
    };

type Props = {
  slug: string;
  initialStation: TransitStation;
  focusedFamily: TransitModelFamily | null;
};

export function TransitStationLivePricingPanels({ slug, initialStation, focusedFamily }: Props) {
  const [station, setStation] = useState(initialStation);
  const [requestedFreshData, setRequestedFreshData] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function refreshDetailData() {
      setStation(initialStation);
      setRequestedFreshData(false);

      try {
        const response = await fetch(`/api/api-transit-stations/${encodeURIComponent(slug)}/detail`, {
          headers: {
            accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data = (await response.json()) as TransitDetailResponse;
        if (!active || !data.ok || !isTransitStationPayload(data.station)) return;

        setStation(data.station);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the last known good station data on transient network or API failures.
        }
      } finally {
        if (active) setRequestedFreshData(true);
      }
    }

    void refreshDetailData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [initialStation, slug]);

  if (!station.prices.length && !requestedFreshData) {
    return <TransitStationPricingSkeleton />;
  }

  return <TransitStationPricingPanels station={station} focusedFamily={focusedFamily} />;
}

function isTransitStationPayload(value: unknown): value is TransitStation {
  if (!value || typeof value !== "object") return false;
  const station = value as Partial<TransitStation>;
  return typeof station.id === "string" && typeof station.slug === "string" && Array.isArray(station.prices);
}
