/* Rama2D – rysowanie schematu i wyników (SVG jako tekst) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.R2D = factory(root.R2E);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const C = {
    mem: 'var(--c-mem,#1f2937)', sel: 'var(--c-sel,#2563eb)', node: 'var(--c-node,#111827)', muted: 'var(--c-muted,#6b7280)',
    grid: 'var(--c-grid,#e5e7eb)', sup: 'var(--c-sup,#374151)', load: 'var(--c-load,#c2410c)', loadF: 'var(--c-loadf,rgba(194,65,12,.10))',
    M: 'var(--c-M,#1d4ed8)', Mf: 'var(--c-Mf,rgba(29,78,216,.16))', V: 'var(--c-V,#047857)', Vf: 'var(--c-Vf,rgba(4,120,87,.16))',
    N: 'var(--c-N,#b45309)', Nf: 'var(--c-Nf,rgba(180,83,9,.16))', min: 'var(--c-min,#be123c)', minf: 'var(--c-minf,rgba(190,18,60,.12))',
    def: 'var(--c-def,#7c3aed)', reac: 'var(--c-reac,#dc2626)', dim: 'var(--c-dim,#4b5563)', bg: 'var(--c-bg,#ffffff)', plate: 'var(--c-plate,#cbd5e1)'
  };

  // paleta przypadków obciążeń i przekrojów (rozróżnialna na białym tle; bez błękitu zaznaczenia)
  const PAL = ['#c2410c', '#047857', '#7e22ce', '#b91c1c', '#0e7490', '#a16207', '#be185d', '#4d7c0f', '#4338ca', '#57534e', '#ea580c', '#0f766e'];
  const SPAL = ['#1f2937', '#c2410c', '#047857', '#7e22ce', '#0e7490', '#be185d', '#a16207', '#4338ca', '#b91c1c', '#4d7c0f', '#57534e', '#0f766e'];
  function caseColor(model, uid) { const i = model.cases.findIndex(c => c.uid === uid); return PAL[(i < 0 ? 0 : i) % PAL.length]; }
  function secColor(model, uid) { const i = model.secs.findIndex(c => c.uid === uid); return SPAL[(i < 0 ? 0 : i) % SPAL.length]; }
  function caseCodes(model) {
    const cnt = {}, out = new Map();
    for (const c of model.cases) { const t = c.type || 'G'; cnt[t] = (cnt[t] || 0) + 1; out.set(c.uid, t + cnt[t]); }
    return out;
  }
  // obciążenia od ciężaru własnego jako obciążenia prętowe (do rysunku)
  function selfWeightLoads(model) {
    const out = [];
    for (const m of model.members) {
      const sec = model.secs.find(x => x.uid === m.sec), p = E.secProps(sec), mat = sec && model.mats.find(x => x.uid === sec.mat);
      if (!p || !mat) continue;
      const q = p.A * (+mat.g || 0);
      if (q > 0) out.push({ type: 'q', m: m.uid, dir: 'Y', full: true, q1: q, q2: q, _sw: true });
    }
    return out;
  }

  function fmt(v, d) {
    if (!isFinite(v)) return '–';
    if (d === undefined) { const a = Math.abs(v); d = a >= 1000 ? 0 : a >= 100 ? 1 : 2; }
    let s = v.toFixed(d);
    if (/^-0[.,]?0*$/.test(s)) s = s.slice(1);
    return s.replace('.', ',').replace('-', '−');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (n) => (Math.round(n * 10) / 10);

  function bbox(model) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of model.nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    if (!isFinite(x0)) return { x0: -1, x1: 9, y0: -1, y1: 5 };
    return { x0, x1, y0, y1 };
  }
  function fit(model, W, H, pad) {
    const b = bbox(model);
    pad = pad || 80;
    const w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1);
    const k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    return { k, ox: W / 2 - (b.x0 + b.x1) / 2 * k, oy: H / 2 + (b.y0 + b.y1) / 2 * k };
  }

  // ------------------------------------------------------------------ prymitywy
  function arrow(x1, y1, x2, y2, col, w, head) {
    head = head || 7; w = w || 1.4;
    const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1) return '';
    const hx = x2 - Math.cos(a) * head, hy = y2 - Math.sin(a) * head;
    const p1 = [hx + Math.sin(a) * head * 0.38, hy - Math.cos(a) * head * 0.38], p2 = [hx - Math.sin(a) * head * 0.38, hy + Math.cos(a) * head * 0.38];
    return `<line x1="${P(x1)}" y1="${P(y1)}" x2="${P(hx)}" y2="${P(hy)}" stroke="${col}" stroke-width="${w}"/>` +
      `<path d="M${P(x2)} ${P(y2)}L${P(p1[0])} ${P(p1[1])}L${P(p2[0])} ${P(p2[1])}Z" fill="${col}"/>`;
  }
  // łuk momentu: cw = true zgodnie z ruchem wskazówek (na ekranie)
  function momentArc(x, y, r, cw, col, w) {
    const a0 = cw ? -150 : -30, a1 = cw ? 120 : 210; // stopnie ekranowe
    const rad = d => d * Math.PI / 180;
    const sx = x + r * Math.cos(rad(a0)), sy = y + r * Math.sin(rad(a0));
    const ex = x + r * Math.cos(rad(a1)), ey = y + r * Math.sin(rad(a1));
    const sweep = cw ? 1 : 0;
    const ta = rad(a1) + (cw ? Math.PI / 2 : -Math.PI / 2);
    const hx = ex - Math.cos(ta) * 6, hy = ey - Math.sin(ta) * 6;
    const n1 = [hx + Math.sin(ta) * 3, hy - Math.cos(ta) * 3], n2 = [hx - Math.sin(ta) * 3, hy + Math.cos(ta) * 3];
    return `<path d="M${P(sx)} ${P(sy)}A${r} ${r} 0 1 ${sweep} ${P(ex)} ${P(ey)}" fill="none" stroke="${col}" stroke-width="${w || 1.4}"/>` +
      `<path d="M${P(ex + Math.cos(ta) * 1)} ${P(ey + Math.sin(ta) * 1)}L${P(n1[0])} ${P(n1[1])}L${P(n2[0])} ${P(n2[1])}Z" fill="${col}"/>`;
  }
  function text(x, y, s, o) {
    o = o || {};
    const anc = o.anchor || 'middle', col = o.col || C.dim, sz = o.size || 11, wt = o.weight || 400;
    const halo = o.halo === false ? '' : ` paint-order="stroke" stroke="${C.bg}" stroke-width="3" stroke-linejoin="round"`;
    const rot = o.rot ? ` transform="rotate(${o.rot} ${P(x)} ${P(y)})"` : '';
    return `<text x="${P(x)}" y="${P(y)}" text-anchor="${anc}" dominant-baseline="${o.base || 'middle'}" font-size="${sz}" font-weight="${wt}" fill="${col}"${halo}${rot}>${esc(s)}</text>`;
  }
  function hatch(x1, x2, y, col, dir) {
    // kreskowanie pod linią (w układzie symbolu: +y w dół)
    let s = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="1.6"/>`;
    for (let x = x1 + 3; x <= x2; x += 5) s += `<line x1="${x}" y1="${y}" x2="${x - 5}" y2="${y + 6 * (dir || 1)}" stroke="${col}" stroke-width="0.9"/>`;
    return s;
  }
  function zigzag(len) { // sprężyna od (0,0) w dół o długości len
    let d = 'M0 0L0 5'; const n = 6, seg = (len - 10) / n;
    for (let i = 0; i < n; i++) d += `L${i % 2 ? -5 : 5} ${P(5 + seg * (i + 0.5))}`;
    d += `L0 ${len - 5}L0 ${len}`;
    return `<path d="${d}" fill="none" stroke="${C.sup}" stroke-width="1.3"/>`;
  }

  // ------------------------------------------------------------------ podpory
  function memberDirsAt(model, n, tr) {
    let dx = 0, dy = 0;
    for (const m of model.members) {
      let o = null;
      if (m.i === n.uid) o = model.nodes.find(q => q.uid === m.j);
      else if (m.j === n.uid) o = model.nodes.find(q => q.uid === m.i);
      if (!o) continue;
      const L = Math.hypot(o.x - n.x, o.y - n.y) || 1;
      dx += (o.x - n.x) / L; dy += -(o.y - n.y) / L; // ekran
    }
    const L = Math.hypot(dx, dy);
    return L > 1e-6 ? [dx / L, dy / L] : [0, -1];
  }

  function memberDirsList(model, n) {
    const out = [];
    for (const m of model.members) {
      let o = null;
      if (m.i === n.uid) o = model.nodes.find(q => q.uid === m.j);
      else if (m.j === n.uid) o = model.nodes.find(q => q.uid === m.i);
      if (!o) continue;
      const L = Math.hypot(o.x - n.x, o.y - n.y) || 1;
      out.push([(o.x - n.x) / L, -(o.y - n.y) / L]);
    }
    return out;
  }
  function drawSupport(model, n, tr, col) {
    const s = E.normSup(n.sup), f = s.f;
    if (!f.some(v => v)) return '';
    const sx = tr.ox + n.x * tr.k, sy = tr.oy - n.y * tr.k;
    const md = memberDirsAt(model, n, tr);
    col = col || C.sup;
    let g = '';
    const bpx = s.b > 0 ? Math.max(6, s.b * tr.k) : 0;
    const beta = s.ang;
    const fixT = (f[0] === 1) + (f[1] === 1);
    // orientacja „w dół” w układzie podpory; dla podpór z samym ux – w bok
    let rot = -beta;
    if (f[2] === 1 && fixT === 2) {
      // utwierdzenie: ściana po stronie najmniej zajętej przez pręty (preferowany dół)
      const dirs = memberDirsList(model, n);
      const cands = [[0, 1], [-1, 0], [1, 0], [0, -1]];
      let bc = cands[0], bs = Infinity;
      for (const cd of cands) { const sc = dirs.length ? Math.max(...dirs.map(d => d[0] * cd[0] + d[1] * cd[1])) : 0; if (sc < bs - 1e-6) { bs = sc; bc = cd; } }
      if (dirs.length === 1 && Math.abs(dirs[0][0]) > 0.05 && Math.abs(dirs[0][1]) > 0.05) bc = [-dirs[0][0], -dirs[0][1]];
      rot = Math.atan2(bc[1], bc[0]) * 180 / Math.PI - 90;
      g += `<g transform="translate(${P(sx)},${P(sy)}) rotate(${P(rot)})">`;
      const w = Math.max(28, bpx + 8);
      if (bpx) g += `<rect x="${-bpx / 2}" y="0" width="${bpx}" height="4" fill="${C.plate}" stroke="${col}" stroke-width="0.8"/>`;
      g += `<line x1="${-w / 2}" y1="${bpx ? 4 : 0}" x2="${w / 2}" y2="${bpx ? 4 : 0}" stroke="${col}" stroke-width="2.6"/>`;
      g += hatch(-w / 2, w / 2, bpx ? 4 : 0, col, 1).replace(/<line[^>]*stroke-width="1.6"\/>/, '');
      g += '</g>';
    } else if (f[0] === 1 && f[1] !== 1 && f[2] !== 1) {
      // reakcja tylko w kierunku x′ – symbol obrócony w bok
      const ux = [Math.cos(beta * Math.PI / 180), -Math.sin(beta * Math.PI / 180)];
      const side = (md[0] * ux[0] + md[1] * ux[1]) > 0 ? -1 : 1; // przeciwnie do prętów
      rot = -beta + (side > 0 ? -90 : 90);
      g += `<g transform="translate(${P(sx)},${P(sy)}) rotate(${P(rot)})">` + pinSym(col, bpx, true) + '</g>';
    } else if (fixT >= 1 && f[2] !== 1) {
      g += `<g transform="translate(${P(sx)},${P(sy)}) rotate(${P(rot)})">` + pinSym(col, bpx, fixT === 1 && f[1] === 1) + '</g>';
    } else if (f[2] === 1 && fixT === 1) {
      // utwierdzenie przesuwne
      if (f[0] === 1) {
        const ux = [Math.cos(beta * Math.PI / 180), -Math.sin(beta * Math.PI / 180)];
        const side = (md[0] * ux[0] + md[1] * ux[1]) > 0 ? -1 : 1;
        rot = -beta + (side > 0 ? -90 : 90);
      }
      g += `<g transform="translate(${P(sx)},${P(sy)}) rotate(${P(rot)})">`;
      const w = Math.max(24, bpx + 6);
      g += `<line x1="${-w / 2}" y1="0" x2="${w / 2}" y2="0" stroke="${col}" stroke-width="2.6"/>`;
      g += `<circle cx="${-w / 4}" cy="4.5" r="3.5" fill="${C.bg}" stroke="${col}" stroke-width="1.1"/><circle cx="${w / 4}" cy="4.5" r="3.5" fill="${C.bg}" stroke="${col}" stroke-width="1.1"/>`;
      g += hatch(-w / 2 - 3, w / 2 + 3, 9, col, 1);
      g += '</g>';
    }
    // sprężyny
    const sprDir = (ang) => `<g transform="translate(${P(sx)},${P(sy)}) rotate(${P(ang)})">${zigzag(28)}${hatch(-9, 9, 28, col, 1)}</g>`;
    if (f[1] === 2) g += sprDir(-beta + (fixT ? 0 : 0) + (f[0] === 1 ? 0 : 0)) ;
    if (f[0] === 2) {
      const ux = [Math.cos(beta * Math.PI / 180), -Math.sin(beta * Math.PI / 180)];
      const side = (md[0] * ux[0] + md[1] * ux[1]) > 0 ? -1 : 1;
      g += sprDir(-beta + (side > 0 ? -90 : 90));
    }
    if (f[2] === 2) {
      // sprężyna obrotowa – spirala
      let d = '';
      for (let t = 0; t <= 4 * Math.PI; t += 0.25) { const r = 3 + t * 1.5; d += (d ? 'L' : 'M') + P(sx + r * Math.cos(t)) + ' ' + P(sy + r * Math.sin(t)); }
      g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.2"/>`;
    }
    if (s.b > 0 && bpx >= 6) g += '';
    return g;
  }
  function pinSym(col, bpx, roller) {
    let g = '';
    let y0 = 0;
    if (bpx) { g += `<rect x="${P(-bpx / 2)}" y="0" width="${P(bpx)}" height="4" fill="${C.plate}" stroke="${col}" stroke-width="0.8"/>`; y0 = 4; }
    const hw = 9, h = 13;
    g += `<path d="M0 ${y0}L${-hw} ${y0 + h}L${hw} ${y0 + h}Z" fill="${C.bg}" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>`;
    g += `<circle cx="0" cy="${y0}" r="2.2" fill="${C.bg}" stroke="${col}" stroke-width="1.2"/>`;
    const w = Math.max(26, bpx + 6);
    if (roller) { g += `<line x1="${-w / 2}" y1="${y0 + h + 3}" x2="${w / 2}" y2="${y0 + h + 3}" stroke="${col}" stroke-width="1.4"/>`; g += hatch(-w / 2, w / 2, y0 + h + 6, col, 1); }
    else g += hatch(-w / 2, w / 2, y0 + h, col, 1);
    return g;
  }

  // ------------------------------------------------------------------ obciążenia
  function loadVecScreen(dir, c, s) {
    switch (dir) {
      case 'X': return [1, 0];
      case 'n': return [s, c]; // w stronę spodu (−y lokalne) na ekranie
      case 't': return [c, -s];
      default: return [0, 1];
    }
  }
  function qEff(ld) { return ld.unit === 'm2' ? (+ld.bw || 1) : 1; }

  function drawLoads(ctx, cs, col, hits, stack, scale, tag) {
    const { model, tr } = ctx;
    let g = '';
    const T = (str, ld) => (ld && ld._sw ? 'c.w. ' : '') + (tag ? tag + ': ' : '') + str;
    const nodeBy = new Map(model.nodes.map(n => [n.uid, n]));
    const memBy = new Map(model.members.map(m => [m.uid, m]));
    const S = (x, y) => [tr.ox + x * tr.k, tr.oy - y * tr.k];
    const sel = ctx.opt.sel || {};
    for (const ld of cs.loads) {
      const selected = sel.loads && sel.loads.has(ld.uid);
      const lc = selected ? C.sel : col;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      const ext = (x, y) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); };
      if (ld.type === 'P' || ld.type === 'S') {
        const n = nodeBy.get(ld.node); if (!n) continue;
        const [x, y] = S(n.x, n.y);
        if (ld.type === 'P') {
          const fx = +ld.Fx || 0, fy = +ld.Fy || 0, mm = +ld.M || 0;
          if (fx) { const L = 38; g += arrow(x - Math.sign(fx) * (L + 6), y, x - Math.sign(fx) * 6, y, lc, 1.8, 8); g += text(x - Math.sign(fx) * (L + 10), y - 9, T(fmt(Math.abs(fx)) + ' kN'), { col: lc, anchor: fx > 0 ? 'end' : 'start' }); ext(x - Math.sign(fx) * (L + 40), y - 14); ext(x, y + 4); }
          if (fy) { const L = 38; g += arrow(x, y - Math.sign(fy) * (L + 6), x, y - Math.sign(fy) * 6, lc, 1.8, 8); g += text(x + 6, y - Math.sign(fy) * (L + 4), T(fmt(Math.abs(fy)) + ' kN'), { col: lc, anchor: 'start' }); ext(x - 4, y - Math.sign(fy) * (L + 10)); ext(x + 50, y); }
          if (mm) { g += momentArc(x, y, 14, mm > 0, lc, 1.6); g += text(x + 18, y + 16, T(fmt(Math.abs(mm)) + ' kNm'), { col: lc, anchor: 'start' }); ext(x - 16, y - 16); ext(x + 60, y + 20); }
        } else {
          const u = +ld.ux || 0, v = +ld.uy || 0, r = +ld.rz || 0;
          const parts = [];
          if (u) parts.push('Δx=' + fmt(u, 1) + ' mm');
          if (v) parts.push('Δy=' + fmt(v, 1) + ' mm');
          if (r) parts.push('φ=' + fmt(r, 2) + ' mrad');
          if (v) g += `<line x1="${P(x)}" y1="${P(y + 34)}" x2="${P(x)}" y2="${P(y + 52 * 1)}" stroke="${lc}" stroke-width="1.4" stroke-dasharray="3 2"/>` + arrow(x, y + 40, x, y + 56 * (v > 0 ? 1 : 0.8), lc, 1.4, 6);
          g += text(x + 8, y + 50, T(parts.join(', ')), { col: lc, anchor: 'start', size: 10.5 });
          ext(x, y + 30); ext(x + 110, y + 58);
        }
        if (selected) g += `<rect x="${P(bx0 - 4)}" y="${P(by0 - 4)}" width="${P(bx1 - bx0 + 8)}" height="${P(by1 - by0 + 8)}" rx="3" fill="none" stroke="${C.sel}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
        hits.push({ uid: ld.uid, cs: cs.uid, x0: bx0 - 3, y0: by0 - 3, x1: bx1 + 3, y1: by1 + 3 });
        continue;
      }
      const m = memBy.get(ld.m); if (!m) continue;
      const a = nodeBy.get(m.i), b = nodeBy.get(m.j); if (!a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y); if (!(L > 0)) continue;
      const c = (b.x - a.x) / L, s = (b.y - a.y) / L;
      const at = (x) => S(a.x + c * x, a.y + s * x);
      if (ld.type === 'q') {
        let x1 = 0, x2 = L;
        if (!ld.full) { x1 = E.posAbs(ld.x1, ld.mode, L); x2 = E.posAbs(ld.x2, ld.mode, L); }
        let q1 = +ld.q1 || 0, q2 = ld.q2 === undefined || ld.q2 === null || ld.q2 === '' ? q1 : (+ld.q2 || 0);
        if (x1 > x2) { [x1, x2] = [x2, x1]; [q1, q2] = [q2, q1]; }
        x1 = Math.max(0, x1); x2 = Math.min(L, x2);
        if (x2 - x1 <= 1e-9) continue;
        const mul = qEff(ld);
        const d = loadVecScreen(ld.dir, c, s);
        const ed = [c, -s];
        const along = Math.abs(d[0] * ed[0] + d[1] * ed[1]) > 0.95;
        const key = ld.m + (along ? 't' : (d[0] * -s + d[1] * -c > 0 ? 'a' : 'b'));
        const off = stack[key] || 0;
        const nrm = [-s, -c]; // ekranowe +y lokalne
        if (along) {
          // obciążenie wzdłuż pręta: strzałki równoległe obok pręta, po stronie spodów
          const nrm = [s, c];
          const o = 12 + off;
          const n = Math.max(2, Math.round((x2 - x1) * tr.k / 26));
          for (let i = 0; i < n; i++) {
            const xa = x1 + (x2 - x1) * (i + 0.15) / n, xb = x1 + (x2 - x1) * (i + 0.85) / n;
            const qv = q1 + (q2 - q1) * ((xa + xb) / 2 - x1) / (x2 - x1);
            const sg = Math.sign(qv) || 1;
            const [pa, pb] = [at(xa), at(xb)];
            const A0 = [pa[0] + nrm[0] * o, pa[1] + nrm[1] * o], B0 = [pb[0] + nrm[0] * o, pb[1] + nrm[1] * o];
            const dd = ld.dir === 't' ? 1 : (d[0] * ed[0] + d[1] * ed[1] > 0 ? 1 : -1);
            if (sg * dd > 0) g += arrow(A0[0], A0[1], B0[0], B0[1], lc, 1.2, 6); else g += arrow(B0[0], B0[1], A0[0], A0[1], lc, 1.2, 6);
            ext(A0[0], A0[1]); ext(B0[0], B0[1]);
          }
          const pm = at((x1 + x2) / 2);
          let ang = Math.atan2(-s, c) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
          g += text(pm[0] + nrm[0] * (o + 11), pm[1] + nrm[1] * (o + 11), T(labQ(q1 * mul, q2 * mul, ld), ld), { col: lc, size: 10.5, rot: Math.abs(ang) > 20 ? ang : 0 });
          stack[key] = off + 22;
        } else {
          const hgt = (q) => Math.max(Math.abs(q) * mul * scale, q ? 8 : 0);
          // podstawa przesunięta o stos
          const sideN = (d[0] * nrm[0] + d[1] * nrm[1]) > 0 ? -1 : 1; // strona rysunku (wzdłuż nrm)
          const base = (x) => { const p = at(x); return [p[0] + nrm[0] * sideN * off, p[1] + nrm[1] * sideN * off]; };
          const n = Math.max(2, Math.round((x2 - x1) * tr.k / 18));
          const pts = [], tops = [];
          for (let i = 0; i <= n; i++) {
            const x = x1 + (x2 - x1) * i / n, q = q1 + (q2 - q1) * i / n;
            const p = base(x), h = hgt(q), sg = Math.sign(q) || 1;
            const t = [p[0] - d[0] * h, p[1] - d[1] * h];
            pts.push(p); tops.push(t);
            if (h > 0) {
              if (sg > 0) g += arrow(t[0], t[1], p[0], p[1], lc, 1.1, 6);
              else g += arrow(p[0], p[1], t[0], t[1], lc, 1.1, 6);
            }
          }
          // obrys
          let dpath = `M${P(pts[0][0])} ${P(pts[0][1])}`;
          for (const t of tops) dpath += `L${P(t[0])} ${P(t[1])}`;
          dpath += `L${P(pts[pts.length - 1][0])} ${P(pts[pts.length - 1][1])}Z`;
          g += `<path d="${dpath}" fill="${selected ? 'rgba(37,99,235,.12)' : (ctx.opt.fillCol ? lc : C.loadF)}" fill-opacity="${selected ? 1 : (ctx.opt.fillCol ? 0.09 : 1)}" stroke="${lc}" stroke-width="1.1"${ld._sw ? ' stroke-dasharray="4 2"' : ''}/>`;
          for (const p of pts.concat(tops)) ext(p[0], p[1]);
          // etykieta: przy obciążeniu poziomym – obrócona wzdłuż obrysu
          const tm = tops[Math.floor(tops.length / 2)];
          const lab = T(labQ(q1 * mul, q2 * mul, ld), ld);
          const vert = Math.abs(d[0]) > 0.7;
          let lp;
          if (vert) {
            lp = [tm[0] - d[0] * 9, tm[1] - d[1] * 9];
            g += text(lp[0], lp[1], lab, { col: lc, size: 10.5, rot: -90 });
            ext(lp[0] - 7, lp[1] - 40); ext(lp[0] + 7, lp[1] + 40);
          } else {
            lp = [tm[0] - d[0] * 9, tm[1] - d[1] * 9];
            g += text(lp[0], lp[1], lab, { col: lc, size: 10.5 });
            ext(lp[0] - 40, lp[1] - 8); ext(lp[0] + 40, lp[1] + 8);
          }
          const hm = Math.max(hgt(q1), hgt(q2));
          stack[key] = off + hm + 22;
        }
      } else if (ld.type === 'F') {
        const x = Math.min(L, Math.max(0, E.posAbs(ld.x, ld.mode, L)));
        const F = +ld.F || 0; if (!F) continue;
        const d = loadVecScreen(ld.dir, c, s), sg = Math.sign(F);
        const p = at(x), Lr = 40;
        const tail = [p[0] - d[0] * sg * Lr, p[1] - d[1] * sg * Lr];
        g += arrow(tail[0], tail[1], p[0] - d[0] * sg * 2, p[1] - d[1] * sg * 2, lc, 1.9, 9);
        const tx = tail[0] - d[0] * sg * 8, ty = tail[1] - d[1] * sg * 8;
        g += text(tx + (Math.abs(d[0]) > 0.7 ? 0 : 4), ty, T(fmt(Math.abs(F)) + ' kN'), { col: lc, anchor: Math.abs(d[0]) > 0.7 ? (d[0] * sg > 0 ? 'end' : 'start') : 'start', size: 11, weight: 600 });
        ext(tail[0], tail[1]); ext(p[0], p[1]); ext(tx - 30, ty - 8); ext(tx + 45, ty + 8);
      } else if (ld.type === 'Mm') {
        const x = Math.min(L, Math.max(0, E.posAbs(ld.x, ld.mode, L)));
        const Mv = +ld.M || 0; if (!Mv) continue;
        const p = at(x);
        g += `<circle cx="${P(p[0])}" cy="${P(p[1])}" r="2.4" fill="${lc}"/>` + momentArc(p[0], p[1], 14, Mv > 0, lc, 1.7);
        g += text(p[0] + 16, p[1] - 18, T(fmt(Math.abs(Mv)) + ' kNm'), { col: lc, anchor: 'start', weight: 600 });
        ext(p[0] - 16, p[1] - 24); ext(p[0] + 70, p[1] + 16);
      } else if (ld.type === 'T') {
        const p = at(L / 2), nrm = [s, c];
        const key = ld.m + 'T', off = stack[key] || 0;
        const parts = [];
        if (+ld.dT) parts.push('ΔT=' + fmt(+ld.dT, 1) + ' K');
        if (+ld.dTg) parts.push('ΔTd−g=' + fmt(+ld.dTg, 1) + ' K');
        if (!parts.length) continue;
        const tp = [p[0] + nrm[0] * (16 + off), p[1] + nrm[1] * (16 + off)];
        g += text(tp[0], tp[1], '🌡 ' + T(parts.join(', ')), { col: lc, size: 10.5 });
        ext(tp[0] - 60, tp[1] - 8); ext(tp[0] + 60, tp[1] + 8);
        stack[key] = off + 14;
      }
      if (isFinite(bx0) && selected) g += `<rect x="${P(bx0 - 4)}" y="${P(by0 - 4)}" width="${P(bx1 - bx0 + 8)}" height="${P(by1 - by0 + 8)}" rx="3" fill="none" stroke="${C.sel}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      if (isFinite(bx0) && !ld._sw) hits.push({ uid: ld.uid, cs: cs.uid, m: ld.m, x0: bx0 - 3, y0: by0 - 3, x1: bx1 + 3, y1: by1 + 3 });
    }
    return g;
  }
  function labQ(a, b, ld) {
    const u = ' kN/m' + (ld.proj ? ' (rzut)' : '');
    if (Math.abs(a - b) < 1e-9) return fmt(a) + u;
    return fmt(a) + '…' + fmt(b) + u;
  }
  function loadScale(model, cases) {
    let mx = 0;
    for (const c of cases) for (const ld of c.loads) if (ld.type === 'q') {
      const mul = qEff(ld);
      mx = Math.max(mx, Math.abs(+ld.q1 || 0) * mul, Math.abs((ld.q2 === undefined ? +ld.q1 : +ld.q2) || 0) * mul);
    }
    return mx > 0 ? 34 / mx : 1;
  }

  // ------------------------------------------------------------------ wymiary
  function drawDims(model, tr, bottomPx, leftPx) {
    let g = '';
    const uniq = (a) => { a.sort((p, q) => p - q); const o = []; for (const v of a) if (!o.length || v - o[o.length - 1] > 1e-6) o.push(v); return o; };
    const xs = uniq(model.nodes.map(n => n.x)), ys = uniq(model.nodes.map(n => n.y));
    const col = C.dim;
    if (xs.length >= 2) {
      const y = bottomPx;
      const sx = xs.map(x => tr.ox + x * tr.k);
      g += `<line x1="${P(sx[0] - 8)}" y1="${P(y)}" x2="${P(sx[sx.length - 1] + 8)}" y2="${P(y)}" stroke="${col}" stroke-width="0.8"/>`;
      for (const x of sx) g += `<line x1="${P(x)}" y1="${P(y - 10)}" x2="${P(x)}" y2="${P(y + 4)}" stroke="${col}" stroke-width="0.6" stroke-dasharray="2 2"/><line x1="${P(x - 4)}" y1="${P(y + 4)}" x2="${P(x + 4)}" y2="${P(y - 4)}" stroke="${col}" stroke-width="1.2"/>`;
      for (let i = 1; i < xs.length; i++) if (sx[i] - sx[i - 1] > 22) g += text((sx[i] + sx[i - 1]) / 2, y - 8, fmt(xs[i] - xs[i - 1], 2), { col, size: 10.5 });
      if (xs.length > 2) {
        const y2 = y + 20;
        g += `<line x1="${P(sx[0])}" y1="${P(y2)}" x2="${P(sx[sx.length - 1])}" y2="${P(y2)}" stroke="${col}" stroke-width="0.8"/>`;
        for (const x of [sx[0], sx[sx.length - 1]]) g += `<line x1="${P(x - 4)}" y1="${P(y2 + 4)}" x2="${P(x + 4)}" y2="${P(y2 - 4)}" stroke="${col}" stroke-width="1.2"/><line x1="${P(x)}" y1="${P(y + 4)}" x2="${P(x)}" y2="${P(y2 + 4)}" stroke="${col}" stroke-width="0.6"/>`;
        g += text((sx[0] + sx[sx.length - 1]) / 2, y2 - 8, fmt(xs[xs.length - 1] - xs[0], 2), { col, size: 10.5, weight: 600 });
      }
    }
    if (ys.length >= 2) {
      const x = leftPx;
      const sy = ys.map(y => tr.oy - y * tr.k);
      g += `<line x1="${P(x)}" y1="${P(sy[0] + 8)}" x2="${P(x)}" y2="${P(sy[sy.length - 1] - 8)}" stroke="${col}" stroke-width="0.8"/>`;
      for (const y of sy) g += `<line x1="${P(x - 4)}" y1="${P(y + 4)}" x2="${P(x + 4)}" y2="${P(y - 4)}" stroke="${col}" stroke-width="1.2"/><line x1="${P(x - 4)}" y1="${P(y)}" x2="${P(x + 10)}" y2="${P(y)}" stroke="${col}" stroke-width="0.6" stroke-dasharray="2 2"/>`;
      for (let i = 1; i < ys.length; i++) if (sy[i - 1] - sy[i] > 22) g += text(x - 8, (sy[i] + sy[i - 1]) / 2, fmt(ys[i] - ys[i - 1], 2), { col, size: 10.5, rot: -90 });
    }
    return g;
  }

  // ------------------------------------------------------------------ wykresy
  const DIAG = {
    M: { q: 'M', col: C.M, fill: C.Mf, unit: 'kNm', side: 'bottom' },
    V: { q: 'V', col: C.V, fill: C.Vf, unit: 'kN', side: 'top' },
    N: { q: 'N', col: C.N, fill: C.Nf, unit: 'kN', side: 'top' },
    v: { q: 'v', col: C.def, fill: 'rgba(124,58,237,.12)', unit: 'mm', side: 'top', mul: 1000 }
  };

  function drawDiagram(ctx, type) {
    const { res, view, tr } = ctx;
    const D = DIAG[type], q = D.q, mul = D.mul || 1;
    let mx = 0;
    view.mem.forEach(o => { const a = o[q]; for (let i = 0; i < a.max.length; i++) mx = Math.max(mx, Math.abs(a.max[i]), Math.abs(a.min[i])); });
    if (!(mx > 1e-9)) return { svg: text(ctx.W / 2, 22, 'Wartości ' + (type === 'v' ? 'ugięć' : type) + ' równe zeru', { col: C.muted, size: 12 }), max: 0 };
    const sc = (type === 'N' ? 32 : 55) * (ctx.opt.diagScale || 1) / mx;
    let g = '', labels = '';
    const placed = [];
    const canPlace = (x, y) => { for (const p of placed) if (Math.abs(p[0] - x) < 34 && Math.abs(p[1] - y) < 13) return false; placed.push([x, y]); return true; };
    const showVals = ctx.opt.values !== false;
    const thr = 0.02 * mx;
    const series = view.env ? [['max', D.col, D.fill], ['min', C.min, C.minf]] : [['max', D.col, D.fill]];
    res.mem.forEach((m, mi) => {
      const sxi = tr.ox + m.ni.x * tr.k, syi = tr.oy - m.ni.y * tr.k;
      const ex = [m.c, -m.s];
      const nb = [m.s, m.c]; // ekranowa strona spodu
      const nrm = D.side === 'bottom' ? nb : [-m.s, -m.c];
      if (type === 'N') {
        const A = view.mem[mi].N;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < A.max.length; i++) { lo = Math.min(lo, A.min[i], A.max[i]); hi = Math.max(hi, A.min[i], A.max[i]); }
        const cmax = Math.max(...A.max) - Math.min(...A.max) <= 0.02 * mx, cmin = Math.max(...A.min) - Math.min(...A.min) <= 0.02 * mx;
        if (cmax && cmin) {
          const vmax = A.max[0], vmin = A.min[0];
          const main = Math.abs(vmax) >= Math.abs(vmin) ? vmax : vmin;
          if (Math.abs(main) < 1e-3 * mx) return;
          const exx = sxi + ex[0] * m.L * tr.k, exy = syi + ex[1] * m.L * tr.k;
          g += `<line x1="${P(sxi)}" y1="${P(syi)}" x2="${P(exx)}" y2="${P(exy)}" stroke="${main > 0 ? C.M : C.min}" stroke-width="5" stroke-opacity=".5" stroke-linecap="butt"/>`;
          if (!showVals) return;
          const lab = view.env && Math.abs(vmax - vmin) > 1e-6 * mx ? fmt(vmax) + ' / ' + fmt(vmin) : fmt(main);
          const cx = (sxi + exx) / 2 + nb[0] * 12, cy = (syi + exy) / 2 + nb[1] * 12;
          const w = lab.length * 6.1 + 8;
          if (canPlace(cx, cy)) labels += `<rect x="${P(cx - w / 2)}" y="${P(cy - 7.5)}" width="${P(w)}" height="15" rx="3" fill="${C.bg}" stroke="${main > 0 ? C.M : C.min}" stroke-width="0.8"/>` + text(cx, cy + 0.5, lab, { col: main > 0 ? C.M : C.min, size: 10.5, weight: 600, halo: false });
          return;
        }
      }
      for (const [kk, col, fill] of series) {
        const a = view.mem[mi][q][kk];
        let d = `M${P(sxi)} ${P(syi)}`;
        const pts = [];
        for (let i = 0; i < a.length; i++) {
          const x = m.xs[i] * tr.k, v = a[i] * sc;
          const px = sxi + ex[0] * x + nrm[0] * v, py = syi + ex[1] * x + nrm[1] * v;
          pts.push([px, py]); d += `L${P(px)} ${P(py)}`;
        }
        const exx = sxi + ex[0] * m.L * tr.k, exy = syi + ex[1] * m.L * tr.k;
        d += `L${P(exx)} ${P(exy)}Z`;
        g += `<path d="${d}" fill="${fill}" stroke="none"/>`;
        let pl = '';
        pts.forEach((p, i) => { pl += (i ? 'L' : 'M') + P(p[0]) + ' ' + P(p[1]); });
        g += `<path d="${pl}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`;
        // etykiety: końce, ekstrema, skoki
        if (!showVals) continue;
        const idx = new Set([0, a.length - 1]);
        let imax = 0, imin = 0;
        for (let i = 0; i < a.length; i++) { if (a[i] > a[imax]) imax = i; if (a[i] < a[imin]) imin = i; }
        idx.add(imax); idx.add(imin);
        for (let i = 1; i < a.length; i++) if (Math.abs(m.xs[i] - m.xs[i - 1]) < 1e-9) { idx.add(i - 1); idx.add(i); }
        for (const i of [...idx].sort((p, r) => p - r)) {
          const v = a[i];
          if (Math.abs(v) < thr && !(i === imax || i === imin)) continue;
          if (Math.abs(v) < 1e-6 * mx || Math.abs(v) < 1e-9) continue;
          const sgn = Math.sign(v) || 1;
          const p = pts[i];
          const lx = p[0] + nrm[0] * sgn * 11, ly = p[1] + nrm[1] * sgn * 11;
          if (!canPlace(lx, ly)) continue;
          labels += text(lx, ly, fmt(v * mul), { col, size: 10.5, weight: (i === imax || i === imin) ? 600 : 400 });
        }
        // znaki dla V i N
        if (type === 'V' || type === 'N') {
          const i = Math.abs(a[imax]) >= Math.abs(a[imin]) ? imax : imin;
          const v = a[i];
          if (Math.abs(v) > thr) {
            const x = m.xs[i] * tr.k, h = v * sc * 0.45;
            const cx = sxi + ex[0] * x + nrm[0] * h, cy = syi + ex[1] * x + nrm[1] * h;
            if (Math.abs(v * sc) > 16 && canPlace(cx, cy)) labels += `<circle cx="${P(cx)}" cy="${P(cy)}" r="6.5" fill="${C.bg}" stroke="${col}" stroke-width="0.9"/>` + text(cx, cy + 0.5, v > 0 ? '+' : '−', { col, size: 11, weight: 700, halo: false });
          }
        }
      }
    });
    return { svg: g + labels, max: mx };
  }

  function drawDeformed(ctx) {
    const { res, view, tr } = ctx;
    let mx = 0;
    view.mem.forEach(o => { for (let i = 0; i < o.gx.max.length; i++) mx = Math.max(mx, Math.hypot(o.gx.max[i], o.gy.max[i])); });
    if (!(mx > 1e-12)) return { svg: text(ctx.W / 2, 22, 'Przemieszczenia równe zeru', { col: C.muted, size: 12 }), max: 0 };
    const b = bbox(ctx.model), size = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1);
    const sc = 0.08 * size / mx * (ctx.opt.defScale || 1);
    let g = '', labels = '';
    res.mem.forEach((m, mi) => {
      const o = view.mem[mi];
      let d = '';
      for (let i = 0; i < m.xs.length; i++) {
        const wx = m.ni.x + m.c * m.xs[i] + o.gx.max[i] * sc, wy = m.ni.y + m.s * m.xs[i] + o.gy.max[i] * sc;
        d += (i ? 'L' : 'M') + P(tr.ox + wx * tr.k) + ' ' + P(tr.oy - wy * tr.k);
      }
      g += `<path d="${d}" fill="none" stroke="${C.def}" stroke-width="2" stroke-linejoin="round"/>`;
    });
    if (ctx.opt.values !== false) {
      const placed = [];
      res.nodes.forEach((n, i) => {
        const ux = view.dg.max[3 * i], uy = view.dg.max[3 * i + 1];
        const u = Math.hypot(ux, uy);
        if (u < 0.02 * mx) return;
        const x = tr.ox + (n.x + ux * sc) * tr.k, y = tr.oy - (n.y + uy * sc) * tr.k;
        if (placed.some(p => Math.abs(p[0] - x) < 60 && Math.abs(p[1] - y) < 14)) return;
        placed.push([x, y]);
        g += `<circle cx="${P(x)}" cy="${P(y)}" r="2.6" fill="${C.def}"/>`;
        labels += text(x + 6, y - 9, fmt(u * 1000, 2) + ' mm', { col: C.def, anchor: 'start', size: 10.5 });
      });
    }
    return { svg: g + labels, max: mx };
  }

  function drawReactions(ctx) {
    const { res, view, tr } = ctx;
    let g = '';
    for (const n of res.supNodes) {
      const node = res.nodes[n], r = view.reac.get(n);
      const x = tr.ox + node.x * tr.k, y = tr.oy - node.y * tr.k;
      const f = node.sup.f;
      if (!view.env) {
        const [Rx, Ry, Mz] = r.g.max;
        const L = 40, off = 30;
        const b = bbox(ctx.model), cxm = (b.x0 + b.x1) / 2;
        const side = node.x < cxm - 1e-9 ? -1 : 1; // strona zewnętrzna
        if (Math.abs(Ry) > 1e-6) {
          const y0 = y + off, y1 = y + off + L;
          if (Ry > 0) g += arrow(x, y1, x, y0, C.reac, 2, 9); else g += arrow(x, y0, x, y1, C.reac, 2, 9);
          g += text(x, y1 + 12, 'V=' + fmt(Math.abs(Ry)) + ' kN', { col: C.reac, size: 11, weight: 600 });
        }
        if (Math.abs(Rx) > 1e-6) {
          const yy = y + 4, x0 = x + side * 26, x1 = x + side * (26 + L);
          if (Rx * side > 0) g += arrow(x0, yy, x1, yy, C.reac, 2, 9); else g += arrow(x1, yy, x0, yy, C.reac, 2, 9);
          g += text((x0 + x1) / 2, yy + 12, 'H=' + fmt(Math.abs(Rx)) + ' kN', { col: C.reac, size: 11, weight: 600 });
        }
        if (Math.abs(Mz) > 1e-6 && (f[2] === 1 || f[2] === 2)) {
          g += momentArc(x, y, 20, Mz < 0, C.reac, 1.8);
          g += text(x - side * 4, y - 30, 'M=' + fmt(Math.abs(Mz)) + ' kNm', { col: C.reac, anchor: side < 0 ? 'start' : 'end', size: 11, weight: 600 });
        }
      } else {
        const lines = [];
        const fr = (i, nm, u) => lines.push(nm + ': ' + fmt(r.g.max[i]) + ' / ' + fmt(r.g.min[i]) + ' ' + u);
        if (f[0] || (node.sup.ang && f[1])) fr(0, 'Rx', 'kN');
        if (f[1] || (node.sup.ang && f[0])) fr(1, 'Ry', 'kN');
        if (f[2]) fr(2, 'M', 'kNm');
        const w = Math.max(...lines.map(s => s.length)) * 5.9 + 10, hh = lines.length * 13 + 6;
        const bx = Math.min(Math.max(x - w / 2, 4), ctx.W - w - 4), by = y + 36;
        if (lines.length) g += `<rect x="${P(bx)}" y="${P(by)}" width="${P(w)}" height="${hh}" rx="4" fill="${C.bg}" stroke="${C.reac}" stroke-width="0.8" opacity=".95"/>`;
        lines.forEach((s, i) => { g += text(bx + 5, by + 10 + i * 13, s, { col: C.reac, anchor: 'start', size: 10.5, weight: 600, halo: false }); });
      }
    }
    return g;
  }

  // ------------------------------------------------------------------ główna funkcja
  // ctx: {model, res, view, diag, tr, W, H, opt:{grid, gridStep, nodeNums, memNums, dims, loads:'active'|'all'|'none', caseUid, sel, diagScale, defScale, values}}
  function render(ctx) {
    const { model, tr, W, H } = ctx;
    const opt = ctx.opt || {}; ctx.opt = opt;
    const S = (x, y) => [tr.ox + x * tr.k, tr.oy - y * tr.k];
    const nodeBy = new Map(model.nodes.map(n => [n.uid, n]));
    const sel = opt.sel || {};
    const hits = [];
    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}"/>`;
    // siatka
    if (opt.grid) {
      const st = opt.gridStep || 0.5;
      let stp = st; while (stp * tr.k < 12) stp *= 2;
      const x0 = Math.floor(-tr.ox / tr.k / stp) * stp, x1 = (W - tr.ox) / tr.k;
      const y0 = Math.floor((tr.oy - H) / tr.k / stp) * stp, y1 = tr.oy / tr.k;
      let d = '', dm = '';
      for (let x = x0; x <= x1; x += stp) { const s = P(tr.ox + x * tr.k); const major = Math.abs(Math.round(x / (stp * 5)) * stp * 5 - x) < 1e-9; (major ? (v => dm += v) : (v => d += v))(`M${s} 0V${H}`); }
      for (let y = y0; y <= y1; y += stp) { const s = P(tr.oy - y * tr.k); const major = Math.abs(Math.round(y / (stp * 5)) * stp * 5 - y) < 1e-9; (major ? (v => dm += v) : (v => d += v))(`M0 ${s}H${W}`); }
      out += `<path d="${d}" stroke="${C.grid}" stroke-width="0.6"/><path d="${dm}" stroke="${C.grid}" stroke-width="1.2"/>`;
      const [ox, oy] = S(0, 0);
      out += arrow(ox, oy, ox + 26, oy, C.muted, 1, 6) + arrow(ox, oy, ox, oy - 26, C.muted, 1, 6) + text(ox + 31, oy, 'X', { col: C.muted, size: 9.5 }) + text(ox, oy - 32, 'Y', { col: C.muted, size: 9.5 });
    }
    const diag = ctx.diag || 'model';
    const modelView = diag === 'model' || diag === 'loads' || diag === 'secs';
    const hasRes = ctx.res && ctx.res.ok && ctx.view && !modelView;
    // wymiary
    if (opt.dims && model.nodes.length && !hasRes) {
      const b = bbox(model);
      const bottom = tr.oy - b.y0 * tr.k + (opt.dimsOffset || 64);
      const left = tr.ox + b.x0 * tr.k - (opt.dimsOffset || 64);
      out += drawDims(model, tr, bottom, left);
    }
    // wykres
    let diagSvg = '', info = null;
    if (hasRes) {
      if (diag === 'M' || diag === 'V' || diag === 'N') { const r = drawDiagram(ctx, diag); diagSvg = r.svg; info = r; }
      else if (diag === 'def') { if (ctx.view.env) { const r = drawDiagram(ctx, 'v'); diagSvg = r.svg; info = r; } else { const r = drawDeformed(ctx); diagSvg = r.svg; info = r; } }
    }
    // pręty
    const faded = hasRes && (diag === 'def');
    let mems = '', dash = '', mlabels = '', hinges = '', slabels = '';
    const secView = diag === 'secs';
    let hmax = 0;
    const secH = new Map();
    if (secView) for (const sc of model.secs) { const p = E.secProps(sc); const h = p ? p.h : 0; secH.set(sc.uid, h); hmax = Math.max(hmax, h); }
    for (const m of model.members) {
      const a = nodeBy.get(m.i), b = nodeBy.get(m.j); if (!a || !b) continue;
      const [x1, y1] = S(a.x, a.y), [x2, y2] = S(b.x, b.y);
      const L = Math.hypot(x2 - x1, y2 - y1); if (L < 0.5) continue;
      const c = (x2 - x1) / L, s = (y2 - y1) / L; // ekran
      const isSel = sel.members && sel.members.has(m.uid);
      let col = isSel ? C.sel : (faded ? 'var(--c-faded,#9ca3af)' : C.mem);
      if (secView) {
        const sc = secColor(model, m.sec), hh = secH.get(m.sec) || 0;
        const w = 2.4 + 7 * Math.pow(hmax > 0 ? hh / hmax : 0.5, 0.75);
        if (isSel) mems += `<line x1="${P(x1)}" y1="${P(y1)}" x2="${P(x2)}" y2="${P(y2)}" stroke="${C.sel}" stroke-width="${P(w + 6)}" stroke-opacity=".35" stroke-linecap="round"/>`;
        mems += `<line x1="${P(x1)}" y1="${P(y1)}" x2="${P(x2)}" y2="${P(y2)}" stroke="${sc}" stroke-width="${P(w)}" stroke-linecap="butt"/>`;
        col = isSel ? C.sel : sc;
        if (opt.secLabels !== false) {
          const secO = model.secs.find(q => q.uid === m.sec);
          let ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
          const nx0 = -s, ny0 = c, off = w / 2 + 9;
          const lx = (x1 + x2) / 2 + nx0 * off, ly = (y1 + y2) / 2 + ny0 * off;
          const nm = secO ? secO.name : '?';
          if (nm.length * 6.2 + 36 < L) slabels += text(lx, ly, nm, { col: sc, size: 10.5, weight: 600, rot: Math.abs(ang) > 0.5 ? ang : 0 });
        }
      } else
      mems += `<line x1="${P(x1)}" y1="${P(y1)}" x2="${P(x2)}" y2="${P(y2)}" stroke="${col}" stroke-width="${isSel ? 4 : (hasRes ? 2 : 2.6)}" stroke-linecap="round"/>`;
      // spody: ekranowe −y lokalne = obrót o +90° w układzie ekranu
      const nx = -s, ny = c; // na ekranie (y w dół) wektor (−s, c) = strona spodu
      if (!hasRes && !secView) dash += `<line x1="${P(x1 + c * 6 + nx * 4.5)}" y1="${P(y1 + s * 6 + ny * 4.5)}" x2="${P(x2 - c * 6 + nx * 4.5)}" y2="${P(y2 - s * 6 + ny * 4.5)}" stroke="${col}" stroke-width="0.9" stroke-dasharray="5 3" opacity=".7"/>`;
      if (opt.memNums) {
        const mx = (x1 + x2) / 2 - nx * 13, my = (y1 + y2) / 2 - ny * 13;
        const no = model.members.indexOf(m) + 1;
        mlabels += `<rect x="${P(mx - 9)}" y="${P(my - 7.5)}" width="18" height="15" rx="3" fill="${C.bg}" stroke="${col}" stroke-width="0.8"/>` + text(mx, my + 0.5, String(no), { col, size: 10, weight: 600, halo: false });
      }
      if (m.ri && !a.hinge) hinges += `<circle cx="${P(x1 + c * 8)}" cy="${P(y1 + s * 8)}" r="3.6" fill="${C.bg}" stroke="${col}" stroke-width="1.4"/>`;
      if (m.rj && !b.hinge) hinges += `<circle cx="${P(x2 - c * 8)}" cy="${P(y2 - s * 8)}" r="3.6" fill="${C.bg}" stroke="${col}" stroke-width="1.4"/>`;
    }
    out += mems + dash;
    if (hasRes && diag !== 'R') out += diagSvg;
    // podpory
    for (const n of model.nodes) if (n.sup) out += drawSupport(model, n, tr, sel.nodes && sel.nodes.has(n.uid) ? C.sel : null);
    out += hinges;
    // węzły
    const mechanism = ctx.res && !ctx.res.ok && ctx.res.mechanismNode;
    for (const n of model.nodes) {
      const [x, y] = S(n.x, n.y);
      const isSel = sel.nodes && sel.nodes.has(n.uid);
      if (n.hinge) out += `<circle cx="${P(x)}" cy="${P(y)}" r="4.6" fill="${C.bg}" stroke="${isSel ? C.sel : C.node}" stroke-width="1.6"/>`;
      else out += `<rect x="${P(x - (isSel ? 4 : 2.6))}" y="${P(y - (isSel ? 4 : 2.6))}" width="${isSel ? 8 : 5.2}" height="${isSel ? 8 : 5.2}" fill="${isSel ? C.sel : C.node}"/>`;
      if (mechanism === n.uid) out += `<circle cx="${P(x)}" cy="${P(y)}" r="14" fill="none" stroke="${C.reac}" stroke-width="2" stroke-dasharray="4 3"/>`;
      if (opt.nodeNums) out += text(x - 7, y - 10, String(model.nodes.indexOf(n) + 1), { col: isSel ? C.sel : C.muted, size: 10, anchor: 'end' });
    }
    out += mlabels + slabels;
    // obciążenia
    if (diag === 'loads') {
      // widok wszystkich obciążeń: kolor na przypadek, opcjonalnie ciężar własny i kody przypadków
      const hidden = opt.hiddenCases || new Set();
      const codes = caseCodes(model);
      const sw = opt.sw !== false ? selfWeightLoads(model) : [];
      const list = [];
      for (const cs of model.cases) {
        if (hidden.has(cs.uid)) continue;
        const loads = cs.loads.slice();
        if (cs.selfWeight) loads.unshift(...sw);
        if (loads.length) list.push({ cs, loads });
      }
      const sc = loadScale(model, list.map(x => ({ loads: x.loads })));
      const stack = {};
      ctx.opt.fillCol = true;
      for (const it of list) out += drawLoads(ctx, { uid: it.cs.uid, loads: it.loads }, caseColor(model, it.cs.uid), hits, stack, sc, opt.caseTags !== false ? codes.get(it.cs.uid) : '');
      ctx.opt.fillCol = false;
      if (!list.length) out += text(W / 2, 24, model.cases.length ? 'Wszystkie przypadki ukryte lub bez obciążeń' : 'Brak przypadków obciążeń', { col: C.muted, size: 12 });
    } else if (opt.loads && opt.loads !== 'none' && !secView && (!hasRes || opt.loadsOnResults)) {
      const cases = opt.loads === 'all' ? model.cases : model.cases.filter(c => c.uid === opt.caseUid);
      const sc = loadScale(model, cases);
      const stack = {};
      const codes = caseCodes(model);
      if (opt.loads === 'all') ctx.opt.fillCol = true;
      for (const cs of cases) {
        const col = opt.loads === 'all' ? caseColor(model, cs.uid) : C.load;
        out += drawLoads(ctx, cs, col, hits, stack, sc, opt.loads === 'all' ? codes.get(cs.uid) : '');
        if (cs.selfWeight && opt.loads !== 'all') out += text(10, H - 14, 'Przypadek zawiera ciężar własny prętów (generowany automatycznie)', { col: C.muted, anchor: 'start', size: 10.5 });
      }
      ctx.opt.fillCol = false;
    }
    if (hasRes && diag === 'R') out += drawReactions(ctx);
    return { svg: out, hits, info };
  }

  return { render, fit, bbox, fmt, esc, C, loadScale, PAL, SPAL, caseColor, secColor, caseCodes, selfWeightLoads };
});
