# Release checklist

Use this checklist before sharing a build or treating the MVP extension as ready
for human testing.

## 1. Pre-release hygiene

- Confirm the working tree contains only intentional changes.
- Ensure no API keys, bearer tokens, OAuth tokens, local target paths, or
  personal bookmark exports were added to docs, fixtures, examples, or tests.
- Review `README.md`, `docs/setup.md`, and `docs/implementation-status.md` for
  current behavior and known limitations.

## 2. Automated verification

```sh
cd extension
npm run typecheck
npm test
npm run build
npm run verify:dist
```

Expected result: each command exits successfully and `extension/dist` contains a
loadable Manifest V3 extension.

## 3. Manual extension smoke checks

Load `extension/dist` unpacked in Chrome or Chromium with a clean profile when
possible.

Check these user flows:

1. Toolbar action queues the active tab and opens the side panel.
2. Context menu queues a selected link with **Add link to Bookmark Queue**.
3. Optional normal-bookmark routing moves a newly created Chrome bookmark into
   `_Bookmark Queue`.
4. **Classify next** works with the no-AI rule provider.
5. **Approve** updates the bookmark title and moves it to the proposed folder.
6. **Rollback last move** restores the previous title/folder.
7. **Ignore**, **Archive**, and **Reclassify** update queue state as expected.
8. Provider settings save, request optional host permission for custom
   OpenAI-compatible origins when needed, and preserve saved secrets when
   expected.
9. ChatGPT OAuth connect/disconnect works without manual endpoint setup.
10. Native-host **Test connection** reports the expected status for the target
    environment.

## 4. Real-browser smoke script

Follow `extension/tests/e2e/README.md` for CDP-assisted smoke execution. Record
date, browser, command, and result when adding new smoke evidence.

## 5. Native-host release checks

On Windows:

1. Build/load the extension and copy the extension ID.
2. Run `native-host/install-windows.ps1` for Chrome, Edge, or both.
3. Use **Test connection** in the options page.
4. Enable local file sync and approve a bookmark.
5. Confirm Markdown, JSON, and recent NDJSON files are written under the
   configured target folder.
6. Confirm path traversal, Windows-reserved names, and hash mismatches are still
   rejected by automated tests.

## 6. Known release boundaries

- Bulk import, full taxonomy editor UI, full MVP 3 export UI, Git automation,
  packaged native-host installers, and macOS/Linux registration automation are
  not implemented yet.
- Page extraction source exists, but normal side-panel/background classification
  does not currently extract or pass page text.
- Live-provider contract tests against real cloud services are not part of CI.
