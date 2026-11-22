/* Rama2D – silnik obliczeniowy: MES ramy płaskiej (Euler–Bernoulli, I rząd),
   przeguby, podpory sztywne/sprężyste/ukośne, przypadki i kombinacje PN-EN 1990.
   Jednostki wewnętrzne: kN, m, rad. Układ globalny: X →, Y ↑, obrót + przeciwnie do wskazówek zegara. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R2E = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ katalogi
  const MATS = [
    { key: 'C12/15', grp: 'Beton', E: 27, g: 25, a: 1e-5 },
    { key: 'C16/20', grp: 'Beton', E: 29, g: 25, a: 1e-5 },
    { key: 'C20/25', grp: 'Beton', E: 30, g: 25, a: 1e-5 },
    { key: 'C25/30', grp: 'Beton', E: 31, g: 25, a: 1e-5 },
    { key: 'C30/37', grp: 'Beton', E: 33, g: 25, a: 1e-5 },
    { key: 'C35/45', grp: 'Beton', E: 34, g: 25, a: 1e-5 },
    { key: 'C40/50', grp: 'Beton', E: 35, g: 25, a: 1e-5 },
    { key: 'C45/55', grp: 'Beton', E: 36, g: 25, a: 1e-5 },
    { key: 'C50/60', grp: 'Beton', E: 37, g: 25, a: 1e-5 },
    { key: 'S235', grp: 'Stal', E: 210, g: 78.5, a: 1.2e-5 },
    { key: 'S275', grp: 'Stal', E: 210, g: 78.5, a: 1.2e-5 },
    { key: 'S355', grp: 'Stal', E: 210, g: 78.5, a: 1.2e-5 },
    { key: 'C24', grp: 'Drewno', E: 11, g: 4.2, a: 5e-6 },
    { key: 'C30', grp: 'Drewno', E: 12, g: 4.6, a: 5e-6 },
    { key: 'GL24h', grp: 'Drewno', E: 11.5, g: 4.2, a: 5e-6 },
    { key: 'GL28h', grp: 'Drewno', E: 12.6, g: 4.6, a: 5e-6 },
    { key: 'GL32h', grp: 'Drewno', E: 14.2, g: 4.9, a: 5e-6 }
  ];

  // [h, b, tw, tf, r] w mm; wartości katalogowe A [cm²], Iy [cm⁴] do kontroli
  const PROFILES = {
    'IPE 80': [80, 46, 3.8, 5.2, 5], 'IPE 100': [100, 55, 4.1, 5.7, 7], 'IPE 120': [120, 64, 4.4, 6.3, 7],
    'IPE 140': [140, 73, 4.7, 6.9, 7], 'IPE 160': [160, 82, 5.0, 7.4, 9], 'IPE 180': [180, 91, 5.3, 8.0, 9],
    'IPE 200': [200, 100, 5.6, 8.5, 12], 'IPE 220': [220, 110, 5.9, 9.2, 12], 'IPE 240': [240, 120, 6.2, 9.8, 15],
    'IPE 270': [270, 135, 6.6, 10.2, 15], 'IPE 300': [300, 150, 7.1, 10.7, 15], 'IPE 330': [330, 160, 7.5, 11.5, 18],
    'IPE 360': [360, 170, 8.0, 12.7, 18], 'IPE 400': [400, 180, 8.6, 13.5, 21], 'IPE 450': [450, 190, 9.4, 14.6, 21],
    'IPE 500': [500, 200, 10.2, 16.0, 21], 'IPE 550': [550, 210, 11.1, 17.2, 24], 'IPE 600': [600, 220, 12.0, 19.0, 24],
    'HEA 100': [96, 100, 5, 8, 12], 'HEA 120': [114, 120, 5, 8, 12], 'HEA 140': [133, 140, 5.5, 8.5, 12],
    'HEA 160': [152, 160, 6, 9, 15], 'HEA 180': [171, 180, 6, 9.5, 15], 'HEA 200': [190, 200, 6.5, 10, 18],
    'HEA 220': [210, 220, 7, 11, 18], 'HEA 240': [230, 240, 7.5, 12, 21], 'HEA 260': [250, 260, 7.5, 12.5, 24],
    'HEA 280': [270, 280, 8, 13, 24], 'HEA 300': [290, 300, 8.5, 14, 27], 'HEA 320': [310, 300, 9, 15.5, 27],
    'HEA 340': [330, 300, 9.5, 16.5, 27], 'HEA 360': [350, 300, 10, 17.5, 27], 'HEA 400': [390, 300, 11, 19, 27],
    'HEB 100': [100, 100, 6, 10, 12], 'HEB 120': [120, 120, 6.5, 11, 12], 'HEB 140': [140, 140, 7, 12, 12],
    'HEB 160': [160, 160, 8, 13, 15], 'HEB 180': [180, 180, 8.5, 14, 15], 'HEB 200': [200, 200, 9, 15, 18],
    'HEB 220': [220, 220, 9.5, 16, 18], 'HEB 240': [240, 240, 10, 17, 21], 'HEB 260': [260, 260, 10, 17.5, 24],
    'HEB 280': [280, 280, 10.5, 18, 24], 'HEB 300': [300, 300, 11, 19, 27], 'HEB 320': [320, 300, 11.5, 20.5, 27],
    'HEB 340': [340, 300, 12, 21.5, 27], 'HEB 360': [360, 300, 12.5, 22.5, 27], 'HEB 400': [400, 300, 13.5, 24, 27],
    'HEB 450': [450, 300, 14, 26, 27], 'HEB 500': [500, 300, 14.5, 28, 27]
  };

  const CATS = {
    A: { n: 'Kat. A – powierzchnie mieszkalne', p: [0.7, 0.5, 0.3] },
    B: { n: 'Kat. B – powierzchnie biurowe', p: [0.7, 0.5, 0.3] },
    C: { n: 'Kat. C – miejsca zebrań', p: [0.7, 0.7, 0.6] },
    D: { n: 'Kat. D – powierzchnie handlowe', p: [0.7, 0.7, 0.6] },
    E: { n: 'Kat. E – magazyny', p: [1.0, 0.9, 0.8] },
    F: { n: 'Kat. F – ruch pojazdów ≤ 30 kN', p: [0.7, 0.7, 0.6] },
    G: { n: 'Kat. G – ruch pojazdów 30–160 kN', p: [0.7, 0.5, 0.3] },
    H: { n: 'Kat. H – dachy', p: [0, 0, 0] },
    S1: { n: 'Śnieg (H ≤ 1000 m n.p.m.)', p: [0.5, 0.2, 0] },
    S2: { n: 'Śnieg (H > 1000 m n.p.m.)', p: [0.7, 0.5, 0.2] },
    W: { n: 'Wiatr', p: [0.6, 0.2, 0] },
    T: { n: 'Temperatura (nie pożarowa)', p: [0.6, 0.5, 0] },
    X: { n: 'Inne (ψ wpisane ręcznie)', p: null }
  };

  const SUP_PRESETS = {
    pin: { n: 'Przegubowa nieprzesuwna', f: [1, 1, 0] },
    rollH: { n: 'Przegubowa przesuwna (przesuw w X)', f: [0, 1, 0] },
    rollV: { n: 'Przegubowa przesuwna (przesuw w Y)', f: [1, 0, 0] },
    fix: { n: 'Utwierdzenie', f: [1, 1, 1] },
    slideH: { n: 'Utwierdzenie przesuwne (przesuw w X)', f: [0, 1, 1] },
    slideV: { n: 'Utwierdzenie przesuwne (przesuw w Y)', f: [1, 0, 1] },
    sprY: { n: 'Sprężysta pionowo (nieprzesuwna w X)', f: [1, 2, 0] },
    sprR: { n: 'Utwierdzenie sprężyste (obrót)', f: [1, 1, 2] },
    custom: { n: 'Własna (każdy kierunek osobno)', f: null }
  };

  const DEF_SET = { comb: 'ab', gGs: 1.35, gGi: 1.0, gQ: 1.5, xi: 0.85, accPsi: 1, nDiv: 40, width: true };

  // ------------------------------------------------------------------ przekroje
  function profileProps(name) {
    const p = PROFILES[name];
    if (!p) return null;
    const [h, b, tw, tf, r] = p;
    const Af = (1 - Math.PI / 4) * r * r;
    const yf = h / 2 - tf - r * (10 - 3 * Math.PI) / (12 - 3 * Math.PI);
    const A = 2 * b * tf + (h - 2 * tf) * tw + 4 * Af;
    const I = (b * h ** 3 - (b - tw) * (h - 2 * tf) ** 3) / 12 + 4 * Af * yf * yf;
    return { A: A * 1e-6, I: I * 1e-12, h: h / 1000, b: b / 1000 };
  }

  // zwraca {A [m²], I [m⁴], h [m]} lub null
  function secProps(s) {
    if (!s) return null;
    const n = v => (typeof v === 'number' && isFinite(v) ? v : 0);
    let A = 0, I = 0, h = 0;
    switch (s.shape) {
      case 'rect': { const b = n(s.b) / 1000, hh = n(s.h) / 1000; A = b * hh; I = b * hh ** 3 / 12; h = hh; break; }
      case 'circ': { const d = n(s.d) / 1000; A = Math.PI * d * d / 4; I = Math.PI * d ** 4 / 64; h = d; break; }
      case 'tube': {
        const D = n(s.d) / 1000, t = Math.min(n(s.t) / 1000, D / 2), d = D - 2 * t;
        A = Math.PI * (D * D - d * d) / 4; I = Math.PI * (D ** 4 - d ** 4) / 64; h = D; break;
      }
      case 'box': {
        const b = n(s.b) / 1000, hh = n(s.h) / 1000, t = Math.min(n(s.t) / 1000, b / 2, hh / 2);
        A = b * hh - (b - 2 * t) * (hh - 2 * t); I = (b * hh ** 3 - (b - 2 * t) * (hh - 2 * t) ** 3) / 12; h = hh; break;
      }
      case 'I': {
        const hh = n(s.h), b = n(s.b), tw = n(s.tw), tf = n(s.tf);
        A = (2 * b * tf + (hh - 2 * tf) * tw) * 1e-6;
        I = (b * hh ** 3 - (b - tw) * (hh - 2 * tf) ** 3) / 12 * 1e-12; h = hh / 1000; break;
      }
      case 'cat': { const p = profileProps(s.cat); if (!p) return null; A = p.A; I = p.I; h = p.h; break; }
      case 'man': default: A = n(s.A) * 1e-4; I = n(s.I) * 1e-8; h = n(s.hm) / 1000; break;
    }
    if (!(A > 0) || !(I > 0)) return null;
    return { A, I, h: h > 0 ? h : Math.sqrt(12 * I / A) };
  }

  function psiOf(c) {
    if (c.cat && CATS[c.cat] && CATS[c.cat].p) return CATS[c.cat].p.slice();
    return [num(c.psi0, 0), num(c.psi1, 0), num(c.psi2, 0)];
  }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  // ------------------------------------------------------------------ algebra
  function rot3(th) { const c = Math.cos(th), s = Math.sin(th); return [c, s, 0, -s, c, 0, 0, 0, 1]; }

  function localK(EA, EI, L) {
    const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
    return [
      [a, 0, 0, -a, 0, 0],
      [0, b, c, 0, -b, c],
      [0, c, d, 0, -c, e],
      [-a, 0, 0, a, 0, 0],
      [0, -b, -c, 0, b, -c],
      [0, c, e, 0, -c, d]
    ];
  }

  // kondensacja statyczna zwolnionych stopni swobody (momenty na końcach = 0)
  // k: 6x6, f0: siły przywęzłowe (utwierdzenie), rel: lista indeksów (2 i/lub 5)
  function condense(k, f0, rel) {
    if (!rel.length) return { k, f0 };
    const r = [0, 1, 2, 3, 4, 5].filter(i => rel.indexOf(i) < 0);
    // odwrotność kcc (1x1 lub 2x2)
    let inv;
    if (rel.length === 1) inv = [[1 / k[rel[0]][rel[0]]]];
    else {
      const a = k[rel[0]][rel[0]], b = k[rel[0]][rel[1]], c = k[rel[1]][rel[0]], d = k[rel[1]][rel[1]];
      const det = a * d - b * c;
      inv = [[d / det, -b / det], [-c / det, a / det]];
    }
    const K = [0, 1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0]);
    const F = [0, 0, 0, 0, 0, 0];
    for (const i of r) {
      // t = k_ic * inv  (wektor 1 x nc)
      const t = rel.map((_, q) => rel.reduce((s, cc, p) => s + k[i][cc] * inv[p][q], 0));
      for (const j of r) {
        let v = k[i][j];
        for (let q = 0; q < rel.length; q++) v -= t[q] * k[rel[q]][j];
        K[i][j] = v;
      }
      let fv = f0[i];
      for (let q = 0; q < rel.length; q++) fv -= t[q] * f0[rel[q]];
      F[i] = fv;
    }
    return { k: K, f0: F };
  }

  // ------------------------------------------------------------------ obciążenia prętowe → lokalne
  // pozycja na pręcie (m od początku)
  function posAbs(x, mode, L) {
    x = num(x, 0);
    if (mode === 'rel') return x * L;
    if (mode === 'end') return L - x;
    return x;
  }

  // zamienia obciążenia przypadku na listę lokalnych obciążeń pręta
  // lokalne: {k:'d', a, b, px1, py1, px2, py2} | {k:'p', a, px, py} | {k:'m', a, m} (m przeciwnie do wskazówek)
  function memberLocalLoads(ld, mg, W) {
    const { L, c, s } = mg;
    const out = [];
    const gl = (gx, gy) => [c * gx + s * gy, -s * gx + c * gy]; // wektor globalny → lokalny
    if (ld.type === 'q') {
      let a = 0, b = L;
      if (!ld.full) { a = posAbs(ld.x1, ld.mode, L); b = posAbs(ld.x2, ld.mode, L); }
      let q1 = num(ld.q1, 0), q2 = num(ld.q2 === undefined || ld.q2 === null ? ld.q1 : ld.q2, q1);
      if (a > b) { [a, b] = [b, a]; [q1, q2] = [q2, q1]; }
      const tol = 1e-9 * L;
      if (a < -tol || b > L + tol) W && W.push('obciążenie wychodzi poza pręt – przycięto');
      const A0 = Math.max(0, a), B0 = Math.min(L, b);
      if (B0 - A0 <= tol) return out;
      // przycięcie z interpolacją
      const qa = b > a ? q1 + (q2 - q1) * (A0 - a) / (b - a) : q1;
      const qb = b > a ? q1 + (q2 - q1) * (B0 - a) / (b - a) : q2;
      const mul = ld.unit === 'm2' ? num(ld.bw, 1) : 1;
      let f = 1, vec;
      switch (ld.dir) {
        case 'X': vec = gl(1, 0); if (ld.proj) f = Math.abs(s); break;
        case 'n': vec = [0, -1]; break;
        case 't': vec = [1, 0]; break;
        case 'Y': default: vec = gl(0, -1); if (ld.proj) f = Math.abs(c); break;
      }
      const k1 = qa * mul * f, k2 = qb * mul * f;
      out.push({ k: 'd', a: A0, b: B0, px1: vec[0] * k1, py1: vec[1] * k1, px2: vec[0] * k2, py2: vec[1] * k2 });
    } else if (ld.type === 'F') {
      const a = Math.min(L, Math.max(0, posAbs(ld.x, ld.mode, L)));
      const F = num(ld.F, 0);
      let vec;
      switch (ld.dir) {
        case 'X': vec = gl(1, 0); break;
        case 'n': vec = [0, -1]; break;
        case 't': vec = [1, 0]; break;
        case 'Y': default: vec = gl(0, -1); break;
      }
      out.push({ k: 'p', a, px: vec[0] * F, py: vec[1] * F });
    } else if (ld.type === 'Mm') {
      const a = Math.min(L, Math.max(0, posAbs(ld.x, ld.mode, L)));
      out.push({ k: 'm', a, m: -num(ld.M, 0) }); // użytkownik: + zgodnie z ruchem wskazówek
    }
    return out;
  }

  // ------------------------------------------------------------------ siły przekrojowe w pręcie
  // f – siły na końcu i działające na pręt (lokalne): f[0]=Fx, f[1]=Fy, f[2]=M (przeciwnie do wsk.)
  // konwencja: N + rozciąganie, V + obraca element zgodnie z ruchem wskazówek, M + rozciąga włókna spodnie (strona −y lokalne)
  function forcesAt(ml, f, x, side, L, out) {
    let N = -f[0], V = f[1], M = -f[2] + f[1] * x;
    const eps = 1e-9 * L;
    for (let i = 0; i < ml.length; i++) {
      const l = ml[i];
      if (l.k === 'd') {
        if (x <= l.a + eps) continue;
        const xe = Math.min(x, l.b), t1 = xe - l.a, len = l.b - l.a;
        if (t1 <= 0 || len <= 0) continue;
        const X = x - l.a;
        const sx = (l.px2 - l.px1) / len, sy = (l.py2 - l.py1) / len;
        const Ix = l.px1 * t1 + sx * t1 * t1 / 2;
        const Iy = l.py1 * t1 + sy * t1 * t1 / 2;
        const My = l.py1 * (X * t1 - t1 * t1 / 2) + sy * (X * t1 * t1 / 2 - t1 ** 3 / 3);
        N -= Ix; V += Iy; M += My;
      } else {
        const inc = l.a < x - eps || (Math.abs(l.a - x) <= eps && side > 0);
        if (!inc) continue;
        if (l.k === 'p') { N -= l.px; V += l.py; M += l.py * (x - l.a); }
        else M -= l.m;
      }
    }
    if (out) { out[0] = N; out[1] = V; out[2] = M; return out; }
    return [N, V, M];
  }
  const G3 = [-0.7745966692414834, 0, 0.7745966692414834], W3 = [5 / 9, 8 / 9, 5 / 9];

  // siły przywęzłowe (utwierdzenie obustronne) od obciążeń w przęśle: f0 = −∫Nᵀp
  const GP = [[-0.8611363115940526, 0.3478548451374538], [-0.3399810435848563, 0.6521451548625461],
    [0.3399810435848563, 0.6521451548625461], [0.8611363115940526, 0.3478548451374538]];
  function shapes(x, L) {
    const x1 = x / L, x2 = x1 * x1, x3 = x2 * x1;
    return {
      N: [1 - x1, 1 - 3 * x2 + 2 * x3, L * (x1 - 2 * x2 + x3), x1, 3 * x2 - 2 * x3, L * (-x2 + x3)],
      dN: [(-6 * x1 + 6 * x2) / L, 1 - 4 * x1 + 3 * x2, (6 * x1 - 6 * x2) / L, -2 * x1 + 3 * x2]
    };
  }
  function fixedEnd(ml, L, EA, EI, h, temps) {
    const F = [0, 0, 0, 0, 0, 0];
    for (const l of ml) {
      if (l.k === 'd') {
        const len = l.b - l.a, mid = (l.a + l.b) / 2;
        for (const [g, w] of GP) {
          const x = mid + g * len / 2, t = (x - l.a) / len;
          const px = l.px1 + (l.px2 - l.px1) * t, py = l.py1 + (l.py2 - l.py1) * t;
          const sh = shapes(x, L).N, ww = w * len / 2;
          F[0] += sh[0] * px * ww; F[3] += sh[3] * px * ww;
          F[1] += sh[1] * py * ww; F[2] += sh[2] * py * ww; F[4] += sh[4] * py * ww; F[5] += sh[5] * py * ww;
        }
      } else if (l.k === 'p') {
        const sh = shapes(l.a, L).N;
        F[0] += sh[0] * l.px; F[3] += sh[3] * l.px;
        F[1] += sh[1] * l.py; F[2] += sh[2] * l.py; F[4] += sh[4] * l.py; F[5] += sh[5] * l.py;
      } else {
        const d = shapes(l.a, L).dN;
        F[1] += d[0] * l.m; F[2] += d[1] * l.m; F[4] += d[2] * l.m; F[5] += d[3] * l.m;
      }
    }
    const f0 = F.map(v => -v);
    for (const t of temps) {
      const n = EA * t.a * t.dT, m = EI * t.a * t.dTg / h;
      f0[0] += n; f0[3] -= n; f0[2] -= m; f0[5] += m;
    }
    return f0;
  }

  // ------------------------------------------------------------------ analiza
  function analyze(model) {
    const T0 = Date.now();
    const set = Object.assign({}, DEF_SET, model.set || {});
    const res = { ok: false, errors: [], warnings: [], set };
    const warn = (t) => { if (res.warnings.indexOf(t) < 0) res.warnings.push(t); };

    const mats = new Map((model.mats || []).map(m => [m.uid, m]));
    const secs = new Map();
    for (const s of model.secs || []) {
      const p = secProps(s), m = mats.get(s.mat);
      secs.set(s.uid, p && m ? { ...p, E: num(m.E, 0) * 1e6, g: num(m.g, 0), a: num(m.a, 0), name: s.name } : null);
    }
    const nodeIdx = new Map();
    const allNodes = model.nodes || [];
    const nodeByUid = new Map(allNodes.map(n => [n.uid, n]));

    // pręty
    const mem = [];
    for (const m of model.members || []) {
      const ni = nodeByUid.get(m.i), nj = nodeByUid.get(m.j);
      const nr = mem.length + 1;
      if (!ni || !nj) { res.errors.push('Pręt ' + ((model.members.indexOf(m)) + 1) + ': brak węzła.'); continue; }
      const dx = nj.x - ni.x, dy = nj.y - ni.y, L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) { res.errors.push('Pręt ' + (model.members.indexOf(m) + 1) + ': zerowa długość.'); continue; }
      const sp = secs.get(m.sec);
      if (!sp) { res.errors.push('Pręt ' + (model.members.indexOf(m) + 1) + ': niepoprawny przekrój lub materiał.'); continue; }
      if (!(sp.E > 0)) { res.errors.push('Pręt ' + (model.members.indexOf(m) + 1) + ': moduł E ≤ 0.'); continue; }
      mem.push({ uid: m.uid, no: model.members.indexOf(m) + 1, src: m, ni, nj, L, c: dx / L, s: dy / L, ang: Math.atan2(dy, dx),
        EA: sp.E * sp.A, EI: sp.E * sp.I, h: sp.h, A: sp.A, I: sp.I, E: sp.E, g: sp.g, aT: sp.a,
        ri: !!(m.ri || ni.hinge), rj: !!(m.rj || nj.hinge) });
      void nr;
    }
    if (res.errors.length) return res;
    if (!mem.length) { res.errors.push('Brak prętów – dodaj co najmniej jeden pręt.'); return res; }

    // węzły w użyciu
    const nodes = [];
    for (const n of allNodes) {
      const used = mem.some(m => m.ni === n || m.nj === n);
      if (!used) {
        if (n.sup) warn('Węzeł ' + (allNodes.indexOf(n) + 1) + ' nie jest połączony z prętem – podpora pominięta.');
        continue;
      }
      nodeIdx.set(n.uid, nodes.length);
      const sup = n.sup ? normSup(n.sup) : null;
      nodes.push({ uid: n.uid, no: allNodes.indexOf(n) + 1, x: n.x, y: n.y, sup, beta: sup ? sup.ang * Math.PI / 180 : 0, src: n });
    }
    for (const m of mem) { m.i = nodeIdx.get(m.ni.uid); m.j = nodeIdx.get(m.nj.uid); }
    const nn = nodes.length, nd = 3 * nn;

    // transformacje elementów (układ lokalny ← układy węzłowe)
    for (const m of mem) {
      m.Ti = rot3(m.ang - nodes[m.i].beta);
      m.Tj = rot3(m.ang - nodes[m.j].beta);
      const rel = []; if (m.ri) rel.push(2); if (m.rj) rel.push(5);
      m.rel = rel;
      const kc = condense(localK(m.EA, m.EI, m.L), [0, 0, 0, 0, 0, 0], rel);
      m.k = kc.k;
    }

    // macierz sztywności (pełna, w układach węzłowych)
    const K = new Float64Array(nd * nd);
    const dofs = (m) => [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2];
    const Tfull = (m) => {
      const T = [0, 1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0]);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { T[a][b] = m.Ti[3 * a + b]; T[a + 3][b + 3] = m.Tj[3 * a + b]; }
      return T;
    };
    for (const m of mem) {
      const T = Tfull(m); m.T = T;
      const kg = [0, 1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0]);
      // kg = Tᵀ k T
      const kT = [0, 1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0, 0]);
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { let s = 0; for (let q = 0; q < 6; q++) s += m.k[a][q] * T[q][b]; kT[a][b] = s; }
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { let s = 0; for (let q = 0; q < 6; q++) s += T[q][a] * kT[q][b]; kg[a][b] = s; }
      const D = dofs(m);
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) K[D[a] * nd + D[b]] += kg[a][b];
    }
    // sprężyny
    const kind = new Int8Array(nd); // 0 swobodny, 1 zablokowany, 2 sprężysty, 3 zablokowany automatycznie (obrót bez sztywności)
    const kspr = new Float64Array(nd);
    for (let n = 0; n < nn; n++) {
      const s = nodes[n].sup; if (!s) continue;
      for (let q = 0; q < 3; q++) {
        kind[3 * n + q] = s.f[q];
        if (s.f[q] === 2) { kspr[3 * n + q] = s.k[q]; K[(3 * n + q) * nd + 3 * n + q] += s.k[q]; }
      }
    }
    // obroty bez sztywności (wszystkie pręty przegubowe w węźle)
    let maxR = 0;
    for (let n = 0; n < nn; n++) maxR = Math.max(maxR, Math.abs(K[(3 * n + 2) * nd + 3 * n + 2]));
    for (let n = 0; n < nn; n++) {
      const d = 3 * n + 2;
      if (kind[d] === 0 && Math.abs(K[d * nd + d]) <= 1e-12 * (maxR || 1)) kind[d] = 3;
    }

    // ---- przypadki obciążeń
    const cases = (model.cases || []).map((c, k) => ({ uid: c.uid, k, name: c.name || ('Przypadek ' + (k + 1)), type: c.type || 'G', src: c }));
    if (!cases.length) { res.errors.push('Brak przypadków obciążeń – dodaj co najmniej jeden.'); return res; }
    let ng = 0, nq = 0, na = 0;
    for (const c of cases) c.code = c.type === 'Q' ? 'Q' + (++nq) : c.type === 'A' ? 'A' + (++na) : 'G' + (++ng);
    const memByUid = new Map(mem.map(m => [m.uid, m]));
    // lokalne obciążenia prętów dla każdego przypadku
    for (const c of cases) {
      c.ml = mem.map(() => []); c.tm = mem.map(() => []); c.nl = []; c.st = [];
      const lw = [];
      if (c.src.selfWeight) for (let mi = 0; mi < mem.length; mi++) {
        const m = mem[mi], q = m.A * m.g;
        if (q > 0) c.ml[mi].push(...memberLocalLoads({ type: 'q', dir: 'Y', full: true, q1: q, q2: q }, m));
      }
      for (const ld of c.src.loads || []) {
        if (ld.type === 'P' || ld.type === 'S') {
          const ni = nodeIdx.get(ld.node);
          if (ni === undefined) { warn('Obciążenie węzłowe w przypadku „' + c.name + '” dotyczy węzła bez prętów – pominięte.'); continue; }
          if (ld.type === 'P') c.nl.push({ n: ni, fx: num(ld.Fx, 0), fy: -num(ld.Fy, 0), m: -num(ld.M, 0) });
          else c.st.push({ n: ni, u: num(ld.ux, 0) / 1000, v: -num(ld.uy, 0) / 1000, r: -num(ld.rz, 0) / 1000 });
          continue;
        }
        const m = memByUid.get(ld.m);
        if (!m) { warn('Obciążenie w przypadku „' + c.name + '” dotyczy nieistniejącego pręta – pominięte.'); continue; }
        const mi = mem.indexOf(m);
        if (ld.type === 'T') { c.tm[mi].push({ a: m.aT, dT: num(ld.dT, 0), dTg: num(ld.dTg, 0) }); continue; }
        c.ml[mi].push(...memberLocalLoads(ld, m, lw));
      }
      if (lw.length) warn('Przypadek „' + c.name + '”: część obciążenia wychodzi poza pręt – przycięto.');
    }

    // stacje (wspólne dla wszystkich przypadków)
    const nDiv = Math.max(4, Math.min(200, Math.round(num(set.nDiv, 40))));
    for (let mi = 0; mi < mem.length; mi++) {
      const m = mem[mi], L = m.L;
      const pts = [];
      for (let q = 0; q <= nDiv; q++) pts.push({ x: L * q / nDiv, j: false });
      for (const c of cases) for (const l of c.ml[mi]) {
        if (l.k === 'd') { pts.push({ x: l.a, j: false }); pts.push({ x: l.b, j: false }); }
        else pts.push({ x: l.a, j: true });
      }
      for (const [nidx, atStart] of [[m.i, true], [m.j, false]]) {
        const s = nodes[nidx].sup; if (!s || !(s.b > 0)) continue;
        for (const fr of [0.5, 0.375, 0.25, 0.125]) { const d = s.b * fr; if (d < L) pts.push({ x: atStart ? d : L - d, j: false }); }
      }
      pts.sort((p, q) => p.x - q.x);
      const ux = [], jmp = [];
      const tol = 1e-9 * L + 1e-12;
      for (const p of pts) {
        const x = Math.min(L, Math.max(0, p.x));
        if (ux.length && Math.abs(x - ux[ux.length - 1]) <= Math.max(tol, 1e-7)) { if (p.j) jmp[jmp.length - 1] = true; continue; }
        ux.push(x); jmp.push(p.j);
      }
      ux[0] = 0; ux[ux.length - 1] = L;
      const xs = [], side = [], ui = [];
      for (let q = 0; q < ux.length; q++) {
        if (q === 0) { xs.push(0); side.push(1); ui.push(q); }
        else if (q === ux.length - 1) { xs.push(L); side.push(-1); ui.push(q); }
        else if (jmp[q]) { xs.push(ux[q], ux[q]); side.push(-1, 1); ui.push(q, q); }
        else { xs.push(ux[q]); side.push(0); ui.push(q); }
      }
      m.ux = Float64Array.from(ux); m.xs = Float64Array.from(xs); m.side = Int8Array.from(side); m.ui = Int32Array.from(ui);
    }

    // ---- rozkład K_ff
    const free = [], pres = [];
    for (let d = 0; d < nd; d++) (kind[d] === 1 || kind[d] === 3 ? pres : free).push(d);
    const nf = free.length;
    const Kff = new Float64Array(nf * nf);
    for (let a = 0; a < nf; a++) for (let b = 0; b < nf; b++) Kff[a * nf + b] = K[free[a] * nd + free[b]];
    const diag0 = new Float64Array(nf); for (let a = 0; a < nf; a++) diag0[a] = Kff[a * nf + a];
    // Cholesky (dolna trójkątna w miejscu)
    const dofName = (d) => { const n = Math.floor(d / 3), q = d % 3; return 'węzeł ' + nodes[n].no + ', ' + ['przesuw X', 'przesuw Y', 'obrót'][q]; };
    for (let j = 0; j < nf; j++) {
      let s = Kff[j * nf + j];
      for (let p = 0; p < j; p++) s -= Kff[j * nf + p] * Kff[j * nf + p];
      if (!(s > 1e-11 * Math.abs(diag0[j])) || !(diag0[j] > 0)) {
        res.errors.push('Układ geometrycznie zmienny (mechanizm) – brak sztywności: ' + dofName(free[j]) +
          '. Sprawdź podpory, przeguby i połączenia prętów.');
        res.mechanismNode = nodes[Math.floor(free[j] / 3)].uid;
        return res;
      }
      const L = Math.sqrt(s);
      Kff[j * nf + j] = L;
      for (let i = j + 1; i < nf; i++) {
        let t = Kff[i * nf + j];
        for (let p = 0; p < j; p++) t -= Kff[i * nf + p] * Kff[j * nf + p];
        Kff[i * nf + j] = t / L;
      }
    }
    const cholSolve = (b) => {
      const y = Float64Array.from(b);
      for (let i = 0; i < nf; i++) { let s = y[i]; for (let p = 0; p < i; p++) s -= Kff[i * nf + p] * y[p]; y[i] = s / Kff[i * nf + i]; }
      for (let i = nf - 1; i >= 0; i--) { let s = y[i]; for (let p = i + 1; p < nf; p++) s -= Kff[p * nf + i] * y[p]; y[i] = s / Kff[i * nf + i]; }
      return y;
    };

    // ---- rozwiązanie dla przypadków
    const supNodes = nodes.map((n, i) => i).filter(i => nodes[i].sup && nodes[i].sup.f.some(v => v === 1 || v === 2));
    const cres = [];
    for (const c of cases) {
      const F = new Float64Array(nd);
      const f0s = [];
      for (let mi = 0; mi < mem.length; mi++) {
        const m = mem[mi];
        const f0full = fixedEnd(c.ml[mi], m.L, m.EA, m.EI, m.h, c.tm[mi]);
        const cd = condense(localK(m.EA, m.EI, m.L), f0full, m.rel);
        const f0 = cd.f0; f0s.push(f0);
        const D = dofs(m);
        for (let b = 0; b < 6; b++) { let s = 0; for (let q = 0; q < 6; q++) s += m.T[q][b] * (-f0[q]); F[D[b]] += s; }
      }
      for (const l of c.nl) {
        const b = nodes[l.n].beta, cb = Math.cos(b), sb = Math.sin(b);
        F[3 * l.n] += cb * l.fx + sb * l.fy; F[3 * l.n + 1] += -sb * l.fx + cb * l.fy; F[3 * l.n + 2] += l.m;
      }
      const dp = new Float64Array(nd); // przemieszczenia wymuszone / baza sprężyny
      for (const s of c.st) {
        const vals = [s.u, s.v, s.r];
        for (let q = 0; q < 3; q++) {
          if (!vals[q]) continue;
          const d = 3 * s.n + q;
          if (kind[d] === 1) dp[d] += vals[q];
          else if (kind[d] === 2) { dp[d] += vals[q]; F[d] += kspr[d] * vals[q]; }
          else warn('Przemieszczenie wymuszone w węźle ' + nodes[s.n].no + ' na kierunku bez podpory – pominięte.');
        }
      }
      for (let d = 0; d < nd; d++) if (kind[d] === 3 && Math.abs(F[d]) > 1e-9) {
        res.errors.push('Moment skupiony w węźle ' + nodes[Math.floor(d / 3)].no + ', w którym wszystkie pręty są przegubowe (przypadek „' + c.name + '”) – mechanizm.');
        return res;
      }
      const rhs = new Float64Array(nf);
      for (let a = 0; a < nf; a++) {
        let s = F[free[a]];
        for (const p of pres) if (kind[p] === 1 && dp[p]) s -= K[free[a] * nd + p] * dp[p];
        rhs[a] = s;
      }
      const df = cholSolve(rhs);
      const d = new Float64Array(nd);
      for (const p of pres) d[p] = kind[p] === 1 ? dp[p] : 0;
      for (let a = 0; a < nf; a++) d[free[a]] = df[a];

      // reakcje (układ podpory) → globalne
      const R = new Map();
      for (const n of supNodes) {
        const s = nodes[n].sup, rl = [0, 0, 0];
        for (let q = 0; q < 3; q++) {
          const dd = 3 * n + q;
          if (s.f[q] === 1) { let v = -F[dd]; for (let b = 0; b < nd; b++) v += K[dd * nd + b] * d[b]; rl[q] = v; }
          else if (s.f[q] === 2) rl[q] = -kspr[dd] * (d[dd] - dp[dd]);
        }
        const b = nodes[n].beta, cb = Math.cos(b), sb = Math.sin(b);
        R.set(n, { loc: rl, g: [cb * rl[0] - sb * rl[1], sb * rl[0] + cb * rl[1], rl[2]] });
      }

      // pręty
      const mr = [];
      for (let mi = 0; mi < mem.length; mi++) {
        const m = mem[mi], D = dofs(m);
        const de = D.map(q => d[q]);
        const dl = m.T.map(row => row.reduce((s, v, q) => s + v * de[q], 0));
        const f = m.k.map((row, a) => row.reduce((s, v, q) => s + v * dl[q], 0) + f0s[mi][a]);
        for (const r of m.rel) f[r] = 0;
        const ml = c.ml[mi], L = m.L, ns = m.xs.length;
        const N = new Float64Array(ns), V = new Float64Array(ns), M = new Float64Array(ns);
        const buf = [0, 0, 0];
        for (let q = 0; q < ns; q++) { const r = forcesAt(ml, f, m.xs[q], m.side[q], L, buf); N[q] = r[0]; V[q] = r[1]; M[q] = r[2]; }
        // przemieszczenia wzdłuż pręta: całkowanie krzywizny i odkształcenia osiowego
        let kT = 0, eT = 0;
        for (const t of c.tm[mi]) { kT += -t.a * t.dTg / m.h; eT += t.a * t.dT; }
        const nu = m.ux.length;
        const Ac = new Float64Array(nu), Bc = new Float64Array(nu), Uc = new Float64Array(nu);
        for (let q = 1; q < nu; q++) {
          const xa = m.ux[q - 1], xb = m.ux[q], hl = (xb - xa) / 2, mid = (xa + xb) / 2;
          let sa = 0, sb = 0, su = 0;
          for (let gq = 0; gq < 3; gq++) {
            const x = mid + G3[gq] * hl, w = W3[gq] * hl, r = forcesAt(ml, f, x, 0, L, buf);
            const kap = r[2] / m.EI + kT, eps = r[0] / m.EA + eT;
            sa += w * kap; sb += w * kap * x; su += w * eps;
          }
          Ac[q] = Ac[q - 1] + sa; Bc[q] = Bc[q - 1] + sb; Uc[q] = Uc[q - 1] + su;
        }
        const vi = dl[1], vj = dl[4], ui0 = dl[0], uj0 = dl[3];
        const th0 = (vj - vi - (L * Ac[nu - 1] - Bc[nu - 1])) / L;
        const du = uj0 - ui0 - Uc[nu - 1];
        const vU = new Float64Array(nu), uU = new Float64Array(nu);
        for (let q = 0; q < nu; q++) {
          const x = m.ux[q];
          vU[q] = vi + th0 * x + x * Ac[q] - Bc[q];
          uU[q] = ui0 + Uc[q] + du * x / L;
        }
        const v = new Float64Array(ns), u = new Float64Array(ns), fr = new Float64Array(ns), gx = new Float64Array(ns), gy = new Float64Array(ns);
        for (let q = 0; q < ns; q++) {
          const p = m.ui[q], x = m.xs[q];
          v[q] = vU[p]; u[q] = uU[p];
          fr[q] = vU[p] - (vi + (vj - vi) * x / L);
          gx[q] = m.c * u[q] - m.s * v[q]; gy[q] = m.s * u[q] + m.c * v[q];
        }
        mr.push({ f, dl, N, V, M, v, u, fr, gx, gy });
      }

      // globalne przemieszczenia węzłów
      const dg = new Float64Array(nd);
      for (let n = 0; n < nn; n++) {
        const b = nodes[n].beta, cb = Math.cos(b), sb = Math.sin(b);
        dg[3 * n] = cb * d[3 * n] - sb * d[3 * n + 1];
        dg[3 * n + 1] = sb * d[3 * n] + cb * d[3 * n + 1];
        dg[3 * n + 2] = d[3 * n + 2];
      }

      // suma obciążeń (globalnie, względem początku układu)
      const sum = [0, 0, 0];
      for (let mi = 0; mi < mem.length; mi++) {
        const m = mem[mi], P = nodes[m.i];
        for (const l of c.ml[mi]) {
          let Ix, Iy, Mx, My, mm = 0;
          if (l.k === 'd') {
            const len = l.b - l.a;
            Ix = (l.px1 + l.px2) * len / 2; Iy = (l.py1 + l.py2) * len / 2;
            Mx = l.a * Ix + len * len * (l.px1 / 6 + l.px2 / 3); My = l.a * Iy + len * len * (l.py1 / 6 + l.py2 / 3);
          } else if (l.k === 'p') { Ix = l.px; Iy = l.py; Mx = l.px * l.a; My = l.py * l.a; }
          else { Ix = Iy = Mx = My = 0; mm = l.m; }
          const Fx = m.c * Ix - m.s * Iy, Fy = m.s * Ix + m.c * Iy;
          const tFx = m.c * Mx - m.s * My, tFy = m.s * Mx + m.c * My; // ∫ t·f
          sum[0] += Fx; sum[1] += Fy;
          sum[2] += P.x * Fy - P.y * Fx + m.c * tFy - m.s * tFx + mm;
        }
      }
      for (const l of c.nl) { const P = nodes[l.n]; sum[0] += l.fx; sum[1] += l.fy; sum[2] += P.x * l.fy - P.y * l.fx + l.m; }
      const sr = [0, 0, 0];
      for (const [n, r] of R) { const P = nodes[n]; sr[0] += r.g[0]; sr[1] += r.g[1]; sr[2] += P.x * r.g[1] - P.y * r.g[0] + r.g[2]; }

      cres.push({ d, dg, R, mem: mr, sumLoad: sum, sumReac: sr });
    }

    // ---- szerokość podpór: zaokrąglenie wykresów nad podporą pośrednią, wartości w licu
    const supw = [];
    for (const n of supNodes) {
      const s = nodes[n].sup; if (!(s.b > 0)) continue;
      const att = [];
      mem.forEach((m, mi) => { if (m.i === n) att.push({ mi, start: true }); if (m.j === n) att.push({ mi, start: false }); });
      let round = false;
      if (att.length === 2) {
        const dirOut = (a) => { const m = mem[a.mi]; return a.start ? [m.c, m.s] : [-m.c, -m.s]; };
        const d1 = dirOut(att[0]), d2 = dirOut(att[1]);
        if (d1[0] * d2[0] + d1[1] * d2[1] < -0.9999) round = true;
      }
      for (const a of att) {
        const m = mem[a.mi];
        if (s.b / 2 >= m.L) { warn('Szerokość podpory w węźle ' + nodes[n].no + ' większa niż długość pręta ' + m.no + '.'); continue; }
        supw.push({ n, mi: a.mi, start: a.start, b: s.b, round: round && !!set.width });
      }
    }
    for (const it of supw) {
      const m = mem[it.mi], yv = [-m.s, m.c];
      it.vals = []; // na przypadek: [M w osi, ΔM, M zredukowany, M w licu, V w licu, R⊥]
      for (let k = 0; k < cases.length; k++) {
        const cr = cres[k], r = cr.R.get(it.n), mr = cr.mem[it.mi];
        const Rp = r.g[0] * yv[0] + r.g[1] * yv[1];
        const xA = it.start ? 0 : m.L, sA = it.start ? 1 : -1;
        const xF = it.start ? it.b / 2 : m.L - it.b / 2;
        const fa = forcesAt(cases[k].ml[it.mi], mr.f, xA, sA, m.L);
        const ff = forcesAt(cases[k].ml[it.mi], mr.f, xF, 0, m.L);
        const dM = it.round ? Rp * it.b / 8 : 0;
        it.vals.push([fa[2], dM, fa[2] + dM, ff[2], ff[1], Rp]);
        if (it.round) {
          for (let q = 0; q < m.xs.length; q++) {
            const sdist = it.start ? m.xs[q] : m.L - m.xs[q];
            const uu = it.b / 2 - sdist;
            if (uu <= 0) continue;
            mr.M[q] += Rp * uu * uu / (2 * it.b);
            mr.V[q] += (it.start ? -1 : 1) * Rp * uu / it.b;
          }
        }
      }
    }

    // ---- wynik
    res.ok = true;
    res.groups = (model.groups || []).map(g => ({ uid: g.uid, name: g.name, mode: g.mode === 'sum' ? 'sum' : 'excl' }));
    res.nodes = nodes; res.mem = mem; res.cases = cases; res.cr = cres; res.supNodes = supNodes; res.supw = supw;
    res.kind = kind; res.nd = nd;
    res.time = Date.now() - T0;
    // sprawdzenie równowagi
    for (let k = 0; k < cases.length; k++) {
      const a = cres[k].sumLoad, b = cres[k].sumReac;
      const sc = Math.max(1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]));
      if (Math.abs(a[0] + b[0]) > 1e-6 * sc || Math.abs(a[1] + b[1]) > 1e-6 * sc) warn('Niezrównoważenie sił w przypadku „' + cases[k].name + '” – sprawdź model.');
    }
    // obroty swobodnych końców bez sztywności – info
    if (kind.some(v => v === 3)) res.info = 'W węzłach, w których wszystkie pręty są przegubowe, obrót węzła nie jest niewiadomą.';
    return res;
  }

  function normSup(s) {
    let f;
    if (s.type && s.type !== 'custom' && SUP_PRESETS[s.type]) f = SUP_PRESETS[s.type].f.slice();
    else f = [s.rx | 0, s.ry | 0, s.rz | 0];
    const k = [num(s.kx, 0), num(s.ky, 0), num(s.kz, 0)];
    for (let q = 0; q < 3; q++) if (f[q] === 2 && !(k[q] > 0)) f[q] = 0;
    return { f, k, ang: num(s.ang, 0), b: Math.max(0, num(s.b, 0)) };
  }

  // ------------------------------------------------------------------ ekstrema w pręcie (dokładne, pojedynczy przypadek)
  function caseMemberExtremes(res, k, mi) {
    const m = res.mem[mi], c = res.cases[k], mr = res.cr[k].mem[mi];
    const out = { Mmax: { v: -Infinity, x: 0 }, Mmin: { v: Infinity, x: 0 } };
    const take = (v, x) => { if (v > out.Mmax.v) out.Mmax = { v, x }; if (v < out.Mmin.v) out.Mmin = { v, x }; };
    for (let q = 0; q < m.xs.length; q++) take(mr.M[q], m.xs[q]);
    const anyRound = res.supw.some(it => it.mi === mi && it.round);
    for (let q = 1; q < m.ux.length; q++) {
      const xa = m.ux[q - 1], xb = m.ux[q];
      for (let p = 0; p < 4; p++) {
        let a = xa + (xb - xa) * p / 4, b = xa + (xb - xa) * (p + 1) / 4;
        let Va = forcesAt(c.ml[mi], mr.f, a, 1, m.L)[1], Vb = forcesAt(c.ml[mi], mr.f, b, -1, m.L)[1];
        if (!(Va * Vb < 0)) continue;
        for (let it = 0; it < 50; it++) {
          const mid = (a + b) / 2, Vm = forcesAt(c.ml[mi], mr.f, mid, 0, m.L)[1];
          if (Va * Vm <= 0) { b = mid; Vb = Vm; } else { a = mid; Va = Vm; }
        }
        const x = (a + b) / 2;
        if (anyRound && res.supw.some(it => it.mi === mi && it.round && (it.start ? x : m.L - x) < it.b / 2)) continue;
        take(forcesAt(c.ml[mi], mr.f, x, 0, m.L)[2], x);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ kombinacje
  function caseFactors(c, set) {
    return {
      gs: num(c.src.gs, set.gGs), gi: num(c.src.gi, set.gGi), gq: num(c.src.gq, set.gQ)
    };
  }

  // Reguła kombinacji: G – każdy przypadek z γsup lub γinf (niekorzystnie/korzystnie),
  // Q – oddziaływania (akcje) złożone z części (przypadków); części włączane tylko tam, gdzie niekorzystne,
  // zbiory wykluczające się (grupa „wykluczające”) – działa co najwyżej jedno oddziaływanie ze zbioru.
  function buildRule(res, kind) {
    const set = res.set, cases = res.cases;
    const R = { kind, G: [], A: [], acts: [], sets: [], useLead: true, nC: cases.length };
    const groups = new Map((res.groups || []).map(g => [g.uid, g]));
    const actBy = new Map(), setBy = new Map();
    for (const c of cases) {
      const cf = caseFactors(c, set);
      if (c.type === 'G') {
        let fs = 1, fi = 1;
        if (kind === 'ULS' || kind === 'ULSa') { fs = cf.gs; fi = cf.gi; }
        if (kind === 'ULSb') { fs = num(set.xi, 0.85) * cf.gs; fi = cf.gi; }
        R.G.push({ k: c.k, fs, fi });
      } else if (c.type === 'A') {
        if (kind === 'ACC') R.A.push(c.k);
      } else {
        const p = psiOf(c.src);
        let lead = 0, acc = 0;
        switch (kind) {
          case 'ULS': case 'ULSb': lead = cf.gq; acc = cf.gq * p[0]; break;
          case 'ULSa': lead = 0; acc = cf.gq * p[0]; break;
          case 'ACC': lead = (num(set.accPsi, 1) === 2 ? p[2] : p[1]); acc = p[2]; break;
          case 'CHR': lead = 1; acc = p[0]; break;
          case 'FRQ': lead = p[1]; acc = p[2]; break;
          case 'QP': lead = 0; acc = p[2]; break;
        }
        const g = groups.get(c.src.grp);
        let aKey = 'c' + c.k, sKey = 'c' + c.k;
        if (g && g.mode === 'sum') { aKey = 'g' + g.uid; sKey = 'g' + g.uid; }
        else if (g) sKey = 'g' + g.uid;
        if (!actBy.has(aKey)) {
          if (!setBy.has(sKey)) { setBy.set(sKey, R.sets.length); R.sets.push([]); }
          const si = setBy.get(sKey);
          actBy.set(aKey, R.acts.length);
          R.sets[si].push(R.acts.length);
          R.acts.push({ parts: [], si, H: false, SW: false });
        }
        const act = R.acts[actBy.get(aKey)];
        const cat = c.src.cat || 'X';
        act.parts.push({ k: c.k, lead, acc });
        if (cat === 'H') act.H = true;
        if (cat === 'S1' || cat === 'S2' || cat === 'W') act.SW = true;
      }
    }
    if (kind === 'ULSa' || kind === 'QP') R.useLead = false;
    R.leads = [-1]; if (R.useLead) for (let i = 0; i < R.acts.length; i++) R.leads.push(i);
    const hasH = R.acts.some(a => a.H), hasSW = R.acts.some(a => a.SW);
    R.variants = hasH && hasSW ? [{ exH: true }, { exSW: true }] : [{}];
    return R;
  }

  function evalRule(E, R, s, wantF) {
    let vG = 0;
    const fG = [];
    for (const g of R.G) {
      const e = E[g.k], a = g.fs * e, b = g.fi * e;
      const pick = s > 0 ? (a >= b ? g.fs : g.fi) : (a <= b ? g.fs : g.fi);
      vG += pick * e; if (wantF) fG.push([g.k, pick]);
    }
    const excl = (act, vr) => (vr.exH && act.H) || (vr.exSW && act.SW);
    const actVal = (act, lead) => {
      let v = 0;
      for (const p of act.parts) { const x = (lead ? p.lead : p.acc) * E[p.k]; if (s * x > 0) v += x; }
      return v;
    };
    const Aopts = R.A.length ? R.A : [-1];
    let best = -s * Infinity, rec = null;
    for (const a of Aopts) {
      const vA = a >= 0 ? E[a] : 0;
      for (const vr of R.variants) {
        for (const li of R.leads) {
          const L0 = li >= 0 ? R.acts[li] : null;
          if (L0 && excl(L0, vr)) continue;
          let vQ = L0 ? actVal(L0, true) : 0;
          for (let si = 0; si < R.sets.length; si++) {
            if (L0 && L0.si === si) continue;
            let bx = 0;
            for (const ai of R.sets[si]) {
              const act = R.acts[ai]; if (excl(act, vr)) continue;
              const x = actVal(act, false); if (s * x > s * bx) bx = x;
            }
            vQ += bx;
          }
          const tot = vG + vA + vQ;
          if (s * tot > s * best) { best = tot; rec = { a, vr, li }; }
        }
      }
    }
    if (!wantF) return best;
    const f = new Float64Array(R.nC);
    for (const [k, p] of fG) f[k] = p;
    const setF = (act, lead) => { for (const p of act.parts) { const fx = lead ? p.lead : p.acc; if (s * fx * E[p.k] > 0) f[p.k] = fx; } };
    let leadCodes = [];
    if (rec) {
      if (rec.a >= 0) f[rec.a] = 1;
      const L0 = rec.li >= 0 ? R.acts[rec.li] : null;
      if (L0) { setF(L0, true); leadCodes = L0.parts.filter(p => s * p.lead * E[p.k] > 0).map(p => p.k); }
      for (let si = 0; si < R.sets.length; si++) {
        if (L0 && L0.si === si) continue;
        let bx = 0, ba = null;
        for (const ai of R.sets[si]) {
          const act = R.acts[ai]; if (excl(act, rec.vr)) continue;
          const x = actVal(act, false); if (s * x > s * bx) { bx = x; ba = act; }
        }
        if (ba) setF(ba, false);
      }
    }
    return { v: best, f, lead: leadCodes, acc: rec ? rec.a : -1 };
  }

  const ENV = {
    ULS: { n: 'SGN – obwiednia (STR/GEO)', short: 'SGN' },
    ACC: { n: 'SGN – sytuacja wyjątkowa (6.11b)', short: 'SGN-A' },
    CHR: { n: 'SGU – charakterystyczna (6.14b)', short: 'SGU-ch' },
    FRQ: { n: 'SGU – częsta (6.15b)', short: 'SGU-cz' },
    QP: { n: 'SGU – quasi-stała (6.16b)', short: 'SGU-qs' }
  };

  function envRules(res, key) {
    if (key === 'ULS') {
      if (res.set.comb === 'ab') return [{ r: buildRule(res, 'ULSa'), lab: '6.10a' }, { r: buildRule(res, 'ULSb'), lab: '6.10b' }];
      return [{ r: buildRule(res, 'ULS'), lab: '6.10' }];
    }
    const lab = { ACC: '6.11b', CHR: '6.14b', FRQ: '6.15b', QP: '6.16b' }[key];
    return [{ r: buildRule(res, key), lab }];
  }

  function availableViews(model, res) {
    const out = [];
    if (!res || !res.ok) return out;
    for (const c of res.cases) out.push({ key: 'case:' + c.k, label: c.code + ': ' + c.name, grp: 'Przypadki obciążeń' });
    for (const cb of model.combos || []) out.push({ key: 'combo:' + cb.uid, label: cb.name || 'Kombinacja', grp: 'Kombinacje użytkownika' });
    const hasA = res.cases.some(c => c.type === 'A');
    for (const k of Object.keys(ENV)) {
      if (k === 'ACC' && !hasA) continue;
      out.push({ key: 'env:' + k, label: ENV[k].n, grp: 'Obwiednie (PN-EN 1990)' });
    }
    return out;
  }

  // wektor współczynników dla kombinacji liniowej
  function linFactors(model, res, key) {
    const f = new Float64Array(res.cases.length);
    if (key.startsWith('case:')) { f[+key.slice(5)] = 1; return f; }
    const cb = (model.combos || []).find(c => 'combo:' + c.uid === key);
    if (!cb) return null;
    for (const c of res.cases) f[c.k] = num((cb.f || {})[c.uid], 0);
    return f;
  }

  // obliczenie widoku wyników (przypadek, kombinacja lub obwiednia)
  function getView(model, res, key) {
    if (!res || !res.ok) return null;
    res._vc = res._vc || {};
    if (res._vc[key]) return res._vc[key];
    const nC = res.cases.length, cr = res.cr;
    let view;
    const qty = ['N', 'V', 'M', 'v', 'fr', 'gx', 'gy'];
    if (key.startsWith('case:') || key.startsWith('combo:')) {
      const f = linFactors(model, res, key);
      if (!f) return null;
      const lin = (get, n) => {
        const out = new Float64Array(n);
        for (let k = 0; k < nC; k++) { if (!f[k]) continue; const a = get(k); for (let i = 0; i < n; i++) out[i] += f[k] * a[i]; }
        return out;
      };
      const mem = res.mem.map((m, mi) => {
        const o = {};
        for (const q of qty) { const a = lin(k => cr[k].mem[mi][q], m.xs.length); o[q] = { max: a, min: a }; }
        return o;
      });
      const nd = res.nd;
      const dg = lin(k => cr[k].dg, nd);
      const reac = new Map();
      for (const n of res.supNodes) {
        const g = lin(k => cr[k].R.get(n).g, 3), l = lin(k => cr[k].R.get(n).loc, 3);
        reac.set(n, { g: { max: g, min: g }, loc: { max: l, min: l } });
      }
      const supw = res.supw.map(it => { const a = lin(k => it.vals[k], 6); return { max: a, min: a }; });
      const sumL = lin(k => cr[k].sumLoad, 3), sumR = lin(k => cr[k].sumReac, 3);
      view = { key, env: false, f, mem, dg: { max: dg, min: dg }, reac, supw, sumL, sumR };
    } else {
      const ek = key.slice(4);
      const rules = envRules(res, ek);
      const E = new Float64Array(nC);
      const ev = (get, n) => {
        const mx = new Float64Array(n), mn = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < nC; k++) E[k] = get(k)[i];
          let a = -Infinity, b = Infinity;
          for (const r of rules) { a = Math.max(a, evalRule(E, r.r, 1, false)); b = Math.min(b, evalRule(E, r.r, -1, false)); }
          mx[i] = a; mn[i] = b;
        }
        return { max: mx, min: mn };
      };
      const mem = res.mem.map((m, mi) => {
        const o = {};
        for (const q of ['N', 'V', 'M', 'v', 'fr']) o[q] = ev(k => cr[k].mem[mi][q], m.xs.length);
        return o;
      });
      const dg = ev(k => cr[k].dg, res.nd);
      const reac = new Map();
      for (const n of res.supNodes) reac.set(n, { g: ev(k => cr[k].R.get(n).g, 3), loc: ev(k => cr[k].R.get(n).loc, 3) });
      const supw = res.supw.map(it => ev(k => it.vals[k], 6));
      view = { key, env: true, rules, mem, dg, reac, supw };
    }
    res._vc[key] = view;
    return view;
  }

  // kombinacja decydująca dla wartości o wektorze przypadków E (sense +1 max, −1 min)
  function decisive(model, res, key, E, sense) {
    if (key.startsWith('case:') || key.startsWith('combo:')) {
      const f = linFactors(model, res, key);
      let v = 0; for (let k = 0; k < E.length; k++) v += f[k] * E[k];
      return { v, f, lab: '' };
    }
    const rules = envRules(res, key.slice(4));
    let best = null;
    for (const r of rules) {
      const o = evalRule(E, r.r, sense, true);
      if (!best || sense * o.v > sense * best.v) { best = o; best.lab = r.lab; }
    }
    return best;
  }

  function fmtF(x) {
    const r = Math.round(x * 1000) / 1000;
    return r.toFixed(Math.abs(r * 100 - Math.round(r * 100)) < 1e-9 ? 2 : 3).replace('.', ',');
  }
  function describe(res, d) {
    if (!d) return '';
    const parts = [];
    for (let k = 0; k < d.f.length; k++) {
      const f = d.f[k]; if (!f) continue;
      parts.push((parts.length ? (f < 0 ? ' − ' : ' + ') : (f < 0 ? '−' : '')) + fmtF(Math.abs(f)) + '·' + res.cases[k].code);
    }
    let s = parts.join('') || '0';
    if (d.lab) s = d.lab + ': ' + s;
    if (d.lead && d.lead.length) s += ' (wiodące: ' + d.lead.map(k => res.cases[k].code).join(', ') + ')';
    return s;
  }

  // wektor wartości po przypadkach dla wielkości w stacji pręta / węźle / reakcji
  function vecMember(res, mi, q, si) { return Float64Array.from(res.cr.map(c => c.mem[mi][q][si])); }
  function vecNode(res, idx) { return Float64Array.from(res.cr.map(c => c.dg[idx])); }
  function vecReac(res, n, comp, loc) { return Float64Array.from(res.cr.map(c => (loc ? c.R.get(n).loc : c.R.get(n).g)[comp])); }
  function vecSupw(res, i, comp) { return Float64Array.from(res.supw[i].vals.map(v => v[comp])); }

  // opis wzorów kombinacji (do panelu „Kombinacje”)
  function ruleText(res, key) {
    if (!res || !res.ok) return [];
    const out = [];
    for (const { r, lab } of envRules(res, key)) {
      const G = r.G.map(g => (g.fs === g.fi ? fmtF(g.fs) : fmtF(g.fs) + '/' + fmtF(g.fi)) + '·' + res.cases[g.k].code);
      const A = r.A.length ? [r.A.map(k => res.cases[k].code).join(' lub ')] : [];
      let Q;
      if (!r.acts.length) Q = [];
      else if (r.useLead) Q = ['Qwiod.·' + (key === 'CHR' ? '1,00' : key === 'FRQ' ? 'ψ₁' : key === 'ACC' ? (res.set.accPsi === 2 ? 'ψ₂' : 'ψ₁') : fmtF(res.set.gQ)) +
        ' + Σ ' + (key === 'CHR' ? 'ψ₀' : key === 'FRQ' || key === 'ACC' ? 'ψ₂' : fmtF(res.set.gQ) + '·ψ₀') + '·Q'];
      else Q = ['Σ ' + (key === 'QP' ? 'ψ₂' : fmtF(res.set.gQ) + '·ψ₀') + '·Q'];
      out.push({ lab, txt: [...G, ...A, ...Q].join(' + ') });
    }
    return out;
  }

  return {
    MATS, PROFILES, CATS, SUP_PRESETS, DEF_SET, ENV,
    secProps, profileProps, psiOf, normSup, posAbs, memberLocalLoads, forcesAt, analyze, caseMemberExtremes,
    buildRule, evalRule, envRules, availableViews, getView, decisive, describe, linFactors,
    vecMember, vecNode, vecReac, vecSupw, ruleText
  };
});
