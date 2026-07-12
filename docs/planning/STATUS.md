# PriceAI 规划状态总控台

> 最后更新：2026-07-12
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
| 规划文档流转 | 已完成，待维护 | 三状态归档规则已建立；2026-07-11 完成首轮旧产品规划复盘 | 本轮将 8 份已完成、已被替代或明确关闭的旧规划移入 `done`；当前文件分布为待处理 25 个、进行中 6 个、已完成 97 个 | 后续新规划按状态流转；每次启动或完成规划时同步移动文档并补执行记录 | [规划流转归档](archive/README.md) |
| 产品总路线 | 规划中，已重新对齐 | 原 V2“AI Token 获取入口”路线已作为历史规划收尾；当前由双雷达 PRD Lite 接替 | 总标题已确认为“AI 低价卡网订阅与中转 API 比价雷达”，以卡网订阅和中转 API 为核心，官方订阅与官方 API 作为辅助基准 | 分别讨论卡网订阅和中转 API 的独立 PRD Lite，再确认首页入口主次 | [双雷达产品规划](archive/pending/product/2026-07-10_priceai-low-cost-subscription-and-api-transit-radar-plan.md)、[历史产品总体规划 V2](archive/done/product/2026-06-06_priceai-product-roadmap-v2.md) |
| PriceAI 双雷达产品定位 | 命名与入口调整已完成，模块规划中 | 总标题、四个正式模块名和公开路径已确认 | 模块统一为卡网订阅、官方订阅、官方 API、中转 API；原“API 模型雷达”公开名称停用，公开路径迁移为 `/official-api`，旧路径保留永久跳转 | 继续分模块讨论产品旅程和版本范围；排序中立等问题由独立治理备忘承接 | [双雷达产品规划](archive/pending/product/2026-07-10_priceai-low-cost-subscription-and-api-transit-radar-plan.md)、[信任与工程治理行动备忘](archive/pending/product/2026-07-10_priceai-product-focus-and-trust-governance-plan.md) |
| 工程质量与可维护性 | 规划完成，待分阶段实施 | 已完成架构、测试/脚本/CI、产品规划上下文三路核验；确定“门禁优先、契约优先、兼容迁移、按业务切片”路线 | 现有脚本测试本地全部通过，但尚未进入 Quality / Deploy；`data.ts`、`admin.ts` 和 `AdminConsole` 仍是高风险中心，Cloudflare promotion workflow 另有 npm script 断链 | 先收口当前 API 中转 WIP 和冲突任务，再独立实施统一 `npm test`、发布门禁、商业排序不变量与 promotion 修复；之后才开始兼容式拆分 | [工程质量与可维护性规划](archive/pending/product/2026-07-10_priceai-engineering-quality-and-maintainability-plan.md)、[信任与工程治理行动备忘](archive/pending/product/2026-07-10_priceai-product-focus-and-trust-governance-plan.md) |
| 后台管理信息架构与组件拆分 | 规划完成，待实施 | 已确认从顶部横向 Tab 调整为左侧一级/二级导航 + 右侧工作区；执行上采用 Admin Shell 先行、按工作流迁移、先行为等价再视觉增强 | 当前只是产品与执行规划，未改后台代码；`AdminConsole.tsx` 仍是约 1 万行高风险组件，`ApiTransitAdminConsole.tsx` 也需防止继续膨胀 | 先调整 `05-13-admin-review-redesign` 任务口径；再开 Phase 0/1 实现任务做后台功能地图和 Admin Shell；首个业务迁移切片建议选择 API 中转 | [后台管理左侧导航与工作流拆分规划](archive/pending/product/2026-07-12_admin-console-left-nav-workflow-split-plan.md)、[工程质量与可维护性规划](archive/pending/product/2026-07-10_priceai-engineering-quality-and-maintainability-plan.md) |
| 订阅比价 / 卡网渠道 | 进行中 | P2 分类体系持续优化 | 有货最低价、下架同步、渠道停用、批量提交等能力已有多轮修复；Apple ID、其他辅助分类、语义图标和归类一致性已有改动；早期反馈/分类/采集路线已阶段收尾 | 按真实错分样本继续修分类；规划 AI 错分巡检后台，先做规则审计 + 大模型辅助判断 + 管理员裁决，不直接自动改生产分类 | [数据与分类重构方案](archive/in-progress/data-collection/2026-05-14_data-classification-redesign.md)、[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md) |
| 低价订阅渠道稳定性反馈 | 规划中，待确认 | 已按 Idea-to-Product PRD Lite 沉淀产品规划；推荐先做轻量信号层，不做公开评论墙 | 方案围绕商品、商家、商品渠道三层反馈；用近 7/30 天样本、卖家标称渠道、证据门槛和审核摘要服务购前判断 | 确认 P0 是否采用轻量信号层；确认渠道标签优先覆盖范围、样本阈值、高风险反馈联系方式和商家回应排期 | [低价订阅渠道稳定性反馈产品规划](archive/pending/product/2026-07-11_ai-subscription-channel-stability-feedback-product-plan.md) |
| 官方订阅地区价 | 已收尾，规划中 | P1 远端库落地完成；下一阶段策略待定 | App Store 公开地区价、38 个地区、后台管理、远端 Supabase 写入已收尾；地区解析又经过增强 | 规划尽量覆盖全部国家；确认更新周期按天、按周，或继续采用静态方案 | [执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md) |
| 官方 API | 已收尾，规划中 | P1/P2 静态数据和后台维护闭环已收尾；官方状态页汇总进入规划 | 价格数据、免费渠道、后台可编辑、候选池和后台上下文已可用；公开模块名和路径已调整为“官方 API”与 `/official-api` | 不再规划候选采集器补齐和完整自动采集；新增「官方状态页汇总」作为模型 API 可用性辅助信息，第一版不做节点探测 | [官方 API 路线图](archive/done/modules/2026-06-05_api-model-radar-roadmap.md)、[模型状态页汇总](archive/pending/modules/2026-06-08_ai-model-status-aggregator.md) |
| API 中转站模型检测 | 规划中，暂不实施 | 前台先展示检测摘要和待检测状态；分级检测进入后续模块规划 | 已梳理 L0 可用性、L1 快检、L2 标准检测、L3 深度检测、L4 人工复核，以及用户公开报告复用策略 | 当前任务只打磨 UI；后续再单独设计 rollup 数据结构、调度预算、用户报告复用和后台复核 | [API 中转模型检测分级报告规划](archive/pending/modules/2026-07-10_api-transit-tiered-model-detection-plan.md) |
| SEO / GEO / 宣发 | 进行中 | P0 技术基础、官方自助订阅内容承接包、首轮真实数据基线已收尾，商品页隐式 SEO R1 已落地 | 品牌事实卡、意图词库、核心页审计、AI 答案监测文档、ChatGPT 平台页、ChatGPT 指南、卡网可信度指南、价格层解释指南、官方自助订阅系列、README R1、商品页 R1、SEO 总控路线图、Search Console / GA4 / GitHub / Umami 基线已完成或阶段完成 | 7-14 天观察商品页 R1 数据；下一轮选择 R2：P1 长尾商品页 metadata 补齐或 API 平台页增强 | [商品页隐式 SEO 规划](archive/done/growth/2026-06-09_product-page-seo-plan.md)、[SEO 总控路线图与关键词地图](archive/in-progress/growth/2026-06-07_priceai-seo-roadmap-and-keyword-map.md) |
| GitHub README SEO 入口 | 待观察 | R1 低风险增强已完成 | README 首屏、在线入口、FAQ、用户指南和 topics 已完成，commit `6f255e9` | 记录 Search Console / Umami 基线，7-14 天后决定是否做 R2 | [README SEO 保护方案](archive/done/growth/2026-06-07_github-readme-seo-protection-plan.md) |
| 数据采集 / 竞品线索 | 待复盘 | Nodebits 渠道线索已提取并分组 | 已输出竞品分析和候选渠道清单；部分线索已进入待办 | 对候选源做去重、试采集、注销/不可用分组复核 | [Nodebits 渠道线索](archive/done/research/2026-06-03_nodebits-channel-leads.md) |
| 长期产品矩阵 | 已收尾，远期参考 | PriceAI / GuideAI / EarnAI 方向已沉淀 | PriceAI 聚焦双雷达；GuideAI / EarnAI 不进入本仓库排期 | 未来如启动姊妹产品，在独立仓库重新做 Idea-to-Product 规划 | [AI 生态长期路线图](archive/done/product/2026-06-05_ai-ecosystem-long-term-roadmap.md) |
| 轻量用户登录 | V1 已收尾 | Google 登录、账户页、我的反馈、我的检测报告和任务归属已落地 | 公开浏览继续免登录；登录用于反馈追踪和检测任务归属 | 商家认领、收藏、评论和提醒有真实需求时分别立项 | [用户登录系统产品规划](archive/done/product/2026-06-29_priceai-user-login-system-product-plan.md) |
| B2B 批发撮合 | 规划中，待确认 | 批发撮合专区 V1 草案已沉淀 | 定位为登录后供需撮合层，先做线索撮合、资料核验、人工对接和成交回填，不做担保交易或平台内付款 | 先做 R0 人工试运行：收集 5-10 个上游供给、10-20 个站长需求，验证真实对接和服务费接受度 | [B2B 批发撮合专区产品规划](archive/pending/product/2026-06-30_priceai-b2b-wholesale-matching-plan.md) |
| 数据归因 / 后台分析 | P1 已收尾，待观察 | 一方外链点击归因和后台分析区已落地 | 卡网、中转站和赞助入口点击已进入自有业务账本；前台不公开点击数 | 先观察真实数据，曝光、CTR 和商家报表如需推进再另开规划 | [数据归因与后台分析专区产品规划](archive/done/product/2026-07-05_priceai-attribution-analytics-product-plan.md) |

## 4. 阶段状态明细

### 4.1 产品总体路线

| 阶段 | 状态 | 最近结论 | 下一步 |
| --- | --- | --- | --- |
| P0 稳定核心比较模块 | 进行中，命名已确认 | 卡网订阅和中转 API 是两条核心主线；官方订阅和官方 API 是辅助基准 | 分别进入卡网订阅与中转 API 的模块规划，不再反复讨论总命名 |
| P1 官方 API 模块维护 | 已收尾，规划中 | 需求已变更为静态/手动维护方案；价格数据、免费渠道、后台可编辑和候选池已落地；公开路径迁移为 `/official-api` | 不再以候选解析器和自动采集作为 P1/P2 待办；下一步可做 `/official-api/status` 目录页 |
| P2 卡网渠道与分类体系优化 | 进行中 | 粗分类方向已定，虚拟卡归入其他，其他拆接码/虚拟卡/其他工具账号/其他；仍有错分反馈 | 按真实错分样本继续修规则或引入半自动大模型归类 |
| P3 SEO / GEO 获取路径内容 | 进行中 | ChatGPT 平台页、ChatGPT 获取方式指南、卡网可信度指南、价格层解释指南、官方自助订阅指南系列和 README SEO 入口已阶段完成 | 继续做非 ChatGPT 平台页、API 指南和真实监测闭环 |
| P4 基础设施和成本优化 | 已收尾，待监控 | Supabase public read / payload / cache、公开接口缓存、Umami 生产域名限制、运营日志保留策略已落地 | 建立定期 payload / cache / egress / PageSpeed 监控习惯 |
| P5 中转 API 评估（历史口径） | 已进入产品主线，原暂停口径失效 | 中转 API 已具备站点榜、模型比较、详情、公开资料和检测入口；原规划中对灰色来源、担保和风险披露的限制仍然有效 | 后续以双雷达产品规划为准重编阶段，不再把中转 API 视为等待评估的外围模块 |

### 4.2 官方订阅地区价

来源：[执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md)

| 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- |
| P0 静态原型 | 已完成 | `/official-prices`、详情页、静态 fallback 可用；原执行跟踪标记为已验收 | 无当前阻塞 |
| P1 App Store 采集 | 已收尾 | `collect:official` 已能读取 App Store 公开页并写入远端，且区域价格格式解析已增强 | 下一阶段确认按天、按周自动采集，或继续采用静态快照方案 |
| P1 地区配置 | 已收尾，规划中 | 地区从 6 个扩展到 38 个 | 规划尽量覆盖全部国家；台湾、越南、阿联酋等需要 FX fallback 或替代汇率策略 |
| P1 后台管理 | 已收尾 | 应用、计划、地区、当前价、采集日志、未匹配项已有后台面板 | 更细运营处理进入 P2+ |
| P1 远端库落地 | 已收尾 | 193 条 `available`、16 条 `missing`、1 条 `needs_review` | 无当前 P1 阻塞 |

### 4.3 官方 API

来源：[执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md)、[P2 收口报告](archive/done/execution/2026-06-05_p2-closeout-report.md)

| 阶段 | 状态 | 证据 | 后续 |
| --- | --- | --- | --- |
| P0 本地原型 | 已完成 | `/official-api` 三视图、模型家族筛选、币种切换、详情页和 fallback；原执行跟踪标记为已验收 | 无 |
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
| 2026-07-11 | PriceAI 总定位、模块命名与官方 API 路径调整 | 已完成 | 总标题统一为“AI 低价卡网订阅与中转 API 比价雷达”；正式模块统一为卡网订阅、官方订阅、官方 API、中转 API；`/api-models/*` 永久跳转到 `/official-api/*` | 继续逐份讨论卡网订阅和中转 API 的独立 PRD Lite |
| 2026-07-11 | 旧产品规划首轮清理 | 已完成 | 8 份旧规划补充收尾记录并移入 `archive/done/product/`；保留公告系统等真实未完成规划 | 后续按 Idea-to-Product 文档讨论产品，技术 PRD 与 checklist 作为内部执行材料维护 |
| 2026-07-11 | 轻量用户登录 V1 | 已收尾 | commit `3bf1825`、`7c9bb00`；Google 登录、账户页、我的反馈和我的检测报告已落地 | 后续能力按真实需求分别立项 |
| 2026-07-11 | 数据归因 P1 点击 MVP | 已收尾 | commit `7c70b5b`；一方外链事件与后台分析区已落地 | 观察数据后再决定曝光和 CTR |
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
| P0 | 修复 API 中转默认综合排序的商业关系影响 | 当前 `sponsored / partner / listed / affiliate` 会直接进入综合分，与公开中立承诺冲突 | 后续恢复开发时先单独建任务，删除直接商业加分，审计间接监测优势，并补商业字段排序不变量测试 |
| P0 | 建立核心业务回归与生产发布门禁 | 现有 6 个测试程序本地可运行，但 Quality 和 Cloudflare Deploy 都不执行；回滚 promotion workflow 还引用缺失的 npm script | 先收口当前 WIP；新增统一 `npm test` 和显式 typecheck，让 Quality / Deploy 同 SHA 运行核心测试，修复 promotion 入口，并把商业中立、最低可用价、来源优先级、证据和后台写权限设为首批不变量 |
| P0 | 复盘 README R1 后的数据变化 | GitHub 已成为重要入口，不能盲目大改 README | 7-14 天后记录 Search Console 和 Umami 基线 |
| P0 | 持续修复卡网分类和下架同步 | 用户最直观看到的是价格和分类是否可信 | 以最近错分/下架反馈为样本更新规则和测试 |
| P1 | 确认低价订阅渠道稳定性反馈 MVP | 低价订阅用户最缺的是购前稳定性参考；当前已有反馈基础，但缺少商品渠道维度和近期样本表达 | 先确认轻量信号层 P0，暂不做公开评论墙；再拆商品页、反馈表单、商家卡片和后台审核任务 |
| P1 | AI 错分巡检后台 | 分类问题会持续出现，单靠用户反馈和人工脚本排查不够稳定 | 先按[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md)做 P0：分类预审可见化，再做一键应用和 override 沉淀 |
| P0 | 官方地区价下一阶段策略 | 官方地区价还需要更完整国家覆盖和明确更新方式 | 决定尽量覆盖全部国家的范围；选择按天、按周定时采集，或继续静态快照 |
| P1 | 非 ChatGPT 平台页扩展 | 当前只完成 ChatGPT 打样，Claude/Gemini/Grok/Google/API 平台页还没完成 | 选择下一批 2-3 个平台页 |
| P1 | 商品页隐式 SEO R2 | R1 已完成，后续要看真实搜索数据再扩 | 7-14 天后复盘 GSC；若数据允许，补 P1 长尾商品页 metadata |
| P1 | API 模型展示和手动维护体验 | API 需求存在，但当前策略是静态/手动维护 | 优化展示字段、后台编辑体验和来源说明，不再补候选采集器 |
| P1 | API 中转模型检测分级报告 | 站点可能存在模型掺水、暗调路由或私下替换模型，仅展示价格和可用性不足以建立信任 | 先按[API 中转模型检测分级报告规划](archive/pending/modules/2026-07-10_api-transit-tiered-model-detection-plan.md)设计 rollup 与复用策略，再决定 L1/L2/L3 调度预算 |
| P1 | B2B 批发撮合 R0 人工试运行 | 这是 PriceAI 从公开比价延伸到高价值站长 / 上游撮合的低风险商业化验证 | 先用人工表单和台账收集上游供给、站长需求、对接结果和服务费反馈，再决定是否开发登录后专区 |
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
