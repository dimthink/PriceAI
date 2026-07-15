"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ApiTransitModelsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteErrorState
      activeSection="transit"
      error={error}
      reset={unstable_retry}
      title="中转模型数据加载遇到问题"
      description="可以重试当前模型对比页，或先回到首页查看其他 API 入口。"
    />
  );
}
