"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function OfficialPricesError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteErrorState
      activeSection="official"
      error={error}
      reset={unstable_retry}
      title="官方地区价加载遇到问题"
      description="可以重试当前地区价页面，或先回到首页继续查看其他价格数据。"
    />
  );
}
