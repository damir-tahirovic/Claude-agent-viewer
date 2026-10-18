
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
    const C = (c, t) => t ? `{${c}|${t}}` : '';
    const D = t => C('d', t);
    const padR = (s, w) => s + ' '.repeat(Math.max(0, w - vl(s)));
    const padL = (s, w) => ' '.repeat(Math.max(0, w - [...s].length)) + s;
    const fit = (t, w) => { const a = [...t]; return a.length <= w ? t + ' '.repeat(w - a.length) : a.slice(0, Math.max(0, w - 1)).join('') + '…'; };
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
    const plainOf = lines => lines.map(strip).join('\n');
    const SP = '⠋';
    const fmtK = n => n < 1000 ? String(n) : n < 100000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n / 1000) + 'k';
    const fmtT = s => s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's' : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm';
    const $ = n => '~$' + n.toFixed(2);
    const ascii = s => s.replace(/[╭╮╰╯├┤┬┴]/g, '+').replace(/[│┃]/g, '|').replace(/─/g, '-').replace(/▸/g, '>').replace(/⠋/g, '*').replace(/◔/g, '!').replace(/[✓]/g, '+').replace(/✗/g, 'x').replace(/█/g, '#').replace(/░/g, '-').replace(/…/g, '~').replace(/·/g, '.').replace(/●/g, '*').replace(/◌/g, '.').replace(/▲/g, '^').replace(/↑/g, '^').replace(/↓/g, 'v').replace(/—/g, '-').replace(/›/g, '>').replace(/→/g, '>');

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
    const totals = a => { const t = { tok: 0, cost: 0, running: 0, waiting: 0, done: 0, failed: 0, unknown: 0, n: a.length }; a.forEach(x => { t.tok += x.i + x.o; t.cost += x.cost; t[x.st]++; }); return t; };
    const pre = list => list.map((a, i) => {
      if (!a.d) return '';
      const nxt = k => { for (let j = k + 1; j < list.length; j++) { if (list[j].d < list[k].d) return false; if (list[j].d === list[k].d) return true; } return false; };
      let s = ''; const chain = [];
      for (let d = a.d - 1; d >= 1; d--) { let j = i - 1; while (list[j].d !== d) j--; chain.unshift(j); }
      chain.forEach(j => s += nxt(j) ? '│  ' : '   ');
      return s + (nxt(i) ? '├─ ' : '└─ ');
    });
    const top = (W, l, r) => D('╭─ ') + l + D(' ' + '─'.repeat(Math.max(1, W - 8 - vl(l) - vl(r))) + ' ') + r + D(' ─╮');
    const bottom = W => D('╰' + '─'.repeat(W - 2) + '╯');
    const rule = (W, label) => label ? D('├─ ' + label + ' ' + '─'.repeat(W - 6 - [...label].length) + '┤') : D('├' + '─'.repeat(W - 2) + '┤');
    const txt = (W, s) => D('│') + ' ' + padR(s, W - 4) + ' ' + D('│');
    const bar = (n, tot, w, c) => { const f = Math.round(n / tot * w); return C(c, '█'.repeat(f)) + D('░'.repeat(w - f)); };
    const hints = (list, A_) => list.map(([k, l]) => C('B', k) + D(' ' + l)).join('   ');
    const stCell = { running: ['c', SP + ' running'], waiting: ['y', '◔ waiting'], done: ['g', '✓ done   '], failed: ['rB', '✗ failed '], unknown: ['d', '? unknown'] };

    const dialog = o => {
      const W = o.W, a = o.agents, L = W < 100 ? 1 : W < 140 ? 2 : 3, t = totals(a), px = pre(a);
      const cd = [
        { k: 'name', w: W >= 100 ? 18 : 16, h: 'AGENT' }, { k: 'st', w: 9, h: 'STATUS' }, { k: 'model', w: 10, h: 'MODEL', p: 2 },
        { k: 'task', f: 1, p: 2, h: 'TASK' }, { k: 'act', f: 1, h: 'NOW' }, { k: 'tok', w: 6, r: 1, h: 'TOK' },
        { k: 'io', w: 11, r: 1, p: 3, h: 'IN/OUT' }, { k: 'cost', w: 7, r: 1, p: 2, h: 'COST' }, { k: 'calls', w: 5, r: 1, p: 3, h: 'CALLS' }, { k: 'time', w: 7, r: 1, h: 'TIME' }
      ].filter(c => (c.p || 1) <= L);
      const fixed = cd.filter(c => c.w).reduce((s, c) => s + c.w, 0), flex = W - 5 - fixed - (cd.length - 1) * 2;
      const hasTask = cd.some(c => c.k === 'task'), tw = Math.floor(flex * .4);
      cd.forEach(c => { if (c.f) c.w = hasTask ? (c.k === 'task' ? tw : flex - tw) : flex; });
      const cell = (c, ag, i) => {
        const fin = ag.st === 'done', dm = fin ? 'd' : '';
        const exp = ag.cost >= 0.5 || ag.cost / t.cost >= 0.4;
        switch (c.k) {
          case 'name': return D(px[i]) + (ag.d ? C(dm, fit(ag.name, c.w - px[i].length)) : C('B', fit(ag.name, c.w - px[i].length)));
          case 'st': return C(...stCell[ag.st].map((v, j) => j ? '' : v).slice(0, 1), '') + C(stCell[ag.st][0], stCell[ag.st][1]);
          case 'model': return D(fit(ag.model, c.w));
          case 'task': return C(dm, fit(ag.task, c.w));
          case 'act': return C({ waiting: 'y', failed: 'r', done: 'd', unknown: 'd' }[ag.st] || '', fit(ag.act || '—', c.w));
          case 'tok': return C(dm, padL(fmtK(ag.i + ag.o), c.w));
          case 'io': return D(padL(fmtK(ag.i) + '/' + fmtK(ag.o), c.w));
          case 'cost': return exp ? C('yB', padL($(ag.cost) + '▲', c.w)) : C(dm, padL($(ag.cost) + ' ', c.w));
          case 'calls': return C(dm, padL(String(ag.calls), c.w));
          case 'time': return ag.stuck && ag.st === 'running' ? C('y', padL(fmtT(ag.secs) + '!', c.w)) : C(dm, padL(fmtT(ag.secs) + ' ', c.w));
        }
      };
      const out = [];
      const pct = o.plan ? Math.round(o.plan.done / o.plan.total * 100) + '%' : '—';
      const idl = o.sid || '7f3a9c2e';
      out.push(top(W, C('B', 'agentview') + D(' · session ') + idl + (o.path ? D(' · ') + o.path : ''), D(`${fmtK(t.tok)} tok · ${$(t.cost)} · plan `) + C('B', pct)));
      const sm = [['c', SP, 'running', t.running], ['y', '◔', 'waiting', t.waiting], ['g', '✓', 'done', t.done], ['r', '✗', 'failed', t.failed]];
      if (t.unknown) sm.push(['d', '?', 'unknown', t.unknown]);
      out.push(txt(W, o.ended ? C('g', '✓ session finished') + D(` · ${t.n} agents · ${o.ended}`) : sm.map(([c, g, w, n]) => n ? C(c, `${g} ${n} ${w}`) : D(`${g} ${n} ${w}`)).join('   ') + D(`   ·  ${t.n} agents`)));
      out.push(rule(W));
      out.push(txt(W, D('  ' + cd.map(c => c.r ? padL(c.h, c.w) : fit(c.h, c.w)).join('  '))));
      const win = o.win, s = win ? win[0] : 0, e = win ? win[1] : a.length, h = e - s, N = a.length;
      if (win && s > 0) out.push(txt(W, D(`  ↑ ${s} more above`)));
      const ts = Math.floor(s / N * h), tl = Math.max(1, Math.round(h * h / N));
      let nrows = 0;
      for (let idx = s; idx < e; idx++) {
        const k = idx - s, sel = idx === o.sel;
        const inner = (sel ? '▸' : ' ') + ' ' + cd.map(c => cell(c, a[idx], idx)).join('  ') + ' ';
        out.push(D('│') + (sel ? C('IB', strip(inner)) : inner) + (win && k >= ts && k < ts + tl ? C('B', '┃') : D('│'))); nrows++;
      }
      if (win && e < N) out.push(txt(W, D(`  ↓ ${N - e} more below`)));
      (o.after || []).forEach(l => out.push(txt(W, l)));
      if (o.minRows) while (out.length < o.minRows) out.push(txt(W, ''));
      out.push(rule(W));
      const bw = W >= 100 ? 24 : 14;
      if (o.plan) {
        const p = o.plan, pre_ = 'plan ' + '█'.repeat(bw) + ` ${p.done}/${p.total} ${pct}  ▸ `;
        out.push(txt(W, C('', 'plan ') + bar(p.done, p.total, bw, p.done === p.total ? 'g' : 'b') + C('B', ` ${p.done}/${p.total} ${pct}`) + '  ' + (o.ended ? C('g', '✓ ') + D(p.cur) : C('c', '▸ ') + fit(p.cur, W - 4 - [...pre_].length).trimEnd())));
      } else out.push(txt(W, 'plan ' + D('░'.repeat(bw) + '  —   no todo list in this session')));
      out.push(rule(W));
      const hl = o.hints || [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'close'], ['q', 'quit']];
      const right = o.ended ? D('ended') : C('g', '●') + D(' live');
      out.push(txt(W, padR(hints(hl), W - 4 - vl(right)) + right));
      out.push(bottom(W));
      return o.ascii ? out.map(ascii) : out;
    };

    const detail = () => {
      const W = 120, Lw = 66, Rw = W - 2 - Lw - 1;
      const ag = base()[3], out = [];
      const two = (l, r) => D('│') + ' ' + padR(l, Lw - 2) + ' ' + D('│') + ' ' + padR(r, Rw - 2) + ' ' + D('│');
      out.push(top(W, C('B', 'agentview') + D(' › ') + C('B', 'worker') + D(' · add token refresh'), C('c', SP + ' running')));
      out.push(txt(W, D('model ') + 'sonnet-5-5   ' + D('parent ') + 'main   ' + D('started ') + '14:02:11   ' + D('elapsed ') + '3m21s   ' + D('tool calls ') + '24   ' + D('on this action ') + '12s'));
      out.push(rule(W));
      out.push(txt(W, D('TASK')));
      ['Add refresh-token rotation to src/auth.ts: issue a new refresh token on every use, invalidate the previous one,', 'and wire the flow into the login handler. Keep the existing session cookie format untouched.'].forEach(l => out.push(txt(W, l)));
      out.push(D('├' + '─'.repeat(Lw) + '┬' + '─'.repeat(Rw) + '┤'));
      const acts = [[3, 'Read', 'src/auth.ts', '0.1s', 1], [5, 'Read', 'src/session/store.ts', '0.1s', 1], [9, 'Grep', '"refreshToken"', '0.3s', 1], [14, 'Glob', 'src/**/*.test.ts', '0.1s', 1], [22, 'Read', 'src/login.ts', '0.1s', 1], [31, 'Edit', 'src/auth.ts', '0.2s', 1], [44, 'Edit', 'src/auth.ts', '0.2s', 1], [58, 'Bash', 'npx tsc --noEmit', '6.1s', 0], [66, 'Read', 'src/types/token.d.ts', '0.1s', 1], [74, 'Edit', 'src/types/token.d.ts', '0.2s', 1], [81, 'Bash', 'npx tsc --noEmit', '5.8s', 1], [93, 'Edit', 'src/auth.ts', '0.2s', 1], [105, 'Grep', '"rotateRefreshToken"', '0.2s', 1], [118, 'Read', 'src/api/routes.ts', '0.1s', 1], [131, 'Edit', 'src/api/routes.ts', '0.3s', 1], [146, 'Bash', 'npm run lint -- src/auth.ts', '4.4s', 1], [160, 'Edit', 'src/auth.ts', '0.2s', 1], [172, 'Read', 'src/auth.test.ts', '0.1s', 1], [186, 'Write', 'src/auth.refresh.test.ts', '0.4s', 1], [199, 'Edit', 'src/auth.ts', '12s', null]];
      const clock = off => { const t = 14 * 3600 + 2 * 60 + 11 + off; return [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
      const left = [D('ACTIONS · last 20 of 24')];
      acts.forEach(([off, tool, tg, dur, ok]) => {
        const mark = ok === null ? C('c', SP) : ok ? C('g', '✓') : C('rB', '✗');
        left.push(D(clock(off)) + ' ' + mark + ' ' + (ok === null ? C('B', fit(tool, 6)) : fit(tool, 6)) + ' ' + (ok === 0 ? C('r', fit(tg, 40)) : ok === null ? C('B', fit(tg, 40)) : fit(tg, 40)) + ' ' + D(padL(dur, 5)));
      });
      const nm = n => padL(n.toLocaleString('en-US'), 7);
      const mx = ag.cr;
      const tb = (lbl, n) => fit(lbl, 12) + nm(n) + ' ' + bar(n, mx, 20, 'b');
      const right = [D('TOKENS'), tb('input', ag.i), tb('output', ag.o), tb('cache read', ag.cr), tb('cache write', ag.cw), '', fit('in + out', 12) + nm(ag.i + ag.o), fit('cost', 12) + padL($(ag.cost), 7) + D('   11% of session cost'), '', D('TODO · this agent  2/4'), C('g', '✓ ') + D('Read auth.ts and session store'), C('g', '✓ ') + D('Add rotateRefreshToken()'), C('c', '▸ ') + C('B', 'Wire rotation into login handler'), C('', '◌ ') + D('Add tests for rotation')];
      left.forEach((l, i) => out.push(two(l, right[i] || '')));
      out.push(D('├' + '─'.repeat(Lw) + '┴' + '─'.repeat(Rw) + '┤'));
      out.push(txt(W, hints([['↑↓', 'prev / next agent'], ['esc', 'back to tree'], ['q', 'quit']]) ));
      out.push(bottom(W));
      return out;
    };

    const sessions = () => {
      const S = [
        ['running', '~/code/webshop', '7f3a9c2e', '7 (4 run)', 52300, 1.10, '60%', 'Edit src/auth.ts', '2s'],
        ['waiting', '~/code/api-gateway', 'c01d44ab', '4 (1 wait)', 28300, 0.52, '30%', 'Bash: rm -rf dist', '1m35s'],
        ['running', '~/code/agentview', '9be2117f', '2 (1 run)', 9100, 0.21, '—', 'Read README.md', '4s'],
        ['done', '~/code/webshop', '31d8a0b7', '5', 88400, 2.31, '100%', 'session finished', '38m'],
        ['failed', '~/notes/site', 'e5527c13', '3', 15700, 0.34, '40%', 'Bash: npm run build · exit 1', '2h'],
        ['unknown', '~/code/dotfiles', '0a6bf9d4', '1', 3200, 0.05, '—', 'no heartbeat', '1d']
      ];
      const mk = W => {
        const L = W < 100 ? 1 : 2;
        const cd = [{ k: 'st', w: 9, h: 'STATUS' }, { k: 'pj', f: 1, h: 'PROJECT' }, { k: 'id', w: 8, p: 2, h: 'SESSION' }, { k: 'ag', w: 10, h: 'AGENTS' }, { k: 'tok', w: 6, r: 1, h: 'TOK' }, { k: 'cost', w: 7, r: 1, p: 2, h: 'COST' }, { k: 'plan', w: 5, r: 1, h: 'PLAN' }, { k: 'act', f: 1, p: 2, h: 'LAST ACTION' }, { k: 'ago', w: 6, r: 1, h: 'AGO' }].filter(c => (c.p || 1) <= L);
        const fixed = cd.filter(c => c.w).reduce((s, c) => s + c.w, 0), flex = W - 5 - fixed - (cd.length - 1) * 2, two = cd.filter(c => c.f).length;
        cd.forEach(c => { if (c.f) c.w = two === 2 ? (c.k === 'pj' ? Math.floor(flex * .4) : flex - Math.floor(flex * .4)) : flex; });
        const out = [];
        out.push(top(W, C('B', 'agentview') + D(' · 6 sessions · 3 active'), D('118.3k tok today · ~$4.53')));
        out.push(rule(W));
        out.push(txt(W, D('  ' + cd.map(c => c.r ? padL(c.h, c.w) : fit(c.h, c.w)).join('  '))));
        const row = (s, sel) => {
          const dm = ['done', 'unknown'].includes(s[0]) ? 'd' : '';
          const v = { st: C(...[stCell[s[0]][0], stCell[s[0]][1]]), pj: C(dm, fit(s[1], 0)), };
          const cells = cd.map(c => {
            switch (c.k) {
              case 'st': return C(stCell[s[0]][0], stCell[s[0]][1]);
              case 'pj': return C(dm, fit(s[1], c.w));
              case 'id': return D(fit(s[2], c.w));
              case 'ag': return C(dm, fit(s[3], c.w));
              case 'tok': return C(dm, padL(fmtK(s[4]), c.w));
              case 'cost': return C(dm, padL($(s[5]), c.w));
              case 'plan': return C(dm, padL(s[6], c.w));
              case 'act': return C(s[0] === 'waiting' ? 'y' : s[0] === 'failed' ? 'r' : 'd', fit(s[7], c.w));
              case 'ago': return D(padL(s[8], c.w));
            }
          });
          const inner = (sel ? '▸' : ' ') + ' ' + cells.join('  ') + ' ';
          return D('│') + (sel ? C('IB', strip(inner)) : inner) + D('│');
        };
        out.push(txt(W, D(`ACTIVE · 3`)));
        S.slice(0, 3).forEach((s, i) => out.push(row(s, i === 0)));
        out.push(txt(W, ''));
        out.push(txt(W, D(`RECENT · 3`)));
        S.slice(3).forEach(s => out.push(row(s, false)));
        out.push(rule(W));
        out.push(txt(W, padR(hints([['↑↓', 'select'], ['⏎', 'open session'], ['q', 'quit']]), W - 4 - 6) + C('g', '●') + D(' live')));
        out.push(bottom(W));
        return out;
      };
      return mk;
    };

    const statusLines = () => {
      const t = totals(base()), T = fmtK(t.tok), cs = $(t.cost);
      const lab = s => D('  ' + s);
      const prompt = [D('╭' + '─'.repeat(78) + '╮'), D('│ ') + '> ' + D('fix the login bug and add tests' + ' '.repeat(45)) + D('│'), D('╰' + '─'.repeat(78) + '╯')];
      return [...prompt,
        D('  ↑ the line below is the status entry, always visible under the prompt'), '',
        lab('A · text  (default; ≈55 cols)'),
        D('  agentview · ') + `${t.n} agents (` + C('c', `${t.running} running`) + D(') · ') + `${T} tok` + D(' · ') + C('B', '60%'),
        D('  agentview · ') + `${t.n} agents (` + C('c', `${t.running} running`) + ', ' + C('y', '1 waiting') + D(') · ') + `${T} tok` + D(' · ') + C('B', '60%'),
        D('  agentview · ') + `${t.n} agents (` + C('rB', '1 failed') + D(') · ') + `${T} tok` + D(' · ') + C('B', '70%'),
        D('  agentview · no subagents · 6.2k tok · —'),
        D('  agentview · ') + C('g', `${t.n} agents done`) + D(' · ') + '88.4k tok' + D(' · ') + C('B', '100%'), '',
        lab('B · glyph counts + mini bar  (≈60 cols, scans fastest)'),
        '  ' + C('B', 'agentview') + '  ' + C('c', `${SP} ${t.running}`) + ' ' + C('y', `◔ ${t.waiting}`) + ' ' + C('g', `✓ ${t.done}`) + D(` · ${T} · ${cs} · `) + C('b', '██████') + D('░░░░') + ' ' + C('B', '60%'),
        '  ' + C('B', 'agentview') + '  ' + C('c', `${SP} 2`) + ' ' + C('rB', '✗ 1') + ' ' + C('g', '✓ 4') + D(' · 51.0k · ~$1.42 · ') + C('b', '███████') + D('░░░') + ' ' + C('B', '70%'),
        '  ' + C('B', 'agentview') + '  ' + C('d', `${SP} 0 ◔ 0 ✗ 0`) + ' ' + C('g', '✓ 7') + D(' · 88.4k · ~$2.31 · ') + C('g', '██████████') + ' ' + C('B', '100%'),
        '  ' + C('B', 'agentview') + '  ' + C('c', `${SP} 1`) + D(' · 6.2k · ~$0.04 · ░░░░░░░░░░ —'), '',
        lab('C · attention first  (shows the one thing that needs you; falls back to counts)'),
        '  ' + C('c', SP) + ` ${t.running} running · ${T} tok · ` + C('B', '60%') + D('   /agentview'),
        '  ' + C('y', '◔') + ' ' + C('y', 'reviewer waiting for permission') + D(' · Bash: rm -rf dist · /agentview'),
        '  ' + C('y', '!') + ' ' + C('y', 'write auth tests on "npm test" for 4m10s') + D(' · /agentview'),
        '  ' + C('rB', '✗') + ' ' + C('r', 'write auth tests failed') + D(' · exit 1 · /agentview'),
        '  ' + C('g', '✓') + ' ' + 'all 7 agents done' + D(' · 88.4k tok · ~$2.31 · 100%')
      ];
    };

    const manyAgents = () => {
      const L = [A(0, 'main', 'migrate webshop to vitest + new API', 'opus-5-5', 'running', 'Task: update API routes', 41200, 8300, 160000, 22000, 38, 905, 0.94)];
      const groups = [['worker', 'migrate db schema', 'sonnet', [['scout', 'list table usages', 'haiku'], ['Explore', 'find raw SQL', 'haiku']]], ['worker', 'update API routes', 'sonnet', [['worker', 'rewrite /users', 'sonnet'], ['worker', 'rewrite /orders', 'sonnet'], ['reviewer', 'check route types', 'sonnet']]], ['worker', 'port tests to vitest', 'sonnet', [['worker', 'port auth tests', 'sonnet'], ['worker', 'port cart tests', 'sonnet']]], ['worker', 'update docs', 'haiku', [['scout', 'collect changed APIs', 'haiku']]], ['worker', 'CI pipeline', 'sonnet', [['Explore', 'inspect workflows', 'haiku'], ['worker', 'edit ci.yml', 'sonnet']]]];
      const acts = ['Edit src/db/schema.ts', 'Read src/routes/users.ts', 'Grep "SELECT"', 'Bash: npm run build', 'Edit tests/cart.test.ts', 'Glob **/*.yml', 'Read docs/api.md', 'Edit .github/ci.yml'];
      let idx = 1;
      const add = (d, n, task, m) => { const i = 3000 + idx * 1300, o = 500 + idx * 170; const st = idx <= 3 || idx === 15 ? 'done' : idx === 9 ? 'waiting' : idx === 12 ? 'failed' : 'running'; L.push(A(d, n, task, m + '-5-5', st, acts[idx % acts.length], i, o, i * 3, i / 2 | 0, 5 + idx * 2, 30 + idx * 23, +((i * 3 + o * 15) / 1e6).toFixed(2))); idx++; };
      groups.forEach(g => { add(1, g[0], g[1], g[2]); g[3].forEach(c => add(2, c[0], c[1], c[2])); });
      return L;
    };

    const plan = { done: 6, total: 10, cur: 'Add token refresh to auth.ts' };
    const chat = [D('> fix the login bug and add tests'), D('● I\'ll split this into three tasks and delegate to subagents.'), D('  ⎿ Task(fix login bug) …'), ''];
    const failedA = base(); failedA[6] = { ...failedA[6], st: 'failed', act: 'Bash: npm test · exit 1', stuck: 0 };
    const waitA = base();
    const endA = base().map(x => ({ ...x, st: 'done', stuck: 0, act: x.d ? x.act : 'Task: final summary', secs: x.secs })); endA[0].secs = 862;
    const emptyA = [A(0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Read docs/auth.md', 2100, 380, 4000, 1700, 3, 41, 0.04)];
    const mAgents = manyAgents();
    const S = [];
    const add = (id, title, size, note, lines) => S.push({ id, title, size, note, lines });
    add('1a', 'In-session dialog · 120 cols', '120 × 22', 'Opened with /agentview over the chat; Esc closes it and the chat is untouched. Rows keep start-time order and only values change. Selected row is inverse. ▲ = expensive (≥ 40% of session cost or ≥ ~$0.50); ! on TIME = stuck on one action > 3 min. Finished rows go dim so live work stands out. Plan % comes only from the main agent\'s todo list.',
      [...chat, ...dialog({ W: 120, agents: base(), sel: 3, plan }), '', D('  agentview · 7 agents (') + C('c', '4 running') + D(') · 52.3k tok · ') + '60%']);
    add('1b', 'Same dialog · 160 cols', '160 × 14', 'Wide terminals add IN/OUT token split, tool-call count and MODEL; TASK and NOW get more room. Nothing moves left of the new columns.', dialog({ W: 160, agents: base(), sel: 3, plan }));
    add('2', 'Agent detail view · Enter on a row', '120 × 31', 'Enter swaps the tree for this view in place; Esc returns with the same row selected. ↑↓ steps to the previous/next agent without leaving. Actions are oldest → newest; the live one is bold with a spinner, failures are red with ✗. Token bars are relative to the largest bucket. The TODO list is this agent\'s own, never mixed into session plan %.', detail());
    add('3a', 'Dialog at 80 cols (narrow)', '80 × 14', 'Dropped: MODEL, TASK, COST (tier 2). Kept: tree, status glyph + word, NOW, TOK, TIME. The ▲ and ! markers survive in TOK/TIME only via color + marker, so cost warnings at 80 cols show in the header total instead.', [...chat.slice(0, 2), ...dialog({ W: 80, agents: base(), sel: 3, plan })]);
    add('3b', 'ASCII fallback · 80 cols', '80 × 14', 'Same layout, every glyph swapped 1:1 for a single ASCII character, so widths never change.', dialog({ W: 80, agents: base(), sel: 3, plan, ascii: true }));
    add('4', 'Status line entry · 3 variants', '80 × 29', 'One line under the prompt, always visible, dim by default. Only state words take color. A is closest to the brief; B scans fastest; C leads with whatever is stuck or blocked and only shows totals when all is well. No spinner animation here: one glyph at most, 4 fps.', statusLines());
    add('5', 'Standalone CLI · session list', '120 × 14', '`agentview` in a separate terminal. Active sessions first (running/waiting), then recent; each group keeps stable order by last start. Enter opens the session view; Esc does nothing at the root; q quits. At 80 cols SESSION, COST and LAST ACTION drop.', sessions()(120));
    add('5b', 'Session list · 80 cols', '80 × 14', 'Same drop rules as the dialog.', sessions()(80));
    add('6', 'Standalone CLI · single session', '120 × 20', 'The dialog design, full-screen, with the project path in the title bar. Esc goes back to the session list instead of closing; q quits. Fills the whole terminal height (rows are padded).', dialog({ W: 120, agents: base(), sel: 0, plan, path: '~/code/webshop', hints: [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'sessions'], ['q', 'quit']], minRows: 14 }));
    add('7a', 'State · empty (no subagents yet)', '80 × 13', 'Main is listed alone so the screen is never blank; a single dim line explains what will appear. Plan shows "—" when there is no todo list. No fake numbers.', dialog({ W: 80, agents: emptyA, sel: 0, plan: null, after: [D('  ◌ no subagents yet — they appear here as soon as main delegates')] }));
    add('7b', 'State · many agents (16 rows, scrolling)', '120 × 22', 'A 10-row window over 17 agents. The window moves one row at a time when the selection hits an edge; ┃ in the right border is the scroll thumb. Rows never re-sort, so a long list stays readable while it grows at the bottom.', dialog({ W: 120, agents: mAgents, sel: 9, plan: { done: 4, total: 12, cur: 'Update API routes' }, win: [3, 13] }));
    add('7c', 'State · failed subagent', '120 × 16', 'Failed row: red bold ✗, red action, header count turns red, and a one-line note under the list says what failed. Enter shows the last actions with the failing call marked ✗.', dialog({ W: 120, agents: failedA, sel: 6, plan, after: [C('rB', '✗ ') + C('r', 'write auth tests') + ' failed — Bash: npm test exited 1 after 4m10s ' + D('· ⏎ for output')] }));
    add('7d', 'State · waiting for permission', '120 × 16', 'Yellow ◔ + the word "waiting", with the pending tool shown in NOW. The note names the agent and where to answer; agentview never answers on the user\'s behalf.', dialog({ W: 120, agents: waitA, sel: 5, plan, after: [C('y', '◔ ') + C('yB', 'reviewer') + ' is waiting for permission: ' + C('y', 'Bash: rm -rf dist') + D(' · answer in the Claude Code prompt · 1m35s')] }));
    add('7e', 'State · finished session', '120 × 16', 'Everything dim except green ✓; spinner and live dot are gone ("ended"); plan bar turns green at 100%. The footer stays so Esc still works.', dialog({ W: 120, agents: endA, sel: 0, plan: { done: 10, total: 10, cur: 'all todos complete' }, ended: '14m22s', after: [C('g', '✓ ') + 'Finished in 14m22s — nothing is running']}));
    const copyOf = s => () => { const txt = plainOf(s.lines); try { navigator.clipboard.writeText(txt); } catch (e) {} this.setState({ copied: s.id }); setTimeout(() => this.setState({ copied: '' }), 1200); };
    const screens = S.map(s => ({
      id: s.id, anchor: s.id, title: s.title, size: s.size + ' · ' + s.lines.reduce((m, l) => Math.max(m, vl(l)), 0) + ' cols', note: s.note,
      inner: { __html: toHtml(s.lines.join('\n'), th, mode) }, copy: copyOf(s), copyLabel: this.state.copied === s.id ? 'Copied' : 'Copy text'
    }));
    const on = (v, cur) => v === cur ? { bg: 'var(--color-text)', fg: 'var(--color-bg)' } : { bg: 'transparent', fg: 'var(--color-text)' };
    const themeBtns = ['dark', 'light'].map(v => ({ label: v === 'dark' ? 'Dark' : 'Light', click: () => this.setState({ theme: v }), ...on(v, this.state.theme) }));
    const modeBtns = [['color', 'Color'], ['plain', 'Plain'], ['spec', 'Spec']].map(([v, l]) => ({ label: l, click: () => this.setState({ mode: v }), ...on(v, mode) }));
    const sw = (T, c, txt, extra) => toHtml(`{${c}|${txt}}`, T, 'color');
    const pal = [
      ['Running', 'spinner, word, running count', 'cyan 36', 'c', '● running', '80 / 30'],
      ['Waiting · attention', 'waiting status; stuck TIME (with !); expensive COST (bold, with ▲)', 'yellow 33', 'y', '◔ waiting', '214 / 130'],
      ['Done', '✓ done', 'green 32', 'g', '✓ done', '78 / 28'],
      ['Failed', '✗ failed (bold), error text', 'red 31 + bold 1', 'rB', '✗ failed', '203 / 160'],
      ['Plan progress', 'bar fill; turns green at 100%', 'blue 34 → green 32', 'b', '██████░░░░', '75 / 25'],
      ['Chrome · secondary', 'borders, rules, column heads, labels, finished rows', 'default fg + dim 2', 'd', '╭─ 12.4k tok', '— (never a gray)'],
      ['Primary text', 'agent names, tasks, current action', 'default fg 39', '', 'worker add token', '—'],
      ['Emphasis · brand', 'title, plan %, key names in footer', 'bold 1 (optional 256: 173)', 'B', 'agentview', '173 / 166'],
      ['Selection', 'selected row, full width', 'inverse 7 + bold 1', 'IB', '▸ worker  ⠋ running', '—']
    ];
    const palette = pal.map(([role, use, ansi, c, s, x]) => ({ role, use, ansi, x, d: toHtml(`{${c || 'zz'}|${s}}`.replace('{zz|', '{B|').replace(/^\{B\|(worker add token)/, '{zz|$1'), TH.dark, 'color').replace(/font-weight:700;/, c ? 'font-weight:700;' : '') , l: '' }));
    palette.forEach((p, i) => { const [, , , c, s] = pal[i]; const h = (T) => c ? toHtml(`{${c}|${s}}`, T, 'color') : `<span style="color:${T.fg}">${esc(s)}</span>`; const wrap = (T, hh) => `<span style="color:${T.fg}">${hh}</span>`; p.d = { __html: wrap(TH.dark, h(TH.dark)) }; p.l = { __html: wrap(TH.light, h(TH.light)) }; });
    const glyphs = [
      ['Status', 'running', '⠋', '*', 'cyan; animated (spinner below)'],
      ['Status', 'waiting', '◔', '!', 'yellow'],
      ['Status', 'done', '✓', '+', 'green'],
      ['Status', 'failed', '✗', 'x', 'red, bold'],
      ['Status', 'unknown', '?', '?', 'dim; no heartbeat > 60s'],
      ['Spinner', '10 frames @ 8 fps', '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏', '| / - \\', 'only running rows animate; reduced-motion: static ●  / *'],
      ['Tree', 'branch · last · trunk · gap', '├─  └─  │  ', '|-  `-  |   ', '3 cells per level'],
      ['Progress', 'filled · empty', '█ ░', '# -', 'plan bar 14 (80 cols) or 24 (wider) cells'],
      ['Frame', 'rounded corners · edges · tees', '╭╮╰╯ │ ─ ├┤┬┴', '+ | - +', 'scroll thumb ┃ → |'],
      ['Marker', 'selected · current todo · live', '▸  ▸  ●', '>  >  *', ''],
      ['Marker', 'expensive · stuck', '▲  !', '^  !', 'always paired with color'],
      ['Todo', 'done · active · pending', '✓ ▸ ◌', '+ > .', ''],
      ['Scroll', 'more above · below', '↑ ↓', '^ v', '']
    ].map(([group, name, u, a, note]) => ({ group, name, u, a, note }));
    const colRows = [
      ['Tree + name', 'always', '✓', '✓', '✓', 'Truncates with … first; connectors never dropped'],
      ['Status glyph + word', 'always', '✓', '✓', '✓', 'Fixed 9 cells; word is never dropped (color-independent)'],
      ['NOW (current action)', '1 · flex', '✓', '✓', '✓', 'Takes all spare width at 80; 60% of it above that'],
      ['TOK (in + out)', '1', '✓', '✓', '✓', 'Cache tokens only in detail view'],
      ['TIME', '1', '✓', '✓', '✓', '! suffix when stuck'],
      ['MODEL', '2', '—', '✓', '✓', 'Dim; full id e.g. sonnet-5-5'],
      ['TASK', '2 · flex', '—', '✓', '✓', '40% of spare width'],
      ['COST ~$', '2', '—', '✓', '✓', '▲ suffix when expensive; the header total stays at every width'],
      ['IN/OUT split', '3', '—', '—', '✓', 'Dim'],
      ['CALLS', '3', '—', '—', '✓', 'Tool-call count']
    ].map(([col, tier, a, b, c, note]) => ({ col, tier, a, b, c, note }));
    const keyRows = [
      ['In-session dialog', 'Move ▸ one row; window scrolls one row at an edge', 'Open agent detail', 'Close dialog, back to chat', 'Inert (modal)'],
      ['Agent detail', 'Previous / next agent', 'Inert', 'Back to tree, same row selected', 'Inert in dialog; quits in CLI'],
      ['CLI session list', 'Select session', 'Open session view', 'Inert at root', 'Quit'],
      ['CLI session view', 'Select agent', 'Open agent detail', 'Back to session list', 'Quit']
    ].map(([s, u, e, x, q]) => ({ s, u, e, x, q }));
    const rules = [
      'Calm updates: values redraw in place; rows are ordered by start time and never re-sort, even when status changes. New agents append under their parent.',
      'Redraw only changed cells; spinner runs at 8 fps on running rows only; everything else updates at most once per second.',
      'Selection is inverse + bold + ▸ marker, so it reads on any theme and in monochrome. It follows the agent (by id), not the row index, as the list grows.',
      'Expensive: cost ≥ 40% of session total or ≥ ~$0.50 → bold yellow with ▲. Stuck: same action > 3 min → yellow TIME with !. Both are subtle (one cell) and never reorder rows.',
      'Plan %: done ÷ total of the main agent\'s todo list only. No todo list → "—" in the header, an empty bar and a one-line explanation. Subagent todos appear only in their own detail view.',
      'Cost is always prefixed with ~ (estimate). Token totals = input + output; cache read/write are listed separately in the detail view.'
    ];
    return { th, screens, themeBtns, modeBtns, palette, glyphs, colRows, keyRows, rules };
  }
}
