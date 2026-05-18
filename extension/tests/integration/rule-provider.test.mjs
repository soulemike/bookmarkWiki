import test from "node:test";
import assert from "node:assert/strict";
import { RuleBasedProvider } from "../../dist/src/providers/rule-based.js";

test("RuleBasedProvider classifies GitHub with deterministic local rules", async () => {
  const provider = new RuleBasedProvider();
  const result = await provider.classifyBookmark({ url: "https://github.com/openai/openai-node", title: "openai-node", taxonomyFolders: ["/Bookmarks Bar/Work"] });
  assert.equal(result.ok, true);
  assert.equal(result.value.target_folder, "/Bookmarks Bar/Work");
  assert.ok(result.value.tags.includes("github"));
});
