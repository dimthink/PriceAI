export type GuideCategoryId = "basics" | "official" | "payment" | "channels";

export type GuideCategory = {
  id: GuideCategoryId;
  label: string;
  description: string;
};

export type GuideEntry = {
  title: string;
  description: string;
  href: string;
  categoryId: GuideCategoryId;
  tags: string[];
  intent: string;
};

export type GuidePathStep = {
  href: string;
  label: string;
  description: string;
};

export type GuideReadingPath = {
  id: string;
  title: string;
  description: string;
  audience: string;
  steps: GuidePathStep[];
};

export const guideCategories: GuideCategory[] = [
  {
    id: "basics",
    label: "价格基础",
    description: "先理解官网价、地区价、代充价和渠道价为什么不同。",
  },
  {
    id: "official",
    label: "官方自助",
    description: "官网、App Store、Google Play 和地区价路径。",
  },
  {
    id: "payment",
    label: "支付方式",
    description: "支付卡、礼品卡、余额、税费和续费失败风险。",
  },
  {
    id: "channels",
    label: "渠道判断",
    description: "第三方渠道、卡网、具体平台和购买前核验。",
  },
];

export const guideEntries: GuideEntry[] = [
  {
    title: "AI 订阅价格为什么差很多",
    description: "拆开官网正价、官方地区价、资格价、代充价和第三方渠道价。",
    href: "/guides/why-ai-subscription-prices-differ",
    categoryId: "basics",
    tags: ["价格分层", "官网价", "地区价", "代充价"],
    intent: "第一次看到不同报价时，先理解价格来源。",
  },
  {
    title: "官方地区价风险",
    description: "理解低价区、税费、汇率、账户地区、付款方式和续费风险。",
    href: "/guides/ai-subscription-region-price-risks",
    categoryId: "basics",
    tags: ["地区价", "低价区", "税费", "续费"],
    intent: "想看低价区前，先判断总成本和长期稳定性。",
  },
  {
    title: "如何自己完成官方订阅",
    description: "从官网、App Store、Google Play、支付方式和售后入口理解官方路径。",
    href: "/guides/how-to-subscribe-ai-officially",
    categoryId: "official",
    tags: ["官方订阅", "官网", "App Store", "Google Play"],
    intent: "想自己订阅，而不是直接找第三方渠道。",
  },
  {
    title: "Apple ID 订阅 AI",
    description: "解释 Apple 账户地区、App Store 内购、礼品卡、余额和税费边界。",
    href: "/guides/apple-id-ai-subscription",
    categoryId: "official",
    tags: ["Apple ID", "App Store", "礼品卡", "余额"],
    intent: "准备通过 Apple 账户或 App Store 内购订阅。",
  },
  {
    title: "Google Play 订阅 AI",
    description: "解释 Google Play 国家/地区、付款资料、余额、礼品卡和订阅管理。",
    href: "/guides/google-play-ai-subscription",
    categoryId: "official",
    tags: ["Google Play", "Gemini", "付款资料", "Play 余额"],
    intent: "准备通过 Google Play 或 Android App 内购订阅。",
  },
  {
    title: "订阅 AI 需要什么支付卡",
    description: "解释 Visa、Mastercard、信用卡、借记卡、虚拟卡、预付卡和低额验证卡。",
    href: "/guides/visa-card-for-ai-subscription",
    categoryId: "payment",
    tags: ["Visa", "Mastercard", "虚拟卡", "预付卡"],
    intent: "卡在外币卡、虚拟卡、0 刀卡或续费失败问题上。",
  },
  {
    title: "AI 订阅礼品卡限制",
    description: "解释 App Store 礼品卡、Google Play 礼品卡、余额、地区绑定和退款风险。",
    href: "/guides/ai-subscription-gift-card",
    categoryId: "payment",
    tags: ["礼品卡", "Apple 余额", "Play 余额", "退款"],
    intent: "准备用礼品卡或账户余额解决支付问题。",
  },
  {
    title: "卡网渠道靠谱吗",
    description: "把卡网理解成信息源和交易入口，学习购买前的核验清单。",
    href: "/guides/are-ai-subscription-card-shops-reliable",
    categoryId: "channels",
    tags: ["卡网", "渠道", "售后", "举报"],
    intent: "准备从第三方渠道购买前，先判断风险和售后路径。",
  },
  {
    title: "ChatGPT 获取方式",
    description: "理解官方订阅、地区价、代充、成品号、Team、Plus CDK 和 API/CDK。",
    href: "/guides/chatgpt-subscription-options",
    categoryId: "channels",
    tags: ["ChatGPT", "Plus", "Pro", "Team", "CDK"],
    intent: "专门比较 ChatGPT 的各种获取方式。",
  },
];

export const guideReadingPaths: GuideReadingPath[] = [
  {
    id: "understand-price",
    title: "先搞懂价格差异",
    description: "适合第一次看到 AI 订阅报价差很多，不确定官网价、地区价、代充价和第三方渠道价怎么区分的用户。",
    audience: "小白入门",
    steps: [
      {
        href: "/guides/why-ai-subscription-prices-differ",
        label: "价格为什么不同",
        description: "先拆开官网正价、地区价、资格价、代充价和渠道价。",
      },
      {
        href: "/guides/ai-subscription-region-price-risks",
        label: "地区价能不能用",
        description: "再看低价区、税费、汇率、账户地区和续费限制。",
      },
      {
        href: "/guides/are-ai-subscription-card-shops-reliable",
        label: "第三方渠道怎么判断",
        description: "最后判断卡网渠道、售后入口、投诉路径和交易风险。",
      },
    ],
  },
  {
    id: "subscribe-officially",
    title: "自己走官方订阅",
    description: "适合想尽量走官方路径，但不清楚官网、App Store、Google Play、支付卡和礼品卡应该怎么选的用户。",
    audience: "想自己订阅",
    steps: [
      {
        href: "/guides/how-to-subscribe-ai-officially",
        label: "官方订阅总览",
        description: "先判断官网、App Store、Google Play 哪个入口更适合。",
      },
      {
        href: "/guides/visa-card-for-ai-subscription",
        label: "支付卡准备",
        description: "确认 Visa、Mastercard、虚拟卡、预付卡和续费失败风险。",
      },
      {
        href: "/guides/apple-id-ai-subscription",
        label: "Apple ID 路径",
        description: "如果走 iOS 或 App Store，先看账户地区、余额和礼品卡限制。",
      },
      {
        href: "/guides/google-play-ai-subscription",
        label: "Google Play 路径",
        description: "如果走 Android 或 Google Play，先看国家/地区和付款资料。",
      },
      {
        href: "/guides/ai-subscription-gift-card",
        label: "礼品卡限制",
        description: "用余额或礼品卡前，确认地区绑定、税费、退款和续费。",
      },
    ],
  },
  {
    id: "compare-channel",
    title: "准备买第三方渠道",
    description: "适合已经决定看第三方渠道，但还想知道怎么判断渠道、怎么比较具体商品和怎么回到报价表核验的用户。",
    audience: "准备比价购买",
    steps: [
      {
        href: "/guides/are-ai-subscription-card-shops-reliable",
        label: "先判断渠道可靠性",
        description: "把卡网看作信息源，重点看售后、商品描述和投诉入口。",
      },
      {
        href: "/guides/chatgpt-subscription-options",
        label: "再分清 ChatGPT 商品",
        description: "区分 Plus、Pro、Team、成品号、代充、CDK 和 API/CDK。",
      },
      {
        href: "/?stock=available",
        label: "回到有货报价",
        description: "最后回到 PriceAI，按有货最低价、来源和更新时间筛选。",
      },
    ],
  },
];

export function getGuideCategory(id: GuideCategoryId) {
  return guideCategories.find((category) => category.id === id);
}

export function getGuideEntry(href: string) {
  return guideEntries.find((guide) => guide.href === href);
}

export function getGuideReadingPath(id: string) {
  return guideReadingPaths.find((path) => path.id === id);
}

export function getGuideReadingPathForGuide(currentHref: string) {
  return guideReadingPaths
    .map((path) => ({
      path,
      stepIndex: path.steps.findIndex((step) => step.href === currentHref),
    }))
    .filter((item) => item.stepIndex >= 0)
    .sort((a, b) => a.stepIndex - b.stepIndex || a.path.steps.length - b.path.steps.length)[0]?.path;
}

export function getGuidePathStepEntry(step: GuidePathStep) {
  return getGuideEntry(step.href);
}

export function getRelatedGuides(currentHref: string, limit = 3) {
  const current = getGuideEntry(currentHref);
  const currentPath = getGuideReadingPathForGuide(currentHref);
  const pathGuideHrefs = currentPath?.steps.map((step) => step.href) ?? [];

  if (!current) {
    return guideEntries.filter((guide) => guide.href !== currentHref).slice(0, limit);
  }

  return guideEntries
    .filter((guide) => guide.href !== currentHref)
    .map((guide) => {
      const sharedTags = guide.tags.filter((tag) => current.tags.includes(tag)).length;
      const categoryScore = guide.categoryId === current.categoryId ? 3 : 0;
      const pathScore = pathGuideHrefs.includes(guide.href) ? 4 : 0;

      return {
        guide,
        score: pathScore + categoryScore + sharedTags,
      };
    })
    .sort((a, b) => b.score - a.score || guideEntries.indexOf(a.guide) - guideEntries.indexOf(b.guide))
    .map((item) => item.guide)
    .slice(0, limit);
}
