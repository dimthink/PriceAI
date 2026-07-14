import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import { OPEN_NEXT_REGIONAL_CACHE_MODE } from "./src/lib/infrastructure-runtime-profile";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: OPEN_NEXT_REGIONAL_CACHE_MODE,
  }),
  queue: doQueue,
});
