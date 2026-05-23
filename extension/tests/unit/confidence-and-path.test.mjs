import test from "node:test";
import assert from "node:assert/strict";
import { decideByConfidence } from "../../dist/src/utils/confidence.js";
import { isRootedFolderPath, parseFolderPath } from "../../dist/src/utils/folder-path.js";
import { slugify } from "../../dist/src/utils/slugify.js";
import { canTransition } from "../../dist/src/models/bookmark.js";

test("confidence policy returns hold, review, and auto move", () => {
  assert.equal(decideByConfidence(0.4), "hold");
  assert.equal(decideByConfidence(0.8), "needs_review");
  assert.equal(decideByConfidence(0.82, { reviewThreshold: 0.7, autoMoveThreshold: 0.82, mode: "auto_when_confident" }), "auto_move");
  assert.equal(decideByConfidence(0.95, { reviewThreshold: 0.7, autoMoveThreshold: 0.9, mode: "auto_when_confident" }), "auto_move");
});

test("paths, slugs, and queue transitions are validated", () => {
  assert.deepEqual(parseFolderPath("/Bookmarks Bar/Work"), ["Bookmarks Bar", "Work"]);
  assert.equal(isRootedFolderPath("Bookmarks Bar/Work"), false);
  assert.equal(slugify("CON"), "con-bookmark");
  assert.equal(slugify("A title: with / unsafe * chars"), "a-title-with-unsafe-chars");
  assert.equal(canTransition("queued", "classified"), true);
  assert.equal(canTransition("moved", "queued"), false);
});
