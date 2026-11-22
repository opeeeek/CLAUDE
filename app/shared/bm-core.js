/* =====================================================================
   BM-Win – wspólne narzędzia interfejsu
   formatowanie liczb (PL), tworzenie elementów, okna, komunikaty,
   zapis/odczyt plików (przeglądarka lub program .exe), cofanie zmian.
   ===================================================================== */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ liczby
  const fmt = (v, d = 2) => {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const r = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v;
    return r.toFixed(d).replace('-', '−').replace('.', ',');
  };
  // zaokrąglenie „inżynierskie” – liczba cyfr znaczących
  const fmtS = (v, sig = 4) => {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
    return fmt(v, Math.min(d, 6));
  };
  const num = (s, def = NaN) => {
    if (typeof s === 'number') return s;
    if (s === null || s === undefined) return def;
    const t = String(s).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
    if (t === '') return def;
    const v = Number(t);
    return isFinite(v) ? v : def;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------ DOM
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ------------------------------------------------------------ komunikaty
  let toastT = 0;
  function toast(msg, ms = 2600) {
    let t = $('#toast'); if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg; t.style.display = 'block'; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); t.style.display = 'none'; }, ms);
  }
  function modal(content, opts = {}) {
    let m = $('#modal'); if (!m) { m = h('div', { id: 'modal', role: 'dialog', 'aria-modal': 'true' }); document.body.append(m); }
    m.innerHTML = '';
    const dlg = h('div', { class: 'dlg ' + (opts.cls || '') });
    if (opts.title) dlg.append(h('h3', null, opts.title));
    dlg.append(content);
    const close = () => { m.style.display = 'none'; m.innerHTML = ''; document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    if (opts.buttons) {
      const bb = h('div', { class: 'dbtn' });
      opts.buttons.forEach(b => bb.append(h('button', { class: 'btn ' + (b.cls || ''), type: 'button', onclick: () => { const r = b.act ? b.act() : undefined; if (r !== false) close(); } }, b.label)));
      dlg.append(bb);
    }
    m.append(dlg); m.style.display = 'flex';
    m.onclick = e => { if (e.target === m) close(); };
    document.addEventListener('keydown', onKey);
    const f = dlg.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
    return { close, dlg };
  }
  const confirmDlg = (msg, title = 'Potwierdź') => new Promise(res => modal(h('p', null, msg), { cls: 'sm', title, buttons: [{ label: 'Anuluj', act: () => res(false) }, { label: 'OK', cls: 'pri', act: () => res(true) }], onClose: () => res(false) }));

  // ------------------------------------------------------------ pliki
  // W programie .exe dostępne są funkcje okna Windows (window.bmHost);
  // w przeglądarce – pobieranie pliku i <input type=file>.
  const host = () => (typeof window !== 'undefined' && window.bmHost) ? window.bmHost : null;
  const b64FromBytes = bytes => { let s = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); };
  const bytesFromB64 = b64 => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const toBytes = data => data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));

  async function saveFile(name, data, mime = 'application/octet-stream', filter) {
    const bytes = toBytes(data);
    const H = host();
    if (H && H.saveFile) {
      const r = await H.saveFile(name, b64FromBytes(bytes), filter || '');
      return r || null;   // ścieżka lub null (anulowano)
    }
    const blob = new Blob([bytes], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return name;
  }
  function openFile(accept) {
    const H = host();
    if (H && H.openFile) return H.openFile(accept || '').then(r => r ? { name: r.name, path: r.path, bytes: bytesFromB64(r.data), text: new TextDecoder().decode(bytesFromB64(r.data)) } : null);
    return new Promise(res => {
      const inp = h('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
      inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => { const bytes = new Uint8Array(rd.result); res({ name: f.name, bytes, text: new TextDecoder().decode(bytes) }); }; rd.readAsArrayBuffer(f); };
      document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
    });
  }

  // ------------------------------------------------------------ pamięć lokalna
  const store = {
    get(k, def) { try { const v = localStorage.getItem('bmwin:' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('bmwin:' + k, JSON.stringify(v)); } catch (e) { /* brak miejsca lub tryb prywatny */ } },
  };

  // ------------------------------------------------------------ cofanie zmian
  class History {
    constructor(limit = 80) { this.st = []; this.pos = -1; this.limit = limit; }
    push(state) { const s = JSON.stringify(state); if (this.st[this.pos] === s) return; this.st = this.st.slice(0, this.pos + 1); this.st.push(s); if (this.st.length > this.limit) this.st.shift(); this.pos = this.st.length - 1; }
    undo() { if (this.pos > 0) { this.pos--; return JSON.parse(this.st[this.pos]); } return null; }
    redo() { if (this.pos < this.st.length - 1) { this.pos++; return JSON.parse(this.st[this.pos]); } return null; }
  }

  // ------------------------------------------------------------ SVG → PNG (do raportów ODT)
  function svgToPng(svgText, scale = 2) {
    return new Promise((res, rej) => {
      const m = svgText.match(/viewBox="([\d.\-\s]+)"/), wv = svgText.match(/width="([\d.]+)"/), hv = svgText.match(/height="([\d.]+)"/);
      let w = wv ? +wv[1] : 800, hh = hv ? +hv[1] : 500;
      if (m && (!wv || !hv)) { const v = m[1].trim().split(/\s+/).map(Number); w = v[2]; hh = v[3]; }
      // zmienne CSS nie działają w obrazie – zamiana na wartości bieżące
      const cs = getComputedStyle(document.documentElement);
      const txt = svgText.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, n, d) => (cs.getPropertyValue(n).trim() || d || '#000'));
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(hh * scale); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => b.arrayBuffer().then(ab => res({ bytes: new Uint8Array(ab), w, h: hh })), 'image/png'); };
      img.onerror = rej;
      const src = txt.includes('xmlns=') ? txt : txt.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    });
  }

  const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

  root.BM = { fmt, fmtS, num, esc, h, $, $$, toast, modal, confirmDlg, saveFile, openFile, store, History, svgToPng, today, b64FromBytes, bytesFromB64, host };
})(typeof self !== 'undefined' ? self : this);
