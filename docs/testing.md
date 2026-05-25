# testing

This document supports the Bookmark Queue Agent MVP implementation.

- Manifest V3 extension source lives in `extension/src`.
- Queue state, provider settings, and audit logs use `chrome.storage.local`.
- API keys and provider secrets must never be written to sync storage, logs, diagnostics, or exports.
- MVP 1 focuses on capture, rule-based or OpenAI-compatible classification, review, approve/move, and rollback.
- Native host coverage uses Node tests for the native messaging length-prefix codec, Windows-safe path validation, hashed file writes, and the extension dispatcher payload shape. These tests do not require registering the host with Chrome.
