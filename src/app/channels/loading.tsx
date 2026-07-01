import { RouteLoadingState } from "@/components/RouteLoadingState";

export default function ChannelsLoading() {
  return <RouteLoadingState activeSection="channels" rowCount={6} />;
}
