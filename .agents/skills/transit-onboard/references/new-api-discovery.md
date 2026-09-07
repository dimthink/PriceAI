# 公开接口发现

## New API

按顺序核验，不要求所有端点都存在：

| 路径 | 用途 |
|---|---|
| `/api/status` | 系统名、服务地址、版本、公开配置 |
| `/api/pricing` | 模型、分组倍率、固定价格 |
| `/pricing`、`/pricing-legacy` | 用户可见价格页 |
| `/status` | 用户可见监测页 |
| `/api/model-status` | 分组+模型状态、可用率、延迟时间线 |
| `/api/perf-metrics/summary?period=24` | 模型成功率、延迟、TPS |
| `/v1/models` | 常需 API Key；401/403 只说明受保护 |

使用 `scripts/inspect-new-api-source.mjs` 生成只读探测摘要。脚本结果是线索，最终仍需检查关键 payload 语义。

## Sub2API / ai-transit.v1

优先检查：

1. `/.well-known/ai-transit.json`
2. 发现文档里的 `snapshot_url`
3. 常见 `/api/public/transit/v1/snapshot`
4. 常见 `/public/transit` 页面

确认 `schema_version`、系统类型、模型/分组、充值倍率、监测时间线和验证声明。公开快照仍是站方数据，不等于 PriceAI 实测。

## 系统分类

- New API 默认前端和 `/api/pricing` 可确认：`new_api_pricing` / `new_api`。
- ai-transit.v1 结构化快照可确认：`ai_transit_snapshot`；系统按发现文档填写。
- 自研站点：先搜索仓库已有 adapter。没有 adapter 时记录为待适配，不伪装成 New API。
- 前端 generator、响应头和 `/api/status` 可作为辅助证据，不能只凭页面长相判断。

## 监测来源

始终区分：

- `public_status`：站方公开状态。
- `priceai_probe`：PriceAI 使用测试凭据执行的真实调用。
- `third_party_status`：独立第三方监测。
- `unknown`：没有可验证来源。

监测页 URL 和监测接口 URL 都要保存。存在 `/status` 页面但没有结构化接口时，不生成虚假的可用率样本。
