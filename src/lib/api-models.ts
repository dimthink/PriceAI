export type ApiProviderType = "official" | "router" | "free" | "subscription";

export type ApiCurrency = "CNY" | "USD";

export type ApiBillingMode = "按量计费" | "免费/测试" | "订阅套餐" | "动态路由";

export type ApiPriceValue =
  | {
      kind: "numeric";
      usdPerMTokens?: number;
      cnyPerMTokens?: number;
      label?: string;
    }
  | {
      kind: "text";
      text: string;
    };

export type ApiModel = {
  id: string;
  displayName: string;
  family: string;
  modelId: string;
  description: string;
  contextWindow?: string;
  sourceUrl: string;
  sourceLabel: string;
  capabilities: string[];
  suitableTools: string[];
  updatedAt: string;
};

export type ApiProvider = {
  id: string;
  name: string;
  type: ApiProviderType;
  billingMode: ApiBillingMode;
  url: string;
  pricingUrl?: string;
  logoUrl?: string;
  description: string;
  limitSummary: string;
  limitations: string;
  sourceLabel: string;
  updatedAt: string;
};

export type ApiPlan = {
  id: string;
  providerId: string;
  name: string;
  providerName: string;
  type: ApiProviderType;
  priceLabel: string;
  priceUsdMonthly?: number;
  priceCnyMonthly?: number;
  url: string;
  quotaBadges?: string[];
  quotaSummary: string;
  resetSummary: string;
  limitSummary: string;
  limitations: string;
  modelIds: string[];
  coverageLabel?: string;
  compatibility: string[];
  suitableTools: string[];
  sourceLabel: string;
  updatedAt: string;
};

export type ApiModelOffer = {
  id: string;
  modelId: string;
  providerId: string;
  billingMode: ApiBillingMode;
  routeModelId?: string;
  inputPrice: ApiPriceValue;
  outputPrice: ApiPriceValue;
  cacheReadPrice?: ApiPriceValue;
  cacheWritePrice?: ApiPriceValue;
  freeOrPlan: string;
  limitSummary: string;
  limitations: string;
  compatibility: string[];
  suitableTools: string[];
  sourceLabel: string;
  pricingUrl?: string;
  updatedAt: string;
  notes?: string;
};

export type ApiModelScope = "all" | string;

export type ApiModelFamilyOption = {
  id: string;
  label: string;
};

export type ApiModelSummary = {
  id: string;
  model: ApiModel;
  family: string;
  displayName: string;
  offerCount: number;
  providerCount: number;
  officialCount: number;
  freeCount: number;
  routerCount: number;
  subscriptionCount: number;
  planCount: number;
  providerNames: string[];
  compatibility: string[];
  suitableTools: string[];
  primaryOffer: ApiModelOfferWithRelations | null;
  latestUpdatedAt: string;
};

export type ApiProviderSummary = {
  id: string;
  provider: ApiProvider;
  offerCount: number;
  modelCount: number;
  planCount: number;
  families: string[];
  modelNames: string[];
  compatibility: string[];
  suitableTools: string[];
  plans: ApiPlan[];
  primaryPlan: ApiPlan | null;
  latestUpdatedAt: string;
};

export type ApiModelOfferWithRelations = ApiModelOffer & {
  model: ApiModel;
  provider: ApiProvider;
};

export type ApiModelFxSummary = {
  baseCurrency: string;
  quoteCurrency: string;
  date: string;
  usdToCny: number;
  source: string;
};

export type ApiModelDataset = {
  source: "static" | "supabase";
  generatedAt: string;
  fxSummary: ApiModelFxSummary;
  models: ApiModel[];
  providers: ApiProvider[];
  plans: ApiPlan[];
  offers: ApiModelOffer[];
};

type ApiModelDatasetIndex = {
  modelById: Map<string, ApiModel>;
  providerById: Map<string, ApiProvider>;
  sortedModels: ApiModel[];
  sortedPlans: ApiPlan[];
  offersWithRelations: ApiModelOfferWithRelations[];
  offersByModelId: Map<string, ApiModelOfferWithRelations[]>;
  offersByProviderId: Map<string, ApiModelOfferWithRelations[]>;
  plansByModelId: Map<string, ApiPlan[]>;
  plansByProviderId: Map<string, ApiPlan[]>;
};

const apiModelDatasetIndexCache = new WeakMap<ApiModelDataset, ApiModelDatasetIndex>();

const OPENCODE_GO_REFERRAL_URL = "https://opencode.ai/go?ref=22QZ8PAKGD";
const openAiPricingUrl = "https://developers.openai.com/api/docs/pricing";
const chatGptPricingUrl = "https://chatgpt.com/pricing/";
const openAiVideoGenerationUrl = "https://platform.openai.com/docs/guides/video-generation";
const claudeApiPricingUrl = "https://platform.claude.com/docs/en/about-claude/pricing";
const claudePricingUrl = "https://claude.com/pricing";
const geminiApiPricingUrl = "https://ai.google.dev/gemini-api/docs/pricing";
const googleAiPlansUrl = "https://one.google.com/intl/en_us/about/google-ai-plans/";
const geminiImageGenerationUrl = "https://ai.google.dev/gemini-api/docs/image-generation";
const geminiModelDocsUrl = "https://ai.google.dev/gemini-api/docs/models";
const bytePlusSeedanceDocsUrl = "https://docs.byteplus.com/en/docs/ModelArk/1520757";
const klingVideoDocsUrl = "https://app.klingai.com/global/dev/document-api/apiReference/model/video";

export const apiModelUpdatedAt = "2026-06-07";
export const apiMediaModelUpdatedAt = "2026-07-03";
export const apiOfficialPlatformUpdatedAt = "2026-07-06";

export const apiModelFxSummary: ApiModelFxSummary = {
  baseCurrency: "USD",
  quoteCurrency: "CNY",
  date: "2026-06-07",
  usdToCny: 6.7739,
  source: "Frankfurter",
};

export const apiProviderTypeLabels: Record<ApiProviderType, string> = {
  official: "官方 API",
  router: "模型路由",
  free: "免费/测试",
  subscription: "订阅/Token Plan",
};

export const apiProviderTypeDescriptions: Record<ApiProviderType, string> = {
  official: "厂商官方或云厂商公开 API，适合做价格基准。",
  router: "公开模型路由平台，重点看模型覆盖、价格变化和限流口径。",
  free: "免费或测试用途入口，必须同时关注限流、排队和可用性。",
  subscription: "按月或周期购买 Token/请求额度，或购买官方产品内使用额度，需要看额度、短周期限制和使用边界。",
};

export const hiddenPublicApiProviderIds = new Set([
  "openrouter",
  "baidu-qianfan",
  "huaweicloud-modelarts-maas",
  "jdcloud-joyai",
  "unicom-yuanjing",
]);

export function isPublicApiProvider(provider: ApiProvider) {
  return provider.type !== "router" && !hiddenPublicApiProviderIds.has(provider.id);
}

export function getPublicApiModelDataset(dataset: ApiModelDataset): ApiModelDataset {
  const providers = dataset.providers.filter(isPublicApiProvider);
  const providerIds = new Set(providers.map((provider) => provider.id));
  const offers = dataset.offers.filter((offer) => providerIds.has(offer.providerId));
  const plans = dataset.plans.filter((plan) => providerIds.has(plan.providerId));
  const visibleModelIds = new Set([
    ...offers.map((offer) => offer.modelId),
    ...plans.flatMap((plan) => plan.modelIds),
  ]);
  const models = dataset.models.filter((model) => visibleModelIds.has(model.id));

  return {
    ...dataset,
    models,
    providers,
    plans,
    offers,
  };
}

export const apiProviderCandidates = [
  {
    id: "volcengine-ark-coding-plan",
    name: "火山方舟 Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.volcengine.com/activity/codingplan",
    pricingUrl: "https://www.volcengine.com/activity/codingplan",
    logoUrl: null,
    status: "collector_todo",
    priority: "high",
    evidenceStatus: "needs_pricing_parse",
    sourceLabel: "火山引擎方舟 Coding Plan 官方活动页",
    reason: "官方活动页已公开展示方舟 Coding Plan，覆盖 DeepSeek、GLM、MiniMax、Kimi、Doubao 等模型和 Claude Code、Cursor、Cline、OpenCode 等工具，但价格/库存区域依赖动态页面，需要进一步解析。",
    nextStep: "补活动页半结构化解析：提取套餐档位、价格、模型覆盖、工具兼容和限额口径；前台先展示官方入口和待解析报价，后续由采集器补齐结构化字段。",
    notes: "官方入口已确认，已进入前台候选展示；当前问题是价格和限制字段还没有稳定结构化。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "tencent-hunyuan-coding-plan",
    name: "腾讯云 TokenHub Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://cloud.tencent.com/product/tokenhub",
    pricingUrl: "https://cloud.tencent.com/document/product/1823/130092",
    logoUrl: null,
    status: "collector_todo",
    priority: "high",
    evidenceStatus: "verified_url",
    sourceLabel: "腾讯云 TokenHub 官方文档",
    reason: "腾讯云官方 TokenHub 产品页和 Coding Plan 概述文档已公开说明这是面向 AI Coding 场景的订阅套餐，并列出支持模型、适配工具和套餐入口。",
    nextStep: "补腾讯云官方文档解析器：提取 Lite/Pro 档位、月费、5 小时/周/月请求限额、支持模型和购买页；前台先展示已核验官方文档口径。",
    notes: "官方来源已确认，已进入前台展示；不使用第三方整理站价格作为报价依据。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "jdcloud-joyai",
    name: "京东云 JoyAI 候选",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.jdcloud.com/cn/products/joyai",
    pricingUrl: null,
    logoUrl: null,
    status: "needs_review",
    priority: "medium",
    evidenceStatus: "needs_official_source",
    sourceLabel: "京东云公开入口",
    reason: "可能覆盖国产模型 API 或企业级模型服务，但公开入口跳转和产品边界需要二次核验。",
    nextStep: "确认是否有面向开发者的模型 API、公开价格页和可调用模型列表。",
    notes: "已进入前台候选展示；不确认价格表前只展示官方入口和待解析口径。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "unicom-yuanjing",
    name: "联通元景大模型候选",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.chinaunicom.cn/",
    pricingUrl: null,
    logoUrl: null,
    status: "needs_review",
    priority: "medium",
    evidenceStatus: "needs_official_source",
    sourceLabel: "联通公开入口",
    reason: "社区和云厂商生态中可能存在元景大模型 API 或套餐入口，但当前还缺少稳定官方价格页。",
    nextStep: "找到联通云/元景官方开发者文档或价格页后，再补采集器。",
    notes: "已进入前台候选展示；等待补充稳定官方文档和价格页。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ctyun-xirang",
    name: "天翼云息壤大模型候选",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.ctyun.cn/",
    pricingUrl: null,
    logoUrl: null,
    status: "needs_review",
    priority: "medium",
    evidenceStatus: "needs_official_source",
    sourceLabel: "天翼云公开入口",
    reason: "可能存在电信云大模型 API 或企业套餐，但当前入口和价格口径需要人工确认。",
    nextStep: "确认公开文档、模型列表、价格表和是否支持 OpenAI-compatible 调用。",
    notes: "已进入前台候选展示；等待补充稳定官方文档和价格页。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "huaweicloud-modelarts-maas",
    name: "华为云 ModelArts / MaaS 候选",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.huaweicloud.com/product/modelarts.html",
    pricingUrl: null,
    logoUrl: null,
    status: "needs_review",
    priority: "medium",
    evidenceStatus: "needs_pricing_parse",
    sourceLabel: "华为云 ModelArts 官网",
    reason: "华为云有公开 AI 开发平台入口，但是否适合 PriceAI 的模型 API 价格对比需要核验。",
    nextStep: "补华为云 MaaS/ModelArts 价格页和模型列表来源，确认计费维度。",
    notes: "已进入前台候选展示；偏企业云服务，后续需要继续简化计费口径。",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "baidu-qianfan",
    name: "百度智能云千帆候选",
    type: "official",
    billingMode: "按量计费",
    url: "https://cloud.baidu.com/product-s/qianfan_home",
    pricingUrl: null,
    logoUrl: null,
    status: "needs_review",
    priority: "medium",
    evidenceStatus: "needs_pricing_parse",
    sourceLabel: "百度智能云千帆官网",
    reason: "千帆是公开大模型平台，适合进入官方 API 候选，但价格表和模型映射需要单独解析。",
    nextStep: "确认千帆模型价格页、模型 ID、输入/输出/缓存计费规则。",
    notes: "已进入前台候选展示；等待解析模型价格页、模型 ID 和缓存计费规则。",
    updatedAt: apiModelUpdatedAt,
  },
] as const;

export const apiModels: ApiModel[] = [
  {
    id: "gpt-5-5",
    displayName: "GPT-5.5",
    family: "OpenAI",
    modelId: "gpt-5.5",
    description: "OpenAI 当前旗舰文本与 Agent 模型，适合高失败成本的复杂推理、代码审查和长任务编排。",
    contextWindow: "<272K 价格档",
    sourceUrl: openAiPricingUrl,
    sourceLabel: "OpenAI API Pricing",
    capabilities: ["reasoning", "coding", "tool-calls", "json", "agent"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "自建应用"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gpt-5-4",
    displayName: "GPT-5.4",
    family: "OpenAI",
    modelId: "gpt-5.4",
    description: "OpenAI 高能力通用模型，适合大多数 Coding Agent、检索增强和产品内 AI 功能。",
    contextWindow: "<272K 价格档",
    sourceUrl: openAiPricingUrl,
    sourceLabel: "OpenAI API Pricing",
    capabilities: ["reasoning", "coding", "tool-calls", "json", "agent"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "自建应用"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gpt-5-4-mini",
    displayName: "GPT-5.4 Mini",
    family: "OpenAI",
    modelId: "gpt-5.4-mini",
    description: "OpenAI 成本更低的通用模型，适合批量抽取、轻量代码辅助、分类和日常自动化。",
    contextWindow: "<272K 价格档",
    sourceUrl: openAiPricingUrl,
    sourceLabel: "OpenAI API Pricing",
    capabilities: ["coding", "tool-calls", "json", "agent"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "自建应用"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gpt-5-4-nano",
    displayName: "GPT-5.4 Nano",
    family: "OpenAI",
    modelId: "gpt-5.4-nano",
    description: "OpenAI 极低成本模型，适合高频分类、短文本处理、批量标签和非关键路径自动化。",
    contextWindow: "<272K 价格档",
    sourceUrl: openAiPricingUrl,
    sourceLabel: "OpenAI API Pricing",
    capabilities: ["json", "classification", "extraction"],
    suitableTools: ["自建应用", "Open WebUI", "批量处理"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    family: "Claude",
    modelId: "claude-opus-4-8",
    description: "Anthropic Claude 高能力模型，适合复杂代码库理解、深度推理和高价值 Agent 任务。",
    contextWindow: "见官方模型页",
    sourceUrl: claudeApiPricingUrl,
    sourceLabel: "Claude API Pricing",
    capabilities: ["reasoning", "coding", "tool-calls", "agent"],
    suitableTools: ["Claude Code", "Codex", "Cursor", "自建应用"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    family: "Claude",
    modelId: "claude-sonnet-5",
    description: "Anthropic Claude 均衡主力模型，适合日常开发、代码修改、长上下文阅读和 Agent 工作流。",
    contextWindow: "见官方模型页",
    sourceUrl: claudeApiPricingUrl,
    sourceLabel: "Claude API Pricing",
    capabilities: ["coding", "tool-calls", "agent", "long-context"],
    suitableTools: ["Claude Code", "Codex", "Cursor", "OpenCode"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    family: "Claude",
    modelId: "claude-haiku-4-5",
    description: "Anthropic Claude 低延迟低成本模型，适合轻量改写、抽取、分类和工具调用前置判断。",
    contextWindow: "见官方模型页",
    sourceUrl: claudeApiPricingUrl,
    sourceLabel: "Claude API Pricing",
    capabilities: ["json", "tool-calls", "classification"],
    suitableTools: ["Claude Code", "OpenCode", "自建应用"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gemini-3-1-pro-preview",
    displayName: "Gemini 3.1 Pro Preview",
    family: "Gemini",
    modelId: "gemini-3.1-pro-preview",
    description: "Google Gemini 高能力预览模型，适合多模态理解、长上下文和复杂推理任务。",
    contextWindow: "按价格档",
    sourceUrl: geminiApiPricingUrl,
    sourceLabel: "Gemini API Pricing",
    capabilities: ["multimodal", "reasoning", "coding", "long-context"],
    suitableTools: ["自建应用", "Open WebUI", "NotebookLM 工作流"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gemini-3-1-flash-lite",
    displayName: "Gemini 3.1 Flash-Lite",
    family: "Gemini",
    modelId: "gemini-3.1-flash-lite",
    description: "Google Gemini 低成本高速模型，适合批量文本、多模态轻任务和成本敏感调用。",
    contextWindow: "见官方模型页",
    sourceUrl: geminiApiPricingUrl,
    sourceLabel: "Gemini API Pricing",
    capabilities: ["multimodal", "json", "classification", "extraction"],
    suitableTools: ["自建应用", "Open WebUI", "批量处理"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    family: "Gemini",
    modelId: "gemini-3-flash-preview",
    description: "Google Gemini Flash 预览模型，适合速度优先的多模态和日常 Agent 场景，价格以官方预览页为准。",
    contextWindow: "见官方模型页",
    sourceUrl: geminiApiPricingUrl,
    sourceLabel: "Gemini API Pricing",
    capabilities: ["multimodal", "coding", "json", "agent"],
    suitableTools: ["自建应用", "Open WebUI", "NotebookLM 工作流"],
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    family: "DeepSeek",
    modelId: "deepseek-v4-flash",
    description: "DeepSeek V4 的低成本高吞吐版本，适合高频编码、总结、抽取和日常 Agent 调用。",
    contextWindow: "1M",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    sourceLabel: "DeepSeek API Docs",
    capabilities: ["thinking", "tool-calls", "json", "fim"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    family: "DeepSeek",
    modelId: "deepseek-v4-pro",
    description: "DeepSeek V4 的旗舰能力版本，适合更复杂的推理、长上下文和高失败成本任务。",
    contextWindow: "1M",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    sourceLabel: "DeepSeek API Docs",
    capabilities: ["thinking", "tool-calls", "json", "fim"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-7-max",
    displayName: "Qwen3.7 Max",
    family: "Qwen",
    modelId: "qwen3.7-max",
    description: "Qwen 当前高能力模型之一，适合复杂代码与 Agent 任务，已补齐阿里云百炼官方按量价格。",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    sourceLabel: "阿里云百炼模型价格",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-7-plus",
    displayName: "Qwen3.7 Plus",
    family: "Qwen",
    modelId: "qwen3.7-plus",
    description: "Qwen 的均衡版本，适合成本敏感的 Coding Agent 和日常中文开发任务，已补齐阿里云百炼官方按量价格。",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    sourceLabel: "阿里云百炼模型价格",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-6-plus",
    displayName: "Qwen3.6 Plus",
    family: "Qwen",
    modelId: "qwen3.6-plus",
    description: "Qwen Plus 系列模型，适合中低成本编码和中文模型调用，已补齐阿里云百炼官方按量价格。",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    sourceLabel: "阿里云百炼模型价格",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-5-plus",
    displayName: "Qwen3.5 Plus",
    family: "Qwen",
    modelId: "qwen3.5-plus",
    description: "Qwen Plus 系列模型，既有阿里云百炼官方按量 API，也被 Alibaba Coding Plan 收录。",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    sourceLabel: "阿里云百炼模型价格",
    capabilities: ["vision", "coding", "agent"],
    suitableTools: ["Codex", "Claude Code", "Cursor", "OpenCode"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-coder-plus",
    displayName: "Qwen3 Coder Plus",
    family: "Qwen",
    modelId: "qwen3-coder-plus",
    description: "Qwen Coder 系列模型，适合代码生成和 Agent 任务，已补齐阿里云百炼官方按量价格。",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    sourceLabel: "阿里云百炼模型价格",
    capabilities: ["coding", "agent"],
    suitableTools: ["Qwen Code", "Codex", "Claude Code", "Cursor"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-k2-6",
    displayName: "Kimi K2.6",
    family: "Kimi",
    modelId: "kimi-k2.6",
    description: "Kimi 新一代长程代码和 Agent 模型，支持文本、图片与视频输入。",
    contextWindow: "256K",
    sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k26",
    sourceLabel: "Kimi API Pricing",
    capabilities: ["vision", "thinking", "tool-calls", "json"],
    suitableTools: ["Kimi Code", "OpenCode", "Cursor", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-k2-5",
    displayName: "Kimi K2.5",
    family: "Kimi",
    modelId: "kimi-k2.5",
    description: "Kimi K2.5 多模态与 Agent 模型，仍被多个公开编码套餐收录。",
    contextWindow: "256K",
    sourceUrl: "https://platform.kimi.com/docs/pricing/chat-k25",
    sourceLabel: "Kimi API Pricing",
    capabilities: ["vision", "thinking", "tool-calls", "json"],
    suitableTools: ["Kimi Code", "OpenCode", "Cursor", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "glm-5-1",
    displayName: "GLM-5.1",
    family: "GLM",
    modelId: "glm-5.1",
    description: "GLM 5 系列高能力版本，已补齐智谱开放平台官方按量价格，适合长程 Agent 和工程级任务。",
    sourceUrl: "https://open.bigmodel.cn/pricing",
    sourceLabel: "智谱官方定价页",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Claude Code", "Cursor"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "glm-5",
    displayName: "GLM-5",
    family: "GLM",
    modelId: "glm-5",
    description: "智谱 GLM 基座模型，面向复杂系统工程与长程 Agent 任务。",
    contextWindow: "200K",
    sourceUrl: "https://docs.bigmodel.cn/cn/guide/models/text/glm-5",
    sourceLabel: "智谱开放文档",
    capabilities: ["thinking", "tool-calls", "cache", "coding"],
    suitableTools: ["OpenCode", "Codex", "Claude Code", "Cursor"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "minimax-m3",
    displayName: "MiniMax M3",
    family: "MiniMax",
    modelId: "minimax-m3",
    description: "MiniMax 最新 M 系列模型，面向 Agentic reasoning、tool use、coding 和长上下文任务。",
    contextWindow: "1M",
    sourceUrl: "https://platform.minimax.io/docs/api-reference/api-overview",
    sourceLabel: "MiniMax API Docs",
    capabilities: ["anthropic-compatible", "tool-calls", "coding", "long-context"],
    suitableTools: ["OpenCode", "Claude Code", "Cursor", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "minimax-m2-7",
    displayName: "MiniMax M2.7",
    family: "MiniMax",
    modelId: "minimax-m2.7",
    description: "MiniMax M2.7 是官方 API 与 Token Plan 的主力模型，适合低成本编码与 Agent。",
    contextWindow: "204.8K",
    sourceUrl: "https://platform.minimax.io/docs/api-reference/api-overview",
    sourceLabel: "MiniMax API Docs",
    capabilities: ["anthropic-compatible", "openai-compatible", "tool-calls", "coding"],
    suitableTools: ["OpenCode", "Claude Code", "Cursor", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "minimax-m2-5",
    displayName: "MiniMax M2.5",
    family: "MiniMax",
    modelId: "minimax-m2.5",
    description: "MiniMax M2.5 是低成本编码与复杂任务模型，仍被多个公开套餐收录。",
    contextWindow: "204.8K",
    sourceUrl: "https://platform.minimax.io/docs/api-reference/api-overview",
    sourceLabel: "MiniMax API Docs",
    capabilities: ["anthropic-compatible", "openai-compatible", "tool-calls", "coding"],
    suitableTools: ["OpenCode", "Claude Code", "Cursor", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "mimo-v2-5-pro",
    displayName: "MiMo V2.5 Pro",
    family: "MiMo",
    modelId: "mimo-v2.5-pro",
    description: "Xiaomi MiMo V2.5 系列旗舰基座模型，官方介绍为 1T 总参数、42B 激活与 1M 上下文，适合复杂 Agent、编码和长上下文任务。",
    contextWindow: "1M",
    sourceUrl: "https://mimo.mi.com/",
    sourceLabel: "Xiaomi MiMo Home",
    capabilities: ["agent", "coding", "long-context", "multimodal"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "mimo-v2-5",
    displayName: "MiMo V2.5",
    family: "MiMo",
    modelId: "mimo-v2.5",
    description: "Xiaomi MiMo V2.5 系列均衡基座模型，官方强调全模态感知、Agent 能力和 1M 上下文，适合成本与能力平衡的中文模型调用。",
    contextWindow: "1M",
    sourceUrl: "https://mimo.mi.com/",
    sourceLabel: "Xiaomi MiMo Home",
    capabilities: ["agent", "coding", "long-context", "multimodal"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "step-3-7-flash",
    displayName: "Step 3.7 Flash",
    family: "StepFun",
    modelId: "step-3.7-flash",
    description: "阶跃星辰面向真实 Agent、Coding 和多模态工作流的高效率 Flash 模型，适合作为国产模型 API 的新增候选基准。",
    sourceUrl: "https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash",
    sourceLabel: "StepFun 模型文档",
    capabilities: ["agent", "coding", "multimodal", "tool-calls"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "Open WebUI"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    family: "图片生成",
    modelId: "gpt-image-2",
    description: "OpenAI 图片生成标准模型，沿用中转 API 图片生成分组，主要作为官方输入、缓存和图片输出价格基准。",
    sourceUrl: openAiPricingUrl,
    sourceLabel: "OpenAI API Pricing",
    capabilities: ["image-generation", "multimodal"],
    suitableTools: ["自建应用", "OpenAI-compatible", "Open WebUI"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    family: "图片生成",
    modelId: "nano-banana-pro",
    description: "Google Gemini 图片生成标准模型，沿用中转 API 图片生成分组，当前先保留官方文档入口和待结构化价格。",
    sourceUrl: geminiImageGenerationUrl,
    sourceLabel: "Google Gemini Image Generation",
    capabilities: ["image-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API", "Open WebUI"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "nano-banana-2",
    displayName: "Nano Banana 2",
    family: "图片生成",
    modelId: "nano-banana-2",
    description: "Google Gemini 图片生成标准模型，沿用中转 API 图片生成分组，当前先保留官方文档入口和待结构化价格。",
    sourceUrl: geminiImageGenerationUrl,
    sourceLabel: "Google Gemini Image Generation",
    capabilities: ["image-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API", "Open WebUI"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "nano-banana",
    displayName: "Nano Banana",
    family: "图片生成",
    modelId: "nano-banana",
    description: "Google Gemini 图片生成标准模型，沿用中转 API 图片生成分组，当前先保留官方文档入口和待结构化价格。",
    sourceUrl: geminiImageGenerationUrl,
    sourceLabel: "Google Gemini Image Generation",
    capabilities: ["image-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API", "Open WebUI"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "nano-banana-lite",
    displayName: "Nano Banana Lite",
    family: "图片生成",
    modelId: "nano-banana-lite",
    description: "Google Gemini 图片生成轻量标准模型，沿用中转 API 图片生成分组，当前先保留官方文档入口和待结构化价格。",
    sourceUrl: geminiImageGenerationUrl,
    sourceLabel: "Google Gemini Image Generation",
    capabilities: ["image-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API", "Open WebUI"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "sora-2",
    displayName: "Sora 2",
    family: "视频生成",
    modelId: "sora-2",
    description: "OpenAI 视频生成标准模型，沿用中转 API 视频生成分组，当前先保留官方视频生成文档入口和待结构化价格。",
    sourceUrl: openAiVideoGenerationUrl,
    sourceLabel: "OpenAI Video Generation",
    capabilities: ["video-generation", "multimodal"],
    suitableTools: ["自建应用", "OpenAI API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "sora-2-pro",
    displayName: "Sora 2 Pro",
    family: "视频生成",
    modelId: "sora-2-pro",
    description: "OpenAI 视频生成高规格标准模型，沿用中转 API 视频生成分组，当前先保留官方视频生成文档入口和待结构化价格。",
    sourceUrl: openAiVideoGenerationUrl,
    sourceLabel: "OpenAI Video Generation",
    capabilities: ["video-generation", "multimodal"],
    suitableTools: ["自建应用", "OpenAI API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "veo-3-1",
    displayName: "Veo 3.1",
    family: "视频生成",
    modelId: "veo-3.1",
    description: "Google Gemini 视频生成标准模型，沿用中转 API 视频生成分组，当前先保留官方模型文档入口和待结构化价格。",
    sourceUrl: geminiModelDocsUrl,
    sourceLabel: "Google Gemini Models",
    capabilities: ["video-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "veo-3-1-lite",
    displayName: "Veo 3.1 Lite",
    family: "视频生成",
    modelId: "veo-3.1-lite",
    description: "Google Gemini 视频生成轻量标准模型，沿用中转 API 视频生成分组，当前先保留官方模型文档入口和待结构化价格。",
    sourceUrl: geminiModelDocsUrl,
    sourceLabel: "Google Gemini Models",
    capabilities: ["video-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "gemini-omni-flash",
    displayName: "Gemini Omni Flash",
    family: "视频生成",
    modelId: "gemini-omni-flash",
    description: "Google Gemini 视频/全模态标准模型，沿用中转 API 视频生成分组，当前先保留官方模型文档入口和待结构化价格。",
    sourceUrl: geminiModelDocsUrl,
    sourceLabel: "Google Gemini Models",
    capabilities: ["video-generation", "multimodal"],
    suitableTools: ["自建应用", "Gemini API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "seedance-2-0",
    displayName: "Seedance 2.0",
    family: "视频生成",
    modelId: "seedance-2.0",
    description: "BytePlus ModelArk 视频生成标准模型，沿用中转 API 视频生成分组，当前先保留官方文档入口和待结构化价格。",
    sourceUrl: bytePlusSeedanceDocsUrl,
    sourceLabel: "BytePlus ModelArk Docs",
    capabilities: ["video-generation"],
    suitableTools: ["自建应用", "ModelArk"],
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "kling-2-5-turbo",
    displayName: "Kling 2.5 Turbo",
    family: "视频生成",
    modelId: "kling-2.5-turbo",
    description: "Kling API 视频生成标准模型，沿用中转 API 视频生成分组，当前先保留官方 API 文档入口和待结构化价格。",
    sourceUrl: klingVideoDocsUrl,
    sourceLabel: "Kling API Docs",
    capabilities: ["video-generation"],
    suitableTools: ["自建应用", "Kling API"],
    updatedAt: apiMediaModelUpdatedAt,
  },
];

export const apiProviders: ApiProvider[] = [
  {
    id: "deepseek-official",
    name: "DeepSeek 官方 API",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.deepseek.com/",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    logoUrl: "/brand-icons/deepseek.png",
    description: "DeepSeek 官方 OpenAI/Anthropic 兼容 API，适合作为 DeepSeek V4 的价格基准。",
    limitSummary: "未公开固定 RPM/TPM，以控制台为准。",
    limitations: "价格可能调整，旧模型名 deepseek-chat 与 deepseek-reasoner 有兼容和下线时间说明。",
    sourceLabel: "DeepSeek API Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-official",
    name: "Kimi API",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.kimi.com/",
    pricingUrl: "https://platform.kimi.com/docs/pricing/chat",
    logoUrl: "/brand-icons/kimi.png",
    description: "Moonshot/Kimi 官方开放平台，适合长上下文、多模态和中文 Agent 场景。",
    limitSummary: "未公开固定 RPM/TPM，以开放平台控制台为准。",
    limitations: "首版展示官方模型页与计费说明，具体价格以 Kimi 开放平台实时表格为准。",
    sourceLabel: "Kimi API Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen-official",
    name: "阿里云百炼 Qwen API",
    type: "official",
    billingMode: "按量计费",
    url: "https://bailian.console.aliyun.com/",
    pricingUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
    logoUrl: "/brand-icons/qwen.png",
    description: "阿里云百炼官方 Qwen / 通义千问模型 API，按输入、输出和上下文长度阶梯计费，适合作为 Qwen 官方价格基准。",
    limitSummary: "部分模型提供新用户免费额度，Batch 调用和上下文缓存折扣以阿里云百炼价格页为准。",
    limitations: "价格分中国内地部署范围和具体模型阶梯；长上下文请求会进入更高价格档位。",
    sourceLabel: "阿里云百炼模型价格",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "minimax-official",
    name: "MiniMax API",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.minimax.io/",
    pricingUrl: "https://platform.minimax.io/docs/guides/pricing-paygo",
    logoUrl: "/brand-icons/minimax.png",
    description: "MiniMax 官方开放平台，M3/M2.7/M2.5 支持 Anthropic 与 OpenAI 兼容接口。",
    limitSummary: "未公开固定 RPM/TPM，以控制台为准。",
    limitations: "M3 当前价格含限时折扣和 512K 阈值，M2.7/M2.5 有 standard/highspeed 差异。",
    sourceLabel: "MiniMax Pricing Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "zhipu-bigmodel",
    name: "智谱开放平台",
    type: "official",
    billingMode: "按量计费",
    url: "https://open.bigmodel.cn/",
    pricingUrl: "https://open.bigmodel.cn/pricing",
    logoUrl: "/brand-icons/glm.png",
    description: "智谱官方开放平台。收录 GLM-5.1 与 GLM-5 的官方按量价格，适合作为 GLM API 价格基准。",
    limitSummary: "未公开固定 RPM/TPM，以控制台为准。",
    limitations: "价格按上下文长度分档；长上下文请求会进入更高输入/输出/缓存价格档位。",
    sourceLabel: "智谱官方定价页",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "alibaba-coding-plan",
    name: "Alibaba Model Studio Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.alibabacloud.com/product/modelstudio",
    pricingUrl: "https://www.alibabacloud.com/help/en/model-studio/coding-plan",
    logoUrl: "/brand-icons/alibabacloud.svg",
    description: "阿里云 Model Studio 面向编码工具的月订阅套餐，覆盖 Qwen、Kimi、GLM、MiniMax 等模型。",
    limitSummary: "6,000 req/5h · 45,000 req/week · 90,000 req/month。",
    limitations: "仅用于编码工具；官方明确不适合自动化脚本、自定义后端或非交互批处理 API。",
    sourceLabel: "Alibaba Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    type: "subscription",
    billingMode: "订阅套餐",
    url: OPENCODE_GO_REFERRAL_URL,
    pricingUrl: OPENCODE_GO_REFERRAL_URL,
    logoUrl: "/brand-icons/opencode.png",
    description: "OpenCode 面向开放编码模型的低价订阅套餐，提供多模型 API endpoint。",
    limitSummary: "$12/5h · $30/week · $60/month 用量窗口。",
    limitations: "请求数取决于模型消耗；有 5 小时、每周、每月额度窗口，不能当作无限 API。",
    sourceLabel: "OpenCode Go Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    type: "free",
    billingMode: "免费/测试",
    url: "https://opencode.ai/zh/zen",
    pricingUrl: "https://opencode.ai/docs/zh-cn/zen/",
    logoUrl: "/brand-icons/opencode.png",
    description: "OpenCode Zen 面向 Coding Agent 精选模型，包含按量模型和不定期开放的限时免费模型。",
    limitSummary: "部分 Free 模型限时免费；其他模型按 $/1M tokens 计费，以 Zen 文档和模型接口为准。",
    limitations: "免费模型会不定期调整；部分免费端点可能用于模型反馈或产品改进，不适合提交敏感数据。",
    sourceLabel: "OpenCode Zen Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "router",
    billingMode: "动态路由",
    url: "https://openrouter.ai/",
    pricingUrl: "https://openrouter.ai/pricing",
    logoUrl: "/brand-icons/openrouter.png",
    description: "公开模型路由平台，统一 API key 访问多家模型和 provider，价格随模型页变化。",
    limitSummary: "免费 50 req/day；充值后免费模型可到 1,000 req/day。",
    limitations: "免费模型有低限流；付费价格、可用 provider 和路由结果可能随时间变化。",
    sourceLabel: "OpenRouter Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    type: "free",
    billingMode: "免费/测试",
    url: "https://build.nvidia.com/explore/discover",
    pricingUrl: "https://www.nvidia.com/en-us/ai-data-science/products/nim-microservices/",
    logoUrl: "/brand-icons/nvidia.png",
    description: "NVIDIA Hosted API 和 NIM 微服务入口，适合开发、测试、原型和自托管评估。",
    limitSummary: "未公开固定 RPM/TPM，以 API Catalog 为准。",
    limitations: "免费访问主要面向开发测试和原型，模型列表、限速和可用性会变化。",
    sourceLabel: "NVIDIA NIM",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "modelscope-api-inference",
    name: "ModelScope API Inference / 魔搭社区",
    type: "free",
    billingMode: "免费/测试",
    url: "https://modelscope.cn/",
    pricingUrl: "https://modelscope.cn/docs/model-service/API-Inference/limits",
    logoUrl: "/brand-icons/modelscope.png",
    description: "魔搭社区 API-Inference 将开源模型标准化为 API 接口，适合个人开发者做免费额度内的模型调用和原型验证。",
    limitSummary: "常见口径为每日约 2,000 次免费调用；单模型额度和并发会动态调整，以 API 使用情况页为准。",
    limitations: "免费服务不适合作为生产 SLA；达到限制会返回 429，模型覆盖和单模型额度会随平台策略变化。",
    sourceLabel: "ModelScope API-Inference 使用限制",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ollama",
    name: "Ollama",
    type: "free",
    billingMode: "免费/测试",
    url: "https://ollama.com/",
    pricingUrl: "https://ollama.com/pricing",
    logoUrl: "/brand-icons/ollama.png",
    description: "Ollama 官方云端模型入口，参考 awesome-coding-plan 的免费/Pro 线索，首版展示公开 Pricing 和套餐覆盖。",
    limitSummary: "Free / Pro 额度、并发和速率限制以 Ollama Pricing 为准。",
    limitations: "适合作为开放模型测试和轻量调用入口；模型列表、免费额度和 Pro 规则可能随官方页面变化。",
    sourceLabel: "Ollama Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-code",
    name: "Kimi Code",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.kimi.com/membership/pricing",
    pricingUrl: "https://www.kimi.com/membership/pricing",
    logoUrl: "/brand-icons/kimi.png",
    description: "Kimi 会员里的 Kimi Code 套餐入口，适合按月获取 Kimi Code 编码额度。",
    limitSummary: "Andante / Allegretto 等套餐额度以 Kimi 官方会员页为准。",
    limitations: "这是编码会员套餐，不等同于无限通用 API；具体模型、额度窗口和高峰可用性以官方页面为准。",
    sourceLabel: "Kimi Membership Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "glm-coding-plan",
    name: "GLM Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.bigmodel.cn/glm-coding?ic=93SRY3UUUI",
    pricingUrl: "https://www.bigmodel.cn/glm-coding?ic=93SRY3UUUI",
    logoUrl: "/brand-icons/glm.png",
    description: "智谱 GLM Coding Plan 官方入口，参考 awesome-coding-plan 的 Lite / Pro 线索，展示 GLM 编码套餐。",
    limitSummary: "Lite / Pro 用量额度、短周期限制和抢购状态以智谱官方页面为准。",
    limitations: "这是面向编码场景的订阅套餐，不直接等价于按量 API 单价；结构化额度后续再由采集器补齐。",
    sourceLabel: "GLM Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "fireworks-fire-pass",
    name: "Fireworks Fire Pass",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://app.fireworks.ai/fire-pass",
    pricingUrl: "https://app.fireworks.ai/fire-pass",
    logoUrl: "/brand-icons/fireworks.png",
    description: "Fireworks AI 的 Fire Pass 套餐入口，当前优先作为 Kimi K2.6 Turbo 等模型的公开套餐线索展示。",
    limitSummary: "周付套餐、模型覆盖和速率限制以 Fireworks Fire Pass 页面为准。",
    limitations: "套餐可用模型和 no per-token charges 口径可能变化，首版不硬填不可核验的等效单价。",
    sourceLabel: "Fireworks Fire Pass",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "xiaomi-mimo",
    name: "Xiaomi MiMo API",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.xiaomimimo.com/",
    pricingUrl: "https://platform.xiaomimimo.com/docs/en-US/price/pay-as-you-go",
    logoUrl: "/brand-icons/mimo.png",
    description: "小米 MiMo 官方开放平台，收录 MiMo V2.5 Pro 与 MiMo V2.5 的国内和海外按量 API 价格。",
    limitSummary: "价格分国内 RMB / M tokens 与海外 USD / M tokens；Token Plan 额度另算，和按量 API Key 不互通。",
    limitations: "MiMo V2 Pro / Omni 已自动路由到 V2.5 价格，并将在 2026-06-30 前后废弃旧名称。",
    sourceLabel: "Xiaomi MiMo Pay-As-You-Go API",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "stepfun-official",
    name: "StepFun 开放平台",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.stepfun.com/",
    pricingUrl: "https://platform.stepfun.com/docs/zh/guides/pricing/details",
    logoUrl: "/brand-icons/stepfun.png",
    description: "阶跃星辰官方开放平台，收录 Step 3.7 Flash 的国内按量价格，并以官方定价限速页作为来源。",
    limitSummary: "RPM/TPM 与模型价格以阶跃星辰官方定价与限速页为准。",
    limitations: "价格分国内/国际站点；当前结构化字段采用国内 RMB 价格，国际 USD 价格在文档中保留说明。",
    sourceLabel: "StepFun 定价与限速",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "openai-official",
    name: "OpenAI API",
    type: "official",
    billingMode: "按量计费",
    url: "https://platform.openai.com/",
    pricingUrl: openAiPricingUrl,
    logoUrl: "/brand-icons/chatgpt.svg",
    description: "OpenAI 官方 API。用于 GPT 文本模型、GPT Image、Sora 等模型的官方按量价格和文档基准。",
    limitSummary: "GPT 文本模型按输入、缓存输入和输出计费；图片/视频生成另按模型、尺寸和时长计费，以 OpenAI 官方页面为准。",
    limitations: "ChatGPT Plus/Pro 等产品订阅不抵扣 API 费用；API 额度、速率和可用模型以 OpenAI Platform 控制台为准。",
    sourceLabel: "OpenAI API Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "anthropic-claude-api",
    name: "Anthropic Claude API",
    type: "official",
    billingMode: "按量计费",
    url: "https://console.anthropic.com/",
    pricingUrl: claudeApiPricingUrl,
    logoUrl: "/brand-icons/claude.svg",
    description: "Anthropic 官方 Claude API。用于 Claude Opus、Sonnet、Haiku 等模型的官方价格和 Console 计费基准。",
    limitSummary: "按输入和输出 tokens 计费；Prompt caching、batch、tool use 和速率限制以 Claude 文档与 Console 为准。",
    limitations: "Claude Pro/Max 产品订阅与 Console API 账单分开，不能把月订阅当作 API token 包。",
    sourceLabel: "Claude API Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-gemini-api",
    name: "Google Gemini API",
    type: "official",
    billingMode: "按量计费",
    url: "https://ai.google.dev/gemini-api",
    pricingUrl: geminiApiPricingUrl,
    logoUrl: "/brand-icons/gemini.svg",
    description: "Google Gemini 官方 API。用于 Gemini 文本/多模态、Nano Banana、Veo 等模型的官方来源和价格基准。",
    limitSummary: "免费层、付费层、批量价、速率限制和模型可用性以 Gemini API 文档、价格页和控制台为准。",
    limitations: "Google AI Plus/Pro/Ultra 是 Gemini App 产品订阅，不等同于 Gemini API token 包。",
    sourceLabel: "Google Gemini API Docs",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "chatgpt-official-subscription",
    name: "ChatGPT 官方订阅",
    type: "subscription",
    billingMode: "订阅套餐",
    url: chatGptPricingUrl,
    pricingUrl: chatGptPricingUrl,
    logoUrl: "/brand-icons/chatgpt.svg",
    description: "ChatGPT Free、Go、Plus、Pro 等官方产品订阅，额度按产品内消息、工具、模型和上下文窗口限制。",
    limitSummary: "Plus/Pro 等订阅提升 ChatGPT 产品内使用量和模型权限，但不抵扣 OpenAI API 账单。",
    limitations: "具体地区价格、可用计划、消息限制和工具额度以 ChatGPT Pricing 与产品内提示为准。",
    sourceLabel: "ChatGPT Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-official-subscription",
    name: "Claude 官方订阅",
    type: "subscription",
    billingMode: "订阅套餐",
    url: claudePricingUrl,
    pricingUrl: claudePricingUrl,
    logoUrl: "/brand-icons/claude.svg",
    description: "Claude Pro 与 Max 官方订阅，额度按产品内使用倍数、消息长度、附件和 5 小时窗口动态计算。",
    limitSummary: "Pro/Max 提升 Claude 产品内使用量；Console API 仍需单独开通并按量付费。",
    limitations: "产品订阅额度不是固定 token 包，实际可用量受模型、上下文、附件和系统负载影响。",
    sourceLabel: "Claude Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-ai-official-subscription",
    name: "Google AI 官方订阅",
    type: "subscription",
    billingMode: "订阅套餐",
    url: googleAiPlansUrl,
    pricingUrl: googleAiPlansUrl,
    logoUrl: "/brand-icons/gemini.svg",
    description: "Google AI Plus、Pro、Ultra 等 Gemini App 官方订阅，额度按产品内模型、工具和使用上限计算。",
    limitSummary: "Google AI 订阅提升 Gemini App、AI 工具和部分 Google 产品中的使用额度，不等同于 Gemini API 账单。",
    limitations: "地区价格、权益和使用限制会变化；具体额度以 Google AI Plans 与 Gemini App limits 页面为准。",
    sourceLabel: "Google AI Plans",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "byteplus-modelark",
    name: "BytePlus ModelArk",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.byteplus.com/en/product/modelark",
    pricingUrl: bytePlusSeedanceDocsUrl,
    logoUrl: "/brand-icons/volcengine.png",
    description: "BytePlus ModelArk 官方模型服务。当前用于定位 Seedance 2.0 视频生成模型的官方文档和价格基准。",
    limitSummary: "模型调用限制、地区和价格以 BytePlus ModelArk 官方文档与控制台为准。",
    limitations: "Seedance 相关价格和能力会随地区、模型版本和商业策略变化，当前先展示官方文档入口。",
    sourceLabel: "BytePlus ModelArk Docs",
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "kling-api",
    name: "Kling API",
    type: "official",
    billingMode: "按量计费",
    url: "https://klingai.com/",
    pricingUrl: klingVideoDocsUrl,
    logoUrl: "/brand-icons/kling.png",
    description: "Kling 官方视频生成 API。当前用于定位 Kling 2.5 Turbo 的官方模型文档和价格基准。",
    limitSummary: "模型调用、任务队列、分辨率和价格以 Kling 官方 API 文档与控制台为准。",
    limitations: "Kling 视频生成价格和模型版本可能调整，当前先展示官方 API 文档入口。",
    sourceLabel: "Kling API Docs",
    updatedAt: apiMediaModelUpdatedAt,
  },
  {
    id: "stepfun-step-plan",
    name: "StepFun Step Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    pricingUrl: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    logoUrl: "/brand-icons/stepfun.png",
    description: "阶跃星辰面向 Agent / Coding 场景的 Step Plan 套餐，按月购买 Prompt 与模型调用额度。",
    limitSummary: "Flash Mini/Plus/Pro/Max 分别约 100/400/1,500/5,000 prompts/5h，周限额约为 5 小时限额的 4 倍。",
    limitations: "套餐额度按 Step Plan 规则消耗，不等价于无限通用 API；可用模型和工具以官方页面为准。",
    sourceLabel: "Step Plan 概览",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "baidu-qianfan",
    name: "百度智能云千帆",
    type: "official",
    billingMode: "按量计费",
    url: "https://cloud.baidu.com/product-s/qianfan_home",
    pricingUrl: "https://cloud.baidu.com/doc/Qianfan/API.html",
    logoUrl: "/brand-icons/baiducloud.png",
    description: "百度千帆大模型平台，面向模型服务、Agent 开发和企业级应用，当前先作为官方 API 候选入口展示。",
    limitSummary: "价格和限速以千帆模型服务计费页、控制台和具体模型页为准。",
    limitations: "公开页面可确认平台和计费入口，但单模型输入/输出价格需要后续采集器解析。",
    sourceLabel: "百度千帆官网与文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "jdcloud-joyai",
    name: "京东云 JoyBuilder",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.jdcloud.com/cn/products/jdaip",
    pricingUrl: "https://docs.jdcloud.com/cn/jdaip/billing-overview",
    logoUrl: "/brand-icons/jdcloud.png",
    description: "京东云 JoyBuilder 模型开发平台，公开文档包含产品计费、模型服务价格及计费规则入口。",
    limitSummary: "具体模型价格、并发和部署口径以京东云 JoyBuilder 计费文档为准。",
    limitations: "当前只确认官方计费文档入口，尚未稳定解析到可对比的单模型 token 单价。",
    sourceLabel: "京东云 JoyBuilder 文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "unicom-yuanjing",
    name: "联通元景大模型",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.chinaunicom.cn/",
    pricingUrl: "https://www.chinaunicom.cn/",
    logoUrl: "/brand-icons/chinaunicom.png",
    description: "中国联通大模型相关公开入口，首版先作为官方候选渠道展示，等待补充稳定开发者文档和价格页。",
    limitSummary: "价格、模型列表和调用限制待解析，以联通官方公开页面或控制台为准。",
    limitations: "目前没有稳定可抓取的公开单模型价格，不能作为正式报价基准。",
    sourceLabel: "中国联通官网",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "huaweicloud-modelarts-maas",
    name: "华为云 ModelArts / MaaS",
    type: "official",
    billingMode: "按量计费",
    url: "https://www.huaweicloud.com/product/modelarts.html",
    pricingUrl: "https://activity.huaweicloud.com/maas-ds.html",
    logoUrl: "/brand-icons/huaweicloud.png",
    description: "华为云 ModelArts / MaaS 与 DeepSeek 专场入口，适合后续补充公开模型服务、Token 套餐和活动价。",
    limitSummary: "Token 套餐、限额和模型列表以华为云活动页、MaaS 页面和控制台为准。",
    limitations: "华为云页面存在访问挑战和动态内容，首版先展示官方入口，不硬填未校验单价。",
    sourceLabel: "华为云 ModelArts / MaaS",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "volcengine-ark-coding-plan",
    name: "火山方舟 Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.volcengine.com/activity/codingplan",
    pricingUrl: "https://www.volcengine.com/activity/codingplan",
    logoUrl: "/brand-icons/volcengine.png",
    description: "火山引擎方舟面向 AI Coding 的公开活动页，覆盖国产模型和多种编码工具。",
    limitSummary: "套餐价格、短周期请求窗口和模型覆盖依赖活动页动态内容，以官方页面为准。",
    limitations: "静态 HTML 无稳定价格表，已前台展示但标记为价格待解析。",
    sourceLabel: "火山方舟 Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "tencent-hunyuan-coding-plan",
    name: "腾讯云 TokenHub Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://cloud.tencent.com/product/tokenhub",
    pricingUrl: "https://cloud.tencent.com/document/product/1823/130092",
    logoUrl: "/brand-icons/tencentcloud.png",
    description: "腾讯云 TokenHub 面向 AI Coding 的订阅套餐，官方文档列出 Lite/Pro 价格、请求额度、支持模型和适配工具。",
    limitSummary: "Lite：1,200 req/5h、9,000 req/week、18,000 req/month；Pro：6,000 req/5h、45,000 req/week、90,000 req/month。",
    limitations: "请求次数是模型调用预估值，一次用户提问可能消耗多次请求；高峰时段可能触发限频。",
    sourceLabel: "腾讯云 TokenHub 官方文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ctyun-xirang",
    name: "天翼云息壤 Token 服务",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://ctxirang.ctyun.cn/home",
    pricingUrl: "https://www.ctyun.cn/act/AI/zhuanxiang",
    logoUrl: "/brand-icons/ctyun.png",
    description: "天翼云息壤智算与 Token 服务公开入口，官网菜单展示模型市场、服务接入和大模型特惠专区。",
    limitSummary: "活动页标注 Token Plan 轻享包低至 9.9 元起，具体模型额度和限制以天翼云页面为准。",
    limitations: "活动价和模型列表动态变化，首版只展示公开入口和可见活动口径。",
    sourceLabel: "天翼云息壤公开页面",
    updatedAt: apiModelUpdatedAt,
  },
];

export const apiPlans: ApiPlan[] = [
  {
    id: "chatgpt-plus",
    providerId: "chatgpt-official-subscription",
    providerName: "ChatGPT 官方订阅",
    name: "ChatGPT Plus",
    type: "subscription",
    priceLabel: "$20/月",
    priceUsdMonthly: 20,
    url: chatGptPricingUrl,
    quotaBadges: ["5h限额 25$", "周限额 120$", "月限额 450$"],
    quotaSummary: "5h限额 25$、周限额 120$、月限额 450$。起步档，能用网页和 Codex，适合轻量用户使用。",
    resetSummary: "按产品内额度窗口恢复，短周期与月度额度口径以官方产品提示为准。",
    limitSummary: "适合轻量 ChatGPT/Codex 日常使用；请勿开启 Fast；OpenAI API 仍需单独按量付费。",
    limitations: "地区价格、模型权益和使用上限会变化；不要把 Plus 当作可抵扣 API 账单的月费。",
    modelIds: ["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-image-2", "sora-2"],
    coverageLabel: "ChatGPT 产品内使用 GPT、图像、视频和工具能力，具体模型权限以官方 Pricing 和产品界面为准。",
    compatibility: ["官方订阅", "ChatGPT", "Codex", "产品内额度"],
    suitableTools: ["ChatGPT", "Codex"],
    sourceLabel: "ChatGPT Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "chatgpt-pro-5",
    providerId: "chatgpt-official-subscription",
    providerName: "ChatGPT 官方订阅",
    name: "ChatGPT Pro 5x",
    type: "subscription",
    priceLabel: "$100/月",
    priceUsdMonthly: 100,
    url: chatGptPricingUrl,
    quotaBadges: ["5h限额 150$", "周限额 800$", "月限额 3200$"],
    quotaSummary: "5h限额 150$、周限额 800$、月限额 3200$。适合单人重度用户，月度可用量参考口径约 3000 万左右。",
    resetSummary: "按产品内额度窗口恢复，短周期与月度额度口径以官方产品提示为准。",
    limitSummary: "适合重度 ChatGPT/Codex 个人使用；OpenAI 偶尔仍可能重置或限制使用。",
    limitations: "官方可能按地区和账号展示不同计划；产品订阅不抵扣 API 账单。",
    modelIds: ["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-image-2", "sora-2-pro", "sora-2"],
    coverageLabel: "ChatGPT 产品内更高使用额度，具体模型和工具权益以官方 Pricing 为准。",
    compatibility: ["官方订阅", "ChatGPT", "Codex", "产品内额度"],
    suitableTools: ["ChatGPT", "Codex"],
    sourceLabel: "ChatGPT Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "chatgpt-pro-20",
    providerId: "chatgpt-official-subscription",
    providerName: "ChatGPT 官方订阅",
    name: "ChatGPT Pro 20x",
    type: "subscription",
    priceLabel: "$200/月",
    priceUsdMonthly: 200,
    url: chatGptPricingUrl,
    quotaBadges: ["5h限额 300$", "周限额 2000$", "月限额 8000$"],
    quotaSummary: "5h限额 300$、周限额 2000$、月限额 8000$。适合 3-5 人拼车口径，月度可用量参考口径约 7000-8000 万左右。",
    resetSummary: "按产品内额度窗口恢复，短周期与月度额度口径以官方产品提示为准。",
    limitSummary: "适合最高频 ChatGPT/Codex 使用；拼车、封号和退款风险需要自行判断。",
    limitations: "官方可能按地区和账号展示不同计划；产品订阅不抵扣 API 账单。",
    modelIds: ["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-image-2", "sora-2-pro", "sora-2"],
    coverageLabel: "ChatGPT 产品内最高使用额度，具体模型和工具权益以官方 Pricing 为准。",
    compatibility: ["官方订阅", "ChatGPT", "Codex", "产品内额度"],
    suitableTools: ["ChatGPT", "Codex"],
    sourceLabel: "ChatGPT Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-pro",
    providerId: "claude-official-subscription",
    providerName: "Claude 官方订阅",
    name: "Claude Pro",
    type: "subscription",
    priceLabel: "$20/月",
    priceUsdMonthly: 20,
    url: claudePricingUrl,
    quotaBadges: ["5h限额 5$", "周限额 30$", "月限额 130$"],
    quotaSummary: "5h限额 5$、周限额 30$、月限额 130$。基本只适合轻量使用，尽量不使用 Opus。",
    resetSummary: "Claude 产品内使用额度按 5 小时窗口和账号规则动态恢复。",
    limitSummary: "适合轻中度 Claude 网页/App 使用；Claude Code 或 Console API 需要单独看限制和计费。",
    limitations: "Pro 不是固定 token 包，也不抵扣 Anthropic Console API 费用。",
    modelIds: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
    coverageLabel: "Claude 产品内模型使用额度，具体可用模型以 Claude Pricing 和产品界面为准。",
    compatibility: ["官方订阅", "Claude", "产品内额度"],
    suitableTools: ["Claude", "Claude Code"],
    sourceLabel: "Claude Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-max-5x",
    providerId: "claude-official-subscription",
    providerName: "Claude 官方订阅",
    name: "Claude Max 5x",
    type: "subscription",
    priceLabel: "$100/月",
    priceUsdMonthly: 100,
    url: claudePricingUrl,
    quotaBadges: ["5h限额 60$", "周限额 400$", "月限额 1300$"],
    quotaSummary: "5h限额 60$、周限额 400$、月限额 1300$。适合普通编程需求，每天约 1-2 小时左右。",
    resetSummary: "按 Claude 产品内 5 小时窗口和账号规则恢复。",
    limitSummary: "适合更高频 Claude / Claude Code 个人使用；Console API 单独计费。",
    limitations: "5x 是产品内使用量口径，不等同固定 API token 或固定请求数。",
    modelIds: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
    coverageLabel: "Claude Max 产品内高额度，适合重度交互式使用。",
    compatibility: ["官方订阅", "Claude", "Claude Code", "产品内额度"],
    suitableTools: ["Claude", "Claude Code"],
    sourceLabel: "Claude Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "claude-max-20x",
    providerId: "claude-official-subscription",
    providerName: "Claude 官方订阅",
    name: "Claude Max 20x",
    type: "subscription",
    priceLabel: "$200/月",
    priceUsdMonthly: 200,
    url: claudePricingUrl,
    quotaBadges: ["5h限额 150$", "周限额 800$", "月限额 3200$"],
    quotaSummary: "5h限额 150$、周限额 800$、月限额 3200$。适合高频编程需求，每天约 4-5 小时左右。",
    resetSummary: "按 Claude 产品内 5 小时窗口和账号规则恢复。",
    limitSummary: "适合高频 Claude / Claude Code 个人使用；自建服务仍应走 Console API。",
    limitations: "20x 是产品内使用量口径，不等同固定 API token 或固定请求数。",
    modelIds: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
    coverageLabel: "Claude Max 产品内最高额度，适合非常重的交互式工作流。",
    compatibility: ["官方订阅", "Claude", "Claude Code", "产品内额度"],
    suitableTools: ["Claude", "Claude Code"],
    sourceLabel: "Claude Pricing",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-ai-plus",
    providerId: "google-ai-official-subscription",
    providerName: "Google AI 官方订阅",
    name: "Google AI Plus",
    type: "subscription",
    priceLabel: "官方页按地区展示",
    url: googleAiPlansUrl,
    quotaBadges: ["约 2x 使用上限", "400GB 存储"],
    quotaSummary: "官方页标注 Gemini 使用上限约为非 AI 订阅用户 2x，并包含 400GB 存储。",
    resetSummary: "Gemini App、Flow、NotebookLM 等产品内额度按 Google 当前规则刷新。",
    limitSummary: "适合轻量 Gemini App 和 Google 产品内 AI 使用；Gemini API 仍按 API 价格计费。",
    limitations: "地区、语言、年龄和产品可用性有限制；不是固定 API token 包。",
    modelIds: ["gemini-3-1-pro-preview", "gemini-3-1-flash-lite", "gemini-3-flash-preview"],
    coverageLabel: "Google AI 产品内 Gemini、Flow、NotebookLM 等权益，具体以 Google AI Plans 为准。",
    compatibility: ["官方订阅", "Gemini", "产品内额度"],
    suitableTools: ["Gemini App", "NotebookLM", "Google Flow"],
    sourceLabel: "Google AI Plans",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-ai-pro",
    providerId: "google-ai-official-subscription",
    providerName: "Google AI 官方订阅",
    name: "Google AI Pro",
    type: "subscription",
    priceLabel: "官方页按地区展示",
    url: googleAiPlansUrl,
    quotaBadges: ["约 4x 使用上限", "5TB 存储", "$10 Cloud credits"],
    quotaSummary: "官方页标注 Gemini 使用上限约为非 AI 订阅用户 4x，并包含 5TB 存储和 Google Cloud credits。",
    resetSummary: "Gemini App、AI Studio、Flow、NotebookLM 等产品内额度按 Google 当前规则刷新。",
    limitSummary: "适合更高频 Gemini App、AI Studio 原型和 Google 产品内 AI 使用；API 仍单独按量计费。",
    limitations: "权益和可用区域会变化；AI Studio 使用也受 Google AI Studio 附加条款和限制约束。",
    modelIds: ["gemini-3-1-pro-preview", "gemini-3-1-flash-lite", "gemini-3-flash-preview"],
    coverageLabel: "Google AI Pro 产品内扩展额度，具体模型、工具和地区限制以官方页面为准。",
    compatibility: ["官方订阅", "Gemini", "AI Studio", "产品内额度"],
    suitableTools: ["Gemini App", "Google AI Studio", "NotebookLM", "Google Flow"],
    sourceLabel: "Google AI Plans",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-ai-ultra-5x",
    providerId: "google-ai-official-subscription",
    providerName: "Google AI 官方订阅",
    name: "Google AI Ultra 5x",
    type: "subscription",
    priceLabel: "官方页按地区展示",
    url: googleAiPlansUrl,
    quotaBadges: ["约 Pro 5x", "20TB 存储", "$40 Cloud credits"],
    quotaSummary: "官方页标注 Gemini 使用上限约为 Pro 计划 5x，并包含 20TB 存储和更高 Google 产品内额度。",
    resetSummary: "Gemini App、AI Studio、Flow、NotebookLM 等产品内额度按 Google 当前规则刷新。",
    limitSummary: "适合重度 Gemini 产品内使用；如果是后端/API 调用，仍应看 Gemini API 付费层价格。",
    limitations: "Ultra 权益、地区和具体额度会变化；不是固定 API token 包。",
    modelIds: ["gemini-3-1-pro-preview", "gemini-3-1-flash-lite", "gemini-3-flash-preview"],
    coverageLabel: "Google AI Ultra 产品内高额度，具体以 Google AI Plans 为准。",
    compatibility: ["官方订阅", "Gemini", "AI Studio", "产品内额度"],
    suitableTools: ["Gemini App", "Google AI Studio", "NotebookLM", "Google Flow"],
    sourceLabel: "Google AI Plans",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "google-ai-ultra-20x",
    providerId: "google-ai-official-subscription",
    providerName: "Google AI 官方订阅",
    name: "Google AI Ultra 20x",
    type: "subscription",
    priceLabel: "官方页按地区展示",
    url: googleAiPlansUrl,
    quotaBadges: ["约 Pro 20x", "30TB 存储", "$40 Cloud credits"],
    quotaSummary: "官方页列出 Ultra 20x 档位，Gemini 使用上限约为 Pro 计划 20x，并包含 30TB 存储和最高档产品内额度。",
    resetSummary: "Gemini App、AI Studio、Flow、NotebookLM 等产品内额度按 Google 当前规则刷新。",
    limitSummary: "适合最高频 Gemini 产品内使用；API 调用仍走 Gemini API 单独账单。",
    limitations: "20x 档位价格和可用性以 Google AI Plans/结账页为准，不换算为固定 API token。",
    modelIds: ["gemini-3-1-pro-preview", "gemini-3-1-flash-lite", "gemini-3-flash-preview"],
    coverageLabel: "Google AI Ultra 20x 产品内最高额度，具体以官方页面为准。",
    compatibility: ["官方订阅", "Gemini", "AI Studio", "产品内额度"],
    suitableTools: ["Gemini App", "Google AI Studio", "NotebookLM", "Google Flow"],
    sourceLabel: "Google AI Plans",
    updatedAt: apiOfficialPlatformUpdatedAt,
  },
  {
    id: "opencode-go-plan",
    providerId: "opencode-go",
    providerName: "OpenCode Go",
    name: "OpenCode Go",
    type: "subscription",
    priceLabel: "$5 首月，之后 $10/月",
    priceUsdMonthly: 10,
    url: OPENCODE_GO_REFERRAL_URL,
    quotaSummary: "5 小时 $12、每周 $30、每月 $60 的用量窗口。",
    resetSummary: "短周期额度按 OpenCode Go 规则滚动或周期刷新。",
    limitSummary: "$12/5h · $30/week · $60/month 用量窗口。",
    limitations: "适合 OpenCode/Codex/Cursor 等编码工具。请求数取决于具体模型成本。",
    modelIds: [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "qwen3-7-max",
      "qwen3-7-plus",
      "qwen3-6-plus",
      "kimi-k2-6",
      "kimi-k2-5",
      "glm-5-1",
      "glm-5",
      "minimax-m3",
      "minimax-m2-7",
      "minimax-m2-5",
    ],
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code"],
    sourceLabel: "OpenCode Go Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "opencode-zen-free",
    providerId: "opencode-zen",
    providerName: "OpenCode Zen",
    name: "OpenCode Zen Free / PAYG",
    type: "free",
    priceLabel: "部分模型限时免费，其余按量计费",
    url: "https://opencode.ai/zh/zen",
    quotaSummary: "Zen 当前提供若干限时 Free 模型，同时保留按 $/1M tokens 计费的精选模型。",
    resetSummary: "免费模型、可用模型和价格不定期更新，以 Zen 模型接口和文档为准。",
    limitSummary: "限时 Free 模型免费；付费模型按 Zen 当前价格表计费。",
    limitations: "免费模型可能用于收集反馈或产品改进，不适合提交个人、商业或机密数据。",
    modelIds: [
      "deepseek-v4-flash",
      "qwen3-7-max",
      "qwen3-7-plus",
      "qwen3-6-plus",
      "qwen3-5-plus",
      "kimi-k2-6",
      "kimi-k2-5",
      "glm-5-1",
      "glm-5",
      "minimax-m2-7",
      "minimax-m2-5",
      "mimo-v2-5",
    ],
    coverageLabel: "官方 Zen 文档当前列出 DeepSeek V4 Flash Free、MiMo-V2.5 Free、Nemotron 3 Ultra Free、Big Pickle 等限时免费模型。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "免费/测试", "中文模型"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code", "Open WebUI"],
    sourceLabel: "OpenCode Zen Docs",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "modelscope-api-inference-free",
    providerId: "modelscope-api-inference",
    providerName: "ModelScope API Inference / 魔搭社区",
    name: "ModelScope API-Inference 免费额度",
    type: "free",
    priceLabel: "免费额度内调用",
    url: "https://modelscope.cn/docs/model-service/API-Inference/limits",
    quotaSummary: "每日总免费调用约 2,000 次，单模型通常有独立上限，具体以 API 使用情况页为准。",
    resetSummary: "按自然日重置，超限后通常返回 429。",
    limitSummary: "每日约 2,000 次；单模型动态限流最高约 500 次。",
    limitations: "需要 ModelScope 账号和访问令牌，部分模型需要绑定阿里云账号；免费额度和模型覆盖会动态调整。",
    modelIds: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "glm-5-1",
      "glm-5",
      "kimi-k2-5",
      "minimax-m2-7",
      "minimax-m2-5",
      "step-3-7-flash",
    ],
    coverageLabel: "用户实测覆盖 DeepSeek V4 Pro/Flash、GLM-5.1/5、Kimi K2.5、MiniMax M2.7/M2.5、Step 3.7 Flash 等。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型", "前沿开源模型"],
    suitableTools: ["Codex", "Qwen Code", "OpenCode", "Open WebUI", "Cherry Studio"],
    sourceLabel: "ModelScope API-Inference 使用限制",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "alibaba-coding-plan-pro",
    providerId: "alibaba-coding-plan",
    providerName: "Alibaba Model Studio Coding Plan",
    name: "Coding Plan Pro",
    type: "subscription",
    priceLabel: "$50/月",
    priceUsdMonthly: 50,
    url: "https://www.alibabacloud.com/help/en/model-studio/coding-plan",
    quotaSummary: "6,000 requests/5 小时、45,000 requests/周、90,000 requests/月。",
    resetSummary: "5 小时额度滑动重置；周额度每周一 UTC+8 重置；月额度按订阅日重置。",
    limitSummary: "6,000 req/5h · 45,000 req/week · 90,000 req/month。",
    limitations: "只适合编码工具，官方不允许当成自动脚本或应用后端 API 使用。",
    modelIds: ["qwen3-5-plus", "qwen3-coder-plus", "kimi-k2-5", "glm-5", "minimax-m2-5"],
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    suitableTools: ["Codex", "Claude Code", "Cursor", "OpenCode", "Qwen Code"],
    sourceLabel: "Alibaba Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "minimax-token-plan",
    providerId: "minimax-official",
    providerName: "MiniMax API",
    name: "MiniMax Token Plan",
    type: "subscription",
    priceLabel: "$10/$20/$50 月付，另有高速版",
    priceUsdMonthly: 10,
    url: "https://platform.minimax.io/docs/guides/pricing-tokenplan",
    quotaSummary: "标准版按 M2.7 请求数计量：1,500、4,500、15,000 requests/5hrs。",
    resetSummary: "按 5 小时窗口限制请求数。",
    limitSummary: "1,500/4,500/15,000 requests/5hrs。",
    limitations: "Token Plan 主要覆盖 MiniMax 资源，不等于所有模型无限调用。",
    modelIds: ["minimax-m2-7"],
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    suitableTools: ["OpenCode", "Claude Code", "Cursor", "Open WebUI"],
    sourceLabel: "MiniMax Token Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "openrouter-free-plan",
    providerId: "openrouter",
    providerName: "OpenRouter",
    name: "OpenRouter Free Models",
    type: "free",
    priceLabel: "免费模型 50 req/day 起",
    url: "https://openrouter.ai/pricing",
    quotaSummary: "免费用户 50 req/day；购买至少 $10 credits 后免费模型可到 1000 req/day。",
    resetSummary: "免费额度按 OpenRouter 当前限制执行。",
    limitSummary: "50 req/day；充值后免费模型 1,000 req/day。",
    limitations: "只适合测试和低频使用，热门免费模型会受 provider 限流影响。",
    modelIds: [],
    coverageLabel: "25+ free models，具体模型以 OpenRouter 模型页为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
    suitableTools: ["Codex", "Cursor", "OpenCode", "Open WebUI"],
    sourceLabel: "OpenRouter Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "nvidia-nim-developer",
    providerId: "nvidia-nim",
    providerName: "NVIDIA NIM",
    name: "NIM Hosted API",
    type: "free",
    priceLabel: "开发测试免费访问",
    url: "https://www.nvidia.com/en-us/ai-data-science/products/nim-microservices/",
    quotaSummary: "面向开发、测试、原型和 NIM 自托管评估。",
    resetSummary: "限速、模型列表和额度以 NVIDIA API Catalog 为准。",
    limitSummary: "未公开固定 RPM/TPM，以 API Catalog 为准。",
    limitations: "不应默认作为生产 SLA；生产或私有化需要 NVIDIA AI Enterprise 等方案。",
    modelIds: ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5-1", "minimax-m2-7"],
    coverageLabel: "NIM catalog 动态模型列表，参考线索覆盖 DeepSeek、GLM、MiniMax 等开放模型。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
    suitableTools: ["Open WebUI", "自建应用", "原型验证"],
    sourceLabel: "NVIDIA NIM",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ollama-free",
    providerId: "ollama",
    providerName: "Ollama",
    name: "Ollama Free",
    type: "free",
    priceLabel: "免费，见官方 Pricing",
    url: "https://ollama.com/pricing",
    quotaSummary: "官方 Pricing 展示免费档，适合体验开放模型和轻量测试。",
    resetSummary: "免费额度和重置规则以 Ollama Pricing 为准。",
    limitSummary: "以 Ollama Pricing 当前限制为准。",
    limitations: "免费档不适合作为稳定生产 SLA；模型列表和并发限制可能变化。",
    modelIds: ["qwen3-5-plus", "minimax-m2-7"],
    coverageLabel: "参考 awesome-coding-plan 线索，覆盖 Qwen、MiniMax、GLM 等开放模型；本地标准模型先映射已收录项。",
    compatibility: ["免费/测试", "中文模型", "开放模型"],
    suitableTools: ["Open WebUI", "自建应用", "原型验证"],
    sourceLabel: "Ollama Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ollama-pro",
    providerId: "ollama",
    providerName: "Ollama",
    name: "Ollama Pro",
    type: "subscription",
    priceLabel: "$20/月，见官方 Pricing",
    priceUsdMonthly: 20,
    url: "https://ollama.com/pricing",
    quotaSummary: "Pro 档位额度、并发和模型覆盖以 Ollama 官方 Pricing 为准。",
    resetSummary: "按 Ollama 订阅周期和官方额度规则执行。",
    limitSummary: "以 Ollama Pricing 当前限制为准。",
    limitations: "适合比免费档更稳定的开放模型调用，但仍需关注官方模型列表和限流变化。",
    modelIds: ["qwen3-5-plus", "minimax-m2-7"],
    coverageLabel: "Ollama Pro 官方订阅档位。",
    compatibility: ["订阅套餐", "中文模型", "开放模型"],
    suitableTools: ["Open WebUI", "自建应用", "原型验证"],
    sourceLabel: "Ollama Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-code-andante",
    providerId: "kimi-code",
    providerName: "Kimi Code",
    name: "Kimi Code Andante",
    type: "subscription",
    priceLabel: "49 元/月",
    priceCnyMonthly: 49,
    url: "https://www.kimi.com/membership/pricing",
    quotaSummary: "Kimi Code 低价会员档，具体额度以 Kimi 官方会员页为准。",
    resetSummary: "按 Kimi 会员订阅周期和官方额度规则执行。",
    limitSummary: "Kimi Code 调用额度以官方会员页为准。",
    limitations: "低价档适合轻量体验，参考项目指出性价比和高峰可用性需要谨慎评估。",
    modelIds: ["kimi-k2-5"],
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Kimi Code", "Cursor", "OpenCode"],
    sourceLabel: "Kimi Membership Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "kimi-code-allegretto",
    providerId: "kimi-code",
    providerName: "Kimi Code",
    name: "Kimi Code Allegretto",
    type: "subscription",
    priceLabel: "199 元/月",
    priceCnyMonthly: 199,
    url: "https://www.kimi.com/membership/pricing",
    quotaSummary: "Kimi Code 高档会员，官方页面展示更高编码额度。",
    resetSummary: "按 Kimi 会员订阅周期和官方额度规则执行。",
    limitSummary: "Kimi Code 调用额度以官方会员页为准。",
    limitations: "适合团队或高频编码使用，真实可用性需持续结合用户反馈更新。",
    modelIds: ["kimi-k2-5"],
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Kimi Code", "Cursor", "OpenCode"],
    sourceLabel: "Kimi Membership Pricing",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "glm-coding-plan-lite",
    providerId: "glm-coding-plan",
    providerName: "GLM Coding Plan",
    name: "Coding Plan Lite",
    type: "subscription",
    priceLabel: "49 元/月",
    priceCnyMonthly: 49,
    url: "https://www.bigmodel.cn/glm-coding?ic=93SRY3UUUI",
    quotaSummary: "GLM Coding Plan Lite，额度和短周期限制以智谱官方页面为准。",
    resetSummary: "按 GLM Coding Plan 官方额度窗口执行。",
    limitSummary: "Lite 档额度以官方页面为准。",
    limitations: "参考项目指出可能存在抢购、限频和算力紧张，首版仅展示官方入口与套餐口径。",
    modelIds: ["glm-5-1", "glm-5"],
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Claude Code", "Cursor", "OpenCode", "Codex"],
    sourceLabel: "GLM Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "glm-coding-plan-pro",
    providerId: "glm-coding-plan",
    providerName: "GLM Coding Plan",
    name: "Coding Plan Pro",
    type: "subscription",
    priceLabel: "149 元/月",
    priceCnyMonthly: 149,
    url: "https://www.bigmodel.cn/glm-coding?ic=93SRY3UUUI",
    quotaSummary: "GLM Coding Plan Pro，额度和短周期限制以智谱官方页面为准。",
    resetSummary: "按 GLM Coding Plan 官方额度窗口执行。",
    limitSummary: "Pro 档额度以官方页面为准。",
    limitations: "参考项目指出可能存在抢购、限频和算力紧张，首版仅展示官方入口与套餐口径。",
    modelIds: ["glm-5-1", "glm-5"],
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Claude Code", "Cursor", "OpenCode", "Codex"],
    sourceLabel: "GLM Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "fireworks-fire-pass-kimi",
    providerId: "fireworks-fire-pass",
    providerName: "Fireworks Fire Pass",
    name: "Fire Pass",
    type: "subscription",
    priceLabel: "$7/周，见 Fire Pass 页面",
    priceUsdMonthly: 28,
    url: "https://app.fireworks.ai/fire-pass",
    quotaSummary: "Fire Pass 页面展示周付套餐，当前作为 Kimi K2.6 Turbo 等模型的套餐入口。",
    resetSummary: "按 Fireworks Fire Pass 官方规则执行。",
    limitSummary: "速率限制和模型覆盖以 Fire Pass 页面为准。",
    limitations: "套餐覆盖和 no per-token charges 口径可能变化，首版不折算等效 token 单价。",
    modelIds: ["kimi-k2-6"],
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Open WebUI", "自建应用", "Cursor", "OpenCode"],
    sourceLabel: "Fireworks Fire Pass",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "xiaomi-mimo-token-plan",
    providerId: "xiaomi-mimo",
    providerName: "Xiaomi MiMo API",
    name: "Xiaomi MiMo Token Plan",
    type: "subscription",
    priceLabel: "见官方 Token Plan",
    url: "https://mimo.mi.com/",
    quotaSummary: "官方首页标注 Token Plan 支持包月/包年订阅，覆盖 MiMo V2.5 系列。",
    resetSummary: "额度和续订规则以 MiMo 官方 Token Plan 页面为准。",
    limitSummary: "未公开固定 RPM/TPM，以 MiMo 控制台和 Token Plan 规则为准。",
    limitations: "首版不硬填不可校验价格，等待后续结构化解析。",
    modelIds: ["mimo-v2-5-pro", "mimo-v2-5"],
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "多模态"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code", "Open WebUI"],
    sourceLabel: "Xiaomi MiMo Home",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "stepfun-step-plan-mini",
    providerId: "stepfun-step-plan",
    providerName: "StepFun Step Plan",
    name: "Flash Mini",
    type: "subscription",
    priceLabel: "49 元/月",
    priceCnyMonthly: 49,
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    quotaSummary: "约 100 prompts/5 小时，约 400 prompts/周，官方约等于 1,500 次模型调用/5 小时、6,000 次模型调用/周。",
    resetSummary: "5 小时窗口和周额度按 Step Plan 官方规则刷新。",
    limitSummary: "100 prompts/5h · 400 prompts/week。",
    limitations: "入门档适合轻量 Agent / Coding 体验；Prompt 到模型调用次数为官方估算，不等于固定 token 额度。",
    modelIds: ["step-3-7-flash"],
    coverageLabel: "Step Plan 官方页面展示 OpenClaw、Claude Code 等工具入口；模型路由和实际可用模型以官方页面为准。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "Claude Code", "OpenCode", "Cursor"],
    sourceLabel: "Step Plan 概览",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "stepfun-step-plan-plus",
    providerId: "stepfun-step-plan",
    providerName: "StepFun Step Plan",
    name: "Flash Plus",
    type: "subscription",
    priceLabel: "99 元/月",
    priceCnyMonthly: 99,
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    quotaSummary: "约 400 prompts/5 小时，约 1,600 prompts/周，官方约等于 6,000 次模型调用/5 小时、24,000 次模型调用/周。",
    resetSummary: "5 小时窗口和周额度按 Step Plan 官方规则刷新。",
    limitSummary: "400 prompts/5h · 1,600 prompts/week。",
    limitations: "适合中频编码使用；Prompt 到模型调用次数为官方估算，真实消耗取决于任务。",
    modelIds: ["step-3-7-flash"],
    coverageLabel: "Step Plan 官方页面展示 OpenClaw、Claude Code 等工具入口；模型路由和实际可用模型以官方页面为准。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "Claude Code", "OpenCode", "Cursor"],
    sourceLabel: "Step Plan 概览",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "stepfun-step-plan-pro",
    providerId: "stepfun-step-plan",
    providerName: "StepFun Step Plan",
    name: "Flash Pro",
    type: "subscription",
    priceLabel: "199 元/月",
    priceCnyMonthly: 199,
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    quotaSummary: "约 1,500 prompts/5 小时，约 6,000 prompts/周，官方约等于 22,500 次模型调用/5 小时、90,000 次模型调用/周。",
    resetSummary: "5 小时窗口和周额度按 Step Plan 官方规则刷新。",
    limitSummary: "1,500 prompts/5h · 6,000 prompts/week。",
    limitations: "适合高频编码和较复杂 Agent 工作流；Prompt 到模型调用次数为官方估算。",
    modelIds: ["step-3-7-flash"],
    coverageLabel: "Step Plan 官方页面展示 OpenClaw、Claude Code 等工具入口；模型路由和实际可用模型以官方页面为准。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "Claude Code", "OpenCode", "Cursor"],
    sourceLabel: "Step Plan 概览",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "stepfun-step-plan-max",
    providerId: "stepfun-step-plan",
    providerName: "StepFun Step Plan",
    name: "Flash Max",
    type: "subscription",
    priceLabel: "699 元/月",
    priceCnyMonthly: 699,
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview",
    quotaSummary: "约 5,000 prompts/5 小时，约 20,000 prompts/周，官方约等于 75,000 次模型调用/5 小时、300,000 次模型调用/周。",
    resetSummary: "5 小时窗口和周额度按 Step Plan 官方规则刷新。",
    limitSummary: "5,000 prompts/5h · 20,000 prompts/week。",
    limitations: "旗舰档适合更高频 Agent / Coding 使用；仍受 Step Plan 额度、工具和模型规则约束。",
    modelIds: ["step-3-7-flash"],
    coverageLabel: "Step Plan 官方页面展示 OpenClaw、Claude Code 等工具入口；模型路由和实际可用模型以官方页面为准。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "Claude Code", "OpenCode", "Cursor"],
    sourceLabel: "Step Plan 概览",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "baidu-qianfan-official-pricing",
    providerId: "baidu-qianfan",
    providerName: "百度智能云千帆",
    name: "千帆模型服务计费",
    type: "official",
    priceLabel: "价格待解析，见官方计费页",
    url: "https://cloud.baidu.com/doc/Qianfan/API.html",
    quotaSummary: "公开文档包含模型服务计费、Token 计算说明和新用户代金券说明。",
    resetSummary: "额度、赠金和限流以千帆控制台及具体模型服务页面为准。",
    limitSummary: "未公开统一 RPM/TPM，按模型和账号控制台规则执行。",
    limitations: "首版未解析单模型输入/输出价格，先以前台候选渠道展示。",
    modelIds: [],
    coverageLabel: "千帆模型服务、Agent 开发和 DeepSeek-V4 预览版 API 服务。",
    compatibility: ["官方 API", "企业云", "中文模型"],
    suitableTools: ["自建应用", "Open WebUI", "Chatbox"],
    sourceLabel: "百度千帆官网与文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "jdcloud-joybuilder-pricing",
    providerId: "jdcloud-joyai",
    providerName: "京东云 JoyBuilder",
    name: "JoyBuilder 模型服务计费",
    type: "official",
    priceLabel: "价格待解析，见官方计费文档",
    url: "https://docs.jdcloud.com/cn/jdaip/billing-overview",
    quotaSummary: "官方文档存在产品计费、模型服务价格及计费规则、模型精调 token 计费入口。",
    resetSummary: "按京东云账号、模型服务和部署方式执行。",
    limitSummary: "模型调用限制和部署限制以 JoyBuilder 文档与控制台为准。",
    limitations: "当前未提取到稳定单模型价格，先展示官方计费入口。",
    modelIds: [],
    coverageLabel: "JoyBuilder 模型开发平台、模型服务、模型精调与部署能力。",
    compatibility: ["官方 API", "企业云", "模型部署"],
    suitableTools: ["自建应用", "企业控制台"],
    sourceLabel: "京东云 JoyBuilder 文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "unicom-yuanjing-official",
    providerId: "unicom-yuanjing",
    providerName: "联通元景大模型",
    name: "联通元景候选入口",
    type: "official",
    priceLabel: "价格待解析，待补官方价格页",
    url: "https://www.chinaunicom.cn/",
    quotaSummary: "当前仅保留中国联通官方公开入口，等待后续补充元景开发者文档和价格页。",
    resetSummary: "待官方开发者入口确认。",
    limitSummary: "待解析。",
    limitations: "没有稳定公开价格页前，不作为正式模型报价。",
    modelIds: [],
    coverageLabel: "联通大模型相关候选渠道。",
    compatibility: ["官方候选", "企业云"],
    suitableTools: ["待确认"],
    sourceLabel: "中国联通官网",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "huaweicloud-maas-token-package",
    providerId: "huaweicloud-modelarts-maas",
    providerName: "华为云 ModelArts / MaaS",
    name: "MaaS Token 套餐包",
    type: "official",
    priceLabel: "见华为云 MaaS / DeepSeek 活动页",
    url: "https://activity.huaweicloud.com/maas-ds.html",
    quotaSummary: "公开活动页强调 Tokens 套餐包、AI 智能体免费体验和热门模型一键调用。",
    resetSummary: "Token 套餐包、活动周期和额度以华为云页面及控制台为准。",
    limitSummary: "未公开统一 RPM/TPM，按华为云 MaaS 控制台规则执行。",
    limitations: "页面存在访问挑战和动态内容，结构化价格待后续解析。",
    modelIds: ["deepseek-v4-flash"],
    coverageLabel: "DeepSeek 应用专场、Tokens 套餐包和 ModelArts/MaaS 模型服务。",
    compatibility: ["官方 API", "企业云", "中文模型"],
    suitableTools: ["自建应用", "企业控制台"],
    sourceLabel: "华为云 ModelArts / MaaS",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "volcengine-ark-coding-plan-official",
    providerId: "volcengine-ark-coding-plan",
    providerName: "火山方舟 Coding Plan",
    name: "方舟 Coding Plan",
    type: "subscription",
    priceLabel: "价格待解析，见官方活动页",
    url: "https://www.volcengine.com/activity/codingplan",
    quotaSummary: "官方活动页公开 Coding Plan 入口，覆盖 DeepSeek、GLM、MiniMax、Kimi 等模型和多种编码工具。",
    resetSummary: "套餐额度、刷新周期和活动规则以火山方舟页面为准。",
    limitSummary: "价格和请求窗口待解析。",
    limitations: "静态页面没有稳定价格表，当前不硬填数值。",
    modelIds: ["deepseek-v4-flash", "glm-5", "kimi-k2-5", "minimax-m2-5"],
    coverageLabel: "DeepSeek、GLM、MiniMax、Kimi、Doubao 等 Coding Plan 模型。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["Claude Code", "Cursor", "Cline", "OpenCode"],
    sourceLabel: "火山方舟 Coding Plan",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "tencent-tokenhub-lite",
    providerId: "tencent-hunyuan-coding-plan",
    providerName: "腾讯云 TokenHub Coding Plan",
    name: "Coding Plan Lite",
    type: "subscription",
    priceLabel: "40 元/月",
    priceCnyMonthly: 40,
    url: "https://cloud.tencent.com/document/product/1823/130092",
    quotaSummary: "1,200 requests/5 小时、9,000 requests/周、18,000 requests/月。",
    resetSummary: "5 小时、周、订阅月额度按腾讯云 Coding Plan 规则刷新。",
    limitSummary: "1,200 req/5h · 9,000 req/week · 18,000 req/month。",
    limitations: "请求次数为模型调用预估值，一次用户提问可能触发多次模型调用。",
    modelIds: ["glm-5", "kimi-k2-5", "minimax-m2-5"],
    coverageLabel: "Tencent HY 2.0 Instruct、GLM-5、Kimi-K2.5、MiniMax-M2.5。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "CodeBuddy", "Claude Code", "Cline", "Cursor", "OpenCode", "Codex", "Kilo CLI"],
    sourceLabel: "腾讯云 TokenHub 官方文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "tencent-tokenhub-pro",
    providerId: "tencent-hunyuan-coding-plan",
    providerName: "腾讯云 TokenHub Coding Plan",
    name: "Coding Plan Pro",
    type: "subscription",
    priceLabel: "200 元/月",
    priceCnyMonthly: 200,
    url: "https://cloud.tencent.com/document/product/1823/130092",
    quotaSummary: "6,000 requests/5 小时、45,000 requests/周、90,000 requests/月。",
    resetSummary: "5 小时、周、订阅月额度按腾讯云 Coding Plan 规则刷新。",
    limitSummary: "6,000 req/5h · 45,000 req/week · 90,000 req/month。",
    limitations: "请求次数为模型调用预估值，高峰期可能触发限频。",
    modelIds: ["glm-5", "kimi-k2-5", "minimax-m2-5"],
    coverageLabel: "Tencent HY 2.0 Instruct、GLM-5、Kimi-K2.5、MiniMax-M2.5。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["OpenClaw", "CodeBuddy", "Claude Code", "Cline", "Cursor", "OpenCode", "Codex", "Kilo CLI"],
    sourceLabel: "腾讯云 TokenHub 官方文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "ctyun-xirang-token-plan",
    providerId: "ctyun-xirang",
    providerName: "天翼云息壤 Token 服务",
    name: "Token Plan 轻享包",
    type: "subscription",
    priceLabel: "9.9 元起，见活动页",
    priceCnyMonthly: 9.9,
    url: "https://www.ctyun.cn/act/AI/zhuanxiang",
    quotaSummary: "天翼云公开页面标注大模型特惠专区 Token Plan 轻享包低至 9.9 元起。",
    resetSummary: "活动周期、模型额度和续费规则以天翼云页面为准。",
    limitSummary: "Token 服务限制和服务接入规则以息壤控制台为准。",
    limitations: "活动价不是统一模型单价，需后续解析具体模型额度。",
    modelIds: ["deepseek-v4-flash", "glm-5-1"],
    coverageLabel: "官网菜单公开展示 DeepSeek-V4-Flash、GLM-5.1、Qwen3.5-122B-A10B、DeepSeek-V3.2、GLM-5 等模型入口。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    suitableTools: ["自建应用", "Open WebUI", "企业控制台"],
    sourceLabel: "天翼云息壤公开页面",
    updatedAt: apiModelUpdatedAt,
  },
];

export const apiModelOffers: ApiModelOffer[] = [
  offer("openai-gpt-5-5", "gpt-5-5", "openai-official", {
    routeModelId: "gpt-5.5",
    inputPrice: usd(5),
    outputPrice: usd(30),
    cacheReadPrice: usd(0.5),
    freeOrPlan: "OpenAI 官方 API 标准按量计费，ChatGPT 订阅不抵扣 API 用量。",
    limitations: "结构化价格取官方标准层 <272K context length 档；Priority、Flex、Batch、地区处理和长上下文可能有不同价格。",
    limitSummary: "按输入、缓存输入和输出 tokens 分别计费；额度与速率以 OpenAI Platform 控制台为准。",
    compatibility: ["OpenAI-compatible", "官方 API", "Coding Agent", "英文模型"],
    sourceLabel: "OpenAI API Pricing",
    pricingUrl: openAiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("openai-gpt-5-4", "gpt-5-4", "openai-official", {
    routeModelId: "gpt-5.4",
    inputPrice: usd(2.5),
    outputPrice: usd(15),
    cacheReadPrice: usd(0.25),
    freeOrPlan: "OpenAI 官方 API 标准按量计费，适合作为 ChatGPT/Codex 之外的后端成本基准。",
    limitations: "结构化价格取官方标准层 <272K context length 档；长上下文、Batch、Flex 和 Priority 需看官方价格页。",
    limitSummary: "按输入、缓存输入和输出 tokens 分别计费；额度与速率以 OpenAI Platform 控制台为准。",
    compatibility: ["OpenAI-compatible", "官方 API", "Coding Agent", "英文模型"],
    sourceLabel: "OpenAI API Pricing",
    pricingUrl: openAiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("openai-gpt-5-4-mini", "gpt-5-4-mini", "openai-official", {
    routeModelId: "gpt-5.4-mini",
    inputPrice: usd(0.75),
    outputPrice: usd(4.5),
    cacheReadPrice: usd(0.075),
    freeOrPlan: "OpenAI 官方 API 标准按量计费，适合低成本 Agent 子任务和批量处理。",
    limitations: "结构化价格取官方标准层 <272K context length 档；实际账单以 OpenAI Usage/控制台为准。",
    limitSummary: "按输入、缓存输入和输出 tokens 分别计费；缓存输入价格低于普通输入。",
    compatibility: ["OpenAI-compatible", "官方 API", "Coding Agent"],
    sourceLabel: "OpenAI API Pricing",
    pricingUrl: openAiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("openai-gpt-5-4-nano", "gpt-5-4-nano", "openai-official", {
    routeModelId: "gpt-5.4-nano",
    inputPrice: usd(0.2),
    outputPrice: usd(1.25),
    cacheReadPrice: usd(0.02),
    freeOrPlan: "OpenAI 官方 API 标准按量计费，适合高频低风险自动化。",
    limitations: "结构化价格取官方标准层 <272K context length 档；复杂推理和长输出任务不一定适合 Nano 档。",
    limitSummary: "按输入、缓存输入和输出 tokens 分别计费；适合把成本敏感步骤拆出来。",
    compatibility: ["OpenAI-compatible", "官方 API", "批量处理"],
    sourceLabel: "OpenAI API Pricing",
    pricingUrl: openAiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("anthropic-claude-opus-48", "claude-opus-4-8", "anthropic-claude-api", {
    routeModelId: "claude-opus-4-8",
    inputPrice: usd(5),
    outputPrice: usd(25),
    cacheReadPrice: textPrice("Prompt caching 价格以 Claude pricing 页为准"),
    freeOrPlan: "Anthropic 官方 Console API 按量计费，与 Claude Pro/Max 订阅分开。",
    limitations: "Prompt caching、Batch、tool use、速率限制和具体模型可用性以 Claude 官方文档与 Console 为准。",
    limitSummary: "按输入和输出 tokens 计费；适合复杂推理、重代码任务和高价值 Agent。",
    compatibility: ["Anthropic-compatible", "官方 API", "Coding Agent", "Claude Code"],
    sourceLabel: "Claude API Pricing",
    pricingUrl: claudeApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("anthropic-claude-sonnet-5", "claude-sonnet-5", "anthropic-claude-api", {
    routeModelId: "claude-sonnet-5",
    inputPrice: usd(3),
    outputPrice: usd(15),
    cacheReadPrice: textPrice("Prompt caching 价格以 Claude pricing 页为准"),
    freeOrPlan: "Anthropic 官方 Console API 按量计费；官方页标注 2026-08-31 前 Sonnet 5 有 $2/$10 限时价。",
    limitations: "结构化主价使用常规价格；限时促销、缓存、Batch 和速率限制以 Claude 官方价格页为准。",
    limitSummary: "按输入和输出 tokens 计费；适合 Claude Code、长上下文代码阅读和日常 Agent。",
    compatibility: ["Anthropic-compatible", "官方 API", "Coding Agent", "Claude Code"],
    sourceLabel: "Claude API Pricing",
    pricingUrl: claudeApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("anthropic-claude-haiku-45", "claude-haiku-4-5", "anthropic-claude-api", {
    routeModelId: "claude-haiku-4-5",
    inputPrice: usd(1),
    outputPrice: usd(5),
    cacheReadPrice: textPrice("Prompt caching 价格以 Claude pricing 页为准"),
    freeOrPlan: "Anthropic 官方 Console API 按量计费，适合轻量任务和低延迟调用。",
    limitations: "Haiku 价格、可用性和速率以 Claude 官方价格页和 Console 为准。",
    limitSummary: "按输入和输出 tokens 计费；适合抽取、分类、改写和工具调用前置判断。",
    compatibility: ["Anthropic-compatible", "官方 API", "Coding Agent"],
    sourceLabel: "Claude API Pricing",
    pricingUrl: claudeApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("google-gemini-31-pro-preview", "gemini-3-1-pro-preview", "google-gemini-api", {
    routeModelId: "gemini-3.1-pro-preview",
    inputPrice: usd(2),
    outputPrice: usd(12),
    cacheReadPrice: textPrice("缓存和批量价以 Gemini API Pricing 为准"),
    freeOrPlan: "Gemini API 付费层按量计费；Google AI 订阅不抵扣 API 账单。",
    limitations: "结构化价格取官方 <=200K tokens 价格档；>200K tokens、Batch、缓存和预览状态以官方价格页为准。",
    limitSummary: "适合长上下文、多模态和复杂推理；免费层/付费层速率限制以 Gemini API 控制台为准。",
    compatibility: ["Gemini API", "官方 API", "多模态", "Coding Agent"],
    sourceLabel: "Gemini API Pricing",
    pricingUrl: geminiApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("google-gemini-31-flash-lite", "gemini-3-1-flash-lite", "google-gemini-api", {
    routeModelId: "gemini-3.1-flash-lite",
    inputPrice: usd(0.25),
    outputPrice: usd(1.5),
    cacheReadPrice: textPrice("缓存和批量价以 Gemini API Pricing 为准"),
    freeOrPlan: "Gemini API 付费层按量计费，适合成本敏感的多模态轻任务。",
    limitations: "免费层、付费层、缓存、Batch 和速率限制以 Gemini API Pricing 和控制台为准。",
    limitSummary: "低成本高速模型，适合批量抽取、分类、多模态轻处理和非关键路径 Agent。",
    compatibility: ["Gemini API", "官方 API", "多模态"],
    sourceLabel: "Gemini API Pricing",
    pricingUrl: geminiApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("google-gemini-3-flash-preview", "gemini-3-flash-preview", "google-gemini-api", {
    routeModelId: "gemini-3-flash-preview",
    inputPrice: textPrice("见 Gemini API Pricing"),
    outputPrice: textPrice("见 Gemini API Pricing"),
    cacheReadPrice: textPrice("缓存和批量价以 Gemini API Pricing 为准"),
    freeOrPlan: "Gemini API 预览模型，价格和可用性以官方价格页为准。",
    limitations: "预览模型的价格、限速和可用区域可能快速变化，当前不硬填不可稳定核验的等效单价。",
    limitSummary: "适合速度优先的多模态和日常 Agent 场景；生产前需要再次核验价格页。",
    compatibility: ["Gemini API", "官方 API", "多模态", "预览模型"],
    sourceLabel: "Gemini API Pricing",
    pricingUrl: geminiApiPricingUrl,
    updatedAt: apiOfficialPlatformUpdatedAt,
  }),
  offer("deepseek-official-flash", "deepseek-v4-flash", "deepseek-official", {
    routeModelId: "deepseek-v4-flash",
    inputPrice: usd(0.14),
    outputPrice: usd(0.28),
    cacheReadPrice: usd(0.0028),
    freeOrPlan: "官方按量计费，余额抵扣。",
    limitations: "高频低成本优先，旧 deepseek-chat/reasoner 兼容名会在 2026-07-24 后废弃。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
  }),
  offer("deepseek-official-pro", "deepseek-v4-pro", "deepseek-official", {
    routeModelId: "deepseek-v4-pro",
    inputPrice: usd(0.435),
    outputPrice: usd(0.87),
    cacheReadPrice: usd(0.003625),
    freeOrPlan: "官方按量计费，余额抵扣。",
    limitations: "能力更强但并发较低，适合复杂推理或高失败成本任务。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
  }),
  offer("qwen-official-qwen37-max", "qwen3-7-max", "qwen-official", {
    routeModelId: "qwen3.7-max",
    inputPrice: cny(12),
    outputPrice: cny(36),
    cacheReadPrice: textPrice("上下文缓存享有折扣，具体折扣以百炼价格页为准"),
    freeOrPlan: "阿里云百炼官方按量计费。",
    limitations: "官方价格页按模型和部署范围展示；Batch 调用和缓存折扣需看百炼当前规则。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("qwen-official-qwen37-plus", "qwen3-7-plus", "qwen-official", {
    routeModelId: "qwen3.7-plus",
    inputPrice: cny(2),
    outputPrice: cny(8),
    cacheReadPrice: textPrice("上下文缓存享有折扣，具体折扣以百炼价格页为准"),
    freeOrPlan: "阿里云百炼官方按量计费。",
    limitations: "当前结构化价格取 0-256K 档；256K-1M 档为输入 ¥6/M、输出 ¥24/M。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("qwen-official-qwen36-plus", "qwen3-6-plus", "qwen-official", {
    routeModelId: "qwen3.6-plus",
    inputPrice: cny(2),
    outputPrice: cny(12),
    cacheReadPrice: textPrice("上下文缓存享有折扣，具体折扣以百炼价格页为准"),
    freeOrPlan: "阿里云百炼官方按量计费。",
    limitations: "当前结构化价格取 0-256K 档；256K-1M 档为输入 ¥8/M、输出 ¥48/M。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("qwen-official-qwen35-plus", "qwen3-5-plus", "qwen-official", {
    routeModelId: "qwen3.5-plus",
    inputPrice: cny(0.8),
    outputPrice: cny(4.8),
    cacheReadPrice: textPrice("上下文缓存享有折扣，具体折扣以百炼价格页为准"),
    freeOrPlan: "阿里云百炼官方按量计费。",
    limitations: "当前结构化价格取 0-128K 档；128K-256K 为 ¥2/¥12，256K-1M 为 ¥4/¥24。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "视觉"],
  }),
  offer("qwen-official-qwen3-coder-plus", "qwen3-coder-plus", "qwen-official", {
    routeModelId: "qwen3-coder-plus",
    inputPrice: cny(4),
    outputPrice: cny(16),
    cacheReadPrice: textPrice("上下文缓存享有折扣，具体折扣以百炼价格页为准"),
    freeOrPlan: "阿里云百炼官方按量计费。",
    limitations: "当前结构化价格取 0-32K 档；32K-128K 为 ¥6/¥24，128K-256K 为 ¥10/¥40，256K-1M 为 ¥20/¥200。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("kimi-official-k26", "kimi-k2-6", "kimi-official", {
    routeModelId: "kimi-k2.6",
    inputPrice: cny(6.5),
    outputPrice: cny(27),
    cacheReadPrice: cny(1.1),
    freeOrPlan: "官方按 token 计费，联网搜索另计费。",
    limitations: "Chrome 动态页核验：kimi-k2.6 为缓存命中 ¥1.10/M、输入 ¥6.50/M、输出 ¥27.00/M，上下文 262,144 tokens。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("kimi-official-k25", "kimi-k2-5", "kimi-official", {
    routeModelId: "kimi-k2.5",
    inputPrice: cny(4),
    outputPrice: cny(21),
    cacheReadPrice: cny(0.7),
    freeOrPlan: "官方按 token 计费，联网搜索另计费。",
    limitations: "Chrome 动态页核验：kimi-k2.5 为缓存命中 ¥0.70/M、输入 ¥4.00/M、输出 ¥21.00/M，上下文 262,144 tokens。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("zhipu-glm51-docs", "glm-5-1", "zhipu-bigmodel", {
    routeModelId: "glm-5.1",
    inputPrice: cny(6),
    outputPrice: cny(24),
    cacheReadPrice: cny(1.3),
    freeOrPlan: "智谱官方按 token 计费。",
    limitations: "结构化价格取 0-32K 档；32K 以上为输入 ¥8/M、输出 ¥28/M、缓存命中 ¥2/M。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("zhipu-glm5-docs", "glm-5", "zhipu-bigmodel", {
    routeModelId: "glm-5",
    inputPrice: cny(4),
    outputPrice: cny(18),
    cacheReadPrice: cny(1),
    freeOrPlan: "智谱官方按 token 计费。",
    limitations: "结构化价格取 0-32K 档；32K 以上为输入 ¥6/M、输出 ¥22/M、缓存命中 ¥1.5/M。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("minimax-official-m3", "minimax-m3", "minimax-official", {
    routeModelId: "MiniMax-M3",
    inputPrice: usd(0.3),
    outputPrice: usd(1.2),
    cacheReadPrice: usd(0.06),
    freeOrPlan: "官方 Pay as You Go，M3 当前存在 7 天 50% off 标注。",
    limitations: "512K 以上输入和 priority tier 有额外价格或可用性限制。",
    compatibility: ["Anthropic-compatible", "OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("minimax-official-m27", "minimax-m2-7", "minimax-official", {
    routeModelId: "MiniMax-M2.7",
    inputPrice: usd(0.3),
    outputPrice: usd(1.2),
    cacheReadPrice: usd(0.06),
    cacheWritePrice: usd(0.375),
    freeOrPlan: "官方 Pay as You Go，也可配合 Token Plan。",
    limitations: "存在 highspeed 版本，价格和速度不同。",
    compatibility: ["Anthropic-compatible", "OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("minimax-official-m25", "minimax-m2-5", "minimax-official", {
    routeModelId: "MiniMax-M2.5",
    inputPrice: usd(0.3),
    outputPrice: usd(1.2),
    cacheReadPrice: usd(0.03),
    cacheWritePrice: usd(0.375),
    freeOrPlan: "官方 Pay as You Go，Legacy Models 中仍有价格。",
    limitations: "适合低成本任务，但作为旧模型需要关注后续下线和能力差异。",
    compatibility: ["Anthropic-compatible", "OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("xiaomi-mimo-v25-pro", "mimo-v2-5-pro", "xiaomi-mimo", {
    routeModelId: "mimo-v2.5-pro",
    inputPrice: dualPrice({ cnyPerMTokens: 3, usdPerMTokens: 0.435 }),
    outputPrice: dualPrice({ cnyPerMTokens: 6, usdPerMTokens: 0.87 }),
    cacheReadPrice: dualPrice({ cnyPerMTokens: 0.025, usdPerMTokens: 0.0036 }),
    freeOrPlan: "官方 Pay-As-You-Go；国内和海外价格分开展示。",
    limitations: "MiMo 官方说明 Pay-As-You-Go API 余额与 Token Plan 配额不互通；旧 V2 Pro / Omni 自动路由到 V2.5。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "多模态"],
    pricingUrl: "https://platform.xiaomimimo.com/docs/en-US/price/pay-as-you-go",
  }),
  offer("xiaomi-mimo-v25", "mimo-v2-5", "xiaomi-mimo", {
    routeModelId: "mimo-v2.5",
    inputPrice: dualPrice({ cnyPerMTokens: 1, usdPerMTokens: 0.14 }),
    outputPrice: dualPrice({ cnyPerMTokens: 2, usdPerMTokens: 0.28 }),
    cacheReadPrice: dualPrice({ cnyPerMTokens: 0.02, usdPerMTokens: 0.0028 }),
    freeOrPlan: "官方 Pay-As-You-Go；国内和海外价格分开展示。",
    limitations: "MiMo 官方说明 Pay-As-You-Go API 余额与 Token Plan 配额不互通；旧 V2 Pro / Omni 自动路由到 V2.5。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "多模态"],
    pricingUrl: "https://platform.xiaomimimo.com/docs/en-US/price/pay-as-you-go",
  }),
  offer("stepfun-step37-flash", "step-3-7-flash", "stepfun-official", {
    routeModelId: "step-3.7-flash",
    inputPrice: cny(1.35),
    outputPrice: cny(8.1),
    cacheReadPrice: cny(0.27),
    freeOrPlan: "官方按量计费，API Key 和限速以 StepFun 开放平台为准。",
    limitations: "当前结构化价格取国内价格；国际站参考价为输入 $0.20/M、缓存命中 $0.04/M、输出 $1.15/M。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "多模态"],
    pricingUrl: "https://platform.stepfun.com/docs/zh/guides/pricing/details",
  }),
  ...officialMediaGenerationOffers(),
  ...opencodeGoOffers(),
  ...opencodeZenOffers(),
  ...modelScopeApiInferenceOffers(),
  ...alibabaCodingPlanOffers(),
  ...openRouterOffers(),
  ...awesomeCodingPlanReferenceOffers(),
  ...candidateProviderOffers(),
  offer("nvidia-nim-deepseek-flash", "deepseek-v4-flash", "nvidia-nim", {
    routeModelId: "deepseek-ai/deepseek-v4-flash",
    inputPrice: textPrice("Hosted API 可免费试用"),
    outputPrice: textPrice("Hosted API 可免费试用"),
    cacheReadPrice: textPrice("不作为长期生产价格基准"),
    freeOrPlan: "适合开发、测试、原型和自托管评估。",
    limitations: "模型可用性、限速和地区体验以 NVIDIA API Catalog 为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
  }),
  offer("nvidia-nim-deepseek-pro", "deepseek-v4-pro", "nvidia-nim", {
    routeModelId: "deepseek-ai/deepseek-v4-pro",
    inputPrice: textPrice("Hosted API 可免费试用"),
    outputPrice: textPrice("Hosted API 可免费试用"),
    cacheReadPrice: textPrice("不作为长期生产价格基准"),
    freeOrPlan: "适合开发、测试、原型和自托管评估。",
    limitations: "模型可用性、限速和地区体验以 NVIDIA API Catalog 为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
  }),
  offer("nvidia-nim-glm51", "glm-5-1", "nvidia-nim", {
    routeModelId: "zai-org/glm-5.1",
    inputPrice: textPrice("Hosted API 可免费试用"),
    outputPrice: textPrice("Hosted API 可免费试用"),
    cacheReadPrice: textPrice("不作为长期生产价格基准"),
    freeOrPlan: "适合开发、测试、原型和自托管评估。",
    limitations: "模型可用性、限速和地区体验以 NVIDIA API Catalog 为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
  }),
  offer("nvidia-nim-minimax-m27", "minimax-m2-7", "nvidia-nim", {
    routeModelId: "minimaxai/minimax-m2.7",
    inputPrice: textPrice("Hosted API 可免费试用"),
    outputPrice: textPrice("Hosted API 可免费试用"),
    cacheReadPrice: textPrice("不作为长期生产价格基准"),
    freeOrPlan: "适合开发、测试、原型和自托管评估。",
    limitations: "模型可用性、限速和地区体验以 NVIDIA API Catalog 为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
  }),
];

export const staticApiModelDataset: ApiModelDataset = {
  source: "static",
  generatedAt: apiOfficialPlatformUpdatedAt,
  fxSummary: apiModelFxSummary,
  models: apiModels,
  providers: apiProviders,
  plans: apiPlans,
  offers: apiModelOffers,
};

export function formatApiPrice(
  price: ApiPriceValue,
  currency: ApiCurrency,
  options: { maximumFractionDigits?: number } = {},
) {
  if (price.kind === "text") return price.text;

  const value =
    currency === "CNY"
      ? price.cnyPerMTokens ?? (typeof price.usdPerMTokens === "number" ? price.usdPerMTokens * apiModelFxSummary.usdToCny : undefined)
      : price.usdPerMTokens ?? (typeof price.cnyPerMTokens === "number" ? price.cnyPerMTokens / apiModelFxSummary.usdToCny : undefined);
  if (typeof value !== "number") return price.label ?? "待确认";

  const prefix = currency === "CNY" ? "¥" : "$";
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  return `${prefix}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} / 1M tokens`;
}

export function formatUsdAmount(value: number, currency: ApiCurrency) {
  const amount = currency === "CNY" ? value * apiModelFxSummary.usdToCny : value;
  const prefix = currency === "CNY" ? "¥" : "$";
  return `${prefix}${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCnyAmount(value: number, currency: ApiCurrency) {
  const amount = currency === "USD" ? value / apiModelFxSummary.usdToCny : value;
  const prefix = currency === "USD" ? "$" : "¥";
  return `${prefix}${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPlanPrice(plan: ApiPlan, currency: ApiCurrency) {
  if (typeof plan.priceCnyMonthly === "number") return `${formatCnyAmount(plan.priceCnyMonthly, currency)}/月 · ${plan.priceLabel}`;
  if (typeof plan.priceUsdMonthly !== "number") return plan.priceLabel;
  return `${formatUsdAmount(plan.priceUsdMonthly, currency)}/月 · ${plan.priceLabel}`;
}

export function formatPlanPriceFrom(plan: ApiPlan, currency: ApiCurrency) {
  return `${formatPlanPrice(plan, currency)}起`;
}

export function getPlanMonthlyPriceCny(plan: ApiPlan) {
  if (typeof plan.priceCnyMonthly === "number") return plan.priceCnyMonthly;
  if (typeof plan.priceUsdMonthly === "number") return plan.priceUsdMonthly * apiModelFxSummary.usdToCny;
  return null;
}

export function formatApiBillingMode(value: ApiBillingMode) {
  if (value === "订阅套餐") return "订阅/Token Plan";
  return value;
}

export function getApiOutputPriceLabel(family: string) {
  if (isImageGenerationFamily(family)) return "图片输出";
  if (isVideoGenerationFamily(family)) return "视频输出";
  return "输出";
}

export function getApiPrimaryPriceValue(offer: {
  model: { family: string };
  inputPrice: ApiPriceValue;
  outputPrice: ApiPriceValue;
}) {
  return isMediaGenerationFamily(offer.model.family) ? offer.outputPrice : offer.inputPrice;
}

export function formatApiPrimaryPrice(
  offer: {
    model: { family: string };
    inputPrice: ApiPriceValue;
    outputPrice: ApiPriceValue;
  },
  currency: ApiCurrency,
  options: { maximumFractionDigits?: number } = {},
) {
  return formatApiPrice(getApiPrimaryPriceValue(offer), currency, options);
}

export function formatApiDisplayText(value: string) {
  return value
    .replaceAll("订阅型 API 套餐", "Token Plan")
    .replaceAll("月订阅套餐", "月费 Token Plan")
    .replaceAll("订阅套餐", "订阅/Token Plan");
}

export function getApiModelFamilyOptions(dataset: ApiModelDataset = staticApiModelDataset): ApiModelFamilyOption[] {
  const seen = new Set<string>();

  return dataset.models
    .map((model) => model.family)
    .filter((family) => {
      if (seen.has(family)) return false;
      seen.add(family);
      return true;
    })
    .sort(compareFamilyLabel)
    .map((family) => ({
      id: apiModelFamilyId(family),
      label: family,
    }));
}

export function getApiModels(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset) {
  const index = getApiModelDatasetIndex(dataset);
  return index.sortedModels
    .filter((model) => scope === "all" || apiModelFamilyId(model.family) === scope)
    .slice();
}

export function getApiModel(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return getApiModelDatasetIndex(dataset).modelById.get(id) ?? null;
}

export function getApiModelSummaries(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiModelSummary[] {
  const index = getApiModelDatasetIndex(dataset);
  return getApiModels(scope, dataset).map((model) => buildApiModelSummary(model, dataset, index));
}

export function getApiModelSummary(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  const index = getApiModelDatasetIndex(dataset);
  const model = index.modelById.get(id) ?? null;
  if (!model) return null;
  return buildApiModelSummary(model, dataset, index);
}

export function getApiProviders(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset) {
  const visibleOfferProviderIds = new Set(getApiModelOffers(scope, dataset).map((offer) => offer.providerId));
  const visiblePlanProviderIds = new Set(getApiPlans(scope, dataset).map((plan) => plan.providerId));

  return dataset.providers
    .filter((provider) => visibleOfferProviderIds.has(provider.id) || visiblePlanProviderIds.has(provider.id))
    .sort((a, b) => {
      const typeDelta = providerTypeRank(a.type) - providerTypeRank(b.type);
      if (typeDelta !== 0) return typeDelta;
      return a.name.localeCompare(b.name, "zh-CN");
    });
}

export function getApiProvider(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return getApiModelDatasetIndex(dataset).providerById.get(id) ?? null;
}

export function getApiProviderSummaries(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiProviderSummary[] {
  const index = getApiModelDatasetIndex(dataset);
  return getApiProviders(scope, dataset).map((provider) => buildApiProviderSummary(provider, scope, dataset, index));
}

export function getApiProviderSummary(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  const index = getApiModelDatasetIndex(dataset);
  const provider = index.providerById.get(id) ?? null;
  if (!provider) return null;
  return buildApiProviderSummary(provider, "all", dataset, index);
}

export function getApiModelOffers(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiModelOfferWithRelations[] {
  return getApiModelDatasetIndex(dataset).offersWithRelations.filter((offer) => scope === "all" || apiModelFamilyId(offer.model.family) === scope);
}

export function getApiModelOffersByModel(modelId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return [...(getApiModelDatasetIndex(dataset).offersByModelId.get(modelId) || [])];
}

export function getApiModelOffersByProvider(providerId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return [...(getApiModelDatasetIndex(dataset).offersByProviderId.get(providerId) || [])];
}

export function getApiPlans(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset) {
  const index = getApiModelDatasetIndex(dataset);
  return index.sortedPlans
    .filter((plan) => {
      if (scope === "all") return true;
      if (plan.modelIds.length === 0) return true;
      return plan.modelIds.some((modelId) => {
        const model = index.modelById.get(modelId) ?? null;
        return model ? apiModelFamilyId(model.family) === scope : false;
      });
    });
}

export function getApiPlansByModel(modelId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return [...(getApiModelDatasetIndex(dataset).plansByModelId.get(modelId) || [])];
}

export function getApiPlansByProvider(providerId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return [...(getApiModelDatasetIndex(dataset).plansByProviderId.get(providerId) || [])];
}

export function apiModelFamilyId(family: string) {
  const mapped = apiModelFamilySlugByName[family];
  if (mapped) return mapped;

  return family
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function apiProviderTypeRank(type: ApiProviderType) {
  return providerTypeRank(type);
}

function getApiModelDatasetIndex(dataset: ApiModelDataset): ApiModelDatasetIndex {
  const cached = apiModelDatasetIndexCache.get(dataset);
  if (cached) return cached;

  const modelById = new Map(dataset.models.map((model) => [model.id, model]));
  const providerById = new Map(dataset.providers.map((provider) => [provider.id, provider]));
  const sortedModels = [...dataset.models].sort(compareModel);
  const sortedPlans = [...dataset.plans].sort(comparePlan);
  const offersByModelId = new Map<string, ApiModelOfferWithRelations[]>();
  const offersByProviderId = new Map<string, ApiModelOfferWithRelations[]>();
  const plansByModelId = new Map<string, ApiPlan[]>();
  const plansByProviderId = new Map<string, ApiPlan[]>();

  const offersWithRelations = dataset.offers
    .map((offer): ApiModelOfferWithRelations | null => {
      const model = modelById.get(offer.modelId) ?? null;
      const provider = providerById.get(offer.providerId) ?? null;
      if (!model || !provider) return null;

      return {
        ...offer,
        model,
        provider,
      };
    })
    .filter((offer): offer is ApiModelOfferWithRelations => Boolean(offer))
    .sort(compareOffer);

  for (const offer of offersWithRelations) {
    pushGrouped(offersByModelId, offer.modelId, offer);
    pushGrouped(offersByProviderId, offer.providerId, offer);
  }

  for (const plan of sortedPlans) {
    pushGrouped(plansByProviderId, plan.providerId, plan);
    for (const modelId of plan.modelIds) {
      pushGrouped(plansByModelId, modelId, plan);
    }
  }

  const index = {
    modelById,
    providerById,
    sortedModels,
    sortedPlans,
    offersWithRelations,
    offersByModelId,
    offersByProviderId,
    plansByModelId,
    plansByProviderId,
  };
  apiModelDatasetIndexCache.set(dataset, index);
  return index;
}

function pushGrouped<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key);
  if (values) {
    values.push(value);
    return;
  }

  map.set(key, [value]);
}

function buildApiModelSummary(model: ApiModel, dataset: ApiModelDataset, index = getApiModelDatasetIndex(dataset)): ApiModelSummary {
  const offers = index.offersByModelId.get(model.id) || [];
  const plans = index.plansByModelId.get(model.id) || [];
  const providerNames = new Set(offers.map((offer) => offer.provider.name));
  plans.forEach((plan) => providerNames.add(plan.providerName));
  const primaryOffer = offers[0] ?? null;

  return {
    id: model.id,
    model,
    family: model.family,
    displayName: model.displayName,
    offerCount: offers.length,
    providerCount: providerNames.size,
    officialCount: offers.filter((offer) => offer.provider.type === "official").length,
    freeCount: offers.filter((offer) => offer.provider.type === "free" || offer.compatibility.includes("免费/测试")).length,
    routerCount: offers.filter((offer) => offer.provider.type === "router").length,
    subscriptionCount: offers.filter((offer) => offer.provider.type === "subscription").length + plans.filter((plan) => plan.type === "subscription").length,
    planCount: plans.length,
    providerNames: Array.from(providerNames).slice(0, 4),
    compatibility: uniqueStrings([...offers.flatMap((offer) => offer.compatibility), ...plans.flatMap((plan) => plan.compatibility)]).slice(0, 5),
    suitableTools: uniqueStrings([...model.suitableTools, ...offers.flatMap((offer) => offer.suitableTools), ...plans.flatMap((plan) => plan.suitableTools)]).slice(0, 5),
    primaryOffer,
    latestUpdatedAt: latestDate([model.updatedAt, ...offers.map((offer) => offer.updatedAt), ...plans.map((plan) => plan.updatedAt)]),
  };
}

function buildApiProviderSummary(provider: ApiProvider, scope: ApiModelScope, dataset: ApiModelDataset, index = getApiModelDatasetIndex(dataset)): ApiProviderSummary {
  const offers = (index.offersByProviderId.get(provider.id) || []).filter((offer) => scope === "all" || apiModelFamilyId(offer.model.family) === scope);
  const plans = (index.plansByProviderId.get(provider.id) || []).filter((plan) => {
    if (scope === "all") return true;
    if (plan.modelIds.length === 0) return true;
    return plan.modelIds.some((modelId) => {
      const model = index.modelById.get(modelId) ?? null;
      return model ? apiModelFamilyId(model.family) === scope : false;
    });
  });
  const models = uniqueById([
    ...offers.map((offer) => offer.model),
    ...plans.flatMap((plan) => plan.modelIds.map((modelId) => index.modelById.get(modelId) ?? null).filter((model): model is ApiModel => Boolean(model))),
  ]);

  const sortedPlans = [...plans].sort(comparePlanPrice);
  const primaryPlan = sortedPlans[0] ?? null;

  return {
    id: provider.id,
    provider,
    offerCount: offers.length,
    modelCount: models.length,
    planCount: plans.length,
    families: uniqueStrings(models.map((model) => model.family)).sort(compareFamilyLabel),
    modelNames: models.map((model) => model.displayName).slice(0, 6),
    compatibility: uniqueStrings([...offers.flatMap((offer) => offer.compatibility), ...plans.flatMap((plan) => plan.compatibility)]).slice(0, 5),
    suitableTools: uniqueStrings([...offers.flatMap((offer) => offer.suitableTools), ...plans.flatMap((plan) => plan.suitableTools)]).slice(0, 5),
    plans: sortedPlans,
    primaryPlan,
    latestUpdatedAt: latestDate([provider.updatedAt, ...offers.map((offer) => offer.updatedAt), ...plans.map((plan) => plan.updatedAt)]),
  };
}

function offer(
  id: string,
  modelId: string,
  providerId: string,
  values: Omit<ApiModelOffer, "id" | "modelId" | "providerId" | "billingMode" | "limitSummary" | "suitableTools" | "sourceLabel" | "pricingUrl" | "updatedAt"> & {
    limitSummary?: string;
    suitableTools?: string[];
    sourceLabel?: string;
    pricingUrl?: string;
    updatedAt?: string;
  },
): ApiModelOffer {
  const provider = apiProviders.find((item) => item.id === providerId);

  return {
    id,
    modelId,
    providerId,
    billingMode: provider?.billingMode ?? "按量计费",
    ...values,
    limitSummary: values.limitSummary ?? provider?.limitSummary ?? "未公开固定 RPM/TPM，以官方控制台为准。",
    suitableTools: values.suitableTools ?? apiModels.find((model) => model.id === modelId)?.suitableTools ?? [],
    sourceLabel: values.sourceLabel ?? provider?.sourceLabel ?? "公开来源",
    pricingUrl: values.pricingUrl ?? provider?.pricingUrl ?? provider?.url,
    updatedAt: values.updatedAt ?? apiModelUpdatedAt,
  };
}

function officialMediaGenerationOffers(): ApiModelOffer[] {
  const pendingImagePrice = {
    inputPrice: textPrice("待官方价格结构化"),
    outputPrice: textPrice("待官方图片输出价格结构化"),
    cacheReadPrice: textPrice("以官方价格页为准"),
    freeOrPlan: "官方按量计费口径待结构化，先展示官方文档入口。",
    limitations: "具体价格可能受模型版本、图片尺寸、质量、地区和账号权限影响，最终以官方文档和控制台为准。",
    compatibility: ["官方 API", "图片生成", "多模态"],
    suitableTools: ["自建应用", "Open WebUI"],
  };
  const pendingVideoPrice = {
    inputPrice: textPrice("待官方价格结构化"),
    outputPrice: textPrice("待官方视频输出价格结构化"),
    cacheReadPrice: textPrice("以官方价格页为准"),
    freeOrPlan: "官方按量计费口径待结构化，先展示官方文档入口。",
    limitations: "具体价格可能受模型版本、分辨率、时长、地区和账号权限影响，最终以官方文档和控制台为准。",
    compatibility: ["官方 API", "视频生成", "多模态"],
    suitableTools: ["自建应用", "Open WebUI"],
  };

  return [
    offer("openai-gpt-image-2", "gpt-image-2", "openai-official", {
      routeModelId: "gpt-image-2",
      inputPrice: usd(5),
      outputPrice: usd(30),
      cacheReadPrice: usd(1.25),
      freeOrPlan: "OpenAI 官方按量计费，图片输出价格作为该模型的主要价格基准。",
      limitSummary: "速率、图片规格和可用性以 OpenAI 控制台与价格页为准。",
      limitations: "价格口径来自现有中转 API 官方价基准；实际计费还需结合 OpenAI 官方页面的最新模型、尺寸和质量规则。",
      compatibility: ["官方 API", "图片生成", "OpenAI-compatible"],
      suitableTools: ["自建应用", "Open WebUI"],
      sourceLabel: "OpenAI API Pricing",
      pricingUrl: openAiPricingUrl,
    }),
    offer("google-nano-banana-pro", "nano-banana-pro", "google-gemini-api", {
      ...pendingImagePrice,
      routeModelId: "nano-banana-pro",
      sourceLabel: "Google Gemini Image Generation",
      pricingUrl: geminiImageGenerationUrl,
    }),
    offer("google-nano-banana-2", "nano-banana-2", "google-gemini-api", {
      ...pendingImagePrice,
      routeModelId: "nano-banana-2",
      sourceLabel: "Google Gemini Image Generation",
      pricingUrl: geminiImageGenerationUrl,
    }),
    offer("google-nano-banana", "nano-banana", "google-gemini-api", {
      ...pendingImagePrice,
      routeModelId: "nano-banana",
      sourceLabel: "Google Gemini Image Generation",
      pricingUrl: geminiImageGenerationUrl,
    }),
    offer("google-nano-banana-lite", "nano-banana-lite", "google-gemini-api", {
      ...pendingImagePrice,
      routeModelId: "nano-banana-lite",
      sourceLabel: "Google Gemini Image Generation",
      pricingUrl: geminiImageGenerationUrl,
    }),
    offer("openai-sora-2", "sora-2", "openai-official", {
      ...pendingVideoPrice,
      routeModelId: "sora-2",
      sourceLabel: "OpenAI Video Generation",
      pricingUrl: openAiVideoGenerationUrl,
    }),
    offer("openai-sora-2-pro", "sora-2-pro", "openai-official", {
      ...pendingVideoPrice,
      routeModelId: "sora-2-pro",
      sourceLabel: "OpenAI Video Generation",
      pricingUrl: openAiVideoGenerationUrl,
    }),
    offer("google-veo-3-1", "veo-3-1", "google-gemini-api", {
      ...pendingVideoPrice,
      routeModelId: "veo-3.1",
      sourceLabel: "Google Gemini Models",
      pricingUrl: geminiModelDocsUrl,
    }),
    offer("google-veo-3-1-lite", "veo-3-1-lite", "google-gemini-api", {
      ...pendingVideoPrice,
      routeModelId: "veo-3.1-lite",
      sourceLabel: "Google Gemini Models",
      pricingUrl: geminiModelDocsUrl,
    }),
    offer("google-gemini-omni-flash", "gemini-omni-flash", "google-gemini-api", {
      ...pendingVideoPrice,
      routeModelId: "gemini-omni-flash",
      sourceLabel: "Google Gemini Models",
      pricingUrl: geminiModelDocsUrl,
    }),
    offer("byteplus-seedance-2-0", "seedance-2-0", "byteplus-modelark", {
      ...pendingVideoPrice,
      routeModelId: "seedance-2.0",
      sourceLabel: "BytePlus ModelArk Docs",
      pricingUrl: bytePlusSeedanceDocsUrl,
    }),
    offer("kling-2-5-turbo", "kling-2-5-turbo", "kling-api", {
      ...pendingVideoPrice,
      routeModelId: "kling-2.5-turbo",
      sourceLabel: "Kling API Docs",
      pricingUrl: klingVideoDocsUrl,
    }),
  ];
}

function opencodeGoOffers(): ApiModelOffer[] {
  const shared = {
    freeOrPlan: "OpenCode Go 套餐内消耗，5 小时/每周/每月额度窗口。",
    limitations: "请求数随模型成本变化，适合编码工具，不等同无限 API。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    sourceLabel: "OpenCode Go Docs",
    pricingUrl: OPENCODE_GO_REFERRAL_URL,
  };

  return [
    offer("opencode-go-deepseek-flash", "deepseek-v4-flash", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/deepseek-v4-flash",
      inputPrice: usd(0.14),
      outputPrice: usd(0.28),
      cacheReadPrice: usd(0.0028),
    }),
    offer("opencode-go-deepseek-pro", "deepseek-v4-pro", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/deepseek-v4-pro",
      inputPrice: usd(1.74),
      outputPrice: usd(3.48),
      cacheReadPrice: usd(0.0145),
    }),
    offer("opencode-go-qwen37-max", "qwen3-7-max", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/qwen3.7-max",
      inputPrice: usd(2.5),
      outputPrice: usd(7.5),
      cacheReadPrice: usd(0.5),
      cacheWritePrice: usd(3.125),
    }),
    offer("opencode-go-qwen37-plus", "qwen3-7-plus", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/qwen3.7-plus",
      inputPrice: usd(0.4),
      outputPrice: usd(1.6),
      cacheReadPrice: usd(0.04),
      cacheWritePrice: usd(0.5),
    }),
    offer("opencode-go-qwen36-plus", "qwen3-6-plus", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/qwen3.6-plus",
      inputPrice: usd(0.5),
      outputPrice: usd(3),
      cacheReadPrice: usd(0.05),
      cacheWritePrice: usd(0.625),
    }),
    offer("opencode-go-kimi-k26", "kimi-k2-6", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/kimi-k2.6",
      inputPrice: usd(0.95),
      outputPrice: usd(4),
      cacheReadPrice: usd(0.16),
    }),
    offer("opencode-go-kimi-k25", "kimi-k2-5", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/kimi-k2.5",
      inputPrice: usd(0.6),
      outputPrice: usd(3),
      cacheReadPrice: usd(0.1),
    }),
    offer("opencode-go-glm51", "glm-5-1", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/glm-5.1",
      inputPrice: usd(1.4),
      outputPrice: usd(4.4),
      cacheReadPrice: usd(0.26),
    }),
    offer("opencode-go-glm5", "glm-5", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/glm-5",
      inputPrice: usd(1),
      outputPrice: usd(3.2),
      cacheReadPrice: usd(0.2),
    }),
    offer("opencode-go-minimax-m3", "minimax-m3", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/minimax-m3",
      inputPrice: usd(0.6),
      outputPrice: usd(2.4),
      cacheReadPrice: usd(0.12),
      cacheWritePrice: usd(0.75),
    }),
    offer("opencode-go-minimax-m27", "minimax-m2-7", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/minimax-m2.7",
      inputPrice: usd(0.3),
      outputPrice: usd(1.2),
      cacheReadPrice: usd(0.06),
      cacheWritePrice: usd(0.375),
    }),
    offer("opencode-go-minimax-m25", "minimax-m2-5", "opencode-go", {
      ...shared,
      routeModelId: "opencode-go/minimax-m2.5",
      inputPrice: usd(0.3),
      outputPrice: usd(1.2),
      cacheReadPrice: usd(0.06),
      cacheWritePrice: usd(0.375),
    }),
  ];
}

function opencodeZenOffers(): ApiModelOffer[] {
  const shared = {
    inputPrice: textPrice("Zen 当前限时 Free 或按量价格表"),
    outputPrice: textPrice("Zen 当前限时 Free 或按量价格表"),
    cacheReadPrice: textPrice("以 Zen 文档当前价格表为准"),
    freeOrPlan: "Zen 精选模型入口，部分模型限时免费，其余按量计费。",
    limitations: "免费模型会不定期变化；Free 模型可能用于反馈收集或产品改进，不适合提交敏感数据。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "免费/测试", "中文模型"],
    sourceLabel: "OpenCode Zen Docs",
    pricingUrl: "https://opencode.ai/docs/zh-cn/zen/",
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code", "Open WebUI"],
  };

  return [
    offer("opencode-zen-deepseek-flash-free", "deepseek-v4-flash", "opencode-zen", {
      ...shared,
      routeModelId: "deepseek-v4-flash-free",
      inputPrice: textPrice("Free"),
      outputPrice: textPrice("Free"),
      cacheReadPrice: textPrice("Free"),
      freeOrPlan: "OpenCode Zen 当前限时免费模型。",
    }),
    offer("opencode-zen-qwen36-plus", "qwen3-6-plus", "opencode-zen", {
      ...shared,
      routeModelId: "qwen3.6-plus",
    }),
    offer("opencode-zen-qwen35-plus", "qwen3-5-plus", "opencode-zen", {
      ...shared,
      routeModelId: "qwen3.5-plus",
    }),
    offer("opencode-zen-kimi-k26", "kimi-k2-6", "opencode-zen", {
      ...shared,
      routeModelId: "kimi-k2.6",
    }),
    offer("opencode-zen-kimi-k25", "kimi-k2-5", "opencode-zen", {
      ...shared,
      routeModelId: "kimi-k2.5",
    }),
    offer("opencode-zen-glm51", "glm-5-1", "opencode-zen", {
      ...shared,
      routeModelId: "glm-5.1",
    }),
    offer("opencode-zen-glm5", "glm-5", "opencode-zen", {
      ...shared,
      routeModelId: "glm-5",
    }),
    offer("opencode-zen-minimax-m27", "minimax-m2-7", "opencode-zen", {
      ...shared,
      routeModelId: "minimax-m2.7",
    }),
    offer("opencode-zen-minimax-m25", "minimax-m2-5", "opencode-zen", {
      ...shared,
      routeModelId: "minimax-m2.5",
    }),
    offer("opencode-zen-mimo-v25-free", "mimo-v2-5", "opencode-zen", {
      ...shared,
      routeModelId: "mimo-v2.5-free",
      inputPrice: textPrice("Free"),
      outputPrice: textPrice("Free"),
      cacheReadPrice: textPrice("Free"),
      freeOrPlan: "OpenCode Zen 当前限时免费模型。",
    }),
  ];
}

function modelScopeApiInferenceOffers(): ApiModelOffer[] {
  const shared = {
    inputPrice: textPrice("免费额度内"),
    outputPrice: textPrice("免费额度内"),
    cacheReadPrice: textPrice("不公开独立缓存计费"),
    freeOrPlan: "ModelScope API-Inference 免费额度内调用。",
    limitations: "达到每日或单模型限制后通常返回 429；免费额度、模型覆盖和绑定要求以 ModelScope 当前页面为准。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型", "前沿开源模型"],
    sourceLabel: "ModelScope API-Inference 使用限制",
    pricingUrl: "https://modelscope.cn/docs/model-service/API-Inference/limits",
    suitableTools: ["Codex", "Qwen Code", "OpenCode", "Open WebUI", "Cherry Studio"],
  };

  return [
    offer("modelscope-deepseek-v4-pro", "deepseek-v4-pro", "modelscope-api-inference", {
      ...shared,
      routeModelId: "deepseek-ai/DeepSeek-V4-Pro",
    }),
    offer("modelscope-deepseek-v4-flash", "deepseek-v4-flash", "modelscope-api-inference", {
      ...shared,
      routeModelId: "deepseek-ai/DeepSeek-V4-Flash",
    }),
    offer("modelscope-glm51", "glm-5-1", "modelscope-api-inference", {
      ...shared,
      routeModelId: "ZhipuAI/GLM-5.1",
    }),
    offer("modelscope-glm5", "glm-5", "modelscope-api-inference", {
      ...shared,
      routeModelId: "ZhipuAI/GLM-5",
    }),
    offer("modelscope-kimi-k25", "kimi-k2-5", "modelscope-api-inference", {
      ...shared,
      routeModelId: "moonshotai/Kimi-K2.5",
    }),
    offer("modelscope-minimax-m27", "minimax-m2-7", "modelscope-api-inference", {
      ...shared,
      routeModelId: "MiniMax/MiniMax-M2.7",
    }),
    offer("modelscope-minimax-m25", "minimax-m2-5", "modelscope-api-inference", {
      ...shared,
      routeModelId: "MiniMax/MiniMax-M2.5",
    }),
    offer("modelscope-step37-flash", "step-3-7-flash", "modelscope-api-inference", {
      ...shared,
      routeModelId: "stepfun-ai/Step-3.7-Flash",
    }),
  ];
}

function alibabaCodingPlanOffers(): ApiModelOffer[] {
  const shared = {
    inputPrice: textPrice("套餐内请求额度"),
    outputPrice: textPrice("套餐内请求额度"),
    cacheReadPrice: textPrice("按 Coding Plan 规则消耗"),
    freeOrPlan: "Coding Plan Pro：$50/月，90,000 requests/月。",
    limitations: "官方限制为编码工具使用，不适合自动化脚本、自建后端或批处理。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    sourceLabel: "Alibaba Coding Plan",
  };

  return [
    offer("alibaba-coding-qwen35-plus", "qwen3-5-plus", "alibaba-coding-plan", {
      ...shared,
      routeModelId: "qwen3.5-plus",
    }),
    offer("alibaba-coding-qwen-coder-plus", "qwen3-coder-plus", "alibaba-coding-plan", {
      ...shared,
      routeModelId: "qwen3-coder-plus",
    }),
    offer("alibaba-coding-kimi-k25", "kimi-k2-5", "alibaba-coding-plan", {
      ...shared,
      routeModelId: "kimi-k2.5",
    }),
    offer("alibaba-coding-glm5", "glm-5", "alibaba-coding-plan", {
      ...shared,
      routeModelId: "glm-5",
    }),
    offer("alibaba-coding-minimax-m25", "minimax-m2-5", "alibaba-coding-plan", {
      ...shared,
      routeModelId: "MiniMax-M2.5",
    }),
  ];
}

function openRouterOffers(): ApiModelOffer[] {
  const shared = {
    inputPrice: textPrice("随模型页动态变化"),
    outputPrice: textPrice("随模型页动态变化"),
    cacheReadPrice: textPrice("按 provider 支持情况"),
    freeOrPlan: "可用付费 credits 或 :free 变体，按 OpenRouter 当前模型页为准。",
    limitations: "路由、价格、free 额度和 provider 可用性会变化，生产使用建议固定模型和 provider。",
    compatibility: ["OpenAI-compatible", "免费/测试", "Coding Agent", "中文模型"],
    sourceLabel: "OpenRouter Pricing",
  };

  return [
    offer("openrouter-deepseek-flash", "deepseek-v4-flash", "openrouter", {
      ...shared,
      routeModelId: "deepseek/deepseek-v4-flash",
    }),
    offer("openrouter-deepseek-pro", "deepseek-v4-pro", "openrouter", {
      ...shared,
      routeModelId: "deepseek/deepseek-v4-pro",
    }),
    offer("openrouter-kimi-k26", "kimi-k2-6", "openrouter", {
      ...shared,
      routeModelId: "moonshotai/kimi-k2.6",
    }),
    offer("openrouter-qwen37-max", "qwen3-7-max", "openrouter", {
      ...shared,
      routeModelId: "qwen/qwen3.7-max",
    }),
    offer("openrouter-minimax-m3", "minimax-m3", "openrouter", {
      ...shared,
      routeModelId: "minimax/minimax-m3",
    }),
  ];
}

function awesomeCodingPlanReferenceOffers(): ApiModelOffer[] {
  const ollamaShared = {
    inputPrice: textPrice("免费/Pro 套餐内额度"),
    outputPrice: textPrice("免费/Pro 套餐内额度"),
    cacheReadPrice: textPrice("以 Ollama Pricing 为准"),
    freeOrPlan: "Ollama Free / Pro：开放模型入口，额度和并发以官方 Pricing 为准。",
    limitations: "参考 awesome-coding-plan 作为线索；正式口径只使用 Ollama 官方 Pricing，不折算第三方估算值。",
    compatibility: ["免费/测试", "中文模型", "开放模型"],
    sourceLabel: "Ollama Pricing",
    pricingUrl: "https://ollama.com/pricing",
  };
  const kimiCodeShared = {
    inputPrice: textPrice("Kimi Code 套餐内额度"),
    outputPrice: textPrice("Kimi Code 套餐内额度"),
    cacheReadPrice: textPrice("以 Kimi 会员页为准"),
    freeOrPlan: "Kimi Code 会员套餐，Andante / Allegretto 档位以官方会员页为准。",
    limitations: "参考 awesome-coding-plan 作为线索；具体额度、模型和高峰可用性以 Kimi 官方会员页为准。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    sourceLabel: "Kimi Membership Pricing",
    pricingUrl: "https://www.kimi.com/membership/pricing",
    suitableTools: ["Kimi Code", "Cursor", "OpenCode"],
  };
  const glmCodingShared = {
    inputPrice: textPrice("GLM Coding Plan 套餐内额度"),
    outputPrice: textPrice("GLM Coding Plan 套餐内额度"),
    cacheReadPrice: textPrice("以 GLM Coding Plan 为准"),
    freeOrPlan: "GLM Coding Plan Lite / Pro：官方编码套餐入口。",
    limitations: "参考 awesome-coding-plan 作为线索；抢购、限频、短周期额度以智谱官方页面为准。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    sourceLabel: "GLM Coding Plan",
    pricingUrl: "https://www.bigmodel.cn/glm-coding?ic=93SRY3UUUI",
    suitableTools: ["Claude Code", "Cursor", "OpenCode", "Codex"],
  };

  return [
    offer("ollama-qwen35-plus", "qwen3-5-plus", "ollama", {
      ...ollamaShared,
      routeModelId: "qwen3.5",
    }),
    offer("ollama-minimax-m27", "minimax-m2-7", "ollama", {
      ...ollamaShared,
      routeModelId: "minimax-m2.7",
    }),
    offer("kimi-code-k25", "kimi-k2-5", "kimi-code", {
      ...kimiCodeShared,
      routeModelId: "kimi-k2.5",
    }),
    offer("glm-coding-glm51", "glm-5-1", "glm-coding-plan", {
      ...glmCodingShared,
      routeModelId: "glm-5.1",
    }),
    offer("glm-coding-glm5", "glm-5", "glm-coding-plan", {
      ...glmCodingShared,
      routeModelId: "glm-5",
    }),
    offer("fireworks-fire-pass-kimi-k26", "kimi-k2-6", "fireworks-fire-pass", {
      routeModelId: "kimi-k2.6-turbo",
      inputPrice: textPrice("Fire Pass 套餐内额度"),
      outputPrice: textPrice("Fire Pass 套餐内额度"),
      cacheReadPrice: textPrice("以 Fire Pass 页面为准"),
      freeOrPlan: "Fire Pass：周付套餐，当前作为 Kimi K2.6 Turbo 等模型的公开套餐线索。",
      limitations: "参考 awesome-coding-plan 作为线索；模型覆盖、速率和 no per-token charges 口径以 Fireworks 官方页面为准。",
      compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型", "订阅套餐"],
      sourceLabel: "Fireworks Fire Pass",
      pricingUrl: "https://app.fireworks.ai/fire-pass",
      suitableTools: ["Open WebUI", "自建应用", "Cursor", "OpenCode"],
    }),
  ];
}

function candidateProviderOffers(): ApiModelOffer[] {
  const tencentShared = {
    inputPrice: textPrice("套餐内请求额度"),
    outputPrice: textPrice("套餐内请求额度"),
    cacheReadPrice: textPrice("按腾讯云 Coding Plan 规则消耗"),
    freeOrPlan: "Lite 40 元/月，Pro 200 元/月。",
    limitations: "请求次数是模型调用预估值，一次用户提问可能消耗多次请求。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    sourceLabel: "腾讯云 TokenHub 官方文档",
    pricingUrl: "https://cloud.tencent.com/document/product/1823/130092",
  };
  const volcengineShared = {
    inputPrice: textPrice("价格待解析，见官方活动页"),
    outputPrice: textPrice("价格待解析，见官方活动页"),
    cacheReadPrice: textPrice("按官方活动页规则"),
    freeOrPlan: "方舟 Coding Plan 官方活动页，价格待解析。",
    limitations: "活动页为动态内容，首版不硬填未校验价格。",
    compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
    sourceLabel: "火山方舟 Coding Plan",
    pricingUrl: "https://www.volcengine.com/activity/codingplan",
  };

  return [
    offer("tencent-tokenhub-glm5", "glm-5", "tencent-hunyuan-coding-plan", {
      ...tencentShared,
      routeModelId: "GLM-5",
    }),
    offer("tencent-tokenhub-kimi-k25", "kimi-k2-5", "tencent-hunyuan-coding-plan", {
      ...tencentShared,
      routeModelId: "Kimi-K2.5",
    }),
    offer("tencent-tokenhub-minimax-m25", "minimax-m2-5", "tencent-hunyuan-coding-plan", {
      ...tencentShared,
      routeModelId: "MiniMax-M2.5",
    }),
    offer("volcengine-ark-deepseek-flash", "deepseek-v4-flash", "volcengine-ark-coding-plan", {
      ...volcengineShared,
      routeModelId: "DeepSeek",
    }),
    offer("volcengine-ark-glm5", "glm-5", "volcengine-ark-coding-plan", {
      ...volcengineShared,
      routeModelId: "GLM",
    }),
    offer("volcengine-ark-kimi-k25", "kimi-k2-5", "volcengine-ark-coding-plan", {
      ...volcengineShared,
      routeModelId: "Kimi",
    }),
    offer("volcengine-ark-minimax-m25", "minimax-m2-5", "volcengine-ark-coding-plan", {
      ...volcengineShared,
      routeModelId: "MiniMax",
    }),
    offer("huaweicloud-maas-deepseek", "deepseek-v4-flash", "huaweicloud-modelarts-maas", {
      routeModelId: "DeepSeek",
      inputPrice: textPrice("见华为云 MaaS / DeepSeek 活动页"),
      outputPrice: textPrice("见华为云 MaaS / DeepSeek 活动页"),
      cacheReadPrice: textPrice("按官方 Tokens 套餐包规则"),
      freeOrPlan: "Tokens 套餐包和活动规则以华为云官方页面为准。",
      limitations: "页面存在访问挑战和动态内容，结构化单价待解析。",
      compatibility: ["官方 API", "企业云", "中文模型"],
      sourceLabel: "华为云 ModelArts / MaaS",
      pricingUrl: "https://activity.huaweicloud.com/maas-ds.html",
    }),
    offer("ctyun-xirang-deepseek-flash", "deepseek-v4-flash", "ctyun-xirang", {
      routeModelId: "DeepSeek-V4-Flash",
      inputPrice: textPrice("Token Plan 轻享包低至 9.9 元起"),
      outputPrice: textPrice("Token Plan 轻享包低至 9.9 元起"),
      cacheReadPrice: textPrice("按天翼云 Token 服务规则"),
      freeOrPlan: "Token Plan 轻享包低至 9.9 元起，具体额度以官方活动页为准。",
      limitations: "活动价不是统一模型单价，需查看具体模型和套餐。",
      compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
      sourceLabel: "天翼云息壤公开页面",
      pricingUrl: "https://www.ctyun.cn/act/AI/zhuanxiang",
    }),
    offer("ctyun-xirang-glm51", "glm-5-1", "ctyun-xirang", {
      routeModelId: "GLM-5.1",
      inputPrice: textPrice("Token Plan 轻享包低至 9.9 元起"),
      outputPrice: textPrice("Token Plan 轻享包低至 9.9 元起"),
      cacheReadPrice: textPrice("按天翼云 Token 服务规则"),
      freeOrPlan: "Token Plan 轻享包低至 9.9 元起，具体额度以官方活动页为准。",
      limitations: "活动价不是统一模型单价，需查看具体模型和套餐。",
      compatibility: ["Coding Agent", "中文模型", "订阅套餐"],
      sourceLabel: "天翼云息壤公开页面",
      pricingUrl: "https://www.ctyun.cn/act/AI/zhuanxiang",
    }),
  ];
}

function compareOffer(a: ApiModelOfferWithRelations, b: ApiModelOfferWithRelations) {
  const modelDelta = compareModel(a.model, b.model);
  if (modelDelta !== 0) return modelDelta;

  const typeDelta = providerTypeRank(a.provider.type) - providerTypeRank(b.provider.type);
  if (typeDelta !== 0) return typeDelta;

  return a.provider.name.localeCompare(b.provider.name, "zh-CN");
}

function comparePlan(a: ApiPlan, b: ApiPlan) {
  const typeDelta = providerTypeRank(a.type) - providerTypeRank(b.type);
  if (typeDelta !== 0) return typeDelta;
  return a.name.localeCompare(b.name, "zh-CN");
}

function comparePlanPrice(a: ApiPlan, b: ApiPlan) {
  const displayDelta = planDisplayRank(a) - planDisplayRank(b);
  if (displayDelta !== 0) return displayDelta;

  const priceDelta = planMonthlyPriceRank(a) - planMonthlyPriceRank(b);
  if (priceDelta !== 0) return priceDelta;
  return comparePlan(a, b);
}

function planDisplayRank(plan: ApiPlan) {
  return {
    "chatgpt-plus": 0,
    "chatgpt-pro-5": 1,
    "chatgpt-pro-20": 2,
    "claude-pro": 0,
    "claude-max-5x": 1,
    "claude-max-20x": 2,
    "google-ai-plus": 0,
    "google-ai-pro": 1,
    "google-ai-ultra-5x": 2,
    "google-ai-ultra-20x": 3,
  }[plan.id] ?? 100;
}

function planMonthlyPriceRank(plan: ApiPlan) {
  return getPlanMonthlyPriceCny(plan) ?? Number.POSITIVE_INFINITY;
}

function compareModel(a: ApiModel, b: ApiModel) {
  const familyDelta = compareFamilyLabel(a.family, b.family);
  if (familyDelta !== 0) return familyDelta;

  const aIndex = modelOrder.indexOf(a.id);
  const bIndex = modelOrder.indexOf(b.id);

  if (aIndex !== -1 || bIndex !== -1) {
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  }

  return a.displayName.localeCompare(b.displayName, "zh-CN");
}

function providerTypeRank(type: ApiProviderType) {
  return {
    official: 0,
    subscription: 1,
    router: 2,
    free: 3,
  }[type];
}

function latestDate(values: string[]) {
  return values.reduce((latest, value) => (value > latest ? value : latest), "");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

const familyOrder = ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax", "MiMo", "StepFun", "图片生成", "视频生成"];

const modelOrder = [
  "gpt-5-5",
  "gpt-5-4",
  "gpt-5-4-mini",
  "gpt-5-4-nano",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "gemini-3-1-pro-preview",
  "gemini-3-1-flash-lite",
  "gemini-3-flash-preview",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "qwen3-7-max",
  "qwen3-7-plus",
  "qwen3-6-plus",
  "qwen3-5-plus",
  "qwen3-coder-plus",
  "kimi-k2-6",
  "kimi-k2-5",
  "glm-5-1",
  "glm-5",
  "minimax-m3",
  "minimax-m2-7",
  "minimax-m2-5",
  "mimo-v2-5-pro",
  "mimo-v2-5",
  "step-3-7-flash",
  "gpt-image-2",
  "nano-banana-pro",
  "nano-banana-2",
  "nano-banana",
  "nano-banana-lite",
  "sora-2-pro",
  "sora-2",
  "veo-3-1",
  "veo-3-1-lite",
  "gemini-omni-flash",
  "seedance-2-0",
  "kling-2-5-turbo",
];

const apiModelFamilySlugByName: Record<string, string> = {
  OpenAI: "openai",
  Claude: "claude",
  Gemini: "gemini",
  DeepSeek: "deepseek",
  Qwen: "qwen",
  Kimi: "kimi",
  GLM: "glm",
  MiniMax: "minimax",
  MiMo: "mimo",
  StepFun: "stepfun",
  图片生成: "image-generation",
  视频生成: "video-generation",
};

function isImageGenerationFamily(family: string) {
  return family === "图片生成" || apiModelFamilyId(family) === "image-generation";
}

function isVideoGenerationFamily(family: string) {
  return family === "视频生成" || apiModelFamilyId(family) === "video-generation";
}

function isMediaGenerationFamily(family: string) {
  return isImageGenerationFamily(family) || isVideoGenerationFamily(family);
}

function compareFamilyLabel(a: string, b: string) {
  const aIndex = familyOrder.indexOf(a);
  const bIndex = familyOrder.indexOf(b);

  if (aIndex !== -1 || bIndex !== -1) {
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  }

  return a.localeCompare(b, "zh-CN");
}

function usd(usdPerMTokens: number): ApiPriceValue {
  return { kind: "numeric", usdPerMTokens };
}

function cny(cnyPerMTokens: number): ApiPriceValue {
  return { kind: "numeric", cnyPerMTokens };
}

function dualPrice(values: { usdPerMTokens?: number; cnyPerMTokens?: number; label?: string }): ApiPriceValue {
  return { kind: "numeric", ...values };
}

function textPrice(text: string): ApiPriceValue {
  return { kind: "text", text };
}
