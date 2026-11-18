// Quick add material (0.56.6, Ayden 2026-11-18): the material picks on the Settings tab (Cabinet materials, Drawer materials,
// Finish) end with "+ Add material…". It opens a small form, adds the sheet to Libraries › Materials, makes a cabinet or
// drawer material template or a finish named after it (the parts not ticked keep what the current pick uses), and picks
// that for the job or room the dropdown belongs to, the same way picking it by hand would. One Undo takes it all back.
'use strict';
const QM_V = '__qm-add';
const QM_SLOTS = {
  cabMatT: { what: 'cabinet material template', roles: [['carcass', 'Cabinet (sides, top, bottom)', 1], ['back', 'Back', 0], ['shelf', 'Shelves', 0], ['toeKick', 'Toe kick', 0]] },
  drawerMatT: { what: 'drawer material template', roles: [['sides', 'Sides, front, back', 1], ['bottom', 'Bottom', 0]] },
  finish: { what: 'finish', roles: [['front', 'Doors and drawer fronts', 1], ['panel', 'Door panels', 1], ['sheet', 'Finished panels and ends', 1], ['solid', 'Face frames', 0]] },
};
// The extra last option for a Settings material dropdown (none for other picks).
const qmOpt = k => QM_SLOTS[k] ? [{ v: QM_V, l: '+ Add material…', last: true }] : [];
// What the dropdown picks now: the template or finish, and the material its main part uses (the new one starts from it).
function qmBase(k, room) {
  const id = room ? roomSet(k, room) : S.job.defaults[k] || '';
  const t = k === 'cabMatT' ? cabMatT(id) : k === 'drawerMatT' ? drawerMatT(id) : finishList().find(f => f.id === id) || finishList()[0];
  return { t: t || {}, m: mat((t || {})[QM_SLOTS[k].roles[0][0]]) || S.materials.find(m => (m.kind || 'sheet') === 'sheet') || {} };
}
function openQuickMat(k, ref) {
  const room = ref.startsWith('rset:') ? roomById(ref.slice(5)) : null, b = qmBase(k, room), m = b.m;
  ui.qm = { k, ref, name: '', group: m.group || '', thick: m.thick || 0.75, sheetW: m.sheetW || 49, sheetL: m.sheetL || 97, grain: !!m.grain, cost: m.cost || 0, color: m.color || '#d8cfc0',
    roles: Object.fromEntries(QM_SLOTS[k].roles.map(([r, , on]) => [r, !!on])), from: b.t.name || '', fromMat: m.name || '', room: room ? room.name : '' };
  renderQuickMat();
  requestAnimationFrame(() => { const f = $('#qm-name'); if (f) f.focus(); });
}
function closeQuickMat() { ui.qm = null; renderQuickMat(); }
function renderQuickMat() {
  let el = $('#qmdlg');
  if (!el) { el = document.createElement('div'); el.id = 'qmdlg'; el.className = 'qe-back'; el.hidden = true; document.body.appendChild(el); }
  const q = ui.qm;
  if (!q) { el.hidden = true; el.innerHTML = ''; return; }
  const sl = QM_SLOTS[q.k], row = (l, inp) => `<label class="f"><span>${l}</span>${inp}</label>`;
  const txt = (id, v, x = '') => `<input type="text" id="${id}" value="${esc(v)}"${x}>`;
  const groups = [...new Set(S.materials.map(x => x.group).filter(Boolean))].sort();
  el.hidden = false;
  el.innerHTML = `<div class="qe qm-dlg" role="dialog" aria-modal="true" aria-labelledby="qm-title">
    <div class="qe-head"><b id="qm-title">${icon('plus')}Add material</b><span class="muted">${q.room ? esc(q.room) : 'Whole job'}</span><button class="btn sm qe-x" data-act="qm-close" aria-label="Close">${icon('close')}</button></div>
    <div class="qm-body">
      ${row('Name', txt('qm-name', q.name, ' placeholder="Like 3/4 Walnut ply" maxlength="60" autocomplete="off"'))}
      ${row('Group', txt('qm-group', q.group, ' placeholder="No group" list="qm-groups"'))}<datalist id="qm-groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="qm-grid">${row('Thickness', txt('qm-thick', fmtLen(q.thick), ' inputmode="decimal" class="num"'))}${row('Sheet width', txt('qm-sheetW', fmtLen(q.sheetW), ' inputmode="decimal" class="num"'))}${row('Sheet length', txt('qm-sheetL', fmtLen(q.sheetL), ' inputmode="decimal" class="num"'))}${row('Cost per sheet', txt('qm-cost', String(q.cost), ' inputmode="decimal" class="num"'))}</div>
      <div class="qm-grid">${row('Color', `<input type="color" id="qm-color" value="${esc(q.color)}">`)}<label class="f chk"><input type="checkbox" id="qm-grain"${q.grain ? ' checked' : ''}><span>Has grain</span></label></div>
      <div class="qm-use"><div class="eyebrow">Use it for</div>${sl.roles.map(([r, l]) => `<label class="chk"><input type="checkbox" data-qmrole="${r}"${q.roles[r] ? ' checked' : ''}>${l}</label>`).join('')}
        <div class="note show">Makes a new ${sl.what} named after it and picks it here. Parts left unticked keep what ${esc(q.from || 'the current pick')} uses. Sizes start from ${esc(q.fromMat || 'the current material')}.</div></div>
      ${q.err ? `<div class="warnbox">${esc(q.err)}</div>` : ''}
    </div>
    <div class="qe-foot"><button class="btn" data-act="qm-close">Cancel</button><button class="btn primary" data-act="qm-save">${icon('check')}Add and use</button></div></div>`;
}
// Keep what was typed when the form draws again (an error, a role ticked).
function qmRead() {
  const q = ui.qm, v = id => ($('#' + id) || {}).value || '';
  q.name = v('qm-name').trim(); q.group = v('qm-group').trim(); q.color = v('qm-color') || q.color; q.grain = !!($('#qm-grain') || {}).checked;
  const len = id => { const n = parseLen(v(id)); return isFinite(n) && n > 0 ? n : NaN; };
  q.thick = len('qm-thick'); q.sheetW = len('qm-sheetW'); q.sheetL = len('qm-sheetL');
  const c = parseFloat(v('qm-cost').replace(/[$,]/g, '')); q.cost = isFinite(c) && c >= 0 ? c : NaN;
  document.querySelectorAll('#qmdlg [data-qmrole]').forEach(x => { q.roles[x.dataset.qmrole] = x.checked; });
}
function saveQuickMat() {
  qmRead();
  const q = ui.qm, sl = QM_SLOTS[q.k], used = sl.roles.filter(([r]) => q.roles[r]).map(([r]) => r);
  const bad = !q.name ? 'Give the material a name.' : !(q.thick > 0) ? 'Type a thickness, like 3/4.' : !(q.sheetW > 0 && q.sheetL > 0) ? 'Type the sheet size, like 49 by 97.'
    : !(q.cost >= 0) ? 'Type a cost per sheet (0 is fine).' : !used.length ? 'Tick at least one part to use it for.' : '';
  if (bad) { q.err = bad; renderQuickMat(); return; }
  const room = q.ref.startsWith('rset:') ? roomById(q.ref.slice(5)) : null, base = qmBase(q.k, room).t;
  const m = { id: uid('m'), name: q.name, kind: 'sheet', group: q.group, thick: q.thick, sheetW: q.sheetW, sheetL: q.sheetL, grain: q.grain, cost: q.cost, color: q.color, texture: null, procedural: null, texScale: 24 };
  let n = 0, tid = '';
  mutate(() => {
    S.materials.push(m);
    const t = { ...clone(base), id: uid(q.k === 'cabMatT' ? 'mt' : q.k === 'drawerMatT' ? 'dt' : 'fin'), name: q.name };
    used.forEach(r => { t[r] = m.id; });
    (q.k === 'cabMatT' ? S.matTemplates.cabinet : q.k === 'drawerMatT' ? S.matTemplates.drawer : finishList()).push(t);
    tid = t.id;
    // Picked the same way the dropdown would: rooms and cabinets under it follow (setFollowDown, Settings rule 0.55.28).
    const o = resolve(q.ref); if (o) { o[q.k] = t.id; n = setFollowDown(q.k, room); }
  });
  ui.qm = null; renderQuickMat();
  flash(`Added ${q.name} to the materials and picked it for ${room ? room.name : 'the whole job'}${n ? `. ${n} room or cabinet pick${n === 1 ? '' : 's'} now follow it; Undo puts ${n === 1 ? 'it' : 'them'} back` : ''}.`);
  return tid;
}
// The dropdown option: open the form and put the dropdown back until the material is saved.
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('select[data-obj]') || el.value !== QM_V) return;
  e.stopImmediatePropagation();
  const ref = el.dataset.obj, k = el.dataset.field, o = resolve(ref);
  el.value = (o && o[k]) || ''; if (el.value === QM_V || el.selectedIndex < 0) el.selectedIndex = 0;
  openQuickMat(k, ref);
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="qm-"]');
  if (b) { e.preventDefault(); e.stopImmediatePropagation(); if (b.dataset.act === 'qm-save') saveQuickMat(); else closeQuickMat(); return; }
  if (e.target.id === 'qmdlg') closeQuickMat();
}, true);
document.addEventListener('keydown', e => {
  if (!ui.qm) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); closeQuickMat(); }
  else if (e.key === 'Enter' && e.target.closest && e.target.closest('#qmdlg') && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); e.stopImmediatePropagation(); saveQuickMat(); }
}, true);
