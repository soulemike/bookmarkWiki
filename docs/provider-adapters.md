# provider adapters

This document supports the Bookmark Queue Agent MVP implementation.

- Manifest V3 extension source lives in `extension/src`.
- Queue state, provider settings, and audit logs use `chrome.storage.local`.
- API keys and provider secrets must never be written to sync storage, logs, diagnostics, or exports.
- MVP 1 focuses on capture, rule-based or OpenAI-compatible classification, review, approve/move, and rollback.

## OpenAI-compatible authentication boundary

- The OpenAI-compatible adapter uses API project keys or compatible bearer tokens supplied by the user.
- ChatGPT subscriptions and OpenAI account sign-in/OIDC sessions do not grant third-party API access to this extension.
- Do not implement a fake OIDC flow for OpenAI API access unless OpenAI publishes a supported OAuth/OIDC API authorization flow for third-party clients.
- Provider errors should surface provider response details such as `error.message`, `error.type`, and `error.code` so users can distinguish transient rate limits from quota or billing failures.
