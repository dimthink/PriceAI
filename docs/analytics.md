# PriceAI Analytics

PriceAI 使用 Google Analytics 4 作为长期增长分析层，同时支持 Umami Cloud / 自托管 Umami 作为轻量运营看板。GA4 负责访问来源、DAU/WAU/MAU、页面表现和推广效果；Umami 负责日常快速查看访问、来源和关键点击；产品自己的关键业务事件后续仍建议写入 Supabase，避免只依赖第三方统计面板。

## 当前接入结构

- `scripts/setup-ga4.mjs`：通过 Google Analytics Admin API 创建或复用 GA4 Property 和 Web Data Stream。
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`：前端公开环境变量，形如 `G-XXXXXXXXXX`。
- `src/components/GoogleAnalytics.tsx`：仅当 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 存在时加载 `gtag.js`。
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`：前端公开环境变量，Umami Website ID。
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`：可选，Umami 脚本地址；未配置时默认使用 Umami Cloud。
- `src/components/UmamiAnalytics.tsx`：仅当 `NEXT_PUBLIC_UMAMI_WEBSITE_ID` 存在时加载 Umami 统计脚本。
- `src/lib/analytics.ts`：后续埋点用的轻量事件上报 helper。

## Umami Cloud 免费版接入

1. 打开 `https://cloud.umami.is/signup` 注册或登录。
2. 新增 Website，名称可填 `PriceAI`，域名填 `priceai.cc`。
3. 复制 Website ID。
4. 在 Vercel 添加环境变量：

```bash
vercel env add NEXT_PUBLIC_UMAMI_WEBSITE_ID production
vercel env add NEXT_PUBLIC_UMAMI_SCRIPT_URL production
```

`NEXT_PUBLIC_UMAMI_SCRIPT_URL` 可填：

```bash
https://cloud.umami.is/script.js
```

也可以只填 `NEXT_PUBLIC_UMAMI_WEBSITE_ID`，代码会自动使用 Cloud 默认脚本地址。写完后需要重新部署。

## 首次准备

Google Analytics 没有官方的一体化 GA4 CLI。这里使用 `gcloud` 获取官方 OAuth 凭证，再由项目脚本调用 Google Analytics Admin API。

如果本机没有 `gcloud`，先安装 Google Cloud CLI。macOS 可用：

```bash
brew install --cask google-cloud-sdk
```

登录 Google 账号：

```bash
gcloud auth login
```

选择或创建一个 Google Cloud Project 后，启用 GA4 相关 API：

```bash
gcloud services enable analyticsadmin.googleapis.com analyticsdata.googleapis.com
```

给本地脚本授权 Google Analytics 管理权限：

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform
```

如果 Google Analytics 账号从未开通过，先打开 `https://analytics.google.com/` 接受条款并创建账号。这个步骤通常不适合脚本自动代点。

## 创建或复用 GA4

先列出当前 Google Analytics 账号：

```bash
npm run setup:ga4 -- --list-accounts
```

如果只有一个账号，可以直接创建或复用 `PriceAI`：

```bash
npm run setup:ga4 -- \
  --site-url https://priceai.cc \
  --write-env
```

如果有多个账号，指定账号：

```bash
npm run setup:ga4 -- \
  --account accounts/123456789 \
  --property PriceAI \
  --stream "PriceAI Web" \
  --site-url https://priceai.cc \
  --write-env
```

脚本会输出 `Measurement ID`，并在 `--write-env` 时写入 `.env.local`：

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 写入 Vercel 环境变量

本地 `.env.local` 只影响本机。线上还需要把同一个值写到 Vercel：

```bash
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID preview
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID development
```

也可以只先加 production。写完后重新部署：

```bash
vercel deploy --prod --yes
```

## 后续事件埋点建议

第一批不要过度埋点，优先只记录能判断产品价值的动作：

- `scope_change`：标准商品 / 全部报价。
- `platform_filter_change`：平台切换。
- `product_detail_open`：进入标准商品详情。
- `purchase_link_click`：点击原站购买链接。
- `submit_source_success`：提交渠道成功。

当前这些事件会同时发送给 GA4 和 Umami。Umami Cloud 按 event 计量，前期不要为事件附加过多属性；不要发送完整搜索词、商品原始标题、渠道链接、邮箱或联系方式。

不要把用户搜索框里的完整关键词直接发 GA4。搜索词可能包含邮箱、账号或链接，后续如果要分析搜索词，建议写入自己的 Supabase 表，并做脱敏和长度限制。

## 常见问题

### 没有返回账号

先打开 `https://analytics.google.com/`，确认已经创建或加入 Google Analytics 账号。

### 权限不足

重新运行 ADC 授权命令：

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform
```

### GA4 后台看不到实时访问

确认：

- 线上 Vercel 已配置 `NEXT_PUBLIC_GA_MEASUREMENT_ID`。
- 已重新部署。
- 浏览器没有拦截 Google Analytics。
- 访问的是主域名 `https://priceai.cc`。
