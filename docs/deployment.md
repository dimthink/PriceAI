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

部署命令：

```bash
vercel deploy --prod --yes
```

`CRON_PUBLIC_BASE_URL` 建议填写正式域名，例如 `https://priceai.cc`。

`NEXT_PUBLIC_UMAMI_WEBSITE_ID` 为可选项。使用 Umami Cloud 时，在 Umami 后台新增 Website 后复制 Website ID；`NEXT_PUBLIC_UMAMI_SCRIPT_URL` 可不填，默认使用 `https://cloud.umami.is/script.js`。

## GitHub Actions 定时采集

仓库包含 `.github/workflows/collect-prices.yml`，默认每 30 分钟运行一次。

需要配置 GitHub Actions secrets：

| Secret | 用途 |
| --- | --- |
| `COLLECT_PRICES_URL` | 采集入口，例如 `https://priceai.cc/api/cron/collect-prices` |
| `CRON_SECRET` | 与 Vercel 中的 `CRON_SECRET` 保持一致 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | 采集写入数据库使用 |

工作流会在 GitHub runner 中安装依赖，然后执行：

```bash
npm run collect:prices -- --all --post --endpoint "$BASE_URL"
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
