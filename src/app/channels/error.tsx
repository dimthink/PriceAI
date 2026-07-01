"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ChannelsError({
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
      title="卡网订阅数据加载遇到问题"
      description="可以重试当前比价页，或先回到首页查看其他价格入口。"
    />
  );
}
