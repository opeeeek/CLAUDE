// Testy silnika MES – porównanie z rozwiązaniami analitycznymi.
// Uruchomienie: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const F = require('../app/statyka/fem.js');

const near = (a, b, rel, msg) => {
  const tol = Math.max(Math.abs(b) * (rel || 1e-6), 1e-9);
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (tol ${tol})`);
};

// Stal: E = 210 GPa;  przekrój „umowny”
const STEEL = { id: 'S', name: 'S235', E: 210, G: 81, gamma: 78.5, alpha: 1.2e-5 };
const SEC = { id: 'P', name: 'test', A: 5e-3, Iy: 8e-5, Iz: 2e-5, J: 1e-6, h: 0.3, b: 0.15 };
const EI = 210e6 * 8e-5;

function beam2D(L, nEl, sup, loads, extra) {
  const nodes = []; for (let i = 0; i <= nEl; i++) nodes.push({ id: i + 1, x: L * i / nEl, y: 0 });
  const members = []; for (let i = 0; i < nEl; i++) members.push({ id: i + 1, n1: i + 1, n2: i + 2, sec: 'P', mat: 'S' });
  return Object.assign({ dim: '2D', nodes, members, materials: [STEEL], sections: [SEC], supports: sup, cases: [{ id: 'G', type: 'G', name: 'G' }], loads }, extra || {});
}
const maxAbs = (st, k) => st.reduce((a, s) => Math.abs(s[k]) > Math.abs(a) ? s[k] : a, 0);

test('belka swobodnie podparta – obciążenie równomierne', () => {
  const L = 6, q = 10;
  const m = beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 0] }, { node: 2, fix: [0, 1, 0, 0, 0, 0] }],
    [{ case: 'G', type: 'dist', member: 1, dir: 'Y', q1: -q, q2: -q, a: 0, b: 1 }]);
  const r = F.analyzeLinear(m);
  assert.ok(r.ok, r.errors && r.errors.join());
  const c = r.cases.G, st = c.members[0].st;
  near(maxAbs(st, 'My'), q * L * L / 8, 1e-9, 'Mmax');
  near(st[0].Vz, q * L / 2, 1e-9, 'V(0)');
  near(c.reactions[0].R[1], q * L / 2, 1e-9, 'RA');
  const mid = st.find(s => Math.abs(s.x - L / 2) < 1e-9);
  near(mid.uz, -5 * q * L ** 4 / (384 * EI), 2e-3, 'ugięcie');
  assert.ok(mid.My > 0, 'moment przęsłowy dodatni (rozciąga spód)');
});

test('wspornik – siła skupiona na końcu', () => {
  const L = 3, P = 20;
  const m = beam2D(L, 3, [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }], [{ case: 'G', type: 'nodal', node: 4, F: [0, -P, 0, 0, 0, 0] }]);
  const r = F.analyzeLinear(m), c = r.cases.G;
  near(c.disp[3][1], -P * L ** 3 / (3 * EI), 1e-9, 'ugięcie końca');
  near(c.disp[3][5], -P * L ** 2 / (2 * EI), 1e-9, 'obrót końca');
  near(c.members[0].st[0].My, -P * L, 1e-9, 'moment utwierdzenia');
  near(c.reactions[0].R[5], P * L, 1e-9, 'moment reakcji');
});

test('belka obustronnie utwierdzona i przegub (zwolnienie)', () => {
  const L = 5, q = 12;
  const ld = [{ case: 'G', type: 'dist', member: 1, dir: 'Y', q1: -q, a: 0, b: 1 }];
  const ff = F.analyzeLinear(beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }, { node: 2, fix: [1, 1, 0, 0, 0, 1] }], ld));
  const st = ff.cases.G.members[0].st;
  near(st[0].My, -q * L * L / 12, 1e-9, 'moment podporowy');
  near(st.find(s => Math.abs(s.x - L / 2) < 1e-9).My, q * L * L / 24, 1e-9, 'moment przęsłowy');
  // utwierdzenie + przegub na końcu pręta = belka utwierdzona-przegubowa
  const m2 = beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }, { node: 2, fix: [1, 1, 0, 0, 0, 1] }], ld);
  m2.members[0].rel2 = [0, 0, 0, 0, 1, 1];
  const r2 = F.analyzeLinear(m2).cases.G.members[0].st;
  near(r2[0].My, -q * L * L / 8, 1e-9, 'moment utwierdzenia (przegub)');
  near(r2[r2.length - 1].My, 0, 1e-9, 'moment w przegubie');
});

test('siła skupiona w przęśle – skok siły poprzecznej', () => {
  const L = 4, P = 30;
  const m = beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 0] }, { node: 2, fix: [0, 1, 0, 0, 0, 0] }],
    [{ case: 'G', type: 'point', member: 1, dir: 'Y', P: -P, a: 0.25 }]);
  const st = F.analyzeLinear(m).cases.G.members[0].st;
  const at = st.filter(s => Math.abs(s.x - 1) < 1e-9);
  assert.strictEqual(at.length, 2);
  near(at[0].Vz, P * 0.75, 1e-9); near(at[1].Vz, -P * 0.25, 1e-9);
  near(at[0].My, P * 0.75 * 1, 1e-9, 'M pod siłą');
});

test('kratownica trójkątna – siły osiowe', () => {
  // pas dolny 4 m, wysokość 1,5 m, siła 10 kN w kalenicy
  const m = {
    dim: '2D', materials: [STEEL], sections: [SEC], cases: [{ id: 'G', type: 'G' }],
    nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }, { id: 3, x: 2, y: 1.5 }],
    members: [{ id: 1, n1: 1, n2: 2, sec: 'P', mat: 'S', type: 'truss' }, { id: 2, n1: 1, n2: 3, sec: 'P', mat: 'S', type: 'truss' }, { id: 3, n1: 3, n2: 2, sec: 'P', mat: 'S', type: 'truss' }],
    supports: [{ node: 1, fix: [1, 1, 0, 0, 0, 0] }, { node: 2, fix: [0, 1, 0, 0, 0, 0] }],
    loads: [{ case: 'G', type: 'nodal', node: 3, F: [0, -10, 0, 0, 0, 0] }]
  };
  const r = F.analyzeLinear(m); assert.ok(r.ok, r.errors && r.errors.join());
  const c = r.cases.G;
  // krzyżulec: N = −5/sin α, sin α = 1,5/2,5 → −8,333; pas dolny: +8,333·cos α = 6,667
  near(c.members[1].st[0].N, -5 / 0.6, 1e-9, 'krzyżulec');
  near(c.members[0].st[0].N, 5 / 0.6 * 0.8, 1e-9, 'pas dolny');
});

test('3D: wspornik – zginanie dwukierunkowe i skręcanie', () => {
  const L = 2;
  const m = {
    dim: '3D', materials: [STEEL], sections: [SEC], cases: [{ id: 'G', type: 'G' }],
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    members: [{ id: 1, n1: 1, n2: 2, sec: 'P', mat: 'S' }],
    supports: [{ node: 1, fix: [1, 1, 1, 1, 1, 1] }],
    loads: [{ case: 'G', type: 'nodal', node: 2, F: [0, 5, -10, 3, 0, 0] }]
  };
  const r = F.analyzeLinear(m); assert.ok(r.ok, r.errors && r.errors.join());
  const d = r.cases.G.disp[1];
  near(d[2], -10 * L ** 3 / (3 * 210e6 * 8e-5), 1e-9, 'uz (Iy)');
  near(d[1], 5 * L ** 3 / (3 * 210e6 * 2e-5), 1e-9, 'uy (Iz)');
  near(d[3], 3 * L / (81e6 * 1e-6), 1e-9, 'skręcenie');
  const s0 = r.cases.G.members[0].st[0];
  near(s0.My, -10 * L, 1e-9, 'My'); near(s0.T, 3, 1e-9, 'T');
});

test('rama 2D = ta sama rama w modelu 3D', () => {
  const nodes2 = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 }, { id: 3, x: 6, y: 4 }, { id: 4, x: 6, y: 0 }];
  const base = {
    materials: [STEEL], sections: [SEC], cases: [{ id: 'G', type: 'G' }],
    members: [{ id: 1, n1: 1, n2: 2, sec: 'P', mat: 'S' }, { id: 2, n1: 2, n2: 3, sec: 'P', mat: 'S' }, { id: 3, n1: 3, n2: 4, sec: 'P', mat: 'S' }],
    supports: [{ node: 1, fix: [1, 1, 1, 1, 1, 1] }, { node: 4, fix: [1, 1, 1, 1, 1, 1] }]
  };
  const m2 = Object.assign({ dim: '2D', nodes: nodes2, loads: [{ case: 'G', type: 'nodal', node: 2, F: [10, 0, 0, 0, 0, 0] }, { case: 'G', type: 'dist', member: 2, dir: 'Y', q1: -8 }] }, base);
  // w 3D płaszczyzna XZ; oś pionowa Z
  const m3 = Object.assign({ dim: '3D', nodes: nodes2.map(n => ({ id: n.id, x: n.x, y: 0, z: n.y })), loads: [{ case: 'G', type: 'nodal', node: 2, F: [10, 0, 0, 0, 0, 0] }, { case: 'G', type: 'dist', member: 2, dir: 'Z', q1: -8 }] }, base);
  const r2 = F.analyzeLinear(m2).cases.G, r3 = F.analyzeLinear(m3).cases.G;
  near(r3.disp[1][0], r2.disp[1][0], 1e-6, 'ux węzła 2');
  near(r3.reactions[0].R[2], r2.reactions[0].R[1], 1e-6, 'reakcja pionowa');
  near(Math.abs(r3.members[1].st[10].My), Math.abs(r2.members[1].st[10].My), 1e-6, 'moment w ryglu');
});

test('analiza II rzędu – wspornik ściskany z siłą poziomą', () => {
  const L = 4, P = 300, H = 5, n = 8;
  const nodes = []; for (let i = 0; i <= n; i++) nodes.push({ id: i + 1, x: 0, y: L * i / n });
  const members = []; for (let i = 0; i < n; i++) members.push({ id: i + 1, n1: i + 1, n2: i + 2, sec: 'P', mat: 'S' });
  const m = { dim: '2D', nodes, members, materials: [STEEL], sections: [SEC], cases: [{ id: 'G', type: 'G' }],
    supports: [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }], loads: [{ case: 'G', type: 'nodal', node: n + 1, F: [H, -P, 0, 0, 0, 0] }] };
  const r = F.analyzeSecondOrder(m, { G: 1 });
  assert.ok(r.ok && r.converged);
  const k = Math.sqrt(P / EI);
  const exact = H * (Math.tan(k * L) - k * L) / (P * k);
  near(r.disp[n][0], exact, 2e-3, 'ugięcie II rzędu');
  // moment u podstawy: H·L + P·δ
  near(-r.members[0].st[0].My, H * L + P * exact, 5e-3, 'moment II rzędu');
});

test('wyboczenie: pręt przegubowy i wspornik (Euler)', () => {
  const L = 5, n = 10;
  const mk = (sup) => { const nodes = []; for (let i = 0; i <= n; i++) nodes.push({ id: i + 1, x: 0, y: L * i / n }); const members = []; for (let i = 0; i < n; i++) members.push({ id: i + 1, n1: i + 1, n2: i + 2, sec: 'P', mat: 'S' });
    return { dim: '2D', nodes, members, materials: [STEEL], sections: [SEC], cases: [{ id: 'G', type: 'G' }], supports: sup, loads: [{ case: 'G', type: 'nodal', node: n + 1, F: [0, -1, 0, 0, 0, 0] }] }; };
  const pp = F.analyzeBuckling(mk([{ node: 1, fix: [1, 1, 0, 0, 0, 0] }, { node: n + 1, fix: [1, 0, 0, 0, 0, 0] }]), { G: 1 });
  near(pp.modes[0].alpha, Math.PI ** 2 * EI / L ** 2, 1e-4, 'Pcr przegubowy');
  const cant = F.analyzeBuckling(mk([{ node: 1, fix: [1, 1, 0, 0, 0, 1] }]), { G: 1 });
  near(cant.modes[0].alpha, Math.PI ** 2 * EI / (4 * L ** 2), 1e-4, 'Pcr wspornik');
  near(cant.lcr[0].Lcr_y, 2 * L, 1e-4, 'Lcr = 2L');
});

test('drgania własne belki swobodnie podpartej', () => {
  const L = 6, n = 12;
  const m = beam2D(L, n, [{ node: 1, fix: [1, 1, 0, 0, 0, 0] }, { node: n + 1, fix: [0, 1, 0, 0, 0, 0] }], []);
  const r = F.analyzeModal(m, { modes: 3 });
  assert.ok(r.ok, r.errors && r.errors.join());
  const mu = 78.5 * 5e-3 / 9.81;
  const f1 = Math.PI / (2 * L * L) * Math.sqrt(EI / mu);
  near(r.modes[0].f, f1, 1e-4, 'f1');
  near(r.modes[1].f, 4 * f1, 1e-3, 'f2');
});

test('temperatura i podpora sprężysta', () => {
  const L = 3;
  const m = beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }, { node: 2, fix: [1, 1, 0, 0, 0, 1] }], [{ case: 'G', type: 'temp', member: 1, dT: 20 }]);
  const st = F.analyzeLinear(m).cases.G.members[0].st;
  near(st[3].N, -210e6 * 1.2e-5 * 5e-3 * 20, 1e-9, 'N od temperatury');
  const k = 1000, P = 10;
  const s = beam2D(L, 1, [{ node: 1, fix: [1, 1, 0, 0, 0, 1] }, { node: 2, fix: [0, 0, 0, 0, 0, 0], k: [0, k, 0, 0, 0, 0] }], [{ case: 'G', type: 'nodal', node: 2, F: [0, -P, 0, 0, 0, 0] }]);
  const rs = F.analyzeLinear(s).cases.G;
  const kb = 3 * EI / L ** 3;
  near(rs.disp[1][1], -P / (k + kb), 1e-9, 'ugięcie na sprężynie');
  near(rs.reactions[1].R[1], P * k / (k + kb), 1e-9, 'reakcja sprężyny');
});

test('kombinacje PN-EN 1990 (6.10a/b) – obwiednia', () => {
  const cases = [{ id: 'G', type: 'G' }, { id: 'Q', type: 'Q', cat: 'B' }, { id: 'S', type: 'S' }, { id: 'W1', type: 'W', group: 'wiatr' }, { id: 'W2', type: 'W', group: 'wiatr' }];
  // G = 10, Q = 5 → max(1,35·10 + 1,5·0,7·5 ; 0,85·1,35·10 + 1,5·5)
  let e = F.envelopeScalar(cases, { G: 10, Q: 5 }, 'ULS');
  near(e.max, Math.max(13.5 + 5.25, 0.85 * 13.5 + 7.5), 1e-12);
  near(e.min, 10, 1e-12, 'G korzystne');
  // wiatr wykluczający: wybierany tylko jeden kierunek
  e = F.envelopeScalar(cases, { G: 10, W1: 4, W2: -6 }, 'ULS');
  near(e.max, Math.max(13.5 + 1.5 * 0.6 * 4, 0.85 * 13.5 + 1.5 * 4), 1e-12);
  near(e.min, 10 - 1.5 * 6, 1e-12);
  e = F.envelopeScalar(cases, { G: 10, Q: 5, S: 2 }, 'SLS_QP');
  near(e.max, 10 + 0.3 * 5, 1e-12);
  const list = F.explicitCombos(cases, 'ULS');
  assert.ok(list.length > 5 && list.every(c => !(c.factors.W1 && c.factors.W2)), 'wiatr nie występuje podwójnie');
});
