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
- Tree and graph views of the agents, switched with `t` and `g`. With many subagents the graph shrinks worker cards to three rows so the whole tree stays visible.
- Agent detail: task, recent actions, token breakdown and the agent's todo list.
- A status line under the prompt that names what needs attention first.
- Tokens and estimated cost (`~$`) per agent and for the whole session; on a subscription, the plan usage limits instead.
- Plan progress in percent, taken from the todo list; per-agent progress from each subagent's own list.
- Markers for agents that are stuck (`!`), expensive (`▲`) or `unknown`.
- ASCII mode for terminals without box-drawing characters.
- Layouts for narrow terminals.

## Requirements

- Claude Code 2.1.302 or newer. agentview uses the mod API, and 2.1.302 is the version it was built and tested on.
- Node.js 20 or newer for the standalone CLI and for development; the plugin itself needs no Node.js.

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

In fullscreen, Claude Code docks plugin panes beside the transcript. agentview asks for the full terminal width, so the pane covers the transcript like a dialog, and `Esc` closes it. (`/usage` itself is a built-in dialog that plugins cannot open.) Without fullscreen the pane opens above the prompt, up to 30 rows. A size you drag the pane to wins over both requests.

**Tree view**

| Key | Action |
| --- | --- |
| `↑` `↓` | Select an agent |
| `⏎` | Open the details of the selected agent |
| `a` | Toggle between all agents and only active ones |
| `t` / `g` | Switch to the tree or the graph view |
| `Esc` | Close the dialog |

**Graph view**

| Key | Action |
| --- | --- |
| `p` / `n` | Select the previous or next agent |
| `d` | Open the details of the selected agent |
| `h` / `l` | Pan the worker columns left or right (shown only when some columns do not fit) |
| `z` | Cycle the card density: auto, full, compact |
| `a` | Toggle between all agents and only active ones |
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

## Standalone CLI

`agentview` also runs on its own, in a second terminal, and watches every Claude Code session on the machine. It reads the transcript files in `~/.claude/projects` (read-only), so it needs no plugin and works for sessions started anywhere.

```bash
npx github:damir-tahirovic/Claude-agent-viewer
```

Or install it once and run `agentview`:

```bash
git clone https://github.com/damir-tahirovic/Claude-agent-viewer.git
cd Claude-agent-viewer && npm install && npm install -g .
```

It opens on the session list: active sessions (running or waiting) first, then recent ones from the last 7 days. `⏎` opens a session as the full-screen tree, `⏎` on an agent opens its detail.

| Screen | ↑↓ | ←→ | Enter | Tab / `t` / `g` | Esc | q |
| --- | --- | --- | --- | --- | --- | --- |
| Session list | select session | nothing | open session | nothing | nothing | quit |
| Session (tree) | select agent | nothing | agent detail | `g` graph; `a` all / active agents | back to the list | quit |
| Session (graph) | select agent | scroll worker columns (also `h` / `l`) | agent detail | `t` tree, Tab toggles; `z` cycles the density; `a` all / active agents | back to the list | quit |
| Detail | previous / next agent | nothing | nothing | nothing | back to the session | quit |

The session screen opens as the tree; `g` or Tab switches to the same graph the plugin shows. The chosen view sticks when you open another session or a detail. On terminals narrower than 110 columns the graph folds into the tree plus one expanded card, and `←→` scrolls the worker columns only when some are hidden.

**Graph density.** `z` cycles `auto` → `full` → `compact`; the footer shows the current one. In `auto` the graph keeps full cards while every worker column and the height fit. Otherwise worker cards turn compact (three rows: status glyph and time on the border, the task title inside), as wide as lets all columns fit, down to 14 columns each; finished subtrees fold into chips if the height still overflows, and only below that width do the columns pan. Main and the selected agent always keep their full card. The plugin has the same `z` hotkey.

**Active agents only.** A long session piles up finished subagents. `a` (in the CLI, and the `show all` / `show active` button in the plugin) hides every subagent that finished more than 60 seconds ago; running, waiting and unknown agents stay, and so does every parent of a visible agent. The label says how many are hidden. The session totals in the header still count every agent. The choice sticks like the view and the density.

What it shows, and what it does not:

- **No cost.** A transcript does not say whether a session is billed by API key or by a plan, so the CLI never shows `~$`; the cost slot is `—`.
- **Output tokens of subagents are often `—`.** A transcript stores token usage while the answer is still streaming. Input and cache counts are already exact then, but the output count is not; the exact final count is written only for some answers (almost always for the main agent, rarely for subagents). agentview counts output only from the final record. When an agent has an answer without one, its output and in + out show `—`, and any total that includes it ends with `+` (for example `75.8k+`, meaning "at least"). The plugin inside a session gets exact counts from Claude Code and shows them.
- **`unknown`** means no new record for more than 60 seconds while the agent was running, for example a closed or killed Claude Code process.
- Resource use: it checks file sizes once per second, reads only new bytes, and redraws only lines that changed. With nothing running it writes nothing to the terminal (an idle screen refreshes its ages once a minute).

Options: `AGENTVIEW_ASCII=1` draws with ASCII only (also chosen automatically when the locale is not UTF-8). `AGENTVIEW_PROJECTS_DIR` reads transcripts from another folder. When the output is not a terminal (`agentview | cat`), it prints one snapshot of the session list and exits.

## What the numbers mean

- **TOK** is input plus output tokens of the agent. Cache tokens are not counted in it; the detail view shows them separately.
- **Cost (`~$`)** is an estimate, not billing data. It is computed from list prices per million tokens in `src/core/cost.ts`, read on 2026-10-18. A model without a known price counts as `$0`.

  | Model | Input | Output | Cache read | Cache write (5 min) |
  | --- | --- | --- | --- | --- |
  | `opus-5-5` | $4 | $20 | $0.20 | $5 |
  | `sonnet-5-5` | $2 | $10 | $0.20 | $2.50 |
  | `haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 |
  | `fable-5-1` | $10 | $50 | $0.25 | $12.50 |

- **`▲`** after a cost marks an expensive agent: at least $0.50, or at least 40% of the session's estimated cost when that is at least $0.05 and a second agent has cost too.
- **Billing.** Cost (`~$`) and `▲` are shown only when the session is billed per token through an API key. On a subscription (Claude Pro or Max) tokens are not billed one by one, so agentview hides all cost and shows the plan's usage limits in the header instead, for example `5h 71% · 7d 21%` (the five-hour and seven-day windows, as Claude Code reports them). The data comes from `$.session.usage()`, read once at session start and once after each main turn; a session with no limit readings after its first completed turn is treated as API billing. Until then billing is unknown, cost is hidden and the header shows `—` in its place.
- **`!`** after the time marks an agent that has been on the same action for more than 3 minutes.
- **`unknown`** means a subagent has sent no signal for more than 60 seconds and has no tool in flight. It becomes `running` again on its next signal. The main agent is never `unknown`.
- **Plan %** comes only from the main agent's todo list (done divided by total). Without a todo list it shows `—`. Subagents have their own progress; see [Progress](#progress).
- **Main** shows `done` between turns, and `running` again when the next turn starts.

## Progress

agentview shows a percentage or a count only when it comes from a real todo list. It never estimates progress from time, tokens or tool calls.

- **Plan %** in the header and the plan bar comes from the main agent's own todo list (`TodoWrite`, or `TaskCreate` and `TaskUpdate`): done items divided by all items.
- **Subagent progress** comes from that subagent's own todo list, from the same tools. It appears as a `PLAN` column in the tree (for example `3/5`), as ` · 3/5` on the agent's card in the graph, and as `progress 3/5 (60%)` in the detail header. The `PLAN` column shows only when at least one subagent has a list, and only from 100 columns up; main's cell is always `—` because main's plan has its own bar.
- **It is `—`** (or simply not shown) when the agent has no todo list. A subagent that never writes one stays without progress; there is no fallback guess. A finished agent keeps the last list it wrote.
- **`trackProgress`** (default off) asks subagents to keep such a list. When it is on, agentview appends one short sentence to every subagent prompt: `If you have a TodoWrite or TaskCreate tool, track your steps with it: write the list first, then mark each item in_progress and completed as you go.` The trade-off: it changes subagent behaviour slightly and costs a few tokens per subagent. The sentence is conditional because the engine does not tell agentview which agents have a todo tool. Resumed agents and workflow agents are left alone.
- **Some Claude Code builds have no todo tool.** Check with `claude -p "List the names of your tools"`: if neither `TodoWrite` nor `TaskCreate` is in the list, no agent can write a list, so every progress value stays `—` and `trackProgress` has no effect. That is correct, not a bug: agentview shows nothing rather than a guess.

## Configuration

Two options. `ascii` (default `false`): when it is on, the dialog is drawn with ASCII characters only. `trackProgress` (default `false`): asks subagents to keep a todo list, see [Progress](#progress). Set them from the plugin's configuration in Claude Code, or from your shell:

```bash
claude plugin configure agentview
```

`claude plugin configure` shows the options and which are unset; add `--values-stdin` to save values from a JSON object on stdin. You can also set them with `--config ascii=true` (or `trackProgress=true`) on `claude plugin install`, or under `pluginConfigs` in your Claude Code settings. Restart Claude Code after changing it.

## How it works

agentview keeps its layers strictly separate. Each layer depends only on the ones below it:

```text
hooks/      engine wiring only: register hooks, call adapters, read/write atoms. No logic.
src/mod/    translation between engine events and our AgentEvent; painting lines as <Text>.
src/view/   pure rendering: state -> rows -> lines in the "{codes|text}" format.
src/core/   pure domain: model, reducer, summaries, formatting, cost, progress.
```

The data comes from plugin hooks: tool calls, agent spawns, turn steps and the engine's agent list. The adapter turns them into events, the reducer folds them into a session state, and the view draws that state. agentview only observes; it does not change what your agents do.

To stay cheap, agentview batches the recorded events into one state update every 250 ms, writes nothing while the session is idle, and moves the spinner once a second (1 fps), and only while an agent is running.

Nothing leaves your machine. The plugin makes no network calls and has no runtime dependencies.

## Limitations

- The plugin works only inside the Claude Code session where it is installed; use the [standalone CLI](#standalone-cli) to watch all sessions.
- Plugins cannot rebind Tab and the arrow keys, so the graph view and the view switch use letter hotkeys.
- In the wide graph, agents nested deeper than grandchildren are not drawn; use the tree view (`t`) for deep hierarchies.
- The detail view is clipped, not reflowed, below 90 columns.
- The `waiting` status comes from the engine's agent list, so it is not always a permission prompt.
- Costs are estimates from list prices.

## Troubleshooting

- **Screen breaks into blocks and the terminal freezes (Tabby on AMD GPUs).** This is a GPU fault in the terminal's WebGL renderer, not in agentview: the kernel log shows `amdgpu: [gfxhub] page fault ... Process tabby` followed by a GPU ring reset. A large, colorful pane can make it more likely. Switch Tabby to the non-WebGL renderer (Settings → Terminal → Frontend → `xterm`, or `terminal.frontend: xterm` in `~/.config/tabby/config.yaml`) and restart Tabby. If it still happens, enable Settings → Window → "Disable GPU acceleration". Measured: an open pane with no work writes 0 bytes per second to the terminal.

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

- Publish to npm.
- A proper narrow layout for the detail view.

## Credits and license

MIT, © 2026 Damir Tahirovic. See [LICENSE](LICENSE).

Built with Claude Code: the main Opus session planned and reviewed the work, and Sonnet and Haiku subagents implemented it.
