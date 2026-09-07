# Research: PriceAI 公开价格雷达仓库现状

- **Query**: 定位现有公开/内部 API、标准商品与快速筛选、最低价与 Top N 数据链路、持久快照、缓存与 R2 路径、机器发现、限流与 API Key 基础，并判断公开价格雷达可复用面和成本风险。
- **Scope**: internal
- **Date**: 2026-07-21

## Findings

### 结论摘要

PriceAI 已经具备“公开价格雷达”首期所需的大部分数据底座，但尚未形成正式、稳定、可发现的开发者 API 产品面。

可直接复用的核心是：标准商品目录、产品最低可用价、商品默认报价第一页、单个快速筛选标签的快照键、`public_api_snapshots` 持久 JSON、3/5/60 分钟分层刷新、Cloudflare Cache API，以及当前正在使用的 service-role-only RPC。最适合首期公开的不是现有任意条件查询，而是少量固定资源，例如全商品摘要、单商品价格雷达、单商品预定义标签雷达。

但“把网页爬取改成 API 调用”本身不会自动减少 Workers Standard Requests。现有 API 仍进入 OpenNext Worker；Cache API 命中可以降低 CPU、Supabase 回源和间接的 R2 压力，但每次请求仍需要 Worker 处理。若首要 KPI 是 Standard Requests，总量控制还需要 Cloudflare 层限流/拦截、调用额度、客户端条件请求与轮询纪律，或者把可公开快照变成不经过主 OpenNext Worker 的静态对象分发面。此结论需要结合 Cloudflare 路径级指标验证实际收益。

当前本地 `main` 比 `origin/main` 多一个文档提交，但业务代码无提交差异；工作树另有用户改动和未跟踪文件。本轮未连接生产 Supabase、未读取 Cloudflare Analytics、未调用线上 API，因此仓库结论不能证明当前生产部署、快照刷新 timer、缓存命中率或具体成本归因已符合代码。

### 当前对外与内部 API 面

公开价格读取路由：

| Route | 数据函数 | 当前缓存与限制 | 价格雷达复用判断 |
|---|---|---|---|
| `GET /api/explorer` | `getExplorerData()` | Cloudflare Cache API，固定无参数缓存键，300 秒；先读 `explorer/default` 持久快照 | 最适合直接改造成“标准商品摘要/最低价”数据源 |
| `GET /api/offers` | `listPublicOffers()` | Cloudflare Cache API，规范化查询键，300 秒；仅首屏和少量白名单视图可读持久快照 | 不宜原样作为匿名开放 API；参数空间仍大 |
| `GET /api/products/[id]/offers` | `listPublicProductOffers()` | Cloudflare Cache API，规范化查询键，300 秒；默认首屏或单标签可使用持久快照 | 最适合复用为单商品 Top N 与单标签雷达 |
| `GET /api/merchants` | `listPublicMerchants()` | 有 CDN cache headers 和持久快照，但路由没有 `withCloudflarePublicCache()` | 对机器人高频访问更容易重复进入数据函数；不是首期价格雷达必需资源 |
| `GET /api/api-transit-stations/[slug]/detail` | `getTransitStationBySlug(..., includeHistory:true)` | 600 秒 CDN headers，但路由没有显式 Cache API wrapper；每次业务 load 优先读实时 Supabase 并再补 history | 独立域，不能直接视为低成本价格快照出口 |

路由证据：`src/app/api/explorer/route.ts:8-26`、`src/app/api/offers/route.ts:12-65`、`src/app/api/products/[id]/offers/route.ts:14-74`、`src/app/api/merchants/route.ts:10-38`、`src/app/api/api-transit-stations/[slug]/detail/route.ts:6-46`。

仓库当前没有 `src/app/api/public/v1/...`、OpenAPI/Swagger route、PriceAI 自身的 `/.well-known` 价格雷达发现文档，也没有公开快照下载路由。仓库中 `/.well-known/ai-transit.json -> /api/public/transit/v1/snapshot` 是 PriceAI 对第三方中转站的采集协议，不是 PriceAI 自己对外提供的端点。

管理与刷新入口已经存在：`POST /api/admin/public-api-snapshots` 使用 admin/cron 鉴权、300 秒跨运行 lease，并在成功后 revalidate 公共路径，见 `src/app/api/admin/public-api-snapshots/route.ts:7-49`。服务器脚本通过 `CRON_SECRET` 调用该端点并对 dirty 积压和刷新失败告警，见 `scripts/refresh-public-api-snapshots.mjs:5-31`、`:79-124`；GitHub Actions 每 30 分钟兜底，主刷新预期由服务器 systemd timer 承担，见 `.github/workflows/refresh-public-api-snapshots.yml:3-6`、`:76-110`。

### 标准商品、最低价与 Top N

标准商品目录由 `canonicalCatalog` 和数据库中的 active canonical products 共同支撑；公开侧再经过 `publicCatalogProducts()` / `isPublicCatalogProduct()` 过滤。代码入口见 `src/lib/catalog.ts:80`、`:936-1007`，Explorer 输出会再次清理非公开产品，见 `src/lib/data.ts:2453-2462`。

Explorer 的每个商品摘要已经包含：`id`、`slug`、展示名、平台、商品类型、规格、描述、报价数、有货数、最低价、最低报价、长期质保最低价、最新采集时间等，见 `src/lib/data.ts:6440-6464`。因此首期“每个标准商品当前最低价”不需要新建聚合链路。

最低价不是简单的数据库 `min(price)`：商品先按公开可用状态排序，再排除共享、国内镜像、网页号；Telegram Premium 默认还排除 Stars，之后取价格最低项。见 `src/lib/catalog.ts:968-985`、`:1009-1042`、`:1057-1075`。公开 API 应沿用这个“可购买最低价”口径，并显式给出 `ranking_policy` 或等价版本字段，否则第三方可能误以为它是所有原始报价的数学最小值。

仓库没有独立的“Top 5 商品价格”实体或快照字段。可复用方式是从商品报价快照中取前 N 条：`comparePublicOffers()` 先按公开可用、非共享/非镜像/非网页号/非 Stars 排序，再按价格和时间排序，见 `src/lib/data.ts:6650-6681`；商品报价 RPC/回退路径也按这个公开排序返回。因此 `offers.slice(0, 5)` 能得到与现有产品体验一致的前五候选，但应在新 API 响应中固定 N 上限并声明排序口径。

当前默认商品快照是 30 条而非 5 条：`PUBLIC_PRODUCT_OFFERS_SNAPSHOT_LIMIT = PUBLIC_OFFER_DEFAULT_LIMIT`，默认值 30，见 `src/lib/data.ts:182-196` 和 `src/lib/public-offer-query.ts:1-4`。这足够派生 Top 5，无需新增数据库查询。

### 快速筛选标签与快照覆盖

快速筛选标签已经是结构化枚举，不是仅存在于 UI 文案。`OfferFilterTagId` 和 `OFFER_FILTER_TAGS` 定义了交付方式、Plus 渠道、Team 类型、时长、Gemini 条件、接码、Telegram、质保等组，见 `src/lib/offer-filter-tags.ts:1-75`、`:75-334`。标签还会按商品适用性过滤，代码入口为 `parseOfferFilterTagsForProduct()`，调用点见 `src/lib/data.ts:2421-2434`。

持久快照键已经支持商品默认视图和“恰好一个适用标签”的视图：

```text
v5-plus-account-state-tags:default:<product>:limit:30
v5-plus-account-state-tags:tag:<tag>:<product>:limit:30
```

证据：`src/lib/data.ts:2393-2430`、`:2604-2608`。任意搜索词、排除词、collector、价格区间、组合标签或非首屏分页都不会获得商品快照键，而会继续走 RPC。

重要边界：后台批量刷新 `refreshPublicProductOfferSnapshots()` 当前只主动生成每个商品的默认快照，未循环生成所有单标签快照，见 `src/lib/data.ts:1111-1147`。单标签快照属于“首次请求命中白名单后查询并写入”的懒生成路径，见 `src/lib/data.ts:4791-4838`。因此不能把当前单标签快照理解为所有常用标签都已按 3–5 分钟主动预计算。若首期承诺常见标签 API，应明确一小组产品 × 标签组合，并在刷新任务中主动物化，而不是让智能体第一次访问触发商品 RPC。

### 持久快照与刷新模型

`public_api_snapshots` 以 `(kind, cache_key)` 为主键，存放 `schema_version`、JSON payload、`generated_at`、`updated_at`，RLS 开启且只授权 service role，见 `supabase/migrations/20260624083000_public_api_snapshots.sql:1-17`。支持的 kind 包括 `explorer`、`offers`、`product_offers`、`merchants`、`refresh_state`、`api_transit`，见 `src/lib/public-api-snapshots.ts:10-20`。

正常读取每次会向 Supabase 查询一行快照，超时 2.5 秒；写超时 15 秒，见 `src/lib/public-api-snapshots.ts:7-10`、`:33-105`。换言之，持久快照并非 R2 文件或进程内常驻对象：Cloudflare Cache API/模块内缓存未命中时仍有一次 Supabase HTTP + JSONB 读取。首期 API 若复用该表，仍应把边缘命中率作为首要指标。

刷新策略为：局部 dirty 最短 3 分钟、global 最短 5 分钟、最多 60 分钟触发一次 full refresh、每批刷新 4 个商品；快照 fresh 上限为两个 300 秒价格 TTL，即 10 分钟。见 `src/lib/data.ts:204-212`、`:562-705`、`:971-1045`、`:2285-2297`。

所有公开请求都可能在快照过期/缺失后回源并回写快照，因为 `PUBLIC_PRICE_CACHE_ONLY_MODE = false`，见 `src/lib/public-price-emergency.ts:1`、`src/lib/data.ts:1428-1466`、`:4776-4911`、`:5172-5255`。因此当前模型是 snapshot-first，不是严格 snapshot-only。对于匿名价格雷达 API，若目标是保护成本，建议读取端只返回最新成功快照或明确的 stale 状态，不允许外部请求触发聚合和快照写入。

### 数据库读路径与确定的放大点

全站 offers 已新增 `public_offer_read_model`：保存去重后的公开报价、标准商品字段、可用状态、排序字段和搜索 haystack，并有 B-tree 与 trigram GIN 索引，见 `supabase/migrations/20260721180000_public_offer_read_model.sql:4-71`。`list_public_offers_page_v2` 从该读模型读取，见同文件 `:377-453`；应用会在 v2 RPC 缺失时回退到 legacy RPC，见 `src/lib/data.ts:5702-5738`。

这层能减少每次 `/api/offers` 对原始报价的去重计算，但刷新成本仍重：无论是 full 还是 product-scoped 刷新，都会先调用 `refresh_public_offer_read_model()`，见 `src/lib/data.ts:997-999`、`:1048-1060`、`:5769-5779`。数据库审计已确认它是全量重建，因此高频局部更新可能把小变更放大成全表写入。这个问题影响“刷新成本”，不是公开 API 单次读取成本。

商品详情仍通过 `list_public_product_offers_page` / `list_public_product_offers_page_v2` 读取；带任意服务端筛选时使用 v2，同时独立请求 filter facets，见 `src/lib/data.ts:4931-5022`、`:5025-5041`。因此一次未命中商品快照的请求通常至少包含商品报价 RPC 和 facet RPC，复杂条件更容易放大 Supabase 与 Worker CPU。

全站 offers 的任意 `q`、价格区间、非首屏分页，以及非白名单筛选不会使用持久快照，见 `src/lib/data.ts:2335-2361`；商品任意组合标签、搜索、排除词、collector、价格区间也不会使用持久快照，见 `src/lib/data.ts:2393-2430`。虽然路由 Cache API 会规范化有效参数，攻击者仍可以通过大量不同合法搜索词、区间、offset 和组合制造高基数 MISS。

公开分页已经限制为 `limit <= 200`、`offset <= 5000`、query 最长 80 字符，见 `src/lib/public-offer-query.ts:1-4`、`:28-65`。这是止血措施，但不是读取额度控制。

### Cloudflare Cache、R2 与 Standard Requests

价格 API 的响应策略是浏览器 `must-revalidate`，Cloudflare/CDN `s-maxage=300`，降级结果 60 秒，见 `src/lib/cache-headers.ts:10-48`、`src/lib/public-cache-policy.ts:1-4`。`/api/explorer`、`/api/offers`、商品报价显式使用 `caches.default`，缓存键只保留业务白名单参数并排序；带 `Authorization` 的请求直接 bypass，见 `src/lib/cloudflare-edge-cache.ts:10-55`、`src/lib/cloudflare-cache-key.ts:1-26`。

这个封装会在 Worker 内执行 `cache.match()` / `cache.put()`，命中时能跳过数据 load，但请求已经进入 Worker，见 `src/lib/cloudflare-edge-cache.ts:19-35`。因此：

- 能降低命中请求的 Worker CPU、Supabase 请求、JSON 生成和 egress。
- 不能据仓库代码证明会降低 Workers Standard Requests 数量。
- `Authorization` 作为 API Key 载体会默认禁用该层缓存；未来 API Key 若放在 `Authorization`，应先鉴权/计量，再使用不含密钥的共享公共快照缓存，或分开匿名静态资源与带 Key 增强查询。

R2 的主要公开运行时路径不是 `public_api_snapshots`。OpenNext incremental cache 使用 R2，并被 regional Cache API 包裹，见 `open-next.config.ts:1-11`；绑定为 `NEXT_INC_CACHE_R2_BUCKET`，另有反馈证据 R2，见 `wrangler.jsonc:59-67`。赞助图、社区图、API 中转 logo 也会回源对象存储，但已有独立 Cache API 读写层，见 `src/lib/cloudflare-public-asset-cache.ts:7-52`。

价格 JSON 路由自身使用 Cloudflare Cache API + Supabase 快照，不直接读 R2。因此截图中的 R2 Class B 高使用量不能从价格 API 代码直接归因；更可能涉及 OpenNext 页面 incremental cache 或公开对象资产，但必须按 binding/path 的线上指标确认。将机器人从页面/RSC 请求引导到单个 JSON 快照，理论上可减少页面渲染和 R2 incremental-cache 读取，但这仍是待验证假设。

### Robots 与机器发现

`robots.ts` 对所有 user-agent 明确 disallow `/api/` 和常见查询参数，见 `src/app/robots.ts:5-31`。这能给守规矩爬虫信号，但无法阻止主动脚本或智能体直接调用站内接口。

`public/llms.txt` 已说明 PriceAI 的领域、重要页面、数据边界和“最低价应基于可用报价”，见 `public/llms.txt:1-75`；但未列出任何机器可调用 API、schema、刷新频率、限额或条件请求协议。当前也没有 OpenAPI、API docs、开发者门户或 PriceAI 自身的 `/.well-known` discovery。

首期可复用现有 `llms.txt` 作为发现入口，但应把“网页给人看、快照 API 给机器读”的规则写成明确机器导航，并让 robots 对新的固定公开快照路径单独 allow；否则 discovery 与 robots 的 `/api/` 全禁规则相互矛盾。

### 限流与 API Key 基础

仓库目前没有面向公开价格消费者的 API Key 表、Key hash、scope、状态、额度、用量事件、开发者账户或密钥管理路由。搜索到的 API Key 主要是中转站检测用户临时输入、内部风控服务密钥和外部采集密钥，与“PriceAI 数据 API consumer key”不是同一概念。

公开 GET 价格路由没有应用层读取限流。`src/lib/public-request.ts:5-143` 提供的是公开写请求的内存计数器；它按 Worker isolate/进程保存，不能作为跨 PoP 的读取额度。仓库已有可借鉴的持久化配额模式：反馈证据上传使用 HMAC key hash + Supabase 原子 quota RPC，见 `supabase/migrations/20260716120000_audit_closeout_runtime_controls.sql:145-238` 和 `src/lib/feedback-evidence.ts:75-76`，但直接复用数据库 RPC 为每个匿名 API 请求计数会重新制造数据库/CPU成本。

因此 API Key 适合作为第二层能力，而不是首期所有固定快照的必经路径：

1. 匿名层只提供固定、共享、强缓存快照和低频合理额度。
2. API Key 层提供更高额度、历史、提醒、Webhook 或有限组合查询。
3. Key 只存 hash + prefix/last4；不要存明文。
4. 限额优先放 Cloudflare 原生层或边缘状态层；数据库保存账单/日汇总，不应每请求同步写 Supabase。
5. 不应直接沿用当前 `Authorization => Cache BYPASS` 行为，否则 API Key 用户越多，缓存收益越差。

### 可直接复用的首期产品面

建议把首期合同限制为固定资源，不把现有动态路由原样公开宣传：

| 首期资源 | 可复用数据 | 是否需要新聚合 |
|---|---|---|
| 标准商品目录 + 当前最低价 | `explorer/default` 中的 product summaries | 不需要；只需稳定 schema 与字段白名单 |
| 单商品价格雷达 | 默认 `product_offers` 快照前 5 条 + facets 元数据 | 不需要新查询；需要裁剪 payload 和版本化 |
| 单商品常用标签价格雷达 | 现有单标签 snapshot key | 需要把选定标签从 lazy 变成主动预热 |
| 数据新鲜度 | `generatedAt`、报价时间字段、degraded/message | 建议补 `snapshot_age_seconds`、`stale`、`ranking_policy` |
| 机器发现 | `llms.txt` 可扩展 | 需要新增固定 API discovery/OpenAPI 文档 |

首期不应开放：任意 `q`、任意标签组合、任意价格区间、深分页、全量 raw offers 导出，以及由读取请求触发聚合/刷新。否则只是把网页爬虫变成高基数 API 爬虫。

### 可能导致 Worker / Supabase / R2 浪费的路径

1. `/api/offers` 的合法高基数查询参数可制造大量 Cache API MISS，并落到 RPC。
2. 商品报价任意组合筛选 miss 时，会执行报价 RPC + facet RPC。
3. 单标签持久快照当前懒生成，首次访问和过期后访问仍会触发 RPC 与写快照。
4. `/api/merchants` 和 API 中转详情只有响应 cache headers，没有当前三条价格核心路由那样的显式 `caches.default` wrapper；实际 CDN 是否缓存需线上确认。
5. snapshot-first 而非 snapshot-only，外部读取可在快照过期时成为回源触发器。
6. product-scoped dirty 刷新仍全量重建 `public_offer_read_model`，会放大刷新期数据库写入。
7. 把 API Key 放入 `Authorization` 会触发现有 Cache API bypass。
8. 页面爬取可能包含 HTML、RSC、客户端 JSON 和图片多请求；转成单 JSON 有机会降低总请求与 R2，但若智能体高频轮询，Standard Requests 仍可能继续增长。

### 必须用线上指标验证的结论

以下问题无法由仓库静态代码回答：

- 44.15M Standard Requests 中，页面、RSC/prefetch、价格 API、图片代理、cron、健康检查、机器人分别占多少。
- 1.1B CPU ms 的 Top path、P50/P95/P99 CPU，以及 `X-PriceAI-Edge-Cache=HIT/MISS/BYPASS` 各自占比。
- `/api/explorer`、`/api/offers`、商品报价当前生产是否已部署 `withCloudflarePublicCache()`，不同 PoP 的实际命中率和缓存驻留时间。
- R2 25.67M Class B 分别来自 `NEXT_INC_CACHE_R2_BUCKET`、反馈 bucket 或其他绑定的比例，以及按路由的相关性。
- 服务器 systemd 主 timer 是否正常、dirty backlog、last full/global/product refresh 时间和失败率。
- 新的 `public_offer_read_model` migration 是否已经由 Supabase GitHub Integration 应用到生产，v2 RPC 是否命中还是频繁走 legacy fallback。
- 机器人 UA、ASN、IP、国家、path、query cardinality、轮询周期，以及遵守 robots 的比例。
- 将常见爬取任务改为单固定快照后，用户任务级总请求数是否从“HTML + RSC + 多 JSON/资产”下降到一次请求。

建议线上基线至少按 `path + normalized query shape + UA/bot + ASN + cache state + status` 聚合 Requests 与 CPU，并按 R2 binding 观察 Class B；上线固定快照 API 后做 24–72 小时前后对比。不能只看总账单判断 API 是否有效。

### Files Found

| File Path | Description |
|---|---|
| `src/app/api/explorer/route.ts` | 标准商品摘要/最低价公开路由 |
| `src/app/api/offers/route.ts` | 全站报价动态筛选路由 |
| `src/app/api/products/[id]/offers/route.ts` | 单商品报价与快速筛选路由 |
| `src/app/api/merchants/route.ts` | 商家聚合公开路由 |
| `src/lib/data.ts` | 快照选择、刷新、RPC 回退、最低价与公开结果主链路 |
| `src/lib/public-api-snapshots.ts` | Supabase 持久 JSON 快照读写 |
| `src/lib/offer-filter-tags.ts` | 快速筛选标签定义与适用规则 |
| `src/lib/cloudflare-edge-cache.ts` | 公开 JSON 的 Cloudflare Cache API 包装 |
| `src/lib/cloudflare-cache-key.ts` | 规范化缓存键 |
| `src/lib/cache-headers.ts` | CDN/Cloudflare cache headers |
| `src/lib/public-request.ts` | 公开写请求限流，非 GET/API consumer 配额 |
| `src/app/robots.ts` | 当前禁止抓取全部 `/api/` |
| `public/llms.txt` | 现有智能体可读说明，但无 API discovery |
| `supabase/migrations/20260624083000_public_api_snapshots.sql` | 持久快照表 |
| `supabase/migrations/20260721180000_public_offer_read_model.sql` | 新全站公开报价读模型和 v2 RPC |
| `open-next.config.ts` | OpenNext R2 incremental cache + regional cache |
| `wrangler.jsonc` | R2 bindings |
| `.github/workflows/refresh-public-api-snapshots.yml` | 30 分钟兜底刷新 |
| `scripts/refresh-public-api-snapshots.mjs` | 服务器刷新调用与告警 |

### Related Specs

- `docs/workers-cost-optimization-product-plan-2026-06-23.md`：历史成本治理方案，已经确立“热点预生成、请求轻量读取、异常访问受控”的方向；历史数值不可当作 2026-07-21 当前值。
- `docs/planning/archive/pending/product/2026-07-21_priceai-supabase-database-flow-audit.md`：当前本地数据库流程只读审计，指出局部刷新全量重建、动态商品 RPC 和 dirty 并发风险。
- `scripts/check-performance-guards.mjs`：对快照 TTL、刷新批次、读模型、缓存键和 R2 regional wrapper 的防回归断言。

## Caveats / Not Found

- 未发现面向 PriceAI 数据消费者的 API Key / developer credential 实现。
- 未发现 PriceAI 自身对外的 `/api/public/v1`、OpenAPI、固定价格快照下载或 `.well-known` discovery。
- 未发现独立 Top 5 存储；Top 5 可从已排序的默认/标签商品报价快照派生。
- 未发现仓库内 Cloudflare WAF / Rate Limiting Rules 配置；Dashboard 规则可能存在，但本轮未检查。
- 未检查生产数据库、Cloudflare Analytics、R2 Analytics、systemd timer 或线上响应，因此所有生产状态和成本归因均待验证。
