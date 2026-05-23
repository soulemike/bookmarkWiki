import test from "node:test";
import assert from "node:assert/strict";
import { BookmarkManager } from "../../dist/src/background/bookmark-manager.js";

const BOOKMARKS_BAR_ID = "1";

let nodes;

function resetChromeMock() {
  nodes = new Map([[BOOKMARKS_BAR_ID, { id: BOOKMARKS_BAR_ID, title: "Bookmarks Bar" }]]);
  globalThis.chrome = {
    bookmarks: {
      getChildren: async (id) => [...nodes.values()].filter((node) => node.parentId === id),
      create: async (bookmark) => {
        const id = `folder-${nodes.size}`;
        const node = { id, parentId: bookmark.parentId, title: bookmark.title ?? "", url: bookmark.url };
        nodes.set(id, node);
        return node;
      }
    }
  };
}

test("BookmarkManager creates default taxonomy folders used by rule-based classification", async () => {
  resetChromeMock();
  const manager = new BookmarkManager();

  await manager.ensureDefaultFolders();

  const titles = [...nodes.values()].map((node) => node.title);
  assert.ok(titles.includes("_Bookmark Queue"));
  assert.ok(titles.includes("Work"));
  assert.ok(titles.includes("Personal"));
  assert.ok(titles.includes("Reference"));
});
