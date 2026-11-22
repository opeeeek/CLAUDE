/* =====================================================================
   BM-Win · Statyka – silnik MES ram prętowych 2D / 3D
   ---------------------------------------------------------------------
   • element belkowy 3D (12 st. swobody), Euler–Bernoulli lub Timoshenko
     (odkształcalność postaciowa), element kratowy (tylko N),
   • przeguby / zwolnienia na końcach prętów (kondensacja statyczna),
   • podpory sztywne i sprężyste w kierunkach globalnych,
   • obciążenia: węzłowe, rozłożone (trapezowe, częściowe), skupione,
     momenty skupione, temperatura (równomierna i gradient), ciężar własny,
   • analiza liniowa (I rząd) – superpozycja przypadków,
   • analiza II rzędu (P-Δ / macierz geometryczna, iteracyjnie),
   • wyboczenie liniowe (wartości własne αcr i postacie),
   • drgania własne (macierz mas konsystentna, częstotliwości i postacie).
   Rozwiązywanie: macierz profilowa (skyline) LDLᵀ z numeracją RCM.

   Jednostki: kN, m, rad, t (masa), s.  E, G podawane w GPa, γ w kN/m³.
   Układ globalny: 2D – X →, Y ↑ (płaszczyzna XY);
                   3D – X, Y poziome, Z ↑ (grawitacja −Z).
   Osie lokalne pręta: x – od węzła początkowego do końcowego,
     z – „w górę” (w płaszczyźnie pionowej zawierającej pręt; dla prętów
     pionowych 3D: z = −X globalne), y = z × x; obrót o kąt β wokół x.
     W 2D oś y lokalna jest prostopadła do płaszczyzny ramy.
   Siły przekrojowe (lokalnie): N (+ rozciąganie), Vy, Vz, T (=Mx),
     My, Mz; My > 0 – rozciągane włókna od strony −z (dolne),
     Mz > 0 – rozciągane włókna od strony −y.  W 2D: M = My, V = Vz.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMFEM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const G_ACC = 9.81;           // m/s²
  const EPS = 1e-12;

  /* ------------------------------------------------------------ wektory 3D */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = norm(a); return n < EPS ? [0, 0, 0] : scl(a, 1 / n); };

  /* ------------------------------------------------------- osie lokalne */
  // Zwraca macierz R (wiersze = ex, ey, ez w układzie globalnym) i długość.
  function memberAxes(p1, p2, betaDeg, dim) {
    const d = sub(p2, p1), L = norm(d);
    if (L < 1e-9) return null;
    const ex = scl(d, 1 / L);
    let ey, ez;
    if (dim === '2D') {
      ey = [0, 0, -1];
      ez = cross(ex, ey);
    } else {
      const up = [0, 0, 1];
      if (Math.abs(dot(ex, up)) > 0.999999) {
        // pręt pionowy: z lokalne = −X globalne
        ez = [-1, 0, 0];
        ey = unit(cross(ez, ex));
        ez = cross(ex, ey);
      } else {
        ey = unit(cross(up, ex));
        ez = cross(ex, ey);
      }
      const b = (betaDeg || 0) * Math.PI / 180;
      if (b) {
        const c = Math.cos(b), s = Math.sin(b);
        const ey2 = add(scl(ey, c), scl(ez, s));
        const ez2 = add(scl(ez, c), scl(ey, -s));
        ey = ey2; ez = ez2;
      }
    }
    return { R: [ex, ey, ez], L, ex, ey, ez };
  }

  /* --------------------------------------------- macierze elementu (lok.) */
  function zeros(n, m) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = new Float64Array(m === undefined ? n : m); return a; }

  // Macierz sztywności 12×12; kolejność: u1 v1 w1 θx1 θy1 θz1 | u2 v2 w2 θx2 θy2 θz2
  function localStiffness(p, L) {
    const { E, G, A, Iy, Iz, J } = p;
    const k = zeros(12);
    if (p.truss) {
      const a = E * A / L;
      k[0][0] = a; k[0][6] = -a; k[6][0] = -a; k[6][6] = a;
      return k;
    }
    const py = p.shear && p.Avy > 0 ? 12 * E * Iz / (G * p.Avy * L * L) : 0; // ugięcie v (zginanie wokół z)
    const pz = p.shear && p.Avz > 0 ? 12 * E * Iy / (G * p.Avz * L * L) : 0; // ugięcie w (zginanie wokół y)
    const a = E * A / L, t = G * J / L;
    k[0][0] = a; k[0][6] = -a; k[6][0] = -a; k[6][6] = a;
    k[3][3] = t; k[3][9] = -t; k[9][3] = -t; k[9][9] = t;
    // zginanie w płaszczyźnie xy (v, θz)
    {
      const c = E * Iz / ((1 + py) * L * L * L);
      const v = [[12, 6 * L, -12, 6 * L], [6 * L, (4 + py) * L * L, -6 * L, (2 - py) * L * L],
                 [-12, -6 * L, 12, -6 * L], [6 * L, (2 - py) * L * L, -6 * L, (4 + py) * L * L]];
      const id = [1, 5, 7, 11];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[id[i]][id[j]] += c * v[i][j];
    }
    // zginanie w płaszczyźnie xz (w, θy); θy = −dw/dx
    {
      const c = E * Iy / ((1 + pz) * L * L * L);
      const v = [[12, -6 * L, -12, -6 * L], [-6 * L, (4 + pz) * L * L, 6 * L, (2 - pz) * L * L],
                 [-12, 6 * L, 12, 6 * L], [-6 * L, (2 - pz) * L * L, 6 * L, (4 + pz) * L * L]];
      const id = [2, 4, 8, 10];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[id[i]][id[j]] += c * v[i][j];
    }
    return k;
  }

  // Macierz geometryczna (siła osiowa N, + rozciąganie)
  function localGeometric(p, L, N) {
    const k = zeros(12);
    if (p.truss) {
      const a = N / L;
      for (const i of [1, 2]) { k[i][i] += a; k[i][i + 6] -= a; k[i + 6][i] -= a; k[i + 6][i + 6] += a; }
      return k;
    }
    const c = N / L;
    const v = [[6 / 5, L / 10, -6 / 5, L / 10], [L / 10, 2 * L * L / 15, -L / 10, -L * L / 30],
               [-6 / 5, -L / 10, 6 / 5, -L / 10], [L / 10, -L * L / 30, -L / 10, 2 * L * L / 15]];
    const idy = [1, 5, 7, 11];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[idy[i]][idy[j]] += c * v[i][j];
    const sgn = [1, -1, 1, -1], idz = [2, 4, 8, 10];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[idz[i]][idz[j]] += c * v[i][j] * sgn[i] * sgn[j];
    const Ip = (p.Iy + p.Iz) / Math.max(p.A, EPS), t = N * Ip / L;
    k[3][3] += t; k[3][9] -= t; k[9][3] -= t; k[9][9] += t;
    return k;
  }

  // Konsystentna macierz mas (m – masa na jednostkę długości [t/m])
  function localMass(p, L, m) {
    const M = zeros(12);
    if (m <= 0) return M;
    const c = m * L;
    M[0][0] = M[6][6] = c / 3; M[0][6] = M[6][0] = c / 6;
    if (p.truss) {
      for (const i of [1, 2]) { M[i][i] = M[i + 6][i + 6] = c / 3; M[i][i + 6] = M[i + 6][i] = c / 6; }
      return M;
    }
    const r2 = (p.Iy + p.Iz) / Math.max(p.A, EPS);
    M[3][3] = M[9][9] = c * r2 / 3; M[3][9] = M[9][3] = c * r2 / 6;
    const v = [[156, 22 * L, 54, -13 * L], [22 * L, 4 * L * L, 13 * L, -3 * L * L],
               [54, 13 * L, 156, -22 * L], [-13 * L, -3 * L * L, -22 * L, 4 * L * L]];
    const idy = [1, 5, 7, 11], idz = [2, 4, 8, 10], sgn = [1, -1, 1, -1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      M[idy[i]][idy[j]] += c / 420 * v[i][j];
      M[idz[i]][idz[j]] += c / 420 * v[i][j] * sgn[i] * sgn[j];
    }
    return M;
  }

  /* --------------------------------------------- kondensacja (przeguby) */
  // rel – tablica 12 wartości logicznych (true = zwolniony st. swobody)
  // Zwraca obiekt z macierzą skondensowaną i funkcją odtwarzającą u_rel.
  function condense(k, f, rel) {
    const r = [], c = [];
    for (let i = 0; i < 12; i++) (rel[i] ? r : c).push(i);
    if (!r.length) return { k, f, recover: null };
    const nr = r.length;
    const Krr = zeros(nr);
    for (let i = 0; i < nr; i++) for (let j = 0; j < nr; j++) Krr[i][j] = k[r[i]][r[j]];
    const inv = invertSmall(Krr);
    if (!inv) throw new Error('Zwolnienia tworzą mechanizm w pręcie');
    const kc = zeros(12), fc = new Float64Array(12);
    // k* = Kcc − Kcr Krr⁻¹ Krc ;  f* = fc − Kcr Krr⁻¹ fr
    const KcrInv = c.map(ci => { const row = new Float64Array(nr); for (let j = 0; j < nr; j++) { let s = 0; for (let m = 0; m < nr; m++) s += k[ci][r[m]] * inv[m][j]; row[j] = s; } return row; });
    for (let a = 0; a < c.length; a++) {
      for (let b = 0; b < c.length; b++) {
        let s = k[c[a]][c[b]];
        for (let j = 0; j < nr; j++) s -= KcrInv[a][j] * k[r[j]][c[b]];
        kc[c[a]][c[b]] = s;
      }
      let s = f ? f[c[a]] : 0;
      if (f) for (let j = 0; j < nr; j++) s -= KcrInv[a][j] * f[r[j]];
      fc[c[a]] = s;
    }
    // u_r = Krr⁻¹ (f_r − Krc u_c)   (f – obciążenie równoważne, k u = f)
    const recover = (u, fr) => {
      const out = Float64Array.from(u);
      const rhs = r.map((ri, i) => { let s = fr ? fr[ri] : 0; for (const ci of c) s -= k[ri][ci] * u[ci]; return s; });
      for (let i = 0; i < nr; i++) { let s = 0; for (let j = 0; j < nr; j++) s += inv[i][j] * rhs[j]; out[r[i]] = s; }
      return out;
    };
    return { k: kc, f: fc, recover };
  }

  function invertSmall(A) {
    const n = A.length, M = A.map((row, i) => { const r = new Float64Array(2 * n); for (let j = 0; j < n; j++) r[j] = row[j]; r[n + i] = 1; return r; });
    for (let i = 0; i < n; i++) {
      let p = i; for (let j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-14) return null;
      [M[i], M[p]] = [M[p], M[i]];
      const d = M[i][i]; for (let j = 0; j < 2 * n; j++) M[i][j] /= d;
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[i][j]; }
    }
    return M.map(r => r.slice(n));
  }

  /* --------------------------------------------- transformacja do globalnego */
  function toGlobal(kl, R) {
    // K = Tᵀ k T, T = diag(R,R,R,R)
    const n = 12, K = zeros(n), tmp = zeros(n);
    for (let i = 0; i < n; i++) for (let bj = 0; bj < 4; bj++) for (let jj = 0; jj < 3; jj++) {
      let s = 0; for (let m = 0; m < 3; m++) s += kl[i][bj * 3 + m] * R[m][jj];
      tmp[i][bj * 3 + jj] = s;
    }
    for (let bi = 0; bi < 4; bi++) for (let ii = 0; ii < 3; ii++) for (let j = 0; j < n; j++) {
      let s = 0; for (let m = 0; m < 3; m++) s += R[m][ii] * tmp[bi * 3 + m][j];
      K[bi * 3 + ii][j] = s;
    }
    return K;
  }
  const vecToGlobal = (v, R) => { const o = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) { let s = 0; for (let m = 0; m < 3; m++) s += R[m][i] * v[b * 3 + m]; o[b * 3 + i] = s; } return o; };
  const vecToLocal = (v, R) => { const o = new Float64Array(12); for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) { let s = 0; for (let m = 0; m < 3; m++) s += R[i][m] * v[b * 3 + m]; o[b * 3 + i] = s; } return o; };
  const rot3 = (v, R) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];

  /* --------------------------------------------- macierz profilowa (skyline) */
  class Skyline {
    constructor(n, heights) {
      this.n = n; this.diag = new Int32Array(n);
      let p = 0;
      for (let j = 0; j < n; j++) { p += heights[j]; this.diag[j] = p; p++; }
      this.a = new Float64Array(p); this.h = heights;
    }
    idx(i, j) { if (i > j) { const t = i; i = j; j = t; } const d = j - i; return d > this.h[j] ? -1 : this.diag[j] - d; }
    add(i, j, v) { const k = this.idx(i, j); if (k >= 0) this.a[k] += v; else if (v !== 0) throw new Error('skyline'); }
    get(i, j) { const k = this.idx(i, j); return k >= 0 ? this.a[k] : 0; }
    clone() { const s = Object.create(Skyline.prototype); s.n = this.n; s.diag = this.diag; s.h = this.h; s.a = Float64Array.from(this.a); return s; }
    mul(x) {
      const n = this.n, y = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const top = j - this.h[j];
        for (let i = top; i <= j; i++) {
          const v = this.a[this.diag[j] - (j - i)];
          y[i] += v * x[j]; if (i !== j) y[j] += v * x[i];
        }
      }
      return y;
    }
    // Rozkład LDLᵀ w miejscu (algorytm kolumnowy); zwraca indeks pierwszego zerowego/ujemnego piwota
    factor() {
      const n = this.n, a = this.a, D = this.diag, H = this.h;
      const top = j => j - H[j];
      let bad = -1, neg = 0;
      for (let j = 0; j < n; j++) {
        const tj = top(j);
        // redukcja elementów kolumny j
        for (let i = tj + 1; i < j; i++) {
          const ti = top(i), m = Math.max(ti, tj);
          let s = a[D[j] - (j - i)];
          for (let k = m; k < i; k++) s -= a[D[i] - (i - k)] * a[D[j] - (j - k)];
          a[D[j] - (j - i)] = s;
        }
        let dj = a[D[j]];
        for (let k = tj; k < j; k++) {
          const g = a[D[j] - (j - k)], l = g / a[D[k]];
          dj -= l * g; a[D[j] - (j - k)] = l;
        }
        a[D[j]] = dj;
        if (dj <= 0 || !isFinite(dj)) { neg++; if (bad < 0 && Math.abs(dj) < 1e-9 * (1 + Math.abs(this.orig ? this.orig[j] : 1))) bad = j; }
      }
      this.negPivots = neg;
      return bad;
    }
    solve(b) {
      const n = this.n, a = this.a, D = this.diag, H = this.h, x = Float64Array.from(b);
      for (let j = 0; j < n; j++) { let s = x[j]; for (let k = j - H[j]; k < j; k++) s -= a[D[j] - (j - k)] * x[k]; x[j] = s; }
      for (let j = 0; j < n; j++) x[j] /= a[D[j]];
      for (let j = n - 1; j >= 0; j--) { const xj = x[j]; for (let k = j - H[j]; k < j; k++) x[k] -= a[D[j] - (j - k)] * xj; }
      return x;
    }
  }

  /* --------------------------------------------- numeracja RCM węzłów */
  function rcmOrder(nn, edges) {
    const adj = Array.from({ length: nn }, () => []);
    for (const [a, b] of edges) { if (a !== b) { adj[a].push(b); adj[b].push(a); } }
    const deg = adj.map(a => a.length), seen = new Uint8Array(nn), order = [];
    while (order.length < nn) {
      let s = -1;
      for (let i = 0; i < nn; i++) if (!seen[i] && (s < 0 || deg[i] < deg[s])) s = i;
      const q = [s]; seen[s] = 1;
      while (q.length) {
        const v = q.shift(); order.push(v);
        adj[v].filter(w => !seen[w]).sort((x, y) => deg[x] - deg[y]).forEach(w => { seen[w] = 1; q.push(w); });
      }
    }
    return order.reverse();
  }

  /* --------------------------------------------- obciążenia prętów */
  // Rozkład obciążenia pręta na składowe lokalne:
  //  dist:   { a, b, q1:[x,y,z], q2:[x,y,z] }  (lokalne, na 1 m długości pręta)
  //  point:  { a, P:[x,y,z] },  moment: { a, M:[x,y,z] }
  function memberLoadsLocal(model, mem, ax, caseId, ctx, noSelf) {
    const L = ax.L, out = { dist: [], point: [], moment: [], temp: [] };
    const gdir = model.dim === '2D' ? [0, -1, 0] : [0, 0, -1];
    const cs = ctx.caseById[caseId];
    if (!noSelf && cs && cs.selfWeight && mem.p.gamma > 0 && mem.p.A > 0) {
      const q = mem.p.gamma * mem.p.A * (cs.selfWeightFactor || 1);
      const ql = rot3(scl(gdir, q), ax.R);
      out.dist.push({ a: 0, b: L, q1: ql, q2: ql });
    }
    for (const ld of ctx.memberLoads[mem.idx] || []) {
      if (ld.case !== caseId) continue;
      const pos = v => Math.max(0, Math.min(L, ld.rel === false ? v : v * L));
      const dirv = (d) => {
        switch (d) {
          case 'x': return [1, 0, 0]; case 'y': return [0, 1, 0]; case 'z': return [0, 0, 1];
          case 'X': return rot3([1, 0, 0], ax.R); case 'Y': return rot3([0, 1, 0], ax.R); case 'Z': return rot3([0, 0, 1], ax.R);
          default: return [0, 0, 0];
        }
      };
      if (ld.type === 'dist') {
        const a = pos(ld.a ?? 0), b = pos(ld.b ?? 1);
        if (b - a < 1e-9) continue;
        let f = 1;
        // obciążenie globalne na rzut (np. śnieg na dach pochyły)
        if (ld.proj && 'XYZ'.includes(ld.dir)) {
          const gi = 'XYZ'.indexOf(ld.dir), e = ax.ex;
          f = Math.sqrt(Math.max(0, 1 - e[gi] * e[gi]));
        }
        const d = dirv(ld.dir);
        out.dist.push({ a, b, q1: scl(d, (ld.q1 ?? 0) * f), q2: scl(d, (ld.q2 ?? ld.q1 ?? 0) * f) });
      } else if (ld.type === 'point') {
        out.point.push({ a: pos(ld.a ?? 0.5), P: scl(dirv(ld.dir), ld.P || 0) });
      } else if (ld.type === 'moment') {
        out.moment.push({ a: pos(ld.a ?? 0.5), M: scl(dirv(ld.dir), ld.M || 0) });
      } else if (ld.type === 'temp') {
        out.temp.push({ dT: ld.dT || 0, dTz: ld.dTz || 0, dTy: ld.dTy || 0 });
      }
    }
    return out;
  }

  // Funkcje kształtu Hermite'a (ugięcie v w kierunku y; θz = dv/dx)
  function hermite(xi, L) {
    return [1 - 3 * xi * xi + 2 * xi ** 3, L * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, L * (-xi * xi + xi ** 3)];
  }
  function hermiteD(xi, L) {
    return [(-6 * xi + 6 * xi * xi) / L, 1 - 4 * xi + 3 * xi * xi, (6 * xi - 6 * xi * xi) / L, -2 * xi + 3 * xi * xi];
  }
  const GP = [[-0.9602898564975363, 0.1012285362903763], [-0.7966664774136267, 0.2223810344533745], [-0.5255324099163290, 0.3137066458778873], [-0.1834346424956498, 0.3626837833783620],
              [0.1834346424956498, 0.3626837833783620], [0.5255324099163290, 0.3137066458778873], [0.7966664774136267, 0.2223810344533745], [0.9602898564975363, 0.1012285362903763]];

  // Wektor obciążeń równoważnych (lokalny, konsystentny)
  function equivalentLoads(ld, L, p) {
    const f = new Float64Array(12);
    const addAt = (x, P, M) => {
      const xi = x / L, N = hermite(xi, L), dN = hermiteD(xi, L);
      // osiowo – liniowo
      f[0] += P[0] * (1 - xi); f[6] += P[0] * xi;
      f[3] += M[0] * (1 - xi); f[9] += M[0] * xi;
      if (p.truss) { f[1] += P[1] * (1 - xi); f[7] += P[1] * xi; f[2] += P[2] * (1 - xi); f[8] += P[2] * xi; return; }
      // v: [v1, θz1, v2, θz2] ↔ [1,5,7,11]
      f[1] += P[1] * N[0]; f[5] += P[1] * N[1]; f[7] += P[1] * N[2]; f[11] += P[1] * N[3];
      // w: θy = −dw/dx  ↔ [2,4,8,10] z kształtem [N0, −N1, N2, −N3]
      f[2] += P[2] * N[0]; f[4] -= P[2] * N[1]; f[8] += P[2] * N[2]; f[10] -= P[2] * N[3];
      // moment skupiony: praca M·θ;  θz = dv/dx, θy = −dw/dx
      f[1] += M[2] * dN[0]; f[5] += M[2] * dN[1]; f[7] += M[2] * dN[2]; f[11] += M[2] * dN[3];
      f[2] -= M[1] * dN[0]; f[4] += M[1] * dN[1]; f[8] -= M[1] * dN[2]; f[10] += M[1] * dN[3];
    };
    for (const d of ld.dist) {
      const len = d.b - d.a;
      for (const [g, w] of GP) {
        const x = d.a + (g + 1) / 2 * len, t = (x - d.a) / len;
        const q = [0, 1, 2].map(i => d.q1[i] + (d.q2[i] - d.q1[i]) * t);
        addAt(x, scl(q, w * len / 2), [0, 0, 0]);
      }
    }
    for (const pt of ld.point) addAt(pt.a, pt.P, [0, 0, 0]);
    for (const m of ld.moment) addAt(m.a, [0, 0, 0], m.M);
    for (const t of ld.temp) {
      const Ea = p.E * p.alpha;
      const Nt = Ea * p.A * t.dT;                 // siła z wydłużenia swobodnego
      f[0] -= Nt; f[6] += Nt;
      if (!p.truss) {
        const Mz = t.dTz && p.hz ? Ea * p.Iy * t.dTz / p.hz : 0;   // gradient po wysokości (oś z) – zginanie wokół y
        const My = t.dTy && p.hy ? Ea * p.Iz * t.dTy / p.hy : 0;   // gradient po szerokości (oś y) – zginanie wokół z
        // dTz = T(+z) − T(−z): wygięcie wypukłością ku +z (krzywizna w'' = −α·dTz/h)
        f[4] -= Mz; f[10] += Mz;
        f[5] += My; f[11] -= My;
      }
    }
    return f;
  }

  /* --------------------------------------------- przygotowanie modelu */
  function prepare(model, opts) {
    opts = opts || {};
    const dim = model.dim === '2D' ? '2D' : '3D';
    const errors = [], warnings = [];
    const nodeIdx = new Map();
    model.nodes.forEach((n, i) => nodeIdx.set(String(n.id), i));
    const coords = model.nodes.map(n => [+n.x || 0, +n.y || 0, dim === '2D' ? 0 : (+n.z || 0)]);
    const matById = new Map((model.materials || []).map(m => [String(m.id), m]));
    const secById = new Map((model.sections || []).map(s => [String(s.id), s]));
    const members = [];
    (model.members || []).forEach((m, k) => {
      const i = nodeIdx.get(String(m.n1)), j = nodeIdx.get(String(m.n2));
      if (i === undefined || j === undefined) { errors.push(`Pręt ${m.id}: nieistniejący węzeł`); return; }
      const ax = memberAxes(coords[i], coords[j], m.beta, dim);
      if (!ax) { errors.push(`Pręt ${m.id}: zerowa długość`); return; }
      const s = secById.get(String(m.sec)), mt = matById.get(String(m.mat ?? (s && s.mat)));
      if (!s) { errors.push(`Pręt ${m.id}: brak przekroju`); return; }
      if (!mt) { errors.push(`Pręt ${m.id}: brak materiału`); return; }
      const E = mt.E * 1e6, G = (mt.G || mt.E / (2 * (1 + (mt.nu ?? 0.2)))) * 1e6;
      const p = {
        E, G, A: s.A, Iy: s.Iy, Iz: s.Iz ?? s.Iy, J: s.J ?? s.It ?? 0, Avy: s.Avy || 0, Avz: s.Avz || 0,
        gamma: mt.gamma || 0, alpha: mt.alpha || 0, hz: s.h || 0, hy: s.b || 0,
        truss: m.type === 'truss', shear: !!opts.shear
      };
      if (!(p.A > 0)) { errors.push(`Pręt ${m.id}: pole przekroju A = 0`); return; }
      if (!p.truss && !(p.Iy > 0 && p.Iz > 0)) { errors.push(`Pręt ${m.id}: moment bezwładności = 0`); return; }
      if (!p.truss && !(p.J > 0)) { p.J = 1e-3 * Math.min(p.Iy, p.Iz); if (dim === '3D') warnings.push(`Pręt ${m.id}: brak It – przyjęto wartość pomijalną`); }
      const rel = new Array(12).fill(false);
      if (!p.truss) {
        const ri = m.rel1 || [], rj = m.rel2 || [];
        for (let q = 0; q < 6; q++) { rel[q] = !!ri[q]; rel[6 + q] = !!rj[q]; }
        // w 2D – pomijamy zwolnienia poza płaszczyzną
        if (dim === '2D') for (const q of [2, 3, 5, 8, 9, 11]) rel[q] = false;
        if (rel[3] && rel[9]) { rel[9] = false; warnings.push(`Pręt ${m.id}: zwolniono skręcanie na obu końcach – pozostawiono jedno`); }
      }
      members.push({ idx: members.length, id: m.id, src: m, i, j, ax, p, rel, hasRel: rel.some(Boolean) });
    });
    // obciążenia prętowe wg pręta
    const memById = new Map(members.map(m => [String(m.id), m]));
    const memberLoads = {};
    for (const ld of model.loads || []) {
      if (ld.type === 'nodal') continue;
      const m = memById.get(String(ld.member));
      if (!m) { warnings.push(`Obciążenie na nieistniejącym pręcie ${ld.member}`); continue; }
      (memberLoads[m.idx] = memberLoads[m.idx] || []).push(ld);
    }
    const caseById = {};
    (model.cases || []).forEach(c => caseById[String(c.id)] = c);
    // numeracja stopni swobody
    const nn = coords.length;
    const used = new Uint8Array(nn);
    members.forEach(m => { used[m.i] = 1; used[m.j] = 1; });
    const order = rcmOrder(nn, members.map(m => [m.i, m.j]));
    const fixed = Array.from({ length: nn }, () => new Uint8Array(6));
    const springs = Array.from({ length: nn }, () => new Float64Array(6));
    const supNode = new Map();
    for (const s of model.supports || []) {
      const i = nodeIdx.get(String(s.node)); if (i === undefined) { warnings.push(`Podpora w nieistniejącym węźle ${s.node}`); continue; }
      supNode.set(i, s);
      for (let q = 0; q < 6; q++) {
        if (s.fix && s.fix[q]) fixed[i][q] = 1;
        else if (s.k && +s.k[q] > 0) springs[i][q] = +s.k[q];
      }
    }
    if (dim === '2D') for (let i = 0; i < nn; i++) { fixed[i][2] = 1; fixed[i][3] = 1; fixed[i][4] = 1; }
    for (let i = 0; i < nn; i++) if (!used[i]) { fixed[i].fill(1); }
    // obroty węzłów połączonych wyłącznie kratowo lub przegubowo – blokujemy
    const rotStiff = Array.from({ length: nn }, () => new Uint8Array(3));
    members.forEach(m => { if (m.p.truss) return; for (let q = 0; q < 3; q++) { if (!m.rel[3 + q]) rotStiff[m.i][q] = 1; if (!m.rel[9 + q]) rotStiff[m.j][q] = 1; } });
    const autoFixed = [];
    for (let i = 0; i < nn; i++) for (let q = 0; q < 3; q++) if (!rotStiff[i][q] && !fixed[i][3 + q] && !(springs[i][3 + q] > 0)) { fixed[i][3 + q] = 1; autoFixed.push([i, 3 + q]); }
    // translacje węzłów z samymi prętami kratowymi w 3D: kierunek prostopadły może być nieokreślony – wykryje to rozkład
    const eq = Array.from({ length: nn }, () => new Int32Array(6).fill(-1));
    let neq = 0;
    for (const i of order) for (let q = 0; q < 6; q++) if (!fixed[i][q]) eq[i][q] = neq++;
    const edof = members.map(m => { const a = new Int32Array(12); for (let q = 0; q < 6; q++) { a[q] = eq[m.i][q]; a[6 + q] = eq[m.j][q]; } return a; });
    const heights = new Int32Array(neq);
    edof.forEach(d => { let mn = Infinity; for (const v of d) if (v >= 0 && v < mn) mn = v; for (const v of d) if (v >= 0) heights[v] = Math.max(heights[v], v - mn); });
    // podpory sprężyste – tylko przekątna
    const ctx = { model, dim, coords, members, memById, memberLoads, caseById, nodeIdx, eq, neq, edof, heights, fixed, springs, supNode, autoFixed, errors, warnings, opts };
    // macierze elementów (lokalne, bez kondensacji)
    members.forEach(m => { m.kl = localStiffness(m.p, m.ax.L); });
    return ctx;
  }

  function assemble(ctx, which, extra) {
    const K = new Skyline(ctx.neq, ctx.heights);
    ctx.members.forEach((m, e) => {
      let kl;
      if (which === 'K') kl = m.kl;
      else if (which === 'Kg') kl = localGeometric(m.p, m.ax.L, extra[e] || 0);
      else if (which === 'M') kl = localMass(m.p, m.ax.L, extra[e] || 0);
      else if (which === 'KT') { kl = m.kl.map((r, i) => r.map((v, j) => v)); const g = localGeometric(m.p, m.ax.L, extra[e] || 0); for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) kl[i][j] += g[i][j]; }
      if (m.hasRel && which !== 'M') kl = condense(kl, null, m.rel).k;
      if (m.hasRel && which === 'M') kl = kl.map((r, i) => r.map((v, j) => (m.rel[i] || m.rel[j]) ? 0 : v));
      const kg = toGlobal(kl, m.ax.R), d = ctx.edof[e];
      for (let a = 0; a < 12; a++) { const ia = d[a]; if (ia < 0) continue; for (let b = a; b < 12; b++) { const ib = d[b]; if (ib < 0) continue; const v = kg[a][b]; if (v) { if (ia === ib && a !== b) K.add(ia, ib, 2 * v); else K.add(ia, ib, v); } } }
    });
    if (which === 'K' || which === 'KT') {
      for (let i = 0; i < ctx.coords.length; i++) for (let q = 0; q < 6; q++) { const e = ctx.eq[i][q]; if (e >= 0 && ctx.springs[i][q] > 0) K.add(e, e, ctx.springs[i][q]); }
    }
    return K;
  }

  const DOFN = ['ux', 'uy', 'uz', 'φx', 'φy', 'φz'];
  function factorOrThrow(K, ctx) {
    if (!ctx.neq) return { solve: () => new Float64Array(0), a: [], diag: [] };
    const orig = new Float64Array(ctx.neq); for (let i = 0; i < ctx.neq; i++) orig[i] = K.get(i, i);
    K.orig = orig;
    const maxd = orig.reduce((a, b) => Math.max(a, Math.abs(b)), 0) || 1;
    const F = K.clone(); F.orig = orig;
    F.factor();
    // sprawdzenie piwotów
    for (let j = 0; j < ctx.neq; j++) {
      const d = F.a[F.diag[j]];
      if (!(d > 1e-10 * Math.max(Math.abs(orig[j]), maxd * 1e-6))) {
        let nd = '?';
        outer: for (let i = 0; i < ctx.coords.length; i++) for (let q = 0; q < 6; q++) if (ctx.eq[i][q] === j) { nd = `węzeł ${ctx.model.nodes[i].id}, ${DOFN[q]}`; break outer; }
        const err = new Error(`Układ geometrycznie zmienny lub źle podparty (${nd}). Sprawdź podpory i przeguby.`);
        err.mechanism = true; throw err;
      }
    }
    return F;
  }

  /* --------------------------------------------- rozwiązanie przypadku / kombinacji */
  // factors: { caseId: współczynnik }; zwraca wektor obciążeń i dane do sił przekrojowych
  function loadVector(ctx, factors) {
    const P = new Float64Array(ctx.neq);
    const memEq = ctx.members.map(() => new Float64Array(12));
    const memLd = ctx.members.map(() => ({ dist: [], point: [], moment: [], temp: [] }));
    for (const [cid, f] of Object.entries(factors)) {
      if (!f) continue;
      for (const ld of ctx.model.loads || []) {
        if (ld.type !== 'nodal' || String(ld.case) !== cid) continue;
        const i = ctx.nodeIdx.get(String(ld.node)); if (i === undefined) continue;
        const F = ld.F || [];
        for (let q = 0; q < 6; q++) { const e = ctx.eq[i][q]; if (e >= 0 && F[q]) P[e] += f * F[q]; }
      }
      ctx.members.forEach((m, e) => {
        const ll = memberLoadsLocal(ctx.model, m, m.ax, cid, ctx);
        if (!ll.dist.length && !ll.point.length && !ll.moment.length && !ll.temp.length) return;
        const sc = o => Object.assign({}, o);
        ll.dist.forEach(d => memLd[e].dist.push({ a: d.a, b: d.b, q1: scl(d.q1, f), q2: scl(d.q2, f) }));
        ll.point.forEach(d => memLd[e].point.push({ a: d.a, P: scl(d.P, f) }));
        ll.moment.forEach(d => memLd[e].moment.push({ a: d.a, M: scl(d.M, f) }));
        ll.temp.forEach(d => memLd[e].temp.push({ dT: d.dT * f, dTz: d.dTz * f, dTy: d.dTy * f }));
        void sc;
      });
    }
    ctx.members.forEach((m, e) => {
      const ld = memLd[e];
      if (!ld.dist.length && !ld.point.length && !ld.moment.length && !ld.temp.length) return;
      let fe = equivalentLoads(ld, m.ax.L, m.p);
      memEq[e] = fe;
      if (m.hasRel) fe = condense(m.kl, fe, m.rel).f;
      const fg = vecToGlobal(fe, m.ax.R), d = ctx.edof[e];
      for (let a = 0; a < 12; a++) if (d[a] >= 0) P[d[a]] += fg[a];
    });
    return { P, memEq, memLd };
  }

  // Siły końcowe pręta (działające NA pręt, lokalnie): f = k u − p_eq
  function memberEndForces(ctx, m, e, U, lv, Nprev) {
    const ug = new Float64Array(12), d = ctx.edof[e];
    for (let a = 0; a < 12; a++) ug[a] = d[a] >= 0 ? U[d[a]] : 0;
    let ul = vecToLocal(ug, m.ax.R);
    let k = m.kl;
    if (Nprev !== undefined && Nprev !== null) { const g = localGeometric(m.p, m.ax.L, Nprev); k = k.map((r, i) => r.map((v, j) => v + g[i][j])); }
    const pe = lv.memEq[e];
    if (m.hasRel) { const c = condense(k, pe, m.rel); ul = c.recover(ul, pe); }
    const f = new Float64Array(12);
    for (let a = 0; a < 12; a++) { let s = -pe[a]; for (let b = 0; b < 12; b++) s += k[a][b] * ul[b]; f[a] = s; }
    return { f, ul };
  }

  // Siły przekrojowe i ugięcia w punktach pręta
  function memberStations(m, f, ul, ld, nst, second) {
    const L = m.ax.L, xs = [];
    const brk = new Set([0, L]);
    ld.point.forEach(p => brk.add(p.a)); ld.moment.forEach(p => brk.add(p.a)); ld.dist.forEach(d => { brk.add(d.a); brk.add(d.b); });
    const fine = nst * 4;   // gęsta siatka do całkowania ugięć; na wyjściu co 4. punkt
    for (let i = 0; i <= fine; i++) xs.push(L * i / fine);
    brk.forEach(x => { if (!xs.some(v => Math.abs(v - x) < 1e-9)) xs.push(x); });
    xs.sort((a, b) => a - b);
    // punkty nieciągłości – podwójne (lewa/prawa strona)
    const pts = [];
    xs.forEach(x => {
      const jump = ld.point.some(p => Math.abs(p.a - x) < 1e-9 && x > 1e-9 && x < L - 1e-9) || ld.moment.some(p => Math.abs(p.a - x) < 1e-9 && x > 1e-9 && x < L - 1e-9);
      if (jump) { pts.push([x, -1]); pts.push([x, 1]); } else pts.push([x, 0]);
    });
    const F1 = [f[0], f[1], f[2]], M1 = [f[3], f[4], f[5]];
    const res = pts.map(([x, side]) => {
      const S = scl(F1, -1), Mc = scl(add(M1, cross([-x, second ? second.off(0, x)[0] : 0, second ? second.off(0, x)[1] : 0], F1)), -1);
      for (const d of ld.dist) {
        const a = d.a, b = Math.min(d.b, x);
        if (b <= a) continue;
        const len = d.b - d.a;
        // q(s) = q1 + (q2−q1)(s−a)/len ;  ∫q ds  i  ∫(s−x) q ds  na [a,b]
        const c1 = (s) => s - a;
        const I0 = (b - a), I1 = (c1(b) ** 2 - c1(a) ** 2) / 2;                       // ∫1, ∫(s−a)
        const J1 = ((b - x) ** 2 - (a - x) ** 2) / 2;                                    // ∫(s−x)
        const J2 = (() => { // ∫(s−a)(s−x) ds
          const F = s => s ** 3 / 3 - (a + x) * s * s / 2 + a * x * s; return F(b) - F(a);
        })();
        for (let i = 0; i < 3; i++) {
          const q1 = d.q1[i], dq = (d.q2[i] - d.q1[i]) / len;
          const Fi = q1 * I0 + dq * I1, Mi = q1 * J1 + dq * J2;
          const e = [0, 0, 0]; e[i] = 1;
          S[0] -= Fi * e[0]; S[1] -= Fi * e[1]; S[2] -= Fi * e[2];
          const r = cross([1, 0, 0], e);
          Mc[0] -= Mi * r[0]; Mc[1] -= Mi * r[1]; Mc[2] -= Mi * r[2];
        }
      }
      for (const p of ld.point) {
        if (p.a <= 1e-9 || p.a < x - 1e-9 || (Math.abs(p.a - x) < 1e-9 && side > 0) || (Math.abs(p.a - x) < 1e-9 && x >= L - 1e-9)) {
          const off = second ? second.off(p.a, x) : [0, 0];
          for (let i = 0; i < 3; i++) S[i] -= p.P[i];
          const mm = cross([p.a - x, off[0], off[1]], p.P); for (let i = 0; i < 3; i++) Mc[i] -= mm[i];
        }
      }
      for (const p of ld.moment) {
        if (p.a <= 1e-9 || p.a < x - 1e-9 || (Math.abs(p.a - x) < 1e-9 && side > 0) || (Math.abs(p.a - x) < 1e-9 && x >= L - 1e-9)) for (let i = 0; i < 3; i++) Mc[i] -= p.M[i];
      }
      return { x, side, N: S[0], Vy: -S[1], Vz: -S[2], T: Mc[0], My: -Mc[1], Mz: Mc[2] };
    });
    // ugięcia: całkowanie krzywizny (EI·w'' = My, EI·v'' = Mz) + liniowe dopasowanie końców
    const E = m.p.E;
    // krzywizna wymuszona gradientem temperatury
    let k0w = 0, k0v = 0;
    for (const t of ld.temp) { if (m.p.hz) k0w -= m.p.alpha * t.dTz / m.p.hz; if (m.p.hy) k0v -= m.p.alpha * t.dTy / m.p.hy; }
    const defl = (key, EI, k0) => {
      const n = res.length, th = new Float64Array(n), w = new Float64Array(n);
      if (m.p.truss || !(EI > 0)) return w.map((_, k) => 0);
      const kap = res.map(r => r[key] / EI + k0);
      for (let k = 1; k < n; k++) {
        const dx = res[k].x - res[k - 1].x;
        th[k] = th[k - 1] + (kap[k] + kap[k - 1]) / 2 * dx;
        w[k] = w[k - 1] + th[k - 1] * dx + (2 * kap[k - 1] + kap[k]) / 6 * dx * dx;
      }
      const wL = w[n - 1];
      for (let k = 0; k < n; k++) w[k] = w[k] - wL * res[k].x / L;
      return w;
    };
    const wv = defl('Mz', E * m.p.Iz, k0v), ww = defl('My', E * m.p.Iy, k0w);
    res.forEach((r, k) => {
      const t = r.x / L;
      r.ux = ul[0] + (ul[6] - ul[0]) * t;
      r.uy = ul[1] + (ul[7] - ul[1]) * t + wv[k];
      r.uz = ul[2] + (ul[8] - ul[2]) * t + ww[k];
    });
    // wyjście: punkty siatki zgrubnej oraz punkty charakterystyczne obciążeń
    return res.filter(r => brk.has(r.x) || [...brk].some(b => Math.abs(b - r.x) < 1e-9) || Math.abs(r.x / L * nst - Math.round(r.x / L * nst)) < 1e-7);
  }

  /* --------------------------------------------- analiza dla zestawu współczynników */
  function solveFactors(ctx, F, factors, opt) {
    opt = opt || {};
    const lv = loadVector(ctx, factors);
    const U = F.solve(lv.P);
    return finishResults(ctx, U, lv, null, opt);
  }

  function finishResults(ctx, U, lv, Nvec, opt) {
    const nst = (opt && opt.stations) || 20;
    const nn = ctx.coords.length;
    const disp = Array.from({ length: nn }, (_, i) => { const d = new Float64Array(6); for (let q = 0; q < 6; q++) { const e = ctx.eq[i][q]; d[q] = e >= 0 ? U[e] : 0; } return d; });
    const reac = Array.from({ length: nn }, () => new Float64Array(6));
    const members = ctx.members.map((m, e) => {
      const { f, ul } = memberEndForces(ctx, m, e, U, lv, Nvec ? Nvec[e] : null);
      // reakcje: suma sił końcowych w węzłach podpartych (globalnie)
      const fg = vecToGlobal(f, m.ax.R);
      for (let q = 0; q < 6; q++) { reac[m.i][q] += fg[q]; reac[m.j][q] += fg[6 + q]; }
      let second = null;
      if (Nvec) {
        // przybliżone przemieszczenia poprzeczne do efektu P-δ wewnątrz pręta (z I przebiegu)
        const st0 = memberStations(m, f, ul, lv.memLd[e], nst, null);
        const interp = (x) => { let k = 1; while (k < st0.length - 1 && st0[k].x < x) k++; const a = st0[k - 1], b = st0[k], t = (b.x - a.x) > 0 ? (x - a.x) / (b.x - a.x) : 0; return [a.uy + (b.uy - a.uy) * t, a.uz + (b.uz - a.uz) * t]; };
        second = { off: (xa, x) => { const A = interp(xa), B = interp(x); return [A[0] - B[0], A[1] - B[1]]; } };
      }
      const st = memberStations(m, f, ul, lv.memLd[e], nst, second);
      return { id: m.id, f: Array.from(f), ul: Array.from(ul), st };
    });
    // reakcje = −(suma sił od prętów) + obciążenie węzłowe; dla węzłów podpartych
    const reactions = [];
    ctx.supNode.forEach((s, i) => {
      const r = new Float64Array(6);
      for (let q = 0; q < 6; q++) {
        if (ctx.fixed[i][q] && !(ctx.dim === '2D' && (q === 2 || q === 3 || q === 4))) r[q] = reac[i][q];
        else if (ctx.springs[i][q] > 0) r[q] = -ctx.springs[i][q] * disp[i][q];
      }
      // odjęcie obciążeń węzłowych przyłożonych w węźle podporowym
      reactions.push({ node: ctx.model.nodes[i].id, i, R: r });
    });
    // obciążenia węzłowe w węzłach podporowych – korekta reakcji
    return { disp, reactions, members, nodalCorrection: true };
  }

  function nodalLoadsAt(ctx, factors) {
    const out = new Map();
    for (const [cid, f] of Object.entries(factors)) {
      if (!f) continue;
      for (const ld of ctx.model.loads || []) {
        if (ld.type !== 'nodal' || String(ld.case) !== cid) continue;
        const i = ctx.nodeIdx.get(String(ld.node)); if (i === undefined) continue;
        const a = out.get(i) || new Float64Array(6);
        for (let q = 0; q < 6; q++) a[q] += f * (+(ld.F || [])[q] || 0);
        out.set(i, a);
      }
    }
    return out;
  }
  function fixReactions(ctx, res, factors) {
    const nl = nodalLoadsAt(ctx, factors);
    res.reactions.forEach(r => {
      const a = nl.get(r.i); if (!a) return;
      for (let q = 0; q < 6; q++) if (ctx.fixed[r.i][q]) r.R[q] -= a[q];
    });
    return res;
  }

  /* --------------------------------------------- analiza liniowa wszystkich przypadków */
  function analyzeLinear(model, opts) {
    opts = opts || {};
    const ctx = prepare(model, opts);
    if (ctx.errors.length) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
    if (!ctx.members.length) return { ok: false, errors: ['Model nie zawiera prętów'], warnings: ctx.warnings };
    let F;
    try { F = factorOrThrow(assemble(ctx, 'K'), ctx); }
    catch (e) { return { ok: false, errors: [e.message], warnings: ctx.warnings }; }
    const cases = {};
    for (const c of model.cases || []) {
      const fac = { [String(c.id)]: 1 };
      cases[String(c.id)] = fixReactions(ctx, solveFactors(ctx, F, fac, opts), fac);
    }
    return { ok: true, ctx, F, cases, warnings: ctx.warnings, autoFixed: ctx.autoFixed };
  }

  // Superpozycja wyników przypadków (analiza I rzędu)
  function superpose(lin, factors) {
    const ids = Object.keys(factors).filter(k => factors[k] && lin.cases[k]);
    const first = lin.cases[Object.keys(lin.cases)[0]];
    if (!first) return null;
    const nn = first.disp.length;
    const disp = Array.from({ length: nn }, (_, i) => { const d = new Float64Array(6); ids.forEach(k => { const a = lin.cases[k].disp[i]; for (let q = 0; q < 6; q++) d[q] += factors[k] * a[q]; }); return d; });
    const reactions = first.reactions.map((r, ri) => { const R = new Float64Array(6); ids.forEach(k => { const a = lin.cases[k].reactions[ri].R; for (let q = 0; q < 6; q++) R[q] += factors[k] * a[q]; }); return { node: r.node, i: r.i, R }; });
    const KEYS = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz', 'ux', 'uy', 'uz'];
    const members = first.members.map((m, e) => {
      const f = new Array(12).fill(0);
      ids.forEach(k => { const a = lin.cases[k].members[e].f; for (let q = 0; q < 12; q++) f[q] += factors[k] * a[q]; });
      // stacje mogą się różnić położeniem (różne obciążenia) – interpolujemy na wspólną siatkę
      const grid = mergeStations(ids.map(k => lin.cases[k].members[e].st));
      const st = grid.map(([x, side]) => { const o = { x, side }; KEYS.forEach(q => o[q] = 0); ids.forEach(k => { const v = sampleSt(lin.cases[k].members[e].st, x, side); KEYS.forEach(q => o[q] += factors[k] * v[q]); }); return o; });
      return { id: m.id, f, st };
    });
    return { disp, reactions, members };
  }
  function mergeStations(lists) {
    const pts = [];
    lists.forEach(l => l.forEach(s => { if (!pts.some(p => Math.abs(p[0] - s.x) < 1e-9 && p[1] === s.side)) pts.push([s.x, s.side]); }));
    // jeżeli w danym x jest para (−1, +1), usuń 0
    const out = pts.filter(p => !(p[1] === 0 && pts.some(q => Math.abs(q[0] - p[0]) < 1e-9 && q[1] !== 0)));
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
  }
  function sampleSt(st, x, side) {
    let exact = st.filter(s => Math.abs(s.x - x) < 1e-9);
    if (exact.length) {
      if (exact.length === 1) return exact[0];
      return side > 0 ? exact[exact.length - 1] : exact[0];
    }
    let k = 1; while (k < st.length - 1 && st[k].x < x) k++;
    const a = st[k - 1], b = st[k], t = (x - a.x) / ((b.x - a.x) || 1);
    const o = { x };
    for (const q of ['N', 'Vy', 'Vz', 'T', 'My', 'Mz', 'ux', 'uy', 'uz']) o[q] = a[q] + (b[q] - a[q]) * t;
    return o;
  }

  /* --------------------------------------------- analiza II rzędu (P-Δ) */
  function analyzeSecondOrder(model, factors, opts) {
    opts = opts || {};
    const ctx = prepare(model, opts);
    if (ctx.errors.length) return { ok: false, errors: ctx.errors };
    const lv = loadVector(ctx, factors);
    let F;
    try { F = factorOrThrow(assemble(ctx, 'K'), ctx); } catch (e) { return { ok: false, errors: [e.message] }; }
    let U = F.solve(lv.P);
    let Nv = ctx.members.map((m, e) => memberEndForces(ctx, m, e, U, lv, null).f[6]);
    let it = 0, conv = false, prevNorm = 0;
    const maxIt = opts.maxIter || 30, tol = opts.tol || 1e-6;
    for (; it < maxIt; it++) {
      const KT = assemble(ctx, 'KT', Nv);
      let FT;
      try { FT = factorOrThrow(KT, ctx); } catch (e) { return { ok: false, errors: ['Utrata stateczności w analizie II rzędu – obciążenie przekracza obciążenie krytyczne (αcr < 1).'], unstable: true }; }
      const U2 = FT.solve(lv.P);
      let dn = 0, nrm = 0; for (let i = 0; i < U2.length; i++) { dn += (U2[i] - U[i]) ** 2; nrm += U2[i] ** 2; }
      U = U2;
      const Nnew = ctx.members.map((m, e) => memberEndForces(ctx, m, e, U, lv, Nv[e]).f[6]);
      Nv = Nnew;
      if (Math.sqrt(dn) <= tol * Math.max(Math.sqrt(nrm), 1e-12)) { conv = true; break; }
      if (it > 5 && Math.sqrt(nrm) > 1e6 * (prevNorm || 1)) break;
      prevNorm = Math.sqrt(nrm);
    }
    const res = fixReactions(ctx, finishResults(ctx, U, lv, Nv, opts), factors);
    res.ok = true; res.iterations = it + 1; res.converged = conv; res.N = Nv;
    return res;
  }

  /* --------------------------------------------- problemy własne */
  // Mały symetryczny problem własny (Jacobi)
  function jacobiEig(A) {
    const n = A.length, a = A.map(r => Float64Array.from(r)), V = zeros(n);
    for (let i = 0; i < n; i++) V[i][i] = 1;
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: a.map((r, i) => r[i]), vectors: V };
  }
  // Uogólniony: A x = μ B x  (B dodatnio określona) → przez Choleskiego B = L Lᵀ
  function genEig(A, B) {
    const n = A.length, L = zeros(n);
    for (let j = 0; j < n; j++) {
      let s = B[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] ** 2;
      if (s <= 0) s = 1e-300; L[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) { let t = B[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / L[j][j]; }
    }
    const Li = invertSmall(L) || zeros(n);
    const C = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) for (let l = 0; l < n; l++) s += Li[i][k] * A[k][l] * Li[j][l]; C[i][j] = s; }
    const { values, vectors } = jacobiEig(C);
    // x = L⁻ᵀ y
    const X = values.map((_, m) => { const x = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < n; k++) s += Li[k][i] * vectors[k][m]; x[i] = s; } return x; });
    return { values, X };
  }

  // Iteracja podprzestrzenna: K φ = λ B φ, najmniejsze dodatnie λ (B – półokreślona)
  function subspace(F, K, Bmul, neq, nModes, opts) {
    const q = Math.min(neq, Math.max(2 * nModes, nModes + 8));
    let X = [];
    // wektory startowe: przekątna B / K + losowe
    const seed = (i => () => { i = (i * 16807) % 2147483647; return i / 2147483647 - 0.5; })(12345);
    for (let k = 0; k < q; k++) { const v = new Float64Array(neq); for (let i = 0; i < neq; i++) v[i] = seed(); X.push(v); }
    let lam = null, prev = null;
    for (let it = 0; it < (opts.maxIter || 60); it++) {
      const Y = X.map(x => F.solve(Bmul(x)));
      // rzut Rayleigha–Ritza
      const KY = Y.map(y => K.mul(y)), BY = Y.map(y => Bmul(y));
      const Kr = zeros(q), Br = zeros(q);
      for (let i = 0; i < q; i++) for (let j = i; j < q; j++) {
        let a = 0, b = 0; for (let t = 0; t < neq; t++) { a += Y[i][t] * KY[j][t]; b += Y[i][t] * BY[j][t]; }
        Kr[i][j] = Kr[j][i] = a; Br[i][j] = Br[j][i] = b;
      }
      // B Y = (1/λ) K Y → rozwiązujemy Br z = μ Kr z  (Kr dodatnio określona), μ = 1/λ
      const { values, X: Z } = genEig(Br, Kr);
      const idx = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
      X = idx.map(m => { const x = new Float64Array(neq); for (let j = 0; j < q; j++) { const c = Z[m][j]; if (c) for (let t = 0; t < neq; t++) x[t] += c * Y[j][t]; } let nr = 0; for (let t = 0; t < neq; t++) nr = Math.max(nr, Math.abs(x[t])); if (nr > 0) for (let t = 0; t < neq; t++) x[t] /= nr; return x; });
      lam = idx.map(m => values[m] > 0 ? 1 / values[m] : Infinity);
      if (prev) {
        let ok = true; for (let k = 0; k < nModes; k++) if (isFinite(lam[k]) && Math.abs(lam[k] - prev[k]) > 1e-8 * Math.abs(lam[k])) ok = false;
        if (ok) break;
      }
      prev = lam;
    }
    const out = [];
    for (let k = 0; k < q && out.length < nModes; k++) if (isFinite(lam[k]) && lam[k] > 0) out.push({ lambda: lam[k], vec: X[k] });
    return out;
  }

  function expandMode(ctx, vec) {
    return ctx.coords.map((_, i) => { const d = new Float64Array(6); for (let q = 0; q < 6; q++) { const e = ctx.eq[i][q]; d[q] = e >= 0 ? vec[e] : 0; } return d; });
  }

  // Wyboczenie liniowe dla kombinacji: (K + α Kg(N)) φ = 0
  function analyzeBuckling(model, factors, opts) {
    opts = opts || {};
    const ctx = prepare(model, opts);
    if (ctx.errors.length) return { ok: false, errors: ctx.errors };
    let F, K;
    try { K = assemble(ctx, 'K'); F = factorOrThrow(K, ctx); } catch (e) { return { ok: false, errors: [e.message] }; }
    const lv = loadVector(ctx, factors);
    const U = F.solve(lv.P);
    const Nv = ctx.members.map((m, e) => memberEndForces(ctx, m, e, U, lv, null).f[6]);
    if (!Nv.some(n => n < -1e-9)) return { ok: true, modes: [], note: 'Brak prętów ściskanych – wyboczenie nie występuje.', N: Nv };
    const Kg = assemble(ctx, 'Kg', Nv);
    const negKg = x => { const y = Kg.mul(x); for (let i = 0; i < y.length; i++) y[i] = -y[i]; return y; };
    const modes = subspace(F, K, negKg, ctx.neq, opts.modes || 4, opts).map(md => ({ alpha: md.lambda, shape: expandMode(ctx, md.vec) }));
    // długości wyboczeniowe prętów ściskanych dla 1. postaci: Lcr = π √(EI/(α|N|))
    const lcr = modes.length ? ctx.members.map((m, e) => {
      const N = Nv[e]; if (!(N < 0) || m.p.truss) return { id: m.id, N };
      const Ncr = modes[0].alpha * -N;
      return { id: m.id, N, Ncr, Lcr_y: Math.PI * Math.sqrt(m.p.E * m.p.Iy / Ncr), Lcr_z: Math.PI * Math.sqrt(m.p.E * m.p.Iz / Ncr), L: m.ax.L };
    }) : [];
    return { ok: true, modes, N: Nv, lcr };
  }

  // Drgania własne: K φ = ω² M φ
  // massCases: { caseId: współczynnik } – obciążenia zamieniane na masy (składowa grawitacyjna)
  function analyzeModal(model, opts) {
    opts = opts || {};
    const ctx = prepare(model, opts);
    if (ctx.errors.length) return { ok: false, errors: ctx.errors };
    let F, K;
    try { K = assemble(ctx, 'K'); F = factorOrThrow(K, ctx); } catch (e) { return { ok: false, errors: [e.message] }; }
    const gdir = ctx.dim === '2D' ? [0, -1, 0] : [0, 0, -1];
    const mpl = ctx.members.map(m => (opts.selfMass !== false ? m.p.gamma * m.p.A / G_ACC : 0));
    const nodalM = Array.from({ length: ctx.coords.length }, () => 0);
    for (const [cid, f] of Object.entries(opts.massCases || {})) {
      if (!f) continue;
      ctx.members.forEach((m, e) => {
        const ll = memberLoadsLocal(model, m, m.ax, cid, ctx, opts.selfMass !== false);
        // tylko składowa zgodna z grawitacją, rozłożona równomiernie na pręt
        let W = 0; const gl = rot3(gdir, m.ax.R);
        ll.dist.forEach(d => { const q1 = dot(d.q1, gl), q2 = dot(d.q2, gl); W += Math.max(0, (q1 + q2) / 2 * (d.b - d.a)); });
        ll.point.forEach(p => { W += Math.max(0, dot(p.P, gl)); });
        mpl[e] += f * W / m.ax.L / G_ACC;
      });
      for (const ld of model.loads || []) {
        if (ld.type !== 'nodal' || String(ld.case) !== cid) continue;
        const i = ctx.nodeIdx.get(String(ld.node)); if (i === undefined) continue;
        const F = ld.F || []; const w = -(ctx.dim === '2D' ? +F[1] || 0 : +F[2] || 0);
        if (w > 0) nodalM[i] += f * w / G_ACC;
      }
    }
    for (const nm of opts.nodalMasses || []) { const i = ctx.nodeIdx.get(String(nm.node)); if (i !== undefined) nodalM[i] += +nm.m || 0; }
    const M = assemble(ctx, 'M', mpl);
    nodalM.forEach((mv, i) => { if (mv > 0) for (let q = 0; q < 3; q++) { const e = ctx.eq[i][q]; if (e >= 0) M.add(e, e, mv); } });
    const Mmul = x => M.mul(x);
    const raw = subspace(F, K, Mmul, ctx.neq, opts.modes || 6, opts);
    // współczynniki udziału mas
    const dirs = ctx.dim === '2D' ? [0, 1] : [0, 1, 2];
    let mtot = [0, 0, 0];
    const rvec = dirs.map(d => { const r = new Float64Array(ctx.neq); for (let i = 0; i < ctx.coords.length; i++) { const e = ctx.eq[i][d]; if (e >= 0) r[e] = 1; } return r; });
    rvec.forEach((r, k) => { const Mr = M.mul(r); let s = 0; for (let t = 0; t < ctx.neq; t++) s += r[t] * Mr[t]; mtot[dirs[k]] = s; });
    const modes = raw.map(md => {
      const Mphi = M.mul(md.vec); let gm = 0; for (let t = 0; t < ctx.neq; t++) gm += md.vec[t] * Mphi[t];
      const part = [0, 0, 0];
      rvec.forEach((r, k) => { let L = 0; for (let t = 0; t < ctx.neq; t++) L += r[t] * Mphi[t]; part[dirs[k]] = mtot[dirs[k]] > 0 ? L * L / gm / mtot[dirs[k]] : 0; });
      const w = Math.sqrt(md.lambda);
      return { omega: w, f: w / (2 * Math.PI), T: 2 * Math.PI / w, massPart: part, shape: expandMode(ctx, md.vec) };
    });
    return { ok: true, modes, totalMass: mtot };
  }

  /* =====================================================================
     Kombinacje oddziaływań wg PN-EN 1990 + Załącznik krajowy PL
     ===================================================================== */
  const PSI = {
    A: { name: 'Kat. A – powierzchnie mieszkalne', p0: 0.7, p1: 0.5, p2: 0.3 },
    B: { name: 'Kat. B – biura', p0: 0.7, p1: 0.5, p2: 0.3 },
    C: { name: 'Kat. C – miejsca zebrań', p0: 0.7, p1: 0.7, p2: 0.6 },
    D: { name: 'Kat. D – powierzchnie handlowe', p0: 0.7, p1: 0.7, p2: 0.6 },
    E: { name: 'Kat. E – magazyny', p0: 1.0, p1: 0.9, p2: 0.8 },
    F: { name: 'Kat. F – ruch pojazdów ≤ 30 kN', p0: 0.7, p1: 0.7, p2: 0.6 },
    G: { name: 'Kat. G – ruch pojazdów 30–160 kN', p0: 0.7, p1: 0.5, p2: 0.3 },
    H: { name: 'Kat. H – dachy', p0: 0.0, p1: 0.0, p2: 0.0 },
    S: { name: 'Śnieg (H ≤ 1000 m n.p.m.)', p0: 0.5, p1: 0.2, p2: 0.0 },
    S2: { name: 'Śnieg (H > 1000 m n.p.m.)', p0: 0.7, p1: 0.5, p2: 0.2 },
    W: { name: 'Wiatr', p0: 0.6, p1: 0.2, p2: 0.0 },
    T: { name: 'Temperatura (nie pożar)', p0: 0.6, p1: 0.5, p2: 0.0 },
  };
  const CASE_TYPES = {
    G: 'stałe', Q: 'użytkowe', S: 'śnieg', W: 'wiatr', T: 'termiczne', A: 'wyjątkowe'
  };
  const psiOf = c => {
    if (c.psi) return c.psi;
    const key = c.type === 'Q' ? (c.cat || 'A') : c.type === 'S' ? (c.cat === 'S2' ? 'S2' : 'S') : c.type;
    return PSI[key] || { p0: 0.7, p1: 0.5, p2: 0.3 };
  };
  const DEFAULT_FACTORS = { gGsup: 1.35, gGinf: 1.0, gQ: 1.5, xi: 0.85, gGsupEQU: 1.10, gGinfEQU: 0.90, gQEQU: 1.5, rule: '6.10ab' };

  // grupy wykluczające się: case.group (tekst); brak grupy = osobna grupa
  function groupsOf(cases) {
    const g = new Map();
    cases.forEach(c => { const k = c.group ? 'g:' + c.group : 'c:' + c.id; if (!g.has(k)) g.set(k, []); g.get(k).push(c); });
    return [...g.values()];
  }

  // Reguły kombinacji: lista „formuł”; każda: { name, G: [sup, inf], lead: γ·ψ dla wiodącego (funkcja c→f), acc: c→f }
  function comboRules(set, fac) {
    fac = Object.assign({}, DEFAULT_FACTORS, fac || {});
    switch (set) {
      case 'ULS':
        if (fac.rule === '6.10') return [{ key: '6.10', G: [fac.gGsup, fac.gGinf], lead: c => fac.gQ, acc: c => fac.gQ * psiOf(c).p0 }];
        return [
          { key: '6.10a', G: [fac.gGsup, fac.gGinf], lead: c => fac.gQ * psiOf(c).p0, acc: c => fac.gQ * psiOf(c).p0, noLead: true },
          { key: '6.10b', G: [fac.xi * fac.gGsup, fac.gGinf], lead: c => fac.gQ, acc: c => fac.gQ * psiOf(c).p0 },
        ];
      case 'EQU': return [{ key: 'EQU', G: [fac.gGsupEQU, fac.gGinfEQU], lead: c => fac.gQEQU, acc: c => fac.gQEQU * psiOf(c).p0 }];
      case 'SLS_CH': return [{ key: 'char.', G: [1, 1], lead: c => 1, acc: c => psiOf(c).p0 }];
      case 'SLS_FR': return [{ key: 'częsta', G: [1, 1], lead: c => psiOf(c).p1, acc: c => psiOf(c).p2 }];
      case 'SLS_QP': return [{ key: 'quasi-stała', G: [1, 1], lead: c => psiOf(c).p2, acc: c => psiOf(c).p2, noLead: true }];
      case 'ACC': return [{ key: 'wyjątkowa', G: [1, 1], lead: c => psiOf(c).p1, acc: c => psiOf(c).p2, accidental: true }];
      default: return [];
    }
  }
  const SET_NAMES = { ULS: 'SGN (STR/GEO)', EQU: 'SGN (EQU)', SLS_CH: 'SGU charakterystyczna', SLS_FR: 'SGU częsta', SLS_QP: 'SGU quasi-stała', ACC: 'SGN wyjątkowa' };

  // Obwiednia skalarnej wielkości r (wartości dla przypadków) – wybór niekorzystnych współczynników.
  // Zwraca { max, min, fmax, fmin } (fmax/fmin – mapy współczynników kombinacji decydujących)
  function envelopeScalar(cases, r, set, fac) {
    const rules = comboRules(set, fac);
    const Gs = cases.filter(c => c.type === 'G'), Vs = cases.filter(c => c.type !== 'G' && c.type !== 'A');
    const As = cases.filter(c => c.type === 'A');
    const groups = groupsOf(Vs);
    let best = { max: -Infinity, min: Infinity, fmax: null, fmin: null };
    const val = c => r[String(c.id)] || 0;
    for (const rule of rules) {
      const accList = rule.accidental ? (As.length ? As : [null]) : [null];
      for (const Ac of accList) {
        for (const sgn of [1, -1]) {
          // stałe
          const f = {}; let base = 0;
          Gs.forEach(c => { const v = val(c); const a = rule.G[0] * v, b = rule.G[1] * v; const pick = sgn > 0 ? (a >= b ? 0 : 1) : (a <= b ? 0 : 1); f[c.id] = rule.G[pick]; base += rule.G[pick] * v; });
          if (Ac) { f[Ac.id] = 1; base += val(Ac); }
          const leads = rule.noLead ? [null] : [null, ...Vs];
          for (const L of leads) {
            const ff = Object.assign({}, f); let s = base;
            const LG = L ? groups.find(g => g.includes(L)) : null;
            if (L) { const v = rule.lead(L) * val(L); if (sgn * v > 0) { s += v; ff[L.id] = rule.lead(L); } else continue; }
            for (const g of groups) {
              if (g === LG) continue;
              let bv = 0, bc = null;
              g.forEach(c => { const v = rule.acc(c) * val(c); if (sgn * v > sgn * bv) { bv = v; bc = c; } });
              if (bc) { s += bv; ff[bc.id] = rule.acc(bc); }
            }
            if (sgn > 0 && s > best.max) { best.max = s; best.fmax = Object.assign({ _rule: rule.key, _lead: L ? L.id : null }, ff); }
            if (sgn < 0 && s < best.min) { best.min = s; best.fmin = Object.assign({ _rule: rule.key, _lead: L ? L.id : null }, ff); }
          }
        }
      }
    }
    if (!isFinite(best.max)) best.max = 0; if (!isFinite(best.min)) best.min = 0;
    return best;
  }

  // Jawna lista kombinacji (do analizy II rzędu, wyboczenia, raportu)
  function explicitCombos(cases, set, fac, limit) {
    limit = limit || 300;
    const rules = comboRules(set, fac);
    const Gs = cases.filter(c => c.type === 'G'), Vs = cases.filter(c => c.type !== 'G' && c.type !== 'A'), As = cases.filter(c => c.type === 'A');
    const groups = groupsOf(Vs);
    const out = [], seen = new Set();
    const push = (name, f) => { const key = Object.keys(f).sort().map(k => k + ':' + f[k].toFixed(4)).join('|'); if (seen.has(key)) return; seen.add(key); out.push({ name, set, factors: f }); };
    // iloczyn kartezjański wyboru z grup (bez grupy wiodącej)
    const choices = (gs) => gs.reduce((acc, g) => { const r = []; acc.forEach(a => g.forEach(c => r.push(a.concat([c])))); return r; }, [[]]);
    for (const rule of rules) {
      const gVariants = rule.G[0] !== rule.G[1] ? [0, 1] : [0];
      const accList = rule.accidental ? (As.length ? As : [null]) : [null];
      for (const Ac of accList) for (const gv of gVariants) {
        const leads = rule.noLead ? [null] : (Vs.length ? Vs : [null]);
        for (const L of leads) {
          const LG = L ? groups.find(g => g.includes(L)) : null;
          const others = groups.filter(g => g !== LG);
          for (const ch of choices(others)) {
            const f = {}; Gs.forEach(c => f[c.id] = rule.G[gv]);
            if (Ac) f[Ac.id] = 1;
            if (L) f[L.id] = rule.lead(L);
            ch.forEach(c => { const v = rule.acc(c); if (v) f[c.id] = v; });
            const nm = `${rule.key}${gv ? ' (G korzystne)' : ''}${L ? ' · wiodące: ' + (L.name || L.id) : ''}${Ac ? ' · ' + (Ac.name || Ac.id) : ''}`;
            push(nm, f);
            if (out.length >= limit) return out;
          }
          // wariant tylko z wiodącym (bez towarzyszących)
          if (L && others.length) { const f = {}; Gs.forEach(c => f[c.id] = rule.G[gv]); f[L.id] = rule.lead(L); push(`${rule.key}${gv ? ' (G korzystne)' : ''} · tylko ${L.name || L.id}`, f); }
        }
      }
    }
    return out;
  }

  function describeFactors(cases, f) {
    if (!f) return '';
    const byId = {}; cases.forEach(c => byId[String(c.id)] = c);
    const parts = Object.keys(f).filter(k => !k.startsWith('_') && f[k]).map(k => `${fmtNum(f[k], 2)}·${byId[k] ? (byId[k].name || k) : k}`);
    return (f._rule ? `[${f._rule}] ` : '') + parts.join(' + ');
  }
  function fmtNum(v, d) { return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ','); }

  /* --------------------------------------------- obwiednie wyników */
  const QKEYS = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz', 'ux', 'uy', 'uz'];
  function envelopeMembers(lin, cases, set, fac) {
    const ids = cases.map(c => String(c.id));
    const first = lin.cases[ids[0]];
    if (!first) return [];
    return first.members.map((m, e) => {
      const grid = mergeStations(ids.map(k => lin.cases[k].members[e].st));
      const st = grid.map(([x, side]) => {
        const vals = {}; ids.forEach(k => vals[k] = sampleSt(lin.cases[k].members[e].st, x, side));
        const o = { x, side };
        QKEYS.forEach(q => {
          const r = {}; ids.forEach(k => r[k] = vals[k][q]);
          const env = envelopeScalar(cases, r, set, fac);
          o[q] = [env.min, env.max]; o[q + '_f'] = [env.fmin, env.fmax];
        });
        return o;
      });
      return { id: m.id, st };
    });
  }
  function envelopeReactions(lin, cases, set, fac) {
    const ids = cases.map(c => String(c.id));
    const first = lin.cases[ids[0]];
    if (!first) return [];
    return first.reactions.map((r0, ri) => {
      const R = [], F = [];
      for (let q = 0; q < 6; q++) { const r = {}; ids.forEach(k => r[k] = lin.cases[k].reactions[ri].R[q]); const e = envelopeScalar(cases, r, set, fac); R.push([e.min, e.max]); F.push([e.fmin, e.fmax]); }
      return { node: r0.node, R, F };
    });
  }
  function envelopeDisp(lin, cases, set, fac) {
    const ids = cases.map(c => String(c.id));
    const first = lin.cases[ids[0]];
    if (!first) return [];
    return first.disp.map((_, i) => { const D = []; for (let q = 0; q < 6; q++) { const r = {}; ids.forEach(k => r[k] = lin.cases[k].disp[i][q]); const e = envelopeScalar(cases, r, set, fac); D.push([e.min, e.max]); } return D; });
  }

  return {
    version: '1.0.0', G_ACC,
    memberAxes, localStiffness, localGeometric, localMass, condense, Skyline,
    prepare, analyzeLinear, superpose, analyzeSecondOrder, analyzeBuckling, analyzeModal,
    PSI, CASE_TYPES, DEFAULT_FACTORS, SET_NAMES, psiOf, comboRules, envelopeScalar, explicitCombos, describeFactors,
    envelopeMembers, envelopeReactions, envelopeDisp, sampleSt, mergeStations, QKEYS,
    _internal: { jacobiEig, genEig, invertSmall, equivalentLoads, memberStations }
  };
});
