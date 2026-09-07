# 录入字段

## 最小输入

- 官网 URL
- 用户意图：默认理解为后台待审核

系统类型、价格页和监测页可以自动发现；发现失败时保留待办，不凭空补齐。

## 推荐输入

| 用户资料 | 配置/后台字段 | 规则 |
|---|---|---|
| 站点名称 | `name` | 以公开站点名为标准，用户拼写保留到 `adminNote` |
| 官网 | `websiteUrl` | 使用 HTTPS 规范 URL |
| API Base | `apiBaseUrl` | 通常为 `/v1`，必须核验域名 |
| 价格页 | `pricingUrl` | 用户可打开的公开页面 |
| 价格接口 | `pricingEndpointUrl` | 采集器实际读取的结构化接口 |
| 监测页 | `monitorUrl` | 用户可打开的状态页面 |
| 监测接口 | `monitorEndpointUrl` | 采集器实际读取的数据接口 |
| 系统类型 | `stationSystem` / `collectorKind` | 依据公开证据确认，不只依据用户口述 |
| 充值倍率 | `rechargeRatio` | 保留原始口径，例如 `1:25` |
| 主流模型倍率 | `adminNote` / `cautions` / evidence | 与公开接口分别保存 |
| 模型来源 | `channelTypes` / `accountPools` | 只能映射用户明确提供或公开披露的内容 |
| 售后入口 | `supportChannels` | 不推测联系方式 |
| 退款规则 | `refundPolicy` | 保留条件和限制 |
| 主体类型 | `operatorType` | `individual`、`company`、`overseas`、`unknown` |
| 发票 | `invoiceSupport` | `supported`、`unsupported`、`unknown` |
| 运营时长/规模 | evidence / `adminNote` | 标明自报、截图或公开证据，不当作已验证事实 |
| AFF/赞助关系 | `commercialRelation` | 无证据默认 `none`，但不要隐瞒已知关系 |

## 缺失值规则

- 非关键商业字段缺失：使用 `unknown` 或在 `adminNote` 列入待补充，不阻塞草稿入库。
- 价格接口不可读取：可以保留提交记录，但不能声称已完成价格采集。
- 监测接口不可读取：记录监测页存在与否，availability 必须保持未知。
- 需要 API Key：不索取明文凭据；只有项目加密凭据流程可用且用户明确授权时再处理。
- 站点已存在：转为补充/修复现有记录，不创建重复 ID。

## 草稿安全默认值

```json
{
  "autoPublish": false,
  "commercialRelation": "none",
  "operatorType": "unknown",
  "invoiceSupport": "unknown",
  "riskLabels": ["insufficient_samples", "pending_feedback"]
}
```

只覆盖用户或公开证据能够支持的字段。
