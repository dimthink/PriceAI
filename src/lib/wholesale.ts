export type WholesaleRole = "buyer" | "seller";
export type WholesaleDirection = "api_transit" | "subscription_channel" | "other";
export type WholesaleLeadQuality = "insufficient" | "review" | "matchable";

export type WholesaleDetails = {
  identityType: string | null;
  target: string | null;
  volume: string | null;
  budget: string | null;
  acceptableSources: string | null;
  sourceDescription: string | null;
  minimumOrder: string | null;
  pricing: string | null;
  testRequirement: string | null;
  afterSales: string | null;
  evidenceSummary: string | null;
};

export type WholesaleLeadAssessment = {
  quality: WholesaleLeadQuality;
  score: number;
  missing: string[];
  riskFlags: string[];
  details: WholesaleDetails;
};

export type WholesaleMatchCandidate<T> = {
  lead: T;
  score: number;
  reasons: string[];
  conflicts: string[];
};

const TEMPLATE_FIELDS = {
  identityType: ["采购身份", "源头类型"],
  target: ["想要什么", "可供给内容"],
  volume: ["预计量", "稳定供给量"],
  budget: ["预算/结算方式", "心理价位/结算方式"],
  acceptableSources: ["可接受的来源", "来源要求"],
  sourceDescription: ["来源/交付说明", "交付说明"],
  minimumOrder: ["起批门槛"],
  pricing: ["批发价格/结算方式"],
  testRequirement: ["验真/测试要求", "测试方式", "稳定性/测试要求"],
  afterSales: ["售后/风险边界", "售后说明", "售后要求"],
  evidenceSummary: ["可提供的证明"],
} as const;

const API_BUYER_TEMPLATE = `采购身份：企业或稳定采购方
想要什么：Claude Sonnet API，CCMax 或其他已披露号池
预计量：首次测试 100 美元，稳定后每月约 1 万美元
心理价位/结算方式：目标 0.6 元/美元，支持人民币或 USDT
来源要求：需要说明具体号池，不接受未披露混池
稳定性/测试要求：支持小额测试，模型不降级
补充说明：请把不同模型和号池分别写清楚`;

const API_SELLER_TEMPLATE = `源头类型：可披露来源的 API 上游或号池供应方
可供给内容：CCMax 号池 Claude Sonnet API，0.58 元/美元，100 美元起测，每月可供 5 万美元
稳定供给量：每月约 5 万美元
起批门槛：首次 100 美元
批发价格/结算方式：0.58 元/美元，支持人民币或 USDT
可提供的证明：脱敏账单、测试额度或历史供货记录
测试方式：支持小额测试
售后/风险边界：未使用余额可退，来源变化提前说明
补充说明：不提供 API Key、Cookie 或来源不明线路`;

const SUBSCRIPTION_BUYER_TEMPLATE = `采购身份：卡网店主、社群代理或企业采购
想要什么：ChatGPT Plus 官方正价代充，目标 135 元/单，首次 10 单，每月约 200 单
预计量：首次 10 单，每月约 200 单
心理价位/结算方式：目标 135 元/单，前期按批预付
来源要求：需要说明正价、地区价、成品号或其他交付方式
验真/测试要求：先测试 1-2 单，说明订阅和封号售后边界
补充说明：不同商品和交付方式请分别报价`;

const SUBSCRIPTION_SELLER_TEMPLATE = `源头类型：AI 订阅代充或成品号供货渠道
可供给内容：ChatGPT Plus 官方正价代充，140 元/单，10 单起批，每月约 500 单
稳定供给量：每月约 500 单
起批门槛：10 单
批发价格/结算方式：140 元/单，按批预付
可提供的证明：卡网链接、脱敏订单或历史供货记录
测试方式：支持 1-2 单测试
售后/风险边界：代充失败退款，成品号提供约定的首登保障
补充说明：不同来源和交付方式分别报价`;

const OTHER_BUYER_TEMPLATE = `采购身份：稳定采购方
想要什么：请写明具体商品、交付方式和目标价格
预计量：首次试单数量和稳定月量
心理价位/结算方式：目标价格和可接受结算方式
来源要求：需要披露的来源范围
验真/测试要求：可接受的测试方式
补充说明：其他合作要求`;

const OTHER_SELLER_TEMPLATE = `源头类型：请说明供给来源
可供给内容：具体商品、交付方式、单价、起批量和稳定月供
稳定供给量：可稳定提供的数量
起批门槛：首次起批数量
批发价格/结算方式：报价和结算方式
可提供的证明：可验证的资料摘要
测试方式：是否支持小额测试
售后/风险边界：退款、补单和失效边界
补充说明：其他合作要求`;

const DEFAULT_TEMPLATES = new Set([
  API_BUYER_TEMPLATE,
  API_SELLER_TEMPLATE,
  SUBSCRIPTION_BUYER_TEMPLATE,
  SUBSCRIPTION_SELLER_TEMPLATE,
  OTHER_BUYER_TEMPLATE,
  OTHER_SELLER_TEMPLATE,
]);

const RISK_PATTERNS: Array<[RegExp, string]> = [
  [/(盗刷|黑卡|拒付|撞库|盗号)/i, "疑似违规来源"],
  [/(cookie|session|账号共享访问)/i, "涉及敏感凭据"],
  [/(不支持|不能).{0,6}(测试|试单)/i, "不支持小额测试"],
  [/(来源不明|不披露|混池)/i, "来源披露不足"],
];

const DOMAIN_MATCH_TERMS = [
  "chatgpt", "gpt", "claude", "gemini", "grok", "codex", "kiro", "poe", "telegram",
  "sonnet", "opus", "ccmax", "k12", "api", "plus", "pro", "max", "team", "business",
  "接码", "代充", "成品号", "普通号", "普号", "母号", "子号", "实体卡", "会员", "号池", "中转",
  "卡密", "cdk", "json", "邮箱", "反重力", "antigravity",
] as const;

export function wholesaleTemplate(role: WholesaleRole, direction: WholesaleDirection): string {
  if (direction === "api_transit") return role === "buyer" ? API_BUYER_TEMPLATE : API_SELLER_TEMPLATE;
  if (direction === "subscription_channel") {
    return role === "buyer" ? SUBSCRIPTION_BUYER_TEMPLATE : SUBSCRIPTION_SELLER_TEMPLATE;
  }
  return role === "buyer" ? OTHER_BUYER_TEMPLATE : OTHER_SELLER_TEMPLATE;
}

export function isDefaultWholesaleTemplate(value: string): boolean {
  return DEFAULT_TEMPLATES.has(value.trim());
}

export function parseWholesaleDetails(value: string): WholesaleDetails {
  const parsed = parseLabeledText(value);
  return {
    identityType: firstField(parsed, TEMPLATE_FIELDS.identityType),
    target: firstField(parsed, TEMPLATE_FIELDS.target),
    volume: firstField(parsed, TEMPLATE_FIELDS.volume),
    budget: firstField(parsed, TEMPLATE_FIELDS.budget),
    acceptableSources: firstField(parsed, TEMPLATE_FIELDS.acceptableSources),
    sourceDescription: firstField(parsed, TEMPLATE_FIELDS.sourceDescription),
    minimumOrder: firstField(parsed, TEMPLATE_FIELDS.minimumOrder),
    pricing: firstField(parsed, TEMPLATE_FIELDS.pricing),
    testRequirement: firstField(parsed, TEMPLATE_FIELDS.testRequirement),
    afterSales: firstField(parsed, TEMPLATE_FIELDS.afterSales),
    evidenceSummary: firstField(parsed, TEMPLATE_FIELDS.evidenceSummary),
  };
}

export function assessWholesaleLead(input: {
  role: WholesaleRole;
  direction: WholesaleDirection;
  title?: string | null;
  details: string;
  proofUrl?: string | null;
}): WholesaleLeadAssessment {
  const details = parseWholesaleDetails(input.details);
  const missing: string[] = [];
  const defaultTemplate = isDefaultWholesaleTemplate(input.details);

  if (defaultTemplate) missing.push("请把示例内容替换成你的真实需求或供给");
  if (!details.target || details.target.length < 4) missing.push(input.role === "buyer" ? "具体采购内容" : "具体供给内容");
  if (!details.volume) missing.push(input.role === "buyer" ? "预计采购量" : "稳定供给量");
  if (input.role === "buyer" && !details.budget) missing.push("预算或心理价位");
  if (input.role === "seller" && !details.pricing) missing.push("批发价格和结算方式");
  if (input.role === "seller" && !details.minimumOrder) missing.push("起批门槛");

  const supportingFields = [
    details.acceptableSources,
    details.sourceDescription,
    details.testRequirement,
    details.afterSales,
    details.evidenceSummary,
    input.proofUrl,
  ].filter(Boolean).length;
  const requiredTotal = input.role === "buyer" ? 3 : 4;
  const requiredFilled = requiredTotal - missing.filter((item) => !item.startsWith("请把示例")).length;
  const score = Math.max(0, Math.min(100, requiredFilled * 20 + supportingFields * 5 - (defaultTemplate ? 40 : 0)));
  const riskFlags = RISK_PATTERNS.filter(([pattern]) => pattern.test(input.details)).map(([, label]) => label);
  const quality: WholesaleLeadQuality = missing.length
    ? "insufficient"
    : supportingFields >= 2 && !riskFlags.includes("疑似违规来源")
      ? "matchable"
      : "review";

  return { quality, score, missing: unique(missing), riskFlags: unique(riskFlags), details };
}

export function validateWholesaleLead(input: Parameters<typeof assessWholesaleLead>[0]): WholesaleLeadAssessment {
  const assessment = assessWholesaleLead(input);
  if (assessment.quality === "insufficient") {
    throw new Error(`还需要补充：${assessment.missing.join("、")}。`);
  }
  return assessment;
}

export function buildWholesaleMatchCandidates<T>(
  selected: T,
  leads: T[],
  read: (lead: T) => {
    id: string;
    role: WholesaleRole | null;
    direction: WholesaleDirection | null;
    title: string;
    details: string;
    proofUrl?: string | null;
    reviewStatus: string;
  },
): Array<WholesaleMatchCandidate<T>> {
  const source = read(selected);
  if (!source.role || !source.direction) return [];
  const sourceTokens = matchTokens(`${source.title}\n${source.details}`);

  return leads
    .filter((lead) => {
      const candidate = read(lead);
      return candidate.id !== source.id && candidate.role && candidate.role !== source.role && candidate.reviewStatus !== "rejected";
    })
    .map((lead) => {
      const candidate = read(lead);
      const candidateRole = candidate.role as WholesaleRole;
      const candidateDirection = candidate.direction as WholesaleDirection;
      const assessment = assessWholesaleLead({ ...candidate, role: candidateRole, direction: candidateDirection });
      const overlap = matchTokens(`${candidate.title}\n${candidate.details}`).filter((token) => sourceTokens.includes(token));
      const reasons: string[] = [];
      const conflicts: string[] = [];
      let score = 0;

      if (candidateDirection === source.direction) {
        score += 35;
        reasons.push("业务方向一致");
      } else {
        conflicts.push("业务方向不同");
      }
      if (overlap.length) {
        score += Math.min(45, overlap.length * 9);
        reasons.push(`共同关键词：${overlap.slice(0, 4).join("、")}`);
      } else {
        conflicts.push("暂未识别到共同商品或模型");
      }
      if (assessment.quality === "matchable") {
        score += 15;
        reasons.push("对方资料可直接初筛");
      } else if (assessment.quality === "insufficient") {
        score -= 20;
        conflicts.push(`对方缺少：${assessment.missing.slice(0, 2).join("、")}`);
      }
      if (candidate.proofUrl) {
        score += 5;
        reasons.push("带证明链接");
      }
      if (assessment.riskFlags.length) conflicts.push(...assessment.riskFlags);

      return { lead, score: Math.max(0, Math.min(100, score)), reasons: unique(reasons), conflicts: unique(conflicts) };
    })
    .filter((candidate) => candidate.score >= 25 && candidate.reasons.some((reason) => reason.startsWith("共同关键词：")))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

export function groupWholesaleLeads<T>(
  leads: T[],
  read: (lead: T) => { id: string; duplicateOf: string | null; duplicateCount?: number },
): T[] {
  const byId = new Map(leads.map((lead) => [read(lead).id, lead]));
  const groups = new Map<string, T[]>();
  for (const lead of leads) {
    const value = read(lead);
    const key = value.duplicateOf && byId.has(value.duplicateOf) ? value.duplicateOf : value.id;
    groups.set(key, [...(groups.get(key) || []), lead]);
  }
  return Array.from(groups.values()).map((group) => {
    const root = group.find((lead) => !read(lead).duplicateOf) || group[0];
    return root;
  });
}

function parseLabeledText(value: string): Map<string, string> {
  const result = new Map<string, string>();
  let activeLabel: string | null = null;
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([^：:]{2,20})[：:]\s*(.*)$/);
    if (match) {
      activeLabel = match[1].trim();
      result.set(activeLabel, match[2].trim());
      continue;
    }
    if (activeLabel) result.set(activeLabel, [result.get(activeLabel), line].filter(Boolean).join("\n"));
  }
  return result;
}

function firstField(parsed: Map<string, string>, labels: readonly string[]): string | null {
  for (const label of labels) {
    const value = parsed.get(label)?.trim();
    if (value) return value;
  }
  return null;
}

function matchTokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/^[^：:\n]{2,20}[：:]\s*/gm, " ");
  return DOMAIN_MATCH_TERMS.filter((term) => normalized.includes(term));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
