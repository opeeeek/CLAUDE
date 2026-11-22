// Testy biblioteki przekrojów i materiałów – zgodność z katalogami producentów
const test = require('node:test');
const assert = require('node:assert');
const S = require('../app/shared/bm-sections.js');
const M = require('../app/shared/bm-materials.js');

// [profil, {wielkość: wartość katalogowa [cm², cm⁴, cm³]}, dopuszczalna odchyłka]
const REF = [
  ['IPE 300', { A: 53.8, Iy: 8356, Iz: 603.8, Wply: 628.4, Wplz: 125.2, Avz: 25.68 }, 0.005],
  ['HEB 200', { A: 78.1, Iy: 5696, Iz: 2003, Wply: 642.5, Wplz: 305.8, Avz: 24.83 }, 0.005],
  ['HEA 400', { A: 159, Iy: 45070, Iz: 8564, Wply: 2562 }, 0.005],
  ['UPN 200', { A: 32.2, Iy: 1910, Iz: 148, Wply: 228 }, 0.015],
  ['IPN 300', { A: 69.0, Iy: 9800, Iz: 451, Wply: 762 }, 0.015],
  ['RP 200×100×8', { A: 44.8, Iy: 2234, Iz: 739, Wply: 282 }, 0.01],
  ['RO 168.3×8', { A: 40.3, Iy: 1297 }, 0.005],
];
const UNIT = { A: 100, Iy: 1e4, Iz: 1e4, Wply: 1e3, Wplz: 1e3, Avz: 100 };

for (const [key, ref, tol] of REF) {
  test(`charakterystyki ${key}`, () => {
    const p = S.compute({ shape: 'cat', key });
    assert.ok(p, 'brak profilu');
    for (const [q, v] of Object.entries(ref)) {
      const c = p[q] / UNIT[q];
      assert.ok(Math.abs(c / v - 1) <= tol, `${key} ${q}: ${c.toFixed(2)} vs katalog ${v}`);
    }
  });
}

test('przekroje proste i do MES', () => {
  const r = S.compute({ shape: 'rect', b: 300, h: 600 });
  assert.strictEqual(r.A, 180000); assert.strictEqual(r.Iy, 300 * 600 ** 3 / 12);
  const f = S.forFem({ shape: 'rect', b: 300, h: 600 });
  assert.ok(Math.abs(f.Iy - 5.4e-3) < 1e-12 && Math.abs(f.A - 0.18) < 1e-12);
  assert.ok(S.catalogList().length > 150);
});

test('baza materiałów', () => {
  assert.strictEqual(M.byId['C30/37'].fck, 30);
  assert.strictEqual(M.byId['S355'].fy, 355);
  assert.strictEqual(M.steelFy(M.byId['S355'], 50), 335);
  assert.strictEqual(M.byId['C24'].fmk, 24);
  assert.strictEqual(M.byId['GL24h'].E, 11.5);
  assert.ok(M.forFem('C24').E === 11);
});
