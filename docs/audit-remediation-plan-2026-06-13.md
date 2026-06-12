# PriceAI 审计问题修复专项方案

> 日期：2026-06-13
> 关联审计：`docs/engineering-audit-2026-06-12.md`、`docs/performance-audit-2026-06-13.md`
> 目标：把审计发现转化为可执行、可验证、可回滚的修复计划。每项必须说明不修复的损失、修复收益、修复风险和验收方式。

## 1. 背景与原则

这次专项不是单纯清 bug，而是围绕 PriceAI 当前最核心的约束做修复：用户侧访问要快，价格数据要可信，Vercel 和 Supabase 免费/低成本资源不能被无效请求和全表读取打穿。

执行原则：

- 先修会放大资源消耗、影响数据正确性或导致静默失效的问题。
- 所有性能修复都要说明对 `Vercel Edge Requests`、`Supabase Egress`、数据库读写、TTFB 或前端交互延迟的影响。
- 缓存不能牺牲价格可信度。页面必须继续展示采集时间和更新时间，必要时提供手动刷新或重试，而不是假装数据实时。
- 任何涉及采集、下架、库存、价格的修复都要优先保证数据不会误隐藏、误下架、误标缺货。
- 部署后必须用生产接口响应头、payload size、Vercel/Supabase/Cloudflare/Umami 指标做复查。

## 2. 当前核验结论

| 审计项 | 当前状态 | 说明 |
|---|---|---|
| 价格 API 本地 `no-store` | 已修一半 | 本地代码已恢复短缓存，但生产 `/api/offers` 和 `/api/products/[id]/offers` 仍返回 `no-store`，需要重新部署或排查缓存头未生效原因。 |
| 详情页读 `searchParams` | 仍存在 | 会让详情页有退出 ISR / 静态缓存的风险。 |
| 详情页双查报价 | 仍存在 | 展示查 80 条，JSON-LD 再查 1200 条。 |
| facets RPC 失败全表 fallback | 仍存在 | facets 失败会放弃分页 RPC，回退到全量读取路径。 |
| filter tags SQL/TS 双实现 | 仍存在 | 规则漂移与 DB 正则扫描都还在。 |
| ProductOffersPanel 翻页 race | 仍存在 | 切筛选时旧分页响应可能污染新列表缓存。 |
| edge collector `--loop` | 仍存在 | 默认只跑一轮，常驻采集实际失效。 |
| collector-agent cooldown/锁 | 仍存在 | 边缘节点可能绕过主采集器冷却策略。 |
| 官方地区价 cron 迁移承接 | 仍存在 | Cloudflare 迁移计划没有承接 Vercel cron。 |
| 全表 fallback / admin 全表统计 | 仍存在 | 极端情况下会造成 Supabase 出口和 DB 负载放大。 |
| 2 分钟客户端自动刷新 | 仍存在 | SSR 后客户端容易重复请求 API。 |

## 3. 优先级总览

| 优先级 | 修复主题 | 直接收益 | 主要风险 |
|---|---|---|---|
| P0 | 生产缓存一致性 | 立刻降低重复回源、Vercel/Supabase 压力 | 缓存过久导致用户看到旧报价 |
| P0 | 详情页 ISR 与双查询 | 降低详情页 TTFB、DB 查询和边缘请求 | 筛选参数从 SSR 改为客户端解析会有轻微加载状态变化 |
| P0 | facets fallback 与翻页 race | 避免 RPC 故障时全表读取，避免筛选列表污染 | 需要覆盖筛选、分页、缓存回归 |
| P0 | 客户端自动刷新策略 | 降低无意义 API 请求 | 数据新鲜度感知需通过更新时间/手动刷新补足 |
| P1 | edge collector 修复 | 避免边缘节点静默不跑、误下架、过度采集 | 采集任务调度逻辑需要谨慎验证 |
| P1 | Supabase 读写放大治理 | 降低 egress、索引膨胀和 IO 抖动 | DB migration 需要先在本地/远端验证 |
| P1 | Cloudflare 迁移 cron 承接 | 避免官方地区价切换后静默停更 | 多环境 cron 可能重复触发 |
| P2 | filter tags 生成列 + GIN | 长期降低 DB 正则扫描，统一规则源 | 迁移会改表结构，需要回填和索引构建 |
| P2 | 前端渲染与错误兜底 | 提升移动端和弱网体验 | 组件拆分可能带来 UI 回归 |
| P3 | 代码组织与低优债务 | 提高开源可维护性 | 短期收益不如 P0/P1 明显 |

## 4. P0 修复计划

### P0-1 生产价格 API 缓存一致性

涉及：

- `/api/explorer`
- `/api/offers`
- `/api/products/[id]/offers`
- `src/lib/cache-headers.ts`

问题：

本地代码已设置价格 API 短缓存，但生产实测 `/api/offers` 与 `/api/products/[id]/offers` 仍是 `cache-control: no-store`、`cf-cache-status: BYPASS`。这意味着用户筛选、详情页报价加载、无限滚动仍会直接打到 Vercel 和 Supabase。

不修复的损失：

- 高频访问或爬虫访问会持续放大 Vercel Edge Requests。
- Cloudflare 无法拦住重复请求，Vercel 和 Supabase 都继续承压。
- Supabase Egress 会被重复 JSON 响应消耗，尤其是报价接口分页响应。
- 后续 Cloudflare 迁移评估会建立在错误缓存假设上。

修复收益：

- 相同 URL 在短时间内命中 Cloudflare/Vercel CDN，减少回源。
- Supabase RPC 和 Node serverless 执行次数下降。
- 热门详情页、热门筛选页的 TTFB 更稳定。
- 为后续推广流量提供最直接的成本缓冲。

预期指标影响：

- `Vercel Edge Requests`：如果 Cloudflare 命中，进入 Vercel 的请求数会下降；如果只命中 Vercel CDN，则源函数执行下降但 Vercel 边缘请求未必等比例下降。
- `Supabase Egress`：热门接口重复请求应明显下降。
- `/api/offers`、`/api/products/[id]/offers`：响应头应从 `no-store/BYPASS` 变为可缓存，并出现 HIT。

修复风险：

- 缓存 TTL 过长会让用户短时间内看到旧库存或旧价格。
- 不同筛选参数 URL 很多，缓存碎片化后收益低于预期。
- CDN 多层缓存可能导致上线后排查变复杂。

控制方式：

- 价格接口先使用短 TTL，例如 `s-maxage=120`、`stale-while-revalidate=600`。
- 前台继续显示采集更新时间，不把缓存数据包装成实时。
- 部署后用 `curl -I` 分别验证三个 API 的响应头和 HIT/BYPASS 状态。

验收：

- 生产端三个接口不再返回 `no-store`。
- Cloudflare `cf-cache-status` 至少在重复请求时可 HIT。
- Vercel Function Invocation 或 Supabase Egress 在 24-72 小时内出现下降趋势。

### P0-2 详情页保持 ISR，移除服务端 `searchParams`

涉及：

- `src/app/products/[id]/page.tsx`
- `src/components/ProductOffersPanel.tsx`

问题：

详情页当前在 Server Component 中读取 `searchParams`，用于初始报价筛选。App Router 里这类动态输入可能让页面退出静态/ISR 路径，导致每次访问详情页都重新执行服务端读取。

不修复的损失：

- 热门商品详情页无法稳定享受 ISR 缓存。
- 每次访问都可能触发商品摘要、报价、官方价等服务端读取。
- 用户点击详情页的 TTFB 更容易受 Supabase RTT 影响。
- Vercel Edge Requests 和函数执行时长持续增加。

修复收益：

- 详情页恢复稳定的静态/ISR 基线。
- 筛选参数改由客户端读取，不影响详情页 HTML 缓存。
- 商品详情页首屏更稳定，对 SEO 和国内弱网更友好。

预期指标影响：

- 详情页 `next build` route 类型应保持静态/ISR，而不是动态。
- 商品详情页 TTFB 应下降或更稳定。
- Supabase 商品详情相关 RPC 调用减少。

修复风险：

- 带 `?tags=`、`?q=` 的链接打开时，可能先显示无筛选基线，再由客户端加载筛选结果。
- 如果处理不好，会出现短暂的列表闪动。

控制方式：

- `ProductOffersPanel` 初始化时从 `window.location.search` 解析筛选参数。
- 筛选态加载时显示轻量 skeleton 或“正在应用筛选”状态。
- canonical 继续指向无参数详情页，避免 SEO URL 碎片化。

验收：

- `next build` 输出确认详情页没有被 `searchParams` 打成全动态。
- 打开带 tags/query 的详情页，筛选仍能正确应用。
- 返回首页筛选状态不受影响。

### P0-3 删除详情页 1200 条 JSON-LD 报价查询

涉及：

- `src/app/products/[id]/page.tsx`
- `src/lib/data.ts`
- Supabase RPC 或商品 summary 聚合

问题：

详情页为 JSON-LD 结构化数据额外查询最多 1200 条报价，但最终只需要 min/max/count 等聚合信息。这个查询在首访详情页时会造成明显额外 DB 读取和 JSON 序列化成本。

不修复的损失：

- 每个详情页首访都可能多一次大查询。
- Supabase Egress 被结构化数据消耗，而不是被用户真正看到的内容消耗。
- facets RPC 也可能被重复触发，进一步放大。

修复收益：

- 每个详情页减少一次大列表查询。
- JSON-LD 生成改为聚合数据，payload 和 DB 读取更小。
- 详情页首屏服务端耗时更可控。

预期指标影响：

- 详情页 server-side Supabase 查询次数减少。
- 商品详情首访 TTFB 降低。
- Supabase Egress 小幅下降，热门详情页收益更明显。

修复风险：

- JSON-LD 聚合字段如果计算不一致，可能影响搜索引擎结构化数据质量。

控制方式：

- 优先复用 `get_public_product_summary` 或新增轻量聚合 RPC。
- 保持 JSON-LD 只表达有货报价聚合，不塞完整报价列表。

验收：

- 详情页不再调用 `listPublicProductOffers(id, { limit: 1200 })`。
- JSON-LD 仍包含价格区间和可用报价数量。

### P0-4 facets RPC 失败不再放大全表 fallback

涉及：

- `src/lib/data.ts`
- `list_public_product_offer_filter_facets`
- `list_public_product_offers_page_v2`

问题：

当前逻辑中，facets RPC 失败会让整个报价分页 RPC 路径返回 null，然后回退到 `readPublicOfferData()` 全量路径。这是故障放大：一个非核心 facets 失败，导致主报价数据走最重读取路径。

不修复的损失：

- DB 偶发故障会被放大成全表扫描和全量 JSON 传输。
- Supabase Egress 峰值不可控。
- facets migration 或权限问题会直接拖垮公开报价接口。

修复收益：

- facets 失败时仍然使用分页 RPC 返回报价，只是标签计数为空。
- 故障降级方向正确：少显示筛选计数，而不是拉全表。
- 降低生产事故的资源放大倍数。

预期指标影响：

- RPC 异常时 `/api/products/[id]/offers` payload 不再突然变大。
- Supabase Egress 峰值更平滑。
- 错误日志仍能看到 facets 失败，但用户主报价列表可用。

修复风险：

- facets 为空时用户可能暂时看不到“可反代/长期质保”等筛选入口。

控制方式：

- facets 失败返回 `filterFacets: []`，报价分页照常。
- facets 与报价分页并行执行，减少串行等待。
- facets 缓存 key 不包含 `offset/limit`，避免每页重复计算。

验收：

- 模拟 facets RPC 失败，报价列表仍返回当前页数据。
- UI 不崩溃，只是不展示标签筛选计数。

### P0-5 修复报价翻页 race 与错误态吞列表

涉及：

- `src/components/ProductOffersPanel.tsx`
- `src/components/PriceExplorer.tsx`

问题：

用户切换筛选时，旧筛选的分页响应可能晚于新筛选返回，然后把旧数据合并进新列表并写入 session/memory cache。当前错误态也会在已有数据时直接替换整张列表。

不修复的损失：

- 用户可能看到不属于当前筛选条件的报价。
- 错误数据会被缓存 2 分钟，刷新后仍可能出现。
- 弱网下单次请求失败会让已加载报价全部消失，信任感下降。

修复收益：

- 筛选、分页、缓存一致性更可靠。
- 弱网失败时保留已加载数据，只在列表上方或按钮旁提示。
- 用户侧感知是“稳”，不是“突然空了”。

预期指标影响：

- 不直接降低 egress，但降低无效重复操作和刷新。
- 降低用户误判数据错误的概率。

修复风险：

- 加 guard/AbortController 后，如果状态判断写错，可能误丢弃有效分页响应。

控制方式：

- 每次请求捕获发起时的 filter key，返回后与当前 key 不一致则丢弃。
- `error && data` 时渲染 inline error，不替换列表。
- load more 失败只影响按钮区域，首屏失败才显示整面板错误。

验收：

- 快速切换标签并滚动加载，不混入旧筛选报价。
- 断网/超时后已加载报价仍保留，并出现重试入口。

### P0-6 调整客户端自动刷新阈值

涉及：

- `src/lib/client-refresh.ts`
- `src/components/PriceExplorer.tsx`
- `src/components/ProductOffersPanel.tsx`

问题：

当前 `DEFAULT_STALE_AFTER_MS = 2min`。首页或详情页拿到 SSR/ISR 数据后，只要数据生成时间超过 2 分钟，客户端就会自动重复请求 API。这和 30 分钟采集周期、ISR 周期不匹配。

不修复的损失：

- 大量用户打开页面后立即或短时间内重复请求 `/api/explorer` 和报价接口。
- Vercel Edge Requests、函数执行、Supabase 读取被无意义放大。
- 前端还可能在用户无操作时突然刷新，造成轻微抖动。

修复收益：

- 客户端 API 请求量明显下降。
- 页面更安静，弱网下更少出现自动超时错误。
- 缓存体系和采集周期更一致。

预期指标影响：

- 客户端 API Edge Requests 预计下降明显，具体以 Vercel 和 Cloudflare 指标验证。
- Supabase Egress 随重复 fetch 减少而下降。

修复风险：

- 用户看到的数据可能比原先多停留一段时间。
- 如果没有手动刷新入口，重度用户会觉得数据不够“新”。

控制方式：

- 将阈值提高到 15-30 分钟，或只在页面可见且用户操作时刷新。
- 前台继续显示“最近记录/更新时间”。
- 保留手动刷新或重试入口，尤其是详情页报价表。

验收：

- 首屏 hydration 后不会立刻重复请求 `/api/explorer`。
- 详情页停留 2 分钟不再自动发起无意义报价请求。

## 5. P1 修复计划

### P1-1 修复 edge collector 常驻与任务安全

涉及：

- `public/priceai-edge-collector.mjs`
- `src/app/api/admin/collector-agent/tasks/route.ts`
- `docs/collectors.md`

问题：

`--loop` 默认最大周期为 1，导致常驻模式只跑一轮。tasks 下发未复用主采集器 cooldown/锁体系，也没有明确 partial/full snapshot 边界。

不修复的损失：

- 部署边缘节点后看似成功，实际不会持续采集，数据静默断流。
- 多节点或 GitHub Actions 可能重复采同一渠道，增加风控概率。
- 部分快照被当成全量快照时，可能误下架存量报价。

修复收益：

- 边缘节点真正具备常驻采集能力。
- 降低链动小铺等风控敏感来源的重复请求。
- 避免误隐藏/误下架报价，提升数据可信度。

预期指标影响：

- 采集成功率更稳定。
- 单来源重复采集次数下降。
- crawl_runs 中失败/403 分组更可控。

修复风险：

- cooldown 过严会导致部分渠道更新变慢。
- partial snapshot 判断过保守会减少自动下架能力。

控制方式：

- `--loop` 默认无限循环，`--max-cycles` 只在显式传入时生效。
- tasks 下发前按 `last_checked_at`/`last_success_at` 做 cooldown。
- 下发或领取任务时写入轻量锁，避免多节点重复领取。
- 只有覆盖完整 shop token / category / page 的采集才标记 `fullSnapshot`。

验收：

- `--loop --interval 300` 至少连续跑两轮。
- 同一来源在 cooldown 窗口内不会重复下发。
- partial 成功不会触发批量缺失下架。

### P1-2 后台和公共 fallback 的 Supabase 读放大治理

涉及：

- `src/lib/data.ts`
- Supabase RPC/migration

问题：

`listVisibleRawOfferRows()` 和 `listSourceOfferStats()` 仍有全量读取路径。前者是公开接口 fallback，后者是后台统计。正常路径未必常触发，但一旦触发就是 egress 和 DB 负载放大。

不修复的损失：

- RPC 故障时公开页面会拉大量 raw_offers。
- 后台刷新会读全表统计，随着报价增长越来越贵。
- Supabase Egress 可能再次成为瓶颈。

修复收益：

- 极端故障下也有读取上限。
- 后台统计从全表行传输变成 DB 聚合结果传输。
- 公开接口 payload 更稳定。

预期指标影响：

- Supabase Egress 降低，尤其是后台访问和故障时段。
- DB 查询耗时更稳定。

修复风险：

- fallback 加 LIMIT 后，极端故障时展示数据可能不完整。
- 新增 RPC 需要 migration 和权限配置。

控制方式：

- fallback 明确标记 `degraded`，不伪装完整数据。
- 后台统计 RPC 只返回 source 聚合，不返回 raw row。
- service_role 权限保持，anon 不直接开放。

验收：

- fallback 最大读取行数可控。
- 后台 source stats 不再从 Node.js 拉全表聚合。

### P1-3 unchanged offers 写入节流

涉及：

- `src/lib/admin.ts`
- `raw_offers`

问题：

当前无变化报价也会刷新多列时间和 freshness 字段。30 分钟采集一次时，容易变成近似整表 UPDATE，造成 MVCC dead tuple、索引膨胀和 IO 抖动。

不修复的损失：

- Supabase 写入和索引维护成本持续增加。
- autovacuum 压力上升，查询性能可能被拖慢。
- 数据库小实例更容易出现偶发抖动。

修复收益：

- 大幅减少无变化报价的 UPDATE 次数。
- 降低索引膨胀和写 IO。
- 采集写回更轻，后续扩渠道更稳。

预期指标影响：

- Supabase DB 写入量、CPU/IO 压力下降。
- raw_offers 表/索引增长速度变慢。

修复风险：

- 如果节流太强，前台“更新时间”可能不反映最近一次成功采集。
- 用户关心“这条数据刚采过”，不能因为没变就显示很旧。

控制方式：

- 区分 `last_seen_at` / `verified_at` / `updated_at` 的语义。
- 可以保留轻量 `last_seen_at` touch，但避免刷新所有索引相关字段。
- 或按 2 小时窗口节流 unchanged refresh。

验收：

- 价格未变化时仍能知道最近成功采集时间。
- 写入结果返回 `unchanged/refreshed/written` 清晰。
- raw_offers 大批无变化时 UPDATE 数明显下降。

### P1-4 official price cron 迁移承接与 pending 告警

涉及：

- `vercel.json`
- `wrangler.jsonc`
- `src/lib/official-price-jobs.ts`
- `src/app/api/health/route.ts`

问题：

Vercel 当前承接两个官方地区价 cron。Cloudflare 迁移计划没有对应 scheduled handler 或替代 workflow。官方价任务只 enqueue，不检查 pending 堆积。

不修复的损失：

- 切到 Cloudflare 后官方地区价可能静默停更。
- worker 挂掉时 pending job 持续堆积，但 cron 仍返回 ok。
- 用户看到过期官方价，影响信任。

修复收益：

- 迁移后官方价刷新链路完整。
- pending 堆积能被 health/告警发现。
- 降低“静默腐烂”的运营风险。

预期指标影响：

- 不主要降低 egress，但显著提升数据可靠性。
- pending job age 成为可监控指标。

修复风险：

- Vercel 和 Cloudflare/GitHub Actions 双跑会重复 enqueue。
- 去重逻辑过强可能跳过必要刷新。

控制方式：

- 明确单一 cron owner：Vercel、GitHub Actions、Cloudflare Scheduled Worker 三选一。
- enqueue 前检查同类型 pending/running job。
- health 暴露最老 pending job age，超过阈值告警。

验收：

- 迁移计划明确官方价 cron 归属。
- pending 超 24h 能被 health 或 webhook 发现。

## 6. P2 修复计划

### P2-1 filter tags 生成列 + GIN 索引

涉及：

- `supabase/migrations/20260611193000_public_offer_filter_tags.sql`
- `src/lib/offer-filter-tags.ts`
- `src/lib/data.ts`

问题：

标签筛选现在 SQL 侧实时正则计算，TS 侧也有一份规则。两边规则已经存在细微差异，长期会导致 facets 计数和实际筛选结果不一致。

不修复的损失：

- 报价增长后 DB 正则扫描成本上升。
- 规则双写导致分类/筛选结果漂移。
- 用户点击筛选后可能看到数量和结果不一致。

修复收益：

- 标签变成存储生成列，查询可走 GIN 索引。
- SQL/TS 规则收敛为单一事实源。
- 筛选性能和正确性都更稳定。

预期指标影响：

- 标签筛选 RPC 耗时下降。
- DB CPU 正则计算下降。

修复风险：

- migration 构建生成列和索引时会短暂增加 DB 压力。
- 生成列函数必须保持 immutable，规则变更需要谨慎。

控制方式：

- 先在本地或备用 Supabase 项目验证 migration。
- 分阶段部署：新增列和索引，切 RPC，最后移除重复计算。

验收：

- RPC 返回 `filter_tags` 或直接使用生成列。
- facets 计数和筛选结果一致。

### P2-2 前端渲染、错误兜底和可访问性

涉及：

- `ProductOffersPanel`
- `PriceExplorer`
- `ApiModelsExplorer`
- `OfficialPricesExplorer`
- `app/error.tsx`
- `app/not-found.tsx`

问题：

部分组件移动端/桌面端双份 DOM 同时渲染，搜索缺少 debounce，弹窗可访问性不统一，全站缺少品牌化 error/not-found。

不修复的损失：

- 移动端大列表渲染更重。
- 弱网或异常时用户看到默认错误页或错误空态。
- 搜索输入每键触发全量重算，低端设备卡顿。

修复收益：

- 移动端首屏和滚动更轻。
- 错误页更可信，有明确返回路径。
- 搜索交互更稳定。

预期指标影响：

- 前端主线程渲染压力下降。
- 用户交互延迟下降。
- 不一定显著降低 egress，但能减少误操作和刷新。

修复风险：

- UI 拆分可能引入布局回归。
- debounce 会让搜索响应晚 200-300ms，但通常更自然。

控制方式：

- 复用 PriceExplorer 已有 `useMediaQuery` 模式。
- 浏览器检查桌面/移动关键路径。
- 弹窗统一 role、aria-modal、Escape、关闭按钮 label。

验收：

- 移动端不再同时渲染桌面表格和移动卡片。
- 404/error 页面有 PriceAI 品牌和返回入口。
- API/官方价搜索输入不再每键全量重算。

## 7. P3 修复计划

### P3-1 AdminConsole 拆分与 API 响应规范

问题：

AdminConsole 仍是 7000+ 行单组件，多个 admin API 直接回传 `error.message`。这些不是当前用户侧性能瓶颈，但会影响长期维护和开源质量。

不修复的损失：

- 后台迭代成本越来越高。
- 管理端输入或切 tab 可能重渲整个后台。
- 原始 DB 错误可能暴露内部细节。

修复收益：

- 后台按 tab 懒加载，管理端更快。
- API 响应信封统一，错误信息更安全。
- 开源项目结构更成熟。

风险：

- 拆分范围大，容易引入后台回归。

验收：

- `/admin` 首屏只加载登录壳和当前 tab。
- API 统一返回 `{ ok, message, data }` 或项目约定格式。

### P3-2 工程杂项清理

问题：

`node` 作为 devDependency、脚本硬编码 `node_modules/node/bin/node`、一次性脚本散落在 `scripts/`、临时文件较多。

不修复的损失：

- 新贡献者安装成本和困惑增加。
- 开源仓库目录观感下降。
- 脚本边界不清晰。

修复收益：

- 仓库更像成熟开源项目。
- CI/本地开发路径更清楚。

风险：

- 移除本地 node devDependency 可能影响当前机器上的 Next 16/Node 24 运行方式。

控制方式：

- 确认 Vercel/GitHub Actions 都使用 `.nvmrc`。
- 本地脚本调整后跑 `npm run build`、`npm run lint`。

## 8. 推荐执行节奏

### 阶段 A：缓存与详情页止血

范围：

- P0-1 生产缓存一致性
- P0-2 详情页去 `searchParams`
- P0-3 删除 1200 条 JSON-LD 查询
- P0-4 facets fallback 降级
- P0-5 翻页 race guard

收益：

- 立刻降低热门页面的回源和 Supabase 读取。
- 修掉最容易导致数据错乱的筛选/分页问题。
- 不影响采集链路，发布风险相对可控。

验证：

- `npm run lint`
- `npm run build`
- `curl -I` 验证三个 API cache header
- 浏览器验证详情页筛选、分页、返回首页状态

### 阶段 B：客户端重复请求与公共读取治理

范围：

- P0-6 自动刷新阈值
- P1-2 全表 fallback 上限
- `listSourceOfferStats` DB 聚合
- health/sitemap 轻量化

收益：

- 降低 Vercel Edge Requests 和 Supabase Egress。
- 减少爬虫、监控、后台访问造成的资源浪费。

验证：

- 生产接口 payload size 对比
- Supabase Egress 24-72 小时趋势
- Vercel Edge Requests 24-72 小时趋势

### 阶段 C：采集节点与写入放大

范围：

- edge collector loop
- tasks cooldown/锁
- partial snapshot
- unchanged offers 写入节流

收益：

- 采集更稳定，减少重复采集和误下架。
- 数据库写入和索引膨胀下降。

验证：

- `npm run collect:prices -- --list --kind shopApi`
- edge collector dry run / loop 测试
- crawl_runs 成功率、403 分组、写入数量对比

### 阶段 D：迁移兜底与长期 DB 优化

范围：

- 官方价 cron 承接
- pending job age 告警
- filter tags 生成列 + GIN

收益：

- Cloudflare 迁移不会丢定时任务。
- 标签筛选具备长期扩容能力。

验证：

- migration 本地/备用项目验证
- health 暴露 pending age
- Cloudflare/Vercel cron owner 唯一

### 阶段 E：体验与开源质量

范围：

- error/not-found
- 移动端 DOM 收敛
- debounce
- Dialog 可访问性
- AdminConsole 拆分
- 工程杂项清理

收益：

- 用户侧更稳，后台更好维护。
- 开源仓库更清爽，贡献门槛更低。

验证：

- Playwright 或浏览器手动检查桌面/移动端
- GitHub README/目录结构复查

## 9. 指标观测清单

修复前后需要记录：

- Vercel：
  - Edge Requests
  - Function Invocations
  - Data Cache / ISR 命中情况（如果可见）
  - 带宽和响应耗时趋势
- Supabase：
  - Egress
  - Database CPU/IO
  - API Requests
  - `raw_offers` 表大小和索引增长趋势
- Cloudflare：
  - `cf-cache-status` HIT/BYPASS
  - 缓存命中率
  - 原站回源量
- 前端：
  - 详情页 TTFB
  - 首屏加载时间
  - 点击详情、返回首页、筛选、加载更多的主观延迟
- 数据正确性：
  - 有货最低价是否只统计有货报价
  - 下架/隐藏后最低价是否同步刷新
  - 采集成功但价格未变时，前台更新时间是否反映最近采集确认时间

## 10. 风险总控

| 风险 | 触发场景 | 控制方式 |
|---|---|---|
| 缓存导致数据变旧 | CDN TTL 过长或 purge 失败 | 使用短 TTL，显示更新时间，提供手动刷新/重试。 |
| 降低自动刷新后用户觉得不实时 | 客户端不再 2 分钟自动请求 | 用最近采集时间解释新鲜度，保留手动刷新。 |
| fallback 限流导致数据不完整 | RPC 故障时只读有限行 | 明确 degraded 状态，不伪装完整数据。 |
| edge 节点误下架报价 | partial snapshot 被当 full snapshot | fullSnapshot 必须严格定义，不完整采集只更新已见报价。 |
| 写入节流导致更新时间不准 | unchanged 行不再频繁刷新 | 分清 last_seen/verified/updated，保留采集确认时间。 |
| migration 影响生产 DB | 生成列和索引构建 | 先备用项目验证，低峰执行，可回滚。 |
| UI 回归 | 组件拆分、客户端解析筛选 | 浏览器覆盖桌面/移动关键路径。 |

## 11. 完成定义

这个专项完成不是指代码合并，而是满足以下条件：

- P0 和 P1 全部修复并部署到生产。
- 生产端缓存头和 HIT/BYPASS 状态符合预期。
- Vercel 与 Supabase 指标至少观察 24-72 小时，确认下降趋势或解释未下降原因。
- 详情页、首页筛选、全部报价、商品报价筛选、加载更多、反馈入口完成回归。
- 采集链路能证明：成功采集写回时间可信，失败不会误下架，边缘节点不会重复打同一渠道。
- 文档同步更新：部署流程、Cloudflare 迁移计划、collector 文档、性能专项文档保持一致。
