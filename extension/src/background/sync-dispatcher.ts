import type { BookmarkQueueItem } from "../models/bookmark.js";

export interface SyncResult {
  ok: boolean;
  message: string;
}

export class SyncDispatcher {
  async dispatchIfEnabled(_item: BookmarkQueueItem): Promise<SyncResult> {
    return { ok: true, message: "Filesystem sync is reserved for MVP 3." };
  }
}
