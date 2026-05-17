Below is a concise build spec for a custom Chrome extension that provides an **inbound bookmark queue**, **AI-based classification**, **BYO AI provider**, and **filesystem sync for LLM/wiki knowledge base enablement**.

Chrome supports bookmark creation, organization, search, update, and move operations through the `chrome.bookmarks` API. The extension should be built on Manifest V3, which is the current Chrome extension platform. Local persistence can use `chrome.storage`, while filesystem sync should use either the File System Access API with user-granted folder access or a native messaging host for deeper local automation. ([Chrome for Developers][1])

# Custom Chrome Extension Spec: Agentic Bookmark Queue

## 1. Product Definition

### Name

```text
Bookmark Queue Agent
```

### Purpose

Enable Chrome users to capture bookmarks into a controlled inbound queue, classify them into an approved folder taxonomy using a bring-your-own AI provider, assign descriptive titles, and optionally sync structured bookmark knowledge to the filesystem for LLM-readable wiki, markdown, or knowledge base workflows.

### Core Outcomes

```text
1. Every new bookmark can be routed through an inbound queue.
2. The agent suggests or applies a clean title and target folder.
3. The user can bring their own AI provider/API key.
4. Classification can be auto-applied or human-reviewed.
5. Bookmarks can sync to local files as Markdown, JSON, or wiki-style content.
6. The local knowledge base can be consumed by tools such as Obsidian, Logseq, MkDocs, Docusaurus, local RAG, or LLM agents.
```

---

## 2. Functional Requirements

### 2.1 Bookmark Capture

The extension shall support:

```text
- Add current tab to bookmark queue
- Add selected link to bookmark queue
- Watch for newly created bookmarks
- Optionally intercept normal bookmark creation and move it into the queue
- Support bulk import from existing Chrome folders
- Prevent duplicate URLs
- Normalize URLs before classification
```

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

### 2.3 AI Classification

The classifier shall return:

```json
{
  "url": "https://example.com/page",
  "original_title": "Example Page",
  "descriptive_title": "Identity Governance Lifecycle Controls Reference",
  "summary": "Reference article covering identity lifecycle governance controls.",
  "target_folder": "/Work/Identity/Governance",
  "tags": ["identity", "governance", "lifecycle"],
  "content_type": "article",
  "audience": "technical",
  "confidence": 0.91,
  "recommended_action": "move",
  "reason": "The page focuses on IAM governance and lifecycle control patterns."
}
```

### 2.4 Folder Classification

The extension shall classify only against an approved taxonomy unless the user enables folder suggestions.

Modes:

```text
Strict Mode:
  Agent may only choose existing folders.

Suggest Mode:
  Agent may suggest new folders, but user approval is required.

Autonomous Mode:
  Agent may create folders when confidence exceeds threshold.
```

Recommended default:

```text
Strict Mode enabled
Auto-move threshold: 0.90
Review threshold: 0.70–0.89
Hold threshold: <0.70
```

### 2.5 Descriptive Title Generation

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

### 2.6 Review Experience

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
- Reclassify
- Create folder
- Roll back last action
```

Chrome’s side panel API is suitable for this kind of persistent extension UI. ([Chrome for Developers][2])

---

## 3. Bring Your Own AI Provider

### 3.1 Supported Provider Types

```text
OpenAI-compatible API
Anthropic Claude
Google Gemini
Azure OpenAI
Ollama local endpoint
LM Studio local endpoint
Custom HTTP endpoint
No-AI rule-based classifier
```

### 3.2 Provider Configuration

User setup fields:

```json
{
  "provider": "openai-compatible",
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-5.5-thinking",
  "api_key_storage": "chrome.storage.local",
  "temperature": 0.1,
  "max_tokens": 1200,
  "timeout_seconds": 30
}
```

### 3.3 Provider Adapter Interface

```ts
interface AIProvider {
  id: string;
  name: string;
  validateConfig(config: ProviderConfig): Promise<boolean>;
  classifyBookmark(input: ClassificationInput): Promise<ClassificationResult>;
  summarizeBookmark(input: SummaryInput): Promise<SummaryResult>;
}
```

### 3.4 Prompt Contract

The classifier prompt should always include:

```text
- URL
- Browser title
- Page metadata
- Extracted visible text, if available
- Existing folder taxonomy
- User classification rules
- Output JSON schema
- Confidence scoring rules
```

The agent should not invent folders in Strict Mode.

---

## 4. Chrome Extension Architecture

### 4.1 Components

```text
Manifest V3 Extension
  ├─ Service Worker
  │   ├─ Bookmark event listener
  │   ├─ Queue processor
  │   ├─ Classification orchestrator
  │   ├─ Folder manager
  │   └─ Sync dispatcher
  │
  ├─ Side Panel UI
  │   ├─ Queue review
  │   ├─ Classification settings
  │   ├─ Provider setup
  │   ├─ Taxonomy editor
  │   └─ Sync status
  │
  ├─ Content Script
  │   ├─ Page metadata extraction
  │   ├─ Readability extraction
  │   └─ Link capture
  │
  ├─ Options Page
  │   ├─ API provider configuration
  │   ├─ Folder rules
  │   ├─ Filesystem sync settings
  │   └─ Export/import settings
  │
  └─ Native Host, optional
      ├─ Filesystem writer
      ├─ Markdown generator
      ├─ Git sync
      └─ Local vector index integration
```

### 4.2 Required Chrome Permissions

```json
{
  "permissions": [
    "bookmarks",
    "storage",
    "contextMenus",
    "activeTab",
    "scripting",
    "sidePanel",
    "alarms",
    "nativeMessaging"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

Use `nativeMessaging` only if local filesystem automation is required beyond what the browser can safely provide. Native messaging lets an extension communicate with a registered local application over standard input/output. ([Chrome for Developers][3])

---

## 5. Filesystem Sync and Knowledge Base Enablement

### 5.1 Sync Modes

```text
Manual Export:
  User clicks Export and chooses a folder/file.

Browser File System Access:
  User grants folder access through a picker.
  Extension writes Markdown/JSON files to that folder.

Native Host Sync:
  Companion app writes directly to configured local paths.
  Supports scheduled sync, Git commits, and richer filesystem operations.

Remote Git Sync:
  Extension or native host commits generated files to a Git repository.
```

The File System Access API allows a browser app to read and write user-selected files and folders after user permission, which fits manual or semi-automated local knowledge base generation. ([Chrome for Developers][4])

### 5.2 Output Formats

Minimum required:

```text
bookmarks.json
bookmarks.ndjson
taxonomy.json
queue-log.json
markdown folder tree
```

Optional:

```text
Obsidian vault format
Logseq pages
MkDocs docs folder
Docusaurus docs folder
Hugo content folder
SQLite database
Vector-ready JSONL chunks
```

### 5.3 Markdown File Pattern

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
folder: "/Work/Microsoft/Intune"
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

### 5.4 LLM Wiki Index Files

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
  status: "queued" | "classified" | "needs_review" | "approved" | "moved" | "ignored" | "error";
  proposedFolder?: string;
  finalFolder?: string;
  confidence?: number;
  tags?: string[];
  summary?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  error?: string;
}
```

### 6.2 Taxonomy

```ts
interface BookmarkTaxonomy {
  version: string;
  folders: TaxonomyFolder[];
  rules: ClassificationRule[];
}

interface TaxonomyFolder {
  path: string;
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

---

## 7. Processing Flow

### 7.1 Queue Processing

```text
1. User bookmarks page or selects “Add to Bookmark Queue.”
2. Extension creates bookmark under _Bookmark Queue.
3. Queue processor detects new item.
4. Extension normalizes URL and checks for duplicates.
5. Content script extracts title, metadata, and readable text.
6. Rule engine attempts deterministic match.
7. If rule confidence is insufficient, AI provider is called.
8. Agent returns structured classification.
9. Extension applies policy:
   - auto-move
   - needs review
   - hold in queue
10. Filesystem sync writes updated Markdown/JSON.
11. Audit log records every action.
```

### 7.2 Classification Decision Logic

```ts
if (confidence >= autoMoveThreshold && mode !== "review_only") {
  updateBookmarkTitle();
  ensureFolderExistsIfAllowed();
  moveBookmark();
  writeKnowledgeBaseFile();
} else if (confidence >= reviewThreshold) {
  moveToNeedsReview();
  writePendingSuggestion();
} else {
  keepInQueue();
  markLowConfidence();
}
```

---

## 8. Security and Privacy Requirements

### 8.1 API Key Handling

```text
- Store API keys only in chrome.storage.local.
- Never sync API keys through chrome.storage.sync.
- Mask keys in UI.
- Provide test connection button.
- Allow provider removal and key deletion.
```

### 8.2 Data Controls

```text
- User can disable page text extraction.
- User can classify using title + URL only.
- User can exclude domains from AI calls.
- User can require local-only AI providers.
- User can preview all outbound payloads.
```

### 8.3 Auditability

Every automated action shall be logged:

```json
{
  "timestamp": "2026-05-17T21:30:00Z",
  "action": "move_bookmark",
  "url": "https://example.com",
  "from": "/_Bookmark Queue",
  "to": "/Work/Identity/Governance",
  "old_title": "Example",
  "new_title": "Example: Identity Governance Reference",
  "confidence": 0.91,
  "provider": "openai-compatible"
}
```

### 8.4 Rollback

The extension shall support:

```text
- Undo last action
- Roll back batch
- Restore previous title
- Restore previous folder
- Export rollback plan
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

## 10. MVP Scope

### MVP 1: Chrome Bookmark Queue

```text
- Create queue folder
- Add current tab to queue
- Watch queue folder
- Configure AI provider
- Classify bookmark
- Suggest title and folder
- Review/approve movement
- Update Chrome bookmark title
- Move bookmark to selected folder
```

### MVP 2: Controlled Automation

```text
- Confidence thresholds
- Auto-move high-confidence items
- Needs Review folder
- Duplicate detection
- Rollback log
- Taxonomy editor
```

### MVP 3: Filesystem Knowledge Base

```text
- Export bookmarks.json
- Export taxonomy.json
- Generate Markdown per bookmark
- Generate index.md
- Generate tag/domain indexes
- Support Obsidian-style wikilinks
```

### MVP 4: Native Host / Advanced Sync

```text
- Continuous filesystem sync
- Git commit on change
- Local provider support through Ollama or LM Studio
- SQLite metadata index
- Vector-ready JSONL export
```

---

## 11. Acceptance Criteria

```text
1. A user can add a bookmark to _Bookmark Queue from the current tab.
2. The extension can classify the bookmark using a configured AI provider.
3. The extension can rename the bookmark with a descriptive title.
4. The extension can move the bookmark to an existing Chrome folder.
5. Low-confidence classifications are routed to _Needs Review.
6. The user can approve, edit, or reject recommendations.
7. The extension can export a filesystem knowledge base in Markdown and JSON.
8. The extension maintains an audit log of title and folder changes.
9. The user can roll back bookmark changes.
10. The user can use OpenAI-compatible, Claude, Gemini, Azure OpenAI, Ollama, LM Studio, or custom HTTP providers.
```

---

## 12. Recommended Repository Structure

```text
bookmark-queue-agent/
  extension/
    manifest.json
    src/
      background/
        service-worker.ts
        queue-processor.ts
        bookmark-manager.ts
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
        anthropic.ts
        gemini.ts
        azure-openai.ts
        ollama.ts
        custom-http.ts
      models/
        bookmark.ts
        taxonomy.ts
        classification.ts
      utils/
        normalize-url.ts
        confidence.ts
        folder-path.ts
  native-host/
    src/
      index.ts
      filesystem-writer.ts
      markdown-generator.ts
      git-sync.ts
      sqlite-index.ts
  schemas/
    classification-result.schema.json
    taxonomy.schema.json
    bookmark-record.schema.json
  examples/
    taxonomy.example.json
    provider-config.example.json
    kb-output/
  docs/
    architecture.md
    security.md
    setup.md
    provider-adapters.md
```

---

## 13. Opinionated Default Behavior

Best default configuration:

```text
Mode:
  Review-first for the first 100 classifications.

Queue:
  All new bookmarks go to _Bookmark Queue.

AI:
  BYO provider required.
  No default hosted service.

Taxonomy:
  Strict Mode enabled.
  No auto folder creation.

Automation:
  Auto-move only after user enables it.
  Minimum auto-move confidence: 0.90.

Filesystem:
  Manual export first.
  Native host optional for continuous sync.

Knowledge Base:
  Markdown + JSON + index files.
  Obsidian-compatible links.
```

This design keeps Chrome as the primary bookmark system while producing a parallel, LLM-friendly knowledge base from the same curated bookmark structure.

[1]: https://developer.chrome.com/docs/extensions/reference/api/bookmarks?utm_source=chatgpt.com "chrome.bookmarks | API - Chrome for Developers"
[2]: https://developer.chrome.com/docs/extensions/reference/api?utm_source=chatgpt.com "API reference | Chrome for Developers"
[3]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging?utm_source=chatgpt.com "Native messaging - Chrome for Developers"
[4]: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access?utm_source=chatgpt.com "The File System Access API: simplifying access to local files"
