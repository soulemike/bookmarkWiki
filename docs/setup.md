# setup

This document supports the Bookmark Queue Agent MVP implementation.

- Manifest V3 extension source lives in `extension/src`.
- Queue state, provider settings, and audit logs use `chrome.storage.local`.
- API keys and provider secrets must never be written to sync storage, logs, diagnostics, or exports.
- MVP 1 focuses on capture, rule-based or OpenAI-compatible classification, review, approve/move, and rollback.

## Provider setup

The default provider is the local rule-based classifier. To use the OpenAI-compatible provider, supply an API project key or a token for an OpenAI-compatible local bridge in the options page. Leaving the key field blank keeps the previously saved local key.

To use OpenAI ChatGPT OAuth, select **OpenAI ChatGPT OAuth**, register the redirect URI shown in the options page with the OAuth app, enter the OAuth client ID, authorization URL, token URL, scopes, API base URL, and model, then choose **Save and connect ChatGPT OAuth**. The extension uses Authorization Code with PKCE through `chrome.identity.launchWebAuthFlow`, stores returned access/refresh tokens in `chrome.storage.local`, and refreshes access tokens before classification when a refresh token is available.

OpenAI account web sessions, ChatGPT subscriptions, Codex account login, browser cookies, and copied session tokens are not API credentials for this extension. If classification reports quota or billing details, check the API account/project or OAuth client associated with the configured provider rather than the ChatGPT subscription status.

Local bridges must expose an OpenAI-compatible `/chat/completions` endpoint. The extension allows `https://` provider URLs and plain `http://` only for loopback bridges such as `http://localhost:11434/v1` or `http://127.0.0.1:1234/v1`; non-loopback plain HTTP is rejected before save/classification.

## Local OpenAI-compatible bridge checklist

To make a local bridge functional, the user needs:

1. A running local server that implements the OpenAI chat-completions contract at `{base_url}/chat/completions`.
2. A model served by that bridge that can follow JSON-only classification instructions.
3. A Base URL configured in the extension, usually one of:
   - `http://localhost:11434/v1`
   - `http://127.0.0.1:1234/v1`
   - an HTTPS URL for a remote bridge controlled by the user.
4. A bridge/API token if the bridge requires one. Enter it in the API key field; if the bridge does not require auth, configure the bridge to accept a harmless placeholder token because the provider sends an `Authorization: Bearer ...` header.
5. Chrome host permission for the configured bridge origin. The options page requests this permission before saving the provider settings.
6. A response shaped like OpenAI chat completions, where `choices[0].message.content` is a JSON string matching `ClassificationResult`:

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

For `recommended_action: "move"` or `"needs_review"`, `target_folder` is required and must match an existing taxonomy folder in strict mode. Valid `content_type` values are `article`, `documentation`, `repository`, `video`, `tool`, `reference`, `product`, and `unknown`; valid actions are `move`, `needs_review`, `ignore`, and `hold`.

## Windows native host setup

The repo includes a Windows-first native messaging host that lets the extension write generated bookmark knowledge-base files to a local folder after bookmarks are approved and moved.

1. Install Node.js on Windows so `node.exe` is available to the launcher command.
2. Build or load the extension and copy its Chrome extension ID from `chrome://extensions`.
3. From PowerShell in `native-host`, register the host for the current Windows user:

   ```powershell
   .\install-windows.ps1 -Browser Chrome -ExtensionId <extension-id>
   ```

   Use `-Browser Edge` for Microsoft Edge or `-Browser Both` to register both. Use `-Machine` only when installing for all users from an elevated PowerShell session.

4. Open the extension options page, click **Test native host**, then enable **Write moved bookmarks to the local native host**.
5. Set **Native host target path** to a local Windows folder such as `C:\Users\you\Documents\BookmarkWiki`.

The installer writes `native-host/manifests/chrome-windows.installed.json` with an absolute launcher path and the exact `chrome-extension://<extension-id>/` origin, then registers `com.bookmark_queue_agent.host` under the Chrome or Edge native messaging registry key for the current user by default. The host validates SHA-256 hashes, rejects path traversal, and rejects Windows-reserved filenames before writing files.
