/* =====================================================================
   BM-Win · Statyka – interfejs użytkownika
   ===================================================================== */
(function () {
  'use strict';
  const { h, $, $$, fmt, fmtS, num, esc, toast, modal, confirmDlg } = BM;
  const F = BMFEM, V = BMView, MAT = BMMAT, SEC = BMSEC, X = BMX, GEN = BMGEN;
  const FILE_EXT = '.bms';

  /* ================================================================ stan */
  let P;                                  // projekt
  const hist = new BM.History();
  const file = { name: null, dirty: false };
  const ui = {
    tab: 'model', tool: 'select', sel: { nodes: new Set(), members: new Set() },
    activeCase: null, vs: { dim: '2D', yaw: -35, pitch: 25, scale: 40, cx: 300, cy: 300, w: 800, h: 600, grid: 0.5 },
    pending: null, cursor: null, workZ: 0,
    show: { ids: true, nodeIds: true, loads: true, supports: true, secNames: false, grid: true },
    rv: { src: 'env:ULS', q: 'M', scale: 1, second: false, deformed: false, reac: false },
    res: null, resErr: null, resStamp: -1, stamp: 0, envCache: {}, extra: {}
  };
  // ustawienia narzędzi
  const tset = { sup: 'pin', loadType: 'dist', loadDir: null, loadVal: -10, loadVal2: null, memType: 'beam', sec: null, hingeEnd: 'auto' };

  const SUP2 = { pin: ['Przegub stały', [1, 1, 0, 0, 0, 0]], roll: ['Przegub przesuwny (poziomo)', [0, 1, 0, 0, 0, 0]], rollv: ['Przegub przesuwny (pionowo)', [1, 0, 0, 0, 0, 0]], fix: ['Utwierdzenie', [1, 1, 0, 0, 0, 1]], slide: ['Utwierdzenie przesuwne', [0, 1, 0, 0, 0, 1]] };
  const SUP3 = { pin: ['Przegub stały (X, Y, Z)', [1, 1, 1, 0, 0, 0]], fix: ['Utwierdzenie', [1, 1, 1, 1, 1, 1]], rollz: ['Podpora przesuwna (tylko Z)', [0, 0, 1, 0, 0, 0]], rollxz: ['Przesuwna w Y (X, Z)', [1, 0, 1, 0, 0, 0]], rollyz: ['Przesuwna w X (Y, Z)', [0, 1, 1, 0, 0, 0]] };
  const supPresets = () => P.dim === '2D' ? SUP2 : SUP3;
  const DOF2 = [[0, 'ux'], [1, 'uy'], [5, 'φz']], DOF3 = [[0, 'ux'], [1, 'uy'], [2, 'uz'], [3, 'φx'], [4, 'φy'], [5, 'φz']];
  const dofs = () => P.dim === '2D' ? DOF2 : DOF3;
  const vertDir = () => P.dim === '2D' ? 'Y' : 'Z';

  /* ================================================================ projekt */
  function newProject(dim) {
    const steel = 'S235';
    return {
      app: 'BM-Win Statyka', ver: 1, dim, name: dim === '2D' ? 'Rama płaska' : 'Model przestrzenny', author: '', date: BM.today(),
      nodes: [], members: [], supports: [],
      sections: [{ id: 'P1', name: 'IPE 300', mat: steel, def: { shape: 'cat', key: 'IPE 300' } }],
      cases: [{ id: 'G1', name: 'Ciężar własny', type: 'G', selfWeight: true }],
      loads: [],
      combo: Object.assign({ sets: ['ULS', 'SLS_CH', 'SLS_QP'] }, F.DEFAULT_FACTORS),
      analysis: { shear: false, stations: 20, modes: 6 },
      view: { grid: dim === '2D' ? 0.5 : 1 }
    };
  }
  const nextId = (arr, key = 'id') => arr.reduce((m, o) => Math.max(m, +o[key] || 0), 0) + 1;
  const nextSecId = () => 'P' + (P.sections.reduce((m, s) => Math.max(m, +String(s.id).replace(/\D/g, '') || 0), 0) + 1);
  const nextCaseId = (t) => { let i = 1; while (P.cases.some(c => c.id === t + i)) i++; return t + i; };
  const secById = id => P.sections.find(s => String(s.id) === String(id));
  const caseById = id => P.cases.find(c => String(c.id) === String(id));
  const nodeById = id => P.nodes.find(n => String(n.id) === String(id));
  const memById = id => P.members.find(m => String(m.id) === String(id));

  function femModel() {
    const sections = [], mats = new Map();
    P.sections.forEach(s => {
      const p = SEC.forFem(s.def); if (!p) return;
      sections.push(Object.assign({ id: s.id, name: s.name, mat: s.mat }, p));
      const mm = s.customMat || MAT.forFem(s.mat); if (mm) mats.set(String(s.mat), Object.assign({}, mm, { id: s.mat }));
    });
    return {
      dim: P.dim, nodes: P.nodes, members: P.members.map(m => Object.assign({}, m, { mat: (secById(m.sec) || {}).mat })),
      sections, materials: [...mats.values()], supports: P.supports, cases: P.cases, loads: P.loads
    };
  }

  /* ================================================================ zmiany */
  function changed(opts = {}) {
    ui.stamp++; ui.envCache = {}; ui.extra = {};
    file.dirty = true;
    if (!opts.noHist) hist.push(P);
    BM.store.set('statyka:last', P);
    if (opts.panel !== false) renderLeft();
    renderView(); updateStatus(); updateTitle();
  }
  function setProject(p, name) {
    P = p; file.name = name || null; file.dirty = false;
    ui.vs.dim = P.dim; ui.vs.grid = (P.view && P.view.grid) || (P.dim === '2D' ? 0.5 : 1);
    ui.sel.nodes.clear(); ui.sel.members.clear(); ui.pending = null;
    ui.activeCase = P.cases[0] ? P.cases[0].id : null;
    tset.sec = P.sections[0] ? P.sections[0].id : null;
    tset.sup = 'pin';
    hist.st = []; hist.pos = -1; hist.push(P);
    ui.stamp++; ui.envCache = {}; ui.extra = {}; ui.res = null;
    $('#dimTag').textContent = P.dim; $('#projName').value = P.name || '';
    BM.store.set('statyka:last', P);
    buildViewBar(); renderLeft(); fitView(); updateStatus(); updateTitle(); renderCombos();
    if (ui.tab === 'report') renderReport();
  }
  function updateTitle() { $('#fileName').textContent = (file.name || 'bez nazwy') + (file.dirty ? ' •' : ''); document.title = `${P.name || 'Projekt'} – BM-Win Statyka`; }

  /* ================================================================ analiza */
  function analyze(force) {
    if (!force && ui.resStamp === ui.stamp) return ui.res;
    ui.resStamp = ui.stamp; ui.res = null; ui.resErr = null;
    if (!P.members.length) { ui.resErr = ['Model nie zawiera prętów.']; return null; }
    if (!P.cases.length) { ui.resErr = ['Brak przypadków obciążeń.']; return null; }
    const t0 = performance.now();
    const r = F.analyzeLinear(femModel(), { shear: !!P.analysis.shear, stations: P.analysis.stations || 20 });
    if (!r.ok) { ui.resErr = r.errors; return null; }
    r.time = performance.now() - t0;
    ui.res = r;
    return r;
  }
  function comboFactors() { return { gGsup: P.combo.gGsup, gGinf: P.combo.gGinf, gQ: P.combo.gQ, xi: P.combo.xi, rule: P.combo.rule, gGsupEQU: P.combo.gGsupEQU, gGinfEQU: P.combo.gGinfEQU, gQEQU: P.combo.gQEQU }; }
  function envelope(set) {
    const r = analyze(); if (!r) return null;
    if (ui.envCache[set]) return ui.envCache[set];
    const fac = comboFactors();
    const e = { members: F.envelopeMembers(r, P.cases, set, fac), reactions: F.envelopeReactions(r, P.cases, set, fac), disp: F.envelopeDisp(r, P.cases, set, fac) };
    ui.envCache[set] = e; return e;
  }
  function combosOf(set) { return F.explicitCombos(P.cases, set, comboFactors()); }
  // wyniki dla bieżącego źródła: { kind:'case'|'combo'|'env', members, reactions, disp, env:bool, label }
  function currentResults() {
    const r = analyze(); if (!r) return null;
    const [kind, id] = ui.rv.src.split(':');
    if (kind === 'case') { const c = r.cases[id]; if (!c) return null; return { kind, env: false, members: c.members, reactions: c.reactions, disp: c.disp, label: 'Przypadek: ' + ((caseById(id) || {}).name || id) }; }
    if (kind === 'combo') {
      const [set, idx] = id.split('#'); const cb = combosOf(set)[+idx]; if (!cb) return null;
      if (ui.rv.second) {
        const key = 'II:' + id;
        if (!ui.extra[key]) ui.extra[key] = F.analyzeSecondOrder(femModel(), cb.factors, { shear: !!P.analysis.shear, stations: P.analysis.stations || 20 });
        const s2 = ui.extra[key];
        if (!s2.ok) return { kind, err: s2.errors, label: cb.name };
        return { kind, env: false, members: s2.members, reactions: s2.reactions, disp: s2.disp, label: `${F.SET_NAMES[set]}: ${cb.name} – II rząd (${s2.iterations} it.)`, combo: cb };
      }
      const s = F.superpose(r, cb.factors);
      return { kind, env: false, members: s.members, reactions: s.reactions, disp: s.disp, label: `${F.SET_NAMES[set]}: ${cb.name}`, combo: cb };
    }
    if (kind === 'env') { const e = envelope(id); if (!e) return null; return { kind, env: true, members: e.members, reactions: e.reactions.map(x => ({ node: x.node, R: x.R, F: x.F })), disp: e.disp, label: 'Obwiednia ' + F.SET_NAMES[id] }; }
    return null;
  }
  const qKey = q => P.dim === '2D' ? ({ M: 'My', V: 'Vz', N: 'N' }[q] || q) : q;
  const Q_LBL = { M: 'M [kNm]', V: 'V [kN]', N: 'N [kN]', My: 'M<sub>y</sub> [kNm]', Mz: 'M<sub>z</sub> [kNm]', Vy: 'V<sub>y</sub> [kN]', Vz: 'V<sub>z</sub> [kN]', T: 'T [kNm]' };

  /* ================================================================ status */
  function validate() {
    const errs = [], warns = [];
    if (!P.nodes.length) warns.push('Brak węzłów – narysuj schemat lub użyj generatora.');
    const ids = new Set(); P.nodes.forEach(n => { if (ids.has(String(n.id))) errs.push(`Powtórzony numer węzła ${n.id}`); ids.add(String(n.id)); });
    P.members.forEach(m => { if (!nodeById(m.n1) || !nodeById(m.n2)) errs.push(`Pręt ${m.id}: brak węzła`); if (!secById(m.sec)) errs.push(`Pręt ${m.id}: brak przekroju`); });
    if (P.members.length && !P.supports.length) errs.push('Brak podpór.');
    return { errs, warns };
  }
  function updateStatus() {
    const st = $('#status'), v = validate();
    if (v.errs.length) { st.className = 'fail'; st.textContent = '✖ ' + v.errs[0]; st.title = v.errs.join('\n'); return; }
    if (!P.members.length) { st.className = 'warn'; st.textContent = 'Model pusty'; st.title = ''; return; }
    const r = analyze();
    if (!r) { st.className = 'fail'; st.textContent = '✖ ' + (ui.resErr ? ui.resErr[0] : 'błąd obliczeń'); st.title = (ui.resErr || []).join('\n'); return; }
    st.className = 'ok'; st.textContent = `✔ Obliczono: ${P.nodes.length} węzłów, ${P.members.length} prętów, ${P.cases.length} przyp.`; st.title = `Czas obliczeń: ${r.time.toFixed(0)} ms` + (r.warnings.length ? '\n' + r.warnings.join('\n') : '');
  }

  /* ================================================================ zakładki */
  function setTab(t) {
    ui.tab = t;
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    const work = ['model', 'loads', 'results'].includes(t);
    $('#p-work').classList.toggle('on', work);
    $('#p-combos').classList.toggle('on', t === 'combos');
    $('#p-report').classList.toggle('on', t === 'report');
    $('#p-report').classList.toggle('printme', true);
    if (work) {
      // pasek narzędzi ma różną wysokość w zakładkach – rysunek nie powinien „skakać”
      const v0 = viewEl().getBoundingClientRect(), top0 = v0.height ? v0.top : null;
      if (t !== 'model' && ['node', 'member'].includes(ui.tool)) ui.tool = 'select'; if (t === 'model' && ui.tool === 'load') ui.tool = 'select';
      buildViewBar(); renderLeft();
      requestAnimationFrame(() => { if (top0 !== null) ui.vs.cy += top0 - viewEl().getBoundingClientRect().top; sizeView(); renderView(); });
    }
    if (t === 'combos') renderCombos();
    if (t === 'report') renderReport();
  }

  /* ================================================================ widok */
  const viewEl = () => $('#view');
  function sizeView() { const el = viewEl(); const r = el.getBoundingClientRect(); ui.vs.w = Math.max(200, Math.floor(r.width)); ui.vs.h = Math.max(200, Math.floor(r.height)); }
  function fitView() { sizeView(); V.fit(viewModel(), ui.vs, 60); renderView(); }
  function viewModel() { return { dim: P.dim, nodes: P.nodes, members: P.members, supports: P.supports, loads: P.loads, cases: P.cases }; }
  function renderView() {
    if (!P) return;
    const el = viewEl(); if (!el || !el.offsetParent) return;
    const opts = { show: Object.assign({}, ui.show), sel: ui.sel, sections: new Map(P.sections.map(s => [String(s.id), s.name])) };
    if (P.dim === '3D') opts.workPlane = ui.workZ;
    let foot = '';
    if (ui.tab === 'loads') { opts.activeCase = ui.activeCase; const c = caseById(ui.activeCase); foot = c ? `Przypadek: <b>${esc(c.name)}</b>` : ''; }
    else if (ui.tab === 'model') { opts.activeCase = '*'; opts.show.loads = false; }
    if (ui.tab === 'results') {
      opts.show.loads = false;
      const R = currentResults();
      if (!R) { foot = ui.resErr ? `<span style="color:var(--fail)">${esc(ui.resErr.join('; '))}</span>` : ''; }
      else if (R.err) { foot = `<span style="color:var(--fail)">${esc(R.err.join('; '))}</span>`; }
      else {
        foot = `<b>${esc(R.label)}</b>`;
        const q = ui.rv.q;
        if (q === 'def') opts.deformed = { disp: R.env ? R.disp.map(d => d.map(v => Math.abs(v[1]) > Math.abs(v[0]) ? v[1] : v[0])) : R.disp, members: R.env ? null : R.members, scale: ui.rv.scale };
        else if (q === 'reac') opts.reactions = R.reactions;
        else if (q === 'buck' || q === 'modal') { const ms = ui.extra[q === 'buck' ? 'buckShow' : 'modalShow']; if (ms) { opts.modeShape = { disp: ms.shape, scale: ui.rv.scale, unitLabel: () => ms.label }; foot += ' · ' + esc(ms.label); } }
        else opts.diagram = { key: qKey(q), members: R.members, env: R.env, scale: ui.rv.scale };
        if (ui.rv.reac && q !== 'reac') opts.reactions = R.reactions;
      }
    }
    if (ui.pending && ui.cursor) { const P0 = V.projector(ui.vs), n = nodeById(ui.pending); if (n) { const q = P0.p(+n.x, +n.y, +(n.z || 0)); opts.ghost = [q[0], q[1], ui.cursor[0], ui.cursor[1]]; } }
    if (ui.cursor && ['node', 'member'].includes(ui.tool)) opts.cursor = ui.cursor;
    el.innerHTML = V.render(viewModel(), ui.vs, opts);
    $('#vfoot').innerHTML = foot + (ui.hint ? ` <span>${ui.hint}</span>` : '');
  }

  function buildViewBar() {
    const bar = $('#vbar'); bar.innerHTML = '';
    const tool = (id, lbl, title) => h('button', { class: 'tool' + (ui.tool === id ? ' on' : ''), title, onclick: () => { ui.tool = id; ui.pending = null; buildViewBar(); renderView(); hintTool(); } }, lbl);
    if (ui.tab === 'model') {
      bar.append(tool('select', '↖ Zaznacz', 'Zaznaczanie (klik, Shift – dodawanie); w 3D przeciąganie obraca widok'));
      bar.append(tool('node', '• Węzeł', P.dim === '2D' ? 'Klik – nowy węzeł w punkcie siatki' : 'Klik – nowy węzeł na płaszczyźnie roboczej Z'));
      bar.append(tool('member', '╱ Pręt', 'Klik w dwa punkty / węzły – nowy pręt (Esc – koniec)'));
      bar.append(tool('support', '△ Podpora', 'Klik w węzeł – przypisz podporę wybraną w panelu „Narzędzia”'));
      bar.append(tool('hinge', '◦ Przegub', 'Klik przy końcu pręta – przełącz przegub'));
      bar.append(tool('assign', '▭ Przekrój', 'Klik w pręt – przypisz przekrój wybrany w panelu „Narzędzia”'));
      bar.append(tool('delete', '✕ Usuń', 'Klik – usuń węzeł lub pręt'));
    } else if (ui.tab === 'loads') {
      bar.append(tool('select', '↖ Zaznacz', 'Zaznaczanie'));
      bar.append(tool('load', '↓ Obciążenie', 'Klik w pręt lub węzeł – dodaj obciążenie zdefiniowane w panelu'));
      bar.append(tool('delete', '✕ Usuń obc.', 'Klik w pręt lub węzeł – usuń jego obciążenia w aktywnym przypadku'));
    } else {
      bar.append(tool('select', '↖ Zaznacz', 'Klik w pręt – szczegóły wyników'));
    }
    bar.append(h('span', { class: 'sep' }));
    bar.append(h('button', { class: 'tool', title: 'Dopasuj widok (F)', onclick: fitView }, '⤢ Dopasuj'));
    if (P.dim === '3D') {
      const views = [['Izo', -35, 25], ['XZ', 0, 0], ['YZ', -90, 0], ['XY', 0, 90]];
      views.forEach(([n, y, p]) => bar.append(h('button', { class: 'tool', title: 'Widok ' + n, onclick: () => { ui.vs.yaw = y; ui.vs.pitch = p; fitView(); } }, n)));
      if (ui.tab === 'model') bar.append(h('label', { title: 'Poziom płaszczyzny roboczej dla nowych węzłów' }, 'Z =', h('input', { value: fmt(ui.workZ, 2), onchange: e => { ui.workZ = num(e.target.value, 0); renderView(); } }), 'm'));
    }
    if (ui.tab !== 'results') {
      const g = h('select', { title: 'Krok siatki', onchange: e => { ui.vs.grid = +e.target.value; P.view = P.view || {}; P.view.grid = ui.vs.grid; renderView(); } },
        [0.05, 0.1, 0.25, 0.5, 1, 2, 0].map(v => h('option', { value: v, selected: Math.abs(v - ui.vs.grid) < 1e-9 }, v ? `siatka ${fmt(v, v < 0.1 ? 2 : v < 1 ? 2 : 0)} m` : 'bez siatki')));
      bar.append(g);
    }
    bar.append(h('span', { class: 'sp' }));
    const tog = (k, lbl) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: ui.show[k], onchange: e => { ui.show[k] = e.target.checked; renderView(); } }), lbl);
    bar.append(tog('ids', 'nr prętów'), tog('nodeIds', 'nr węzłów'), tog('secNames', 'przekroje'));
    hintTool();
  }
  function hintTool() {
    const H = { select: '', node: P.dim === '2D' ? 'Kliknij w punkt siatki, aby dodać węzeł.' : `Kliknij, aby dodać węzeł na płaszczyźnie Z = ${fmt(ui.workZ, 2)} m.`, member: 'Kliknij węzeł/punkt początkowy, potem końcowy. Esc – przerwij.', support: 'Kliknij węzeł.', hinge: 'Kliknij pręt blisko końca, przy którym ma być przegub.', assign: 'Kliknij pręt.', delete: 'Kliknij element do usunięcia.', load: 'Kliknij pręt lub węzeł.' };
    ui.hint = H[ui.tool] || ''; const f = $('#vfoot'); if (f && ui.tab !== 'results') f.innerHTML = ui.hint;
  }

  // ---------------------------------------------------- obsługa myszy
  function snapPoint(sx, sy) {
    const g = ui.vs.grid || 0;
    if (P.dim === '2D') {
      let x = (sx - ui.vs.cx) / ui.vs.scale, y = (ui.vs.cy - sy) / ui.vs.scale;
      if (g > 0) { x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
      return [x, y, 0];
    }
    const pr = V.projector(ui.vs); const p = pr.onPlane(sx, sy, ui.workZ); if (!p) return null;
    if (g > 0) { p[0] = Math.round(p[0] / g) * g; p[1] = Math.round(p[1] / g) * g; }
    return p;
  }
  function findNodeAt(p) { return P.nodes.find(n => Math.abs(+n.x - p[0]) < 1e-6 && Math.abs(+n.y - p[1]) < 1e-6 && Math.abs((+n.z || 0) - (p[2] || 0)) < 1e-6); }
  function addNode(p) {
    const ex = findNodeAt(p); if (ex) return ex.id;
    const id = nextId(P.nodes); const r = v => Math.round(v * 1e6) / 1e6;
    P.nodes.push(P.dim === '2D' ? { id, x: r(p[0]), y: r(p[1]) } : { id, x: r(p[0]), y: r(p[1]), z: r(p[2]) });
    // węzeł na istniejącym pręcie – podział pręta
    splitMembersAt(id);
    return id;
  }
  function splitMembersAt(nid) {
    const n = nodeById(nid), C = [+n.x, +n.y, +(n.z || 0)];
    for (const m of [...P.members]) {
      const a = nodeById(m.n1), b = nodeById(m.n2); if (!a || !b || String(m.n1) === String(nid) || String(m.n2) === String(nid)) continue;
      const A = [+a.x, +a.y, +(a.z || 0)], B = [+b.x, +b.y, +(b.z || 0)], d = B.map((v, i) => v - A[i]), L2 = d.reduce((s, v) => s + v * v, 0);
      const t = C.map((v, i) => v - A[i]).reduce((s, v, i) => s + v * d[i], 0) / L2;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const dist = Math.hypot(...C.map((v, i) => v - (A[i] + t * d[i])));
      if (dist > 1e-6) continue;
      const m2 = Object.assign(JSON.parse(JSON.stringify(m)), { id: nextId(P.members), n1: nid, rel1: [0, 0, 0, 0, 0, 0] });
      m.n2 = nid; m.rel2 = [0, 0, 0, 0, 0, 0];
      P.members.push(m2);
      // obciążenia rozłożone – kopiujemy na nowy pręt (dla obciążeń na całej długości)
      P.loads.filter(l => String(l.member) === String(m.id) && l.type === 'dist' && (l.a ?? 0) === 0 && (l.b ?? 1) === 1 && (l.q2 ?? l.q1) === l.q1).forEach(l => P.loads.push(Object.assign({}, l, { member: m2.id })));
    }
  }
  function addMember(n1, n2) {
    if (String(n1) === String(n2)) return;
    if (P.members.some(m => (String(m.n1) === String(n1) && String(m.n2) === String(n2)) || (String(m.n1) === String(n2) && String(m.n2) === String(n1)))) { toast('Taki pręt już istnieje'); return; }
    P.members.push({ id: nextId(P.members), n1: +n1 || n1, n2: +n2 || n2, sec: tset.sec || (P.sections[0] || {}).id, type: tset.memType, beta: 0, rel1: [0, 0, 0, 0, 0, 0], rel2: [0, 0, 0, 0, 0, 0] });
  }
  function deleteNode(id) {
    id = String(id);
    P.members = P.members.filter(m => String(m.n1) !== id && String(m.n2) !== id);
    P.nodes = P.nodes.filter(n => String(n.id) !== id);
    P.supports = P.supports.filter(s => String(s.node) !== id);
    const mids = new Set(P.members.map(m => String(m.id)));
    P.loads = P.loads.filter(l => l.type === 'nodal' ? String(l.node) !== id : mids.has(String(l.member)));
  }
  function deleteMember(id) {
    id = String(id);
    P.members = P.members.filter(m => String(m.id) !== id);
    P.loads = P.loads.filter(l => l.type === 'nodal' || String(l.member) !== id);
  }
  function deleteSelection() {
    if (!ui.sel.nodes.size && !ui.sel.members.size) return;
    ui.sel.members.forEach(deleteMember); ui.sel.nodes.forEach(deleteNode);
    ui.sel.nodes.clear(); ui.sel.members.clear(); changed();
  }
  function onClick(sx, sy, e) {
    const hit = V.pick(viewModel(), ui.vs, sx, sy);
    const t = ui.tool;
    if (t === 'select') {
      if (!e.shiftKey && !e.ctrlKey) { ui.sel.nodes.clear(); ui.sel.members.clear(); }
      if (hit) { const S = hit.kind === 'node' ? ui.sel.nodes : ui.sel.members; S.has(hit.id) ? S.delete(hit.id) : S.add(hit.id); }
      renderLeft(); renderView(); return;
    }
    if (t === 'node') { const p = snapPoint(sx, sy); if (!p) return; addNode(p); changed(); return; }
    if (t === 'member') {
      let nid;
      if (hit && hit.kind === 'node') nid = hit.id; else { const p = snapPoint(sx, sy); if (!p) return; nid = addNode(p); }
      if (ui.pending === null) { ui.pending = nid; renderView(); if (!hit) changed({ panel: false }); return; }
      addMember(ui.pending, nid); ui.pending = nid; changed(); return;
    }
    if (t === 'support' && hit && hit.kind === 'node') {
      const pre = supPresets()[tset.sup]; if (!pre) return;
      P.supports = P.supports.filter(s => String(s.node) !== hit.id);
      if (tset.sup !== 'none') P.supports.push({ node: +hit.id || hit.id, fix: pre[1].slice(), k: [0, 0, 0, 0, 0, 0] });
      changed(); return;
    }
    if (t === 'hinge' && hit && hit.kind === 'member') {
      const m = memById(hit.id), end = hit.t < 0.5 ? 'rel1' : 'rel2';
      const rel = m[end] || [0, 0, 0, 0, 0, 0];
      const on = P.dim === '2D' ? !rel[5] : !(rel[4] && rel[5]);
      m[end] = P.dim === '2D' ? [0, 0, 0, 0, on ? 1 : 0, on ? 1 : 0] : [0, 0, 0, 0, on ? 1 : 0, on ? 1 : 0];
      changed(); return;
    }
    if (t === 'assign' && hit && hit.kind === 'member') { memById(hit.id).sec = tset.sec; memById(hit.id).type = tset.memType; changed(); return; }
    if (t === 'delete' && hit) {
      if (ui.tab === 'loads') { P.loads = P.loads.filter(l => !(String(l.case) === String(ui.activeCase) && (hit.kind === 'node' ? l.type === 'nodal' && String(l.node) === hit.id : String(l.member) === hit.id))); changed(); return; }
      hit.kind === 'node' ? deleteNode(hit.id) : deleteMember(hit.id); changed(); return;
    }
    if (t === 'load' && hit) { addLoadOn(hit); changed(); return; }
  }
  function addLoadOn(hit) {
    if (!ui.activeCase) { toast('Najpierw dodaj przypadek obciążenia'); return; }
    const L = { case: ui.activeCase };
    const val = num(tset.loadVal, 0), val2 = tset.loadVal2 === null || tset.loadVal2 === '' ? null : num(tset.loadVal2, val);
    const dir = tset.loadDir || vertDir();
    if (hit.kind === 'node') {
      const Fv = [0, 0, 0, 0, 0, 0]; const k = 'XYZ'.indexOf(dir); Fv[k >= 0 ? k : (P.dim === '2D' ? 1 : 2)] = val;
      Object.assign(L, { type: 'nodal', node: +hit.id || hit.id, F: Fv });
    } else if (tset.loadType === 'dist') Object.assign(L, { type: 'dist', member: +hit.id || hit.id, dir, q1: val, q2: val2 === null ? val : val2, a: 0, b: 1 });
    else if (tset.loadType === 'point') Object.assign(L, { type: 'point', member: +hit.id || hit.id, dir, P: val, a: 0.5 });
    else if (tset.loadType === 'temp') Object.assign(L, { type: 'temp', member: +hit.id || hit.id, dT: val, dTz: 0 });
    else if (tset.loadType === 'moment') Object.assign(L, { type: 'moment', member: +hit.id || hit.id, dir: P.dim === '2D' ? 'y' : 'y', M: val, a: 0.5 });
    P.loads.push(L);
  }

  function attachViewEvents() {
    const el = viewEl();
    let drag = null;
    el.addEventListener('pointerdown', e => {
      el.focus();
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const hit = V.pick(viewModel(), ui.vs, sx, sy);
      const mode = (e.button === 1 || e.button === 2 || e.shiftKey && e.button === 0) ? 'pan' : (P.dim === '3D' && ui.tool === 'select' && e.button === 0 && !hit) ? 'rot' : (e.button === 0 ? 'click' : null);
      drag = { x: e.clientX, y: e.clientY, sx, sy, mode, moved: false, cx: ui.vs.cx, cy: ui.vs.cy, yaw: ui.vs.yaw, pitch: ui.vs.pitch };
      if (mode === 'pan' || mode === 'rot') el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (drag && (drag.mode === 'pan' || drag.mode === 'rot')) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.mode === 'pan') { ui.vs.cx = drag.cx + dx; ui.vs.cy = drag.cy + dy; el.classList.add('pan'); }
        else {
          // obrót wokół środka widoku
          const cxw = ui.vs.w / 2, cyw = ui.vs.h / 2;
          const before = V.projector(ui.vs);
          ui.vs.yaw = drag.yaw + dx * 0.4; ui.vs.pitch = Math.max(-89, Math.min(89, drag.pitch + dy * 0.4));
          // utrzymanie środka modelu w miejscu
          const bb = V.bbox(viewModel()), c = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
          const q0 = before.p(c[0], c[1], c[2]), q1 = V.projector(ui.vs).p(c[0], c[1], c[2]);
          ui.vs.cx += q0[0] - q1[0]; ui.vs.cy += q0[1] - q1[1];
          void cxw; void cyw;
        }
        renderView(); return;
      }
      if (['node', 'member'].includes(ui.tool)) {
        const hit = V.pick(viewModel(), ui.vs, sx, sy);
        if (hit && hit.kind === 'node') { const pr = V.projector(ui.vs), n = nodeById(hit.id), q = pr.p(+n.x, +n.y, +(n.z || 0)); ui.cursor = [q[0], q[1], 'węzeł ' + n.id]; }
        else { const p = snapPoint(sx, sy); if (p) { const q = V.projector(ui.vs).p(p[0], p[1], p[2]); ui.cursor = [q[0], q[1], P.dim === '2D' ? `${fmt(p[0])}; ${fmt(p[1])}` : `${fmt(p[0])}; ${fmt(p[1])}; ${fmt(p[2])}`]; } }
        renderView();
      }
    });
    el.addEventListener('pointerup', e => {
      el.classList.remove('pan');
      if (!drag) return;
      const d = drag; drag = null;
      if (d.mode === 'click' || ((d.mode === 'rot') && !d.moved)) {
        const r = el.getBoundingClientRect(); onClick(e.clientX - r.left, e.clientY - r.top, e);
      }
    });
    el.addEventListener('pointerleave', () => { if (ui.cursor) { ui.cursor = null; renderView(); } });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      ui.vs.cx = sx - (sx - ui.vs.cx) * f; ui.vs.cy = sy - (sy - ui.vs.cy) * f; ui.vs.scale *= f;
      renderView();
    }, { passive: false });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { ui.pending = null; ui.tool = 'select'; buildViewBar(); renderView(); }
      if (e.key === 'Delete' && ui.tab === 'model') deleteSelection();
      if (e.key === 'f' || e.key === 'F') fitView();
    });
    window.addEventListener('resize', () => { sizeView(); renderView(); });
  }

  /* ================================================================ panel lewy */
  function grp(id, title, body, open = true, cnt) {
    const st = BM.store.get('statyka:grp:' + id, open);
    const d = h('details', { class: 'grp', 'data-id': id, open: st }, h('summary', null, title, cnt !== undefined ? h('span', { class: 'cnt' }, cnt) : null), h('div', { class: 'fields' }, body));
    d.addEventListener('toggle', () => BM.store.set('statyka:grp:' + id, d.open));
    return d;
  }
  function renderLeft() {
    const L = $('#wleft'); if (!L) return;
    const sc = L.scrollTop; L.innerHTML = '';
    if (ui.tab === 'model') leftModel(L);
    else if (ui.tab === 'loads') leftLoads(L);
    else if (ui.tab === 'results') leftResults(L);
    L.scrollTop = sc;
  }

  // ---------------------------------------------------- pola tabel
  const cellNum = (val, onset, opts = {}) => h('input', { value: val === undefined || val === null || val === '' ? '' : (typeof val === 'number' ? String(val).replace('.', ',') : val), class: opts.cls || '', title: opts.title || '', onchange: e => { const v = num(e.target.value); if (!isFinite(v) && !opts.allowEmpty) { e.target.classList.add('bad'); return; } onset(isFinite(v) ? v : null); changed(); } });
  const cellSel = (val, options, onset) => h('select', { onchange: e => { onset(e.target.value); changed(); } }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l)));
  const cellChk = (val, onset, title) => h('input', { type: 'checkbox', checked: !!val, title: title || '', onchange: e => { onset(e.target.checked ? 1 : 0); changed(); } });
  const delBtn = (fn, title = 'Usuń') => h('button', { class: 'x', title, onclick: () => { fn(); changed(); } }, '×');
  const secOptions = () => P.sections.map(s => [s.id, `${s.id}: ${s.name}`]);

  function leftModel(L) {
    // zaznaczenie
    if (ui.sel.nodes.size || ui.sel.members.size) L.append(grp('sel', 'Zaznaczenie', selPanel(), true));
    // narzędzia
    L.append(grp('tools', 'Narzędzia rysowania', toolPanel(), true));
    L.append(grp('gen', 'Generator schematu', genPanel(), false));
    // węzły
    const is3 = P.dim === '3D';
    const tn = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Nr'), h('th', null, 'X [m]'), h('th', null, 'Y [m]'), is3 ? h('th', null, 'Z [m]') : null, h('th', null, '')));
    P.nodes.forEach(n => tn.append(h('tr', { class: ui.sel.nodes.has(String(n.id)) ? 'sel' : '' },
      h('td', { class: 'n' }, n.id), h('td', null, cellNum(n.x, v => n.x = v)), h('td', null, cellNum(n.y, v => n.y = v)), is3 ? h('td', null, cellNum(n.z || 0, v => n.z = v)) : null,
      h('td', null, delBtn(() => deleteNode(n.id))))));
    L.append(grp('nodes', 'Węzły', [h('div', { class: 'tscroll' }, tn), h('div', { class: 'tadd' }, h('button', { class: 'btn', onclick: () => { const last = P.nodes[P.nodes.length - 1]; const id = nextId(P.nodes); P.nodes.push(Object.assign({ id, x: last ? +last.x + 1 : 0, y: last ? +last.y : 0 }, is3 ? { z: last ? +(last.z || 0) : 0 } : {})); changed(); } }, '+ węzeł'))], true, P.nodes.length));
    // pręty
    const tm = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Nr'), h('th', null, 'Wp'), h('th', null, 'Wk'), h('th', null, 'Przekrój'), h('th', null, 'Typ'), is3 ? h('th', { title: 'Kąt obrotu osi lokalnych wokół osi pręta' }, 'β [°]') : null, h('th', { title: 'Przegub na początku / końcu (zginanie)' }, 'Przeguby'), h('th', null, 'L [m]'), h('th', null, '')));
    P.members.forEach(m => {
      const a = nodeById(m.n1), b = nodeById(m.n2); const Lm = a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) : NaN;
      const hingeChk = (end) => { const rel = m[end] || [0, 0, 0, 0, 0, 0]; const on = P.dim === '2D' ? !!rel[5] : !!(rel[4] || rel[5]); return cellChk(on, v => { m[end] = [0, 0, 0, 0, v, v]; }, end === 'rel1' ? 'przegub na początku' : 'przegub na końcu'); };
      tm.append(h('tr', { class: ui.sel.members.has(String(m.id)) ? 'sel' : '' },
        h('td', { class: 'n' }, m.id), h('td', null, cellNum(m.n1, v => m.n1 = v)), h('td', null, cellNum(m.n2, v => m.n2 = v)),
        h('td', null, cellSel(m.sec, secOptions(), v => m.sec = v)),
        h('td', null, cellSel(m.type || 'beam', [['beam', 'belka'], ['truss', 'kratowy']], v => m.type = v)),
        is3 ? h('td', null, cellNum(m.beta || 0, v => m.beta = v)) : null,
        h('td', { class: 'c' }, m.type === 'truss' ? '—' : [hingeChk('rel1'), hingeChk('rel2')]),
        h('td', { class: 'n' }, fmt(Lm, 3)), h('td', null, delBtn(() => deleteMember(m.id)))));
    });
    L.append(grp('members', 'Pręty', [h('div', { class: 'tscroll' }, tm), h('p', { class: 'hint' }, 'Wp/Wk – węzeł początkowy/końcowy. Pręt kratowy przenosi tylko siłę osiową. ', P.dim === '3D' ? 'Osie lokalne: x – wzdłuż pręta, z – „do góry” (dla słupów: −X), β obraca osie y, z.' : '')], true, P.members.length));
    // podpory
    const D = dofs();
    const ts = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Węzeł'), h('th', null, 'Rodzaj'), D.map(([, n]) => h('th', { title: 'blokada ' + n }, n)), h('th', { title: 'Sprężystość w kierunkach niezablokowanych [kN/m] lub [kNm/rad]' }, 'Sprężyny'), h('th', null, '')));
    P.supports.forEach(s => {
      const pre = Object.entries(supPresets()).find(([, v]) => v[1].every((f, i) => !!f === !!(s.fix || [])[i]));
      ts.append(h('tr', null, h('td', null, cellNum(s.node, v => s.node = v)),
        h('td', null, cellSel(pre ? pre[0] : 'custom', Object.entries(supPresets()).map(([k, v]) => [k, v[0]]).concat([['custom', 'inna']]), v => { if (supPresets()[v]) s.fix = supPresets()[v][1].slice(); })),
        D.map(([i]) => h('td', { class: 'c' }, cellChk((s.fix || [])[i], v => { s.fix = s.fix || [0, 0, 0, 0, 0, 0]; s.fix[i] = v; }))),
        h('td', null, h('button', { class: 'btn sm', onclick: () => springDlg(s) }, (s.k || []).some(v => +v > 0) ? 'tak…' : '…')),
        h('td', null, delBtn(() => { P.supports = P.supports.filter(x => x !== s); }))));
    });
    L.append(grp('supports', 'Podpory', [h('div', { class: 'tscroll' }, ts), h('p', { class: 'hint' }, 'Zaznacz zablokowane stopnie swobody (ux, uy – przesuw, φ – obrót). Podporę można też dodać narzędziem „△ Podpora”.')], true, P.supports.length));
    // przekroje
    const tp = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Nr'), h('th', null, 'Przekrój'), h('th', null, 'Materiał'), h('th', null, 'A [cm²]'), h('th', null, 'I<sub>y</sub> [cm⁴]'.replace(/<[^>]+>/g, '')), h('th', null, 'Prętów'), h('th', null, '')));
    P.sections.forEach(s => {
      const p = SEC.compute(s.def), n = P.members.filter(m => String(m.sec) === String(s.id)).length;
      tp.append(h('tr', null, h('td', null, s.id), h('td', null, h('a', { href: '#', onclick: e => { e.preventDefault(); sectionDlg(s); } }, s.name)), h('td', null, s.mat), h('td', { class: 'n' }, p ? fmt(p.A / 100, 2) : '—'), h('td', { class: 'n' }, p ? fmtS(p.Iy / 1e4, 4) : '—'), h('td', { class: 'n' }, n),
        h('td', null, delBtn(() => { if (n) { toast('Przekrój jest używany'); return; } P.sections = P.sections.filter(x => x !== s); }))));
    });
    L.append(grp('sections', 'Przekroje i materiały', [tp, h('div', { class: 'tadd' }, h('button', { class: 'btn', onclick: () => sectionDlg(null) }, '+ przekrój'))], true, P.sections.length));
    // opcje analizy
    L.append(grp('anal', 'Opcje analizy', h('div', { class: 'frm' },
      h('label', null, 'Odkształcalność postaciowa (Timoshenko)'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', checked: !!P.analysis.shear, style: { width: 'auto' }, onchange: e => { P.analysis.shear = e.target.checked; changed(); } })),
      h('label', null, 'Liczba punktów wyników na pręcie'), h('input', { value: P.analysis.stations || 20, onchange: e => { P.analysis.stations = Math.max(4, Math.min(100, Math.round(num(e.target.value, 20)))); changed(); } }), h('span', { class: 'unit' }, '')
    ), false));
  }

  function selPanel() {
    const box = [];
    const ns = [...ui.sel.nodes], ms = [...ui.sel.members];
    box.push(h('p', { class: 'hint' }, `Zaznaczono: ${ns.length} węzł., ${ms.length} pręt. (Shift + klik – dodaj do zaznaczenia, Delete – usuń)`));
    if (ms.length) {
      box.push(h('div', { class: 'frm' },
        h('label', null, 'Przekrój zaznaczonych prętów'), h('select', { class: 'wide', onchange: e => { ms.forEach(id => memById(id).sec = e.target.value); changed(); } }, [h('option', { value: '' }, '— zmień —')].concat(secOptions().map(([v, l]) => h('option', { value: v }, l)))),
        h('label', null, 'Typ'), h('select', { class: 'wide', onchange: e => { ms.forEach(id => memById(id).type = e.target.value); changed(); } }, h('option', { value: '' }, '— zmień —'), h('option', { value: 'beam' }, 'belka'), h('option', { value: 'truss' }, 'kratowy')),
        P.dim === '3D' ? [h('label', null, 'Kąt β [°]'), h('input', { onchange: e => { ms.forEach(id => memById(id).beta = num(e.target.value, 0)); changed(); } }), h('span')] : null
      ));
      box.push(h('div', { class: 'tadd' },
        h('button', { class: 'btn', onclick: () => { ms.forEach(id => { const m = memById(id); [m.n1, m.n2] = [m.n2, m.n1]; [m.rel1, m.rel2] = [m.rel2, m.rel1]; }); changed(); } }, 'Odwróć kierunek'),
        h('button', { class: 'btn', onclick: () => divideDlg(ms) }, 'Podziel…'),
        h('button', { class: 'btn dng', onclick: deleteSelection }, 'Usuń')));
    }
    if (ns.length) {
      box.push(h('div', { class: 'tadd' },
        h('button', { class: 'btn', onclick: () => moveDlg(ns) }, 'Przesuń / kopiuj…'),
        h('button', { class: 'btn dng', onclick: deleteSelection }, 'Usuń węzły')));
    }
    return box;
  }
  function toolPanel() {
    const pres = supPresets();
    return h('div', { class: 'frm' },
      h('label', null, 'Przekrój nowych prętów'), h('select', { class: 'wide', onchange: e => tset.sec = e.target.value }, secOptions().map(([v, l]) => h('option', { value: v, selected: String(v) === String(tset.sec) }, l))),
      h('label', null, 'Typ nowych prętów'), h('select', { class: 'wide', onchange: e => tset.memType = e.target.value }, h('option', { value: 'beam', selected: tset.memType === 'beam' }, 'belka (zginanie)'), h('option', { value: 'truss', selected: tset.memType === 'truss' }, 'kratowy (tylko N)')),
      h('label', null, 'Rodzaj podpory'), h('select', { class: 'wide', onchange: e => tset.sup = e.target.value }, Object.entries(pres).map(([k, v]) => h('option', { value: k, selected: k === tset.sup }, v[0])).concat([h('option', { value: 'none', selected: tset.sup === 'none' }, 'usuń podporę')]))
    );
  }
  function genPanel() {
    const box = h('div');
    const gens = Object.entries(GEN).filter(([, g]) => g.dim === P.dim);
    let cur = gens[0] && gens[0][0];
    const form = h('div', { class: 'frm' });
    const vals = {};
    const sec2 = { v: tset.sec };
    const draw = () => {
      form.innerHTML = '';
      const g = GEN[cur];
      form.append(h('label', null, 'Schemat'), h('select', { class: 'wide', onchange: e => { cur = e.target.value; draw(); } }, gens.map(([k, gg]) => h('option', { value: k, selected: k === cur }, gg.name))));
      g.params.forEach(([k, lbl, def]) => { if (vals[cur + k] === undefined) vals[cur + k] = def; form.append(h('label', null, lbl), h('input', { class: 'wide', value: vals[cur + k], style: { textAlign: 'left' }, onchange: e => vals[cur + k] = e.target.value })); });
      form.append(h('label', null, 'Przekrój (rygle / pasy)'), h('select', { class: 'wide', onchange: e => tset.sec = e.target.value }, secOptions().map(([v, l]) => h('option', { value: v, selected: String(v) === String(tset.sec) }, l))));
      if (['frame', 'gable', 'space'].includes(cur)) form.append(h('label', null, 'Przekrój słupów'), h('select', { class: 'wide', onchange: e => sec2.v = e.target.value }, secOptions().map(([v, l]) => h('option', { value: v, selected: String(v) === String(sec2.v) }, l))));
    };
    draw();
    box.append(form, h('div', { class: 'tadd' },
      h('button', { class: 'btn pri', onclick: () => runGen(true) }, 'Utwórz (zastąp model)'),
      h('button', { class: 'btn', onclick: () => runGen(false) }, 'Dodaj do modelu')));
    function runGen(replace) {
      const g = GEN[cur], p = {}; g.params.forEach(([k]) => p[k] = vals[cur + k]);
      if (replace) { P.nodes = []; P.members = []; P.supports = []; P.loads = P.loads.filter(l => false); }
      const out = g.run(p, { node: nextId(P.nodes), member: nextId(P.members) }, tset.sec, sec2.v);
      // scalanie węzłów pokrywających się z istniejącymi
      const map = new Map();
      out.nodes.forEach(n => { const ex = findNodeAt([n.x, n.y, n.z || 0]); if (ex) map.set(n.id, ex.id); else { map.set(n.id, n.id); P.nodes.push(P.dim === '2D' ? { id: n.id, x: n.x, y: n.y } : n); } });
      out.members.forEach(m => { m.n1 = map.get(m.n1); m.n2 = map.get(m.n2); P.members.push(m); });
      out.supports.forEach(s => { s.node = map.get(s.node); P.supports = P.supports.filter(x => String(x.node) !== String(s.node)); P.supports.push(s); });
      changed(); fitView(); toast(`Utworzono: ${out.nodes.length} węzłów, ${out.members.length} prętów`);
    }
    return box;
  }

  function springDlg(s) {
    s.k = s.k || [0, 0, 0, 0, 0, 0];
    const f = h('div', { class: 'frm' });
    dofs().forEach(([i, n]) => f.append(h('label', null, `Sprężystość ${n}`), h('input', { value: s.k[i] || '', disabled: !!(s.fix || [])[i], onchange: e => s.k[i] = num(e.target.value, 0) }), h('span', { class: 'unit' }, i < 3 ? 'kN/m' : 'kNm/rad')));
    modal(h('div', null, h('p', null, 'Sztywność sprężyn w kierunkach niezablokowanych (0 – brak).'), f), { title: `Podpora sprężysta – węzeł ${s.node}`, cls: 'sm', buttons: [{ label: 'OK', cls: 'pri', act: () => changed() }] });
  }
  function moveDlg(ids) {
    const v = { dx: 0, dy: 0, dz: 0, n: 1, copy: false, link: true };
    const f = h('div', { class: 'frm' },
      h('label', null, 'Przesunięcie ΔX'), h('input', { value: '0', onchange: e => v.dx = num(e.target.value, 0) }), h('span', { class: 'unit' }, 'm'),
      h('label', null, 'Przesunięcie ΔY'), h('input', { value: '0', onchange: e => v.dy = num(e.target.value, 0) }), h('span', { class: 'unit' }, 'm'),
      P.dim === '3D' ? [h('label', null, 'Przesunięcie ΔZ'), h('input', { value: '0', onchange: e => v.dz = num(e.target.value, 0) }), h('span', { class: 'unit' }, 'm')] : null,
      h('label', null, 'Kopiuj (zamiast przesuwać)'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', style: { width: 'auto' }, onchange: e => v.copy = e.target.checked })),
      h('label', null, 'Liczba kopii'), h('input', { value: '1', onchange: e => v.n = Math.max(1, Math.round(num(e.target.value, 1))) }), h('span'),
      h('label', null, 'Połącz kopie prętami (kopiowanie)'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', checked: true, style: { width: 'auto' }, onchange: e => v.link = e.target.checked })));
    modal(f, { title: 'Przesuń / kopiuj węzły', cls: 'sm', buttons: [{ label: 'Anuluj' }, { label: 'Wykonaj', cls: 'pri', act: () => {
      const sel = ids.map(nodeById).filter(Boolean);
      if (!v.copy) { sel.forEach(n => { n.x = +n.x + v.dx; n.y = +n.y + v.dy; if (P.dim === '3D') n.z = (+n.z || 0) + v.dz; }); changed(); return; }
      const selSet = new Set(ids.map(String));
      const inner = P.members.filter(m => selSet.has(String(m.n1)) && selSet.has(String(m.n2)));
      let prev = new Map(sel.map(n => [String(n.id), n.id]));
      for (let k = 1; k <= v.n; k++) {
        const map = new Map();
        sel.forEach(n => { const id = addNode([+n.x + v.dx * k, +n.y + v.dy * k, (+n.z || 0) + v.dz * k]); map.set(String(n.id), id); if (v.link) addMember(prev.get(String(n.id)), id); });
        inner.forEach(m => { const nm = Object.assign(JSON.parse(JSON.stringify(m)), { id: nextId(P.members), n1: map.get(String(m.n1)), n2: map.get(String(m.n2)) }); P.members.push(nm); });
        prev = map;
      }
      changed();
    } }] });
  }
  function divideDlg(ids) {
    let n = 2;
    modal(h('div', { class: 'frm' }, h('label', null, 'Liczba części'), h('input', { value: '2', onchange: e => n = Math.max(2, Math.round(num(e.target.value, 2))) }), h('span')), { title: 'Podziel pręty', cls: 'sm', buttons: [{ label: 'Anuluj' }, { label: 'Podziel', cls: 'pri', act: () => {
      ids.forEach(id => { const m = memById(id); if (!m) return; const a = nodeById(m.n1), b = nodeById(m.n2); for (let k = 1; k < n; k++) { const t = k / n; addNode([+a.x + (b.x - a.x) * t, +a.y + (b.y - a.y) * t, (+a.z || 0) + ((+b.z || 0) - (+a.z || 0)) * t]); } });
      ui.sel.members.clear(); changed();
    } }] });
  }

  // ---------------------------------------------------- okno przekroju
  function sectionDlg(s) {
    const isNew = !s;
    const cur = s ? JSON.parse(JSON.stringify(s)) : { id: nextSecId(), name: '', mat: 'S235', def: { shape: 'cat', key: 'IPE 200' } };
    const kindOf = id => (MAT.byId[id] || {}).kind || 'steel';
    let kind = kindOf(cur.mat);
    const box = h('div');
    const draw = () => {
      box.innerHTML = '';
      const f = h('div', { class: 'frm' });
      f.append(h('label', null, 'Rodzaj materiału'), h('select', { class: 'wide', onchange: e => { kind = e.target.value; const first = MAT[kind === 'concrete' ? 'concrete' : kind][kind === 'concrete' ? 4 : kind === 'timber' ? 5 : 0]; cur.mat = first.id; cur.def = kind === 'steel' ? { shape: 'cat', key: 'IPE 200' } : kind === 'concrete' ? { shape: 'rect', b: 300, h: 500 } : kind === 'timber' ? { shape: 'rect', b: 100, h: 200 } : { shape: 'rect', b: 1000, h: 250 }; draw(); } },
        [['steel', 'Stal konstrukcyjna'], ['concrete', 'Żelbet / beton'], ['timber', 'Drewno'], ['masonry', 'Mur']].map(([k, l]) => h('option', { value: k, selected: k === kind }, l))));
      const mats = MAT[kind === 'concrete' ? 'concrete' : kind];
      f.append(h('label', null, 'Materiał'), h('select', { class: 'wide', onchange: e => { cur.mat = e.target.value; draw(); } }, mats.map(m => h('option', { value: m.id, selected: m.id === cur.mat }, m.name))));
      const shapes = kind === 'steel' ? ['cat', 'Iw', 'box', 'pipe', 'rect', 'circ', 'user'] : kind === 'concrete' ? ['rect', 'T', 'circ', 'user'] : kind === 'timber' ? ['rect', 'circ', 'user'] : ['rect', 'user'];
      if (!shapes.includes(cur.def.shape)) cur.def = { shape: shapes[0] };
      f.append(h('label', null, 'Kształt'), h('select', { class: 'wide', onchange: e => { cur.def = { shape: e.target.value }; draw(); } }, shapes.map(k => h('option', { value: k, selected: k === cur.def.shape }, SEC.SHAPES[k]))));
      const D = cur.def;
      const fld = (k, lbl, unit, def) => { if (D[k] === undefined) D[k] = def; f.append(h('label', null, lbl), h('input', { value: String(D[k]).replace('.', ','), onchange: e => { D[k] = num(e.target.value, def); draw(); } }), h('span', { class: 'unit' }, unit)); };
      if (D.shape === 'cat') {
        const cat = SEC.catalogList(); if (!D.key) D.key = 'IPE 200';
        const fams = [...new Set(cat.map(c => c.family))]; const fam = (cat.find(c => c.key === D.key) || cat[0]).family;
        f.append(h('label', null, 'Rodzina'), h('select', { class: 'wide', onchange: e => { D.key = cat.find(c => c.family === e.target.value).key; draw(); } }, fams.map(k => h('option', { value: k, selected: k === fam }, k))));
        f.append(h('label', null, 'Profil'), h('select', { class: 'wide', onchange: e => { D.key = e.target.value; draw(); } }, cat.filter(c => c.family === fam).map(c => h('option', { value: c.key, selected: c.key === D.key }, c.key))));
        if (['SHS', 'RHS'].includes(fam)) f.append(h('label', null, 'Rura zimnogięta (PN-EN 10219)'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', checked: !!D.cold, style: { width: 'auto' }, onchange: e => { D.cold = e.target.checked; draw(); } })));
      } else if (D.shape === 'rect') { fld('b', kind === 'masonry' ? 'Długość pasma ściany b' : 'Szerokość b', 'mm', kind === 'masonry' ? 1000 : 300); fld('h', kind === 'masonry' ? 'Grubość ściany t' : 'Wysokość h', 'mm', kind === 'masonry' ? 250 : 500); }
      else if (D.shape === 'circ') fld('D', 'Średnica D', 'mm', 400);
      else if (D.shape === 'T') { fld('bf', 'Szerokość półki b_eff', 'mm', 1000); fld('hf', 'Grubość półki h_f', 'mm', 150); fld('bw', 'Szerokość żebra b_w', 'mm', 300); fld('h', 'Wysokość całkowita h', 'mm', 600); }
      else if (D.shape === 'Iw') { fld('h', 'Wysokość h', 'mm', 500); fld('b', 'Szerokość półek b', 'mm', 250); fld('tw', 'Grubość środnika t_w', 'mm', 10); fld('tf', 'Grubość półek t_f', 'mm', 16); }
      else if (D.shape === 'box') { fld('h', 'Wysokość h', 'mm', 400); fld('b', 'Szerokość b', 'mm', 300); fld('t', 'Grubość ścianek t', 'mm', 12); }
      else if (D.shape === 'pipe') { fld('D', 'Średnica zewn. D', 'mm', 219.1); fld('t', 'Grubość t', 'mm', 8); }
      else if (D.shape === 'user') { fld('A', 'Pole A', 'cm²', 50); fld('Iy', 'I_y', 'cm⁴', 5000); fld('Iz', 'I_z', 'cm⁴', 500); fld('It', 'I_t', 'cm⁴', 20); fld('h', 'Wysokość h (do temperatury)', 'mm', 300); fld('b', 'Szerokość b', 'mm', 150); }
      box.append(f);
      const p = SEC.compute(D);
      if (p) {
        const ol = SEC.outline(D);
        const ext = ol.flat(), mx = Math.max(...ext.map(q => Math.abs(q[0])), ...ext.map(q => Math.abs(q[1])), 1);
        const sc = 32 / mx;
        const svg = `<svg viewBox="-36 -36 72 72" width="72" height="72">${ol.map((poly, i) => `<path d="M${poly.map(q => (q[0] * sc).toFixed(1) + ',' + (-q[1] * sc).toFixed(1)).join('L')}Z" fill="${i ? 'var(--panel)' : 'var(--acc2)'}" stroke="var(--acc3)" stroke-width="1"/>`).join('')}</svg>`;
        box.append(h('div', { class: 'secbox', style: { marginTop: '10px' } }, h('div', { html: svg }), h('dl', { class: 'kv' },
          h('dt', null, 'A'), h('dd', null, fmt(p.A / 100, 2) + ' cm²'), h('dt', null, 'Iy / Iz'), h('dd', null, `${fmtS(p.Iy / 1e4)} / ${fmtS(p.Iz / 1e4)} cm⁴`),
          h('dt', null, 'It'), h('dd', null, fmtS(p.It / 1e4) + ' cm⁴'), h('dt', null, 'Wel,y / Wpl,y'), h('dd', null, `${fmtS(p.Wely / 1e3)} / ${isFinite(p.Wply) ? fmtS(p.Wply / 1e3) : '—'} cm³`),
          h('dt', null, 'ciężar'), h('dd', null, fmt(p.A * 1e-6 * ((MAT.byId[cur.mat] || {}).gamma || 0), 3) + ' kN/m'))));
      }
    };
    draw();
    modal(box, { title: isNew ? 'Nowy przekrój' : `Przekrój ${cur.id}`, cls: 'secpop', buttons: [{ label: 'Anuluj' }, { label: isNew ? 'Dodaj' : 'Zapisz', cls: 'pri', act: () => {
      if (!SEC.compute(cur.def)) { toast('Nieprawidłowe wymiary przekroju'); return false; }
      cur.name = SEC.label(cur.def);
      if (isNew) { P.sections.push(cur); tset.sec = cur.id; } else Object.assign(s, cur);
      changed();
    } }] });
  }

  /* ---------------------------------------------------- panel obciążeń */
  function leftLoads(L) {
    // przypadki
    const tc = h('table', { class: 'etab' }, h('tr', null, h('th', null, ''), h('th', null, 'Nazwa'), h('th', null, 'Rodzaj'), h('th', { title: 'Kategoria (ψ)' }, 'Kat.'), h('th', { title: 'Przypadki z tą samą grupą wykluczają się (np. kierunki wiatru)' }, 'Grupa'), h('th', { title: 'Ciężar własny prętów' }, 'c.w.'), h('th', null, '')));
    P.cases.forEach(c => {
      const catOpts = c.type === 'Q' ? Object.entries(F.PSI).filter(([k]) => k.length === 1 && 'ABCDEFGH'.includes(k)).map(([k, v]) => [k, k]) : c.type === 'S' ? [['S', '≤1000 m'], ['S2', '>1000 m']] : [['', '—']];
      tc.append(h('tr', { class: String(c.id) === String(ui.activeCase) ? 'act' : '' },
        h('td', null, h('input', { type: 'radio', name: 'actc', checked: String(c.id) === String(ui.activeCase), title: 'Aktywny przypadek', onchange: () => { ui.activeCase = c.id; renderLeft(); renderView(); } })),
        h('td', null, h('input', { class: 't', value: c.name, onchange: e => { c.name = e.target.value; changed(); } })),
        h('td', null, cellSel(c.type, Object.entries(F.CASE_TYPES).map(([k, v]) => [k, `${k} – ${v}`]), v => { c.type = v; if (v === 'Q' && !c.cat) c.cat = 'A'; })),
        h('td', null, cellSel(c.cat || '', catOpts, v => c.cat = v)),
        h('td', null, h('input', { class: 't', value: c.group || '', style: { width: '64px' }, onchange: e => { c.group = e.target.value.trim(); changed(); } })),
        h('td', { class: 'c' }, cellChk(c.selfWeight, v => c.selfWeight = !!v)),
        h('td', null, delBtn(() => { P.cases = P.cases.filter(x => x !== c); P.loads = P.loads.filter(l => String(l.case) !== String(c.id)); if (String(ui.activeCase) === String(c.id)) ui.activeCase = P.cases[0] && P.cases[0].id; }))));
    });
    const addCase = (t, name, extra) => { const id = nextCaseId(t); P.cases.push(Object.assign({ id, name, type: t }, extra || {})); ui.activeCase = id; changed(); };
    L.append(grp('cases', 'Przypadki obciążeń', [tc, h('div', { class: 'tadd' },
      h('button', { class: 'btn', onclick: () => addCase('G', 'Obciążenia stałe') }, '+ stałe G'),
      h('button', { class: 'btn', onclick: () => addCase('Q', 'Użytkowe', { cat: 'A' }) }, '+ użytkowe Q'),
      h('button', { class: 'btn', onclick: () => addCase('S', 'Śnieg') }, '+ śnieg S'),
      h('button', { class: 'btn', onclick: () => addCase('W', 'Wiatr', { group: 'wiatr' }) }, '+ wiatr W'),
      h('button', { class: 'btn', onclick: () => addCase('T', 'Temperatura') }, '+ temp. T'),
      h('button', { class: 'btn', onclick: () => addCase('A', 'Wyjątkowe') }, '+ wyjątkowe A')),
      h('p', { class: 'hint' }, 'Współczynniki ψ wg PN-EN 1990, tabl. A1.1 (ZK PL) wynikają z rodzaju i kategorii. Wartości z modułu „Obciążenia EC1” można przenieść jako obciążenia rozłożone.')], true, P.cases.length));
    // narzędzie obciążeń
    const dirOpts = P.dim === '2D' ? [['Y', 'Y globalnie (pion)'], ['X', 'X globalnie (poziom)'], ['z', 'z lokalnie (⊥ pręta)'], ['x', 'x lokalnie (wzdłuż)']] : [['Z', 'Z globalnie (pion)'], ['X', 'X globalnie'], ['Y', 'Y globalnie'], ['z', 'z lokalnie'], ['y', 'y lokalnie'], ['x', 'x lokalnie']];
    if (!tset.loadDir) tset.loadDir = vertDir();
    L.append(grp('ltool', 'Nowe obciążenie (narzędzie „↓ Obciążenie”)', h('div', { class: 'frm' },
      h('label', null, 'Rodzaj'), h('select', { class: 'wide', onchange: e => { tset.loadType = e.target.value; renderLeft(); } }, [['dist', 'rozłożone na pręcie'], ['point', 'skupione na pręcie'], ['moment', 'moment skupiony'], ['temp', 'temperatura'], ['nodal', 'siła węzłowa (klik w węzeł)']].map(([k, l]) => h('option', { value: k, selected: k === tset.loadType }, l))),
      tset.loadType !== 'temp' && tset.loadType !== 'moment' ? [h('label', null, 'Kierunek'), h('select', { class: 'wide', onchange: e => tset.loadDir = e.target.value }, dirOpts.map(([k, l]) => h('option', { value: k, selected: k === tset.loadDir }, l)))] : null,
      h('label', null, tset.loadType === 'dist' ? 'Wartość q₁ (− w dół)' : tset.loadType === 'temp' ? 'ΔT równomierne' : tset.loadType === 'moment' ? 'Moment M' : 'Wartość P (− w dół)'), h('input', { value: String(tset.loadVal).replace('.', ','), onchange: e => tset.loadVal = num(e.target.value, 0) }), h('span', { class: 'unit' }, tset.loadType === 'dist' ? 'kN/m' : tset.loadType === 'temp' ? 'K' : tset.loadType === 'moment' ? 'kNm' : 'kN'),
      tset.loadType === 'dist' ? [h('label', null, 'Wartość q₂ (koniec; puste = q₁)'), h('input', { value: tset.loadVal2 ?? '', onchange: e => tset.loadVal2 = e.target.value.trim() === '' ? null : num(e.target.value, 0) }), h('span', { class: 'unit' }, 'kN/m')] : null,
      h('span', { class: 'wide', style: { gridColumn: '1 / -1' } }, h('div', { class: 'tadd' }, h('button', { class: 'btn', disabled: !ui.sel.members.size, onclick: () => { ui.sel.members.forEach(id => addLoadOn({ kind: 'member', id })); changed(); } }, `Dodaj do zaznaczonych prętów (${ui.sel.members.size})`), h('button', { class: 'btn', disabled: !ui.sel.nodes.size, onclick: () => { ui.sel.nodes.forEach(id => addLoadOn({ kind: 'node', id })); changed(); } }, `do zaznaczonych węzłów (${ui.sel.nodes.size})`)))
    ), true));
    // lista obciążeń aktywnego przypadku
    const ac = caseById(ui.activeCase);
    const loads = P.loads.filter(l => String(l.case) === String(ui.activeCase));
    const tl = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Rodzaj'), h('th', null, 'Element'), h('th', null, 'Kier.'), h('th', null, 'Wartość'), h('th', null, 'Wart. 2'), h('th', { title: 'Położenie: ułamek długości pręta 0…1' }, 'a'), h('th', null, 'b'), h('th', { title: 'Obciążenie na rzut poziomy (np. śnieg na połaci)' }, 'rzut'), h('th', null, '')));
    loads.forEach(l => {
      const dsel = (P.dim === '2D' ? ['X', 'Y', 'x', 'z'] : ['X', 'Y', 'Z', 'x', 'y', 'z']).map(k => [k, k]);
      if (l.type === 'nodal') {
        const comps = P.dim === '2D' ? [[0, 'Fx'], [1, 'Fy'], [5, 'Mz']] : [[0, 'Fx'], [1, 'Fy'], [2, 'Fz'], [3, 'Mx'], [4, 'My'], [5, 'Mz']];
        tl.append(h('tr', null, h('td', null, 'węzłowe'), h('td', null, cellNum(l.node, v => l.node = v)), h('td', { colspan: 6 }, comps.map(([i, n]) => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '2px', marginRight: '4px' } }, h('small', null, n), h('span', { style: { width: '54px', display: 'inline-block' } }, cellNum((l.F || [])[i] || 0, v => { l.F = l.F || [0, 0, 0, 0, 0, 0]; l.F[i] = v; }))))), h('td', null, ''), h('td', null, delBtn(() => P.loads = P.loads.filter(x => x !== l)))));
        return;
      }
      tl.append(h('tr', null,
        h('td', null, { dist: 'rozłożone', point: 'skupione', moment: 'moment', temp: 'temperatura' }[l.type]),
        h('td', null, cellNum(l.member, v => l.member = v)),
        h('td', null, l.type === 'temp' ? '' : l.type === 'moment' ? cellSel(l.dir || 'y', (P.dim === '2D' ? [['y', 'y']] : [['x', 'x'], ['y', 'y'], ['z', 'z']]), v => l.dir = v) : cellSel(l.dir, dsel, v => l.dir = v)),
        h('td', null, l.type === 'dist' ? cellNum(l.q1, v => l.q1 = v) : l.type === 'point' ? cellNum(l.P, v => l.P = v) : l.type === 'moment' ? cellNum(l.M, v => l.M = v) : cellNum(l.dT, v => l.dT = v, { title: 'ΔT równomierne [K]' })),
        h('td', null, l.type === 'dist' ? cellNum(l.q2 ?? l.q1, v => l.q2 = v) : l.type === 'temp' ? cellNum(l.dTz || 0, v => l.dTz = v, { title: 'Różnica temperatur ΔT_z = T(+z) − T(−z) [K]' }) : ''),
        h('td', null, cellNum(l.a ?? (l.type === 'dist' ? 0 : 0.5), v => l.a = Math.max(0, Math.min(1, v)))),
        h('td', null, l.type === 'dist' ? cellNum(l.b ?? 1, v => l.b = Math.max(0, Math.min(1, v))) : ''),
        h('td', { class: 'c' }, l.type === 'dist' && 'XYZ'.includes(l.dir) ? cellChk(l.proj, v => l.proj = !!v) : ''),
        h('td', null, delBtn(() => P.loads = P.loads.filter(x => x !== l)))));
    });
    L.append(grp('loadlist', `Obciążenia: ${ac ? ac.name : '—'}`, [h('div', { class: 'tscroll', style: { maxHeight: '420px' } }, tl), loads.length ? null : h('p', { class: 'hint' }, 'Brak obciążeń w tym przypadku. Wybierz narzędzie „↓ Obciążenie” i kliknij pręt lub węzeł.'), ac && ac.selfWeight ? h('p', { class: 'hint' }, 'Ten przypadek zawiera ciężar własny prętów (liczony automatycznie z przekroju i materiału).') : null], true, loads.length));
  }

  /* ---------------------------------------------------- panel wyników */
  function leftResults(L) {
    const r = analyze();
    if (!r) { L.append(h('div', { class: 'fields' }, h('div', { class: 'msg err' }, (ui.resErr || ['Brak wyników']).join(' ')))); return; }
    // źródło
    const src = h('select', { class: 'wide', onchange: e => { ui.rv.src = e.target.value; ui.extra.buckShow = null; renderLeft(); renderView(); } });
    const og = (label, items) => { const g = h('optgroup', { label }); items.forEach(([v, l]) => g.append(h('option', { value: v, selected: v === ui.rv.src }, l))); src.append(g); };
    const sets = ['ULS', 'EQU', 'ACC', 'SLS_CH', 'SLS_FR', 'SLS_QP'].filter(s => s !== 'ACC' || P.cases.some(c => c.type === 'A'));
    og('Obwiednie kombinacji', sets.map(s => ['env:' + s, 'Obwiednia ' + F.SET_NAMES[s]]));
    og('Przypadki', P.cases.map(c => ['case:' + c.id, c.name]));
    sets.forEach(s => { const cl = combosOf(s); if (cl.length) og('Kombinacje ' + F.SET_NAMES[s], cl.map((c, i) => [`combo:${s}#${i}`, `${s} ${i + 1}: ${c.name}`])); });
    const qs = P.dim === '2D' ? [['M', 'M'], ['V', 'V'], ['N', 'N'], ['def', 'Deformacja'], ['reac', 'Reakcje']] : [['My', 'My'], ['Mz', 'Mz'], ['Vz', 'Vz'], ['Vy', 'Vy'], ['N', 'N'], ['T', 'T'], ['def', 'Deform.'], ['reac', 'Reakcje']];
    if (!qs.some(q => q[0] === ui.rv.q) && !['buck', 'modal'].includes(ui.rv.q)) ui.rv.q = qs[0][0];
    const seg = h('div', { class: 'segsw', style: { flexWrap: 'wrap' } }, qs.map(([k, l]) => h('button', { class: ui.rv.q === k ? 'on' : '', onclick: () => { ui.rv.q = k; renderLeft(); renderView(); } }, l)));
    const isCombo = ui.rv.src.startsWith('combo:');
    L.append(grp('rsrc', 'Wyniki', [h('div', { class: 'frm' },
      h('label', null, 'Źródło'), src,
      h('label', null, 'Skala wykresu'), h('input', { type: 'range', min: '0.2', max: '4', step: '0.1', value: ui.rv.scale, class: 'wide', style: { padding: 0 }, oninput: e => { ui.rv.scale = +e.target.value; renderView(); } }),
      h('label', null, 'Pokaż reakcje'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', checked: ui.rv.reac, style: { width: 'auto' }, onchange: e => { ui.rv.reac = e.target.checked; renderView(); } })),
      isCombo ? [h('label', { title: 'Analiza z uwzględnieniem wpływu przemieszczeń (P-Δ, macierz geometryczna)' }, 'Analiza II rzędu (P-Δ)'), h('span', { class: 'wide' }, h('input', { type: 'checkbox', checked: ui.rv.second, style: { width: 'auto' }, onchange: e => { ui.rv.second = e.target.checked; renderLeft(); renderView(); } }))] : null
    ), h('div', { style: { margin: '8px 0 4px' } }, seg),
    h('p', { class: 'hint' }, ui.rv.src.startsWith('env:') ? 'Obwiednia: dla każdego punktu wybrano najniekorzystniejszą kombinację wg PN-EN 1990 (6.10a/b z ZK PL). Analiza II rzędu – wybierz konkretną kombinację.' : '')], true));

    const R = currentResults();
    if (R && R.err) L.append(h('div', { class: 'fields' }, h('div', { class: 'msg err' }, R.err.join(' '))));
    if (R && !R.err) {
      const q = ui.rv.q;
      if (q === 'reac' || ui.rv.reac) L.append(grp('rreac', 'Reakcje podpór', reacTable(R), true));
      if (q === 'def') L.append(grp('rdisp', 'Przemieszczenia węzłów', dispTable(R), true));
      if (!['def', 'reac', 'buck', 'modal'].includes(q)) L.append(grp('rext', `Ekstrema ${Q_LBL[q] ? Q_LBL[q].replace(/<[^>]+>/g, '') : q} w prętach`, extTable(R, qKey(q)), true));
      if (ui.sel.members.size === 1) L.append(grp('rmem', `Pręt ${[...ui.sel.members][0]} – siły przekrojowe`, memberDetail(R, [...ui.sel.members][0]), true));
    }
    // wyboczenie i drgania
    L.append(grp('rbuck', 'Stateczność – wyboczenie (αcr)', buckPanel(), false));
    L.append(grp('rmodal', 'Drgania własne', modalPanel(), false));
    if (r.warnings.length || (r.autoFixed && r.autoFixed.length)) L.append(grp('rwarn', 'Uwagi obliczeniowe', [r.warnings.map(w => h('div', { class: 'msg warn' }, w)), r.autoFixed && r.autoFixed.length ? h('p', { class: 'hint' }, `Zablokowano automatycznie ${r.autoFixed.length} obrotów węzłów bez sztywności obrotowej (np. węzły kratownic).`) : null], false));
  }
  const dispVal = (v, env) => env ? `${fmt(v[0] * 1000, 2)} / ${fmt(v[1] * 1000, 2)}` : fmt(v * 1000, 2);
  function reacTable(R) {
    const comps = P.dim === '2D' ? [[0, 'R<sub>x</sub> [kN]'], [1, 'R<sub>y</sub> [kN]'], [5, 'M [kNm]']] : [[0, 'R<sub>x</sub>'], [1, 'R<sub>y</sub>'], [2, 'R<sub>z</sub>'], [3, 'M<sub>x</sub>'], [4, 'M<sub>y</sub>'], [5, 'M<sub>z</sub>']];
    const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Węzeł'), comps.map(([, l]) => h('th', { html: l }))));
    const sum = comps.map(() => [0, 0]);
    R.reactions.forEach(r => t.append(h('tr', null, h('td', null, r.node), comps.map(([i], k) => { const v = r.R[i]; if (Array.isArray(v)) { sum[k][0] += v[0]; sum[k][1] += v[1]; return h('td', null, `${fmt(v[0])} / ${fmt(v[1])}`); } sum[k][0] += v; return h('td', null, fmt(v)); }))));
    if (!R.env) t.append(h('tr', null, h('td', null, h('b', null, 'Σ')), sum.map((s, k) => h('td', null, h('b', null, comps[k][0] < 3 ? fmt(s[0]) : '')))));
    return [t, R.env ? h('p', { class: 'hint' }, 'Obwiednia: wartość minimalna / maksymalna każdej składowej (różne kombinacje).') : h('p', { class: 'hint' }, 'Reakcje dodatnie – zgodnie ze zwrotem osi globalnych.')];
  }
  function dispTable(R) {
    const comps = P.dim === '2D' ? [[0, 'u<sub>x</sub> [mm]'], [1, 'u<sub>y</sub> [mm]'], [5, 'φ [mrad]']] : [[0, 'u<sub>x</sub>'], [1, 'u<sub>y</sub>'], [2, 'u<sub>z</sub>'], [3, 'φ<sub>x</sub>'], [4, 'φ<sub>y</sub>'], [5, 'φ<sub>z</sub>']];
    const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Węzeł'), comps.map(([, l]) => h('th', { html: l }))));
    P.nodes.forEach((n, i) => { const d = R.disp[i]; if (!d) return; t.append(h('tr', null, h('td', null, n.id), comps.map(([k]) => h('td', null, dispVal(d[k], R.env))))); });
    // maksymalne ugięcie względne prętów (lokalnie, względem cięciwy)
    const rows = [];
    if (!R.env) R.members.forEach(m => { const mm = memById(m.id); if (!mm || mm.type === 'truss') return; const a = nodeById(mm.n1), b = nodeById(mm.n2); const Lm = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)); let w = 0; const st = m.st, s0 = st[0], s1 = st[st.length - 1]; st.forEach(s => { const t2 = s.x / Lm, rel = Math.hypot(s.uz - (s0.uz + (s1.uz - s0.uz) * t2), P.dim === '3D' ? s.uy - (s0.uy + (s1.uy - s0.uy) * t2) : 0); w = Math.max(w, rel); }); rows.push([m.id, w, Lm]); });
    const out = [h('div', { class: 'tscroll' }, t)];
    if (rows.length) {
      rows.sort((a, b) => b[1] / b[2] - a[1] / a[2]);
      const t2 = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Pręt'), h('th', null, 'L [m]'), h('th', null, 'ugięcie względne [mm]'), h('th', null, 'L / u')));
      rows.slice(0, 12).forEach(([id, w, Lm]) => t2.append(h('tr', { onclick: () => { ui.sel.members = new Set([String(id)]); renderLeft(); renderView(); } }, h('td', null, id), h('td', null, fmt(Lm)), h('td', null, fmt(w * 1000, 2)), h('td', null, w > 1e-9 ? 'L/' + Math.round(Lm / w) : '—'))));
      out.push(h('h4', { style: { margin: '8px 0 2px', fontSize: '12px', color: 'var(--acc3)' } }, 'Ugięcia prętów względem cięciwy'), t2);
    }
    return out;
  }
  function extTable(R, key) {
    const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Pręt'), h('th', null, 'przekrój'), h('th', null, 'min'), h('th', null, 'x [m]'), h('th', null, 'max'), h('th', null, 'x [m]')));
    let gmax = 0;
    const rows = R.members.map(m => {
      let mn = Infinity, mx = -Infinity, xmn = 0, xmx = 0;
      m.st.forEach(s => { const v = s[key]; const a = Array.isArray(v) ? v[0] : v, b = Array.isArray(v) ? v[1] : v; if (a < mn) { mn = a; xmn = s.x; } if (b > mx) { mx = b; xmx = s.x; } });
      gmax = Math.max(gmax, Math.abs(mn), Math.abs(mx));
      return { id: m.id, mn, mx, xmn, xmx };
    });
    rows.forEach(r => { const mm = memById(r.id); t.append(h('tr', { class: ui.sel.members.has(String(r.id)) ? 'sel' : '', onclick: () => { ui.sel.members = new Set([String(r.id)]); renderLeft(); renderView(); } }, h('td', null, r.id), h('td', null, mm ? ((secById(mm.sec) || {}).name || '') : ''), h('td', { class: Math.abs(r.mn) >= gmax - 1e-9 ? 'max' : '' }, fmt(r.mn)), h('td', null, fmt(r.xmn)), h('td', { class: Math.abs(r.mx) >= gmax - 1e-9 ? 'max' : '' }, fmt(r.mx)), h('td', null, fmt(r.xmx)))); });
    return [h('div', { class: 'tscroll', style: { maxHeight: '360px' } }, t), h('p', { class: 'hint' }, 'Kliknij wiersz – szczegóły pręta. x – odległość od węzła początkowego.')];
  }
  function memberDetail(R, id) {
    const m = R.members.find(x => String(x.id) === String(id)); if (!m) return h('p', null, '—');
    const keys = P.dim === '2D' ? [['N', 'N [kN]'], ['Vz', 'V [kN]'], ['My', 'M [kNm]'], ['uz', 'u⊥ [mm]']] : [['N', 'N'], ['Vy', 'Vy'], ['Vz', 'Vz'], ['T', 'T'], ['My', 'My'], ['Mz', 'Mz']];
    const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'x [m]'), keys.map(([, l]) => h('th', null, l))));
    const step = Math.max(1, Math.floor(m.st.length / 12));
    m.st.forEach((s, i) => { if (i % step && i !== m.st.length - 1 && !s.side) return; t.append(h('tr', null, h('td', null, fmt(s.x, 3)), keys.map(([k]) => { const v = s[k]; const f = k.startsWith('u') ? 1000 : 1; return h('td', null, Array.isArray(v) ? `${fmt(v[0] * f)} / ${fmt(v[1] * f)}` : fmt(v * f)); }))); });
    const mm = memById(id);
    const info = mm ? `Przekrój: ${(secById(mm.sec) || {}).name || ''}, materiał: ${(secById(mm.sec) || {}).mat || ''}` : '';
    return [h('p', { class: 'hint' }, info), h('div', { class: 'tscroll' }, t)];
  }
  function buckPanel() {
    const box = h('div');
    const cl = combosOf('ULS');
    let sel = ui.extra.buckCombo ?? 0;
    const s = h('select', { class: 'wide', onchange: e => sel = +e.target.value }, [h('option', { value: -1, selected: sel === -1 }, 'wszystkie kombinacje SGN (minimum αcr)')].concat(cl.map((c, i) => h('option', { value: i, selected: i === sel }, `${i + 1}: ${c.name}`))));
    box.append(h('div', { class: 'frm' }, h('label', null, 'Kombinacja'), s), h('div', { class: 'tadd' }, h('button', { class: 'btn pri', onclick: () => {
      ui.extra.buckCombo = sel;
      const model = femModel(), list = sel === -1 ? cl.map((c, i) => [i, c]) : [[sel, cl[sel]]];
      let best = null;
      for (const [i, c] of list) { const b = F.analyzeBuckling(model, c.factors, { modes: 4, shear: !!P.analysis.shear }); if (!b.ok) { toast(b.errors.join(' ')); return; } if (b.modes.length && (!best || b.modes[0].alpha < best.b.modes[0].alpha)) best = { i, c, b }; }
      ui.extra.buck = best; ui.extra.buckShow = best && best.b.modes[0] ? { shape: best.b.modes[0].shape, label: `postać 1, αcr = ${fmt(best.b.modes[0].alpha, 2)}` } : null;
      if (best) { ui.rv.q = 'buck'; }
      renderLeft(); renderView();
    } }, 'Oblicz αcr')));
    const B = ui.extra.buck;
    if (B) {
      const md = B.b.modes;
      box.append(h('p', null, `Kombinacja decydująca: ${B.i + 1}: ${B.c.name}`));
      const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Postać'), h('th', null, 'α_cr'), h('th', null, 'ocena (PN-EN 1993-1-1, 5.2.1)'), h('th', null, '')));
      md.forEach((m, k) => t.append(h('tr', null, h('td', null, k + 1), h('td', null, fmt(m.alpha, 3)), h('td', null, m.alpha >= 10 ? 'αcr ≥ 10 – analiza I rzędu wystarcza' : m.alpha >= 3 ? '3 ≤ αcr < 10 – uwzględnić efekty II rzędu' : 'αcr < 3 – wymagana analiza II rzędu / zmiana konstrukcji'), h('td', null, h('button', { class: 'btn sm', onclick: () => { ui.rv.q = 'buck'; ui.extra.buckShow = { shape: m.shape, label: `postać ${k + 1}, αcr = ${fmt(m.alpha, 2)}` }; renderLeft(); renderView(); } }, 'pokaż')))));
      box.append(t);
      if (B.b.lcr && B.b.lcr.length) {
        const t2 = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Pręt'), h('th', null, 'N [kN]'), h('th', null, 'N_cr [kN]'), h('th', null, 'L_cr,y [m]'), h('th', null, 'L_cr,z [m]')));
        B.b.lcr.filter(x => x.Ncr).sort((a, b) => a.N - b.N).slice(0, 15).forEach(x => t2.append(h('tr', null, h('td', null, x.id), h('td', null, fmt(x.N)), h('td', null, fmt(x.Ncr, 1)), h('td', null, fmt(x.Lcr_y)), h('td', null, fmt(x.Lcr_z)))));
        box.append(h('p', { class: 'hint' }, 'Długości wyboczeniowe z 1. postaci globalnej (L_cr = π√(EI/N_cr)) – do wymiarowania prętów ściskanych.'), t2);
      }
    } else if (B === null) box.append(h('p', { class: 'hint' }, 'Brak prętów ściskanych – wyboczenie nie występuje.'));
    return box;
  }
  function modalPanel() {
    const box = h('div');
    P.analysis.mass = P.analysis.mass || {};
    const tbl = h('table', { class: 'etab' }, h('tr', null, h('th', null, 'Przypadek zamieniany na masę'), h('th', null, 'współczynnik')));
    P.cases.forEach(c => { if (P.analysis.mass[c.id] === undefined) P.analysis.mass[c.id] = c.type === 'G' ? 1 : c.type === 'Q' ? F.psiOf(c).p2 : 0; tbl.append(h('tr', null, h('td', null, c.name + (c.selfWeight ? ' (bez c.w. – liczony osobno)' : '')), h('td', null, h('input', { value: String(P.analysis.mass[c.id]).replace('.', ','), onchange: e => { P.analysis.mass[c.id] = num(e.target.value, 0); } })))); });
    box.append(tbl, h('div', { class: 'tadd' }, h('button', { class: 'btn pri', onclick: () => {
      const r = F.analyzeModal(femModel(), { modes: P.analysis.modes || 6, massCases: P.analysis.mass, shear: !!P.analysis.shear });
      if (!r.ok) { toast(r.errors.join(' ')); return; }
      ui.extra.modal = r; ui.rv.q = 'modal'; ui.extra.modalShow = r.modes[0] ? { shape: r.modes[0].shape, label: `postać 1, f = ${fmt(r.modes[0].f, 3)} Hz` } : null;
      renderLeft(); renderView();
    } }, 'Oblicz drgania')));
    const M = ui.extra.modal;
    if (M) {
      const dirs = P.dim === '2D' ? [[0, 'X'], [1, 'Y']] : [[0, 'X'], [1, 'Y'], [2, 'Z']];
      const t = h('table', { class: 'rtab' }, h('tr', null, h('th', null, 'Postać'), h('th', null, 'f [Hz]'), h('th', null, 'T [s]'), dirs.map(([, n]) => h('th', null, 'm_eff,' + n + ' [%]')), h('th', null, '')));
      const cum = [0, 0, 0];
      M.modes.forEach((m, k) => { dirs.forEach(([d]) => cum[d] += m.massPart[d]); t.append(h('tr', null, h('td', null, k + 1), h('td', null, fmt(m.f, 3)), h('td', null, fmt(m.T, 3)), dirs.map(([d]) => h('td', null, fmt(m.massPart[d] * 100, 1))), h('td', null, h('button', { class: 'btn sm', onclick: () => { ui.rv.q = 'modal'; ui.extra.modalShow = { shape: m.shape, label: `postać ${k + 1}, f = ${fmt(m.f, 3)} Hz` }; renderView(); } }, 'pokaż')))); });
      box.append(t, h('p', { class: 'hint' }, `Masa całkowita: ${dirs.map(([d, n]) => n + ' ' + fmt(M.totalMass[d], 2) + ' t').join(', ')}. Suma mas efektywnych: ${dirs.map(([d, n]) => n + ' ' + fmt(cum[d] * 100, 1) + '%').join(', ')}.`));
    }
    return box;
  }

  /* ================================================================ kombinacje */
  function renderCombos() {
    const p = $('#p-combos'); if (!p || !P) return;
    p.innerHTML = '';
    const c = P.combo;
    const fld = (k, lbl) => [h('label', null, lbl), h('input', { value: String(c[k]).replace('.', ','), onchange: e => { c[k] = num(e.target.value, F.DEFAULT_FACTORS[k]); changed({ panel: false }); renderCombos(); } }), h('span')];
    const wrap = h('div', { class: 'combos-wrap' });
    wrap.append(h('h3', { style: { margin: '0 0 8px', color: 'var(--acc3)' } }, 'Kombinacje oddziaływań – PN-EN 1990 z Załącznikiem krajowym'));
    wrap.append(h('div', { class: 'frm' },
      h('label', null, 'Kombinacja podstawowa SGN'), h('select', { class: 'wide', onchange: e => { c.rule = e.target.value; changed({ panel: false }); renderCombos(); } }, h('option', { value: '6.10ab', selected: c.rule !== '6.10' }, 'wzory 6.10a i 6.10b (ZK PL)'), h('option', { value: '6.10', selected: c.rule === '6.10' }, 'wzór 6.10')),
      fld('gGsup', 'γ_G,sup (niekorzystne)'), fld('gGinf', 'γ_G,inf (korzystne)'), fld('gQ', 'γ_Q'), c.rule !== '6.10' ? fld('xi', 'ξ (6.10b)') : null,
      h('h5', null, 'Równowaga statyczna EQU'), fld('gGsupEQU', 'γ_G,sup'), fld('gGinfEQU', 'γ_G,inf'), fld('gQEQU', 'γ_Q')));
    // współczynniki ψ
    const tp = h('table', { class: 'ctab', style: { maxWidth: '760px', marginTop: '12px' } }, h('tr', null, h('th', null, 'Przypadek'), h('th', null, 'Rodzaj'), h('th', null, 'ψ₀'), h('th', null, 'ψ₁'), h('th', null, 'ψ₂'), h('th', null, 'Grupa wykluczająca')));
    P.cases.forEach(cs => { const ps = F.psiOf(cs); tp.append(h('tr', null, h('td', null, cs.name), h('td', null, F.CASE_TYPES[cs.type] + (cs.cat ? ` (${cs.cat})` : '')), cs.type === 'G' ? [h('td', null, '—'), h('td', null, '—'), h('td', null, '—')] : [h('td', null, fmt(ps.p0, 1)), h('td', null, fmt(ps.p1, 1)), h('td', null, fmt(ps.p2, 1))], h('td', null, cs.group || '—'))); });
    wrap.append(h('h4', { style: { margin: '16px 0 4px' } }, 'Współczynniki ψ (PN-EN 1990, tabl. A1.1)'), tp);
    // lista kombinacji
    const sets = ['ULS', 'EQU', 'SLS_CH', 'SLS_FR', 'SLS_QP'].concat(P.cases.some(x => x.type === 'A') ? ['ACC'] : []);
    sets.forEach(set => {
      const list = combosOf(set);
      const t = h('table', { class: 'ctab', style: { maxWidth: '1000px' } }, h('tr', null, h('th', null, 'Nr'), h('th', null, 'Opis'), h('th', null, 'Współczynniki')));
      list.forEach((cb, i) => t.append(h('tr', null, h('td', null, i + 1), h('td', null, cb.name), h('td', null, F.describeFactors(P.cases, cb.factors)))));
      wrap.append(h('details', { class: 'grp', open: set === 'ULS' }, h('summary', null, `${F.SET_NAMES[set]} – ${list.length} kombinacji`), h('div', { style: { padding: '6px 0 10px' } }, t)));
    });
    wrap.append(h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Do obwiedni wyników (analiza I rzędu) program dobiera współczynniki dla każdej wielkości osobno – stałe niekorzystne/korzystne, każde obciążenie zmienne jako wiodące, przypadki z tej samej grupy wykluczają się. Jawna lista służy do analizy II rzędu, wyboczenia i raportu.'));
    p.append(wrap);
  }

  /* ================================================================ raport */
  function renderReport() {
    const p = $('#p-report'); p.innerHTML = '';
    analyze();
    const opts = BM.store.get('statyka:repopts', { full: true, envSets: ['ULS', 'SLS_CH'], caseResults: false, drawings: true });
    const tools = h('div', { class: 'rtools noprint' },
      h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'rk', checked: opts.full, onchange: () => { opts.full = true; save(); } }), 'raport pełny (dane + wyniki)'),
      h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'rk', checked: !opts.full, onchange: () => { opts.full = false; save(); } }), 'tylko wyniki statyki'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: opts.caseResults, onchange: e => { opts.caseResults = e.target.checked; save(); } }), 'wyniki dla przypadków'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: opts.drawings, onchange: e => { opts.drawings = e.target.checked; save(); } }), 'rysunki'),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn pri', onclick: doPrint }, 'Drukuj / PDF'), h('button', { class: 'btn', onclick: exportOdt }, 'Zapisz ODT'), h('button', { class: 'btn', onclick: exportHtml }, 'Zapisz HTML'));
    function save() { BM.store.set('statyka:repopts', opts); renderReport(); }
    p.append(tools);
    p.append(BMReportStat.build(appApi(), opts));
  }
  function appApi() {
    return { P, analyze, envelope, combosOf, currentResults, femModel, secById, caseById, nodeById, memById, extra: ui.extra, comboFactors, qKey };
  }
  function doPrint() { if (ui.tab !== 'report') setTab('report'); setTimeout(() => window.print(), 80); }
  async function exportOdt() {
    if (ui.tab !== 'report') setTab('report');
    const rep = $('#p-report .report'); if (!rep) return;
    const images = new Map();
    for (const svg of rep.querySelectorAll('svg')) { try { images.set(svg, await BM.svgToPng(svg.outerHTML, 2)); } catch (e) { /* pominięcie rysunku */ } }
    const bytes = X.htmlToOdt(rep, images, { title: P.name, author: P.author });
    await BM.saveFile(safeName(P.name) + '.odt', bytes, 'application/vnd.oasis.opendocument.text', 'Dokument ODT|*.odt');
    toast('Zapisano raport ODT');
  }
  async function exportHtml() {
    const rep = $('#p-report .report'); if (!rep) return;
    const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(P.name)}</title><style>${css}\nbody{overflow:auto;height:auto;background:#fff;padding:20px}</style></head><body>${rep.outerHTML}</body></html>`;
    await BM.saveFile(safeName(P.name) + '.html', html, 'text/html', 'Strona HTML|*.html');
  }
  const safeName = s => String(s || 'projekt').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);

  /* ================================================================ DXF */
  async function exportDxf() {
    const d = new X.Dxf();
    d.layer('PRETY', 7).layer('PRETY_KRATOWE', 8, 'DASHED').layer('WEZLY', 3).layer('PODPORY', 5).layer('OPISY', 2).layer('WYKRES', 1).layer('OBCIAZENIA', 1);
    const C = V.coords(viewModel());
    const is3 = P.dim === '3D';
    const toXY = c => is3 ? c : [c[0], c[1], 0];
    const th = 0.12;
    P.members.forEach(m => {
      const a = toXY(C.get(String(m.n1))), b = toXY(C.get(String(m.n2))); if (!a || !b) return;
      d.line(a[0], a[1], b[0], b[1], m.type === 'truss' ? 'PRETY_KRATOWE' : 'PRETY', a[2], b[2]);
      if (!is3) { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; let r = ang; if (r > 90) r -= 180; if (r < -90) r += 180; d.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + th * 0.6, th, `${m.id} ${(secById(m.sec) || {}).name || ''}`, 'OPISY', r, 1, 1); }
    });
    P.nodes.forEach(n => { const c = toXY(C.get(String(n.id))); if (!is3) { d.circle(c[0], c[1], 0.04, 'WEZLY'); d.text(c[0] + 0.08, c[1] + 0.08, th * 0.8, String(n.id), 'WEZLY'); } });
    if (!is3) P.supports.forEach(s => { const c = C.get(String(s.node)); if (!c) return; const f = s.fix || []; const z = 0.25; if (f[0] && f[1] && f[5]) { d.line(c[0] - z, c[1], c[0] + z, c[1], 'PODPORY'); for (let i = -2; i <= 2; i++) d.line(c[0] + i * z / 2.5, c[1], c[0] + i * z / 2.5 - 0.08, c[1] - 0.12, 'PODPORY'); } else { d.poly([[c[0], c[1]], [c[0] - z * 0.6, c[1] - z], [c[0] + z * 0.6, c[1] - z]], 'PODPORY', true); if (!(f[0] && f[1])) d.line(c[0] - z * 0.8, c[1] - z * 1.25, c[0] + z * 0.8, c[1] - z * 1.25, 'PODPORY'); } });
    // bieżący wykres (2D)
    if (!is3 && ui.tab === 'results') {
      const R = currentResults();
      if (R && !R.err && !['def', 'reac', 'buck', 'modal'].includes(ui.rv.q)) {
        const key = qKey(ui.rv.q); let vmax = 0; R.members.forEach(m => m.st.forEach(s => { const v = s[key]; vmax = Math.max(vmax, ...(Array.isArray(v) ? v.map(Math.abs) : [Math.abs(v)])); }));
        const bb = V.bbox(viewModel()), sc = vmax > 0 ? 0.12 * Math.max(bb[3] - bb[0], bb[4] - bb[1], 1) / vmax : 0;
        R.members.forEach(m => {
          const mm = memById(m.id), ax = V.axesOf(viewModel(), mm, C); if (!ax) return;
          const dir = key === 'My' ? ax.ez.map(v => -v) : ax.ez;
          (R.env ? [0, 1] : [null]).forEach(ci => {
            const pts = m.st.map(s => { const v = Array.isArray(s[key]) ? s[key][ci] : s[key]; return [ax.p1[0] + ax.ex[0] * s.x + dir[0] * v * sc, ax.p1[1] + ax.ex[1] * s.x + dir[1] * v * sc]; });
            d.poly(pts, 'WYKRES');
            [0, pts.length - 1].forEach(k => d.line(ax.p1[0] + ax.ex[0] * m.st[k].x, ax.p1[1] + ax.ex[1] * m.st[k].x, pts[k][0], pts[k][1], 'WYKRES'));
            let im = 0; m.st.forEach((s, i) => { const v = Array.isArray(s[key]) ? s[key][ci] : s[key], vi = Array.isArray(m.st[im][key]) ? m.st[im][key][ci] : m.st[im][key]; if (Math.abs(v) > Math.abs(vi)) im = i; });
            const vv = Array.isArray(m.st[im][key]) ? m.st[im][key][ci] : m.st[im][key];
            if (Math.abs(vv) > vmax * 0.02) d.text(pts[im][0], pts[im][1], th * 0.9, fmt(vv, 2), 'WYKRES', 0, 1, 2);
          });
        });
      }
    }
    await BM.saveFile(safeName(P.name) + '.dxf', d.toString(), 'application/dxf', 'Rysunek DXF|*.dxf');
    toast('Zapisano DXF');
  }

  /* ================================================================ pliki */
  async function saveProject(as) {
    P.name = $('#projName').value || P.name;
    const name = (!as && file.name) || safeName(P.name) + FILE_EXT;
    const r = await BM.saveFile(name, JSON.stringify(P, null, 1), 'application/json', `Projekt BM-Win Statyka|*${FILE_EXT}`);
    if (r) { file.name = String(r).split(/[\\/]/).pop(); file.dirty = false; updateTitle(); toast('Zapisano projekt'); }
  }
  async function openProject() {
    const f = await BM.openFile(`${FILE_EXT},.json`); if (!f) return;
    try {
      const p = JSON.parse(f.text);
      if (!p.nodes || !p.members) throw new Error('to nie jest projekt Statyki');
      p.dim = p.dim === '3D' ? '3D' : '2D';
      p.combo = Object.assign({ sets: ['ULS', 'SLS_CH', 'SLS_QP'] }, F.DEFAULT_FACTORS, p.combo || {});
      p.analysis = Object.assign({ shear: false, stations: 20, modes: 6 }, p.analysis || {});
      setProject(p, f.name);
      toast('Wczytano: ' + f.name);
    } catch (e) { toast('Nie można wczytać pliku: ' + e.message, 4000); }
  }
  function startDialog(force) {
    const go = dim => { m.close(); const p = newProject(dim); setProject(p); if (dim === '3D') { ui.vs.yaw = -35; ui.vs.pitch = 25; } fitView(); };
    const ex = (name) => { m.close(); setProject(example(name)); fitView(); };
    const m = modal(h('div', null,
      h('p', null, 'Wybierz rodzaj modelu. W trybie 2D model leży w płaszczyźnie XY (Y – pion). W trybie 3D oś Z jest pionowa.'),
      h('div', { class: 'startdlg' },
        h('button', { onclick: () => go('2D') }, h('b', null, 'Nowy projekt 2D'), h('span', null, 'Belki, ramy płaskie, kratownice – schemat prętowo-węzłowy w osiach X, Y.')),
        h('button', { onclick: () => go('3D') }, h('b', null, 'Nowy projekt 3D'), h('span', null, 'Ramy przestrzenne, ruszty, szkielety budynków – osie X, Y, Z.'))),
      h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Przykłady: ', h('a', { href: '#', onclick: e => { e.preventDefault(); ex('frame2d'); } }, 'rama portalowa 2D'), ' · ', h('a', { href: '#', onclick: e => { e.preventDefault(); ex('truss'); } }, 'kratownica'), ' · ', h('a', { href: '#', onclick: e => { e.preventDefault(); ex('space'); } }, 'szkielet 3D'))
    ), { title: 'BM-Win · Statyka – nowy projekt', buttons: force ? null : [{ label: 'Anuluj' }] });
  }
  function example(name) {
    if (name === 'truss') {
      const p = newProject('2D'); p.name = 'Kratownica dachowa';
      p.sections = [{ id: 'P1', name: 'RK 100×100×5', mat: 'S355', def: { shape: 'cat', key: 'RK 100×100×5' } }];
      const g = GEN.truss.run({ type: 'pratt', L: '18', H: '2', n: '8' }, { node: 1, member: 1 }, 'P1');
      Object.assign(p, g); p.nodes = g.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
      p.cases.push({ id: 'G2', name: 'Pokrycie', type: 'G' }, { id: 'S1', name: 'Śnieg', type: 'S' });
      g.nodes.filter(n => n.y > 0).forEach(n => { p.loads.push({ case: 'G2', type: 'nodal', node: n.id, F: [0, -6, 0, 0, 0, 0] }); p.loads.push({ case: 'S1', type: 'nodal', node: n.id, F: [0, -9, 0, 0, 0, 0] }); });
      return p;
    }
    if (name === 'space') {
      const p = newProject('3D'); p.name = 'Szkielet stalowy';
      p.sections = [{ id: 'P1', name: 'IPE 330', mat: 'S355', def: { shape: 'cat', key: 'IPE 330' } }, { id: 'P2', name: 'HEB 240', mat: 'S355', def: { shape: 'cat', key: 'HEB 240' } }];
      const g = GEN.space.run({ bx: '6;6', by: '5', storeys: '4;3,5', base: 'fix' }, { node: 1, member: 1 }, 'P1', 'P2');
      Object.assign(p, g);
      p.cases.push({ id: 'G2', name: 'Stropy', type: 'G' }, { id: 'Q1', name: 'Użytkowe – biura', type: 'Q', cat: 'B' }, { id: 'W1', name: 'Wiatr X', type: 'W', group: 'wiatr' }, { id: 'W2', name: 'Wiatr Y', type: 'W', group: 'wiatr' });
      g.members.filter(m => m.role === 'beam').forEach(m => { p.loads.push({ case: 'G2', type: 'dist', member: m.id, dir: 'Z', q1: -12, q2: -12, a: 0, b: 1 }); p.loads.push({ case: 'Q1', type: 'dist', member: m.id, dir: 'Z', q1: -8, q2: -8, a: 0, b: 1 }); });
      g.nodes.filter(n => n.z > 0 && n.x === 0).forEach(n => p.loads.push({ case: 'W1', type: 'nodal', node: n.id, F: [6, 0, 0, 0, 0, 0] }));
      g.nodes.filter(n => n.z > 0 && n.y === 0).forEach(n => p.loads.push({ case: 'W2', type: 'nodal', node: n.id, F: [0, 5, 0, 0, 0, 0] }));
      return p;
    }
    const p = newProject('2D'); p.name = 'Rama portalowa';
    p.sections = [{ id: 'P1', name: 'IPE 360', mat: 'S235', def: { shape: 'cat', key: 'IPE 360' } }, { id: 'P2', name: 'HEA 240', mat: 'S235', def: { shape: 'cat', key: 'HEA 240' } }];
    const g = GEN.gable.run({ L: '18', H: '6', a: '8', base: 'pin' }, { node: 1, member: 1 }, 'P1', 'P2');
    Object.assign(p, g); p.nodes = g.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    p.cases.push({ id: 'G2', name: 'Pokrycie dachu', type: 'G' }, { id: 'S1', name: 'Śnieg', type: 'S' }, { id: 'W1', name: 'Wiatr z lewej', type: 'W', group: 'wiatr' }, { id: 'W2', name: 'Wiatr z prawej', type: 'W', group: 'wiatr' });
    [2, 3].forEach(id => { p.loads.push({ case: 'G2', type: 'dist', member: id, dir: 'Y', q1: -3, q2: -3, a: 0, b: 1, proj: false }); p.loads.push({ case: 'S1', type: 'dist', member: id, dir: 'Y', q1: -5.4, q2: -5.4, a: 0, b: 1, proj: true }); });
    p.loads.push({ case: 'W1', type: 'dist', member: 1, dir: 'X', q1: 4.2, a: 0, b: 1 }, { case: 'W1', type: 'dist', member: 4, dir: 'X', q1: 2.1, a: 0, b: 1 });
    p.loads.push({ case: 'W2', type: 'dist', member: 4, dir: 'X', q1: -4.2, a: 0, b: 1 }, { case: 'W2', type: 'dist', member: 1, dir: 'X', q1: -2.1, a: 0, b: 1 });
    return p;
  }

  function about() {
    modal(h('div', null,
      h('p', null, h('b', null, 'BM-Win · Statyka'), ' – moduł modelowania i obliczeń statycznych ram prętowych 2D/3D (MES).'),
      h('ul', null, h('li', null, 'Analiza liniowa I rzędu, analiza II rzędu (P-Δ), wyboczenie liniowe (αcr), drgania własne.'), h('li', null, 'Kombinacje wg PN-EN 1990 z Załącznikiem krajowym (6.10a/6.10b, SGU, wyjątkowe, EQU).'), h('li', null, 'Bazy materiałów: PN-EN 1992 (beton), PN-EN 1993 (stal), PN-EN 338 / 14080 (drewno), PN-EN 1996 (mury).'), h('li', null, 'Raporty: druk/PDF, ODT, HTML; eksport schematu i wykresów do DXF.')),
      h('p', { class: 'hint' }, 'Skróty: Ctrl+S zapis, Ctrl+O otwarcie, Ctrl+Z / Ctrl+Y cofnij / ponów, Delete – usuń zaznaczenie, F – dopasuj widok, Esc – przerwij rysowanie. Kółko myszy – powiększenie, prawy przycisk lub Shift – przesuwanie, w 3D przeciąganie lewym – obrót.'),
      h('p', { class: 'hint' }, 'Wyniki należy weryfikować – program jest narzędziem wspomagającym projektanta.')
    ), { title: 'O programie', buttons: [{ label: 'Zamknij', cls: 'pri' }] });
  }

  /* ================================================================ start */
  function init() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $$('#top .tb button').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
    $('#projName').addEventListener('change', e => { P.name = e.target.value; changed({ panel: false }); });
    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveProject(e.shiftKey); }
      else if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); openProject(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); act('new'); }
      else if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); doPrint(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'z' && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); act('undo'); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y' && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); act('redo'); }
    });
    window.addEventListener('beforeunload', e => { if (file.dirty && !BM.host()) { e.preventDefault(); e.returnValue = ''; } });
    attachViewEvents();
    const q = new URLSearchParams(location.search);
    const last = BM.store.get('statyka:last', null);
    if (q.get('new') === '2D' || q.get('new') === '3D') setProject(newProject(q.get('new')));
    else if (q.get('example')) setProject(example(q.get('example')));
    else if (last && last.nodes) setProject(last);
    else { setProject(newProject('2D')); startDialog(true); }
    requestAnimationFrame(fitView);
  }
  async function act(a) {
    switch (a) {
      case 'new': if (file.dirty && !(await confirmDlg('Porzucić niezapisane zmiany?'))) return; startDialog(false); break;
      case 'open': if (file.dirty && !(await confirmDlg('Porzucić niezapisane zmiany?'))) return; openProject(); break;
      case 'save': saveProject(false); break;
      case 'saveas': saveProject(true); break;
      case 'undo': { const s = hist.undo(); if (s) { P = s; ui.stamp++; ui.envCache = {}; ui.extra = {}; renderLeft(); renderView(); updateStatus(); renderCombos(); } break; }
      case 'redo': { const s = hist.redo(); if (s) { P = s; ui.stamp++; ui.envCache = {}; ui.extra = {}; renderLeft(); renderView(); updateStatus(); renderCombos(); } break; }
      case 'print': doPrint(); break;
      case 'odt': exportOdt(); break;
      case 'dxf': exportDxf(); break;
      case 'about': about(); break;
    }
  }
  // dostęp do testów automatycznych
  window.BMStat = { get P() { return P; }, setProject, analyze, currentResults, ui, example, newProject, setTab, exportDxf };
  document.addEventListener('DOMContentLoaded', init);
})();
