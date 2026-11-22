/* =====================================================================
   BM-Win – eksport: DXF (AutoCAD R12, ASCII), ZIP (bez kompresji),
   ODT (OpenDocument Text) z raportu HTML.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------ DXF R12 */
  // Kolory ACI: 1 czerwony, 2 żółty, 3 zielony, 4 cyjan, 5 niebieski, 6 magenta, 7 biały/czarny, 8 szary
  class Dxf {
    constructor() { this.layers = new Map(); this.ents = []; }
    layer(name, color = 7, ltype = 'CONTINUOUS') { if (!this.layers.has(name)) this.layers.set(name, { color, ltype }); return this; }
    _n(v) { return (Math.round(v * 1e6) / 1e6).toString(); }
    line(x1, y1, x2, y2, layer = '0', z1 = 0, z2 = 0) { this.layer(layer); this.ents.push(['LINE', layer, [10, x1, 20, y1, 30, z1, 11, x2, 21, y2, 31, z2]]); return this; }
    circle(x, y, r, layer = '0') { this.layer(layer); this.ents.push(['CIRCLE', layer, [10, x, 20, y, 30, 0, 40, r]]); return this; }
    arc(x, y, r, a1, a2, layer = '0') { this.layer(layer); this.ents.push(['ARC', layer, [10, x, 20, y, 30, 0, 40, r, 50, a1, 51, a2]]); return this; }
    // align: 0 lewo, 1 środek, 2 prawo; valign: 0 linia bazowa, 1 dół, 2 środek, 3 góra
    text(x, y, hgt, str, layer = '0', rot = 0, align = 0, valign = 0) {
      this.layer(layer);
      const codes = [10, x, 20, y, 30, 0, 40, hgt, 1, String(str), 50, rot];
      if (align || valign) codes.push(72, align, 73, valign, 11, x, 21, y, 31, 0);
      this.ents.push(['TEXT', layer, codes]); return this;
    }
    poly(pts, layer = '0', closed = false) {
      this.layer(layer);
      this.ents.push(['POLYLINE', layer, [66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0], pts]);
      return this;
    }
    // polilinia 3D (np. widok przestrzenny)
    poly3d(pts, layer = '0') { this.layer(layer); this.ents.push(['POLYLINE', layer, [66, 1, 10, 0, 20, 0, 30, 0, 70, 8], pts, true]); return this; }
    toString() {
      const o = [];
      const p = (c, v) => { o.push(String(c)); o.push(typeof v === 'number' ? this._n(v) : String(v)); };
      p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC');
      p(0, 'SECTION'); p(2, 'TABLES');
      p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 2);
      p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0);
      p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0); p(3, '__ __ __'); p(72, 65); p(73, 2); p(40, 15); p(49, 10); p(49, -5);
      p(0, 'ENDTAB');
      p(0, 'TABLE'); p(2, 'LAYER'); p(70, this.layers.size + 1);
      p(0, 'LAYER'); p(2, '0'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS');
      for (const [n, l] of this.layers) { if (n === '0') continue; p(0, 'LAYER'); p(2, n); p(70, 0); p(62, l.color); p(6, l.ltype); }
      p(0, 'ENDTAB');
      p(0, 'TABLE'); p(2, 'STYLE'); p(70, 1); p(0, 'STYLE'); p(2, 'STANDARD'); p(70, 0); p(40, 0); p(41, 1); p(50, 0); p(71, 0); p(42, 2.5); p(3, 'txt'); p(4, ''); p(0, 'ENDTAB');
      p(0, 'ENDSEC');
      p(0, 'SECTION'); p(2, 'ENTITIES');
      for (const e of this.ents) {
        p(0, e[0]); p(8, e[1]);
        const c = e[2]; for (let i = 0; i < c.length; i += 2) p(c[i], c[i + 1]);
        if (e[0] === 'POLYLINE') {
          for (const pt of e[3]) { p(0, 'VERTEX'); p(8, e[1]); p(10, pt[0]); p(20, pt[1]); p(30, pt[2] || 0); if (e[4]) p(70, 32); }
          p(0, 'SEQEND'); p(8, e[1]);
        }
      }
      p(0, 'ENDSEC'); p(0, 'EOF');
      // DXF R12 – kodowanie ANSI; polskie znaki zamieniane na kody \U+xxxx rozumiane przez AutoCAD
      return o.join('\r\n').replace(/[^\x00-\x7f]/g, ch => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
    }
  }

  /* ------------------------------------------------------------ ZIP (STORE) */
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = s => new TextEncoder().encode(s);
  function zip(files) {   // files: [{name, data: Uint8Array|string}]
    const parts = [], cen = []; let off = 0;
    const dosT = 0, dosD = ((2026 - 1980) << 9) | (1 << 5) | 1;
    for (const f of files) {
      const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cenLen = cen.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cenLen, true); end.setUint32(16, off, true);
    const all = parts.concat(cen, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  /* ------------------------------------------------------------ ODT */
  const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:font-face-decls><style:font-face style:name="Arial" svg:font-family="Arial" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/></office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.12cm"/><style:text-properties style:font-name="Arial" fo:font-size="10pt" fo:language="pl" fo:country="PL"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph"/>
<style:style style:name="Heading_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="15pt" fo:font-weight="bold" fo:color="#0f3f86"/></style:style>
<style:style style:name="Heading_2" style:display-name="Heading 2" style:family="paragraph" style:default-outline-level="2"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="12.5pt" fo:font-weight="bold" fo:color="#0f3f86"/></style:style>
<style:style style:name="Heading_3" style:display-name="Heading 3" style:family="paragraph" style:default-outline-level="3"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.1cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Small" style:family="paragraph"><style:text-properties fo:font-size="8.5pt" fo:color="#4a5466"/></style:style>
<style:style style:name="Cell" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0cm"/><style:text-properties fo:font-size="9pt"/></style:style>
<style:style style:name="CellR" style:family="paragraph" style:parent-style-name="Cell"><style:paragraph-properties fo:text-align="end"/></style:style>
<style:style style:name="CellH" style:family="paragraph" style:parent-style-name="Cell"><style:text-properties fo:font-weight="bold"/></style:style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.5cm" fo:margin-bottom="1.5cm" fo:margin-left="2cm" fo:margin-right="1.5cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`;
  const AUTO = `<office:automatic-styles>
<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="SUB" style:family="text"><style:text-properties style:text-position="sub 58%"/></style:style>
<style:style style:name="SUP" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>
<style:style style:name="OK" style:family="text"><style:text-properties fo:color="#1d7f3c" fo:font-weight="bold"/></style:style>
<style:style style:name="FAIL" style:family="text"><style:text-properties fo:color="#c0262d" fo:font-weight="bold"/></style:style>
<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17.5cm" table:align="left" fo:margin-bottom="0.25cm"/></style:style>
<style:style style:name="TC" style:family="table-cell"><style:table-cell-properties fo:padding="0.05cm" fo:border="0.5pt solid #c8ced8"/></style:style>
<style:style style:name="TH" style:family="table-cell"><style:table-cell-properties fo:padding="0.05cm" fo:border="0.5pt solid #c8ced8" fo:background-color="#eef1f5"/></style:style>
<style:style style:name="Fr" style:family="graphic"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>
</office:automatic-styles>`;

  // Konwersja drzewa HTML (DOM) raportu do ODF. images: Map(element → {bytes,w,h}) dla <svg>/<img>
  function htmlToOdt(rootEl, images, meta) {
    const pics = [];
    let picN = 0;
    const inline = (node) => {
      let s = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { s += xesc(n.textContent.replace(/\s+/g, ' ')); return; }
        if (n.nodeType !== 1) return;
        const t = n.tagName.toLowerCase();
        if (n.classList && n.classList.contains('noodt')) return;
        if (t === 'br') { s += '<text:line-break/>'; return; }
        if (t === 'svg' || t === 'img') { s += frame(n); return; }
        const st = t === 'b' || t === 'strong' || t === 'th' ? 'B' : t === 'i' || t === 'em' ? 'I' : t === 'sub' ? 'SUB' : t === 'sup' ? 'SUP' : n.classList.contains('ok') ? 'OK' : n.classList.contains('fail') ? 'FAIL' : null;
        const inner = inline(n);
        s += st ? `<text:span text:style-name="${st}">${inner}</text:span>` : inner;
      });
      return s;
    };
    const frame = (n) => {
      const im = images && images.get(n); if (!im) return '';
      picN++; const fn = `Pictures/img${picN}.png`; pics.push({ name: fn, data: im.bytes });
      const maxW = 17; let w = im.w * 0.0265, hh = im.h * 0.0265; if (w > maxW) { hh *= maxW / w; w = maxW; }
      return `<draw:frame draw:style-name="Fr" text:anchor-type="as-char" svg:width="${w.toFixed(2)}cm" svg:height="${hh.toFixed(2)}cm" draw:z-index="0"><draw:image xlink:href="${fn}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    };
    const table = (tb) => {
      const rows = [...tb.querySelectorAll('tr')];
      const ncol = Math.max(1, ...rows.map(r => [...r.children].reduce((s, c) => s + (+c.getAttribute('colspan') || 1), 0)));
      let x = `<table:table table:style-name="Tbl"><table:table-column table:number-columns-repeated="${ncol}"/>`;
      rows.forEach(r => {
        x += '<table:table-row>';
        let used = 0;
        [...r.children].forEach(c => {
          const span = +c.getAttribute('colspan') || 1; used += span;
          const th = c.tagName === 'TH', right = c.classList.contains('n') || c.classList.contains('val') || /text-align:\s*right/.test(c.getAttribute('style') || '');
          x += `<table:table-cell table:style-name="${th ? 'TH' : 'TC'}"${span > 1 ? ` table:number-columns-spanned="${span}"` : ''} office:value-type="string"><text:p text:style-name="${th ? 'CellH' : right ? 'CellR' : 'Cell'}">${inline(c)}</text:p></table:table-cell>`;
          for (let k = 1; k < span; k++) x += '<table:covered-table-cell/>';
        });
        for (; used < ncol; used++) x += '<table:table-cell table:style-name="TC"><text:p text:style-name="Cell"/></table:table-cell>';
        x += '</table:table-row>';
      });
      return x + '</table:table>';
    };
    const block = (node) => {
      let s = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) s += `<text:p>${xesc(t)}</text:p>`; return; }
        if (n.nodeType !== 1) return;
        if (n.classList.contains('noodt') || n.classList.contains('noprint')) return;
        const t = n.tagName.toLowerCase();
        if (/^h[1-4]$/.test(t)) { const lv = Math.min(3, +t[1]); s += `<text:h text:style-name="Heading_${lv}" text:outline-level="${lv}">${inline(n)}</text:h>`; }
        else if (t === 'p' || t === 'li' || t === 'figcaption') s += `<text:p text:style-name="${n.classList.contains('small') || n.classList.contains('hint') ? 'Small' : 'Standard'}">${inline(n)}</text:p>`;
        else if (t === 'table') s += table(n);
        else if (t === 'svg' || t === 'img') s += `<text:p>${frame(n)}</text:p>`;
        else if (t === 'ul' || t === 'ol' || t === 'div' || t === 'section' || t === 'figure' || t === 'details') s += block(n);
        else s += `<text:p>${inline(n)}</text:p>`;
      });
      return s;
    };
    const body = block(rootEl);
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2">
${AUTO}<office:body><office:text>${body}</office:text></office:body></office:document-content>`;
    const metaX = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2"><office:meta><meta:generator>BM-Win</meta:generator><dc:title>${xesc((meta && meta.title) || 'Raport')}</dc:title><dc:creator>${xesc((meta && meta.author) || '')}</dc:creator></office:meta></office:document-meta>`;
    const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pics.map(p => `<manifest:file-entry manifest:full-path="${p.name}" manifest:media-type="image/png"/>`).join('')}</manifest:manifest>`;
    return zip([{ name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' }, { name: 'META-INF/manifest.xml', data: manifest }, { name: 'content.xml', data: content }, { name: 'styles.xml', data: STYLES }, { name: 'meta.xml', data: metaX }].concat(pics));
  }

  return { Dxf, zip, crc32, htmlToOdt };
});
