import { BookmarkManager } from "./bookmark-manager.js";
import { OperationGuardManager } from "./operation-guard.js";
import { QueueProcessor } from "./queue-processor.js";
import { storage } from "./storage.js";

const bookmarkManager = new BookmarkManager();
const guards = new OperationGuardManager();
const processor = new QueueProcessor(undefined, undefined, guards);

chrome.runtime.onInstalled.addListener(async () => {
  await guards.hydrate();
  await bookmarkManager.ensureDefaultFolders();
  chrome.contextMenus.create({ id: "add-link-to-bookmark-queue", title: "Add link to Bookmark Queue", contexts: ["link"] });
  chrome.alarms.create("process-queue", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  await guards.hydrate();
});

chrome.action.onClicked.addListener(async (tab) => {
  await bookmarkManager.currentTabToQueue(tab);
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "add-link-to-bookmark-queue" && info.linkUrl) {
    await bookmarkManager.addUrlToQueue(info.linkUrl, info.selectionText || info.linkUrl, "context_menu");
  }
});

chrome.bookmarks.onCreated.addListener(async (id, node) => {
  if (!node.url || guards.matches(id, "create")) return;
  const settings = await storage.getSettings();
  if (!settings.routeNormalBookmarks) return;
  await guards.add(id, "move");
  await bookmarkManager.addUrlToQueue(node.url, node.title, "bookmark_event", id);
});

for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"] as const) {
  chrome.bookmarks[eventName].addListener(() => {
    // FolderResolver refreshes lazily; this listener keeps the service worker awake for cache invalidation in active sessions.
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "process-queue") await processor.processNext();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "queue:list") sendResponse({ queue: await storage.getQueue(), audit: await storage.getAuditLog() });
    else if (message?.type === "queue:process-next") sendResponse({ item: await processor.processNext() });
    else if (message?.type === "queue:approve") sendResponse({ item: await processor.approve(message.id, message.edits) });
    else if (message?.type === "queue:mark") sendResponse({ item: await processor.mark(message.id, message.status) });
    else if (message?.type === "queue:rollback-last") {
      await processor.rollbackLastBatch();
      sendResponse({ ok: true });
    } else if (message?.type === "settings:get") sendResponse({ settings: await storage.getSettings(), taxonomy: await storage.getTaxonomy(), providerConfig: await storage.getProviderConfig() });
    else if (message?.type === "settings:save") {
      await storage.saveSettings(message.settings);
      if (message.taxonomy) await storage.saveTaxonomy(message.taxonomy);
      if (message.providerConfig) await storage.saveProviderConfig(message.providerConfig);
      sendResponse({ ok: true });
    }
  })();
  return true;
});
