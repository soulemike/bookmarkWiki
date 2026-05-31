import type { BookmarkQueueItem, BookmarkQueueSource } from "../models/bookmark.js";
import { DEFAULT_TAXONOMY } from "../models/taxonomy.js";
import { parseFolderPath } from "../utils/folder-path.js";
import { normalizeUrl } from "../utils/normalize-url.js";
import { storage } from "./storage.js";

export const DEFAULT_EXTENSION_FOLDERS = ["_Bookmark Queue", "_Needs Review", "_Processed", "_Archive"];
export const BOOKMARK_QUEUE_FOLDER = "_Bookmark Queue";

export interface QueueBookmarkOptions {
  skipMove?: boolean;
}

export class BookmarkManager {
  async ensureDefaultFolders(): Promise<Record<string, string>> {
    const rootChildren = (await chrome.bookmarks.getChildren("1"));
    const ids: Record<string, string> = {};
    for (const title of DEFAULT_EXTENSION_FOLDERS) {
      const existing = rootChildren.find((node) => !node.url && node.title === title);
      if (existing) ids[title] = existing.id;
      else ids[title] = (await chrome.bookmarks.create({ parentId: "1", title })).id;
    }
    for (const folder of DEFAULT_TAXONOMY.folders) await this.ensureFolderPath(folder.path);
    return ids;
  }

  async ensureFolderPath(path: string): Promise<string> {
    const [root, ...segments] = parseFolderPath(path);
    if (root !== "Bookmarks Bar") throw new Error(`Unsupported default taxonomy root: ${root}`);
    let parentId = "1";
    for (const segment of segments) {
      const children = await chrome.bookmarks.getChildren(parentId);
      const existing = children.find((node) => !node.url && node.title === segment);
      parentId = existing?.id ?? (await chrome.bookmarks.create({ parentId, title: segment })).id;
    }
    return parentId;
  }

  async isQueueFolder(parentId: string | undefined): Promise<boolean> {
    if (!parentId) return false;
    const folders = await this.ensureDefaultFolders();
    return parentId === folders[BOOKMARK_QUEUE_FOLDER];
  }

  async addUrlToQueue(url: string, title: string, source: BookmarkQueueSource, chromeBookmarkId?: string, options: QueueBookmarkOptions = {}): Promise<BookmarkQueueItem> {
    const normalizedUrl = normalizeUrl(url);
    const queue = await storage.getQueue();
    const existing = queue.find((item) => item.normalizedUrl === normalizedUrl && !["ignored", "archived"].includes(item.status));
    const folders = await this.ensureDefaultFolders();
    if (existing) {
      if (chromeBookmarkId && !options.skipMove) await chrome.bookmarks.move(chromeBookmarkId, { parentId: folders[BOOKMARK_QUEUE_FOLDER] });
      return existing;
    }

    const bookmarkId = chromeBookmarkId ?? (await chrome.bookmarks.create({ parentId: folders[BOOKMARK_QUEUE_FOLDER], title, url })).id;
    if (chromeBookmarkId && !options.skipMove) await chrome.bookmarks.move(chromeBookmarkId, { parentId: folders[BOOKMARK_QUEUE_FOLDER] });
    const now = new Date().toISOString();
    const item: BookmarkQueueItem = {
      id: crypto.randomUUID(),
      chromeBookmarkId: bookmarkId,
      url,
      normalizedUrl,
      originalTitle: title || url,
      source,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      attemptCount: 0
    };
    await storage.upsertQueueItem(item);
    await storage.appendAudit({ operationId: crypto.randomUUID(), timestamp: now, action: "create_queue_item", chromeBookmarkId: bookmarkId, url, newStatus: "queued" });
    return item;
  }

  async currentTabToQueue(tab: chrome.tabs.Tab): Promise<BookmarkQueueItem | undefined> {
    if (!tab.url || tab.url.startsWith("chrome://")) return undefined;
    return this.addUrlToQueue(tab.url, tab.title ?? tab.url, "current_tab");
  }
}
