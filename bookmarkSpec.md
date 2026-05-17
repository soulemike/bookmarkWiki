Below is a build-ready spec for a custom Chrome extension that provides an **inbound bookmark queue**, **AI-assisted classification**, **bring-your-own AI provider support**, and phased **filesystem/knowledge-base export** for LLM/wiki workflows.

Chrome supports bookmark creation, organization, search, update, and move operations through the `chrome.bookmarks` API. The extension shall be built on Manifest V3. Local persistence shall use `chrome.storage.local`; user preferences that do not contain secrets may use `chrome.storage.sync`. Filesystem capabilities are phased: first through user-initiated browser export, then optional File System Access API folder grants, and finally an optional native messaging host for deeper local automation. ([Chrome for Developers][1])

# Custom Chrome Extension Spec: Agentic Bookmark Queue

## 1. Product Definition

### Name

```text
Bookmark Queue Agent
```

### Purpose

Enable Chrome users to capture bookmarks into a controlled inbound queue, classify them into an approved folder taxonomy using a bring-your-own AI provider or deterministic rules, assign descriptive titles, and optionally export structured bookmark knowledge to local files for LLM-readable wiki, Markdown, or knowledge-base workflows.

### Core Outcomes

```text
1. Every new bookmark can be routed through an inbound queue.
2. The agent suggests or applies a clean title and target folder.
3. The user can bring their own AI provider/API key or use a no-AI rule-based classifier.
4. Classification can be auto-applied or human-reviewed based on explicit policy.
5. Bookmarks can be exported to local files as Markdown, JSON, and wiki-style content in later MVPs.
6. The local knowledge base can be consumed by tools such as Obsidian, Logseq, MkDocs, Docusaurus, local RAG, or LLM agents.
```

---

## 2. Functional Requirements

### 2.1 Bookmark Capture

The extension shall support:

```text
- Add current tab to bookmark queue.
- Add selected link to bookmark queue from a context menu.
- Listen for newly created bookmarks through chrome.bookmarks.onCreated.
- Optionally move newly created bookmarks into _Bookmark Queue after creation.
- Support bulk import from existing Chrome folders in MVP 2+.
- Prevent duplicate URLs according to the configured duplicate policy.
- Normalize URLs before duplicate checks and classification.
```

The extension shall not assume it can block or replace Chrome's native bookmark creation flow before a bookmark exists. “Watch normal bookmark creation” means post-create event processing:

```text
1. chrome.bookmarks.onCreated fires.
2. The extension ignores events caused by its own recent create/move/update operations.
3. If user settings enable queue routing for normal bookmarks, the extension moves the bookmark into _Bookmark Queue.
4. The extension creates or updates one queue record for the bookmark.
```

Loop prevention is required. Each extension-initiated bookmark operation shall include an operation guard stored in memory and persisted for recovery with:

```text
operationId
chromeBookmarkId
action
createdAt
expiresAt
```

A bookmark event matching a non-expired guard shall not enqueue, move, or classify the same bookmark again.

### 2.2 Inbound Queue

Default folders:

```text
_Bookmark Queue
_Needs Review
_Processed
_Archive
```

Queue item states:

```text
queued
classified
needs_review
approved
moved
ignored
archived
error
```

Valid state transitions:

| From         | To           | Trigger                                                                                   |
| ------------ | ------------ | ----------------------------------------------------------------------------------------- |
| none         | queued       | Current-tab capture, context-menu capture, watched bookmark event, or bulk import         |
| queued       | classified   | Rule engine or AI provider returns a valid classification                                 |
| queued       | needs_review | Low/medium-confidence result, invalid folder in Strict Mode, or repairable provider issue |
| queued       | ignored      | User ignores item before classification                                                   |
| queued       | archived     | User archives item without action                                                         |
| queued       | error        | Non-recoverable validation, provider, Chrome API, or storage failure                      |
| classified   | approved     | User approves recommendation or auto-move policy applies                                  |
| classified   | needs_review | Confidence falls within review threshold or user requests review                          |
| classified   | ignored      | User rejects recommendation and ignores item                                              |
| classified   | archived     | User archives recommendation                                                              |
| approved     | moved        | Title update and bookmark move complete successfully                                      |
| approved     | error        | Title update or move fails after retries                                                  |
| needs_review | approved     | User approves or edits recommendation                                                     |
| needs_review | queued       | User requests reclassification                                                            |
| needs_review | ignored      | User rejects recommendation                                                               |
| needs_review | archived     | User archives item                                                                        |
| moved        | archived     | User archives processed queue record                                                      |
| error        | queued       | User retries after correcting the issue                                                   |
| error        | archived     | User archives failed item                                                                 |

Persisted queue records shall be schema-validated. Unsupported states shall be rejected and migrated or routed to `error` with an audit entry.

### 2.3 URL Normalization and Duplicate Policy

URL normalization shall be deterministic and unit-tested. Default normalization rules:

```text
- Lowercase scheme and host.
- Remove default ports (:80 for http, :443 for https).
- Remove URL fragments unless the user enables fragment-sensitive bookmarks.
- Remove known tracking parameters by default: utm_*, fbclid, gclid, msclkid.
- Preserve non-tracking query parameters in sorted key order.
- Normalize trailing slash for empty paths only.
- Preserve protocol differences between http and https.
- Decode unreserved percent-encoded characters only when safe.
```

Duplicate detection shall default to the entire Chrome bookmark tree plus the extension queue. User settings may narrow duplicate checks to the queue only or to configured folders. Duplicate handling options:

```text
skip
merge_metadata
open_existing
allow_duplicate_once
```

Default duplicate behavior for MVP 1 is `skip` with a visible link to the existing bookmark when Chrome exposes enough information to locate it.

### 2.4 AI Classification

The classifier shall return data matching the `ClassificationResult` contract.

Example:

```json
{
  "url": "https://example.com/page",
  "original_title": "Example Page",
  "descriptive_title": "Identity Governance Lifecycle Controls Reference",
  "summary": "Reference article covering identity lifecycle governance controls.",
  "target_folder": "/Bookmarks Bar/Work/Identity/Governance",
  "tags": ["identity", "governance", "lifecycle"],
  "content_type": "article",
  "audience": "technical",
  "confidence": 0.91,
  "recommended_action": "move",
  "reason": "The page focuses on IAM governance and lifecycle control patterns."
}
```

Formal TypeScript contract:

```ts
type RecommendedAction = "move" | "needs_review" | "ignore" | "hold";

type ContentType =
  | "article"
  | "documentation"
  | "repository"
  | "video"
  | "tool"
  | "reference"
  | "product"
  | "unknown";

interface ClassificationResult {
  url: string;
  original_title: string;
  descriptive_title: string;
  summary: string;
  target_folder: string;
  tags: string[];
  content_type: ContentType;
  audience?: "general" | "technical" | "business" | "personal" | "unknown";
  confidence: number; // inclusive range: 0 <= confidence <= 1
  recommended_action: RecommendedAction;
  reason: string;
}
```

Validation requirements:

```text
- All required fields must be present and non-empty unless recommended_action is ignore or hold.
- confidence must be a finite number from 0 through 1.
- recommended_action must be one of move, needs_review, ignore, or hold.
- tags must be an array of strings after trimming and deduplication.
- target_folder must resolve to an approved taxonomy folder in Strict Mode.
- target_folder may be a suggestion only in Suggest Mode and must require user approval.
- Invalid provider output shall be retried once with a repair prompt.
- If repair fails, the queue item shall move to needs_review when user action can fix it, otherwise error.
```

### 2.5 Folder Classification

The extension shall classify only against an approved taxonomy unless the user enables folder suggestions.

Modes:

```text
Strict Mode:
  Agent may only choose existing approved folders.

Suggest Mode:
  Agent may suggest new folders, but user approval is required before creation.

Autonomous Mode:
  Agent may create folders only when confidence meets the configured threshold and the target path passes validation.
```

Recommended default:

```text
Strict Mode enabled
Auto-move threshold: 0.90
Review threshold: 0.70–0.89
Hold threshold: <0.70
```

#### FolderResolver Requirements

A `FolderResolver` component shall map taxonomy paths to Chrome bookmark folder node IDs.

```ts
interface ResolvedFolder {
  path: string;
  chromeBookmarkId: string;
  root:
    | "bookmarks_bar"
    | "other_bookmarks"
    | "mobile_bookmarks"
    | "configured_root";
}
```

Folder resolution rules:

```text
- Taxonomy paths must be absolute and rooted, for example /Bookmarks Bar/Work/Identity.
- The default target root is /Bookmarks Bar unless the user configures another root.
- Duplicate folder names are allowed only when their full rooted paths are unique.
- If two Chrome folder nodes match the same rooted taxonomy path, classification is blocked and routed to needs_review.
- Folder ID caches must refresh on bookmark folder create, remove, change, move, and children-reordered events.
- Strict Mode never creates a missing folder.
- Suggest Mode writes a pending folder suggestion for user approval.
- Autonomous Mode creates missing folders only after path validation and confidence checks.
```

### 2.6 Descriptive Title Generation

Titles should be rewritten using this format:

```text
[Domain or Source]: [Clear Topic] — [Optional Context]
```

Examples:

```text
Microsoft Learn: Intune Device Compliance Policy Reference
GitHub: Open Source Bookmark AI Chrome Extension
NIST: Digital Identity Guidelines Overview
```

Title rules:

```text
- Preserve recognizable source names when useful.
- Avoid clickbait and marketing wording.
- Avoid adding unverified claims not supported by URL, title, metadata, or extracted text.
- Keep titles under 140 characters unless the user configures a different limit.
```

### 2.7 Review Experience

The extension shall provide a side panel or options page with:

```text
- Queue list
- Original title
- Proposed title
- Proposed folder
- Confidence score
- Summary
- Reason
- Approve
- Edit
- Move
- Ignore
- Archive
- Reclassify
- Create folder, when allowed
- Roll back last action
```

Chrome’s side panel API is suitable for this kind of persistent extension UI. ([Chrome for Developers][2])

---

## 3. Bring Your Own AI Provider

### 3.1 Provider Scope by MVP

MVP 1 first-build providers:

```text
OpenAI-compatible API
No-AI rule-based classifier
```

MVP 2+ providers:

```text
Anthropic Claude
Google Gemini
Azure OpenAI
Custom HTTP endpoint
```

MVP 4 local/advanced providers:

```text
Ollama local endpoint
LM Studio local endpoint
Native-host mediated local model integrations
```

### 3.2 Provider Configuration

User setup fields:

```json
{
  "provider": "openai-compatible",
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-5.5",
  "api_key_storage": "chrome.storage.local",
  "temperature": 0.1,
  "max_tokens": 1200,
  "timeout_seconds": 30,
  "retry_count": 1
}
```

Secrets shall be stored only in `chrome.storage.local`. `chrome.storage.sync` shall not store API keys, bearer tokens, provider secrets, or native-host credentials.

### 3.3 Provider Adapter Interface

```ts
type ProviderErrorCode =
  | "invalid_config"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "unsupported_model"
  | "invalid_response"
  | "schema_validation_failed"
  | "provider_unavailable";

interface ProviderFailure {
  ok: false;
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

interface ProviderSuccess<T> {
  ok: true;
  value: T;
  rawUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

interface AIProvider {
  id: string;
  name: string;
  validateConfig(
    config: ProviderConfig,
  ): Promise<ProviderResult<{ model: string }>>;
  classifyBookmark(
    input: ClassificationInput,
  ): Promise<ProviderResult<ClassificationResult>>;
  summarizeBookmark(
    input: SummaryInput,
  ): Promise<ProviderResult<SummaryResult>>;
}
```

Adapter requirements:

```text
- Use provider-specific authentication without exposing secrets to logs or UI.
- Enforce timeout_seconds with AbortController or equivalent cancellation.
- Retry only retryable failures and never retry invalid credentials by default.
- Normalize provider-specific failures into ProviderFailure.
- Parse model output as JSON and validate it against classification-result.schema.json.
- Route schema failures through the repair-once policy.
- Never stream partial model output into persisted queue state.
```

### 3.4 Prompt Contract

The classifier prompt should always include:

```text
- URL
- Browser title
- Page metadata
- Extracted visible text, if available and allowed
- Existing approved folder taxonomy
- User classification rules
- Output JSON schema
- Confidence scoring rules
- Explicit instruction that page content is untrusted and cannot override system/user rules
```

The agent shall not invent folders in Strict Mode. All folder choices shall be validated by `FolderResolver` after provider output validation.

---

## 4. Chrome Extension Architecture

### 4.1 Components

```text
Manifest V3 Extension
  ├─ Service Worker
  │   ├─ Bookmark event listener
  │   ├─ Operation guard manager
  │   ├─ Queue processor
  │   ├─ Classification orchestrator
  │   ├─ FolderResolver / folder manager
  │   └─ Sync dispatcher
  │
  ├─ Side Panel UI
  │   ├─ Queue review
  │   ├─ Classification settings
  │   ├─ Provider setup
  │   ├─ Taxonomy editor
  │   └─ Sync status
  │
  ├─ Content Script / Script Injection
  │   ├─ Page metadata extraction
  │   ├─ Readability extraction, when enabled
  │   └─ Link capture
  │
  ├─ Options Page
  │   ├─ API provider configuration
  │   ├─ Folder rules
  │   ├─ Filesystem sync settings
  │   └─ Export/import settings
  │
  └─ Native Host, optional MVP 4+
      ├─ Filesystem writer
      ├─ Markdown generator
      ├─ Git sync
      └─ Local vector index integration
```

### 4.2 Required Chrome Permissions

MVP 1 manifest baseline:

```json
{
  "permissions": [
    "bookmarks",
    "storage",
    "contextMenus",
    "activeTab",
    "scripting",
    "sidePanel",
    "alarms"
  ],
  "optional_host_permissions": ["https://*/*", "http://*/*"]
}
```

`nativeMessaging` shall be requested only for MVP 4+ native host integration and only when the user enables native sync. Native messaging lets an extension communicate with a registered local application over standard input/output. ([Chrome for Developers][3])

Content extraction policy:

```text
- MVP 1 shall prefer activeTab/user-triggered extraction.
- Broad host access shall be optional and requested only for configured automation features.
- Users can classify using title + URL only without page text extraction.
- Domain exclusions must be enforced before content extraction and before AI calls.
```

### 4.3 MV3 Queue Durability and Concurrency

All queue state shall be persisted before asynchronous provider calls, bookmark moves, or export work begins. The queue processor must tolerate service worker suspension and restart.

Additional queue processing fields:

```ts
interface QueueProcessingFields {
  attemptCount: number;
  lastAttemptAt?: string;
  lockedUntil?: string;
  lastErrorCode?: string;
  operationId?: string;
}
```

Processing rules:

```text
- Each queue item may have only one active processor lock.
- Locks must expire after a configurable timeout so interrupted work can resume.
- Processing must be idempotent; repeated events must not duplicate queue records or bookmark moves.
- Provider timeouts, rate limits, transient network errors, and transient Chrome API errors are retryable.
- Invalid user configuration, invalid credentials, schema validation failures after repair, and unresolved Strict Mode folders are not auto-retried.
- Retry backoff must be persisted so service worker restarts do not reset retry state.
```

---

## 5. Filesystem Sync and Knowledge Base Enablement

### 5.1 Sync Modes by MVP

```text
MVP 3 Manual Export:
  User clicks Export and downloads/chooses generated Markdown and JSON artifacts.

MVP 3 Browser File System Access:
  User grants folder access through a picker from the options page or side panel.
  Extension writes Markdown/JSON files only after user permission and compatible browser support.

MVP 4 Native Host Sync:
  Companion app writes directly to configured local paths.
  Supports scheduled sync, Git commits, and richer filesystem operations.

MVP 4 Remote Git Sync:
  Extension or native host commits generated files to a Git repository.
```

The File System Access API allows a browser app to read and write user-selected files and folders after user permission, which fits manual or semi-automated local knowledge base generation. ([Chrome for Developers][4])

Filesystem constraints:

```text
- Browser File System Access writes must be initiated from a user-facing page/panel when a user gesture is required.
- Missing, revoked, or unsupported folder permissions must produce a visible recoverable error.
- Generated filenames must be slugified and sanitized for Windows, macOS, and Linux reserved characters.
- Duplicate slugs must receive stable suffixes such as -2, -3, or a short bookmark ID.
- Path length and reserved filename failures must be reported before write attempts when possible.
- Repeated exports must be idempotent unless source bookmark data changed.
```

### 5.2 Native Host Boundary, MVP 4+

Native host request/response messages shall be JSON and schema-validated.

```ts
interface NativeHostRequest {
  requestId: string;
  action: "write_kb" | "git_commit" | "status";
  targetPath?: string;
  files?: Array<{ relativePath: string; content: string; sha256: string }>;
}

interface NativeHostResponse {
  requestId: string;
  ok: boolean;
  writtenFiles?: string[];
  commitHash?: string;
  errorCode?: string;
  message?: string;
}
```

The extension shall handle unavailable host, malformed host response, host timeout, filesystem write failure, and partial write failure without losing queue or audit state.

### 5.3 Output Formats

Minimum required for MVP 3:

```text
bookmarks.json
bookmarks.ndjson
taxonomy.json
queue-log.json
markdown folder tree
```

Optional MVP 4+:

```text
Obsidian vault format
Logseq pages
MkDocs docs folder
Docusaurus docs folder
Hugo content folder
SQLite database
Vector-ready JSONL chunks
```

### 5.4 Markdown File Pattern

Folder path:

```text
/bookmark-kb/
  Work/
    Identity/
      Governance/
        identity-governance-lifecycle-controls-reference.md
  Personal/
  Reference/
  index.md
  bookmarks.json
  taxonomy.json
```

Markdown front matter:

```yaml
---
title: "Microsoft Learn: Intune Device Compliance Policy Reference"
url: "https://learn.microsoft.com/..."
domain: "learn.microsoft.com"
folder: "/Bookmarks Bar/Work/Microsoft/Intune"
tags:
  - intune
  - compliance
  - endpoint-management
content_type: "documentation"
classification_confidence: 0.94
date_added: "2026-05-17"
date_classified: "2026-05-17"
summary_status: "generated"
---
```

Markdown body:

```md
# Microsoft Learn: Intune Device Compliance Policy Reference

## Summary

Concise summary of the page and why it was saved.

## Why This Matters

Brief explanation of relevance to the folder/topic.

## Key Topics

- Intune compliance policy
- Device posture
- Conditional access integration

## Source

https://learn.microsoft.com/...

## Suggested Cross-Links

- [[Microsoft Intune]]
- [[Endpoint Management]]
- [[Conditional Access]]
```

### 5.5 LLM Wiki Index Files

Generate:

```text
/index.md
/tags.md
/domains.md
/recent.md
/folders.md
/llm-context.md
```

`llm-context.md` should be optimized for retrieval:

```md
# Bookmark Knowledge Base Context

This knowledge base contains categorized bookmarks organized by work, personal, reference, and topic-specific folders. Each page includes URL, title, summary, tags, classification confidence, and cross-links.

## Primary Domains

- Microsoft documentation
- GitHub repositories
- Identity and access management
- PowerShell automation
- Chrome extension development
```

---

## 6. Data Model

### 6.1 Bookmark Queue Item

```ts
interface BookmarkQueueItem {
  id: string;
  chromeBookmarkId?: string;
  url: string;
  normalizedUrl: string;
  originalTitle: string;
  proposedTitle?: string;
  finalTitle?: string;
  source: "current_tab" | "context_menu" | "bookmark_event" | "bulk_import";
  status:
    | "queued"
    | "classified"
    | "needs_review"
    | "approved"
    | "moved"
    | "ignored"
    | "archived"
    | "error";
  proposedFolder?: string;
  proposedFolderId?: string;
  finalFolder?: string;
  finalFolderId?: string;
  confidence?: number;
  tags?: string[];
  summary?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lockedUntil?: string;
  lastErrorCode?: string;
  operationId?: string;
  error?: string;
}
```

### 6.2 Taxonomy

```ts
interface BookmarkTaxonomy {
  version: string;
  defaultRoot:
    | "/Bookmarks Bar"
    | "/Other Bookmarks"
    | "/Mobile Bookmarks"
    | string;
  folders: TaxonomyFolder[];
  rules: ClassificationRule[];
}

interface TaxonomyFolder {
  path: string;
  chromeBookmarkId?: string;
  description: string;
  aliases?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  examples?: string[];
}
```

### 6.3 Classification Rule

```ts
interface ClassificationRule {
  id: string;
  name: string;
  priority: number;
  match: {
    domains?: string[];
    urlPatterns?: string[];
    titleKeywords?: string[];
    contentKeywords?: string[];
  };
  action: {
    targetFolder: string;
    tags?: string[];
    titlePrefix?: string;
  };
}
```

### 6.4 Audit Log Entry

Every automated action shall be logged with enough information to support rollback.

```ts
interface AuditLogEntry {
  operationId: string;
  batchId?: string;
  timestamp: string;
  action:
    | "create_queue_item"
    | "classify_bookmark"
    | "update_title"
    | "move_bookmark"
    | "create_folder"
    | "export_kb"
    | "rollback";
  chromeBookmarkId?: string;
  url?: string;
  previousParentId?: string;
  previousIndex?: number;
  newParentId?: string;
  newIndex?: number;
  previousFolderPath?: string;
  newFolderPath?: string;
  previousTitle?: string;
  newTitle?: string;
  previousStatus?: BookmarkQueueItem["status"];
  newStatus?: BookmarkQueueItem["status"];
  confidence?: number;
  provider?: string;
  errorCode?: string;
  message?: string;
}
```

Title updates and folder moves shall be logged as separate reversible operations under one `batchId` when they are part of the same approval. Rollback shall apply inverse operations in reverse chronological order.

---

## 7. Processing Flow

### 7.1 Queue Processing

```text
1. User bookmarks page, selects “Add to Bookmark Queue,” or creates a normal Chrome bookmark while queue routing is enabled.
2. Extension creates or moves the bookmark under _Bookmark Queue after checking operation guards.
3. Queue processor detects or resumes a queued item.
4. Extension normalizes URL and checks for duplicates.
5. Content extraction runs only if user settings and permissions allow it.
6. Rule engine attempts deterministic match.
7. If rule confidence is insufficient and an AI provider is configured, provider adapter is called.
8. Provider result is parsed, schema-validated, and repaired once if needed.
9. FolderResolver validates or resolves the target folder.
10. Extension applies policy:
    - auto-move
    - needs review
    - hold in queue
    - ignore
11. Filesystem sync writes updated Markdown/JSON only in MVP 3+ when enabled.
12. Audit log records every state-changing action.
```

### 7.2 Classification Decision Logic

```ts
if (classification.recommended_action === "ignore") {
  markIgnored();
} else if (!folderResolver.canResolve(classification.target_folder, mode)) {
  moveToNeedsReview("unresolved_folder");
} else if (confidence >= autoMoveThreshold && mode !== "review_only") {
  updateBookmarkTitle();
  ensureFolderExistsIfAllowed();
  moveBookmark();
  writeKnowledgeBaseFileIfEnabled();
} else if (confidence >= reviewThreshold) {
  moveToNeedsReview();
  writePendingSuggestion();
} else {
  keepInQueue();
  markLowConfidence();
}
```

### 7.3 Rollback

The extension shall support:

```text
- Undo last action.
- Roll back a batch.
- Restore previous title.
- Restore previous folder using previousParentId and previousIndex when possible.
- Export rollback plan.
```

Rollback behavior:

```text
- If the original folder still exists, restore the bookmark to previousParentId and previousIndex.
- If the original folder was deleted, route rollback to needs_review and show the missing folder path.
- If the bookmark no longer exists, mark rollback as failed without recreating it unless the user explicitly chooses recreate.
- If a batch partially fails, stop, persist the partial-failure state, and show the remaining rollback plan.
```

---

## 8. Security and Privacy Requirements

### 8.1 API Key Handling

```text
- Store API keys only in chrome.storage.local.
- Never sync API keys through chrome.storage.sync.
- Never export API keys in backups, diagnostics, knowledge-base files, or logs.
- Mask keys in UI, showing at most the last four characters.
- Provide test connection button.
- Allow provider removal and verified key deletion.
```

### 8.2 Data Controls

```text
- User can disable page text extraction.
- User can classify using title + URL only.
- User can exclude domains from AI calls.
- User can require local-only AI providers.
- User can preview all outbound payloads before provider calls.
- Outbound payload preview must redact API keys, auth headers, cookies, and internal operation IDs.
```

### 8.3 Prompt-Injection and Data Exfiltration Controls

```text
- Page content, metadata, and titles are untrusted inputs.
- Page content must not be allowed to override system, developer, user, taxonomy, or schema instructions.
- Provider output must be validated against schemas and folder taxonomy before any bookmark change.
- Domain exclusions must prevent both extraction and provider calls.
- Audit logs shall not include API keys, cookies, authorization headers, or full page text.
- Host permissions shall be optional where possible and requested only when a feature needs them.
```

---

## 9. Suggested Technology Stack

### Extension

```text
TypeScript
React
Vite
Chrome Manifest V3
chrome.bookmarks API
chrome.storage API
chrome.contextMenus API
chrome.sidePanel API
Vitest or equivalent unit/integration test runner
Playwright or Puppeteer for extension E2E tests
```

### Optional Native Host

```text
Node.js or Python
Local filesystem writer
Git integration
Markdown generator
JSON/NDJSON exporter
Optional SQLite index
```

### Optional Knowledge Base Targets

```text
Obsidian
Logseq
MkDocs
Docusaurus
Hugo
Quartz
Local RAG pipeline
```

---

## 10. MVP Scope and Definition of Done

### MVP 1: Chrome Bookmark Queue First Build

```text
- Create queue and review folders.
- Add current tab to queue.
- Add selected link to queue.
- Watch normal bookmark creation through post-create onCreated handling.
- Configure OpenAI-compatible provider or no-AI rule-based classifier.
- Classify one queued bookmark.
- Suggest title and existing approved target folder.
- Review, edit, approve, ignore, archive, or reclassify a recommendation.
- Update Chrome bookmark title.
- Move bookmark to selected existing folder.
- Persist queue state and audit log.
- Support rollback of a title/move batch.
```

#### MVP 1 Definition of Done

```text
1. Extension builds as a Manifest V3 Chrome extension.
2. Extension can be loaded unpacked in Chrome/Chromium.
3. User can add the active tab to _Bookmark Queue.
4. User can configure and validate one OpenAI-compatible provider or enable no-AI rules.
5. One queued bookmark can be classified, reviewed, renamed, moved to an existing folder, and audited.
6. Low-confidence or invalid-folder results route to _Needs Review.
7. Duplicate URL detection prevents accidental duplicate queue records.
8. Rollback restores title and folder for the last approved move when source folder still exists.
9. Unit, integration, and at least one real-browser extension E2E smoke test pass.
```

### MVP 2: Controlled Automation

```text
- Confidence thresholds.
- Auto-move high-confidence items after user enables automation.
- Needs Review folder workflow.
- Bulk import.
- Expanded duplicate handling.
- Rollback log UI.
- Taxonomy editor.
- Additional cloud providers: Anthropic, Gemini, Azure OpenAI, and custom HTTP as separately tested adapters.
```

### MVP 3: Filesystem Knowledge Base

```text
- Export bookmarks.json.
- Export bookmarks.ndjson.
- Export taxonomy.json.
- Export queue-log.json.
- Generate Markdown per bookmark.
- Generate index.md.
- Generate tag/domain/folder/recent indexes.
- Support Obsidian-style wikilinks.
- Support Browser File System Access export where available.
```

### MVP 4: Native Host / Advanced Sync

```text
- Continuous filesystem sync.
- Git commit on change.
- Local provider support through Ollama or LM Studio.
- Native-host mediated filesystem and model integrations.
- SQLite metadata index.
- Vector-ready JSONL export.
```

---

## 11. Acceptance Criteria by MVP

### MVP 1 Acceptance Criteria

```text
1. A user can add the current tab to _Bookmark Queue.
2. A user can add a selected link to _Bookmark Queue.
3. A normal Chrome bookmark creation can be observed through onCreated and moved into the queue exactly once when enabled.
4. The extension prevents self-triggered bookmark event loops.
5. The extension can classify a bookmark using OpenAI-compatible provider configuration or no-AI rules.
6. The extension validates classification output against schema before use.
7. The extension can rename the bookmark with a descriptive title.
8. The extension can resolve and move the bookmark to an existing approved Chrome folder.
9. Low-confidence, invalid-output, or unresolved-folder classifications are routed to _Needs Review.
10. The user can approve, edit, ignore, archive, or reclassify recommendations.
11. The extension maintains a rollback-safe audit log of title and folder changes.
12. The user can roll back the last approved title/move batch when the bookmark and source folder still exist.
```

### MVP 2 Acceptance Criteria

```text
1. User-configurable confidence thresholds control auto-move, review, and hold behavior.
2. Auto-move only runs after the user explicitly enables automation.
3. Bulk import can enqueue bookmarks from an existing Chrome folder without duplicate queue records.
4. The taxonomy editor can add, edit, and remove approved folder metadata.
5. Additional providers pass the provider contract test suite before release.
```

### MVP 3 Acceptance Criteria

```text
1. The extension can export bookmarks.json, bookmarks.ndjson, taxonomy.json, and queue-log.json.
2. The extension can generate Markdown files for processed bookmarks.
3. The extension can generate index.md, tags.md, domains.md, folders.md, recent.md, and llm-context.md.
4. Unsafe titles and duplicate slugs produce safe, stable filenames.
5. Browser File System Access export handles missing or revoked permissions gracefully.
```

### MVP 4 Acceptance Criteria

```text
1. Native host message schemas are validated in both directions.
2. Continuous sync can write knowledge-base files to a configured local path.
3. Git commit-on-change works when enabled and reports failures without losing queue state.
4. Ollama and LM Studio adapters work through configured local endpoints.
5. SQLite and vector-ready JSONL exports can be generated from processed bookmarks.
```

---

## 12. Recommended Repository Structure

```text
bookmark-queue-agent/
  extension/
    manifest.json
    package.json
    vite.config.ts
    tsconfig.json
    src/
      background/
        service-worker.ts
        operation-guard.ts
        queue-processor.ts
        bookmark-manager.ts
        folder-resolver.ts
        classifier.ts
        sync-dispatcher.ts
      content/
        extract-page.ts
      ui/
        sidepanel/
        options/
        components/
      providers/
        openai-compatible.ts
        rule-based.ts
        anthropic.ts
        gemini.ts
        azure-openai.ts
        ollama.ts
        lm-studio.ts
        custom-http.ts
      models/
        bookmark.ts
        taxonomy.ts
        classification.ts
        audit-log.ts
      utils/
        normalize-url.ts
        confidence.ts
        folder-path.ts
        slugify.ts
    tests/
      unit/
      integration/
      e2e/
      fixtures/
  native-host/
    src/
      index.ts
      filesystem-writer.ts
      markdown-generator.ts
      git-sync.ts
      sqlite-index.ts
    manifests/
      chrome-linux.json
      chrome-macos.json
      chrome-windows.json
    tests/
  schemas/
    classification-result.schema.json
    taxonomy.schema.json
    bookmark-record.schema.json
    audit-log-entry.schema.json
    provider-config.schema.json
    native-host-message.schema.json
  examples/
    taxonomy.example.json
    provider-config.example.json
    kb-output/
  docs/
    architecture.md
    security.md
    privacy.md
    setup.md
    testing.md
    release.md
    provider-adapters.md
  .github/
    workflows/
      ci.yml
```

CI shall run lint, typecheck, unit tests, integration tests, schema validation, and extension build. E2E browser tests may run in CI where Chrome/Chromium extension loading is available, and otherwise shall run as required release checks.

---

## 13. Opinionated Default Behavior

Best default configuration:

```text
Mode:
  Review-first for the first 100 classifications.

Queue:
  All new bookmarks go to _Bookmark Queue only when the user enables normal-bookmark routing.

AI:
  BYO provider required for AI classification.
  No default hosted service.
  No-AI rule-based classifier available.

Taxonomy:
  Strict Mode enabled.
  No auto folder creation.

Automation:
  Auto-move only after user enables it.
  Minimum auto-move confidence: 0.90.

Filesystem:
  Manual export first in MVP 3.
  Native host optional for continuous sync in MVP 4.

Knowledge Base:
  Markdown + JSON + index files.
  Obsidian-compatible links.
```

This design keeps Chrome as the primary bookmark system while producing a parallel, LLM-friendly knowledge base from the same curated bookmark structure.

---

## 14. Test Strategy

### 14.1 Unit Tests

Unit tests shall cover:

```text
- URL normalization, including fragments, tracking parameters, default ports, query sorting, and trailing slashes.
- Duplicate detection policy decisions.
- Confidence threshold decisions.
- Folder path parsing and rooted path validation.
- Taxonomy validation.
- FolderResolver duplicate/missing-folder handling with mocked Chrome bookmark trees.
- ClassificationResult schema validation.
- Provider result normalization.
- Markdown slug generation and filename sanitization.
- Audit rollback plan generation.
- Queue state-transition validation.
```

### 14.2 Integration Tests

Integration tests shall use mocked Chrome APIs and provider clients to cover:

```text
- chrome.bookmarks create, update, move, search, and event handling.
- chrome.storage.local queue persistence and migration.
- chrome.contextMenus link capture.
- chrome.sidePanel/options message flows.
- Operation guard loop prevention.
- Queue processor resume after simulated service worker restart.
- Provider timeout, auth failure, rate limit, malformed JSON, and schema failure.
- Retry and lock expiry behavior.
```

### 14.3 Real Browser Extension E2E Tests

At minimum, MVP 1 release shall include one real Chrome/Chromium extension smoke test that:

```text
1. Builds and loads the unpacked extension.
2. Creates required queue/review folders.
3. Adds the active tab to _Bookmark Queue.
4. Runs classification using a mocked or local test provider.
5. Shows the recommendation in the side panel or options UI.
6. Approves the recommendation.
7. Renames and moves the bookmark to an existing folder.
8. Confirms the audit log contains rollback-safe data.
9. Runs rollback and verifies the bookmark title/folder are restored.
```

Additional E2E tests shall cover low-confidence routing, duplicate bookmark detection, normal bookmark post-create routing, and excluded-domain behavior.

### 14.4 Provider Contract Tests

Every provider adapter must pass contract tests for:

```text
- Valid classification response.
- Malformed JSON response.
- Schema-invalid JSON response.
- Authentication failure.
- Timeout.
- Rate limit.
- Unsupported model.
- Network failure.
```

Live provider smoke tests are optional, opt-in, and must never run in CI without explicit secrets and user consent.

### 14.5 Filesystem and Native Host Tests

MVP 3 filesystem tests shall cover:

```text
- JSON, NDJSON, Markdown, and index generation.
- Unsafe filename sanitization.
- Duplicate slug suffixing.
- Permission missing/revoked behavior.
- Repeated export idempotency.
```

MVP 4 native host tests shall cover:

```text
- Request/response schema validation.
- Native host unavailable.
- Host timeout.
- Malformed host response.
- Filesystem write failure.
- Partial write failure.
- Successful write and optional Git commit.
```

### 14.6 Security and Privacy Tests

Security/privacy tests shall cover:

```text
- API key masking and deletion.
- API keys absent from sync storage, exports, logs, and diagnostics.
- Domain exclusions blocking extraction and provider calls.
- Disabled page text extraction sending only title and URL.
- Local-only provider mode blocking remote providers.
- Outbound payload preview redaction.
- Hostile page text attempting to override classification rules.
- Strict Mode rejecting invented folders.
```

### 14.7 Manual Real-Environment Release Checklist

Before release, manually verify in a clean Chrome/Chromium profile:

```text
- Extension loads unpacked without manifest errors.
- Permission prompts are understandable and minimal.
- Queue and review folders are created once.
- Current-tab capture works.
- Context-menu link capture works.
- Normal bookmark post-create routing works when enabled and does not loop.
- Real or mocked provider classification works.
- Review, edit, approve, ignore, archive, and reclassify actions work.
- Bookmark title and folder changes are visible in Chrome's bookmark manager.
- Rollback restores title and folder.
- MVP 3 export writes valid files to an actual local folder when that feature is in scope.
```

[1]: https://developer.chrome.com/docs/extensions/reference/api/bookmarks "chrome.bookmarks | API - Chrome for Developers"
[2]: https://developer.chrome.com/docs/extensions/reference/api/sidePanel "chrome.sidePanel | API - Chrome for Developers"
[3]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging "Native messaging - Chrome for Developers"
[4]: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access "The File System Access API: simplifying access to local files"
