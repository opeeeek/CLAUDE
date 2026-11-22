/* =====================================================================
   BM-Win · Statyka – generatory typowych schematów
   Zwracają { nodes, members, supports } (numeracja od podanych wartości).
   2D: płaszczyzna XY (Y pionowo); 3D: Z pionowo.
   ===================================================================== */
(function (root) {
  'use strict';
  const list = s => String(s || '').split(/[;\s]+/).map(v => +String(v).replace(',', '.')).filter(v => v > 0);
  const P2 = { pin: [1, 1, 0, 0, 0, 0], roll: [0, 1, 0, 0, 0, 0], fix: [1, 1, 0, 0, 0, 1] };
  const P3 = { pin: [1, 1, 1, 0, 0, 0], fix: [1, 1, 1, 1, 1, 1] };

  function ctx(start) {
    let nid = start.node || 1, mid = start.member || 1;
    const nodes = [], members = [], supports = [], key = new Map();
    const r6 = v => Math.round(v * 1e6) / 1e6;
    return {
      node(x, y, z = 0) { const k = `${r6(x)}|${r6(y)}|${r6(z)}`; if (key.has(k)) return key.get(k); const id = nid++; nodes.push({ id, x: r6(x), y: r6(y), z: r6(z) }); key.set(k, id); return id; },
      mem(n1, n2, sec, type, extra) { if (n1 === n2) return null; const m = Object.assign({ id: mid++, n1, n2, sec, type: type || 'beam', beta: 0, rel1: [0, 0, 0, 0, 0, 0], rel2: [0, 0, 0, 0, 0, 0] }, extra || {}); members.push(m); return m; },
      sup(node, fix) { supports.push({ node, fix: fix.slice(), k: [0, 0, 0, 0, 0, 0] }); },
      out() { return { nodes, members, supports }; }
    };
  }

  const GEN = {
    beam: {
      name: 'Belka jedno- / wieloprzęsłowa', dim: '2D',
      params: [['spans', 'Przęsła [m] (oddziel ;)', '6;6'], ['cl', 'Wspornik lewy [m]', '0'], ['cr', 'Wspornik prawy [m]', '0'], ['div', 'Podział przęsła na pręty', '1']],
      run(p, s, sec) {
        const c = ctx(s), spans = list(p.spans), cl = +p.cl || 0, cr = +p.cr || 0, dv = Math.max(1, Math.round(+p.div || 1));
        let x = 0, prev = null;
        const add = (L, isSpan) => { for (let k = 1; k <= dv; k++) { const n = c.node(x + L * k / dv, 0); c.mem(prev, n, sec); prev = n; } x += L; return prev; };
        prev = c.node(0, 0);
        if (cl > 0) { add(cl); }
        const firstSup = prev; c.sup(firstSup, P2.pin);
        spans.forEach(L => { const n = add(L); c.sup(n, P2.roll); });
        if (cr > 0) add(cr);
        return c.out();
      }
    },
    frame: {
      name: 'Rama płaska (wieloprzęsłowa, wielokondygnacyjna)', dim: '2D',
      params: [['bays', 'Przęsła [m]', '6;6'], ['storeys', 'Kondygnacje [m] (od dołu)', '4;3,5'], ['base', 'Podparcie słupów (fix/pin)', 'fix']],
      run(p, s, sec, sec2) {
        const c = ctx(s), bays = list(p.bays), st = list(p.storeys);
        const xs = [0]; bays.forEach(b => xs.push(xs[xs.length - 1] + b));
        const ys = [0]; st.forEach(h => ys.push(ys[ys.length - 1] + h));
        xs.forEach(x => c.sup(c.node(x, 0), p.base === 'pin' ? P2.pin : P2.fix));
        for (let j = 1; j < ys.length; j++) {
          xs.forEach(x => c.mem(c.node(x, ys[j - 1]), c.node(x, ys[j]), sec2 || sec, 'beam', { role: 'column' }));
          for (let i = 1; i < xs.length; i++) c.mem(c.node(xs[i - 1], ys[j]), c.node(xs[i], ys[j]), sec, 'beam', { role: 'beam' });
        }
        return c.out();
      }
    },
    gable: {
      name: 'Rama portalowa z dachem dwuspadowym', dim: '2D',
      params: [['L', 'Rozpiętość [m]', '18'], ['H', 'Wysokość słupów [m]', '6'], ['a', 'Kąt dachu [°]', '10'], ['base', 'Podparcie (fix/pin)', 'pin']],
      run(p, s, sec, sec2) {
        const c = ctx(s), L = +p.L, H = +p.H, f = L / 2 * Math.tan((+p.a || 0) * Math.PI / 180);
        const a = c.node(0, 0), b = c.node(0, H), k = c.node(L / 2, H + f), d = c.node(L, H), e = c.node(L, 0);
        c.mem(a, b, sec2 || sec, 'beam', { role: 'column' }); c.mem(b, k, sec, 'beam', { role: 'rafter' }); c.mem(k, d, sec, 'beam', { role: 'rafter' }); c.mem(d, e, sec2 || sec, 'beam', { role: 'column' });
        const fx = p.base === 'fix' ? P2.fix : P2.pin; c.sup(a, fx); c.sup(e, fx);
        return c.out();
      }
    },
    truss: {
      name: 'Kratownica (Pratt / Howe / Warren / trójkątna)', dim: '2D',
      params: [['type', 'Typ (pratt/howe/warren/tri)', 'pratt'], ['L', 'Rozpiętość [m]', '12'], ['H', 'Wysokość [m]', '1,5'], ['n', 'Liczba przedziałów (parzysta)', '6']],
      run(p, s, sec) {
        const c = ctx(s), L = +String(p.L).replace(',', '.'), H = +String(p.H).replace(',', '.'); let n = Math.max(2, Math.round(+p.n || 6)); if (n % 2) n++;
        const t = String(p.type || 'pratt').toLowerCase(), dx = L / n;
        const bot = [], top = [];
        for (let i = 0; i <= n; i++) bot.push(c.node(i * dx, 0));
        const hAt = x => t === 'tri' ? H * (1 - Math.abs(2 * x / L - 1)) : H;
        for (let i = 0; i <= n; i++) top.push(t === 'tri' && (i === 0 || i === n) ? bot[i] : c.node(i * dx, hAt(i * dx)));
        for (let i = 0; i < n; i++) { c.mem(bot[i], bot[i + 1], sec, 'truss'); c.mem(top[i], top[i + 1], sec, 'truss'); }
        for (let i = 1; i < n; i++) c.mem(bot[i], top[i], sec, 'truss');
        if (t !== 'tri') { c.mem(bot[0], top[0], sec, 'truss'); c.mem(bot[n], top[n], sec, 'truss'); }
        for (let i = 0; i < n; i++) {
          const left = i < n / 2;
          if (t === 'warren') { if (i % 2 === 0) c.mem(bot[i], top[i + 1], sec, 'truss'); else c.mem(top[i], bot[i + 1], sec, 'truss'); }
          else if (t === 'howe') { if (left) c.mem(bot[i], top[i + 1], sec, 'truss'); else c.mem(top[i], bot[i + 1], sec, 'truss'); }
          else { if (left) c.mem(top[i], bot[i + 1], sec, 'truss'); else c.mem(bot[i], top[i + 1], sec, 'truss'); }
        }
        c.sup(bot[0], P2.pin); c.sup(bot[n], P2.roll);
        return c.out();
      }
    },
    space: {
      name: 'Rama przestrzenna (szkielet budynku)', dim: '3D',
      params: [['bx', 'Przęsła w kierunku X [m]', '6;6'], ['by', 'Przęsła w kierunku Y [m]', '5;5'], ['storeys', 'Kondygnacje [m] (od dołu)', '4;3,5'], ['base', 'Podparcie słupów (fix/pin)', 'fix']],
      run(p, s, sec, sec2) {
        const c = ctx(s), bx = list(p.bx), by = list(p.by), st = list(p.storeys);
        const cum = a => { const r = [0]; a.forEach(v => r.push(r[r.length - 1] + v)); return r; };
        const xs = cum(bx), ys = cum(by), zs = cum(st);
        xs.forEach(x => ys.forEach(y => c.sup(c.node(x, y, 0), p.base === 'pin' ? P3.pin : P3.fix)));
        for (let k = 1; k < zs.length; k++) {
          xs.forEach(x => ys.forEach(y => c.mem(c.node(x, y, zs[k - 1]), c.node(x, y, zs[k]), sec2 || sec, 'beam', { role: 'column' })));
          ys.forEach(y => { for (let i = 1; i < xs.length; i++) c.mem(c.node(xs[i - 1], y, zs[k]), c.node(xs[i], y, zs[k]), sec, 'beam', { role: 'beam' }); });
          xs.forEach(x => { for (let j = 1; j < ys.length; j++) c.mem(c.node(x, ys[j - 1], zs[k]), c.node(x, ys[j], zs[k]), sec, 'beam', { role: 'beam' }); });
        }
        return c.out();
      }
    },
    grid: {
      name: 'Ruszt belek (płaski, w poziomie)', dim: '3D',
      params: [['bx', 'Przęsła w kierunku X [m]', '5;5'], ['by', 'Przęsła w kierunku Y [m]', '4;4'], ['z', 'Poziom Z [m]', '0']],
      run(p, s, sec) {
        const c = ctx(s), bx = list(p.bx), by = list(p.by), z = +p.z || 0;
        const cum = a => { const r = [0]; a.forEach(v => r.push(r[r.length - 1] + v)); return r; };
        const xs = cum(bx), ys = cum(by);
        ys.forEach(y => { for (let i = 1; i < xs.length; i++) c.mem(c.node(xs[i - 1], y, z), c.node(xs[i], y, z), sec); });
        xs.forEach(x => { for (let j = 1; j < ys.length; j++) c.mem(c.node(x, ys[j - 1], z), c.node(x, ys[j], z), sec); });
        // podparcie na obwodzie – przegubowe przesuwne w pionie
        xs.forEach((x, i) => ys.forEach((y, j) => { if (i === 0 || j === 0 || i === xs.length - 1 || j === ys.length - 1) c.sup(c.node(x, y, z), i === 0 && j === 0 ? [1, 1, 1, 0, 0, 0] : (i === 0 || i === xs.length - 1) && j === 0 ? [0, 1, 1, 0, 0, 0] : [0, 0, 1, 0, 0, 0]); }));
        return c.out();
      }
    }
  };

  root.BMGEN = GEN;
})(typeof self !== 'undefined' ? self : this);
