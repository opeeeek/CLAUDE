/* =====================================================================
   BM-Win – wspólna baza materiałów (praktyka budowlana w Polsce)
   Jednostki: wytrzymałości [MPa], E, G [GPa], γ [kN/m³], α [1/K], ρ [kg/m³]
   Źródła: PN-EN 1992-1-1 (tabl. 3.1), PN-EN 10080 / PN-H-93220,
           PN-EN 1993-1-1 (tabl. 3.1), PN-EN 10025, PN-EN 10210/10219,
           PN-EN 338:2016, PN-EN 14080:2013, PN-EN 1996-1-1.
   Wartości należy zweryfikować z aktualnym wydaniem normy przed użyciem.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMMAT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- beton
  // nazwa, fck, fck,cube, fctm, fctk0.05, fctk0.95, Ecm, εc1, εcu1, εc2, εcu2, n, εc3, εcu3
  const CONC_ROWS = [
    ['C12/15', 12, 15, 1.6, 1.1, 2.0, 27, 1.8, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C16/20', 16, 20, 1.9, 1.3, 2.5, 29, 1.9, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C20/25', 20, 25, 2.2, 1.5, 2.9, 30, 2.0, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C25/30', 25, 30, 2.6, 1.8, 3.3, 31, 2.1, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C30/37', 30, 37, 2.9, 2.0, 3.8, 33, 2.2, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C35/45', 35, 45, 3.2, 2.2, 4.2, 34, 2.25, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C40/50', 40, 50, 3.5, 2.5, 4.6, 35, 2.3, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C45/55', 45, 55, 3.8, 2.7, 4.9, 36, 2.4, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C50/60', 50, 60, 4.1, 2.9, 5.3, 37, 2.45, 3.5, 2.0, 3.5, 2.0, 1.75, 3.5],
    ['C55/67', 55, 67, 4.2, 3.0, 5.5, 38, 2.5, 3.2, 2.2, 3.1, 1.75, 1.8, 3.1],
    ['C60/75', 60, 75, 4.4, 3.1, 5.7, 39, 2.6, 3.0, 2.3, 2.9, 1.6, 1.9, 2.9],
    ['C70/85', 70, 85, 4.6, 3.2, 6.0, 41, 2.7, 2.8, 2.4, 2.7, 1.45, 2.0, 2.7],
    ['C80/95', 80, 95, 4.8, 3.4, 6.3, 42, 2.8, 2.8, 2.5, 2.6, 1.4, 2.2, 2.6],
    ['C90/105', 90, 105, 5.0, 3.5, 6.6, 44, 2.8, 2.8, 2.6, 2.6, 1.4, 2.3, 2.6],
  ];
  const concrete = CONC_ROWS.map(r => ({
    id: r[0], name: 'Beton ' + r[0], kind: 'concrete', fck: r[1], fckcube: r[2], fctm: r[3], fctk05: r[4], fctk95: r[5],
    E: r[6], nu: 0.2, G: r[6] / 2.4, gamma: 25, alpha: 1e-5,
    ec1: r[7], ecu1: r[8], ec2: r[9], ecu2: r[10], n: r[11], ec3: r[12], ecu3: r[13]
  }));

  // ---------------------------------------------------- stal zbrojeniowa
  const rebar = [
    { id: 'B500SP', name: 'B500SP (EPSTAL) – klasa C', fyk: 500, cls: 'C', euk: 7.5, k: 1.15 },
    { id: 'B500C', name: 'B500C – klasa C', fyk: 500, cls: 'C', euk: 7.5, k: 1.15 },
    { id: 'B500B', name: 'B500B / BSt500S – klasa B', fyk: 500, cls: 'B', euk: 5.0, k: 1.08 },
    { id: 'B500A', name: 'B500A – klasa A', fyk: 500, cls: 'A', euk: 2.5, k: 1.05 },
    { id: 'B450C', name: 'B450C – klasa C', fyk: 450, cls: 'C', euk: 7.5, k: 1.15 },
    { id: 'B400B', name: 'B400B – klasa B', fyk: 400, cls: 'B', euk: 5.0, k: 1.08 },
    { id: 'St3S-b', name: 'St3S-b (A-I) – stal gładka', fyk: 240, cls: 'B', euk: 5.0, k: 1.08, legacy: true },
    { id: '34GS', name: '34GS (A-III) – żebrowana', fyk: 410, cls: 'B', euk: 5.0, k: 1.08, legacy: true },
    { id: 'RB500W', name: 'RB500W (A-IIIN) – żebrowana', fyk: 500, cls: 'B', euk: 5.0, k: 1.08, legacy: true },
  ].map(s => Object.assign({ kind: 'rebar', E: 200, gamma: 78.5, alpha: 1e-5, nu: 0.3 }, s));

  // ------------------------------------------------ stal konstrukcyjna
  // fy, fu dla t ≤ 40 mm oraz 40 < t ≤ 80 mm (PN-EN 1993-1-1, tabl. 3.1)
  const STEEL_ROWS = [
    ['S235', 'PN-EN 10025-2', 235, 360, 215, 360],
    ['S275', 'PN-EN 10025-2', 275, 430, 255, 410],
    ['S355', 'PN-EN 10025-2', 355, 490, 335, 470],
    ['S450', 'PN-EN 10025-2', 440, 550, 410, 550],
    ['S275N/NL', 'PN-EN 10025-3', 275, 390, 255, 370],
    ['S355N/NL', 'PN-EN 10025-3', 355, 490, 335, 470],
    ['S420N/NL', 'PN-EN 10025-3', 420, 520, 390, 520],
    ['S460N/NL', 'PN-EN 10025-3', 460, 540, 430, 540],
    ['S275M/ML', 'PN-EN 10025-4', 275, 370, 255, 360],
    ['S355M/ML', 'PN-EN 10025-4', 355, 470, 335, 450],
    ['S420M/ML', 'PN-EN 10025-4', 420, 520, 390, 500],
    ['S460M/ML', 'PN-EN 10025-4', 460, 540, 430, 530],
    ['S235H', 'PN-EN 10210 / 10219', 235, 360, 215, 340],
    ['S275H', 'PN-EN 10210 / 10219', 275, 430, 255, 410],
    ['S355H', 'PN-EN 10210 / 10219', 355, 510, 335, 490],
  ];
  const steel = STEEL_ROWS.map(r => ({
    id: r[0], name: 'Stal ' + r[0], kind: 'steel', std: r[1], fy: r[2], fu: r[3], fy80: r[4], fu80: r[5],
    E: 210, G: 81, nu: 0.3, gamma: 78.5, alpha: 1.2e-5
  }));
  const steelFy = (m, t) => (t > 40 ? m.fy80 : m.fy);
  const steelFu = (m, t) => (t > 40 ? m.fu80 : m.fu);

  // -------------------------------------------------------------- drewno
  // fm,k  ft,0,k  ft,90,k  fc,0,k  fc,90,k  fv,k  E0,mean  E0,05  E90,mean  Gmean  ρk  ρmean
  const TIMBER_ROWS = [
    // PN-EN 338:2016 – drewno iglaste
    ['C14', 'lite iglaste', 14, 7.2, 0.4, 16, 2.0, 3.0, 7.0, 4.7, 0.23, 0.44, 290, 350],
    ['C16', 'lite iglaste', 16, 8.5, 0.4, 17, 2.2, 3.2, 8.0, 5.4, 0.27, 0.50, 310, 370],
    ['C18', 'lite iglaste', 18, 10, 0.4, 18, 2.2, 3.4, 9.0, 6.0, 0.30, 0.56, 320, 380],
    ['C20', 'lite iglaste', 20, 11.5, 0.4, 19, 2.3, 3.6, 9.5, 6.4, 0.32, 0.59, 330, 400],
    ['C22', 'lite iglaste', 22, 13, 0.4, 20, 2.4, 3.8, 10.0, 6.7, 0.33, 0.63, 340, 410],
    ['C24', 'lite iglaste', 24, 14.5, 0.4, 21, 2.5, 4.0, 11.0, 7.4, 0.37, 0.69, 350, 420],
    ['C27', 'lite iglaste', 27, 16.5, 0.4, 22, 2.5, 4.0, 11.5, 7.7, 0.38, 0.72, 360, 430],
    ['C30', 'lite iglaste', 30, 19, 0.4, 24, 2.7, 4.0, 12.0, 8.0, 0.40, 0.75, 380, 460],
    ['C35', 'lite iglaste', 35, 22, 0.4, 25, 2.7, 4.0, 13.0, 8.7, 0.43, 0.81, 390, 470],
    ['C40', 'lite iglaste', 40, 26, 0.4, 27, 2.8, 4.0, 14.0, 9.4, 0.47, 0.88, 400, 480],
    ['C45', 'lite iglaste', 45, 30, 0.4, 29, 2.9, 4.0, 15.0, 10.1, 0.50, 0.94, 410, 490],
    ['C50', 'lite iglaste', 50, 33, 0.4, 30, 3.0, 4.0, 16.0, 10.7, 0.53, 1.00, 430, 520],
    // PN-EN 338:2016 – drewno liściaste
    ['D18', 'lite liściaste', 18, 11, 0.6, 18, 4.8, 3.5, 9.5, 8.0, 0.63, 0.59, 475, 570],
    ['D24', 'lite liściaste', 24, 14, 0.6, 21, 4.9, 3.7, 10.0, 8.4, 0.67, 0.62, 485, 580],
    ['D27', 'lite liściaste', 27, 16, 0.6, 22, 5.1, 3.8, 10.5, 8.8, 0.70, 0.66, 510, 610],
    ['D30', 'lite liściaste', 30, 18, 0.6, 24, 5.3, 3.9, 11.0, 9.2, 0.73, 0.69, 530, 640],
    ['D35', 'lite liściaste', 35, 21, 0.6, 25, 5.4, 4.1, 12.0, 10.1, 0.80, 0.75, 540, 650],
    ['D40', 'lite liściaste', 40, 24, 0.6, 27, 5.5, 4.2, 13.0, 10.9, 0.86, 0.81, 550, 660],
    ['D45', 'lite liściaste', 45, 27, 0.6, 29, 5.8, 4.4, 13.5, 11.3, 0.90, 0.84, 580, 700],
    ['D50', 'lite liściaste', 50, 30, 0.6, 30, 6.2, 4.5, 14.0, 11.8, 0.93, 0.88, 620, 740],
    ['D60', 'lite liściaste', 60, 36, 0.6, 33, 10.5, 4.8, 17.0, 14.3, 1.13, 1.06, 700, 840],
    ['D70', 'lite liściaste', 70, 42, 0.6, 36, 12.0, 5.0, 20.0, 16.8, 1.33, 1.25, 900, 1080],
    // PN-EN 14080:2013 – drewno klejone warstwowo jednorodne (h) i kombinowane (c)
    ['GL20h', 'klejone', 20, 16, 0.5, 20, 2.5, 3.5, 8.4, 7.0, 0.30, 0.65, 340, 370],
    ['GL22h', 'klejone', 22, 17.6, 0.5, 22, 2.5, 3.5, 10.5, 8.8, 0.30, 0.65, 370, 410],
    ['GL24h', 'klejone', 24, 19.2, 0.5, 24, 2.5, 3.5, 11.5, 9.6, 0.30, 0.65, 385, 420],
    ['GL26h', 'klejone', 26, 20.8, 0.5, 26, 2.5, 3.5, 12.1, 10.1, 0.30, 0.65, 405, 445],
    ['GL28h', 'klejone', 28, 22.3, 0.5, 28, 2.5, 3.5, 12.6, 10.5, 0.30, 0.65, 425, 460],
    ['GL30h', 'klejone', 30, 24, 0.5, 30, 2.5, 3.5, 13.6, 11.3, 0.30, 0.65, 430, 480],
    ['GL32h', 'klejone', 32, 25.6, 0.5, 32, 2.5, 3.5, 14.2, 11.8, 0.30, 0.65, 440, 490],
    ['GL20c', 'klejone', 20, 15, 0.5, 18.5, 2.5, 3.5, 10.4, 8.6, 0.30, 0.65, 355, 390],
    ['GL22c', 'klejone', 22, 16, 0.5, 20, 2.5, 3.5, 10.4, 8.6, 0.30, 0.65, 355, 390],
    ['GL24c', 'klejone', 24, 17, 0.5, 21.5, 2.5, 3.5, 11.0, 9.1, 0.30, 0.65, 365, 400],
    ['GL26c', 'klejone', 26, 19, 0.5, 23.5, 2.5, 3.5, 12.0, 10.0, 0.30, 0.65, 385, 420],
    ['GL28c', 'klejone', 28, 19.5, 0.5, 24, 2.5, 3.5, 12.5, 10.4, 0.30, 0.65, 390, 420],
    ['GL30c', 'klejone', 30, 19.5, 0.5, 24.5, 2.5, 3.5, 13.0, 10.8, 0.30, 0.65, 390, 430],
    ['GL32c', 'klejone', 32, 19.5, 0.5, 24.5, 2.5, 3.5, 13.5, 11.2, 0.30, 0.65, 400, 440],
  ];
  const timber = TIMBER_ROWS.map(r => ({
    id: r[0], name: 'Drewno ' + r[0] + ' (' + r[1] + ')', kind: 'timber', group: r[1],
    fmk: r[2], ft0k: r[3], ft90k: r[4], fc0k: r[5], fc90k: r[6], fvk: r[7],
    E: r[8], E05: r[9], E90: r[10], G: r[11], rhok: r[12], rhom: r[13],
    gamma: Math.round(r[13] * 0.00981 * 100) / 100, alpha: 5e-6,
    glulam: r[1] === 'klejone'
  }));

  // -------------------------------------------------------------- mury
  // Materiały „zbiorcze” do statyki: E = KE·fk (PN-EN 1996-1-1, 3.7.2, KE = 1000).
  // Wytrzymałość fk jest wyznaczana w module EC6 z elementu murowego i zaprawy.
  const MASONRY_ROWS = [
    ['MUR-CER-P', 'Mur – cegła ceramiczna pełna', 18, 5.0],
    ['MUR-CER-D', 'Mur – pustaki ceramiczne (np. typu Porotherm)', 12, 4.0],
    ['MUR-SIL', 'Mur – bloki silikatowe (wapienno-piaskowe)', 19, 7.0],
    ['MUR-BK600', 'Mur – beton komórkowy 600', 7.2, 2.5],
    ['MUR-BK500', 'Mur – beton komórkowy 500', 6.3, 2.1],
    ['MUR-BET', 'Mur – bloczki betonowe', 22, 6.0],
    ['MUR-KER', 'Mur – keramzytobeton', 12, 3.5],
  ];
  const masonry = MASONRY_ROWS.map(r => ({ id: r[0], name: r[1], kind: 'masonry', gamma: r[2], fk: r[3], KE: 1000, E: 1000 * r[3] / 1000, nu: 0.2, G: 0.4 * r[3], alpha: 6e-6 }));

  const ALL = [].concat(concrete, steel, timber, masonry, rebar);
  const byId = {}; ALL.forEach(m => byId[m.id] = m);
  const KIND_NAMES = { concrete: 'Beton', steel: 'Stal konstrukcyjna', timber: 'Drewno', masonry: 'Mur', rebar: 'Stal zbrojeniowa' };

  // Materiał do statyki (MES): tylko pola potrzebne silnikowi
  function forFem(id) {
    const m = byId[id]; if (!m) return null;
    return { id: m.id, name: m.name, kind: m.kind, E: m.E, G: m.G || m.E / (2 * (1 + (m.nu || 0.2))), nu: m.nu, gamma: m.gamma, alpha: m.alpha };
  }

  return { concrete, rebar, steel, timber, masonry, ALL, byId, KIND_NAMES, forFem, steelFy, steelFu };
});
