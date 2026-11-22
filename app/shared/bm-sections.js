/* =====================================================================
   BM-Win – biblioteka przekrojów i obliczanie charakterystyk
   Wymiary wejściowe w [mm]; wyniki w [m], [m²], [m⁴], [m⁶] (do MES)
   oraz w jednostkach katalogowych (cm², cm⁴, cm³) do prezentacji.
   Profile walcowane: charakterystyki liczone z geometrii (z zaokrągleniami);
   dla IPE/HE zgodność z katalogami ±0,5%, dla IPN/UPN (półki zbieżne –
   spadek półek i zaokrąglenia krawędzi uwzględnione) ok. ±1,5%.
   Oś y – „silna” (pozioma), oś z – pionowa (wysokość h), zgodnie z PN-EN.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMSEC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PI = Math.PI;

  // ------------------------------------------------------- katalogi profili
  // I: [h, b, tw, tf, r]
  const IPE = { 80: [80, 46, 3.8, 5.2, 5], 100: [100, 55, 4.1, 5.7, 7], 120: [120, 64, 4.4, 6.3, 7], 140: [140, 73, 4.7, 6.9, 7], 160: [160, 82, 5.0, 7.4, 9], 180: [180, 91, 5.3, 8.0, 9], 200: [200, 100, 5.6, 8.5, 12], 220: [220, 110, 5.9, 9.2, 12], 240: [240, 120, 6.2, 9.8, 15], 270: [270, 135, 6.6, 10.2, 15], 300: [300, 150, 7.1, 10.7, 15], 330: [330, 160, 7.5, 11.5, 18], 360: [360, 170, 8.0, 12.7, 18], 400: [400, 180, 8.6, 13.5, 21], 450: [450, 190, 9.4, 14.6, 21], 500: [500, 200, 10.2, 16.0, 21], 550: [550, 210, 11.1, 17.2, 24], 600: [600, 220, 12.0, 19.0, 24] };
  const HEA = { 100: [96, 100, 5, 8, 12], 120: [114, 120, 5, 8, 12], 140: [133, 140, 5.5, 8.5, 12], 160: [152, 160, 6, 9, 15], 180: [171, 180, 6, 9.5, 15], 200: [190, 200, 6.5, 10, 18], 220: [210, 220, 7, 11, 18], 240: [230, 240, 7.5, 12, 21], 260: [250, 260, 7.5, 12.5, 24], 280: [270, 280, 8, 13, 24], 300: [290, 300, 8.5, 14, 27], 320: [310, 300, 9, 15.5, 27], 340: [330, 300, 9.5, 16.5, 27], 360: [350, 300, 10, 17.5, 27], 400: [390, 300, 11, 19, 27], 450: [440, 300, 11.5, 21, 27], 500: [490, 300, 12, 23, 27], 550: [540, 300, 12.5, 24, 27], 600: [590, 300, 13, 25, 27], 650: [640, 300, 13.5, 26, 27], 700: [690, 300, 14.5, 27, 27], 800: [790, 300, 15, 28, 30], 900: [890, 300, 16, 30, 30], 1000: [990, 300, 16.5, 31, 30] };
  const HEB = { 100: [100, 100, 6, 10, 12], 120: [120, 120, 6.5, 11, 12], 140: [140, 140, 7, 12, 12], 160: [160, 160, 8, 13, 15], 180: [180, 180, 8.5, 14, 15], 200: [200, 200, 9, 15, 18], 220: [220, 220, 9.5, 16, 18], 240: [240, 240, 10, 17, 21], 260: [260, 260, 10, 17.5, 24], 280: [280, 280, 10.5, 18, 24], 300: [300, 300, 11, 19, 27], 320: [320, 300, 11.5, 20.5, 27], 340: [340, 300, 12, 21.5, 27], 360: [360, 300, 12.5, 22.5, 27], 400: [400, 300, 13.5, 24, 27], 450: [450, 300, 14, 26, 27], 500: [500, 300, 14.5, 28, 27], 550: [550, 300, 15, 29, 27], 600: [600, 300, 15.5, 30, 27], 650: [650, 300, 16, 31, 27], 700: [700, 300, 17, 32, 27], 800: [800, 300, 17.5, 33, 30], 900: [900, 300, 18.5, 35, 30], 1000: [1000, 300, 19, 36, 30] };
  const HEM = { 100: [120, 106, 12, 20, 12], 120: [140, 126, 12.5, 21, 12], 140: [160, 146, 13, 22, 12], 160: [180, 166, 14, 23, 15], 180: [200, 186, 14.5, 24, 15], 200: [220, 206, 15, 25, 18], 220: [240, 226, 15.5, 26, 18], 240: [270, 248, 18, 32, 21], 260: [290, 268, 18, 32.5, 24], 280: [310, 288, 18.5, 33, 24], 300: [340, 310, 21, 39, 27], 320: [359, 309, 21, 40, 27], 340: [377, 309, 21, 40, 27], 360: [395, 308, 21, 40, 27], 400: [432, 307, 21, 40, 27], 450: [478, 307, 21, 40, 27], 500: [524, 306, 21, 40, 27], 550: [572, 306, 21, 40, 27], 600: [620, 305, 21, 40, 27] };
  const IPN = { 80: [80, 42, 3.9, 5.9, 3.9], 100: [100, 50, 4.5, 6.8, 4.5], 120: [120, 58, 5.1, 7.7, 5.1], 140: [140, 66, 5.7, 8.6, 5.7], 160: [160, 74, 6.3, 9.5, 6.3], 180: [180, 82, 6.9, 10.4, 6.9], 200: [200, 90, 7.5, 11.3, 7.5], 220: [220, 98, 8.1, 12.2, 8.1], 240: [240, 106, 8.7, 13.1, 8.7], 260: [260, 113, 9.4, 14.1, 9.4], 280: [280, 119, 10.1, 15.2, 10.1], 300: [300, 125, 10.8, 16.2, 10.8], 320: [320, 131, 11.5, 17.3, 11.5], 340: [340, 137, 12.2, 18.3, 12.2], 360: [360, 143, 13.0, 19.5, 13.0], 400: [400, 155, 14.4, 21.6, 14.4] };
  // U: [h, b, tw, tf, r]
  const UPN = { 80: [80, 45, 6, 8, 8], 100: [100, 50, 6, 8.5, 8.5], 120: [120, 55, 7, 9, 9], 140: [140, 60, 7, 10, 10], 160: [160, 65, 7.5, 10.5, 10.5], 180: [180, 70, 8, 11, 11], 200: [200, 75, 8.5, 11.5, 11.5], 220: [220, 80, 9, 12.5, 12.5], 240: [240, 85, 9.5, 13, 13], 260: [260, 90, 10, 14, 14], 280: [280, 95, 10, 15, 15], 300: [300, 100, 10, 16, 16], 320: [320, 100, 14, 17.5, 17.5], 350: [350, 100, 14, 16, 16], 380: [380, 102, 13.5, 16, 16], 400: [400, 110, 14, 18, 18] };
  const CHS = [[33.7, 3.2], [42.4, 3.2], [48.3, 3.2], [48.3, 4], [60.3, 3.2], [60.3, 4], [76.1, 3.2], [76.1, 4], [88.9, 3.2], [88.9, 4], [88.9, 5], [101.6, 4], [101.6, 5], [114.3, 4], [114.3, 5], [114.3, 6.3], [139.7, 5], [139.7, 6.3], [168.3, 5], [168.3, 6.3], [168.3, 8], [193.7, 6.3], [219.1, 6.3], [219.1, 8], [244.5, 8], [273, 8], [273, 10], [323.9, 8], [323.9, 10], [355.6, 10], [406.4, 10], [457, 10], [508, 12.5]];
  const SHS = [[40, 3], [40, 4], [50, 3], [50, 4], [50, 5], [60, 3], [60, 4], [60, 5], [70, 4], [70, 5], [80, 4], [80, 5], [80, 6.3], [90, 4], [90, 5], [90, 6.3], [100, 4], [100, 5], [100, 6.3], [100, 8], [120, 5], [120, 6.3], [120, 8], [140, 5], [140, 6.3], [140, 8], [150, 6.3], [150, 8], [150, 10], [160, 6.3], [160, 8], [160, 10], [180, 8], [180, 10], [200, 8], [200, 10], [200, 12.5], [250, 10], [250, 12.5], [300, 10], [300, 12.5]];
  const RHS = [[60, 40, 3], [60, 40, 4], [80, 40, 3], [80, 40, 4], [100, 50, 4], [100, 50, 5], [100, 60, 4], [100, 60, 5], [120, 60, 4], [120, 60, 5], [120, 80, 5], [120, 80, 6.3], [140, 80, 5], [140, 80, 6.3], [150, 100, 5], [150, 100, 6.3], [160, 80, 5], [160, 80, 6.3], [180, 100, 6.3], [180, 100, 8], [200, 100, 6.3], [200, 100, 8], [200, 120, 8], [250, 150, 8], [250, 150, 10], [300, 200, 10], [400, 200, 10]];

  // ------------------------------------------------- charakterystyki (mm)
  const SPAND = (10 - 3 * PI) / (12 - 3 * PI);   // położenie środka ciężkości „naroża” (kwadrat − ćwiartka koła) ≈ 0,2234 r
  // Dwuteownik bisymetryczny (walcowany: r – promień wyokrąglenia; spawany: r = 0, a – spoina pomijana)
  function iProps(h, b, tw, tf, r) {
    const hw = h - 2 * tf, ac = (1 - PI / 4) * r * r;
    const A = 2 * b * tf + hw * tw + 4 * ac;
    const Iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12 + 4 * ac * (hw / 2 - SPAND * r) ** 2;
    const Iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12 + 4 * ac * (tw / 2 + SPAND * r) ** 2;
    const Wply = tw * h * h / 4 + (b - tw) * (h - tf) * tf + 4 * ac * (hw / 2 - SPAND * r);
    const Wplz = b * b * tf / 2 + hw * tw * tw / 4 + 4 * ac * (tw / 2 + SPAND * r);
    // It wg wzoru dla profili walcowanych (z wyokrągleniami)
    let It = 2 / 3 * b * tf ** 3 + 1 / 3 * hw * tw ** 3;
    if (r > 0) {
      const a1 = -0.042 + 0.2204 * tw / tf + 0.1355 * r / tf - 0.0865 * r * tw / tf ** 2 - 0.0725 * tw ** 2 / tf ** 2;
      const D = ((tf + r) ** 2 + tw * (r + tw / 4)) / (2 * r + tf);
      It = 2 / 3 * b * tf ** 3 + 1 / 3 * (h - 2 * tf) * tw ** 3 + 2 * a1 * D ** 4 - 0.420 * tf ** 4;
    }
    const Iw = Iz * (h - tf) ** 2 / 4;
    const Avz = Math.max(A - 2 * b * tf + (tw + 2 * r) * tf, hw * tw);   // PN-EN 1993-1-1, 6.2.6(3)a (η = 1,0)
    const Avy = 2 * b * tf;
    return { A, Iy, Iz, It, Iw, Wely: 2 * Iy / h, Welz: 2 * Iz / b, Wply, Wplz, Avz, Avy, h, b, tw, tf, r, hw, cf: (b - tw - 2 * r) / 2, cw: h - 2 * tf - 2 * r };
  }
  // Profile o półkach zbieżnych (IPN – spadek 14%, UPN – 8% dla h ≤ 300, 5% powyżej):
  // całkowanie numeryczne paskami; tf – grubość w połowie wysięgu półki (wartość katalogowa).
  function taperedProps(kind, h, b, tw, tf, r, slope) {
    const N = 600, isU = kind === 'U';
    const x0 = isU ? 0 : -b / 2, x1 = isU ? b : b / 2;
    const xm = isU ? b / 2 : b / 4;   // miejsce pomiaru tf wg PN-EN 10279 / DIN 1025-1
    const inWeb = x => isU ? x <= tw : Math.abs(x) <= tw / 2;
    const tAt = x => Math.max(0.3 * tf, tf + slope * (xm - (isU ? x : Math.abs(x))));
    const strips = [];
    const dx = (x1 - x0) / N;
    for (let k = 0; k < N; k++) {
      const x = x0 + (k + 0.5) * dx;
      if (inWeb(x)) strips.push({ x, web: true, t: h / 2 });
      else strips.push({ x, web: false, t: tAt(x) });
    }
    const tr = tAt(isU ? tw : tw / 2);
    const ac = (1 - PI / 4) * r * r, nC = isU ? 2 : 4;
    const cx = isU ? [tw + SPAND * r] : [tw / 2 + SPAND * r, -(tw / 2 + SPAND * r)];
    const cz = h / 2 - tr - SPAND * r;
    let A = 0, Sx = 0;
    strips.forEach(st => { const a = (st.web ? h : 2 * st.t) * dx; st.a = a; A += a; Sx += a * st.x; });
    A += nC * ac; cx.forEach(c => Sx += (nC / cx.length) * ac * c);
    // zaokrąglenia krawędzi półek (r2 = 0,5 r dla UPN, 0,6 r dla IPN) – odjęcie „naroży”
    const r2 = (isU ? 0.5 : 0.6) * r, a2 = (1 - PI / 4) * r2 * r2;
    const tips = isU ? [b - SPAND * r2] : [b / 2 - SPAND * r2, -(b / 2 - SPAND * r2)];
    const tTip = tAt(isU ? b : b / 2), zt2 = h / 2 - tTip + SPAND * r2;
    const nT = isU ? 2 : 4;
    A -= nT * a2; tips.forEach(c => Sx -= (nT / tips.length) * a2 * c);
    const xc = Sx / A;
    let Iy = 0, Iz = 0, Wply = 0, It = 0;
    strips.forEach(st => {
      if (st.web) { Iy += dx * h ** 3 / 12; Wply += dx * h * h / 4; }
      else { Iy += 2 * (dx * st.t ** 3 / 12 + dx * st.t * (h / 2 - st.t / 2) ** 2); Wply += 2 * dx * st.t * (h / 2 - st.t / 2); It += 2 * dx * st.t ** 3 / 3; }
      Iz += st.a * (st.x - xc) ** 2 + (st.web ? h : 2 * st.t) * dx ** 3 / 12;
    });
    Iy += nC * ac * cz * cz - nT * a2 * zt2 * zt2; Wply += nC * ac * cz - nT * a2 * zt2;
    cx.forEach(c => Iz += (nC / cx.length) * ac * (c - xc) ** 2);
    tips.forEach(c => Iz -= (nT / tips.length) * a2 * (c - xc) ** 2);
    It += (h - 2 * tr) * tw ** 3 / 3;
    // Wpl,z: oś obojętna plastyczna dzieląca pole na połowy
    const xs = strips.map(st => st.x), as = strips.map(st => st.a);
    let acc = 0, xp = xc;
    for (let k = 0; k < xs.length; k++) { if (acc + as[k] >= A / 2 - nC * ac / 2) { xp = xs[k]; break; } acc += as[k]; }
    if (!isU) xp = 0;
    let Wplz = 0; strips.forEach(st => Wplz += st.a * Math.abs(st.x - xp));
    cx.forEach(c => Wplz += (nC / cx.length) * ac * Math.abs(c - xp));
    const hw = h - 2 * tf;
    const Iw = isU ? (tf * b ** 3 * hw ** 2 / 12) * (3 * b * tf + 2 * hw * tw) / (6 * b * tf + hw * tw) : Iz * (h - tf) ** 2 / 4;
    const zc = isU ? xc : 0;
    return { A, Iy, Iz, It, Iw, Wely: 2 * Iy / h, Welz: isU ? Iz / (b - xc) : 2 * Iz / b, Wply, Wplz,
      Avz: Math.max(A - 2 * b * tf + (tw + (isU ? 1 : 2) * r) * tf, hw * tw), Avy: 2 * b * tf,
      h, b, tw, tf, r, zc, hw, cf: isU ? b - tw - r : (b - tw - 2 * r) / 2, cw: h - 2 * tf - 2 * r, tapered: true };
  }
  const uProps = (h, b, tw, tf, r) => taperedProps('U', h, b, tw, tf, r, h > 300 ? 0.05 : 0.08);
  const ipnProps = (h, b, tw, tf, r) => taperedProps('I', h, b, tw, tf, r, 0.14);
  // Prostokąt z zaokrąglonymi narożami (do rur prostokątnych)
  function rrect(B, H, R) {
    const ac = (1 - PI / 4) * R * R;
    return {
      A: B * H - 4 * ac,
      Iy: B * H ** 3 / 12 - 4 * ac * (H / 2 - SPAND * R) ** 2,
      Iz: H * B ** 3 / 12 - 4 * ac * (B / 2 - SPAND * R) ** 2,
      Sy: B * H * H / 4 - 4 * ac * (H / 2 - SPAND * R),   // Wpl = 2 × moment statyczny połowy przekroju
      Sz: H * B * B / 4 - 4 * ac * (B / 2 - SPAND * R),
    };
  }
  // Rura prostokątna gorącowykończona (PN-EN 10210: ro = 1,5t, ri = 1,0t) lub zimnogięta (PN-EN 10219: ro = 2t / 2,5t)
  function rhsProps(h, b, t, cold) {
    const ro = cold ? (t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t) : 1.5 * t, ri = cold ? ro - t : t;
    const o = rrect(b, h, ro), i = rrect(b - 2 * t, h - 2 * t, ri);
    const A = o.A - i.A, Iy = o.Iy - i.Iy, Iz = o.Iz - i.Iz;
    const Wply = o.Sy - i.Sy, Wplz = o.Sz - i.Sz;
    const rc = (ro + ri) / 2;
    const hp = 2 * ((b - t) + (h - t)) - 2 * rc * (4 - PI), Ah = (b - t) * (h - t) - rc * rc * (4 - PI);
    const K = 2 * Ah * t / hp, It = t ** 3 * hp / 3 + 2 * K * Ah;
    return { A, Iy, Iz, It, Iw: 0, Wely: 2 * Iy / h, Welz: 2 * Iz / b, Wply, Wplz, Avz: A * h / (b + h), Avy: A * b / (b + h), h, b, t, ro, ri, cw: h - 3 * t, cf: b - 3 * t, hollow: true };
  }
  function chsProps(D, t) {
    const d = D - 2 * t, A = PI / 4 * (D * D - d * d), I = PI / 64 * (D ** 4 - d ** 4);
    return { A, Iy: I, Iz: I, It: 2 * I, Iw: 0, Wely: 2 * I / D, Welz: 2 * I / D, Wply: (D ** 3 - d ** 3) / 6, Wplz: (D ** 3 - d ** 3) / 6, Avz: 2 * A / PI, Avy: 2 * A / PI, h: D, b: D, D, t, hollow: true, circ: true };
  }
  function rectProps(b, h) {
    const A = b * h, Iy = b * h ** 3 / 12, Iz = h * b ** 3 / 12;
    const a = Math.max(b, h), c = Math.min(b, h);
    const It = a * c ** 3 * (1 / 3 - 0.21 * c / a * (1 - c ** 4 / (12 * a ** 4)));
    return { A, Iy, Iz, It, Iw: 0, Wely: b * h * h / 6, Welz: h * b * b / 6, Wply: b * h * h / 4, Wplz: h * b * b / 4, Avz: A / 1.2 * 1.0, Avy: A / 1.2, h, b };
  }
  function circProps(D) {
    const A = PI * D * D / 4, I = PI * D ** 4 / 64;
    return { A, Iy: I, Iz: I, It: 2 * I, Iw: 0, Wely: PI * D ** 3 / 32, Welz: PI * D ** 3 / 32, Wply: D ** 3 / 6, Wplz: D ** 3 / 6, Avz: 0.9 * A, Avy: 0.9 * A, h: D, b: D, D };
  }
  // Teownik (półka górna): bf, hf – półka; bw, h – całkowita wysokość
  function tProps(bf, hf, bw, h) {
    const A1 = bf * hf, A2 = bw * (h - hf), A = A1 + A2;
    const zt = (A1 * hf / 2 + A2 * (hf + (h - hf) / 2)) / A;   // od góry
    const Iy = bf * hf ** 3 / 12 + A1 * (zt - hf / 2) ** 2 + bw * (h - hf) ** 3 / 12 + A2 * (hf + (h - hf) / 2 - zt) ** 2;
    const Iz = hf * bf ** 3 / 12 + (h - hf) * bw ** 3 / 12;
    const It = (bf * hf ** 3 + (h - hf) * bw ** 3) / 3 * 0.9;
    return { A, Iy, Iz, It, Iw: 0, Wely: Iy / Math.max(zt, h - zt), Welz: 2 * Iz / bf, Wply: NaN, Wplz: NaN, Avz: bw * h / 1.2, Avy: A1 / 1.2, h, b: bf, bf, hf, bw, zt };
  }

  // ------------------------------------------------------- definicje typów
  const TYPES = {
    IPE: { name: 'IPE', group: 'Stal – profile walcowane', cat: IPE, f: d => iProps(...d) },
    HEA: { name: 'HEA', group: 'Stal – profile walcowane', cat: HEA, f: d => iProps(...d) },
    HEB: { name: 'HEB', group: 'Stal – profile walcowane', cat: HEB, f: d => iProps(...d) },
    HEM: { name: 'HEM', group: 'Stal – profile walcowane', cat: HEM, f: d => iProps(...d) },
    IPN: { name: 'I (IPN)', group: 'Stal – profile walcowane', cat: IPN, f: d => ipnProps(...d) },
    UPN: { name: 'C (UPN)', group: 'Stal – profile walcowane', cat: UPN, f: d => uProps(...d) },
  };
  function catalogList() {
    const out = [];
    for (const [k, t] of Object.entries(TYPES)) for (const s of Object.keys(t.cat)) out.push({ key: `${k} ${s}`, group: t.group, family: k });
    CHS.forEach(([D, t]) => out.push({ key: `RO ${D}×${t}`, group: 'Stal – rury okrągłe', family: 'CHS' }));
    SHS.forEach(([a, t]) => out.push({ key: `RK ${a}×${a}×${t}`, group: 'Stal – rury kwadratowe', family: 'SHS' }));
    RHS.forEach(([h, b, t]) => out.push({ key: `RP ${h}×${b}×${t}`, group: 'Stal – rury prostokątne', family: 'RHS' }));
    return out;
  }

  // Przekrój opisany obiektem {shape, ...wymiary [mm]} → charakterystyki
  //   shape: 'cat' (key) | 'rect' (b,h) | 'circ' (D) | 'T' (bf,hf,bw,h) | 'Iw' (h,b,tw,tf) | 'box' (h,b,t) | 'pipe' (D,t) | 'user' (A..[cm])
  function compute(def) {
    let p;
    switch (def.shape) {
      case 'cat': {
        const k = String(def.key || '');
        let m;
        if ((m = k.match(/^(IPE|HEA|HEB|HEM|IPN|UPN)\s*(\d+)/))) { const t = TYPES[m[1]]; const d = t.cat[m[2]]; if (!d) return null; p = t.f(d); p.family = m[1]; }
        else if ((m = k.match(/^RO\s*([\d.]+)×([\d.]+)/))) { p = chsProps(+m[1], +m[2]); p.family = 'CHS'; }
        else if ((m = k.match(/^RK\s*([\d.]+)×([\d.]+)×([\d.]+)/))) { p = rhsProps(+m[1], +m[2], +m[3], def.cold); p.family = 'SHS'; }
        else if ((m = k.match(/^RP\s*([\d.]+)×([\d.]+)×([\d.]+)/))) { p = rhsProps(+m[1], +m[2], +m[3], def.cold); p.family = 'RHS'; }
        else return null;
        break;
      }
      case 'rect': p = rectProps(+def.b, +def.h); break;
      case 'circ': p = circProps(+def.D); break;
      case 'T': p = tProps(+def.bf, +def.hf, +def.bw, +def.h); break;
      case 'Iw': p = iProps(+def.h, +def.b, +def.tw, +def.tf, 0); p.welded = true; break;
      case 'box': p = rhsProps(+def.h, +def.b, +def.t, false); p.ro = p.ri = 0; break;
      case 'pipe': p = chsProps(+def.D, +def.t); break;
      case 'user': {
        // dane w jednostkach katalogowych: A [cm²], I [cm⁴], W [cm³]
        const c2 = 100, c4 = 1e4, c3 = 1e3;
        p = { A: def.A * c2, Iy: def.Iy * c4, Iz: (def.Iz || def.Iy) * c4, It: (def.It || 0) * c4, Iw: (def.Iw || 0) * 1e6, Wely: (def.Wely || 0) * c3, Welz: (def.Welz || 0) * c3, Wply: (def.Wply || 0) * c3, Wplz: (def.Wplz || 0) * c3, Avz: (def.Avz || 0) * c2, Avy: (def.Avy || 0) * c2, h: +def.h || 0, b: +def.b || 0 };
        break;
      }
      default: return null;
    }
    if (!p || !(p.A > 0)) return null;
    return p;
  }

  // Do MES: [m]
  function forFem(def) {
    const p = compute(def); if (!p) return null;
    return { A: p.A * 1e-6, Iy: p.Iy * 1e-12, Iz: p.Iz * 1e-12, J: p.It * 1e-12, Iw: (p.Iw || 0) * 1e-18, Avy: (p.Avy || 0) * 1e-6, Avz: (p.Avz || 0) * 1e-6, h: (p.h || 0) / 1000, b: (p.b || 0) / 1000 };
  }

  // Nazwa opisowa
  function label(def) {
    switch (def.shape) {
      case 'cat': return def.key;
      case 'rect': return `□ ${def.b}×${def.h}`;
      case 'circ': return `○ ø${def.D}`;
      case 'T': return `T ${def.bf}×${def.hf}/${def.bw}×${def.h}`;
      case 'Iw': return `I spaw. ${def.h}×${def.b}×${def.tw}×${def.tf}`;
      case 'box': return `skrzynka ${def.h}×${def.b}×${def.t}`;
      case 'pipe': return `rura ø${def.D}×${def.t}`;
      case 'user': return def.name || 'użytkownika';
      default: return '?';
    }
  }
  // Kontur przekroju do rysunku (mm, środek ciężkości w (0,0), z w górę) – lista wielokątów (zewnętrzne, otwory)
  function outline(def) {
    const p = compute(def); if (!p) return [];
    const R = (w, h, x = 0, y = 0) => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
    const circle = (r, n = 40) => Array.from({ length: n }, (_, i) => [r * Math.cos(2 * PI * i / n), r * Math.sin(2 * PI * i / n)]);
    if (p.circ || def.shape === 'circ') return def.shape === 'circ' ? [circle(p.D / 2)] : [circle(p.D / 2), circle(p.D / 2 - p.t)];
    if (p.hollow) return [R(p.b, p.h), R(p.b - 2 * p.t, p.h - 2 * p.t)];
    if (def.shape === 'rect' || def.shape === 'user') return [R(p.b || 100, p.h || 100)];
    if (def.shape === 'T') { const t = p.zt; return [[[-p.bf / 2, t], [p.bf / 2, t], [p.bf / 2, t - p.hf], [p.bw / 2, t - p.hf], [p.bw / 2, t - p.h], [-p.bw / 2, t - p.h], [-p.bw / 2, t - p.hf], [-p.bf / 2, t - p.hf]]]; }
    if (p.family === 'UPN') { const x0 = -p.zc, h = p.h, b = p.b; return [[[x0, -h / 2], [x0 + b, -h / 2], [x0 + b, -h / 2 + p.tf], [x0 + p.tw, -h / 2 + p.tf], [x0 + p.tw, h / 2 - p.tf], [x0 + b, h / 2 - p.tf], [x0 + b, h / 2], [x0, h / 2]]]; }
    // dwuteownik
    const h = p.h, b = p.b, tw = p.tw, tf = p.tf;
    return [[[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf], [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf]]];
  }

  const SHAPES = { cat: 'Profil katalogowy', rect: 'Prostokąt', circ: 'Koło', T: 'Teownik', Iw: 'Dwuteownik spawany', box: 'Skrzynka spawana', pipe: 'Rura (dowolna)', user: 'Charakterystyki użytkownika' };

  return { TYPES, CHS, SHS, RHS, catalogList, compute, forFem, label, outline, SHAPES, iProps, uProps, rhsProps, chsProps, rectProps };
});
