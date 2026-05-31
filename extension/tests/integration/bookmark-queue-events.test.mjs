import test from "node:test";
import assert from "node:assert/strict";

const BOOKMARKS_BAR_ID = "1";
const QUEUE_FOLDER_ID = "queue-folder";

let localStore;
let nodes;
let createdAlarms;

class ChromeEventMock {
  listeners = [];

  addListener(callback) {
    this.listeners.push(callback);
  }
}

function resetChromeMock() {
  localStore = {};
  createdAlarms = [];
  nodes = new Map([
    [BOOKMARKS_BAR_ID, { id: BOOKMARKS_BAR_ID, title: "Bookmarks Bar", children: [] }],
    [QUEUE_FOLDER_ID, { id: QUEUE_FOLDER_ID, parentId: BOOKMARKS_BAR_ID, title: "_Bookmark Queue", children: [] }],
    ["review-folder", { id: "review-folder", parentId: BOOKMARKS_BAR_ID, title: "_Needs Review", children: [] }],
    ["processed-folder", { id: "processed-folder", parentId: BOOKMARKS_BAR_ID, title: "_Processed", children: [] }],
    ["archive-folder", { id: "archive-folder", parentId: BOOKMARKS_BAR_ID, title: "_Archive", children: [] }],
    ["work-folder", { id: "work-folder", parentId: BOOKMARKS_BAR_ID, title: "Work", children: [] }],
    ["personal-folder", { id: "personal-folder", parentId: BOOKMARKS_BAR_ID, title: "Personal", children: [] }],
    ["reference-folder", { id: "reference-folder", parentId: BOOKMARKS_BAR_ID, title: "Reference", children: [] }]
  ]);
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [{ id: "0", title: "", children: [treeNode(BOOKMARKS_BAR_ID)] }],
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
    alarms: { create: (name, info) => { createdAlarms.push({ name, info }); }, onAlarm: new ChromeEventMock() },
    sidePanel: { open: async () => undefined }
  };
}

function treeNode(id) {
  const node = nodes.get(id);
  return { ...node, children: [...nodes.values()].filter((child) => child.parentId === id).map((child) => treeNode(child.id)) };
}

resetChromeMock();
const { handleActionClicked, handleBookmarkCreated, handleBookmarkMoved, handleContextMenuClicked, handleInstalled, handleStartup, kickQueueProcessing, preserveOAuthSessionForSettingsSave } = await import("../../dist/src/background/service-worker.js");

function queuedItem(suffix) {
  return {
    id: `queue-${suffix}`,
    chromeBookmarkId: `bookmark-${suffix}`,
    url: `https://example.com/${suffix}`,
    normalizedUrl: `https://example.com/${suffix}`,
    originalTitle: `Example ${suffix}`,
    source: "bookmark_event",
    status: "queued",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    attemptCount: 0
  };
}

test("settings save preserves an active ChatGPT OAuth session", () => {
  const savedConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    access_token: "saved-access-token",
    refresh_token: "saved-refresh-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  const savedAfterOptionsChange = {
    provider: "openai-chatgpt-oauth",
    base_url: savedConfig.base_url,
    model: "gpt-5.5",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };

  const preserved = preserveOAuthSessionForSettingsSave(savedAfterOptionsChange, savedConfig);

  assert.equal(preserved.access_token, "saved-access-token");
  assert.equal(preserved.refresh_token, "saved-refresh-token");
  assert.equal(preserved.expires_at, "2099-01-01T00:00:00.000Z");
});

test("settings save does not preserve legacy ChatGPT OAuth sessions", () => {
  const savedConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    access_token: "saved-access-token",
    client_id: "legacy-client",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  const savedAfterOptionsChange = {
    provider: "openai-chatgpt-oauth",
    base_url: savedConfig.base_url,
    model: "gpt-5.5",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };

  const preserved = preserveOAuthSessionForSettingsSave(savedAfterOptionsChange, savedConfig);

  assert.equal("access_token" in preserved, false);
});

test("settings save keeps refreshed ChatGPT OAuth tokens over stale incoming tokens", () => {
  const savedConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    access_token: "refreshed-access-token",
    refresh_token: "refreshed-refresh-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  const staleOptionsPageConfig = {
    ...savedConfig,
    access_token: "stale-access-token",
    refresh_token: "stale-refresh-token",
    expires_at: "2000-01-01T00:00:00.000Z"
  };

  const preserved = preserveOAuthSessionForSettingsSave(staleOptionsPageConfig, savedConfig);

  assert.equal(preserved.access_token, "refreshed-access-token");
  assert.equal(preserved.refresh_token, "refreshed-refresh-token");
  assert.equal(preserved.expires_at, "2099-01-01T00:00:00.000Z");
});

test("settings save cannot resurrect a disconnected ChatGPT OAuth session", () => {
  const disconnectedConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  const staleOptionsPageConfig = {
    ...disconnectedConfig,
    access_token: "stale-access-token",
    refresh_token: "stale-refresh-token",
    expires_at: "2099-01-01T00:00:00.000Z"
  };

  const preserved = preserveOAuthSessionForSettingsSave(staleOptionsPageConfig, disconnectedConfig);

  assert.equal("access_token" in preserved, false);
  assert.equal("refresh_token" in preserved, false);
  assert.equal("expires_at" in preserved, false);
});

test("settings save does not carry ChatGPT OAuth tokens across changed base URLs", () => {
  const savedConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    access_token: "saved-access-token",
    refresh_token: "saved-refresh-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  const changedBaseUrlConfig = {
    ...savedConfig,
    base_url: "https://example.test/backend-api/codex"
  };

  const preserved = preserveOAuthSessionForSettingsSave(changedBaseUrlConfig, savedConfig);

  assert.equal("access_token" in preserved, false);
  assert.equal("refresh_token" in preserved, false);
  assert.equal("expires_at" in preserved, false);
});

test("install repairs queue processing alarm", async () => {
  resetChromeMock();

  await handleInstalled();

  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("startup repairs alarm and processes an existing queued item", async () => {
  resetChromeMock();
  localStore.queueItems = [queuedItem("startup")];

  await handleStartup();

  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
  assert.notEqual(localStore.queueItems[0].status, "queued");
});

test("action click enqueues active tab and starts processing", async () => {
  resetChromeMock();

  await handleActionClicked({ windowId: 1, url: "https://example.com/action", title: "Action bookmark" });

  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].source, "current_tab");
  assert.notEqual(localStore.queueItems[0].status, "queued");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("context menu enqueues link and starts processing", async () => {
  resetChromeMock();

  await handleContextMenuClicked({ menuItemId: "add-link-to-bookmark-queue", linkUrl: "https://example.com/context", selectionText: "Context bookmark" });

  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].source, "context_menu");
  assert.notEqual(localStore.queueItems[0].status, "queued");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("created bookmarks already inside _Bookmark Queue move to review after processing", async () => {
  resetChromeMock();
  const bookmark = { id: "bookmark-1", parentId: QUEUE_FOLDER_ID, title: "Queued manually", url: "https://example.com/manual?utm_source=test" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(nodes.get(bookmark.id).parentId, "review-folder");
  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].chromeBookmarkId, bookmark.id);
  assert.notEqual(localStore.queueItems[0].status, "queued");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
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
  assert.equal(localStore.queueItems[0].status, "needs_review");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("bookmarks outside _Bookmark Queue still require normal routing opt-in", async () => {
  resetChromeMock();
  const bookmark = { id: "bookmark-3", parentId: BOOKMARKS_BAR_ID, title: "Outside queue", url: "https://example.com/outside" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(localStore.queueItems, undefined);
});

test("created bookmarks in normal folders move to review after processing when normal routing is on", async () => {
  resetChromeMock();
  localStore.settings = { routeNormalBookmarks: true };
  const bookmark = { id: "bookmark-4", parentId: "work-folder", title: "Work bookmark", url: "https://example.com/work" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(nodes.get(bookmark.id).parentId, "review-folder");
  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].chromeBookmarkId, bookmark.id);
  assert.equal(localStore.queueItems[0].source, "bookmark_event");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("deduped normal bookmarks still move to _Bookmark Queue when normal routing is on", async () => {
  resetChromeMock();
  localStore.settings = { routeNormalBookmarks: true };
  localStore.queueItems = [queuedItem("duplicate")];
  const bookmark = { id: "bookmark-5", parentId: "work-folder", title: "Duplicate work bookmark", url: "https://example.com/duplicate" };
  nodes.set(bookmark.id, bookmark);

  await handleBookmarkCreated(bookmark.id, bookmark);

  assert.equal(nodes.get(bookmark.id).parentId, QUEUE_FOLDER_ID);
  assert.equal(localStore.queueItems.length, 1);
  assert.equal(localStore.queueItems[0].chromeBookmarkId, "bookmark-duplicate");
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("queue processing kick drains multiple queued items without manual sidepanel action", async () => {
  resetChromeMock();
  localStore.queueItems = ["one", "two"].map(queuedItem);

  await kickQueueProcessing();

  assert.deepEqual(localStore.queueItems.map((item) => item.status), ["needs_review", "needs_review"]);
  assert.equal(createdAlarms.some((alarm) => alarm.name === "process-queue"), true);
});

test("queue processing kick is bounded to five items per immediate drain", async () => {
  resetChromeMock();
  localStore.queueItems = ["1", "2", "3", "4", "5", "6"].map(queuedItem);

  await kickQueueProcessing();

  assert.equal(localStore.queueItems.filter((item) => item.status !== "queued").length, 5);
  assert.equal(localStore.queueItems.filter((item) => item.status === "queued").length, 1);
});
