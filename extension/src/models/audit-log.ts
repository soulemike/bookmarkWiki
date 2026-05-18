import type { BookmarkQueueStatus } from "./bookmark.js";

export interface AuditLogEntry {
  operationId: string;
  batchId?: string;
  timestamp: string;
  action: "create_queue_item" | "classify_bookmark" | "update_title" | "move_bookmark" | "create_folder" | "export_kb" | "rollback";
  chromeBookmarkId?: string;
  url?: string;
  previousParentId?: string;
  previousIndex?: number;
  newParentId?: string;
  newIndex?: number;
  previousFolderPath?: string;
  newFolderPath?: string;
  previousTitle?: string;
  newTitle?: string;
  previousStatus?: BookmarkQueueStatus;
  newStatus?: BookmarkQueueStatus;
  confidence?: number;
  provider?: string;
  errorCode?: string;
  message?: string;
}
