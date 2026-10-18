# agentview

A live view of Claude Code agents and subagents for the terminal. Type `/agentview` and a dialog opens that shows the agent and subagent tree, what each agent is doing now, its tokens, estimated cost and plan progress. A one-line status under the prompt names the one thing that needs attention first (a waiting, stuck or failed agent), otherwise a count of running agents.

It is a mod (a Claude Code plugin with hooks and a pane). It observes the session; it does not change what the agents do.

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

## Install for development

```bash
claude --plugin-dir /path/to/agentview
```

Marketplace install is coming soon.

## Usage

- `/agentview` opens the dialog.
- `↑` / `↓` select an agent in the tree.
- `⏎` opens the details of the selected agent; the `◂ prev agent` / `next agent ▸` buttons step to the neighbouring agents.
- `Esc` goes back from details to the tree; `Esc` in the tree closes the dialog.
- Plugin option `ascii` (default off) draws the dialog with ASCII characters only.

## What the numbers mean

- **TOK**: input plus output tokens of the agent. Cache tokens are not counted here.
- **Cost (`~$`)**: an estimate computed from list prices per million tokens (`src/core/cost.ts`, source noted there). A model without a known price counts as `$0`. The `~` marks it as an estimate.
- **`▲`** after a cost: an expensive agent, at or above $0.50 or at least 40% of the session's estimated cost.
- **Plan %**: progress of the main agent's todo list only (done / total). With no todo list it shows `—`. Subagent todos are not used.
- **`unknown`**: a subagent that has sent no signal for 60 s. It becomes `running` again on its next signal. The main agent is never `unknown`.
- **`!`** after the time: a running agent that has been on the same action for more than 3 min.

## Development

```bash
npm install
npm test                      # core and view specs (node:test)
npm run typecheck
claude plugin validate .
claude plugin test .          # mod hooks tests
```

## Limitations

- Works only inside a Claude Code session for now. A standalone CLI is planned.
- Costs are estimates from list prices, not billing data.
- Plan progress exists only for the main agent's todo list.

## License

MIT. See [LICENSE](LICENSE).
