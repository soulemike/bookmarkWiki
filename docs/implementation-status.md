# Implementation status

This page separates what the extension does today from what remains on the
larger product roadmap in `bookmarkSpec.md`.

## Implemented today

- **Loadable Manifest V3 extension:** service worker, toolbar action, side
  panel, options page, context-menu item, queue-processing alarm, and native
  messaging permission are present.
- **Inbound queue capture:** users can add the active tab, add a selected link
  from the context menu, route newly created Chrome bookmarks into
  `_Bookmark Queue`, or move a bookmark into the queue folder.
- **Durable local state:** queue items, taxonomy, settings, provider
  configuration, operation guards, and audit entries persist through
  `chrome.storage.local`.
- **Duplicate prevention:** URL normalization and queue upsert logic prevent
  duplicate active queue records for the same normalized URL.
- **Classification providers:** the no-AI rule provider works without network
  access; OpenAI-compatible and OpenAI ChatGPT OAuth adapters support remote or
  local provider classification with result validation.
- **Provider error handling:** transient provider failures can retry according to
  provider settings; non-recoverable or exhausted failures move the item to
  `needs_review` with an error message/code.
- **Strict folder validation:** rooted taxonomy paths such as
  `/Bookmarks Bar/Work` resolve to Chrome bookmark folder IDs before approval.
- **Review-first side panel:** users can classify next, approve, ignore,
  archive, reclassify, rollback the last move, and retry failed native sync.
- **Auto-move policy:** auto-move is disabled by default and only applies when
  enabled and confidence meets the configured auto-move threshold.
- **Rollback-safe bookmark mutation:** approval writes separate audit entries for
  title update and folder move, allowing reverse-order rollback of the latest
  approved batch.
- **Windows-first native-host foundation:** the extension can test native-host
  status and, when explicitly enabled, export moved bookmarks as Markdown, JSON,
  and recent NDJSON files.

## Implemented but intentionally limited

- **Page text extraction:** a content extraction listener exists in source and
  the classifier accepts optional page text, but normal side-panel/background
  classification does not currently extract or pass page text. Treat the options
  toggle as opt-in plumbing for future or explicitly wired extraction flows.
- **Filesystem export:** native-host sync writes per-bookmark artifacts, but this
  is not yet the full MVP 3 knowledge-base exporter and indexer.
- **Native host support:** Windows registration is documented and scripted;
  macOS/Linux manifest templates exist, but registration automation is not
  complete.

## Not included yet

- Full taxonomy editor UI.
- Bulk import from existing Chrome bookmark folders.
- Full MVP 3 filesystem export UI and complete Markdown/JSON index generation.
- Git commit automation, SQLite storage, vector-ready exports, or local-model
  automation.
- Packaged native-host installer.
- macOS/Linux native-host registration automation.
- Live-provider contract tests against real cloud services.
- Automated real-browser E2E execution in CI.

## Local smoke evidence

- 2026-05-18: A CDP-assisted Microsoft Edge / Chromium 148 smoke run passed
  against a clean copy of rebuilt `extension/dist` loaded unpacked.
- Covered: extension service worker discovery, normal bookmark post-create
  routing into `_Bookmark Queue`, queue persistence, rule-based classification,
  approval move/title update, rollback, and rollback-safe audit entries.
- Remaining manual release checks: extension action active-tab capture and
  context-menu link capture.

## How to read a successful CI run

A successful CI run means:

1. The TypeScript source type-checks.
2. The extension can be built into `extension/dist`.
3. Automated unit/integration tests pass for URL normalization, classification
   validation, confidence routing, folder paths, slug sanitization, queue
   transitions, folder resolution, provider behavior, native-host dispatch, and
   rule-based classification.
4. The workflow summary lists the MVP capabilities implemented in this
   repository.
