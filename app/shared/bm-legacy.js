/* =====================================================================
   BM-Win – nakładka dla wcześniejszych programów (BelkaŻB, ObciążeniaEC1).
   Podłącza ich wbudowane funkcje zapisu/odczytu do wspólnego mechanizmu
   BM-Win: w programie .exe – okna Windows (window.bmHost), w przeglądarce –
   pobieranie pliku i pamięć przeglądarki. Ładowana przed kodem programu.
   ===================================================================== */
(function () {
  'use strict';
  const H = () => window.bmHost || null;
  const enc = s => new TextEncoder().encode(String(s));
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = t => { const s = atob(t), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const FILTERS = { project: 'Projekt|*.belka;*.json', html: 'Strona HTML|*.html', dxf: 'Rysunek DXF|*.dxf', pdf: 'Dokument PDF|*.pdf', json: 'Plik JSON|*.json', csv: 'Plik CSV|*.csv' };
  function download(name, bytes, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return name;
  }
  async function save(name, bytes, kind, path) {
    const h = H();
    if (h) {
      if (path && h.writeFile) { await h.writeFile(path, b64(bytes)); return path; }
      return await h.saveFile(name, b64(bytes), FILTERS[kind] || '');
    }
    return download(name, bytes);
  }

  // ---- BelkaŻB: window.hostRequest(JSON) → window.__hostReply(id, wynik) – tylko w programie .exe
  if (H()) {
    window.hostRequest = async (json) => {
      const q = JSON.parse(json); let res;
      try {
        if (q.op === 'save') { const p = await save(q.name || 'plik', enc(q.content || ''), q.filter, q.path); res = p ? { ok: true, path: p } : { ok: false }; }
        else if (q.op === 'open') { const r = await H().openFile(q.filter === 'project' ? '.belka,.json' : ''); res = r ? { ok: true, path: r.path || r.name, content: new TextDecoder().decode(unb64(r.data)) } : { ok: false }; }
        else res = { ok: false, err: 'nieobsługiwana operacja ' + q.op };
      } catch (e) { res = { ok: false, err: String(e && e.message || e) }; }
      setTimeout(() => window.__hostReply && window.__hostReply(q.id, res), 0);
    };
  }

  // ---- ObciążeniaEC1: interfejs „desktop” (zapis plików, PDF, stan) – w .exe i w przeglądarce
  const KEY = 'bmwin:ec1:state:' + location.pathname;
  window.__EC1_DESKTOP = { version: 'BM-Win' };
  window.nativeSave = async (name, text, kind) => save(name, enc(text), kind);
  window.nativeSaveB64 = async (name, data, kind) => save(name, unb64(data), kind);
  window.nativeOpenPath = async (p) => { const h = H(); if (h && h.openPath) return h.openPath(p); };
  window.nativeSaveState = async (txt) => { try { localStorage.setItem(KEY, txt); } catch (e) { /* brak miejsca */ } };
  window.nativeLoadState = async () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  window.nativeTitle = async (t) => { document.title = (t ? t + ' – ' : '') + 'ObciążeniaEC1 · BM-Win'; };
})();
