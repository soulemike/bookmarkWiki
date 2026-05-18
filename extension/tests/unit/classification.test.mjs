import test from "node:test";
import assert from "node:assert/strict";
import { validateClassificationResult } from "../../dist/src/models/classification.js";

test("validateClassificationResult accepts and normalizes valid output", () => {
  const result = validateClassificationResult({ url: "https://example.com", original_title: "Example", descriptive_title: "Example: Reference", summary: "Summary", target_folder: "/Bookmarks Bar/Reference", tags: [" docs ", "docs"], content_type: "reference", confidence: 0.9, recommended_action: "move", reason: "Strong match" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.tags, ["docs"]);
});

test("validateClassificationResult rejects actionable output without target_folder", () => {
  const result = validateClassificationResult({ url: "https://example.com", original_title: "Example", descriptive_title: "Example", summary: "Summary", tags: [], content_type: "reference", confidence: 0.9, recommended_action: "move", reason: "Reason" });
  assert.equal(result.ok, false);
});
