import test from "node:test";
import assert from "node:assert/strict";
import { isProcessedQueueItem, normalizeProcessedRecordRetentionDays, pruneProcessedQueueItems } from "../../dist/src/models/queue-retention.js";

const now = new Date("2026-05-30T12:00:00.000Z");

test("processed queue item detection keeps failed native sync active", () => {
  assert.equal(isProcessedQueueItem(item("queued")), false);
  assert.equal(isProcessedQueueItem(item("needs_review")), false);
  assert.equal(isProcessedQueueItem(item("error")), false);
  assert.equal(isProcessedQueueItem(item("moved", { nativeSyncStatus: "failed" })), false);
  assert.equal(isProcessedQueueItem(item("moved", { nativeSyncStatus: "synced" })), true);
  assert.equal(isProcessedQueueItem(item("moved", { nativeSyncStatus: "disabled" })), true);
  assert.equal(isProcessedQueueItem(item("ignored")), true);
  assert.equal(isProcessedQueueItem(item("archived")), true);
});

test("processed queue pruning respects retention period and active statuses", () => {
  const retained = pruneProcessedQueueItems([
    item("queued", { id: "active-queued", updatedAt: "2026-04-01T00:00:00.000Z" }),
    item("moved", { id: "failed-sync", nativeSyncStatus: "failed", processedAt: "2026-04-01T00:00:00.000Z" }),
    item("moved", { id: "recent-moved", nativeSyncStatus: "synced", processedAt: "2026-05-25T00:00:00.000Z" }),
    item("moved", { id: "old-moved", nativeSyncStatus: "synced", processedAt: "2026-04-01T00:00:00.000Z" }),
    item("ignored", { id: "old-ignored", updatedAt: "2026-04-01T00:00:00.000Z" }),
    item("archived", { id: "recent-archived", updatedAt: "2026-05-29T00:00:00.000Z" })
  ], 30, now);

  assert.deepEqual(retained.map((record) => record.id), ["active-queued", "failed-sync", "recent-moved", "recent-archived"]);
});

test("zero retention disables processed queue pruning", () => {
  const queue = [item("moved", { id: "old-moved", nativeSyncStatus: "synced", processedAt: "2026-04-01T00:00:00.000Z" })];

  assert.equal(pruneProcessedQueueItems(queue, 0, now), queue);
});

test("retention period input is normalized for the options UI", () => {
  assert.equal(normalizeProcessedRecordRetentionDays(7.8), 7);
  assert.equal(normalizeProcessedRecordRetentionDays(-1), 0);
  assert.equal(normalizeProcessedRecordRetentionDays(5000), 3650);
  assert.equal(normalizeProcessedRecordRetentionDays(Number.NaN, 14), 14);
});

function item(status, overrides = {}) {
  return {
    id: `${status}-item`,
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    originalTitle: "Example",
    source: "bookmark_event",
    status,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    attemptCount: 1,
    ...overrides
  };
}
