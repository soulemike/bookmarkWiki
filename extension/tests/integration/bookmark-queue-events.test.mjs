import test from "node:test";
import assert from "node:assert/strict";

const BOOKMARKS_BAR_ID = "1";
const QUEUE_FOLDER_ID = "queue-folder";

let localStore;
let nodes;

class ChromeEventMock {
  listeners = [];

  addListener(callback) {
    this.listeners.push(callback);
  }
}

function resetChromeMock() {
  localStore = {};
  nodes = new Map([
    [BOOKMARKS_BAR_ID, { id: BOOKMARKS_BAR_ID, title: "Bookmarks Bar", children: [] }],
    [QUEUE_FOLDER_ID, { id: QUEUE_FOLDER_ID, parentId: BOOKMARKS_BAR_ID, title: "_Bookmark Queue", children: [] }],
    ["review-folder", { id: "review-folder", parentId: BOOKMARKS_BAR_ID, title: "_Needs Review", children: [] }],
    ["processed-folder", { id: "processed-folder", parentId: BOOKMARKS_BAR_ID, title: "_Processed", children: [] }],
    ["archive-folder", { id: "archive-folder", parentId: BOOKMARKS_BAR_ID, title: "_Archive", children: [] }]
  ]);
  globalThis.chrome = {
    bookmarks: {
      getChildren: async (id) => [...nodes.values()].filter((node) => node.parentId === id),
      create: async (bookmark) => {
        const id = `created-${nodes.size}`;
        const node = { id, parentId: bookmark.parentId, title: bookmark.title ?? "", url: bookmark.url };
        nodes.set(id, node);
        return node;
      },
      move: async (id, destination) => {
        const node = nodes.get(id);
        node.parentId = destination.parentId;
        return node;
      },
      get: async (id) => [nodes.get(id)],
      onCreated: new ChromeEventMock(),
      onRemoved: new ChromeEventMock(),
      onChanged: new ChromeEventMock(),
      onMoved: new ChromeEventMock(),
      onChildrenReordered: new ChromeEventMock()
    },
    storage: {
      local: {
        get: async (key) => key ? { [key]: localStore[key] } : { ...localStore },
        set: async (items) => { Object.assign(localStore, items); }
      }
    },
    runtime: {
      onInstalled: new ChromeEventMock(),
      onStartup: new ChromeEventMock(),
      onMessage: new ChromeEventMock(),
      sendMessage: async () => undefined
    },
    action: { onClicked: new ChromeEventMock() },
    contextMenus: { create: () => undefined, onClicked: new ChromeEventMock() },
    alarms: { create: () => undefined, onAlarm: new ChromeEventMock() },
    sidePanel: { open: async () => undefined }
  };
}

resetChromeMock();
const { handleBookmarkCreated, handleBookmarkMoved } = await import("../../dist/src/background/service-worker.js");

test("created bookmarks already inside _Bookmark Queue are queued when normal routing is off", async () => {
  resetChromeMock();
  const bookmark = { id: "bookmark-1", parentId: QUEUE_FOLDER_ID, title: "Queued manually", url: "https://example.com/manual?utm_source=test" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(nodes.get(bookmark.id).parentId, QUEUE_FOLDER_ID);
  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].chromeBookmarkId, bookmark.id);
  assert.equal(localStore.queueItems[0].status, "queued");
  assert.equal(localStore.auditLog[0].action, "create_queue_item");
});

test("bookmarks moved into _Bookmark Queue are queued when normal routing is off", async () => {
  resetChromeMock();
  const bookmark = { id: "bookmark-2", parentId: QUEUE_FOLDER_ID, title: "Moved manually", url: "https://example.com/moved" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkMoved(bookmark.id, { parentId: QUEUE_FOLDER_ID, oldParentId: BOOKMARKS_BAR_ID });

  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].chromeBookmarkId, bookmark.id);
  assert.equal(localStore.queueItems[0].source, "bookmark_event");
});

test("bookmarks outside _Bookmark Queue still require normal routing opt-in", async () => {
  resetChromeMock();
  const bookmark = { id: "bookmark-3", parentId: BOOKMARKS_BAR_ID, title: "Outside queue", url: "https://example.com/outside" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(localStore.queueItems, undefined);
});
