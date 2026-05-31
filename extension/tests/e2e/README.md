# E2E smoke test plan

The MVP 1 release smoke test loads `extension/dist` in Chrome/Chromium, validates post-create bookmark routing, classifies with the rule-based provider, approves the move, verifies audit entries, and rolls the batch back. This repository includes unit/integration automation; real browser execution is a release gate in an environment with Chrome extension loading available.

## CDP-assisted smoke check

Build the extension, launch Chrome or Chromium with remote debugging and the unpacked extension, then run the dependency-free smoke script:

```sh
npm run build
chrome \
  --user-data-dir=/tmp/bookmark-queue-agent-smoke-profile \
  --remote-debugging-port=9223 \
  --disable-extensions-except=/absolute/path/to/extension/dist \
  --load-extension=/absolute/path/to/extension/dist \
  --no-first-run \
  --no-default-browser-check \
  about:blank
CDP_ENDPOINT=http://127.0.0.1:9223 npm run smoke:chrome
```

On Windows or WSL where Chrome's remote debugging port is reachable only from Windows networking, run the PowerShell CDP runner instead:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/real-browser-smoke.ps1 -CdpEndpoint http://127.0.0.1:9223
```

The script validates extension loading, post-create bookmark routing, queue persistence, rule-based classification, approval move/title update, rollback, and rollback-safe audit entries in a real Chrome/Chromium profile. Active-tab and context-menu capture should still be verified manually before release because they require user gesture/browser UI interaction.

## Latest local smoke evidence

- Date: 2026-05-18
- Browser: Microsoft Edge / Chromium 148 on Windows, launched from WSL with a clean copy of rebuilt `extension/dist` loaded unpacked.
- Command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/real-browser-smoke.ps1 -CdpEndpoint http://127.0.0.1:9324`
- Result: passed.
- Covered: extension service worker discovery, post-create bookmark routing, queue persistence, rule-based classification, approve move/title update, rollback, and audit entries for `create_queue_item`, `classify_bookmark`, `update_title`, `move_bookmark`, and `rollback`.
- Remaining manual release checks: extension action active-tab capture and context-menu link capture, because both are user gesture/browser UI flows.
