# PriceAI Analytics

PriceAI 使用 Google Analytics 4 作为长期增长分析层，同时支持 Umami Cloud / 自托管 Umami 作为轻量运营看板。GA4 负责访问来源、DAU/WAU/MAU、页面表现和推广效果；Umami 负责日常快速查看访问、来源和关键点击；产品自己的关键业务事件后续仍建议写入 Supabase，避免只依赖第三方统计面板。

## 当前接入结构

- `scripts/setup-ga4.mjs`：通过 Google Analytics Admin API 创建或复用 GA4 Property 和 Web Data Stream。
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`：前端公开环境变量，形如 `G-XXXXXXXXXX`。
- `src/components/GoogleAnalytics.tsx`：仅当 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 存在时加载 `gtag.js`。
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`：前端公开环境变量，Umami Website ID。
- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`：可选，Umami 脚本地址；未配置时默认使用 Umami Cloud。
- `NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS`：可选，允许加载 Umami 的正式域名，多个域名用英文逗号分隔；未配置时默认只允许 `priceai.cc` 和 `www.priceai.cc`。
- `src/components/UmamiAnalytics.tsx`：仅当 `NEXT_PUBLIC_UMAMI_WEBSITE_ID` 存在且当前域名命中白名单时加载 Umami 统计脚本。
- `src/lib/analytics.ts`：后续埋点用的轻量事件上报 helper。

## Umami Cloud 免费版接入

1. 打开 `https://cloud.umami.is/signup` 注册或登录。
2. 新增 Website，名称可填 `PriceAI`，域名填 `priceai.cc`。
3. 复制 Website ID。
4. 在 Vercel 添加环境变量：

```bash
vercel env add NEXT_PUBLIC_UMAMI_WEBSITE_ID production
vercel env add NEXT_PUBLIC_UMAMI_SCRIPT_URL production
vercel env add NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS production
```

`NEXT_PUBLIC_UMAMI_SCRIPT_URL` 可填：

```bash
https://cloud.umami.is/script.js
```

也可以只填 `NEXT_PUBLIC_UMAMI_WEBSITE_ID`，代码会自动使用 Cloud 默认脚本地址。写完后需要重新部署。

`NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS` 可填：

```bash
priceai.cc,www.priceai.cc
```

这个白名单用于避免 `localhost`、Vercel 预览域名和本地调试页面向 Umami Cloud 上报，减少 429 限流并避免污染真实访问数据。

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
- `platform_landing_cta_click`：从 ChatGPT / Gemini / Claude / API 承接页进入工具页、全部报价或 API 雷达。
- `platform_product_detail_open`：从平台承接页进入重点商品详情。
- `platform_related_link_click`：从平台承接页进入相关指南或官方价页面。
- `purchase_link_click`：点击原站购买链接。
- `submit_source_success`：提交渠道成功。

当前这些事件会同时发送给 GA4 和 Umami。Umami Cloud 按 event 计量，前期不要为事件附加过多属性；不要发送完整搜索词、商品原始标题、渠道链接、邮箱或联系方式。

不要把用户搜索框里的完整关键词直接发 GA4。搜索词可能包含邮箱、账号或链接，后续如果要分析搜索词，建议写入自己的 Supabase 表，并做脱敏和长度限制。

## SEO 数据闭环

PriceAI 的 SEO/GEO 复盘固定按 7-14 天做一次短周期检查，避免凭感觉改页面。

每次复盘看四组数据：

- Search Console：查询词、展示、点击、CTR、平均排名，重点看“有曝光没点击”的词。
- Umami：页面访问、来源、设备、地域、平台页 CTA 点击、商品详情打开。
- GA4：DAU / WAU / MAU、自然搜索来源、页面路径、engagement 和 referral。
- GitHub referrer：GitHub README 是否继续给主站带来流量，尤其观察“AI 卡网渠道”相关入口。

当前重点页面：

- `/platforms/chatgpt`
- `/platforms/gemini`
- `/platforms/claude`
- `/platforms/api`
- `/products/chatgpt-plus`
- `/products/chatgpt-pro-20x`
- `/products/chatgpt-team-business`
- `/products/gemini-pro-year`
- `/products/claude-pro-month`
- `/products/openai-api-cdk`
- `/guides`

短复盘建议记录：

```md
## SEO 短复盘 YYYY-MM-DD

- Search Console 新增查询词：
- 有曝光没点击的词：
- 表现最好的入口页：
- 跳出或停留较弱的页面：
- GitHub README 是否继续带来流量：
- 本轮只做的小改动：
- 暂不处理：
```

README 目前先按低风险策略维护：只做小步补充和入口修正，不频繁重写首屏标题、截图和核心关键词，避免破坏已有 GitHub 搜索入口。

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
