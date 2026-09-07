# 后台上传滚动白屏修复生产发布

## 目标

将已完成并验证的后台上传控件修复独立发布到 `main`，避免 Chrome 文件选择器关闭后把后台工作区滚出视口。

## 发布范围

- 只发布本次修复对应的三个文件：
  - `src/components/admin/AdminImageUploadButton.tsx`
  - `src/components/AdminConsole.tsx`
  - `src/components/ApiTransitAdminConsole.tsx`
- 从最新 `origin/main` 创建隔离工作区并摘取工作 commit `af32ae2`。
- 不发布本地未推送的 `892749a perf(api-transit): precompute model index`。
- 不包含数据库 migration、Collector Runtime 或生产凭据变更。

## 验收

- 隔离发布 diff 只包含上述三个文件。
- ESLint、TypeScript 和正式构建通过。
- `npm run deploy:production -- --check` 确认目标为 Cloudflare Workers/OpenNext。
- 推送隔离 release commit 到 `origin/main`。
- `npm run deploy:production -- --wait` 成功。
- `/api/deployment` 返回本次 release commit，且 `platform=cloudflare`。
- `/admin?tab=sponsors`、`/api/health` 返回 200，并有 Cloudflare/OpenNext 响应证据。
- 生产构建产物不再包含后台 `type="file"` 与 `sr-only` 的危险组合。

## 回滚

回滚本次隔离 release commit，并通过同一 Cloudflare/OpenNext 流程重新部署上一版本。无数据库回滚需求。
