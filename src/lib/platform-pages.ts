import type { Metadata } from "next";

export type PlatformIconKey = "info" | "check" | "layers" | "clock" | "database" | "shield" | "sparkles" | "zap";

export type PlatformOptionCard = {
  title: string;
  text: string;
  icon: PlatformIconKey;
};

export type PlatformLink = {
  label: string;
  href: string;
};

export type PlatformPageConfig = {
  slug: "chatgpt" | "gemini" | "claude";
  platform: string;
  iconPlatform: string;
  pageUrl: string;
  productIds: readonly string[];
  badge: string;
  title: string;
  intro: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  tableTitle: string;
  tableDescription: string;
  optionsEyebrow: string;
  optionsTitle: string;
  optionsIntro: string;
  optionCards: readonly PlatformOptionCard[];
  darkTitle: string;
  darkCards: readonly {
    title: string;
    text: string;
  }[];
  faqs: readonly (readonly [string, string])[];
  relatedTitle: string;
  relatedDescription: string;
  relatedLinks: readonly PlatformLink[];
  metadata: Metadata;
};

export const platformPageConfigs = {
  chatgpt: {
    slug: "chatgpt",
    platform: "ChatGPT",
    iconPlatform: "ChatGPT",
    pageUrl: "https://priceai.cc/platforms/chatgpt",
    productIds: [
      "chatgpt-free-account",
      "chatgpt-plus",
      "chatgpt-go",
      "chatgpt-team-business",
      "chatgpt-pro-5x",
      "chatgpt-pro-20x",
      "chatgpt-codex-service",
    ],
    badge: "ChatGPT 平台价格页",
    title: "ChatGPT 比价与订阅渠道价格",
    intro:
      "这里聚合 ChatGPT 普号、Plus、Pro、Team / Business、Plus CDK、账号购买等订阅相关报价。你可以先看当前有货最低价和更新时间，再进入工具页查看全部原始渠道。",
    primaryHref: "/?platform=ChatGPT&stock=available",
    primaryLabel: "查看 ChatGPT 有货报价",
    secondaryHref: "/?platform=ChatGPT&scope=offers&stock=available",
    secondaryLabel: "直接看全部报价",
    tableTitle: "当前收录的 ChatGPT 标准商品",
    tableDescription: "外层最低价只看有货报价。缺货或隐藏报价不会作为可购买最低价展示。",
    optionsEyebrow: "Options",
    optionsTitle: "先弄清自己要买哪一种。",
    optionsIntro:
      "同样写着 ChatGPT，可能是普通账号、Plus 日抛、短期成品号、Pro 高倍率套餐、Team / Business 团队权益、卡密或直充。先确认需求，再比价格。",
    optionCards: [
      {
        title: "普号",
        text: "通常是普通 OpenAI / ChatGPT 账号，不等于 Plus 或 Pro。适合只需要基础登录的人。",
        icon: "info",
      },
      {
        title: "Plus 试用订阅",
        text: "常见标题会写日抛、短期成品号、网页号、已接码、未接码、直充、代充、Plus CDK 或卡密，需要先分清交付方式。",
        icon: "check",
      },
      {
        title: "Go",
        text: "较低档的 ChatGPT 订阅权益，渠道里常见 Go 月卡、年卡、激活码、iOS 内购或直充。",
        icon: "zap",
      },
      {
        title: "Pro",
        text: "价格和权益更高，渠道里常见 5x、20x、100 刀、200 刀等描述，需要看清规格。",
        icon: "layers",
      },
      {
        title: "Team / Business",
        text: "团队或商业权益，渠道里常见 Team 邀请、母号、自动拉等交付方式，和 Plus 不是同一种商品。",
        icon: "clock",
      },
    ],
    darkTitle: "价格差异背后通常是路径差异。",
    darkCards: [
      {
        title: "官方订阅",
        text: "通常更稳定，但国内用户可能还要处理外币卡、Apple ID、地区限制等问题。",
      },
      {
        title: "第三方渠道",
        text: "可能更便宜，也可能有交付、售后、回收、封禁、下架等不确定性。",
      },
    ],
    faqs: [
      [
        "ChatGPT Plus 试用订阅怎么理解？",
        "PriceAI 现在把日抛、短期成品号、网页号、已接码/未接码成品号，以及 Pix/iDEAL/UPI 等低价渠道放在 ChatGPT Plus 试用订阅里；把官方路径、地区价、iOS 和卡充类放在 ChatGPT Plus 正价代充里。试用订阅通常偏短期体验或首登质保，不等于完整月卡；具体交付方式仍需要看原始商品名和原平台说明。",
      ],
      [
        "ChatGPT Plus CDK、卡密和账号购买有什么区别？",
        "Plus CDK 或卡密通常指兑换码、激活码或自助开通类商品；账号购买或成品号通常是交付一个已经带权益的账号。它们和给你自己的账号直充不是一回事，购买前要看清账号归属、有效期、售后和是否支持找回。",
      ],
      [
        "ChatGPT 代充要注意什么？",
        "代充通常是卖家帮你完成官方订阅、地区价订阅或支付操作。需要确认是给你的账号直充，还是交付成品号、卡密或其他权益，同时看清失败处理、退款条件、售后时长和是否需要提供账号信息。",
      ],
      [
        "ChatGPT Team 邀请能买吗？",
        "Team 邀请属于团队或商业权益，常见交付方式包括邀请、母号拉人或自动拉。它和个人 Plus、Pro 不同，购买前要确认团队权限、使用期限、退出规则、成员管理方式和售后范围。",
      ],
      [
        "为什么有些 ChatGPT 商品价格差很多？",
        "常见原因包括官方订阅、地区价、代订、成品号、日抛/短期号、团队权益、卡密等路径不同。PriceAI 只做信息整理，不判断某个渠道一定安全。",
      ],
      [
        "外层最低价为什么只看有货报价？",
        "缺货或下架商品即使价格更低，也不能代表当前可购买价格。所以列表和平台摘要优先使用有货最低价，缺货会在详情中明确标注。",
      ],
      [
        "PriceAI 会直接卖 ChatGPT 订阅吗？",
        "不会。PriceAI 不卖货、不收款、不参与交易，只展示来源、价格、库存状态和更新时间，最终购买需要到原平台自行判断。",
      ],
    ],
    relatedTitle: "第一次买 ChatGPT 订阅？",
    relatedDescription: "可以先理解价格为什么会分层，再看 ChatGPT 的具体获取方式；如果准备走第三方渠道，也先看风险边界。",
    relatedLinks: [
      { label: "卡网渠道靠谱吗", href: "/guides/are-ai-subscription-card-shops-reliable" },
      { label: "为什么价格不同", href: "/guides/why-ai-subscription-prices-differ" },
      { label: "查看新手指南", href: "/guides/chatgpt-subscription-options" },
    ],
    metadata: {
      title: "ChatGPT 比价与订阅渠道价格",
      description:
        "查看 ChatGPT Plus、Pro、Team 邀请、普号、Plus CDK 和账号购买的有货最低价、渠道数量、更新时间和获取方式说明。",
      alternates: {
        canonical: "/platforms/chatgpt",
      },
      openGraph: {
        title: "ChatGPT 比价与订阅渠道价格 | PriceAI",
        description: "购买 ChatGPT 订阅前，先比较 Plus、Pro、Team 邀请、普号、Plus CDK 和账号购买的价格、来源和更新时间。",
        url: "https://priceai.cc/platforms/chatgpt",
      },
    },
  },
  gemini: {
    slug: "gemini",
    platform: "Gemini",
    iconPlatform: "Gemini",
    pageUrl: "https://priceai.cc/platforms/gemini",
    productIds: ["gemini-pro-year", "gemini-pro-recharge", "gemini-ultra"],
    badge: "Gemini 平台价格页",
    title: "Gemini Pro 与 Google AI Ultra 价格对比",
    intro:
      "这里聚合 Gemini Pro 成品号、Google AI Pro 充值/开通、Gemini Ultra、Google AI Ultra、年卡、CDK 和相关渠道。你可以先看有货最低价，再结合 Google Play、官方地区价和渠道说明判断是否适合购买。",
    primaryHref: "/?platform=Gemini&stock=available",
    primaryLabel: "查看 Gemini 有货报价",
    secondaryHref: "/?platform=Gemini&scope=offers&stock=available",
    secondaryLabel: "直接看全部报价",
    tableTitle: "当前收录的 Gemini 标准商品",
    tableDescription: "Gemini 外层最低价只取有货报价；缺货、隐藏或下架报价不进入当前可买最低价。",
    optionsEyebrow: "Decision",
    optionsTitle: "先判断你要的是成品号、充值开通、Ultra，还是官方地区价路径。",
    optionsIntro:
      "Gemini 相关渠道经常把 Google AI Pro、Gemini Pro 年卡、成品号、学生资格、CDK、优惠链接、Ultra 和 Google Play 路径混在一起。先看清交付物，再看价格。",
    optionCards: [
      {
        title: "成品号",
        text: "通常是直接交付 Google / Gmail 账号或 Pixel 渠道成品号，重点看账号归属、首登、地区和售后。",
        icon: "sparkles",
      },
      {
        title: "充值/开通",
        text: "常见标题包括 Gemini Pro CDK、自助充值、优惠链接、绑卡、激活链接或代开通，重点看是否需要自备账号。",
        icon: "sparkles",
      },
      {
        title: "Gemini Ultra",
        text: "通常对应更高档权益，可能写成 Google AI Ultra、Gemini Ultra、企业 Ultra 或 Flow 积分。",
        icon: "layers",
      },
      {
        title: "Google Play",
        text: "如果走官方内购，要同时看 Google Play 国家/地区、付款资料、余额、税费和续费限制。",
        icon: "check",
      },
      {
        title: "第三方渠道",
        text: "低价可能来自地区价、学生或活动资格、成品号、CDK 或渠道库存，不一定是同一种交付。",
        icon: "shield",
      },
    ],
    darkTitle: "Gemini 价格低，不一定代表同款低。",
    darkCards: [
      {
        title: "官方路径",
        text: "官网、Google Play 和官方地区价更适合作为价格基准，但仍要看地区、税费、汇率和支付限制。",
      },
      {
        title: "渠道路径",
        text: "第三方渠道适合做价格参考，购买前要核验账号归属、续费方式、售后和退款条件。",
      },
    ],
    faqs: [
      [
        "Gemini Pro 和 Google AI Pro 是一回事吗？",
        "很多渠道会混用 Gemini Pro 和 Google AI Pro。购买前要以原渠道商品详情为准，确认它是成品账号、CDK、优惠链接、充值开通，还是其他形式。",
      ],
      [
        "Gemini Pro 年卡为什么价格差很多？",
        "常见原因包括官方地区价、学生或活动资格、第三方成品号、CDK、优惠链接、代开通和渠道库存。低价不等于同款，必须看交付方式、有效期和售后。",
      ],
      [
        "Google Play 订阅 Gemini 要注意什么？",
        "重点看 Google Play 国家/地区、付款资料、余额、礼品卡、税费、汇率和续费限制。地区价只是参考，不代表所有用户都能稳定购买。",
      ],
      [
        "Gemini Ultra 适合直接看最低价吗？",
        "不建议只看最低价。Ultra 类商品价格高、权益复杂，更应该先确认是否为 Google AI Ultra、企业权益、积分或其他形式。",
      ],
      [
        "PriceAI 会担保 Gemini 渠道吗？",
        "不会。PriceAI 只聚合来源、价格、库存状态和更新时间，最终价格、交付和售后以原平台为准。",
      ],
    ],
    relatedTitle: "准备看 Gemini 价格？",
    relatedDescription: "建议先理解 Google Play、地区价和价格分层，再回到 Gemini 报价表看当前有货渠道。",
    relatedLinks: [
      { label: "Google Play 订阅", href: "/guides/google-play-ai-subscription" },
      { label: "地区价风险", href: "/guides/ai-subscription-region-price-risks" },
      { label: "为什么价格不同", href: "/guides/why-ai-subscription-prices-differ" },
    ],
    metadata: {
      title: "Gemini Pro 与 Google AI Ultra 价格对比",
      description:
        "查看 Gemini Pro 成品号、Google AI Pro 充值/开通、Gemini Ultra、Google AI Ultra、年卡、CDK 和渠道报价的有货最低价、更新时间和购买前说明。",
      alternates: {
        canonical: "/platforms/gemini",
      },
      openGraph: {
        title: "Gemini Pro 与 Google AI Ultra 价格对比 | PriceAI",
        description: "购买 Gemini Pro 或 Google AI Ultra 前，先比较有货最低价、官方地区价、Google Play 路径和第三方渠道说明。",
        url: "https://priceai.cc/platforms/gemini",
      },
    },
  },
  claude: {
    slug: "claude",
    platform: "Claude",
    iconPlatform: "Claude",
    pageUrl: "https://priceai.cc/platforms/claude",
    productIds: [
      "claude-pro-month",
      "claude-team-standard",
      "claude-team-premium",
      "claude-max-5x",
      "claude-max-20x",
      "claude-account",
    ],
    badge: "Claude 平台价格页",
    title: "Claude Pro 与 Max 订阅渠道价格",
    intro:
      "这里聚合 Claude Pro、Claude Team Standard、Claude Team Premium、Claude Max 5x、Claude Max 20x、Claude 普号 / 兑换号等报价。你可以先看有货最低价，再结合官方参考价和第三方渠道风险判断。",
    primaryHref: "/?platform=Claude&stock=available",
    primaryLabel: "查看 Claude 有货报价",
    secondaryHref: "/?platform=Claude&scope=offers&stock=available",
    secondaryLabel: "直接看全部报价",
    tableTitle: "当前收录的 Claude 标准商品",
    tableDescription: "Claude 商品页和平台页的最低价只取有货报价；缺货或隐藏报价不会作为当前可买价格展示。",
    optionsEyebrow: "Plans",
    optionsTitle: "Claude 先分 Pro、Team、Max 和账号类。",
    optionsIntro:
      "Claude 渠道里常见 Pro 月卡、Team Standard / Premium 席位、Max 5x、Max 20x、成品号、兑换号、直充或代订。它们对应的额度和交付方式不同，不适合混在一起只看价格。",
    optionCards: [
      {
        title: "Claude Pro",
        text: "常见个人订阅档，渠道标题可能写月卡、直充、代订、成品号或地区价。",
        icon: "check",
      },
      {
        title: "Claude Team",
        text: "Standard Seat 通常对应 1.25x 标准席位，Premium Seat 通常对应 6.25x 高级席位。",
        icon: "layers",
      },
      {
        title: "Claude Max",
        text: "通常是更高额度套餐，常见 5x / 20x 等规格，需要确认具体档位和有效期。",
        icon: "layers",
      },
      {
        title: "账号 / 兑换号",
        text: "更像账号交付，不等于给你自己的账号开通订阅，要看是否可改密、可换绑和售后。",
        icon: "info",
      },
      {
        title: "官方参考价",
        text: "高价套餐更应该先看官方价格基准，再比较第三方渠道是否明显偏离。",
        icon: "clock",
      },
    ],
    darkTitle: "Claude 的核心是确认套餐档位和账号归属。",
    darkCards: [
      {
        title: "Pro / Team / Max 不混看",
        text: "Pro、Team Standard、Team Premium、Max 5x、Max 20x 的权益和价格基准不同，低价前先确认是否同款。",
      },
      {
        title: "账号交付要谨慎",
        text: "成品号或兑换号要额外看登录方式、邮箱归属、找回风险、质保和售后入口。",
      },
    ],
    faqs: [
      [
        "Claude Pro 和 Claude Max 有什么区别？",
        "Claude Pro 是常见个人订阅档，Claude Max 通常对应更高额度套餐。第三方渠道可能把 Pro、Team、Max、账号和代订混写，购买前要确认真实权益。",
      ],
      [
        "Claude Max 5x / 20x 为什么要分开？",
        "因为它们对应的额度和价格基准不同。如果只看 Claude 最低价，很容易把不同套餐混成同款。",
      ],
      [
        "Claude 成品号和直充有什么区别？",
        "成品号通常是交付一个账号；直充或代订通常是给已有账号开通权益。两者在账号归属、找回风险、售后和续费方式上不同。",
      ],
      [
        "Claude 低价渠道靠谱吗？",
        "PriceAI 不为任何渠道背书。可以把卡网当作信息源，先看售后群、联系方式、质保时间和原站投诉入口，再决定是否交易。",
      ],
      [
        "Claude 是否适合优先官方订阅？",
        "如果更看重稳定和账号安全，官方订阅通常更稳；如果看重价格，可以用 PriceAI 对比第三方渠道，但要接受相应风险。",
      ],
    ],
    relatedTitle: "准备看 Claude 渠道？",
    relatedDescription: "建议先看官方参考价和渠道判断清单，再进入 Claude 全部报价做比较。",
    relatedLinks: [
      { label: "官方地区价", href: "/official-prices" },
      { label: "卡网渠道靠谱吗", href: "/guides/are-ai-subscription-card-shops-reliable" },
      { label: "为什么价格不同", href: "/guides/why-ai-subscription-prices-differ" },
    ],
    metadata: {
      title: "Claude Pro 与 Max 订阅渠道价格",
      description:
        "查看 Claude Pro、Claude Max 5x、Claude Max 20x、Claude 普号和兑换号的有货最低价、渠道报价、官方参考价和更新时间。",
      alternates: {
        canonical: "/platforms/claude",
      },
      openGraph: {
        title: "Claude Pro 与 Max 订阅渠道价格 | PriceAI",
        description: "购买 Claude Pro 或 Claude Max 前，先比较有货最低价、官方参考价、账号交付和渠道风险。",
        url: "https://priceai.cc/platforms/claude",
      },
    },
  },
} as const satisfies Record<string, PlatformPageConfig>;

export const platformPageConfigList = Object.values(platformPageConfigs);
