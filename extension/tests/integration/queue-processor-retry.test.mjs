import test from "node:test";
import assert from "node:assert/strict";
import { QueueProcessor } from "../../dist/src/background/queue-processor.js";
import { OPENAI_CHATGPT_CODEX_BASE_URL } from "../../dist/src/providers/openai-chatgpt-oauth.js";

let localStore;
let movedTo;
let updatedTitle;

function resetChromeMock() {
  movedTo = undefined;
  updatedTitle = undefined;
  localStore = {
    queueItems: [{
      id: "queue-1",
      chromeBookmarkId: "bookmark-1",
      url: "https://example.com",
      normalizedUrl: "https://example.com/",
      originalTitle: "Example",
      source: "bookmark_event",
      status: "queued",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      attemptCount: 0
    }],
    providerConfig: {
      provider: "openai-compatible",
      base_url: "https://api.example.test/v1",
      model: "test-model",
      api_key: "key",
      temperature: 0.1,
      max_tokens: 1200,
      timeout_seconds: 30,
      retry_count: 1
    },
    settings: {
      routeNormalBookmarks: false,
      provider: "rule-based",
      strictMode: true,
      enableAutoMove: false,
      reviewThreshold: 0.7,
      autoMoveThreshold: 0.9,
      excludedDomains: [],
      allowPageTextExtraction: false
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => key ? { [key]: localStore[key] } : { ...localStore },
        set: async (items) => { Object.assign(localStore, items); }
      }
    },
    bookmarks: {
      getTree: async () => [{
        id: "0",
        title: "",
        children: [{
          id: "1",
          title: "Bookmarks Bar",
          children: [{ id: "work-folder", parentId: "1", title: "Work", children: [] }]
        }]
      }],
      get: async () => [{ id: "bookmark-1", parentId: "queue-folder", index: 0, title: "Example", url: "https://example.com" }],
      update: async (_id, changes) => { updatedTitle = changes.title; },
      move: async (_id, destination) => { movedTo = destination.parentId; }
    }
  };
}

test("QueueProcessor stops retryable provider failures after configured retry_count", async () => {
  resetChromeMock();
  const classifier = {
    classify: async () => ({ ok: false, code: "rate_limited", message: "Provider rate limit", retryable: true, statusCode: 429 })
  };
  const processor = new QueueProcessor(classifier);

  const firstAttempt = await processor.processNext();
  assert.equal(firstAttempt.status, "queued");
  assert.equal(firstAttempt.attemptCount, 1);

  const secondAttempt = await processor.processNext();
  assert.equal(secondAttempt.status, "needs_review");
  assert.equal(secondAttempt.attemptCount, 2);
  assert.equal(secondAttempt.lastErrorCode, "rate_limited");
});

test("QueueProcessor surfaces retryable failures immediately for interactive classification", async () => {
  resetChromeMock();
  const classifier = {
    classify: async () => ({ ok: false, code: "network_error", message: "Failed to fetch", retryable: true })
  };
  const processor = new QueueProcessor(classifier);

  const item = await processor.processNext({ retryTransientFailures: false });

  assert.equal(item.status, "needs_review");
  assert.equal(item.error, "Failed to fetch");
});

test("QueueProcessor auto-moves when confidence meets configured threshold", async () => {
  resetChromeMock();
  localStore.settings.enableAutoMove = true;
  localStore.settings.autoMoveThreshold = 0.82;
  const classifier = {
    classify: async () => ({
      ok: true,
      value: {
        url: "https://example.com",
        original_title: "Example",
        descriptive_title: "Example: Classified",
        summary: "Summary",
        target_folder: "/Bookmarks Bar/Work",
        tags: ["example"],
        content_type: "reference",
        confidence: 0.82,
        recommended_action: "move",
        reason: "Matched rule."
      }
    })
  };
  const folderResolver = {
    resolve: async () => ({ ok: true, folder: { path: "/Bookmarks Bar/Work", chromeBookmarkId: "work-folder", root: "bookmarks_bar" } })
  };
  const guards = { add: async () => ({ operationId: "operation", chromeBookmarkId: "bookmark-1", action: "move", createdAt: new Date(0).toISOString(), expiresAt: new Date(1).toISOString() }) };
  const processor = new QueueProcessor(classifier, folderResolver, guards);

  const item = await processor.processNext();

  assert.equal(item.status, "moved");
  assert.equal(updatedTitle, "Example: Classified");
  assert.equal(movedTo, "work-folder");
});

test("QueueProcessor clears stale provider errors after successful classification", async () => {
  resetChromeMock();
  localStore.queueItems[0].error = "Provider rate limit or quota error";
  localStore.queueItems[0].lastErrorCode = "rate_limited";
  localStore.queueItems[0].attemptCount = 1;
  const classifier = {
    classify: async () => ({
      ok: true,
      value: {
        url: "https://example.com",
        original_title: "Example",
        descriptive_title: "Example: Classified",
        summary: "Summary",
        target_folder: "/Bookmarks Bar/Work",
        tags: ["example"],
        content_type: "reference",
        confidence: 0.72,
        recommended_action: "needs_review",
        reason: "Matched rule."
      }
    })
  };
  const processor = new QueueProcessor(classifier);

  const item = await processor.processNext();

  assert.equal(item.status, "needs_review");
  assert.equal(item.reason, "Matched rule.");
  assert.equal(item.error, undefined);
  assert.equal(item.lastErrorCode, undefined);
});

test("QueueProcessor clears stale display text when requeueing for reclassification", async () => {
  resetChromeMock();
  localStore.queueItems[0].status = "needs_review";
  localStore.queueItems[0].reason = "Old classification reason";
  localStore.queueItems[0].error = "Provider rate limit or quota error";
  localStore.queueItems[0].lastErrorCode = "rate_limited";
  const processor = new QueueProcessor({ classify: async () => ({ ok: false, code: "network_error", message: "unused", retryable: true }) });

  const item = await processor.mark("queue-1", "queued");

  assert.equal(item.status, "queued");
  assert.equal(item.error, undefined);
  assert.equal(item.reason, undefined);
  assert.equal(item.lastErrorCode, undefined);
});

test("QueueProcessor manual processing reaches OAuth provider even when queued item is locked", async () => {
  resetChromeMock();
  localStore.settings.provider = "openai-chatgpt-oauth";
  localStore.providerConfig = {
    provider: "openai-chatgpt-oauth",
    base_url: OPENAI_CHATGPT_CODEX_BASE_URL,
    model: "gpt-5.5",
    access_token: "oauth-access-token",
    refresh_token: "oauth-refresh-token",
    expires_at: "2099-01-01T00:00:00.000Z",
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  localStore.queueItems[0].lockedUntil = new Date(Date.now() + 60_000).toISOString();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(codexSse(JSON.stringify({
      url: "https://example.com",
      original_title: "Example",
      descriptive_title: "Example classified",
      summary: "Summary",
      target_folder: "/Bookmarks Bar/Work",
      tags: ["example"],
      content_type: "reference",
      audience: "general",
      confidence: 0.73,
      recommended_action: "needs_review",
      reason: "OAuth provider reached."
    })), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  try {
    const processor = new QueueProcessor();
    const item = await processor.processNext({ retryTransientFailures: false, includeLocked: true });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${OPENAI_CHATGPT_CODEX_BASE_URL}/responses`);
    assert.equal(calls[0].options.headers.Authorization, "Bearer oauth-access-token");
    assert.equal(item.status, "needs_review");
    assert.equal(item.reason, "OAuth provider reached.");
    assert.equal(item.lockedUntil, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function codexSse(outputText) {
  return [
    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: outputText })}`,
    "data: [DONE]"
  ].join("\n\n");
}
