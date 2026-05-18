export type BookmarkQueueSource = "current_tab" | "context_menu" | "bookmark_event" | "bulk_import";
export type BookmarkQueueStatus = "queued" | "classified" | "needs_review" | "approved" | "moved" | "ignored" | "archived" | "error";

export interface BookmarkQueueItem {
  id: string;
  chromeBookmarkId?: string;
  url: string;
  normalizedUrl: string;
  originalTitle: string;
  proposedTitle?: string;
  finalTitle?: string;
  source: BookmarkQueueSource;
  status: BookmarkQueueStatus;
  proposedFolder?: string;
  proposedFolderId?: string;
  finalFolder?: string;
  finalFolderId?: string;
  confidence?: number;
  tags?: string[];
  summary?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lockedUntil?: string;
  lastErrorCode?: string;
  operationId?: string;
  error?: string;
}

const transitions: Record<BookmarkQueueStatus, BookmarkQueueStatus[]> = {
  queued: ["classified", "needs_review", "ignored", "archived", "error"],
  classified: ["approved", "needs_review", "ignored", "archived"],
  needs_review: ["approved", "queued", "ignored", "archived"],
  approved: ["moved", "error"],
  moved: ["archived"],
  ignored: [],
  archived: [],
  error: ["queued"]
};

export function canTransition(from: BookmarkQueueStatus, to: BookmarkQueueStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}
