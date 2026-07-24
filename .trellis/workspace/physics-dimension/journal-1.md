# 日志 - physics-dimension（第 1 部分）

> AI 开发会话日志
> 开始时间：2026-05-13

---


## Session 1: 生产发布成功后自动归档 Trellis 任务

**Date**: 2026-07-11
**Task**: 生产发布成功后自动归档 Trellis 任务
**Branch**: `main`

### Summary

将已验证的生产发布定义为当前任务终止条件，并自动执行任务归档与 session journal 记录。

### Main Changes

- Updated the PriceAI production deploy skill to auto-close the matching active Trellis task only after push, deployment, and live verification succeed.
- Added the same terminal condition to the Trellis workflow and deployment verification spec.
- Kept lifecycle hooks, deploy scripts, GitHub Actions, and unrelated working-tree changes untouched.


### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: api-transit-model-detection-ui-polish

**Date**: 2026-07-11
**Task**: api-transit-model-detection-ui-polish
**Branch**: `main`

### Summary

生产发布到 Cloudflare Workers/OpenNext，GitHub Actions run 29151840586 成功；线上 /api-transit、/api-transit/wawazz-xyz、/api-transit/models 均返回部署 SHA 7e4ebc62，WAWA 旧口径消失，新公开监测优先口径出现；Supabase migration 不涉及。

### Main Changes

- Renamed the low-cost ChatGPT Plus bucket to `ChatGPT Plus 试用订阅` and exposed market terms in its subtitle.
- Added market-keyword subtitles for ChatGPT Team / Business and ChatGPT Plus 正价代充.
- Applied the matching `canonical_products` migration and refreshed public product snapshots.

### Git Commits

| Hash | Message |
|------|---------|
| `0edd044` | (see git log) |
| `84562ab` | (see git log) |
| `98b5e35` | (see git log) |
| `48a3592` | (see git log) |
| `080cf61` | (see git log) |
| `dcc1bc5` | (see git log) |
| `7e4ebc6` | (see git log) |

### Testing

- [OK] `npm run test:catalog`, `npm run lint`, and `npm run build` passed locally.
- [OK] GitHub Actions run `29680199103` completed build, staged candidate smoke, promotion, and production smoke.
- [OK] Supabase check succeeded and production rows contain the new display names, subtitles, and aliases.
- [OK] `/api/deployment` reports commit `81286eb`; `/api/explorer` returns the new product copy through Cloudflare/OpenNext.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Deploy API transit public monitor fallback

**Date**: 2026-07-12
**Task**: Deploy API transit public monitor fallback
**Branch**: `main`

### Summary

Pushed API transit public monitor group fallback to main, deployed via Cloudflare/OpenNext Actions run 29161288486, revalidated api-transit snapshot with stationCount=10, and verified /api-transit, /api-transit/models, /api-transit/wawazz-xyz, /api-transit/sub-callai-one on priceai.cc with server=cloudflare and x-opennext=1.

### Main Changes

- Pushed `749a5ae` from local `main` to `origin/main`.
- Deployed production via `npm run deploy:production -- --wait`.
- Triggered API transit public cache revalidation after deploy.

### Git Commits

| Hash | Message |
|------|---------|
| `749a5ae7117e7ea2d9d276c1cb13bbdfc2704d40` | (see git log) |

### Testing

- [OK] Preflight: `npm run deploy:production -- --check`.
- [OK] Deploy: GitHub Actions run `29161288486`.
- [OK] Cloudflare smoke passed in the deploy workflow.
- [OK] Revalidate: `/api/cron/api-transit-revalidate` returned `snapshotWritten: true`, `stationCount: 10`.
- [OK] Live checks: `/api-transit`, `/api-transit/models?family=gpt&q=GPT%205.5`, `/api-transit/wawazz-xyz`, `/api-transit/sub-callai-one` returned 200 with `server: cloudflare` and `x-opennext: 1`.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: standard product market keyword subtitles

**Date**: 2026-07-19
**Task**: standard product market keyword subtitles
**Branch**: `main`

### Summary

Production release succeeded via GitHub Actions 29680199103 on Cloudflare/OpenNext. Supabase check succeeded; production canonical_products and /api/explorer expose the new ChatGPT Plus, recharge, and Team market-keyword subtitles. /api/deployment reports versionTag 81286eb8c681f744ce4b4e0cdcdc6345157c4b6e.

### Main Changes

- Added Kimi and Qwen transit families, official model metadata, pricing references, icons, detector presets, and normalization rules.
- Added Kimi K3, Qwen3.8-Max-Preview, and Qwen3.7-Max across catalog, collector, Sub2API mapping, UI, and database constraints.
- Kept Qwen3.8-Max-Preview unpriced until an official PAYG price or verified station quote exists.
- Synced the collector runtime to Huoshan2 and applied the Supabase migration through the repository integration.

### Git Commits

| Hash | Message |
|------|---------|
| `81286eb8c681f744ce4b4e0cdcdc6345157c4b6e` | (see git log) |

### Testing

- [OK] Lint, typecheck, focused API transit tests, catalog checks, Cloudflare build, and Supabase recovery replay passed.
- [OK] Cloudflare workflow `29717906907` promoted the candidate and passed staged and production smoke checks without rollback.
- [OK] Production `/api/deployment` reports `f2c67475`; model pages and station detail data expose the new collected models.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: LDXP 双域名自动切换与后台开关

**Date**: 2026-07-19
**Task**: LDXP 双域名自动切换与后台开关
**Branch**: `main`

### Summary

Cloudflare Actions 29692031230 发布成功；生产 versionTag 与 Huoshan2 runtime manifest 均为 24bff0a；生产后台为 auto/www.ldxp.cn；ChatGPT Plus 页 29 个 www 链动链接、0 个 pay 链动链接。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `24bff0a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: fix-source-and-ldxp-fee-pricing

**Date**: 2026-07-20
**Task**: fix-source-and-ldxp-fee-pricing
**Branch**: `main`

### Summary

为 fk.10886.xyz 固定支付宝买家手续费 4%，统一输出到手价；修复 LDxP 已持久化手续费策略读取与结算采样优先级。测试、类型检查、构建、数据库迁移、Cloudflare 发布、Huoshan2/杭州采集运行时同步均通过；线上 10886 ¥117.90 -> ¥122.62，LDxP cao ¥288.40 -> ¥297.05。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b4079e7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: sync-heyuan-ldxp-fee-runtime

**Date**: 2026-07-20
**Task**: sync-heyuan-ldxp-fee-runtime
**Branch**: `main`

### Summary

将河源 LDxP lane 运行时从 a326ebf 同步到 b4079e7，恢复 priceai-shop-scheduler-lane@1.timer；河源单店烟测 TD6GILQR 命中 cached_policy，12/12 条报价按 3% 手续费写入，生产 API 返回最新到手价。无数据库迁移、无 Cloudflare 重新部署。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b4079e7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: Add Kimi K3 and Qwen transit models

**Date**: 2026-07-20
**Task**: Add Kimi K3 and Qwen transit models
**Branch**: `main`

### Summary

Cloudflare production run 29717906907 succeeded; /api/deployment reports f2c67475; live model page shows Kimi K3 and Qwen3.7-Max after ISR refresh; collector detail exposes Kimi K3 and Qwen3.7-Max; Detector, Umami, and api.tider.cc return HTTP 200.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7c351b4` | (see git log) |
| `f2c6747` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: Fix transit monitoring scope and sample inflation

**Date**: 2026-07-20
**Task**: Fix transit monitoring scope and sample inflation
**Branch**: `main`

### Summary

A6 and APINode monitoring now preserve group/model evidence scope, deduplicate shared samples, label fallback references, and ship through Supabase, Huoshan2 collector runtime, and Cloudflare. Production A6 shows four distinct 60-sample groups and a 240-sample rollup.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5fed193` | (see git log) |
| `9a1326c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 商品详情库存与更新时间快捷筛选生产发布

**Date**: 2026-07-21
**Task**: 商品详情库存与更新时间快捷筛选生产发布
**Branch**: `main`

### Summary

Supabase Preview 与生产 RPC 验证成功；Cloudflare Actions 29804093084 发布成功；priceai.cc 运行 versionTag 8596417；商品详情筛选 API 返回 30 条且全部库存>=50、1小时内确认，边缘缓存 HIT；390px 页面无溢出或运行时错误。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `85964176774ae45fd62c41d5fd740f4fbe21495d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 发布首页购买路径卡片对齐修复

**Date**: 2026-07-24
**Task**: 发布首页购买路径卡片对齐修复
**Branch**: `main`

### Summary

仅发布首页购买路径卡片按钮对齐修复。Cloudflare Actions 30090526966 完成构建、0% 候选烟测、promotion 与生产 smoke；/api/deployment 返回 Cloudflare 版本 d3a22272-e7ca-43d8-9e39-51f995206958、versionTag 3822747；生产三张卡片按钮坐标一致，390px 无横向溢出，无数据库 migration。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3822747` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: 修复 API 中转监测过期数据误导

**Date**: 2026-07-24
**Task**: 修复 API 中转监测过期数据误导
**Branch**: `main`

### Summary

已推送 main，同步 Huoshan2 collector runtime 到 8e3def8，并由 Cloudflare workflow 30091261787 完成候选烟测、100% 切流和生产 smoke；线上 RTOC 38 条、OneHop 22 条价格确认时间已更新且与可用性时间分离。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2762922` | (see git log) |
| `2e27082` | (see git log) |
| `8e3def8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
