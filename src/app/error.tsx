"use client";

import { RouteErrorState } from "@/components/RouteErrorState";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState activeSection="home" error={error} reset={reset} />;
}
