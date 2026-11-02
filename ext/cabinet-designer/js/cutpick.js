/* What to cut: check the cabinets (and each cabinet's box, fillers and end panels) and shapes to cut.
   The pick drives the Cutlist tab: the parts table, labels, Multi print and the CNC parts file.
   ui.cutPick is null for everything, else { key: true }. Keys: a cabinet id (its box, inside and fronts' parts),
   id + '|fill' (its fillers), id + '|panel' (its applied end panels), or a shape id. */
const cutPartKey = p => p.kind === 'filler' ? p.cabId + '|fill' : p.kind === 'applied' ? p.cabId + '|panel' : p.cabId;
const cutKeep = key => !ui.cutPick || !!ui.cutPick[key];

// The things that can be cut, room by room.
function cutItems(rooms) {
  return rooms.map(rm => withRoom(rm, () => ({
    room: rm,
    items: [
      ...S.cabinets.filter(c => !c.noCut).map(c => {
        const kinds = new Set(buildParts(c).parts.map(p => p.kind));
        const subs = [kinds.has('filler') && { key: c.id + '|fill', label: 'Fillers' }, kinds.has('applied') && { key: c.id + '|panel', label: 'End panels' }].filter(Boolean);
        return { key: c.id, label: `${LBL[c.id] || ''} · ${c.name}`, subs: subs.length ? [{ key: c.id, label: 'Cabinet' }, ...subs] : [] };
      }),
      ...S.shapes.map(s => ({ key: s.id, label: `Shape · ${s.name || 'Shape'}`, subs: [] })),
    ],
  })));
}
const cutItemKeys = it => it.subs.length ? it.subs.map(s => s.key) : [it.key];
const cutAllKeys = () => cutItems(S.rooms).flatMap(g => g.items.flatMap(cutItemKeys));

// Turn keys on or off. Starting from "everything" picks every key first; back to everything when all are on.
function cutSet(keys, on) {
  const all = cutAllKeys(), pick = ui.cutPick ? { ...ui.cutPick } : Object.fromEntries(all.map(k => [k, true]));
  keys.forEach(k => { if (on) pick[k] = true; else delete pick[k]; });
  ui.cutPick = all.every(k => pick[k]) ? null : pick;
  ui.partSel = null;
}
// Only these cabinets (whole cabinet: box, fillers and end panels), from the drawing.
function cutPickOnly(ids) {
  ui.cutPick = {};
  ids.forEach(id => { ui.cutPick[id] = true; ui.cutPick[id + '|fill'] = true; ui.cutPick[id + '|panel'] = true; });
  if (ui.cutRoom !== 'all' && !ids.every(id => (roomById(ui.cutRoom) || { cabinets: [] }).cabinets.some(c => c.id === id))) ui.cutRoom = 'all';
  ui.partSel = null; ui.cutPickOpen = false;
  goTab('cutlist');
  flash(ids.length === 1 ? 'Cutting just this cabinet' : `Cutting just these ${ids.length} cabinets`);
}
// The one cabinet picked, when just one is (for Shop view).
function cutOneCab() {
  if (!ui.cutPick) return '';
  const ids = [...new Set(Object.keys(ui.cutPick).map(k => k.split('|')[0]))];
  return ids.length === 1 && cab(ids[0]) ? ids[0] : '';
}
// Button text: Everything, or how many items are picked in the rooms shown.
function cutPickText(rooms) {
  if (!ui.cutPick) return 'Everything';
  const items = cutItems(rooms).flatMap(g => g.items), n = items.filter(it => cutItemKeys(it).some(k => ui.cutPick[k])).length;
  return n ? `${n} of ${items.length} picked` : 'Nothing picked';
}
function cutPickCard(rooms) {
  if (!ui.cutPickOpen) return '';
  const groups = cutItems(rooms), multi = groups.length > 1;
  const box = (key, label, on, cls = '', mixed = false) => `<label class="cp-chk ${cls}"><input type="checkbox" class="cut-pk" data-k="${esc(key)}"${on ? ' checked' : ''}${mixed ? ' data-mixed="1"' : ''}><span>${esc(label)}</span></label>`;
  const row = it => {
    const ks = cutItemKeys(it), on = ks.filter(cutKeep).length;
    return `<div class="cp-row">${box(ks.join(','), it.label, on === ks.length, 'cp-main', on > 0 && on < ks.length)}${it.subs.length ? `<span class="cp-subs">${it.subs.map(s => box(s.key, s.label, cutKeep(s.key), 'cp-sub')).join('')}</span>` : ''}</div>`;
  };
  return `<div class="card cardbody cutpick"><div class="pshead"><h3>${icon('check')}What to cut</h3><span class="note">Only what is checked shows in the list below, prints on labels and goes in the CNC file. Right-click cabinets picked in the drawing for Cut only these.</span></div>
    <div class="row-actions"><button class="btn sm" data-act="cut-pk-all">Everything</button><button class="btn sm" data-act="cut-pk-none">Nothing</button><button class="btn sm primary" data-act="cut-pk-open">Done</button></div>
    ${groups.map(g => `${multi ? `<div class="cp-room">${esc(g.room.name)}</div>` : ''}<div class="cp-list">${g.items.map(row).join('') || '<div class="muted">Nothing to cut in this room.</div>'}</div>`).join('')}</div>`;
}
function cutPickAct(a) {
  if (a === 'cut-pk-open') { ui.cutPickOpen = !ui.cutPickOpen; renderCutlist(); return true; }
  if (a === 'cut-pk-all') { ui.cutPick = null; ui.partSel = null; renderCutlist(); return true; }
  if (a === 'cut-pk-none') { ui.cutPick = {}; ui.partSel = null; renderCutlist(); return true; }
  return false;
}
document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('.cut-pk'); if (!el) return;
  cutSet(el.dataset.k.split(','), el.checked);
  // Keep the list where it was scrolled while checking down it.
  const tops = [...document.querySelectorAll('.cutpick .cp-list')].map(x => x.scrollTop);
  renderCutlist();
  document.querySelectorAll('.cutpick .cp-list').forEach((x, i) => { x.scrollTop = tops[i] || 0; });
});
