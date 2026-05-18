# Implementation Status

This document is intended to make the MVP deliverables explicit when reviewing CI or the pull request.

## Completed MVP 1 foundation

- **Loadable extension shape:** Manifest V3 manifest, service worker, side panel, options page, and content script entry points are present.
- **Inbound queue capture:** Users can add the active tab, add a selected link from the context menu, or opt in to moving newly created Chrome bookmarks into `_Bookmark Queue` after `chrome.bookmarks.onCreated` fires.
- **Durable queue data:** Queue items, taxonomy, settings, provider configuration, operation guards, and audit log entries persist through `chrome.storage.local`.
- **Duplicate prevention:** URL normalization and queue upsert logic prevent duplicate active queue records for the same normalized URL.
- **Local classification path:** The no-AI rule provider can produce title/folder/tag/confidence recommendations without any network provider.
- **BYO provider path:** An OpenAI-compatible adapter validates config, applies request timeouts, parses JSON responses, validates the result contract, and normalizes common HTTP/provider failures.
- **Strict folder validation:** Folder resolution maps absolute taxonomy paths such as `/Bookmarks Bar/Work` to Chrome bookmark folder IDs and blocks missing or ambiguous folders in strict mode.
- **Review-first workflow:** The side panel exposes classify, approve, ignore, archive, reclassify, and rollback actions. Auto-move remains disabled by default.
- **Rollback-safe bookmark mutation:** Approval writes separate audit entries for title update and folder move, allowing reverse-order rollback of the latest approved batch.

## Not included yet

- Full taxonomy editor UI.
- Bulk import from existing Chrome folders.
- Filesystem knowledge-base export and Markdown/JSON generation.
- Native host continuous sync, Git commit automation, SQLite, or vector-ready exports.
- Live-provider contract tests against real cloud services.
- Automated real-browser E2E execution in CI.

## How to read a successful CI run

A successful CI run means:

1. Pull request CI has full Git history and verifies the checked-out branch includes the current PR base branch.
2. The repository has no unresolved Git merge conflict markers.
3. The TypeScript source type-checks.
4. The extension can be built into `extension/dist`.
5. Automated unit/integration tests pass for URL normalization, classification validation, confidence routing, folder paths, slug sanitization, queue transitions, folder resolution, and rule-based classification.
6. The workflow summary lists the exact MVP capabilities implemented in this repository.
