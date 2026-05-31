# Setup and usage guide

This guide explains how to build, load, configure, and use Bookmark Queue Agent
as it works today.

## Build and load the extension

```sh
cd extension
npm install
npm run build
```

In Chrome or a Chromium-based browser:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `extension/dist`.
5. Pin the extension if you want quick access to the toolbar action.

## First-run configuration

Open the extension options page from `chrome://extensions`.

### Queue routing

- **Route normal bookmarks to queue** moves newly created Chrome bookmarks into
  `_Bookmark Queue` after Chrome creates them. Leave this off if you only want
  explicit toolbar/context-menu captures.
- The extension also recognizes bookmarks moved into `_Bookmark Queue` and can
  add them to the persisted queue.
- Extension-created bookmark moves and title updates are protected by operation
  guards so they do not loop back into the queue as fresh user actions.

### Review and automation thresholds

- **Enable auto-move for high confidence** is off by default. With it off,
  classifications remain review-first.
- **Review threshold** defaults to `0.70`.
- **Auto-move threshold** defaults to `0.90`. Auto-move only happens when the
  setting is enabled and confidence meets or exceeds this value.

Keep auto-move disabled until you have confirmed that your taxonomy folders and
provider recommendations are reliable.

### Page text and excluded domains

- **Allow page text extraction** is an opt-in for classification flows that ask
  the active page for context. The classifier accepts optional page text, but the
  normal side-panel/background classification path does not currently extract or
  pass page text, so enabling this toggle alone does not change normal
  classification.
- **Excluded domains** is a comma-separated list of hostnames that should not be
  classified by any provider. Use this for sensitive or internal sites.

## Daily workflow

1. Capture a bookmark:
   - Click the extension action to add the active tab to `_Bookmark Queue`.
   - Right-click a link and choose **Add link to Bookmark Queue**.
   - Or enable normal-bookmark routing in options.
2. Open the side panel.
3. Click **Classify next**.
4. Review the proposed title, folder, confidence, and reason.
5. Apply a decision:
   - **Approve** updates the Chrome bookmark title and moves it into the
     resolved taxonomy folder.
   - **Ignore** marks the item ignored.
   - **Archive** archives the queue record.
   - **Reclassify** queues the item for another classification attempt.
   - **Rollback last move** reverses the latest approved title/move batch when
     Chrome still has the bookmark and original folder.

If native-host sync is enabled and a moved item fails to export, the side panel
shows **Retry native sync** for that item.

## Provider setup

### No-AI rule-based provider

This is the default provider. It performs deterministic local classification and
is the recommended first-run option because it requires no credentials and no
provider host permissions.

### OpenAI-compatible API or local bridge

Select **OpenAI-compatible API / local bridge** to use an OpenAI-style
`/chat/completions` endpoint.

Requirements:

1. A base URL such as `https://api.openai.com/v1`, `http://localhost:11434/v1`,
   or `http://127.0.0.1:1234/v1`.
2. A model that can follow JSON-only classification instructions.
3. A non-empty API project key or compatible bearer token field. The current
   adapter requires this before classification, even for local bridges; use a
   harmless placeholder token only if your bridge does not enforce auth.
4. Chrome host permission for additional configured origins. Built-in
   OpenAI/ChatGPT endpoints are declared in the manifest; the options page
   requests optional permission for custom OpenAI-compatible origins before
   saving non-rule provider settings.

Remote provider URLs must use HTTPS. Plain HTTP is rejected except for loopback
local bridges on `localhost` or `127.0.0.1`.

The provider must return an OpenAI chat-completions response where
`choices[0].message.content` is a JSON object matching `ClassificationResult`:

```json
{
  "url": "https://example.com/article",
  "original_title": "Example article",
  "descriptive_title": "Example article - concise useful title",
  "summary": "Short summary of the bookmarked page.",
  "target_folder": "/Bookmarks Bar/Reference",
  "tags": ["example", "reference"],
  "content_type": "article",
  "audience": "general",
  "confidence": 0.82,
  "recommended_action": "needs_review",
  "reason": "The page is a general reference article and matches the existing taxonomy."
}
```

For `recommended_action: "move"` or `"needs_review"`, `target_folder` is
required and must match an existing taxonomy folder while strict mode is active.
Valid `content_type` values are `article`, `documentation`, `repository`,
`video`, `tool`, `reference`, `product`, and `unknown`. Valid actions are
`move`, `needs_review`, `ignore`, and `hold`.

### OpenAI ChatGPT OAuth

Select **OpenAI ChatGPT OAuth** to use OpenAI device authorization with the
ChatGPT Codex backend.

1. Select **OpenAI ChatGPT OAuth** in the provider dropdown.
2. Keep or adjust the model.
3. Click **Save and connect ChatGPT OAuth**.
4. Approve the displayed user code in the opened OpenAI tab.
5. Return to the options page while it waits for the connection to complete.

No OAuth client ID, redirect URI, authorization URL, token URL, API base URL, or
scope setup is required by the user. The extension uses OpenAI device
authorization endpoints and exchanges the approved code through
`https://auth.openai.com/oauth/token`, then classifies through
`https://chatgpt.com/backend-api/codex/responses`.

OpenAI account web sessions, ChatGPT subscriptions, Codex account login, browser
cookies, and copied session tokens are not API credentials for this extension.
If classification reports quota or billing details, check the API account,
provider, or OAuth client associated with the selected provider.

## Windows native host setup

The repo includes a Windows-first native messaging host that can write generated
bookmark knowledge-base files after bookmarks are approved and moved.

1. Install Node.js on Windows so `node.exe` is available to the launcher command.
2. Build or load the extension and copy its Chrome extension ID from
   `chrome://extensions`.
3. From PowerShell in `native-host`, register the host for the current Windows
   user:

   ```powershell
   .\install-windows.ps1 -Browser Chrome -ExtensionId <extension-id>
   ```

   Use `-Browser Edge` for Microsoft Edge or `-Browser Both` to register both.
   Use `-Machine` only when installing for all users from an elevated PowerShell
   session.

4. Open the extension options page and click **Test connection** in the Windows
   native host sync section.
5. After the test passes, enable **Enable local file sync for approved
   bookmarks**.
6. Set **Folder to write files to** to a local Windows folder such as
   `C:\Users\you\Documents\BookmarkWiki`.

The installer writes `native-host/manifests/chrome-windows.installed.json` with
an absolute launcher path and the exact `chrome-extension://<extension-id>/`
origin, then registers `com.bookmark_queue_agent.host` under the Chrome or Edge
native messaging registry key for the current user by default. The host validates
SHA-256 hashes, rejects path traversal, and rejects Windows-reserved filenames
before writing files.

## Troubleshooting

- **No queued bookmarks yet:** capture a tab/link first, or enable normal
  bookmark routing and create a Chrome bookmark.
- **Chrome host permission is required:** save again and approve the permission
  prompt for the custom configured provider origin.
- **Connect ChatGPT OAuth before classifying bookmarks:** choose **Save and
  connect ChatGPT OAuth** and finish the device approval flow.
- **Reconnect ChatGPT OAuth to migrate the provider configuration:** disconnect
  and reconnect OAuth so the current token shape is stored.
- **Native host status check failed:** confirm the Windows installer was run for
  the same browser and extension ID, then use **Test connection** again.
- **Native host sync target path is not configured:** set **Folder to write files
  to** before enabling local file sync.
