# setup

This document supports the Bookmark Queue Agent MVP implementation.

- Manifest V3 extension source lives in `extension/src`.
- Queue state, provider settings, and audit logs use `chrome.storage.local`.
- API keys and provider secrets must never be written to sync storage, logs, diagnostics, or exports.
- MVP 1 focuses on capture, rule-based or OpenAI-compatible classification, review, approve/move, and rollback.

## Provider setup

The default provider is the local rule-based classifier. To use the OpenAI-compatible provider, supply an API project key or compatible bearer token in the options page. Leaving the key field blank keeps the previously saved local key.

OpenAI account sign-in, ChatGPT subscriptions, and OIDC sessions are not API credentials for this extension. If classification reports quota or billing details, check the API account/project associated with the configured key rather than the ChatGPT subscription status.
