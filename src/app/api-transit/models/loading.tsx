import { RouteLoadingState } from "@/components/RouteLoadingState";

export default function ApiTransitModelsLoading() {
  return <RouteLoadingState activeSection="transit" rowCount={6} />;
}
