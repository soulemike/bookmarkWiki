# Bookmark Queue Agent

Bookmark Queue Agent is a Manifest V3 Chrome extension that gives bookmarks an
inbound review queue before they settle into your long-term folder taxonomy. It
can capture the current tab or a link, classify the queued bookmark with either
local rules or a bring-your-own AI provider, show the recommendation in a side
panel, and apply the final title/folder move with rollback-safe audit entries.

This repository implements the current MVP extension plus a Windows-first native
host foundation for writing approved bookmarks to local Markdown/JSON files.
The broader product roadmap is described in [`bookmarkSpec.md`](bookmarkSpec.md).

## Current user-facing capabilities

| Area | What works today | Primary files |
| --- | --- | --- |
| Chrome extension shell | MV3 service worker, toolbar action, side panel, options page, context menu, alarms, native messaging permission | `extension/public/manifest.json`, `extension/src/background/service-worker.ts`, `extension/src/ui/` |
| Bookmark capture | Click the extension action to queue the active tab; right-click a link and choose **Add link to Bookmark Queue**; optionally route normal Chrome bookmark creations into `_Bookmark Queue` | `extension/src/background/service-worker.ts`, `extension/src/background/bookmark-manager.ts` |
| Queue and review | Side panel lists queued items and supports **Classify next**, **Approve**, **Ignore**, **Archive**, **Reclassify**, **Rollback last move**, and **Retry native sync** after sync failures | `extension/src/ui/sidepanel/main.ts`, `extension/src/background/queue-processor.ts` |
| Classification providers | Default no-AI rule provider, OpenAI-compatible API/local bridge provider, and OpenAI ChatGPT OAuth provider | `extension/src/providers/`, `extension/src/background/classifier.ts` |
| Settings | Route normal bookmarks, auto-move threshold, review threshold, page text extraction toggle, excluded domains, provider settings, OAuth connect/disconnect, native-host sync settings | `extension/src/ui/options/main.ts`, `extension/src/background/storage.ts` |
| Rollback and audit | Approval writes separate title-update and folder-move audit entries; rollback reverses the latest approved batch in reverse order | `extension/src/background/queue-processor.ts`, `extension/src/models/audit-log.ts` |
| Local file sync | Optional native-host sync writes moved bookmarks as Markdown, JSON, and recent NDJSON index files under a configured Windows folder | `extension/src/background/sync-dispatcher.ts`, `native-host/src/index.ts` |

## Install and load locally

```sh
cd extension
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select `extension/dist`.

The extension requests bookmark, storage, context-menu, active-tab, side-panel,
alarm, scripting, and native-messaging permissions. OpenAI/ChatGPT endpoint host
permissions are declared in the manifest; additional OpenAI-compatible provider
origins are requested when you configure them.

## First-run setup

1. Open the extension options page from `chrome://extensions`.
2. Keep **No-AI rule based** selected for the safest first run, or configure one
   of the provider options below.
3. Leave **Enable auto-move for high confidence** off until you trust the
   taxonomy and recommendations. The default review threshold is `0.70`; the
   default auto-move threshold is `0.90`.
4. Keep **Allow page text extraction** off unless you are testing an extraction
   path. The classifier accepts optional page text, but normal side-panel and
   background classification do not currently extract or pass page text, so this
   toggle alone does not change normal classification.
5. Add any **Excluded domains** as comma-separated hostnames if those bookmarks
   should not be classified by any provider.
6. Click **Save**.

## Day-to-day use

1. Add a bookmark to the queue:
   - Click the extension toolbar action to queue the active tab.
   - Or right-click a link and choose **Add link to Bookmark Queue**.
   - Or enable **Route normal bookmarks to queue** to move newly created Chrome
     bookmarks into `_Bookmark Queue` after Chrome creates them.
2. Open the side panel and click **Classify next**.
3. Review the proposed title, folder, confidence, and reason.
4. Choose one of the side-panel actions:
   - **Approve** updates the Chrome bookmark title and moves it to the resolved
     taxonomy folder.
   - **Ignore** leaves the queue record ignored.
   - **Archive** archives the queue record without applying the recommendation.
   - **Reclassify** puts the item back into `queued` state for another attempt.
   - **Rollback last move** reverses the latest approved title/move batch when
     the bookmark and original folder still exist.
   - **Retry native sync** appears only for moved items whose native-host export
     failed.

## Provider choices

- **No-AI rule based** is the default and makes deterministic local
  recommendations without network provider calls.
- **OpenAI-compatible API / local bridge** sends classification requests to a
  `/chat/completions` endpoint and currently requires a non-empty API key or
  compatible bearer-token field, even for a local bridge. Use `https://` for
  remote providers. Plain `http://` is accepted only for loopback bridges such as
  `localhost` or `127.0.0.1`.
- **OpenAI ChatGPT OAuth** uses OpenAI device authorization. Click **Save and
  connect ChatGPT OAuth**, approve the displayed code in the opened OpenAI tab,
  and return to the options page while it polls for completion. Browser cookies,
  copied ChatGPT session tokens, and Codex web sessions are not used as
  credentials.

API keys, bearer tokens, and OAuth tokens are stored in `chrome.storage.local`
for the browser profile. They are not stored in sync storage, examples, test
fixtures, generated docs, or native-host exports.

## Optional Windows native-host sync

Native sync is off by default. When enabled and configured, each approved/moved
bookmark can be exported to a local folder as:

- `bookmarks/<slug>.md`
- `bookmarks/<slug>.json`
- `indexes/recent/<slug>.ndjson`

See [`docs/setup.md`](docs/setup.md) for the Windows registration steps. The
options page **Test connection** button checks whether Chrome can reach
`com.bookmark_queue_agent.host`.

## Current boundaries

- This is still an MVP extension, not the full future knowledge-base product.
- Bulk import, a full taxonomy editor, Git automation, SQLite/vector exports,
  packaged native-host installers, and macOS/Linux native-host registration are
  not implemented yet.
- The content extraction module exists in source, but normal classification does
  not currently extract or pass page text.
- Real-browser extension smoke testing is a release gate; automated tests use
  mocked Chrome APIs plus native-host unit coverage.

## Development

```sh
cd extension
npm install
npm run typecheck
npm test
npm run build
```

The built unpacked extension is emitted to `extension/dist`.

Additional docs:

- [`docs/setup.md`](docs/setup.md) - detailed setup, provider, and native-host instructions
- [`docs/provider-adapters.md`](docs/provider-adapters.md) - provider behavior and authentication boundaries
- [`docs/architecture.md`](docs/architecture.md) - component map and runtime flow
- [`docs/implementation-status.md`](docs/implementation-status.md) - implemented versus planned scope
- [`docs/testing.md`](docs/testing.md) - automated and manual verification
- [`docs/privacy.md`](docs/privacy.md) and [`docs/security.md`](docs/security.md) - data handling and safety notes
- [`docs/release.md`](docs/release.md) - release checklist
