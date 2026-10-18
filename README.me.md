[English](README.md) | Crnogorski

# agentview

agentview je terminalski prikaz agenata i subagenata Claude Code-a uživo. Pokazuje ko je koga pokrenuo, šta svaki agent radi upravo sada, tokene i procijenjeni trošak po agentu, te napredak plana. Radi unutar vaše Claude Code sesije kao plugin: bez browsera, bez servera, bez Dockera.

## Snimci ekrana

Ovo su tekstualni mockupi iz dizajnerske reference u `docs/design/golden/`.

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

Prikaz stabla: svi agenti i subagenti, sa statusom, modelom, zadatkom, trenutnom radnjom, tokenima, troškom i vremenom.

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

Prikaz grafa: `main` na vrhu, ispod njega radnici, a između njih linije pokretanja.

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

Detalji agenta: cijeli zadatak, nedavne radnje, raspodjela tokena i agentova lista zadataka.

Mockupi prikazuju dizajn. U pluginu su savjeti u podnožju oni navedeni u odjeljku [Uputstvo](#uputstvo): `q` u dijalogu ne radi ništa, a prikaz grafa koristi `p`/`n` i `t`/`g`.

## Mogućnosti

- `/agentview` otvara dijalog uživo unutar sesije.
- Prikaz stabla i prikaz grafa agenata, a mijenjaju se tasterima `t` i `g`.
- Detalji agenta: zadatak, nedavne radnje, raspodjela tokena i agentova lista zadataka.
- Statusna linija ispod prompta koja prva navodi ono što traži pažnju.
- Tokeni i procijenjeni trošak (`~$`) po agentu i za cijelu sesiju.
- Napredak plana u procentima, uzet iz liste zadataka.
- Oznake za agente koji su zaglavljeni (`!`), skupi (`▲`) ili `unknown`.
- ASCII režim za terminale bez znakova za crtanje okvira.
- Rasporedi za uske terminale.

## Zahtjevi

- Claude Code 2.1.302 ili noviji. agentview koristi mod API, a 2.1.302 je verzija na kojoj je napravljen i testiran.
- Node.js 20 ili noviji treba samo za razvoj, ne i za korišćenje plugina.

## Instalacija

```text
/plugin install agentview --marketplace damir-tahirovic/Claude-agent-viewer
```

Claude Code zatim pita da li da doda marketplace; odgovorite `y`. Poslije toga traži opseg (scope); izaberite onaj koji želite. Ako to zatraži, ponovo pokrenite Claude Code.

Za razvoj klonirajte repozitorijum i učitajte ga direktno:

```bash
git clone https://github.com/damir-tahirovic/Claude-agent-viewer.git
claude --plugin-dir /path/to/Claude-agent-viewer
```

Ažuriranje i uklanjanje, iz shella:

```bash
claude plugin update agentview
claude plugin uninstall agentview
```

Da bi se ažuriranje primijenilo, potrebno je ponovo pokrenuti Claude Code.

## Uputstvo

Ukucajte `/agentview` da otvorite dijalog. Otvara se prikaz koji ste posljednji koristili (prvi put stablo), a izabran je agent `main`.

U fullscreen prikazu Claude Code kači plugin panele pored transkripta. agentview traži punu širinu terminala, pa panel prekriva transkript kao dijalog, a `Esc` ga zatvara. (`/usage` je ugrađeni dijalog koji plugini ne mogu otvoriti.) Bez fullscreen prikaza panel se otvara iznad prompta, do 30 redova. Veličina na koju sami povučete panel ima prednost nad oba zahtjeva.

**Prikaz stabla**

| Taster | Radnja |
| --- | --- |
| `↑` `↓` | Izbor agenta |
| `⏎` | Otvara detalje izabranog agenta |
| `t` / `g` | Prelazak na prikaz stabla ili grafa |
| `Esc` | Zatvara dijalog |

**Prikaz grafa**

| Taster | Radnja |
| --- | --- |
| `p` / `n` | Izbor prethodnog ili sljedećeg agenta |
| `d` | Otvara detalje izabranog agenta |
| `h` / `l` | Pomjera kolone radnika ulijevo ili udesno (vidljivo samo kad se neke kolone ne mogu prikazati) |
| `t` / `g` | Prelazak na prikaz stabla ili grafa |
| `Esc` | Zatvara dijalog |

**Prikaz detalja**

| Taster | Radnja |
| --- | --- |
| `◂ prev agent` / `next agent ▸` | Prelazak na susjednog agenta |
| `Esc` | Povratak na stablo ili graf |

**Statusna linija.** Linija ispod prompta prikazuje jednu poruku, izabranu po prioritetu:

1. Agent čeka: `◔ reviewer waiting · Bash: rm -rf dist · /agentview`.
2. Pokrenut agent je zaglavljen: `! write auth tests on "npm test" for 4m10s · /agentview`.
3. Agent nije uspio: `✗ <task> failed · error · /agentview`.
4. Plan je završen i svi pomoćni agenti su gotovi: `✓ all 7 agents done · 52.3k tok · ~$1.10 · 100%`.
5. Inače sažetak: `⠋ 4 running · 52.3k tok · 60%   /agentview`.

## Šta brojevi znače

- **TOK** je zbir ulaznih i izlaznih tokena agenta. Cache tokeni se u njemu ne broje; prikaz detalja ih pokazuje odvojeno.
- **Trošak (`~$`)** je procjena, a ne podatak o naplati. Računa se iz cjenovnika po milion tokena u `src/core/cost.ts`, očitanog 2026-10-18. Model bez poznate cijene računa se kao `$0`.

  | Model | Input | Output | Cache read | Cache write (5 min) |
  | --- | --- | --- | --- | --- |
  | `opus-5-5` | $4 | $20 | $0.20 | $5 |
  | `sonnet-5-5` | $2 | $10 | $0.20 | $2.50 |
  | `haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 |
  | `fable-5-1` | $10 | $50 | $0.25 | $12.50 |

- **`▲`** poslije troška označava skupog agenta: najmanje $0.50 ili najmanje 40% procijenjenog troška sesije.
- **`!`** poslije vremena označava agenta koji je duže od 3 minuta na istoj radnji.
- **`unknown`** znači da subagent nije poslao signal duže od 60 sekundi i da nema alata u toku. Na sljedeći signal ponovo postaje `running`. Glavni agent nikad nije `unknown`.
- **Plan %** dolazi samo iz liste zadataka glavnog agenta (završeno podijeljeno sa ukupno). Bez liste zadataka prikazuje `—`. Liste zadataka subagenata se za to ne koriste.
- **Main** prikazuje `done` između dva kruga (turn-a), a čim počne sljedeći ponovo je `running`.

## Podešavanje

Jedna opcija, `ascii` (podrazumijevano `false`). Kad je uključena, dijalog se crta samo ASCII znakovima. Podesite je u konfiguraciji plugina u Claude Code-u ili iz shella:

```bash
claude plugin configure agentview
```

`claude plugin configure` prikazuje opcije i koje nisu postavljene; dodajte `--values-stdin` da sačuvate vrijednosti iz JSON objekta sa standardnog ulaza. Možete je postaviti i sa `--config ascii=true` pri `claude plugin install`, ili pod `pluginConfigs` u podešavanjima Claude Code-a. Poslije promjene ponovo pokrenite Claude Code.

## Kako radi

agentview strogo razdvaja slojeve. Svaki sloj zavisi samo od onih ispod sebe:

```text
hooks/      engine wiring only: register hooks, call adapters, read/write atoms. No logic.
src/mod/    translation between engine events and our AgentEvent; painting lines as <Text>.
src/view/   pure rendering: state -> rows -> lines in the "{codes|text}" format.
src/core/   pure domain: model, reducer, summaries, formatting, cost, progress.
```

Podaci dolaze iz hook-ova plugina: poziva alata, pokretanja agenata, koraka kruga i engine-ove liste agenata. Adapter ih pretvara u događaje, reducer ih slaže u stanje sesije, a prikaz crta to stanje. agentview samo posmatra; ne mijenja ono što vaši agenti rade.

Da bi bio jeftin, agentview skuplja zabilježene događaje u jedno ažuriranje stanja na svakih 250 ms, ne piše ništa dok je sesija neaktivna, a spinner pomjera jednom u sekundi (1 fps), i to samo dok neki agent radi.

Ništa ne napušta vaš računar. Plugin ne šalje mrežne pozive i nema runtime zavisnosti.

## Ograničenja

- Radi samo unutar Claude Code sesije u kojoj je instaliran. Samostalni CLI za sve sesije je planiran (Faza 2).
- Pluginovi ne mogu promijeniti Tab i strelice, zato prikaz grafa i prebacivanje prikaza koriste slovne prečice.
- U širokom grafu agenti ugniježđeni dublje od unuka nisu nacrtani; za duboke hijerarhije koristite prikaz stabla (`t`).
- Prikaz detalja se ispod 90 kolona siječe, a ne preslaže.
- Status `waiting` dolazi iz engine-ove liste agenata, pa nije uvijek zahtjev za dozvolu.
- Troškovi su procjene iz cjenovnika.

## Razvoj

```bash
npm install
npm test                  # core and view tests (node:test)
npm run typecheck
claude plugin validate .
claude plugin test .      # mod tests
```

Prikaz se testira prema zlatnim (golden) fajlovima u `docs/design/golden/`, nastalim iz dizajnerske specifikacije u `docs/design/` (`tui-spec.txt`, `graph-spec.txt` i njihovi generatori). Neslaganje je greška u kodu, a ne u fajlu. Standardi koda nalaze se u [CLAUDE.md](CLAUDE.md).

## Plan razvoja

- Faza 2: samostalni `agentview` CLI koji prati sve sesije.
- Objava na npm.
- Pravi uski raspored za prikaz detalja.

## Zasluge i licenca

MIT, © 2026 Damir Tahirovic. Vidi [LICENSE](LICENSE).

Napravljeno uz Claude Code: glavna Opus sesija je planirala i pregledala rad, a Sonnet i Haiku subagenti su ga implementirali.
