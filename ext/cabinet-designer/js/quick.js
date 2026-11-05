/* ---------- Quick edits and editor extras (Mozaik list Q1–Q19) ----------
   The quick edit bar under the room, size limits and the grow direction, snap-to heights, equalize widths,
   the change log, Save changes, Save to library (replace or new), section locks, Clear and Reset, split ends
   and backs, closet inserts, drawings, price and info extras, typed moves (M), box select in elevation and 3D,
   copy and paste of several cabinets, and copy and paste of a cabinet's settings. */
'use strict';
const SIZE_F = { w: 'Width', h: 'Height', d: 'Depth' };

/* ----- Q4: size limits. A locked size can't change; min and max clamp it. ----- */
function qSizeRule(c, f, v) {
  const F = f.toUpperCase(), name = SIZE_F[f];
  if (c['no' + F] && Math.abs(v - c[f]) > 1e-6) return { refuse: true, note: `${name} is locked on ${LBL[c.id] || c.name}. Untick ${name} Locked under Stretching in its Size tab.` };
  const mn = +c['min' + F], mx = +c['max' + F];
  if (mn > 0 && v < mn - 1e-6) return { v: mn, note: `${name} can't go under ${fmtLen(mn, 1)} on this cabinet, so it was set to that.` };
  if (mx > 0 && v > mx + 1e-6) return { v: mx, note: `${name} can't go over ${fmtLen(mx, 1)} on this cabinet, so it was set to that.` };
  return { v };
}
/* ----- Q2: which way a cabinet grows when its width changes (as seen in elevation) -----
   Auto (the default): nothing next to it on either side grows or shrinks evenly from the middle; something next to it
   on one side keeps that edge where it is and grows toward the open side; boxed in on both sides keeps the left end. */
let qGrowDir = null;
const growDir = () => { if (qGrowDir === null) { try { qGrowDir = localStorage.getItem(KEY + '.grow2') || 'auto'; } catch (_) { qGrowDir = 'auto'; } } return qGrowDir; };
const GROW = [['auto', 'Auto'], ['left', '◀ Left'], ['both', '◀ Both ▶'], ['right', 'Right ▶']];
// Open room past each end of c along its wall (low = toward the wall's start), up to the next item or the wall face.
function growRoom(c, dir) {
  const { lo, hi } = runLimits(c), n = nearestAt(c, dir), toWall = dir < 0 ? c.off - lo : hi - (c.off + c.w);
  return Math.max(0, n ? Math.min(n.gap, toWall) : toWall);
}
// How far the low end moves down the wall when the width grows by dv (shrinks when dv < 0), for Auto.
function autoGrowLo(c, dv) {
  const ly = lay(), near = Math.max(ly.panelReach || 0, ly.autoFillers ? ly.fillerReach || 0 : 0) + 0.01;
  const rLo = growRoom(c, -1), rHi = growRoom(c, 1), bLo = rLo <= near, bHi = rHi <= near;
  if (bLo && bHi) return null;            // boxed in: the usual left end stays
  if (bLo) return 0;                      // something at the low end: grow toward the high end
  if (bHi) return dv;                     // something at the high end: grow toward the low end
  if (dv <= 0) return dv / 2;             // open both sides: shrink evenly
  return Math.max(dv - rHi, Math.min(rLo, dv / 2)); // grow evenly, giving any shortfall on one side to the other
}
function qGrow(c, v) {
  if (!c.wall || !wall(c.wall)) { c.w = v; return; }
  const dv = v - c.w;
  if (growDir() === 'auto') {
    const d = inRoomOf(c, () => autoGrowLo(c, dv));
    if (d !== null) { c.off = r3(c.off - d); c.w = v; return; }
    const L0 = inRoomOf(c, () => fromEnd(c, 'L')); c.w = v; inRoomOf(c, () => setFromEnd(c, 'L', L0)); return;
  }
  if (growDir() === 'right') { const L0 = inRoomOf(c, () => fromEnd(c, 'L')); c.w = v; inRoomOf(c, () => setFromEnd(c, 'L', L0)); return; }
  const L0 = inRoomOf(c, () => fromEnd(c, 'L')); c.w = v;
  inRoomOf(c, () => setFromEnd(c, 'L', r3(L0 - (growDir() === 'left' ? dv : dv / 2))));
}
const growSeg = () => `<div class="qb-grow"><span>Width grows</span><div class="seg" role="group" aria-label="Which way the width grows">${GROW.map(([k, l]) => `<button data-act="q-grow" data-id="${k}" aria-pressed="${growDir() === k}">${l}</button>`).join('')}</div></div>`;

/* ----- Q5: the change log ----- */
function cabLog(c, m) { if (!c) return; (c.log = c.log || []).push({ t: Date.now(), m }); if (c.log.length > 100) c.log.splice(0, c.log.length - 100); }
function cabLogField(ref, field, el) {
  const m = String(ref).match(/(?:^|\|)(?:cab|cabp|cabpos|cabgap):([^|:]+)/); if (!m) return; const c = cab(m[1]); if (!c) return;
  const lab = el.getAttribute('aria-label') || field, val = el.tagName === 'SELECT' ? ((el.selectedOptions || [])[0] || {}).textContent : el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : el.value;
  cabLog(c, `${lab}: ${String(val ?? '').slice(0, 60)}`);
}
function qLogBox(c) {
  const L = (c.log || []).slice().reverse(), when = t => { const d = new Date(t); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  return `<details class="psec box q-log"><summary>${icon('list')}<b>Change log</b> <span class="muted">${L.length} change${L.length === 1 ? '' : 's'}</span></summary>
    ${L.length ? `<table class="t"><tbody>${L.map(x => `<tr><td class="muted nowrap">${esc(when(x.t))}</td><td>${esc(x.m)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">Nothing changed yet.</div>'}</details>`;
}

/* ----- Q1: quick edit bar under the room view ----- */
function qbarIds() { const m = multiIds(); if (m.length > 1) return m; return ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id) ? [ui.sel.id] : []; }
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList) return;
  if (t.classList.contains('qb-in')) qbApply(t.dataset.f, t);
  else if (t.classList.contains('qb-snap') && t.value) qSnap(t.value, qbarIds());
  else if (t.classList.contains('q-snap-one') && t.value) qSnap(t.value, [t.dataset.id]);
  else if (t.classList.contains('q-draw-in') && t.files && t.files.length) qAddDrawings(t.dataset.id, [...t.files]);
});
function qbApply(f, t) {
  const ids = qbarIds(); if (!ids.length) return;
  const label = { w: 'Width', h: 'Height', d: 'Depth', elev: 'Elevation', outset: 'Outset', endL: 'Left end', endR: 'Right end' }[f];
  let v;
  if (f === 'endL' || f === 'endR') { v = t.value; if (v === MIXED) return; }
  else { v = parseLen(t.value); if (v === null || !isFinite(v) || (SIZE_F[f] && v <= 0) || (f === 'elev' && v < 0)) { renderDock(); return; } }
  const notes = [];
  mutate(() => ids.forEach(id => {
    const c = cab(id); if (!c) return;
    if (f === 'endL' || f === 'endR') { if (v) c[f] = v; else delete c[f]; cabLog(c, `${label}: ${t.selectedOptions[0].textContent} (quick edit)`); return; }
    let nv = v; if (SIZE_F[f]) { const r = qSizeRule(c, f, v); if (r.refuse) { notes.push(r.note); return; } nv = r.v; if (r.note) notes.push(r.note); }
    const was = c[f], wasOff = c.off; if (f === 'w') qGrow(c, nv); c[f] = nv;
    if (c.wall && !settle(c)) { c[f] = was; c.off = wasOff; notes.push(`${LBL[id] || c.name}: there is no room for that here.`); return; }
    cabLog(c, `${label}: ${fmtLen(nv, 1)} (quick edit)`);
  }));
  if (notes.length) flash(notes[0]);
}

/* ----- Q7: snap to a standard height ----- */
function qSnapSpots(c) {
  const p = c ? effParams(c) : {}, bases = S.cabinets.filter(k => k.cat === 'Base'), uppers = S.cabinets.filter(k => k.cat === 'Wall');
  const baseTop = bases.length ? Math.max(...bases.map(k => (k.elev || 0) + k.h)) : 34.5;
  const ct = (S.countertops || [])[0], ctT = ct && +ct.thick > 0 ? +ct.thick : 1.5;
  const upBot = uppers.length ? Math.min(...uppers.map(k => k.elev || 0)) : 54, upTop = uppers.length ? Math.max(...uppers.map(k => (k.elev || 0) + k.h)) : 84;
  const ceil = +(curRoom() || {}).wallHeight || +S.job.wallHeight || 96;
  return [
    { k: 'floor', l: 'Floor', z: 0 }, { k: 'toe', l: 'Toe height', z: +p.toeKickHeight || 4 }, { k: 'base', l: 'Top of bases', z: baseTop },
    { k: 'counter', l: 'Top of countertops', z: baseTop + ctT }, { k: 'under', l: 'Under uppers', z: upBot, top: true },
    { k: 'ceil', l: 'At ceiling', z: ceil, top: true }, { k: 'above', l: 'Above uppers', z: upTop },
  ];
}
function qSnap(k, ids) {
  let bad = 0;
  mutate(() => ids.forEach(id => {
    const c = cab(id); if (!c) return; const s = qSnapSpots(c).find(x => x.k === k); if (!s) return;
    const was = c.elev, z = r3(Math.max(0, s.top ? s.z - c.h : s.z)); c.elev = z;
    if (c.wall && !settle(c)) { c.elev = was; bad++; return; }
    cabLog(c, `Snapped to ${s.l.toLowerCase()} (elevation ${fmtLen(z, 1)})`);
  }));
  if (bad) flash('Some cabinets had no room at that height and stayed put.');
}

/* ----- Q3: equalize widths ----- */
function qEqualize() {
  const cs = multiIds().map(cab).filter(Boolean);
  if (cs.length < 2) { flash('Select two or more cabinets first (Shift or Ctrl click).'); return; }
  if (!cs.every(c => c.wall && c.wall === cs[0].wall && c.side === cs[0].side)) { flash('Equalize works on cabinets along one wall.'); return; }
  const locked = cs.find(c => c.noW); if (locked) { flash(`${LBL[locked.id]} has its width locked.`); return; }
  cs.sort((a, b) => a.off - b.off);
  const total = cs.reduce((a, c) => a + c.w, 0), n = cs.length, each = Math.floor(total / n * 16) / 16, gaps = cs.map((c, i) => i ? c.off - (cs[i - 1].off + cs[i - 1].w) : 0);
  mutate(() => { let at = cs[0].off; cs.forEach((c, i) => { at += gaps[i]; c.w = i === n - 1 ? r3(total - each * (n - 1)) : each; c.off = r3(at); at += c.w; cabLog(c, `Width equalized to ${fmtLen(c.w, 1)}`); }); });
  flash(`${n} cabinets now ${fmtLen(each, 1)} wide`);
}

/* ----- Q19: copy and paste a cabinet's settings ----- */
const SET_KEYS = ['cabMatT', 'drawerMatT', 'doorT', 'panelStyle', 'partT', 'pull', 'slide', 'hinge', 'jointU', 'jointF', 'finInt', 'molding', 'grainMatch', 'faceFrame'];
let setClip = null;
function qCopySettings() {
  const id = multiIds().length > 1 ? multiIds()[0] : ui.sel && ui.sel.type === 'cab' ? ui.sel.id : ui.quick, c = cab(id); if (!c) return;
  setClip = { from: LBL[c.id] || c.name, v: Object.fromEntries(SET_KEYS.map(k => [k, c[k]])) };
  flash(`Copied ${setClip.from}'s materials, doors and hardware. Right-click another cabinet and pick Paste settings.`); renderDock();
}
function qPasteSettings() {
  if (!setClip) return; const ids = qbarIds().length ? qbarIds() : ui.quick ? [ui.quick] : [];
  mutate(() => ids.forEach(id => { const c = cab(id); if (!c) return; SET_KEYS.forEach(k => { const v = setClip.v[k]; if (v === undefined || v === '' || v === false) delete c[k]; else c[k] = clone(v); }); cabLog(c, `Settings pasted from ${setClip.from}`); }));
  flash(`Pasted ${setClip.from}'s settings on ${ids.length} cabinet${ids.length === 1 ? '' : 's'}`);
}

/* ----- Size tab extras: limits (Q4), grow (Q2), snap (Q7) ----- */
function qSizeExtras(c) {
  const R = 'cab:' + c.id, lim = f => `<div class="q-lim"><label class="checkrow">${ctl(R, 'no' + f.toUpperCase(), !!c['no' + f.toUpperCase()], 'bool', { label: `${SIZE_F[f]} locked` })} <span>${SIZE_F[f]} locked</span></label>${fld('Smallest', R, 'min' + f.toUpperCase(), c['min' + f.toUpperCase()] || '', 'len', { blank: true, ph: 'none' })}${fld('Largest', R, 'max' + f.toUpperCase(), c['max' + f.toUpperCase()] || '', 'len', { blank: true, ph: 'none' })}</div>`;
  return `<div class="psec box">${secHead('magnet', 'Height on the wall', 'blue')}<div class="grid2"><label class="f"><span>Snap to</span><select class="q-snap-one" data-id="${c.id}" aria-label="Snap to a height"><option value="">Pick a height…</option>${qSnapSpots(c).map(s => `<option value="${s.k}">${s.l} · ${fmtLen(s.z, 1)}</option>`).join('')}</select></label>${growSeg()}</div></div>
    <div class="psec box q-limits">${secHead('ruler', 'Stretching', 'teal')}<table class="t q-limt"><thead><tr><th></th>${['w', 'h', 'd'].map(f => `<th>${SIZE_F[f]}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Locked</td>${['w', 'h', 'd'].map(f => `<td><label class="checkrow">${ctl(R, 'no' + f.toUpperCase(), !!c['no' + f.toUpperCase()], 'bool', { label: `${SIZE_F[f]} locked` })}</label></td>`).join('')}</tr>
      <tr><td>Largest</td>${['w', 'h', 'd'].map(f => `<td>${ctl(R, 'max' + f.toUpperCase(), c['max' + f.toUpperCase()] || '', 'len', { blank: true, ph: 'none', label: `Largest ${SIZE_F[f].toLowerCase()}` })}</td>`).join('')}</tr>
      <tr><td>Smallest</td>${['w', 'h', 'd'].map(f => `<td>${ctl(R, 'min' + f.toUpperCase(), c['min' + f.toUpperCase()] || '', 'len', { blank: true, ph: 'none', label: `Smallest ${SIZE_F[f].toLowerCase()}` })}</td>`).join('')}</tr></tbody></table></div>`;
}

/* ----- Face and Interior extras: lock a section (Q8), fixed shelf on a split (Q9), Clear and Reset (Q10) ----- */
function qInteriorExtras(c) {
  const R = 'cab:' + c.id;
  return `<div class="psec box">${secHead('shelf', 'Split ends and backs', 'teal')}
    <div class="grid2">${fld('Split ends at (from the bottom)', R, 'splitEnds', c.splitEnds || '', 'len', { blank: true, ph: 'not split' })}${fld('Split back at (from the bottom)', R, 'splitBack', c.splitBack || '', 'len', { blank: true, ph: 'not split' })}</div></div>`;
}

/* ----- Build: split ends and backs (Q11), fixed shelves (Q9), closet rods and separators (Q12) ----- */
function qSplitPart(parts, q, at, warn) {
  const alongL = q.L >= q.W, len = alongL ? q.L : q.W;
  if (!(at > 1 && at < len - 1)) { warn.push(`${q.name}: the split at ${fmtLen(at, 1)} is outside the part, so it was not split.`); return; }
  const lo = { ...q, name: q.name + ' (lower)', ops: [] }, hi = { ...q, name: q.name + ' (upper)', ops: [] };
  if (alongL) { lo.L = r3(at); hi.L = r3(q.L - at); } else { lo.W = r3(at); hi.W = r3(q.W - at); }
  const k1 = alongL ? 'x' : 'y';
  q.ops.forEach(o => {
    const v = o[k1] ?? o[k1 + '1'] ?? 0, up = v >= at, tgt = up ? hi : lo, n = { ...o };
    if (up) ['', '1', '2'].forEach(s => { if (typeof n[k1 + s] === 'number') n[k1 + s] = r3(n[k1 + s] - at); });
    if (o.type === 'groove' && !up && (o[k1 + '2'] ?? 0) > at) { n[k1 + '2'] = at; hi.ops.push({ ...o, [k1 + '1']: 0, [k1 + '2']: r3(o[k1 + '2'] - at) }); }
    if (o.type === 'notch' && up) return;
    tgt.ops.push(n);
  });
  parts.splice(parts.indexOf(q), 1, lo, hi);
}
function qBuildExtras(c, parts, warn, part, x) {
  const mine = n => parts.find(q => q.cabId === c.id && q.name === n);
  if (c.splitEnds > 0) ['Left side', 'Right side'].forEach(n => { const q = mine(n); if (q) qSplitPart(parts, q, c.splitEnds, warn); });
  if (c.splitBack > 0) { const q = mine('Back'); if (q) qSplitPart(parts, q, c.splitBack, warn); }
  const rows = c.rows || [], fr = x.fronts || computeFronts(c);
  rows.forEach((r, i) => {
    if (!(r.fixShelf && i < rows.length - 1)) return;
    const q = part(`Fixed shelf ${i + 1}`, x.sm || x.cm, x.inW, Math.max(1, x.inD - 0.0625), { kind: 'shelf' }), f = fr.find(z => z.row === i);
    // Where it sits, so the joint templates can fasten it into the sides.
    if (q && f && x.zIn0 !== undefined) q.jx = r3(Math.min(x.zIn1 - x.t, Math.max(x.zIn0 + x.t, f.z0 - x.t / 2)));
  });
  (c.inserts || []).forEach(it => {
    const row = it.row !== undefined && it.row !== '' ? +it.row : rows.length - 1, f = fr.find(z => z.row === row) || fr[fr.length - 1];
    if (it.type === 'rod') { x.addB(`${it.name || 'Closet rod'} ${fmtLen(x.inW, 1)}`, 1); x.addB('Closet rod flange (pair)', 1); }
    else if (it.type === 'separator') part('Separator', x.cm, f ? r3(f.z1 - f.z0) : 12, Math.max(1, x.inD - 0.0625), { kind: 'divider' });
  });
  if (typeof fxApplyRules === 'function') fxApplyRules(c, parts, warn, part, x);
}

/* ----- Q13: drawings (pictures and PDFs) kept with the cabinet ----- */
function qDrawings(c) {
  const ds = c.drawings || [], url = d => d.url || (d.path && typeof Hub !== 'undefined' && Hub.files ? Hub.files.url(d.path) : '');
  return `<div class="psec box">${secHead('camera', 'Drawings', 'violet')}<div class="note">Customer sketches, photos and PDFs that go with this cabinet.</div>
    <div class="q-draws">${ds.map(d => `<div class="q-draw">${/^image\//.test(d.type) ? `<a href="${esc(url(d))}" target="_blank" rel="noopener"><img src="${esc(url(d))}" alt="${esc(d.name)}"></a>` : `<a class="q-pdf" href="${esc(url(d))}" target="_blank" rel="noopener">PDF</a>`}<span>${esc(d.name)}</span><button class="btn sm danger" data-act="q-draw-del" data-id="${c.id}:${d.id}" aria-label="Remove ${esc(d.name)}">×</button></div>`).join('') || '<span class="muted">None yet.</span>'}</div>
    <label class="btn sm q-draw-add">${icon('upload')}Add a drawing<input type="file" class="q-draw-in" data-id="${c.id}" accept="image/*,application/pdf" multiple hidden></label></div>`;
}
async function qAddDrawings(cid, files) {
  const add = [];
  for (const f of files) {
    const d = { id: uid('d'), name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/*') };
    try {
      if (typeof inHub === 'function' && inHub()) {
        const folder = 'Cabinet Designer/Drawings', r = await Hub.files.upload(f, folder), got = (r && (r.files || r.uploaded || r)) || [];
        d.path = (Array.isArray(got) && got[0] && (got[0].path || got[0].name && `${folder}/${got[0].name}`)) || `${folder}/${f.name}`;
      } else {
        if (f.size > 3e6) { flash(`${f.name} is too big to keep in the browser (3 MB at most). Open the job in the hub to keep big drawings.`); continue; }
        d.url = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(fr.error); fr.readAsDataURL(f); });
      }
      add.push(d);
    } catch (e) { flash(`Could not add ${f.name}: ${e.message}`); }
  }
  if (add.length) mutate(() => { const c = cab(cid); if (c) { c.drawings = [...(c.drawings || []), ...add]; cabLog(c, `Drawing added: ${add.map(d => d.name).join(', ')}`); } });
}

/* ----- Q14 and Q15: price and info extras ----- */
function qPriceExtras(c) {
  const R = 'cab:' + c.id, ps = typeof priceSheet === 'function' && priceSheet(), pr = ps ? priceCab(c, ps) : null;
  return `<div class="psec box">${secHead('tag', 'This cabinet only', 'amber')}<div class="grid4">${fld('Price per foot', R, 'pxFt', c.pxFt || '', 'num', { blank: true, ph: '0' })}${fld('Price per sq ft of face', R, 'pxSq', c.pxSq || '', 'num', { blank: true, ph: '0' })}${fld('Upcharge %', R, 'pxUp', c.pxUp || '', 'num', { blank: true, ph: '0' })}${fld('Weight (lb)', R, 'weight', c.weight || '', 'num', { blank: true, ph: '' })}</div>
    ${pr && pr.own ? '' : `<label class="checkrow">${ctl(R, 'noCount', !!c.noCount, 'bool', { label: 'Leave out of the cabinet counts' })} <span>Leave out of the cabinet counts and price per foot</span></label>`}
    ${pr && (pr.custom || pr.upcharge) ? `<div class="note">Adds ${money(pr.custom || 0)}${pr.upcharge ? ` plus a ${money(pr.upcharge)} upcharge` : ''} to this cabinet.</div>` : ''}</div>`;
}
function qInfoExtras(c) {
  const R = 'cab:' + c.id, chk = (k, l) => `<label class="checkrow">${ctl(R, k, !!c[k], 'bool', { label: l })} <span>${l}</span></label>`;
  return `<div class="psec box">${secHead('sliders', 'Settings for this cabinet', 'blue')}<div class="q-flags">
    ${chk('noCut', 'Leave off the cut list, labels and CNC file')}${chk('noMirror', "Don't allow Flip")}${chk('noDim', 'Leave out of the elevation dimensions')}
    ${fld('Grain match', R, 'grainMatch', c.grainMatch || '', 'select', { options: [{ v: '', l: 'Off' }, { v: 'v', l: 'Vertical' }, { v: 'h', l: 'Horizontal' }] })}
    ${fld('Cabinet number', R, 'num', c.num || '', 'int', { ph: 'auto' })}</div><div class="note">Numbers are given out automatically and then kept. Type one to set it; it has to be free and inside this room's hundred (${(curRoom().block || 1) * 100 + 1} to ${(curRoom().block || 1) * 100 + 99}).</div></div>`;
}

/* ----- Q16: type a distance to move (M, then a number, then Enter) ----- */
let qMove = null;
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (qMove) {
    if (/^[0-9./\- ]$/.test(e.key) || (e.key === '"')) { e.preventDefault(); e.stopImmediatePropagation(); qMove.buf += e.key; flash(`Move ${LBL[qMove.id] || ''} by ${qMove.buf || '…'} (Enter to move, Esc to stop)`); return; }
    if (e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); qMove.buf = qMove.buf.slice(0, -1); flash(`Move by ${qMove.buf || '…'}`); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); qMove = null; flash('Move stopped'); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); const m = qMove; qMove = null; qMoveBy(m.id, m.buf); return; }
    return;
  }
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && ui.tab === 'room' && !ui.drawWalls && !ui.quick && ui.sel && ui.sel.type === 'cab' && cab(ui.sel.id) && cab(ui.sel.id).wall) {
    e.preventDefault(); e.stopImmediatePropagation(); qMove = { id: ui.sel.id, buf: '' }; flash('Type how far to move it (− for left) and press Enter');
  }
}, true);
function qMoveBy(id, buf) {
  const c = cab(id), s = String(buf || '').trim(), neg = s.startsWith('-'), v = parseLen(s.replace(/^-/, '').trim());
  if (!c || v === null || !isFinite(v) || !v) { flash('That is not a distance.'); return; }
  const d = neg ? -v : v, L0 = fromEnd(c, 'L'), was = c.off; let ok = true;
  mutate(() => { setFromEnd(c, 'L', r3(L0 + d)); if (!settle(c)) { c.off = was; ok = false; } else cabLog(c, `Moved ${fmtLen(d, 1)}`); });
  flash(ok ? `Moved ${fmtLen(Math.abs(d), 1)} ${d < 0 ? 'left' : 'right'}` : 'There is no room to move it that far.');
}

/* ----- Q17: box select in the elevation and in 3D (Shift or Ctrl drag on empty space) ----- */
let qBox = null;
document.addEventListener('pointerdown', e => {
  if (!(e.shiftKey || e.ctrlKey || e.metaKey) || e.button !== 0 || ui.tab !== 'room') return;
  const ev = e.target.closest && e.target.closest('#elev'), v3 = e.target.closest && e.target.closest('#room3d');
  if (ev && !e.target.closest('[data-cab],[data-shape],[data-rz]')) {
    const p = elevPoint(e), r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('class', 'selbox nss'); ev.appendChild(r);
    qBox = { kind: 'elev', p0: p, el: r, add: e.ctrlKey || e.metaKey || multiIds().length > 0 }; e.stopPropagation(); e.preventDefault(); return;
  }
  if (v3 && roomViewer && roomViewer.ok) {
    const d = document.createElement('div'); d.className = 'selbox3d'; document.body.appendChild(d);
    roomViewer.controls.enabled = false;
    qBox = { kind: '3d', x0: e.clientX, y0: e.clientY, el: d, add: e.ctrlKey || e.metaKey || multiIds().length > 0 }; e.stopPropagation(); e.preventDefault();
  }
}, true);
document.addEventListener('pointermove', e => {
  if (!qBox) return;
  if (qBox.kind === 'elev') { const p = elevPoint(e); qBox.p1 = p; const r = qBox.el; r.setAttribute('x', Math.min(p.x, qBox.p0.x)); r.setAttribute('y', Math.min(p.y, qBox.p0.y)); r.setAttribute('width', Math.abs(p.x - qBox.p0.x)); r.setAttribute('height', Math.abs(p.y - qBox.p0.y)); }
  else { qBox.x1 = e.clientX; qBox.y1 = e.clientY; Object.assign(qBox.el.style, { left: Math.min(qBox.x0, e.clientX) + 'px', top: Math.min(qBox.y0, e.clientY) + 'px', width: Math.abs(e.clientX - qBox.x0) + 'px', height: Math.abs(e.clientY - qBox.y0) + 'px' }); }
}, true);
document.addEventListener('pointerup', () => {
  const b = qBox; if (!b) return; qBox = null; b.el.remove();
  let ids = [];
  if (b.kind === 'elev' && b.p1) {
    const w = wall(ui.elevWall); if (w) {
      const L = wg(w).L, side = elevSide(w), x0 = Math.min(b.p0.x, b.p1.x), x1 = Math.max(b.p0.x, b.p1.x), y0 = Math.min(b.p0.y, b.p1.y), y1 = Math.max(b.p0.y, b.p1.y);
      ids = S.cabinets.filter(c => c.wall === w.id && c.side === side).filter(c => { const cx = elevX(c, L) + c.w / 2, cy = -((c.elev || 0) + c.h / 2); return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; }).map(c => c.id);
    }
  } else if (b.kind === '3d') {
    roomViewer.controls.enabled = true;
    if (b.x1 !== undefined) {
      const v = roomViewer, rc = v.renderer.domElement.getBoundingClientRect(), x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const boxes = {}; v.root.traverse(o => { if (o.isMesh && o.userData.cabId) (boxes[o.userData.cabId] = boxes[o.userData.cabId] || new THREE.Box3()).expandByObject(o); });
      ids = Object.entries(boxes).filter(([id, bx]) => { const m = bx.getCenter(new THREE.Vector3()).project(v.cam), sx = rc.left + (m.x + 1) / 2 * rc.width, sy = rc.top + (1 - m.y) / 2 * rc.height; return m.z < 1 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1; }).map(([id]) => id).filter(id => cab(id));
    }
  }
  if (!ids.length && !(b.kind === 'elev' ? b.p1 : b.x1 !== undefined)) return;
  const keep = b.add ? (multiIds().length ? multiIds() : ui.sel && ui.sel.type === 'cab' ? [ui.sel.id] : []) : [];
  setMulti([...keep, ...ids]); if (ids.length) flash(`${multiIds().length} cabinets selected`);
}, true);

/* ----- Q18: copy and paste several cabinets, keeping their spacing ----- */
function qCopyMany(cut) {
  const ids = multiIds(); if (ids.length < 2) return false;
  const cs = ids.map(cab).filter(Boolean).sort((a, b) => a.off - b.off);
  clip = { type: 'cabs', items: cs.map(c => ({ data: clone(c), lights: cabStrips(c.id) })), room: S.roomId };
  if (cut) { mutate(() => { S.cabinets = S.cabinets.filter(c => !ids.includes(c.id)); }); ui.multi = []; ui.sel = null; }
  flash(`${cut ? 'Cut' : 'Copied'} ${cs.length} cabinets. Ctrl+V pastes them with the same spacing.`);
  return true;
}
function qPasteMany(at) {
  const items = clip.items, first = items[0].data, span = Math.max(...items.map(i => i.data.off + i.data.w)) - first.off;
  // Where the group starts: at the pointer or a wall spot, or right after the originals.
  let wid = first.wall, side = first.side, start = first.off + span;
  if (at && at.p) { let best = null; S.walls.forEach(w => { const r = segDist(at.p, w); if (r.d < 80 && (!best || r.d < best.r.d)) best = { w, r }; }); if (best) { wid = best.w.id; side = best.r.side; start = best.r.t - span / 2; } }
  else if (at && at.wid) { wid = at.wid; side = at.side; start = at.a - span / 2; }
  if (!wall(wid)) { const w = wall(ui.elevWall) || S.walls[0]; if (!w) { flash('Draw a wall first.'); return; } wid = w.id; side = elevSide(w); start = 0; }
  // Tries the spot asked for first, then every wall from its left end, 1" at a time.
  const fits = (w2, sd, st) => items.every(it => { const nc = { ...it.data, id: '__probe', wall: w2, side: sd, off: r3(st + it.data.off - first.off) }, f = findFree(nc, w2, sd, nc.off, null); return f !== null && Math.abs(f - nc.off) < 0.01; });
  const tries = [[wid, side, start]], explicit = !!at;
  if (!explicit) S.walls.forEach(w => [elevSide(w), -elevSide(w)].forEach(sd => { const L = wg(w).L; for (let st = 0; st <= L - span + 1e-6; st += 1) tries.push([w.id, sd, st]); }));
  let spot = null;
  for (const [w2, sd, st0] of tries) { const L = wg(wall(w2)).L, st = Math.max(0, Math.min(st0, L - span)); if (span <= L && fits(w2, sd, st)) { spot = [w2, sd, st]; break; } }
  const made = []; const ok = !!spot;
  if (ok) mutate(() => {
    const [w2, sd, st] = spot; wid = w2;
    for (const it of items) { const nc = { ...clone(it.data), id: uid('c'), num: null, log: [], wall: w2, side: sd, off: r3(st + it.data.off - first.off) }; S.cabinets.push(nc); made.push(nc); addCabStrips(nc.id, it.lights || []); }
    ensureNums();
  });
  if (!ok) { flash('There is no room for the whole group there. Paste on another wall, or at the pointer over open wall.'); return; }
  ui.elevWall = wid; setMulti(made.map(c => c.id)); flash(`Pasted ${made.length} cabinets`);
}

/* ----- Actions ----- */
function qRowMut(id, fn) { const [cid, i] = id.split(':'), c = cab(cid), r = c && (c.rows || [])[+i]; if (r) mutate(() => fn(c, r, +i)); }
function quickAct(a, id, el) {
  switch (a) {
    case 'q-grow': qGrowDir = id; try { localStorage.setItem(KEY + '.grow2', id); } catch (_) {} render(); return true;
    case 'q-equal': qEqualize(); return true;
    case 'q-copyset': qCopySettings(); return true;
    case 'q-pasteset': qPasteSettings(); return true;
    case 'q-save': if (typeof flushJob === 'function') flushJob(); flash('Saved'); return true;
    case 'q-tolib': {
      const c = cab(id), li = c && c.libId && libItem(c.libId);
      if (!li) { qToLib(id, false); return true; }
      const m = $('#ctxmenu'), r = el.getBoundingClientRect();
      m.innerHTML = `<div class="ctxhead">Save to library</div><button role="menuitem" data-act="q-tolib-over" data-id="${id}">Replace "${esc(li.name)}"</button><button role="menuitem" data-act="q-tolib-new" data-id="${id}">Save as a new item</button>`;
      m.hidden = false; m.classList.add('over-modal'); m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px'; m.style.top = Math.max(8, r.top - 110) + 'px';
      return true;
    }
    case 'q-tolib-over': case 'q-tolib-new': qToLib(id, a === 'q-tolib-over'); return true;
    case 'q-fixrow': qRowMut(id, (c, r, i) => { r.fixShelf = !r.fixShelf; if (!r.fixShelf) delete r.fixShelf; cabLog(c, `Fixed shelf under opening ${i + 1} ${r.fixShelf ? 'on' : 'off'}`); }); return true;
    case 'q-draw-del': { const [cid, did] = id.split(':'), c = cab(cid); if (c) mutate(() => { const d = (c.drawings || []).find(x => x.id === did); c.drawings = (c.drawings || []).filter(x => x.id !== did); if (d) cabLog(c, `Drawing removed: ${d.name}`); }); return true; }
  }
  return false;
}
function qToLib(id, over) {
  const c = cab(id); if (!c) return; $('#ctxmenu').classList.remove('over-modal');
  const old = over && libItem(c.libId), nid = old ? old.id : uid('l');
  mutate(() => {
    const li = designToLib({ ...designCabFrom(c), name: old ? old.name : c.name + ' (custom)' }, nid), lt = cabStrips(c.id); if (lt.length) li.lights = lt;
    if (old) { const i = S.library.indexOf(old); S.library[i] = { ...old, ...li }; } else S.library.push(li);
    c.libId = nid; cabLog(c, old ? `Saved over "${old.name}" in the library` : 'Saved to the library as a new item');
  });
  flash(old ? `Replaced "${old.name}" in the library` : 'Saved to the library as a new item');
}
