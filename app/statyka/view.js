/* =====================================================================
   BM-Win · Statyka – rysowanie schematu (SVG) w 2D i w rzucie 3D
   Ten sam rysunek służy do ekranu, raportu (PDF/ODT) i podglądu.
   ===================================================================== */
(function (root) {
  'use strict';
  const F = root.BMFEM;
  const PI = Math.PI;

  /* ---------------------------------------------------- rzutowanie */
  function projector(vs) {
    if (vs.dim === '2D') {
      return { p: (x, y) => [vs.cx + x * vs.scale, vs.cy - y * vs.scale, 0], world: true };
    }
    const th = vs.yaw * PI / 180, ph = vs.pitch * PI / 180;
    const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    return {
      p: (x, y, z) => {
        const x1 = x * ct + y * st, y1 = -x * st + y * ct;   // obrót wokół Z
        const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;   // pochylenie
        return [vs.cx + x1 * vs.scale, vs.cy - z2 * vs.scale, y2];
      },
      // odwrotność na płaszczyźnie Z = z0 (do wstawiania węzłów w 3D)
      onPlane: (sx, sy, z0) => {
        const x1 = (sx - vs.cx) / vs.scale, z2 = -(sy - vs.cy) / vs.scale;
        if (Math.abs(cp) < 1e-6) return null;
        // z2 = y1·sp + z0·cp → y1
        if (Math.abs(sp) < 1e-6) return null;
        const y1 = (z2 - z0 * cp) / sp;
        return [x1 * ct - y1 * st, x1 * st + y1 * ct, z0];
      },
      dirs: { ct, st, cp, sp }
    };
  }
  function coords(model) {
    const m = new Map();
    model.nodes.forEach(n => m.set(String(n.id), [+n.x || 0, +n.y || 0, model.dim === '2D' ? 0 : (+n.z || 0)]));
    return m;
  }
  function fit(model, vs, pad = 50) {
    const C = coords(model);
    if (!C.size) { vs.scale = 40; vs.cx = vs.w / 2; vs.cy = vs.h / 2; return vs; }
    const s0 = Object.assign({}, vs, { scale: 1, cx: 0, cy: 0 });
    const P = projector(s0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    C.forEach(c => { const q = P.p(c[0], c[1], c[2]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    const w = Math.max(x1 - x0, 1e-3), hh = Math.max(y1 - y0, 1e-3);
    vs.scale = Math.min((vs.w - 2 * pad) / w, (vs.h - 2 * pad) / hh, 400);
    if (!isFinite(vs.scale) || vs.scale <= 0) vs.scale = 40;
    vs.cx = vs.w / 2 - (x0 + x1) / 2 * vs.scale;
    vs.cy = vs.h / 2 - (y0 + y1) / 2 * vs.scale;
    return vs;
  }

  const n2 = v => (Math.round(v * 10) / 10).toFixed(1);
  const fmtV = (v, d = 2) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(d).replace('-', '−').replace('.', ',');
  const COL = {
    member: 'var(--ink, #1b2230)', truss: 'var(--info, #5b6576)', node: 'var(--ink, #1b2230)', sel: '#e0761c',
    sup: 'var(--acc3, #0f3f86)', load: '#c0262d', loadQ: '#1d5bb8', diagP: '#1d5bb8', diagN: '#c0262d', def: '#1d7f3c', grid: 'var(--line2, #e8ebef)', axis: 'var(--ink3, #7a8494)', reac: '#7a3db8'
  };
  const CASE_COL = { G: '#4a5466', Q: '#1d5bb8', S: '#0e8a8a', W: '#7a3db8', T: '#c06a00', A: '#c0262d' };

  /* ---------------------------------------------------- osie lokalne pręta */
  function axesOf(model, mem, C) {
    const p1 = C.get(String(mem.n1)), p2 = C.get(String(mem.n2));
    if (!p1 || !p2) return null;
    const ax = F.memberAxes(p1, p2, mem.beta || 0, model.dim);
    if (!ax) return null;
    return Object.assign(ax, { p1, p2 });
  }

  /* ---------------------------------------------------- rysunek */
  // opts: { show:{ids, nodeIds, loads, supports, secNames, axes, grid, releases}, activeCase, diagram:{key, members:[{id, st}], env, scale}, deformed:{disp, members, scale}, reactions:[...], sel:{nodes:Set, members:Set}, mode:{...}, sections:Map(id→label), modeShape }
  function render(model, vs, opts) {
    opts = opts || {};
    const show = Object.assign({ ids: true, nodeIds: true, loads: true, supports: true, secNames: false, grid: true, releases: true }, opts.show || {});
    const P = projector(vs), C = coords(model), pr = (c) => P.p(c[0], c[1], c[2]);
    const out = [];
    const W = vs.w, H = vs.h;
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif" font-size="11">`);
    out.push('<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>');
    if (opts.background !== false) out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${opts.bg || 'var(--panel, #fff)'}"/>`);

    // siatka (2D) lub osie globalne (3D)
    if (vs.dim === '2D' && show.grid && vs.grid > 0) {
      const g = vs.grid, sx = g * vs.scale;
      if (sx >= 6) {
        const x0 = Math.floor((0 - vs.cx) / vs.scale / g) * g, x1 = (W - vs.cx) / vs.scale, y0 = Math.floor((vs.cy - H) / vs.scale / g) * g, y1 = vs.cy / vs.scale;
        const pts = [];
        for (let x = x0; x <= x1 + 1e-9; x += g) { const X = vs.cx + x * vs.scale; pts.push(`M${n2(X)},0V${H}`); }
        for (let y = y0; y <= y1 + 1e-9; y += g) { const Y = vs.cy - y * vs.scale; pts.push(`M0,${n2(Y)}H${W}`); }
        out.push(`<path d="${pts.join('')}" stroke="${COL.grid}" stroke-width="1" fill="none"/>`);
      }
      const o = P.p(0, 0); out.push(`<path d="M${n2(o[0])},${n2(o[1])}h30M${n2(o[0])},${n2(o[1])}v-30" stroke="${COL.axis}" stroke-width="1.2" marker-end="url(#ar)" fill="none"/><text x="${n2(o[0] + 33)}" y="${n2(o[1] + 4)}" fill="${COL.axis}">X</text><text x="${n2(o[0] - 4)}" y="${n2(o[1] - 34)}" fill="${COL.axis}">Y</text>`);
    }
    if (vs.dim === '3D') {
      // triada osi w rogu
      const L = 28, ox = 40, oy = H - 40;
      const P0 = projector(Object.assign({}, vs, { cx: 0, cy: 0, scale: 1 }));
      [['X', [1, 0, 0], '#c0262d'], ['Y', [0, 1, 0], '#1d7f3c'], ['Z', [0, 0, 1], '#1d5bb8']].forEach(([n, d, c]) => {
        const q = P0.p(d[0], d[1], d[2]);
        out.push(`<line x1="${ox}" y1="${oy}" x2="${n2(ox + q[0] * L)}" y2="${n2(oy + q[1] * L)}" stroke="${c}" stroke-width="1.6" marker-end="url(#ar)"/><text x="${n2(ox + q[0] * (L + 9) - 3)}" y="${n2(oy + q[1] * (L + 9) + 4)}" fill="${c}" font-weight="600">${n}</text>`);
      });
      if (show.grid && opts.workPlane !== undefined) {
        // siatka płaszczyzny roboczej
        const bb = bbox(model), g = vs.grid || 1, z0 = opts.workPlane;
        const x0 = Math.floor(bb[0] / g) * g - g, x1 = Math.ceil(bb[3] / g) * g + g, y0 = Math.floor(bb[1] / g) * g - g, y1 = Math.ceil(bb[4] / g) * g + g;
        const d = [];
        if ((x1 - x0) / g < 120 && (y1 - y0) / g < 120) {
          for (let x = x0; x <= x1 + 1e-9; x += g) { const a = P.p(x, y0, z0), b = P.p(x, y1, z0); d.push(`M${n2(a[0])},${n2(a[1])}L${n2(b[0])},${n2(b[1])}`); }
          for (let y = y0; y <= y1 + 1e-9; y += g) { const a = P.p(x0, y, z0), b = P.p(x1, y, z0); d.push(`M${n2(a[0])},${n2(a[1])}L${n2(b[0])},${n2(b[1])}`); }
          out.push(`<path d="${d.join('')}" stroke="${COL.grid}" stroke-width="1" fill="none"/>`);
        }
      }
    }

    const sel = opts.sel || { nodes: new Set(), members: new Set() };
    const dimmed = !!(opts.diagram || opts.deformed || opts.modeShape);

    // pręty
    const memScreen = [];
    model.members.forEach(m => {
      const a = C.get(String(m.n1)), b = C.get(String(m.n2)); if (!a || !b) return;
      const A = pr(a), B = pr(b);
      const isSel = sel.members.has(String(m.id));
      const col = isSel ? COL.sel : m.type === 'truss' ? COL.truss : COL.member;
      const sw = isSel ? 3.4 : dimmed ? 1.6 : 2.4;
      out.push(`<line x1="${n2(A[0])}" y1="${n2(A[1])}" x2="${n2(B[0])}" y2="${n2(B[1])}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"${dimmed && !isSel ? ' stroke-opacity="0.45"' : ''}${m.type === 'truss' ? ' stroke-dasharray="7 3"' : ''}/>`);
      memScreen.push({ m, A, B });
      if (show.releases) {
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
        const hinge = (rel) => rel && (model.dim === '2D' ? rel[4] || rel[5] : rel[3] || rel[4] || rel[5]);
        if (hinge(m.rel1)) out.push(`<circle cx="${n2(A[0] + ux * 8)}" cy="${n2(A[1] + uy * 8)}" r="3.6" fill="var(--panel, #fff)" stroke="${col}" stroke-width="1.5"/>`);
        if (hinge(m.rel2)) out.push(`<circle cx="${n2(B[0] - ux * 8)}" cy="${n2(B[1] - uy * 8)}" r="3.6" fill="var(--panel, #fff)" stroke="${col}" stroke-width="1.5"/>`);
      }
      if (show.ids || show.secNames) {
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        let ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        const lbl = [show.ids ? String(m.id) : '', show.secNames && opts.sections ? (opts.sections.get(String(m.sec)) || '') : ''].filter(Boolean).join(' · ');
        out.push(`<text x="${n2(mx)}" y="${n2(my)}" transform="rotate(${n2(ang)} ${n2(mx)} ${n2(my)}) translate(0,-6)" text-anchor="middle" fill="${isSel ? COL.sel : 'var(--acc3, #0f3f86)'}" font-size="10.5">${esc(lbl)}</text>`);
      }
    });

    // osie lokalne zaznaczonych prętów
    if (opts.showAxes || sel.members.size) {
      model.members.forEach(m => {
        if (!opts.showAxes && !sel.members.has(String(m.id))) return;
        const ax = axesOf(model, m, C); if (!ax) return;
        const c = [(ax.p1[0] + ax.p2[0]) / 2, (ax.p1[1] + ax.p2[1]) / 2, (ax.p1[2] + ax.p2[2]) / 2];
        const O = pr(c), L = 22 / vs.scale;
        [['x', ax.ex, '#c0262d'], ['y', ax.ey, '#1d7f3c'], ['z', ax.ez, '#1d5bb8']].forEach(([n, d, col]) => {
          if (model.dim === '2D' && n === 'y') return;
          const E = pr([c[0] + d[0] * L, c[1] + d[1] * L, c[2] + d[2] * L]);
          out.push(`<line x1="${n2(O[0])}" y1="${n2(O[1])}" x2="${n2(E[0])}" y2="${n2(E[1])}" stroke="${col}" stroke-width="1.2" marker-end="url(#ar)"/><text x="${n2(E[0] + 3)}" y="${n2(E[1] - 2)}" fill="${col}" font-size="10">${n}</text>`);
        });
      });
    }

    // podpory
    if (show.supports) (model.supports || []).forEach(s => { const c = C.get(String(s.node)); if (c) out.push(supportSvg(model, s, pr(c), vs)); });

    // obciążenia
    if (show.loads && !dimmed) out.push(loadsSvg(model, vs, P, C, opts.activeCase, opts));

    // wykres sił
    if (opts.diagram) out.push(diagramSvg(model, vs, P, C, opts.diagram));
    // deformacja / postać własna
    if (opts.deformed) out.push(deformedSvg(model, vs, P, C, opts.deformed, COL.def));
    if (opts.modeShape) out.push(deformedSvg(model, vs, P, C, opts.modeShape, '#7a3db8'));
    // reakcje
    if (opts.reactions) out.push(reactionsSvg(model, vs, P, C, opts.reactions));

    // węzły
    model.nodes.forEach(n => {
      const c = C.get(String(n.id)), q = pr(c), isSel = sel.nodes.has(String(n.id));
      out.push(`<circle cx="${n2(q[0])}" cy="${n2(q[1])}" r="${isSel ? 5 : 3.2}" fill="${isSel ? COL.sel : 'var(--panel, #fff)'}" stroke="${isSel ? COL.sel : COL.node}" stroke-width="1.5"/>`);
      if (show.nodeIds) out.push(`<text x="${n2(q[0] + 6)}" y="${n2(q[1] - 6)}" fill="${isSel ? COL.sel : 'var(--ink2, #4a5466)'}" font-size="10">${esc(n.id)}</text>`);
    });

    // linia pomocnicza (rysowanie pręta) i kursor
    if (opts.ghost) out.push(`<line x1="${n2(opts.ghost[0])}" y1="${n2(opts.ghost[1])}" x2="${n2(opts.ghost[2])}" y2="${n2(opts.ghost[3])}" stroke="${COL.sel}" stroke-width="1.6" stroke-dasharray="5 4"/>`);
    if (opts.cursor) out.push(`<circle cx="${n2(opts.cursor[0])}" cy="${n2(opts.cursor[1])}" r="4" fill="none" stroke="${COL.sel}" stroke-width="1.4"/><text x="${n2(opts.cursor[0] + 8)}" y="${n2(opts.cursor[1] + 16)}" fill="${COL.sel}" font-size="10.5">${esc(opts.cursor[2] || '')}</text>`);
    if (opts.title) out.push(`<text x="10" y="18" fill="var(--ink2, #4a5466)" font-size="12" font-weight="600">${esc(opts.title)}</text>`);
    out.push('</svg>');
    return out.join('');
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function bbox(model) {
    const C = coords(model); let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    C.forEach(c => { for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], c[i]); b[i + 3] = Math.max(b[i + 3], c[i]); } });
    if (!isFinite(b[0])) b = [0, 0, 0, 0, 0, 0];
    return b;
  }

  /* ---------------------------------------------------- podpory */
  function supportSvg(model, s, q, vs) {
    const f = s.fix || [], k = s.k || [];
    const x = q[0], y = q[1], c = COL.sup;
    const g = [];
    if (model.dim === '2D') {
      const ux = !!f[0], uy = !!f[1], rz = !!f[5];
      const spring = (dx, dy, rot) => `<path d="M${n2(x)},${n2(y)} l${n2(dx * 6)},${n2(dy * 6)} ${zig(dx, dy)}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
      const zig = (dx, dy) => { const px = -dy, py = dx; let d = ''; for (let i = 0; i < 4; i++) { const s2 = i % 2 ? -1 : 1; d += `l${n2(dx * 4 + px * 5 * s2)},${n2(dy * 4 + py * 5 * s2)} `; } return d + `l${n2(dx * 6)},${n2(dy * 6)} m${n2(-px * 7)},${n2(-py * 7)} l${n2(px * 14)},${n2(py * 14)}`; };
      if (ux && uy && rz) {
        g.push(`<path d="M${n2(x - 14)},${n2(y)}H${n2(x + 14)}" stroke="${c}" stroke-width="2.4"/>`);
        for (let i = -12; i <= 12; i += 6) g.push(`<path d="M${n2(x + i)},${n2(y)}l-5,8" stroke="${c}" stroke-width="1"/>`);
      } else if (ux && uy) {
        g.push(`<path d="M${n2(x)},${n2(y)} l-9,15 h18 z" fill="var(--panel, #fff)" stroke="${c}" stroke-width="1.5"/><path d="M${n2(x - 13)},${n2(y + 15)}h26" stroke="${c}" stroke-width="1.5"/>`);
        for (let i = -12; i <= 10; i += 5) g.push(`<path d="M${n2(x + i)},${n2(y + 15)}l-4,6" stroke="${c}" stroke-width="0.9"/>`);
      } else if (uy && !ux) {
        g.push(`<path d="M${n2(x)},${n2(y)} l-9,14 h18 z" fill="var(--panel, #fff)" stroke="${c}" stroke-width="1.5"/><circle cx="${n2(x - 5)}" cy="${n2(y + 17.5)}" r="2.6" fill="none" stroke="${c}"/><circle cx="${n2(x + 5)}" cy="${n2(y + 17.5)}" r="2.6" fill="none" stroke="${c}"/><path d="M${n2(x - 13)},${n2(y + 21)}h26" stroke="${c}" stroke-width="1.5"/>`);
        if (rz) g.push(`<path d="M${n2(x - 10)},${n2(y - 2)}h20" stroke="${c}" stroke-width="2.4"/>`);
      } else if (ux && !uy) {
        g.push(`<path d="M${n2(x)},${n2(y)} l-14,-9 v18 z" fill="var(--panel, #fff)" stroke="${c}" stroke-width="1.5"/><circle cx="${n2(x - 17.5)}" cy="${n2(y - 5)}" r="2.6" fill="none" stroke="${c}"/><circle cx="${n2(x - 17.5)}" cy="${n2(y + 5)}" r="2.6" fill="none" stroke="${c}"/><path d="M${n2(x - 21)},${n2(y - 13)}v26" stroke="${c}" stroke-width="1.5"/>`);
      } else if (rz) {
        g.push(`<rect x="${n2(x - 6)}" y="${n2(y - 6)}" width="12" height="12" fill="none" stroke="${c}" stroke-width="1.6"/>`);
      }
      if (+k[0] > 0) g.push(spring(-1, 0));
      if (+k[1] > 0) g.push(spring(0, 1));
      if (+k[5] > 0) g.push(`<path d="M${n2(x + 9)},${n2(y)} a9,9 0 1,1 -4,-7.5" stroke="${c}" stroke-width="1.4" fill="none"/>`);
    } else {
      const nt = f.slice(0, 3).filter(Boolean).length, nr = f.slice(3, 6).filter(Boolean).length;
      if (nt === 3 && nr === 3) g.push(`<rect x="${n2(x - 7)}" y="${n2(y)}" width="14" height="8" fill="${c}"/>`);
      else if (nt === 3) g.push(`<path d="M${n2(x)},${n2(y)} l-8,13 h16 z" fill="var(--panel, #fff)" stroke="${c}" stroke-width="1.5"/>`);
      else if (nt > 0 || nr > 0) g.push(`<path d="M${n2(x)},${n2(y)} l-8,13 h16 z" fill="var(--panel, #fff)" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 2"/>`);
      if (k.some(v => +v > 0)) g.push(`<path d="M${n2(x)},${n2(y)} l0,4 l5,3 l-10,3 l10,3 l-5,3 v4" stroke="${c}" stroke-width="1.2" fill="none"/>`);
      const code = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'].filter((_, i) => f[i]).join('');
      if (code && !(nt === 3 && (nr === 3 || nr === 0))) g.push(`<text x="${n2(x + 10)}" y="${n2(y + 16)}" fill="${c}" font-size="9">${code}</text>`);
    }
    return g.join('');
  }

  /* ---------------------------------------------------- obciążenia */
  function loadsSvg(model, vs, P, C, activeCase, opts) {
    const g = [], pr = c => P.p(c[0], c[1], c[2]);
    const loads = (model.loads || []).filter(l => activeCase === '*' || activeCase === undefined || String(l.case) === String(activeCase));
    if (!loads.length) return '';
    const caseType = {}; (model.cases || []).forEach(c => caseType[String(c.id)] = c.type);
    const colOf = l => CASE_COL[caseType[String(l.case)]] || COL.load;
    // skala obciążeń rozłożonych
    let qmax = 0; loads.forEach(l => { if (l.type === 'dist') qmax = Math.max(qmax, Math.abs(l.q1 || 0), Math.abs(l.q2 ?? l.q1 ?? 0)); });
    const qs = qmax > 0 ? 34 / qmax : 1;
    const gdir = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    const memById = new Map(model.members.map(m => [String(m.id), m]));
    const stack = new Map();   // przesunięcie kolejnych obciążeń tego samego pręta
    loads.forEach(l => {
      const col = colOf(l);
      if (l.type === 'nodal') {
        const c = C.get(String(l.node)); if (!c) return;
        const Fv = l.F || [], q = pr(c);
        const fx = +Fv[0] || 0, fy = +Fv[1] || 0, fz = model.dim === '2D' ? 0 : (+Fv[2] || 0);
        const mag = Math.hypot(fx, fy, fz);
        if (mag > 0) {
          const L = 42 / vs.scale, d = [fx / mag, fy / mag, fz / mag];
          const T = pr([c[0] - d[0] * L, c[1] - d[1] * L, c[2] - d[2] * L]);
          g.push(`<line x1="${n2(T[0])}" y1="${n2(T[1])}" x2="${n2(q[0])}" y2="${n2(q[1])}" stroke="${col}" stroke-width="1.8" marker-end="url(#ar)"/><text x="${n2(T[0] + 4)}" y="${n2(T[1] - 3)}" fill="${col}" font-size="10.5" font-weight="600">${fmtV(mag)} kN</text>`);
        }
        const mz = model.dim === '2D' ? +Fv[5] || 0 : 0;
        if (mz) g.push(`<path d="M${n2(q[0] + 14)},${n2(q[1])} A14,14 0 1,${mz > 0 ? 0 : 1} ${n2(q[0])},${n2(q[1] + (mz > 0 ? -14 : 14))}" stroke="${col}" stroke-width="1.6" fill="none" marker-end="url(#ar)"/><text x="${n2(q[0] + 16)}" y="${n2(q[1] - 12)}" fill="${col}" font-size="10.5" font-weight="600">${fmtV(Math.abs(mz))} kNm</text>`);
        return;
      }
      const m = memById.get(String(l.member)); if (!m) return;
      const ax = axesOf(model, m, C); if (!ax) return;
      const L = ax.L;
      const pos = v => (l.rel === false ? v : v * L);
      const dirW = d => (d === 'x' ? ax.ex : d === 'y' ? ax.ey : d === 'z' ? ax.ez : gdir[d] || [0, 0, 0]);
      const at = (x) => [ax.p1[0] + ax.ex[0] * x, ax.p1[1] + ax.ex[1] * x, ax.p1[2] + ax.ex[2] * x];
      const key = String(l.member) + l.dir, off0 = stack.get(key) || 0;
      if (l.type === 'dist') {
        const a = pos(l.a ?? 0), b = pos(l.b ?? 1), q1 = +l.q1 || 0, q2 = +(l.q2 ?? l.q1) || 0;
        const d = dirW(l.dir);
        const n = 8, pts = [], arrows = [];
        const offPx = off0 * 1;
        for (let i = 0; i <= n; i++) {
          const x = a + (b - a) * i / n, qv = q1 + (q2 - q1) * i / n;
          const base = at(x);
          const sgn = Math.sign(qv) || 1, len = Math.abs(qv) * qs / vs.scale, o = offPx / vs.scale;
          const tail = [base[0] - d[0] * (len + o) * sgn, base[1] - d[1] * (len + o) * sgn, base[2] - d[2] * (len + o) * sgn];
          const head = [base[0] - d[0] * o * sgn, base[1] - d[1] * o * sgn, base[2] - d[2] * o * sgn];
          const T = pr(tail), Hd = pr(head);
          pts.push(T);
          if (Math.abs(qv) > 1e-12) arrows.push(`<line x1="${n2(T[0])}" y1="${n2(T[1])}" x2="${n2(Hd[0])}" y2="${n2(Hd[1])}" stroke="${col}" stroke-width="0.9" marker-end="url(#ar)"/>`);
          if (i === 0) pts.unshift(Hd);
          if (i === n) pts.push(Hd);
        }
        g.push(`<path d="M${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join('L')}" fill="${col}" fill-opacity="0.08" stroke="${col}" stroke-width="1"/>`, arrows.join(''));
        const mid = pts[Math.floor(pts.length / 2)];
        g.push(`<text x="${n2(mid[0] + 4)}" y="${n2(mid[1] - 4)}" fill="${col}" font-size="10.5" font-weight="600">${q1 === q2 ? fmtV(Math.abs(q1)) : fmtV(Math.abs(q1)) + '…' + fmtV(Math.abs(q2))} kN/m${l.proj ? ' (rzut)' : ''}</text>`);
        stack.set(key, off0 + Math.max(Math.abs(q1), Math.abs(q2)) * qs + 12);
      } else if (l.type === 'point') {
        const x = pos(l.a ?? 0.5), d = dirW(l.dir), P0 = +l.P || 0, base = at(x);
        const sgn = Math.sign(P0) || 1, len = 38 / vs.scale;
        const T = pr([base[0] - d[0] * len * sgn, base[1] - d[1] * len * sgn, base[2] - d[2] * len * sgn]), Hd = pr(base);
        g.push(`<line x1="${n2(T[0])}" y1="${n2(T[1])}" x2="${n2(Hd[0])}" y2="${n2(Hd[1])}" stroke="${col}" stroke-width="1.8" marker-end="url(#ar)"/><text x="${n2(T[0] + 4)}" y="${n2(T[1] - 3)}" fill="${col}" font-size="10.5" font-weight="600">${fmtV(Math.abs(P0))} kN</text>`);
      } else if (l.type === 'moment') {
        const x = pos(l.a ?? 0.5), q = pr(at(x)), M0 = +l.M || 0;
        g.push(`<path d="M${n2(q[0] + 12)},${n2(q[1])} A12,12 0 1,${M0 > 0 ? 0 : 1} ${n2(q[0])},${n2(q[1] - 12)}" stroke="${col}" stroke-width="1.6" fill="none" marker-end="url(#ar)"/><text x="${n2(q[0] + 14)}" y="${n2(q[1] - 10)}" fill="${col}" font-size="10.5" font-weight="600">${fmtV(Math.abs(M0))} kNm</text>`);
      } else if (l.type === 'temp') {
        const q = pr(at(L / 2));
        g.push(`<text x="${n2(q[0])}" y="${n2(q[1] + 15)}" text-anchor="middle" fill="${col}" font-size="10.5" font-weight="600">ΔT=${fmtV(l.dT || 0, 1)}${l.dTz ? ', ΔTz=' + fmtV(l.dTz, 1) : ''} K</text>`);
      }
    });
    return g.join('');
  }

  /* ---------------------------------------------------- wykresy sił */
  // diag: { key: 'My'|'Mz'|'Vz'|'Vy'|'N'|'T', members:[{id, st:[{x, [key]: v | [min,max]}]}], env: bool, scale, unit }
  function diagramSvg(model, vs, P, C, diag) {
    const g = [], pr = c => P.p(c[0], c[1], c[2]);
    const key = diag.key;
    const memById = new Map(model.members.map(m => [String(m.id), m]));
    let vmax = 0;
    diag.members.forEach(dm => dm.st.forEach(s => { const v = s[key]; if (Array.isArray(v)) vmax = Math.max(vmax, Math.abs(v[0]), Math.abs(v[1])); else vmax = Math.max(vmax, Math.abs(v || 0)); }));
    if (vmax < 1e-9) return `<text x="${vs.w / 2}" y="24" text-anchor="middle" fill="var(--ink3, #7a8494)">wartości zerowe</text>`;
    const px = (diag.scale || 1) * 55 / vmax / vs.scale;
    // kierunek odkładania: My → −z (strona rozciągana dla M>0), Mz → −y, V/N/T → +z (lub +y)
    const offDir = (ax) => {
      if (key === 'My') return ax.ez.map(v => -v);
      if (key === 'Mz') return ax.ey.map(v => -v);
      if (key === 'Vy') return ax.ey;
      return ax.ez;
    };
    diag.members.forEach(dm => {
      const m = memById.get(String(dm.id)); if (!m) return;
      const ax = axesOf(model, m, C); if (!ax) return;
      const d = offDir(ax);
      const curves = diag.env ? [0, 1] : [null];
      curves.forEach(ci => {
        const val = s => { const v = s[key]; return Array.isArray(v) ? v[ci === null ? 1 : ci] : v; };
        const base = s => [ax.p1[0] + ax.ex[0] * s.x, ax.p1[1] + ax.ex[1] * s.x, ax.p1[2] + ax.ex[2] * s.x];
        const pts = dm.st.map(s => { const b = base(s), v = val(s) * px; return pr([b[0] + d[0] * v, b[1] + d[1] * v, b[2] + d[2] * v]); });
        const A = pr(ax.p1), B = pr(ax.p2);
        // wypełnienie: osobno dla części dodatnich i ujemnych (kolory)
        const poly = `M${n2(A[0])},${n2(A[1])}L${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join('L')}L${n2(B[0])},${n2(B[1])}Z`;
        const allNeg = dm.st.every(s => val(s) <= 1e-9), allPos = dm.st.every(s => val(s) >= -1e-9);
        const fc = allNeg ? COL.diagN : allPos ? COL.diagP : (ci === 0 ? COL.diagN : COL.diagP);
        g.push(`<path d="${poly}" fill="${fc}" fill-opacity="${diag.env ? 0.10 : 0.16}" stroke="none"/>`);
        g.push(`<path d="M${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join('L')}" fill="none" stroke="${fc}" stroke-width="1.3"/>`);
        // opisy: w 2D wartości na końcach i ekstremum; w 3D i dla obwiedni – tylko ekstremum
        if (diag.labels !== false) {
          let im = 0; dm.st.forEach((s, i) => { if (Math.abs(val(s)) > Math.abs(val(dm.st[im]))) im = i; });
          const idx = new Set(model.dim === '3D' ? [im] : [0, dm.st.length - 1, im]);
          if (diag.env && ci !== null) {
            // dla obwiedni opisujemy tylko krzywą z większą wartością bezwzględną
            const other = 1 - ci, vo = Math.max(...dm.st.map(s => Math.abs(s[key][other])));
            if (vo > Math.abs(val(dm.st[im])) || (vo === Math.abs(val(dm.st[im])) && ci === 0)) idx.clear();
            else if (model.dim === '2D') { idx.clear(); idx.add(im); [0, dm.st.length - 1].forEach(k => { if (Math.abs(val(dm.st[k])) >= Math.abs(dm.st[k][key][other])) idx.add(k); }); }
          }
          const seen = [];
          idx.forEach(i => {
            const v = val(dm.st[i]); if (Math.abs(v) < vmax * 0.02) return;
            const p = pts[i];
            if (seen.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 18)) return; seen.push(p);
            g.push(`<text x="${n2(p[0])}" y="${n2(p[1] + (v * (d[2] || d[1]) > 0 ? -4 : 12))}" text-anchor="middle" fill="${v < 0 ? COL.diagN : COL.diagP}" font-size="10" font-weight="600" paint-order="stroke" stroke="var(--panel, #fff)" stroke-width="3">${fmtV(v)}</text>`);
          });
        }
      });
    });
    return g.join('');
  }

  /* ---------------------------------------------------- deformacja */
  // def: { disp: Map(nodeId → [6]) lub tablica wg kolejności węzłów, members:[{id, st}] (opcjonalnie), scale (mnożnik), auto: true }
  function deformedSvg(model, vs, P, C, def, color) {
    const pr = c => P.p(c[0], c[1], c[2]);
    const dispOf = id => { const i = model.nodes.findIndex(n => String(n.id) === String(id)); return def.disp[i] || [0, 0, 0]; };
    let umax = 0;
    model.nodes.forEach((n, i) => { const d = def.disp[i]; if (d) umax = Math.max(umax, Math.hypot(d[0], d[1], d[2])); });
    if (def.members) def.members.forEach(dm => dm.st.forEach(s => umax = Math.max(umax, Math.hypot(s.ux || 0, s.uy || 0, s.uz || 0))));
    if (umax < 1e-12) return '';
    const sc = (def.scale || 1) * 45 / umax / vs.scale;
    const g = [];
    const stById = new Map((def.members || []).map(dm => [String(dm.id), dm.st]));
    model.members.forEach(m => {
      const ax = axesOf(model, m, C); if (!ax) return;
      const st = stById.get(String(m.id));
      let pts;
      if (st && st.length > 1) {
        pts = st.map(s => { const b = [ax.p1[0] + ax.ex[0] * s.x, ax.p1[1] + ax.ex[1] * s.x, ax.p1[2] + ax.ex[2] * s.x]; const d = [0, 1, 2].map(k => ax.ex[k] * (s.ux || 0) + ax.ey[k] * (s.uy || 0) + ax.ez[k] * (s.uz || 0)); return pr([b[0] + d[0] * sc, b[1] + d[1] * sc, b[2] + d[2] * sc]); });
      } else {
        const d1 = dispOf(m.n1), d2 = dispOf(m.n2);
        pts = [pr([ax.p1[0] + d1[0] * sc, ax.p1[1] + d1[1] * sc, ax.p1[2] + d1[2] * sc]), pr([ax.p2[0] + d2[0] * sc, ax.p2[1] + d2[1] * sc, ax.p2[2] + d2[2] * sc])];
      }
      g.push(`<path d="M${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join('L')}" fill="none" stroke="${color}" stroke-width="1.8"/>`);
    });
    // wartość maksymalnego przemieszczenia węzła
    let imax = -1, vm = 0; model.nodes.forEach((n, i) => { const d = def.disp[i]; if (!d) return; const v = Math.hypot(d[0], d[1], d[2]); if (v > vm) { vm = v; imax = i; } });
    if (imax >= 0 && def.labels !== false) {
      const n = model.nodes[imax], c = C.get(String(n.id)), d = def.disp[imax];
      const q = pr([c[0] + d[0] * sc, c[1] + d[1] * sc, c[2] + d[2] * sc]);
      g.push(`<text x="${n2(q[0] + 6)}" y="${n2(q[1] + 14)}" fill="${color}" font-size="10.5" font-weight="600" paint-order="stroke" stroke="var(--panel, #fff)" stroke-width="3">${def.unitLabel ? def.unitLabel(vm) : fmtV(vm * 1000, 2) + ' mm'}</text>`);
    }
    return g.join('');
  }

  /* ---------------------------------------------------- reakcje */
  function reactionsSvg(model, vs, P, C, reac) {
    const g = [], pr = c => P.p(c[0], c[1], c[2]);
    reac.forEach(r => {
      const c = C.get(String(r.node)); if (!c) return;
      const q = pr(c), R = r.R;
      const val = (k) => Array.isArray(R[k]) ? R[k] : [R[k], R[k]];
      const comps = model.dim === '2D' ? [[0, [1, 0, 0], 'R<tspan font-size="8">x</tspan>'], [1, [0, 1, 0], 'R<tspan font-size="8">y</tspan>']] : [[0, [1, 0, 0], 'Rx'], [1, [0, 1, 0], 'Ry'], [2, [0, 0, 1], 'Rz']];
      let line = 0;
      comps.forEach(([k, d, nm]) => {
        const [a, b] = val(k); if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return;
        const v = Math.abs(b) >= Math.abs(a) ? b : a, sgn = Math.sign(v) || 1, L = 36 / vs.scale;
        // strzałka reakcji: od węzła w kierunku działania (skierowana do podpory od zewnątrz)
        const T = pr([c[0] - d[0] * L * sgn, c[1] - d[1] * L * sgn, c[2] - d[2] * L * sgn]);
        g.push(`<line x1="${n2(T[0])}" y1="${n2(T[1])}" x2="${n2(q[0])}" y2="${n2(q[1])}" stroke="${COL.reac}" stroke-width="1.6" marker-end="url(#ar)"/>`);
        const txt = a === b ? fmtV(v) : `${fmtV(a)} / ${fmtV(b)}`;
        g.push(`<text x="${n2(q[0] + 8)}" y="${n2(q[1] + 30 + 12 * line)}" fill="${COL.reac}" font-size="10" font-weight="600">${nm} = ${txt}</text>`);
        line++;
      });
      const mk = model.dim === '2D' ? 5 : -1;
      if (mk >= 0) { const [a, b] = val(mk); if (Math.abs(a) > 1e-6 || Math.abs(b) > 1e-6) { g.push(`<text x="${n2(q[0] + 8)}" y="${n2(q[1] + 30 + 12 * line)}" fill="${COL.reac}" font-size="10" font-weight="600">M = ${a === b ? fmtV(a) : fmtV(a) + ' / ' + fmtV(b)}</text>`); } }
    });
    return g.join('');
  }

  /* ---------------------------------------------------- wybieranie */
  function pick(model, vs, sx, sy, tol = 9) {
    const P = projector(vs), C = coords(model);
    let best = null, bd = tol;
    model.nodes.forEach(n => { const c = C.get(String(n.id)), q = P.p(c[0], c[1], c[2]); const d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd) { bd = d; best = { kind: 'node', id: String(n.id), q }; } });
    if (best) return best;
    bd = tol * 0.8;
    model.members.forEach(m => {
      const a = C.get(String(m.n1)), b = C.get(String(m.n2)); if (!a || !b) return;
      const A = P.p(a[0], a[1], a[2]), B = P.p(b[0], b[1], b[2]);
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - A[0]) * dx + (sy - A[1]) * dy) / L2));
      const d = Math.hypot(A[0] + t * dx - sx, A[1] + t * dy - sy);
      if (d < bd) { bd = d; best = { kind: 'member', id: String(m.id), t }; }
    });
    return best;
  }

  root.BMView = { projector, fit, render, pick, coords, bbox, axesOf, CASE_COL };
})(typeof self !== 'undefined' ? self : this);
