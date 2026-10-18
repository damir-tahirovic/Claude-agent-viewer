English | [Crnogorski](README.me.md)

# agentview

agentview is a live terminal view of Claude Code agents and subagents. It shows who spawned whom, what each agent is doing right now, the tokens and estimated cost per agent, and the progress of the plan. It runs inside your Claude Code session as a plugin: no browser, no server, no Docker.

## Screenshots

These are text mockups from the design reference in `docs/design/golden/`.

```text
╭─ agentview · session 7f3a9c2e ─────────────────────────────────────────────────────── 67.5k tok · ~$1.10 · plan 60% ─╮
│ ⠋ 4 running   ◔ 1 waiting   ✓ 2 done   ✗ 0 failed   ·  7 agents                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  AGENT               STATUS     MODEL       TASK               NOW                             TOK     COST     TIME │
│  main                ⠋ running  opus-5-5    refactor auth fl…  Task: add token refresh       21.5k  ~$0.61▲   6m12s  │
│  ├─ worker           ✓ done     sonnet-5-5  fix login bug      Edit src/login.ts             12.0k  ~$0.14    3m08s  │
│  │  └─ scout         ✓ done     haiku-5-5   find session usa…  Grep "session"                 3.7k  ~$0.01      22s  │
│▸ ├─ worker           ⠋ running  sonnet-5-5  add token refresh  Edit src/auth.ts               9.3k  ~$0.12    3m21s  │
│  │  ├─ Explore       ⠋ running  haiku-5-5   map refresh call…  Grep "TODO"                    2.7k  ~$0.01      34s  │
│  │  └─ reviewer      ◔ waiting  sonnet-5-5  review auth diff   Bash: rm -rf dist              4.7k  ~$0.03    1m35s  │
│  └─ worker           ⠋ running  sonnet-5-5  write auth tests   Bash: npm test                13.6k  ~$0.18    4m10s! │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ plan ██████████████░░░░░░░░░░ 6/10 60%  ▸ Add token refresh to auth.ts                                               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ select   ⏎ details   esc close   q quit                                                                    ● live │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The tree view: every agent and subagent, with status, model, task, current action, tokens, cost and time.

```text
╭─ agentview · session 7f3a9c2e ────────────────────────────────────────────────────────67.5k tok · ~$1.10 · plan 60%──╮
│ ⠋ 4 running   ◔ 1 waiting   ✓ 2 done   ✗ 0 failed   ·  7 agents                                       tree   graph   │
│                            ╭─ main ──────────────────────────────────────── opus-5-5 ─╮                              │
│                            │ ⠋ running                                          6m12s │                              │
│                            │ refactor auth flow                                       │                              │
│                            │ ▸ Task: add token refresh                                │                              │
│                            │ 21.5k tok · ~$0.61▲ · 14 calls                           │                              │
│                            │ plan ██████████░░░░░░ 6/10 60%  ▸ Add token refresh t…   │                              │
│                            ╰─────────────────────────────┬────────────────────────────╯                              │
│                                                          │ spawn                                                     │
│                    ╭─────────────────────────────────────┼─────────────────────────────────────╮                     │
│                    │                                     ┃                                     ┃                     │
│  ╭─ worker ──────────── sonnet-5-5 ─╮  ╔═ worker ════════════ sonnet-5-5 ═╗  ╭─ worker ──────────── sonnet-5-5 ─╮    │
│  │ ✓ done · result returned   3m08s │  ║ ⠋ running                  3m21s ║  │ ⠋ running                 4m10s! │    │
│  │ fix login bug                    │  ║ add token refresh                ║  │ write auth tests                 │    │
│  │ ▸ Edit src/login.ts              │  ║ ▸ Edit src/auth.ts               ║  │ ▸ Bash: npm test                 │    │
│  │ 12.0k tok · ~$0.14 · 31 calls    │  ║ 9.3k tok · ~$0.12 · 24 calls     ║  │ 13.6k tok · ~$0.18 · 23 calls    │    │
│  ╰─┬────────────────────────────────╯  ╚═┬════════════════════════════════╝  ╰──────────────────────────────────╯    │
│    │ ╭─ scout ────────── haiku-5-5 ─╮    ┃ ╭─ Explore ──────── haiku-5-5 ─╮                                          │
│    └─│ ✓ done · result returned 22s │    ┣━│ ⠋ running                34s │                                          │
│      │ find session usages          │    ┆ │ map refresh callers          │                                          │
│      │ ▸ Grep "session"             │    ┆ │ ▸ Grep "TODO"                │                                          │
│      │ 3.7k tok · ~$0.01 · 9 calls  │    ┆ │ 2.7k tok · ~$0.01 · 6 calls  │                                          │
│      ╰──────────────────────────────╯    ┆ ╰──────────────────────────────╯                                          │
│                                          ┆ ╭─ reviewer ────── sonnet-5-5 ─╮                                          │
│                                          └┄│ ◔ waiting for permissio1m35s │                                          │
│                                            │ review auth diff             │                                          │
│                                            │ ▸ Bash: rm -rf dist          │                                          │
│                                            │ 4.7k tok · ~$0.03 · 4 calls  │                                          │
│                                            ╰──────────────────────────────╯                                          │
│                                                                                                                      │
│ ! write auth tests has been on "npm test" for 4m10s                                                                  │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ←→↑↓ move   ⏎ details   tab tree   esc close                                                                 ● live  │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The graph view: main on top, its workers below, with the spawn lines between them.

```text
╭─ agentview › worker · add token refresh ───────────────────────────────────────────────────────────────── ⠋ running ─╮
│ model sonnet-5-5   parent main   started 14:02:11   elapsed 3m21s   tool calls 24   on this action 12s               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TASK                                                                                                                 │
│ Add refresh-token rotation to src/auth.ts: issue a new refresh token on every use, invalidate the previous one,      │
│ and wire the flow into the login handler. Keep the existing session cookie format untouched.                         │
├──────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────┤
│ ACTIONS · last 20 of 24                                          │ TOKENS                                            │
│ 14:02:14 ✓ Read   src/auth.ts                               0.1s │ input         7,400 █████░░░░░░░░░░░░░░░          │
│ 14:02:16 ✓ Read   src/session/store.ts                      0.1s │ output        1,900 █░░░░░░░░░░░░░░░░░░░          │
│ 14:02:20 ✓ Grep   "refreshToken"                            0.3s │ cache read   31,200 ████████████████████          │
│ 14:02:25 ✓ Glob   src/**/*.test.ts                          0.1s │ cache write   4,100 ███░░░░░░░░░░░░░░░░░          │
│ 14:02:33 ✓ Read   src/login.ts                              0.1s │                                                   │
│ 14:02:42 ✓ Edit   src/auth.ts                               0.2s │ in + out      9,300                               │
│ 14:02:55 ✓ Edit   src/auth.ts                               0.2s │ cost         ~$0.12   11% of session cost         │
│ 14:03:09 ✗ Bash   npx tsc --noEmit                          6.1s │                                                   │
│ 14:03:17 ✓ Read   src/types/token.d.ts                      0.1s │ TODO · this agent  2/4                            │
│ 14:03:25 ✓ Edit   src/types/token.d.ts                      0.2s │ ✓ Read auth.ts and session store                  │
│ 14:03:32 ✓ Bash   npx tsc --noEmit                          5.8s │ ✓ Add rotateRefreshToken()                        │
│ 14:03:44 ✓ Edit   src/auth.ts                               0.2s │ ▸ Wire rotation into login handler                │
│ 14:03:56 ✓ Grep   "rotateRefreshToken"                      0.2s │ ◌ Add tests for rotation                          │
│ 14:04:09 ✓ Read   src/api/routes.ts                         0.1s │                                                   │
│ 14:04:22 ✓ Edit   src/api/routes.ts                         0.3s │                                                   │
│ 14:04:37 ✓ Bash   npm run lint -- src/auth.ts               4.4s │                                                   │
│ 14:04:51 ✓ Edit   src/auth.ts                               0.2s │                                                   │
│ 14:05:03 ✓ Read   src/auth.test.ts                          0.1s │                                                   │
│ 14:05:17 ✓ Write  src/auth.refresh.test.ts                  0.4s │                                                   │
│ 14:05:30 ⠋ Edit   src/auth.ts                                12s │                                                   │
├──────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────┤
│ ↑↓ prev / next agent   esc back to tree   q quit                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The agent detail: the full task, the recent actions, the token breakdown and the agent's own todo list.

The mockups show the design. In the plugin the footer hints are the ones listed under [Usage](#usage): `q` does nothing in the dialog, and the graph view uses `p`/`n` and `t`/`g`.

## Features

- `/agentview` opens a live dialog inside the session.
- Tree and graph views of the agents, switched with `t` and `g`.
- Agent detail: task, recent actions, token breakdown and the agent's todo list.
- A status line under the prompt that names what needs attention first.
- Tokens and estimated cost (`~$`) per agent and for the whole session.
- Plan progress in percent, taken from the todo list.
- Markers for agents that are stuck (`!`), expensive (`▲`) or `unknown`.
- ASCII mode for terminals without box-drawing characters.
- Layouts for narrow terminals.

## Requirements

- Claude Code 2.1.302 or newer. agentview uses the mod API, and 2.1.302 is the version it was built and tested on.
- Node.js 20 or newer is needed only for development, not to use the plugin.

## Install

```text
/plugin install agentview --marketplace damir-tahirovic/Claude-agent-viewer
```

Claude Code then asks whether to add the marketplace; answer `y`. It then asks for a scope; pick the one you want. Restart Claude Code if it asks you to.

For development, clone the repository and load it directly:

```bash
git clone https://github.com/damir-tahirovic/Claude-agent-viewer.git
claude --plugin-dir /path/to/Claude-agent-viewer
```

Update and uninstall, from your shell:

```bash
claude plugin update agentview
claude plugin uninstall agentview
```

An update needs a restart of Claude Code to apply.

## Usage

Type `/agentview` to open the dialog. It opens on the view you used last (the tree the first time), with `main` selected.

**Tree view**

| Key | Action |
| --- | --- |
| `↑` `↓` | Select an agent |
| `⏎` | Open the details of the selected agent |
| `t` / `g` | Switch to the tree or the graph view |
| `Esc` | Close the dialog |

**Graph view**

| Key | Action |
| --- | --- |
| `p` / `n` | Select the previous or next agent |
| `d` | Open the details of the selected agent |
| `h` / `l` | Pan the worker columns left or right (shown only when some columns do not fit) |
| `t` / `g` | Switch to the tree or the graph view |
| `Esc` | Close the dialog |

**Detail view**

| Key | Action |
| --- | --- |
| `◂ prev agent` / `next agent ▸` | Step to the neighbouring agent |
| `Esc` | Go back to the tree or graph |

**Status line.** The line under the prompt shows one message, chosen by priority:

1. An agent is waiting: `◔ reviewer waiting · Bash: rm -rf dist · /agentview`.
2. A running agent is stuck: `! write auth tests on "npm test" for 4m10s · /agentview`.
3. An agent failed: `✗ <task> failed · error · /agentview`.
4. The plan is complete and every helper agent is done: `✓ all 7 agents done · 52.3k tok · ~$1.10 · 100%`.
5. Otherwise a summary: `⠋ 4 running · 52.3k tok · 60%   /agentview`.

## What the numbers mean

- **TOK** is input plus output tokens of the agent. Cache tokens are not counted in it; the detail view shows them separately.
- **Cost (`~$`)** is an estimate, not billing data. It is computed from list prices per million tokens in `src/core/cost.ts`, read on 2026-10-18. A model without a known price counts as `$0`.

  | Model | Input | Output | Cache read | Cache write (5 min) |
  | --- | --- | --- | --- | --- |
  | `opus-5-5` | $4 | $20 | $0.20 | $5 |
  | `sonnet-5-5` | $2 | $10 | $0.20 | $2.50 |
  | `haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 |
  | `fable-5-1` | $10 | $50 | $0.25 | $12.50 |

- **`▲`** after a cost marks an expensive agent: at least $0.50, or at least 40% of the session's estimated cost.
- **`!`** after the time marks an agent that has been on the same action for more than 3 minutes.
- **`unknown`** means a subagent has sent no signal for more than 60 seconds and has no tool in flight. It becomes `running` again on its next signal. The main agent is never `unknown`.
- **Plan %** comes only from the main agent's todo list (done divided by total). Without a todo list it shows `—`. Subagent todo lists are not used for it.
- **Main** shows `done` between turns, and `running` again when the next turn starts.

## Configuration

One option, `ascii` (default `false`). When it is on, the dialog is drawn with ASCII characters only. Set it from the plugin's configuration in Claude Code, or from your shell:

```bash
claude plugin configure agentview
```

`claude plugin configure` shows the options and which are unset; add `--values-stdin` to save values from a JSON object on stdin. You can also set it with `--config ascii=true` on `claude plugin install`, or under `pluginConfigs` in your Claude Code settings. Restart Claude Code after changing it.

## How it works

agentview keeps its layers strictly separate. Each layer depends only on the ones below it:

```text
hooks/      engine wiring only: register hooks, call adapters, read/write atoms. No logic.
src/mod/    translation between engine events and our AgentEvent; painting lines as <Text>.
src/view/   pure rendering: state -> rows -> lines in the "{codes|text}" format.
src/core/   pure domain: model, reducer, summaries, formatting, cost, progress.
```

The data comes from plugin hooks: tool calls, agent spawns, turn steps and the engine's agent list. The adapter turns them into events, the reducer folds them into a session state, and the view draws that state. agentview only observes; it does not change what your agents do.

Nothing leaves your machine. The plugin makes no network calls and has no runtime dependencies.

## Limitations

- It works only inside the Claude Code session where it is installed. A standalone CLI for all sessions is planned (Phase 2).
- Plugins cannot rebind Tab and the arrow keys, so the graph view and the view switch use letter hotkeys.
- In the wide graph, agents nested deeper than grandchildren are not drawn; use the tree view (`t`) for deep hierarchies.
- The detail view is clipped, not reflowed, below 90 columns.
- The `waiting` status comes from the engine's agent list, so it is not always a permission prompt.
- Costs are estimates from list prices.

## Development

```bash
npm install
npm test                  # core and view tests (node:test)
npm run typecheck
claude plugin validate .
claude plugin test .      # mod tests
```

The view is tested against golden fixtures in `docs/design/golden/`, produced from the design spec in `docs/design/` (`tui-spec.txt`, `graph-spec.txt` and their generators). A mismatch is a bug in the code, not in the fixture. The code standards are in [CLAUDE.md](CLAUDE.md).

## Roadmap

- Phase 2: a standalone `agentview` CLI that watches all sessions.
- Publish to npm.
- A proper narrow layout for the detail view.

## Credits and license

MIT, © 2026 Damir Tahirovic. See [LICENSE](LICENSE).

Built with Claude Code: the main Opus session planned and reviewed the work, and Sonnet and Haiku subagents implemented it.
