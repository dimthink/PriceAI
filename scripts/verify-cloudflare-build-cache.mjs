import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const cacheRoot = process.argv[2] || ".open-next/cache";
const root = process.cwd();
const absoluteCacheRoot = join(root, cacheRoot);
const emergencyPriceCacheOnly = readFileSync(
  join(root, "src/lib/public-price-emergency.ts"),
  "utf8",
).includes("PUBLIC_PRICE_CACHE_ONLY_MODE = true");

const forbiddenMarkers = [
  { label: "demo data banner", patterns: ["当前使用内置演示数据", "配置 Supabase"] },
  { label: "seed timestamp", patterns: ["01/01 08:00", "2026-01-01T00:00:00.000Z"] },
  {
    label: "configured=false",
    patterns: ['"configured":false', '\\"configured\\":false'],
    isAllowed: isSponsorSettingsDefaultMarker,
  },
  {
    label: "static dataset source",
    patterns: ['"source":"static"', '\\"source\\":\\"static\\"'],
    isAllowed: isEmergencyOfficialFallbackMarker,
  },
  { label: "seed offer total", patterns: ['"offerTotal":10', '\\"offerTotal\\":10'] },
  {
    label: "static source label",
    patterns: ["数据源：静态样本"],
    isAllowed: isEmergencyOfficialFallbackMarker,
  },
];

if (!existsSync(absoluteCacheRoot)) {
  console.error(`OpenNext cache directory does not exist: ${cacheRoot}`);
  process.exit(1);
}

const cacheFiles = listCacheFiles(absoluteCacheRoot);
const failures = [];

for (const file of cacheFiles) {
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    const matchedPattern = marker.patterns.find((pattern) => {
      const index = content.indexOf(pattern);
      return index >= 0 && !marker.isAllowed?.(content, index, file);
    });
    if (!matchedPattern) continue;

    failures.push({
      file: relative(root, file),
      label: marker.label,
      pattern: matchedPattern,
    });
  }
}

function isSponsorSettingsDefaultMarker(content, index) {
  const before = content.slice(Math.max(0, index - 80), index);
  const after = content.slice(index, index + 700);
  const looksLikeSponsorSettings =
    before.includes('"sponsorSettings":{') ||
    before.includes('\\"sponsorSettings\\":{') ||
    before.includes('"settings":{') ||
    before.includes('\\"settings\\":{');

  return looksLikeSponsorSettings &&
    (after.includes('"tableReady":true') || after.includes('\\"tableReady\\":true')) &&
    after.includes("赞助位配置尚未保存") &&
    (after.includes('"placements":{') || after.includes('\\"placements\\":{'));
}

function isEmergencyOfficialFallbackMarker(_content, _index, file) {
  if (!emergencyPriceCacheOnly) return false;
  const cachePath = relative(root, file).replaceAll("\\\\", "/");
  return cachePath.endsWith("/official-api.cache") || cachePath.endsWith("/official-prices.cache");
}

if (failures.length > 0) {
  console.error("OpenNext cache validation failed: prerender cache contains fallback/static data markers.");
  for (const failure of failures.slice(0, 30)) {
    console.error(`- ${failure.file}: ${failure.label} (${failure.pattern})`);
  }
  if (failures.length > 30) {
    console.error(`...and ${failures.length - 30} more marker(s).`);
  }
  process.exit(1);
}

console.log(`OpenNext cache validation passed: checked ${cacheFiles.length} cache file(s).`);

function listCacheFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listCacheFiles(path));
    } else if (entry.endsWith(".cache")) {
      files.push(path);
    }
  }

  return files;
}
