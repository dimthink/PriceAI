# 部署说明

PriceAI 当前生产推荐路径是 Cloudflare Workers + OpenNext，Supabase 保存数据，GitHub Actions 或独立采集节点负责定时采集。

## 默认生产部署

```bash
npm run deploy:production
```

这个命令会触发仓库中的 Cloudflare Workers 部署 workflow，由 GitHub secrets 提供部署所需变量。

只检查当前生产目标和本机环境，不触发部署：

```bash
npm run deploy:production -- --check
```

等待 workflow 完成并在本机再跑一次线上 smoke：

```bash
npm run deploy:production -- --wait
```

## 本地直发

只有确认本机已经具备完整 Cloudflare 生产部署环境时，才使用本地直发：

```bash
npm run deploy:production -- --local
```

默认不要使用旧 Vercel 生产发布路径。PriceAI 主站以 Cloudflare Workers + OpenNext 为准。

## 生产变量

生产环境通常需要维护：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `ADMIN_SESSION_VERSION`
- `CRON_SECRET`
- 可选分析变量：`NEXT_PUBLIC_GA_MEASUREMENT_ID`、`NEXT_PUBLIC_UMAMI_WEBSITE_ID`、`NEXT_PUBLIC_UMAMI_SCRIPT_URL`、`NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS`

## 定时采集

仓库包含价格采集 workflow，也可以使用自有服务器节点运行采集脚本。

常用命令：

```bash
npm run collect:prices -- --all --post
npm run collect:api-models
npm run collect:official
npm run collect:api-transit
```

涉及需要国内访问环境、登录状态、验证码、WAF 或人工确认的来源，不建议直接放在 GitHub-hosted runner 里高频运行。

### API 中转公开采集

API 中转公开倍率、公开模型价格和站方公开监测由 Huoshan2 的 systemd timer 承担主采集，每 10 分钟执行一次：

```bash
/opt/priceai-nonshop/run-api-transit-public.sh
```

脚本执行链路：

```text
公开来源 JSON / 公开页面 -> collect-api-transit.mjs --post -> Supabase
-> /api/cron/api-transit-revalidate -> 前台 API 中转缓存刷新
```

对应单元：

```text
priceai-api-transit-public.service
priceai-api-transit-public.timer
```

GitHub Actions 的 `.github/workflows/collect-api-transit.yml` 只保留每 6 小时兜底和手动触发，避免与 VPS 10 分钟主采集重复写库。

排查公开来源样本不更新时，优先查看：

```bash
systemctl status priceai-api-transit-public.timer
journalctl -u priceai-api-transit-public.service -n 120 --no-pager
```

## 验证

部署后至少验证：

```bash
curl -I https://priceai.cc/api/explorer
curl https://priceai.cc/api/explorer
```

确认页面可访问、公开 API 返回真实数据、缓存头符合预期、后台和采集入口没有暴露未授权写入能力。
