# Architecture

Bookmark Queue Agent is organized as a Manifest V3 extension with a small optional native-host placeholder for future MVP 4 work.

## Runtime components

- **Service worker:** Owns bookmark capture, Chrome bookmark event handling, context menu registration, queue processing alarms, side-panel messages, settings messages, and rollback messages.
- **Bookmark manager:** Ensures `_Bookmark Queue`, `_Needs Review`, `_Processed`, and `_Archive` exist under the Bookmarks Bar, creates or moves bookmarks into the queue, normalizes URLs, and writes the initial audit event.
- **Operation guard manager:** Stores short-lived extension operation guards in memory and `chrome.storage.local` so extension-created updates/moves do not re-enter the queue as user actions.
- **Queue processor:** Locks queued records, calls the classifier, applies review/hold/auto-move policy, approves bookmark title/folder changes, writes audit entries, and rolls back the latest approved batch.
- **Classification orchestrator:** Selects either the local rule-based provider or the OpenAI-compatible adapter, enforces excluded domains and extraction settings, validates provider output, and verifies strict folder resolution.
- **Folder resolver:** Builds a path-to-Chrome-folder-ID cache from `chrome.bookmarks.getTree()` and resolves rooted taxonomy paths.
- **Side panel UI:** Shows queue items and exposes classify, approve, ignore, archive, reclassify, and rollback actions.
- **Options UI:** Persists routing, automation, extraction, excluded-domain, and provider settings.

## Data storage

All MVP 1 state is local to the browser profile through `chrome.storage.local`:

- Queue items.
- Audit log entries.
- Taxonomy metadata.
- User settings.
- Provider configuration, including API key values when supplied by the user.
- Operation guards for recovery after service-worker suspension.

No API key or bearer-token value is written to `chrome.storage.sync`, docs, examples, test fixtures, generated CI output, or knowledge-base exports.

## Implemented versus planned

Implemented now: MVP 1 capture, queue, local classification, OpenAI-compatible adapter, review UI, approve/move, audit, rollback, and automated unit/integration coverage.

Planned later: MVP 2 bulk import and richer taxonomy editor, MVP 3 filesystem knowledge-base export, and MVP 4 native host/Git/local-model automation.
