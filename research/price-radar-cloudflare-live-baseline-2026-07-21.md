# PriceAI Cloudflare 实时成本基线

- 检查时间：2026-07-21（Asia/Shanghai）
- 数据窗口：Cloudflare Dashboard 最近 24 小时；URL/UA 分组补充查看最近 1 小时
- Worker：`priceai-cloudflare-poc` production
- 性质：只读生产面板检查；下述数字是界面当时的近似值，不应视为长期固定值

## 结论

当前流量浪费的主要入口不是 `/api/explorer`。首页、`/channels`、RSC 页面请求和大量轮换 iPhone Safari UA 占据更高请求量。访问来源高度分散，单 IP 限速只能作为兜底，不能单独解决自动化抓取。

公开 Price Radar 应承担“给机器一个稳定数据出口”的职责，但降本还需要后续针对 HTML/RSC 路径做边缘规则与页面缓存治理。不能把发布公开 API 等同于自动让现有爬虫迁移。

## Worker 指标

| 指标 | 当时读数 |
| --- | ---: |
| 24h invocations | 约 6M，较前一窗口 `+76.37%` |
| 当前版本请求速率 | 约 `185.7 req/s` |
| Asset requests | 约 2M；2xx `1.82M` |
| Asset cache hit rate | `99.81%` |
| Subrequests | 约 1M |
| Supabase subrequests | `998k` 2xx、`117k` 5xx，平均约 `303.7 ms` |
| CPU P50 | `11.28 ms` |
| CPU P90 | `52.63 ms` |
| CPU P99 | `434.26 ms` |
| CPU P999 | `3.55 s` |
| Wall time P99 | `3.03 s` |
| Request duration P99 | `2.39 s` |

Observability 日志当前采样率为 `1%`，因此下述 URL/UA 数量是 Dashboard 采样放大后的近似值，适合排序，不适合精确计费对账。

## 最近一小时 URL 分布

| URL/类型 | 近似请求量 |
| --- | ---: |
| `/` | `311,400` |
| `/channels` | `118,200` |
| `/api/account/me` | `20,300` |
| `/api/explorer` | `5,800` |
| sponsor assets | 每项约 `3,000` |
| guide RSC query variants | 每个变体约 `3,000` |

这说明直接优化 `/api/explorer` 能降低该端点 CPU/数据库负担，但不足以解释或消除大部分 Standard Requests。主页与频道页的 HTML/RSC 自动访问才是下一轮治理重点。

## 自动化流量特征

- Top User Agents 出现大量仅版本号变化的 iPhone Safari UA，单个精确 UA 约 `63k-72k` 请求。
- 同类 UA 还出现 Base64 编码形式（`TW96...`），单个约 `35k-41k` 请求，明显不像正常浏览器分布。
- Top IP 第一名约 `1.9k/h`、第二名约 `1.6k/h`，随后快速下降，未出现可解释总体流量的单一来源。
- Top ASN 同样分散，例如 AS4134 约 `18.9k/h`、AS16509 约 `13.9k/h`。

综合判断：流量很可能包含住宅代理或分布式自动化请求。只做 IP rate limit 会漏掉大量来源；UA 规则也必须避免依赖一个容易伪造的精确字符串。

## 当前实施含义

1. 匿名快照放在 `data.priceai.cc` 的 R2 custom domain，不进入主 OpenNext Worker。
2. 每次发布使用一个不可变数据对象和一个 `latest.json` 指针；无变化时不写 R2。
3. 文档、`robots.txt` 与 `llms.txt` 明确引导智能体使用快照。
4. 上线后单独观察 `data.priceai.cc` 的 CDN HIT、R2 Class B 和主 Worker path 分布。
5. P1 稳定后再对主页、`/channels` 和异常 UA/RSC 模式制定 WAF/rate-limit 规则；先记录后挑战，避免误伤正常用户与搜索引擎。

## 尚未得到的指标

- 当前账单中的 R2 Class B 无法从此面板直接按 bucket/object key 拆分。
- 现有 1% 日志采样不足以做精确路径成本归因。
- WAF 阻断是否在当前账户账单口径下完全不计 Worker request，仍需上线后用对照窗口验证。
- Price Radar 上线不会自动改变旧爬虫行为，需要通过发现文档、访问日志和渐进式边缘治理衡量迁移率。

## P1 外部配置记录

2026-07-21 已在 Cloudflare 当前账户完成并复核：

- 创建 R2 Standard bucket：`priceai-price-radar`，位置 `WNAM`。
- 应用 `config/price-radar-r2-cors.json`：匿名 `GET`/`HEAD`，允许条件请求头并暴露 `ETag`、`Last-Modified`。
- 将 R2 custom domain `data.priceai.cc` 连接到该 bucket，最低 TLS `1.2`。
- 新建并启用 Cache Rule `Cache Price Radar JSON snapshots`：
  - 表达式：`(http.host eq "data.priceai.cc" and http.request.method in {"GET" "HEAD"} and starts_with(http.request.uri.path, "/v1/"))`
  - 动作：符合缓存条件。
- 启用 `priceai.cc` zone 的 Smart Tiered Cache；控制台复核 `aria-checked=true`。

首次发布验证发现 Cloudflare Free 会把 Cache Rule 内的 `latest.json` 短 TTL 提升为 `max-age=14400`。因此最终将易变 pointer 移到规则外的 `/latest.json`，只让 `/v1/snapshots/*` 不可变对象进入强缓存；pointer 仍直接由 R2 提供，不进入 OpenNext Worker。

代码部署并首次发布快照后，仍需用两次独立请求验证 `CF-Cache-Status` 从 `MISS`/`DYNAMIC` 转为 `HIT`，并确认响应没有 `x-opennext`。
