# Bookmark Queue Agent Product Context

Bookmark Queue Agent is a local-first Manifest V3 Chrome extension for turning messy bookmark capture into a controlled review queue. It helps people collect links quickly, classify them against a long-term folder taxonomy, approve safe moves, and optionally export approved bookmarks to local Markdown/JSON files.

## Users

- Technical knowledge workers who collect many links while researching, coding, writing, or managing projects.
- Privacy-conscious users who want automation without giving every bookmark to a remote service by default.
- Power users building a personal wiki, folder taxonomy, or local knowledge base from browser bookmarks.
- First-time users who need safe defaults while they learn whether the taxonomy and classifier can be trusted.

## Jobs to be done

- Capture the current tab, a context-menu link, or normal Chrome bookmark into an inbound queue.
- Classify queued bookmarks with deterministic local rules or a bring-your-own AI provider.
- Review the proposed title, folder, confidence, and reason before approving a bookmark move.
- Recover from mistakes through ignored/archived states, reclassification, audit entries, and rollback.
- Configure provider credentials, thresholds, excluded domains, and optional Windows native-host sync.

## Brand personality

Calm, precise, and trustworthy. The interface should feel like a focused control desk for bookmark triage: quiet enough for daily use, explicit about safety boundaries, and confident about the next action.

## Product principles

1. **Review before automation.** Keep the next safe decision obvious, especially before bookmark mutation or remote provider use.
2. **Local-first trust.** Make privacy, local storage, and opt-in remote classification understandable without alarmist copy.
3. **Progressive power.** Basic rule-based review should feel simple; OAuth, custom providers, native sync, and thresholds can reveal more detail as needed.
4. **Reversibility over cleverness.** Rollback, retry, ignored, archived, and reclassify states should read as calm recovery paths.
5. **Dense, not cramped.** The extension runs in constrained browser UI, so layouts should support fast scanning without dumping every detail at equal weight.

## Constraints

- Chrome MV3 extension with side panel and options page surfaces.
- Plain TypeScript DOM rendering and static CSS; no frontend framework or component library currently exists.
- Credentials and tokens must never be exposed in docs, screenshots, logs, examples, exported files, or CI output.
- Native-host sync is optional, Windows-first, and disabled by default.
- Real-browser extension smoke testing remains a release gate.
