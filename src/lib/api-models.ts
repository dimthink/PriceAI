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
  url: string;
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

export const apiModelUpdatedAt = "2026-06-05";

export const apiModelFxSummary: ApiModelFxSummary = {
  baseCurrency: "USD",
  quoteCurrency: "CNY",
  date: "2026-06-04",
  usdToCny: 6.7739,
  source: "Frankfurter",
};

export const apiProviderTypeLabels: Record<ApiProviderType, string> = {
  official: "官方 API",
  router: "模型路由",
  free: "免费/测试",
  subscription: "订阅套餐",
};

export const apiProviderTypeDescriptions: Record<ApiProviderType, string> = {
  official: "厂商官方或云厂商公开 API，适合做价格基准。",
  router: "公开模型路由平台，重点看模型覆盖、价格变化和限流口径。",
  free: "免费或测试用途入口，必须同时关注限流、排队和可用性。",
  subscription: "按月订阅的 API 套餐，需要看额度、短周期限制和使用边界。",
};

export const apiModels: ApiModel[] = [
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
    description: "Qwen 当前高能力模型之一，适合复杂代码与 Agent 任务，首版以公开套餐覆盖为主。",
    sourceUrl: "https://dev.opencode.ai/docs/go/",
    sourceLabel: "OpenCode Go Docs",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-7-plus",
    displayName: "Qwen3.7 Plus",
    family: "Qwen",
    modelId: "qwen3.7-plus",
    description: "Qwen 的均衡版本，适合成本敏感的 Coding Agent 和日常中文开发任务。",
    sourceUrl: "https://dev.opencode.ai/docs/go/",
    sourceLabel: "OpenCode Go Docs",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor", "Claude Code"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-6-plus",
    displayName: "Qwen3.6 Plus",
    family: "Qwen",
    modelId: "qwen3.6-plus",
    description: "Qwen Plus 系列的公开套餐模型，适合中低成本编码和中文模型调用。",
    sourceUrl: "https://dev.opencode.ai/docs/go/",
    sourceLabel: "OpenCode Go Docs",
    capabilities: ["coding", "agent"],
    suitableTools: ["OpenCode", "Codex", "Cursor"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-5-plus",
    displayName: "Qwen3.5 Plus",
    family: "Qwen",
    modelId: "qwen3.5-plus",
    description: "Alibaba Model Studio Coding Plan 推荐模型之一，适合按月套餐场景。",
    sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/coding-plan",
    sourceLabel: "Alibaba Coding Plan",
    capabilities: ["vision", "coding", "agent"],
    suitableTools: ["Codex", "Claude Code", "Cursor", "OpenCode"],
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "qwen3-coder-plus",
    displayName: "Qwen3 Coder Plus",
    family: "Qwen",
    modelId: "qwen3-coder-plus",
    description: "Qwen Coder 系列模型，首版作为 Alibaba Coding Plan 覆盖模型展示。",
    sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/coding-plan",
    sourceLabel: "Alibaba Coding Plan",
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
    description: "GLM 5 系列高能力版本，首版以 OpenCode Go 等公开套餐覆盖为主。",
    sourceUrl: "https://dev.opencode.ai/docs/go/",
    sourceLabel: "OpenCode Go Docs",
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
    pricingUrl: "https://docs.bigmodel.cn/cn/guide/models/text/glm-5",
    logoUrl: "/brand-icons/glm.png",
    description: "智谱官方开放平台。首版先收录 GLM-5 模型文档，价格页仍需后续补齐。",
    limitSummary: "未公开固定 RPM/TPM，以控制台为准。",
    limitations: "当前只把 GLM-5 作为已确认模型入口展示，不在前台硬填未核准价格。",
    sourceLabel: "智谱开放文档",
    updatedAt: apiModelUpdatedAt,
  },
  {
    id: "alibaba-coding-plan",
    name: "Alibaba Model Studio Coding Plan",
    type: "subscription",
    billingMode: "订阅套餐",
    url: "https://www.alibabacloud.com/product/modelstudio",
    pricingUrl: "https://www.alibabacloud.com/help/en/model-studio/coding-plan",
    logoUrl: "/brand-icons/qwen.png",
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
    url: "https://opencode.ai/",
    pricingUrl: "https://dev.opencode.ai/docs/go/",
    logoUrl: "/brand-icons/opencode.png",
    description: "OpenCode 面向开放编码模型的低价订阅套餐，提供多模型 API endpoint。",
    limitSummary: "$12/5h · $30/week · $60/month 用量窗口。",
    limitations: "请求数取决于模型消耗；有 5 小时、每周、每月额度窗口，不能当作无限 API。",
    sourceLabel: "OpenCode Go Docs",
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
];

export const apiPlans: ApiPlan[] = [
  {
    id: "opencode-go-plan",
    providerId: "opencode-go",
    providerName: "OpenCode Go",
    name: "OpenCode Go",
    type: "subscription",
    priceLabel: "$5 首月，之后 $10/月",
    priceUsdMonthly: 10,
    url: "https://dev.opencode.ai/docs/go/",
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
    modelIds: ["deepseek-v4-flash"],
    coverageLabel: "NIM catalog 动态模型列表。",
    compatibility: ["OpenAI-compatible", "免费/测试", "中文模型"],
    suitableTools: ["Open WebUI", "自建应用", "原型验证"],
    sourceLabel: "NVIDIA NIM",
    updatedAt: apiModelUpdatedAt,
  },
];

export const apiModelOffers: ApiModelOffer[] = [
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
  offer("kimi-official-k26", "kimi-k2-6", "kimi-official", {
    routeModelId: "kimi-k2.6",
    inputPrice: textPrice("见 Kimi K2.6 定价页"),
    outputPrice: textPrice("见 Kimi K2.6 定价页"),
    cacheReadPrice: textPrice("支持自动上下文缓存"),
    freeOrPlan: "官方按 token 计费，联网搜索另计费。",
    limitations: "页面存在动态价格表，首版保留官方来源，不硬填不可校验数值。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("kimi-official-k25", "kimi-k2-5", "kimi-official", {
    routeModelId: "kimi-k2.5",
    inputPrice: textPrice("见 Kimi K2.5 定价页"),
    outputPrice: textPrice("见 Kimi K2.5 定价页"),
    cacheReadPrice: textPrice("支持自动上下文缓存"),
    freeOrPlan: "官方按 token 计费，联网搜索另计费。",
    limitations: "适合保留 K2.5 兼容或对照使用。",
    compatibility: ["OpenAI-compatible", "Coding Agent", "中文模型"],
  }),
  offer("zhipu-glm5-docs", "glm-5", "zhipu-bigmodel", {
    routeModelId: "glm-5",
    inputPrice: textPrice("官方价格待补"),
    outputPrice: textPrice("官方价格待补"),
    cacheReadPrice: textPrice("支持上下文缓存"),
    freeOrPlan: "当前作为官方模型入口收录，价格不在首版硬填。",
    limitations: "需补齐可直接引用的官方价格页后，再展示按量价格。",
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
  ...opencodeGoOffers(),
  ...alibabaCodingPlanOffers(),
  ...openRouterOffers(),
  offer("nvidia-nim-deepseek-flash", "deepseek-v4-flash", "nvidia-nim", {
    routeModelId: "deepseek-ai/deepseek-v4-flash",
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
  generatedAt: apiModelUpdatedAt,
  fxSummary: apiModelFxSummary,
  models: apiModels,
  providers: apiProviders,
  plans: apiPlans,
  offers: apiModelOffers,
};

export function formatApiPrice(price: ApiPriceValue, currency: ApiCurrency) {
  if (price.kind === "text") return price.text;

  const value =
    currency === "CNY"
      ? price.cnyPerMTokens ?? (typeof price.usdPerMTokens === "number" ? price.usdPerMTokens * apiModelFxSummary.usdToCny : undefined)
      : price.usdPerMTokens ?? (typeof price.cnyPerMTokens === "number" ? price.cnyPerMTokens / apiModelFxSummary.usdToCny : undefined);
  if (typeof value !== "number") return price.label ?? "待确认";

  const prefix = currency === "CNY" ? "¥" : "$";
  return `${prefix}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
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

export function formatPlanPrice(plan: ApiPlan, currency: ApiCurrency) {
  if (typeof plan.priceUsdMonthly !== "number") return plan.priceLabel;
  return `${formatUsdAmount(plan.priceUsdMonthly, currency)}/月 · ${plan.priceLabel}`;
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
  return dataset.models
    .filter((model) => scope === "all" || apiModelFamilyId(model.family) === scope)
    .sort((a, b) => compareModel(a, b));
}

export function getApiModel(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return dataset.models.find((model) => model.id === id) ?? null;
}

export function getApiModelSummaries(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiModelSummary[] {
  return getApiModels(scope, dataset).map((model) => buildApiModelSummary(model, dataset));
}

export function getApiModelSummary(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  const model = getApiModel(id, dataset);
  if (!model) return null;
  return buildApiModelSummary(model, dataset);
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
  return dataset.providers.find((provider) => provider.id === id) ?? null;
}

export function getApiProviderSummaries(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiProviderSummary[] {
  return getApiProviders(scope, dataset).map((provider) => buildApiProviderSummary(provider, scope, dataset));
}

export function getApiProviderSummary(id: string, dataset: ApiModelDataset = staticApiModelDataset) {
  const provider = getApiProvider(id, dataset);
  if (!provider) return null;
  return buildApiProviderSummary(provider, "all", dataset);
}

export function getApiModelOffers(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset): ApiModelOfferWithRelations[] {
  return dataset.offers
    .map((offer) => withOfferRelations(offer, dataset))
    .filter((offer): offer is ApiModelOfferWithRelations => Boolean(offer))
    .filter((offer) => scope === "all" || apiModelFamilyId(offer.model.family) === scope)
    .sort(compareOffer);
}

export function getApiModelOffersByModel(modelId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return getApiModelOffers("all", dataset).filter((offer) => offer.modelId === modelId);
}

export function getApiModelOffersByProvider(providerId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return getApiModelOffers("all", dataset).filter((offer) => offer.providerId === providerId);
}

export function getApiPlans(scope: ApiModelScope = "all", dataset: ApiModelDataset = staticApiModelDataset) {
  return dataset.plans
    .filter((plan) => {
      if (scope === "all") return true;
      if (plan.modelIds.length === 0) return true;
      return plan.modelIds.some((modelId) => {
        const model = getApiModel(modelId, dataset);
        return model ? apiModelFamilyId(model.family) === scope : false;
      });
    })
    .sort((a, b) => {
      const typeDelta = providerTypeRank(a.type) - providerTypeRank(b.type);
      if (typeDelta !== 0) return typeDelta;
      return a.name.localeCompare(b.name, "zh-CN");
    });
}

export function getApiPlansByModel(modelId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return dataset.plans.filter((plan) => plan.modelIds.includes(modelId));
}

export function getApiPlansByProvider(providerId: string, dataset: ApiModelDataset = staticApiModelDataset) {
  return dataset.plans.filter((plan) => plan.providerId === providerId);
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

function buildApiModelSummary(model: ApiModel, dataset: ApiModelDataset): ApiModelSummary {
  const offers = getApiModelOffersByModel(model.id, dataset);
  const plans = getApiPlansByModel(model.id, dataset);
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

function buildApiProviderSummary(provider: ApiProvider, scope: ApiModelScope, dataset: ApiModelDataset): ApiProviderSummary {
  const offers = getApiModelOffers(scope, dataset).filter((offer) => offer.providerId === provider.id);
  const plans = getApiPlans(scope, dataset).filter((plan) => plan.providerId === provider.id);
  const models = uniqueById([
    ...offers.map((offer) => offer.model),
    ...plans.flatMap((plan) => plan.modelIds.map((modelId) => getApiModel(modelId, dataset)).filter((model): model is ApiModel => Boolean(model))),
  ]);

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
    primaryPlan: plans[0] ?? null,
    latestUpdatedAt: latestDate([provider.updatedAt, ...offers.map((offer) => offer.updatedAt), ...plans.map((plan) => plan.updatedAt)]),
  };
}

function withOfferRelations(offer: ApiModelOffer, dataset: ApiModelDataset): ApiModelOfferWithRelations | null {
  const model = getApiModel(offer.modelId, dataset);
  const provider = getApiProvider(offer.providerId, dataset);
  if (!model || !provider) return null;

  return {
    ...offer,
    model,
    provider,
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

function opencodeGoOffers(): ApiModelOffer[] {
  const shared = {
    freeOrPlan: "OpenCode Go 套餐内消耗，5 小时/每周/每月额度窗口。",
    limitations: "请求数随模型成本变化，适合编码工具，不等同无限 API。",
    compatibility: ["OpenAI-compatible", "Anthropic-compatible", "Coding Agent", "中文模型"],
    sourceLabel: "OpenCode Go Docs",
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

function compareOffer(a: ApiModelOfferWithRelations, b: ApiModelOfferWithRelations) {
  const modelDelta = compareModel(a.model, b.model);
  if (modelDelta !== 0) return modelDelta;

  const typeDelta = providerTypeRank(a.provider.type) - providerTypeRank(b.provider.type);
  if (typeDelta !== 0) return typeDelta;

  return a.provider.name.localeCompare(b.provider.name, "zh-CN");
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

const familyOrder = ["DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax"];

const modelOrder = [
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
];

const apiModelFamilySlugByName: Record<string, string> = {
  DeepSeek: "deepseek",
  Qwen: "qwen",
  Kimi: "kimi",
  GLM: "glm",
  MiniMax: "minimax",
};

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

function textPrice(text: string): ApiPriceValue {
  return { kind: "text", text };
}
