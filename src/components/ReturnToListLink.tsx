"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { sanitizeListReturnHref } from "@/lib/list-return";

export function ReturnToListLink({
  allowedKeys,
  basePath,
  label,
}: {
  allowedKeys: readonly string[];
  basePath: string;
  label: string;
}) {
  const [returnHref, setReturnHref] = useState(basePath);

  useEffect(() => {
    window.queueMicrotask(() => {
      const back = new URLSearchParams(window.location.search).get("back") || undefined;
      setReturnHref(sanitizeListReturnHref(basePath, back, allowedKeys));
    });
  }, [allowedKeys, basePath]);

  return (
    <a
      href={returnHref}
      className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-[#5a6061] hover:bg-[#edf0f1] hover:text-[#2d3435] sm:px-3"
    >
      <ArrowLeft size={17} />
      {label}
    </a>
  );
}
