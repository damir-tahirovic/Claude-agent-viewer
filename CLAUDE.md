# agentview: code standards

Every change in this repository follows these rules. They apply to code written by the main session and by every subagent. When a rule conflicts with a plan step, the rule wins: adapt the step and say so in the commit message.

Project tracker (Bosnian): the maintainer's local tracker, outside the repository. Current plan: `docs/superpowers/plans/`.

## Language and toolchain

- TypeScript 5.x with `strict: true`, ES modules (`"type": "module"`), target ES2022. Runtime is Node ≥ 20 for tooling and tests; the mod runs in the Claude Code engine (no DOM, no Node).
- No runtime dependencies. Dev dependencies only: `typescript`, `tsx`, `@types/node`. Add one only with a reason in the commit message.
- Formatting: 2-space indent, single quotes, no semicolons, trailing commas in multi-line literals, max line length ~110. Match the surrounding file.
- `npm test` (core and view) and `claude plugin test .` (mod) must pass before every commit. `npm run typecheck` must report zero errors.

## Structure (layers only depend downward)

```
hooks/      engine wiring only: register hooks, call adapters, read/write atoms. No logic.
src/mod/    translation between engine events and our AgentEvent; painting lines as <Text>.
src/view/   pure rendering: state → rows → lines in the "{codes|text}" format.
src/core/   pure domain: model, reducer, summaries, formatting, cost, progress.
tests/      mirrors src/: tests/core, tests/view, tests/mod, tests/fixtures.
```

- `src/core` imports nothing outside `src/core`. `src/view` imports only `src/core` and `src/view`. `src/mod` may import `src/core` and `src/view`. Only `hooks/` imports `claude-code`.
- `src/core` and `src/view` never use Node APIs, globals like `Date.now()`, or randomness. Time is always passed in as an argument (`at`, `now`).
- One responsibility per file. A file over ~250 lines is a signal to split it.
- One exported concept per name: the same term always means the same thing (`agent`, `row`, `line`, `event`, `tokens`). No synonym rotation.

## TypeScript rules

- No `any`. Use `unknown` and narrow it. Engine event types come from `claude-code`; never cast them to `any`. If a type is missing, write a narrow local type and say why in a comment.
- Prefer `type` aliases for data and discriminated unions for variants (`kind` field). Exhaustive `switch` over unions; the `default` branch assigns to `never`.
- Data is immutable: `readonly` fields and `ReadonlyArray` in domain types, and no mutation of inputs. Reducers return new objects.
- Pure functions by default. Side effects live only in `hooks/`.
- Named exports only, no default exports. Use `import type` for type-only imports.
- `const` over `let`; no `var`. Arrow functions for module-level helpers.
- Errors: never throw across a hook boundary. Hooks catch, log once through `$.ui.log` in debug, and always call `next(e)`.

## Naming

- Descriptive names: `visibleLength`, `padRight`, `fitText`, `colorize`. Never single letters, except loop indices and the spec's `{codes|text}` color codes.
- Code ported from `docs/design/spec-generator.js` gets readable names, but its arithmetic and output stay byte-for-byte identical (the golden tests prove it). Keep a comment naming the generator function each port came from.
- Files: `kebab-case.ts`. Types: `PascalCase`. Functions and values: `camelCase`. Constants: `UPPER_SNAKE_CASE`.
- Booleans read as questions: `isStuck`, `hasPlan`, `isExpensive`.

## Tests

- TDD: a failing test first, then the minimal code, then a refactor.
- Core and view tests: `tests/**/*.spec.ts`, run with `node:test` + `node:assert/strict`. Mod tests: `hooks/*.test.ts`, run with `claude plugin test`. Never mix the two runners.
- UI output is tested against the golden fixtures (`src/view/spec-golden.ts`, generated; never edit it). A mismatch is a bug in our code, not in the fixture.
- One behavior per test; the test name says the behavior.

## Comments and docs

- Comments say why, not what. Every exported function gets a one-line doc comment.
- UI text, code, comments, commits and the README are in English. Notes in the maintainer's local tracker are in Bosnian.

## Git

- Small commits, one task or one fix each. Conventional Commits: `feat(core): …`, `fix(view): …`, `test: …`, `docs: …`, `chore: …`.
- End every commit message with a `Co-Authored-By:` line naming the model that actually wrote the commit (e.g. `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).
- After finishing a plan task, check it off in the maintainer's local tracker (§4) with a one-line note, and add a line to §7.
