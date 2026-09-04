# MathOS TUI visual system

## Direction

Use a restrained midnight research-console aesthetic: near-black navy backgrounds, thin blue-gray rules, compact spacing, monospaced type, and small amounts of semantic color. The approved composition is a two-column wide dashboard with a roughly 70/30 main-to-sidebar ratio.

## Color roles

- Blue: structural section labels and navigation.
- Green: verified, connected, healthy, and successful states only.
- Amber: the active objective, paused state, and keyboard shortcuts.
- Violet: activity and quick-command group labels.
- Red: failures and destructive/error states only.

## Layout

- Header: breadcrumb on the left; truthful health and storage indicators on the right when space permits.
- Main: objective banner, research summary, latest meaningful progress, recent activity, and wide-only quick commands.
- Sidebar: workspace integrity, research state, and quick actions. Do not duplicate a value unless the second placement materially aids action.
- Composer: one fixed-height line. Long text scrolls horizontally and never wraps.
- Suggestions: a separate bounded panel directly above the composer, maximum six rows, clipped to available width.
- Footer: compact keyboard shortcuts; reduce progressively on narrow terminals.

## Truth and accessibility

Do not show percentages unless they are backed by a defined measurable denominator. Prefer verified/total gate counts. Never imply that a formal statement is proved merely because it exists. Preserve readable contrast, visible focus, keyboard navigation, and textual labels in addition to color.

## Formal example

When the FS-002 sum-of-odd-numbers example is present, render its canonical statement without mathematical substitution:

`theorem sumOddNumbers (n : ℕ) : Finset.sum (Finset.range n) (fun k => 2 * k + 1) = n ^ 2`
