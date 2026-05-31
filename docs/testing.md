# Testing

The repository combines TypeScript checks, build verification, Node test suites,
and a real-browser smoke plan.

## Local verification commands

```sh
cd extension
npm run typecheck
npm test
npm run build
```

`npm test` runs `npm run build` first, then executes `node --test
"tests/**/*.test.mjs"`.

## Automated coverage areas

Current unit/integration coverage includes:

- URL normalization and duplicate queue behavior.
- Classification result validation and confidence routing.
- Rule-based provider behavior.
- OpenAI-compatible and ChatGPT OAuth provider request/error handling.
- Queue transitions, retry behavior, approve/move behavior, rollback, and audit
  entries.
- Folder path handling and strict folder resolution.
- Slug sanitization for exported filenames.
- Native messaging codec, Windows-safe path validation, hashed file writes, and
  extension native-sync dispatcher payloads.

Native-host tests do not require registering the host with Chrome.

## Real-browser smoke testing

Real browser execution is a release gate in an environment that can load Chrome
extensions. See `extension/tests/e2e/README.md` for the CDP-assisted smoke test.

The smoke test builds the extension, loads `extension/dist` unpacked, and checks:

- Extension service worker discovery.
- Post-create bookmark routing into `_Bookmark Queue`.
- Queue persistence.
- Rule-based classification.
- Approval title update and folder move.
- Rollback.
- Rollback-safe audit entries.

Active-tab capture and context-menu link capture still require manual release
checks because they depend on browser UI/user gesture behavior.

## When a test fails

- Re-run `npm run typecheck` first to catch TypeScript issues before build/test
  noise.
- If provider tests fail, check whether the change affects request shape,
  response parsing, retry codes, or OAuth token handling.
- If queue tests fail, verify queue status transitions and audit entry order.
- If native-host tests fail, verify path normalization, reserved-name handling,
  hash generation, and native messaging length-prefix framing.
- If the real-browser smoke test fails, confirm `extension/dist` was rebuilt and
  loaded from the same path passed to Chrome.
