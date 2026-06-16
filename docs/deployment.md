# 部署与定时采集

PriceAI 生产主站运行在 Cloudflare Workers + OpenNext，Supabase 保存数据，GitHub Actions 或云服务器负责定时采集。

## 生产部署

默认只使用 Cloudflare 部署入口：

```bash
npm run deploy:production
```

这个命令会触发 GitHub Actions workflow `.github/workflows/deploy-cloudflare-worker.yml`，由 GitHub secrets 提供 Cloudflare 部署环境变量。本机缺少 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、后台密钥或 Umami 配置时，不再阻塞默认生产部署。

需要等待 workflow 完成并在本机再跑一次线上 smoke 时使用：

```bash
npm run deploy:production -- --wait
```

只检查当前生产目标和本机环境，不触发部署：

```bash
npm run deploy:production -- --check
```

只有确认本机已经具备完整 Cloudflare 生产部署环境时，才使用本地直发：

```bash
npm run deploy:production -- --local
```

不要默认运行 `vercel deploy --prod --yes`。旧 Vercel 项目已删除；如果必须回滚到 Vercel，应先重建 Vercel 项目，并确认 `priceai.cc` / `www.priceai.cc` 的 Cloudflare route、Vercel alias、cron owner 和 `COLLECT_PRICES_URL` 切换方案。

Cloudflare / GitHub Actions 生产环境需要维护：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `ADMIN_SESSION_VERSION`
- `CRON_SECRET`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`
- `NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS`

`NEXT_PUBLIC_UMAMI_WEBSITE_ID` 为可选项。当前生产环境使用自部署 Umami：`NEXT_PUBLIC_UMAMI_SCRIPT_URL` 填 `https://umami.dimthink.com/script.js`，`NEXT_PUBLIC_UMAMI_WEBSITE_ID` 填自部署 Umami 中 PriceAI 对应的 Website ID。`NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS` 可填 `priceai.cc,www.priceai.cc`，避免本地和预览域名上报统计。

## GitHub Actions 定时采集

仓库包含两条价格采集 workflow：

- `.github/workflows/collect-prices.yml`：主采集任务，默认每 30 分钟运行一次，排除 `dujiao` 和 `shopApi` 采集器。
- `.github/workflows/collect-dujiao-prices.yml`：`dujiao` 专项采集任务，默认每 30 分钟运行一次，并与主采集错开 15 分钟，使用并发 2。

`shopApi` 来源需要国内 IP 环境，不能放在 GitHub-hosted runner 里跑；这类来源统一交给国内轻量采集节点。

需要配置 GitHub Actions secrets：

| Secret | 用途 |
| --- | --- |
| `COLLECT_PRICES_URL` | 采集入口，例如 `https://priceai.cc/api/cron/collect-prices` |
| `CRON_SECRET` | 与 Cloudflare Worker / 采集节点使用的 `CRON_SECRET` 保持一致 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | 采集写入数据库使用 |

工作流会在 GitHub runner 中安装依赖，然后执行：

```bash
npm run collect:prices -- --all --post --endpoint "$BASE_URL" --exclude-kind dujiao,shopApi
```

渠道采集写回默认启用 flush 队列：成功来源每 `20` 个或每 `120` 秒合并写回一次；失败来源仍即时写入。需要微调时可在 workflow、cron 或服务器环境中增加：

```bash
PRICEAI_COLLECT_FLUSH_SOURCE_COUNT=20
PRICEAI_COLLECT_FLUSH_INTERVAL_MS=120000
```

`dujiao` 专项工作流执行：

```bash
npm run collect:prices -- --all --kind dujiao --concurrency 2 --post --endpoint "$BASE_URL"
```

查看最近采集性能和失败来源分组：

```bash
npm run collect:performance -- --hours 24 --limit 1500
```

## 云服务器定时采集

如果希望更稳定地控制网络环境，可以在云服务器上用 cron 或 systemd timer 执行：

```bash
npm ci
npm run collect:prices -- --all --post --endpoint https://priceai.cc
```

需要在服务器环境中配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD` 或 `CRON_SECRET`

### 国内 `shopApi` 轻量节点

`pay.ldxp.cn`、`pay.qxvx.cn`、`catfk.com` 等 `shopApi` 来源统一在国内节点运行。轻量节点从线上 API 拉取任务并回传结果，不需要 clone 仓库；默认建议使用：

```bash
curl -fsSL https://priceai.cc/priceai-edge-collector.sh | env \
  PRICEAI_EDGE_ENDPOINT="https://priceai.cc" \
  PRICEAI_EDGE_TOKEN="$CRON_SECRET" \
  bash -s -- --family shopApi --limit 3 --round
```

两台国内节点同时运行时，使用 `--shard-count 2` 并分别设置 `--shard-index 0` / `--shard-index 1`，由中心站自动把 `shopApi` 来源分成两半，避免重复采集同一批店铺。

长期运行时用 systemd timer 每 30 分钟触发一次；timer 建议关闭 `Persistent` 补跑，避免一轮采集刚结束又立刻补跑错过的半点任务。如果遇到 403 风控，节点内部按采集脚本的冷却和重试策略继续处理，避免把 `shopApi` 压回 GitHub Actions。

## 采集边界

PriceAI 不绕过验证码、登录墙、WAF 或平台风控。遇到无法公开读取的来源，应进入采集器待办，后续通过公开 API、站点结构适配或本机浏览器半自动方式处理。
