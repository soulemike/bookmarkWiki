const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9223";

const targets = await fetchJson(`${endpoint}/json/list`);
const serviceWorker = await findBookmarkQueueAgent(targets);
serviceWorker.cdp.close();
const cdp = await findPage(targets);

try {
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: `chrome-extension://${serviceWorker.extensionId}/sidepanel.html` });
  await sleep(1000);
  await cdp.send("Runtime.enable");
  const result = await cdp.send("Runtime.evaluate", {
    expression: `(${smokeInServiceWorker.toString()})()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Smoke test failed inside extension service worker");
  }
  const value = result.result?.value;
  if (!value?.ok) throw new Error(value?.message ?? "Smoke test returned an unknown failure");
  console.log(JSON.stringify(value, null, 2));
} finally {
  cdp.close();
}

async function findBookmarkQueueAgent(targets) {
  const candidates = targets.filter((target) => target.type === "service_worker" && target.url.startsWith("chrome-extension://") && target.webSocketDebuggerUrl);
  for (const target of candidates) {
    const candidate = await connectCdp(target.webSocketDebuggerUrl);
    try {
      await candidate.send("Runtime.enable");
      const result = await candidate.send("Runtime.evaluate", { expression: "chrome.runtime.getManifest().name", returnByValue: true });
      if (result.result?.value === "Bookmark Queue Agent") {
        return { cdp: candidate, extensionId: target.url.match(/^chrome-extension:\/\/([^/]+)\//)?.[1] };
      }
    } catch {
      candidate.close();
    }
  }
  throw new Error(`Bookmark Queue Agent service worker target not found at ${endpoint}`);
}

async function findPage(targets) {
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) throw new Error(`No page target found at ${endpoint}`);
  return connectCdp(page.webSocketDebuggerUrl);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let id = 0;
    const pending = new Map();

    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((messageResolve, messageReject) => {
            pending.set(messageId, { resolve: messageResolve, reject: messageReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
    });
  });
}

async function smokeInServiceWorker() {
  const suffix = Date.now().toString(36);
  const url = `https://github.com/microsoft/playwright?utm_source=bookmark-smoke#readme-${suffix}`;
  const title = `Smoke GitHub Playwright ${suffix}`;

  const call = (namespace, method, ...args) => new Promise((resolve, reject) => {
    chrome[namespace][method](...args, (result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) reject(new Error(lastError.message));
      else resolve(result);
    });
  });

  const storageCall = (method, ...args) => new Promise((resolve, reject) => {
    chrome.storage.local[method](...args, (result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) reject(new Error(lastError.message));
      else resolve(result);
    });
  });

  const sendMessage = (message) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) reject(new Error(lastError.message));
      else resolve(response);
    });
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const childrenOfBar = () => call("bookmarks", "getChildren", "1");
  const ensureFolder = async (name) => {
    const children = await childrenOfBar();
    const existing = children.find((node) => !node.url && node.title === name);
    return existing ?? call("bookmarks", "create", { parentId: "1", title: name });
  };

  await storageCall("clear");
  const queueFolder = await ensureFolder("_Bookmark Queue");
  await ensureFolder("_Needs Review");
  await ensureFolder("_Processed");
  await ensureFolder("_Archive");
  const workFolder = await ensureFolder("Work");

  await storageCall("set", {
    settings: {
      routeNormalBookmarks: true,
      provider: "rule-based",
      strictMode: true,
      enableAutoMove: false,
      reviewThreshold: 0.7,
      autoMoveThreshold: 0.9,
      excludedDomains: [],
      allowPageTextExtraction: false
    }
  });

  const created = await call("bookmarks", "create", { parentId: "1", title, url });
  const queueItem = await waitForQueueItem(storageCall, url, 20, sleep);
  const routedBookmark = (await call("bookmarks", "get", created.id))[0];
  if (routedBookmark.parentId !== queueFolder.id) {
    throw new Error("Normal bookmark creation was not routed into _Bookmark Queue");
  }

  const processed = await processNext(sendMessage);
  if (!processed?.item?.id) throw new Error("queue:process-next did not return a queue item");

  const afterProcess = await storageCall("get", "queueItems");
  const processedItem = afterProcess.queueItems.find((item) => item.id === queueItem.id);
  if (processedItem.status !== "needs_review") {
    throw new Error(`Expected needs_review after rule-based classification, got ${processedItem.status}`);
  }

  const approved = await approve(sendMessage, processedItem.id);
  if (approved?.item?.status !== "moved") throw new Error("queue:approve did not move the bookmark");

  const movedBookmark = (await call("bookmarks", "get", created.id))[0];
  if (movedBookmark.parentId !== workFolder.id) throw new Error("Approved bookmark did not move to /Bookmarks Bar/Work");
  if (!movedBookmark.title.startsWith("GitHub:")) throw new Error("Approved bookmark title was not updated");

  await sendMessage({ type: "queue:rollback-last" });
  const rolledBackBookmark = (await call("bookmarks", "get", created.id))[0];
  if (rolledBackBookmark.parentId !== queueFolder.id) throw new Error("Rollback did not restore the prior folder");
  if (rolledBackBookmark.title !== title) throw new Error("Rollback did not restore the prior title");

  const auditResult = await storageCall("get", "auditLog");
  const auditActions = (auditResult.auditLog ?? []).map((entry) => entry.action);
  for (const action of ["create_queue_item", "classify_bookmark", "update_title", "move_bookmark", "rollback"]) {
    if (!auditActions.includes(action)) throw new Error(`Missing audit action: ${action}`);
  }

  return {
    ok: true,
    extensionId: chrome.runtime.id,
    chromeUserAgent: navigator.userAgent,
    bookmarkId: created.id,
    queueItemId: queueItem.id,
    finalBookmarkParentId: rolledBackBookmark.parentId,
    auditActions
  };
}

async function waitForQueueItem(storageCall, url, attempts, sleep) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await storageCall("get", "queueItems");
    const item = (result.queueItems ?? []).find((candidate) => candidate.url === url);
    if (item) return item;
    await sleep(250);
  }
  throw new Error("Timed out waiting for bookmark event routing to create a queue item");
}

async function processNext(sendMessage) {
  return sendMessage({ type: "queue:process-next" });
}

async function approve(sendMessage, id) {
  return sendMessage({ type: "queue:approve", id });
}
