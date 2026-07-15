import { RouteLoadingState } from "@/components/RouteLoadingState";

export default function ApiTransitDetectorLoading() {
  return <RouteLoadingState activeSection="transit" rowCount={4} metricCount={3} />;
}
