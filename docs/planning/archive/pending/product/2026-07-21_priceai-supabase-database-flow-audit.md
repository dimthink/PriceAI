# PriceAI Supabase 数据库流程调研与优化建议

生成时间：2026-07-21

状态：只读调研完成，未修改业务代码、未连接 Supabase 生产项目、未执行生产 SQL

范围：价格采集、`raw_offers`、确认状态、公开读模型、公开快照、RPC、缓存、留存、权限、恢复和监控

## 0. 核心结论

PriceAI 已经形成了“采集写模型 -> 确认状态 -> 公开读模型/RPC -> 持久快照 -> Cloudflare 缓存 -> 前端”的分层链路，并具备幂等采集、变更检测、连续缺失确认、快照 dirty 合并、刷新租约、旧快照降级和 service-role-only RPC 等重要保护。

当前最值得优先处理的不是继续增加缓存层，而是收紧以下四个结构性问题：

1. **局部商品快照刷新仍会全量重建 `public_offer_read_model`。** 全量扫描、全局去重、所有存量行无条件 upsert 和旧代删除会把小范围更新放大成全表写入。
2. **dirty scope 是无锁 read-modify-write，且采集入口使用 `resetRefreshScope:true`。** 并发采集可能覆盖尚未处理的商品范围，这是代码层已确认的正确性风险。
3. **公开读模型只接管了全站 offers v2。** 商品详情 v2、筛选 facet、Explorer 和商家摘要仍有直接基于 `raw_offer_public_state` 或其他聚合 RPC 的路径，热点不能只看一个 RPC。
4. **恢复基线主要证明 schema 可重建，不等于生产数据可恢复。** 备份成功率、PITR、RPO/RTO 和隔离恢复演练仍必须在 Supabase Dashboard 与恢复环境确认。

是否已经发生严重慢查询、连接耗尽、temp spill 或 autovacuum 跟不上，本轮不能确认。必须用 `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`、`pg_stat_statements`、连接/锁/WAL/表膨胀指标验证，不能仅凭 SQL 形态下结论。

## 1. 调研边界与判断口径

- 本轮只读取本地仓库、migration、脚本和既有调研文档。
- 未运行任何生产查询，未读取 Supabase Dashboard，未调用生产 API。
- “已确认”表示可以由当前代码或 migration 直接证明。
- “待生产指标验证”表示代码存在成本或故障可能性，但不能证明线上已经发生。
- 2026-07-14 的容量与连接数据只作为历史基线，不代表 2026-07-21 当前值。

## 2. 当前数据库流程概览

```text
采集器 / collector runtime
  -> POST /api/admin/crawl-log（Admin/CRON 认证、批次最多 50）
  -> crawl_log_ingest_runs 幂等 claim
  -> sources 状态更新
  -> raw_offers（仅业务字段变化时批量 upsert）
  -> raw_offer_confirmations（每次确认刷新时效/可信状态）
  -> raw_offer_missing_candidates（完整快照首次缺失候选、连续缺失再隐藏）
  -> crawl_runs / operational logs
  -> public_api_snapshots.refresh_state 标记 dirty
  -> 云服务器 systemd 主调度 / GitHub Actions 30 分钟兜底
  -> /api/admin/public-api-snapshots（300 秒跨运行 lease）
  -> refresh_public_offer_read_model()
  -> Explorer / offers / merchants / product_offers 快照刷新
  -> 公开 API 先读内存/持久快照，必要时读 RPC
  -> Cloudflare Cache API
  -> PriceExplorer / ProductOffersPanel / 商品页
```

### 2.1 采集和原始写入

- 采集入口会校验 payload、声明批次上限，并通过 ingest run claim 避免重复处理：`src/app/api/admin/crawl-log/route.ts:47-68`、`:100-139`。
- `upsertRawOffers()` 先读取已有报价，只把业务字段真正变化的行按 25 条分批写入 `raw_offers`；未变化行不再整行 upsert：`src/lib/admin.ts:593-717`。
- 每次采集确认都会写 `raw_offer_confirmations`，把高频时效刷新与 `raw_offers` 主行拆开；公开视图用 confirmation 覆盖状态、时效、价格和库存，但 `hidden` 仍以原始表为准：`supabase/schema.sql:152-167`、`:654-692`。
- 完整快照第一次缺失先进入候选并退出可用态，连续第二次缺失才系统隐藏；重复失败达到阈值后也会把旧报价置为 unavailable/expired。该设计避免一次空采集直接清空公开数据。

### 2.2 公开读模型

- `public_offer_read_model` 保存去重后的公开报价、产品字段、公开可用状态、排序字段和搜索 haystack，并配置 5 个 B-tree 与 1 个 trigram GIN 索引：`supabase/migrations/20260721180000_public_offer_read_model.sql:4-66`。
- `refresh_public_offer_read_model()` 从 `raw_offer_public_state` 读取全部可见且产品 active 的候选，计算公开状态、dedupe key、搜索文本，再通过 `row_number()` 完成全局去重：同文件 `:73-167`。
- 刷新使用 generation upsert；如果新一代为零且旧代非空，函数抛错并在事务内保留旧代，最后才删除旧 generation：同文件 `:258-320`。
- 全站 `/api/offers` 优先读取 `list_public_offers_page_v2`；新 RPC 缺失时兼容回退旧 RPC：`src/lib/data.ts:5702-5738`。
- 商品详情 `list_public_product_offers_page_v2` 仍直接读取 `raw_offer_public_state`、关联 `sources`、动态过滤、精确计数和排序：`supabase/migrations/20260721133000_product_offer_operational_filters.sql:52-166`。

### 2.3 快照、缓存与前端读取

- 持久快照表以 `(kind, cache_key)` 为主键，保存 payload、生成时间和 schema version；表启用 RLS，只授权 service role：`supabase/migrations/20260624083000_public_api_snapshots.sql:1-17`。
- 快照正常读取超时 2.5 秒、写入超时 15 秒；默认 schema version 为 1：`src/lib/public-api-snapshots.ts:7-10`、`:33-105`。
- 默认全站 offers 快照只覆盖首屏 30 条；搜索、价格区间和深分页等请求不命中持久快照，会进入 RPC：`src/lib/data.ts:182-212`、`:2335-2429`。
- 普通快照超过 10 分钟不直接当作 fresh，但数据库读取失败时仍可返回旧快照并标记 `degraded`；紧急 cache-only 模式则直接接受已有快照：`src/lib/data.ts:2223-2297`。
- Cloudflare 健康数据缓存 300 秒，降级响应缓存 60 秒；offers 与 product offers 使用独立、版本化 namespace 和规范化查询参数，未发现当前两条核心路由存在明显 cache-key 漏参。

## 3. 代码中已确认的问题

### 3.1 局部刷新仍全量重建读模型

`refreshPublicApiSnapshotsForScope()` 无论只刷新几个商品，都会先执行 `refreshPublicOfferReadModel()`：`src/lib/data.ts:1048-1060`。该数据库函数会：

1. 扫描全部公开候选并关联 confirmation/product。
2. 为候选计算 dedupe、公开状态和包含多次 URL 正则提取的 haystack。
3. 对 dedupe key 做窗口排序。
4. 对全部幸存 key 无条件 `ON CONFLICT DO UPDATE`，包括 `refresh_generation` 和 `refreshed_at`。
5. 再 count 当前 generation 并 delete 旧 generation。

这意味着业务字段没有变化的存量行也会产生新 tuple、WAL 和索引维护。现有 generation 没有索引，但简单新增索引并不是直接答案，因为每轮更新 generation 会进一步扩大写成本。

### 3.2 dirty scope 存在并发丢更新窗口

`markPublicApiSnapshotsDirty()` 先读当前 JSON 状态、在应用内合并数组、再 upsert 回同一个 `(refresh_state, public-prices)` 行：`src/lib/data.ts:508-559`。该过程没有数据库原子合并或版本条件。

并发采集时，两个请求可能读到同一旧状态，后写者覆盖前写者。采集入口还使用 `resetRefreshScope:true`：`src/app/api/admin/crawl-log/route.ts:129-139`，因此连续采集也可能主动清除未处理范围。刷新 lease 只串行化刷新端点，不保护 dirty 写入。

### 3.3 常规采集不会立即刷新 global 快照

采集入口显式传入 `global:false`。商品详情快照可按 product scope 更新，但 Explorer、默认 offers 和 merchants 通常要等其他入口标记 global dirty，或等待最多 60 分钟一次的 full refresh。代码中的 global 5 分钟间隔是上限控制，不代表每 5 分钟必然刷新。

### 3.4 v2 RPC 仍有确定的全结果处理结构

全站 offers v2 使用 `count(*) over()` 得到精确总数，并在 `LIMIT/OFFSET` 前执行平台 CASE 和多套动态 CASE 排序：`supabase/migrations/20260721180000_public_offer_read_model.sql:377-453`。因此默认列表无法只取到前 30 行就停止处理全部匹配集。

商品详情 v2 同样使用 `count(*) over()`，并直接基于 `raw_offer_public_state` 关联 `sources`、构造搜索文本、处理排除词、排序后再分页。读模型没有覆盖这条路径。

这些是确定的 SQL 结构成本；“生产正在慢”仍需指标确认。

### 3.5 快照层缺少异常空结果保护

读模型有“旧代非空时拒绝零行新代”的保护，但 Explorer、offers、merchants 和 product offers 快照只要结果 `degraded=false` 就可覆盖旧 payload：`src/lib/data.ts:997-1035`、`:1111-1146`。逻辑回归、错误过滤或异常但未标 degraded 的空结果仍可能覆盖 last-known-good。

### 3.6 last-known-good 没有硬过期上限

10 分钟只决定是否直接返回 fresh 快照。数据库失败时，`preferStale*` 可以继续返回任意年龄的非空旧快照并标 degraded。可用性优先是合理策略，但当前 API 没有统一输出 `snapshotAgeSeconds`、`staleReason` 或业务硬上限，用户无法区分“旧 12 分钟”和“旧 2 天”。

### 3.7 RPC 兼容回退仍可能放大数据库压力

Supabase 已配置时，普通 RPC 失败不会读取应用层 `raw_offers` fallback，而会返回快照/LKG 或明确降级，这是已经具备的保护。

例外是全站 offers v2 被识别为 migration/schema-cache 缺失时，会再调用一次旧 `list_public_offers_page`。旧 RPC 每次直接扫描、过滤并窗口去重 `raw_offer_public_state`。在部分发布或 schema cache 异常期间，一次请求可能经历快照 miss、v2 失败和 legacy 重查询。应用没有对该兼容分支做独立熔断。

### 3.8 灾备证明范围不足

仓库已有 checksum、migration head 和空库恢复基线，能够验证 schema/RLS/核心 RPC 可在隔离数据库建立：`docs/supabase-disaster-recovery-baseline.md:1-36`。

但它不包含生产数据备份、PITR、恢复时间、备份失败告警或一次真实数据恢复演练。另有版本漂移：`supabase/config.toml` 声明 PostgreSQL 17，而恢复脚本默认 PostgreSQL 18。生产实际版本还需 Dashboard 确认。

### 3.9 监控覆盖不完整

现有基础设施快照、健康端点和刷新脚本已经覆盖部分表容量、retention 候选、dirty 积压和刷新失败，但未形成以下统一时序指标：

- RPC calls、p50/p95/p99、rows、shared/local blocks、temp spill。
- read model 刷新总耗时、scan/sort/upsert/delete 分段耗时、WAL bytes、更新行数与实际变化行数。
- 当前/峰值连接、等待连接、长事务、锁等待、事务年龄。
- snapshot age、dirty age、每 kind 成功时间、空结果拒绝次数、LKG 命中率。
- 表/索引大小、dead tuple、HOT update 比例、autovacuum 延迟、每日增长速度。
- 备份最近成功时间、PITR 可恢复窗口、恢复演练 RPO/RTO。

## 4. 还需要生产指标验证的猜测

| 猜测 | 为什么值得怀疑 | 必须怎样验证 |
| --- | --- | --- |
| 读模型全量重建已经是主要慢查询 | 全表扫描、窗口排序、全量 upsert、6 个二级索引 | 在 Preview/同量级副本执行 `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`；生产只读看 `pg_stat_statements` |
| v2 默认列表或深分页发生全表排序/temp spill | 精确 count、动态 CASE 排序、OFFSET | 分别测试默认、筛选、短/长搜索词、三种 sort、offset 0/1000/5000 |
| 现有索引不足或重复 | 索引不能完整匹配动态排序；部分 raw_offers 索引历史使用率低 | 查看 `pg_stat_user_indexes`、基数、真实 plans；不要静态直接加/删索引 |
| autovacuum 跟不上 read model 全量更新 | 每轮所有行都换 generation，预计 HOT 比例低 | 观察 `n_tup_upd/n_tup_hot_upd/n_dead_tup/last_autovacuum` 和表/索引增长 |
| dirty scope 已在线上丢失 | 代码存在竞态，但需要真实并发和状态历史证明 | 压测并发 mark；记录每次 scope revision、合并前后数量和 refresh 消费结果 |
| 主 systemd 快照调度频率与仓库设计一致 | 主调度在仓库外，仓库只有 30 分钟 GitHub 兜底 | 只读核对 timer、最近执行、脚本 SHA、dirty/refresh 时间线 |
| 连接池或连接数配置不合理 | 本地 pooler 配置不能代表托管生产；脚本 client 策略不统一 | Dashboard 核对 Supavisor 模式、连接配额、峰值、等待和客户端来源 |
| 备份/PITR 足以达到业务恢复目标 | 仓库只有 schema baseline | Dashboard 检查备份/PITR，并在隔离项目做一次有数据恢复演练 |

## 5. 可以继续优化的地方

### 5.1 读模型改成增量更新 + 定期全量校准

推荐方向是“变更集合增量刷新为主，低频全量校准为兜底”，而不是完全取消全量刷新：

- dirty state 原子记录 `offer_id/product_id/source_id` 或写入 append-only refresh queue。
- 对受影响 dedupe key 重新计算 keeper；同时处理旧 key 和新 key，避免价格/URL/产品变化遗留旧行。
- canonical product、分类规则、全局函数版本变化时标记 full refresh required。
- 每小时或每天执行低频全量校准，比较行数、key checksum 和抽样内容；异常时保留旧 generation。
- 增量 upsert 使用 `IS DISTINCT FROM`，只更新真实变化行。

风险在于依赖图更复杂，尤其是 dedupe keeper 切换、source 整体禁用、产品重分类和过滤函数变更。实施前必须先把这些“触发全量”的事件列完整。

### 5.2 原子化 dirty 合并

用 service-role-only RPC 在单条 SQL/事务内完成 JSONB 数组合并、revision 递增和 scope-limit 判断；或者改为 append-only queue，通过唯一键合并待处理对象。采集入口不应默认清空尚未消费的 scope。

### 5.3 分离列表、计数和排序查询

- 评估将精确 `total_count` 从每个请求的窗口计数拆成缓存计数、独立 RPC 或只在首屏请求返回。
- 深分页改为稳定复合游标，而不是持续扩大 OFFSET。
- 对少数高频 sort variant 建专用 SQL/RPC，减少通用动态 CASE 计划。
- 只有真实 query mix 和 EXPLAIN 证明收益后再建针对性复合/表达式索引。

### 5.4 扩展读模型覆盖范围

评估让 product offers v2 和 facet 直接读取同一 read model，或建立按 product 预聚合的 facet 表。Explorer 与 merchants 也应明确各自数据源、刷新 SLA 和是否仍扫描 raw view，避免“全站 offers 已优化”被误当作所有公开读路径都已优化。

### 5.5 增加快照发布门

- 为每个 kind 设最小/最大合理行数、相对前一版变化比例和关键产品覆盖规则。
- 零结果或骤降先写 candidate generation，通过校验后再切换 active pointer。
- 返回统一的 `generatedAt`、`snapshotAgeSeconds`、`degraded`、`staleReason`。
- LKG 硬上限应按业务定义；超过上限仍可展示，但必须显著标记并停止参与“当前最低价”等强时效结论。

### 5.6 收紧故障与兼容回退

在确认 migration 与 schema cache 已稳定后，为 legacy offers RPC 回退增加短期熔断、调用计数和最终移除日期。对公开请求保持“快照/LKG -> 新 RPC -> 明确降级”的单次数据库读取预算，避免一次请求串联多个重查询。

### 5.7 留存和表膨胀治理

现有 API Transit 已具备 8 天原始、90 天小时、365 天日汇总和默认 dry-run 的批次清理能力，但生产是否实际执行仍需确认。历史 2026-07-14 基线显示：

- `api_transit_availability_samples` 是最大容量来源。
- `raw_offers` live rows 不大，但累计 update 很高，写放大比简单历史行数更值得关注。

后续应把 retention 从“有 RPC”推进为“单实例、有限批次、可观察、可暂停的执行闭环”，并为 crawl/operational logs、confirmation/missing candidates、检测 payload 分别定义保留策略。删除后优先普通 `VACUUM (ANALYZE)`，不要默认 `VACUUM FULL`。

### 5.8 连接、超时、权限与恢复

- 核对托管生产的 Supavisor 模式、连接上限和客户端来源；本地 `[db.pooler] enabled=false` 不能代表生产。
- 主应用已有 8 秒 DB timeout、公开读 2.5 秒 abort 和 60 秒传输熔断；采集/维护脚本应统一超时与幂等完成判定。
- 当前表 RLS 和敏感 RPC service-role-only 基线较好；补一条 CI invariant，穷举检查新表启用 RLS、新 security-definer RPC 已 revoke `public/anon/authenticated`。
- 明确 RPO/RTO、备份/PITR 保留窗口和告警，统一 PostgreSQL 恢复测试版本，完成隔离数据恢复演练。

## 6. 按优先级排序的建议

| 优先级 | 建议 | 主要收益 | 主要风险 | 实现成本 |
| --- | --- | --- | --- | --- |
| P0 | 建立只读性能与可靠性基线：EXPLAIN 矩阵、`pg_stat_statements`、连接/锁/WAL/autovacuum、snapshot age | 先证明真正瓶颈，避免盲目加索引或重构 | 指标口径不一致会误导排序 | 低到中 |
| P0 | 核对备份/PITR并完成一次隔离数据恢复演练，明确 RPO/RTO | 把“schema 可建”提升为“生产数据可恢复” | 演练流程需要严格隔离，恢复时间可能暴露真实缺口 | 中 |
| P1 | 原子化 dirty state，移除采集入口清空未消费 scope 的行为 | 修复并发丢更新，保证商品快照最终一致 | 状态迁移时需兼容旧 refresh_state | 低到中 |
| P1 | 为快照增加空结果/骤降发布门、revision 和 age 可观测字段 | 防止异常空数据覆盖 LKG，提升降级透明度 | 真正的批量下架可能被误拦截 | 中 |
| P1 | 将读模型改为增量刷新，保留每小时/每日全量校准 | 显著降低扫描、WAL、索引写和 autovacuum 压力 | dedupe keeper、重分类和 source 变更依赖复杂 | 高 |
| P1 | 基于真实 plans 优化 v2：拆 count、专用 sort、游标分页、按需索引 | 降低 p95/p99、temp spill 和深页成本 | 过度专用化会增加 RPC 维护成本 | 中到高 |
| P1 | 让 product offers/facets 复用读模型或独立预聚合 | 降低商品详情对 raw view + confirmation join 的依赖 | 多读模型一致性和刷新顺序更复杂 | 中到高 |
| P1 | 统一采集/维护脚本的 timeout、幂等完成判定和连接策略 | 防止后台任务长期占连接或重复写 | 写超时后结果可能已提交，必须先查幂等状态 | 中 |
| P2 | 在 migration 稳定后限制并最终移除 legacy offers RPC fallback | 避免 schema 异常时双查询和 raw 扫描 | 回滚窗口缩小 | 低 |
| P2 | 推进 retention 自动执行闭环和表/索引增长预算 | 控制磁盘、WAL 和长期成本 | 误删历史；必须依赖 rollup、备份和小批次 | 中 |
| P2 | 增加 RLS/RPC 权限 CI invariant | 防止未来 migration 权限漂移 | 需要维护允许例外清单 | 低 |

## 7. 推荐下一步

下一步先做一轮**只读生产证据基线**，暂不直接改增量架构或新增索引：

1. 导出最近 7 天 `pg_stat_statements` 中与公开 RPC、read model refresh、merchant/product summary 有关的 calls、mean/max、rows、blocks 和 temp blocks。
2. 在 Preview 或同量级恢复库对 refresh 与 v2 查询矩阵执行 `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`。
3. 记录读模型表/索引大小、dead tuple、HOT update、autovacuum、WAL，以及一次全量 refresh 前后增量。
4. 导出 refresh_state、各 snapshot kind 的年龄和最近 24 小时刷新日志，验证 systemd 主调度和 dirty scope 是否丢失。
5. 在 Dashboard 只读确认连接池、连接配额、PostgreSQL 版本、备份/PITR 和最近成功备份。

拿到这批证据后，第一项代码整改建议优先做“**dirty state 原子合并 + 快照异常发布门**”；它们是当前已经能由代码确认的正确性问题，成本低于读模型增量重构。随后再根据 refresh 的 WAL/耗时占比决定是否立即推进增量读模型，还是先优化 product v2/count/sort。

## 8. 建议验收指标

| 领域 | 建议指标 |
| --- | --- |
| 读模型刷新 | p50/p95/p99 耗时、扫描候选数、实际变化行数、upsert 行数、删除行数、WAL bytes、失败率 |
| 公开 RPC | calls、p50/p95/p99、rows、shared/local blocks、temp blocks、timeout rate、按筛选/sort/offset 分桶 |
| 快照 | kind/key 数、age、dirty age、刷新成功率、LKG 命中率、空结果拒绝次数、pending scope 数 |
| 连接与锁 | active/idle/waiting、pooler client/server、长事务、lock wait、连接拒绝数 |
| 表与索引 | total bytes、daily growth、live/dead tuples、HOT update ratio、autovacuum/analyze age、idx scan |
| 故障 | Supabase timeout/transport error、legacy fallback 次数、Cloudflare HIT/MISS、降级响应率 |
| 灾备 | 最近备份成功时间、PITR window、恢复演练 RPO/RTO、恢复校验结果 |

## 9. 主要证据文件

- `src/app/api/admin/crawl-log/route.ts`
- `src/lib/admin.ts`
- `src/lib/data.ts`
- `src/lib/public-api-snapshots.ts`
- `src/lib/supabase.ts`
- `src/app/api/admin/public-api-snapshots/route.ts`
- `supabase/migrations/20260721180000_public_offer_read_model.sql`
- `supabase/migrations/20260721133000_product_offer_operational_filters.sql`
- `supabase/migrations/20260624083000_public_api_snapshots.sql`
- `supabase/schema.sql`
- `.github/workflows/refresh-public-api-snapshots.yml`
- `scripts/refresh-public-api-snapshots.mjs`
- `docs/supabase-disaster-recovery-baseline.md`
- `docs/planning/archive/in-progress/product/2026-07-14_priceai-supabase-retention-and-cleanup-batch-strategy.md`
