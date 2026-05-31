# Architecture

Bookmark Queue Agent is a Manifest V3 Chrome extension with an optional
Windows-first native messaging host for local filesystem writes.

## Runtime components

- **Service worker:** owns bookmark capture, Chrome bookmark event handling,
  context-menu registration, queue-processing alarms, side-panel messages,
  settings messages, OAuth messages, native-host status checks, and rollback
  messages.
- **Bookmark manager:** ensures `_Bookmark Queue`, `_Needs Review`, `_Processed`,
  and `_Archive` exist under the Bookmarks Bar; creates or moves bookmarks into
  the queue; normalizes URLs; writes initial audit events.
- **Operation guard manager:** stores short-lived extension operation guards in
  memory and `chrome.storage.local` so extension-created updates/moves do not
  re-enter the queue as user actions.
- **Queue processor:** locks queued records, calls the classifier, applies
  review/hold/auto-move policy, approves bookmark title/folder changes, retries
  or surfaces provider errors, dispatches native sync, writes audit entries, and
  rolls back the latest approved batch.
- **Classification orchestrator:** selects the local rule-based provider,
  OpenAI-compatible adapter, or OpenAI ChatGPT OAuth adapter; enforces excluded
  domains and extraction settings; validates provider output; verifies strict
  folder resolution.
- **Folder resolver:** builds a path-to-Chrome-folder-ID cache from
  `chrome.bookmarks.getTree()` and resolves rooted taxonomy paths.
- **Side panel UI:** shows queue items and exposes classify, approve, ignore,
  archive, reclassify, rollback, and native-sync retry actions.
- **Options UI:** persists routing, automation, extraction, excluded-domain,
  provider, OAuth, and native-host settings.
- **Native sync dispatcher:** sends moved bookmark knowledge-base files to
  `com.bookmark_queue_agent.host` when native sync is explicitly enabled.
- **Native host:** runs as a local stdio process, validates native messaging
  requests, rejects unsafe Windows paths, verifies SHA-256 file content, and
  writes Markdown/JSON artifacts under the configured target folder.

## Main flows

### Explicit capture

1. User clicks the extension toolbar action or a context-menu link action.
2. The service worker asks the bookmark manager to create a queue bookmark.
3. The bookmark manager normalizes the URL, ensures queue folders exist, writes
   or updates the queue item, and records an audit event.
4. Queue processing is kicked so a queued item can be classified.

### Normal bookmark routing

1. Chrome creates a bookmark normally.
2. `chrome.bookmarks.onCreated` fires.
3. The service worker ignores the event if it matches a non-expired operation
   guard.
4. If **Route normal bookmarks to queue** is enabled, the bookmark is moved into
   `_Bookmark Queue` and represented as a queue item.

### Classification and approval

1. The queue processor finds an unlocked `queued` item and locks it briefly.
2. The classification orchestrator calls the configured provider.
3. Valid output fills proposed title/folder/tags/summary/confidence/reason.
4. Confidence policy and provider `recommended_action` determine whether the
   item stays in review, is ignored/held, or is auto-approved.
5. Approval resolves the proposed folder, updates the bookmark title, moves the
   bookmark, writes audit entries, and optionally dispatches native sync.

### Rollback

1. The side panel sends **Rollback last move**.
2. The queue processor finds the latest audit batch containing a title update or
   bookmark move.
3. It reverses entries in reverse order, restoring the previous folder and title
   when the underlying Chrome bookmark/folder still exists.
4. Rollback audit entries are appended.

## Data storage

All current extension state is local to the browser profile through
`chrome.storage.local`:

- Queue items.
- Audit log entries.
- Taxonomy metadata.
- User settings.
- Provider configuration, including API key values or OAuth tokens when supplied
  by the user.
- Operation guards for recovery after service-worker suspension.
- Native host sync enablement and target path.

No API key, bearer-token, or OAuth refresh-token value is written to
`chrome.storage.sync`, docs, examples, test fixtures, generated CI output, or
knowledge-base exports.

## Implemented versus planned

Implemented now: MVP 1 capture, queue, local classification,
OpenAI-compatible and ChatGPT OAuth adapters, review UI, approve/move, audit,
rollback, a Windows-first native-host write foundation, and automated
unit/integration coverage.

Implemented but limited: page extraction source exists and the classifier accepts
optional page text, but the normal side-panel/background classification path does
not currently extract or pass page text; native sync writes per-bookmark artifacts
but is not the full MVP 3 exporter.

Planned later: MVP 2 bulk import and richer taxonomy editor, fuller MVP 3
filesystem knowledge-base export, and MVP 4 Git/local-model automation.
