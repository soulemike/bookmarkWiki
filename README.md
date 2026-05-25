# Bookmark Queue Agent

Bookmark Queue Agent is a Manifest V3 Chrome extension MVP for the specification in
[`bookmarkSpec.md`](bookmarkSpec.md). This repository now contains a loadable extension
skeleton plus the core local-first bookmark queue pipeline: capture, normalize, classify,
review, approve/move, audit, and rollback.

## What this PR implements

| Spec area | Implemented in this repository | Primary files |
| --- | --- | --- |
| MV3 extension shell | Manifest, service worker, side panel, options page, content script wiring | `extension/public/manifest.json`, `extension/src/background/service-worker.ts`, `extension/src/ui/` |
| Bookmark capture | Action-click current tab capture, context-menu link capture, optional post-create bookmark routing | `extension/src/background/service-worker.ts`, `extension/src/background/bookmark-manager.ts` |
| Queue durability | Queue items, settings, taxonomy, provider config, and audit log persisted in `chrome.storage.local` | `extension/src/background/storage.ts`, `extension/src/models/` |
| Loop prevention | In-memory and persisted operation guards for extension-initiated bookmark operations | `extension/src/background/operation-guard.ts` |
| Classification | Rule-based no-AI provider, OpenAI-compatible BYO adapter, result validation, strict folder resolution | `extension/src/providers/`, `extension/src/background/classifier.ts`, `extension/src/background/folder-resolver.ts` |
| Review workflow | Side panel actions for classify next, approve, ignore, archive, reclassify, and rollback last move | `extension/src/ui/sidepanel/` |
| Provider/settings UI | Options page for provider choice, OpenAI-compatible settings, routing, auto-move, extraction, excluded domains | `extension/src/ui/options/` |
| Rollback-safe operations | Separate audit entries for title update and folder move, plus reverse-order rollback | `extension/src/background/queue-processor.ts`, `extension/src/models/audit-log.ts` |
| Build/test automation | Type-check, build, node:test unit/integration suites, CI summary output | `extension/package.json`, `extension/scripts/`, `.github/workflows/ci.yml` |

## MVP 1 user flow

1. Load `extension/dist` as an unpacked Chrome/Chromium extension after running the build.
2. Click the extension action to add the active tab to `_Bookmark Queue`, or right-click a link and choose **Add link to Bookmark Queue**.
3. Open the side panel and click **Classify next**.
4. Review the proposed title, folder, confidence, and reason.
5. Click **Approve** to update the Chrome bookmark title and move it to the resolved taxonomy folder, or choose **Ignore**, **Archive**, or **Reclassify**.
6. Click **Rollback last move** to reverse the latest approved title/move batch when the bookmark and source folder still exist.

## Current boundaries

- This is primarily an MVP 1 implementation with a Windows-first native-host write foundation; it is not yet the full MVP 3 filesystem knowledge-base exporter or MVP 4 Git/local-model automation.
- The default provider is local deterministic rules; remote AI only runs after the user configures an OpenAI-compatible API, local bridge provider, or OpenAI ChatGPT OAuth provider.
- OpenAI-compatible API access uses a user-supplied API project key, local-bridge token, or the OpenAI device authorization flow; ChatGPT subscriptions, Codex login, copied session tokens, and browser web sessions are not API credentials for this extension.
- Provider URLs must use HTTPS, except loopback HTTP is allowed for local OpenAI-compatible bridges such as `localhost` or `127.0.0.1`.
- API keys and bearer tokens are stored through `chrome.storage.local` only and are not written to sync storage, docs, fixtures, exports, or tests.
- Real-browser extension E2E execution is documented as a release gate; automated coverage currently uses unit/integration tests with mocked Chrome APIs.

## Development

```sh
cd extension
npm install
npm run typecheck
npm test
npm run build
```

The built unpacked extension is emitted to `extension/dist`.

## CI output

The GitHub Actions workflow runs the same type-check, test, and build commands, uploads `extension/dist` as the `bookmark-queue-agent-extension` artifact, and writes a step summary that lists the delivered MVP surface area.
