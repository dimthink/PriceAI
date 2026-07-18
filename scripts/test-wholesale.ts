import {
  assessWholesaleLead,
  buildWholesaleMatchCandidates,
  groupWholesaleLeads,
  validateWholesaleLead,
  wholesaleTemplate,
  type WholesaleDirection,
  type WholesaleRole,
} from "../src/lib/wholesale.js";

assertThrows(
  () => validateWholesaleLead({
    role: "buyer",
    direction: "api_transit",
    title: "企业 API 采购",
    details: wholesaleTemplate("buyer", "api_transit"),
  }),
  "default template must not be accepted",
);

const buyerDetails = `采购身份：企业采购
想要什么：Claude Sonnet API，CCMax 号池
预计量：每月 1 万美元
心理价位/结算方式：0.6 元/美元，人民币
来源要求：披露具体号池
稳定性/测试要求：支持 100 美元测试`;
const buyerAssessment = assessWholesaleLead({
  role: "buyer",
  direction: "api_transit",
  title: "Claude API 采购",
  details: buyerDetails,
});
assertEqual(buyerAssessment.quality, "matchable", "complete buyer should be matchable");
assertEqual(buyerAssessment.details.volume, "每月 1 万美元", "buyer volume should parse");

const sellerDetails = `源头类型：CCMax 号池
可供给内容：Claude Sonnet API
稳定供给量：每月 5 万美元
起批门槛：100 美元
批发价格/结算方式：0.58 元/美元，人民币
可提供的证明：脱敏账单
测试方式：支持小额测试
售后/风险边界：未使用余额可退`;
const sellerAssessment = assessWholesaleLead({
  role: "seller",
  direction: "api_transit",
  title: "Claude API 上游",
  details: sellerDetails,
  proofUrl: "https://example.com/proof",
});
assertEqual(sellerAssessment.quality, "matchable", "complete seller should be matchable");

const sameProofHost = groupWholesaleLeads([
  { id: "a", duplicateOf: null, normalizedHost: "pay.example.com" },
  { id: "b", duplicateOf: null, normalizedHost: "pay.example.com" },
], (lead) => ({ id: lead.id, duplicateOf: lead.duplicateOf }));
assertEqual(sameProofHost.length, 2, "wholesale leads sharing a proof host must stay separate");

type TestLead = {
  id: string;
  role: WholesaleRole;
  direction: WholesaleDirection;
  title: string;
  details: string;
  reviewStatus: string;
};
const buyer: TestLead = { id: "buyer", role: "buyer", direction: "api_transit", title: "Claude API 采购", details: buyerDetails, reviewStatus: "pending" };
const matchingSeller: TestLead = { id: "seller", role: "seller", direction: "api_transit", title: "Claude API 上游", details: sellerDetails, reviewStatus: "approved" };
const unrelatedSeller: TestLead = {
  id: "other",
  role: "seller",
  direction: "subscription_channel",
  title: "ChatGPT Plus 代充",
  details: `源头类型：订阅代充\n可供给内容：ChatGPT Plus\n稳定供给量：每月 500 单\n起批门槛：10 单\n批发价格/结算方式：140 元/单\n测试方式：支持试单`,
  reviewStatus: "approved",
};
const candidates = buildWholesaleMatchCandidates(buyer, [buyer, unrelatedSeller, matchingSeller], (lead) => ({ ...lead }));
assertEqual(candidates[0]?.lead.id, "seller", "same-direction product overlap should rank first");
assertEqual(candidates.length >= 1, true, "at least one candidate should be returned");
assertEqual(candidates.some((candidate) => candidate.lead.id === "other"), false, "unrelated products must not be recommended");
assertEqual(candidates[0]?.reasons.join(" ").includes("联系方式"), false, "template labels must not become match reasons");

console.log("wholesale rules test passed");

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function assertThrows(fn: () => void, message: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}
