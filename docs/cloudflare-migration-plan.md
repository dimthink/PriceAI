# Cloudflare 迁移执行计划

本文档用于规划 PriceAI 从 Vercel 迁移到 Cloudflare Workers / OpenNext 的执行路径。目标是先完成测试域名验证，再安排生产域名切换，避免因为账号额度、DNS、缓存或采集任务混在一起导致不可控停机。

## 迁移目标

- 主站运行时迁移到 Cloudflare Workers + OpenNext。
- 继续使用 Supabase 作为业务数据库，不在本轮迁移 D1。
- 继续使用 GitHub Actions / 云服务器执行价格采集，不把采集任务迁入 Worker 请求路径。
- 先验证 `cf.priceai.cc`，再切 `priceai.cc` / `www.priceai.cc`。
- 旧的两个无用域名不纳入迁移。
- Vercel 保留为短期回滚目标，直到 Cloudflare 生产运行稳定。

## 目标架构

| 层 | 迁移后形态 | 说明 |
|----|------------|------|
| Web / API 运行时 | Cloudflare Workers + OpenNext | 承载 Next.js 页面、公开 API、后台 API |
| 静态资源 | OpenNext assets + Cloudflare edge | 由 Worker 配置中的 `assets` 绑定服务 |
| ISR / revalidate 缓存 | R2 incremental cache | 当前 POC 绑定 `NEXT_INC_CACHE_R2_BUCKET` |
| 数据库 | Supabase Postgres | 保留现状，重点监控 egress 和 RPC 权限 |
| 采集任务 | GitHub Actions / VPS | 继续外置执行，写入 Supabase |
| Analytics | 自部署 Umami | 保持 `https://umami.dimthink.com/script.js`，不要切到默认 cloud Umami |
| 生产域名 | Cloudflare DNS / route | 测试域名稳定后再切主域名 |

## 阶段 0：POC 基线

状态：已完成。

已完成事项：

- 创建并推送 `codex/cloudflare-workers-poc` 分支。
- 加入 OpenNext / Wrangler 依赖和脚本。
- 新增 `open-next.config.ts`、`wrangler.jsonc`、`.open-next` / `.wrangler` 忽略规则。
- 本地通过 `npm run lint`、`npm run build`、`npm run build:cloudflare`。
- Wrangler 本地预览验证首页、`/api-models`、公开 API、后台页、guide 页可访问。
- 记录当前 POC 结果到 `docs/cloudflare-poc.md`。

已知风险：

- OpenNext build 会打印一组 MDX / Unified 依赖 `Failed to copy` 日志，但本地 Worker 预览未复现运行时错误。
- 本地预览未配置 Supabase secrets，所以 `/api/health` 返回 503 属预期。
- cron route 仅验证了无密钥拒绝路径，不把真实采集执行视为 Worker 兼容通过。

## 阶段 1：Cloudflare 账号与资源准备

状态：已完成 POC 资源准备。

已完成：

1. 已购买 Workers Paid 计划。
2. 已创建测试 Worker：`priceai-cloudflare-poc`。
3. 已创建 R2 bucket：`priceai-cloudflare-poc-opennext-cache`。
4. 已绑定测试域名：`cf.priceai.cc`。
5. 已配置真实 Supabase / admin / Cron / GA secrets 到 Cloudflare Worker。
6. 已在 GitHub repo secrets 补齐 Cloudflare preview workflow 所需的 Supabase / Admin / GA / Cloudflare 变量。
7. 已创建部署专用 Cloudflare API Token，并验证 GitHub Actions 可完成预览部署。

仍需准备：

1. 确认 `priceai.cc` / `www.priceai.cc` 的正式切换窗口。
2. 如需在 Cloudflare 预览环境统计访问，再补 `NEXT_PUBLIC_UMAMI_SCRIPT_URL` 和 `NEXT_PUBLIC_UMAMI_WEBSITE_ID`；当前测试阶段继续不配置，避免预览流量进入生产 Umami。

Cloudflare Worker runtime secrets：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
ADMIN_SESSION_VERSION
CRON_SECRET
NEXT_PUBLIC_GA_MEASUREMENT_ID
```

GitHub preview workflow secrets / variables：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
ADMIN_SESSION_VERSION
CRON_SECRET
NEXT_PUBLIC_GA_MEASUREMENT_ID
```

Cloudflare Worker runtime variables：

```text
CRON_PUBLIC_BASE_URL=https://cf.priceai.cc
NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS=priceai.cc,www.priceai.cc
```

备注：测试域名阶段可暂时不把 `cf.priceai.cc` 加入 Umami allowed domains，避免预览流量污染生产统计。

## 阶段 2：测试域名部署

状态：核心读路径已通过。

目标：让 `cf.priceai.cc` 跑起来，并证明它可以承载真实数据路径。

建议命令：

```bash
npm run build:cloudflare
npm run deploy:cloudflare
```

验收清单：

| 类别 | 必测项 | 通过标准 |
|------|--------|----------|
| 页面 | `/`、`/platforms/chatgpt`、`/api-models`、`/guides`、产品详情页 | 200，页面样式和数据正常 |
| 公开 API | `/api/explorer`、`/api/offers?limit=80`、`/api/products/chatgpt-plus/offers?limit=80` | 200，体积维持几十 KB 级 |
| 健康检查 | `/api/health` | Supabase 配置后返回健康状态 |
| 后台 | `/admin` 登录、报价修改、提交审核、反馈查看 | 能登录，写操作成功，数据回显 |
| 提交流 | 用户提交渠道、反馈、站点反馈 | 入库成功，有基本防刷表现 |
| SEO | `/robots.txt`、`/sitemap.xml`、guide 页 canonical | 可访问，不意外指向测试域名 |
| 缓存 | Cloudflare cache header、R2 incremental cache | 静态/公开数据路径有缓存表现 |
| 日志 | Worker logs | 无持续 5xx、无缺包、无明显 runtime API 报错 |

阶段出口：

- `cf.priceai.cc` 连续跑通核心读路径：已完成。
- Worker 运行时没有真实缺包错误：核心页面、MDX guide、公开 API 已通过；OpenNext 构建仍会打印 MDX / Unified copy 日志，暂未造成运行时错误。
- Supabase egress / 请求量没有异常抬升：待观察。
- 后台写操作和公开读缓存同时正常：后台写操作待验证；公开 API 已发送 Cloudflare/Vercel edge cache headers，实际命中率待 Cloudflare Analytics / Supabase egress 观察。

2026-06-13 当前测试结果见 `docs/cloudflare-poc.md` 的“线上 Workers Paid 验证记录”。

## 前端与用户体验影响

迁移本身不是一次前端重写。页面、组件、路由和 Supabase 数据结构保持不变，主要变化在运行时平台：从 Vercel 的 Next.js 托管环境切到 Cloudflare Workers + OpenNext。

预期无感或轻微变化：

1. 静态资源仍由 Next/OpenNext 生成，Cloudflare 负责边缘分发；正常情况下用户看到的 UI 不变。
2. 首屏 HTML、RSC payload 和客户端 JS 的生成路径会变化，因此切换前必须在 `cf.priceai.cc` 检查首页、产品页、API 模型页、guide 页和后台页。
3. `next/image` 当前项目已配置 `images.unoptimized = true`，不依赖 Vercel 图片优化，所以这块迁移风险低。
4. 自部署 Umami 继续通过 `NEXT_PUBLIC_UMAMI_SCRIPT_URL` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` 注入；不要误切到 Cloud Umami。

需要重点观察：

1. App Router 流式渲染和客户端跳转是否在 Worker 环境下稳定，尤其是产品详情页的报价加载。
2. ISR / revalidate 依赖 R2 incremental cache；后台写入后前台可能有短暂缓存延迟，验收时接受 120 秒内回显。
3. MDX guide 页构建时有 Unified 依赖 copy 日志，虽然当前线上 Worker 可访问，但生产切换前仍要复测全部 guide 入口。

## 生产中断评估

按当前计划执行，生产不需要明显中断。

原因：

1. `priceai.cc` 当前继续由 Vercel 承载；Cloudflare 先跑 `cf.priceai.cc`，不会碰主域名。
2. 主域名切换动作可以只改 Cloudflare Worker route / custom domain，Vercel 保持在线作为回滚目标。
3. 数据库仍是同一个 Supabase，迁移不涉及数据搬迁或 schema 切换。
4. 采集任务暂不迁入 Worker，不会因为切主站运行时就改变采集脚本执行环境。

可能出现的短暂影响：

1. DNS / route 生效窗口内，少量用户可能命中旧 Vercel 或新 Cloudflare 的不同版本；需要保证两边代码和数据库 schema 已对齐。
2. 客户端已经加载旧 Vercel 资源时，切换后下一次导航可能触发一次完整刷新；这是可接受的。
3. 如果 Cloudflare Worker 绑定生产域名后出现持续 5xx，应立即移除 route，回到 Vercel。
4. 后台写操作和 revalidate 在 Cloudflare 上未充分验证前，不要在业务高峰切换。

## 阶段 3：兼容性与成本加固

这一步在切生产前完成，避免把隐患带到主域名。

优先级 P0 / P1：

1. 确认 OpenNext 的 MDX / Unified copy 日志是否影响真实部署。
2. 确认 Worker bundle 上传大小、启动时间、CPU 时间和错误率。
3. 确认所有公开 API 都保留合理 `Cache-Control`。
4. 确认 Supabase 公开 RPC 权限和分页抓取风险，避免直接绕过 Cloudflare 放大 egress。
5. 确认 `/api/cron/*` 不被 Cloudflare 调度器直接触发真实采集。
6. 确认 analytics 仍使用自部署 Umami，不误切到默认 cloud Umami。

推荐观测指标：

| 指标 | 目标 |
|------|------|
| `/api/explorer` 响应体积 | tens of KB |
| `/api/offers?limit=80` 响应体积 | 约 100KB 以下 |
| Worker 5xx | 0 或仅预期鉴权拒绝 |
| Supabase egress | 不高于 Vercel 生产基线 |
| R2 incremental cache | 有增长但不失控 |
| 后台写后数据可见延迟 | 接受 120s 内 CDN / server cache 延迟 |

## 阶段 4：部署自动化

测试域名稳定后，再把手动部署变成可重复流程。

已新增手动 GitHub Actions workflow：`.github/workflows/deploy-cloudflare-preview.yml`。
2026-06-14 已验证 workflow run `27472035881` 全部通过，并部署 Worker version `c66d1573-1393-477f-9665-80d21d265b27` 到 `cf.priceai.cc`。

- 手动触发 `workflow_dispatch`。
- 使用 GitHub secrets 保存 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
- 构建前执行 `npm run check:cloudflare-env`，避免 CI 缺少构建变量时生成降级数据版本。
- 执行 `npm ci`、`npm run lint`、`npm run build:cloudflare`、`npm run deploy:cloudflare`。
- `deploy:cloudflare` 会把 `--keep-vars` 透传给 Wrangler，避免部署时覆盖 Cloudflare Dashboard 中维护的 runtime variables。
- 部署后自动执行 `npm run smoke:cloudflare`。

不建议在这一阶段自动切生产域名。域名切换仍应手动执行，并保留回滚窗口。

## 阶段 5：生产切换

切换前准备：

1. Vercel 生产继续可用，作为回滚目标。
2. Cloudflare 测试域名全部验收通过。
3. GitHub Actions / VPS 采集任务仍指向当前生产域名。
4. 准备切换窗口，避免采集或后台修改高峰。
5. 记录当前 DNS / route / Vercel alias 状态。

切换动作：

1. 在 Cloudflare 给 Worker 绑定 `priceai.cc` 和 `www.priceai.cc`。
2. 把 Worker 环境变量 `CRON_PUBLIC_BASE_URL` 改为 `https://priceai.cc`。
3. 更新 GitHub Actions / VPS 的 `COLLECT_PRICES_URL` 到 Cloudflare 主域名入口。
4. 保持 `NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS=priceai.cc,www.priceai.cc`。
5. 立即执行生产 smoke test。

生产 smoke test：

```bash
curl -I https://priceai.cc
curl -sS -o /tmp/explorer.json -w '%{http_code} %{size_download} %{time_total}\n' https://priceai.cc/api/explorer
curl -sS -o /tmp/offers.json -w '%{http_code} %{size_download} %{time_total}\n' 'https://priceai.cc/api/offers?limit=80'
curl -sS -o /tmp/health.json -w '%{http_code} %{size_download} %{time_total}\n' https://priceai.cc/api/health
```

后台 smoke test：

- 登录 `/admin`。
- 查看采集日志、来源、报价、提交和反馈。
- 做一条低风险写操作，确认 Supabase 写入和前台回显。
- 触发一次采集任务到新主域名，确认 `CRON_SECRET` 鉴权和写回正常。

## 回滚方案

回滚触发条件：

- 主域名持续 5xx。
- 公开 API 数据错误或体积异常膨胀。
- 后台无法登录或写入失败。
- Supabase egress / 请求量异常上涨。
- Worker runtime 出现持续缺包或 Node API 兼容错误。

回滚动作：

1. 移除或禁用 `priceai.cc` / `www.priceai.cc` 的 Worker route。
2. 将域名指回 Vercel 当前生产部署。
3. 将 `COLLECT_PRICES_URL` 改回 Vercel 生产入口。
4. 保留 Cloudflare Worker 和 `cf.priceai.cc` 继续排障。
5. 复测首页、公开 API、后台和采集。

## 推荐执行顺序

1. 先购买 Workers Paid，并创建 R2 bucket。
2. 在本地完成 `wrangler login` 或提供 Cloudflare API Token。
3. 部署当前 POC 分支到 `cf.priceai.cc`。
4. 配置真实 Supabase / admin / analytics secrets。
5. 运行测试域名验收清单。
6. 修复发现的 Worker 兼容问题。
7. 增加手动 GitHub Actions 部署 workflow。
8. 安排主域名切换窗口。
9. 切 `priceai.cc` / `www.priceai.cc`。
10. 连续观察 24-72 小时后，再清理旧 Vercel 账号依赖。

## 当前下一步

当前最值得做的是阶段 2 收尾和阶段 3 加固：

1. 用后台真实登录做一次低风险写操作验证。
2. 观察 `cf.priceai.cc` 24 小时内 Worker 5xx、CPU、请求量、R2 增长和 Supabase egress。
3. 确认官方价格采集和第三方价格采集只有一个生产入口，避免 Vercel / Cloudflare 双触发。
4. 上述通过后，再安排 `priceai.cc` / `www.priceai.cc` 的切换窗口。
