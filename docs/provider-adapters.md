# Provider adapters

Bookmark Queue Agent supports three provider modes. The provider determines how
queued bookmarks are classified after the user clicks **Classify next** or when
queue processing runs in the background.

## Choosing a provider

| Provider | Best for | Credentials | Network behavior |
| --- | --- | --- | --- |
| No-AI rule based | First run, private/offline review, deterministic taxonomy rules | None | No provider network call |
| OpenAI-compatible API / local bridge | OpenAI Platform, compatible hosted APIs, Ollama/LM Studio-style local bridges | Non-empty API key or compatible bearer-token field currently required | Sends classification request to `{base_url}/chat/completions` |
| OpenAI ChatGPT OAuth | Device-authorization flow against OpenAI/ChatGPT Codex backend | OAuth access/refresh tokens from device approval | Sends classification request to ChatGPT Codex responses endpoint |

OpenAI/ChatGPT endpoint host permissions are declared in the manifest. The
options page requests optional Chrome host permission for additional configured
OpenAI-compatible origins before saving those provider settings.

## OpenAI-compatible adapter

The OpenAI-compatible adapter uses API project keys or compatible bearer tokens
supplied by the user. The current adapter requires a non-empty API key/bearer
token field before classification, even for local bridges; if a local bridge does
not enforce auth, configure it to accept a harmless placeholder token. Local
bridges must expose an OpenAI-compatible `/chat/completions` endpoint and return
a JSON classification object in `choices[0].message.content`.

Transport rules:

- Remote provider base URLs must use `https://`.
- Plain `http://` is allowed only for loopback bridges such as
  `http://localhost:11434/v1` or `http://127.0.0.1:1234/v1`.
- Non-loopback plain HTTP is rejected before save/classification.

The options page password field may be left blank to keep a previously saved API
key for this provider.

## OpenAI ChatGPT OAuth adapter

The OpenAI ChatGPT OAuth adapter uses fixed OpenAI public client metadata with
the OpenAI device authorization flow. The user clicks **Save and connect ChatGPT
OAuth**, approves the displayed code in the opened OpenAI tab, and the extension
polls until the device authorization completes.

Built-in endpoints:

- `https://auth.openai.com/api/accounts/deviceauth/usercode`
- `https://auth.openai.com/api/accounts/deviceauth/token`
- `https://auth.openai.com/deviceauth/callback`
- `https://auth.openai.com/oauth/token`
- `https://chatgpt.com/backend-api/codex/responses`

The extension opens the device approval page instead of relying on a Chrome
extension redirect URI. ChatGPT OAuth classification uses the ChatGPT Codex
backend, not the Platform `https://api.openai.com/v1/chat/completions` endpoint,
because Platform API project quota is separate from ChatGPT/Codex OAuth.

If a saved OAuth config contains legacy metadata such as `client_id`,
`authorization_url`, `token_url`, or `scopes`, reconnect OAuth to migrate the
provider configuration.

## Authentication boundaries

- ChatGPT subscriptions, Codex account login, copied account/session tokens,
  browser cookies, and account web sessions are not reused as API credentials.
- Do not implement fake OIDC flows or web-session token scraping for OpenAI API
  access.
- Do not use native-host automation as a backdoor for ChatGPT/Codex account-token
  reuse.
- Provider secrets must stay in `chrome.storage.local` and must not be written to
  sync storage, docs, fixtures, CI logs, or native-host exports.

## Error handling expectations

Provider errors should surface provider response details such as `error.message`,
`error.type`, and `error.code` when available so users can distinguish transient
rate limits from quota, billing, authorization, or unsupported-model failures.

The queue processor can retry transient provider failures according to the
provider `retry_count`. Exhausted or non-retryable failures move the queue item to
`needs_review` with the error message visible in the side panel.
