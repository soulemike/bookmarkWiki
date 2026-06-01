# Bookmark Queue Agent Design System

This document integrates Impeccable-style design guidance for the current extension UI. It records the desired direction and the baseline system to use when improving `extension/src/ui/sidepanel/*` and `extension/src/ui/options/*`.

## Design direction

**Calm command-center utility.** Bookmark Queue Agent should feel like a compact review cockpit: warm paper-like surfaces, ink-forward typography, restrained status color, and clear action hierarchy. It should not look like a generic SaaS dashboard, neon AI tool, or decorative card grid.

## Current baseline

- UI surfaces: side panel and options page.
- Implementation: static HTML, TypeScript template rendering, page-local CSS.
- Current style: system font, light gray background, blue buttons, white cards, minimal borders.
- Main gaps: no shared tokens, weak hierarchy, dense queue cards, long options form, limited focus/hover/status states, and minimal empty-state guidance.

## Visual principles

1. Use one coherent token set across side panel and options page.
2. Prefer warm tinted neutrals over pure gray, black, or white.
3. Reserve strong color for primary actions, confidence/status, and recovery/error states.
4. Create hierarchy with grouping, spacing, weight, and labels before adding decoration.
5. Keep touch/click targets at least 44px tall where practical.
6. Treat long URLs, long folder paths, errors, and empty queues as first-class states.

## Core tokens

- Background: warm cream / notebook paper.
- Surface: tinted off-white cards and panels.
- Text: deep ink brown/slate, with softer muted labels.
- Primary: indigo-blue for safe primary review actions.
- Success: forest green for moved/synced/saved states.
- Warning: amber for review/retry states.
- Danger: red/rose for errors and failed sync.
- Spacing: small tight groups, larger section gaps, and consistent `rem`-based rhythm.
- Shape: modest rounded corners; avoid bubbly generic cards.

## Component guidance

### Side panel

- Header should communicate queue purpose and expose global actions without equal weighting.
- Active items need stronger title, URL, status, confidence, folder, and reason hierarchy.
- Approve should be the clear primary item action. Archive/ignore/reclassify are secondary recovery actions.
- Processed history should remain available but quieter than active work.
- Empty state should explain how bookmarks enter the queue.

### Options page

- Split settings into readable sections: review behavior, provider, native sync, privacy/exclusions.
- Keep safe defaults visible: no-AI provider, auto-move off, page extraction off, native sync off.
- Advanced provider and native-host setup should be visually grouped and explanatory, not mixed into one long flat form.
- Status messages should appear as clear banners with recovery guidance.

## Anti-patterns to avoid

- Neon AI gradients, glassmorphism, decorative glow, or dark-mode cyber styling.
- Equal-weight buttons for actions with different risk levels.
- Tiny text, invisible focus rings, and cramped button groups.
- Gray text on colored panels.
- Empty states that only say there is no data.
