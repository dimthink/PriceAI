# PriceAI 基础设施容量、异常流量与成本治理产品规划

生成时间：2026-07-14
状态：P2 已生产发布，进入 P3 24 小时观察
适用范围：Supabase 数据库容量与写入、Cloudflare Workers / WAF / Cache、R2、Observability、后台 24 小时运营监测
关联规划：[工程质量与可维护性规划](2026-07-10_priceai-engineering-quality-and-maintainability-plan.md)、[后台管理左侧导航与工作流拆分规划](2026-07-12_admin-console-left-nav-workflow-split-plan.md)、[Umami 数据监测与采集分层规划](2026-07-14_umami-data-monitoring-and-collection-tiering-plan.md)

> 本文基于 2026-07-14 的只读生产核查形成。数据会随流量和采集继续变化，文中的数字用于说明当前量级和决策依据，不是长期固定值。

## 0. 核心结论

这次 Supabase “变红”更像容量和增长速度预警，不是数据库已经宕机。项目核查时仍为 `Healthy`，CPU、连接数没有到危险线；真正需要处理的是 API 中转可用性样本持续高速写入、近期新增大索引，以及 `raw_offers` 高频写入带来的空间、WAL 和数据库时间消耗。

Cloudflare 侧也没有看到单个 IP 打穿系统的典型单点 DDoS。当前更像数据中心网络、自动化浏览器和批量页面预取共同形成的分布式抓取流量。它没有大量报错，但把域名请求、Worker 调用、R2 Class B、Supabase 子请求和日志事件一起放大了。

本规划的总策略是：

```text
先留证和建立 24 小时基线
-> 再做低风险限流、日志降采样和数据库留存
-> 再优化预取、缓存和写入方式
-> 最后根据 7-14 天数据决定是否扩大治理范围
```

第一阶段不直接大批量删除数据库记录，不执行 `VACUUM FULL`、`REINDEX`，不清空 OpenNext R2 缓存桶，也不把热缓存从 Standard 改成 Infrequent Access。

## 1. 产品一句话

这是一个面向 PriceAI 维护者的内部基础设施治理工作台与执行机制，帮助维护者在最近 24 小时内识别数据库增长、异常流量、缓存失效、R2 请求放大和日志成本，并以可观察、可回滚、分阶段的方式完成容量与成本优化。

## 2. 背景与当前现状

### 2.1 Supabase 当前状态

核查时的整体运行状态：

| 指标 | 当前快照 | 判断 |
| --- | ---: | --- |
| 项目状态 | `Healthy` | 不是数据库宕机 |
| CPU | 约 27% | 有余量 |
| RAM | 约 73% | 偏高但未到失控状态，需要观察趋势 |
| 数据库连接 | 25 / 90 | 不是连接耗尽 |
| Disk | 约 1.56 / 2 GB | 已接近告警区，是“变红”的直接背景 |

Supabase 会在容量继续增长时自动扩容到至少 8 GB，因此当前不是必须立刻删数据才能保住服务。但自动扩容只能提供缓冲，不能替代留存和写入治理，否则磁盘仍会按相同速度继续增长。

主要空间占用：

| 对象 | 当前量级 | 说明 |
| --- | ---: | --- |
| `api_transit_availability_samples` | 约 253 万行 / 964.59 MB | 最大增长来源，持续记录可用性样本 |
| `api_transit_availability_samples_checked_time_idx` | 约 272.72 MB | 近期新增 covering index，单次显著抬高磁盘和 WAL |
| `api_transit_detection_runs` | 约 158.91 MB | 检测运行明细持续累积 |
| `raw_offers` | 约 75.87 MB | 表体积不是最大，但写入时间成本很高 |

过去 24 小时增长：

- `api_transit_availability_samples` 增加约 401,397 条。
- `api_transit_detection_runs` 增加约 3,029 条。
- 公开 API 中转采集当前每 10 分钟运行一次，并持续写入样本。
- 现有前台主要使用最近 8 天数据，但约 42 万条 availability samples 已超过 8 天，可作为第一批清理候选。

查询与写入方面，Query Performance 中存在约 243 条慢查询记录；`raw_offers` 更新和插入占累计数据库时间约 70%，平均约 1.7-2.8 秒，最长接近 8 秒。这说明容量问题之外，还存在写放大和 statement timeout 风险。

### 2.2 Cloudflare 当前状态

过去 24 小时的量级：

| 指标 | 当前快照 | 判断 |
| --- | ---: | --- |
| 域名请求 | 约 5.02M | 明显偏高 |
| Worker 调用 | 约 4.1M | 大量请求进入动态执行链路 |
| Worker 平均 CPU | 约 12.6 ms | 单次不算异常，但总量形成成本 |
| Worker -> Supabase 子请求 | 约 652k | 约 194.9 ms / 次，存在回源成本 |
| 当前一小时 Workers Logs | 约 300k events | 高于 24 小时平均速度 |
| Cloudflare 已拦截 | 约 11.39k | 约占总请求 0.23%，现有防护只覆盖很小部分 |

异常流量特征：

- Desktop、Windows、Chrome、Edge 占比非常高。
- 美国、日本、中国、新加坡、香港贡献主要请求。
- Top IP 来自 FDCservers、Streamline Servers、GSL Networks 等数据中心网络。
- 最大单 IP 约 68.2k 请求，只占总量约 1.36%，不是单个来源打满。
- 日志中出现大量带 `_rsc=` 的页面预取，以及产品页、指南页、logo、赞助图等批量请求。

因此当前更像分布式抓取、自动化浏览器和 Next.js 页面预取叠加，而不是一个可以只封禁单 IP 就解决的问题。

缓存状态：

| Cache Status | 请求量 | 约占比 |
| --- | ---: | ---: |
| None | 约 3.81M | 约 76% |
| HIT | 约 1.21M | 约 24% |

大量请求没有被边缘缓存直接吸收，是 Worker、R2 和 Supabase 成本被同时放大的核心原因之一。

### 2.3 R2 与日志当前状态

OpenNext 增量缓存桶 `priceai-cloudflare-poc-opennext-cache`：

| 指标 | 当前快照 |
| --- | ---: |
| 当前存储 | 约 12.61 GB |
| 24 小时平均存储 | 约 12.24 GB |
| 24 小时 Class B | 约 2.33M |
| 24 小时 Class A | 约 39.7k |
| 当前账期累计 Class B | 约 15.45M |

反馈证据桶 24 小时 Class B 只有约 1.02k，因此 R2 请求成本几乎全部来自 OpenNext incremental cache，而不是用户上传的反馈素材。

当前 OpenNext 配置直接使用 R2 incremental cache，尚未配置 revalidation queue 和 regional cache。缺省 `dummy` queue 已导致约 72k error-level events 中反复出现 stale revalidation 失败。公开素材路由已经使用 Cloudflare Cache API，但 Cache API 命中仍会进入 Worker，因此 `/api/sponsor-assets` 仍是 Top CPU 路径。Cloudflare Observability 也处于全量日志状态，账户累计 events 已约 27.84M。

按当前 24 小时速度粗略外推一个月，Workers Requests、CPU 和 R2 Class B 合计约 86 美元/月，尚未计入日志可能产生的额外费用。这个数字只用于判断优化优先级，不作为最终账单预测。

## 3. 场景问题、用户任务与产品机会

| 场景问题 | 用户任务 | 当前阻碍 | 产品机会 |
| --- | --- | --- | --- |
| Supabase 突然变红 | 判断是宕机、容量告警还是平台故障 | Dashboard 指标分散，表增长没有历史快照 | 建立容量总览、增长归因和预计耗尽时间 |
| 磁盘快满 | 判断哪些数据能删、删多少、是否会影响前台 | 原始样本、索引、检测明细和业务数据混在一起 | 建立留存策略、清理候选和安全批次流程 |
| Cloudflare 流量异常 | 判断是真实用户、爬虫、攻击还是预取放大 | 单看总请求无法归因到 path、IP、ASN、UA 和成本 | 建立 24 小时流量归因和异常队列 |
| R2 Class B 过高 | 判断是存储类型还是访问方式问题 | “R2 变贵”容易被误解成 Storage Class 选错 | 将存储容量、Class A/B、缓存命中和 Worker 请求联动分析 |
| 日志事件过多 | 保留排障能力，同时避免全量日志持续计费 | 全量日志简单但成本不可控 | 错误与安全事件全量、普通成功请求采样 |
| 只能在多个计费页看数据 | 回看最近 24 小时并与前一周期比较 | Billing 更偏账期累计，缺少统一运营视图 | 建立 24h / 7d / 30d 快照、预算和变化率 |

## 4. 产品边界

### 4.1 本版本做什么

1. 建立 Supabase、Cloudflare Workers、R2、WAF 和 Observability 的统一 24 小时基线。
2. 建立数据库容量增长、保留周期、清理候选、慢写入和索引占用视图。
3. 建立 path、status、CPU、IP、ASN、country、UA、host 的异常流量归因。
4. 建立 R2 存储量、Class A/B、缓存命中、Worker 调用之间的成本解释。
5. 给出可分批执行、可暂停、可复盘的治理建议。
6. 先输出建议和观察模式，影响数据、流量和用户访问的动作必须人工确认。

### 4.2 本版本不做什么

1. 不因磁盘变红直接执行大批量 `DELETE`、`VACUUM FULL`、`REINDEX` 或删索引。
2. 不直接清空 OpenNext R2 缓存桶，不手工删除不理解的缓存对象。
3. 不把 OpenNext 热缓存切换到 Infrequent Access。
4. 不根据单个国家、浏览器或数据中心 ASN 直接全量封禁。
5. 不在第一阶段自动修改采集频率、数据 retention、WAF 或 Rate Limiting。
6. 不把 Billing 账单页当作唯一的实时异常判断来源。

## 5. 产品形态判断

| 候选形态 | 是否采用 | 原因 |
| --- | --- | --- |
| PriceAI Web 后台工作台 | 第一版采用 | 指标密度高，需要表格、趋势、筛选、异常队列和动作确认 |
| 每日 / 每周摘要 | 第一版采用 | 适合做 24 小时变化、预算和异常摘要 |
| H5 / App | 不采用 | 没有独立分发价值，复杂排查也不适合小屏 |
| Bot 告警 | P2 考虑 | 适合推送告警，但不能替代后台证据和人工判断 |
| 全自动治理系统 | 暂不采用 | 数据删除、流量拦截和缓存策略都有误伤风险 |

建议作为未来后台左侧导航中的「基础设施与成本」工作流，而不是单独建设一个新的外部产品。

## 6. 核心用户旅程

```text
进入后台基础设施总览
-> 查看最近 24 小时健康与成本变化
-> 识别 Supabase / Workers / R2 / Logs 的主要异常
-> 进入容量或流量归因详情
-> 查看系统建议、收益、缺点和风险
-> 选择观察、试运行或执行
-> 在 24 小时和 7 天窗口复盘
-> 保留、回滚或扩大范围
```

| 步骤 | 用户动作 | 系统动作 | 用户获得什么 | 关键风险 |
| --- | --- | --- | --- | --- |
| 1 | 打开总览 | 汇总 24h、前 24h、7d 基线 | 当前是否真的异常 | 数据延迟造成误判 |
| 2 | 点击 Supabase | 展示表、索引、行数、日增长和预计耗尽时间 | 空间增长归因 | 只看表体积忽略索引和 WAL |
| 3 | 点击 Cloudflare | 按 path、IP、ASN、country、UA、status、CPU 聚合 | 异常流量来源 | 把真实用户误判为爬虫 |
| 4 | 点击 R2 | 联动展示 Class B、Worker 请求和缓存命中 | 成本来源解释 | 误以为换 Storage Class 就能解决 |
| 5 | 查看建议 | 展示改动点、收益、缺点、风险和验证指标 | 可评估的执行方案 | 建议过于自动化 |
| 6 | 选择试运行 | 只对小范围路径、规则或数据批次生效 | 可控实验 | 缺少回滚开关 |
| 7 | 复盘 | 对比处理前后 24h / 7d 指标 | 决定保留还是回滚 | 观察时间太短 |

## 7. 功能模块总览

| 模块 | 模块目标 | 用户价值 | 优先级 |
| --- | --- | --- | --- |
| 24 小时基础设施总览 | 统一展示健康、容量、请求和成本 | 先判断哪里真的异常 | P0 |
| Supabase 容量与留存 | 看清表、索引、增长和可清理数据 | 避免磁盘被持续写满 | P0 |
| Cloudflare 流量归因 | 按路径和来源识别自动化流量 | 避免盲目封禁 | P0 |
| WAF / Rate Limiting 建议 | 形成观察、挑战、限流的分层规则 | 降低 Worker 与回源压力 | P1 |
| 缓存与 R2 成本分析 | 解释 Cache Status、Class B 和 OpenNext 缓存关系 | 优化访问方式而不是错误换存储类型 | P1 |
| 日志与预算治理 | 日志分级采样、预算和异常告警 | 保留排障能力并控制账单 | P1 |
| 执行记录与复盘 | 记录变更、范围、结果和回滚 | 防止重复试错 | P1 |

## 8. 改动方案：改什么、优点和缺点

### 8.1 Supabase 容量与写入治理

| 改动点 | 建议方案 | 优点 | 缺点 / 代价 | 当前建议 |
| --- | --- | --- | --- | --- |
| 容量缓冲 | 暂时允许 Supabase 自动扩容，为治理争取时间 | 不需要紧急删库，降低服务中断风险 | 会增加容量成本，也可能掩盖持续增长问题 | 接受缓冲，但必须同时推进 retention |
| Availability 原始样本留存 | 以“原始 8 天 + 小时汇总 90 天 + 日汇总 365 天”为第一版候选 | 前台仍有细粒度近期数据，长期趋势也能保留；原始表可进入稳定容量 | 8 天前无法再做逐条回放；需要先确认检测审计是否依赖原始数据 | 推荐，实施前确认 8 天边界 |
| 分批清理旧样本 | 每批删除固定数量，批次间观察锁、WAL、CPU、复制延迟和查询 | 可暂停、可控，避免一次删除把数据库打满 | 清理时间更长；`DELETE` 后磁盘图不一定立刻下降 | 推荐，禁止一次性大删 |
| 汇总表 / Rollup | 对可用率、延迟、错误类型按小时和天聚合 | 大幅降低长期数据量，趋势查询更快 | 聚合逻辑和原始数据口径需要长期维护 | 推荐作为 retention 的前置能力 |
| Detection Runs 留存 | 运行明细保留 30-90 天，长期只保留状态、耗时、样本数和错误摘要 | 控制第二大持续增长表 | 过久以前的逐次检测上下文会丢失 | P1，先确认合规和复盘需求 |
| `raw_offers` 变更写入 | 只有内容变化时更新，批量 upsert，并减少无变化快照 | 降低数据库时间、WAL、索引写放大和 timeout | 需要可靠内容指纹；错误去重可能导致更新时间不符合预期 | P1，高收益但需要代码验证 |
| 采集频率分层 | 热门、高价值、异常来源高频；低价值稳定来源降频 | 从源头减少写入，不只是事后删除 | 需要热度和健康信号；降频会牺牲部分数据新鲜度 | 与 Umami 采集分层规划联动，不先自动化 |
| 新 covering index 审查 | 先看实际命中、查询收益、写入代价，再决定保留、缩小或替代 | 若索引利用率低，可能直接释放约 273 MB 并降低写放大 | 误删会让核心可用性查询明显变慢；重建也会产生 WAL 和锁风险 | 只读审查优先，不立即删除 |

重要说明：PostgreSQL 普通 `DELETE` 主要把空间变成数据库内部可复用空间，不保证 Supabase Disk 图立即按删除量下降。普通 `VACUUM` 有助于复用，但通常不会把文件直接缩回操作系统。此次清理目标首先是停止继续膨胀，而不是追求立刻把磁盘图压回很低。

### 8.2 Cloudflare 异常流量治理

| 改动点 | 建议方案 | 优点 | 缺点 / 代价 | 当前建议 |
| --- | --- | --- | --- | --- |
| 24h 证据基线 | 保存 path、CPU、status、IP、ASN、country、UA、host 和 `_rsc` 占比 | 后续规则有证据，可判断收益和误伤 | 本身不降成本，需要先花时间整理 | P0，任何拦截前先做 |
| 数据中心 ASN 规则 | 对高频数据中心来源先 Log，再 Managed Challenge，最后才考虑 Block | 能处理分布式抓取，不依赖单 IP | VPN、企业出口、合法监测和搜索服务可能被挑战 | P1，小范围试运行 |
| 高频路径 Rate Limiting | 针对高频 `_rsc`、昂贵 GET API、搜索或分页路径分开限流 | 直接降低 Worker、R2 和 Supabase 放大 | 阈值过低会影响正常快速浏览和搜索引擎 | 推荐按路径分层，不做全站统一阈值 |
| Verified Bots / 已知好机器人放行 | 对已验证搜索机器人和明确业务监测保留访问 | 降低 SEO 和合法集成误伤 | 不能覆盖所有合法抓取者 | 与挑战规则一起配置 |
| 浏览器预取收敛 | 对长列表、批量卡片和低意图入口减少或关闭自动 prefetch | 可明显减少 `_rsc` 和无实际点击请求 | 用户真正点击时导航可能慢几十到几百毫秒 | P1，先在高请求列表页 A/B 观察 |
| 高成本接口预算 | 对会触发 Supabase 聚合、检测或大 payload 的接口设置独立预算和熔断 | 控制单类流量的伤害半径 | 需要定义正常峰值，过严会降级真实用户 | P1，与接口成本归因一起做 |

当前生产规则核查补充：

- 单 IP Custom Rule 仍只 Block `67.159.48.149`，当前 Top IP 已漂移到 `67.159.48.150`。
- 唯一 Rate Limiting 规则实际表达式为 `not starts_with(http.request.uri.path, "/_next/")`，每 IP 200 requests / 10 秒，Block 10 秒；它不是名称暗示的 RSC / offers 专项规则，而是覆盖几乎所有业务路径。
- Free 计划 Rate Limiting 已使用 `1 / 1` 名额，后续必须替换现有规则，不能继续叠加。
- Free Custom Rules 没有真正的 Log-only action；“Log 阶段”应通过 Security Analytics 使用同表达式只读观察实现，然后再进入 Managed Challenge。

规则执行顺序建议：

```text
Log
-> 观察 24-48 小时
-> Managed Challenge
-> 观察误伤和成本变化
-> 只对持续恶意且无法通过挑战的范围 Block
```

### 8.3 Cache、OpenNext 与 R2 治理

| 改动点 | 建议方案 | 优点 | 缺点 / 代价 | 当前建议 |
| --- | --- | --- | --- | --- |
| R2 Storage Class | OpenNext 热缓存继续使用 Standard | Standard 适合高频读取，不产生冷数据取回惩罚 | 不能单靠 Storage Class 降低 Class B 请求 | 保持不变 |
| Infrequent Access | 只考虑未来独立的冷归档桶，不用于 OpenNext cache | 冷备份、长期归档可能节省存储 | 热缓存读取频繁，可能因更高读取和取回成本反而更贵 | 当前不采用 |
| Regional Cache 试点 | 在少量热门公开页面评估 regional cache，减少每个请求直接访问 R2 | 有机会降低 R2 Class B 和跨区域延迟 | 增加缓存层、失效和费用模型复杂度 | P1 试点，不一次全量切换 |
| Revalidation Queue | 使用 Durable Object Queue 替代缺省 dummy queue | 修复 stale 页面后台刷新失败，显著减少重复 error 日志，并提供生产级去重与重试 | 新增 DO binding / migration 和少量 DO 成本 | P1 第一批实施 |
| Cache interception / 公共响应缓存 | 优先缓存安全的公开 GET 页面与 API，排除登录、后台、个性化和写接口 | 提高 HIT，降低 Worker 与 Supabase 回源 | 缓存错误会展示旧数据或跨用户污染 | 先列白名单和 TTL，再实施 |
| R2 生命周期 | 不对现有 OpenNext 桶直接做粗暴生命周期删除；先验证框架兼容和对象年龄分布 | 避免无界存储增长 | 生命周期过短会造成缓存重建风暴，手工删对象可能破坏缓存一致性 | 暂不直接配置 |
| 缓存预热与失效 | 只对核心页面做受控预热，发布或数据刷新后按业务粒度失效 | 降低冷启动波动 | 预热本身会产生请求，失效规则复杂 | P2，先解决无效预取和命中率 |

R2 当前的主要问题不是“存了 12.61 GB”，而是 OpenNext cache 在 24 小时产生约 2.33M Class B。优化重点应是减少无意义页面请求、提高边缘命中、减少直接读 R2 的次数，而不是先换 Storage Class。

### 8.4 Observability、预算与 24 小时视图

| 改动点 | 建议方案 | 优点 | 缺点 / 代价 | 当前建议 |
| --- | --- | --- | --- | --- |
| 普通成功日志采样 | 普通 2xx 请求保留 5%-10% 样本 | 可把日志事件量降低约 80%-95% | 低频问题可能不在样本中 | P1，先保留 10%，再评估 5% |
| 错误与安全日志 | 4xx/5xx、WAF 命中、限流、异常 CPU、异常路径尽量全量保留 | 核心排障证据不丢 | 仍有一定日志成本 | 必须保留 |
| 预算阈值 | 对 Workers Requests、CPU、R2 B、Logs、Supabase Disk 分别设日预算和变化率告警 | 能在账单前发现异常 | 阈值过敏会产生告警疲劳 | 用“绝对值 + 环比”组合 |
| 24h 快照 | 每 5-15 分钟采集关键指标，保留 24h / 7d / 30d 聚合 | 能看趋势、前后对比和改动效果 | 需要维护采集任务和指标口径 | P0 先做只读版本 |
| 执行记录 | 每次清理、WAF、限流、缓存、采样变更记录范围和时间 | 方便归因和回滚 | 增加少量运营维护成本 | P0 必须做 |

## 9. 过去 24 小时用量从哪里看

### 9.1 现有控制台入口

Supabase：

- `Reports -> Database`：查看 CPU、RAM、Disk、IOPS、连接等最近 24 小时趋势。
- Table / Database 相关页面：查看当前表和索引体积，但通常不是完整的历史体积曲线。
- Query Performance：定位累计最耗时的查询和写入。
- Billing / Usage：适合看账期累计，不适合替代逐小时归因。

Cloudflare：

- Zone `Analytics & Logs -> Traffic`：切换 `Last 24 hours`，查看请求、缓存、国家、状态码等。
- `Workers & Pages -> Workers -> Metrics`：查看 Worker 请求、错误、CPU 和子请求。
- `R2 -> Bucket -> Metrics`：查看 Storage、Class A、Class B，并切换最近 24 小时。
- `Security Analytics / Events`：查看 WAF、Rate Limiting、IP、ASN、国家、User-Agent 和处置结果。
- Workers Logs 更适合实时抽查；Billing 更适合账期汇总，二者都不能单独回答完整的 24 小时路径成本归因。

### 9.2 为什么仍然需要 PriceAI 自己的 24 小时工作台

官方控制台可以分别查看指标，但目前缺少以下联动：

1. 某个 path 带来了多少 Worker 请求、CPU、R2 B 和 Supabase 子请求。
2. 某个时间点 Disk 上升，是表数据、索引、WAL 还是清理造成。
3. WAF 挑战后，请求、登录、购买跳转和搜索引擎抓取是否一起下降。
4. 日志采样、预取收敛或缓存调整后，成本是否真的下降。

因此第一版内部工作台只需要解决：

```text
最近 24 小时
+ 前一个 24 小时
+ 最近 7 天同小时基线
+ 变更事件标记
```

不需要一开始做复杂 BI，也不需要把所有原始日志长期搬进 PriceAI 数据库。

## 10. 页面与界面结构

| 页面 / 区域 | 主要用途 | 包含内容 | 关键状态 |
| --- | --- | --- | --- |
| 基础设施总览 | 判断哪里异常 | Supabase、Workers、R2、WAF、Logs 状态卡；24h 环比；预算 | 正常、预警、异常、数据延迟 |
| Supabase 容量 | 看空间增长与清理候选 | 表/索引排行、日增长、留存覆盖、慢写入、预计耗尽时间 | 可清理、需确认、清理中、观察中 |
| Cloudflare 流量 | 归因异常请求 | path、IP、ASN、country、UA、status、CPU、cache status | 正常、可疑、挑战观察、已限流 |
| R2 与缓存 | 解释缓存成本 | 存储、Class A/B、命中率、热门缓存对象年龄、Worker 联动 | 热缓存、冷缓存、重建风险 |
| 治理建议 | 评估要不要改 | 改动点、优点、缺点、预计收益、风险、回滚方式 | 待确认、试运行、生效、回滚 |
| 变更与复盘 | 对比处理效果 | 变更时间线、24h / 7d 对比、结论、后续 | 有效、无明显变化、误伤、需扩大 |

## 11. 分阶段实施计划

### P0：证据、基线和安全护栏

目标：不改变生产行为，先形成可信的 24 小时事实。

1. 输出 Cloudflare 过去 24 小时 path、CPU、status、IP、ASN、country、UA、host 归因表。
2. 输出 Supabase 表、索引、行数、24 小时增长、可清理候选和预计增长表。
3. 标记每个指标的数据来源、采样范围和更新时间。
4. 建立禁止动作清单和回滚记录模板。
5. 保存调整前基线，至少覆盖一个完整自然日。

### P1：低风险降量

目标：先减少无效成本，不牺牲核心用户访问和数据可信度。

1. Cloudflare 规则先进入 Log / Managed Challenge 观察模式。
2. 普通成功日志降到 10% 采样，错误和安全事件尽量全量。
3. 确认 availability 原始样本 8 天留存是否满足业务。
4. 先建立小时 / 日 rollup，再开始分批清理超过留存的数据。
5. 对高频 `_rsc` 页面和昂贵 API 做小范围预取 / 限流试验。
6. OpenNext 使用 Durable Object Queue 修复 revalidation；暂不同时开启 regional cache 和 cache interception，避免多个变量一起改变。

### P2：代码与缓存结构优化

目标：从写入和缓存结构上降低长期成本。

1. `[已上线]` `raw_offers` 采集主链路已按内容变化分流，仅对 `changedRows` 做有界批量 upsert；无变化记录写入轻量 `raw_offer_confirmations`。人工下架、恢复、修复脚本仍保留直接更新语义，并新增 performance guard 防止主链路回退。
2. `[已上线，未清理]` Availability 与 Detection Runs 已形成统一 service-role retention 入口：Availability 为 8 / 90 / 365 天，Detection Runs 为 14 / 30 天；默认 dry-run、每批 5,000 行，migration 不自动执行清理。
3. `[已上线]` covering index 审查结论为保留：生产快照约 303.7 MB、11,980 次扫描和约 11.72M 元组读取，仍是多站点最近样本查询的核心 checked-at-first covering index；后台快照继续显示大小和命中，performance guard 禁止误删。
4. `[已上线]` OpenNext 已采用 `short-lived` regional cache 包裹现有 R2 incremental cache，最多复用 60 秒；R2 仍是持久缓存层，本轮没有同时启用 cache interception。
5. `[已上线]` 后台新增「系统 -> 基础设施」只读工作流，展示 Supabase 容量、留存候选、索引结论、Cloudflare 缓存配置和 2026-07-14 异常流量审计基线。Cloudflare 24h 实时 Analytics 仍明确标记为未接入，不使用伪实时数据。

P2 已于 2026-07-14 发布生产并通过 Supabase Preview、生产 RPC、Cloudflare/OpenNext workflow 和业务 smoke。Retention apply、WAF、Rate Limiting、日志采样和 R2 Storage Class / lifecycle 仍未执行。

### P3：复盘和扩大范围

目标：用 7-14 天数据决定哪些策略保留、回滚或扩展。

1. 比较 Worker 请求、CPU、R2 B、Supabase 子请求和 Disk 日增长。
2. 检查购买跳转、登录、搜索、SEO 抓取是否被误伤。
3. 根据误伤率调整 WAF、Rate Limiting 和日志采样。
4. 决定是否把 10% 普通日志进一步降到 5%。
5. 决定是否扩大 regional cache 和数据库留存范围。

## 12. 成功标准

以下是第一轮实验目标，不是对账单的硬承诺：

| 指标 | 当前基线 | 第一阶段目标 |
| --- | ---: | ---: |
| Supabase 原始样本日增长 | 约 401k 条 / 24h | 建立稳定留存，预计长期净增长下降 60% 以上 |
| Supabase Disk 风险 | 约 1.56 / 2 GB | 不再依赖临时紧急删除，容量趋势可预测 |
| Worker 请求 | 约 4.1M / 24h | 在不影响核心行为下下降 25%-40% |
| Worker -> Supabase 子请求 | 约 652k / 24h | 下降 25%-40% |
| Cache None | 约 76% | 降到 50%-60% 区间，按页面类型分别评估 |
| R2 Class B | 约 2.33M / 24h | 下降 30%-50% |
| 普通日志事件 | 全量 | 下降 80%-90%，错误与安全事件保持可追查 |
| WAF / Rate Limiting 误伤 | 尚无完整基线 | 真实用户关键行为下降不超过 3%，明确误伤率低于 0.5% |
| 异常发现时间 | 依赖人工打开多个控制台 | 重大日环比异常 15-30 分钟内可见 |

## 13. 关键风险与回滚原则

| 风险 | 防护方式 | 回滚方式 |
| --- | --- | --- |
| 清理导致数据库负载升高 | 小批量、低峰期、批次间观察 | 立即停止后续批次，不做 `VACUUM FULL` |
| 清理后仍看不到 Disk 下降 | 预先说明 PostgreSQL 空间复用机制 | 以净增长和可复用空间为成功判断，不追求立即缩盘 |
| 删除索引导致查询变慢 | 先看索引命中和查询计划 | 保留重建方案，未验证前不删除 |
| WAF 误伤真实用户 | Log -> Challenge -> Block 分阶段 | 关闭或缩小规则范围 |
| Rate Limiting 影响快速浏览 | 按 path 和成本分层，不做全站统一阈值 | 提高阈值或只保留观测 |
| 关闭 prefetch 导航变慢 | 只在高请求、低点击入口试点 | 恢复对应页面 prefetch |
| 缓存错误展示旧数据 | 公共白名单、短 TTL、排除登录和写接口 | 关闭规则并定向失效 |
| 日志采样漏掉问题 | 错误、安全、高 CPU 请求保持全量 | 临时提高采样率复现 |
| R2 生命周期造成缓存风暴 | 不直接对现有桶粗暴设置生命周期 | 不执行；如试点只用独立测试桶 |

## 14. 当前建议决策

### 建议直接进入后续方案设计的事项

1. 建立过去 24 小时 Cloudflare 路径 / CPU / IP / ASN 归因表。
2. 建立 Supabase 清理候选、rollup 和分批策略，但先不执行 SQL。
3. OpenNext R2 缓存继续使用 Standard，不切 Infrequent Access。
4. Cloudflare 防护采用 Log -> Managed Challenge -> Block 的阶段路线。
5. 普通成功日志以 10% 作为第一轮采样候选，错误和安全事件尽量全量。
6. 将“基础设施与成本”作为后台独立工作流，与 Umami 行为监测分开但可互相跳转。

### 已按本轮授权采用的默认实施口径

1. Availability 原始样本按 8 天设计；本轮只实现 rollup 和默认 dry-run 的批次函数，不执行生产删除。
2. Detection Runs 采用“14 天后清空 `raw_snapshot` / `logs` 大明细，30 天后删除不再被 Availability 样本引用的运行元数据”；默认 dry-run、每批 5,000 行，当前不删除。
3. 主导航使用 hover / focus 意图预取；商品、官方价、官方 API、中转和指南长列表关闭 viewport 自动预取。
4. WAF 先用路径、速率、RSC 特征和数据中心 ASN 组合观察，不单独按 ASN 或国家处理。
5. 普通成功日志第一轮以 10% 为候选，但本轮不在控制台直接保存采样配置。

## 15. 第一版 MVP 范围

第一版只做“看得见、解释得清、建议可审查”：

- 24 小时基础设施总览。
- Supabase 容量和清理候选。
- Cloudflare path / IP / ASN / UA 流量归因。
- R2 Class B 与 Worker / Cache Status 联动。
- 每项建议的优点、缺点、风险和回滚方式。
- 变更记录与 24 小时复盘。

第一版不做自动删除、自动封禁、自动改 retention、自动切换存储类型或自动修改采集频率。

## 16. 下一步

P0-P2 的本地实现已经完成，下一步进入生产确认门：

1. 推送当前 5 个本地提交，并确认 Supabase Preview / GitHub Integration migration replay 通过。
2. 发布 Cloudflare Workers / OpenNext，使 DO Queue、预取收敛和 60 秒 regional cache 生效。
3. migration 生效后，先在后台查看实际容量、候选数和 covering index 统计，不执行清理。
4. 至少观察一个新的完整 24 小时窗口，再比较 Worker 请求、R2 Class B、`_rsc` 占比、Supabase Disk 增长和前台导航体验。
5. 数据删除、WAF / Rate Limiting、日志采样仍作为独立生产动作逐项确认，不随应用发布自动执行。

## 17. 执行记录

| 日期 | 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- | --- |
| 2026-07-14 | P0 证据、基线和安全护栏 | 已完成 | [Cloudflare 24 小时流量归因基线](2026-07-14_priceai-cloudflare-24h-traffic-attribution-baseline.md)、[Supabase 留存与安全清理批次策略](2026-07-14_priceai-supabase-retention-and-cleanup-batch-strategy.md)；全程只读，没有清理数据、修改 WAF、调整缓存或日志采样 | 确认 availability 原始留存采用 8 天还是 14 天；确认后进入 rollup / retention migration 和 Cloudflare 观察规则设计 |
| 2026-07-14 | P1 设计收敛 | 已完成 | 核对现有单 IP Block、全站型 Rate Limiting、Free 计划配额；阅读 Next.js 16.2.9 prefetch/cache 文档与 OpenNext 1.19.11 caching 说明 | 先实现 DO Queue 与 prefetch 收敛；再实现 rollup / dry-run retention migration；生产规则和数据删除继续保留确认门 |
| 2026-07-14 | P1 第一批应用侧实现 | 已完成 | commit `46bddfb`；DO Queue、主导航意图预取、长列表 `prefetch={false}`、performance guard；lint/typecheck/Cloudflare build/wrangler dry-run 通过 | 暂不部署；与 retention migration 分开提交，生产变更统一在确认后发布 |
| 2026-07-14 | P1 rollup / retention 实现 | migration 已上线，未回填/清理 | commit `429de65`；新增小时 / 日汇总和默认 dry-run 的 5,000 行批次函数；一次性 PostgreSQL 18 验证迁移、汇总、删除和“缺少 rollup 拒绝删除”均符合预期 | 31 天回填和首批删除前单独确认 |
| 2026-07-14 | P2 Detection Runs retention 与基础设施快照 | migration 已上线，未清理 | commit `ff7a68a`；14 / 30 天分层留存、统一 retention RPC、service-role 容量快照、covering index 保留护栏；生产快照 RPC 已验证 | 不自动清理数据；先观察候选增长和复盘需求 |
| 2026-07-14 | P2 regional cache 试点 | 已发布，待观察 | commit `623034d`；R2 incremental cache 外层增加 `short-lived` regional cache，60 秒上限；cache interception 保持关闭；生产中转详情 `x-nextjs-cache: HIT` | 观察 R2 Class B、Worker CPU、缓存命中和跨区域陈旧窗口 |
| 2026-07-14 | P2 后台基础设施工作流 | 已发布 | commit `b642c43`；受保护 API、Supabase 容量与 retention 候选、covering index 统计、Cloudflare 配置和带日期异常流量基线；生产 API `200` | Cloudflare 实时 Analytics 仍需后续只读凭据；当前界面无删除、封禁或配置写入按钮 |
| 2026-07-14 | P0-P2 生产发布 | 已完成，进入观察期 | `main` 推送至 `9f8ff27`；Supabase Preview 成功；生产快照 RPC 已可用；Cloudflare Actions run `29335476824` 成功；生产 smoke、后台基础设施 API、Cloudflare/OpenNext 响应头通过 | 保存新的完整 24 小时窗口；不执行 retention apply、WAF、Rate Limiting 或日志采样修改 |

## 18. P2 改动影响、优点与缺点

P0-P2 的完整优缺点、常见故障确认顺序和回滚路径，另见[基础设施改动影响与排障确认参考](2026-07-14_priceai-infrastructure-change-impact-and-troubleshooting-reference.md)。

| 改动 | 直接影响 | 优点 | 缺点 / 代价 | 回滚 / 风险控制 |
| --- | --- | --- | --- | --- |
| `raw_offers` 只写变化内容 | 采集无变化时不再反复改主表和其索引，只更新轻量确认表 | 降低 WAL、索引写放大、数据库时间和超时概率；内容表更新时间更能代表真实变化 | 需要持续维护内容相等判断；如果漏掉关键字段，可能把应写变化误判为无变化 | performance guard 固化 `changedRows` 与批量 upsert；人工下架、恢复和修复路径不复用去重逻辑 |
| Availability 8 / 90 / 365 retention | 原始样本长期容量有上限，趋势由小时 / 日汇总承接 | 可保留近期细粒度和长期趋势，查询量更小，Disk 增长更可预测 | 8 天前无法逐条回放；普通 `DELETE` 不保证 Disk 图立即下降，首次回填会增加短时数据库负载 | 默认 dry-run、5,000 行批次、缺 rollup 覆盖拒绝删除；本轮未执行生产清理 |
| Detection Runs 14 / 30 retention | 先清理大 JSON，再清理无引用运行元数据 | 优先释放最容易膨胀的诊断 payload，同时保留 30 天状态、耗时和错误摘要 | 14 天后的完整原始检测上下文会丢失；过旧问题复盘只能依赖摘要 | 仍被 Availability 样本引用的运行禁止删除；service-role only；migration 不自动执行函数 |
| 保留 covering index | 继续占用约 280 MB，并继续承担写入维护成本 | 保护多站点最近样本查询，避免前台可用性读取退化；有真实扫描和读取证据 | 占用 Disk，并增加 Availability 写入与清理的索引维护成本 | 后台持续显示大小、扫描和元组读取；未来只有在查询改造和新基线证明可替代后再评估 |
| 60 秒 regional cache | 同一区域的热缓存读取可先命中 Cloudflare Cache API，减少每次直读 R2 的机会 | 有望降低 R2 Class B、跨区域延迟和热页面缓存读取成本；改动范围小 | 增加一层缓存；按需失效可能在其他区域产生最多约 60 秒的额外陈旧窗口；收益取决于地域复用率 | 使用 `short-lived`，不绕过 tag cache，不同时开启 cache interception；回滚只需恢复直接 R2 cache |
| 后台基础设施工作流 | 维护者可在一个页面查看容量、候选、索引、缓存配置和异常基线 | 减少在多个控制台之间切换；把“能不能清、为什么保留索引、Cloudflare 哪些仍异常”变成可审查事实 | Cloudflare path / IP / ASN / UA 当前仍是带日期审计基线，不是自动刷新的实时数据；容量 RPC 会产生少量只读统计查询 | 管理员鉴权、`private, no-store`、无执行按钮；Cloudflare 实时接入需另加只读凭据并单独评审 |

### 当前影响边界

- 已产生的影响：本地代码、migration、后台页面、自动防回退检查和本地提交已完成。
- 尚未产生的影响：生产 Worker 请求、R2 Class B、Supabase Disk、生产数据量、WAF / Rate Limiting 和 Observability 采样均未改变。
- 最主要的后续观察项：发布后 24 小时 `_rsc` 请求占比、R2 Class B、Worker CPU、regional cache 命中复用、Supabase Disk 日增长和前台真实点击导航耗时。
