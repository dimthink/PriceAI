# Research: Price Radar Cloudflare Cost Audit

- **Query**: 核对 Workers Standard Requests/CPU ms 计费、缓存命中执行路径、R2 Class B、静态 JSON/版本化快照低成本分发，以及 Rate Limiting、WAF/Bot、API Shield/API key 能力与计划限制
- **Scope**: external（Cloudflare 官方文档）+ screenshot-derived cost interpretation
- **Date**: 2026-07-21
- **Source policy**: 仅使用 Cloudflare 官方文档；所有价格和计划能力均按 2026-07-21 检索结果记录，实施前仍应在当前账户 Dashboard 复核套餐与可用开关

## Executive Findings

1. **截图中第一成本不是 Standard Requests，而是 CPU。** 截图显示 Workers CPU `1.1B`、计费 `1.07B`、成本 `$21.44`；Workers Standard Requests `44.15M`、计费 `34.15M`、成本 `$10.50`；R2 Class B `25.67M`、计费 `15.67M`、成本 `$5.76`。三项合计约 `$37.70`，其中 CPU 约占 `56.9%`、Standard Requests `27.9%`、R2 Class B `15.3%`。因此公开价格雷达首先要消除重复计算和重复 R2 读取，同时若目标是进一步降低 Standard Requests，必须让匿名流量**不进入 Worker 计费路径**。
2. **Workers Cache 只能显著降 CPU，不能降低 Standard Request 数。** 官方明确：Cache HIT 不执行 Worker、CPU 不计费，但所有命中仍按 Workers Standard request rate 计费；启用 Workers Cache 后，连原本免费的静态资产请求也会按 Standard rate 计费。
3. **普通 Cache API 也不是“绕过 Worker”。** Worker 在 zone cache 之前运行；Worker 内部 `cache.match()`/`fetch()` 命中可以减少后端和 R2/数据库读取，但入口 Worker 已执行。新版 Workers Cache 是 Worker 前置缓存，但仍收 Standard Request 费。
4. **匿名公开快照的最低成本首选是非 Worker 数据面。** 两个可行方向：
   - 随发布产出的 Workers Static Assets：资产请求免费且不限量，前提是资产路由直接命中、没有 `run_worker_first`，且没有给该 Worker 开启 Workers Cache。
   - R2 Public Bucket + Custom Domain + JSON Cache Rule + Smart Tiered Cache：请求不需要先执行应用 Worker；缓存命中避免 R2 `GetObject`，未命中产生 R2 Class B。适合独立于应用发布节奏的定时更新快照。
5. **API Key 是第二阶段的动态/配额层，不应套在匿名缓存 URL 上。** `Authorization` 请求会触发 Workers Cache 自动 bypass，因而逐请求鉴权的 API Key 路径必然重新进入 Worker。建议把匿名、有限字段、强缓存快照与 API Key 高额度/历史/复杂筛选拆成两条数据面。

## Billing Facts

### Workers Standard Requests and CPU

Cloudflare Workers Paid / Standard 当前官方价格：

| Metric | Included | Overage |
|---|---:|---:|
| Worker requests | 10M/month | `$0.30 / additional million` |
| CPU time | 30M CPU ms/month | `$0.02 / additional million CPU ms` |

官方补充口径：

- 计费 request 是进入 Worker 的 inbound request；Worker 发出的 subrequest 不另按 Worker request 收费。
- 静态资产请求在不启用 Workers Cache、且直接由 assets 层提供时免费且不限量。
- Workers Cache 命中仍计 Standard Request；只有 Worker 未运行时 CPU 不计费。
- 可以为单次调用配置最大 CPU time，以限制失控代码或 denial-of-wallet 风险。

证据：[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)，页面标注 `dateModified: 2026-07-07`（本次抓取）；[Static assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)，页面标注 `dateModified: 2026-04-23`。

### Cache execution paths

需要区分三类“缓存”，否则容易误判账单：

| Mechanism | Worker runs on HIT? | Standard Request billed? | Main benefit |
|---|---:|---:|---|
| Worker 内部 Cache API / `fetch()` 访问 zone cache | Yes，入口 Worker 已运行 | Yes | 降低 origin/R2/DB 读取和 Worker 后半段 CPU |
| Workers Cache（`cache.enabled`） | No | Yes | 降 Worker CPU；tiered cache + request collapsing |
| Workers Static Assets 直接命中 | No | No（官方称 free and unlimited） | 同时消除 Worker request 与 CPU |
| R2 custom domain + Cloudflare CDN cache | No application Worker required | No Worker request（架构推断） | 命中时也避免 R2 Class B |

事实证据：

- Cloudflare 说明普通 Workers 与 zone cache 的顺序是“Workers run before the cache”；若要缓存 Worker 自身响应并在执行前返回，应使用 Workers Cache。[How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)
- Workers Cache 在执行 Worker 前检查缓存；命中直接返回，未命中才运行 Worker。它默认有上下两层 tiered cache，并支持 request collapsing。[Workers Cache](https://developers.cloudflare.com/workers/cache/)
- 同一页面的 Pricing 部分明确：Workers Cache 没有额外价格，但所有请求（包括 HIT 和原本免费的 static assets）都按 Standard request rate 计费；HIT 不计 CPU。
- `Authorization` 请求和带 `Set-Cookie` 的响应触发 Workers Cache 自动 bypass；只有 `GET` / `HEAD` 可缓存。
- Cache API 是数据中心本地缓存，不支持 tiered cache，也不做并发 request collapsing；冷缓存突发会多次执行 Worker。[How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)

### R2 Class B

R2 Standard storage 当前官方价格与免费量：

| Metric | Included | Overage |
|---|---:|---:|
| Class B operations | 10M/month | `$0.36 / million` |
| Egress to Internet | Free | Free |

`HeadObject`、`GetObject` 等读取属于 Class B。截图中 `25.67M` 总量很可能意味着应用或公开对象反复读取 R2；仅凭账单不能确认具体调用方，需要按 endpoint、bucket/object key 与 `CF-Cache-Status` 进一步归因。

Cloudflare 官方给出的 asset hosting 示例显示：每天 10M 对象读取、30 天会产生 300M Class B，扣除 10M 免费量后成本 `$104.40`。这直接说明“R2 免费 egress”不等于“高频小对象免费读取”。

证据：[R2 pricing](https://developers.cloudflare.com/r2/pricing/)，页面标注 `dateModified: 2026-05-28`。

## Recommended Distribution Architecture

### Recommended: two data planes

```text
snapshot producer (existing refresh cadence)
        |
        +--> immutable JSON: /v1/snapshots/{generated_at_or_hash}/...
        |       stored in R2 Standard
        |
        +--> small pointer: /v1/latest.json
                atomically replaced after all immutable objects exist

anonymous clients
        -> api-data.priceai.cc (R2 custom domain)
        -> WAF / IP rate limit
        -> Cache Rule: cache JSON
        -> Smart Tiered Cache
        -> R2 only on cache miss

API-key clients
        -> api.priceai.cc/v1/...
        -> Worker validates key + per-key rate limit
        -> returns shared precomputed snapshot / permits advanced query
```

### Why versioned immutable snapshots

**Evidence-backed effects:**

- R2 custom domains support Cloudflare Cache, WAF, access control, and Bot Management; `r2.dev` does not and is explicitly for non-production traffic.
- JSON is not cached by default on an R2 custom domain; a Cache Rule must explicitly cache it.
- Smart Tiered Cache lets lower-tier misses check an upper tier before R2, reducing Class B reads.

**Architecture inference:**

- Immutable version URLs can use a very long edge TTL (`public, max-age` / Edge TTL) without purge races.
- `latest.json` should be tiny and short-lived, or updated atomically after the version payload is complete. Consumers that can tolerate the existing snapshot cadence may pin the returned version URL, so repeated fetches have a stable cache key.
- Avoid arbitrary query-string combinations on the anonymous layer. Every unique cache key fragments the cache and increases Worker/R2 misses. Publish a bounded manifest of standard products, categories, common quick-filter tags, current minimum, and Top 5.
- Prefer one compact snapshot per common access pattern rather than one R2 read per item in a request. A Worker request that performs several R2 `get/head` calls can multiply Class B even when the external request count is one.

Official evidence: [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)，页面标注 `dateModified: 2026-06-16`; [Enable cache in an R2 bucket](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)，页面标注 `dateModified: 2026-05-07`。

### Alternative: Workers Static Assets

If snapshot files can be generated at build/deploy time, placing immutable JSON in the static-assets bucket can be even cheaper: Cloudflare states static asset requests are free and unlimited, while SSR/Worker script requests are billed.

Constraints:

- Must confirm the deployed OpenNext routing allows these paths to hit assets before Worker execution.
- `run_worker_first` patterns force Worker invocation and defeat the request-saving goal.
- Do not enable Workers Cache on the same Worker solely for these static paths; official pricing says enabling it makes normally-free static asset requests billable at Standard rate.
- Build-coupled snapshots are less suitable if the existing refresh cadence is substantially more frequent than deploys. In that case R2 custom domain is operationally cleaner.

Official evidence: [Static assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

### Not sufficient by itself: cache the current dynamic API

Adding `Cache-Control` or Cache API to `/api/public/v1/...` inside the existing app is still useful as a transitional step because it can lower CPU, Supabase/R2 traffic, and origin work. It does **not** meet the objective of lowering Standard Requests if requests remain routed to the Worker. Workers Cache HIT itself is still billed as a Standard Request.

## Abuse Controls and Plan Limits

### WAF custom rules

- Available on all zone plans.
- Rule counts: Free `5`, Pro `20`, Business `100`, Enterprise `1,000`.
- Free/Pro/Business support all listed actions except `Log`; Enterprise supports all.
- Custom rules run before rate limiting, managed WAF, and Super Bot Fight Mode. A terminating `Block` or challenge prevents later phases from running.

Official evidence: [WAF custom rules](https://developers.cloudflare.com/waf/custom-rules/); [Security feature interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).

**Cost inference to validate in account analytics:** requests terminated by WAF before the Worker should not become inbound Worker requests, because the Worker pricing definition counts requests entering the Worker and the security phase runs earlier. The cited pages do not explicitly promise this billing outcome, so verify with a small controlled rule and Workers invocation metrics before treating it as guaranteed savings.

### WAF Rate Limiting Rules

Rate limiting rules are available on all plans, but granularity is plan-dependent:

| Plan | Counting key | Period | Rule count | Cached-asset exclusion |
|---|---|---:|---:|---:|
| Free | IP | 10s | 1 | No |
| Pro | IP | up to 1m | 2 | No |
| Business | IP / IP with NAT support | up to 10m | 5 | Yes |
| Enterprise app security | IP / NAT-aware IP | up to 65,535s | 100 (contract-dependent) | Yes |
| Enterprise Advanced Rate Limiting | adds header, query, cookie, ASN, country, path, fingerprint, custom, etc. | up to 65,535s | 100 | Yes |

Important behavior:

- On Free and Pro, rate limiting cannot natively count by API key/header; it is IP-based.
- Header/query/cookie as a counting characteristic is an Enterprise Advanced Rate Limiting capability, not a general Free/Pro API-key quota mechanism.
- Rate limiting is approximate; Cloudflare warns a few seconds of enforcement delay can allow excess traffic through.
- Free/Pro defaults include cached assets in counters. This is useful for protecting a static/R2 snapshot endpoint, but thresholds must accommodate legitimate agent clients and shared NATs.
- The prior usage-billed legacy Rate Limiting product is documented as no longer available; current docs express availability through plan rule counts rather than per-request metering.

Official evidence: [Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)，页面标注 `dateModified: 2026-04-22`; [Rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)，页面标注 `dateModified: 2026-04-29`。

### Workers Rate Limiting binding

For the API Key tier, Cloudflare's Worker binding can rate-limit on any string, and official best practices explicitly list an API key in `Authorization` as a good key. It supports periods of `10` or `60` seconds and separate namespaces for free/paid tiers.

Limits and implications:

- It only runs **after the Worker starts**, so rejected requests still consume a Worker invocation and some CPU.
- Counters are local to each Cloudflare location, permissive, and eventually consistent; Cloudflare says not to use them as an accurate accounting system.
- Suitable for abuse control/burst limits, not authoritative monthly billing quota. Durable central accounting or a database ledger is still required for exact usage/billing, but that adds cost and complexity.
- The examined page states no distinct metered price; do not infer “free” from silence. The Worker request/CPU itself remains billable.

Official evidence: [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)，页面标注 `dateModified: 2026-04-23`。

### Bot protection

- Free Bot Fight Mode is domain-wide, challenges known simple bots/headless browsers, and cannot be skipped by custom rules.
- Pro/Business Super Bot Fight Mode provides allow/block/challenge controls and can be skipped for selected traffic via a custom rule.
- Enterprise Bot Management adds bot scores and fine-grained rule use.

For a deliberately machine-consumable public API, enabling non-exemptable Free Bot Fight Mode can block legitimate agents and monitors. Prefer explicit IP rate limits and WAF rules for the public data hostname, or Pro/Business SBFM with an API-path skip policy and separate controls. “Block AI bots” is directionally opposite to the stated goal of making data agent-friendly unless limited to HTML/site scraping paths.

Official evidence: [Bot Fight Mode Free](https://developers.cloudflare.com/bots/plans/free/); [Super Bot Fight Mode Pro](https://developers.cloudflare.com/bots/plans/pro/); [Business bot plan](https://developers.cloudflare.com/bots/plans/biz-and-ent/); [Security feature interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).

### API Shield and API Key

API Shield should not be treated as a ready-made API-key issuance/management product:

- Free, Pro, Business, and Enterprise without the API Shield subscription only receive Endpoint Management and Schema Validation.
- Full API Shield requires Enterprise plus an API Shield subscription.
- Non-subscribed limits: Free `100` saved endpoints / `5` schemas / `200 kB`; Pro `250` / `5` / `500 kB`; Business `500` / `10` / `2 MB`.
- API Shield runtime authentication features include JWT validation and mTLS; the reviewed official feature list does not expose a general API-key issuance, revocation, quota, or developer-portal service.

Therefore PriceAI should manage conventional API keys in its own application layer (store only a hash/fingerprint plus status/tier/owner, show plaintext only once), validate them in a Worker/API route, and use the Workers rate-limit binding for burst protection. API Shield schema validation can still be useful for contract enforcement, but it is not required for P1 and does not replace key lifecycle management.

Official evidence: [API Shield plans](https://developers.cloudflare.com/api-shield/plans/)，页面标注 `dateModified: 2026-04-15`; [API Shield overview](https://developers.cloudflare.com/api-shield/); [JWT validation](https://developers.cloudflare.com/api-shield/security/jwt-validation/).

Cloudflare also documents timed HMAC token validation in WAF custom rules for Pro/Business/Enterprise. This is suited to signed expiring asset URLs, not normal long-lived per-developer API keys or per-key quota tracking. Evidence: [Configure token authentication](https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/)，页面标注 `dateModified: 2026-05-05`。

## Proposed P1 Guardrails

1. Put anonymous snapshots on a dedicated hostname, preferably `data.priceai.cc`, backed by R2 custom domain.
2. Use R2 Standard storage, immutable version objects, a small `latest.json` pointer, explicit JSON Cache Rule, and Smart Tiered Cache.
3. Allow only `GET`, `HEAD`, and necessary `OPTIONS`; block unexpected methods in WAF before application execution.
4. Add a coarse IP rate limit at the zone edge. Start permissive because legitimate agents may share NATs; tune from Security Analytics rather than guessing.
5. Keep query space closed: enumerated product/category/filter snapshot paths only. Reject arbitrary filters on the anonymous layer.
6. Return `ETag` / `Last-Modified`, content generation timestamp, snapshot version, and documented refresh cadence. Browser conditional requests still count as requests if routed to Worker, so validators help bandwidth/freshness but are not the primary Workers-billing control.
7. Keep the authenticated API on a separate hostname/path and Worker. Validate API key, then apply per-key burst rate limit. Reserve exact quotas/history/complex queries for this layer.
8. Do not enable Workers Cache globally without measuring its billing impact: it can convert free static asset traffic into Standard Requests.

## Measurements Needed Before Implementation

These are not answered by product billing totals and require account/repo inspection:

- Current zone plan (Free/Pro/Business/Enterprise) and whether Workers Cache is enabled.
- Which routes and user agents account for the `44.15M` Worker requests and `1.1B` CPU ms.
- CPU per route (`p50`, `p95`, total CPU), especially page crawls versus `/api/*`.
- R2 bucket/object-key operation distribution: `GetObject` vs `HeadObject`, and which code paths perform multiple reads.
- Current `CF-Cache-Status` for candidate snapshot routes and whether query parameters explode cache keys.
- OpenNext static-asset routing and any `run_worker_first` patterns.
- Whether current snapshot refresh writes are already grouped into reusable objects or are reassembled per request.
- Controlled validation that WAF-blocked traffic does not increment Workers billed-request metrics for this account/configuration.

## Decision Summary

| Decision | Recommendation | Confidence |
|---|---|---:|
| Optimize only Standard Requests? | No; CPU is the largest screenshot cost, then requests, then R2 Class B | High (screenshot arithmetic) |
| Put cache inside current dynamic API? | Transitional only; lowers CPU/backend work but not Standard Requests | High (official billing docs) |
| Anonymous public API backend | R2 custom domain + Cache Rule + Smart Tiered Cache | High |
| Static asset alternative | Best unit economics if refresh can be deployment-coupled and asset routing is confirmed | High |
| Public API query model | Bounded/versioned snapshot keys, not arbitrary filters | Medium (architecture inference) |
| API Key layer | Separate Worker path with application-managed keys and per-key burst limiting | High |
| API Shield required for P1 | No; schema tools optional, full runtime suite is Enterprise subscription | High |
| Bot Fight Mode on public API | Avoid non-exemptable mode; use targeted WAF/rate-limit policy | High |

## Caveats / Not Found

- Cloudflare's web search endpoint returned 502 during this research, so official Markdown pages were fetched directly from `developers.cloudflare.com`; no secondary sources were substituted.
- Cloudflare docs do not state a separate price for the Workers Rate Limiting binding on the examined page. This report deliberately does not label it free.
- Cloudflare docs establish security-phase order and Worker request billing definitions, but do not explicitly state in the cited pages that WAF-blocked requests are excluded from Workers billed requests. That point is marked as inference and should be tested.
- Current PriceAI zone plan, flags, Cache Rules, Worker configuration, route-level analytics, and R2 object access logs were outside this external-doc audit and remain required for a final cost model.
