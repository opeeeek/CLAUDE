/* Rama2D – raport obliczeń (podgląd, druk / PDF, eksport HTML) */
(function () {
  'use strict';
  const E = window.R2E, M = window.R2M, D = window.R2D;
  const fmt = D.fmt, esc = D.esc;
  const opts = { data: true, cases: true, caseDiag: false, envs: { ULS: true, ACC: true, CHR: true, FRQ: false, QP: true }, combos: true, tables: true };

  function fig(model, res, view, diag, o) {
    const b = D.bbox(model);
    const W = 720, bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 0.2);
    let H = Math.round((W - 190) * bh / bw + 190);
    H = Math.max(240, Math.min(560, H));
    const tr = D.fit(model, W, H, 82);
    tr.oy -= 6;
    const r = D.render({ model, res, view, diag, tr, W, H, opt: Object.assign({ grid: false, nodeNums: true, memNums: true, dims: false, loads: 'none', values: true, diagScale: 1, defScale: 1, sel: {} }, o || {}) });
    return `<div class="fig"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">${r.svg}</svg></div>`;
  }
  const tbl = (head, rows, right) => '<table><tr>' + head.map((h, i) => `<th${right && right[i] ? ' class="r"' : ''}>${h}</th>`).join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map((c, i) => `<td${right && right[i] ? ' class="r"' : ''}>${c}</td>`).join('') + '</tr>').join('') + '</table>';

  function build(U) {
    const model = U.model, res = U.res, UI = window.R2UI;
    const now = new Date();
    let rys = 0;
    const cap = (t) => '<div class="cap">Rys. ' + (++rys) + '. ' + t + '</div>';
    const legend = (items) => '<div class="leg">' + items.map(([col, t]) => `<span><i style="background:${col}"></i>${t}</span>`).join('') + '</div>';
    const memNoR = (u) => model.members.findIndex(x => x.uid === u) + 1;
    let h = `<h1>${esc(model.name || 'Projekt')}</h1><div class="meta">Obliczenia statyczne układu prętowego płaskiego · Rama2D 1.0 · ${now.toLocaleDateString('pl-PL')} ${now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}${U.path ? ' · ' + esc(U.path.split(/[\\/]/).pop()) : ''}</div>`;
    h += `<h2>1. Założenia</h2><p>Analiza liniowo-sprężysta I rzędu metodą przemieszczeń (MES, elementy belkowe Eulera–Bernoulliego, bez odkształceń postaciowych). Jednostki: kN, m. Konwencja znaków: N &gt; 0 – rozciąganie; T &gt; 0 obraca element zgodnie z ruchem wskazówek zegara; M &gt; 0 rozciąga włókna spodnie (linia przerywana na schemacie) – wykres M rysowany po stronie włókien rozciąganych. Reakcje i przemieszczenia w układzie globalnym X →, Y ↑, obrót ↺.</p>`;
    const s = model.set;
    h += `<p>Kombinacje wg PN-EN 1990 z załącznikiem krajowym: SGN ${s.comb === 'ab' ? 'wzory 6.10a i 6.10b (ξ = ' + fmt(s.xi, 2) + ')' : 'wzór 6.10'}, γ<sub>G,sup</sub> = ${fmt(s.gGs, 2)}, γ<sub>G,inf</sub> = ${fmt(s.gGi, 2)}, γ<sub>Q</sub> = ${fmt(s.gQ, 2)}; SGU: charakterystyczna 6.14b, częsta 6.15b, quasi-stała 6.16b; wyjątkowa 6.11b (wiodące z ψ${s.accPsi === 2 ? '₂' : '₁'}). Obwiednie wyznaczane punkt po punkcie – obciążenia zmienne włączane tylko tam, gdzie niekorzystne.${s.width ? ' Nad podporami pośrednimi o szerokości b moment zaokrąglony: ΔM = R·b/8 (PN-EN 1992-1-1, 5.3.2.2(4)).' : ''}</p>`;
    if (!res || !res.ok) {
      h += '<h2>Błąd</h2><p>' + (res ? res.errors.map(esc).join('<br>') : '') + '</p>';
    }
    // ---- dane
    if (opts.data) {
      h += '<h2>2. Schemat statyczny i dane</h2>';
      h += fig(model, res, null, 'model', { dims: true, loads: 'none' });
      h += cap('Schemat statyczny – numeracja węzłów i prętów, podpory, przeguby, wymiary [m].');
      const usedSecs = model.secs.filter(q => model.members.some(x => x.sec === q.uid));
      if (usedSecs.length > 1) {
        h += fig(model, res, null, 'secs', { nodeNums: false, memNums: true });
        h += legend(usedSecs.map(q => [D.secColor(model, q.uid), esc(q.name) + ' – pręty ' + UI.compactList(model.members.filter(x => x.sec === q.uid).map(x => memNoR(x.uid)))]));
        h += cap('Przekroje prętów – kolor wg przekroju, grubość linii proporcjonalna do wysokości przekroju.');
      }
      h += '<h3>Węzły</h3>' + tbl(['Nr', 'x [m]', 'y [m]', 'Przegub', 'Podpora'], model.nodes.map((n, i) => [i + 1, fmt(n.x, 3), fmt(n.y, 3), n.hinge ? 'tak' : '', esc(UI.supSummary(n.sup))]), [0, 1, 1, 0, 0]);
      h += '<h3>Pręty</h3>' + tbl(['Nr', 'Węzły', 'L [m]', 'α [°]', 'Przekrój', 'A [cm²]', 'I [cm⁴]', 'EI [kNm²]', 'Przeguby'], model.members.map((x, i) => {
        const a = model.nodes.find(n => n.uid === x.i), b = model.nodes.find(n => n.uid === x.j);
        const no = (u) => model.nodes.findIndex(n => n.uid === u) + 1;
        const sec = model.secs.find(q => q.uid === x.sec), p = E.secProps(sec), mt = sec && model.mats.find(q => q.uid === sec.mat);
        return [i + 1, no(x.i) + ' → ' + no(x.j), fmt(Math.hypot(b.x - a.x, b.y - a.y), 3), fmt(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, 1), esc(sec ? sec.name : '?'),
          p ? fmt(p.A * 1e4, 2) : '–', p ? fmt(p.I * 1e8, 0) : '–', p && mt ? fmt(mt.E * 1e6 * p.I, 0) : '–', [x.ri || a.hinge ? 'początek' : '', x.rj || b.hinge ? 'koniec' : ''].filter(Boolean).join(', ')];
      }), [0, 0, 1, 1, 0, 1, 1, 1, 0]);
      h += '<h3>Przekroje i materiały</h3>' + tbl(['Przekrój', 'A [cm²]', 'I [cm⁴]', 'h [mm]', 'Materiał', 'E [GPa]', 'γ [kN/m³]', 'α<sub>T</sub> [1/K]'], model.secs.filter(q => model.members.some(x => x.sec === q.uid)).map(q => {
        const p = E.secProps(q), mt = model.mats.find(x => x.uid === q.mat) || {};
        return [esc(q.name), p ? fmt(p.A * 1e4, 2) : '–', p ? fmt(p.I * 1e8, 0) : '–', p ? fmt(p.h * 1000, 0) : '–', esc(mt.name || ''), fmt(+mt.E, 1), fmt(+mt.g, 2), (+mt.a || 0).toExponential(1).replace('.', ',')];
      }), [0, 1, 1, 1, 0, 1, 1, 1]);
      const sups = model.nodes.filter(n => n.sup);
      if (sups.length) h += '<h3>Podpory</h3>' + tbl(['Węzeł', 'Kierunek x′', 'Kierunek y′', 'Obrót', 'Obrót podpory', 'Szerokość b'], sups.map(n => {
        const ns = E.normSup(n.sup);
        const d = (i, u) => ns.f[i] === 1 ? 'zablokowany' : ns.f[i] === 2 ? 'sprężysty k = ' + fmt(ns.k[i], 0) + ' ' + u : 'swobodny';
        return [model.nodes.indexOf(n) + 1, d(0, 'kN/m'), d(1, 'kN/m'), d(2, 'kNm/rad'), fmt(ns.ang, 1) + '°', ns.b ? fmt(ns.b, 2) + ' m' : '–'];
      }));
    }
    // ---- obciążenia
    if (opts.cases) {
      h += '<h2>3. Obciążenia</h2>';
      const anyLoad = model.cases.some(c => c.loads.length || c.selfWeight);
      if (anyLoad) {
        h += fig(model, res, null, 'loads', { nodeNums: false, memNums: true, sw: true, caseTags: true });
        h += legend(model.cases.filter(c => c.loads.length || c.selfWeight).map(c => [D.caseColor(model, c.uid), UI.caseCode(c) + ' – ' + esc(c.name)]));
        h += cap('Wszystkie zadane obciążenia (wartości charakterystyczne); kolor wg przypadku, c.w. – ciężar własny prętów.');
        // zestawienie
        h += '<h3>Zestawienie obciążeń</h3>';
        const rows = [];
        for (const c of model.cases) {
          const code = UI.caseCode(c);
          if (c.selfWeight) rows.push([code, 'wszystkie pręty', 'Ciężar własny', 'A·γ (automatycznie)', fmt(UI.selfWeightTotal())]);
          for (const l of c.loads) {
            const W = UI.loadResultant(l);
            rows.push([code, UI.isNodeLoad(l.type) ? 'węzeł ' + (model.nodes.findIndex(n => n.uid === l.node) + 1) : 'pręt ' + memNoR(l.m), UI.LT[l.type], esc(UI.loadSummary(l)), W === null ? '–' : fmt(W)]);
          }
        }
        h += tbl(['Przyp.', 'Element', 'Rodzaj', 'Wartości', 'Wypadkowa [kN]'], rows, [0, 0, 0, 0, 1]);
        if (res && res.ok) {
          h += tbl(['Przypadek', 'Rodzaj', 'ΣF<sub>x</sub> [kN] (→)', 'ΣF<sub>y</sub> [kN] (↓)', 'ΣM<sub>0</sub> [kNm] (↺)'], model.cases.map(c => {
            const sm = UI.caseSums(c.uid) || [0, 0, 0];
            return [UI.caseCode(c) + ' – ' + esc(c.name), { G: 'stałe', Q: 'zmienne', A: 'wyjątkowe' }[c.type || 'G'], fmt(sm[0]), fmt(-sm[1]), fmt(sm[2])];
          }), [0, 0, 1, 1, 1]);
          h += '<p class="note">Sumy obciążeń w przypadkach (z ciężarem własnym) względem początku układu współrzędnych.</p>';
        }
      }
      model.cases.forEach((c, ci) => {
        const code = UI.caseCode(c);
        let info = { G: 'stałe', Q: 'zmienne', A: 'wyjątkowe' }[c.type || 'G'];
        if (c.type === 'Q') {
          const ps = E.psiOf(c);
          info += ', ' + (E.CATS[c.cat || 'B'] || {}).n + ', ψ₀ = ' + fmt(ps[0], 2) + ', ψ₁ = ' + fmt(ps[1], 2) + ', ψ₂ = ' + fmt(ps[2], 2);
          const g = model.groups.find(x => x.uid === c.grp);
          if (g) info += ', grupa „' + esc(g.name) + '” (' + (g.mode === 'sum' ? 'jedno oddziaływanie' : 'wykluczające się') + ')';
        }
        h += `<h3>${code}: ${esc(c.name)}</h3><p class="note">Obciążenie ${info}.${c.selfWeight ? ' Zawiera ciężar własny prętów.' : ''}</p>`;
        if (c.loads.length || c.selfWeight) {
          if (c.loads.length) h += fig(model, res, null, 'model', { loads: 'active', caseUid: c.uid, nodeNums: false, memNums: true });
          if (c.loads.length) h += cap('Obciążenia przypadku ' + code + '.');
          h += tbl(['Gdzie', 'Rodzaj', 'Wartości'], c.loads.map(l => [UI.isNodeLoad(l.type) ? 'węzeł ' + (model.nodes.findIndex(n => n.uid === l.node) + 1) : 'pręt ' + (model.members.findIndex(x => x.uid === l.m) + 1), UI.LT[l.type], esc(UI.loadSummary(l))]));
        }
      });
    }
    if (!res || !res.ok) return h;
    // ---- wyniki
    h += '<h2>4. Wyniki</h2>';
    const views = E.availableViews(model, res);
    const sel = [];
    if (opts.caseDiag) views.filter(v => v.key.startsWith('case:')).forEach(v => sel.push(v));
    if (opts.combos) views.filter(v => v.key.startsWith('combo:')).forEach(v => sel.push(v));
    views.filter(v => v.key.startsWith('env:') && opts.envs[v.key.slice(4)]).forEach(v => sel.push(v));
    for (const v of sel) {
      const view = E.getView(model, res, v.key);
      h += `<h3>${esc(v.label)}</h3>`;
      if (view.env) for (const t of E.ruleText(res, v.key.slice(4))) h += `<div class="formula">${esc(t.lab + ': ' + t.txt)}</div>`;
      else if (v.key.startsWith('combo:')) { const f = E.linFactors(model, res, v.key); h += `<div class="formula">${esc(E.describe(res, { f, lab: '' }))}</div>`; }
      const isSLS = /CHR|FRQ|QP/.test(v.key);
      const diags = isSLS ? ['def', 'M'] : ['M', 'V', 'N', 'R'];
      if (!view.env) diags.push('def');
      const nm = { M: 'momenty zginające M [kNm]', V: 'siły tnące T [kN]', N: 'siły normalne N [kN]', R: 'reakcje podporowe', def: view.env ? 'obwiednia ugięć prętów [mm]' : 'deformacja [mm]' };
      for (const d of [...new Set(diags)]) {
        h += fig(model, res, view, d, { loads: 'none' });
        h += cap(`${esc(v.label)} – ${nm[d]}${view.env && d !== 'R' ? ' (niebieski – max, czerwony – min)' : ''}.`);
      }
      if (opts.tables) h += tables(model, res, view, v.key);
    }
    return h;
  }

  function tables(model, res, view, key) {
    let h = '';
    const env = view.env;
    const two = (a, i, f) => env ? f(a.max[i]) + ' / ' + f(a.min[i]) : f(a.max[i]);
    const fk = (x) => fmt(x), fmm = (x) => fmt(x * 1000, 2), fmr = (x) => fmt(x * 1000, 3);
    h += '<p class="note"><b>Reakcje</b>' + (env ? ' (max / min)' : '') + '</p>';
    h += tbl(['Węzeł', 'R<sub>x</sub> [kN] (+→)', 'R<sub>y</sub> [kN] (+↑)', 'M [kNm] (+↺)'], res.supNodes.map(n => {
      const r = view.reac.get(n), f = res.nodes[n].sup.f;
      return [res.nodes[n].no].concat([0, 1, 2].map(i => (f[i] || (i < 2 && res.nodes[n].sup.ang)) ? two(r.g, i, fk) : '–'));
    }), [0, 1, 1, 1]);
    if (env) {
      const dec = [];
      for (const n of res.supNodes) for (const [k, nm] of [[1, 'R_y'], [0, 'R_x'], [2, 'M']]) {
        if (!res.nodes[n].sup.f[k]) continue;
        const vec = E.vecReac(res, n, k, false);
        const a = E.decisive(model, res, key, vec, 1), b = E.decisive(model, res, key, vec, -1);
        dec.push(['węzeł ' + res.nodes[n].no + ', ' + nm, fmt(a.v) + ': ' + esc(E.describe(res, a)), fmt(b.v) + ': ' + esc(E.describe(res, b))]);
      }
      h += tbl(['Reakcja', 'max – kombinacja decydująca', 'min – kombinacja decydująca'], dec);
    } else {
      const a = view.sumL, b = view.sumR;
      h += `<p class="note">Równowaga: ΣF<sub>x</sub> = ${fmt(a[0] + b[0], 4)} kN, ΣF<sub>y</sub> = ${fmt(a[1] + b[1], 4)} kN, ΣM<sub>0</sub> = ${fmt(a[2] + b[2], 4)} kNm (obciążenia: F<sub>x</sub> = ${fmt(a[0])}, F<sub>y</sub> = ${fmt(a[1])} kN).</p>`;
    }
    h += '<p class="note"><b>Siły wewnętrzne – wartości ekstremalne w prętach</b></p>';
    const rows = [];
    res.mem.forEach((m, mi) => {
      const o = view.mem[mi];
      const ex = (q, kk, s) => { const a = o[q][kk]; let bi = 0; for (let i = 0; i < a.length; i++) if (s * a[i] > s * a[bi]) bi = i; return bi; };
      const cell = (q, kk, s, f) => { const i = ex(q, kk, s); return f(o[q][kk][i]) + ' <span style="color:#777">(' + fmt(m.xs[i], 2) + ')</span>'; };
      const fr = Math.max(Math.abs(Math.max(...o.fr.max)), Math.abs(Math.min(...o.fr.min)));
      rows.push([m.no, cell('N', 'max', 1, fk), cell('N', 'min', -1, fk), cell('V', 'max', 1, fk), cell('V', 'min', -1, fk), cell('M', 'max', 1, fk), cell('M', 'min', -1, fk), fmm(fr) + (fr > 1e-9 ? ' (L/' + Math.round(m.L / fr) + ')' : '')]);
    });
    h += tbl(['Pręt', 'N<sub>max</sub> [kN] (x)', 'N<sub>min</sub>', 'T<sub>max</sub> [kN]', 'T<sub>min</sub>', 'M<sub>max</sub> [kNm]', 'M<sub>min</sub>', 'f [mm]'], rows, [0, 1, 1, 1, 1, 1, 1, 1]);
    if (env) {
      const dec = [];
      res.mem.forEach((m, mi) => {
        const o = view.mem[mi];
        for (const [kk, s, lab] of [['max', 1, 'M max'], ['min', -1, 'M min']]) {
          const a = o.M[kk]; let bi = 0; for (let i = 0; i < a.length; i++) if (s * a[i] > s * a[bi]) bi = i;
          if (Math.abs(a[bi]) < 1e-6) continue;
          const d = E.decisive(model, res, key, E.vecMember(res, mi, 'M', bi), s);
          dec.push(['pręt ' + m.no + ', ' + lab + ' (x = ' + fmt(m.xs[bi], 2) + ' m)', fmt(d.v), esc(E.describe(res, d))]);
        }
      });
      h += tbl(['Wartość', 'M [kNm]', 'Kombinacja decydująca'], dec, [0, 1, 0]);
    }
    h += '<p class="note"><b>Przemieszczenia węzłów</b></p>';
    h += tbl(['Węzeł', 'u<sub>x</sub> [mm]', 'u<sub>y</sub> [mm]', 'φ [mrad] (+↺)'], res.nodes.map((n, i) => [n.no, two(view.dg, 3 * i, fmm), two(view.dg, 3 * i + 1, fmm), res.kind[3 * i + 2] === 3 ? 'przegub' : two(view.dg, 3 * i + 2, fmr)]), [0, 1, 1, 1]);
    if (res.supw.length) {
      h += '<p class="note"><b>Podpory o szerokości b</b> – M w osi, ΔM = R·b/8, M zredukowany, M i T w licu podpory</p>';
      h += tbl(['Węzeł / pręt', 'M oś [kNm]', 'ΔM', 'M zred.', 'M lico', 'T lico [kN]'], res.supw.map((it, i) => {
        const a = view.supw[i];
        return [res.nodes[it.n].no + ' / ' + res.mem[it.mi].no + ' (b = ' + fmt(it.b, 2) + ' m)'].concat([0, 1, 2, 3, 4].map(k => (k === 1 || k === 2) && !it.round ? '–' : two(a, k, fk)));
      }), [0, 1, 1, 1, 1, 1]);
    }
    return h;
  }

  function render(U) {
    const r = document.getElementById('report');
    const envNames = { ULS: 'SGN', ACC: 'SGN wyjątkowa', CHR: 'SGU char.', FRQ: 'SGU częsta', QP: 'SGU quasi-stała' };
    r.innerHTML = `<div class="rbar"><button class="pri" id="rpPrint">Drukuj / zapisz PDF</button><button id="rpHtml">Zapisz HTML</button><button id="rpClose">Zamknij (Esc)</button>
      <div class="opts"><label class="chk"><input type="checkbox" data-o="data"${opts.data ? ' checked' : ''}> dane modelu</label><label class="chk"><input type="checkbox" data-o="cases"${opts.cases ? ' checked' : ''}> obciążenia</label>
      <label class="chk"><input type="checkbox" data-o="caseDiag"${opts.caseDiag ? ' checked' : ''}> wyniki przypadków</label><label class="chk"><input type="checkbox" data-o="combos"${opts.combos ? ' checked' : ''}> kombinacje użytk.</label>
      ${Object.keys(envNames).map(k => `<label class="chk"><input type="checkbox" data-e="${k}"${opts.envs[k] ? ' checked' : ''}> ${envNames[k]}</label>`).join('')}
      <label class="chk"><input type="checkbox" data-o="tables"${opts.tables ? ' checked' : ''}> tabele</label></div></div>
      <div class="page rep">${build(U)}</div>`;
    r.hidden = false;
    r.querySelector('#rpPrint').onclick = () => window.print();
    r.querySelector('#rpClose').onclick = close;
    r.querySelector('#rpHtml').onclick = () => {
      const css = Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(x => x.cssText).filter(t => /\.rep|\.formula|:root/.test(t)).join('\n'); } catch (e) { return ''; } }).join('\n');
      const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(U.model.name || 'Raport')}</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#fff;margin:0}.page{max-width:210mm;margin:0 auto;padding:12mm}${css}</style></head><body><div class="page rep">${r.querySelector('.page').innerHTML}</div></body></html>`;
      window.R2UI.saveHtml(html, (U.model.name || 'raport').replace(/[\\/:*?"<>|]+/g, '_') + ' – raport.html');
    };
    r.querySelectorAll('[data-o]').forEach(i => i.onchange = () => { opts[i.dataset.o] = i.checked; render(U); });
    r.querySelectorAll('[data-e]').forEach(i => i.onchange = () => { opts.envs[i.dataset.e] = i.checked; render(U); });
  }
  function close() { const r = document.getElementById('report'); r.hidden = true; r.innerHTML = ''; }
  window.R2R = { open: render, close, build };
})();
