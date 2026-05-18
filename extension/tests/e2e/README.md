# E2E smoke test plan

The MVP 1 release smoke test loads `extension/dist` in Chrome/Chromium, creates queue/review folders, adds the active tab, classifies with the rule-based provider, approves the move, verifies audit entries, and rolls the batch back. This repository includes unit/integration automation; real browser execution is a release gate in an environment with Chrome extension loading available.
