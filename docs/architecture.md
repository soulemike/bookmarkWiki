# Architecture

Bookmark Queue Agent is organized as a Manifest V3 extension with an optional Windows-first native messaging host for local filesystem writes.

## Runtime components

- **Service worker:** Owns bookmark capture, Chrome bookmark event handling, context menu registration, queue processing alarms, side-panel messages, settings messages, and rollback messages.
- **Bookmark manager:** Ensures `_Bookmark Queue`, `_Needs Review`, `_Processed`, and `_Archive` exist under the Bookmarks Bar, creates or moves bookmarks into the queue, normalizes URLs, and writes the initial audit event.
- **Operation guard manager:** Stores short-lived extension operation guards in memory and `chrome.storage.local` so extension-created updates/moves do not re-enter the queue as user actions.
- **Queue processor:** Locks queued records, calls the classifier, applies review/hold/auto-move policy, approves bookmark title/folder changes, writes audit entries, and rolls back the latest approved batch.
- **Classification orchestrator:** Selects the local rule-based provider, OpenAI-compatible adapter, or OpenAI ChatGPT OAuth adapter, enforces excluded domains and extraction settings, validates provider output, and verifies strict folder resolution.
- **Folder resolver:** Builds a path-to-Chrome-folder-ID cache from `chrome.bookmarks.getTree()` and resolves rooted taxonomy paths.
- **Side panel UI:** Shows queue items and exposes classify, approve, ignore, archive, reclassify, and rollback actions.
- **Options UI:** Persists routing, automation, extraction, excluded-domain, and provider settings.
- **Native sync dispatcher:** Sends moved bookmark knowledge-base files to `com.bookmark_queue_agent.host` when native sync is explicitly enabled.
- **Native host:** Runs as a local stdio process, validates native messaging requests, rejects unsafe Windows paths, verifies SHA-256 file content, and writes Markdown/JSON artifacts under the configured target folder.

## Data storage

All MVP 1 state is local to the browser profile through `chrome.storage.local`:

- Queue items.
- Audit log entries.
- Taxonomy metadata.
- User settings.
- Provider configuration, including API key values or OAuth tokens when supplied by the user.
- Operation guards for recovery after service-worker suspension.
- Native host sync enablement and target path.

No API key, bearer-token, or OAuth refresh-token value is written to `chrome.storage.sync`, docs, examples, test fixtures, generated CI output, or knowledge-base exports.

## Implemented versus planned

Implemented now: MVP 1 capture, queue, local classification, OpenAI-compatible and ChatGPT OAuth adapters, review UI, approve/move, audit, rollback, a Windows-first native-host write foundation, and automated unit/integration coverage.

Planned later: MVP 2 bulk import and richer taxonomy editor, fuller MVP 3 filesystem knowledge-base export, and MVP 4 Git/local-model automation.
