param(
  [string]$CdpEndpoint = $(if ($env:CDP_ENDPOINT) { $env:CDP_ENDPOINT } else { "http://127.0.0.1:9223" })
)

$ErrorActionPreference = "Stop"

$targets = Invoke-RestMethod -Uri "$CdpEndpoint/json/list" -UseBasicParsing
$socket = $null
$extensionId = $null
$script:nextId = 0

function Receive-CdpMessage {
  $buffer = [byte[]]::new(65536)
  $stream = [System.IO.MemoryStream]::new()
  do {
    $segment = [ArraySegment[byte]]::new($buffer)
    $received = $socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $stream.Write($buffer, 0, $received.Count)
  } while (-not $received.EndOfMessage)
  [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
}

function Send-CdpMessage($method, $params = @{}) {
  $script:nextId += 1
  $message = @{ id = $script:nextId; method = $method; params = $params } | ConvertTo-Json -Depth 100 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($message)
  $socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {
    $response = Receive-CdpMessage
    if ($response.id -eq $script:nextId) {
      if ($response.error) { throw $response.error.message }
      return $response.result
    }
  }
}

foreach ($target in $targets) {
  if ($target.type -ne "service_worker" -or -not $target.url.StartsWith("chrome-extension://") -or -not $target.webSocketDebuggerUrl) { continue }
  $candidateSocket = [System.Net.WebSockets.ClientWebSocket]::new()
  $candidateSocket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $socket = $candidateSocket
  $script:nextId = 0
  Send-CdpMessage "Runtime.enable" | Out-Null
  $manifestName = Send-CdpMessage "Runtime.evaluate" @{ expression = "chrome.runtime.getManifest().name"; returnByValue = $true }
  if ($manifestName.result.value -eq "Bookmark Queue Agent") {
    $extensionId = [regex]::Match($target.url, '^chrome-extension://([^/]+)/').Groups[1].Value
    break
  }
  $candidateSocket.Dispose()
  $socket = $null
}

if (-not $socket -or -not $extensionId) {
  throw "Bookmark Queue Agent service worker target not found at $CdpEndpoint"
}

$socket.Dispose()
$socket = $null

$pageTarget = $targets | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } | Select-Object -First 1
if (-not $pageTarget) { throw "No page target found at $CdpEndpoint" }

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync([Uri]$pageTarget.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$script:nextId = 0
Send-CdpMessage "Page.enable" | Out-Null
Send-CdpMessage "Page.navigate" @{ url = "chrome-extension://$extensionId/sidepanel.html" } | Out-Null
Start-Sleep -Seconds 1

$expression = @'
(async () => {
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

  const waitForQueueItem = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await storageCall("get", "queueItems");
      const item = (result.queueItems ?? []).find((candidate) => candidate.url === url);
      if (item) return item;
      await sleep(250);
    }
    throw new Error("Timed out waiting for bookmark event routing to create a queue item");
  };

  const processNext = () => sendMessage({ type: "queue:process-next" });
  const approve = (id) => sendMessage({ type: "queue:approve", id });

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
  const queueItem = await waitForQueueItem();
  const routedBookmark = (await call("bookmarks", "get", created.id))[0];
  if (routedBookmark.parentId !== queueFolder.id) throw new Error("Normal bookmark creation was not routed into _Bookmark Queue");

  const processed = await processNext();
  if (!processed?.item?.id) throw new Error("queue:process-next did not return a queue item");

  const afterProcess = await storageCall("get", "queueItems");
  const processedItem = afterProcess.queueItems.find((item) => item.id === queueItem.id);
  if (processedItem.status !== "needs_review") throw new Error(`Expected needs_review after rule-based classification, got ${processedItem.status}`);

  const approved = await approve(processedItem.id);
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
})()
'@

try {
  Send-CdpMessage "Runtime.enable" | Out-Null
  $result = Send-CdpMessage "Runtime.evaluate" @{ expression = $expression; awaitPromise = $true; returnByValue = $true }
  if ($result.exceptionDetails) { throw $result.exceptionDetails.text }
  if (-not $result.result.value.ok) { throw "Smoke test returned failure" }
  $result.result.value | ConvertTo-Json -Depth 100
} finally {
  $socket.Dispose()
}
