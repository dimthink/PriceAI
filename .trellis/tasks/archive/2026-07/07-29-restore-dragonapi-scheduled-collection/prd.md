# 恢复 DragonAPI 定时采集

## 问题

- Huoshan2 的 `priceai-api-transit-public.timer` 每 10 分钟正常执行，但生产来源配置缺少 `newapi-dragon3api-com`。
- DragonAPI 来源提交 `236d3dd` 仅存在于本地主分支，远端历史重放时没有进入 `origin/main`。
- Huoshan2 与 GitHub Actions 当前每轮只采集 12 个来源，DragonAPI 数据停留在 2026-07-28 20:38。

## 目标

- 将 DragonAPI 来源配置和对应回归测试恢复到最新 `origin/main`。
- 保持现有 10 分钟 timer，不修改调度频率。
- 同步 Huoshan2 collector runtime，并立即触发一次生产采集与缓存刷新。
- 等待下一轮 timer，确认 DragonAPI 的采集时间持续自动推进。

## 验收

- `origin/main` 与 Huoshan2 运行时配置均包含 `newapi-dragon3api-com`。
- `npm run test:api-transit`、定向 lint、类型检查、构建和 diff 校验通过。
- 手动触发后 DragonAPI `lastCollectedAt` 晚于修复前的 `2026-07-28T12:38:59.273Z`。
- 下一轮 10 分钟 timer 后 `lastCollectedAt` 再次推进，service 退出成功。
- 生产 API 保持 39 条有效报价、0 条 `plus/pro/image` 错误分组，监测来源继续指向 `/status`。
- Cloudflare/OpenNext 发布成功；无数据库迁移。
