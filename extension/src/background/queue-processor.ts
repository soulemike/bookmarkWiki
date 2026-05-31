import type { AuditLogEntry } from "../models/audit-log.js";
import type { BookmarkQueueItem } from "../models/bookmark.js";
import { decideByConfidence } from "../utils/confidence.js";
import { BookmarkManager, NEEDS_REVIEW_FOLDER } from "./bookmark-manager.js";
import { FolderResolver } from "./folder-resolver.js";
import { OperationGuardManager } from "./operation-guard.js";
import { storage } from "./storage.js";
import { ClassificationOrchestrator } from "./classifier.js";
import { SyncDispatcher } from "./sync-dispatcher.js";

const LOCK_MS = 2 * 60 * 1000;

export interface ProcessNextOptions {
  retryTransientFailures?: boolean;
  includeLocked?: boolean;
}

export class QueueProcessor {
  constructor(
    private classifier = new ClassificationOrchestrator(),
    private folderResolver = new FolderResolver(),
    private guards = new OperationGuardManager(),
    private syncDispatcher = new SyncDispatcher(),
    private bookmarkManager = new BookmarkManager()
  ) {}

  async processNext(options: ProcessNextOptions = {}): Promise<BookmarkQueueItem | undefined> {
    const queue = await storage.getQueue();
    const now = Date.now();
    const item = queue.find((candidate) => candidate.status === "queued" && (options.includeLocked || !candidate.lockedUntil || new Date(candidate.lockedUntil).getTime() < now));
    if (!item) return undefined;
    item.lockedUntil = new Date(now + LOCK_MS).toISOString();
    item.attemptCount += 1;
    item.lastAttemptAt = new Date(now).toISOString();
    await storage.upsertQueueItem(item);

    let result;
    try {
      result = await this.classifier.classify(item);
    } catch (error) {
      item.status = "needs_review";
      item.lastErrorCode = "provider_unavailable";
      item.error = error instanceof Error ? error.message : "Unexpected classification error";
      item.lockedUntil = undefined;
      await storage.upsertQueueItem(item);
      await this.moveToNeedsReviewFolder(item);
      return item;
    }
    if (!result.ok) {
      const providerConfig = await storage.getProviderConfig();
      const retryLimit = providerConfig?.retry_count ?? 1;
      const retryTransientFailures = options.retryTransientFailures ?? true;
      item.status = retryTransientFailures && result.retryable && item.attemptCount <= retryLimit ? "queued" : "needs_review";
      item.lastErrorCode = result.code;
      item.error = result.message;
      item.lockedUntil = undefined;
      await storage.upsertQueueItem(item);
      if (item.status === "needs_review") await this.moveToNeedsReviewFolder(item);
      return item;
    }

    item.proposedTitle = result.value.descriptive_title;
    item.proposedFolder = result.value.target_folder;
    item.confidence = result.value.confidence;
    item.tags = result.value.tags;
    item.summary = result.value.summary;
    item.reason = result.value.reason;
    item.error = undefined;
    item.lastErrorCode = undefined;
    item.status = "classified";
    item.lockedUntil = undefined;
    await storage.upsertQueueItem(item);
    await storage.appendAudit({ operationId: crypto.randomUUID(), timestamp: new Date().toISOString(), action: "classify_bookmark", chromeBookmarkId: item.chromeBookmarkId, url: item.url, confidence: item.confidence, newStatus: "classified" });
    const settings = await storage.getSettings();
    const decision = decideByConfidence(result.value.confidence, { reviewThreshold: settings.reviewThreshold, autoMoveThreshold: settings.autoMoveThreshold, mode: settings.enableAutoMove ? "auto_when_confident" : "review_only" });
    if (result.value.recommended_action === "ignore") return this.mark(item.id, "ignored");
    if (decision === "hold" || result.value.recommended_action === "hold") return this.mark(item.id, "needs_review", "low_confidence");
    if (decision === "needs_review" || result.value.recommended_action === "needs_review") return this.mark(item.id, "needs_review");
    return this.approve(item.id);
  }

  async mark(id: string, status: BookmarkQueueItem["status"], error?: string): Promise<BookmarkQueueItem | undefined> {
    const queue = await storage.getQueue();
    const item = queue.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.status = status;
    item.error = error;
    if (status === "queued") {
      item.reason = undefined;
      item.lastErrorCode = undefined;
    }
    item.updatedAt = new Date().toISOString();
    await storage.upsertQueueItem(item);
    if (status === "needs_review") await this.moveToNeedsReviewFolder(item);
    return item;
  }

  private async moveToNeedsReviewFolder(item: BookmarkQueueItem): Promise<void> {
    if (!item.chromeBookmarkId) return;
    const folders = await this.bookmarkManager.ensureDefaultFolders();
    const reviewFolderId = folders[NEEDS_REVIEW_FOLDER];
    const [before] = await chrome.bookmarks.get(item.chromeBookmarkId);
    if (!before || before.parentId === reviewFolderId) return;
    const moveGuard = await this.guards.add(item.chromeBookmarkId, "move");
    await chrome.bookmarks.move(item.chromeBookmarkId, { parentId: reviewFolderId });
    await storage.appendAudit({ operationId: moveGuard.operationId, timestamp: new Date().toISOString(), action: "move_bookmark", chromeBookmarkId: item.chromeBookmarkId, url: item.url, previousParentId: before.parentId, previousIndex: before.index, newParentId: reviewFolderId, newFolderPath: `/Bookmarks Bar/${NEEDS_REVIEW_FOLDER}` });
  }

  async approve(id: string, edits: Partial<Pick<BookmarkQueueItem, "proposedTitle" | "proposedFolder">> = {}): Promise<BookmarkQueueItem | undefined> {
    const queue = await storage.getQueue();
    const item = queue.find((candidate) => candidate.id === id);
    if (!item?.chromeBookmarkId) return undefined;
    Object.assign(item, edits);
    if (!item.proposedFolder || !item.proposedTitle) return this.mark(id, "needs_review", "missing recommendation");
    const resolved = await this.folderResolver.resolve(item.proposedFolder);
    if (!resolved.ok) return this.mark(id, "needs_review", resolved.code);

    const batchId = crypto.randomUUID();
    const [before] = await chrome.bookmarks.get(item.chromeBookmarkId);
    const titleGuard = await this.guards.add(item.chromeBookmarkId, "update");
    await chrome.bookmarks.update(item.chromeBookmarkId, { title: item.proposedTitle });
    await storage.appendAudit(auditBase(batchId, titleGuard.operationId, "update_title", item, { previousTitle: before.title, newTitle: item.proposedTitle }));

    const moveGuard = await this.guards.add(item.chromeBookmarkId, "move");
    await chrome.bookmarks.move(item.chromeBookmarkId, { parentId: resolved.folder.chromeBookmarkId });
    await storage.appendAudit(auditBase(batchId, moveGuard.operationId, "move_bookmark", item, { previousParentId: before.parentId, previousIndex: before.index, newParentId: resolved.folder.chromeBookmarkId, newFolderPath: resolved.folder.path }));

    item.finalTitle = item.proposedTitle;
    item.finalFolder = resolved.folder.path;
    item.finalFolderId = resolved.folder.chromeBookmarkId;
    item.status = "moved";
    item.processedAt = new Date().toISOString();
    await storage.upsertQueueItem(item);
    await this.syncMovedItem(item.id);
    return item;
  }

  async syncMovedItem(id: string): Promise<BookmarkQueueItem | undefined> {
    const queue = await storage.getQueue();
    const item = queue.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    const syncResult = await this.syncDispatcher.dispatchIfEnabled(item);
    item.nativeSyncStatus = syncResult.status;
    item.nativeSyncError = syncResult.ok ? undefined : syncResult.message;
    item.nativeSyncedAt = syncResult.status === "synced" ? new Date().toISOString() : item.nativeSyncedAt;
    await storage.upsertQueueItem(item);
    await storage.appendAudit({ operationId: crypto.randomUUID(), timestamp: new Date().toISOString(), action: "export_kb", chromeBookmarkId: item.chromeBookmarkId, url: item.url, errorCode: syncResult.ok ? undefined : "native_host_sync_failed", message: syncResult.message });
    return item;
  }

  async rollbackLastBatch(): Promise<void> {
    const audit = await storage.getAuditLog();
    const last = [...audit].reverse().find((entry) => entry.batchId && (entry.action === "move_bookmark" || entry.action === "update_title"));
    if (!last?.batchId) return;
    const batch = audit.filter((entry) => entry.batchId === last.batchId).reverse();
    for (const entry of batch) {
      if (!entry.chromeBookmarkId) continue;
      if (entry.action === "move_bookmark" && entry.previousParentId) await chrome.bookmarks.move(entry.chromeBookmarkId, { parentId: entry.previousParentId, index: entry.previousIndex });
      if (entry.action === "update_title" && entry.previousTitle) await chrome.bookmarks.update(entry.chromeBookmarkId, { title: entry.previousTitle });
      await storage.appendAudit({ operationId: crypto.randomUUID(), batchId: entry.batchId, timestamp: new Date().toISOString(), action: "rollback", chromeBookmarkId: entry.chromeBookmarkId, message: `Rolled back ${entry.action}` });
    }
  }
}

function auditBase(batchId: string, operationId: string, action: AuditLogEntry["action"], item: BookmarkQueueItem, fields: Partial<AuditLogEntry>): AuditLogEntry {
  return { operationId, batchId, timestamp: new Date().toISOString(), action, chromeBookmarkId: item.chromeBookmarkId, url: item.url, ...fields };
}
