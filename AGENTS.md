<!-- BEGIN:nextjs-agent-rules -->
# 这不是你熟悉的 Next.js

此版本有破坏性变更——API、约定和文件结构可能与你的训练数据不同。写任何代码之前，先阅读 `node_modules/next/dist/docs/` 中的相关指南。注意弃用通知。
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:priceai-deploy-rules -->
# PriceAI 生产部署默认走 Cloudflare

`priceai.cc` 与 `www.priceai.cc` 的生产入口是 Cloudflare Workers + OpenNext。默认生产发布必须使用：

```bash
npm run deploy:production
```

这个命令默认触发 `.github/workflows/deploy-cloudflare-worker.yml`，通过 GitHub secrets 部署到 Cloudflare。不要默认运行 `vercel deploy --prod --yes`；旧 Vercel 项目已删除，除非用户明确要求重建 Vercel 回滚环境或排查历史 Vercel 记录。

部署前如果只想检查当前生产目标和本机环境，运行：

```bash
npm run deploy:production -- --check
```
<!-- END:priceai-deploy-rules -->
