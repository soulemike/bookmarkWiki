import test from "node:test";
import assert from "node:assert/strict";
import { SyncDispatcher } from "../../dist/src/background/sync-dispatcher.js";

let localStore;
let nativeRequest;

function resetChromeMock(settings) {
  nativeRequest = undefined;
  localStore = { settings };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => key ? { [key]: localStore[key] } : { ...localStore },
        set: async (items) => { Object.assign(localStore, items); }
      }
    },
    runtime: {
      sendNativeMessage: async (_hostName, request) => {
        nativeRequest = request;
        return { requestId: request.requestId, ok: true, message: "Wrote 3 file(s).", writtenFiles: request.files.map((file) => file.relativePath) };
      }
    }
  };
}

test("SyncDispatcher skips native messaging when disabled", async () => {
  resetChromeMock({ enableNativeHostSync: false, nativeHostTargetPath: "C:\\Bookmarks" });
  const result = await new SyncDispatcher().dispatchIfEnabled(bookmarkItem());

  assert.equal(result.ok, true);
  assert.equal(result.status, "disabled");
  assert.equal(nativeRequest, undefined);
});

test("SyncDispatcher sends Windows target path and hashed bookmark files", async () => {
  resetChromeMock({ enableNativeHostSync: true, nativeHostTargetPath: "C:\\Users\\mike\\Documents\\BookmarkWiki" });

  const result = await new SyncDispatcher().dispatchIfEnabled(bookmarkItem());

  assert.equal(result.ok, true);
  assert.equal(result.status, "synced");
  assert.equal(nativeRequest.action, "write_kb");
  assert.equal(nativeRequest.targetPath, "C:\\Users\\mike\\Documents\\BookmarkWiki");
  assert.equal(nativeRequest.files.length, 3);
  assert.ok(nativeRequest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.ok(nativeRequest.files.some((file) => file.relativePath.endsWith(".md")));
  assert.ok(nativeRequest.files.some((file) => file.relativePath.startsWith("indexes/recent/") && file.relativePath.endsWith(".ndjson")));
});

function bookmarkItem() {
  return {
    id: "queue-1",
    chromeBookmarkId: "bookmark-1",
    url: "https://example.com/docs",
    normalizedUrl: "https://example.com/docs",
    originalTitle: "Example Docs",
    proposedTitle: "Example Docs Reference",
    finalTitle: "Example Docs Reference",
    source: "bookmark_event",
    status: "moved",
    proposedFolder: "/Bookmarks Bar/Reference",
    finalFolder: "/Bookmarks Bar/Reference",
    confidence: 0.91,
    tags: ["example", "docs"],
    summary: "Reference documentation.",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    processedAt: new Date(1).toISOString(),
    attemptCount: 1
  };
}
