"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ApiModelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      activeSection="api"
      error={error}
      reset={reset}
      title="API 模型数据加载遇到问题"
      description="可以重试当前模型页，或先回到首页继续查看订阅和 API 入口。"
    />
  );
}
