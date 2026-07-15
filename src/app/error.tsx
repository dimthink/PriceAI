"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteErrorState activeSection="home" error={error} reset={unstable_retry} />;
}
