# API 中转监测粒度与样本去重修复

## 背景

PriceAI 当前会把站方公开的分组、模型或模型族监测复制到多个 offer，再在套餐与站点汇总时按 offer 重复累计。A6-API 因采集器忽略 `monitoring[].group_name` 并触发 model/family fallback，四个不同套餐均显示约 93.6%，原始约 60 个站点样本被放大为 4320。

## 目标

1. 优先使用上游明确提供的监测分组标识，恢复 A6-API、APINode 等来源的精确关联。
2. 在公开数据契约中表达监测的真实 scope 与 match level，不再把参考数据伪装成套餐实测。
3. 套餐、模型族和站点汇总按独立监测证据去重，禁止按 offer 数量放大样本。
4. 价格表明确展示“套餐监测 / 分组公开监测 / 同模型参考 / 同家族参考”等口径。
5. 为别名漂移、fallback 和样本放大增加回归测试与采集诊断。

## 范围

- `ai_transit_snapshot` 监测解析、分组匹配、timeline sample scope。
- New API performance summary 等模型级参考数据的公开 match level。
- Transit availability 类型、Supabase 列与兼容迁移。
- 套餐、family、station 监测汇总去重。
- 详情页桌面与移动端监测来源标签、说明和 tooltip。
- A6-API、APINode 当前分组映射及通用采集诊断。
- 单元/脚本测试、类型检查、构建和生产数据验收。

## 非目标

- 不把站方公开监测升级为 `PriceAI 实测`。
- 不改变倍率、缓存命中率或官方模型价格的计算口径。
- 不重建监控系统，不让 Cloudflare 部署流程负责数据库迁移。
- 不覆盖已有 `priceai_probe` 证据。

## 数据语义

- `scope`: `station | group | model | offer`，描述监测证据真实覆盖范围。
- `matchLevel`: `exact | group | model | family`，描述证据与当前报价行的匹配方式。
- `monitoringScopeId`: 同一监测证据在不同 offer 间共享的稳定标识，用于汇总去重。
- 旧数据缺少字段时保持可读，并使用保守 fallback：可展示但不得声称套餐精确监测。

## 验收标准

1. A6 四组分别关联上游四条监测，当前滚动值应接近 98.8%、81.3%、98.4%、96.1%，不再统一为 93.6%。
2. A6 分组样本按对应 timeline 计一次；站点汇总不再出现 4320 的 offer 重复累计。
3. APINode 对应 GPT 通道可精确或显式别名关联；无精确映射时显示参考而非套餐监测。
4. MFAPI、Sub Callai、WAWA 等分组 timeline 被多个模型引用时，分组和站点样本只计一次。
5. model/family fallback 不参与套餐精确稳定性排序，且 UI 必须行内显示参考层级。
6. `priceai_probe` 优先级及保护逻辑不回归。
7. collector tests、typecheck、lint、build 通过；迁移由 Supabase GitHub Integration 应用后验证生产详情 API。

## 发布与回滚

- 代码改动单独提交并推送 `main`；migration 合入后由 Supabase GitHub Integration 应用。
- Cloudflare 仍使用 `npm run deploy:production`。
- 新字段全部可空，旧读取兼容；出现异常时可先回滚 UI/汇总逻辑，采集字段保留不会破坏旧客户端。
