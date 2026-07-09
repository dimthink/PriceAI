# API 中转模型采集流程

这份文档只梳理 API 中转站里的“模型覆盖、价格倍率、可用性监测”链路。它和卡网商品采集不是同一套对象，但遵守同一个原则：公开数据先沉淀，真实 Key 实测再确认，不把采集失败当作站点不可用。

## 1. 数据入口

| 入口 | 主要文件 | 作用 |
| --- | --- | --- |
| 公开价格/模型目录 | `config/api-transit-sources.json` + `scripts/collect-api-transit.mjs` | 从 New API `/api/pricing`、公开模型页、partner API、`site-info` 等接口抓模型分组、价格、公开可用率。 |
| 实际 API Key 探测 | `config/api-transit-probes.json` + `scripts/probe-api-transit.mjs` | 使用已授权 Key 拉 `/v1/models`，再对聊天补全模型发起一次轻量请求，写入 `api_transit_detection_runs` 和可用性样本。 |
| Sub2API 账号导入 | `scripts/import-sub2api-api-transit.mjs` | 登录/Key 维度读取可用分组，补充站点、分组倍率、实际可用模型和监测凭据。 |
| 人工审核/补充 | 后台 API 中转审核池 | 修正系统标签、来源渠道、号池、优惠、风控提示和发布状态。 |

## 2. 公开模型价格采集

1. `collect-api-transit.mjs` 读取 `config/api-transit-sources.json`，按来源类型调用不同适配器。
2. 普通 New API 站点优先读公开 `/api/pricing`，从 `data/list/models`、`group_ratio`、`enable_groups` 等字段还原站点分组。
3. 每个原始模型名会先走 `standardizeModelName()`，映射到 PriceAI 的标准模型位。
4. 文本模型如果有官方基准价，会把站内 `model_ratio`、`completion_ratio`、缓存倍率和充值比例折算成可比较的倍率。
5. 图片/视频模型如果公开接口返回 `quota_type: 1` 和 `model_price`，会作为固定价写入；没有官方可比基准时不参与“综合倍率”排行，只作为公开固定价展示。
6. 采集结果写入 `api_transit_stations`、`api_transit_offers`，同时保留 `raw_payload` 方便复核原始字段。

## 3. 当前标准模型覆盖

| 模型族 | 已纳入标准模型 | 公开接口可识别的常见别名 |
| --- | --- | --- |
| ChatGPT / OpenAI | `GPT 5.5`、`GPT 5.4` | `gpt-5.5`、`gpt-5-5`、`gpt-5.4`、`gpt-5-4`；会排除 `mini/nano` 变体，避免误归。 |
| Claude | `Claude Fable 5`、`Claude Sonnet 5`、`Claude Sonnet 4.6`、`Claude Opus 4.6/4.7/4.8` | `claude-fable-5`、`claude-sonnet-5`、`claude-sonnet-4.6`、`claude-opus-4.8` 等显式版本。 |
| Gemini | `Gemini 3.5 Flash`、`Gemini 3.1 Pro` | `gemini-3.5-flash`、`gemini-3.1-pro-preview`。 |
| Grok | `Grok 4.5`、`Composer 2.5`、`Grok Image`、`Grok Video` | `grok-4.5`、`grok-4.5-latest`、`composer-2.5`、`grok-imagine-image`、`grok-imagine-video`。Grok 图片/视频模型的主品牌归属是 Grok，同时也会被图片生成/视频生成能力筛选命中。 |
| GLM | `GLM-5.2`、`GLM-5.1` | `glm-5.2`、`glm-5-2`、`zhipu/glm-5.1`。 |
| DeepSeek | `DeepSeek V4 Flash`、`DeepSeek V4 Pro` | `deepseek-v4-flash`、`deepseek-v4-pro`。 |
| 图片生成 | `GPT Image 2`、`Grok Image`、`Nano Banana Pro`、`Nano Banana 2`、`Nano Banana`、`Nano Banana Lite` | `gpt-image-2`、`grok-imagine-image`、`grok-image`、`gemini-3-pro-image-preview`、`gemini-3.1-flash-image-preview`、`gemini-2.5-flash-image`、`nano-banana-*`。 |
| 视频生成 | `Sora 2`、`Sora 2 Pro`、`Grok Video`、`Veo 3.1`、`Veo 3.1 Lite`、`Gemini Omni Flash`、`Seedance 2.0`、`Kling 2.5 Turbo` | `sora-2`、`sora-2-pro`、`grok-imagine-video`、`grok-video`、`veo-3.1`、`gemini-omni-flash`、`seedance-2.0`、`video-ds-2.0`、`kling-2.5-turbo`。 |

暂时只记录但不标准化的公开模型名包括：`Gemini 3 Flash/Pro`、`Gemini 2.5 Flash` 文本模型、`GLM-4.x/5` 非当前标准版本、`DeepSeek v3.x`、Qwen、Doubao、Runway、Luma、Vidu 等。它们需要先补官方基准价或独立标准模型位，否则会污染倍率比较。

## 4. 可用性监测流程

价格采集和模型可用性监测是两条链路：

1. 价格采集只回答“公开接口说有哪些模型、分组和价格”。
2. `probe-api-transit.mjs` 只对已经有 Key 的站点运行，先拉 `/v1/models`，再选中可用模型发起轻量聊天请求。
3. 探测结果写入 `api_transit_detection_runs`，并按站点、标准模型、分组合并成最近可用率。
4. 当前实测脚本主要覆盖 OpenAI-compatible 的文本聊天补全模型；图片和视频模型很多不是 chat completions 端点，不能直接沿用同一探测方式。
5. 对媒体模型，现阶段优先展示公开价格和公开状态；后续需要单独做图片/视频端点探测器，或者接入商家公开监测接口。

## 5. 定时更新关系

| 任务 | 数据 | 典型频率 | 失败影响 |
| --- | --- | --- | --- |
| API 中转价格采集 | 站点资料、模型分组、倍率、固定价 | 可低频，适合小时级或手动触发重点源 | 不应清空旧报价；只更新采集日志和错误。 |
| API Key 可用性探测 | `/v1/models`、轻量请求、7 日样本 | 当前按探测配置运行，常见目标是 10 分钟级 | 缺 Key、站点未配置、媒体模型不支持 chat 端点都会导致无样本，不等于价格采集失败。 |
| 公开状态补充 | `site-info`、partner status、公开模型目录 uptime | 跟随价格采集或独立低频 | 只能标注为公开状态，不冒充 PriceAI 实测。 |

## 6. 排查口径

- 如果页面有价格但“稳定性样本不足”，优先查 `config/api-transit-probes.json` 是否有对应站点 profile 和 Key。
- 如果只有部分模型进入页面，优先查公开模型名是否能被 `standardizeModelName()` 映射。
- 如果图片/视频模型没有综合倍率，通常是因为官方可比价格未纳入，页面会显示公开固定价。
- 如果站点仍在审核池，公开采集可以先写入候选，但前台是否展示由 `published/status` 决定。
