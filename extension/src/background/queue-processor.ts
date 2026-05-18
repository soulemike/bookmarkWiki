import type { AuditLogEntry } from "../models/audit-log.js";
import type { BookmarkQueueItem } from "../models/bookmark.js";
import { decideByConfidence } from "../utils/confidence.js";
import { FolderResolver } from "./folder-resolver.js";
import { OperationGuardManager } from "./operation-guard.js";
import { storage } from "./storage.js";
import { ClassificationOrchestrator } from "./classifier.js";

const LOCK_MS = 2 * 60 * 1000;

export class QueueProcessor {
  constructor(
    private classifier = new ClassificationOrchestrator(),
    private folderResolver = new FolderResolver(),
    private guards = new OperationGuardManager()
  ) {}

  async processNext(): Promise<BookmarkQueueItem | undefined> {
    const queue = await storage.getQueue();
    const now = Date.now();
    const item = queue.find((candidate) => candidate.status === "queued" && (!candidate.lockedUntil || new Date(candidate.lockedUntil).getTime() < now));
    if (!item) return undefined;
    item.lockedUntil = new Date(now + LOCK_MS).toISOString();
    item.attemptCount += 1;
    item.lastAttemptAt = new Date(now).toISOString();
    await storage.upsertQueueItem(item);

    const result = await this.classifier.classify(item);
    if (!result.ok) {
      item.status = result.retryable ? "queued" : "needs_review";
      item.lastErrorCode = result.code;
      item.error = result.message;
      item.lockedUntil = undefined;
      await storage.upsertQueueItem(item);
      return item;
    }

    item.proposedTitle = result.value.descriptive_title;
    item.proposedFolder = result.value.target_folder;
    item.confidence = result.value.confidence;
    item.tags = result.value.tags;
    item.summary = result.value.summary;
    item.reason = result.value.reason;
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
    item.updatedAt = new Date().toISOString();
    await storage.upsertQueueItem(item);
    return item;
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
