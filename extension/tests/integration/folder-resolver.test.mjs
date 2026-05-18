import test from "node:test";
import assert from "node:assert/strict";
import { FolderResolver } from "../../dist/src/background/folder-resolver.js";

globalThis.chrome = { bookmarks: { getTree: async () => [{ id: "0", title: "", children: [{ id: "1", title: "Bookmarks Bar", children: [{ id: "10", title: "Work", children: [] }] }] }] } };

test("FolderResolver resolves rooted Chrome bookmark folder paths", async () => {
  const resolver = new FolderResolver();
  assert.deepEqual(await resolver.resolve("/Bookmarks Bar/Work"), { ok: true, folder: { path: "/Bookmarks Bar/Work", chromeBookmarkId: "10", root: "bookmarks_bar" } });
});

test("FolderResolver blocks missing folders", async () => {
  const resolver = new FolderResolver();
  const result = await resolver.resolve("/Bookmarks Bar/Missing");
  assert.equal(result.ok, false);
});
