"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function GuidesError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteErrorState
      activeSection="guides"
      error={error}
      reset={unstable_retry}
      title="指南页面加载遇到问题"
      description="可以重试当前指南，或先回到首页继续查看比价工具。"
    />
  );
}
