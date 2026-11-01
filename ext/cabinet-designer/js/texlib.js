/* ---------- Texture library: the shop's photos in textures/, picked by category ---------- */
// textures/index.json lists every photo: p path, c category, s subfolder, n name, col average color.
let TEXLIB = null, texLibLoading = null;
function loadTexLib() {
  return texLibLoading || (texLibLoading = fetch('textures/index.json').then(r => (r.ok ? r.json() : [])).catch(() => []).then(l => (TEXLIB = Array.isArray(l) ? l : [])));
}
const TEX_CATS = [['Wood', 'Wood'], ['Paint', 'Paint and colors'], ['Tops', 'Countertops'], ['Backsplash', 'Backsplash']];
const TEX_SHOW = 240;
// A library path to a URL the page can load; names keep their spaces on disk.
const texLibURL = p => 'textures/' + p.split('/').map(encodeURIComponent).join('/');
const isLibTex = t => typeof t === 'string' && t.startsWith('textures/');
function texGuessCat(m) {
  if (!m) return 'Wood';
  const n = (m.name || '').toLowerCase();
  if (m.kind === 'top') return 'Tops';
  if (m.procedural || /oak|maple|birch|walnut|cherry|alder|hickory|\bash\b|ply|veneer|wood/.test(n)) return 'Wood';
  return /paint|mdf|melamine|white|black|grey|gray/.test(n) ? 'Paint' : 'Wood';
}
function texMatches(t, tp) {
  if (tp.q) { const q = tp.q.toLowerCase(); return (t.n + ' ' + t.s + ' ' + t.c).toLowerCase().includes(q); }
  return t.c === tp.cat && (!tp.sub || t.s === tp.sub);
}
function openTexPick(matId) {
  const m = matId ? mat(matId) : null;
  const cur = m && isLibTex(m.texture) ? (TEXLIB || []).find(t => 'textures/' + t.p === m.texture) : null;
  ui.texPick = { mat: matId || null, cat: cur ? cur.c : texGuessCat(m), sub: cur ? cur.s : '', q: '' };
  renderTexPick();
}
function closeTexPick() { ui.texPick = null; renderTexPick(); }
function renderTexPick() {
  const el = $('#texpick'); if (!el) return;
  const tp = ui.texPick;
  if (!tp) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  if (!TEXLIB) { el.innerHTML = `<div class="qe texlib" role="dialog" aria-modal="true"><div class="qe-head"><b>Texture library</b></div><div class="tx-empty muted">Loading textures…</div></div>`; loadTexLib().then(renderTexPick); return; }
  const m = tp.mat ? mat(tp.mat) : null;
  const subs = [...new Set(TEXLIB.filter(t => t.c === tp.cat).map(t => t.s).filter(Boolean))].sort();
  const hits = TEXLIB.map((t, i) => [t, i]).filter(([t]) => texMatches(t, tp));
  const cur = m && m.texture;
  const tiles = hits.slice(0, TEX_SHOW).map(([t, i]) => `<button class="tx-tile${cur === 'textures/' + t.p ? ' on' : ''}" data-act="tex-pick" data-id="${i}" title="${esc(t.n)}${t.s ? ' · ' + esc(t.s) : ''}">
      <span class="tx-img" style="background-color:${esc(t.col || '#ccc')}"><img loading="lazy" decoding="async" alt="" src="${texLibURL(t.p)}"></span><span class="tx-name">${esc(t.n)}</span></button>`).join('');
  const keep = el.querySelector('.tx-grid'), top = keep ? keep.scrollTop : 0;
  const focusQ = document.activeElement && document.activeElement.id === 'texq';
  el.innerHTML = `<div class="qe texlib" role="dialog" aria-modal="true" aria-labelledby="tx-title">
    <div class="qe-head"><b id="tx-title">Texture library</b><span class="muted">${m ? 'for ' + esc(m.name) : 'pick one to add a new material'}</span>
      <button class="btn sm qe-x" data-act="tex-close" aria-label="Close the texture library">${icon('close')}</button></div>
    <div class="tx-bar">
      <div class="seg" role="group" aria-label="Texture category">${TEX_CATS.map(([k, l]) => `<button data-act="tex-cat" data-id="${k}" aria-pressed="${!tp.q && tp.cat === k}">${l}<span class="tx-n">${TEXLIB.filter(t => t.c === k).length}</span></button>`).join('')}</div>
      <input id="texq" type="search" placeholder="Find a texture" value="${esc(tp.q)}" aria-label="Find a texture">
    </div>
    ${subs.length && !tp.q ? `<div class="tx-subs"><button data-act="tex-sub" data-id="" aria-pressed="${!tp.sub}">All</button>${subs.map(s => `<button data-act="tex-sub" data-id="${esc(s)}" aria-pressed="${tp.sub === s}">${esc(s)}</button>`).join('')}</div>` : ''}
    <div class="tx-grid">${tiles || '<div class="tx-empty muted">No textures match.</div>'}</div>
    <div class="qe-foot"><span class="note">${hits.length > TEX_SHOW ? `Showing ${TEX_SHOW} of ${hits.length}. Search or pick a folder to narrow it.` : `${hits.length} texture${hits.length === 1 ? '' : 's'}`}</span>
      ${m && m.texture ? `<button class="btn" data-act="tex-clear" data-id="${m.id}">Remove texture</button>` : ''}<button class="btn primary" data-act="tex-close">Done</button></div></div>`;
  const g = el.querySelector('.tx-grid'); if (g) g.scrollTop = top;
  if (focusQ) { const q = $('#texq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
// Apply a library photo to the material, or make a new material from it.
function pickTexture(i) {
  const t = TEXLIB && TEXLIB[i], tp = ui.texPick; if (!t || !tp) return;
  const path = 'textures/' + t.p;
  if (tp.mat) {
    mutate(() => { const m = mat(tp.mat); m.texture = path; if (t.col) m.color = t.col; if (typeof GRAIN_CATS !== 'undefined' && m.kind !== 'top') m.grain = GRAIN_CATS.includes(t.c); if (t.c === 'Tops' && (m.texScale || 24) < 36) m.texScale = 48; });
    renderTexPick(); return;
  }
  const top = t.c === 'Tops', wood = t.c === 'Wood';
  const m = { id: uid('m'), name: t.n, kind: top ? 'top' : 'sheet', thick: top ? 1.1875 : 0.75, sheetW: top ? 63 : 49, sheetL: top ? 120 : 97, grain: wood, cost: 0, color: t.col || '#d8cfc0', texture: path, procedural: null, texScale: top ? 48 : 24 };
  mutate(() => S.materials.push(m));
  closeTexPick(); flash(`Added ${t.n} to the material library`);
}
document.addEventListener('input', e => {
  if (e.target.id !== 'texq' || !ui.texPick) return;
  ui.texPick.q = e.target.value.trim(); renderTexPick();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.texPick) { e.stopImmediatePropagation(); closeTexPick(); } }, true);
document.addEventListener('click', e => { if (e.target.id === 'texpick') closeTexPick(); });
