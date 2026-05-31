import type { BookmarkQueueItem } from "./bookmark.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_PROCESSED_RECORD_RETENTION_DAYS = 30;
export const MAX_PROCESSED_RECORD_RETENTION_DAYS = 3650;

export function isProcessedQueueItem(item: BookmarkQueueItem): boolean {
  if (item.status === "ignored" || item.status === "archived") return true;
  if (item.status !== "moved") return false;
  return item.nativeSyncStatus !== "failed";
}

export function normalizeProcessedRecordRetentionDays(value: number, fallback = DEFAULT_PROCESSED_RECORD_RETENTION_DAYS): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_PROCESSED_RECORD_RETENTION_DAYS, Math.max(0, Math.floor(value)));
}

export function pruneProcessedQueueItems(queue: BookmarkQueueItem[], retentionDays: number, now = new Date()): BookmarkQueueItem[] {
  const normalizedRetentionDays = normalizeProcessedRecordRetentionDays(retentionDays);
  if (normalizedRetentionDays === 0) return queue;
  const cutoff = now.getTime() - normalizedRetentionDays * MS_PER_DAY;
  return queue.filter((item) => {
    if (!isProcessedQueueItem(item)) return true;
    const retainedAt = item.processedAt ?? item.updatedAt;
    const retainedTime = new Date(retainedAt).getTime();
    return !Number.isFinite(retainedTime) || retainedTime >= cutoff;
  });
}
