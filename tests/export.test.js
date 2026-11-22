// Testy eksportu: DXF i archiwum ZIP (podstawa ODT)
const test = require('node:test');
const assert = require('node:assert');
const X = require('../app/shared/bm-export.js');

test('DXF R12 – struktura i polskie znaki', () => {
  const d = new X.Dxf();
  d.line(0, 0, 5, 0, 'PRETY').text(1, 1, 0.2, 'Żółć', 'OPISY').poly([[0, 0], [1, 1], [2, 0]], 'WYKRES');
  const s = d.toString();
  assert.ok(s.startsWith('0\r\nSECTION'));
  assert.ok(s.trimEnd().endsWith('EOF'));
  assert.ok(s.includes('\\U+017B'), 'Ż zakodowane jako \\U+017B');
  assert.ok(/^[\x00-\x7f]*$/.test(s), 'tylko ASCII');
  assert.strictEqual((s.match(/\r\n0\r\nLAYER\r\n/g) || []).length, 4);   // warstwa 0 + 3 warstwy
});

test('ZIP – sumy kontrolne i katalog centralny', () => {
  assert.strictEqual(X.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = X.zip([{ name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' }, { name: 'a/b.txt', data: 'zażółć' }]);
  const dv = new DataView(z.buffer);
  assert.strictEqual(dv.getUint32(0, true), 0x04034b50);
  assert.strictEqual(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.strictEqual(dv.getUint16(z.length - 12, true), 2);
  // pierwszy plik nieskompresowany, nazwa „mimetype” zaraz po nagłówku (wymóg ODF)
  assert.strictEqual(new TextDecoder().decode(z.subarray(30, 38)), 'mimetype');
});
