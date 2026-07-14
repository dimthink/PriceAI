import {
  AFTERSALES_FEEDBACK_REASON,
  buildInitialFeedbackVerificationResult,
  feedbackRequiresContact,
  feedbackRequiresEvidence,
  feedbackRequiresImageEvidence,
  inferSuggestedActionForFeedback,
  shouldCreateFeedbackVerification,
} from "../src/lib/trust-risk.js";
import type { OfferFeedbackReason } from "../src/lib/types.js";

const optionalEvidenceReasons: OfferFeedbackReason[] = [
  "wrong_price",
  "item_removed",
  "stock_mismatch",
  "wrong_category",
  "other",
];

for (const reason of optionalEvidenceReasons) {
  assertEqual(feedbackRequiresEvidence(reason, "hide_offer"), false, `${reason} should not require evidence when user suggests hiding the offer`);
  assertEqual(feedbackRequiresEvidence(reason, "hide_source"), false, `${reason} should not require evidence when user suggests hiding the source`);
  assertEqual(feedbackRequiresImageEvidence(reason, "hide_offer"), false, `${reason} should not require image evidence`);
  assertEqual(feedbackRequiresContact(reason), false, `${reason} should not require contact`);
}

assertEqual(feedbackRequiresEvidence("description_mismatch", "unsure"), true, "description_mismatch should require evidence");
assertEqual(feedbackRequiresImageEvidence("description_mismatch", "unsure"), false, "description_mismatch should not require image evidence");
assertEqual(feedbackRequiresContact("description_mismatch"), false, "description_mismatch should not require contact");
assertEqual(inferSuggestedActionForFeedback("description_mismatch"), "todo", "description_mismatch should go to manual review");
assertEqual(shouldCreateFeedbackVerification("description_mismatch", "标题党", "商品页截图"), false, "description_mismatch should not enter transient verification");
assertEqual(
  buildInitialFeedbackVerificationResult({ reason: "description_mismatch", evidenceText: "商品标题和实际权益不一致" }),
  null,
  "description_mismatch should not create a recollection result",
);

const highRiskReasons: OfferFeedbackReason[] = [
  AFTERSALES_FEEDBACK_REASON,
  "fraud",
  "bad_source",
];

for (const reason of highRiskReasons) {
  assertEqual(feedbackRequiresEvidence(reason, "unsure"), true, `${reason} should require evidence`);
  assertEqual(feedbackRequiresImageEvidence(reason, "unsure"), true, `${reason} should require image evidence`);
  assertEqual(feedbackRequiresContact(reason), true, `${reason} should require contact`);
}

assertEqual(inferSuggestedActionForFeedback("wrong_price"), "recollect", "wrong_price should still suggest recollection");
assertEqual(shouldCreateFeedbackVerification("item_removed"), true, "item_removed should still enter link verification");
assertEqual(shouldCreateFeedbackVerification("stock_mismatch"), true, "stock_mismatch should still enter link verification");

console.log("feedback rules test passed");

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
