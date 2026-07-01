import { RouteLoadingState } from "@/components/RouteLoadingState";

export default function GuidesLoading() {
  return <RouteLoadingState activeSection="guides" showTabs={false} rowCount={5} metricCount={3} variant="article" />;
}
