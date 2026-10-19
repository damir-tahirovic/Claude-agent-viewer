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
- Tokeni i procijenjeni trošak (`~$`) po agentu i za cijelu sesiju; na pretplati umjesto toga ograničenja korišćenja plana.
- Napredak plana u procentima, uzet iz liste zadataka; napredak svakog agenta iz njegove vlastite liste.
- Oznake za agente koji su zaglavljeni (`!`), skupi (`▲`) ili `unknown`.
- ASCII režim za terminale bez znakova za crtanje okvira.
- Rasporedi za uske terminale.

## Zahtjevi

- Claude Code 2.1.302 ili noviji. agentview koristi mod API, a 2.1.302 je verzija na kojoj je napravljen i testiran.
- Node.js 20 ili noviji za samostalni CLI i za razvoj; sam plugin ne treba Node.js.

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
| `a` | Prebacuje između svih agenata i samo aktivnih |
| `t` / `g` | Prelazak na prikaz stabla ili grafa |
| `Esc` | Zatvara dijalog |

**Prikaz grafa**

| Taster | Radnja |
| --- | --- |
| `p` / `n` | Izbor prethodnog ili sljedećeg agenta |
| `d` | Otvara detalje izabranog agenta |
| `h` / `l` | Pomjera kolone radnika ulijevo ili udesno (vidljivo samo kad se neke kolone ne mogu prikazati) |
| `z` | Mijenja gustinu kartica: auto, puna, kompaktna |
| `a` | Prebacuje između svih agenata i samo aktivnih |
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

## Samostalni CLI

`agentview` radi i samostalno, u drugom terminalu, i prati sve Claude Code sesije na računaru. Čita transcript fajlove u `~/.claude/projects` (samo čitanje), pa mu ne treba plugin i radi za sesije pokrenute bilo gdje.

```bash
npx github:damir-tahirovic/Claude-agent-viewer
```

Ili ga instalirajte jednom i pokrećite sa `agentview`:

```bash
git clone https://github.com/damir-tahirovic/Claude-agent-viewer.git
cd Claude-agent-viewer && npm install && npm install -g .
```

Otvara se lista sesija: prvo aktivne (rade ili čekaju), pa skorašnje iz zadnjih 7 dana. `⏎` otvara sesiju kao stablo preko cijelog ekrana, `⏎` na agentu otvara njegove detalje.

| Ekran | ↑↓ | ←→ | Enter | Tab / `t` / `g` | Esc | q |
| --- | --- | --- | --- | --- | --- | --- |
| Lista sesija | izbor sesije | ništa | otvori sesiju | ništa | ništa | izlaz |
| Sesija (stablo) | izbor agenta | ništa | detalji agenta | `g` graf; `a` svi / aktivni agenti | nazad na listu | izlaz |
| Sesija (graf) | izbor agenta | pomjeranje kolona radnika (i `h` / `l`) | detalji agenta | `t` stablo, Tab prebacuje; `z` mijenja gustinu; `a` svi / aktivni agenti | nazad na listu | izlaz |
| Detalji | prethodni / sljedeći agent | ništa | ništa | ništa | nazad na sesiju | izlaz |

Ekran sesije se otvara kao stablo; `g` ili Tab prebacuje na isti graf koji prikazuje plugin. Izabrani prikaz ostaje kad otvorite drugu sesiju ili detalje. Na terminalima užim od 110 kolona graf se slaže u stablo i jednu otvorenu karticu, a `←→` pomjera kolone radnika samo kad su neke skrivene.

**Samo aktivni agenti.** Duga sesija skupi mnogo završenih subagenata. `a` (u CLI-ju, a u pluginu dugme `show all` / `show active`) sakriva svakog subagenta koji je završio prije više od 60 sekundi; agenti koji rade, čekaju ili su nepoznati ostaju, kao i roditelj svakog vidljivog agenta. Oznaka kaže koliko ih je sakriveno. Zbirovi u zaglavlju i dalje broje sve agente. Izbor se pamti kao prikaz i gustina.

**Gustina grafa.** `z` kruži `auto` → `full` → `compact`; podnožje prikazuje trenutnu. U `auto` režimu graf zadržava pune kartice dok god staju sve kolone radnika i visina. Inače kartice radnika postaju kompaktne (tri reda: znak statusa i vrijeme u okviru, naziv zadatka unutra), onoliko široke da sve kolone stanu, najmanje 14 kolona; ako visina i dalje prelazi, završena podstabla se slažu u čipove, a tek kad ni to ne stane kolone se pomjeraju. Main i izabrani agent uvijek zadržavaju punu karticu. Plugin ima istu prečicu `z`.

Šta prikazuje, a šta ne:

- **Nema cijene.** Transcript ne kaže da li se sesija plaća API ključem ili pretplatom, pa CLI nikad ne prikazuje `~$`; mjesto za cijenu je `—`.
- **Output tokeni subagenata su često `—`.** Transcript bilježi potrošnju tokena dok odgovor još stiže. Input i cache su tada već tačni, a output nije; tačan konačni broj se upiše samo za neke odgovore (skoro uvijek za glavnog agenta, rijetko za subagente). agentview broji output samo iz konačnog zapisa. Kad agent ima odgovor bez njega, njegov output i in + out su `—`, a svaki zbir koji ga uključuje završava sa `+` (npr. `75.8k+`, znači "najmanje"). Plugin unutar sesije dobija tačne brojeve od Claude Code-a i prikazuje ih.
- **`unknown`** znači da nema novog zapisa duže od 60 sekundi dok je agent radio, npr. zatvoren ili ubijen Claude Code proces.
- Potrošnja resursa: jednom u sekundi provjeri veličine fajlova, čita samo nove bajtove i ponovo crta samo promijenjene redove. Kad ništa ne radi, ne piše ništa na terminal (miran ekran osvježi starost sesija jednom u minuti).

Opcije: `AGENTVIEW_ASCII=1` crta samo ASCII znakovima (bira se i automatski kad locale nije UTF-8). `AGENTVIEW_PROJECTS_DIR` čita transcripte iz drugog foldera. Kad izlaz nije terminal (`agentview | cat`), ispiše jedan snimak liste sesija i završi.

## Šta brojevi znače

- **TOK** je zbir ulaznih i izlaznih tokena agenta. Cache tokeni se u njemu ne broje; prikaz detalja ih pokazuje odvojeno.
- **Trošak (`~$`)** je procjena, a ne podatak o naplati. Računa se iz cjenovnika po milion tokena u `src/core/cost.ts`, očitanog 2026-10-18. Model bez poznate cijene računa se kao `$0`.

  | Model | Input | Output | Cache read | Cache write (5 min) |
  | --- | --- | --- | --- | --- |
  | `opus-5-5` | $4 | $20 | $0.20 | $5 |
  | `sonnet-5-5` | $2 | $10 | $0.20 | $2.50 |
  | `haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 |
  | `fable-5-1` | $10 | $50 | $0.25 | $12.50 |

- **`▲`** poslije troška označava skupog agenta: najmanje $0.50 ili najmanje 40% procijenjenog troška sesije, kada je on barem $0.05 i kada i drugi agent ima trošak.
- **Naplata.** Trošak (`~$`) i `▲` prikazuju se samo kada se sesija naplaćuje po tokenu preko API ključa. Na pretplati (Claude Pro ili Max) tokeni se ne naplaćuju pojedinačno, pa agentview sakriva sav trošak i u zaglavlju prikazuje ograničenja korišćenja plana, na primjer `5h 71% · 7d 21%` (petosatni i sedmodnevni prozor, kako ih javlja Claude Code). Podaci dolaze iz `$.session.usage()`, očitanog jednom pri startu sesije i jednom poslije svakog glavnog turna; sesija bez očitanja ograničenja poslije prvog završenog turna smatra se API naplatom. Do tada naplata nije poznata, trošak je skriven, a zaglavlje umjesto njega prikazuje `—`.
- **`!`** poslije vremena označava agenta koji je duže od 3 minuta na istoj radnji.
- **`unknown`** znači da subagent nije poslao signal duže od 60 sekundi i da nema alata u toku. Na sljedeći signal ponovo postaje `running`. Glavni agent nikad nije `unknown`.
- **Plan %** dolazi samo iz liste zadataka glavnog agenta (završeno podijeljeno sa ukupno). Bez liste zadataka prikazuje `—`. Subagenti imaju vlastiti napredak; vidi [Napredak](#napredak).
- **Main** prikazuje `done` između dva kruga (turn-a), a čim počne sljedeći ponovo je `running`.

## Napredak

agentview prikazuje procenat ili broj samo kada dolazi iz prave liste zadataka. Napredak nikad ne procjenjuje iz vremena, tokena ili broja poziva alata.

- **Plan %** u zaglavlju i traka plana dolaze iz liste zadataka glavnog agenta (`TodoWrite`, ili `TaskCreate` i `TaskUpdate`): završene stavke podijeljene sa svim stavkama.
- **Napredak subagenta** dolazi iz njegove vlastite liste zadataka, preko istih alata. Prikazuje se kao kolona `PLAN` u stablu (na primjer `3/5`), kao ` · 3/5` na kartici agenta u grafu i kao `progress 3/5 (60%)` u zaglavlju detalja. Kolona `PLAN` se vidi samo kad bar jedan subagent ima listu, i to od 100 kolona naviše; ćelija glavnog agenta je uvijek `—` jer glavni plan ima svoju traku.
- **Prikazuje se `—`** (ili se ništa ne prikazuje) kad agent nema listu zadataka. Subagent koji je nikad ne napiše ostaje bez napretka; nema rezervne procjene. Završeni agent zadržava posljednju listu koju je napisao.
- **`trackProgress`** (podrazumijevano isključeno) traži od subagenata da vode takvu listu. Kad je uključeno, agentview svakom promptu subagenta dodaje jednu kratku rečenicu: `If you have a TodoWrite or TaskCreate tool, track your steps with it: write the list first, then mark each item in_progress and completed as you go.` Cijena: blago mijenja ponašanje subagenata i košta nekoliko tokena po subagentu. Rečenica je uslovna jer engine ne kaže agentview-u koji agenti imaju alat za listu. Nastavljeni (resumed) agenti i workflow agenti se ne diraju.
- **Neke verzije Claude Code-a nemaju alat za listu zadataka.** Provjerite sa `claude -p "List the names of your tools"`: ako u listi nema ni `TodoWrite` ni `TaskCreate`, nijedan agent ne može napisati listu, pa svaki napredak ostaje `—`, a `trackProgress` nema efekta. To je ispravno, nije greška: agentview radije ne prikaže ništa nego procjenu.

## Podešavanje

Dvije opcije. `ascii` (podrazumijevano `false`): kad je uključena, dijalog se crta samo ASCII znakovima. `trackProgress` (podrazumijevano `false`): traži od subagenata da vode listu zadataka, vidi [Napredak](#napredak). Podesite ih u konfiguraciji plugina u Claude Code-u ili iz shella:

```bash
claude plugin configure agentview
```

`claude plugin configure` prikazuje opcije i koje nisu postavljene; dodajte `--values-stdin` da sačuvate vrijednosti iz JSON objekta sa standardnog ulaza. Možete ih postaviti i sa `--config ascii=true` (ili `trackProgress=true`) pri `claude plugin install`, ili pod `pluginConfigs` u podešavanjima Claude Code-a. Poslije promjene ponovo pokrenite Claude Code.

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

- Plugin radi samo unutar Claude Code sesije u kojoj je instaliran; za praćenje svih sesija koristite [samostalni CLI](#samostalni-cli).
- Pluginovi ne mogu promijeniti Tab i strelice, zato prikaz grafa i prebacivanje prikaza koriste slovne prečice.
- U širokom grafu agenti ugniježđeni dublje od unuka nisu nacrtani; za duboke hijerarhije koristite prikaz stabla (`t`).
- Prikaz detalja se ispod 90 kolona siječe, a ne preslaže.
- Status `waiting` dolazi iz engine-ove liste agenata, pa nije uvijek zahtjev za dozvolu.
- Troškovi su procjene iz cjenovnika.

## Rješavanje problema

- **Ekran se raspadne u kockice i terminal se zamrzne (Tabby na AMD grafičkim karticama).** To je greška GPU-a u WebGL rendereru terminala, ne u agentviewu: kernel log pokazuje `amdgpu: [gfxhub] page fault ... Process tabby`, pa reset GPU-a. Veliki šareni prozor to čini vjerovatnijim. Prebacite Tabby na renderer bez WebGL-a (Settings → Terminal → Frontend → `xterm`, ili `terminal.frontend: xterm` u `~/.config/tabby/config.yaml`) i restartujte Tabby. Ako se i dalje dešava, uključite Settings → Window → "Disable GPU acceleration". Izmjereno: otvoren prozor bez posla piše 0 bajtova u sekundi na terminal.

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

- Objava na npm.
- Pravi uski raspored za prikaz detalja.

## Zasluge i licenca

MIT, © 2026 Damir Tahirovic. Vidi [LICENSE](LICENSE).

Napravljeno uz Claude Code: glavna Opus sesija je planirala i pregledala rad, a Sonnet i Haiku subagenti su ga implementirali.
