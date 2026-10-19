# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.3] - 2026-10-19

### Fixed
- Pane content sized to the pane's real height, so the top is never cut off; the inline pane asks for more rows in graph view.

### Documentation
- Troubleshooting note for a GPU fault in Tabby's WebGL renderer on AMD GPUs that freezes the screen; it is not caused by agentview.

## [0.2.2] - 2026-10-18

### Fixed
- `/agentview` typed while Claude is working now opens at once instead of waiting for the turn to end.
- A fresh session no longer shows `main` as running before any turn.
- The expensive mark `▲` no longer appears on `~$0.00` or on a lone agent: the share rule needs at least $0.05 and two agents with cost.
- The status line is drawn as the dim tail of the prompt hint, not as an engine warning.

### Changed
- Status text says `idle` when nothing runs, with plan limits on a subscription.
- Cost (`~$`) is shown only with API-key billing. On a subscription the header shows the plan's usage limits (`5h 71% · 7d 21%`) and no cost or `▲` anywhere; while billing is not yet known the cost total shows `—`.

## [0.2.1] - 2026-10-18

### Fixed
- High redraw rate and per-event writes that could freeze the terminal; pane opens full-width in fullscreen.

## [0.2.0] - 2026-10-18

### Added
- Graph view of the agents, with spawn lines, a folded layout for narrow terminals and column panning.
- Tree/graph toggle in the dialog header, switched with `t` and `g`.
- Graph keys: `p`/`n` select, `d` opens details, `h`/`l` pan the worker columns.
- Marketplace manifest, so the plugin installs with `/plugin install agentview --marketplace damir-tahirovic/Claude-agent-viewer`.
- English and Montenegrin README.

## [0.1.0] - 2026-10-18

### Added
- `/agentview` in-session dialog with live agent and subagent tree.
- Detail view for one agent: task, recent actions, tokens and todo list.
- Status line that names the agent needing attention first.
- Per-agent tokens, estimated cost and plan progress.
- `ascii` plugin option.
