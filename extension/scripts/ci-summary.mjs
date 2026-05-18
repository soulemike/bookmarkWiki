import { appendFile } from "node:fs/promises";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const runUrl = repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : undefined;
const zipArtifactId = process.env.EXTENSION_ZIP_ARTIFACT_ID;
const zipArtifactUrl = process.env.EXTENSION_ZIP_ARTIFACT_URL;
const distArtifactId = process.env.EXTENSION_DIST_ARTIFACT_ID;
const distArtifactUrl = process.env.EXTENSION_DIST_ARTIFACT_URL;
const markdown = `
# Bookmark Queue Agent MVP CI Summary

## Download Extension

| Artifact | Purpose | Link |
| --- | --- | --- |
| \`bookmark-queue-agent-extension-zip\` | Installable/downloadable extension package | ${artifactLink("Download ZIP", zipArtifactUrl, zipArtifactId)} |
| \`bookmark-queue-agent-extension-dist\` | Raw unpacked extension directory for inspection | ${artifactLink("Download dist", distArtifactUrl, distArtifactId)} |

${runUrl ? `If the direct links are hidden by GitHub permissions, open the [workflow run artifacts section](${runUrl}) and download \`bookmark-queue-agent-extension-zip\`.` : "Download the `bookmark-queue-agent-extension-zip` artifact from this workflow run."}

## What this build validates

- Manifest V3 extension sources compile and build into \`extension/dist\`, which the workflow verifies and uploads as the \`bookmark-queue-agent-extension\` artifact.
- The workflow fails before upload if required files in \`extension/dist\` are missing or empty.
- The workflow packages the extension as \`bookmark-queue-agent-extension.zip\` and uploads both the ZIP and raw \`dist\` directory artifacts.
- The service worker supports current-tab capture, context-menu link capture, optional normal-bookmark routing, queue processing, approval, audit, and rollback message handlers.
- The local no-AI rule provider and OpenAI-compatible provider adapter are included in the build.
- Unit/integration tests cover URL normalization, classification validation, confidence decisions, folder-path validation, slug sanitization, queue state transitions, folder resolution, and rule-based classification.

## MVP boundaries

- Filesystem knowledge-base export is intentionally deferred to MVP 3.
- Native host sync is intentionally a placeholder for MVP 4.
- Real browser E2E loading remains a release-gate checklist item rather than a CI step in this workflow.

## Artifacts

- Extension ZIP artifact: ${artifactLink("bookmark-queue-agent-extension-zip", zipArtifactUrl, zipArtifactId)}
- Raw dist artifact: ${artifactLink("bookmark-queue-agent-extension-dist", distArtifactUrl, distArtifactId)}
`;

if (summaryPath) {
  await appendFile(summaryPath, markdown);
} else {
  console.log(markdown);
}

function artifactLink(label, url, artifactId) {
  if (url) return `[${label}](${url})`;
  if (artifactId) return `${label} (artifact ID: ${artifactId})`;
  return label;
}
