import { appendFile } from "node:fs/promises";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const runUrl = repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : undefined;
const extensionArtifactId = process.env.EXTENSION_ARTIFACT_ID;
const extensionArtifactUrl = process.env.EXTENSION_ARTIFACT_URL;
const markdown = `
# Bookmark Queue Agent MVP CI Summary

## Download Extension

| Artifact | Purpose | Link |
| --- | --- | --- |
| \`bookmark-queue-agent-extension-load-unpacked\` | Loadable unpacked extension with \`manifest.json\` at the extracted root | ${artifactLink("Download extension", extensionArtifactUrl, extensionArtifactId)} |

After download, extract the artifact once and choose that extracted folder in Chrome's **Load unpacked** dialog. The extracted folder should contain \`manifest.json\`, \`sidepanel.html\`, \`options.html\`, and \`src/\` at its root.

${runUrl ? `If the direct link is hidden by GitHub permissions, open the [workflow run artifacts section](${runUrl}) and download \`bookmark-queue-agent-extension-load-unpacked\`.` : "Download the `bookmark-queue-agent-extension-load-unpacked` artifact from this workflow run."}

## What this build validates

- Manifest V3 extension sources compile and build into \`extension/dist\`, which the workflow verifies and uploads as the \`bookmark-queue-agent-extension-load-unpacked\` artifact.
- The workflow fails before upload if required files in \`extension/dist\` are missing or empty.
- The workflow uploads the unpacked extension contents directly so the downloaded artifact extracts to a folder with \`manifest.json\` at the root.
- The service worker supports current-tab capture, context-menu link capture, optional normal-bookmark routing, queue processing, approval, audit, and rollback message handlers.
- The local no-AI rule provider and OpenAI-compatible provider adapter are included in the build.
- Unit/integration tests cover URL normalization, classification validation, confidence decisions, folder-path validation, slug sanitization, queue state transitions, folder resolution, and rule-based classification.

## MVP boundaries

- Filesystem knowledge-base export is intentionally deferred to MVP 3.
- Native host sync is intentionally a placeholder for MVP 4.
- Real browser E2E loading remains a release-gate checklist item rather than a CI step in this workflow.

## Artifacts

- Loadable extension artifact: ${artifactLink("bookmark-queue-agent-extension-load-unpacked", extensionArtifactUrl, extensionArtifactId)}
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
