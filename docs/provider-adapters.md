# provider adapters

This document supports the Bookmark Queue Agent MVP implementation.

- Manifest V3 extension source lives in `extension/src`.
- Queue state, provider settings, and audit logs use `chrome.storage.local`.
- API keys and provider secrets must never be written to sync storage, logs, diagnostics, or exports.
- MVP 1 focuses on capture, rule-based or OpenAI-compatible classification, review, approve/move, and rollback.

## OpenAI-compatible authentication boundary

- The OpenAI-compatible adapter uses API project keys or compatible bearer tokens supplied by the user.
- The OpenAI ChatGPT OAuth adapter uses fixed OpenAI public OAuth client metadata with Authorization Code + PKCE, then sends the resulting access token to the OpenAI-compatible API as `Authorization: Bearer ...`.
- The same adapter may target a user-controlled local bridge when that bridge exposes an OpenAI-compatible `/chat/completions` endpoint.
- Provider Base URLs must use `https://`, except plain `http://` is allowed for loopback local bridges on `localhost` or `127.0.0.1`.
- OpenAI OAuth endpoints are built in as `https://auth.openai.com/oauth/authorize` and `https://auth.openai.com/oauth/token`; the extension uses Chrome identity redirect URL `chrome.identity.getRedirectURL("openai-chatgpt-oauth")` and PKCE `S256`.
- ChatGPT subscriptions, Codex account login, copied account/session tokens, browser cookies, and account web sessions are not reused as API credentials for this extension.
- Do not implement a fake OIDC flow or web-session token scraping for OpenAI API access.
- Do not use native-host automation as a backdoor for ChatGPT/Codex account-token reuse.
- Provider errors should surface provider response details such as `error.message`, `error.type`, and `error.code` so users can distinguish transient rate limits from quota or billing failures.
