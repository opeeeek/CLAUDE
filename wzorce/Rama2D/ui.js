/* Rama2D – interfejs użytkownika */
(function () {
  'use strict';
  const E = window.R2E, M = window.R2M, D = window.R2D;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const fmt = D.fmt, esc = D.esc;
  const VERSION = '1.0';

  // ------------------------------------------------------------------ stan
  const U = {
    model: null, res: null, viewKey: '', tab: 'model', tool: 'select', diag: 'model',
    sel: { kind: null, ids: [] }, activeCase: null,
    tr: { k: 50, ox: 100, oy: 400 }, W: 800, H: 600,
    undo: [], redo: [], dirty: false, path: '',
    diagScale: 1, defScale: 1, barStart: null, hits: [], drag: null, space: false, shift: false,
    form: {
      bar: { from: 'node', node: null, x: 0, y: 0, dir: 'R', ang: 30, L: 6, n: 1, sec: null, truss: false },
      gen: { type: 'frame', clear: true, x0: 0, y0: 0, vals: {} },
      load: { type: 'q', dir: 'Y', proj: false, unit: 'm', bw: 1, q1: 5, q2: null, full: true, x1: 0, x2: 1, mode: 'abs', F: 10, x: 0.5, fmode: 'rel', M: 10, Fx: 0, Fy: 10, Mn: 0, dT: 0, dTg: 10, ux: 0, uy: 10, rz: 0, target: '' },
      sup: { type: 'pin', b: 0, ang: 0 },
      newNode: { x: 0, y: 0 }, split: { n: 2, t: 1 }, cmbNew: '',
      secTool: { sec: null }, lw: { cs: '', type: '', onlySel: false }
    },
    hiddenCases: new Set(), showSW: true, caseTags: true, vlMin: false,
    win: null, winGeom: {}
  };
  const isModelView = (d) => d === 'model' || d === 'loads' || d === 'secs';
  window.__U = U;

  // ------------------------------------------------------------------ narzędzia
  function parseNum(s) {
    if (typeof s === 'number') return s;
    s = String(s).trim().replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
    if (s === '') return null;
    if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return parseFloat(s);
    if (/^[\d.+\-*/()e]+$/i.test(s)) { try { const v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? v : NaN; } catch (e) { return NaN; } }
    return NaN;
  }
  const v2s = (v) => (v === null || v === undefined || v === '') ? '' : (typeof v === 'number' ? String(Math.round(v * 1e9) / 1e9).replace('.', ',') : String(v));
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  const nodeNo = (u) => U.model.nodes.findIndex(n => n.uid === u) + 1;
  const memNo = (u) => U.model.members.findIndex(m => m.uid === u) + 1;
  const nodeBy = (u) => U.model.nodes.find(n => n.uid === u);
  const memBy = (u) => U.model.members.find(m => m.uid === u);
  const caseBy = (u) => U.model.cases.find(c => c.uid === u);
  function caseCode(c) {
    const same = U.model.cases.filter(x => (x.type || 'G') === (c.type || 'G'));
    return (c.type || 'G') + (same.indexOf(c) + 1);
  }
  function findLoad(uid) { for (const c of U.model.cases) { const l = c.loads.find(x => x.uid === uid); if (l) return { c, l }; } return null; }
  function parseList(s, max) {
    const out = [];
    for (const part of String(s || '').split(/[,;\s]+/)) {
      if (!part) continue;
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { for (let i = +m[1]; i <= +m[2]; i++) if (i >= 1 && i <= max) out.push(i); }
      else if (/^\d+$/.test(part) && +part >= 1 && +part <= max) out.push(+part);
    }
    return [...new Set(out)];
  }

  // ------------------------------------------------------------------ powiązania pól (data-b)
  function getObj(key) {
    const p = key.split('.');
    const m = U.model;
    switch (p[0]) {
      case 'ui': return { o: U.form[p[1]], f: p[2], ui: true };
      case 'model': return { o: m, f: p[1] };
      case 'set': return { o: m.set, f: p[1] };
      case 'node': return { o: nodeBy(+p[1]), f: p[2] };
      case 'sup': { const n = nodeBy(+p[1]); return { o: n && n.sup, f: p[2] }; }
      case 'mem': return { o: memBy(+p[1]), f: p[2] };
      case 'sec': return { o: m.secs.find(s => s.uid === +p[1]), f: p[2] };
      case 'mat': return { o: m.mats.find(s => s.uid === +p[1]), f: p[2] };
      case 'case': return { o: caseBy(+p[1]), f: p[2] };
      case 'grp': return { o: m.groups.find(s => s.uid === +p[1]), f: p[2] };
      case 'cmb': return { o: m.combos.find(s => s.uid === +p[1]), f: p[2] };
      case 'cmbf': { const c = m.combos.find(s => s.uid === +p[1]); if (c) c.f = c.f || {}; return { o: c && c.f, f: p[2] }; }
      case 'load': { const r = findLoad(+p[1]); return { o: r && r.l, f: p[2] }; }
      case 'gen': { const g = U.form.gen; g.vals[g.type] = g.vals[g.type] || {}; return { o: g.vals[g.type], f: p[1], ui: true }; }
    }
    return { o: null };
  }
  function readEl(el) {
    const t = el.dataset.t || 'str';
    if (el.type === 'checkbox') return el.checked;
    if (t === 'num' || t === 'numo') {
      const v = parseNum(el.value);
      if (v === null) return t === 'numo' ? null : NaN;
      return v;
    }
    if (t === 'int') return el.value === '' ? null : parseInt(el.value, 10);
    return el.value;
  }
  function onFieldChange(el) {
    const key = el.dataset.b; if (!key) return;
    const val = readEl(el);
    if (typeof val === 'number' && isNaN(val)) { el.classList.add('bad'); toast('Niepoprawna liczba: „' + el.value + '”'); return; }
    el.classList.remove('bad');
    const { o, f, ui } = getObj(key);
    if (!o) return;
    if (ui) {
      o[f] = val;
      deferRender(true);
      return;
    }
    const p = key.split('.');
    commit(() => {
      if (p[0] === 'node' && (f === 'x' || f === 'y')) {
        const n = o; const nx = f === 'x' ? val : n.x, ny = f === 'y' ? val : n.y;
        if (!M.moveNode(U.model, n.uid, nx, ny)) toast('W tym miejscu jest już węzeł.');
        return;
      }
      if (p[0] === 'load' && (f === 'mode')) {
        // zmiana odniesienia zachowuje położenie
        const m = memBy(o.m); const L = m ? M.memLen(U.model, m) : 1;
        const conv = (x) => { const a = E.posAbs(x, o.mode, L); return val === 'rel' ? a / L : val === 'end' ? L - a : a; };
        if (o.type === 'q') { o.x1 = round6(conv(o.x1)); o.x2 = round6(conv(o.x2)); } else o.x = round6(conv(o.x));
        o.mode = val; return;
      }
      if (p[0] === 'sup' && f === 'type' && val !== 'custom') {
        const pr = E.SUP_PRESETS[val]; if (pr && pr.f) { o.rx = pr.f[0]; o.ry = pr.f[1]; o.rz = pr.f[2]; }
        if (val === 'sprY' && !(o.ky > 0)) o.ky = 10000;
        if (val === 'sprR' && !(o.kz > 0)) o.kz = 10000;
      }
      if (p[0] === 'sup' && (f === 'rx' || f === 'ry' || f === 'rz')) {
        if (o.type && o.type !== 'custom' && E.SUP_PRESETS[o.type] && E.SUP_PRESETS[o.type].f) { const pf = E.SUP_PRESETS[o.type].f; o.rx = pf[0]; o.ry = pf[1]; o.rz = pf[2]; }
        o[f] = val | 0; o.type = 'custom';
        const kk = { rx: 'kx', ry: 'ky', rz: 'kz' }[f];
        if (o[f] === 2 && !(o[kk] > 0)) o[kk] = 10000;
        return;
      }
      if (p[0] === 'mat' && f === 'key') {
        const t = E.MATS.find(x => x.key === val);
        if (t) { o.E = t.E; o.g = t.g; o.a = t.a; o.name = t.key; }
        o.key = val; return;
      }
      if (p[0] === 'sec' && f === 'cat') { o.cat = val; o.name = val; return; }
      if (p[0] === 'sec' && f === 'shape') {
        const dflt = { cat: { cat: 'IPE 300', name: 'IPE 300' }, rect: { b: 300, h: 500, name: 'Prostokąt 300×500' }, circ: { d: 300, name: 'Koło ⌀300' }, tube: { d: 114.3, t: 5, name: 'Rura 114,3×5' },
          box: { b: 200, h: 200, t: 8, name: 'Rura prost. 200×200×8' }, I: { h: 400, b: 200, tw: 10, tf: 16, name: 'Dwuteownik spawany 400' }, man: { A: 50, I: 5000, hm: 300, name: 'Przekrój dowolny' } }[val] || {};
        for (const [k, v] of Object.entries(dflt)) if (k === 'name' || o[k] === undefined || o[k] === null) o[k] = v;
        o.shape = val; return;
      }
      if (p[0] === 'case' && f === 'cat' && val !== 'X') { const ps = E.CATS[val].p; o.psi0 = ps[0]; o.psi1 = ps[1]; o.psi2 = ps[2]; }
      if (p[0] === 'case' && f === 'type' && val === 'Q' && !o.cat) o.cat = 'B';
      if (p[0] === 'cmbf' && (val === null || val === 0)) { delete o[f]; return; }
      // obciążenie równomierne (q₂ puste lub równe q₁) pozostaje równomierne po zmianie q₁
      if (p[0] === 'load' && f === 'q1' && (o.q2 === undefined || o.q2 === null || o.q2 === '' || +o.q2 === +o.q1)) { o.q1 = val; o.q2 = val; return; }
      o[f] = val;
    });
  }
  const round6 = (v) => Math.round(v * 1e6) / 1e6;

  // ------------------------------------------------------------------ zatwierdzanie zmian
  function commit(fn, msg) {
    const before = JSON.stringify(U.model);
    try { fn(U.model); } catch (e) { console.error(e); toast('Błąd: ' + e.message); }
    const after = JSON.stringify(U.model);
    if (before === after) { deferRender(); return false; }
    U.undo.push(before); if (U.undo.length > 200) U.undo.shift(); U.redo = [];
    U.dirty = true;
    if (msg) toast(msg);
    changed();
    return true;
  }
  function changed() { recalc(); cleanSel(); deferRender(true); autosave(); updateTitle(); }
  function undo() { if (!U.undo.length) return toast('Brak zmian do cofnięcia'); U.redo.push(JSON.stringify(U.model)); U.model = JSON.parse(U.undo.pop()); U.dirty = true; changed(); }
  function redo() { if (!U.redo.length) return; U.undo.push(JSON.stringify(U.model)); U.model = JSON.parse(U.redo.pop()); U.dirty = true; changed(); }
  function cleanSel() {
    const s = U.sel;
    if (s.kind === 'node') s.ids = s.ids.filter(u => nodeBy(u));
    if (s.kind === 'member') s.ids = s.ids.filter(u => memBy(u));
    if (s.kind === 'load') s.ids = s.ids.filter(u => findLoad(u));
    if (!s.ids.length) s.kind = null;
    if (!caseBy(U.activeCase)) U.activeCase = U.model.cases.length ? U.model.cases[0].uid : null;
    if (U.form.bar.node && !nodeBy(U.form.bar.node)) U.form.bar.node = null;
    if (!U.form.bar.sec || !U.model.secs.find(s => s.uid === U.form.bar.sec)) U.form.bar.sec = U.model.secs[0] ? U.model.secs[0].uid : null;
    if (!U.form.secTool.sec || !U.model.secs.find(s => s.uid === U.form.secTool.sec)) U.form.secTool.sec = U.form.bar.sec;
    if (U.form.lw.cs && !caseBy(U.form.lw.cs)) U.form.lw.cs = '';
    for (const u of [...U.hiddenCases]) if (!caseBy(u)) U.hiddenCases.delete(u);
  }

  let _rt = null, _full = false;
  function deferRender(full) {
    _full = _full || !!full;
    if (_rt) return;
    _rt = setTimeout(() => {
      _rt = null;
      const ae = document.activeElement, key = ae && ae.dataset && ae.dataset.b;
      const selStart = ae && ae.selectionStart;
      const root = ae && ae.closest ? ae.closest('#win, #panel, #props, #toolCard, #modal') : null;
      const rootId = root ? root.id : null;
      renderAll();
      if (key) {
        const scope = rootId ? document.getElementById(rootId) : null;
        const el = (scope && scope.querySelector('[data-b="' + key + '"]')) || document.querySelector('[data-b="' + key + '"]');
        if (el && el !== ae) { el.focus(); try { if (selStart !== undefined && el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* */ } }
      }
      _full = false;
    }, 0);
  }

  // ------------------------------------------------------------------ obliczenia
  function recalc() {
    const t0 = performance.now();
    try { U.res = E.analyze(U.model); } catch (e) { console.error(e); U.res = { ok: false, errors: ['Błąd obliczeń: ' + e.message], warnings: [] }; }
    U.calcMs = performance.now() - t0;
    const views = E.availableViews(U.model, U.res);
    if (!views.find(v => v.key === U.viewKey)) {
      const env = views.find(v => v.key === 'env:ULS');
      U.viewKey = env ? env.key : (views[0] ? views[0].key : '');
    }
  }
  function curView() { return U.res && U.res.ok && U.viewKey ? E.getView(U.model, U.res, U.viewKey) : null; }
  function resNodeIdx(uid) { return U.res && U.res.ok ? U.res.nodes.findIndex(n => n.uid === uid) : -1; }
  function resMemIdx(uid) { return U.res && U.res.ok ? U.res.mem.findIndex(m => m.uid === uid) : -1; }

  // ------------------------------------------------------------------ renderowanie
  function renderAll() {
    renderPanel(); renderProps(); renderCanvas(); renderStatus(); renderToolbar(); renderToolCard(); renderWin();
  }
  function renderStatus() {
    const st = $('#status'), r = U.res;
    if (!r) { st.innerHTML = ''; return; }
    if (!r.ok) { st.innerHTML = '<span class="err">⚠ ' + esc(r.errors[0] || 'Błąd') + '</span>'; return; }
    const w = r.warnings.length ? ' · <span class="warn">uwagi: ' + r.warnings.length + '</span>' : '';
    st.innerHTML = '<span class="ok">✓ Obliczono</span> · ' + r.nodes.length + ' węzłów, ' + r.mem.length + ' prętów, ' + r.cases.length + ' przyp. · ' + Math.max(1, Math.round(U.calcMs)) + ' ms' + w;
  }
  function updateTitle() {
    const nm = (U.path ? U.path.split(/[\\/]/).pop() : (U.model.name || 'Nowy projekt'));
    const t = (U.dirty ? '• ' : '') + nm + ' – Rama2D';
    document.title = t;
    if (window.goSetTitle) window.goSetTitle(t);
    const pn = $('#projName'); if (pn && document.activeElement !== pn) pn.value = U.model.name || '';
  }
  function renderToolbar() {
    $$('#ctool [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === U.tool));
    $$('#diagBtns [data-diag]').forEach(b => b.classList.toggle('on', b.dataset.diag === U.diag));
    const vs = $('#viewSel');
    const views = E.availableViews(U.model, U.res);
    let h = '', grp = '';
    for (const v of views) {
      if (v.grp !== grp) { if (grp) h += '</optgroup>'; h += '<optgroup label="' + esc(v.grp) + '">'; grp = v.grp; }
      h += '<option value="' + v.key + '"' + (v.key === U.viewKey ? ' selected' : '') + '>' + esc(v.label) + '</option>';
    }
    if (grp) h += '</optgroup>';
    if (!views.length) h = '<option>— brak wyników —</option>';
    if (vs.innerHTML !== h) vs.innerHTML = h;
    vs.disabled = !views.length;
    $('#cwrap').className = 't-' + U.tool + (U.drag && U.drag.pan ? ' pan' : '');
  }

  // ------------------------------------------------------------------ kanwa
  const cv = $('#cv'), ov = $('#ov'), wrap = $('#cwrap');
  const w2s = (x, y) => [U.tr.ox + x * U.tr.k, U.tr.oy - y * U.tr.k];
  const s2w = (sx, sy) => [(sx - U.tr.ox) / U.tr.k, (U.tr.oy - sy) / U.tr.k];
  function selSets() {
    const s = U.sel;
    return { nodes: new Set(s.kind === 'node' ? s.ids : []), members: new Set(s.kind === 'member' ? s.ids : []), loads: new Set(s.kind === 'load' ? s.ids : []) };
  }
  function renderCanvas() {
    const view = !isModelView(U.diag) ? curView() : null;
    const opt = {
      grid: +$('#gridStep').value > 0, gridStep: +$('#gridStep').value || 0.5, nodeNums: $('#vNums').checked, memNums: $('#vNums').checked,
      dims: $('#vDims').checked, loads: $('#vLoads').value, caseUid: U.activeCase, sel: selSets(), diagScale: U.diagScale, defScale: U.defScale,
      values: $('#vVals').checked, hiddenCases: U.hiddenCases, sw: U.showSW, caseTags: U.caseTags
    };
    const r = D.render({ model: U.model, res: U.res, view, diag: U.diag, tr: U.tr, W: U.W, H: U.H, opt });
    cv.setAttribute('viewBox', `0 0 ${U.W} ${U.H}`); ov.setAttribute('viewBox', `0 0 ${U.W} ${U.H}`);
    cv.innerHTML = r.svg;
    U.hits = r.hits;
    // legenda
    let lg = '';
    if (U.diag === 'loads') {
      lg = '<b>Wszystkie obciążenia</b> – kolor wg przypadku' + (U.showSW ? ', c.w. – ciężar własny (linia przerywana)' : '') + '<br>Kliknij obciążenie, aby je zaznaczyć i edytować';
    } else if (U.diag === 'secs') {
      lg = '<b>Przekroje prętów</b> – kolor wg przekroju, grubość linii ∝ wysokość przekroju<br>Narzędzie „Przekrój” (K): kliknij pręt, aby przypisać przekrój';
    } else if (U.diag !== 'model') {
      if (!U.res || !U.res.ok) lg = '<span style="color:#b91c1c">Brak wyników – popraw model</span>';
      else {
        const vlab = (E.availableViews(U.model, U.res).find(v => v.key === U.viewKey) || {}).label || '';
        const nm = { M: 'Momenty zginające M [kNm] – wykres po stronie włókien rozciąganych', V: 'Siły tnące T [kN]', N: 'Siły normalne N [kN] (+ rozciąganie; pręty o stałej sile: niebieski – rozciąganie, czerwony – ściskanie)', def: view && view.env ? 'Obwiednia ugięć prętów (prostopadle do osi) [mm]' : 'Deformacja [mm] (skala powiększona)', R: 'Reakcje podporowe' }[U.diag];
        lg = '<b>' + esc(nm) + '</b><br>' + esc(vlab) + (view && view.env && U.diag !== 'R' ? ' · <span style="color:var(--c-M,#1d4ed8)">■ max</span> <span style="color:#be123c">■ min</span>' : '');
      }
    } else {
      const cs = caseBy(U.activeCase);
      if (cs && $('#vLoads').value === 'active') lg = 'Obciążenia: <b>' + esc(caseCode(cs) + ' – ' + cs.name) + '</b>';
      lg += (lg ? '<br>' : '') + 'Linia przerywana = spody pręta (M &gt; 0 rozciąga spody)';
    }
    $('#legend').innerHTML = lg;
    renderVLegend();
    drawOverlay();
  }

  // legenda interaktywna (widok obciążeń / przekrojów)
  function renderVLegend() {
    const el = $('#vlegend'), m = U.model;
    let h = '';
    if (U.diag === 'loads') {
      const cnt = m.cases.length;
      h = `<div class="vl-h"><b>Przypadki obciążeń</b><span class="sp"></span>${cnt ? '<button class="lnk" data-act="vlAll">wszystkie</button> <button class="lnk" data-act="vlNone">żadne</button>' : ''}<button class="x" data-act="vlMin" title="Zwiń / rozwiń">${U.vlMin ? '▸' : '▾'}</button></div>`;
      if (!U.vlMin) {
        h += m.cases.map(c => `<label class="vl-r" title="${esc(c.name)}"><input type="checkbox" data-vlcase="${c.uid}"${U.hiddenCases.has(c.uid) ? '' : ' checked'}><i class="sw" style="background:${D.caseColor(m, c.uid)}"></i><b>${caseCode(c)}</b>&nbsp;<span class="nm">${esc(c.name)}</span><span class="mut">&nbsp;${c.loads.length}${c.selfWeight ? '+c.w.' : ''}</span></label>`).join('') || '<div class="hint">Brak przypadków</div>';
        h += `<div class="vl-o"><label class="chk"><input type="checkbox" id="vlSW"${U.showSW ? ' checked' : ''}> ciężar własny (c.w.)</label><label class="chk"><input type="checkbox" id="vlTags"${U.caseTags ? ' checked' : ''}> kody przypadków</label></div>`;
        h += '<div class="btns" style="margin-top:4px"><button data-act="openLoadsWin">Zestawienie obciążeń…</button></div>';
      }
    } else if (U.diag === 'secs') {
      h = `<div class="vl-h"><b>Przekroje</b><span class="sp"></span><button class="x" data-act="vlMin" title="Zwiń / rozwiń">${U.vlMin ? '▸' : '▾'}</button></div>`;
      if (!U.vlMin) {
        for (const sc of m.secs) {
          const us = m.members.filter(x => x.sec === sc.uid);
          h += `<div class="vl-r click${U.tool === 'sec' && U.form.secTool.sec === sc.uid ? ' on' : ''}" data-act="${U.tool === 'sec' ? 'pickBrush' : 'selSecMembers'}" data-v="${sc.uid}" title="${U.tool === 'sec' ? 'Wybierz jako przekrój do przypisania' : 'Zaznacz pręty z tym przekrojem'}"><i class="sw" style="background:${D.secColor(m, sc.uid)}"></i><span class="nm">${esc(sc.name)}</span><span class="mut">&nbsp;${us.length ? 'pręty: ' + compactList(us.map(x => memNo(x.uid))) : 'nieużywany'}</span></div>`;
        }
        h += '<div class="btns" style="margin-top:4px"><button data-act="openSecWin">Przekroje prętów…</button>' + (U.tool !== 'sec' ? '<button data-act="tool" data-v="sec">Przypisz…</button>' : '') + '</div>';
      }
    }
    el.hidden = !h;
    el.innerHTML = h;
  }
  // „1, 2, 3, 5” → „1–3, 5”
  function compactList(nums) {
    nums = [...new Set(nums)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < nums.length; i++) {
      let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j - i >= 2 ? nums[i] + '–' + nums[j] : (j > i ? nums[i] + ', ' + nums[j] : String(nums[i])));
      i = j;
    }
    return out.join(', ');
  }
  function fitView() {
    const r = wrap.getBoundingClientRect();
    U.W = Math.max(200, r.width); U.H = Math.max(200, r.height);
    const lg = (U.diag === 'loads' || U.diag === 'secs') && !U.vlMin ? 290 : 0; // miejsce na legendę
    U.tr = D.fit(U.model, U.W - lg, U.H, 95);
    U.tr.oy -= 10;
  }
  // po przełączeniu na widok z legendą – dopasuj, jeśli legenda zasłania układ
  function fitIfLegendCovers() {
    if (!(U.diag === 'loads' || U.diag === 'secs') || U.vlMin || !U.model.nodes.length) return;
    const b = D.bbox(U.model);
    const right = U.tr.ox + b.x1 * U.tr.k + 40, top = U.tr.oy - b.y1 * U.tr.k - 80;
    if (right > U.W - 290 && top < 360) fitView();
  }
  new ResizeObserver(() => {
    const r = wrap.getBoundingClientRect();
    if (Math.abs(r.width - U.W) < 1 && Math.abs(r.height - U.H) < 1) return;
    const dx = (r.width - U.W) / 2, dy = (r.height - U.H) / 2;
    U.W = Math.max(200, r.width); U.H = Math.max(200, r.height);
    U.tr.ox += dx; U.tr.oy += dy;
    renderCanvas();
  }).observe(wrap);

  // przyciąganie
  function snap(sx, sy, from) {
    const m = U.model;
    for (const n of m.nodes) { const [x, y] = w2s(n.x, n.y); if (Math.hypot(x - sx, y - sy) <= 10) return { x: n.x, y: n.y, node: n.uid, what: 'węzeł ' + nodeNo(n.uid) }; }
    let [wx, wy] = s2w(sx, sy);
    const g = +$('#gridStep').value || 0;
    const ortho = (U.shift || $('#ortho').checked) && from;
    if (ortho) { if (Math.abs(wx - from.x) >= Math.abs(wy - from.y)) wy = from.y; else wx = from.x; }
    // na pręcie
    let best = null, bd = 8;
    for (const mem of m.members) {
      const a = nodeBy(mem.i), b = nodeBy(mem.j); if (!a || !b) continue;
      const [x1, y1] = w2s(a.x, a.y), [x2, y2] = w2s(b.x, b.y);
      const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (L2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((sx - x1) * (x2 - x1) + (sy - y1) * (y2 - y1)) / L2));
      const d = Math.hypot(sx - (x1 + t * (x2 - x1)), sy - (y1 + t * (y2 - y1)));
      if (d < bd && !ortho) { bd = d; best = { mem, t, a, b }; }
    }
    if (best) {
      const L = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y);
      let tm = best.t * L;
      const midPx = Math.abs(best.t - 0.5) * Math.sqrt((best.b.x - best.a.x) ** 2 + (best.b.y - best.a.y) ** 2) * U.tr.k;
      if (midPx < 10) tm = L / 2; else if (g > 0) tm = Math.round(tm / g) * g;
      tm = Math.max(0, Math.min(L, tm));
      return { x: round6(best.a.x + (best.b.x - best.a.x) * tm / L), y: round6(best.a.y + (best.b.y - best.a.y) * tm / L), what: 'pręt ' + memNo(best.mem.uid) + ' (x = ' + fmt(tm, 2) + ' m)' };
    }
    if (g > 0) {
      if (!ortho || Math.abs(wx - from.x) > 1e-12) wx = Math.round(wx / g) * g;
      if (!ortho || Math.abs(wy - from.y) > 1e-12) wy = Math.round(wy / g) * g;
      if (ortho) { if (Math.abs(wx - from.x) >= Math.abs(wy - from.y)) wy = from.y; else wx = from.x; }
    }
    return { x: round6(wx), y: round6(wy), what: g > 0 ? 'siatka' : '' };
  }
  function pick(sx, sy) {
    const m = U.model;
    let best = null, bd = 9;
    for (const n of m.nodes) { const [x, y] = w2s(n.x, n.y); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = { kind: 'node', uid: n.uid }; } }
    if (best) return best;
    let mb = null, md = 7;
    for (const mem of m.members) {
      const a = nodeBy(mem.i), b = nodeBy(mem.j); if (!a || !b) continue;
      const [x1, y1] = w2s(a.x, a.y), [x2, y2] = w2s(b.x, b.y);
      const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (L2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((sx - x1) * (x2 - x1) + (sy - y1) * (y2 - y1)) / L2));
      const d = Math.hypot(sx - (x1 + t * (x2 - x1)), sy - (y1 + t * (y2 - y1)));
      if (d < md) { md = d; mb = { kind: 'member', uid: mem.uid, t }; }
    }
    if (mb && md < 4) return mb;
    if (isModelView(U.diag)) for (let i = U.hits.length - 1; i >= 0; i--) { const h = U.hits[i]; if (sx >= h.x0 && sx <= h.x1 && sy >= h.y0 && sy <= h.y1) return { kind: 'load', uid: h.uid, cs: h.cs }; }
    return mb;
  }

  function drawOverlay(ptr) {
    let g = '';
    const p = ptr || U.lastPtr;
    if (U.tool === 'bar' && U.barStart) {
      const [x1, y1] = w2s(U.barStart.x, U.barStart.y);
      if (p && p.snap) {
        const [x2, y2] = w2s(p.snap.x, p.snap.y);
        g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2563eb" stroke-width="2.2" stroke-dasharray="6 4"/>`;
        const L = Math.hypot(p.snap.x - U.barStart.x, p.snap.y - U.barStart.y);
        const a = Math.atan2(p.snap.y - U.barStart.y, p.snap.x - U.barStart.x) * 180 / Math.PI;
        g += `<text x="${(x1 + x2) / 2 + 8}" y="${(y1 + y2) / 2 - 10}" font-size="12" fill="#1d4ed8" font-weight="600" paint-order="stroke" stroke="#fff" stroke-width="3">L = ${fmt(L, 3)} m, α = ${fmt(a, 1)}°</text>`;
      }
      g += `<circle cx="${x1}" cy="${y1}" r="5" fill="#2563eb"/>`;
    }
    if (p && p.snap && (U.tool === 'bar' || U.tool === 'node')) {
      const [x, y] = w2s(p.snap.x, p.snap.y);
      g += p.snap.node ? `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="none" stroke="#16a34a" stroke-width="2"/>` : `<path d="M${x - 7} ${y}H${x + 7}M${x} ${y - 7}V${y + 7}" stroke="#16a34a" stroke-width="1.6"/>`;
    }
    if (p && p.hover && U.tool !== 'bar' && U.tool !== 'node' && !U.drag) {
      const h = p.hover;
      if (h.kind === 'node') { const n = nodeBy(h.uid); if (n) { const [x, y] = w2s(n.x, n.y); g += `<circle cx="${x}" cy="${y}" r="9" fill="rgba(37,99,235,.12)" stroke="#2563eb" stroke-width="1"/>`; } }
      if (h.kind === 'member') { const mm = memBy(h.uid); const a = mm && nodeBy(mm.i), b = mm && nodeBy(mm.j); if (a && b) { const [x1, y1] = w2s(a.x, a.y), [x2, y2] = w2s(b.x, b.y); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(37,99,235,.28)" stroke-width="9" stroke-linecap="round"/>`; } }
      if (h.kind === 'load') { const hh = U.hits.find(q => q.uid === h.uid); if (hh) g += `<rect x="${hh.x0}" y="${hh.y0}" width="${hh.x1 - hh.x0}" height="${hh.y1 - hh.y0}" fill="rgba(37,99,235,.06)" stroke="#2563eb" stroke-dasharray="3 3"/>`; }
    }
    if (U.drag && U.drag.box) {
      const b = U.drag;
      g += `<rect x="${Math.min(b.sx, b.cx)}" y="${Math.min(b.sy, b.cy)}" width="${Math.abs(b.cx - b.sx)}" height="${Math.abs(b.cy - b.sy)}" fill="rgba(37,99,235,.07)" stroke="#2563eb" stroke-dasharray="4 3"/>`;
    }
    if (U.drag && U.drag.node && U.drag.moved && p && p.snap) {
      const n = nodeBy(U.drag.node);
      if (n) {
        const [nx, ny] = w2s(p.snap.x, p.snap.y);
        for (const mm of U.model.members) {
          if (mm.i !== n.uid && mm.j !== n.uid) continue;
          const o = nodeBy(mm.i === n.uid ? mm.j : mm.i); if (!o) continue;
          const [ox, oy] = w2s(o.x, o.y);
          g += `<line x1="${ox}" y1="${oy}" x2="${nx}" y2="${ny}" stroke="#2563eb" stroke-width="2" stroke-dasharray="5 3"/>`;
        }
        g += `<rect x="${nx - 5}" y="${ny - 5}" width="10" height="10" fill="#2563eb"/>`;
      }
    }
    ov.innerHTML = g;
  }

  function ptrInfo(e) {
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy };
  }
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const { sx, sy } = ptrInfo(e);
    const f = Math.pow(1.0015, -e.deltaY);
    const k2 = Math.max(0.5, Math.min(5000, U.tr.k * f));
    const r = k2 / U.tr.k;
    U.tr.ox = sx - (sx - U.tr.ox) * r; U.tr.oy = sy - (sy - U.tr.oy) * r; U.tr.k = k2;
    renderCanvas();
  }, { passive: false });

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const { sx, sy } = ptrInfo(e);
    if (e.button === 1 || (e.button === 0 && U.space) || (e.button === 2 && U.tool !== 'bar')) {
      U.drag = { pan: true, sx, sy, ox: U.tr.ox, oy: U.tr.oy, btn: e.button, moved: false }; renderToolbar(); return;
    }
    if (e.button === 2 && U.tool === 'bar') { U.barStart = null; drawOverlay(); updateHint(); return; }
    if (e.button !== 0) return;
    const hit = pick(sx, sy);
    switch (U.tool) {
      case 'select':
        if (hit && hit.kind === 'node' && isModelView(U.diag)) { U.drag = { node: hit.uid, sx, sy, moved: false, shift: e.shiftKey || e.ctrlKey }; }
        else if (hit) { selectHit(hit, e.shiftKey || e.ctrlKey); }
        else U.drag = { box: true, sx, sy, cx: sx, cy: sy };
        break;
      case 'node': {
        const p = snap(sx, sy, null);
        commit(m => { const u = M.addNode(m, p.x, p.y); U.sel = { kind: 'node', ids: [u] }; });
        break;
      }
      case 'bar': {
        const p = snap(sx, sy, U.barStart);
        if (!U.barStart) { U.barStart = { x: p.x, y: p.y }; drawOverlay(); updateHint(); break; }
        if (Math.hypot(p.x - U.barStart.x, p.y - U.barStart.y) < 1e-6) break;
        const st = U.barStart, fb = U.form.bar;
        commit(m => { const ids = M.addMember(m, st.x, st.y, p.x, p.y, { sec: fb.sec, truss: fb.truss }); if (ids.length) U.sel = { kind: 'member', ids }; });
        U.barStart = { x: p.x, y: p.y };
        break;
      }
      case 'support':
        if (hit && hit.kind === 'node') applySupportTool(hit.uid);
        else toast('Kliknij węzeł, w którym ma być podpora.');
        break;
      case 'hinge':
        if (hit && hit.kind === 'node') commit(m => { const n = nodeBy(hit.uid); n.hinge = !n.hinge; }, 'Przegub w węźle ' + nodeNo(hit.uid) + ' – przełączono');
        else if (hit && hit.kind === 'member') {
          commit(m => { const mm = memBy(hit.uid); if (hit.t < 0.5) mm.ri = !mm.ri; else mm.rj = !mm.rj; }, 'Przegub na ' + (hit.t < 0.5 ? 'początku' : 'końcu') + ' pręta ' + memNo(hit.uid) + ' – przełączono');
        } else toast('Kliknij węzeł (przegub w węźle) lub pręt blisko jego końca.');
        break;
      case 'sec':
        if (hit && hit.kind === 'member') {
          const mm = memBy(hit.uid);
          if (e.ctrlKey || e.altKey) { U.form.secTool.sec = mm.sec; toast('Pobrano przekrój: ' + secName(mm.sec)); deferRender(true); }
          else { const su = U.form.secTool.sec; commit(m => M.assignSec(m, [hit.uid], su), 'Pręt ' + memNo(hit.uid) + ' → ' + secName(su)); U.sel = { kind: 'member', ids: [hit.uid] }; }
        } else U.drag = { box: true, assign: true, sx, sy, cx: sx, cy: sy };
        break;
      case 'load':
        if (hit && (hit.kind === 'member' || hit.kind === 'node')) addLoadsTo(hit.kind, [hit.uid]);
        else if (hit && hit.kind === 'load') selectHit(hit, false);
        else toast('Kliknij pręt lub węzeł.');
        break;
    }
  });
  cv.addEventListener('pointermove', e => {
    const { sx, sy } = ptrInfo(e);
    const [wx, wy] = s2w(sx, sy);
    const d = U.drag;
    if (d && d.pan) {
      if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 3) d.moved = true;
      U.tr.ox = d.ox + sx - d.sx; U.tr.oy = d.oy + sy - d.sy; renderCanvas(); return;
    }
    let snp = null;
    if (U.tool === 'bar' || U.tool === 'node') snp = snap(sx, sy, U.tool === 'bar' ? U.barStart : null);
    if (d && d.node) {
      if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
      if (d.moved) { const n = nodeBy(d.node); const tmp = n.uid; snp = snapExcluding(sx, sy, tmp); }
    }
    if (d && d.box) { d.cx = sx; d.cy = sy; }
    const hover = (!d && U.tool !== 'bar' && U.tool !== 'node') ? pick(sx, sy) : null;
    U.lastPtr = { sx, sy, snap: snp, hover };
    const pos = snp ? snp : { x: wx, y: wy };
    $('#cpos').textContent = 'x = ' + fmt(pos.x, 3) + ' m   y = ' + fmt(pos.y, 3) + ' m' + (snp && snp.what ? '   ⟂ ' + snp.what : '');
    drawOverlay(U.lastPtr);
  });
  function snapExcluding(sx, sy, uid) {
    const saved = U.model.nodes; U.model.nodes = saved.filter(n => n.uid !== uid);
    const mems = U.model.members; U.model.members = mems.filter(m => m.i !== uid && m.j !== uid);
    const p = snap(sx, sy, null);
    U.model.nodes = saved; U.model.members = mems;
    return p;
  }
  cv.addEventListener('pointerup', e => {
    const { sx, sy } = ptrInfo(e);
    const d = U.drag; U.drag = null;
    if (!d) return;
    if (d.pan) { if (!d.moved && d.btn === 2) clearSel(); renderToolbar(); return; }
    if (d.node) {
      if (!d.moved) { selectHit({ kind: 'node', uid: d.node }, d.shift); return; }
      const p = snapExcluding(sx, sy, d.node);
      commit(m => { if (!M.moveNode(m, d.node, p.x, p.y)) toast('W tym miejscu jest już węzeł.'); });
      return;
    }
    if (d.box) {
      const x0 = Math.min(d.sx, d.cx), x1 = Math.max(d.sx, d.cx), y0 = Math.min(d.sy, d.cy), y1 = Math.max(d.sy, d.cy);
      if (x1 - x0 < 4 && y1 - y0 < 4) { if (!d.assign) clearSel(); return; }
      const inb = (n) => { const [x, y] = w2s(n.x, n.y); return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
      const mems = U.model.members.filter(m => { const a = nodeBy(m.i), b = nodeBy(m.j); return a && b && inb(a) && inb(b); }).map(m => m.uid);
      if (d.assign) {
        if (!mems.length) return;
        const su = U.form.secTool.sec;
        commit(m => M.assignSec(m, mems, su), 'Przekrój ' + secName(su) + ' → pręty ' + compactList(mems.map(memNo)));
        U.sel = { kind: 'member', ids: mems }; deferRender(true);
        return;
      }
      if (mems.length) U.sel = { kind: 'member', ids: mems };
      else { const ns = U.model.nodes.filter(inb).map(n => n.uid); U.sel = ns.length ? { kind: 'node', ids: ns } : { kind: null, ids: [] }; }
      deferRender(true);
    }
  });
  cv.addEventListener('pointerleave', () => { U.lastPtr = null; drawOverlay(); });
  cv.addEventListener('dblclick', e => {
    const { sx, sy } = ptrInfo(e);
    if (U.tool === 'bar') { U.barStart = null; drawOverlay(); updateHint(); return; }
    const h = pick(sx, sy);
    if (h) selectHit(h, false);
  });

  function selectHit(hit, add) {
    if (hit.kind === 'load' && hit.cs && hit.cs !== U.activeCase) U.activeCase = hit.cs;
    if (add && U.sel.kind === hit.kind) {
      const i = U.sel.ids.indexOf(hit.uid);
      if (i >= 0) U.sel.ids.splice(i, 1); else U.sel.ids.push(hit.uid);
      if (!U.sel.ids.length) U.sel.kind = null;
    } else U.sel = { kind: hit.kind, ids: [hit.uid] };
    if (hit.kind === 'node' && U.sel.ids.length === 1) U.form.bar.node = hit.uid;
    deferRender(true);
  }
  function clearSel() { U.sel = { kind: null, ids: [] }; deferRender(true); }

  function applySupportTool(uid) {
    const f = U.form.sup;
    commit(m => {
      const n = nodeBy(uid);
      if (f.type === 'none') { n.sup = null; return; }
      const pr = E.SUP_PRESETS[f.type];
      n.sup = M.sup(f.type, { b: +f.b || 0, ang: +f.ang || 0 });
      if (pr && pr.f) { n.sup.rx = pr.f[0]; n.sup.ry = pr.f[1]; n.sup.rz = pr.f[2]; }
      if (f.type === 'sprY') n.sup.ky = n.sup.ky || 10000;
      if (f.type === 'sprR') n.sup.kz = n.sup.kz || 10000;
    }, f.type === 'none' ? 'Usunięto podporę' : 'Podpora w węźle ' + nodeNo(uid));
    U.sel = { kind: 'node', ids: [uid] };
  }

  function updateHint() {
    const h = {
      select: 'Kliknij element, aby go zaznaczyć (Shift – dodaj). Przeciągnij węzeł, aby go przesunąć. Przeciągnij tło – zaznaczenie oknem. Kółko – zoom, prawy/środkowy przycisk – przesuwanie.',
      node: 'Kliknij, aby wstawić węzeł (przyciąganie do siatki i prętów – węzeł na pręcie dzieli pręt).',
      bar: U.barStart ? 'Kliknij koniec pręta. Esc / prawy przycisk – zakończ łańcuch. Shift – orto.' : 'Kliknij początek pręta (węzeł, punkt na pręcie lub siatka).',
      support: 'Kliknij węzeł, aby wstawić wybraną podporę.',
      hinge: 'Kliknij węzeł (przegub węzłowy) lub pręt w pobliżu końca (zwolnienie momentu na tym końcu).',
      load: 'Kliknij pręt lub węzeł, aby dodać obciążenie zdefiniowane w zakładce „Obciążenia”.',
      sec: 'Kliknij pręt, aby przypisać mu wybrany przekrój (lub zaznacz oknem kilka prętów). Ctrl+klik – pobierz przekrój z pręta.'
    }[U.tool];
    $('#chint').textContent = h || '';
  }
  function setTool(t) {
    U.tool = t; U.barStart = null;
    if (t === 'load' && U.tab !== 'loads') { U.tab = 'loads'; }
    if (!isModelView(U.diag) && t !== 'select') U.diag = 'model';
    if (t === 'sec') { U.diag = 'secs'; fitIfLegendCovers(); }
    updateHint(); deferRender(true);
  }

  // karta narzędzia
  function renderToolCard() {
    const tc = $('#toolCard');
    let h = '';
    if (U.tool === 'bar') {
      h = '<div class="f"><label>Przekrój</label>' + secSelect('ui.bar.sec', U.form.bar.sec) +
        '<label></label><label class="chk"><input type="checkbox" data-b="ui.bar.truss"' + (U.form.bar.truss ? ' checked' : '') + '> kratownicowy (przeguby)</label></div>';
    } else if (U.tool === 'support') {
      const f = U.form.sup;
      h = '<div class="f"><label>Typ podpory</label><select data-b="ui.sup.type">' + '<option value="none">— usuń podporę —</option>' +
        Object.entries(E.SUP_PRESETS).filter(([k]) => k !== 'custom').map(([k, v]) => `<option value="${k}"${f.type === k ? ' selected' : ''}>${esc(v.n)}</option>`).join('') + '</select>' +
        `<label>Szerokość b</label><div class="inl"><input class="n" data-b="ui.sup.b" data-t="num" value="${v2s(f.b)}"><span class="u">m</span></div>` +
        `<label>Obrót podpory</label><div class="inl"><input class="n" data-b="ui.sup.ang" data-t="num" value="${v2s(f.ang)}"><span class="u">° (podpora ukośna)</span></div></div>` +
        '<div class="hint">Sztywności sprężyn i podpory „własne” ustawisz w panelu właściwości węzła.</div>';
    } else if (U.tool === 'sec') {
      const su = U.form.secTool.sec, sp = E.secProps(U.model.secs.find(x => x.uid === su));
      h = `<div class="f"><label>Przypisz przekrój</label><div class="inl"><i class="sw" style="background:${D.secColor(U.model, su)}"></i>${secSelect('ui.secTool.sec', su)}</div></div>` +
        (sp ? `<div class="hint">A = ${fmt(sp.A * 1e4, 2)} cm², I = ${fmt(sp.I * 1e8, 0)} cm⁴, h = ${fmt(sp.h * 1000, 0)} mm</div>` : '') +
        '<div class="hint">Klik na pręcie – przypisz · okno – wiele prętów · Ctrl+klik – pobierz z pręta</div>' +
        '<div class="btns"><button data-act="newSecTool">+ Nowy przekrój</button><button data-act="openSecWin">Przekroje prętów…</button></div>';
    } else if (U.tool === 'load') {
      const cs = caseBy(U.activeCase);
      h = '<div class="hint">Przypadek: <b>' + (cs ? esc(caseCode(cs) + ' – ' + cs.name) : '—') + '</b><br>Obciążenie: <b>' + esc(loadSummary(formToLoad())) + '</b><br>Zmień parametry w zakładce „Obciążenia”.</div>';
    }
    tc.hidden = !h;
    if (!h) { tc.innerHTML = ''; return; }
    tc.innerHTML = h;
  }

  // ------------------------------------------------------------------ elementy formularzy
  function card(id, title, open, body, cnt) {
    U.open = U.open || {};
    const isOpen = U.open[id] !== undefined ? U.open[id] : open;
    return `<details class="card" data-card="${id}"${isOpen ? ' open' : ''}><summary>${title}${cnt !== undefined ? '<span class="cnt">' + cnt + '</span>' : ''}</summary><div class="body">${body}</div></details>`;
  }
  function inpN(key, val, cls, extra) { return `<input class="n ${cls || ''}" data-b="${key}" data-t="num" value="${esc(v2s(val))}" ${extra || ''}>`; }
  function inpNo(key, val, ph) { return `<input class="n" data-b="${key}" data-t="numo" value="${esc(v2s(val))}" placeholder="${ph || ''}">`; }
  function inpS(key, val, cls) { return `<input class="${cls || 'w'}" data-b="${key}" data-t="str" value="${esc(val || '')}">`; }
  function chk(key, val, label) { return `<label class="chk"><input type="checkbox" data-b="${key}"${val ? ' checked' : ''}> ${label || ''}</label>`; }
  function sel(key, val, opts, t) {
    return `<select data-b="${key}" data-t="${t || 'str'}">` + opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select>';
  }
  function secSelect(key, val) { return sel(key, val, U.model.secs.map(s => [s.uid, s.name || ('Przekrój ' + s.uid)]), 'int'); }
  function nodeSelect(key, val) { return sel(key, val, [['', '— wybierz —']].concat(U.model.nodes.map((n, i) => [n.uid, (i + 1) + ' (' + fmt(n.x, 2) + '; ' + fmt(n.y, 2) + ')'])), 'int'); }
  const DIRS = [['Y', '↓ pionowe (w dół +)'], ['X', '→ poziome (w prawo +)'], ['n', '⊥ prostopadłe do pręta (do spodu +)'], ['t', '∥ wzdłuż pręta (początek→koniec +)']];
  const MODES = [['abs', 'od początku [m]'], ['end', 'od końca [m]'], ['rel', 'względnie x/L']];
  function supSummary(s) {
    if (!s) return '';
    const ns = E.normSup(s);
    let t = s.type && s.type !== 'custom' && E.SUP_PRESETS[s.type] ? E.SUP_PRESETS[s.type].n : ns.f.map((v, i) => ['X', 'Y', 'φ'][i] + ':' + ['–', 'sztywna', 'spręż.'][v]).join(', ');
    if (ns.ang) t += ', ∠' + fmt(ns.ang, 1) + '°';
    if (ns.b) t += ', b=' + fmt(ns.b, 2) + ' m';
    return t;
  }

  // ------------------------------------------------------------------ panel lewy
  function renderPanel() {
    $$('#left .tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === U.tab));
    const p = $('#panel');
    const st = p.scrollTop;
    let h = '';
    try {
      if (U.tab === 'model') h = panelModel();
      else if (U.tab === 'loads') h = panelLoads();
      else if (U.tab === 'comb') h = panelComb();
      else h = panelRes();
    } catch (e) { console.error(e); h = '<div class="errbox">Błąd panelu: ' + esc(e.message) + '</div>'; }
    p.innerHTML = h;
    p.scrollTop = st;
  }

  // ------------------------------------------------------------------ przekroje – edytor
  const SHAPES = [['cat', 'Profil walcowany'], ['rect', 'Prostokąt b×h'], ['circ', 'Koło ⌀'], ['tube', 'Rura ⌀×t'], ['box', 'Rura prostokątna b×h×t'], ['I', 'Dwuteownik spawany'], ['man', 'Dowolny (A, I, h)']];
  function secName(u) { const sc = U.model.secs.find(x => x.uid === u); return sc ? sc.name : '?'; }
  function secParams(sc, brk) {
    const k = 'sec.' + sc.uid + '.', br = brk === false ? ' ' : '<br>';
    switch (sc.shape) {
      case 'cat': return sel(k + 'cat', sc.cat, Object.keys(E.PROFILES).map(q => [q, q]));
      case 'rect': return 'b ' + inpN(k + 'b', sc.b) + ' h ' + inpN(k + 'h', sc.h) + '<span class="u">mm</span>';
      case 'circ': return '⌀ ' + inpN(k + 'd', sc.d) + '<span class="u">mm</span>';
      case 'tube': return '⌀ ' + inpN(k + 'd', sc.d) + ' t ' + inpN(k + 't', sc.t) + '<span class="u">mm</span>';
      case 'box': return 'b ' + inpN(k + 'b', sc.b) + ' h ' + inpN(k + 'h', sc.h) + ' t ' + inpN(k + 't', sc.t) + '<span class="u">mm</span>';
      case 'I': return 'h ' + inpN(k + 'h', sc.h) + ' b ' + inpN(k + 'b', sc.b) + br + 't<sub>w</sub> ' + inpN(k + 'tw', sc.tw) + ' t<sub>f</sub> ' + inpN(k + 'tf', sc.tf) + '<span class="u">mm</span>';
      default: return 'A ' + inpN(k + 'A', sc.A) + '<span class="u">cm²</span> I ' + inpN(k + 'I', sc.I) + '<span class="u">cm⁴</span>' + br + 'h ' + inpN(k + 'hm', sc.hm) + '<span class="u">mm</span>';
    }
  }
  function secInfo(sc) {
    const p = E.secProps(sc), mat = U.model.mats.find(x => x.uid === sc.mat);
    if (!p) return '<span style="color:#b91c1c">niepoprawne wymiary</span>';
    return 'A = ' + fmt(p.A * 1e4, 2) + ' cm², I = ' + fmt(p.I * 1e8, 0) + ' cm⁴, h = ' + fmt(p.h * 1000, 0) + ' mm' + (mat ? ', EI = ' + fmt(mat.E * 1e6 * p.I, 0) + ' kNm², g = ' + fmt(p.A * mat.g, 3) + ' kN/m' : '');
  }
  function secCard(sc, noDel) {
    const used = U.model.members.filter(x => x.sec === sc.uid).map(x => memNo(x.uid));
    return `<div class="seccard" style="border-left:4px solid ${D.secColor(U.model, sc.uid)}">
      <div style="display:flex;gap:6px;align-items:center">${inpS('sec.' + sc.uid + '.name', sc.name, 'w')}${noDel ? '' : `<button class="x" data-act="dupSec" data-v="${sc.uid}" title="Duplikuj przekrój">⧉</button><button class="x" data-act="delSec" data-v="${sc.uid}" title="Usuń przekrój">✕</button>`}</div>
      <div class="f" style="grid-template-columns:70px 1fr;margin:4px 0"><label>Kształt</label>${sel('sec.' + sc.uid + '.shape', sc.shape, SHAPES)}
      <label>Wymiary</label><div class="inl">${secParams(sc)}</div>
      <label>Materiał</label>${sel('sec.' + sc.uid + '.mat', sc.mat, U.model.mats.map(x => [x.uid, x.name]), 'int')}</div>
      <div class="hint">${secInfo(sc)}${noDel ? '' : ' · pręty: ' + (used.length ? `<button class="lnk" data-act="selSecMembers" data-v="${sc.uid}">${compactList(used)}</button>` : 'brak')}</div></div>`;
  }

  function panelModel() {
    const m = U.model, f = U.form.bar;
    let h = '';
    const dirs = [['R', '→', 'w prawo (0°)'], ['U', '↑', 'w górę (90°)'], ['L', '←', 'w lewo (180°)'], ['D', '↓', 'w dół (270°)'], ['A', '∠', 'pod kątem α']];
    h += card('addbar', 'Dodaj pręt o zadanej długości', true,
      `<div class="f">
        <label>Początek</label><div class="inl">${sel('ui.bar.from', f.from, [['node', 'w węźle'], ['pt', 'w punkcie (x, y)']])}
        ${f.from === 'node' ? nodeSelect('ui.bar.node', f.node) : 'x ' + inpN('ui.bar.x', f.x) + ' y ' + inpN('ui.bar.y', f.y) + '<span class="u">m</span>'}</div>
        <label>Kierunek</label><div class="inl"><span class="seg">${dirs.map(d => `<button class="dirbtn${f.dir === d[0] ? ' on' : ''}" data-act="barDir" data-v="${d[0]}" title="${d[2]}">${d[1]}</button>`).join('')}</span>
        ${f.dir === 'A' ? inpN('ui.bar.ang', f.ang) + '<span class="u">°</span>' : ''}</div>
        <label>Długość L</label><div class="inl">${inpN('ui.bar.L', f.L)}<span class="u">m</span> × <input class="n" style="width:46px" data-b="ui.bar.n" data-t="int" value="${f.n}"><span class="u">szt.</span></div>
        <label>Przekrój</label>${secSelect('ui.bar.sec', f.sec)}
        <label></label>${chk('ui.bar.truss', f.truss, 'kratownicowy (przeguby na obu końcach)')}
      </div>
      <div class="btns"><button class="pri" data-act="addBar">Dodaj pręt</button><button data-act="addNodeXY">Dodaj sam węzeł…</button></div>
      <div class="hint" style="margin-top:6px">Koniec pręta staje się kolejnym początkiem. Węzeł trafiający na istniejący pręt dzieli go; pręt przechodzący przez istniejące węzły jest z nimi łączony. Pola liczbowe przyjmują wyrażenia, np. <b>6*0,6</b>.</div>`);

    // generatory
    const g = U.form.gen, G = M.GEN[g.type];
    g.vals[g.type] = g.vals[g.type] || {};
    const gv = g.vals[g.type];
    for (const p of G.p) if (gv[p[0]] === undefined) gv[p[0]] = p[2];
    h += card('gen', 'Generator: belka, rama, kratownica', false,
      `<div class="f"><label>Układ</label>${sel('ui.gen.type', g.type, Object.entries(M.GEN).map(([k, v]) => [k, v.n]))}
      ${G.p.map(p => `<label>${esc(p[1])}</label><input class="w" data-b="gen.${p[0]}" data-t="str" value="${esc(gv[p[0]])}">`).join('')}
      <label>Punkt wstawienia</label><div class="inl">x ${inpN('ui.gen.x0', g.x0)} y ${inpN('ui.gen.y0', g.y0)}</div>
      <label></label>${chk('ui.gen.clear', g.clear, 'zastąp bieżący model (przekroje zostają)')}</div>
      <div class="btns"><button class="pri" data-act="genRun">Wstaw układ</button></div>
      <div class="hint">Rygle/pręty otrzymują pierwszy przekrój z listy, słupy – drugi.</div>`);

    // węzły
    const sn = new Set(U.sel.kind === 'node' ? U.sel.ids : []);
    let tn = '<div class="tw"><table class="t"><tr><th>Nr</th><th class="r">x [m]</th><th class="r">y [m]</th><th title="Węzeł przegubowy – wszystkie pręty połączone przegubowo">Przegub</th><th>Podpora</th><th></th></tr>';
    m.nodes.forEach((n, i) => {
      tn += `<tr class="click${sn.has(n.uid) ? ' sel' : ''}" data-act="selNode" data-v="${n.uid}"><td><b>${i + 1}</b></td><td class="r">${inpN('node.' + n.uid + '.x', n.x)}</td><td class="r">${inpN('node.' + n.uid + '.y', n.y)}</td>
        <td><input type="checkbox" data-b="node.${n.uid}.hinge"${n.hinge ? ' checked' : ''}></td><td class="mut" style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(supSummary(n.sup))}</td><td><button class="x" data-act="delNode" data-v="${n.uid}" title="Usuń węzeł">✕</button></td></tr>`;
    });
    tn += '</table></div>';
    h += card('nodes', 'Węzły', true, m.nodes.length ? tn : '<div class="hint">Brak węzłów.</div>', m.nodes.length);

    // pręty
    const sm = new Set(U.sel.kind === 'member' ? U.sel.ids : []);
    let tm = '<div class="tw"><table class="t"><tr><th>Nr</th><th>Węzły</th><th class="r">L [m]</th><th>Przekrój</th><th title="Przegub na początku pręta">○p</th><th title="Przegub na końcu pręta">○k</th><th></th><th></th></tr>';
    m.members.forEach((x, i) => {
      tm += `<tr class="click${sm.has(x.uid) ? ' sel' : ''}" data-act="selMem" data-v="${x.uid}"><td><b>${i + 1}</b></td><td>${nodeNo(x.i)}→${nodeNo(x.j)}</td><td class="r">${fmt(M.memLen(m, x), 3)}</td>
        <td>${secSelect('mem.' + x.uid + '.sec', x.sec)}</td><td><input type="checkbox" data-b="mem.${x.uid}.ri"${x.ri ? ' checked' : ''}></td><td><input type="checkbox" data-b="mem.${x.uid}.rj"${x.rj ? ' checked' : ''}></td>
        <td><button class="x" data-act="revMem" data-v="${x.uid}" title="Odwróć kierunek pręta (zmienia stronę spodów)">⇄</button></td><td><button class="x" data-act="delMem" data-v="${x.uid}" title="Usuń pręt">✕</button></td></tr>`;
    });
    tm += '</table></div>';
    h += card('mems', 'Pręty', true, (m.members.length ? tm + '<div class="btns"><button data-act="openSecWin">Przypisz przekroje prętom…</button><button data-act="tool" data-v="sec">Narzędzie „Przekrój”</button></div>' : '<div class="hint">Brak prętów – dodaj pręt formularzem powyżej lub narzędziem „Pręt”.</div>'), m.members.length);

    // podpory
    const sups = m.nodes.filter(n => n.sup);
    let ts = '<div class="tw"><table class="t"><tr><th>Węzeł</th><th>Typ</th><th class="r">b [m]</th><th class="r">∠ [°]</th><th></th></tr>';
    for (const n of sups) {
      ts += `<tr class="click" data-act="selNode" data-v="${n.uid}"><td><b>${nodeNo(n.uid)}</b></td><td>${sel('sup.' + n.uid + '.type', n.sup.type || 'custom', Object.entries(E.SUP_PRESETS).map(([k, v]) => [k, v.n]))}</td>
        <td class="r">${inpN('sup.' + n.uid + '.b', n.sup.b || 0)}</td><td class="r">${inpN('sup.' + n.uid + '.ang', n.sup.ang || 0)}</td><td><button class="x" data-act="delSup" data-v="${n.uid}" title="Usuń podporę">✕</button></td></tr>`;
    }
    ts += '</table></div>';
    h += card('sups', 'Podpory', true, (sups.length ? ts : '<div class="hint">Brak podpór.</div>') +
      '<div class="hint" style="margin-top:6px">Dodaj podporę narzędziem „Podpora” lub w panelu właściwości węzła. Szerokość <b>b</b> – zaokrąglenie momentu nad podporą pośrednią (EN 1992-1-1, 5.3.2.2(4)) i siły w licu podpory; <b>∠</b> – obrót podpory (podpora ukośna). Sprężyny: typ „Własna” lub „Sprężysta”.</div>', sups.length);

    // przekroje
    let tsec = '';
    for (const sc of m.secs) tsec += secCard(sc);
    h += card('secs', 'Przekroje', false, tsec + '<div class="btns"><button data-act="newSec">+ Dodaj przekrój</button><button data-act="openSecWin">Przekroje prętów…</button></div>', m.secs.length);

    // materiały
    let tmat = '<div class="tw"><table class="t"><tr><th>Nazwa / klasa</th><th class="r">E [GPa]</th><th class="r">γ [kN/m³]</th><th class="r">α<sub>T</sub> [1/K]</th><th></th></tr>';
    for (const x of m.mats) {
      tmat += `<tr><td>${sel('mat.' + x.uid + '.key', x.key || '', [['', '— własny —']].concat(E.MATS.map(t => [t.key, t.grp + ' ' + t.key])))}<br>${inpS('mat.' + x.uid + '.name', x.name, '')}</td>
        <td class="r">${inpN('mat.' + x.uid + '.E', x.E)}</td><td class="r">${inpN('mat.' + x.uid + '.g', x.g)}</td><td class="r">${inpN('mat.' + x.uid + '.a', x.a)}</td><td><button class="x" data-act="delMat" data-v="${x.uid}">✕</button></td></tr>`;
    }
    tmat += '</table></div><div class="btns"><button data-act="addMat">+ Dodaj materiał</button></div><div class="hint">E<sub>cm</sub> betonu wg PN-EN 1992-1-1 tab. 3.1; drewno – E<sub>0,mean</sub>, ciężar z ρ<sub>mean</sub>.</div>';
    h += card('mats', 'Materiały', false, tmat, m.mats.length);
    return h;
  }

  // ------------------------------------------------------------------ obciążenia
  function formToLoad() {
    const f = U.form.load;
    switch (f.type) {
      case 'q': return { type: 'q', dir: f.dir, proj: (f.dir === 'Y' || f.dir === 'X') ? !!f.proj : false, unit: f.unit, bw: f.bw, q1: f.q1, q2: (f.q2 === null || f.q2 === '' ? f.q1 : f.q2), full: f.full, x1: f.x1, x2: f.x2, mode: f.mode };
      case 'F': return { type: 'F', dir: f.dir, F: f.F, x: f.x, mode: f.fmode };
      case 'Mm': return { type: 'Mm', M: f.M, x: f.x, mode: f.fmode };
      case 'P': return { type: 'P', Fx: f.Fx, Fy: f.Fy, M: f.Mn };
      case 'T': return { type: 'T', dT: f.dT, dTg: f.dTg };
      case 'S': return { type: 'S', ux: f.ux, uy: f.uy, rz: f.rz };
    }
  }
  const LT = { q: 'Ciągłe q', F: 'Siła skupiona', Mm: 'Moment skupiony', P: 'Węzłowe', T: 'Temperatura', S: 'Przemieszczenie wymuszone' };
  const isNodeLoad = (t) => t === 'P' || t === 'S';
  function posTxt(x, mode) { return mode === 'rel' ? 'x/L=' + fmt(+x, 3) : mode === 'end' ? fmt(+x, 2) + ' m od końca' : 'x=' + fmt(+x, 2) + ' m'; }
  function loadSummary(l) {
    if (!l) return '';
    const dn = { Y: '↓', X: '→', n: '⊥', t: '∥' };
    switch (l.type) {
      case 'q': {
        const mul = l.unit === 'm2' ? ' kN/m² × ' + fmt(+l.bw || 1, 2) + ' m' : ' kN/m';
        const q2 = l.q2 === undefined || l.q2 === null ? l.q1 : l.q2;
        return dn[l.dir || 'Y'] + ' q = ' + fmt(+l.q1 || 0) + (+q2 !== +l.q1 ? '…' + fmt(+q2 || 0) : '') + mul + (l.proj ? ', na rzut' : '') + (l.full ? '' : ', ' + posTxt(l.x1, l.mode) + ' … ' + posTxt(l.x2, l.mode).replace(/^x\/L=|^x=/, ''));
      }
      case 'F': return dn[l.dir || 'Y'] + ' F = ' + fmt(+l.F || 0) + ' kN, ' + posTxt(l.x, l.mode);
      case 'Mm': return '↻ M = ' + fmt(+l.M || 0) + ' kNm, ' + posTxt(l.x, l.mode);
      case 'P': return [+l.Fx ? 'Fx = ' + fmt(+l.Fx) + ' kN' : '', +l.Fy ? 'Fy = ' + fmt(+l.Fy) + ' kN' : '', +l.M ? 'M = ' + fmt(+l.M) + ' kNm' : ''].filter(Boolean).join(', ') || '0';
      case 'T': return 'ΔT = ' + fmt(+l.dT || 0, 1) + ' K, ΔT(d−g) = ' + fmt(+l.dTg || 0, 1) + ' K';
      case 'S': return 'Δx = ' + fmt(+l.ux || 0, 1) + ' mm, Δy = ' + fmt(+l.uy || 0, 1) + ' mm, φ = ' + fmt(+l.rz || 0, 2) + ' mrad';
    }
    return '';
  }
  // pola formularza obciążenia; pre = 'ui.load' lub 'load.<uid>'
  function loadFields(pre, o, isForm) {
    const t = o.type;
    let h = '<div class="f">';
    const mk = (k) => pre + '.' + k;
    if (t === 'q') {
      h += `<label>Kierunek</label>${sel(mk('dir'), o.dir || 'Y', DIRS)}`;
      if (o.dir === 'Y' || o.dir === 'X' || !o.dir) h += `<label></label>${chk(mk('proj'), o.proj, o.dir === 'X' ? 'na rzut pionowy pręta' : 'na rzut poziomy pręta (np. śnieg)')}`;
      h += `<label>Jednostka</label>${sel(mk('unit'), o.unit || 'm', [['m', 'kN/m (liniowe)'], ['m2', 'kN/m² × szerokość pasma']])}`;
      if (o.unit === 'm2') h += `<label>Szerokość pasma</label><div class="inl">${inpN(mk('bw'), o.bw)}<span class="u">m (rozstaw)</span></div>`;
      const u = o.unit === 'm2' ? 'kN/m²' : 'kN/m';
      h += `<label>q₁ (początek)</label><div class="inl">${inpN(mk('q1'), o.q1)}<span class="u">${u}</span></div>`;
      h += `<label>q₂ (koniec)</label><div class="inl">${inpNo(mk('q2'), isForm ? o.q2 : (o.q2 === o.q1 ? o.q2 : o.q2), '= q₁')}<span class="u">${u} (puste = stałe)</span></div>`;
      h += `<label>Zakres</label>${chk(mk('full'), o.full, 'na całej długości pręta')}`;
      if (!o.full) h += `<label>Od – do</label><div class="inl">${inpN(mk('x1'), o.x1)} – ${inpN(mk('x2'), o.x2)}</div><label>Odniesienie</label>${sel(mk('mode'), o.mode || 'abs', MODES)}`;
    } else if (t === 'F' || t === 'Mm') {
      if (t === 'F') h += `<label>Kierunek</label>${sel(mk('dir'), o.dir || 'Y', DIRS)}<label>Wartość F</label><div class="inl">${inpN(mk('F'), o.F)}<span class="u">kN</span></div>`;
      else h += `<label>Wartość M</label><div class="inl">${inpN(mk('M'), o.M)}<span class="u">kNm (+ ↻ zgodnie z ruchem wskazówek)</span></div>`;
      const mk2 = isForm ? 'fmode' : 'mode';
      h += `<label>Położenie</label><div class="inl">${inpN(mk('x'), o.x)}${sel(pre + '.' + mk2, isForm ? o.fmode : (o.mode || 'abs'), MODES)}</div>`;
    } else if (t === 'P') {
      h += `<label>F<sub>x</sub></label><div class="inl">${inpN(mk('Fx'), o.Fx)}<span class="u">kN (+ →)</span></div>`;
      h += `<label>F<sub>y</sub></label><div class="inl">${inpN(mk('Fy'), o.Fy)}<span class="u">kN (+ ↓)</span></div>`;
      h += `<label>M</label><div class="inl">${inpN(mk(isForm ? 'Mn' : 'M'), isForm ? o.Mn : o.M)}<span class="u">kNm (+ ↻)</span></div>`;
    } else if (t === 'T') {
      h += `<label>ΔT równomierna</label><div class="inl">${inpN(mk('dT'), o.dT)}<span class="u">K (ogrzanie +)</span></div>`;
      h += `<label>ΔT<sub>d</sub> − ΔT<sub>g</sub></label><div class="inl">${inpN(mk('dTg'), o.dTg)}<span class="u">K (spody cieplejsze +)</span></div>`;
      h += '<label></label><div class="hint">Gradient liczony na wysokości przekroju h; „spody” – strona linii przerywanej.</div>';
    } else if (t === 'S') {
      h += `<label>Δx</label><div class="inl">${inpN(mk('ux'), o.ux)}<span class="u">mm (+ →, w układzie podpory)</span></div>`;
      h += `<label>Δy (osiadanie)</label><div class="inl">${inpN(mk('uy'), o.uy)}<span class="u">mm (+ ↓)</span></div>`;
      h += `<label>φ</label><div class="inl">${inpN(mk('rz'), o.rz)}<span class="u">mrad (+ ↻)</span></div>`;
      h += '<label></label><div class="hint">Działa tylko na kierunkach zablokowanych lub sprężystych podpory.</div>';
    }
    return h + '</div>';
  }

  function panelLoads() {
    const m = U.model;
    let h = '';
    // przypadki
    let tc = '<div class="tw"><table class="t"><tr><th></th><th></th><th>Nazwa</th><th>Rodzaj</th><th class="r">Obc.</th><th></th></tr>';
    for (const c of m.cases) {
      const on = c.uid === U.activeCase;
      tc += `<tr class="click${on ? ' sel' : ''}" data-act="setCase" data-v="${c.uid}"><td><input type="radio" name="acase"${on ? ' checked' : ''} data-act="setCase" data-v="${c.uid}"></td><td><span class="tag ${c.type || 'G'}">${caseCode(c)}</span></td>
        <td style="width:100%">${inpS('case.' + c.uid + '.name', c.name, 'w')}</td><td>${sel('case.' + c.uid + '.type', c.type || 'G', [['G', 'stałe'], ['Q', 'zmienne'], ['A', 'wyjątkowe']])}</td><td class="r mut">${c.loads.length + (c.selfWeight ? '+c.w.' : '')}</td>
        <td><button class="x" data-act="dupCase" data-v="${c.uid}" title="Powiel przypadek">⧉</button><button class="x" data-act="delCase" data-v="${c.uid}" title="Usuń przypadek">✕</button></td></tr>`;
    }
    tc += '</table></div><div class="btns"><button data-act="addCase" data-v="G">+ Stałe G</button><button data-act="addCase" data-v="Q">+ Zmienne Q</button><button data-act="addCase" data-v="A">+ Wyjątkowe A</button></div>';
    h += card('cases', 'Przypadki obciążeń', true, tc, m.cases.length);

    const c = caseBy(U.activeCase);
    if (c) {
      let b = `<div class="f"><label>Nazwa</label>${inpS('case.' + c.uid + '.name', c.name)}`;
      if ((c.type || 'G') === 'G') b += `<label></label>${chk('case.' + c.uid + '.selfWeight', c.selfWeight, 'ciężar własny prętów (A·γ, automatycznie)')}`;
      if (c.type === 'Q') {
        b += `<label>Kategoria</label>${sel('case.' + c.uid + '.cat', c.cat || 'B', Object.entries(E.CATS).map(([k, v]) => [k, v.n]))}`;
        const ps = E.psiOf(c), man = (c.cat || 'B') === 'X';
        b += `<label>ψ₀ / ψ₁ / ψ₂</label><div class="inl">${man ? inpN('case.' + c.uid + '.psi0', ps[0], '', 'style="width:52px"') + inpN('case.' + c.uid + '.psi1', ps[1], '', 'style="width:52px"') + inpN('case.' + c.uid + '.psi2', ps[2], '', 'style="width:52px"') : fmt(ps[0], 2) + ' / ' + fmt(ps[1], 2) + ' / ' + fmt(ps[2], 2)}</div>`;
        b += `<label>Grupa</label>${sel('case.' + c.uid + '.grp', c.grp || '', [['', '— niezależne —']].concat(m.groups.map(g => [g.uid, g.name + (g.mode === 'sum' ? ' (jedno oddziaływanie)' : ' (wykluczające)')])), 'int')}`;
      }
      b += '</div>';
      if (c.type === 'Q') b += '<div class="hint">Grupy definiujesz w zakładce „Kombinacje”: <b>wykluczające się</b> (np. wiatr z lewej / z prawej) lub <b>jedno oddziaływanie</b> (np. obciążenie użytkowe rozbite na przęsła – układ szachownicowy).</div>';
      b += `<details class="card" style="margin-top:6px"><summary style="font-weight:400">Współczynniki częściowe przypadku (opcjonalnie)</summary><div class="body"><div class="f">` +
        ((c.type || 'G') === 'G' ? `<label>γ<sub>G,sup</sub></label>${inpNo('case.' + c.uid + '.gs', c.gs, fmt(m.set.gGs, 2))}<label>γ<sub>G,inf</sub></label>${inpNo('case.' + c.uid + '.gi', c.gi, fmt(m.set.gGi, 2))}` :
          c.type === 'Q' ? `<label>γ<sub>Q</sub></label>${inpNo('case.' + c.uid + '.gq', c.gq, fmt(m.set.gQ, 2))}` : '<span class="hint">Oddziaływania wyjątkowe: γ = 1,0.</span>') +
        '</div><div class="hint">Puste pole = wartość globalna z zakładki „Kombinacje”.</div></div></details>';
      h += card('case', 'Aktywny przypadek: ' + esc(caseCode(c)), true, b);
    }

    // dodawanie obciążenia
    const f = U.form.load;
    const types = Object.entries(LT);
    let a = `<div class="seg" style="flex-wrap:wrap;margin-bottom:6px">${types.map(([k, v]) => `<button data-act="loadType" data-v="${k}" class="${f.type === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
    a += loadFields('ui.load', f, true);
    const nodeT = isNodeLoad(f.type);
    const tsel = U.sel.kind === (nodeT ? 'node' : 'member') ? U.sel.ids : [];
    a += `<div class="f"><label>${nodeT ? 'Węzły' : 'Pręty'}</label><div>${tsel.length ? '<b>zaznaczone: ' + tsel.map(u => nodeT ? nodeNo(u) : memNo(u)).join(', ') + '</b>' : `<input class="w" data-b="ui.load.target" data-t="str" value="${esc(f.target)}" placeholder="numery, np. 1-3, 5 (lub zaznacz na schemacie)">`}</div></div>`;
    a += `<div class="btns"><button class="pri" data-act="addLoad">Dodaj do przypadku ${c ? esc(caseCode(c)) : ''}</button><button data-act="tool" data-v="load">Wskaż na schemacie…</button></div>`;
    h += card('addload', 'Dodaj obciążenie', true, a);

    // lista obciążeń
    if (c) {
      const sl = new Set(U.sel.kind === 'load' ? U.sel.ids : []);
      let tl = '<div class="tw"><table class="t"><tr><th>Gdzie</th><th>Rodzaj</th><th>Wartości</th><th></th></tr>';
      for (const l of c.loads) {
        const where = isNodeLoad(l.type) ? 'węzeł ' + nodeNo(l.node) : 'pręt ' + memNo(l.m);
        tl += `<tr class="click${sl.has(l.uid) ? ' sel' : ''}" data-act="selLoad" data-v="${l.uid}"><td>${where}</td><td>${LT[l.type]}</td><td style="white-space:normal">${esc(loadSummary(l))}</td><td><button class="x" data-act="delLoad" data-v="${l.uid}">✕</button></td></tr>`;
      }
      tl += '</table></div>';
      h += card('loadlist', 'Obciążenia w ' + esc(caseCode(c)), true, (c.loads.length ? tl : '<div class="hint">Brak obciążeń w tym przypadku' + (c.selfWeight ? ' (poza ciężarem własnym)' : '') + '.</div>') +
        (c.loads.length ? '<div class="btns"><button class="dang" data-act="clearCase">Usuń wszystkie obciążenia przypadku</button></div>' : ''), c.loads.length);
    }
    return h;
  }

  // ------------------------------------------------------------------ kombinacje
  function panelComb() {
    const m = U.model, s = m.set, r = U.res;
    let h = '';
    h += card('cset', 'Kombinacje wg PN-EN 1990 (ZK PL)', true,
      `<div class="f"><label>SGN (STR/GEO)</label>${sel('set.comb', s.comb, [['ab', 'wzory 6.10a i 6.10b (mniej korzystny)'], ['610', 'wzór 6.10']])}
      <label>γ<sub>G,sup</sub> / γ<sub>G,inf</sub></label><div class="inl">${inpN('set.gGs', s.gGs)} / ${inpN('set.gGi', s.gGi)}</div>
      <label>γ<sub>Q</sub></label>${inpN('set.gQ', s.gQ)}
      ${s.comb === 'ab' ? `<label>ξ (6.10b)</label>${inpN('set.xi', s.xi)}` : ''}
      <label>Wyjątkowa 6.11b</label>${sel('set.accPsi', s.accPsi, [[1, 'wiodące zmienne z ψ₁'], [2, 'wiodące zmienne z ψ₂']], 'int')}</div>
      <div class="hint">Obwiednie liczone punkt po punkcie: każde obciążenie stałe z γ<sub>sup</sub> lub γ<sub>inf</sub>, zmienne tylko tam, gdzie niekorzystne, każde zmienne (lub grupa „jedno oddziaływanie”) jako wiodące. Kat. H (dachy) nie łączona ze śniegiem i wiatrem.</div>`);

    // grupy
    let tg = '<div class="tw"><table class="t"><tr><th>Nazwa</th><th>Typ</th><th>Przypadki</th><th></th></tr>';
    for (const g of m.groups) {
      const cs = m.cases.filter(c => c.type === 'Q' && c.grp === g.uid).map(caseCode).join(', ');
      tg += `<tr><td>${inpS('grp.' + g.uid + '.name', g.name, '')}</td><td>${sel('grp.' + g.uid + '.mode', g.mode, [['excl', 'wykluczające się'], ['sum', 'jedno oddziaływanie']])}</td><td class="mut">${cs || '—'}</td><td><button class="x" data-act="delGrp" data-v="${g.uid}">✕</button></td></tr>`;
    }
    tg += '</table></div>';
    h += card('grps', 'Grupy obciążeń zmiennych', true, (m.groups.length ? tg : '<div class="hint">Brak grup – każde obciążenie zmienne jest niezależnym oddziaływaniem.</div>') +
      `<div class="btns"><button data-act="addGrp" data-v="excl">+ Grupa wykluczająca się</button><button data-act="addGrp" data-v="sum">+ Jedno oddziaływanie</button></div>
      <div class="hint"><b>Wykluczające się</b> – działa co najwyżej jeden przypadek z grupy (np. wiatr L/P, warianty śniegu).<br><b>Jedno oddziaływanie</b> – przypadki są częściami tego samego obciążenia: każda część włączana tam, gdzie niekorzystna, z tym samym współczynnikiem (obciążenie szachownicowe).</div>`, m.groups.length);

    // tabela ψ
    const qs = m.cases.filter(c => c.type === 'Q');
    if (qs.length) {
      let tq = '<div class="tw"><table class="t"><tr><th>Przypadek</th><th>Kat.</th><th class="r">ψ₀</th><th class="r">ψ₁</th><th class="r">ψ₂</th><th>Grupa</th></tr>';
      for (const c of qs) {
        const ps = E.psiOf(c);
        tq += `<tr><td title="${esc(c.name)}"><span class="tag Q">${caseCode(c)}</span> <span style="display:inline-block;max-width:92px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${esc(c.name)}</span></td><td><select data-b="case.${c.uid}.cat" data-t="str" style="max-width:62px" title="${esc((E.CATS[c.cat || 'B'] || {}).n || '')}">${Object.entries(E.CATS).map(([k, v]) => `<option value="${k}"${(c.cat || 'B') === k ? ' selected' : ''}>${k === 'X' ? 'inne' : k} – ${esc(v.n)}</option>`).join('')}</select></td>
          ${(c.cat || 'B') === 'X' ? ['psi0', 'psi1', 'psi2'].map((k, i) => `<td class="r">${inpN('case.' + c.uid + '.' + k, ps[i], '', 'style="width:46px"')}</td>`).join('') : ps.map(v => `<td class="r">${fmt(v, 2)}</td>`).join('')}
          <td><select data-b="case.${c.uid}.grp" data-t="int" style="max-width:76px">${[['', '—']].concat(m.groups.map(g => [g.uid, g.name])).map(([v, l]) => `<option value="${v}"${String(c.grp || '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`;
      }
      tq += '</table></div>';
      h += card('psi', 'Obciążenia zmienne – współczynniki ψ', true, tq, qs.length);
    }

    // wzory
    if (r && r.ok) {
      let tf = '';
      for (const v of E.availableViews(m, r).filter(v => v.key.startsWith('env:'))) {
        const k = v.key.slice(4);
        tf += '<div class="sub">' + esc(v.label) + '</div>';
        for (const t of E.ruleText(r, k)) tf += '<div class="formula">' + esc(t.lab + ':  ' + t.txt) + '</div>';
      }
      tf += '<div class="hint">G – z γ<sub>sup</sub>/γ<sub>inf</sub> zależnie od wpływu; Q<sub>wiod.</sub> – kolejno każde oddziaływanie zmienne; Σψ·Q – pozostałe, tylko niekorzystne. Kombinację decydującą dla wartości ekstremalnych pokazuje zakładka „Wyniki” i panel właściwości pręta.</div>';
      h += card('formulas', 'Wzory kombinacji', false, tf);
    }

    // kombinacje użytkownika
    let tu = '';
    if (m.combos.length) {
      tu = '<div class="tw"><table class="t"><tr><th>Nazwa</th>' + m.cases.map(c => `<th class="r"><span class="tag ${c.type || 'G'}">${caseCode(c)}</span></th>`).join('') + '<th></th></tr>';
      for (const cb of m.combos) {
        tu += `<tr><td>${inpS('cmb.' + cb.uid + '.name', cb.name, '')}</td>` + m.cases.map(c => `<td class="r">${inpNo('cmbf.' + cb.uid + '.' + c.uid, (cb.f || {})[c.uid], '0')}</td>`).join('') + `<td><button class="x" data-act="delCmb" data-v="${cb.uid}">✕</button></td></tr>`;
      }
      tu += '</table></div>';
    }
    h += card('ucmb', 'Kombinacje użytkownika', m.combos.length > 0, (tu || '<div class="hint">Własne kombinacje liniowe Σ fᵢ·Eᵢ z dowolnymi współczynnikami.</div>') +
      '<div class="btns"><button data-act="addCmb">+ Dodaj kombinację</button></div>', m.combos.length);

    h += card('calc', 'Ustawienia obliczeń', false,
      `<div class="f"><label>Podziały pręta</label><div class="inl">${inpN('set.nDiv', s.nDiv)}<span class="u">punktów obliczeniowych (+ punkty obciążeń)</span></div>
      <label></label>${chk('set.width', s.width, 'zaokrąglaj M i T nad podporami pośrednimi o szerokości b')}</div>
      <div class="hint">Analiza liniowo-sprężysta I rzędu (Euler–Bernoulli), bez odkształceń postaciowych. Przy podporze pośredniej z dwoma współliniowymi prętami reakcja jest rozłożona równomiernie na szerokości b: ΔM = R·b/8 (PN-EN 1992-1-1, 5.3.2.2(4)).</div>`);
    return h;
  }

  // ------------------------------------------------------------------ wyniki
  const fk = (v) => fmt(v);
  const fmm = (v) => fmt(v * 1000, 2);
  const fmr = (v) => fmt(v * 1000, 3);
  function panelRes() {
    const r = U.res, m = U.model;
    if (!r) return '';
    let h = '';
    if (!r.ok) {
      h += '<div class="errbox"><b>Nie można obliczyć układu:</b><ul style="margin:4px 0 0 16px;padding:0">' + r.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
      return h;
    }
    if (r.warnings.length) h += '<div class="warnbox">' + r.warnings.map(esc).join('<br>') + '</div>';
    const view = curView();
    const views = E.availableViews(m, r);
    h += `<div class="f" style="grid-template-columns:80px 1fr"><label>Wyniki dla</label><select id="viewSel2">${views.map(v => `<option value="${v.key}"${v.key === U.viewKey ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>`;
    if (!view) return h;
    const env = view.env;
    const two = (a, i, f) => env ? f(a.max[i]) + ' / ' + f(a.min[i]) : f(a.max[i]);

    // reakcje
    let tr = `<div class="tw"><table class="t"><tr><th>Węzeł</th><th class="r">R<sub>x</sub> [kN] (+→)</th><th class="r">R<sub>y</sub> [kN] (+↑)</th><th class="r">M [kNm] (+↺)</th></tr>`;
    for (const n of r.supNodes) {
      const rr = view.reac.get(n), f = r.nodes[n].sup.f;
      tr += `<tr class="click" data-act="selNode" data-v="${r.nodes[n].uid}"><td><b>${r.nodes[n].no}</b></td>` + [0, 1, 2].map(i => `<td class="r">${(f[i] || (i < 2 && r.nodes[n].sup.ang && (f[0] || f[1]))) ? two(rr.g, i, fk) : '<span class="mut">–</span>'}</td>`).join('') + '</tr>';
      if (r.nodes[n].sup.ang) tr += `<tr><td class="mut">  ∠${fmt(r.nodes[n].sup.ang, 1)}°</td><td class="r mut" colspan="3">w układzie podpory: R<sub>x′</sub> = ${two(rr.loc, 0, fk)}, R<sub>y′</sub> = ${two(rr.loc, 1, fk)}</td></tr>`;
    }
    tr += '</table></div>';
    if (env) tr += '<div class="hint">Wartości: max / min z obwiedni.</div>';
    if (!env) {
      const a = view.sumL, b = view.sumR;
      const okq = Math.abs(a[0] + b[0]) < 1e-6 * Math.max(1, Math.abs(a[0])) && Math.abs(a[1] + b[1]) < 1e-6 * Math.max(1, Math.abs(a[1])) && Math.abs(a[2] + b[2]) < 1e-5 * Math.max(1, Math.abs(a[2]));
      tr += `<div class="${okq ? 'okbox' : 'warnbox'}">Równowaga: ΣF<sub>x</sub>: ${fk(a[0])} + ${fk(b[0])} = ${fmt(a[0] + b[0], 4)} kN; ΣF<sub>y</sub>: ${fk(a[1])} + ${fk(b[1])} = ${fmt(a[1] + b[1], 4)} kN; ΣM<sub>0</sub> = ${fmt(a[2] + b[2], 4)} kNm ${okq ? '✓' : ''}</div>`;
    }
    h += card('rreac', 'Reakcje podporowe', true, tr, r.supNodes.length);

    // ekstrema w prętach
    let te = `<div class="tw"><table class="t"><tr><th>Pręt</th><th class="r">N<sub>max</sub></th><th class="r">N<sub>min</sub></th><th class="r">|T|<sub>max</sub></th><th class="r">M<sub>max</sub></th><th class="r">M<sub>min</sub></th><th class="r">f [mm]</th></tr>`;
    const smem = new Set(U.sel.kind === 'member' ? U.sel.ids : []);
    r.mem.forEach((mm, mi) => {
      const o = view.mem[mi];
      const mx = (a) => Math.max(...a), mn = (a) => Math.min(...a);
      const Vabs = Math.max(Math.abs(mx(o.V.max)), Math.abs(mn(o.V.min)));
      const fr = Math.max(Math.abs(mx(o.fr.max)), Math.abs(mn(o.fr.min)));
      te += `<tr class="click${smem.has(mm.uid) ? ' sel' : ''}" data-act="selMem" data-v="${mm.uid}"><td><b>${mm.no}</b></td><td class="r">${fk(mx(o.N.max))}</td><td class="r">${fk(mn(o.N.min))}</td><td class="r">${fk(Vabs)}</td><td class="r">${fk(mx(o.M.max))}</td><td class="r">${fk(mn(o.M.min))}</td><td class="r" title="ugięcie względem cięciwy pręta">${fmm(fr)}${fr > 1e-9 ? ' <span class="mut">L/' + Math.round(mm.L / fr) + '</span>' : ''}</td></tr>`;
    });
    te += '</table></div><div class="hint">N [kN] (+ rozciąganie), T [kN], M [kNm] (+ rozciąga spody), f – ugięcie względem cięciwy (linii łączącej przemieszczone końce). Kliknij wiersz – szczegóły w panelu po prawej.</div>';
    h += card('rext', 'Siły wewnętrzne – ekstrema w prętach', true, te, r.mem.length);

    // przemieszczenia węzłów
    let td = `<div class="tw"><table class="t"><tr><th>Węzeł</th><th class="r">u<sub>x</sub> [mm]</th><th class="r">u<sub>y</sub> [mm]</th><th class="r">φ [mrad] (+↺)</th></tr>`;
    r.nodes.forEach((n, i) => {
      td += `<tr class="click" data-act="selNode" data-v="${n.uid}"><td><b>${n.no}</b></td><td class="r">${two(view.dg, 3 * i, fmm)}</td><td class="r">${two(view.dg, 3 * i + 1, fmm)}</td><td class="r">${r.kind[3 * i + 2] === 3 ? '<span class="mut">przegub</span>' : two(view.dg, 3 * i + 2, fmr)}</td></tr>`;
    });
    td += '</table></div>';
    h += card('rdisp', 'Przemieszczenia węzłów', false, td, r.nodes.length);

    // szerokość podpór
    if (r.supw.length) {
      let tw = `<div class="tw"><table class="t"><tr><th>Węzeł</th><th>Pręt</th><th class="r">M oś</th><th class="r">ΔM</th><th class="r">M zred.</th><th class="r">M lico</th><th class="r">T lico</th></tr>`;
      r.supw.forEach((it, i) => {
        const a = view.supw[i];
        tw += `<tr><td>${r.nodes[it.n].no} <span class="mut">b=${fmt(it.b, 2)}</span></td><td>${r.mem[it.mi].no} ${it.start ? '(pocz.)' : '(kon.)'}</td>` + [0, 1, 2, 3, 4].map(k => `<td class="r">${(k === 1 || k === 2) && !it.round ? '<span class="mut">–</span>' : two(a, k, fk)}</td>`).join('') + '</tr>';
      });
      tw += '</table></div><div class="hint">M w osi podpory, redukcja ΔM = R·b/8 i M zredukowany (tylko podpory pośrednie belek ciągłych, gdy włączone zaokrąglanie); M i T w licu podpory (x = b/2 od osi) – miarodajne dla połączeń monolitycznych (5.3.2.2(3)).</div>';
      h += card('rsupw', 'Podpory o szerokości b', true, tw, r.supw.length);
    }
    return h;
  }

  // ------------------------------------------------------------------ panel właściwości
  function renderProps() {
    const p = $('#props');
    let h = '';
    try { h = propsHtml(); } catch (e) { console.error(e); h = '<div class="errbox">' + esc(e.message) + '</div>'; }
    p.innerHTML = h;
  }
  function propsHtml() {
    const s = U.sel, m = U.model;
    if (!s.kind) {
      const r = U.res;
      let h = '<h3>Właściwości</h3><div class="hint">Zaznacz węzeł, pręt lub obciążenie na schemacie albo w tabeli, aby edytować jego dane i zobaczyć wyniki.</div>';
      h += '<h4>Model</h4><div class="kv"><span>Węzły</span><span>' + m.nodes.length + '</span><span>Pręty</span><span>' + m.members.length + '</span><span>Podpory</span><span>' + m.nodes.filter(n => n.sup).length + '</span><span>Przypadki</span><span>' + m.cases.length + '</span></div>';
      if (r && r.ok) {
        // stopień statycznej niewyznaczalności (orientacyjnie)
        const nr = r.nodes.reduce((a, n) => a + (n.sup ? n.sup.f.filter(v => v === 1 || v === 2).length : 0), 0);
        const rel = r.mem.reduce((a, x) => a + x.rel.length, 0);
        const autoR = r.kind.filter(v => v === 3).length;
        const ns = 3 * r.mem.length + nr - 3 * r.nodes.length - rel + autoR;
        h += '<div class="kv" style="margin-top:4px"><span title="n = 3p + r − 3w − z (z – zwolnienia)">Stopień statycznej niewyznaczalności</span><span><b>' + ns + '</b></span></div>';
        h += '<div class="hint" style="margin-top:2px">' + (ns === 0 ? 'Układ statycznie wyznaczalny.' : ns > 0 ? 'Układ ' + ns + '-krotnie statycznie niewyznaczalny.' : '') + '</div>';
      }
      h += '<h4>Skróty</h4><div class="hint">V – zaznacz · W – węzeł · P – pręt · S – podpora · H – przegub · O – obciążenie · K – przekrój<br>1 schemat · 2 obciążenia · 3 przekroje · 4–8 wyniki (M, T, N, deformacja, reakcje)<br>L – zestawienie obciążeń · F – dopasuj · Del – usuń · Esc – anuluj<br>Ctrl+Z / Ctrl+Y – cofnij / ponów · Ctrl+S – zapisz</div>';
      return h;
    }
    if (s.kind === 'node' && s.ids.length === 1) return propsNode(nodeBy(s.ids[0]));
    if (s.kind === 'member' && s.ids.length === 1) return propsMember(memBy(s.ids[0]));
    if (s.kind === 'load' && s.ids.length === 1) return propsLoad(s.ids[0]);
    // wiele
    let h = '<h3>Zaznaczono: ' + s.ids.length + ' ' + (s.kind === 'node' ? 'węzłów' : s.kind === 'member' ? 'prętów' : 'obciążeń') + '</h3>';
    if (s.kind === 'member') {
      const secsIn = [...new Set(s.ids.map(u => (memBy(u) || {}).sec))];
      h += '<div class="hint">Pręty: ' + compactList(s.ids.map(memNo)) + '<br>Przekroje: ' + secsIn.map(u => esc(secName(u))).join(', ') + '</div>';
      h += '<div class="f"><label>Przekrój</label><select id="bulkSec"><option value="">— przypisz —</option>' + m.secs.map(x => `<option value="${x.uid}">${esc(x.name)}</option>`).join('') + '</select></div>';
      h += '<div class="btns"><button data-act="sepSecSel" title="Kopia przekroju wspólna tylko dla zaznaczonych prętów">Wspólny osobny przekrój</button><button data-act="openSecWin">Menedżer…</button></div>';
      h += '<div class="btns"><button data-act="bulkRel" data-v="1">Przeguby na końcach</button><button data-act="bulkRel" data-v="0">Bez przegubów</button></div>';
      h += '<div class="btns"><button data-act="tab" data-v="loads">Dodaj obciążenie do zaznaczonych…</button></div>';
    }
    if (s.kind === 'node') h += '<div class="btns"><button data-act="tool" data-v="support">Podpora…</button><button data-act="bulkHinge">Przełącz przegub</button></div>';
    h += '<div class="btns"><button class="dang" data-act="delSel">Usuń zaznaczone</button></div>';
    return h;
  }
  function propsNode(n) {
    if (!n) return '';
    const no = nodeNo(n.uid), m = U.model;
    let h = `<h3>Węzeł ${no}</h3><div class="f"><label>x</label><div class="inl">${inpN('node.' + n.uid + '.x', n.x)}<span class="u">m</span></div><label>y</label><div class="inl">${inpN('node.' + n.uid + '.y', n.y)}<span class="u">m</span></div>
      <label></label>${chk('node.' + n.uid + '.hinge', n.hinge, 'węzeł przegubowy (wszystkie pręty)')}</div>`;
    const conn = m.members.filter(x => x.i === n.uid || x.j === n.uid).map(x => memNo(x.uid));
    h += '<div class="hint">Pręty w węźle: ' + (conn.join(', ') || 'brak') + '</div>';
    h += '<h4>Podpora</h4>';
    if (!n.sup) {
      h += '<div class="f"><label>Typ</label><select data-act-change="addSup" data-v="' + n.uid + '"><option value="">— brak —</option>' + Object.entries(E.SUP_PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.n)}</option>`).join('') + '</select></div>';
    } else {
      const sp = n.sup, ns = E.normSup(sp);
      h += `<div class="f"><label>Typ</label>${sel('sup.' + n.uid + '.type', sp.type || 'custom', Object.entries(E.SUP_PRESETS).map(([k, v]) => [k, v.n]))}`;
      const opts = [[0, 'swobodny'], [1, 'zablokowany'], [2, 'sprężysty']];
      const nm = [['rx', 'kx', 'Kierunek x′', 'kN/m'], ['ry', 'ky', 'Kierunek y′', 'kN/m'], ['rz', 'kz', 'Obrót φ', 'kNm/rad']];
      nm.forEach(([r, k, lab, u], i) => {
        const v = sp.type && sp.type !== 'custom' && E.SUP_PRESETS[sp.type] ? E.SUP_PRESETS[sp.type].f[i] : (sp[r] | 0);
        h += `<label>${lab}</label><div class="inl">${sel('sup.' + n.uid + '.' + r, v, opts, 'int')}${v === 2 ? inpN('sup.' + n.uid + '.' + k, sp[k] || 0) + '<span class="u">' + u + '</span>' : ''}</div>`;
      });
      h += `<label>Obrót podpory</label><div class="inl">${inpN('sup.' + n.uid + '.ang', sp.ang || 0)}<span class="u">° (x′ względem X)</span></div>`;
      h += `<label>Szerokość b</label><div class="inl">${inpN('sup.' + n.uid + '.b', sp.b || 0)}<span class="u">m</span></div></div>`;
      if (ns.f.some(v => v === 2)) h += '<div class="hint">Podatność = 1/k. Np. słup pod belką: k = EA/h (pionowo), utwierdzenie sprężyste: k = 4EI/h.</div>';
      h += '<div class="btns"><button class="dang" data-act="delSup" data-v="' + n.uid + '">Usuń podporę</button></div>';
    }
    // obciążenia w węźle
    const c = caseBy(U.activeCase);
    if (c) {
      const ls = c.loads.filter(l => l.node === n.uid);
      h += `<h4>Obciążenia węzłowe – ${esc(caseCode(c))}</h4>`;
      h += ls.map(l => `<div class="inl" style="display:flex;justify-content:space-between"><button class="lnk" data-act="selLoad" data-v="${l.uid}">${LT[l.type]}: ${esc(loadSummary(l))}</button><button class="x" data-act="delLoad" data-v="${l.uid}">✕</button></div>`).join('') || '<div class="hint">brak</div>';
      h += `<div class="btns"><button data-act="quickNodeLoad" data-v="${n.uid}" data-t="P">+ Siła / moment</button>${n.sup ? `<button data-act="quickNodeLoad" data-v="${n.uid}" data-t="S">+ Przemieszczenie wymuszone</button>` : ''}</div>`;
    }
    // wyniki
    const view = curView(), i = resNodeIdx(n.uid);
    if (view && i >= 0) {
      const r = U.res, env = view.env;
      const two = (a, k, f) => env ? f(a.max[k]) + ' / ' + f(a.min[k]) : f(a.max[k]);
      h += '<h4>Wyniki – ' + esc(shortView()) + '</h4><div class="kv">';
      h += `<span>u<sub>x</sub> [mm]</span><span>${two(view.dg, 3 * i, fmm)}</span><span>u<sub>y</sub> [mm]</span><span>${two(view.dg, 3 * i + 1, fmm)}</span>`;
      if (r.kind[3 * i + 2] !== 3) h += `<span>φ [mrad] (+↺)</span><span>${two(view.dg, 3 * i + 2, fmr)}</span>`;
      const rr = view.reac.get(i);
      if (rr) {
        h += `<span>R<sub>x</sub> [kN] (+→)</span><span>${two(rr.g, 0, fk)}</span><span>R<sub>y</sub> [kN] (+↑)</span><span>${two(rr.g, 1, fk)}</span><span>M [kNm] (+↺)</span><span>${two(rr.g, 2, fk)}</span>`;
      }
      h += '</div>';
      if (rr && env) {
        for (const [k, nmx] of [[1, 'R_y'], [0, 'R_x'], [2, 'M']]) {
          if (!r.nodes[i].sup.f[k]) continue;
          const vec = E.vecReac(r, i, k, false);
          h += '<div class="dec"><b>' + nmx + ' max:</b> ' + esc(E.describe(r, E.decisive(U.model, r, U.viewKey, vec, 1))) + '<br><b>' + nmx + ' min:</b> ' + esc(E.describe(r, E.decisive(U.model, r, U.viewKey, vec, -1))) + '</div>';
        }
      }
    }
    h += '<div class="btns"><button class="dang" data-act="delNode" data-v="' + n.uid + '">Usuń węzeł</button></div>';
    return h;
  }
  function shortView() { const v = E.availableViews(U.model, U.res).find(x => x.key === U.viewKey); return v ? v.label : ''; }
  function propsMember(x) {
    if (!x) return '';
    const m = U.model, a = nodeBy(x.i), b = nodeBy(x.j);
    const L = M.memLen(m, x), ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const sp = E.secProps(m.secs.find(s => s.uid === x.sec));
    let h = `<h3>Pręt ${memNo(x.uid)}</h3><div class="kv"><span>Węzły</span><span>${nodeNo(x.i)} → ${nodeNo(x.j)}</span><span>Długość L</span><span>${fmt(L, 3)} m</span><span>Kąt α</span><span>${fmt(ang, 2)}°</span>${sp ? `<span>A / I</span><span>${fmt(sp.A * 1e4, 2)} cm² / ${fmt(sp.I * 1e8, 0)} cm⁴</span>` : ''}</div>`;
    h += `<div class="f"><label>Przeguby</label><div>${chk('mem.' + x.uid + '.ri', x.ri, 'początek')} ${chk('mem.' + x.uid + '.rj', x.rj, 'koniec')}</div></div>`;
    h += `<div class="btns"><button data-act="revMem" data-v="${x.uid}" title="Zamienia początek z końcem – zmienia stronę spodów">⇄ Odwróć</button><button data-act="delMem" data-v="${x.uid}" class="dang">Usuń</button></div>`;
    // przekrój pręta
    const scO = m.secs.find(q => q.uid === x.sec);
    const shared = m.members.filter(q => q.sec === x.sec && q.uid !== x.uid).map(q => memNo(q.uid));
    h += `<h4>Przekrój pręta</h4><div class="f"><label>Przekrój</label><div class="inl"><i class="sw" style="background:${D.secColor(m, x.sec)}"></i>${secSelect('mem.' + x.uid + '.sec', x.sec)}</div></div>`;
    if (shared.length) h += `<div class="hint">Przekrój wspólny z prętami: <b>${compactList(shared)}</b> – zmiana wymiarów dotyczy wszystkich.</div>`;
    h += `<div class="btns">${shared.length ? `<button data-act="sepSec" data-v="${x.uid}" title="Kopia przekroju tylko dla tego pręta">Osobny przekrój dla pręta</button>` : ''}<button data-act="newSecFor" data-v="${x.uid}">+ Nowy</button><button data-act="openSecWin">Menedżer…</button></div>`;
    if (scO) h += secCard(scO, true);
    h += `<h4>Podział pręta</h4><div class="f"><label>Na części</label><div class="inl">${inpN('ui.split.n', U.form.split.n, '', 'style="width:50px"')}<button data-act="splitN" data-v="${x.uid}">Podziel</button></div>
      <label>W punkcie x</label><div class="inl">${inpN('ui.split.t', U.form.split.t, '', 'style="width:60px"')}<span class="u">m</span><button data-act="splitAt" data-v="${x.uid}">Wstaw węzeł</button></div></div>`;
    const c = caseBy(U.activeCase);
    if (c) {
      const ls = c.loads.filter(l => l.m === x.uid);
      h += `<h4>Obciążenia – ${esc(caseCode(c))}${c.selfWeight ? ' (+ ciężar własny)' : ''}</h4>`;
      h += ls.map(l => `<div style="display:flex;justify-content:space-between;align-items:center"><button class="lnk" style="text-align:left" data-act="selLoad" data-v="${l.uid}">${LT[l.type]}: ${esc(loadSummary(l))}</button><button class="x" data-act="delLoad" data-v="${l.uid}">✕</button></div>`).join('') || '<div class="hint">brak</div>';
      h += `<div class="btns"><button data-act="addLoadTo" data-v="${x.uid}">+ Dodaj „${esc(loadSummary(formToLoad()).slice(0, 34))}…”</button></div>`;
    }
    // wyniki
    const view = curView(), mi = resMemIdx(x.uid), r = U.res;
    if (view && mi >= 0) {
      const mm = r.mem[mi], o = view.mem[mi], env = view.env;
      h += '<h4>Wyniki – ' + esc(shortView()) + '</h4>';
      const ext = (q, kk, sense) => { const arr = o[q][kk]; let bi = 0; for (let i = 0; i < arr.length; i++) if (sense * arr[i] > sense * arr[bi]) bi = i; return { v: arr[bi], i: bi, x: mm.xs[bi] }; };
      const rows = [['N', 'N', 'kN'], ['V', 'T', 'kN'], ['M', 'M', 'kNm']];
      h += '<table class="t"><tr><th></th><th class="r">max</th><th class="r">x [m]</th><th class="r">min</th><th class="r">x [m]</th></tr>';
      const decs = [];
      for (const [q, nmq, u] of rows) {
        let a = ext(q, 'max', 1), b = ext(q, 'min', -1);
        if (!env && q === 'M') {
          const k = U.viewKey.startsWith('case:') ? +U.viewKey.slice(5) : -1;
          if (k >= 0) { const ex = E.caseMemberExtremes(r, k, mi); if (ex.Mmax.v > a.v) a = { v: ex.Mmax.v, x: ex.Mmax.x, i: a.i }; if (ex.Mmin.v < b.v) b = { v: ex.Mmin.v, x: ex.Mmin.x, i: b.i }; }
        }
        h += `<tr><td><b>${nmq}</b> <span class="mut">[${u}]</span></td><td class="r">${fk(a.v)}</td><td class="r mut">${fmt(a.x, 2)}</td><td class="r">${fk(b.v)}</td><td class="r mut">${fmt(b.x, 2)}</td></tr>`;
        if (env) decs.push([nmq, a, b, q]);
      }
      const frMax = ext('fr', 'max', 1), frMin = ext('fr', 'min', -1);
      h += `<tr><td><b>f</b> <span class="mut">[mm]</span></td><td class="r">${fmm(frMax.v)}</td><td class="r mut">${fmt(frMax.x, 2)}</td><td class="r">${fmm(frMin.v)}</td><td class="r mut">${fmt(frMin.x, 2)}</td></tr></table>`;
      const fa = Math.max(Math.abs(frMax.v), Math.abs(frMin.v));
      h += '<div class="hint">f – ugięcie względem cięciwy' + (fa > 1e-9 ? ': L/f = ' + Math.round(mm.L / fa) : '') + '. Przy końcach i nad podporami wartości z uwzględnieniem szerokości podpór (jeśli włączone).</div>';
      if (env) {
        h += '<div style="margin-top:6px">';
        for (const [nmq, a, b, q] of decs) {
          const da = E.decisive(U.model, r, U.viewKey, E.vecMember(r, mi, q, a.i), 1), db = E.decisive(U.model, r, U.viewKey, E.vecMember(r, mi, q, b.i), -1);
          h += `<div class="dec"><b>${nmq} max</b> = ${fk(a.v)}: ${esc(E.describe(r, da))}<br><b>${nmq} min</b> = ${fk(b.v)}: ${esc(E.describe(r, db))}</div>`;
        }
        h += '</div>';
      }
      // tabela w punktach
      h += '<h4>Siły w punktach pręta</h4><div class="tw" style="max-height:260px"><table class="t"><tr><th class="r">x [m]</th><th class="r">N</th><th class="r">T</th><th class="r">M</th><th class="r">v [mm]</th></tr>';
      const want = []; for (let k = 0; k <= 10; k++) want.push(mm.L * k / 10);
      const idx = new Set();
      for (const w of want) { let bi = 0; for (let i = 0; i < mm.xs.length; i++) if (Math.abs(mm.xs[i] - w) < Math.abs(mm.xs[bi] - w)) bi = i; idx.add(bi); }
      for (let i = 1; i < mm.xs.length; i++) if (Math.abs(mm.xs[i] - mm.xs[i - 1]) < 1e-9) { idx.add(i - 1); idx.add(i); }
      for (const i of [...idx].sort((p, q) => p - q)) {
        const cell = (q, f) => env ? f(o[q].max[i]) + '<br>' + f(o[q].min[i]) : f(o[q].max[i]);
        h += `<tr><td class="r">${fmt(mm.xs[i], 3)}${mm.side[i] ? (mm.side[i] < 0 ? '⁻' : '⁺') : ''}</td><td class="r">${cell('N', fk)}</td><td class="r">${cell('V', fk)}</td><td class="r">${cell('M', fk)}</td><td class="r">${cell('v', fmm)}</td></tr>`;
      }
      h += '</table></div><div class="hint">v – przemieszczenie prostopadłe do osi pręta (+ w stronę przeciwną do spodów).</div>';
    }
    return h;
  }
  function propsLoad(uid) {
    const f = findLoad(uid); if (!f) return '';
    const l = f.l, c = f.c;
    let h = `<h3>${LT[l.type]}</h3><div class="kv"><span>Przypadek</span><span>${esc(caseCode(c) + ' – ' + c.name)}</span><span>${isNodeLoad(l.type) ? 'Węzeł' : 'Pręt'}</span><span>${isNodeLoad(l.type) ? nodeNo(l.node) : memNo(l.m)}</span></div>`;
    h += loadFields('load.' + uid, l, false);
    h += `<div class="btns"><button data-act="dupLoadTo" data-v="${uid}">Kopiuj do przypadku…</button><button class="dang" data-act="delLoad" data-v="${uid}">Usuń</button></div>`;
    return h;
  }

  // ------------------------------------------------------------------ okna pływające (zestawienie obciążeń, przekroje prętów)
  const winEl = $('#win');
  const WIN_TITLE = { loads: 'Zestawienie obciążeń', secs: 'Przekroje prętów' };
  function openWin(kind) {
    U.win = kind; U._winApplied = null;
    renderWin();
  }
  function closeWin() { U.win = null; renderWin(); }
  function applyWinGeom() {
    const cw = wrap.getBoundingClientRect();
    let g = U.winGeom[U.win];
    if (!g) {
      const w = Math.min(U.win === 'loads' ? 1040 : 1000, window.innerWidth - 40), h = Math.max(280, Math.min(Math.round(cw.height * 0.48), window.innerHeight - 160));
      g = { l: Math.max(10, Math.min(cw.left + (cw.width - w) / 2, window.innerWidth - w - 10)), t: Math.max(56, cw.top + cw.height - h + 18), w, h };
    }
    g.l = Math.min(Math.max(0, g.l), window.innerWidth - 120); g.t = Math.min(Math.max(46, g.t), window.innerHeight - 60);
    Object.assign(winEl.style, { left: g.l + 'px', top: g.t + 'px', width: g.w + 'px', height: g.h + 'px' });
    U._winApplied = U.win;
  }
  function renderWin() {
    if (!U.win) { winEl.hidden = true; return; }
    winEl.hidden = false;
    if (U._winApplied !== U.win) applyWinGeom();
    $('#winTitle').textContent = WIN_TITLE[U.win] || '';
    const body = $('#winBody'), st = body.scrollTop, sl = body.scrollLeft;
    let h = '';
    try { h = U.win === 'loads' ? winLoadsHtml() : winSecsHtml(); } catch (e) { console.error(e); h = '<div class="errbox">' + esc(e.message) + '</div>'; }
    body.innerHTML = h;
    body.scrollTop = st; body.scrollLeft = sl;
  }
  (function winDrag() {
    const head = $('#win .wh');
    let d = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input, select')) return;
      const r = winEl.getBoundingClientRect();
      d = { sx: e.clientX, sy: e.clientY, l: r.left, t: r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!d) return;
      const l = Math.min(Math.max(0, d.l + e.clientX - d.sx), window.innerWidth - 120), t = Math.min(Math.max(46, d.t + e.clientY - d.sy), window.innerHeight - 40);
      winEl.style.left = l + 'px'; winEl.style.top = t + 'px';
    });
    const end = () => { if (!d) return; d = null; saveWinGeom(); };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
    new ResizeObserver(() => { if (U.win && !winEl.hidden) saveWinGeom(); }).observe(winEl);
  })();
  function saveWinGeom() {
    if (!U.win) return;
    const r = winEl.getBoundingClientRect();
    if (r.width < 50) return;
    U.winGeom[U.win] = { l: r.left, t: r.top, w: r.width, h: r.height };
  }

  // --- zestawienie obciążeń
  const DIR_SHORT = { Y: '↓ pion.', X: '→ poz.', n: '⊥ prostop.', t: '∥ wzdłuż' };
  const DIR_OPTS = [['Y', '↓ pionowe'], ['X', '→ poziome'], ['n', '⊥ prostopadłe'], ['t', '∥ wzdłuż pręta']];
  const MODE_SHORT = [['abs', 'od pocz. [m]'], ['end', 'od końca [m]'], ['rel', 'x/L']];
  function loadResultant(l) {
    if (l.type === 'q') {
      const mem = memBy(l.m); if (!mem) return null;
      const a0 = nodeBy(mem.i), b0 = nodeBy(mem.j), L = M.memLen(U.model, mem);
      let x1 = 0, x2 = L;
      if (!l.full) { x1 = E.posAbs(l.x1, l.mode, L); x2 = E.posAbs(l.x2, l.mode, L); }
      let q1 = +l.q1 || 0, q2 = l.q2 === undefined || l.q2 === null || l.q2 === '' ? q1 : (+l.q2 || 0);
      if (x1 > x2) { [x1, x2] = [x2, x1]; [q1, q2] = [q2, q1]; }
      const A = Math.max(0, x1), B = Math.min(L, x2); if (B <= A) return 0;
      const qa = x2 > x1 ? q1 + (q2 - q1) * (A - x1) / (x2 - x1) : q1, qb = x2 > x1 ? q1 + (q2 - q1) * (B - x1) / (x2 - x1) : q2;
      const mul = l.unit === 'm2' ? (+l.bw || 1) : 1;
      let f = 1;
      if (l.proj && (l.dir === 'Y' || !l.dir)) f = Math.abs(b0.x - a0.x) / L;
      if (l.proj && l.dir === 'X') f = Math.abs(b0.y - a0.y) / L;
      return (qa + qb) / 2 * (B - A) * mul * f;
    }
    if (l.type === 'F') return +l.F || 0;
    if (l.type === 'P') return Math.hypot(+l.Fx || 0, +l.Fy || 0);
    return null;
  }
  function selfWeightTotal() {
    let W = 0;
    for (const mem of U.model.members) {
      const sc = U.model.secs.find(x => x.uid === mem.sec), p = E.secProps(sc), mat = sc && U.model.mats.find(x => x.uid === sc.mat);
      if (p && mat) W += p.A * (+mat.g || 0) * M.memLen(U.model, mem);
    }
    return W;
  }
  function caseSums(cuid) {
    const r = U.res; if (!r || !r.ok) return null;
    const k = r.cases.findIndex(c => c.uid === cuid); if (k < 0) return null;
    return r.cr[k].sumLoad;
  }
  function filteredLoads(c) {
    const f = U.form.lw;
    let ls = c.loads;
    if (f.type) ls = ls.filter(l => l.type === f.type);
    if (f.onlySel) {
      const ids = new Set(U.sel.kind === 'member' || U.sel.kind === 'node' ? U.sel.ids : []);
      ls = ls.filter(l => ids.has(isNodeLoad(l.type) ? l.node : l.m));
    }
    return ls;
  }
  function caseInfo(c) {
    let t = { G: 'stałe', Q: 'zmienne', A: 'wyjątkowe' }[c.type || 'G'];
    if (c.type === 'Q') { const ps = E.psiOf(c); t += ' · ' + (c.cat || 'B') + ' · ψ₀=' + fmt(ps[0], 2); const g = U.model.groups.find(x => x.uid === c.grp); if (g) t += ' · grupa „' + esc(g.name) + '”'; }
    return t;
  }
  function winLoadsHtml() {
    const m = U.model, f = U.form.lw;
    const cases = m.cases.filter(c => !f.cs || c.uid === f.cs);
    const nAll = m.cases.reduce((a, c) => a + c.loads.length, 0);
    let h = `<div class="wtool"><label class="mini">Przypadek <select data-b="ui.lw.cs" data-t="int"><option value="">wszystkie (${m.cases.length})</option>${m.cases.map(c => `<option value="${c.uid}"${f.cs === c.uid ? ' selected' : ''}>${caseCode(c)} – ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="mini">Rodzaj <select data-b="ui.lw.type"><option value="">wszystkie</option>${Object.entries(LT).map(([k, v]) => `<option value="${k}"${f.type === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-b="ui.lw.onlySel"${f.onlySel ? ' checked' : ''}> tylko zaznaczone elementy</label>
      <span class="sp"></span><button data-act="lwView" title="Widok wszystkich obciążeń na schemacie">Pokaż na schemacie</button><button data-act="lwCopy" title="Kopiuje tabelę do schowka (wklej w Excelu)">Kopiuj do Excela</button></div>`;
    h += `<div class="hint" style="margin:-2px 0 6px">Obciążeń: <b>${nAll}</b> w ${m.cases.length} przypadkach. Wartości można edytować bezpośrednio w tabeli (liczby, wyrażenia, np. 0,72*6). Kliknij wiersz – obciążenie zostanie zaznaczone na schemacie.</div>`;
    h += '<table class="t lw"><tr><th>Nr</th><th>Element</th><th>Rodzaj</th><th>Kierunek</th><th>Wartości</th><th>Położenie</th><th class="r">Wypadkowa</th><th></th></tr>';
    const selL = new Set(U.sel.kind === 'load' ? U.sel.ids : []);
    let any = false;
    for (const c of cases) {
      const ls = filteredLoads(c);
      const showSW = c.selfWeight && !f.type && !f.onlySel;
      if ((f.type || f.onlySel) && !ls.length) continue;
      any = true;
      const sm = caseSums(c.uid);
      const sums = sm ? `ΣF<sub>x</sub> = ${fmt(sm[0])} kN (→), ΣF<sub>y</sub> = ${fmt(-sm[1])} kN (↓)` : '';
      h += `<tr class="grp"><td colspan="8"><i class="sw" style="background:${D.caseColor(m, c.uid)}"></i><span class="tag ${c.type || 'G'}">${caseCode(c)}</span> <b>${esc(c.name)}</b> <span class="mut">· ${caseInfo(c)} · obciążeń: ${c.loads.length}${c.selfWeight ? ' + c.w.' : ''}</span><span style="float:right">${sums} <button class="lnk" data-act="lwCase" data-v="${c.uid}" title="Ustaw jako aktywny przypadek">aktywny</button></span></td></tr>`;
      if (showSW) h += `<tr class="swr"><td></td><td>wszystkie pręty</td><td>Ciężar własny</td><td>↓ pion.</td><td>A·γ (automatycznie)</td><td>cała długość</td><td class="r">${fmt(selfWeightTotal())} kN</td><td></td></tr>`;
      if (!ls.length && !showSW) h += '<tr><td></td><td colspan="7" class="mut">brak obciążeń</td></tr>';
      ls.forEach((l, i) => {
        const k = 'load.' + l.uid + '.';
        const nI = (fld, v, w) => `<input class="n" data-b="${k}${fld}" data-t="num" value="${esc(v2s(v))}"${w ? ` style="width:${w}px"` : ''}>`;
        let dir = '—', val = '', pos = '—';
        switch (l.type) {
          case 'q':
            dir = `<select data-b="${k}dir" style="max-width:104px">${DIR_OPTS.map(([v, t]) => `<option value="${v}"${(l.dir || 'Y') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` +
              ((l.dir || 'Y') === 'Y' || l.dir === 'X' ? `<br><label class="chk"><input type="checkbox" data-b="${k}proj"${l.proj ? ' checked' : ''}> na rzut</label>` : '');
            val = 'q₁ ' + nI('q1', l.q1) + ' q₂ ' + `<input class="n" data-b="${k}q2" data-t="numo" value="${esc(v2s(l.q2 === l.q1 ? '' : l.q2))}" placeholder="= q₁">` +
              (l.unit === 'm2' ? ' kN/m² × ' + nI('bw', l.bw, 44) + ' m' : ' kN/m');
            pos = `<label class="chk"><input type="checkbox" data-b="${k}full"${l.full ? ' checked' : ''}> cała długość</label>` +
              (l.full ? '' : `<br>${nI('x1', l.x1, 48)} – ${nI('x2', l.x2, 48)} <select data-b="${k}mode" style="max-width:96px">${MODE_SHORT.map(([v, t]) => `<option value="${v}"${(l.mode || 'abs') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`);
            break;
          case 'F': case 'Mm':
            if (l.type === 'F') { dir = `<select data-b="${k}dir" style="max-width:104px">${DIR_OPTS.map(([v, t]) => `<option value="${v}"${(l.dir || 'Y') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`; val = 'F ' + nI('F', l.F) + ' kN'; }
            else { dir = '↻ +'; val = 'M ' + nI('M', l.M) + ' kNm'; }
            pos = 'x ' + nI('x', l.x, 52) + ` <select data-b="${k}mode" style="max-width:96px">${MODE_SHORT.map(([v, t]) => `<option value="${v}"${(l.mode || 'abs') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
            break;
          case 'P': val = 'F<sub>x</sub> ' + nI('Fx', l.Fx) + ' F<sub>y</sub> ' + nI('Fy', l.Fy) + ' M ' + nI('M', l.M); dir = '→ +, ↓ +'; pos = 'w węźle'; break;
          case 'T': val = 'ΔT ' + nI('dT', l.dT) + ' ΔT<sub>d−g</sub> ' + nI('dTg', l.dTg) + ' K'; pos = 'cały pręt'; break;
          case 'S': val = 'Δx ' + nI('ux', l.ux, 50) + ' Δy ' + nI('uy', l.uy, 50) + ' mm, φ ' + nI('rz', l.rz, 50) + ' mrad'; pos = 'podpora'; break;
        }
        const W = loadResultant(l);
        const where = isNodeLoad(l.type) ? 'węzeł ' + nodeNo(l.node) : 'pręt ' + memNo(l.m);
        h += `<tr class="click${selL.has(l.uid) ? ' sel' : ''}" data-act="selLoad" data-v="${l.uid}"><td class="mut">${i + 1}</td><td>${where}</td><td>${LT[l.type]}</td><td>${dir}</td><td>${val}</td><td>${pos}</td><td class="r">${W === null ? '<span class="mut">—</span>' : fmt(W) + ' kN'}</td>
          <td><button class="x" data-act="dupLoadTo" data-v="${l.uid}" title="Kopiuj do innego przypadku">⧉</button><button class="x" data-act="delLoad" data-v="${l.uid}" title="Usuń">✕</button></td></tr>`;
      });
    }
    if (!any) h += '<tr><td colspan="8" class="mut">Brak obciążeń spełniających filtr.</td></tr>';
    h += '</table>';
    if (U.res && U.res.ok && !f.type && !f.onlySel && cases.length > 1) {
      h += '<div class="sub">Sumy obciążeń w przypadkach (z ciężarem własnym)</div><table class="t" style="max-width:560px"><tr><th>Przypadek</th><th class="r">ΣF<sub>x</sub> [kN] (→)</th><th class="r">ΣF<sub>y</sub> [kN] (↓)</th><th class="r">ΣM<sub>0</sub> [kNm] (↺)</th></tr>' +
        cases.map(c => { const sm = caseSums(c.uid) || [0, 0, 0]; return `<tr><td><i class="sw" style="background:${D.caseColor(m, c.uid)}"></i>${caseCode(c)} – ${esc(c.name)}</td><td class="r">${fmt(sm[0])}</td><td class="r">${fmt(-sm[1])}</td><td class="r">${fmt(sm[2])}</td></tr>`; }).join('') + '</table>';
    }
    return h;
  }
  function loadsTSV() {
    const m = U.model, rows = [['Przypadek', 'Nazwa przypadku', 'Rodzaj przypadku', 'Element', 'Obciążenie', 'Opis', 'Wypadkowa [kN]']];
    const f = U.form.lw;
    const n2 = (v) => v === null || v === undefined ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',');
    for (const c of m.cases.filter(c => !f.cs || c.uid === f.cs)) {
      const rk = { G: 'stałe', Q: 'zmienne', A: 'wyjątkowe' }[c.type || 'G'];
      if (c.selfWeight && !f.type && !f.onlySel) rows.push([caseCode(c), c.name, rk, 'wszystkie pręty', 'Ciężar własny', 'A·γ', n2(selfWeightTotal())]);
      for (const l of filteredLoads(c)) rows.push([caseCode(c), c.name, rk, isNodeLoad(l.type) ? 'węzeł ' + nodeNo(l.node) : 'pręt ' + memNo(l.m), LT[l.type], loadSummary(l), n2(loadResultant(l))]);
    }
    return rows.map(r => r.map(x => String(x).replace(/[\t\n]/g, ' ')).join('\t')).join('\r\n');
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* */ }
      ta.remove(); return ok;
    }
  }

  // --- przekroje prętów
  function winSecsHtml() {
    const m = U.model;
    const selM = U.sel.kind === 'member' ? U.sel.ids : [];
    let h = `<div class="wtool"><button class="pri" data-act="newSec">+ Nowy przekrój</button><button data-act="secView">Widok przekrojów</button><button data-act="tool" data-v="sec">Narzędzie „Przekrój” (K)</button><button data-act="purgeSecs" title="Usuwa przekroje bez przypisanych prętów">Usuń nieużywane</button><span class="sp"></span><span class="mut">Zaznaczone pręty: <b>${selM.length ? compactList(selM.map(memNo)) : 'brak'}</b></span></div>`;
    h += '<div class="sub" style="margin-top:2px">Przekroje</div><table class="t sw-t"><tr><th></th><th>Nazwa</th><th>Kształt</th><th>Wymiary</th><th>Materiał</th><th class="r">A [cm²]</th><th class="r">I [cm⁴]</th><th class="r">g [kN/m]</th><th>Pręty</th><th></th></tr>';
    for (const sc of m.secs) {
      const p = E.secProps(sc), mat = m.mats.find(x => x.uid === sc.mat);
      const used = m.members.filter(x => x.sec === sc.uid).map(x => memNo(x.uid));
      h += `<tr><td><i class="sw" style="background:${D.secColor(m, sc.uid)}"></i></td><td><input class="nm" data-b="sec.${sc.uid}.name" data-t="str" value="${esc(sc.name || '')}"></td><td>${sel('sec.' + sc.uid + '.shape', sc.shape, SHAPES)}</td><td class="nowrap">${secParams(sc, false)}</td>
        <td>${sel('sec.' + sc.uid + '.mat', sc.mat, m.mats.map(x => [x.uid, x.name]), 'int')}</td><td class="r">${p ? fmt(p.A * 1e4, 2) : '–'}</td><td class="r">${p ? fmt(p.I * 1e8, 0) : '–'}</td><td class="r">${p && mat ? fmt(p.A * mat.g, 3) : '–'}</td>
        <td>${used.length ? `<button class="lnk" data-act="selSecMembers" data-v="${sc.uid}" title="Zaznacz te pręty">${compactList(used)}</button>` : '<span class="mut">—</span>'}<br><input class="w" style="min-width:110px" data-secadd="${sc.uid}" placeholder="+ przypisz, np. 1-3, 7"></td>
        <td class="nowrap"><button data-act="assignSecSel" data-v="${sc.uid}"${selM.length ? '' : ' disabled'} title="Przypisz do zaznaczonych prętów">⇲ zaznaczonym</button><button class="x" data-act="dupSec" data-v="${sc.uid}" title="Duplikuj">⧉</button><button class="x" data-act="delSec" data-v="${sc.uid}" title="Usuń">✕</button></td></tr>`;
    }
    h += '</table>';
    h += '<div class="sub">Pręty – przypisanie przekrojów</div><table class="t"><tr><th>Pręt</th><th>Węzły</th><th class="r">L [m]</th><th>Przekrój</th><th class="r">A [cm²]</th><th class="r">I [cm⁴]</th><th class="r">EA [kN]</th><th class="r">EI [kNm²]</th><th></th></tr>';
    const sset = new Set(selM);
    for (const x of m.members) {
      const sc = m.secs.find(q => q.uid === x.sec), p = E.secProps(sc), mat = sc && m.mats.find(q => q.uid === sc.mat);
      const shared = m.members.some(q => q.sec === x.sec && q.uid !== x.uid);
      h += `<tr class="click${sset.has(x.uid) ? ' sel' : ''}" data-act="selMem" data-v="${x.uid}"><td><b>${memNo(x.uid)}</b></td><td>${nodeNo(x.i)}→${nodeNo(x.j)}</td><td class="r">${fmt(M.memLen(m, x), 3)}</td>
        <td><i class="sw" style="background:${D.secColor(m, x.sec)}"></i>${secSelect('mem.' + x.uid + '.sec', x.sec)}</td><td class="r">${p ? fmt(p.A * 1e4, 2) : '–'}</td><td class="r">${p ? fmt(p.I * 1e8, 0) : '–'}</td>
        <td class="r">${p && mat ? fmt(mat.E * 1e6 * p.A, 0) : '–'}</td><td class="r">${p && mat ? fmt(mat.E * 1e6 * p.I, 0) : '–'}</td>
        <td>${shared ? `<button class="x" data-act="sepSec" data-v="${x.uid}" title="Osobny przekrój dla tego pręta (kopia)">⑂</button>` : ''}</td></tr>`;
    }
    h += '</table><div class="hint" style="margin-top:6px">Każdy pręt może mieć inny przekrój – wybierz go w kolumnie „Przekrój”, wpisz numery prętów w polu „+ przypisz” albo użyj narzędzia „Przekrój” na schemacie. Przycisk ⑂ tworzy kopię przekroju tylko dla danego pręta (np. aby zmienić wymiary jednego rygla).</div>';
    return h;
  }

  // ------------------------------------------------------------------ akcje
  function addLoadsTo(kind, uids) {
    const ld = formToLoad();
    if (!U.model.cases.length) commit(m => { U.activeCase = M.addCase(m, { name: 'Obciążenie stałe', type: 'G' }); });
    if (!caseBy(U.activeCase)) U.activeCase = U.model.cases[0].uid;
    const nodeT = isNodeLoad(ld.type);
    if (nodeT && kind !== 'node') return toast('Wybrany typ obciążenia (' + LT[ld.type] + ') przykłada się do węzłów.');
    if (!nodeT && kind !== 'member') return toast('Wybrany typ obciążenia (' + LT[ld.type] + ') przykłada się do prętów.');
    for (const k of ['q1', 'F', 'M', 'Fx', 'Fy', 'dT', 'dTg', 'ux', 'uy', 'rz', 'x', 'x1', 'x2', 'bw']) if (ld[k] !== undefined && ld[k] !== null && !isFinite(ld[k])) return toast('Uzupełnij poprawnie pole ' + k);
    const cs = caseBy(U.activeCase);
    commit(m => {
      for (const u of uids) {
        const o = Object.assign({}, ld);
        if (nodeT) o.node = u; else o.m = u;
        M.addLoad(m, cs.uid, o);
      }
    }, 'Dodano: ' + LT[ld.type] + ' → ' + (nodeT ? 'węzły ' + uids.map(nodeNo).join(', ') : 'pręty ' + uids.map(memNo).join(', ')) + ' (' + caseCode(cs) + ')');
  }

  const ACT = {
    new() { if (!confirmLose()) return; loadModel(M.blank(), ''); toast('Nowy projekt'); },
    open() { openFile(); }, save() { saveFile(false); }, saveas() { saveFile(true); },
    exmenu() { const mn = $('#exMenu'); mn.hidden = !mn.hidden; },
    example(el) { $('#exMenu').hidden = true; if (!confirmLose()) return; loadModel(M.EXAMPLES[+el.dataset.v].build(), ''); U.dirty = true; updateTitle(); },
    undo, redo,
    report() { window.R2R.open(U); },
    help() { showHelp(); },
    fit() { fitView(); renderCanvas(); },
    scaleUp() { if (U.diag === 'def') U.defScale *= 1.4; else U.diagScale *= 1.4; renderCanvas(); },
    scaleDn() { if (U.diag === 'def') U.defScale /= 1.4; else U.diagScale /= 1.4; renderCanvas(); },
    tool(el) { setTool(el.dataset.v); },
    tab(el) { U.tab = el.dataset.v; deferRender(true); },
    barDir(el) { U.form.bar.dir = el.dataset.v; deferRender(true); },
    addBar() {
      const f = U.form.bar;
      const L = +f.L, n = Math.max(1, Math.min(100, f.n | 0 || 1));
      if (!(L > 0)) return toast('Podaj długość pręta L > 0.');
      let x0, y0;
      if (f.from === 'node') {
        const nd = nodeBy(f.node) || (U.model.nodes.length ? null : { x: 0, y: 0 });
        if (!nd) return toast('Wybierz węzeł początkowy (lub kliknij węzeł na schemacie).');
        x0 = nd.x; y0 = nd.y;
      } else { x0 = +f.x || 0; y0 = +f.y || 0; }
      const a = { R: 0, U: 90, L: 180, D: 270, A: +f.ang || 0 }[f.dir] * Math.PI / 180;
      let dx = L * Math.cos(a), dy = L * Math.sin(a);
      if (Math.abs(dx) < 1e-9) dx = 0; if (Math.abs(dy) < 1e-9) dy = 0;
      let last = null;
      commit(m => {
        const ids = [];
        for (let k = 0; k < n; k++) ids.push(...M.addMember(m, x0 + dx * k, y0 + dy * k, x0 + dx * (k + 1), y0 + dy * (k + 1), { sec: f.sec, truss: f.truss }));
        last = M.findNodeAt(m, round6(x0 + dx * n), round6(y0 + dy * n));
        if (ids.length) U.sel = { kind: 'member', ids };
      }, n > 1 ? 'Dodano ' + n + ' prętów' : 'Dodano pręt');
      if (last) { U.form.bar.node = last.uid; U.form.bar.from = 'node'; }
      if (U.model.members.length <= n) { fitView(); }
      deferRender(true);
    },
    addNodeXY() {
      modal(`<h2>Dodaj węzeł</h2><div class="f"><label>x [m]</label>${inpN('ui.newNode.x', U.form.newNode.x)}<label>y [m]</label>${inpN('ui.newNode.y', U.form.newNode.y)}</div>
        <div class="btns"><button class="pri" data-act="addNodeOk">Dodaj</button><button data-act="closeModal">Anuluj</button></div>`);
    },
    addNodeOk() { const f = U.form.newNode; closeModal(); commit(m => { const u = M.addNode(m, +f.x || 0, +f.y || 0); U.sel = { kind: 'node', ids: [u] }; U.form.bar.node = u; }, 'Dodano węzeł'); },
    closeModal() { closeModal(); },
    genRun() {
      const g = U.form.gen, G = M.GEN[g.type], vals = Object.assign({}, g.vals[g.type] || {});
      if (g.clear && U.model.members.length && !confirm('Zastąpić bieżący model nowym układem? (Można cofnąć Ctrl+Z)')) return;
      commit(m => {
        if (g.clear) { m.nodes = []; m.members = []; for (const c of m.cases) c.loads = []; }
        const s1 = m.secs[0] && m.secs[0].uid, s2 = (m.secs[1] || m.secs[0] || {}).uid;
        G.run(m, vals, +g.x0 || 0, +g.y0 || 0, s1, s2);
      }, 'Wstawiono: ' + G.n);
      fitView(); deferRender(true);
    },
    selNode(el, e) { if (e && e.target.closest('input,select,button')) return; selectHit({ kind: 'node', uid: +el.dataset.v }, e && (e.shiftKey || e.ctrlKey)); },
    selMem(el, e) { if (e && e.target.closest('input,select,button')) return; selectHit({ kind: 'member', uid: +el.dataset.v }, e && (e.shiftKey || e.ctrlKey)); },
    selLoad(el, e) { if (e && e.target.closest('input,select,button:not(.lnk)')) return; const f = findLoad(+el.dataset.v); if (f) U.activeCase = f.c.uid; selectHit({ kind: 'load', uid: +el.dataset.v }, false); },
    delNode(el) { const u = +el.dataset.v; commit(m => M.deleteNodes(m, [u]), 'Usunięto węzeł'); },
    delMem(el) { const u = +el.dataset.v; commit(m => M.deleteMembers(m, [u]), 'Usunięto pręt'); },
    revMem(el) { const u = +el.dataset.v; commit(m => M.reverseMember(m, u), 'Odwrócono pręt ' + memNo(u)); },
    delSup(el) { const u = +el.dataset.v; commit(m => { nodeBy(u).sup = null; }, 'Usunięto podporę'); },
    addSec() { ACT.newSec(); },
    delSec(el) {
      const u = +el.dataset.v;
      if (U.model.members.some(x => x.sec === u)) return toast('Przekrój jest używany przez pręty – najpierw zmień ich przekrój.');
      if (U.model.secs.length <= 1) return toast('Model musi mieć co najmniej jeden przekrój.');
      commit(m => { m.secs = m.secs.filter(s => s.uid !== u); });
    },
    addMat() { commit(m => { M.addMat(m, 'C25/30'); U.open.mats = true; }); },
    delMat(el) {
      const u = +el.dataset.v;
      if (U.model.secs.some(s => s.mat === u)) return toast('Materiał jest używany w przekrojach.');
      commit(m => { m.mats = m.mats.filter(s => s.uid !== u); });
    },
    setCase(el) { U.activeCase = +el.dataset.v; deferRender(true); },
    addCase(el) {
      const t = el.dataset.v;
      commit(m => { U.activeCase = M.addCase(m, { name: t === 'G' ? 'Obciążenie stałe' : t === 'Q' ? 'Obciążenie zmienne' : 'Obciążenie wyjątkowe', type: t }); });
    },
    dupCase(el) {
      const c = caseBy(+el.dataset.v);
      commit(m => { const n = JSON.parse(JSON.stringify(c)); n.uid = M.uid(m); n.name = c.name + ' (kopia)'; n.loads.forEach(l => { l.uid = M.uid(m); }); m.cases.splice(m.cases.indexOf(c) + 1, 0, n); U.activeCase = n.uid; });
    },
    delCase(el) {
      const u = +el.dataset.v, c = caseBy(u);
      if (c.loads.length && !confirm('Usunąć przypadek „' + c.name + '” z ' + c.loads.length + ' obciążeniami?')) return;
      commit(m => { m.cases = m.cases.filter(x => x.uid !== u); for (const cb of m.combos) if (cb.f) delete cb.f[u]; });
    },
    clearCase() { const c = caseBy(U.activeCase); if (c && confirm('Usunąć wszystkie obciążenia przypadku?')) commit(() => { c.loads = []; }); },
    loadType(el) { U.form.load.type = el.dataset.v; deferRender(true); },
    addLoad() {
      const ld = formToLoad(), nodeT = isNodeLoad(ld.type);
      let uids = U.sel.kind === (nodeT ? 'node' : 'member') ? U.sel.ids.slice() : [];
      if (!uids.length) {
        const nums = parseList(U.form.load.target, nodeT ? U.model.nodes.length : U.model.members.length);
        uids = nums.map(i => (nodeT ? U.model.nodes : U.model.members)[i - 1].uid);
      }
      if (!uids.length) return toast('Zaznacz ' + (nodeT ? 'węzły' : 'pręty') + ' na schemacie lub wpisz ich numery.');
      addLoadsTo(nodeT ? 'node' : 'member', uids);
    },
    addLoadTo(el) { addLoadsTo('member', [+el.dataset.v]); },
    quickNodeLoad(el) { U.form.load.type = el.dataset.t; U.tab = 'loads'; U.sel = { kind: 'node', ids: [+el.dataset.v] }; deferRender(true); toast('Uzupełnij wartości i kliknij „Dodaj”.'); },
    delLoad(el) { const u = +el.dataset.v; commit(m => { for (const c of m.cases) c.loads = c.loads.filter(l => l.uid !== u); }); },
    dupLoadTo(el) {
      const u = +el.dataset.v;
      modal('<h2>Kopiuj obciążenie do przypadku</h2>' + U.model.cases.map(c => `<button style="display:block;margin:4px 0;width:100%;text-align:left" data-act="dupLoadOk" data-v="${u}" data-c="${c.uid}"><span class="tag ${c.type || 'G'}">${caseCode(c)}</span> ${esc(c.name)}</button>`).join('') + '<div class="btns"><button data-act="closeModal">Anuluj</button></div>');
    },
    dupLoadOk(el) { const f = findLoad(+el.dataset.v), cu = +el.dataset.c; closeModal(); commit(m => { const o = JSON.parse(JSON.stringify(f.l)); delete o.uid; M.addLoad(m, cu, o); }, 'Skopiowano'); },
    addGrp(el) { commit(m => M.addGroup(m, el.dataset.v === 'sum' ? 'Jedno oddziaływanie' : 'Wykluczające się', el.dataset.v)); },
    delGrp(el) { const u = +el.dataset.v; commit(m => { m.groups = m.groups.filter(g => g.uid !== u); for (const c of m.cases) if (c.grp === u) c.grp = ''; }); },
    addCmb() { commit(m => { const f = {}; for (const c of m.cases) f[c.uid] = c.type === 'G' ? 1.35 : c.type === 'Q' ? 1.5 : 0; m.combos.push({ uid: M.uid(m), name: 'K' + (m.combos.length + 1), f }); U.open.ucmb = true; }); },
    delCmb(el) { const u = +el.dataset.v; commit(m => { m.combos = m.combos.filter(c => c.uid !== u); }); },
    splitN(el) { const u = +el.dataset.v, n = Math.round(+U.form.split.n || 2); commit(m => M.splitMemberN(m, u, n), 'Podzielono pręt na ' + n + ' części'); },
    splitAt(el) { const u = +el.dataset.v; commit(m => { if (!M.splitMemberAt(m, u, +U.form.split.t)) toast('Punkt musi leżeć wewnątrz pręta.'); }); },
    bulkRel(el) { const v = el.dataset.v === '1'; const ids = U.sel.ids.slice(); commit(m => { for (const u of ids) { const x = memBy(u); x.ri = v; x.rj = v; } }); },
    bulkHinge() { const ids = U.sel.ids.slice(); commit(m => { for (const u of ids) { const n = nodeBy(u); n.hinge = !n.hinge; } }); },
    delSel() { deleteSelection(); },
    openLoadsWin() { openWin('loads'); },
    openSecWin() { openWin('secs'); },
    closeWin() { closeWin(); },
    vlAll() { U.hiddenCases.clear(); renderCanvas(); },
    vlNone() { for (const c of U.model.cases) U.hiddenCases.add(c.uid); renderCanvas(); },
    vlMin() { U.vlMin = !U.vlMin; renderVLegend(); },
    lwView() { U.diag = 'loads'; if (U.tool !== 'select' && U.tool !== 'load') U.tool = 'select'; fitIfLegendCovers(); updateHint(); deferRender(true); },
    lwCase(el) { U.activeCase = +el.dataset.v; deferRender(true); toast('Aktywny przypadek: ' + caseCode(caseBy(U.activeCase))); },
    async lwCopy() { const ok = await copyText(loadsTSV()); toast(ok ? 'Skopiowano zestawienie – wklej w Excelu (Ctrl+V)' : 'Nie udało się skopiować do schowka'); },
    secView() { U.diag = 'secs'; fitIfLegendCovers(); deferRender(true); },
    newSec() { const u = newSection(); if (u) toast('Dodano przekrój: ' + secName(u)); },
    newSecTool() { const u = newSection(); if (u) { U.form.secTool.sec = u; deferRender(true); } },
    newSecFor(el) {
      const mu = +el.dataset.v;
      commit(m => { const u = makeSection(m); M.assignSec(m, [mu], u); }, 'Nowy przekrój dla pręta ' + memNo(mu));
    },
    dupSec(el) { const u = +el.dataset.v; let nu = null; commit(m => { nu = M.cloneSec(m, u); }, 'Skopiowano przekrój'); if (nu && U.tool === 'sec') U.form.secTool.sec = nu; },
    assignSecSel(el) {
      const u = +el.dataset.v, ids = U.sel.kind === 'member' ? U.sel.ids.slice() : [];
      if (!ids.length) return toast('Najpierw zaznacz pręty na schemacie.');
      commit(m => M.assignSec(m, ids, u), 'Przekrój ' + secName(u) + ' → pręty ' + compactList(ids.map(memNo)));
    },
    selSecMembers(el) {
      const u = +el.dataset.v, ids = U.model.members.filter(x => x.sec === u).map(x => x.uid);
      if (!ids.length) return toast('Przekrój nie jest przypisany do żadnego pręta.');
      U.sel = { kind: 'member', ids }; deferRender(true);
    },
    pickBrush(el) { U.form.secTool.sec = +el.dataset.v; deferRender(true); },
    sepSec(el) { const mu = +el.dataset.v; commit(m => M.separateSec(m, [mu]), 'Pręt ' + memNo(mu) + ' ma teraz własny przekrój'); },
    sepSecSel() { const ids = U.sel.ids.slice(); commit(m => M.separateSec(m, ids), 'Wspólny osobny przekrój dla prętów ' + compactList(ids.map(memNo))); },
    purgeSecs() { let n = 0; commit(m => { n = M.purgeSecs(m); }); toast(n ? 'Usunięto nieużywane przekroje: ' + n : 'Brak nieużywanych przekrojów'); },
  };
  // nowy przekrój: kopia parametrów bieżącego przekroju pędzla/pręta lub prostokąt domyślny
  function makeSection(m) {
    const base = m.secs.find(x => x.uid === U.form.secTool.sec) || m.secs[0];
    const mat = base ? base.mat : ((m.mats[0] || {}).uid || M.addMat(m, 'C25/30'));
    const nm = M.uniqueSecName(m, 'Prostokąt 300×500');
    return M.addSec(m, { name: nm, shape: 'rect', b: 300, h: 500, mat });
  }
  function newSection() { let u = null; commit(m => { u = makeSection(m); U.open = U.open || {}; U.open.secs = true; }); return u; }
  function deleteSelection() {
    const s = U.sel; if (!s.kind) return;
    const ids = s.ids.slice();
    if (s.kind === 'node') commit(m => M.deleteNodes(m, ids), 'Usunięto węzły: ' + ids.length);
    else if (s.kind === 'member') commit(m => M.deleteMembers(m, ids), 'Usunięto pręty: ' + ids.length);
    else if (s.kind === 'load') commit(m => { for (const c of m.cases) c.loads = c.loads.filter(l => ids.indexOf(l.uid) < 0); }, 'Usunięto obciążenia');
    U.sel = { kind: null, ids: [] };
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (!e.target.closest('.dd')) $('#exMenu').hidden = true; return; }
    if (el.tagName === 'SELECT') return;
    const a = el.dataset.act;
    if (ACT[a]) { ACT[a](el, e); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.actChange === 'addSup') {
      const u = +el.dataset.v, t = el.value; if (!t) return;
      commit(m => { const n = nodeBy(u); const pr = E.SUP_PRESETS[t]; n.sup = M.sup(t); if (pr.f) { n.sup.rx = pr.f[0]; n.sup.ry = pr.f[1]; n.sup.rz = pr.f[2]; } if (t === 'sprY') n.sup.ky = 10000; if (t === 'sprR') n.sup.kz = 10000; });
      return;
    }
    if (el.id === 'viewSel' || el.id === 'viewSel2') { U.viewKey = el.value; if (isModelView(U.diag)) U.diag = 'M'; deferRender(true); return; }
    if (el.dataset.vlcase) { const u = +el.dataset.vlcase; if (el.checked) U.hiddenCases.delete(u); else U.hiddenCases.add(u); renderCanvas(); return; }
    if (el.id === 'vlSW') { U.showSW = el.checked; renderCanvas(); return; }
    if (el.id === 'vlTags') { U.caseTags = el.checked; renderCanvas(); return; }
    if (el.dataset.secadd) {
      const u = +el.dataset.secadd, nums = parseList(el.value, U.model.members.length);
      if (!nums.length) { if (el.value.trim()) toast('Podaj numery prętów, np. 1-3, 7'); el.value = ''; return; }
      const ids = nums.map(i => U.model.members[i - 1].uid);
      commit(m => M.assignSec(m, ids, u), 'Przekrój ' + secName(u) + ' → pręty ' + compactList(nums));
      return;
    }
    if (el.id === 'bulkSec') { const v = +el.value; if (!v) return; const ids = U.sel.ids.slice(); commit(m => { for (const u of ids) memBy(u).sec = v; }); return; }
    if (['gridStep', 'vNums', 'vDims', 'vLoads', 'vVals'].indexOf(el.id) >= 0) { renderCanvas(); return; }
    if (el.dataset.b) onFieldChange(el);
  });
  document.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.card) { U.open = U.open || {}; U.open[d.dataset.card] = d.open; } }, true);
  document.addEventListener('keydown', e => {
    if (e.target.dataset && e.target.dataset.b && e.key === 'Enter') { e.target.blur(); return; }
    const inInput = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !inInput) { e.preventDefault(); undo(); }
      else if (k === 'y' && !inInput) { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); saveFile(e.shiftKey); }
      else if (k === 'o') { e.preventDefault(); openFile(); }
      else if (k === 'n') { e.preventDefault(); ACT.new(); }
      else if (k === 'p') { e.preventDefault(); ACT.report(); }
      return;
    }
    if (e.key === 'Shift') U.shift = true;
    if (inInput) return;
    if (e.key === ' ') { U.space = true; e.preventDefault(); return; }
    if (!$('#modal').hidden && e.key === 'Escape') { closeModal(); return; }
    if (U.win && e.key === 'Escape' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#win')) { closeWin(); return; }
    if (!$('#report').hidden) { if (e.key === 'Escape') window.R2R.close(); return; }
    switch (e.key) {
      case 'Escape': if (U.barStart) { U.barStart = null; drawOverlay(); updateHint(); } else if (U.tool !== 'select') setTool('select'); else clearSel(); break;
      case 'Delete': case 'Backspace': deleteSelection(); break;
      case 'v': case 'V': setTool('select'); break;
      case 'w': case 'W': setTool('node'); break;
      case 'p': case 'P': setTool('bar'); break;
      case 's': case 'S': setTool('support'); break;
      case 'h': case 'H': setTool('hinge'); break;
      case 'o': case 'O': setTool('load'); break;
      case 'k': case 'K': setTool('sec'); break;
      case 'l': case 'L': if (U.win === 'loads') closeWin(); else openWin('loads'); break;
      case 'f': case 'F': ACT.fit(); break;
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
        U.diag = ['model', 'loads', 'secs', 'M', 'V', 'N', 'def', 'R'][+e.key - 1];
        if (!isModelView(U.diag) && U.tool !== 'select') { U.tool = 'select'; U.barStart = null; }
        fitIfLegendCovers(); updateHint(); deferRender(true); break;
    }
  });
  document.addEventListener('keyup', e => { if (e.key === 'Shift') U.shift = false; if (e.key === ' ') U.space = false; });
  $$('#ctool [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('#diagBtns [data-diag]').forEach(b => b.addEventListener('click', () => { U.diag = b.dataset.diag; if (!isModelView(U.diag) && U.tool !== 'select') { U.tool = 'select'; U.barStart = null; } fitIfLegendCovers(); updateHint(); deferRender(true); }));
  $$('#left .tabs button').forEach(b => b.addEventListener('click', () => { U.tab = b.dataset.tab; deferRender(true); }));

  // ------------------------------------------------------------------ okna
  function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="box">' + html + '</div>'; m.hidden = false; const i = m.querySelector('input'); if (i) i.focus(); }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  function showHelp() {
    modal(`<h2>Rama2D ${VERSION} – pomoc</h2>
      <p>Program do obliczeń statycznych płaskich układów prętowych (belki, ramy, kratownice) metodą przemieszczeń (MES, elementy belkowe Eulera–Bernoulliego, analiza liniowa I rzędu).</p>
      <h3>Budowa modelu</h3><ul>
      <li><b>Pręt o zadanej długości</b> – zakładka „Model”: węzeł początkowy, kierunek (→ ↑ ← ↓ lub kąt), długość i liczba powtórzeń. Albo narzędzie <b>Pręt</b>: kliknij początek i koniec (przyciąganie do siatki, węzłów i prętów; Shift – orto).</li>
      <li>Węzeł postawiony na pręcie dzieli go; pręt przechodzący przez istniejące węzły łączy się z nimi – tak powstają ramy i kratownice. Pręty krzyżujące się bez węzła <b>nie są</b> połączone.</li>
      <li><b>Przeguby</b>: zwolnienie momentu na końcu pręta (○) albo „węzeł przegubowy” – wszystkie pręty w węźle połączone przegubowo. Pręt kratownicowy = przeguby na obu końcach.</li>
      <li><b>Przekroje</b>: każdy pręt może mieć własny przekrój – wybór w tabeli prętów, w panelu pręta, w oknie „Przekroje prętów” (przypisywanie po numerach lub do zaznaczonych) albo narzędziem <b>Przekrój (K)</b>: kliknij pręt lub zaznacz oknem kilka prętów (Ctrl+klik pobiera przekrój z pręta). Widok <b>Przekroje</b> koloruje pręty wg przekroju. „Osobny przekrój” tworzy kopię tylko dla danego pręta.</li>
      <li><b>Podpory</b>: przegubowa nieprzesuwna, przesuwna (w X lub Y), utwierdzenie, utwierdzenie przesuwne, sprężyste (k w kN/m lub kNm/rad), dowolne kombinacje kierunków, obrót podpory (podpora ukośna) i szerokość b.</li></ul>
      <h3>Obciążenia</h3><ul>
      <li>Dowolna liczba przypadków stałych (G), zmiennych (Q, z kategorią i ψ) i wyjątkowych (A).</li>
      <li>Ciągłe (stałe lub trapezowe, na całej lub części długości): pionowe na długość pręta, <b>na rzut poziomy</b> (śnieg), poziome (na długość lub rzut pionowy), prostopadłe do pręta (wiatr na połać), wzdłuż pręta. Wartość w kN/m albo kN/m² × szerokość pasma.</li>
      <li>Siły i momenty skupione w dowolnym punkcie pręta (od początku, od końca lub x/L), obciążenia węzłowe, temperatura (równomierna i gradient), przemieszczenia wymuszone podpór (osiadanie), ciężar własny.</li>
      <li>Widok <b>Obciążenia</b> pokazuje wszystkie przypadki naraz (kolor wg przypadku, z ciężarem własnym; przypadki można ukrywać w legendzie). Okno <b>Zestawienie obciążeń</b> (L) zawiera tabelę wszystkich obciążeń z edycją wartości, wypadkowymi i sumami ΣF w przypadkach oraz kopiowaniem do Excela.</li>
      <li>Znaki obciążeń: siły pionowe + w dół, poziome + w prawo, momenty + zgodnie z ruchem wskazówek zegara. Wartość ujemna = przeciwny zwrot (np. ssanie wiatru).</li></ul>
      <h3>Wyniki</h3><ul>
      <li>Reakcje, siły N, T, M, przemieszczenia węzłów, deformacja, ugięcia prętów – dla przypadku, kombinacji użytkownika lub obwiedni SGN (6.10 / 6.10a,b; 6.11b) i SGU (charakterystyczna, częsta, quasi-stała).</li>
      <li>Konwencja: M &gt; 0 rozciąga spody (linia przerywana), wykres M po stronie włókien rozciąganych; T &gt; 0 obraca element zgodnie z ruchem wskazówek; N &gt; 0 – rozciąganie. Reakcje i przemieszczenia w układzie globalnym: X →, Y ↑, obrót ↺.</li>
      <li>Kontrola: sumy sił i momentów (równowaga), stopień statycznej niewyznaczalności, wykrywanie mechanizmów.</li></ul>
      <h3>Ograniczenia</h3><p class="hint">Analiza liniowo-sprężysta, bez efektów II rzędu, bez odkształceń postaciowych i bez podpór jednostronnych. Zaokrąglenie momentu nad podporą (ΔM = R·b/8) stosowane dla podpór pośrednich belek ciągłych. Wyniki należy weryfikować – program jest narzędziem pomocniczym.</p>
      <div class="btns"><button class="pri" data-act="closeModal">Zamknij</button></div>`);
  }

  // ------------------------------------------------------------------ pliki (most do Go lub przeglądarka)
  function confirmLose() { return !U.dirty || confirm('Bieżący projekt ma niezapisane zmiany. Kontynuować?'); }
  function serialize() { return JSON.stringify({ app: 'Rama2D', ver: VERSION, saved: new Date().toISOString(), model: U.model }, null, 1); }
  function loadModel(m, path) {
    U.model = M.normalize(m); U.path = path || ''; U.undo = []; U.redo = []; U.dirty = false;
    U.sel = { kind: null, ids: [] }; U.activeCase = U.model.cases[0] ? U.model.cases[0].uid : null; U.barStart = null;
    U.viewKey = ''; U.diag = 'model'; U.hiddenCases = new Set();
    const ln = U.model.nodes[U.model.nodes.length - 1]; U.form.bar.node = ln ? ln.uid : null; U.form.bar.from = ln ? 'node' : 'pt';
    recalc(); cleanSel(); fitView(); renderAll(); updateTitle(); autosave();
  }
  function parseFile(txt) {
    const o = JSON.parse(txt);
    if (o && o.model) return o.model;
    if (o && o.nodes) return o;
    throw new Error('To nie jest plik projektu Rama2D.');
  }
  const goCb = {};
  window.__goDone = (id, res) => { const f = goCb[id]; delete goCb[id]; if (f) f(res); };
  let goId = 1;
  function goAsync(fn, ...args) {
    return new Promise((resolve) => { const id = goId++; goCb[id] = resolve; window[fn](id, ...args); });
  }
  async function saveFile(as) {
    const name = (U.model.name || 'projekt').replace(/[\\/:*?"<>|]+/g, '_') + '.r2d';
    if (window.goSaveAs) {
      let path = U.path;
      if (as || !path) {
        const r = await goAsync('goSaveAs', name, serialize(), 'r2d');
        if (!r || !r.path) return;
        if (r.err) return toast('Błąd zapisu: ' + r.err, 5000);
        path = r.path;
      } else {
        const err = await window.goWrite(path, serialize());
        if (err) return toast('Błąd zapisu: ' + err, 5000);
      }
      U.path = path; U.dirty = false; updateTitle(); toast('Zapisano: ' + path.split(/[\\/]/).pop());
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([serialize()], { type: 'application/json' })); a.download = name; a.click();
      U.dirty = false; updateTitle();
    }
  }
  async function openFile() {
    if (!confirmLose()) return;
    if (window.goOpen) {
      const r = await goAsync('goOpen', 'r2d');
      if (!r || !r.path) return;
      if (r.err) return toast('Błąd odczytu: ' + r.err, 5000);
      try { loadModel(parseFile(r.content), r.path); toast('Wczytano: ' + r.path.split(/[\\/]/).pop()); } catch (e) { toast('Nie można wczytać pliku: ' + e.message, 5000); }
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.r2d,.json';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { loadModel(parseFile(t), f.name); } catch (e) { toast(e.message); } }); };
      inp.click();
    }
  }
  let _as = null;
  function autosave() {
    clearTimeout(_as);
    _as = setTimeout(() => {
      const s = JSON.stringify({ path: U.path, dirty: U.dirty, model: U.model });
      if (window.goAutosave) window.goAutosave(s); else { try { localStorage.setItem('rama2d.autosave', s); } catch (e) { /* */ } }
    }, 800);
  }
  window.R2UI = { U, toast, serialize, saveHtml: async (html, name) => {
    if (window.goSaveAs) { const r = await goAsync('goSaveAs', name, html, 'html'); if (r && r.path) toast(r.err ? 'Błąd: ' + r.err : 'Zapisano raport: ' + r.path.split(/[\\/]/).pop()); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; a.click(); }
  }, render: renderAll, getView: curView, caseCode, loadSummary, LT, isNodeLoad, supSummary, loadResultant, selfWeightTotal, caseSums, compactList, loadsTSV };

  // ------------------------------------------------------------------ start
  $('#exMenu').innerHTML = M.EXAMPLES.map((x, i) => `<button data-act="example" data-v="${i}">${esc(x.n)}</button>`).join('');
  async function start() {
    let loaded = false;
    try {
      let arg = null;
      if (window.goArgFile) arg = await window.goArgFile();
      if (arg && arg.content) { loadModel(parseFile(arg.content), arg.path); loaded = true; }
    } catch (e) { console.error(e); }
    if (!loaded) {
      try {
        let s = null;
        if (window.goLoadAutosave) s = await window.goLoadAutosave(); else s = localStorage.getItem('rama2d.autosave');
        if (s) { const o = JSON.parse(s); if (o && o.model && o.model.nodes) { loadModel(o.model, o.path || ''); U.dirty = !!o.dirty; updateTitle(); loaded = true; } }
      } catch (e) { console.error(e); }
    }
    if (!loaded) { loadModel(M.EXAMPLES[0].build(), ''); }
    updateHint();
  }
  // poczekaj na wymiary kanwy
  requestAnimationFrame(() => { const r = wrap.getBoundingClientRect(); U.W = r.width; U.H = r.height; start(); });
})();
���������������������������������