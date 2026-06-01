import type { BookmarkQueueItem, BookmarkQueueStatus } from "../../models/bookmark.js";
import { isProcessedQueueItem } from "../../models/queue-retention.js";

const app = document.querySelector<HTMLDivElement>("#app")!;
let statusMessage = "";

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function load(): Promise<void> {
  const { queue } = await send<{ queue: BookmarkQueueItem[] }>({ type: "queue:list" });
  const activeQueue = queue.filter((item) => !isProcessedQueueItem(item));
  const processedQueue = queue.filter(isProcessedQueueItem);
  app.innerHTML = `
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Local-first review desk</p>
        <h1>Bookmark Queue Agent</h1>
        <p class="lede">Classify captured bookmarks, check the recommendation, then approve only what belongs in your taxonomy.</p>
      </div>
      <div class="queue-stats" aria-label="Queue summary">
        <span><strong>${activeQueue.length}</strong> active</span>
        <span><strong>${processedQueue.length}</strong> processed</span>
      </div>
      <div class="toolbar" aria-label="Queue actions">
        <button id="process" class="button primary" type="button">Classify next</button>
        <button id="rollback" class="button secondary" type="button">Rollback last move</button>
      </div>
    </header>
    <div id="status-region" class="status-region" aria-live="polite">
      ${statusMessage ? `<p class="notice ${statusMessageClass(statusMessage)}" role="status">${escapeHtml(statusMessage)}</p>` : ""}
    </div>
    <section class="queue-section" aria-labelledby="active-heading">
      <div class="section-heading">
        <p class="eyebrow">Needs attention</p>
        <h2 id="active-heading">Active queue</h2>
      </div>
      <div class="queue-list">
        ${activeQueue.map(renderItem).join("") || renderEmptyState()}
      </div>
    </section>
    <details class="history" ${activeQueue.length === 0 && processedQueue.length > 0 ? "open" : ""}>
      <summary>Processed history <span>${processedQueue.length}</span></summary>
      <div class="queue-list compact">
        ${processedQueue.map(renderItem).join("") || "<p class=\"empty-note\">No processed bookmarks retained yet.</p>"}
      </div>
    </details>
  `;
  document.querySelector<HTMLButtonElement>("#process")?.addEventListener("click", async () => {
    const response = await send<{ item?: BookmarkQueueItem }>({ type: "queue:process-next" });
    statusMessage = classifyStatusMessage(response.item);
    await load();
  });
  document.querySelector<HTMLButtonElement>("#rollback")?.addEventListener("click", async () => {
    await send({ type: "queue:rollback-last" });
    statusMessage = "Rollback requested. The latest approved move was checked for a safe reversal.";
    await load();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id!;
      const action = button.dataset.action!;
      if (action === "approve") await send({ type: "queue:approve", id });
      else if (action === "sync-native") await send({ type: "queue:sync-native", id });
      else await send({ type: "queue:mark", id, status: action });
      statusMessage = actionStatusMessage(action);
      await load();
    });
  });
}

function classifyStatusMessage(item: BookmarkQueueItem | undefined): string {
  if (!item) return "Nothing is waiting for classification. Capture a tab or link to add work to the queue.";
  if (item.error) return `Classification needs attention: ${item.error}`;
  if (item.status === "queued") return "Classification was attempted and will retry shortly.";
  return `Classification updated this bookmark to ${statusLabel(item.status)}.`;
}

function actionStatusMessage(action: string): string {
  if (action === "approve") return "Approval requested. The bookmark move is protected by audit entries and rollback support.";
  if (action === "sync-native") return "Native sync retry requested for this bookmark.";
  if (action === "queued") return "Bookmark returned to the queue for another classification pass.";
  if (action === "ignored") return "Bookmark ignored. It will leave the active review queue.";
  if (action === "archived") return "Bookmark archived without applying the recommendation.";
  return "Queue item updated.";
}

function renderItem(item: BookmarkQueueItem): string {
  const confidence = confidencePercent(item.confidence);
  const itemActions = renderActions(item);
  return `
    <article class="review-card ${statusTone(item.status)}">
      <div class="card-topline">
        <span class="badge ${statusTone(item.status)}">${statusLabel(item.status)}</span>
        <span class="source-label">${sourceLabel(item.source)}</span>
      </div>
      <h3>${escapeHtml(item.proposedTitle ?? item.finalTitle ?? item.originalTitle)}</h3>
      <a class="url" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
      <div class="recommendation">
        <div>
          <span class="meta-label">Folder</span>
          <strong>${escapeHtml(item.proposedFolder ?? item.finalFolder ?? "Awaiting recommendation")}</strong>
        </div>
        <div>
          <span class="meta-label">Confidence</span>
          <strong class="confidence-value">${confidence}</strong>
          <span class="meter" aria-hidden="true"><span style="inline-size: ${confidenceBarWidth(item.confidence)}%"></span></span>
        </div>
      </div>
      <p class="reason">${escapeHtml(item.reason ?? item.error ?? "No rationale recorded yet.")}</p>
      <dl class="metadata">
        <div><dt>Native sync</dt><dd>${escapeHtml(nativeSyncLabel(item))}</dd></div>
        <div><dt>Attempts</dt><dd>${item.attemptCount}</dd></div>
        <div><dt>Updated</dt><dd>${formatDate(item.updatedAt)}</dd></div>
      </dl>
      ${itemActions ? `<div class="actions" aria-label="Actions for ${escapeHtml(item.originalTitle)}">${itemActions}</div>` : ""}
    </article>`;
}

function renderActions(item: BookmarkQueueItem): string {
  const id = escapeHtml(item.id);
  const canApprove = (item.status === "classified" || item.status === "needs_review") && Boolean(item.proposedFolder);
  const canReclassify = item.status === "classified" || item.status === "needs_review" || item.status === "error";
  const actions: string[] = [];
  if (canApprove) actions.push(`<button class="button primary" data-action="approve" data-id="${id}" type="button">Approve</button>`);
  if (item.status === "moved" && item.nativeSyncStatus === "failed") actions.push(`<button class="button warning" data-action="sync-native" data-id="${id}" type="button">Retry sync</button>`);
  if (canReclassify) actions.push(`<button class="button secondary" data-action="queued" data-id="${id}" type="button">Reclassify</button>`);
  if (item.status !== "moved" && item.status !== "approved" && item.status !== "ignored" && item.status !== "archived") {
    actions.push(`<button class="button quiet" data-action="ignored" data-id="${id}" type="button">Ignore</button>`);
    actions.push(`<button class="button quiet" data-action="archived" data-id="${id}" type="button">Archive</button>`);
  }
  return actions.join("");
}

function renderEmptyState(): string {
  return `
    <article class="empty-state">
      <p class="eyebrow">Queue clear</p>
      <h3>No bookmarks need review.</h3>
      <p>Use the toolbar action or the context menu to capture a page or link. New items will appear here before they move into your taxonomy.</p>
    </article>`;
}

function statusLabel(status: BookmarkQueueStatus): string {
  const labels: Record<BookmarkQueueStatus, string> = {
    queued: "Queued",
    classified: "Classified",
    needs_review: "Needs review",
    approved: "Approved",
    moved: "Moved",
    ignored: "Ignored",
    archived: "Archived",
    error: "Error"
  };
  return labels[status];
}

function statusTone(status: BookmarkQueueStatus): string {
  if (status === "moved" || status === "approved") return "success";
  if (status === "error") return "danger";
  if (status === "queued" || status === "needs_review") return "warning";
  if (status === "ignored" || status === "archived") return "muted";
  return "info";
}

function statusMessageClass(message: string): string {
  return message.toLowerCase().includes("failed") || message.toLowerCase().includes("attention") ? "danger" : "info";
}

function sourceLabel(source: BookmarkQueueItem["source"]): string {
  const labels: Record<BookmarkQueueItem["source"], string> = {
    current_tab: "Current tab",
    context_menu: "Context menu",
    bookmark_event: "Bookmark event",
    bulk_import: "Bulk import"
  };
  return labels[source];
}

function confidencePercent(confidence: number | undefined): string {
  return confidence === undefined ? "—" : `${Math.round(confidence * 100)}%`;
}

function confidenceBarWidth(confidence: number | undefined): number {
  if (confidence === undefined) return 0;
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

function nativeSyncLabel(item: BookmarkQueueItem): string {
  if (!item.nativeSyncStatus) return "Not configured";
  if (item.nativeSyncStatus === "failed") return `Failed: ${item.nativeSyncError ?? "unknown error"}`;
  if (item.nativeSyncStatus === "synced") return item.nativeSyncedAt ? `Synced ${formatDate(item.nativeSyncedAt)}` : "Synced";
  return "Disabled";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

void load();
