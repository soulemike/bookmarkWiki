import type { BookmarkQueueItem } from "../../models/bookmark.js";

const app = document.querySelector<HTMLDivElement>("#app")!;

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function load(): Promise<void> {
  const { queue } = await send<{ queue: BookmarkQueueItem[] }>({ type: "queue:list" });
  app.innerHTML = `
    <header>
      <h1>Bookmark Queue Agent</h1>
      <button id="process">Classify next</button>
      <button id="rollback">Rollback last move</button>
    </header>
    <section>${queue.map(renderItem).join("") || "<p>No queued bookmarks yet.</p>"}</section>
  `;
  document.querySelector<HTMLButtonElement>("#process")?.addEventListener("click", async () => { await send({ type: "queue:process-next" }); await load(); });
  document.querySelector<HTMLButtonElement>("#rollback")?.addEventListener("click", async () => { await send({ type: "queue:rollback-last" }); await load(); });
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id!;
      const action = button.dataset.action!;
      if (action === "approve") await send({ type: "queue:approve", id });
      else await send({ type: "queue:mark", id, status: action });
      await load();
    });
  });
}

function renderItem(item: BookmarkQueueItem): string {
  return `
    <article class="card">
      <h2>${escapeHtml(item.proposedTitle ?? item.originalTitle)}</h2>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
      <dl>
        <dt>Status</dt><dd>${item.status}</dd>
        <dt>Folder</dt><dd>${escapeHtml(item.proposedFolder ?? "—")}</dd>
        <dt>Confidence</dt><dd>${item.confidence?.toFixed(2) ?? "—"}</dd>
        <dt>Reason</dt><dd>${escapeHtml(item.reason ?? item.error ?? "—")}</dd>
      </dl>
      <div class="actions">
        <button data-action="approve" data-id="${item.id}">Approve</button>
        <button data-action="ignored" data-id="${item.id}">Ignore</button>
        <button data-action="archived" data-id="${item.id}">Archive</button>
        <button data-action="queued" data-id="${item.id}">Reclassify</button>
      </div>
    </article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

void load();
