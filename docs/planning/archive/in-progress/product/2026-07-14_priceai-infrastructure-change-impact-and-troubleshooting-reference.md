# PriceAI 基础设施改动影响与排障确认参考

生成时间：2026-07-14
适用范围：P0-P2 基础设施、Supabase retention、Cloudflare/OpenNext 缓存、预取、日志与后台总览
关联规划：[基础设施容量、异常流量与成本治理规划](2026-07-14_priceai-infrastructure-capacity-traffic-and-cost-governance-plan.md)

## 1. 使用方式

发生请求量、R2 Class B、Supabase Disk、缓存陈旧、后台数据缺失或页面导航变慢时，先在本文件中确认：

1. 现象是否属于某项改动的已知代价。
2. 对应改动是否已经生产生效。
3. 应先观察哪个指标，而不是直接删除数据或关闭缓存。
4. 回滚是否只需回滚代码，还是需要单独处理 migration / 数据。

## 2. P0：证据、基线和安全护栏

P0 全程只读，不修改生产流量、缓存、数据库和安全规则。

| 项目 | 优点 | 缺点 / 限制 | 排障时确认 |
| --- | --- | --- | --- |
| Cloudflare 24h path / CPU / status / IP / ASN / country / UA / host 基线 | 能区分真实用户、分布式抓取、自动化浏览器和 `_rsc` 预取放大，避免只封单 IP | 基线本身不降成本；单个 24h 窗口可能受当天流量波动影响 | 对比同口径新 24h 窗口；不要把账期累计和滚动 24h 混用 |
| Supabase 表、索引、行数和增长归因 | 能看清 Availability、Detection Runs、covering index、`raw_offers` 的真实占用和写入成本 | 表/索引大小是时间点快照；普通 `DELETE` 不等于磁盘文件立即缩小 | 同时看表体积、索引体积、候选数、WAL/IO 和日增长，不只看 Disk 百分比 |
| 调整前基线 | 发布后可以量化 Worker、R2 Class B、Disk、日志和导航体验是否改善 | 至少需要一个完整新 24h 窗口，无法发布后立即得出结论 | 记录发布日期和观察窗口，避免新旧时间范围错位 |
| 禁止动作清单 | 防止误删索引、清空 OpenNext R2、执行 `VACUUM FULL` 或直接切换热缓存 Storage Class | 每个高风险动作需要独立确认，治理速度更慢 | 先确认是否有 dry-run、批次、覆盖保护和回滚路径 |
| 数据来源和更新时间标记 | 避免把历史审计基线误认为实时监控 | 仍需在 Supabase、Cloudflare、R2 和安全控制台之间核对 | 后台标记“审计基线”时，必须回控制台刷新实时数据 |

### P0 已确认的关键事实

- 异常流量更像分布式抓取、自动化浏览器和 Next.js 预取叠加，不是单个 IP 打满。
- R2 的主要成本问题是 OpenNext 热缓存的高频 Class B，不是 Standard Storage Class 选错。
- Availability covering index 虽然占用约 280 MB，但有真实扫描和元组读取，不能因 Disk 告警直接删除。
- Supabase Disk 治理目标首先是停止继续膨胀，不承诺普通删除后图表立即大幅下降。

## 3. P1：低风险降量

### 3.1 已进入本次生产发布的项目

| 改动 | 优点 | 缺点 / 已知代价 | 排障时确认 | 快速回滚 |
| --- | --- | --- | --- | --- |
| Durable Object Revalidation Queue | 修复 stale revalidation 失败；提供去重、重试，减少重复 error events | 新增 Durable Object binding、SQLite migration 和少量 DO 成本 | 查 `NEXT_CACHE_DO_QUEUE` binding、DO migration、revalidation error 是否下降 | 回滚 `46bddfb` 并重新部署上一版；不要删除 R2 桶 |
| 主导航 hover / focus 意图预取 | 保留高意图导航速度，同时减少无意图 `_rsc` | 触屏设备无 hover；首次点击可能略慢 | 对比真实点击导航耗时和 `_rsc` 数量，不要只看单次主观感受 | 恢复普通 Link 预取并重新部署 |
| 长列表 `prefetch={false}` | 减少商品、官方价、官方 API、中转、指南列表进入视口即触发的批量请求 | 用户真正点击时可能多等待几十到几百毫秒 | 检查列表页请求瀑布、`_rsc` 占比、点击后 TTFB | 恢复指定高价值入口的预取，不建议全量恢复 |
| Availability 小时 / 日 rollup | 长期趋势用更小数据承接，趋势查询更快，为清理原始样本提供安全覆盖 | 首次回填有数据库负载；聚合口径需要维护 | 检查 hourly/daily 最新 bucket、sample_count 和 raw 覆盖范围 | 停止调用 refresh/prune；保留表和函数不会影响前台 |
| Availability 默认 dry-run retention | 先预览候选；每批 5,000 行；缺少 rollup 覆盖时拒绝删除 | 清理较慢；删除后磁盘图不保证立即下降 | 确认 `dryRun=true`、候选数、rollup 完整性和单批删除量 | 不继续调用 apply；已删除原始逐条数据不能靠代码回滚 |

### 3.2 仍未随本次发布执行的 P1 生产动作

| 候选动作 | 优点 | 缺点 / 风险 | 当前状态 |
| --- | --- | --- | --- |
| WAF Log -> Managed Challenge -> Block | 能处理数据中心 ASN 和分布式自动化流量 | 可能挑战 VPN、企业出口、合法监测和搜索抓取 | 未修改生产规则 |
| 路径级 Rate Limiting | 能直接降低 `_rsc`、搜索和昂贵 API 的放大成本 | 阈值过低会影响快速浏览、SEO 和真实 API 使用 | 未修改；Free 计划现有名额需替换而非叠加 |
| 普通 2xx 日志 10% 采样 | 理论上减少约 80%-90% 普通成功日志量 | 低频问题可能没有被采样 | 未保存生产采样配置 |
| Availability 生产清理 | 控制原始样本长期增长 | 8 天前无法逐条回放；不可通过代码恢复删除的数据 | migration 发布不等于执行清理，本次不调用 apply |

## 4. P2：代码与缓存结构优化

| 改动 | 优点 | 缺点 / 已知代价 | 排障时确认 | 快速回滚 |
| --- | --- | --- | --- | --- |
| `raw_offers` 只写变化内容 | 降低 WAL、索引写放大、数据库时间和 timeout；无变化确认写轻量表 | 内容相等判断漏字段时，可能跳过应写变化 | 检查 `writtenCount` / `unchangedCount` / `confirmedCount` 和 `raw_offer_confirmations` | 回滚内容去重逻辑会恢复写放大，不作为首选排障手段 |
| Detection Runs 14 / 30 retention | 14 天后先清大 JSON，30 天后删无样本引用的运行，优先控制第二增长源 | 14 天后的完整检测上下文丢失；历史复盘只能依赖摘要 | 检查 payload/run 候选数、blockedRunCandidates、是否仍有 Availability 引用 | 停止调用 apply；已清空 JSON 或删除的运行不能靠代码恢复 |
| 保留 Availability covering index | 保护多站点最近样本读取，避免前台可用性查询退化 | 继续占用约 280 MB，并增加 Availability 写入维护成本 | 检查 index size、idx_scan、idx_tup_read；不要只看大小 | 不需要回滚；未来替代前必须先改查询并重新测基线 |
| 60 秒 `short-lived` regional cache | 同一区域热读取可先命中 Cache API，有望降低 R2 Class B 和延迟 | 增加一层缓存；跨区域按需失效可能多出最多约 60 秒陈旧窗口 | 检查 `cf-cache-status`、R2 Class B、缓存更新延迟和 revalidation 日志 | 恢复 `incrementalCache: r2IncrementalCache` 并重新部署 |
| 后台「基础设施」工作流 | 集中查看容量、候选、索引、缓存配置和异常基线 | Cloudflare 流量目前是带日期基线，不是自动实时 Analytics；RPC 有少量只读统计成本 | 先看页面是否标记“实时/基线”；确认 migration 是否已应用 | 后台 API/页面可单独回滚，不影响 retention 数据结构 |

## 5. 常见现象与优先排查顺序

### 5.1 R2 Class B 没有下降

1. 确认新 Worker 版本已部署，并且 regional cache 配置已进入生产 bundle。
2. 对比发布后的完整 24h，而不是发布后几分钟。
3. 检查 `_rsc` 总量是否下降；如果请求总量没下降，regional cache 只能减少部分 R2 读取。
4. 检查流量是否高度跨区域；regional cache 主要复用同一区域热请求。
5. 不要因此把 OpenNext 热缓存切到 Infrequent Access。

### 5.2 页面数据更新比以前慢

1. 先确认延迟是否在 60 秒内；这可能是 regional cache 的已知窗口。
2. 检查 revalidation queue 是否正常消费，是否仍有 stale revalidation error。
3. 检查问题是否只发生在一个 Cloudflare 区域。
4. 超过窗口仍旧数据时，回滚 regional cache，而不是清空整个 R2 桶。

### 5.3 页面点击感觉变慢

1. 确认是否来自长列表首次点击，而不是所有导航。
2. 对比点击前是否已经 hover/focus；主导航仍保留意图预取。
3. 只恢复高价值入口预取，不建议重新开启所有列表 viewport prefetch。

### 5.4 Supabase Disk 仍然红

1. 确认 migration 已应用，但不要把“函数存在”等同于“数据已清理”。
2. 在后台查看 raw/hourly/daily、Detection payload/run 候选。
3. 清理前确认 rollup 覆盖；默认先 dry-run。
4. 即使删除完成，也要看后续日增长和数据库内部可复用空间，不期待 Disk 图立即同比例下降。
5. 不执行 `VACUUM FULL`、`REINDEX` 或删除 covering index 作为第一反应。

### 5.5 后台基础设施页面显示“待 migration”

1. 检查 Supabase GitHub Integration 是否处理了 `main` 上的新 migration。
2. 确认生产 RPC `get_priceai_infrastructure_snapshot()` 已存在且只有 service_role 可执行。
3. 再检查 `/api/admin/infrastructure`，不要通过 Cloudflare workflow 手动执行 `supabase db push`。

## 6. 生产变更边界

本次应用发布会使以下代码行为生效：

- Durable Object revalidation queue。
- 意图预取和长列表预取收敛。
- Availability rollup / retention、Detection retention 和基础设施快照 RPC 可用。
- 60 秒 regional cache。
- 后台基础设施工作流。

本次发布不会自动执行：

- Availability 或 Detection Runs 数据清理。
- WAF、Managed Challenge、Block 或 Rate Limiting 修改。
- Observability 日志采样修改。
- R2 Storage Class 或生命周期修改。
- `VACUUM FULL`、`REINDEX`、删除 covering index、清空 R2 桶。

## 7. 发布证据

发布完成后记录：

- release branch：`main`
- work commits：`46bddfb`、`429de65`、`ff7a68a`、`623034d`、`b642c43`、`b824b08`
- 优缺点参考文档 commit：待提交
- GitHub push：待执行
- Supabase GitHub Integration：待确认
- Cloudflare/OpenNext workflow：待执行
- 生产验证：待执行
