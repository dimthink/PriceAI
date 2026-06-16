# 反馈图片证据上传与拼车报价排序

## Goal

让前台报价举报可以直接提交图片证据，降低“疑似虚假/欺诈、渠道不可信、建议下架”这类反馈的审核成本；同时把团购/拼车报价从默认最低价口径中剥离，避免共享价污染商品外层最低价，但仍保留为可筛选、可查看的报价类型。

## What I Already Know

- 用户确认图片证据使用 Cloudflare R2，而不是 Supabase Storage。
- 当前生产已运行在 Cloudflare Workers/OpenNext，`wrangler.jsonc` 已有 `NEXT_INC_CACHE_R2_BUCKET` 供 OpenNext incremental cache 使用。
- 业务图片不应混用 OpenNext 缓存 bucket，需要独立 R2 bucket，例如 `priceai-feedback-evidence`，绑定名 `FEEDBACK_EVIDENCE_BUCKET`。
- 当前报价举报已经有 `offer_feedback.evidence_text` 和 `offer_feedback.evidence_urls`，后台已展示“证据”区。
- 当前前台报价举报弹窗只支持手动粘贴证据链接或说明。
- 当前最低价计算只排除缺货、过期、失败、隐藏、无 URL、无可用价格；没有“拼车/团购不参与默认最低价”的规则。
- 当前公开筛选标签已有 `proxy_supported`、`warranty_long`，TS 和 SQL 都有一套派生逻辑，需要同步新增标签。

## Requirements

- 报价举报弹窗新增图片证据上传按钮，支持桌面/手机选择图片。
- 报价举报弹窗支持桌面端复制粘贴图片，粘贴后自动上传并加入证据列表。
- 图片本体写入独立 Cloudflare R2 bucket；Supabase 只存反馈记录和图片访问引用。
- 图片 bucket 默认私有，不作为公开图床。
- 上传接口限制图片格式、体积和数量：只允许 `image/png`、`image/jpeg`、`image/webp`；单张最大 4MB；单条反馈最多 5 张图片。
- 上传失败不能丢失已填写的举报内容；前端要显示清楚错误，并保留已上传图片列表。
- 对 `疑似虚假/欺诈`、`渠道不可信`、`建议下架报价`、`建议下架渠道` 这类高风险举报，如果没有图片、链接或文字证据，需要在前端阻止提交并提示补充证据。
- 后台报价举报卡片需要能直接显示图片证据缩略图；非图片链接仍按原来的证据链接显示。
- 新增标准筛选标签 `shared_access`，前台标签显示为 `拼车/团购`。
- `shared_access` 的识别规则覆盖“拼车、团购、车位、共享、多人共享、合租、拼团”等常见表达，并避免明显否定词误命中。
- 外层商品最低价和商品摘要默认最低价不使用 `shared_access` 报价。
- 商品详情报价默认排序：正常有货报价 → 拼车/团购有货报价 → 缺货/失效报价；拼车报价不再靠低价排到最前。
- 商品详情筛选区新增 `拼车/团购`，用户可以一键筛出这类报价。
- 报价行展示 `拼车/团购` 标签，避免用户误认为是独立可买价。
- 如果某商品只有拼车/团购有货价，没有标准有货价，外层最低价不应显示共享价冒充标准最低价。

## Acceptance Criteria

- [ ] 前台报价举报弹窗出现“上传图片”入口。
- [ ] 选择 `png/jpg/webp` 小图后，图片上传成功并出现在弹窗证据列表。
- [ ] 在桌面浏览器复制图片后，在举报弹窗粘贴可以自动上传。
- [ ] 大于 4MB 或非图片文件上传失败，并显示安全中文错误。
- [ ] 单条举报最多可带 5 张图片。
- [ ] 高风险举报没有证据时不能提交；补充图片、链接或说明后可以提交。
- [ ] `/api/feedback/evidence` 不缓存上传响应，不透出原始异常。
- [ ] 图片写入 R2 独立 bucket；反馈记录保存可供后台读取的图片引用。
- [ ] 后台报价举报卡片能显示图片缩略图并保留普通链接展示。
- [ ] `拼车/团购` 出现在商品详情筛选标签中。
- [ ] 默认商品详情列表中，拼车/团购报价排在正常有货报价之后、缺货之前。
- [ ] 外层商品最低价不取拼车/团购报价。
- [ ] 生产 SQL/RPC 与 TS fallback 的 `shared_access` 标签和最低价口径一致。
- [ ] 本地通过 `npm run lint` 和 `npm run build`。
- [ ] Cloudflare 构建通过 `npm run build:cloudflare`。
- [ ] 生产部署后验证报价举报上传接口、商品详情筛选和最低价口径。

## Definition of Done

- PRD 和 Trellis 上下文已落盘。
- 代码、migration、Cloudflare binding 配置和后台展示都完成。
- 不混用 OpenNext incremental cache 的 R2 bucket。
- 不引入新的全局状态库或重型上传库。
- 本地 lint/build/Cloudflare build 通过。
- 生产部署和关键路径验证完成，或明确说明因凭证/环境阻塞无法部署。

## Technical Approach

### Feedback Evidence Flow

```text
用户选择/粘贴图片
→ OfferFeedbackDialog 用 FormData 上传 /api/feedback/evidence
→ Route Handler 校验文件类型/大小
→ 写入 Cloudflare R2: feedback/{yyyy}/{mm}/{random}.{ext}
→ 返回 evidence URL: r2://feedback-evidence/{key}
→ 提交 /api/feedback 时写入 evidence_urls
→ 后台读取 evidence_urls
→ 图片证据通过管理员鉴权接口代理读取并展示缩略图
```

### R2 Access

- 通过 OpenNext Cloudflare context 读取 `FEEDBACK_EVIDENCE_BUCKET`。
- 本地非 Cloudflare 环境没有 R2 binding 时，上传接口返回“图片上传暂不可用”，不影响文字/链接反馈。
- `wrangler.jsonc` 增加独立 R2 bucket 绑定；部署前需要在线上创建 bucket。

### Offer Tagging And Ranking

```text
source_title/tags
→ priceai_public_offer_filter_tags() / deriveOfferFilterTags()
→ public_filter_tags 包含 shared_access
→ 商品摘要最低价排除 shared_access
→ 商品详情默认排序把 shared_access 有货报价排在标准有货报价之后
→ tags=shared_access 时可单独筛出拼车/团购报价
```

- TS fallback 和 SQL RPC 都需要同步更新，避免最低价口径分裂。
- `shared_access` 是筛选标签，不等同于缺货；报价仍保留在详情页。
- `warranty_long` 最低价继续只在长期质保池内计算，不主动排除拼车，除非后续单独定义“标准长期质保价”。

## Decision (ADR-lite)

**Context**: 反馈证据需要存图片，但 Supabase Storage 会把对象存储能力也压到数据库供应商上；PriceAI 生产已在 Cloudflare Workers 上运行，R2 更贴近部署边界。拼车/团购报价对用户有参考价值，但不应代表标准可买最低价。

**Decision**: 图片证据放 Cloudflare R2 独立私有 bucket，Supabase 只存引用；拼车/团购作为 `shared_access` 标准标签保留在详情页和筛选里，但从默认最低价口径中排除，并在默认排序里后置。

**Consequences**: 需要新增 Cloudflare binding 和生产 bucket；本地没有 R2 时无法完整验证图片上传。最低价会变得更可信，但部分商品外层价格可能上升或变为暂无标准低价。

## Execution Notes

- Cloudflare R2 bucket `priceai-feedback-evidence` 已创建并绑定为 `FEEDBACK_EVIDENCE_BUCKET`。
- Supabase 生产 SQL 已应用并验证：`shared_access` 能识别拼车/团购报价，`warranty_long` 仍正常命中。
- Cloudflare 生产版本 `f8f78c79-bae2-4ec1-ad5d-e9de0106d37a` 已部署到 `priceai.cc`。
- 线上 smoke 通过：默认 `chatgpt-plus` 报价前 20 条没有拼车/团购，`tags=shared_access` 返回 5 条，`/api/explorer` 中 ChatGPT Plus 默认最低价为 `8.5`。
- 线上图片上传通过：`/api/feedback/evidence` 返回 `r2://feedback-evidence/feedback/2026/06/2849073f-19c7-49b4-b15f-95069b3ca0d7.png`，非法 R2 引用返回 400。

## Out of Scope

- 不给普通用户开放公开图床或长期公开图片 URL。
- 不做图片 OCR、AI 自动判定真假或自动下架。
- 不做站点通用意见反馈图片上传，本轮只做报价举报。
- 不做完整“独享/共享/代充/成品号”交付方式体系。
- 不迁移 Supabase 数据库或把反馈记录搬到 Cloudflare D1/KV。
- 不做浏览器直传 R2 的签名 URL；MVP 使用服务端代理上传。

## Technical Notes

- Trellis task: `.trellis/tasks/06-16-feedback-evidence-shared-offers`
- Relevant existing files:
  - `src/components/ProductOffersPanel.tsx`
  - `src/components/AdminConsole.tsx`
  - `src/app/api/feedback/route.ts`
  - `src/lib/admin.ts`
  - `src/lib/offer-filter-tags.ts`
  - `src/lib/catalog.ts`
  - `src/lib/data.ts`
  - `supabase/schema.sql`
  - `wrangler.jsonc`
- Specs read:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
  - `.trellis/spec/frontend/type-safety.md`
  - `.trellis/spec/priceai/index.md`
  - `.trellis/spec/priceai/data-contracts.md`
  - `.trellis/spec/priceai/public-api-cache.md`
  - `.trellis/spec/priceai/deployment-verification.md`
  - `.trellis/spec/guides/index.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
- Next docs read:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/forms.md`
