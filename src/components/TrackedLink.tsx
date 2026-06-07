"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";

type TrackedLinkProps = ComponentProps<typeof Link> & {
  eventName?: string;
  eventParams?: Record<string, string | number | boolean | null | undefined>;
};

export function TrackedLink({
  eventName,
  eventParams,
  onClick,
  ...props
}: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        if (eventName) trackAnalyticsEvent(eventName, eventParams);
        onClick?.(event);
      }}
    />
  );
}
