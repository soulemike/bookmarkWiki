export interface ConfidencePolicy {
  reviewThreshold: number;
  autoMoveThreshold: number;
  mode: "review_only" | "auto_when_confident";
}

export type ConfidenceDecision = "hold" | "needs_review" | "auto_move";

export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = {
  reviewThreshold: 0.7,
  autoMoveThreshold: 0.9,
  mode: "review_only"
};

export function decideByConfidence(confidence: number, policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY): ConfidenceDecision {
  if (confidence < policy.reviewThreshold) return "hold";
  if (policy.mode === "review_only" || confidence < policy.autoMoveThreshold) return "needs_review";
  return "auto_move";
}
