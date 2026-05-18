import { appendFile } from "node:fs/promises";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const markdown = `
# Bookmark Queue Agent MVP CI Summary

## What this build validates

- CI checks out full Git history, verifies PR branches include the current base branch, compiles Manifest V3 extension sources into \`extension/dist\`, verifies key files exist from the repository root, and then uploads that directory as the \`bookmark-queue-agent-extension\` artifact.
- The service worker supports current-tab capture, context-menu link capture, optional normal-bookmark routing, queue processing, approval, audit, and rollback message handlers.
- The local no-AI rule provider and OpenAI-compatible provider adapter are included in the build.
- Unit/integration tests cover URL normalization, classification validation, confidence decisions, folder-path validation, slug sanitization, queue state transitions, folder resolution, and rule-based classification.

## MVP boundaries

- Filesystem knowledge-base export is intentionally deferred to MVP 3.
- Native host sync is intentionally a placeholder for MVP 4.
- Real browser E2E loading remains a release-gate checklist item rather than a CI step in this workflow.
`;

if (summaryPath) {
  await appendFile(summaryPath, markdown);
} else {
  console.log(markdown);
}
