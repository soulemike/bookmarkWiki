import test from "node:test";
import assert from "node:assert/strict";
import { QueueProcessor } from "../../dist/src/background/queue-processor.js";

let localStore;

function resetChromeMock() {
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
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => key ? { [key]: localStore[key] } : { ...localStore },
        set: async (items) => { Object.assign(localStore, items); }
      }
    },
    bookmarks: { get: async () => [], update: async () => undefined, move: async () => undefined }
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
