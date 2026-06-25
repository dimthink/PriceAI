# PriceAI Workers 成本治理与性能优化产品规划

> 日期：2026-06-23
> 范围：`priceai.cc` / `www.priceai.cc` 的 Cloudflare Workers + OpenNext 生产运行成本
> 目标：降低 Workers CPU 账单，同时保持价格数据可信、页面可用、公开 API 可控。

## 1. 背景

PriceAI 当前生产入口已经迁移到 Cloudflare Workers + OpenNext。近期 Cloudflare 账单显示，Workers CPU ms 已成为唯一明确产生额外费用的项目；R2、D1、Workers Requests 暂未产生超额费用。

本次规划基于两类证据：

1. Cloudflare 账单截图：Workers CPU ms 总使用量约 `94.78M`，其中可计费约 `64.78M`，本账期成本约 `$1.30`。
2. 线上 Worker 实时采样：约 `144.3s` 内采集到 `2912` 条真实请求，总 CPU 约 `114,191 ms`。

关键判断：

- 费用不是“每天固定扣钱”，而是请求进入 Worker 后消耗 CPU，超过套餐包含量后按量计费。
- 当前成本主要来自公开 API 的少量重请求，而不是页面 HTML 或静态资源。
- 现有短缓存可以减少 Supabase 压力，但只要请求仍进入 OpenNext Worker，就仍会消耗 Workers CPU。

## 2. 产品目标

### 2.1 核心目标

把 PriceAI 的公开价格查询能力从“每个请求现场计算”逐步改成“热点数据预生成、请求轻量读取、异常访问受控”。

### 2.2 成本目标

| 阶段 | Workers CPU 目标 | 账单目标 |
|---|---:|---:|
| 第一阶段 | 总 CPU 从当前约 `95M/月` 降到 `45M/月` 以下 | CPU 超额费用降到约 `$0.30/月` 以内 |
| 第二阶段 | 总 CPU 降到 `30M/月` 附近或以下 | 尽量回到套餐包含量内 |
| 长期目标 | API CPU 与流量增长解耦 | 访问量上涨时账单线性放大明显减弱 |

### 2.3 体验目标

- 用户打开首页、商品详情、渠道页时仍能快速看到价格概览。
- 价格数据继续显示 `generatedAt` / 更新时间，不伪装成实时价格。
- 热门筛选、翻页、详情报价不能因为限流或缓存治理而明显损害正常用户体验。
- 公开 API 可以服务产品自身前端，但不再鼓励外部批量拉全量数据。

## 3. 当前诊断

### 3.1 账单结构

| 产品 | 使用情况 | 成本判断 |
|---|---:|---|
| Workers CPU ms | `94.78M` 总量，`64.78M` 可计费 | 当前主要成本来源 |
| Workers Standard Requests | `6.04M` | 未超套餐 |
| R2 Class B Operations | `4.21M` | 未超套餐 |
| R2 Class A Operations | `126.22k` | 未超套餐 |
| R2 Data Storage | `0.46 GB-months` | 未超套餐 |
| D1 | 基本无使用 | 非成本重点 |

### 3.2 线上请求采样

采样窗口：约 `144.3s`

| 请求类型 | 请求数 | CPU 总量 | 平均 CPU | 判断 |
|---|---:|---:|---:|---|
| `/api/*` | `85` | `75,361 ms` | `886.6 ms` | 成本主因 |
| RSC / 预取 / 客户端导航 | `2763` | `36,258 ms` | `13.1 ms` | 数量大，但单次轻 |
| 页面 HTML | `59` | `2,407 ms` | `40.8 ms` | 不是首要问题 |
| 静态/文件 | `5` | `165 ms` | `33 ms` | 影响很小 |

Top CPU 路径：

| 路径 | 请求数 | CPU 总量 | 平均 CPU | 备注 |
|---|---:|---:|---:|---|
| `/api/explorer` | `26` | `27,289 ms` | `1,049.6 ms` | 首页探索器数据源 |
| `/api/offers` | `5` | `12,102 ms` | `2,420.4 ms` | 发现 `limit=1200` 批量拉取 |
| `/api/products/chatgpt-plus/offers` | `14` | `8,988 ms` | `642 ms` | 商品详情报价 |
| `/api/products/chatgpt-codex-service/offers` | `7` | `5,620 ms` | `802.9 ms` | 商品详情报价 |
| `/api/products/chatgpt-team-business/offers` | `7` | `4,991 ms` | `713 ms` | 商品详情报价 |

### 3.3 成本根因

1. **公开 API 单次 CPU 过高**
   `/api/explorer`、`/api/offers`、`/api/products/[id]/offers` 需要读取、聚合、过滤、排序和序列化价格数据。即使命中短缓存，只要请求进入 Worker，仍会产生 CPU。

2. **公开 API 参数过宽**
   后端目前允许最高 `PUBLIC_OFFER_LIMIT = 1200`。正常前端翻页是 `80`，但采样中出现了 `limit=1200&offset=...`，这类请求很容易被外部脚本或数据搬运工具放大。

3. **客户端 2 分钟刷新策略偏激进**
   首页探索器和报价列表都有约 `2 分钟`的客户端/服务端短缓存。它有利于新鲜度，但对价格比较站来说，很多用户并不需要每 2 分钟自动触发重请求。

4. **OpenNext Worker 承担了过多公开数据分发职责**
   当前主 Worker 同时负责页面渲染、公开 API、后台 API、cron 鉴权、R2 incremental cache。公开价格数据这种高频读场景，更适合被拆成轻量数据快照或独立边缘读路径。

5. **历史 CPU 缺少路径级日报**
   Cloudflare 账单能看到 Workers CPU 总量，实时 tail 能看到单条请求 CPU，但当前还没有稳定的“每天按路径归因 CPU”的产品化观测面板。

## 4. 产品原则

1. **先止血，再重构**
   先限制明显异常的高成本请求，再做预生成和架构拆分。

2. **价格可信度优先**
   降成本不能靠长期显示过期价格。所有缓存策略必须保留更新时间、采集时间和降级提示。

3. **公开 API 不是无限数据出口**
   前端需要的是分页和筛选能力，不是对外提供无限制批量下载。

4. **Cloudflare 只负责站点部署，数据库迁移继续交给 Supabase Integration**
   如果涉及 Supabase RPC / migration，仍按现有生产规则走 `supabase/migrations/*.sql` 和 Supabase GitHub Integration。

5. **观测先行**
   每一项优化都要能用 Workers CPU、API 响应体积、TTFB、错误率、Supabase egress 复查。

## 5. 路线图

## 阶段 0：成本观测基线

目标：把“感觉贵”变成每天可复查的成本面板。

| 编号 | 事项 | 优先级 | 说明 |
|---|---|---|---|
| O0-1 | 建立 Workers CPU 采样脚本 | P0 | 定时采样 `wrangler tail`，按 path / method / status / cpuTime 聚合 |
| O0-2 | 记录 Cloudflare 账单日快照 | P0 | 每天记录 Workers CPU ms、requests、R2、D1 成本 |
| O0-3 | 增加异常 API 参数统计 | P0 | 重点记录 `limit > 200`、高 offset、高频 IP/ASN/UA |
| O0-4 | 输出周报 | P1 | 每周对比优化前后 CPU、请求量、Top 路径 |

验收：

- 能看到每天 Top CPU API 路径。
- 能看到 `/api/offers?limit=1200` 这类异常请求的数量趋势。
- 能区分正常前端访问、机器人、批量数据拉取。

## 阶段 1：公开 API 止血

目标：用最小改动阻止明显异常请求继续放大 CPU。

| 编号 | 事项 | 优先级 | 产品收益 |
|---|---|---|---|
| C1-1 | 收紧公开 API `limit` 上限 | P0 | 将 `/api/offers`、`/api/products/[id]/offers` 的公开上限从 `1200` 下调到 `80-200` |
| C1-2 | 限制 `offset` 深翻页 | P0 | 避免外部脚本一页一页扫完整数据集 |
| C1-3 | 查询参数归一化 | P0 | 过滤过长 `q`、过多 tags、非法 sort/stock，减少缓存碎片和异常计算 |
| C1-4 | Cloudflare WAF / Rate Limit | P0 | 对 `/api/explorer`、`/api/offers`、`/api/products/*/offers` 做路径级限流 |
| C1-5 | 对批量拉取返回清晰错误 | P1 | 对外部滥用请求返回 `400/429`，提示使用正常分页 |

建议策略：

- 正常前端分页保持 `limit=80`。
- 公开 API 最大 `limit` 建议先设为 `200`，观察 24-72 小时。
- `offset` 可以先设软上限，例如超过一定深度返回错误或要求更具体筛选。
- 后台/admin/cron 不走这套公开限流规则。

验收：

- 生产日志中不再出现成功的 `limit=1200` 公开请求。
- `/api/offers` 平均 CPU 明显下降。
- 正常首页、筛选、商品详情翻页不受影响。

## 阶段 2：热点数据快照化

目标：把高频公开读从“实时聚合”改为“读取预生成快照”。

| 编号 | 事项 | 优先级 | 产品收益 |
|---|---|---|---|
| C2-1 | `/api/explorer` 快照化 | P0 | 首页探索器直接读 R2/KV/内存快照，避免每次重新聚合 |
| C2-2 | 热门商品报价第一页快照 | P0 | 对 ChatGPT Plus、ChatGPT Team、Claude、Gemini 等热门商品预生成第一页报价 |
| C2-3 | 全站报价列表默认页快照 | P1 | `/api/offers?limit=80&offset=0` 等默认入口轻量化 |
| C2-4 | 快照更新与采集任务联动 | P1 | 采集写入后只标记 dirty 和影响范围，由 3 分钟增量任务合并刷新，失败时保留旧快照并提示 stale |
| C2-5 | 快照版本与 `generatedAt` | P1 | 所有前台展示继续显示数据时间，不隐瞒缓存 |

实现方向：

- 短期：在现有 Worker 内读取 R2/KV 快照，减少 CPU 和 Supabase 读取。
- 中期：将公开数据快照独立为更轻的 data API Worker，避免 OpenNext Worker 每次加载完整应用逻辑。
- 长期：由采集/后台写入流程标记 dirty 和影响范围，再由独立调度任务增量生成受影响商品快照；`explorer`/默认 `offers` 最多 5 分钟合并刷新，全量快照 60 分钟兜底，而不是用户请求或每个写入请求触发生成。

验收：

- `/api/explorer` 平均 CPU 从约 `1000 ms` 降到 `100-150 ms` 以下，理想状态低于 `50 ms`。
- `/api/admin/crawl-log` 不再同步刷新全量快照，单次写回 CPU 目标先降到 `1000 ms` 以下。
- 首页首屏仍能展示完整产品概览。
- 快照过期时显示更新时间或降级提示，而不是失败空白。

## 阶段 3：前端请求策略优化

目标：减少不必要的重复请求，不牺牲用户对价格新鲜度的信任。

| 编号 | 事项 | 优先级 | 产品收益 |
|---|---|---|---|
| C3-1 | 调整首页探索器自动刷新 | P1 | 从 2 分钟自动刷新改为更长 TTL 或用户触发刷新 |
| C3-2 | SSR 数据新鲜时不立刻二次 fetch | P1 | 避免打开页面后马上重复请求 `/api/explorer` |
| C3-3 | 报价列表保留旧数据错误态 | P1 | 弱网失败不清空已有列表，降低重复重试 |
| C3-4 | 产品详情报价分页请求去重 | P1 | 切筛选/翻页时取消旧请求，防止旧响应污染缓存 |
| C3-5 | RSC 预取策略收敛 | P2 | 对重页面或长列表链接减少无意义预取 |

验收：

- 首页加载后 2 分钟内的重复 `/api/explorer` 请求下降。
- 用户手动筛选和翻页体验不变。
- 弱网失败时 UI 更稳定，不诱发用户连续刷新。

## 阶段 4：数据库与 RPC 成本治理

目标：让公开 API 的数据库读取继续保持分页、聚合、低 egress。

| 编号 | 事项 | 优先级 | 产品收益 |
|---|---|---|---|
| D4-1 | facets RPC 失败不回退全表读取 | P0 | 防止非核心筛选计数失败拖垮公开报价接口 |
| D4-2 | 商品详情 JSON-LD 改聚合读取 | P1 | 不再为了结构化数据查询 1200 条报价 |
| D4-3 | filter tags 规则统一 | P2 | 降低 TS/SQL 双实现漂移和 DB 正则扫描 |
| D4-4 | 热门商品 summary materialize | P2 | 为快照化和首页探索器提供稳定数据源 |

验收：

- RPC 异常时，报价分页仍返回当前页数据。
- 公开 API payload 继续维持在合理范围：`/api/explorer` 数十 KB、80 条报价接口约 100KB 以下。
- Supabase egress 不因公开读路径突然升高。

## 阶段 5：架构分层与预算护栏

目标：让 PriceAI 可以承接更多访问，不因为一个 Worker 混跑所有职责而持续放大成本。

| 编号 | 事项 | 优先级 | 产品收益 |
|---|---|---|---|
| A5-1 | 建立独立 staging Worker | P1 | 新版本不直接影响生产主域 |
| A5-2 | 区分 Web Worker 与 Data API Worker | P2 | 公开数据读路径更轻，OpenNext Worker 专注页面 |
| A5-3 | R2 incremental cache prefix 分环境 | P2 | 避免 staging/prod 缓存互相污染 |
| A5-4 | 成本预算告警 | P1 | Workers CPU 接近阈值时提前提醒 |
| A5-5 | 月度成本复盘 | P2 | 把 Cloudflare、Supabase、Umami 访问增长放在同一张表里看 |

验收：

- 生产发布继续遵守 Cloudflare Workers + OpenNext 默认路径。
- 新版本先走 preview/staging 验证，不用生产域名试错。
- 成本异常在账单生成前可见。

## 6. 优先级建议

### 近期 1-2 天

1. 收紧公开 API `limit` 和异常参数。
2. 为 `/api/offers`、`/api/explorer`、`/api/products/*/offers` 增加 Cloudflare 路径限流策略。
3. 固化 Workers tail 采样脚本，形成每日 Top CPU 报表。

### 近期 1 周

1. `/api/explorer` 快照化。
2. 热门商品第一页报价快照化。
3. 客户端自动刷新策略从“2 分钟主动刷新”改成“展示更新时间 + 手动刷新 / 更长 TTL”。
4. facets RPC 失败不再触发全表 fallback。

### 近期 2-4 周

1. 公开 Data API 与 OpenNext Web Worker 分层评估。
2. 商品 summary / offers 聚合数据模型沉淀。
3. 成本监控周报接入运维节奏。
4. 建立独立 staging Worker 和 R2 cache prefix。

## 7. 成功指标

| 指标 | 当前观察 | 第一阶段目标 | 长期目标 |
|---|---:|---:|---:|
| Workers CPU 月总量 | 约 `94.78M` | `<45M` | `<=30M` |
| Workers CPU 月成本 | 约 `$1.30` | `<$0.30` | 接近 `$0` |
| `/api/explorer` 平均 CPU | 采样约 `1049.6 ms` | `<150 ms` | `<50 ms` |
| `/api/offers` 异常大 limit | 已出现 `limit=1200` | 0 成功请求 | 持续为 0 |
| API CPU 占比 | 采样中占大头 | 明显下降 | 不再是主要成本来源 |
| 公开 API payload | 80 条报价约几十 KB | 保持现状 | 保持现状 |
| 用户价格可信度 | 有更新时间 | 保持 | 保持并强化 |

## 8. 风险与取舍

### 8.1 数据新鲜度风险

缓存和快照会让用户看到短时间内的旧价格。

控制方式：

- 保留并强化“最近更新”展示。
- 对采集失败和快照过期显示降级提示。
- 高价值页面可以提供手动刷新，而不是全站高频自动刷新。

### 8.2 外部 API 使用者受影响

如果已有外部脚本依赖 `limit=1200`，收紧后会失败。

控制方式：

- 公开 API 明确只服务站点前端和轻量查询。
- 返回清晰错误，提示使用分页。
- 如未来需要开放 API，单独设计 API key、额度和付费/合作规则。

### 8.3 SEO 与页面预取风险

收敛 RSC 预取可能影响页面导航体感。

控制方式：

- 先不动核心页面链接预取，把重点放在 API 止血。
- 对长列表、非首屏、低意图链接逐步试点。

### 8.4 Cloudflare 配置误伤风险

WAF / Rate Limit 配置过严可能误伤正常用户。

控制方式：

- 先观察和记录，再从最异常条件开始限制。
- 管理后台、cron、健康检查和必要机器人单独排除。
- 先用 log / challenge / soft block，再进入 hard block。

## 9. 决策清单

| 决策 | 建议 |
|---|---|
| 是否允许公开 API `limit=1200` | 不建议继续允许 |
| 是否继续 2 分钟自动刷新 | 建议降频，改为更新时间 + 手动刷新 |
| 是否先做大架构拆分 | 不建议，先做 API 限制和快照化 |
| 是否用 `no-store` 换新鲜度 | 不建议，会直接放大 CPU / DB 成本 |
| 是否把公开 API 作为外部数据服务 | 当前不建议，除非后续设计额度和商业化 |
| 是否把优化重点放页面 RSC | 暂不作为第一优先级，API 更贵 |

## 10. 推荐下一步

建议先开一个 P0 成本止血任务包：

1. 公共报价 API 参数上限治理。
2. Cloudflare 路径限流规则草案。
3. Workers tail 成本采样脚本。
4. `/api/explorer` 快照化方案细化。

该任务包不需要改变产品定位，但能最快让账单从“未知放大”回到“可控增长”。

## 11. 执行记录

### 2026-06-23：C1-1 公开报价 API 参数上限治理

已开始落地第一项止血动作：

- 将公开报价分页 `limit` 上限收紧到 `200`，正常前端仍使用 `80`。
- 将公开报价分页 `offset` 设为有界窗口，避免无限深翻页扫描。
- `/api/offers` 与 `/api/products/[id]/offers` 共用同一套公开分页参数解析。
- 服务层保留硬上限兜底，避免绕过 Route Handler 后重新放大。
- 性能 guard 增加防回归检查，阻止公开 API 回到 `1200` 行批量页。

本次生产验证：

- `https://priceai.cc/api/offers?limit=80` 返回 `200`，`rows=80`，约 `73.8KB`。
- `https://priceai.cc/api/products/chatgpt-plus/offers?limit=80` 返回 `200`，`offers=80`，约 `73.9KB`。
- `https://priceai.cc/api/offers?limit=1200` 返回 `400`，`code=limit_too_large`。
- `https://priceai.cc/api/products/chatgpt-plus/offers?limit=1200` 返回 `400`，`code=limit_too_large`。
- GitHub Actions Cloudflare 部署 run：`https://github.com/physics-dimension/PriceAI/actions/runs/28012439896`。

### 2026-06-23：O0-1 Workers CPU 采样脚本

新增只读分析脚本：

```bash
npm run analyze:workers-tail -- --file /tmp/priceai-wrangler-tail.jsonl
npm run analyze:workers-tail -- --file /tmp/priceai-wrangler-tail.jsonl --json
```

建议采样命令：

```bash
node_modules/.bin/wrangler tail priceai-cloudflare-poc --format json --sampling-rate 0.99 > /tmp/priceai-wrangler-tail.jsonl
```

脚本会按请求类型、路径、方法类型和来源聚合 `cpuTime` / `wallTime`，用于持续验证 `/api/explorer`、`/api/offers`、`/api/products/[id]/offers` 是否仍是 Top CPU 来源。

### 2026-06-23：C1-4 Cloudflare 路径限流权限状态

当前本机 Wrangler OAuth token 能读取 Worker / tail，但读取 Cloudflare Zone Rulesets、legacy firewall rules、rate limits API 时返回 `403 Authentication error`。因此暂不直接改线上 WAF / Rate Limit。

待具备 Cloudflare dashboard 或带 `Zone WAF` / `Rulesets` 写权限的 API Token 后，建议规则：

- 匹配路径：`/api/explorer`、`/api/offers`、`/api/products/*/offers`。
- 排除：`user-agent` 包含 `PriceAI Cloudflare smoke check`，以及后台、cron、health 路径。
- 第一阶段动作：log / managed challenge，观察 24 小时。
- 第二阶段动作：对同 IP 高频公开 API 请求做 429 或 challenge。
- 不建议一开始按国家或浏览器大面积封禁，避免误伤正常用户。

### 2026-06-23：C3-1 / C3-2 前端请求策略与价格缓存窗口

已开始落地第二层降本动作：

- 将价格类公开 API 的边缘缓存从 `120s` 调整到 `300s`，stale window 从 `600s` 调整到 `1800s`。
- 新增共享缓存策略，服务端内存缓存、CDN 响应头、首页探索器、全站报价列表、商品详情报价列表统一使用同一个价格 TTL。
- 保留 `generatedAt` / 更新时间作为新鲜度表达，不用高频自动刷新伪装实时。
- 性能 guard 增加防回归检查，阻止价格数据缓存策略再次局部漂移。

预期收益：

- 减少同一用户和同一区域内 2-5 分钟重复请求触发的 Worker CPU。
- 让 `/api/explorer`、`/api/offers`、`/api/products/*/offers` 更容易命中边缘缓存。
- 在不改变页面核心体验的前提下，降低公共读路径对 OpenNext Worker 的压力。

### 2026-06-23：D4-1 商品报价 Facets 辅助 RPC 降级隔离

商品详情报价列表会并行读取当前页报价和筛选 Facets。已将 Facets 读取改为独立降级：

- 主报价分页 RPC 成功时，即使 Facets RPC 抛出异常，也继续返回当前页报价。
- Facets 异常只记录 warning，不触发全表 fallback 或整页失败。
- 该行为已加入性能 guard，避免辅助筛选统计再次影响核心报价列表。

### 2026-06-24：C2-1 / C2-2 公开 API 快照化

执行方向：

- 新增 `public_api_snapshots` 表，保存公开 API 的预生成 JSON。
- `/api/explorer` 优先读取 `explorer/default` 快照。
- `/api/offers?limit=80&offset=0` 且无筛选时，优先读取全站默认报价列表快照。
- `/api/products/[id]/offers?limit=80&offset=0` 且无筛选时，优先读取商品默认第一页报价快照。
- 筛选、搜索、排除词和翻页仍走现有 RPC，避免牺牲功能完整性。
- 采集写入、手工报价、隐藏报价、重分类后主动刷新快照；同时提供受保护的手动刷新接口。

本阶段不调整正常用户的 Next.js 预取策略。预取属于浏览体验的一部分，异常数据中心流量后续用 WAF / rate limit / challenge 处理。

### 2026-06-24：商品详情页报价加载超时修复

问题定位：

- 多个商品详情页会出现“报价加载超时，请稍后刷新”，不是单个商品数据问题。
- 商品详情页首屏只传商品摘要和报价数量，报价表依赖浏览器二次请求 `/api/products/[id]/offers?limit=80`。
- 前端商品报价刷新默认 4 秒超时；线上 API 大多数在 150ms 左右，但存在 1-3.5 秒慢尾，真实用户网络更慢时会误触发空表超时。

修复方向：

- 商品详情页服务端预取默认第一页报价，传入 `ProductOffersPanel.initialData`，首屏不再空等客户端请求。
- 商品报价快照预热从高频前 12 个商品扩展为所有有报价商品。
- 商品报价面板使用独立 10 秒刷新超时；有旧数据时刷新失败只显示 inline 提示，不清空当前报价表。
- 性能 guard 增加断言，防止商品页再次退回无首屏报价或只预热少数商品。
