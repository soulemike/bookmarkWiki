# Privacy

Bookmark Queue Agent is local-first. Its default no-AI provider can classify
bookmarks without sending page data to a remote service.

## Data stored locally

The extension stores the following in `chrome.storage.local` for the current
browser profile:

- Queue items, including URL, original title, normalized URL, proposed title,
  proposed folder, summary, tags, confidence, status, and last error.
- Audit log entries for capture, classification, title updates, folder moves,
  rollback, and native-host export attempts.
- User settings such as routing behavior, thresholds, excluded domains, provider
  choice, page extraction preference, and native-host target path.
- Taxonomy metadata.
- Provider configuration, including API keys, bearer tokens, OAuth access
  tokens, refresh tokens, and token expiry when supplied by the user.
- Short-lived operation guards used to prevent extension-created bookmark
  operations from re-entering the queue.

No API key, bearer token, OAuth refresh token, or provider secret is written to
`chrome.storage.sync`, docs, examples, test fixtures, CI summaries, or generated
knowledge-base exports.

## Data sent to providers

Remote provider calls happen only when the selected provider is not **No-AI rule
based** and classification is triggered.

Depending on settings and provider, a classification request can include:

- Bookmark URL.
- Original bookmark/page title.
- Taxonomy folder paths and rules needed to choose an approved folder.
- Optional extracted page context only when a classification flow explicitly
  supplies it and page text extraction is enabled. Normal side-panel/background
  classification currently does not extract or pass page text.

Use **Excluded domains** for sites whose URLs or titles should be blocked from
classification by any provider.

## ChatGPT OAuth boundary

The ChatGPT OAuth provider uses OpenAI device authorization and stores returned
OAuth tokens locally. It does not read or reuse browser cookies, copied ChatGPT
session tokens, ChatGPT web sessions, or Codex browser login state.

## Native-host exports

When native-host sync is disabled, no local files are written. When enabled,
approved/moved bookmarks can be written under the configured local folder as
Markdown, JSON, and recent NDJSON files. Exported records include bookmark
metadata such as title, URL, folder, tags, summary, confidence, and processed
timestamp. Provider credentials are not included in those files.

## Retention and removal

Data remains in the browser profile until the extension or its storage is
cleared. Removing the extension from Chrome removes extension-local storage for
that profile. Files already written by the native host are regular local files
and must be deleted from the target folder separately.
