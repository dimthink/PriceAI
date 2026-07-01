"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function PlatformsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      activeSection="channels"
      error={error}
      reset={reset}
      title="平台报价加载遇到问题"
      description="可以重试当前平台页，或先回到卡网订阅页查看全部渠道。"
    />
  );
}
