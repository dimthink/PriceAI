# PriceAI 规划状态总控台

> 最后更新：2026-07-08
> 维护范围：`docs/planning/` 下的产品规划、增长规划、采集规划、执行跟踪和复盘文档
> 用途：作为内部规划的统一状态窗口，方便在任何新对话里快速判断“哪些阶段已经完成、哪些仍在排队、下一步该做什么”。

## 1. 使用方式

这份文档只管状态，不替代原规划文档。

- 要看战略和详细方案：进入对应规划文档。
- 要看现在做到哪：先看本文。
- 每完成一个阶段：更新本文对应行，并在原规划文档里补一条执行记录。
- 如果有 commit、部署、数据验证、截图、Search Console / Umami 记录，尽量写进“证据”或“最近完成”。

## 2. 状态口径

| 状态 | 含义 | 使用场景 |
| --- | --- | --- |
| 已完成 | 目标功能或文档已经落地，并且没有当前阶段必须补的动作 | 单个任务、页面、README 改动、脚本修复 |
| 已收尾 | 当前阶段验收通过，但后续仍有增强项 | P1/P2 这类阶段性模块 |
| 进行中 | 已经开始执行，仍在当前工作流里 | 正在开发或正在连续推进 |
| 部分完成 | 有基础能力，但闭环还没完全打通 | 用户提交、采集器待办、API 候选池 |
| 规划中 | 方案已形成，尚未进入开发 | 产品路线、内容矩阵、增长计划 |
| 待确认 | 需要用户确认口径、范围或优先级 | 分类、收录边界、对外文案 |
| 待观察 | 已做改动，需要等数据反馈 | SEO、GSC、Umami、排名 |
| 待复盘 | 有历史执行结果，但需要重新检查是否仍有效 | 老采集器、旧竞品线索、过期渠道 |
| 参考资料 | 只作为背景资料，不代表排期 | 竞品报告、素材、外部案例 |
| 暂停 | 明确暂不推进 | 灰色中转 API、大规模自动内容生成 |

## 3. 当前总览

| 领域 | 当前状态 | 当前阶段 | 已完成 / 已收尾 | 下一步 | 主文档 |
| --- | --- | --- | --- | --- | --- |
| 规划文档流转 | 已完成，待维护 | 三状态归档规则已建立，历史文档已迁移 | 新增 `archive/pending`、`archive/in-progress`、`archive/done`，并完成现有规划文档迁移：待处理 16 个文件、进行中 7 个文件、已完成 87 个文件 | 后续新规划按状态流转；每次启动或完成规划时同步移动文档并补执行记录 | [规划流转归档](archive/README.md) |
| 产品总路线 | 规划中 | V2 路线图已定 | 北极星目标已确认：让用户想到 AI 订阅、API、Token 怎么来时想到 PriceAI | 按 P0-P4 拆成可验收任务，持续回填本文状态 | [产品总体规划 V2](archive/in-progress/product/2026-06-06_priceai-product-roadmap-v2.md) |
| 订阅比价 / 卡网渠道 | 进行中 | P2 分类体系持续优化 | 有货最低价、下架同步、渠道停用、批量提交等能力已有多轮修复；Apple ID、其他辅助分类、语义图标和归类一致性已有改动；2026-06-10 已按真实错分样本修复 Pro 5x/20x、Plus/Team、Codex API、Claude typo 等规则 | 按真实错分样本继续修分类；规划 AI 错分巡检后台，先做规则审计 + 大模型辅助判断 + 管理员裁决，不直接自动改生产分类 | [数据与分类重构方案](archive/in-progress/data-collection/2026-05-14_data-classification-redesign.md)、[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md)、[产品总体规划 V2](archive/in-progress/product/2026-06-06_priceai-product-roadmap-v2.md) |
| 官方订阅地区价 | 已收尾，规划中 | P1 远端库落地完成；下一阶段策略待定 | App Store 公开地区价、38 个地区、后台管理、远端 Supabase 写入已收尾；地区解析又经过增强 | 规划尽量覆盖全部国家；确认更新周期按天、按周，或继续采用静态方案 | [执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md) |
| API 模型雷达 | 已收尾，规划中 | P1/P2 静态数据和后台维护闭环已收尾；官方状态页汇总进入规划 | 价格数据、免费渠道、后台可编辑、候选池和后台上下文已可用；需求已变更为静态/手动维护方案 | 不再规划候选采集器补齐和完整自动采集；新增「官方状态页汇总」作为模型 API 可用性辅助信息，第一版不做节点探测 | [API 模型路线图](archive/done/modules/2026-06-05_api-model-radar-roadmap.md)、[模型状态页汇总](archive/pending/modules/2026-06-08_ai-model-status-aggregator.md) |
| SEO / GEO / 宣发 | 进行中 | P0 技术基础、官方自助订阅内容承接包、首轮真实数据基线已收尾，商品页隐式 SEO R1 已落地 | 品牌事实卡、意图词库、核心页审计、AI 答案监测文档、ChatGPT 平台页、ChatGPT 指南、卡网可信度指南、价格层解释指南、官方自助订阅系列、README R1、商品页 R1、SEO 总控路线图、Search Console / GA4 / GitHub / Umami 基线已完成或阶段完成 | 7-14 天观察商品页 R1 数据；下一轮选择 R2：P1 长尾商品页 metadata 补齐或 API 平台页增强 | [商品页隐式 SEO 规划](archive/done/growth/2026-06-09_product-page-seo-plan.md)、[SEO 总控路线图与关键词地图](archive/in-progress/growth/2026-06-07_priceai-seo-roadmap-and-keyword-map.md) |
| GitHub README SEO 入口 | 待观察 | R1 低风险增强已完成 | README 首屏、在线入口、FAQ、用户指南和 topics 已完成，commit `6f255e9` | 记录 Search Console / Umami 基线，7-14 天后决定是否做 R2 | [README SEO 保护方案](archive/done/growth/2026-06-07_github-readme-seo-protection-plan.md) |
| 数据采集 / 竞品线索 | 待复盘 | Nodebits 渠道线索已提取并分组 | 已输出竞品分析和候选渠道清单；部分线索已进入待办 | 对候选源做去重、试采集、注销/不可用分组复核 | [Nodebits 渠道线索](archive/done/research/2026-06-03_nodebits-channel-leads.md) |
| 长期产品矩阵 | 规划中 | PriceAI / GuideAI / EarnAI 方向已沉淀 | PriceAI 聚焦 Token 怎么来，GuideAI / EarnAI 作为远期姊妹方向 | 不进入 PriceAI 当前开发排期，后续用独立仓库继续规划 | [AI 生态长期路线图](archive/pending/product/2026-06-05_ai-ecosystem-long-term-roadmap.md) |
| B2B 批发撮合 | 规划中，待确认 | 批发撮合专区 V1 草案已沉淀 | 定位为登录后供需撮合层，先做线索撮合、资料核验、人工对接和成交回填，不做担保交易或平台内付款 | 先做 R0 人工试运行：收集 5-10 个上游供给、10-20 个站长需求，验证真实对接和服务费接受度 | [B2B 批发撮合专区产品规划](archive/pending/product/2026-06-30_priceai-b2b-wholesale-matching-plan.md) |
| 数据归因 / 后台分析 | 规划中，待确认 | 后台「数据分析」专区 V1 草案已沉淀 | 明确 Umami 继续做全站趋势，自有一方事件表做业务归因；第一版建议后台展示点击归因，前台暂不展示具体点击数 | 确认 Tab 名称、P1 是否只做点击、UTM 口径、原始事件保留周期，再拆实现任务 | [数据归因与后台分析专区产品规划](archive/pending/product/2026-07-05_priceai-attribution-analytics-product-plan.md) |

## 4. 阶段状态明细

### 4.1 产品总体路线

| 阶段 | 状态 | 最近结论 | 下一步 |
| --- | --- | --- | --- |
| P0 稳定现有三模块 | 进行中 | 订阅比价、官方地区价、API 模型已经具备线上能力，但仍有分类、采集、下架同步和性能细节要继续稳定 | 以用户反馈和后台数据异常为入口继续修复 |
| P1 API 模型模块重构 | 已收尾，规划中 | 需求已变更为静态/手动维护方案；价格数据、免费渠道、后台可编辑和候选池已落地；官方状态页汇总已形成规划 | 不再以候选解析器和自动采集作为 P1/P2 待办；下一步可做 `/api-models/status` 目录页 |
| P2 卡网渠道与分类体系优化 | 进行中 | 粗分类方向已定，虚拟卡归入其他，其他拆接码/虚拟卡/其他工具账号/其他；仍有错分反馈 | 按真实错分样本继续修规则或引入半自动大模型归类 |
| P3 SEO / GEO 获取路径内容 | 进行中 | ChatGPT 平台页、ChatGPT 获取方式指南、卡网可信度指南、价格层解释指南、官方自助订阅指南系列和 README SEO 入口已阶段完成 | 继续做非 ChatGPT 平台页、API 指南和真实监测闭环 |
| P4 基础设施和成本优化 | 已收尾，待监控 | Supabase public read / payload / cache、公开接口缓存、Umami 生产域名限制、运营日志保留策略已落地 | 建立定期 payload / cache / egress / PageSpeed 监控习惯 |
| P5 中转 API 评估 | 暂停 | 暂不接灰色中转 API，保持官方/公开文档 API 优先 | 等 API 模块稳定后再单独评估 |

### 4.2 官方订阅地区价

来源：[执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md)

| 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- |
| P0 静态原型 | 已完成 | `/official-prices`、详情页、静态 fallback 可用；原执行跟踪标记为已验收 | 无当前阻塞 |
| P1 App Store 采集 | 已收尾 | `collect:official` 已能读取 App Store 公开页并写入远端，且区域价格格式解析已增强 | 下一阶段确认按天、按周自动采集，或继续采用静态快照方案 |
| P1 地区配置 | 已收尾，规划中 | 地区从 6 个扩展到 38 个 | 规划尽量覆盖全部国家；台湾、越南、阿联酋等需要 FX fallback 或替代汇率策略 |
| P1 后台管理 | 已收尾 | 应用、计划、地区、当前价、采集日志、未匹配项已有后台面板 | 更细运营处理进入 P2+ |
| P1 远端库落地 | 已收尾 | 193 条 `available`、16 条 `missing`、1 条 `needs_review` | 无当前 P1 阻塞 |

### 4.3 API 模型雷达

来源：[执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md)、[P2 收口报告](archive/done/execution/2026-06-05_p2-closeout-report.md)

| 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- |
| P0 本地原型 | 已完成 | `/api-models` 三视图、模型家族筛选、币种切换、详情页和 fallback；原执行跟踪标记为已验收 | 无 |
| P1 后台候选池 | 已收尾 | 火山、腾讯、京东云、联通、天翼云、华为云、百度千帆进入候选池 | 静态/手动维护方案下，不再要求候选采集器补齐 |
| P1 正式报价核验 | 已收尾 | 7 个模型族、17 个模型、10 个正式渠道、34 条报价；后续又补充免费渠道和可编辑后台 | 静态数据继续按需手动维护 |
| P2 手动更新闭环 | 已收尾 | `2026-06-05_p2-closeout-report.md` 状态为 `closeout_ready`；后台可编辑能力已补充 | 自动采集器不再作为当前规划项 |
| P3 用户提交闭环 | 部分完成 | 用户提交 API 渠道、后台解析、审核/待办/拒绝已有基础 | 批量提交和候选池联动继续增强 |

### 4.4 SEO / GEO / 内容增长

| 项目 | 状态 | 已有产物 | 下一步 |
| --- | --- | --- | --- |
| 品牌事实卡 | 已完成 | [品牌事实卡](archive/done/growth/2026-06-07_seo-geo-brand-fact-card.md) | 作为页面文案和 AI 答案纠偏基础 |
| 用户意图词库 | 已完成 | [意图词库 V1](archive/done/growth/2026-06-07_seo-geo-intent-keywords-v1.md) | 每 2-4 周根据 Search Console 更新 |
| 核心页面审计 | 已完成 | [核心页面审计 V1](archive/done/growth/2026-06-07_seo-geo-core-page-audit-v1.md) | 按审计结果继续补页面结构和 metadata |
| AI 答案监测 | 文档已完成，执行待建立 | [AI 答案监测 V1](archive/pending/growth/2026-06-07_seo-geo-ai-answer-monitor-v1.md) | 后续建立真实定期监测闭环 |
| ChatGPT SEO FAQ | 已完成 | commit `a5c7872`，覆盖 `/platforms/chatgpt` 和 `/guides/chatgpt-subscription-options` | 观察关键词：ChatGPT 比价、Plus CDK、账号购买、代充、Team 邀请 |
| GitHub README R1 | 已完成，待观察 | commit `6f255e9`，保守增强 README SEO 入口和 topics | 7-14 天后复盘 GitHub referrer、Search Console 排名 |
| 官方自助订阅指南系列 | 已收尾，待观察 | [官方自助订阅指南系列](archive/done/growth/2026-06-07_official-self-subscription-guide-series.md) | 总入口、Apple ID、Google Play、支付卡、礼品卡、地区价风险已落地；后续根据查询词继续扩展 |
| 价格层解释页 | 已完成 | [三层价格底稿](archive/pending/growth/2026-06-07_ai-subscription-price-layers-guide.md)，commit `8493ba8` | 后续根据搜索词继续扩展 |
| LinuxDo 推广帖 | 暂停 | [LinuxDo 草稿](archive/pending/growth/2026-06-04_linuxdo-promotion-draft.md) | 暂时不发，等产品稳定和内容承接页更完整 |
| SEO 总控路线图与关键词地图 | 已完成，进行中维护 | [SEO 总控路线图与关键词地图](archive/in-progress/growth/2026-06-07_priceai-seo-roadmap-and-keyword-map.md) | 下一步按文档先记录数据基线，再扩展 Gemini / Claude / API 平台页 |
| SEO 首轮真实数据基线 | 已完成，待复盘 | [SEO 首轮真实数据基线报告](archive/done/growth/2026-06-07_seo-growth-baseline-report-v1.md) | 7-14 天后回看 Search Console、GA4、GitHub 和 Umami；下一轮先增强商品页 SEO 和 API 平台页 |

## 5. 最近完成的阶段

| 日期 | 事项 | 状态 | 证据 | 后续观察 |
| --- | --- | --- | --- | --- |
| 2026-06-19 | 规划文档三状态流转规则 | 已完成 | [规划流转归档](archive/README.md)，新增 `pending / in-progress / done` 三个状态目录，并迁移现有规划文档及同名 JSON 证据文件 | 新规划优先进入状态流转层；后续只需按状态移动和补执行记录 |
| 2026-06-07 | GitHub README SEO R1 低风险增强 | 已完成，待观察 | commit `6f255e9 Refine GitHub README SEO entrypoints`；GitHub topics 已补 | 观察 `AI 卡网渠道`、GitHub referrer、GitHub 到主站二跳 |
| 2026-06-07 | ChatGPT 平台页和指南 FAQ SEO 增强 | 已完成 | commit `a5c7872 Refine ChatGPT SEO FAQs` | 观察 `ChatGPT 比价`、`ChatGPT Plus CDK`、`ChatGPT 代充` |
| 2026-06-07 | SEO/GEO P0 技术基础 | 已收尾 | commit `8e268b5 Add SEO and GEO metadata foundation`、`745a29d Add ChatGPT SEO landing pages` | 后续转入内容页扩展和真实监测 |
| 2026-06-07 | 卡网可信度指南 | 已完成 | commit `a28b460 Add card shop trust guide` | 可继续根据用户反馈扩展 FAQ |
| 2026-06-07 | AI 订阅价格层解释指南 | 已完成 | commit `8493ba8 Add AI subscription price layers guide` | 可继续根据搜索词扩展 |
| 2026-06-07 | 官方自助订阅指南第一篇 | 已完成 | `/guides/how-to-subscribe-ai-officially`，覆盖官网、App Store、Google Play、支付方式、礼品卡、地区价和失败风险 | 后续继续 Apple ID 专题页、Google Play 专题页、支付卡专题页 |
| 2026-06-07 | Apple ID 订阅 AI 指南 | 已完成 | `/guides/apple-id-ai-subscription`，覆盖 Apple 账户地区、App Store 内购、礼品卡、账户余额、税费、汇率和失败风险 | 后续继续 Google Play 专题页、支付卡专题页、礼品卡专题页 |
| 2026-06-07 | 官方自助订阅 P0 内容承接包 | 已完成，待观察 | `/guides/google-play-ai-subscription`、`/guides/visa-card-for-ai-subscription`、`/guides/ai-subscription-gift-card`、`/guides/ai-subscription-region-price-risks` 已落地，并补站内互链、`sitemap.ts`、`llms.txt` | 7-14 天后看收录和查询词 |
| 2026-06-07 | SEO 总控路线图与页面关键词地图 | 已完成，进行中维护 | [SEO 总控路线图与关键词地图](archive/in-progress/growth/2026-06-07_priceai-seo-roadmap-and-keyword-map.md) | 下一步记录 Search Console / GitHub / Umami 基线，然后做 Gemini / Claude / API 平台页 |
| 2026-06-07 | SEO / GEO 首轮真实数据基线 | 已完成，待复盘 | [SEO 首轮真实数据基线报告](archive/done/growth/2026-06-07_seo-growth-baseline-report-v1.md) | 重点商品页 SEO 和 `/platforms/api` 优先级上调 |
| 2026-06-09 | 商品页隐式 SEO R1 | 已完成，待观察 | [商品页隐式 SEO 规划](archive/done/growth/2026-06-09_product-page-seo-plan.md)；本地 lint/build/HTML 抓取通过 | 7-14 天后看 GSC 查询词和点击，再决定 R2 |
| 2026-06-07 | SEO 监测与数据回看模板 | 已完成 | [SEO 监测与数据回看模板](archive/done/growth/2026-06-07_seo-monitoring-review-baseline.md) | 下次复盘填 Search Console、GitHub、Umami、GA4 和 AI 答案真实数据 |
| 2026-06-07 | P4 基础设施成本优化第一阶段 | 已收尾，待监控 | commit `45d3737 Reduce Supabase egress for public data`、`4c98cc6 Limit Umami analytics to production domains`、`2ee98e4 Add operational log retention cleanup` | 建立定期 payload/cache/egress/PageSpeed 检查 |
| 2026-06-07 | API 模型静态/手动维护方案 | 已收尾 | commit `1836969 Complete API model pricing data`、`3c91b17 Update API model free channels`、`f3c449d Make API model data manually editable` | 不再规划候选采集器补齐；后续按需手动维护 |
| 2026-06-05 | API 模型 P2 手动更新闭环收口 | 已收尾 | [P2 收口报告](archive/done/execution/2026-06-05_p2-closeout-report.md) | 2026-06-07 后需求变更为静态/手动维护，不再规划候选采集器补齐 |
| 2026-06-05 | 官方订阅地区价 P1 远端库落地 | 已收尾，规划中 | [执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md) | 后续确认全国家覆盖、FX fallback 和更新周期 |

## 6. 当前优先待办

| 优先级 | 待办 | 为什么重要 | 建议下一步 |
| --- | --- | --- | --- |
| P0 | 复盘 README R1 后的数据变化 | GitHub 已成为重要入口，不能盲目大改 README | 7-14 天后记录 Search Console 和 Umami 基线 |
| P0 | 持续修复卡网分类和下架同步 | 用户最直观看到的是价格和分类是否可信 | 以最近错分/下架反馈为样本更新规则和测试 |
| P1 | AI 错分巡检后台 | 分类问题会持续出现，单靠用户反馈和人工脚本排查不够稳定 | 先按[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md)做 P0：分类预审可见化，再做一键应用和 override 沉淀 |
| P0 | 官方自助订阅指南专题扩展 | 小白还需要进一步理解 Google Play、Visa / Mastercard、礼品卡和地区价风险 | 已完成本轮内容包；进入 7-14 天收录和查询词观察 |
| P0 | 官方地区价下一阶段策略 | 官方地区价还需要更完整国家覆盖和明确更新方式 | 决定尽量覆盖全部国家的范围；选择按天、按周定时采集，或继续静态快照 |
| P1 | 非 ChatGPT 平台页扩展 | 当前只完成 ChatGPT 打样，Claude/Gemini/Grok/Google/API 平台页还没完成 | 选择下一批 2-3 个平台页 |
| P1 | 商品页隐式 SEO R2 | R1 已完成，后续要看真实搜索数据再扩 | 7-14 天后复盘 GSC；若数据允许，补 P1 长尾商品页 metadata |
| P1 | API 模型展示和手动维护体验 | API 需求存在，但当前策略是静态/手动维护 | 优化展示字段、后台编辑体验和来源说明，不再补候选采集器 |
| P1 | B2B 批发撮合 R0 人工试运行 | 这是 PriceAI 从公开比价延伸到高价值站长 / 上游撮合的低风险商业化验证 | 先用人工表单和台账收集上游供给、站长需求、对接结果和服务费反馈，再决定是否开发登录后专区 |
| P1 | 数据归因与后台分析专区 P1 | 商家、商品、中转站和赞助位点击归因会直接影响后续维护优先级、商务复盘和商家质量判断 | 先确认规划边界；第一阶段只做点击归因、后台专区和 UTM 统一，不做前台点击数展示 |
| P1 | 建立规划状态更新习惯 | 避免规划文档继续散乱和过期 | 每次完成阶段后更新本文和对应原文档 |

## 7. 维护模板

完成一个阶段后，至少补下面三处：

1. 本文对应模块状态。
2. 原规划文档的执行记录。
3. 如果有代码改动，记录 commit / deploy / verification。

推荐记录格式：

```md
## 执行记录

| 日期 | 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- | --- |
| 2026-06-07 | R1 低风险增强 | 已完成，待观察 | commit `xxxxxxx` | 7-14 天后复盘 Search Console / Umami |
```

如果只是调研文档，不进入排期，可以在本文标为 `参考资料`，避免被误认为未完成任务。
