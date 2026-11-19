/* ---------- What-if options on the quote (Ayden 2026-11-19) ----------
   An option is one change to the whole job, like "Drawer boxes in 3/4 melamine": a Settings pick (drawer materials,
   cabinet materials, door template, slides...) set for every room and cabinet. The job is priced again with that one
   change, and the quote shows what the total would go to and the difference.
   The change is only tried, never kept: every pick it touches is put back exactly as it was before anything is drawn,
   so the job's own price, parts and CNC files stay the same. Saved on the job as S.job.whatIf = [{ id, name, k, v }]. */

// Which Settings picks an option can change, in the order the list shows them.
const WI_KEYS = ['drawerMatT', 'cabMatT', 'doorT', 'finish', 'slide', 'hinge', 'pull', 'countertop', 'molding', 'panelDoor', 'faceFrame'];
// 0.59.13 (Ayden 2026-11-19): drawer fronts only, doors stay. These change the door templates' drawer front styles, not a Settings pick.
const wiStyles = () => [...S.doorStyles].sort((a, b) => (a.type === 'slab' ? 0 : 1) - (b.type === 'slab' ? 0 : 1)).map(d => ({ v: d.id, l: d.name }));
const WI_FRONTS = [
  { k: 'dtDrawer', label: 'Drawer fronts (doors stay)', list: wiStyles, set: { drawer: 1, drawerTop: '', drawerBot: '' } },
  { k: 'dtDrawerTop', label: 'Top drawer front only', list: wiStyles, set: { drawerTop: 1 } },
  // 0.59.14: a different installer for the whole job (every room's own pick set aside while it is tried).
  { k: 'installer', label: 'Installer', list: () => [...INSTALLERS.map(i => ({ v: i.id, l: i.name + (+i.pct > 0 ? ` (${i.pct}% of job)` : '') })), { v: 'none', l: 'No installer' }] },
];
WI_KEYS.splice(3, 0, 'dtDrawer', 'dtDrawerTop');
WI_KEYS.push('installer');
const wiSetting = k => WI_FRONTS.find(s => s.k === k) || (typeof SETTINGS !== 'undefined' ? SETTINGS : []).find(s => s.k === k);
// The slab the job's own door template uses for false fronts, else the first slab style.
function wiSlab() { const dt = doorTpl(roomSet('doorT', S.rooms[0])), ff = dt && S.doorStyles.find(d => d.id === dt.falseFront && d.type === 'slab'); return (ff || S.doorStyles.find(d => d.type === 'slab') || {}).id; }
const wiList = () => (Array.isArray(S.job.whatIf) ? S.job.whatIf : []);
const wiValName = (k, v) => { const s = wiSetting(k); const o = s && s.list().find(x => x.v === v); return o ? o.l : (v ? v : (s && s.blank) || 'None'); };
const wiDefaultName = (k, v) => `${(wiSetting(k) || { label: k }).label}: ${wiValName(k, v)}`;

// Try the change, price the job, put every pick back. Mini cabinets keep their own picks, like a Settings page pick.
function wiTry(o, fn) {
  const fx = WI_FRONTS.find(x => x.k === o.k);
  if (o.k === 'installer') {
    const j = S.job, keep = [['installer', 'installer' in j, j.installer], ['noInstall', 'noInstall' in j, j.noInstall]], rk = S.rooms.map(r => [r, 'installer' in r, r.installer]);
    try { delete j.noInstall; j.installer = o.v; S.rooms.forEach(r => { delete r.installer; }); return fn(); }
    finally { keep.forEach(([f, own, v]) => { if (own) j[f] = v; else delete j[f]; }); rk.forEach(([r, own, v]) => { if (own) r.installer = v; else delete r.installer; }); }
  }
  if (fx) {
    // Every door template's drawer front fields, put back exactly after.
    const back = (S.doorTemplates || []).map(t => [t, Object.keys(fx.set).map(f => [f, Object.prototype.hasOwnProperty.call(t, f), t[f]])]);
    try {
      (S.doorTemplates || []).forEach(t => { if (/^mini-/.test(t.id)) return; Object.entries(fx.set).forEach(([f, v]) => { t[f] = v === 1 ? o.v : v; }); });
      if (typeof clearDoorLimits === 'function') clearDoorLimits();
      return fn();
    } finally {
      back.forEach(([t, fs]) => fs.forEach(([f, own, v]) => { if (own) t[f] = v; else delete t[f]; }));
      if (typeof clearDoorLimits === 'function') clearDoorLimits();
    }
  }
  const k = o.k, d = S.job.defaults, had = Object.prototype.hasOwnProperty.call(d, k), was = d[k], back = [];
  const field = typeof SETTING_FIELDS !== 'undefined' && SETTING_FIELDS.includes(k);
  try {
    d[k] = o.v;
    S.rooms.forEach(r => {
      if (r.settings && Object.prototype.hasOwnProperty.call(r.settings, k)) { back.push([r.settings, k, true, r.settings[k]]); delete r.settings[k]; }
      if (field) (r.cabinets || []).forEach(c => { if (c[k] && !/^mini-/.test(c.libId || '')) { back.push([c, k, true, c[k]]); c[k] = ''; } });
    });
    if (typeof clearDoorLimits === 'function') clearDoorLimits();
    return fn();
  } finally {
    for (let i = back.length - 1; i >= 0; i--) { const [obj, key, own, v] = back[i]; if (own) obj[key] = v; else delete obj[key]; }
    if (had) d[k] = was; else delete d[k];
    if (typeof clearDoorLimits === 'function') clearDoorLimits();
  }
}
// Each option's priced job, from the same price sheet as the quote. Kept only while one screen or print is drawn.
function wiPrices(ps, base = priceJob(ps)) {
  return wiList().map(o => {
    let q = null, err = '';
    try { q = wiTry(o, () => priceJob(ps)); } catch (e) { err = String(e && e.message || e); }
    const same = !WI_FRONTS.some(x => x.k === o.k) && o.v === (S.job.defaults || {})[o.k] && !S.rooms.some(r => (r.settings || {})[o.k]);
    return { o, name: o.name || wiDefaultName(o.k, o.v), q, err, same, total: q ? q.total : base.total, diff: q ? q.total - base.total : 0 };
  });
}
// Materials an option would cut from that have no sheet price yet, so its difference would be too low.
function wiFreeMats(o) {
  if (o.k === 'drawerMatT' && typeof drawerMatT === 'function') { const t = drawerMatT(o.v); return [t.sides, t.bottom].map(mat).filter(m => m && !+matCost(m)).map(m => m.name); }
  if (o.k === 'cabMatT' && typeof cabMatT === 'function') { const t = cabMatT(o.v); return [...new Set(Object.values(t).filter(v => typeof v === 'string'))].map(mat).filter(m => m && m.kind === 'sheet' && !+matCost(m)).map(m => m.name); }
  return [];
}
const wiSigned = v => `${v < 0 ? '−' : '+'}${money(Math.abs(v))}`;

// Quick picks for the common asks. Only the ones the job could take and doesn't already have.
function wiPresets() {
  const out = [], d = S.job.defaults || {};
  const mel = (S.matTemplates.drawer || []).find(t => t.id === 'dt-mel34') || (S.matTemplates.drawer || []).find(t => t.box === 'full');
  if (mel && d.drawerMatT !== mel.id) out.push({ name: 'Drawer boxes in 3/4 melamine', k: 'drawerMatT', v: mel.id });
  const slab = wiSlab();
  if (slab) { out.push({ name: 'Slab drawer fronts', k: 'dtDrawer', v: slab }, { name: 'Slab top drawer fronts only', k: 'dtDrawerTop', v: slab }); }
  return out.filter(p => !wiList().some(o => o.k === p.k && o.v === p.v));
}

// Pricing › Quote card: one row per option with what it changes, the difference and the new total.
function whatIfCard(ps, q) {
  const rows = wiPrices(ps, q), presets = wiPresets();
  const keys = WI_KEYS.filter(wiSetting);
  const row = (R, i) => { const o = R.o, s = wiSetting(o.k), list = s ? s.list() : [], free = ps.materials && ps.materials.on ? wiFreeMats(o) : [];
    const flat = R.q && !R.same && Math.abs(R.diff) < 0.005 && o.k === 'drawerMatT';
    return `<tr data-wi="${esc(o.id)}"><td><input class="wi-name" data-wi-f="name" value="${esc(o.name || '')}" placeholder="${esc(wiDefaultName(o.k, o.v))}" aria-label="Option name"></td>
      <td><select data-wi-f="k" aria-label="What changes">${keys.map(k => `<option value="${k}"${k === o.k ? ' selected' : ''}>${esc(wiSetting(k).label)}</option>`).join('')}</select></td>
      <td><select data-wi-f="v" aria-label="Change it to">${s && s.blank ? `<option value=""${!o.v ? ' selected' : ''}>${esc(s.blank)}</option>` : ''}${list.map(x => `<option value="${esc(x.v)}"${x.v === o.v ? ' selected' : ''}>${esc(x.l)}</option>`).join('')}</select>
        ${R.same ? '<div class="note">The job already uses this</div>' : ''}${free.length ? `<div class="note warn">${esc(free.join(', '))} has no sheet price, so this difference is low. Set it in Libraries › Materials.</div>` : ''}${flat ? `<div class="note warn">These drawer boxes cost the same on this price sheet. <button class="btn sm" data-act="price-view" data-id="edit">Set each box's price in Edit prices › Adders</button></div>` : ''}${R.err ? `<div class="note warn">Could not price this: ${esc(R.err)}</div>` : ''}</td>
      <td class="n"><b>${R.q ? wiSigned(R.diff) : ''}</b></td><td class="n">${R.q ? money(R.total) : ''}</td>
      <td><button class="btn sm danger" data-act="wi-del" data-id="${esc(o.id)}" title="Remove this option">${icon('trash')}</button></td></tr>`; };
  return `<div class="psec box prx-wi"><div class="sechead teal"><span>Options (what if)</span></div>
    <div class="note">Each option prices the whole job again with one change. The quote and Scope of work print the difference and the new total. The job itself is not changed.</div>
    ${rows.length ? `<table class="t prx-wit"><thead><tr><th>Option</th><th>What changes</th><th>Change it to</th><th class="r">Difference</th><th class="r">New total</th><th></th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody><tfoot><tr><td colspan="4">Job as drawn</td><td class="n">${money(q.total)}</td><td></td></tr></tfoot></table>` : ''}
    <div class="row-actions">${presets.map((p, i) => `<button class="btn" data-act="wi-preset" data-id="${i}">${icon('plus')}${esc(p.name)}</button>`).join('')}<button class="btn" data-act="wi-add">${icon('plus')}Add option</button></div></div>`;
}

// Printed options: a table for the quote and the Scope of work page. mm turns a price into the printed number.
function whatIfPrintRows(ps, base) {
  return wiPrices(ps, base).filter(R => R.q && !R.same);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act^="wi-"]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'wi-add') { const k = 'drawerMatT', s = wiSetting(k), v = (s.list()[0] || {}).v || ''; mutate(() => { S.job.whatIf = [...wiList(), { id: uid('wi'), name: '', k, v }]; }); }
  else if (a === 'wi-preset') { const p = wiPresets()[+id]; if (p) mutate(() => { S.job.whatIf = [...wiList(), { id: uid('wi'), ...p }]; }); }
  else if (a === 'wi-del') mutate(() => { S.job.whatIf = wiList().filter(o => o.id !== id); if (!S.job.whatIf.length) delete S.job.whatIf; });
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-wi-f]'); if (!el) return;
  const tr = el.closest('[data-wi]'), o = tr && wiList().find(x => x.id === tr.dataset.wi); if (!o) return;
  const f = el.dataset.wiF, v = el.value;
  mutate(() => {
    const t = wiList().find(x => x.id === o.id);
    if (f === 'name') t.name = v.trim();
    else if (f === 'k') { const s = wiSetting(v); t.k = v; t.v = (s && s.list()[0] || {}).v || ''; }
    else t.v = v;
  });
});
