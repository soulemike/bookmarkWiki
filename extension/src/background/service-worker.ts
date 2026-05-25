import { BookmarkManager } from "./bookmark-manager.js";
import { OperationGuardManager } from "./operation-guard.js";
import { QueueProcessor } from "./queue-processor.js";
import { SyncDispatcher } from "./sync-dispatcher.js";
import { disconnectChatGptOAuth, pollChatGptOAuthDeviceAuthorization, startChatGptOAuthDeviceAuthorization, type DeviceAuthorizationSession } from "../providers/openai-chatgpt-oauth.js";
import { storage, type ProviderConfig } from "./storage.js";

const bookmarkManager = new BookmarkManager();
const guards = new OperationGuardManager();
const processor = new QueueProcessor(undefined, undefined, guards);
const syncDispatcher = new SyncDispatcher();
const MAX_QUEUE_DRAIN_PER_KICK = 5;

chrome.runtime.onInstalled.addListener(() => {
  void handleInstalled().catch((error: unknown) => {
    console.error("Unable to initialize Bookmark Queue Agent", error);
  });
});

export async function handleInstalled(): Promise<void> {
  await guards.hydrate();
  await bookmarkManager.ensureDefaultFolders();
  chrome.contextMenus.create({ id: "add-link-to-bookmark-queue", title: "Add link to Bookmark Queue", contexts: ["link"] });
  ensureQueueProcessingAlarm();
}

chrome.runtime.onStartup.addListener(() => {
  void handleStartup().catch((error: unknown) => {
    console.error("Unable to process Bookmark Queue on startup", error);
  });
});

export async function handleStartup(): Promise<void> {
  await guards.hydrate();
  ensureQueueProcessingAlarm();
  await kickQueueProcessing();
}

chrome.action.onClicked.addListener((tab) => {
  void handleActionClicked(tab).catch((error: unknown) => {
    console.error("Unable to add active tab to Bookmark Queue", error);
  });
});

export async function handleActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
    console.error("Unable to open Bookmark Queue side panel", error);
  });
  await bookmarkManager.currentTabToQueue(tab);
  await kickQueueProcessing();
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  await handleContextMenuClicked(info);
});

export async function handleContextMenuClicked(info: chrome.contextMenus.OnClickData): Promise<void> {
  if (info.menuItemId === "add-link-to-bookmark-queue" && info.linkUrl) {
    await bookmarkManager.addUrlToQueue(info.linkUrl, info.selectionText || info.linkUrl, "context_menu");
    await kickQueueProcessing();
  }
}

chrome.bookmarks.onCreated.addListener((id, node) => {
  void handleBookmarkCreated(id, node).catch((error: unknown) => {
    console.error("Unable to process created bookmark", error);
  });
});

chrome.bookmarks.onMoved.addListener((id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => {
  void handleBookmarkMoved(id, moveInfo).catch((error: unknown) => {
    console.error("Unable to process moved bookmark", error);
  });
});

for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"] as const) {
  chrome.bookmarks[eventName].addListener(() => {
    // FolderResolver refreshes lazily; this listener keeps the service worker awake for cache invalidation in active sessions.
  });
}

export async function handleBookmarkCreated(id: string, node: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
  if (!node.url || guards.matches(id, "create")) return;
  const alreadyInQueue = await bookmarkManager.isQueueFolder(node.parentId);
  if (!alreadyInQueue) {
    const settings = await storage.getSettings();
    if (!settings.routeNormalBookmarks) return;
    await guards.add(id, "move");
  }
  await bookmarkManager.addUrlToQueue(node.url, node.title, "bookmark_event", id, { skipMove: alreadyInQueue });
  await kickQueueProcessing();
}

export async function handleBookmarkMoved(id: string, moveInfo: { parentId?: string }): Promise<void> {
  if (guards.matches(id, "move")) return;
  const movedIntoQueue = await bookmarkManager.isQueueFolder(moveInfo.parentId);
  if (!movedIntoQueue) return;
  const [node] = await chrome.bookmarks.get(id);
  if (!node?.url) return;
  await bookmarkManager.addUrlToQueue(node.url, node.title, "bookmark_event", id, { skipMove: true });
  await kickQueueProcessing();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "process-queue") await processor.processNext({ retryTransientFailures: true });
});

export function ensureQueueProcessingAlarm(): void {
  chrome.alarms.create("process-queue", { periodInMinutes: 1 });
}

export async function kickQueueProcessing(): Promise<void> {
  ensureQueueProcessingAlarm();
  for (let processed = 0; processed < MAX_QUEUE_DRAIN_PER_KICK; processed += 1) {
    const item = await processor.processNext({ retryTransientFailures: true });
    if (!item || item.status === "queued") return;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "queue:list") sendResponse({ queue: await storage.getQueue(), audit: await storage.getAuditLog() });
    else if (message?.type === "queue:process-next") sendResponse({ item: await processor.processNext({ retryTransientFailures: false, includeLocked: true }) });
    else if (message?.type === "queue:approve") sendResponse({ item: await processor.approve(message.id, message.edits) });
    else if (message?.type === "queue:sync-native") sendResponse({ item: await processor.syncMovedItem(message.id) });
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
    } else if (message?.type === "oauth:start") {
      const config = message.providerConfig as ProviderConfig | undefined;
      if (config?.provider !== "openai-chatgpt-oauth") {
        sendResponse({ ok: false, message: "ChatGPT OAuth provider config is required" });
        return;
      }
      try {
        const session = await startChatGptOAuthDeviceAuthorization();
        sendResponse({ ok: true, session });
      } catch (error) {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Unable to start ChatGPT OAuth" });
      }
    } else if (message?.type === "oauth:poll") {
      const config = message.providerConfig as ProviderConfig | undefined;
      const session = message.session as DeviceAuthorizationSession | undefined;
      if (config?.provider !== "openai-chatgpt-oauth" || !session) {
        sendResponse({ ok: false, message: "ChatGPT OAuth provider config and device session are required" });
        return;
      }
      try {
        const result = await pollChatGptOAuthDeviceAuthorization(config, session);
        if (result.status === "connected") {
          await storage.saveProviderConfig(result.config);
          sendResponse({ ok: true, status: "connected", expires_at: result.config.expires_at });
        } else {
          sendResponse({ ok: true, status: "pending" });
        }
      } catch (error) {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Unable to poll ChatGPT OAuth" });
      }
    } else if (message?.type === "oauth:disconnect") {
      const config = await storage.getProviderConfig();
      if (config?.provider === "openai-chatgpt-oauth") await storage.saveProviderConfig(disconnectChatGptOAuth(config));
      sendResponse({ ok: true });
    } else if (message?.type === "native-host:status") {
      sendResponse(await syncDispatcher.status());
    }
  })();
  return true;
});
