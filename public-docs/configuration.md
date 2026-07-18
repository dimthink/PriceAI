# 配置说明

本文档整理 PriceAI 本地开发和自部署前需要准备的公开配置。真实密钥、后台密码、Supabase service role key 和生产环境账号信息不要提交到仓库。

## 本地开发

```bash
npm install
npm run dev
```

默认访问：

- 前台：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

常用变量：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址，前台读取数据需要 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名 key，前台只读访问需要 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端导入、采集、写入数据库需要 |
| `ADMIN_PASSWORD` | 后台登录和本地管理接口密码 |
| `ADMIN_SESSION_SECRET` | 后台会话签名密钥 |
| `ADMIN_SESSION_VERSION` | 后台会话版本，用于强制旧会话失效 |
| `CRON_SECRET` | 定时采集接口鉴权 |
| `CRON_PUBLIC_BASE_URL` | 线上站点地址，例如 `https://priceai.cc` |
| `PRICEAI_SHOPAPI_PROXY_API_URL` | 可选，51代理之类的取代理 API 链接，仅给 `shopApi` 采集用；如果返回裸 `IP:Port` 且链接含 `accessName/accessPassword`，采集器会自动补代理鉴权 |
| `PRICEAI_SHOPAPI_PROXY_HOSTS` | 可选，走代理的主机名，默认 `pay.ldxp.cn,ldxp.cn` |
| `PRICEAI_SHOPAPI_PROXY_REUSE_LIMIT` | 可选，代理最多复用的 `shopApi` 店铺数；设为 `0` 表示只按代理 API 返回的过期时间复用，默认 `0` |
| `PRICEAI_SHOPAPI_PROXY_REUSE_TTL_MS` | 可选，代理 API 没有返回过期时间时的兜底复用毫秒数，默认 `55000` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | 可选，Google Analytics 4 Measurement ID |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 可选，Umami Website ID |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | 可选，Umami 统计脚本地址 |
| `NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS` | 可选，允许加载 Umami 的正式域名，多个域名用英文逗号分隔 |

## Supabase 初始化

1. 准备 Supabase 项目。
2. 按 `supabase/migrations/` 初始化数据库结构。
3. 可选写入演示数据。
4. 在 `.env.local` 填入 Supabase URL、anon key 和 service role key。
5. 启动本地项目。

未配置 Supabase 时，前台会使用内置演示数据，方便先查看界面。

## 初始采集

配置好来源后，可以通过采集任务写入真实报价：

```bash
npm run collect:prices -- --all --post
```

采集完成后，可以在后台查看来源、报价、标准商品和采集日志。
