# PriceAI 规划状态总控台

> 最后更新：2026-07-16
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
| 规划文档流转 | 已完成，待维护 | 三状态归档规则已建立；2026-07-11 完成首轮旧产品规划复盘 | 本轮将 8 份已完成、已被替代或明确关闭的旧规划移入 `done`；2026-07-15 当前文件分布为待处理 33 个、进行中 9 个、已完成 95 个 | 后续新规划按状态流转；每次启动或完成规划时同步移动文档并补执行记录 | [规划流转归档](archive/README.md) |
| 产品总路线 | 规划中，已重新对齐 | 原 V2“AI Token 获取入口”路线已作为历史规划收尾；当前由双雷达 PRD Lite 接替 | 总标题已确认为“AI 低价卡网订阅与中转 API 比价雷达”，以卡网订阅和中转 API 为核心，官方订阅与官方 API 作为辅助基准 | 分别讨论卡网订阅和中转 API 的独立 PRD Lite，再确认首页入口主次 | [双雷达产品规划](archive/pending/product/2026-07-10_priceai-low-cost-subscription-and-api-transit-radar-plan.md)、[历史产品总体规划 V2](archive/done/product/2026-06-06_priceai-product-roadmap-v2.md) |
| PriceAI 双雷达产品定位 | 命名与入口调整已完成，模块规划中 | 总标题、四个正式模块名和公开路径已确认 | 模块统一为卡网订阅、官方订阅、官方 API、中转 API；原“API 模型雷达”公开名称停用，公开路径迁移为 `/official-api`，旧路径保留永久跳转 | 继续分模块讨论产品旅程和版本范围；排序中立等问题由独立治理备忘承接 | [双雷达产品规划](archive/pending/product/2026-07-10_priceai-low-cost-subscription-and-api-transit-radar-plan.md)、[信任与工程治理行动备忘](archive/pending/product/2026-07-10_priceai-product-focus-and-trust-governance-plan.md) |
| 工程质量与可维护性 | 规划完成，待分阶段实施 | 已完成架构、测试/脚本/CI、产品规划上下文三路核验；确定“门禁优先、契约优先、兼容迁移、按业务切片”路线 | 现有脚本测试本地全部通过，但尚未进入 Quality / Deploy；`data.ts`、`admin.ts` 和 `AdminConsole` 仍是高风险中心，Cloudflare promotion workflow 另有 npm script 断链 | 先收口当前 API 中转 WIP 和冲突任务，再独立实施统一 `npm test`、发布门禁、商业排序不变量与 promotion 修复；之后才开始兼容式拆分 | [工程质量与可维护性规划](archive/pending/product/2026-07-10_priceai-engineering-quality-and-maintainability-plan.md)、[信任与工程治理行动备忘](archive/pending/product/2026-07-10_priceai-product-focus-and-trust-governance-plan.md) |
| 登录信任与全栈质量整改 | 本地代码可闭环项全部完成，待提交与生产确认 | 2026-07-16 最终复核已完成缓存键、独立账号删除调度、报告错误语义、证据 URL、敏感图片缓存、lease 续租、持久上传配额和 Supabase recovery baseline；未提交、未应用 migration、未部署 | OAuth/callback/Session、报告默认私密与分享、任务配额/租约/超时、反馈证据归属、账户导出/删除、管理员凭据、CI/Cloudflare 门禁、第三方预算和 retention 均有完整本地代码路径；lint、typecheck、测试、Next/OpenNext build、Workers Preview、移动端/键盘回归及隔离空库 baseline 通过 | 审阅完整 diff并拆分提交；合入后确认 Supabase GitHub Integration、Cloudflare preview/promote、真实 OAuth/RLS；Collector Runtime 仍需补真实 SSH secrets，成本和 Access/WAF 仍需控制台确认 | [全栈只读质量审计](../priceai-full-stack-read-only-quality-audit-2026-07-15.md)、[登录信任与全栈质量整改产品规划](archive/pending/product/2026-07-15_priceai-login-trust-and-full-stack-quality-remediation-plan.md)、[用户登录系统产品规划](archive/done/product/2026-06-29_priceai-user-login-system-product-plan.md) |
| 基础设施容量、异常流量与成本治理 | P1 本地实现完成，待生产确认 | P0 只读归因完成；P1 应用侧和数据侧均已本地实现 | commit `46bddfb` 完成 DO Queue、主导航意图预取和长列表 prefetch 收敛；小时 / 日 rollup、8 天 raw / 90 天 hourly / 365 天 daily retention 与默认 dry-run 5,000 行批次 migration 已通过一次性 PostgreSQL 验证 | 完成 migration 独立提交；随后在部署应用代码、应用 Supabase migration、31 天回填、首批删除或保存 Cloudflare 规则前统一请求确认 | [基础设施容量、异常流量与成本治理规划](archive/in-progress/product/2026-07-14_priceai-infrastructure-capacity-traffic-and-cost-governance-plan.md)、[Cloudflare 24 小时归因](archive/in-progress/product/2026-07-14_priceai-cloudflare-24h-traffic-attribution-baseline.md)、[Supabase 安全清理策略](archive/in-progress/product/2026-07-14_priceai-supabase-retention-and-cleanup-batch-strategy.md) |
| 后台管理信息架构与组件拆分 | 规划完成，待实施 | 已确认从顶部横向 Tab 调整为左侧一级/二级导航 + 右侧工作区；执行上采用 Admin Shell 先行、按工作流迁移、先行为等价再视觉增强 | 当前只是产品与执行规划，未改后台代码；`AdminConsole.tsx` 仍是约 1 万行高风险组件，`ApiTransitAdminConsole.tsx` 也需防止继续膨胀 | 先调整 `05-13-admin-review-redesign` 任务口径；再开 Phase 0/1 实现任务做后台功能地图和 Admin Shell；首个业务迁移切片建议选择 API 中转 | [后台管理左侧导航与工作流拆分规划](archive/pending/product/2026-07-12_admin-console-left-nav-workflow-split-plan.md)、[工程质量与可维护性规划](archive/pending/product/2026-07-10_priceai-engineering-quality-and-maintainability-plan.md) |
| 渠道审核质量信号与 shopApi 试采集入队 | 规划完成，待实施 | 已将渠道提交审核、低质店铺识别、存量分层治理和 `shopApi` 风控试采集合并成内部后台 PRD Lite | 明确第一版只做后台质量证据和人工建议，不公开商家评分、不自动处罚；`shopApi` 试采集应从 Web Runtime 同步直连改为低频节点入队 | 先拆 P0：`shopApi` 试采集入队、审核质量摘要、低质候选 / 采集环境问题筛选；再接入存量治理和点击需求信号 | [渠道审核质量信号与 shopApi 试采集入队规划](archive/pending/product/2026-07-15_admin-channel-quality-and-shopapi-probe-queue-plan.md) |
| 订阅比价 / 卡网渠道 | 进行中 | P2 分类体系持续优化 | 有货最低价、下架同步、渠道停用、批量提交等能力已有多轮修复；Apple ID、其他辅助分类、语义图标和归类一致性已有改动；早期反馈/分类/采集路线已阶段收尾；2026-07-15 已形成 AI 订阅商品快速标签 P0/P1 规划，P0 已进入实现 | 按真实错分样本继续修分类；观察 Gemini Pro、ChatGPT Plus 的 P0 快速标签和展示名调整效果；规划 AI 错分巡检后台，先做规则审计 + 大模型辅助判断 + 管理员裁决，不直接自动改生产分类 | [数据与分类重构方案](archive/in-progress/data-collection/2026-05-14_data-classification-redesign.md)、[AI 订阅商品快速标签规划](archive/pending/product/2026-07-15_ai-subscription-offer-quick-tags-product-plan.md)、[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md) |
| 报价反馈分类与证据门槛 | P0 已实施，待观察 | 已落地“数据纠错低门槛、商家质量高证据、后台下架定向刷新”口径 | 问题类型已取消默认值；`商品描述/实际不符` 前台改为 `标题党 / 商家描述误导` 并归入商家质量；证据必填只按问题类型判断，不再按用户建议下架判断 | 观察 7-14 天反馈提交量、无证据拦截、后台误分流和下架后前台刷新延迟 | [报价反馈分类、证据门槛与下架刷新规划](archive/pending/product/2026-07-14_offer-feedback-evidence-and-cache-refresh-plan.md) |
| 资料核验商家与稳定性反馈 | 规划中，待确认 | 已将“优选店铺”、商家资料核验、商品渠道稳定性反馈、登录反刷和广告准入合并成综合 PRD Lite | 新方案以“资料核验商家”作为前台克制表达；所有挂到商家、商品渠道或公开质量信号上的正向/中性/负向反馈都必须登录；广告只作为显著披露的合作展示，不影响自然排序、最低价和风险提示 | 确认前台命名、P0 是否先选 3-5 个商家人工试运行、第一批渠道路径、反馈证据门槛和广告准入层级 | [资料核验商家与稳定性反馈综合规划](archive/pending/product/2026-07-12_verified-merchant-and-stability-feedback-product-plan.md)、[低价订阅渠道稳定性反馈原规划](archive/pending/product/2026-07-11_ai-subscription-channel-stability-feedback-product-plan.md) |
| 官方订阅地区价 | 已收尾，规划中 | P1 远端库落地完成；下一阶段策略待定 | App Store 公开地区价、38 个地区、后台管理、远端 Supabase 写入已收尾；地区解析又经过增强 | 规划尽量覆盖全部国家；确认更新周期按天、按周，或继续采用静态方案 | [执行跟踪](archive/done/execution/2026-06-05_implementation-tracker.md) |
| 官方 API | 已收尾，规划中 | P1/P2 静态数据和后台维护闭环已收尾；官方状态页汇总进入规划 | 价格数据、免费渠道、后台可编辑、候选池和后台上下文已可用；公开模块名和路径已调整为“官方 API”与 `/official-api` | 不再规划候选采集器补齐和完整自动采集；新增「官方状态页汇总」作为模型 API 可用性辅助信息，第一版不做节点探测 | [官方 API 路线图](archive/done/modules/2026-06-05_api-model-radar-roadmap.md)、[模型状态页汇总](archive/pending/modules/2026-06-08_ai-model-status-aggregator.md) |
| API 中转综合推荐 | 当前版已上线，目标版规划中 | 商业关系已退出自然排序；当前版按成本、公开近 60 次、近 7 日、缓存和模型检测预留权重排序 | commit `5fb509b` 已部署生产；无倍率、无稳定性样本或监测过期的站点不进入综合推荐；线上排序已验证不再让 APINode 固定第一 | 后续确认线路级评分、证据覆盖度、模型质量、TTFT/TPS 与“全部”页面展示方式 | [中转 API 综合推荐算法产品规划](archive/pending/product/2026-07-14_api-transit-composite-recommendation-algorithm-product-plan.md) |
| API 中转站模型检测 | 规划中，暂不实施 | 前台先展示检测摘要和待检测状态；分级检测进入后续模块规划 | 已梳理 L0 可用性、L1 快检、L2 标准检测、L3 深度检测、L4 人工复核，以及用户公开报告复用策略 | 当前任务只打磨 UI；后续再单独设计 rollup 数据结构、调度预算、用户报告复用和后台复核 | [API 中转模型检测分级报告规划](archive/pending/modules/2026-07-10_api-transit-tiered-model-detection-plan.md) |
| SEO / GEO / 宣发 | 进行中 | P0 技术基础、官方自助订阅内容承接包、首轮真实数据基线已收尾，商品页隐式 SEO R1 已落地 | 品牌事实卡、意图词库、核心页审计、AI 答案监测文档、ChatGPT 平台页、ChatGPT 指南、卡网可信度指南、价格层解释指南、官方自助订阅系列、README R1、商品页 R1、SEO 总控路线图、Search Console / GA4 / GitHub / Umami 基线已完成或阶段完成 | 7-14 天观察商品页 R1 数据；下一轮选择 R2：P1 长尾商品页 metadata 补齐或 API 平台页增强 | [商品页隐式 SEO 规划](archive/done/growth/2026-06-09_product-page-seo-plan.md)、[SEO 总控路线图与关键词地图](archive/in-progress/growth/2026-06-07_priceai-seo-roadmap-and-keyword-map.md) |
| GitHub README SEO 入口 | 待观察 | R1 低风险增强已完成 | README 首屏、在线入口、FAQ、用户指南和 topics 已完成，commit `6f255e9` | 记录 Search Console / Umami 基线，7-14 天后决定是否做 R2 | [README SEO 保护方案](archive/done/growth/2026-06-07_github-readme-seo-protection-plan.md) |
| 数据采集 / 竞品线索 | 待复盘 | Nodebits 渠道线索已提取并分组 | 已输出竞品分析和候选渠道清单；部分线索已进入待办 | 对候选源做去重、试采集、注销/不可用分组复核 | [Nodebits 渠道线索](archive/done/research/2026-06-03_nodebits-channel-leads.md) |
| 长期产品矩阵 | 已收尾，远期参考 | PriceAI / GuideAI / EarnAI 方向已沉淀 | PriceAI 聚焦双雷达；GuideAI / EarnAI 不进入本仓库排期 | 未来如启动姊妹产品，在独立仓库重新做 Idea-to-Product 规划 | [AI 生态长期路线图](archive/done/product/2026-06-05_ai-ecosystem-long-term-roadmap.md) |
| 轻量用户登录 | V1 已收尾，可靠性整改本地完成 | Google 登录、账户页、我的反馈、我的检测报告和任务归属已落地；公开浏览继续免登录 | 登录回跳、Session 刷新、报告隐私、任务回收、退出、导出和删除已完成主要本地实现；真实 OAuth 与生产 RLS 仍待部署后确认 | 先完成提交、migration 与生产回归，再根据真实需求分别立项商家认领、收藏、评论和提醒 | [用户登录系统产品规划](archive/done/product/2026-06-29_priceai-user-login-system-product-plan.md)、[登录信任与全栈质量整改产品规划](archive/pending/product/2026-07-15_priceai-login-trust-and-full-stack-quality-remediation-plan.md) |
| B2B 批发撮合 | 规划中，提交模板已细化 | 已补充买方 / 卖方 × API 中转 / 卡网订阅四套结构化示例模板 | 每个商品或号池的信息在同一行写清来源、价格、预计量或起批量与月供；保留结构化字段但不做生硬问卷；黑充、盗刷、拒付等只作为风险或禁入类型 | 确认最终示例文案后，再进入前台模板切换、提交校验、结构化入库和后台摘要展示设计 | [B2B 批发撮合专区产品规划](archive/pending/product/2026-06-30_priceai-b2b-wholesale-matching-plan.md)、[批发合作线索提交模板规划](archive/pending/product/2026-07-14_priceai-wholesale-intake-template-plan.md) |
| 数据归因 / 后台分析 | P1 已收尾，待观察 | 一方外链点击归因和后台分析区已落地 | 卡网、中转站和赞助入口点击已进入自有业务账本；前台不公开点击数 | 先观察真实数据，曝光、CTR 和商家报表如需推进再另开规划 | [数据归因与后台分析专区产品规划](archive/done/product/2026-07-05_priceai-attribution-analytics-product-plan.md) |
| 数据监测 / 采集分层 | 规划完成，待实施 | 已确认“Umami 行为热度层 + 采集健康事实层 + 后台聚合建议层” | 新规划明确先做后台只读监测和异常队列，不直接自动改采集调度；点击热度只作为运营信号，不作为公开可信度或成交量 | 先做 P0 事件口径审计和后台只读总览，再观察 7-14 天进入分层建议队列 | [Umami 数据监测与采集分层规划](archive/pending/product/2026-07-14_umami-data-monitoring-and-collection-tiering-plan.md) |
| 商家与站长权限后台 / Token 福利中心 | 规划中，边界已确认 | 已确认 PriceAI 自有后台与合作方后台分离：`/admin` 只给平台内部，合作方后台最终公开路径为 `/partner`；同一账号可同时拥有卡网商家和中转站站长权限；用户联系方式默认隐藏但可勾选授权；福利活动采用合作方上传码池、平台审核后发放 | 当前建议先做自有后台用户管理与手动权限分配，再做 `/partner` 受限合作方后台和商家反馈处理闭环；P1 再做登录领取、签到、推广截图证据、邀请用户等码池活动；第一批码池模板为商品 / 奖品描述、加密兑换码、使用教程、合作方站点 / 兑换入口；积分只做活动参与权，抽奖后置 | 确认推广奖励阶梯、兑换码展示规则和合作方站点特征字段 | [商家与站长权限后台、反馈协商闭环和 Token 福利中心规划](archive/pending/product/2026-07-14_merchant-owner-portal-and-token-rewards-plan.md) |

## 4. 阶段状态明细

### 4.1 产品总体路线

| 阶段 | 状态 | 最近结论 | 下一步 |
| --- | --- | --- | --- |
| P0 稳定核心比较模块 | 进行中，命名已确认 | 卡网订阅和中转 API 是两条核心主线；官方订阅和官方 API 是辅助基准 | 分别进入卡网订阅与中转 API 的模块规划，不再反复讨论总命名 |
| P1 官方 API 模块维护 | 已收尾，规划中 | 需求已变更为静态/手动维护方案；价格数据、免费渠道、后台可编辑和候选池已落地；公开路径迁移为 `/official-api` | 不再以候选解析器和自动采集作为 P1/P2 待办；下一步可做 `/official-api/status` 目录页 |
| P2 卡网渠道与分类体系优化 | 进行中 | 粗分类方向已定，虚拟卡归入其他，其他拆接码/虚拟卡/其他工具账号/其他；仍有错分反馈 | 按真实错分样本继续修规则或引入半自动大模型归类 |
| P3 SEO / GEO 获取路径内容 | 进行中 | ChatGPT 平台页、ChatGPT 获取方式指南、卡网可信度指南、价格层解释指南、官方自助订阅指南系列和 README SEO 入口已阶段完成 | 继续做非 ChatGPT 平台页、API 指南和真实监测闭环 |
| P4 基础设施和成本优化 | P2 已生产发布，进入 24 小时观察 | DO Queue、预取收敛、Availability 8/90/365、Detection Runs 14/30、covering index 保留、60 秒 regional cache 和后台基础设施工作流已上线；Supabase Preview、生产 RPC、Cloudflare Actions `29335476824` 和 smoke 均通过 | 保存新的完整 24 小时基线；生产 WAF / Rate Limiting、日志采样和 retention apply 仍未执行；见[基础设施容量、异常流量与成本治理规划](archive/in-progress/product/2026-07-14_priceai-infrastructure-capacity-traffic-and-cost-governance-plan.md)与[排障确认参考](archive/in-progress/product/2026-07-14_priceai-infrastructure-change-impact-and-troubleshooting-reference.md) |
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
| 2026-07-16 | 全栈质量审计剩余代码项收尾 | 本地代码已收尾，待生产确认 | 新增边缘缓存命中证据、运行租约、账号删除执行器、retention schedule、SBOM/许可证门禁、列表滚动恢复和局部错误边界；OpenNext Preview 中 `/api/explorer`、offers 重复请求为 `HIT`，中转列表 gzip 约 39.4 KB；未提交、未部署 | Collector Runtime SSH secrets、Supabase migration、真实 OAuth/RLS、Cloudflare Access/WAF 和账单指标仍需外部环境确认 |
| 2026-07-15 | 渠道审核质量信号与 shopApi 试采集入队规划 | 规划完成，待实施 | [渠道审核质量信号与 shopApi 试采集入队规划](archive/pending/product/2026-07-15_admin-channel-quality-and-shopapi-probe-queue-plan.md)；确认 `shopApi` 试采集不应继续由后台 Web Runtime 同步直连原站，而应入队交给低频采集节点 | 先拆 P0：入队试采集、结果回流、质量摘要和审核筛选 |
| 2026-07-15 | 全栈只读质量审计与登录信任整改 | 主要本地整改完成，待生产确认 | [全栈只读质量审计](../priceai-full-stack-read-only-quality-audit-2026-07-15.md)、[登录信任与全栈质量整改产品规划](archive/pending/product/2026-07-15_priceai-login-trust-and-full-stack-quality-remediation-plan.md)；本地 `npm test`、lint、typecheck、OpenNext build、Workers Preview 与移动端键盘回归通过；未提交、未部署 | 审阅并拆分提交；之后确认 Supabase migration、Cloudflare preview/promote、真实 OAuth/RLS、Collector Runtime 和成本控制台数据 |
| 2026-07-14 | API 中转综合排序中立性重构 | 已上线，目标版规划中 | commit `5fb509b`；Cloudflare Actions `29267043533`；生产 `/api-transit`、13 个站点详情和 Cloudflare smoke 通过；浏览器实际综合排序中 APINode 为第 8 | 后续按[中转 API 综合推荐算法产品规划](archive/pending/product/2026-07-14_api-transit-composite-recommendation-algorithm-product-plan.md)确认线路级评分、模型质量、TTFT/TPS 和“全部”页面方向 |
| 2026-07-14 | 报价反馈分类、证据门槛与下架刷新规划 | P0 已实施，待观察 | [报价反馈分类、证据门槛与下架刷新规划](archive/pending/product/2026-07-14_offer-feedback-evidence-and-cache-refresh-plan.md)；代码已覆盖反馈弹窗、后端校验、后台分流和下架刷新联动 | 观察问题类型分布、证据缺失拦截、后台处理耗时和缓存刷新延迟 |
| 2026-07-14 | Umami 数据监测与采集分层规划 | 规划完成，待实施 | [Umami 数据监测与采集分层规划](archive/pending/product/2026-07-14_umami-data-monitoring-and-collection-tiering-plan.md) | 先确认 P0 入口命名、覆盖范围和 Umami 事件口径，再拆实现任务 |
| 2026-07-14 | 商家与站长权限后台、Token 福利中心规划 | 规划中，边界已确认 | [商家与站长权限后台、反馈协商闭环和 Token 福利中心规划](archive/pending/product/2026-07-14_merchant-owner-portal-and-token-rewards-plan.md)；2026-07-15 已补充 `/admin` 自有后台、`/partner` 合作方后台最终路径、合作方码池、加密兑换码和积分边界 | 下一步确认推广奖励阶梯、兑换码展示规则和合作方站点特征字段 |
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
| P1 | 确认登录信任整改的提交与生产发布 | 主要本地整改已完成，但认证、RLS、migration、Cloudflare promote 和 Collector Runtime 只有进入真实发布链后才能证明闭环 | 先审阅完整未提交 diff；再按 Supabase GitHub Integration 与 Cloudflare upload -> preview smoke -> promote 顺序发布，逐项执行真实 OAuth、越权、缓存和成本回归 |
| P1 | 确认基础设施治理第一批生产发布 | 应用侧和数据侧已经完成本地实现与验证，但尚未部署，也没有应用 migration 或删除生产数据 | 确认后先发布 commit `46bddfb` 并观察 revalidation / RSC；再由 Supabase Integration 应用 retention migration，先做 Preview / 31 天回填与 dry-run，最后才决定是否执行首批 5,000 行 |
| P1 | 推进 API 中转线路级综合推荐 | 商业关系退出自然排序的 P0 已上线；下一阶段仍需解决站点、模型与分组数据混合、重复监测样本、缺失指标、模型质量和 TTFT/TPS 口径 | 先确认[中转 API 综合推荐算法产品规划](archive/pending/product/2026-07-14_api-transit-composite-recommendation-algorithm-product-plan.md)中的线路级评分、证据覆盖度和“全部”页面方向，再拆独立实现任务 |
| P0 | 建立 Umami 数据监测与采集异常总览 | 采集节点、代理、风控和店铺刷新问题需要一个统一后台视角；后续分层采集必须先有用户热度和采集健康数据基础 | 先按[Umami 数据监测与采集分层规划](archive/pending/product/2026-07-14_umami-data-monitoring-and-collection-tiering-plan.md)做 P0：事件口径审计、后台只读总览、高热度陈旧 / 高热度失败 / 长期失败异常队列 |
| P0 | 改造渠道提交审核与 shopApi 试采集 | 当前低质店铺、重复报价和高价渠道容易混入正式源；`shopApi` 同步试采集从 Web Runtime 出网容易触发链动小铺风控，导致误判 | 先按[渠道审核质量信号与 shopApi 试采集入队规划](archive/pending/product/2026-07-15_admin-channel-quality-and-shopapi-probe-queue-plan.md)做 P0：`shopApi` 入队试采集、结果回流、审核质量摘要、低质候选和采集环境问题筛选 |
| P0 | 建立核心业务回归与生产发布门禁 | 现有 6 个测试程序本地可运行，但 Quality 和 Cloudflare Deploy 都不执行；回滚 promotion workflow 还引用缺失的 npm script | 先收口当前 WIP；新增统一 `npm test` 和显式 typecheck，让 Quality / Deploy 同 SHA 运行核心测试，修复 promotion 入口，并把商业中立、最低可用价、来源优先级、证据和后台写权限设为首批不变量 |
| P0 | 复盘 README R1 后的数据变化 | GitHub 已成为重要入口，不能盲目大改 README | 7-14 天后记录 Search Console 和 Umami 基线 |
| P0 | 持续修复卡网分类和下架同步 | 用户最直观看到的是价格和分类是否可信 | 以最近错分/下架反馈为样本更新规则和测试 |
| P1 | 观察报价反馈规则效果 | 反馈入口已完成 P0 调整，下一步需要看真实提交和后台处理是否更干净 | 7-14 天后复盘问题类型分布、标题党/商家描述误导证据质量、建议下架无证据反馈通过率和下架后前台刷新延迟 |
| P1 | 确认资料核验商家与稳定性反馈 MVP | 低价订阅用户最缺的是购前稳定性参考和可解释的正向筛选入口；当前已有商家视图、登录和反馈基础，但缺少资料核验、商品渠道维度和登录后的正向/中性/负向样本表达 | 先确认“资料核验商家”命名和 P0 人工试运行范围；再拆商品页、反馈表单、商家卡片、广告准入和后台审核任务 |
| P1 | AI 错分巡检后台 | 分类问题会持续出现，单靠用户反馈和人工脚本排查不够稳定 | 先按[反馈自动化与分类预审](archive/pending/product/2026-07-08_feedback-automation-and-classification-precheck-plan.md)做 P0：分类预审可见化，再做一键应用和 override 沉淀 |
| P0 | 官方地区价下一阶段策略 | 官方地区价还需要更完整国家覆盖和明确更新方式 | 决定尽量覆盖全部国家的范围；选择按天、按周定时采集，或继续静态快照 |
| P1 | 非 ChatGPT 平台页扩展 | 当前只完成 ChatGPT 打样，Claude/Gemini/Grok/Google/API 平台页还没完成 | 选择下一批 2-3 个平台页 |
| P1 | 商品页隐式 SEO R2 | R1 已完成，后续要看真实搜索数据再扩 | 7-14 天后复盘 GSC；若数据允许，补 P1 长尾商品页 metadata |
| P1 | API 模型展示和手动维护体验 | API 需求存在，但当前策略是静态/手动维护 | 优化展示字段、后台编辑体验和来源说明，不再补候选采集器 |
| P1 | API 中转模型检测分级报告 | 站点可能存在模型掺水、暗调路由或私下替换模型，仅展示价格和可用性不足以建立信任 | 先按[API 中转模型检测分级报告规划](archive/pending/modules/2026-07-10_api-transit-tiered-model-detection-plan.md)设计 rollup 与复用策略，再决定 L1/L2/L3 调度预算 |
| P1 | 确认商家与站长权限后台第一版 | 登录系统已经具备用户反馈和检测归属，合作方后台边界已收口：自有后台负责用户管理和权限分配，`/partner` 承接商家/站长受限工作台，福利活动采用合作方码池；兑换码必须加密，合作方暂停活动必须经 PriceAI 审核 | 下一步先拆 P0：用户管理、权限分配、合作方入口和商家反馈处理闭环；P1 再拆码池上传、加密兑换码、使用教程、登录领取、签到、推广截图证据和邀请用户 |
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
