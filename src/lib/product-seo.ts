import type { ExplorerProductSummary } from "@/lib/types";

export type ProductSeoProfile = {
  metadataTitle: string;
  metadataDescription: string;
  faq: Array<{
    question: string;
    answer: string;
  }>;
};

type ProductSeoProfileInput = Omit<ProductSeoProfile, "faq"> & Partial<Pick<ProductSeoProfile, "faq">>;

function profile(input: ProductSeoProfileInput): ProductSeoProfile {
  return {
    faq: [],
    ...input,
  };
}

const productSeoProfiles: Record<string, ProductSeoProfile> = {
  "chatgpt-free-account": profile({
    metadataTitle: "ChatGPT 普号价格对比：成品账号、体验号和渠道报价",
    metadataDescription: "查看 ChatGPT 普号、OpenAI 账号、体验号、成品账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "chatgpt-plus": profile({
    metadataTitle: "ChatGPT Plus 价格对比：日抛、Codex Plus、代充、成品号和 CDK",
    metadataDescription: "查看 ChatGPT Plus 有货最低价、日抛、Codex Plus、Plus 代充、成品号、卡密/CDK、库存、来源和更新时间。",
  }),
  "chatgpt-plus-recharge": profile({
    metadataTitle: "ChatGPT Plus 充值代充价格对比：直充、代开、卡密和渠道报价",
    metadataDescription: "查看 ChatGPT Plus 充值代充有货最低价、直充、代开、卡密/CDK、渠道报价、库存和更新时间。",
  }),
  "chatgpt-go": profile({
    metadataTitle: "ChatGPT Go 价格对比：月卡、年卡、激活码和渠道报价",
    metadataDescription: "查看 ChatGPT Go 有货最低价、月卡、年卡、激活码、直充、内购渠道报价、库存和更新时间。",
  }),
  "chatgpt-team-business": profile({
    metadataTitle: "ChatGPT Team / Business 价格对比：Bug Team、团队邀请、母号和渠道报价",
    metadataDescription: "查看 ChatGPT Team / Business、Bug Team、团队邀请、母号、自动拉的有货最低价、渠道报价、库存和更新时间。",
  }),
  "chatgpt-pro-5x": profile({
    metadataTitle: "ChatGPT Pro 5x 价格对比：Pro 会员、代开和渠道报价",
    metadataDescription: "查看 ChatGPT Pro 5x 有货最低价、Pro 会员、代开、充值、卡密、渠道报价、官方参考价和更新时间。",
  }),
  "chatgpt-pro-20x": profile({
    metadataTitle: "ChatGPT Pro 20x 价格对比：Pro 高额度、代开和渠道报价",
    metadataDescription: "查看 ChatGPT Pro 20x 有货最低价、Pro 高额度、代开、卡密、渠道报价、官方参考价和更新时间。",
  }),
  "openai-api-cdk": profile({
    metadataTitle: "API / CDK / 额度价格对比：OpenAI API、Codex API 和渠道额度",
    metadataDescription: "查看 API/CDK、OpenAI API、Codex API、余额、额度和模型中转渠道报价。",
  }),
  "gemini-pro-year": profile({
    metadataTitle: "Gemini Pro 成品号价格对比：Google AI Pro 账号、年卡和渠道报价",
    metadataDescription: "查看 Gemini Pro / Google AI Pro 成品号有货最低价、账号、年卡、渠道报价和更新时间。",
  }),
  "gemini-pro-recharge": profile({
    metadataTitle: "Gemini Pro 充值/开通价格对比：CDK、优惠链接和代开通渠道",
    metadataDescription: "查看 Gemini Pro / Google AI Pro 充值开通、CDK、优惠链接、绑卡和代开通渠道报价。",
  }),
  "gemini-ultra": profile({
    metadataTitle: "Gemini Ultra 价格对比：Google AI Ultra、充值开通和渠道报价",
    metadataDescription: "查看 Google AI Ultra / Gemini Ultra 有货最低价、充值开通、成品号、渠道报价、官方参考价和更新时间。",
  }),
  "claude-pro-month": profile({
    metadataTitle: "Claude Pro 价格对比：月卡、直充、成品号和渠道报价",
    metadataDescription: "查看 Claude Pro 有货最低价、月卡、直充、成品号、渠道报价、官方参考价和更新时间。",
  }),
  "claude-team-premium": profile({
    metadataTitle: "Claude Team Premium 价格对比：高级团队席位和渠道报价",
    metadataDescription: "查看 Claude Team Premium 有货最低价、高级团队席位、邀请、母号、渠道报价、库存和更新时间。",
  }),
  "claude-team-standard": profile({
    metadataTitle: "Claude Team Standard 价格对比：标准团队席位和渠道报价",
    metadataDescription: "查看 Claude Team Standard 有货最低价、标准团队席位、邀请、母号、渠道报价、库存和更新时间。",
  }),
  "claude-max-20x": profile({
    metadataTitle: "Claude Max 20x 价格对比：高额度套餐、月卡和渠道报价",
    metadataDescription: "查看 Claude Max 20x 有货最低价、高额度套餐、月卡、直充、成品号、渠道报价和官方参考价。",
  }),
  "claude-max-5x": profile({
    metadataTitle: "Claude Max 5x 价格对比：Max 会员、月卡和渠道报价",
    metadataDescription: "查看 Claude Max 5x 有货最低价、Max 会员、月卡、直充、成品号、渠道报价和官方参考价。",
  }),
  "claude-account": profile({
    metadataTitle: "Claude 普号价格对比：兑换号、成品账号和渠道报价",
    metadataDescription: "查看 Claude 普号、兑换号、成品账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "super-grok": profile({
    metadataTitle: "Super Grok 价格对比：Grok 会员、激活码、月卡和渠道报价",
    metadataDescription: "查看 Super Grok 有货最低价、Grok 会员、激活码、月卡、年卡、渠道报价和官方地区价。",
  }),
  "grok-account": profile({
    metadataTitle: "Grok 普号价格对比：体验号、成品账号和渠道报价",
    metadataDescription: "查看 Grok 普号、体验号、X / Grok 账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "gmail-account": profile({
    metadataTitle: "Gmail 批发价格对比：Google 邮箱、账号和渠道报价",
    metadataDescription: "查看 Gmail / Google 邮箱有货最低价、批发账号、渠道报价、库存、来源和更新时间。",
  }),
  "outlook-account": profile({
    metadataTitle: "Outlook 邮箱价格对比：Hotmail、微软邮箱和渠道报价",
    metadataDescription: "查看 Outlook / Hotmail / Microsoft 邮箱有货最低价、批发账号、渠道报价、库存和更新时间。",
  }),
  "education-email": profile({
    metadataTitle: "教育邮箱价格对比：Edu 邮箱、学校邮箱和渠道报价",
    metadataDescription: "查看教育邮箱、Edu 邮箱、学校邮箱渠道的有货最低价、库存、来源和更新时间。",
  }),
  "email-account": profile({
    metadataTitle: "其他邮箱价格对比：域名邮箱、账号和渠道报价",
    metadataDescription: "查看其他邮箱、域名邮箱、账号渠道的有货最低价、库存、来源和更新时间。",
  }),
  "apple-id-account": profile({
    metadataTitle: "Apple ID 价格对比：苹果账号、订阅辅助和渠道报价",
    metadataDescription: "查看 Apple ID / 苹果账号有货最低价、账号渠道报价、库存、来源和更新时间，辅助理解 App Store 订阅路径。",
  }),
  "virtual-card": profile({
    metadataTitle: "虚拟卡价格对比：Visa、MasterCard、绑卡和渠道报价",
    metadataDescription: "查看虚拟卡、Visa、MasterCard、绑卡相关渠道的有货最低价、库存、来源和更新时间。",
  }),
  "openai-phone-verification": profile({
    metadataTitle: "OpenAI ChatGPT 接码价格对比：手机号验证和渠道报价",
    metadataDescription: "查看 OpenAI / ChatGPT 接码、手机号验证服务的有货最低价、渠道报价、库存和更新时间。",
  }),
  "google-phone-verification": profile({
    metadataTitle: "Google Gemini 接码价格对比：Google 验证、Gmail 接码和渠道报价",
    metadataDescription: "查看 Google / Gmail / Gemini 接码服务有货最低价、渠道报价、库存、来源和更新时间。",
  }),
  "paypal-phone-verification": profile({
    metadataTitle: "PayPal 接码价格对比：手机号验证和渠道报价",
    metadataDescription: "查看 PayPal 接码、手机号验证服务的有货最低价、渠道报价、库存和更新时间。",
  }),
  "phone-verification": profile({
    metadataTitle: "接码价格对比：短信验证、手机号验证和渠道报价",
    metadataDescription: "查看通用接码、短信验证、手机号验证服务的有货最低价、渠道报价、库存和更新时间。",
  }),
  "identity-verification": profile({
    metadataTitle: "真人 / KYC 验证价格对比：人脸、实名和 Persona 验证服务",
    metadataDescription: "查看真人 / KYC 验证、人脸验证、实名认证、Persona 验证服务的有货最低价、渠道报价、库存和更新时间。",
  }),
  "cursor-account": profile({
    metadataTitle: "Cursor 账号价格对比：会员账号、成品号和渠道报价",
    metadataDescription: "查看 Cursor 账号、会员账号、成品号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "kiro-account": profile({
    metadataTitle: "Kiro 账号价格对比：会员账号、成品号和渠道报价",
    metadataDescription: "查看 Kiro 账号、会员账号、成品号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "windsurf-account": profile({
    metadataTitle: "Windsurf 账号价格对比：AI 编程工具账号和渠道报价",
    metadataDescription: "查看 Windsurf 账号、AI 编程工具账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "perplexity-account": profile({
    metadataTitle: "Perplexity 账号价格对比：会员账号、Pro 账号和渠道报价",
    metadataDescription: "查看 Perplexity 账号、Pro 账号、会员账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "suno-account": profile({
    metadataTitle: "Suno 账号价格对比：音乐生成账号、会员账号和渠道报价",
    metadataDescription: "查看 Suno 账号、会员账号、音乐生成工具账号的有货最低价、渠道报价、库存和更新时间。",
  }),
  "x-twitter-account": profile({
    metadataTitle: "X / 推特账号价格对比：Twitter 账号、Premium 和渠道报价",
    metadataDescription: "查看 X / Twitter / 推特账号、Premium 相关账号的有货最低价、渠道报价、库存和更新时间。",
  }),
};

export function getProductSeoProfile(product: Pick<ExplorerProductSummary, "id" | "slug">): ProductSeoProfile | null {
  return productSeoProfiles[product.id] || productSeoProfiles[product.slug] || null;
}

export function shouldNoIndexProduct(product: Pick<ExplorerProductSummary, "id" | "slug">): boolean {
  return product.id === "other-product" || product.slug === "other-product";
}
