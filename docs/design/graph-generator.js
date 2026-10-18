
class Component extends DCLogic {
  state = { theme: 'dark', mode: 'color', copied: '' };
  renderVals() {
    const TH = {
      dark: { bg: '#1c1b1a', fg: '#d6d3d1', g: '#23d18b', r: '#f14c4c', y: '#e2b93d', b: '#4f9cf5', m: '#c678dd', c: '#2bbac5' },
      light: { bg: '#fbfaf9', fg: '#24292f', g: '#1a7f37', r: '#cf222e', y: '#9a6700', b: '#0550ae', m: '#8250df', c: '#0a7c86' }
    };
    const th = TH[this.state.theme], mode = this.state.mode;
    const strip = s => s.replace(/\{[a-zA-Z]+\|([^{}]*)\}/g, '$1');
    const vl = s => [...strip(s)].length;
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const toHtml = (s, T, m) => {
      const re = /\{([a-zA-Z]+)\|([^{}]*)\}/g; let out = '', i = 0, x;
      while ((x = re.exec(s))) {
        out += esc(s.slice(i, x.index)); i = re.lastIndex; const cs = x[1], t = esc(x[2]);
        if (m === 'plain') { out += t; continue; }
        if (m === 'spec') { out += `<span style="opacity:.5">{${cs}|</span>${t}<span style="opacity:.5">}</span>`; continue; }
        let st = '';
        for (const ch of cs) {
          if ('grybmc'.includes(ch)) st += `color:${T[ch]};`;
          else if (ch === 'd') st += 'opacity:.55;';
          else if (ch === 'B') st += 'font-weight:700;';
          else if (ch === 'I') st += `background:${T.fg};color:${T.bg};`;
        }
        out += `<span style="${st}">${t}</span>`;
      }
      return out + esc(s.slice(i));
    };
    const SP = '⠋';
    const fmtK = n => n < 1000 ? String(n) : n < 100000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n / 1000) + 'k';
    const fmtT = s => s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's' : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm';
    const $ = n => '~$' + n.toFixed(2);
    const fit = (t, w) => { const a = [...t]; return a.length <= w ? t : a.slice(0, Math.max(0, w - 1)).join('') + '…'; };
    const asc = s => s.replace(/[╭╮╰╯├┤┬┴┼└┣┗╔╗╚╝]/g, '+').replace(/[│║]/g, '|').replace(/[─]/g, '-').replace(/[━═]/g, '=').replace(/┃/g, '#').replace(/┆/g, ':').replace(/╌/g, '.').replace(/▸/g, '>').replace(/⠋/g, '*').replace(/◔/g, '!').replace(/✓/g, '+').replace(/✗/g, 'x').replace(/█/g, '#').replace(/░/g, '-').replace(/…/g, '~').replace(/·/g, '.').replace(/●/g, '*').replace(/▲/g, '^').replace(/[↑◂]/g, '^').replace(/↓/g, 'v').replace(/—/g, '-').replace(/[←]/g, '<').replace(/[→]/g, '>');

    class Cv {
      constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => [' ', ''])); }
      put(x, y, ch, c = '') { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.g[y][x] = [ch, c]; }
      text(x, y, s, c = '') { [...s].forEach((ch, i) => this.put(x + i, y, ch, c)); }
      runs(x, y, rs) { let p = x; rs.forEach(([s, c]) => { this.text(p, y, s, c); p += [...s].length; }); }
      lines(H) {
        return this.g.slice(0, H).map(r => {
          let o = '', cur = null, buf = '';
          const fl = () => { if (buf) o += cur ? `{${cur}|${buf}}` : buf; buf = ''; };
          r.forEach(([ch, c]) => { if (c !== cur) { fl(); cur = c; } buf += ch; });
          fl(); return o;
        });
      }
    }

    const A = (d, name, task, model, st, act, i, o, cr, cw, calls, secs, cost, x = {}) => ({ d, name, task, model, st, act, i, o, cr, cw, calls, secs, cost, ...x });
    const base = () => [
      A(0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Task: add token refresh', 18400, 3100, 52000, 9000, 14, 372, 0.61),
      A(1, 'worker', 'fix login bug', 'sonnet-5-5', 'done', 'Edit src/login.ts', 9800, 2200, 31000, 4200, 31, 188, 0.14),
      A(2, 'scout', 'find session usages', 'haiku-5-5', 'done', 'Grep "session"', 3100, 600, 8000, 900, 9, 22, 0.01),
      A(1, 'worker', 'add token refresh', 'sonnet-5-5', 'running', 'Edit src/auth.ts', 7400, 1900, 31200, 4100, 24, 201, 0.12),
      A(2, 'Explore', 'map refresh callers', 'haiku-5-5', 'running', 'Grep "TODO"', 2300, 410, 5000, 700, 6, 34, 0.01),
      A(2, 'reviewer', 'review auth diff', 'sonnet-5-5', 'waiting', 'Bash: rm -rf dist', 4000, 700, 9000, 1200, 4, 95, 0.03),
      A(1, 'worker', 'write auth tests', 'sonnet-5-5', 'running', 'Bash: npm test', 11200, 2400, 40000, 5200, 23, 250, 0.18, { stuck: 1 })
    ];
    const N = (ag, kids = []) => ({ ag, kids });
    const mkTree = b => N(b[0], [N(b[1], [N(b[2])]), N(b[3], [N(b[4]), N(b[5])]), N(b[6])]);
    const flat = t => [t.ag, ...t.kids.flatMap(flat)];
    const totals = a => { const t = { tok: 0, cost: 0, running: 0, waiting: 0, done: 0, failed: 0, n: a.length }; a.forEach(x => { t.tok += x.i + x.o; t.cost += x.cost; t[x.st] = (t[x.st] || 0) + 1; }); return t; };
    const SC = { running: 'c', waiting: 'y', done: 'd', failed: 'r' };
    const EV = { running: '┃', waiting: '┆', done: '│', failed: '┃' };
    const EC = { running: 'c', waiting: 'y', done: 'd', failed: 'r' };
    const HJ = { running: ['┣', '┗', '━'], waiting: ['├', '└', '┄'], done: ['├', '└', '─'], failed: ['┣', '┗', '━'] };

    const card = (cv, x, y, w, a, o) => {
      const sel = !!o.sel, bc = o.main && (a.st === 'running') ? '' : SC[a.st];
      const ch = sel ? ['╔', '═', '╗', '║', '╚', '╝'] : ['╭', '─', '╮', '│', '╰', '╯'];
      const h = o.main ? 7 : 6;
      for (let i = 1; i < w - 1; i++) { cv.put(x + i, y, ch[1], bc); cv.put(x + i, y + h - 1, ch[1], bc); }
      cv.put(x, y, ch[0], bc); cv.put(x + w - 1, y, ch[2], bc); cv.put(x, y + h - 1, ch[4], bc); cv.put(x + w - 1, y + h - 1, ch[5], bc);
      for (let r = 1; r < h - 1; r++) { cv.put(x, y + r, ch[3], bc); cv.put(x + w - 1, y + r, ch[3], bc); }
      cv.text(x + 2, y, ' ' + a.name + ' ', 'B');
      const m = ' ' + a.model + ' '; cv.text(x + w - 2 - [...m].length, y, m, 'd');
      const iw = w - 4, ix = x + 2;
      const stt = { running: [`${SP} running`, 'c'], waiting: ['◔ waiting for permission', 'y'], done: ['✓ done · result returned', 'g'], failed: ['✗ failed · ' + (a.err || 'exit 1'), 'rB'] }[a.st];
      cv.text(ix, y + 1, stt[0], stt[1]);
      const tm = fmtT(a.secs) + (a.stuck && a.st === 'running' ? '!' : ''); cv.text(ix + iw - tm.length, y + 1, tm, a.stuck && a.st === 'running' ? 'y' : 'd');
      cv.text(ix, y + 2, fit(a.task, iw), a.st === 'done' ? 'd' : '');
      cv.text(ix, y + 3, fit('▸ ' + a.act, iw), { running: '', waiting: 'y', done: 'd', failed: 'r' }[a.st]);
      const exp = a.cost >= 0.5 || a.cost / (o.total || 1.1) >= 0.4;
      let p = ix; const seg = (s, c) => { cv.text(p, y + 4, s, c); p += [...s].length; };
      seg(o.rich ? `in ${fmtK(a.i)} · out ${fmtK(a.o)} · ` : `${fmtK(a.i + a.o)} tok · `, 'd');
      seg($(a.cost) + (exp ? '▲' : ''), exp ? 'yB' : 'd'); seg(` · ${a.calls} calls`, 'd');
      if (o.main) {
        const pl = o.plan;
        if (pl) {
          const bw = 16, f = Math.round(pl.done / pl.total * bw), pct = Math.round(pl.done / pl.total * 100) + '%';
          let q = ix; const sg = (s, c) => { cv.text(q, y + 5, s, c); q += [...s].length; };
          sg('plan ', ''); sg('█'.repeat(f), pl.done === pl.total ? 'g' : 'b'); sg('░'.repeat(bw - f), 'd'); sg(` ${pl.done}/${pl.total} ${pct}  `, 'B');
          sg(pl.done === pl.total ? '✓ ' : '▸ ', pl.done === pl.total ? 'g' : 'c'); sg(fit(pl.cur, iw - (q - ix) - 2), pl.done === pl.total ? 'd' : '');
        } else cv.text(ix, y + 5, 'plan ░░░░░░░░░░░░░░░░  —  no todo list', 'd');
      }
      return h;
    };
    const chip = (cv, x, y, w, a, hidden) => {
      for (let i = 1; i < w - 1; i++) { cv.put(x + i, y, '─', 'd'); cv.put(x + i, y + 2, '─', 'd'); }
      cv.put(x, y, '╭', 'd'); cv.put(x + w - 1, y, '╮', 'd'); cv.put(x, y + 2, '╰', 'd'); cv.put(x + w - 1, y + 2, '╯', 'd'); cv.put(x, y + 1, '│', 'd'); cv.put(x + w - 1, y + 1, '│', 'd');
      cv.runs(x + 2, y + 1, [['✓ ', 'g'], [fit(`${a.name} · ${a.task}`, w - 14), 'd'], [` +${hidden} done`, 'd']]);
      return 3;
    };

    const layoutH = (cv, root, o) => {
      const W = cv.w, c0 = o.c0 || 0, kids = root.kids.slice(c0, c0 + (o.cols || root.kids.length)), n = kids.length;
      const cw = Math.floor((W - 4) / Math.max(n, 1)), cs = kids.map((_, i) => 2 + cw * i + Math.floor(cw / 2));
      const cx = n ? Math.floor((cs[0] + cs[n - 1]) / 2) : Math.floor(W / 2), mw = o.mainW;
      card(cv, cx - Math.floor(mw / 2), 2, mw, root.ag, { main: 1, sel: o.sel === root.ag, plan: o.plan, total: o.total, rich: o.rich });
      cv.put(cx, 8, '┬', 'd');
      if (!n) {
        for (const r of [9, 10]) cv.put(cx, r, '┆', 'd');
        cv.text(cx - 11, 11, '╌╌ no subagents yet ╌╌', 'd');
        cv.text(cx - 27, 12, 'they appear here the moment main delegates a task', 'd');
        return 12;
      }
      cv.put(cx, 9, '│', 'd'); cv.text(cx + 2, 9, 'spawn', 'd');
      if (n > 1) { for (let x = cs[0]; x <= cs[n - 1]; x++) cv.put(x, 10, '─', 'd'); cv.put(cs[0], 10, '╭', 'd'); cv.put(cs[n - 1], 10, '╮', 'd'); cs.slice(1, -1).forEach(c => cv.put(c, 10, '┬', 'd')); cv.put(cx, 10, cs.includes(cx) ? '┼' : '┴', 'd'); }
      else cv.put(cx, 10, '│', 'd');
      let maxY = 12;
      kids.forEach((k, i) => {
        const a = k.ag, x = 2 + cw * i + 1, w = cw - 2, y = 12;
        cv.put(cs[i], 11, EV[a.st], EC[a.st]);
        let h;
        if (k.collapse) h = chip(cv, x, y, w, a, flat(k).length - 1); else h = card(cv, x, y, w, a, { sel: o.sel === a, total: o.total, rich: o.rich });
        maxY = Math.max(maxY, y + h - 1);
        if (k.collapse || !k.kids.length) return;
        const t = x + 2; cv.put(t, y + h - 1, '┬', 'd');
        let gy = y + h, s = y + h;
        k.kids.forEach((g, j) => {
          const e = g.ag, last = j === k.kids.length - 1, cr = gy + 1;
          for (let r = s; r < cr; r++) cv.put(t, r, EV[e.st], EC[e.st]);
          const hj = HJ[e.st]; cv.put(t, cr, last ? hj[1] : hj[0], EC[e.st]); cv.put(t + 1, cr, hj[2], EC[e.st]);
          const gh = card(cv, t + 2, gy, w - 4, e, { sel: o.sel === e, total: o.total, rich: o.rich });
          s = cr + 1; gy += gh; maxY = Math.max(maxY, gy - 1);
        });
      });
      return maxY;
    };

    const pre2 = list => list.map((a, i) => {
      const nxt = k => { for (let j = k + 1; j < list.length; j++) { if (list[j].d < list[k].d) return false; if (list[j].d === list[k].d) return true; } return false; };
      const cont = []; let s = '';
      for (let d = a.d - 1; d >= 1; d--) { let j = i - 1; while (list[j].d !== d) j--; cont.unshift(nxt(j)); }
      if (!a.d) return { s: '', cont: [], own: false };
      cont.forEach(c => s += c ? '│  ' : '   ');
      return { s: s + (nxt(i) ? '├─ ' : '└─ '), cont, own: nxt(i) };
    });
    const layoutV = (cv, list, o) => {
      const W = cv.w, P = pre2(list); let y = 2;
      list.forEach((a, i) => {
        const p = P[i], pl = [...p.s].length, x0 = 2, sel = o.sel === a, G = { running: SP, waiting: '◔', done: '✓', failed: '✗' }[a.st];
        cv.text(x0, y, p.s, 'd');
        const sx = x0 + pl, flex = W - 4 - pl - 21, tw = Math.floor(flex * .45), aw = flex - tw;
        const tm = fmtT(a.secs) + (a.stuck && a.st === 'running' ? '!' : '');
        const rs = [[G + ' ', sel ? 'IB' : SC[a.st] === 'd' ? 'g' : SC[a.st]], [fit(a.name, 8).padEnd(9), sel ? 'IB' : a.d ? '' : 'B'], [fit(a.task, tw).padEnd(tw + 1), sel ? 'IB' : a.st === 'done' ? 'd' : ''], [fit(a.act, aw).padEnd(aw + 1), sel ? 'IB' : { running: '', waiting: 'y', done: 'd', failed: 'r' }[a.st]], [tm.padStart(6), sel ? 'IB' : a.stuck && a.st === 'running' ? 'y' : 'd']];
        cv.runs(sx, y, rs);
        p.cont.forEach((c, k) => { if (c) cv.put(x0 + 3 * k, y, '│', 'd'); });
        y++;
        if (sel) {
          const cw_ = W - 2 - sx - 1;
          p.cont.forEach((c, k) => { if (c) for (let r = 0; r < 6; r++) cv.put(x0 + 3 * k, y + r, '│', 'd'); });
          if (p.own) for (let r = 0; r < 6; r++) cv.put(x0 + 3 * (a.d - 1), y + r, '│', 'd');
          card(cv, sx, y, cw_, a, { sel: 1, total: o.total, rich: 1 });
          y += 6;
        }
      });
      return y - 1;
    };

    const frame = (W, o) => {
      const cv = new Cv(W, 100), maxY = o.body(cv), t = totals(o.agents);
      const noteRow = o.note ? maxY + 2 : null, rule = (noteRow || maxY + 1) + 1, hr = rule + 1, bt = hr + 1, H = bt + 1;
      for (let x = 1; x < W - 1; x++) { cv.put(x, 0, '─', 'd'); cv.put(x, bt, '─', 'd'); cv.put(x, rule, '─', 'd'); }
      cv.put(0, 0, '╭', 'd'); cv.put(W - 1, 0, '╮', 'd'); cv.put(0, bt, '╰', 'd'); cv.put(W - 1, bt, '╯', 'd'); cv.put(0, rule, '├', 'd'); cv.put(W - 1, rule, '┤', 'd');
      for (let r = 1; r < bt; r++) if (r !== rule) { cv.put(0, r, '│', 'd'); cv.put(W - 1, r, '│', 'd'); }
      const pct = o.plan ? Math.round(o.plan.done / o.plan.total * 100) + '%' : '—';
      const rt = `${fmtK(t.tok)} tok · ${$(t.cost)} · plan `, rl = [...rt].length + [...pct].length;
      cv.runs(2, 0, [[' agentview', 'B'], [' · session ', 'd'], [o.sid || '7f3a9c2e', ''], [' ', '']]);
      cv.runs(W - 3 - rl, 0, [[rt, 'd'], [pct, 'B']]);
      const sm = o.ended ? [['✓ session finished', 'g'], [` · ${t.n} agents · ${o.ended}`, 'd']] : [['c', SP, 'running', t.running], ['y', '◔', 'waiting', t.waiting], ['g', '✓', 'done', t.done], ['r', '✗', 'failed', t.failed]].flatMap(([c, g, w, n], i) => [[(i ? '   ' : ''), ''], [`${g} ${n} ${w}`, n ? c : 'd']]).concat([[`   ·  ${t.n} agents`, 'd']]);
      cv.runs(2, 1, sm);
      if (W >= 100) cv.runs(W - 3 - 13, 1, [['tree', 'd'], ['  ', ''], [' graph ', 'IB']]);
      if (noteRow) cv.runs(2, noteRow, o.note);
      const hl = o.hints || [['←→↑↓', 'move'], ['⏎', 'details'], ['tab', 'tree'], ['esc', 'close']];
      let p = 2; hl.forEach(([k, l], i) => { cv.runs(p, hr, [[k, 'B'], [' ' + l, 'd']]); p += [...k].length + 1 + [...l].length + 3; });
      if (o.mid) cv.text(Math.floor(W / 2) - 8, hr, o.mid, 'd');
      cv.runs(W - 3 - 6, hr, o.ended ? [['ended', 'd']] : [['●', 'g'], [' live', 'd']]);
      return cv.lines(H);
    };

    const plan = { done: 6, total: 10, cur: 'Add token refresh to auth.ts' };
    const graph = (W, agents, o = {}) => {
      const tree = o.tree || mkTree(agents), all = flat(tree), tot = totals(all).cost;
      const sel = o.sel !== undefined ? o.sel : all[3];
      const rich = W >= 140;
      const L = frame(W, { agents: all, plan: o.plan === undefined ? plan : o.plan, ended: o.ended, note: o.note, mid: o.mid, hints: o.hints, body: cv => layoutH(cv, tree, { mainW: rich ? 80 : 60, plan: o.plan === undefined ? plan : o.plan, sel, total: tot, rich, cols: o.cols, c0: o.c0 }) });
      return o.ascii ? L.map(asc) : L;
    };
    const compact = (agents, W) => {
      const all = agents, tot = totals(all).cost;
      return frame(W, { agents: all, plan, hints: [['↑↓', 'select'], ['⏎', 'details'], ['tab', 'tree'], ['esc', 'close']], body: cv => layoutV(cv, all, { sel: all[3], total: tot }) });
    };

    const bs = base(); const t0 = bs.map(x => ({ ...x }));
    const failed = base(); failed[6] = { ...failed[6], st: 'failed', act: 'Bash: npm test', stuck: 0, err: 'exit 1' };
    const ended = base().map(x => ({ ...x, st: 'done', stuck: 0 })); ended[0].secs = 862; ended[0].act = 'final summary';
    const empty = [A(0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Read docs/auth.md', 2100, 380, 4000, 1700, 3, 41, 0.04)];
    const mt = (() => {
      const wk = [['migrate db schema', 'done', [['scout', 'list table usages', 'done'], ['Explore', 'find raw SQL', 'done']]], ['update API routes', 'running', [['worker', 'rewrite /users', 'running'], ['reviewer', 'check route types', 'running']]], ['port tests to vitest', 'running', [['worker', 'port auth tests', 'waiting']]], ['update docs', 'running', []], ['CI pipeline', 'running', [['Explore', 'inspect workflows', 'done'], ['worker', 'edit ci.yml', 'running']]], ['lint config', 'done', [['scout', 'list rules', 'done']]], ['release notes', 'running', []]];
      let k = 1; const mk = (d, nm, task, st) => { const i = 3000 + k * 1300, o = 500 + k * 170; const a = A(d, nm, task, d === 1 ? 'sonnet-5-5' : 'haiku-5-5', st, ['Edit src/db/schema.ts', 'Read src/routes/users.ts', 'Grep "SELECT"', 'Bash: npm run build', 'Edit tests/cart.test.ts', 'Bash: git diff --stat', 'Edit .github/ci.yml'][k % 7], i, o, i * 3, 800, 5 + k * 2, 30 + k * 23, +((i * 3 + o * 15) / 1e6).toFixed(2)); k++; return a; };
      const main = A(0, 'main', 'migrate webshop to vitest + new API', 'opus-5-5', 'running', 'Task: update API routes', 41200, 8300, 160000, 22000, 38, 905, 0.94);
      const root = N(main, wk.map(w => { const a = mk(1, 'worker', w[0], w[1]); const nd = N(a, w[2].map(c => N(mk(2, c[0], c[1], c[2])))); if (w[1] === 'done') nd.collapse = 1; return nd; }));
      return root;
    })();
    const mAll = flat(mt);

    const S = [];
    const add = (id, title, size, note, lines) => S.push({ id, title, size, note, lines });
    const lg = new Cv(112, 12);
    card(lg, 1, 0, 34, { ...bs[3], st: 'running' }, {});
    lg.text(1, 7, 'title: name · model', 'd'); lg.text(1, 8, 'rows: state·time / task / now /', 'd'); lg.text(1, 9, 'tokens · cost · calls', 'd');
    const lx = 40;
    [['┃', 'c', 'running', 'heavy line, cyan'], ['┆', 'y', 'waiting', 'dashed, yellow'], ['│', 'd', 'done', 'light, dim'], ['┃', 'r', 'failed', 'heavy, red']].forEach(([g, c, w, d], i) => lg.runs(lx, i, [[g, c], ['  ', ''], [w.padEnd(9), c === 'd' ? '' : c], [d, 'd']]));
    lg.runs(lx, 4, [['├─', 'd'], ['  ', ''], ['child of a child', '']]);
    lg.runs(lx, 5, [['╔═╗', 'B'], ['  ', ''], ['selected node (double border + bold)', '']]);
    lg.runs(lx, 6, [['spawn', 'd'], ['  ', ''], ['label on the first edge: main delegated work', '']]);
    lg.runs(lx, 7, [['! ▲', 'y'], ['  ', ''], ['stuck > 3 min · expensive (same rules as the tree)', '']]);
    lg.runs(lx, 9, [['✓ done · result returned', 'g'], ['  ', ''], ['= the child finished and handed its result up', '']]);
    add('0', 'Legend · how to read the graph', '112 × 11', 'Parent on top, children below, grandchildren stacked under their parent. The line from parent to child is the spawn; its style is the child\'s status, so a glance down the lines shows what is alive.', lg.lines(11));
    add('1', 'Graph view · 160 cols', '160 × 36', 'Main on top with the session plan inside it. Three subagents hang off the bus line; Explore and reviewer hang under the worker that spawned them. The selected node (add token refresh) has a double border. Layout is fixed by start order: nothing moves when values change, only text inside cards updates.', graph(160, base()));
    add('2', 'Graph view · 120 cols', '120 × 34', 'Same graph, narrower cards: token split and wide main card are dropped (tier rules as in the tree), structure unchanged.', graph(120, base(), { note: [['! ', 'y'], ['write auth tests', ''], [' has been on "npm test" for 4m10s', 'd']] }));
    add('3', 'Graph at 80 cols · focus + context', '80 × 24', 'Too narrow for side-by-side columns, so the graph folds into the tree and only the selected node expands into a full card. Connectors and status glyphs survive; one node is always readable in detail. ↑↓ moves the card.', compact(base(), 80));
    add('4', 'ASCII fallback · 120 cols', '120 × 34', 'Every glyph swaps 1:1 for one ASCII character: heavy edge # / dashed : / light |, double border =.', graph(120, base(), { ascii: true }));
    add('5a', 'State · empty (no subagents yet)', '120 × 20', 'Main alone, a dashed stub shows where children will attach. Plan "—" because there is no todo list.', graph(120, empty, { tree: N(empty[0]), sel: empty[0], plan: null }));
    add('5b', 'State · waiting for permission', '120 × 34', 'The reviewer node turns yellow, its edge goes dashed, and the card names the wait. Everything else keeps running.', graph(120, waitFix(), { sel: base()[5], note: [['◔ ', 'y'], ['reviewer', 'yB'], [' is waiting for permission: ', ''], ['Bash: rm -rf dist', 'y'], [' · answer in the Claude Code prompt · 1m35s', 'd']] }));
    add('5c', 'State · failed subagent', '120 × 34', 'Failed node and its edge go red and heavy. Its parent line stays so you see who is affected.', graph(120, failed, { sel: failed[6], note: [['✗ ', 'rB'], ['write auth tests', 'r'], [' failed · Bash: npm test exited 1 after 4m10s · ⏎ for output', 'd']] }));
    add('5d', 'State · many agents (16)', '160 × 30', 'Four columns of seven are visible; finished subtrees collapse into a one-line chip so live work keeps the space. ◂ ▸ pans columns; Tab gives the full tree.', graph(160, mAll, { tree: mt, sel: mt.kids[2].ag, cols: 4, c0: 0, mid: '◂ workers 1–4 of 7 ▸', note: [['16 agents · 9 done subtrees collapsed · ', 'd'], ['▸ 3 more workers →', 'B']] }));
    add('5e', 'State · finished session', '120 × 34', 'All edges and cards go dim except green ✓; no spinner, no live dot.', graph(120, ended, { sel: ended[0], ended: '14m22s', plan: { done: 10, total: 10, cur: 'all todos complete' }, note: [['✓ ', 'g'], ['Finished in 14m22s — nothing is running', '']] }));
    function waitFix() { return base(); }
    const copyOf = s => () => { const txt = s.lines.map(strip).join('\n'); try { navigator.clipboard.writeText(txt); } catch (e) {} this.setState({ copied: s.id }); setTimeout(() => this.setState({ copied: '' }), 1200); };
    const screens = S.map(s => ({ id: s.id, anchor: 'g' + s.id, title: s.title, size: s.size + ' · ' + s.lines.reduce((m, l) => Math.max(m, vl(l)), 0) + ' cols', note: s.note, inner: { __html: toHtml(s.lines.join('\n'), th, mode) }, copy: copyOf(s), copyLabel: this.state.copied === s.id ? 'Copied' : 'Copy text' }));
    const on = (v, cur) => v === cur ? { bg: 'var(--color-text)', fg: 'var(--color-bg)' } : { bg: 'transparent', fg: 'var(--color-text)' };
    const themeBtns = ['dark', 'light'].map(v => ({ label: v === 'dark' ? 'Dark' : 'Light', click: () => this.setState({ theme: v }), ...on(v, this.state.theme) }));
    const modeBtns = [['color', 'Color'], ['plain', 'Plain'], ['spec', 'Spec']].map(([v, l]) => ({ label: l, click: () => this.setState({ mode: v }), ...on(v, mode) }));
    const rules = [
      'Tab toggles tree ↔ graph; the selected agent stays selected. Esc closes the dialog (dialog) or goes back (CLI); q quits the CLI.',
      'Graph keys: ↑ parent, ↓ first child, ← → previous / next sibling (↑↓ still step through the list at 80 cols). Enter opens the same detail view as in the tree.',
      'Stable layout: columns and rows are placed by start order and never re-sorted or re-packed. New agents add a column or a card below their parent; nothing existing moves.',
      'Alive but calm: only running edges are heavy and only running cards show a spinner (8 fps). Everything else is static.',
      'Dense sessions: finished subtrees collapse into a chip once the graph no longer fits; Enter on a chip expands it. Over ~8 workers, Tab to the tree is the better view.',
      'Below ~110 cols the graph folds into the tree with the selected node expanded as a card (screen 3), so nothing is lost on narrow terminals.'
    ];
    return { th, screens, themeBtns, modeBtns, rules };
  }
}
