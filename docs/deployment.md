# 部署与定时采集

PriceAI 推荐使用 Vercel 部署前台和 API，Supabase 保存数据，GitHub Actions 或云服务器负责定时采集。

## Vercel 部署

在 Vercel 配置生产环境变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `CRON_SECRET`
- `CRON_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`
- `NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS`

部署命令：

```bash
vercel deploy --prod --yes
```

`CRON_PUBLIC_BASE_URL` 建议填写正式域名，例如 `https://priceai.cc`。

`NEXT_PUBLIC_UMAMI_WEBSITE_ID` 为可选项。使用 Umami Cloud 时，在 Umami 后台新增 Website 后复制 Website ID；`NEXT_PUBLIC_UMAMI_SCRIPT_URL` 可不填，默认使用 `https://cloud.umami.is/script.js`。`NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS` 可填 `priceai.cc,www.priceai.cc`，避免本地和预览域名上报统计。

## GitHub Actions 定时采集

仓库包含三条价格采集 workflow：

- `.github/workflows/collect-prices.yml`：主采集任务，默认每 30 分钟运行一次，排除 `dujiao` 和 `shopApi` 采集器。
- `.github/workflows/collect-dujiao-prices.yml`：`dujiao` 专项采集任务，默认每 30 分钟运行一次，并与主采集错开 15 分钟，使用并发 2。
- `.github/workflows/collect-shopapi-prices.yml`：`shopApi` 专项采集任务，默认每 30 分钟运行一次，并与主采集错开 5 分钟，使用跨主域并发 2。同一主域内部仍然串行，并保留链动小铺每轮 10 个店铺上限。

需要配置 GitHub Actions secrets：

| Secret | 用途 |
| --- | --- |
| `COLLECT_PRICES_URL` | 采集入口，例如 `https://priceai.cc/api/cron/collect-prices` |
| `CRON_SECRET` | 与 Vercel 中的 `CRON_SECRET` 保持一致 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | 采集写入数据库使用 |

工作流会在 GitHub runner 中安装依赖，然后执行：

```bash
npm run collect:prices -- --all --post --endpoint "$BASE_URL" --exclude-kind dujiao,shopApi
```

`dujiao` 专项工作流执行：

```bash
npm run collect:prices -- --all --kind dujiao --concurrency 2 --post --endpoint "$BASE_URL"
```

`shopApi` 专项工作流执行：

```bash
npm run collect:prices -- --all --kind shopApi --concurrency 2 --post --endpoint "$BASE_URL" --liandong-shop-limit 10
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

## 采集边界

PriceAI 不绕过验证码、登录墙、WAF 或平台风控。遇到无法公开读取的来源，应进入采集器待办，后续通过公开 API、站点结构适配或本机浏览器半自动方式处理。
