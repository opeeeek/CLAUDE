/* =====================================================================
   BM-Win · Statyka – raport obliczeń (podgląd, druk/PDF, ODT, HTML)
   ===================================================================== */
(function (root) {
  'use strict';
  const { h, fmt, fmtS, esc } = BM;
  const F = BMFEM, V = BMView, SEC = BMSEC, MAT = BMMAT;

  // rysunek do raportu – stałe kolory (niezależne od motywu)
  function drawing(model, opts, w = 760, hh) {
    const is3 = model.dim === '3D';
    const vs = { dim: model.dim, yaw: -35, pitch: 25, w, h: hh || (is3 ? 460 : 340), grid: 0 };
    V.fit(model, vs, 46);
    const svg = V.render(model, vs, Object.assign({ bg: '#fff', sections: new Map((model.sections || []).map(s => [String(s.id), s.name])), show: Object.assign({ grid: false, ids: true, nodeIds: true }, opts.show || {}) }, opts));
    return svg.replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
  }
  const fig = (svg, cap) => h('figure', null, h('div', { html: svg }), cap ? h('figcaption', null, cap) : null);
  const table = (head, rows, numCols) => {
    const t = h('table', null, h('tr', null, head.map(x => h('th', { html: x }))));
    rows.forEach(r => t.append(h('tr', null, r.map((c, i) => h('td', { class: numCols && numCols.includes(i) ? 'n' : '', html: String(c) })))));
    return t;
  };

  function build(A, opts) {
    const P = A.P, is3 = P.dim === '3D';
    const rep = h('div', { class: 'report' });
    const model = { dim: P.dim, nodes: P.nodes, members: P.members, supports: P.supports, loads: P.loads, cases: P.cases, sections: P.sections };
    // nagłówek
    rep.append(h('table', { class: 'hdrtab', style: { width: '100%', marginBottom: '10px' } },
      h('tr', null, h('td', { style: { width: '60%' } }, h('b', null, 'Obiekt / element: '), esc(P.name || '')), h('td', null, h('b', null, 'Data: '), esc(P.date || BM.today()))),
      h('tr', null, h('td', null, h('b', null, 'Opracował: '), esc(P.author || '')), h('td', null, h('b', null, 'Program: '), 'BM-Win · Statyka'))));
    rep.append(h('h1', null, opts.full ? 'Obliczenia statyczne' : 'Wyniki obliczeń statycznych'));
    rep.append(h('p', { class: 'small' }, `Model ${is3 ? 'przestrzenny (3D)' : 'płaski (2D)'} – metoda elementów skończonych, elementy prętowe ${P.analysis.shear ? 'Timoshenko (z odkształcalnością postaciową)' : 'Eulera–Bernoulliego'}. Kombinacje oddziaływań wg PN-EN 1990 z Załącznikiem krajowym (${P.combo.rule === '6.10' ? 'wzór 6.10' : 'wzory 6.10a i 6.10b'}). Jednostki: kN, m, kNm.`));

    const r = A.analyze();
    let sec = 1;
    if (opts.full) {
      // ---------------------------------------------------------- geometria
      rep.append(h('h2', null, `${sec++}. Geometria i schemat statyczny`));
      if (opts.drawings) rep.append(fig(drawing(model, { show: { loads: false, secNames: true } }), 'Rys. Schemat statyczny – numeracja węzłów i prętów, przekroje'));
      rep.append(h('h3', null, 'Węzły'));
      rep.append(table(['Nr', 'X [m]', 'Y [m]'].concat(is3 ? ['Z [m]'] : []), P.nodes.map(n => [n.id, fmt(+n.x, 3), fmt(+n.y, 3)].concat(is3 ? [fmt(+(n.z || 0), 3)] : [])), [1, 2, 3]));
      rep.append(h('h3', null, 'Pręty'));
      rep.append(table(['Nr', 'Węzeł pocz.', 'Węzeł końc.', 'L [m]', 'Przekrój', 'Typ', 'Przeguby'].concat(is3 ? ['β [°]'] : []), P.members.map(m => {
        const a = A.nodeById(m.n1), b = A.nodeById(m.n2), L = a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) : NaN;
        const hg = (rel) => rel && (rel[4] || rel[5]); const hs = m.type === 'truss' ? '—' : [hg(m.rel1) ? 'pocz.' : '', hg(m.rel2) ? 'koniec' : ''].filter(Boolean).join(', ') || '—';
        return [m.id, m.n1, m.n2, fmt(L, 3), esc((A.secById(m.sec) || {}).name || ''), m.type === 'truss' ? 'kratowy' : 'belkowy', hs].concat(is3 ? [fmt(m.beta || 0, 1)] : []);
      }), [3]));
      // ---------------------------------------------------------- przekroje
      rep.append(h('h2', null, `${sec++}. Przekroje i materiały`));
      rep.append(table(['Nr', 'Przekrój', 'Materiał', 'A [cm²]', 'I<sub>y</sub> [cm⁴]', 'I<sub>z</sub> [cm⁴]', 'I<sub>t</sub> [cm⁴]', 'E [GPa]', 'γ [kN/m³]'], P.sections.map(s => {
        const p = SEC.compute(s.def) || {}, m = MAT.byId[s.mat] || {};
        return [s.id, esc(s.name), esc(m.name || s.mat), fmt(p.A / 100, 2), fmtS(p.Iy / 1e4), fmtS(p.Iz / 1e4), fmtS(p.It / 1e4), fmt(m.E, 1), fmt(m.gamma, 2)];
      }), [3, 4, 5, 6, 7, 8]));
      // ---------------------------------------------------------- podpory
      rep.append(h('h2', null, `${sec++}. Podpory`));
      const dn = is3 ? [[0, 'u<sub>x</sub>'], [1, 'u<sub>y</sub>'], [2, 'u<sub>z</sub>'], [3, 'φ<sub>x</sub>'], [4, 'φ<sub>y</sub>'], [5, 'φ<sub>z</sub>']] : [[0, 'u<sub>x</sub>'], [1, 'u<sub>y</sub>'], [5, 'φ']];
      rep.append(table(['Węzeł'].concat(dn.map(d => d[1])), P.supports.map(s => [s.node].concat(dn.map(([i]) => (s.fix || [])[i] ? 'blok.' : (+(s.k || [])[i] > 0 ? `k = ${fmtS(+s.k[i])}` : '—'))))));
      // ---------------------------------------------------------- obciążenia
      rep.append(h('h2', null, `${sec++}. Oddziaływania`));
      rep.append(table(['Przypadek', 'Rodzaj', 'ψ<sub>0</sub>', 'ψ<sub>1</sub>', 'ψ<sub>2</sub>', 'Grupa', 'Ciężar własny'], P.cases.map(c => { const ps = F.psiOf(c); return [esc(c.name), F.CASE_TYPES[c.type] + (c.cat ? ` (kat. ${c.cat})` : ''), c.type === 'G' ? '—' : fmt(ps.p0, 1), c.type === 'G' ? '—' : fmt(ps.p1, 1), c.type === 'G' ? '—' : fmt(ps.p2, 1), esc(c.group || '—'), c.selfWeight ? 'tak' : '—']; }), [2, 3, 4]));
      P.cases.forEach(c => {
        const ls = P.loads.filter(l => String(l.case) === String(c.id));
        rep.append(h('h3', null, `Przypadek: ${c.name}`));
        if (c.selfWeight) rep.append(h('p', null, 'Ciężar własny prętów – generowany automatycznie (A·γ).'));
        if (!ls.length) { if (!c.selfWeight) rep.append(h('p', { class: 'small' }, 'brak obciążeń')); return; }
        if (opts.drawings) rep.append(fig(drawing(model, { activeCase: c.id, show: { ids: true, nodeIds: false } }, 760, is3 ? 400 : 280), `Rys. Obciążenia – ${esc(c.name)}`));
        rep.append(table(['Rodzaj', 'Element', 'Kierunek', 'Wartość', 'Położenie'], ls.map(l => {
          if (l.type === 'nodal') { const Fv = l.F || []; const nm = is3 ? ['F<sub>x</sub>', 'F<sub>y</sub>', 'F<sub>z</sub>', 'M<sub>x</sub>', 'M<sub>y</sub>', 'M<sub>z</sub>'] : ['F<sub>x</sub>', 'F<sub>y</sub>', '', '', '', 'M']; return ['siła węzłowa', 'węzeł ' + l.node, '', nm.map((n, i) => +Fv[i] ? `${n} = ${fmt(+Fv[i])}` : '').filter(Boolean).join('; '), '']; }
          if (l.type === 'dist') return ['rozłożone', 'pręt ' + l.member, l.dir + (l.proj ? ' (na rzut)' : ''), (l.q2 ?? l.q1) === l.q1 ? `q = ${fmt(l.q1)} kN/m` : `q = ${fmt(l.q1)} … ${fmt(l.q2)} kN/m`, (l.a ?? 0) === 0 && (l.b ?? 1) === 1 ? 'cały pręt' : `${fmt(l.a ?? 0)}…${fmt(l.b ?? 1)} L`];
          if (l.type === 'point') return ['skupione', 'pręt ' + l.member, l.dir, `P = ${fmt(l.P)} kN`, `${fmt(l.a ?? 0.5)} L`];
          if (l.type === 'moment') return ['moment skupiony', 'pręt ' + l.member, l.dir, `M = ${fmt(l.M)} kNm`, `${fmt(l.a ?? 0.5)} L`];
          return ['temperatura', 'pręt ' + l.member, '', `ΔT = ${fmt(l.dT || 0, 1)} K${l.dTz ? `, ΔT<sub>z</sub> = ${fmt(l.dTz, 1)} K` : ''}`, ''];
        })));
      });
      // ---------------------------------------------------------- kombinacje
      rep.append(h('h2', null, `${sec++}. Kombinacje oddziaływań`));
      const fc = A.comboFactors();
      rep.append(h('p', null, P.combo.rule === '6.10' ? `SGN (STR/GEO): Σγ<sub>G</sub>G<sub>k</sub> + γ<sub>Q</sub>Q<sub>k,1</sub> + Σγ<sub>Q</sub>ψ<sub>0,i</sub>Q<sub>k,i</sub>; γ<sub>G,sup</sub> = ${fmt(fc.gGsup)}, γ<sub>G,inf</sub> = ${fmt(fc.gGinf)}, γ<sub>Q</sub> = ${fmt(fc.gQ)}.`
        : `SGN (STR/GEO) – mniej korzystny z wzorów (6.10a): Σγ<sub>G</sub>G<sub>k</sub> + Σγ<sub>Q</sub>ψ<sub>0,i</sub>Q<sub>k,i</sub> oraz (6.10b): Σξγ<sub>G</sub>G<sub>k</sub> + γ<sub>Q</sub>Q<sub>k,1</sub> + Σγ<sub>Q</sub>ψ<sub>0,i</sub>Q<sub>k,i</sub>; γ<sub>G,sup</sub> = ${fmt(fc.gGsup)}, γ<sub>G,inf</sub> = ${fmt(fc.gGinf)}, γ<sub>Q</sub> = ${fmt(fc.gQ)}, ξ = ${fmt(fc.xi)}.`));
      rep.append(h('p', null, 'SGU: charakterystyczna ΣG + Q₁ + Σψ₀Q; częsta ΣG + ψ₁Q₁ + Σψ₂Q; quasi-stała ΣG + Σψ₂Q. Obciążenia z tej samej grupy (np. kierunki wiatru) nie występują jednocześnie.'));
      ['ULS', 'SLS_CH', 'SLS_QP'].forEach(set => {
        const list = A.combosOf(set);
        rep.append(h('h3', null, `${F.SET_NAMES[set]} – ${list.length} kombinacji`));
        rep.append(table(['Nr', 'Kombinacja'], list.slice(0, 60).map((c, i) => [i + 1, esc(F.describeFactors(P.cases, c.factors))])));
        if (list.length > 60) rep.append(h('p', { class: 'small' }, `… oraz ${list.length - 60} dalszych kombinacji.`));
      });
    } else {
      if (opts.drawings) rep.append(fig(drawing(model, { show: { loads: false, secNames: true } }), 'Rys. Schemat statyczny'));
    }

    // ------------------------------------------------------------ wyniki
    rep.append(h('h2', null, `${sec++}. Wyniki obliczeń statycznych`));
    if (!r) { rep.append(h('p', { class: 'fail' }, 'Brak wyników: ' + esc((A.extra.err || []).join(' ') || 'model niepoprawny'))); return rep; }
    const uls = A.envelope('ULS');
    const qs = is3 ? [['My', 'M<sub>y</sub>', 'kNm'], ['Mz', 'M<sub>z</sub>', 'kNm'], ['Vz', 'V<sub>z</sub>', 'kN'], ['Vy', 'V<sub>y</sub>', 'kN'], ['N', 'N', 'kN'], ['T', 'T', 'kNm']] : [['My', 'M', 'kNm'], ['Vz', 'V', 'kN'], ['N', 'N', 'kN']];
    rep.append(h('h3', null, 'Obwiednia sił przekrojowych – SGN'));
    if (opts.drawings) qs.slice(0, is3 ? 3 : 3).forEach(([k, lbl, u]) => rep.append(fig(drawing(model, { diagram: { key: k, members: uls.members, env: true, scale: 1 }, show: { ids: true, nodeIds: false, loads: false } }, 760, is3 ? 420 : 300), `Rys. Obwiednia ${lbl.replace(/<[^>]+>/g, '')} [${u}] – SGN`)));
    // ekstrema w prętach z kombinacją decydującą
    qs.forEach(([k, lbl, u]) => {
      const rows = [];
      uls.members.forEach(m => {
        let mn = { v: Infinity }, mx = { v: -Infinity };
        m.st.forEach(s => { const v = s[k], f = s[k + '_f']; if (v[0] < mn.v) mn = { v: v[0], x: s.x, f: f[0] }; if (v[1] > mx.v) mx = { v: v[1], x: s.x, f: f[1] }; });
        if (Math.abs(mn.v) < 1e-6 && Math.abs(mx.v) < 1e-6) return;
        rows.push([m.id, fmt(mx.v), fmt(mx.x), fmt(mn.v), fmt(mn.x), esc(F.describeFactors(P.cases, Math.abs(mx.v) >= Math.abs(mn.v) ? mx.f : mn.f))]);
      });
      if (!rows.length) return;
      rep.append(h('h3', null, `${lbl} [${u}] – wartości ekstremalne (SGN)`));
      rep.append(table(['Pręt', 'max', 'x [m]', 'min', 'x [m]', 'Kombinacja decydująca dla |ekstremum|'], rows, [1, 2, 3, 4]));
    });
    // reakcje
    const reacTab = (env, title) => {
      const comps = is3 ? [[0, 'R<sub>x</sub>'], [1, 'R<sub>y</sub>'], [2, 'R<sub>z</sub>'], [3, 'M<sub>x</sub>'], [4, 'M<sub>y</sub>'], [5, 'M<sub>z</sub>']] : [[0, 'R<sub>x</sub> [kN]'], [1, 'R<sub>y</sub> [kN]'], [5, 'M [kNm]']];
      rep.append(h('h3', null, title));
      rep.append(table(['Węzeł'].concat(comps.map(c => c[1] + ' min / max')), env.reactions.map(x => [x.node].concat(comps.map(([i]) => `${fmt(x.R[i][0])} / ${fmt(x.R[i][1])}`))), comps.map((_, i) => i + 1)));
    };
    reacTab(uls, 'Reakcje podporowe – obwiednia SGN');
    const slsc = A.envelope('SLS_CH');
    reacTab(slsc, 'Reakcje podporowe – obwiednia SGU (kombinacja charakterystyczna)');
    // przemieszczenia SGU
    rep.append(h('h3', null, 'Przemieszczenia węzłów – SGU charakterystyczna [mm]'));
    const dc = is3 ? [[0, 'u<sub>x</sub>'], [1, 'u<sub>y</sub>'], [2, 'u<sub>z</sub>']] : [[0, 'u<sub>x</sub>'], [1, 'u<sub>y</sub>']];
    rep.append(table(['Węzeł'].concat(dc.map(d => d[1] + ' min / max')), P.nodes.map((n, i) => [n.id].concat(dc.map(([k]) => `${fmt(slsc.disp[i][k][0] * 1000, 2)} / ${fmt(slsc.disp[i][k][1] * 1000, 2)}`))), dc.map((_, i) => i + 1)));
    // ugięcia prętów (względne) – obwiednia składowej poprzecznej względem cięciwy dla przypadków SGU
    const relRows = [];
    slsc.members.forEach(m => {
      const mm = A.memById(m.id); if (!mm || mm.type === 'truss') return;
      const a = A.nodeById(mm.n1), b = A.nodeById(mm.n2), L = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
      // przybliżenie: maksimum |uz| z obwiedni minus średnia końców
      let w = 0; const s0 = m.st[0], s1 = m.st[m.st.length - 1];
      m.st.forEach(s => { const t = s.x / L; for (const c of [0, 1]) { const rel = Math.abs(s.uz[c] - (s0.uz[c] + (s1.uz[c] - s0.uz[c]) * t)); w = Math.max(w, rel); } });
      if (w > 1e-7) relRows.push([m.id, fmt(L, 2), fmt(w * 1000, 2), 'L/' + Math.round(L / w)]);
    });
    if (relRows.length) { rep.append(h('h3', null, 'Ugięcia prętów względem cięciwy – SGU charakterystyczna')); rep.append(table(['Pręt', 'L [m]', 'u [mm]', 'L / u'], relRows, [1, 2, 3])); rep.append(h('p', { class: 'small' }, 'Wartości przybliżone z obwiedni; dokładne sprawdzenie ugięć w modułach wymiarowania (EC2/EC3/EC5).')); }

    if (opts.caseResults) {
      rep.append(h('h3', null, 'Wyniki dla przypadków obciążeń'));
      P.cases.forEach(c => {
        const cr = r.cases[c.id]; if (!cr) return;
        if (opts.drawings) rep.append(fig(drawing(model, { diagram: { key: is3 ? 'My' : 'My', members: cr.members, env: false }, show: { ids: false, nodeIds: false } }, 760, is3 ? 380 : 260), `Rys. ${is3 ? 'M<sub>y</sub>' : 'M'} [kNm] – ${esc(c.name)}`));
        rep.append(table(['Węzeł', 'R<sub>x</sub>', 'R<sub>y</sub>'].concat(is3 ? ['R<sub>z</sub>'] : ['M']), cr.reactions.map(x => [x.node, fmt(x.R[0]), fmt(x.R[1])].concat(is3 ? [fmt(x.R[2])] : [fmt(x.R[5])])), [1, 2, 3]));
      });
    }
    // stateczność i drgania
    const B = A.extra.buck;
    if (B && B.b.modes.length) {
      rep.append(h('h2', null, `${sec++}. Stateczność – wyboczenie liniowe`));
      rep.append(h('p', null, `Kombinacja: ${esc(B.c.name)}. Mnożniki obciążenia krytycznego α<sub>cr</sub>: ${B.b.modes.map((m, i) => `α<sub>cr,${i + 1}</sub> = ${fmt(m.alpha, 2)}`).join('; ')}.`));
      const a1 = B.b.modes[0].alpha;
      rep.append(h('p', null, a1 >= 10 ? h('span', { class: 'ok' }, `α_cr = ${fmt(a1, 2)} ≥ 10 – wpływ deformacji można pominąć (PN-EN 1993-1-1, 5.2.1(3)).`) : h('span', { class: 'fail' }, `α_cr = ${fmt(a1, 2)} < 10 – należy uwzględnić efekty II rzędu.`)));
      if (opts.drawings) rep.append(fig(drawing(model, { modeShape: { disp: B.b.modes[0].shape, scale: 1, unitLabel: () => '' }, show: { ids: false, nodeIds: false } }, 760, is3 ? 400 : 280), 'Rys. Pierwsza postać wyboczenia'));
    }
    const M = A.extra.modal;
    if (M && M.modes.length) {
      rep.append(h('h2', null, `${sec++}. Drgania własne`));
      rep.append(table(['Postać', 'f [Hz]', 'T [s]', 'm<sub>eff,X</sub> [%]', 'm<sub>eff,Y</sub> [%]'].concat(is3 ? ['m<sub>eff,Z</sub> [%]'] : []), M.modes.map((m, i) => [i + 1, fmt(m.f, 3), fmt(m.T, 3), fmt(m.massPart[0] * 100, 1), fmt(m.massPart[1] * 100, 1)].concat(is3 ? [fmt(m.massPart[2] * 100, 1)] : [])), [1, 2, 3, 4, 5]));
    }
    if (r.warnings && r.warnings.length) { rep.append(h('h3', null, 'Uwagi')); r.warnings.forEach(w => rep.append(h('p', { class: 'small' }, esc(w)))); }
    rep.append(h('p', { class: 'small', style: { marginTop: '18px' } }, 'Obliczenia wykonano programem BM-Win · Statyka. Wyniki należy zweryfikować przed użyciem w dokumentacji projektowej.'));
    return rep;
  }

  root.BMReportStat = { build, drawing };
})(typeof self !== 'undefined' ? self : this);
