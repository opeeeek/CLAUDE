/* Rama2D – operacje na modelu, generatory i przykłady */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.R2M = factory(root.R2E);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const TOL = 1e-4;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function uid(m) { m.uid = (m.uid || 1) + 1; return m.uid; }

  function blank() {
    const m = { ver: 1, name: 'Nowy projekt', uid: 1, nodes: [], members: [], mats: [], secs: [], cases: [], groups: [], combos: [], set: clone(E.DEF_SET) };
    const s235 = addMat(m, 'S235'), c30 = addMat(m, 'C30/37');
    addSec(m, { name: 'IPE 300', shape: 'cat', cat: 'IPE 300', mat: s235 });
    addSec(m, { name: 'HEB 200', shape: 'cat', cat: 'HEB 200', mat: s235 });
    addSec(m, { name: 'Prostokąt 300×500', shape: 'rect', b: 300, h: 500, mat: c30 });
    m.cases.push({ uid: uid(m), name: 'Ciężar własny', type: 'G', selfWeight: true, loads: [] });
    return m;
  }
  function addMat(m, key) {
    const t = E.MATS.find(x => x.key === key) || { key: 'Własny', E: 210, g: 78.5, a: 1.2e-5 };
    const u = uid(m);
    m.mats.push({ uid: u, name: t.key, key: t.key, E: t.E, g: t.g, a: t.a });
    return u;
  }
  function addSec(m, s) { const u = uid(m); m.secs.push(Object.assign({ uid: u }, s)); return u; }

  // ------------------------------------------------------------------ przekroje prętów
  function uniqueSecName(m, base) {
    base = String(base || 'Przekrój').replace(/\s*\(\d+\)$/, '');
    const names = new Set(m.secs.map(s => s.name));
    if (!names.has(base)) return base;
    for (let k = 2; ; k++) if (!names.has(base + ' (' + k + ')')) return base + ' (' + k + ')';
  }
  // kopia przekroju (nowy uid, unikalna nazwa); zwraca uid kopii
  function cloneSec(m, secUid, name) {
    const s = m.secs.find(x => x.uid === secUid); if (!s) return null;
    const c = Object.assign(clone(s), { uid: uid(m) });
    c.name = uniqueSecName(m, name || s.name);
    m.secs.splice(m.secs.indexOf(s) + 1, 0, c);
    return c.uid;
  }
  function assignSec(m, memUids, secUid) {
    if (!m.secs.some(s => s.uid === secUid)) return 0;
    let n = 0;
    for (const mem of m.members) if (memUids.indexOf(mem.uid) >= 0 && mem.sec !== secUid) { mem.sec = secUid; n++; }
    return n;
  }
  function secUsage(m, secUid) { return m.members.filter(x => x.sec === secUid).map(x => x.uid); }
  // nadaje prętowi (lub grupie prętów) własny przekrój, jeśli obecny jest współdzielony z innymi
  function separateSec(m, memUids) {
    const mems = m.members.filter(x => memUids.indexOf(x.uid) >= 0);
    if (!mems.length) return null;
    const src = mems[0].sec;
    const others = m.members.filter(x => x.sec === src && memUids.indexOf(x.uid) < 0);
    if (!others.length && mems.every(x => x.sec === src)) return src;
    const nu = cloneSec(m, src, (m.secs.find(s => s.uid === src) || {}).name);
    for (const x of mems) x.sec = nu;
    return nu;
  }
  // usuwa przekroje nieprzypisane do żadnego pręta (zostawia co najmniej jeden)
  function purgeSecs(m) {
    const used = new Set(m.members.map(x => x.sec));
    const before = m.secs.length;
    const keep = m.secs.filter(s => used.has(s.uid));
    m.secs = keep.length ? keep : m.secs.slice(0, 1);
    return before - m.secs.length;
  }

  // uzupełnienie brakujących pól (pliki z innych wersji)
  function normalize(m) {
    m = m || blank();
    m.ver = 1; m.nodes = m.nodes || []; m.members = m.members || []; m.mats = m.mats || []; m.secs = m.secs || [];
    m.cases = m.cases || []; m.groups = m.groups || []; m.combos = m.combos || [];
    m.set = Object.assign(clone(E.DEF_SET), m.set || {});
    let mx = m.uid || 1;
    const all = [].concat(m.nodes, m.members, m.mats, m.secs, m.cases, m.groups, m.combos);
    for (const c of m.cases) { c.loads = c.loads || []; all.push(...c.loads); }
    for (const o of all) if (o.uid > mx) mx = o.uid;
    m.uid = mx;
    for (const o of all) if (!o.uid) o.uid = uid(m);
    return m;
  }

  const nodeBy = (m, u) => m.nodes.find(n => n.uid === u);
  const memBy = (m, u) => m.members.find(x => x.uid === u);
  function memLen(m, mem) { const a = nodeBy(m, mem.i), b = nodeBy(m, mem.j); return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0; }
  function findNodeAt(m, x, y, tol) { tol = tol || TOL; return m.nodes.find(n => Math.abs(n.x - x) <= tol && Math.abs(n.y - y) <= tol) || null; }

  // rzut punktu na pręt: {t (m od początku), d (odległość), L}
  function projOnMember(m, mem, x, y) {
    const a = nodeBy(m, mem.i), b = nodeBy(m, mem.j);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const t = ((x - a.x) * dx + (y - a.y) * dy) / L;
    const px = a.x + dx * t / L, py = a.y + dy * t / L;
    return { t, d: Math.hypot(x - px, y - py), L, px, py };
  }

  // podział obciążeń pręta przy dzieleniu w punkcie s (m od początku)
  function splitLoads(m, mem, s, mem2uid) {
    const L = memLen(m, mem);
    for (const c of m.cases) {
      const add = [];
      for (const ld of c.loads) {
        if (ld.m !== mem.uid) continue;
        if (ld.type === 'T') { add.push(Object.assign(clone(ld), { uid: uid(m), m: mem2uid })); continue; }
        if (ld.type === 'F' || ld.type === 'Mm') {
          const x = E.posAbs(ld.x, ld.mode, L);
          if (x > s + 1e-9) { ld.m = mem2uid; ld.x = x - s; ld.mode = 'abs'; }
          else { ld.x = x; ld.mode = 'abs'; }
          continue;
        }
        if (ld.type === 'q') {
          if (ld.full) { add.push(Object.assign(clone(ld), { uid: uid(m), m: mem2uid })); continue; }
          let a = E.posAbs(ld.x1, ld.mode, L), b = E.posAbs(ld.x2, ld.mode, L);
          let q1 = +ld.q1 || 0, q2 = (ld.q2 === undefined || ld.q2 === null) ? q1 : +ld.q2;
          if (a > b) { [a, b] = [b, a]; [q1, q2] = [q2, q1]; }
          const qAt = (x) => b > a ? q1 + (q2 - q1) * (x - a) / (b - a) : q1;
          const p1 = [a, Math.min(b, s)], p2 = [Math.max(a, s), b];
          const has1 = p1[1] - p1[0] > 1e-9, has2 = p2[1] - p2[0] > 1e-9;
          if (has2) {
            const n = Object.assign(clone(ld), { uid: uid(m), m: mem2uid, mode: 'abs', x1: p2[0] - s, x2: p2[1] - s, q1: qAt(p2[0]), q2: qAt(p2[1]) });
            n.full = Math.abs(n.x1) < 1e-9 && Math.abs(n.x2 - (L - s)) < 1e-9;
            add.push(n);
          }
          if (has1) {
            Object.assign(ld, { mode: 'abs', x1: p1[0], x2: p1[1], q1: qAt(p1[0]), q2: qAt(p1[1]) });
            ld.full = Math.abs(ld.x1) < 1e-9 && Math.abs(ld.x2 - s) < 1e-9;
          } else ld._del = true;
        }
      }
      c.loads = c.loads.filter(l => !l._del).concat(add);
    }
  }

  // dzieli pręt węzłem leżącym na pręcie
  function splitMemberAtNode(m, memUid, nodeUid) {
    const mem = memBy(m, memUid), n = nodeBy(m, nodeUid);
    if (!mem || !n || mem.i === nodeUid || mem.j === nodeUid) return null;
    const p = projOnMember(m, mem, n.x, n.y);
    if (p.t <= TOL || p.t >= p.L - TOL) return null;
    const m2 = Object.assign(clone(mem), { uid: uid(m), i: nodeUid, ri: false });
    splitLoads(m, mem, p.t, m2.uid);
    mem.j = nodeUid; mem.rj = false;
    m.members.splice(m.members.indexOf(mem) + 1, 0, m2);
    return m2.uid;
  }

  function addNode(m, x, y, opts) {
    x = +(+x).toFixed(6); y = +(+y).toFixed(6);
    const ex = findNodeAt(m, x, y);
    if (ex) return ex.uid;
    const n = { uid: uid(m), x, y, hinge: false, sup: null };
    m.nodes.push(n);
    if (!opts || opts.split !== false) {
      for (const mem of m.members.slice()) {
        const p = projOnMember(m, mem, x, y);
        if (p.d <= TOL && p.t > TOL && p.t < p.L - TOL) splitMemberAtNode(m, mem.uid, n.uid);
      }
    }
    return n.uid;
  }

  // dodaje pręt (lub łańcuch prętów przez istniejące węzły leżące na odcinku)
  function addMember(m, x1, y1, x2, y2, props) {
    props = props || {};
    const a = addNode(m, x1, y1), b = addNode(m, x2, y2);
    if (a === b) return [];
    const A = nodeBy(m, a), B = nodeBy(m, b);
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    const mids = [];
    for (const n of m.nodes) {
      if (n.uid === a || n.uid === b) continue;
      const t = ((n.x - A.x) * dx + (n.y - A.y) * dy) / L;
      const d = Math.abs((n.x - A.x) * dy - (n.y - A.y) * dx) / L;
      if (d <= TOL && t > TOL && t < L - TOL) mids.push({ t, u: n.uid });
    }
    mids.sort((p, q) => p.t - q.t);
    const chain = [a, ...mids.map(p => p.u), b];
    // orientacja: od lewej do prawej, pręty pionowe od dołu do góry (spody na dole / po prawej)
    if (props.keepDir !== true && (dx < -TOL || (Math.abs(dx) <= TOL && dy < 0))) {
      chain.reverse();
      const t = props.ri; props = Object.assign({}, props, { ri: props.rj, rj: t });
    }
    const out = [];
    for (let k = 0; k < chain.length - 1; k++) {
      const i = chain[k], j = chain[k + 1];
      if (m.members.some(x => (x.i === i && x.j === j) || (x.i === j && x.j === i))) continue;
      const mem = { uid: uid(m), i, j, sec: props.sec || (m.secs[0] && m.secs[0].uid),
        ri: !!(props.truss || (k === 0 && props.ri)), rj: !!(props.truss || (k === chain.length - 2 && props.rj)) };
      m.members.push(mem); out.push(mem.uid);
    }
    return out;
  }

  function splitMemberN(m, memUid, n) {
    const mem = memBy(m, memUid); if (!mem || n < 2) return;
    const A = nodeBy(m, mem.i), B = nodeBy(m, mem.j);
    const pts = [];
    for (let k = 1; k < n; k++) pts.push([A.x + (B.x - A.x) * k / n, A.y + (B.y - A.y) * k / n]);
    for (const [x, y] of pts) addNode(m, x, y);
  }
  function splitMemberAt(m, memUid, t) {
    const mem = memBy(m, memUid); if (!mem) return null;
    const A = nodeBy(m, mem.i), B = nodeBy(m, mem.j), L = memLen(m, mem);
    if (!(t > TOL && t < L - TOL)) return null;
    return addNode(m, A.x + (B.x - A.x) * t / L, A.y + (B.y - A.y) * t / L);
  }

  function reverseMember(m, memUid) {
    const mem = memBy(m, memUid); if (!mem) return;
    const L = memLen(m, mem);
    [mem.i, mem.j] = [mem.j, mem.i]; [mem.ri, mem.rj] = [mem.rj, mem.ri];
    for (const c of m.cases) for (const ld of c.loads) {
      if (ld.m !== memUid) continue;
      if (ld.type === 'T') { ld.dTg = -(+ld.dTg || 0); continue; }
      if (ld.type === 'F' || ld.type === 'Mm') {
        ld.x = L - E.posAbs(ld.x, ld.mode, L); ld.mode = 'abs';
      }
      if (ld.type === 'q' && !ld.full) {
        const a = L - E.posAbs(ld.x1, ld.mode, L), b = L - E.posAbs(ld.x2, ld.mode, L);
        ld.x1 = b; ld.x2 = a; [ld.q1, ld.q2] = [ld.q2 === undefined ? ld.q1 : ld.q2, ld.q1]; ld.mode = 'abs';
      }
      if ((ld.type === 'q' || ld.type === 'F') && (ld.dir === 'n' || ld.dir === 't')) {
        if (ld.type === 'q') { ld.q1 = -(+ld.q1 || 0); if (ld.q2 !== undefined) ld.q2 = -(+ld.q2 || 0); }
        else ld.F = -(+ld.F || 0);
      }
    }
  }

  function deleteMembers(m, uids, keepNodes) {
    const set = new Set(uids);
    const touched = new Set();
    m.members = m.members.filter(x => { if (set.has(x.uid)) { touched.add(x.i); touched.add(x.j); return false; } return true; });
    for (const c of m.cases) c.loads = c.loads.filter(l => !set.has(l.m));
    if (!keepNodes) {
      const orphan = [...touched].filter(u => !m.members.some(x => x.i === u || x.j === u));
      const loaded = new Set(); for (const c of m.cases) for (const l of c.loads) if (l.node) loaded.add(l.node);
      const del = orphan.filter(u => { const n = nodeBy(m, u); return n && !n.sup && !loaded.has(u); });
      if (del.length) m.nodes = m.nodes.filter(n => del.indexOf(n.uid) < 0);
    }
  }
  function deleteNodes(m, uids) {
    const set = new Set(uids);
    deleteMembers(m, m.members.filter(x => set.has(x.i) || set.has(x.j)).map(x => x.uid), true);
    m.nodes = m.nodes.filter(n => !set.has(n.uid));
    for (const c of m.cases) c.loads = c.loads.filter(l => !set.has(l.node));
  }

  // przesunięcie węzła (z kontrolą scalania)
  function moveNode(m, u, x, y) {
    const n = nodeBy(m, u); if (!n) return false;
    const ex = findNodeAt(m, x, y);
    if (ex && ex.uid !== u) return false;
    n.x = +(+x).toFixed(6); n.y = +(+y).toFixed(6);
    return true;
  }

  // ------------------------------------------------------------------ obciążenia
  function addLoad(m, caseUid, ld) {
    const c = m.cases.find(x => x.uid === caseUid); if (!c) return null;
    const l = Object.assign({ uid: uid(m) }, clone(ld));
    c.loads.push(l); return l.uid;
  }
  function addCase(m, o) {
    const c = Object.assign({ uid: uid(m), name: 'Przypadek', type: 'G', loads: [] }, o || {});
    if (c.type === 'Q' && !c.cat) c.cat = 'B';
    m.cases.push(c); return c.uid;
  }
  function addGroup(m, name, mode) { const g = { uid: uid(m), name, mode: mode || 'excl' }; m.groups.push(g); return g.uid; }

  // ------------------------------------------------------------------ generatory
  function secUid(m, name) { const s = m.secs.find(x => x.name === name); return s ? s.uid : m.secs[0].uid; }
  function sup(type, extra) { return Object.assign({ type, rx: 0, ry: 0, rz: 0, kx: 0, ky: 0, kz: 0, ang: 0, b: 0 }, extra || {}); }
  function setSup(m, x, y, type, extra) { const n = findNodeAt(m, x, y); if (n) n.sup = sup(type, extra); return n; }

  const GEN = {
    beam: {
      n: 'Belka ciągła / wspornikowa',
      p: [['spans', 'Rozpiętości przęseł [m]', '6; 6'], ['cl', 'Wspornik lewy [m]', '0'], ['cr', 'Wspornik prawy [m]', '0'], ['b', 'Szerokość podpór [m]', '0']],
      run(m, o, x0, y0, sec) {
        const sp = list(o.spans); const cl = +o.cl || 0, cr = +o.cr || 0;
        let x = x0;
        if (cl > 0) { addMember(m, x - cl, y0, x, y0, { sec }); }
        const xs = [x];
        for (const L of sp) { addMember(m, x, y0, x + L, y0, { sec }); x += L; xs.push(x); }
        if (cr > 0) addMember(m, x, y0, x + cr, y0, { sec });
        xs.forEach((xx, k) => setSup(m, xx, y0, k === 0 ? 'pin' : 'rollH', { b: +o.b || 0 }));
      }
    },
    frame: {
      n: 'Rama portalowa / wielokondygnacyjna',
      p: [['bays', 'Rozpiętości naw [m]', '6'], ['st', 'Wysokości kondygnacji [m] (od dołu)', '4'], ['base', 'Podpory słupów (fix / pin)', 'fix']],
      run(m, o, x0, y0, sec, sec2) {
        const bays = list(o.bays), st = list(o.st);
        const xs = [x0]; bays.forEach(b => xs.push(xs[xs.length - 1] + b));
        const ys = [y0]; st.forEach(h => ys.push(ys[ys.length - 1] + h));
        for (let k = 0; k < st.length; k++) for (const x of xs) addMember(m, x, ys[k], x, ys[k + 1], { sec: sec2 });
        for (let k = 1; k < ys.length; k++) for (let b = 0; b < bays.length; b++) addMember(m, xs[b], ys[k], xs[b + 1], ys[k], { sec });
        for (const x of xs) setSup(m, x, y0, String(o.base).trim() === 'pin' ? 'pin' : 'fix');
      }
    },
    gable: {
      n: 'Rama dwuspadowa',
      p: [['L', 'Rozpiętość [m]', '12'], ['h', 'Wysokość słupów [m]', '5'], ['f', 'Wyniesienie kalenicy [m]', '1.5'], ['base', 'Podpory (fix / pin)', 'pin']],
      run(m, o, x0, y0, sec, sec2) {
        const L = +o.L || 12, h = +o.h || 5, f = +o.f || 1.5;
        addMember(m, x0, y0, x0, y0 + h, { sec: sec2 });
        addMember(m, x0 + L, y0, x0 + L, y0 + h, { sec: sec2 });
        addMember(m, x0, y0 + h, x0 + L / 2, y0 + h + f, { sec });
        addMember(m, x0 + L / 2, y0 + h + f, x0 + L, y0 + h, { sec });
        const t = String(o.base).trim() === 'fix' ? 'fix' : 'pin';
        setSup(m, x0, y0, t); setSup(m, x0 + L, y0, t);
      }
    },
    truss: {
      n: 'Kratownica',
      p: [['type', 'Typ: pratt / howe / warren / trojkat', 'pratt'], ['L', 'Rozpiętość [m]', '12'], ['h', 'Wysokość [m]', '1.5'], ['n', 'Liczba przedziałów (parzysta)', '6']],
      run(m, o, x0, y0, sec) {
        const L = +o.L || 12, h = +o.h || 1.5; let n = Math.max(2, Math.round(+o.n || 6)); if (n % 2) n++;
        const type = String(o.type || 'pratt').trim().toLowerCase();
        const d = L / n, P = { sec, truss: true };
        const top = (k) => type.startsWith('troj') ? y0 + h * (1 - Math.abs(2 * k / n - 1)) : y0 + h;
        for (let k = 0; k < n; k++) addMember(m, x0 + k * d, y0, x0 + (k + 1) * d, y0, P);
        if (type === 'warren') {
          // pas górny przesunięty o pół przedziału
          for (let k = 0; k < n - 1; k++) addMember(m, x0 + (k + 0.5) * d, y0 + h, x0 + (k + 1.5) * d, y0 + h, P);
          for (let k = 0; k < n; k++) {
            addMember(m, x0 + k * d, y0, x0 + (k + 0.5) * d, y0 + h, P);
            addMember(m, x0 + (k + 0.5) * d, y0 + h, x0 + (k + 1) * d, y0, P);
          }
        } else {
          for (let k = 0; k < n; k++) addMember(m, x0 + k * d, top(k), x0 + (k + 1) * d, top(k + 1), P);
          for (let k = 1; k < n; k++) addMember(m, x0 + k * d, y0, x0 + k * d, top(k), P);
          if (!type.startsWith('troj')) { addMember(m, x0, y0, x0, top(0), P); addMember(m, x0 + L, y0, x0 + L, top(n), P); }
          for (let k = 0; k < n; k++) {
            const left = k < n / 2;
            const howe = type === 'howe';
            // Pratt: krzyżulce rozciągane (opadają ku środkowi), Howe: odwrotnie
            const down = left ? !howe : howe;
            if (down) addMember(m, x0 + k * d, top(k), x0 + (k + 1) * d, y0, P);
            else addMember(m, x0 + k * d, y0, x0 + (k + 1) * d, top(k + 1), P);
          }
        }
        setSup(m, x0, y0, 'pin'); setSup(m, x0 + L, y0, 'rollH');
      }
    }
  };
  function list(s) { return String(s).split(/[;\s]+/).map(v => parseFloat(v.replace(',', '.'))).filter(v => v > 0); }

  // ------------------------------------------------------------------ przykłady
  const EXAMPLES = [
    {
      n: 'Rama portalowa stalowa – G, śnieg, wiatr L/P',
      build() {
        const m = blank(); m.name = 'Rama portalowa stalowa';
        const ipe = secUid(m, 'IPE 300'), heb = secUid(m, 'HEB 200');
        addMember(m, 0, 0, 0, 5, { sec: heb }); addMember(m, 12, 0, 12, 5, { sec: heb }); addMember(m, 0, 5, 12, 5, { sec: ipe });
        setSup(m, 0, 0, 'fix'); setSup(m, 12, 0, 'fix');
        const rygiel = m.members[2].uid, sl = m.members[0].uid, sp = m.members[1].uid;
        const g2 = addCase(m, { name: 'Pokrycie i instalacje', type: 'G' });
        addLoad(m, g2, { type: 'q', m: rygiel, dir: 'Y', full: true, q1: 0.6, q2: 0.6, unit: 'm2', bw: 6 });
        const s = addCase(m, { name: 'Śnieg', type: 'Q', cat: 'S1' });
        addLoad(m, s, { type: 'q', m: rygiel, dir: 'Y', proj: true, full: true, q1: 0.72, q2: 0.72, unit: 'm2', bw: 6 });
        const gw = addGroup(m, 'Wiatr', 'excl');
        const wl = addCase(m, { name: 'Wiatr z lewej', type: 'Q', cat: 'W', grp: gw });
        addLoad(m, wl, { type: 'q', m: sl, dir: 'X', full: true, q1: 0.45, q2: 0.45, unit: 'm2', bw: 6 });
        addLoad(m, wl, { type: 'q', m: sp, dir: 'X', full: true, q1: 0.25, q2: 0.25, unit: 'm2', bw: 6 });
        addLoad(m, wl, { type: 'q', m: rygiel, dir: 'Y', full: true, q1: -0.4, q2: -0.4, unit: 'm2', bw: 6 });
        const wp = addCase(m, { name: 'Wiatr z prawej', type: 'Q', cat: 'W', grp: gw });
        addLoad(m, wp, { type: 'q', m: sp, dir: 'X', full: true, q1: -0.45, q2: -0.45, unit: 'm2', bw: 6 });
        addLoad(m, wp, { type: 'q', m: sl, dir: 'X', full: true, q1: -0.25, q2: -0.25, unit: 'm2', bw: 6 });
        addLoad(m, wp, { type: 'q', m: rygiel, dir: 'Y', full: true, q1: -0.4, q2: -0.4, unit: 'm2', bw: 6 });
        const hq = addCase(m, { name: 'Wciągarka (siła skupiona)', type: 'Q', cat: 'E' });
        addLoad(m, hq, { type: 'F', m: rygiel, dir: 'Y', F: 20, x: 4, mode: 'abs' });
        return m;
      }
    },
    {
      n: 'Belka ciągła żelbetowa 3-przęsłowa – obciążenie szachownicowe, szerokość podpór',
      build() {
        const m = blank(); m.name = 'Belka ciągła 3-przęsłowa';
        const s = secUid(m, 'Prostokąt 300×500');
        GEN.beam.run(m, { spans: '5; 6; 5', cl: 0, cr: 0, b: 0.3 }, 0, 0, s);
        const g2 = addCase(m, { name: 'Stropy, posadzki, ścianki', type: 'G' });
        for (const x of m.members) addLoad(m, g2, { type: 'q', m: x.uid, dir: 'Y', full: true, q1: 18, q2: 18 });
        const gu = addGroup(m, 'Użytkowe – układ szachownicowy', 'sum');
        m.members.forEach((x, k) => {
          const c = addCase(m, { name: 'Użytkowe – przęsło ' + (k + 1), type: 'Q', cat: 'B', grp: gu });
          addLoad(m, c, { type: 'q', m: x.uid, dir: 'Y', full: true, q1: 12, q2: 12 });
        });
        return m;
      }
    },
    {
      n: 'Kratownica Pratta – obciążenia węzłowe',
      build() {
        const m = blank(); m.name = 'Kratownica Pratta';
        const s = addSec(m, { name: 'Rura 114,3×5', shape: 'tube', d: 114.3, t: 5, mat: m.mats[0].uid });
        m.cases[0].selfWeight = true;
        GEN.truss.run(m, { type: 'pratt', L: 18, h: 2, n: 6 }, 0, 0, s);
        const g = addCase(m, { name: 'Pokrycie dachu', type: 'G' });
        const sn = addCase(m, { name: 'Śnieg', type: 'Q', cat: 'S1' });
        for (let k = 0; k <= 6; k++) {
          const n = findNodeAt(m, k * 3, 2); if (!n) continue;
          const f = (k === 0 || k === 6) ? 0.5 : 1;
          addLoad(m, g, { type: 'P', node: n.uid, Fx: 0, Fy: 9 * f, M: 0 });
          addLoad(m, sn, { type: 'P', node: n.uid, Fx: 0, Fy: 13 * f, M: 0 });
        }
        return m;
      }
    },
    {
      n: 'Rama dwuspadowa – śnieg na rzut poziomy, wiatr prostopadły do połaci',
      build() {
        const m = blank(); m.name = 'Rama dwuspadowa';
        const ipe = secUid(m, 'IPE 300'), heb = secUid(m, 'HEB 200');
        GEN.gable.run(m, { L: 15, h: 5, f: 2, base: 'fix' }, 0, 0, ipe, heb);
        const [cl, cr, r1, r2] = m.members.map(x => x.uid);
        const g = addCase(m, { name: 'Pokrycie', type: 'G' });
        addLoad(m, g, { type: 'q', m: r1, dir: 'Y', full: true, q1: 0.5, q2: 0.5, unit: 'm2', bw: 6 });
        addLoad(m, g, { type: 'q', m: r2, dir: 'Y', full: true, q1: 0.5, q2: 0.5, unit: 'm2', bw: 6 });
        const gs = addGroup(m, 'Śnieg', 'excl');
        const s1 = addCase(m, { name: 'Śnieg – równomierny', type: 'Q', cat: 'S1', grp: gs });
        addLoad(m, s1, { type: 'q', m: r1, dir: 'Y', proj: true, full: true, q1: 0.72, q2: 0.72, unit: 'm2', bw: 6 });
        addLoad(m, s1, { type: 'q', m: r2, dir: 'Y', proj: true, full: true, q1: 0.72, q2: 0.72, unit: 'm2', bw: 6 });
        const s2 = addCase(m, { name: 'Śnieg – nierównomierny', type: 'Q', cat: 'S1', grp: gs });
        addLoad(m, s2, { type: 'q', m: r1, dir: 'Y', proj: true, full: true, q1: 0.72, q2: 0.72, unit: 'm2', bw: 6 });
        addLoad(m, s2, { type: 'q', m: r2, dir: 'Y', proj: true, full: true, q1: 0.36, q2: 0.36, unit: 'm2', bw: 6 });
        const w = addCase(m, { name: 'Wiatr poprzeczny', type: 'Q', cat: 'W' });
        addLoad(m, w, { type: 'q', m: cl, dir: 'X', full: true, q1: 0.5, q2: 0.5, unit: 'm2', bw: 6 });
        addLoad(m, w, { type: 'q', m: cr, dir: 'X', full: true, q1: 0.3, q2: 0.3, unit: 'm2', bw: 6 });
        addLoad(m, w, { type: 'q', m: r1, dir: 'n', full: true, q1: -0.6, q2: -0.6, unit: 'm2', bw: 6 });
        addLoad(m, w, { type: 'q', m: r2, dir: 'n', full: true, q1: -0.4, q2: -0.4, unit: 'm2', bw: 6 });
        return m;
      }
    },
    {
      n: 'Belka Gerbera – przegub, wspornik, siły skupione',
      build() {
        const m = blank(); m.name = 'Belka Gerbera';
        const s = secUid(m, 'IPE 300');
        addMember(m, 0, 0, 8, 0, { sec: s }); addMember(m, 8, 0, 10, 0, { sec: s }); addMember(m, 10, 0, 16, 0, { sec: s });
        setSup(m, 0, 0, 'pin'); setSup(m, 8, 0, 'rollH'); setSup(m, 16, 0, 'rollH');
        findNodeAt(m, 10, 0).hinge = true;
        const g = addCase(m, { name: 'Obciążenie stałe', type: 'G' });
        for (const x of m.members) addLoad(m, g, { type: 'q', m: x.uid, dir: 'Y', full: true, q1: 8, q2: 8 });
        const q = addCase(m, { name: 'Siły skupione', type: 'Q', cat: 'B' });
        addLoad(m, q, { type: 'F', m: m.members[0].uid, dir: 'Y', F: 30, x: 0.5, mode: 'rel' });
        addLoad(m, q, { type: 'F', m: m.members[2].uid, dir: 'Y', F: 30, x: 3, mode: 'abs' });
        return m;
      }
    },
    {
      n: 'Belka na podporach sprężystych – osiadanie, temperatura, podpora ukośna',
      build() {
        const m = blank(); m.name = 'Belka na podporach sprężystych';
        const s = secUid(m, 'Prostokąt 300×500');
        addMember(m, 0, 0, 6, 0, { sec: s }); addMember(m, 6, 0, 12, 0, { sec: s });
        setSup(m, 0, 0, 'pin');
        setSup(m, 6, 0, 'custom', { rx: 0, ry: 2, rz: 0, ky: 20000, b: 0.4 });
        setSup(m, 12, 0, 'rollH', { ang: 30 });
        const g = addCase(m, { name: 'Obciążenie stałe', type: 'G' });
        for (const x of m.members) addLoad(m, g, { type: 'q', m: x.uid, dir: 'Y', full: true, q1: 15, q2: 15 });
        const os = addCase(m, { name: 'Osiadanie podpory lewej', type: 'G' });
        addLoad(m, os, { type: 'S', node: findNodeAt(m, 0, 0).uid, ux: 0, uy: 10, rz: 0 });
        const t = addCase(m, { name: 'Temperatura (różnica góra–dół)', type: 'Q', cat: 'T' });
        for (const x of m.members) addLoad(m, t, { type: 'T', m: x.uid, dT: 0, dTg: -15 });
        return m;
      }
    }
  ];

  return { TOL, blank, normalize, clone, uid, addMat, addSec, uniqueSecName, cloneSec, assignSec, secUsage, separateSec, purgeSecs, addNode, addMember, splitMemberAtNode, splitMemberN, splitMemberAt, reverseMember,
    deleteMembers, deleteNodes, moveNode, addLoad, addCase, addGroup, findNodeAt, projOnMember, memLen, nodeBy, memBy, GEN, EXAMPLES, list, sup };
});
