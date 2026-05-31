# Security

Bookmark Queue Agent touches browser bookmarks, optional AI providers, and an
optional local native host. This page documents the current safety boundaries.

## Extension permissions

The current manifest uses:

- `bookmarks` to create, update, move, and read bookmark folders/items.
- `storage` to persist queue, audit, settings, taxonomy, provider config, and
  operation guards.
- `contextMenus` to add **Add link to Bookmark Queue**.
- `activeTab` and `sidePanel` for toolbar capture and review UI.
- `alarms` to drain queued classification work.
- `nativeMessaging` for the optional local file-sync host.
- Optional host permissions for additional configured remote or local
  OpenAI-compatible providers. OpenAI/ChatGPT endpoint host permissions are
  already declared in the manifest.

Remote provider origins should be granted only for providers you intend to use.

## Secret handling

- Provider secrets are stored in `chrome.storage.local` only.
- The options page keeps a saved OpenAI-compatible API key when the password
  field is left blank.
- ChatGPT OAuth stores access/refresh tokens locally and preserves current
  tokens only for compatible settings saves.
- Secrets must not be copied into docs, fixtures, exported knowledge-base files,
  logs, screenshots, or CI output.

## Provider transport rules

- Remote OpenAI-compatible provider URLs must use `https://`.
- Plain `http://` is accepted only for loopback local bridges on `localhost` or
  `127.0.0.1`.
- The current OpenAI-compatible adapter requires a non-empty API key or bearer
  token field before classification, even for local bridges.
- ChatGPT OAuth uses OpenAI device authorization and the ChatGPT Codex backend;
  it does not scrape browser sessions or accept pasted ChatGPT session tokens.

## Bookmark mutation safety

- Extension-created bookmark create/move/update operations are wrapped with
  operation guards so Chrome bookmark events do not create infinite loops.
- Approval writes separate audit entries for title updates and folder moves.
- Rollback reverses the latest approved batch in reverse order when the original
  bookmark/folder state still exists.
- Strict folder resolution requires proposed folders to resolve to approved
  taxonomy paths before approval.

## Native-host safety

Native-host sync is opt-in and disabled by default. The Windows host validates
request shape, rejects path traversal, rejects Windows-reserved filenames,
verifies SHA-256 content hashes, and writes only under the configured target
folder. Use **Test connection** after registration and before enabling sync.

## Operational guidance

- Start with the rule-based provider and auto-move disabled.
- Review several classifications manually before enabling auto-move.
- Use excluded domains for internal or sensitive sites; excluded domains
  currently block classification by all providers.
- Treat provider errors about quota, billing, or authorization as provider-side
  account issues; do not work around them with copied web-session tokens.
