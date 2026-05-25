import type { BookmarkQueueItem } from "../models/bookmark.js";
import { slugify } from "../utils/slugify.js";
import { storage } from "./storage.js";

const NATIVE_HOST_NAME = "com.bookmark_queue_agent.host";
const NATIVE_MESSAGE_TIMEOUT_MS = 10_000;

interface NativeHostFile {
  relativePath: string;
  content: string;
  sha256: string;
}

interface NativeHostRequest {
  requestId: string;
  action: "write_kb" | "status";
  targetPath?: string;
  files?: NativeHostFile[];
}

interface NativeHostResponse {
  requestId: string;
  ok: boolean;
  writtenFiles?: string[];
  errorCode?: string;
  message?: string;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  status: "disabled" | "synced" | "failed";
}

export class SyncDispatcher {
  async dispatchIfEnabled(item: BookmarkQueueItem): Promise<SyncResult> {
    const settings = await storage.getSettings();
    if (!settings.enableNativeHostSync) return { ok: true, message: "Native host sync is disabled.", status: "disabled" };
    if (!settings.nativeHostTargetPath.trim()) return { ok: false, message: "Native host sync target path is not configured.", status: "failed" };
    if (item.status !== "moved") return { ok: true, message: "Bookmark has not reached moved status; sync skipped.", status: "disabled" };

    const request: NativeHostRequest = {
      requestId: crypto.randomUUID(),
      action: "write_kb",
      targetPath: settings.nativeHostTargetPath.trim(),
      files: await buildKnowledgeBaseFiles(item)
    };
    try {
      const response = await sendNativeMessageWithTimeout(request);
      if (!isNativeHostResponse(response) || response.requestId !== request.requestId) return { ok: false, message: "Native host returned an invalid response.", status: "failed" };
      return { ok: response.ok, message: response.message ?? response.errorCode ?? "Native host sync completed.", status: response.ok ? "synced" : "failed" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Native host sync failed.", status: "failed" };
    }
  }

  async status(): Promise<SyncResult> {
    const request: NativeHostRequest = { requestId: crypto.randomUUID(), action: "status" };
    try {
      const response = await sendNativeMessageWithTimeout(request);
      if (!isNativeHostResponse(response) || response.requestId !== request.requestId) return { ok: false, message: "Native host returned an invalid status response.", status: "failed" };
      return { ok: response.ok, message: response.message ?? response.errorCode ?? "Native host status checked.", status: response.ok ? "synced" : "failed" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Native host status check failed.", status: "failed" };
    }
  }
}

async function buildKnowledgeBaseFiles(item: BookmarkQueueItem): Promise<NativeHostFile[]> {
  const slug = `${slugify(item.finalTitle ?? item.proposedTitle ?? item.originalTitle)}-${item.chromeBookmarkId ?? item.id}`;
  const bookmarkRecord = {
    id: item.id,
    chromeBookmarkId: item.chromeBookmarkId,
    url: item.url,
    title: item.finalTitle ?? item.proposedTitle ?? item.originalTitle,
    folder: item.finalFolder ?? item.proposedFolder,
    tags: item.tags ?? [],
    summary: item.summary ?? "",
    confidence: item.confidence,
    processedAt: item.processedAt
  };
  const markdown = renderBookmarkMarkdown(bookmarkRecord);
  const json = `${JSON.stringify(bookmarkRecord, null, 2)}\n`;
  return Promise.all([
    toNativeHostFile(`bookmarks/${slug}.md`, markdown),
    toNativeHostFile(`bookmarks/${slug}.json`, json),
    toNativeHostFile(`indexes/recent/${slug}.ndjson`, `${JSON.stringify(bookmarkRecord)}\n`)
  ]);
}

async function sendNativeMessageWithTimeout(request: NativeHostRequest): Promise<NativeHostResponse> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      chrome.runtime.sendNativeMessage<NativeHostResponse>(NATIVE_HOST_NAME, request),
      new Promise<NativeHostResponse>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Native host request timed out.")), NATIVE_MESSAGE_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function renderBookmarkMarkdown(record: { title: string; url: string; folder?: string; tags: string[]; summary: string; confidence?: number; processedAt?: string }): string {
  return `---\ntitle: ${yamlString(record.title)}\nurl: ${yamlString(record.url)}\nfolder: ${yamlString(record.folder ?? "")}\ntags: [${record.tags.map(yamlString).join(", ")}]\nconfidence: ${record.confidence ?? ""}\nprocessed_at: ${yamlString(record.processedAt ?? "")}\n---\n\n# ${record.title}\n\n${record.summary || "No summary captured."}\n\nSource: ${record.url}\n`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

async function toNativeHostFile(relativePath: string, content: string): Promise<NativeHostFile> {
  return { relativePath, content, sha256: await sha256Hex(content) };
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isNativeHostResponse(response: NativeHostResponse): response is NativeHostResponse {
  return typeof response?.requestId === "string" && typeof response.ok === "boolean";
}
