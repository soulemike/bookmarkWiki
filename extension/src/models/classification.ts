export type RecommendedAction = "move" | "needs_review" | "ignore" | "hold";

export type ContentType =
  | "article"
  | "documentation"
  | "repository"
  | "video"
  | "tool"
  | "reference"
  | "product"
  | "unknown";

export interface ClassificationResult {
  url: string;
  original_title: string;
  descriptive_title: string;
  summary: string;
  target_folder?: string;
  tags: string[];
  content_type: ContentType;
  audience?: "general" | "technical" | "business" | "personal" | "unknown";
  confidence: number;
  recommended_action: RecommendedAction;
  reason: string;
}

export interface ClassificationInput {
  url: string;
  title: string;
  metadata?: Record<string, string>;
  visibleText?: string;
  taxonomyFolders: string[];
}

export interface SummaryInput {
  url: string;
  title: string;
  text?: string;
}

export interface SummaryResult {
  summary: string;
}

const actions = new Set<RecommendedAction>(["move", "needs_review", "ignore", "hold"]);
const contentTypes = new Set<ContentType>([
  "article",
  "documentation",
  "repository",
  "video",
  "tool",
  "reference",
  "product",
  "unknown"
]);

export function validateClassificationResult(value: unknown): { ok: true; value: ClassificationResult } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { ok: false, errors: ["result must be an object"] };
  const item = value as Record<string, unknown>;
  const stringFields = ["url", "original_title", "descriptive_title", "summary", "reason"];
  for (const field of stringFields) {
    if (typeof item[field] !== "string") errors.push(`${field} must be a string`);
  }
  if (typeof item.recommended_action !== "string" || !actions.has(item.recommended_action as RecommendedAction)) {
    errors.push("recommended_action is invalid");
  }
  if (typeof item.content_type !== "string" || !contentTypes.has(item.content_type as ContentType)) {
    errors.push("content_type is invalid");
  }
  if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
    errors.push("confidence must be a finite number from 0 through 1");
  }
  if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string")) {
    errors.push("tags must be an array of strings");
  }
  const action = item.recommended_action as RecommendedAction;
  if ((action === "move" || action === "needs_review") && typeof item.target_folder !== "string") {
    errors.push("target_folder is required for move and needs_review");
  }
  if ((action === "move" || action === "needs_review") && (item.descriptive_title === "" || item.summary === "" || item.reason === "")) {
    errors.push("descriptive_title, summary, and reason are required for actionable recommendations");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      url: item.url as string,
      original_title: item.original_title as string,
      descriptive_title: item.descriptive_title as string,
      summary: item.summary as string,
      target_folder: typeof item.target_folder === "string" ? item.target_folder : undefined,
      tags: [...new Set((item.tags as string[]).map((tag) => tag.trim()).filter(Boolean))],
      content_type: item.content_type as ContentType,
      audience: item.audience as ClassificationResult["audience"],
      confidence: item.confidence as number,
      recommended_action: action,
      reason: item.reason as string
    }
  };
}
