# agentview Phase 1b (graph view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the spec's graph view to `/agentview`. Each agent is a card; edges go from parent to child, and the edge style shows the child's status. The view can be switched to and from the tree. Below ~110 columns it folds into the "tree plus one expanded card" layout.

**Architecture:** The pure renderer `src/view/graph/*` is a byte-exact port of the spec's graph generator (`docs/design/graph-generator.js`). Its golden tests compare against `docs/design/golden/graph/*.spec.txt`, which are read with `node:fs` in tests only. It reuses `Row` (from `src/view/rows.ts`) as the agent record and builds the node tree from the rows' depths. The mod adds a view mode (`tree` | `graph`), toggle Buttons, and graph navigation Buttons.

**Tech Stack:** As in Phase 1. TypeScript, the Claude Code mod API (2.1.302), `node:test` + `tsx`, `claude plugin test`.

**Spec:** `docs/design/graph-spec.txt` (screens 0–5e and the rules at the end), the maintainer's local tracker (not in this repo), §3.5 "Graph prikaz", and the code standards in `CLAUDE.md`. For the mod API, see the verified facts carried from Phase 1 in `docs/phase1-followups.md`. The engine types live in the bundled plugin-authoring types file named in each task's dispatch.

## Global Constraints

- `CLAUDE.md` overrides the snippets in this plan. Use readonly types, no `any`, descriptive names, and doc comments on exports. Keep a `(spec <fn>)` comment on every ported function.
- The renderer output is byte-identical to the goldens. Never edit golden files.
- `src/view/graph/*` imports only from `src/core` and `src/view`. Tests may use `node:fs` to read goldens.
- Ruling: the graph card's waiting text in the port stays `◔ waiting for permission`, to match golden 5b. Add an option `waitingText` (default as in the generator). The mod passes `'◔ waiting'`, consistent with the Phase 1 ruling.
- Ruling: the engine walks Buttons with Tab and the arrow keys, so a plugin cannot bind Tab, ←, → or ↑/↓ to custom meanings. Therefore:
  - tree ↔ graph is switched by two header Buttons, `tree` and `graph`, with hotkeys `t` and `g`;
  - in the graph view, the agent cards are not Buttons, because a Button cannot span a 2D card. A footer row of plain Buttons does the work instead: `◂ prev`, `next ▸`, `⏎ details`, plus, only when columns are hidden, `◂◂ cols` and `cols ▸▸`;
  - prev and next follow tree (DFS) order;
  - the hints in the graph footer must describe these real controls.
- Commit trailer: `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>`.

## File Structure

```
src/view/graph/canvas.ts   Canvas: put/text/runs/lines → "{codes|text}" lines (spec Cv)
src/view/graph/card.ts     drawCard, drawChip (spec card, chip)
src/view/graph/layout.ts   GraphNode, buildGraphTree(rows), layoutWide (spec layoutH), layoutNarrow (spec layoutV + pre2)
src/view/graph/frame.ts    graphFrame (spec frame), toGraphAscii (spec asc)
src/view/graph/render.ts   renderGraph(opts) (spec graph), renderGraphNarrow(opts) (spec compact)
tests/view/graph/*.spec.ts
tests/fixtures/graph-fixtures.ts   rows and trees for screens 0–5e, copied literally from the generator
src/mod/pane-view.ts       + graph mode
hooks/register.tsx         + mode toggle, graph footer buttons
types/index.d.ts           + ui.mode, ui.graphCol
```

---

### Task 1: Canvas, card and chip

**Files:** create `src/view/graph/canvas.ts`, `src/view/graph/card.ts`, `tests/view/graph/card.spec.ts`

**Interfaces (produces):**
```ts
export class Canvas { constructor(width: number, height: number); put(x, y, ch, codes?); text(x, y, s, codes?); runs(x, y, runs: ReadonlyArray<readonly [string, string]>); lines(height: number): string[] }
export type CardOpts = { readonly isMain?: boolean; readonly isSelected?: boolean; readonly plan?: Plan | null; readonly sessionCost: number; readonly isRich?: boolean; readonly waitingText?: string; readonly error?: string }
export const drawCard: (canvas: Canvas, x: number, y: number, width: number, row: Row, opts: CardOpts) => number   // returns height
export const drawChip: (canvas: Canvas, x: number, y: number, width: number, row: Row, hiddenCount: number) => number
```

- [ ] **Step 1: Failing test.** Golden 0 (legend). Build a 112×12 canvas exactly as generator lines 223–233 do: `card(lg, 1, 0, 34, {...base()[3], st:'running'}, {})` plus the legend texts. Assert `canvas.lines(11)` deepEquals the lines of `docs/design/golden/graph/0.spec.txt`, read with `readFileSync(...).split('\n')` with the trailing empty line removed. Put the generator's `base()` rows (graph-generator.js lines 53–61) into `tests/fixtures/graph-fixtures.ts` as `graphBaseRows()`, reusing the `Row` shape; `err` goes into an optional field.
- [ ] **Step 2:** Run `npm test`; expect FAIL. **Step 3:** Port `Cv`, `card` and `chip` (generator lines 36–51, 66–106) byte-for-byte, with descriptive names. Reuse `fmtK`, `fmtT` and `fmtCost` from `src/core/format.ts`, and `fitText` semantics. Note: the graph generator's `fit` does not pad (line 34), unlike the tree's `fit`, so add `fitNoPad` to `src/view/lines.ts`. **Step 4:** Run; expect PASS. **Step 5:** Commit `feat(view): graph canvas, card and chip`.

### Task 2: Wide layout and frame (screens 1, 2, 4, 5a–5e)

**Files:** create `src/view/graph/layout.ts` (wide part), `src/view/graph/frame.ts`, `src/view/graph/render.ts`, `tests/view/graph/render.spec.ts`; extend `tests/fixtures/graph-fixtures.ts`

**Interfaces (produces):**
```ts
export type GraphNode = { readonly row: Row; readonly kids: ReadonlyArray<GraphNode>; readonly isCollapsed?: boolean }
export const buildGraphTree: (rows: ReadonlyArray<Row>, collapsedIds?: ReadonlySet<string>) => GraphNode   // rows in DFS order with depth d
export type GraphOpts = { readonly width: number; readonly tree: GraphNode; readonly selectedId?: string; readonly plan?: Plan | null; readonly sessionId?: string; readonly ended?: string; readonly note?: ReadonlyArray<readonly [string, string]>; readonly middle?: string; readonly hints?: ReadonlyArray<readonly [string, string]>; readonly ascii?: boolean; readonly columns?: number; readonly firstColumn?: number; readonly waitingText?: string; readonly spin?: string }
export const renderGraph: (opts: GraphOpts) => string[]
```

- [ ] **Step 1: Failing tests.** One test per screen: 1, 2, 4, 5a, 5b, 5c, 5d and 5e. For each, build the input exactly as the generator's `add(...)` call does (lines 234–244). That includes `failed`, `ended`, `empty`, `waitFix()` and the 16-agent `mt` tree from lines 205–214, copied literally into the fixtures. Assert that the output deepEquals the golden file lines. Selection is by row `id`, not by object identity, so give the fixture rows ids.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Port `layoutH`, `frame`, `graph` and `asc` (lines 108–144, 174–200) byte-for-byte. `selectedId` replaces the object-identity checks. `spin` (default `'⠋'`) replaces `SP` for running cards and counts. **Step 4:** Run; expect PASS (all 8 screens). **Step 5:** Commit `feat(view): wide graph layout matching graph goldens`.

### Task 3: Narrow fold (screen 3)

**Files:** modify `src/view/graph/layout.ts` (narrow part) and `src/view/graph/render.ts`; test `tests/view/graph/narrow.spec.ts`

**Interfaces (produces):** `export const renderGraphNarrow: (opts: Omit<GraphOpts, 'columns' | 'firstColumn' | 'middle'> & { readonly rows: ReadonlyArray<Row> }) => string[]`

- [ ] **Step 1:** Write a failing test that golden 3 equals `renderGraphNarrow({ width: 80, rows: graphBaseRows(), selectedId: <row 3 id>, plan, hints: [['↑↓','select'],['⏎','details'],['tab','tree'],['esc','close']] })`. **Step 2:** Run; expect FAIL. **Step 3:** Port `pre2`, `layoutV` and `compact` (lines 145–173, 201–204). **Step 4:** Run; expect PASS. **Step 5:** Commit `feat(view): narrow graph fold`.

### Task 4: Graph mode in the pane

**Files:** modify `src/mod/pane-view.ts`, `src/mod/pane-keys.ts`, `hooks/register.tsx`, `types/index.d.ts`; tests `tests/mod/pane-view.spec.ts`, `tests/mod/pane-keys.spec.ts`, `hooks/register.test.ts`

Rules:
- Add `mode: 'tree' | 'graph'` (default `'tree'`) and `graphCol: number` (default 0) to the ui atom. `command.run` keeps the last mode.
- The header row gets two plain Buttons, `tree` and `graph`, with hotkeys `t` and `g`. The active one is drawn inverse+bold, like the spec's header toggle.
- Graph mode at `bodyColumns >= 110`:
  - render `renderGraph`, with `frame` borders dropped the same way as the tree (frameless: strip the first and last column, and the top and bottom border lines, then prepend our pane header);
  - `width = bodyColumns + 2`;
  - when the workers don't fit, set `columns = floor((width - 4) / 40)` and `firstColumn = graphCol`, and set `middle` to `◂ workers a–b of n ▸`;
  - finished (`done`) subtrees collapse into chips when the content height would exceed the viewport rows;
  - `waitingText: '◔ waiting'`.
- Graph mode below 110 columns: render `renderGraphNarrow` with the same frameless treatment.
- Footer Buttons in graph mode:
  - `◂ prev`, `next ▸`: step the selection in tree order with `stepId`;
  - `⏎ details`: open the existing detail view, and Esc returns to graph mode;
  - `◂◂` / `▸▸`: pan `graphCol`, shown only when columns are hidden.
- Footer hints (text) must match these controls: `◂ ▸ select   ⏎ details   t/g view   esc close`.
- Writes happen only in onPress handlers and in ui.focus, never in ui.render.
- ASCII: run the lines through `toGraphAscii`. The ascii flag (userConfig) and `toPlainAscii` for the header work as in Phase 1.

Tests:
- pure pane-view tests: the mode switch, the 160- and 80-column graph, the hidden-column pan, and that no line is wider than the body;
- pure stepping tests;
- engine test: mount the Pane, press `graph` and see a card border `╭─ main`, press `next ▸` and see the selection move, press `tree` and be back to the tree header.

Run the full suite and `claude plugin validate` and `claude plugin test`. Commit `feat(mod): graph view with tree/graph toggle`.

### Task 5: Docs and version

**Files:** `README.md`, `.claude-plugin/plugin.json` (version 0.2.0), `package.json` (version 0.2.0)

- [ ] Add a README section "Graph view", with the 120-column graph mockup (plain text of golden 2, from `╭` to `╰`) and the controls. Bump the version to 0.2.0. Commit `docs: graph view; 0.2.0`.
