import {
  buildLoginHref,
  getCanonicalAuthOrigin,
  safeAuthNextPath,
} from "../src/lib/auth-paths.js";
import { createRequire } from "node:module";
import {
  normalizeDetectorServiceUrl,
  fetchDetectorJson,
  resolveDetectorStatusUrl,
} from "../src/lib/detector-request.js";
import {
  createDetectorReportShareToken,
  detectorReportSharePath,
  hashDetectorReportShareToken,
  isValidDetectorReportShareToken,
} from "../src/lib/detector-report-share.js";
import {
  feedbackDraftKey,
  readFeedbackDraft,
  writeFeedbackDraft,
} from "../src/lib/feedback-draft.js";
import { getAuthCookieWriteOptions, isAuthCodeVerifierCookieName } from "../src/lib/auth-cookie-options.js";
import { PRICEAI_PROXY_MATCHER, shouldRefreshAuthSession } from "../src/lib/proxy-routing.js";
import { isSameOriginMutation } from "../src/lib/request-origin.js";
import {
  buildCloudflarePublicCacheKeyUrl,
  cacheSearchParams,
} from "../src/lib/cloudflare-cache-key.js";
import { safeExternalHttpUrl } from "../src/lib/external-url.js";

async function main() {
const { AsyncLocalStorage } = await import("node:async_hooks");
Object.assign(globalThis, { AsyncLocalStorage });
const requireFromRepo = createRequire(`${process.cwd()}/package.json`);
const { unstable_doesMiddlewareMatch } = requireFromRepo("next/experimental/testing/server.js") as typeof import("next/experimental/testing/server.js");

assertEqual(safeAuthNextPath("/account?tab=reports#latest"), "/account?tab=reports#latest", "preserves safe internal path");
assertEqual(safeAuthNextPath("https://evil.example"), "/account", "rejects absolute URL");
assertEqual(safeAuthNextPath("//evil.example/path"), "/account", "rejects protocol-relative URL");
assertEqual(safeAuthNextPath("/\\evil.example/path"), "/account", "rejects backslash network path");
assertEqual(safeAuthNextPath("/%2f%2fevil.example"), "/account", "rejects encoded path separators");
assertEqual(safeAuthNextPath(" /account"), "/account", "rejects surrounding whitespace");
assertEqual(safeAuthNextPath("/products/%E0%A4%A"), "/account", "rejects malformed encoding");
assertEqual(buildLoginHref("/products/chatgpt-plus", "oauth_cancelled"), "/login?next=%2Fproducts%2Fchatgpt-plus&error=oauth_cancelled", "builds stable login error URL");
assertEqual(getCanonicalAuthOrigin(new URL("https://www.priceai.cc/auth/google")), "https://priceai.cc", "canonicalizes www auth origin");
assertEqual(getCanonicalAuthOrigin(new URL("http://localhost:3000/auth/google")), "http://localhost:3000", "preserves local auth origin");

assertEqual(normalizeDetectorServiceUrl("https://detector.example/"), "https://detector.example", "normalizes detector base URL");
assertEqual(resolveDetectorStatusUrl("https://detector.example", "/api/status/job_123"), "https://detector.example/api/status/job_123", "accepts detector status path");
assertThrows(() => resolveDetectorStatusUrl("https://detector.example", "https://evil.example/api/status/job_123"), "rejects foreign detector origin");
assertThrows(() => resolveDetectorStatusUrl("https://detector.example", "http://127.0.0.1/api/status/job_123"), "rejects private alternate origin");
assertThrows(() => resolveDetectorStatusUrl("https://detector.example", "/admin/secrets"), "rejects unexpected detector path");
assertThrows(() => normalizeDetectorServiceUrl("file:///tmp/detector"), "rejects non-http detector service");

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{"ok":true}', {
  headers: { "Content-Length": "1048576", "Content-Type": "application/json" },
});
await assertRejects(
  fetchDetectorJson("https://detector.example/api/status/job_123", {}, { maxBytes: 128 }),
  "响应过大",
  "rejects oversized declared detector response",
);

let oversizedStreamCancelled = false;
globalThis.fetch = async () => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(80));
    controller.enqueue(new Uint8Array(80));
    controller.enqueue(new Uint8Array(80));
  },
  cancel() {
    oversizedStreamCancelled = true;
  },
}), { headers: { "Content-Type": "application/json" } });
await assertRejects(
  fetchDetectorJson("https://detector.example/api/status/job_123", {}, { maxBytes: 128 }),
  "响应过大",
  "rejects oversized streamed detector response",
);
assertEqual(oversizedStreamCancelled, true, "cancels oversized detector response stream");

globalThis.fetch = async () => new Response("not-json", { headers: { "Content-Type": "application/json" } });
await assertRejects(
  fetchDetectorJson("https://detector.example/api/status/job_123"),
  "无法解析",
  "rejects malformed detector JSON",
);

globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
});
await assertRejects(
  fetchDetectorJson("https://detector.example/api/status/job_123", {}, { timeoutMs: 5 }),
  "响应超时",
  "times out stalled detector requests",
);
globalThis.fetch = originalFetch;

const shareToken = createDetectorReportShareToken();
assertEqual(shareToken.length, 43, "creates a 32-byte base64url report share token");
assertEqual(isValidDetectorReportShareToken(shareToken), true, "accepts generated report share token");
assertEqual(isValidDetectorReportShareToken(`${shareToken}x`), false, "rejects report share token with wrong length");
assertEqual(/^[a-f0-9]{64}$/.test(hashDetectorReportShareToken(shareToken)), true, "hashes report share token with SHA-256");
assertEqual(detectorReportSharePath(shareToken), `/api-transit/detector/shared/${shareToken}`, "builds encoded report share path");

assertEqual(isAuthCodeVerifierCookieName("sb-project-auth-token-code-verifier"), true, "detects PKCE verifier cookie");
assertEqual(isAuthCodeVerifierCookieName("sb-project-auth-token.0"), false, "does not classify session cookie as verifier");
assertEqual(getAuthCookieWriteOptions("sb-project-auth-token-code-verifier", {}).maxAge, 600, "limits PKCE verifier lifetime");
assertEqual(getAuthCookieWriteOptions("sb-project-auth-token-code-verifier", { maxAge: 0 }).maxAge, 0, "preserves verifier deletion");

const proxyConfig = { matcher: PRICEAI_PROXY_MATCHER };
for (const url of [
  "https://priceai.cc/login",
  "https://priceai.cc/auth/callback",
  "https://priceai.cc/account",
  "https://priceai.cc/account/detector-reports",
  "https://priceai.cc/api/account/me",
  "https://priceai.cc/api/api-transit/detector/status/job_123",
  "https://priceai.cc/_next/static/css/app.css",
]) {
  assertEqual(unstable_doesMiddlewareMatch({ config: proxyConfig, url }), true, `matches auth proxy path ${url}`);
}
for (const url of [
  "https://priceai.cc/",
  "https://priceai.cc/channels",
  "https://priceai.cc/products/chatgpt-plus",
  "https://priceai.cc/api/explorer",
  "https://priceai.cc/api-transit/detector",
  "https://priceai.cc/_next/static/chunks/app.js",
]) {
  assertEqual(unstable_doesMiddlewareMatch({ config: proxyConfig, url }), false, `skips public proxy path ${url}`);
}
assertEqual(shouldRefreshAuthSession("/account"), true, "refreshes auth on account root");
assertEqual(shouldRefreshAuthSession("/channels"), false, "does not refresh auth on public content");
assertEqual(isSameOriginMutation(new Request("https://priceai.cc/api/account/test", { method: "POST", headers: { origin: "https://priceai.cc" } })), true, "accepts same-origin account mutation");
assertEqual(isSameOriginMutation(new Request("https://priceai.cc/api/account/test", { method: "POST", headers: { origin: "https://evil.example" } })), false, "rejects foreign-origin account mutation");
assertEqual(isSameOriginMutation(new Request("https://priceai.cc/api/account/test", { method: "POST", headers: { "sec-fetch-site": "cross-site" } })), false, "rejects cross-site browser mutation");

const emptyCacheQuery = new URLSearchParams();
assertEqual(
  buildCloudflarePublicCacheKeyUrl({
    requestUrl: "https://priceai.cc/api/explorer?nonce=one",
    namespace: "explorer-v1",
    searchParams: emptyCacheQuery,
  }),
  buildCloudflarePublicCacheKeyUrl({
    requestUrl: "https://priceai.cc/api/explorer?nonce=two",
    namespace: "explorer-v1",
    searchParams: emptyCacheQuery,
  }),
  "drops unrelated explorer query parameters from the Cloudflare cache key",
);
assertEqual(
  buildCloudflarePublicCacheKeyUrl({
    requestUrl: "https://priceai.cc/api/offers?nonce=one&q=chatgpt",
    namespace: "offers-v1",
    searchParams: cacheSearchParams({ q: "chatgpt", limit: 30, offset: 0 }),
  }),
  buildCloudflarePublicCacheKeyUrl({
    requestUrl: "https://priceai.cc/api/offers?nonce=two&q=chatgpt",
    namespace: "offers-v1",
    searchParams: cacheSearchParams({ offset: 0, limit: 30, q: "chatgpt" }),
  }),
  "keeps only normalized offer query fields in the Cloudflare cache key",
);
assertEqual(
  buildCloudflarePublicCacheKeyUrl({
    requestUrl: "https://priceai.cc/api/explorer?__priceai_edge_cache=offers-v1",
    namespace: "explorer-v1",
    searchParams: emptyCacheQuery,
  }).includes("__priceai_edge_cache"),
  false,
  "does not expose the internal cache namespace as a user-controlled query parameter",
);
assertEqual(safeExternalHttpUrl("https://example.com/evidence"), "https://example.com/evidence", "accepts HTTPS evidence URL");
assertEqual(safeExternalHttpUrl("javascript:alert(1)"), null, "rejects javascript evidence URL");
assertEqual(safeExternalHttpUrl("data:text/html,test"), null, "rejects data evidence URL");

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { sessionStorage: storage },
});
writeFeedbackDraft("offer", "offer_123", { reason: "wrong_price", notes: "draft" });
assertEqual(readFeedbackDraft("offer", "offer_123")?.notes, "draft", "restores current feedback draft");
storage.setItem(feedbackDraftKey("offer", "offer_123"), JSON.stringify({
  version: 1,
  savedAt: Date.now() - (2 * 60 * 60 * 1000) - 1,
  fields: { notes: "expired" },
}));
assertEqual(readFeedbackDraft("offer", "offer_123"), null, "expires stale feedback draft");
assertEqual(storage.getItem(feedbackDraftKey("offer", "offer_123")), null, "removes expired feedback draft");

console.log("auth security test passed");
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function assertThrows(run: () => unknown, message: string) {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(`${message}. Expected function to throw.`);
}

async function assertRejects(run: Promise<unknown>, expectedMessage: string, message: string) {
  try {
    await run;
  } catch (error) {
    const actualMessage = error instanceof Error ? error.message : String(error);
    if (actualMessage.includes(expectedMessage)) return;
    throw new Error(`${message}. Expected error including ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(actualMessage)}.`);
  }
  throw new Error(`${message}. Expected promise to reject.`);
}

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
