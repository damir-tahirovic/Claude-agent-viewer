# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
