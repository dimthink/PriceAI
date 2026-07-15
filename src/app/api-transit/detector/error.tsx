"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ApiTransitDetectorError({
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
      title="模型检测工作台加载失败"
      description="检测配置或站点列表暂时不可用。可以安全重试，尚未提交的 API Key 不会由主站保存。"
    />
  );
}
