/* ---------- Drawer wood (0.63.47, Ayden 2026-11-25): pick the wood for Solid wood drawer boxes without making a template ----------
   The Drawer wood tile (Settings › Drawers, shown when Drawer materials is a solid wood template) and the cabinet's Drawer
   wood box list the common species and any solid wood already in Libraries › Materials. Picking a species the job does not
   have yet adds it once (at the template's thickness, with its wood photo). "+ Other wood…" types in any wood. The pick
   follows down like the other Settings picks, and a Look pick on drawer boxes at that level is cleared so the new wood shows
   (the Look button can still change the texture only). The material core is in core.js (WOOD_SPECIES, woodMatFor, cabDrawerMatT). */
'use strict';
const WOOD_OTHER = '__wood-other';
// The thickness solid wood sides are made at for a template (its woodT, else the thickness of what it cuts the sides from).
const woodThick = t => +(t && t.woodT) > 0 ? +t.woodT : (mat(t && t.sides) || {}).thick || 0.625;
// The template a Drawer wood dropdown belongs to: a cabinet's, a room's or the job's.
function woodRefTpl(ref) {
  if (ref.startsWith('cab:')) { const c = cab(ref.slice(4)); return drawerMatT(cabSet(c, 'drawerMatT')); }
  if (ref.startsWith('rset:')) return drawerMatT(roomSet('drawerMatT', roomById(ref.slice(5))));
  return drawerMatT(S.job.defaults.drawerMatT);
}
// One option per species: the job's material when it has that wood at this thickness, else 'wood:<name>' (added when picked).
// Solid wood the shop added by hand (no species) is listed by its own name. Sorted A to Z.
function woodOpts(thick, cur) {
  const t = +thick || woodThick(drawerMatT(S.job.defaults.drawerMatT)), seen = new Set(), out = [];
  const own = S.materials.filter(m => m.wood || m.kind === 'solid');
  const names = [...WOOD_SPECIES.map(x => x.n), ...own.filter(m => m.wood).map(m => m.wood)];
  names.forEach(n => { const k = n.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    const m = own.find(x => (x.wood || '').toLowerCase() === k && Math.abs(+x.thick - t) < 0.02);
    out.push({ v: m ? m.id : 'wood:' + n, l: n }); });
  own.filter(m => !m.wood).forEach(m => out.push({ v: m.id, l: m.name }));
  // The current pick stays in the list even at another thickness.
  if (cur && !out.some(o => o.v === cur)) { const m = mat(cur); if (m) out.push({ v: cur, l: m.wood ? `${m.wood} ${fmtThick(m.thick)}` : m.name }); }
  out.sort((a, b) => a.l.localeCompare(b.l));
  return out;
}
const woodOtherOpt = () => [{ v: WOOD_OTHER, l: '+ Other wood…' }];
// What the tile and cabinet box show for the template's own wood (blank pick).
const woodTplName = t => { const m = mat(t && t.sides); return m ? (m.wood || m.name) : 'none'; };

// Sets the pick on the job, a room or a cabinet, the same way the Settings rule does (0.55.28), and lets the new wood show.
function setDrawerWood(ref, v, own) {
  const o = resolve(ref); if (!o) return;
  const t = woodRefTpl(ref), room = ref.startsWith('rset:') ? roomById(ref.slice(5)) : null, isCab = ref.startsWith('cab:');
  let n = 0, looks = 0, name = '';
  mutate(() => {
    let id = v;
    if (v && v.startsWith('wood:')) id = woodMatFor(S, v.slice(5), woodThick(t));
    else if (own) id = woodMatFor(S, own.name, own.thick, own);
    o.drawerWood = id || '';
    if (!isCab) n = setFollowDown('drawerWood', room);
    // A look pick on the drawer boxes at this level (and under it) would hide the new wood.
    const holder = isCab ? o : room || S.job;
    if (holder.tex && holder.tex.drawerBox) { delete holder.tex.drawerBox; if (!Object.keys(holder.tex).length) delete holder.tex; looks++; }
    if (!isCab && typeof texClearBelow === 'function') { const had = (room ? [room] : S.rooms).reduce((a, r) => a + (r.cabinets || []).filter(c => c.tex && c.tex.drawerBox).length + (!room && r.tex && r.tex.drawerBox ? 1 : 0), 0); texClearBelow(room ? 'room' : 'job', holder, ['drawerBox']); looks += had; }
    const m = mat(id); name = m ? (m.wood || m.name) : woodTplName(t);
  });
  flash(`Drawer boxes in ${name} for ${isCab ? 'this cabinet' : room ? room.name : 'the whole job'}${n ? `. ${n} room or cabinet pick${n === 1 ? '' : 's'} now follow it` : ''}${looks ? '. The drawer box look now comes from the wood' : ''}. Undo puts it back.`);
}
// The dropdowns: every Drawer wood change goes through setDrawerWood (adds a species when needed).
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('select[data-obj][data-field="drawerWood"]')) return;
  e.stopImmediatePropagation();
  const ref = el.dataset.obj;
  if (el.value === WOOD_OTHER) { const o = resolve(ref); el.value = (o && o.drawerWood) || ''; if (el.selectedIndex < 0) el.selectedIndex = 0; openWoodOther(ref); return; }
  setDrawerWood(ref, el.value);
}, true);

/* ----- + Other wood…: any wood by name, with its thickness and cost per board foot ----- */
function woodTexGuess(name) {
  const k = String(name || '').toLowerCase(), sp = WOOD_SPECIES.find(x => k.includes(x.n.toLowerCase()) || x.n.toLowerCase().includes(k));
  if (sp) return { tex: 'textures/' + sp.tex, col: sp.col };
  const words = k.split(/[^a-z]+/).filter(w => w.length > 2 && !/wood|solid|rift|plain|sawn|quarter/.test(w));
  const hit = (TEXLIB || []).find(t => !t.h && t.c === 'Wood' && words.some(w => (t.n + ' ' + t.s).toLowerCase().includes(w)));
  return hit ? { tex: 'textures/' + hit.p, col: hit.col } : { tex: null, col: '#c9a77a' };
}
function openWoodOther(ref) {
  if (typeof loadTexLib === 'function') loadTexLib();
  ui.woodDlg = { ref, name: '', thick: woodThick(woodRefTpl(ref)), bf: 8, err: '' };
  renderWoodOther();
  requestAnimationFrame(() => { const f = $('#wd-name'); if (f) f.focus(); });
}
function closeWoodOther() { ui.woodDlg = null; renderWoodOther(); }
function renderWoodOther() {
  let el = $('#wooddlg');
  if (!el) { el = document.createElement('div'); el.id = 'wooddlg'; el.className = 'qe-back'; el.hidden = true; document.body.appendChild(el); }
  const q = ui.woodDlg;
  if (!q) { el.hidden = true; el.innerHTML = ''; return; }
  const row = (l, inp) => `<label class="f"><span>${l}</span>${inp}</label>`;
  el.hidden = false;
  el.innerHTML = `<div class="qe qm-dlg" role="dialog" aria-modal="true" aria-labelledby="wd-title">
    <div class="qe-head"><b id="wd-title">${icon('plus')}Other wood</b><button class="btn sm qe-x" data-act="wd-close" aria-label="Close">${icon('close')}</button></div>
    <div class="qm-body">
      ${row('Wood', `<input type="text" id="wd-name" value="${esc(q.name)}" placeholder="Like Quartersawn white oak" maxlength="50" autocomplete="off">`)}
      <div class="qm-grid">${row('Thickness', `<input type="text" id="wd-thick" value="${esc(fmtThick(q.thick))}" inputmode="decimal" class="num">`)}${row('Cost per board foot', `<input type="text" id="wd-bf" value="${esc(String(q.bf))}" inputmode="decimal" class="num">`)}</div>
      <div class="note show">Adds it to Libraries › Materials (Solid wood) and makes the drawer boxes from it. The wood photo is guessed from the name; the Look button changes it.</div>
      ${q.err ? `<div class="warnbox">${esc(q.err)}</div>` : ''}
    </div>
    <div class="qe-foot"><button class="btn" data-act="wd-close">Cancel</button><button class="btn primary" data-act="wd-save">${icon('check')}Use this wood</button></div></div>`;
}
function saveWoodOther() {
  const q = ui.woodDlg, v = id => ($('#' + id) || {}).value || '';
  q.name = v('wd-name').trim(); const th = parseLen(v('wd-thick')), bf = parseFloat(v('wd-bf').replace(/[$,]/g, ''));
  q.thick = isFinite(th) && th > 0 ? th : NaN; q.bf = isFinite(bf) && bf >= 0 ? bf : NaN;
  const bad = !q.name ? 'Type the wood, like Walnut.' : !(q.thick > 0 && q.thick < 2) ? 'Type a thickness, like 5/8.' : !(q.bf >= 0) ? 'Type a cost per board foot (0 is fine).' : '';
  if (bad) { q.err = bad; renderWoodOther(); return; }
  const g = woodTexGuess(q.name), ref = q.ref;
  ui.woodDlg = null; renderWoodOther();
  setDrawerWood(ref, '', { name: q.name, thick: q.thick, bf: q.bf, tex: g.tex, col: g.col });
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="wd-"]');
  if (b) { e.preventDefault(); e.stopImmediatePropagation(); if (b.dataset.act === 'wd-save') saveWoodOther(); else closeWoodOther(); return; }
  if (e.target.id === 'wooddlg') closeWoodOther();
}, true);
document.addEventListener('keydown', e => {
  if (!ui.woodDlg) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); closeWoodOther(); }
  else if (e.key === 'Enter' && e.target.closest && e.target.closest('#wooddlg') && e.target.tagName === 'INPUT') { e.preventDefault(); e.stopImmediatePropagation(); saveWoodOther(); }
}, true);
