# 首页购买路径卡片对齐修复发布

## 目标

将已提交的首页购买路径卡片布局修复发布到 PriceAI 生产环境，确保三张卡片的操作按钮在桌面端对齐，同时不影响移动端布局。

## 发布范围

- 原始工作 commit：`7d0956d fix(home): align decision card actions`
- 隔离发布 commit：`3822747 fix(home): align decision card actions`
- 代码范围：`src/app/page.tsx`
- 生产入口：Cloudflare Workers + OpenNext，通过 `npm run deploy:production -- --wait`
- 本次无数据库 migration、无采集器 runtime 变更。

## 验收标准

1. GitHub Actions Cloudflare 部署成功并完成等待。
2. `https://priceai.cc/` 返回成功，且页面由 Cloudflare/OpenNext 提供。
3. 生产首页的三张购买路径卡片按钮组视觉上对齐。
4. `/api/deployment` 能证明本次生产部署版本，关键公开 API 仍返回成功。
5. 工作区中其他未提交改动不进入本次发布。

## 回滚

如生产验证失败，回滚到上一个已验证的生产 commit 并重新走 Cloudflare/OpenNext 发布流程。
