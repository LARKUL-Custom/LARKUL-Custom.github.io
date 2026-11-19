// Job dashboard (rooms) and Settings (job-wide and per-room templates, styles, hardware and parameters).
'use strict';

/* ---------- Rooms ---------- */
function switchRoom(id) {
  if (!roomById(id) || id === S.roomId) return;
  S.roomId = id; save();
  ui.sel = null; ui.drawing = null; ui.ghost = null; fixSel();
  if (roomViewer) roomViewer.fitted = false;
  render();
  if (ui.tab === 'room') requestAnimationFrame(() => { fitView(); renderRoom(); });
}
function addRoom() {
  const r = newRoom(uid('r'), 'Room ' + (S.rooms.length + 1), []);
  r.wallThick = S.job.wallThick; r.wallHeight = S.job.wallHeight;
  mutate(() => { S.rooms.push(r); S.roomId = r.id; });
  return r;
}
// Copy of a room with fresh wall and cabinet ids, so the two never share anything.
function duplicateRoom(src) {
  const r = clone(src), ids = {};
  r.id = uid('r'); r.name = src.name + ' copy';
  r.walls.forEach(w => { ids[w.id] = uid('w'); w.id = ids[w.id]; });
  r.cabinets.forEach(c => { ids[c.id] = uid('c'); c.id = ids[c.id]; c.wall = ids[c.wall] || c.wall; });
  (r.shapes = r.shapes || []).forEach(s => { s.id = uid('s'); s.wall = ids[s.wall] || s.wall; });
  (r.fixtures = r.fixtures || []).forEach(f => { f.id = uid('fx'); f.wall = ids[f.wall] || f.wall; });
  r.ctRuns = Object.fromEntries(Object.entries(r.ctRuns || {}).map(([k, v]) => [k.split(':').map(p => ids[p] || p).join(':'), v]));
  return r;
}
function roomThumb(r) {
  return withRoom(r, () => {
    const pts = [];
    S.walls.forEach(w => pts.push([w.x1, w.y1], [w.x2, w.y2]));
    if (!pts.length) return '<div class="thumb empty">No walls yet</div>';
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 30;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    let s = '';
    [...S.cabinets].sort((a, b) => (a.cat === 'Wall') - (b.cat === 'Wall')).forEach(c => { const p = cabPoly(c); if (p) s += `<polygon class="${c.cat === 'Wall' ? 'c-wall' : c.cat === 'Tall' ? 'c-tall' : 'c-base'} nss" points="${polyPts(p)}"/>`; });
    S.walls.forEach(wl => { s += `<line class="thumbwall" x1="${wl.x1}" y1="${wl.y1}" x2="${wl.x2}" y2="${wl.y2}" stroke-width="${wl.thick}"/>`; });
    return `<svg class="thumb" viewBox="${x0} ${y0} ${w} ${h}" aria-hidden="true">${s}</svg>`;
  });
}

/* ---------- Job dashboard ---------- */
function renderJob() {
  const j = S.job;
  let parts = 0, ops = 0;
  const per = S.rooms.map(r => withRoom(r, () => {
    const n = {}; S.cabinets.forEach(c => { n[c.cat] = (n[c.cat] || 0) + 1; const b = buildParts(c); b.parts.forEach(p => { parts += p.qty; ops += p.ops.length * p.qty; }); });
    return n;
  }));
  $('#tab-job').innerHTML = `<div class="pagehead"><div><h2>Job</h2><p>Each room has its own walls, cabinets and settings. Open a room to draw in it, or set what every room uses on the Settings tab.</p></div>
    <div class="row-actions"><button class="btn" data-act="jobs">${icon('folder')}Job manager</button><button class="btn" data-act="tab" data-id="settings">Job and room settings</button><button class="btn primary" data-act="room-add">Add room</button></div></div>
  <div class="split2">
    <div class="card cardbody"><h3>Job details</h3>
      ${fld('Job name', 'job', 'name', j.name, 'text', { wide: true })}
      ${fld('Customer', 'job', 'customer', j.customer || '', 'text', { wide: true })}
      <label class="f wide"><span>Customer address</span><textarea data-obj="job" data-field="address" data-type="text" rows="2" aria-label="Customer address" placeholder="Street, town, state, zip">${esc(j.address || '')}</textarea></label>
      ${fld('Cabinet labels', 'job', 'labelStyle', j.labelStyle || 'num', 'select', { options: [{ v: 'num', l: 'Job numbers (#101, #102 … room 2 is #201)' }, { v: 'type', l: 'Type letters (B1, W1, T1)' }], wide: true })}
      <label class="f wide"><span>Notes</span><textarea data-obj="job" data-field="notes" data-type="text" rows="3" aria-label="Notes">${esc(j.notes || '')}</textarea></label>
    </div>
    <div class="card stats"><div class="stat"><span class="eyebrow">Rooms</span><b>${S.rooms.length}</b></div><div class="stat"><span class="eyebrow">Cabinets</span><b>${allCabs().length}</b></div><div class="stat"><span class="eyebrow">Parts</span><b>${parts}</b></div><div class="stat"><span class="eyebrow">Machining ops</span><b>${ops}</b></div>${saveNote ? `<div class="warnbox">${esc(saveNote)}</div>` : ''}</div>
  </div>
  <div class="roomcards">${S.rooms.map((r, i) => {
    const n = per[i], on = r.id === S.roomId, own = Object.keys(r.settings || {}).filter(k => r.settings[k]).length + Object.keys(r.params || {}).length;
    const dt = doorTpl(roomSet('doorT', r)), mt = cabMatT(roomSet('cabMatT', r));
    return `<div class="card roomcard${on ? ' on' : ''}">
      <button class="thumbbtn" data-act="room-open" data-id="${r.id}" aria-label="Open ${esc(r.name)}">${roomThumb(r)}</button>
      <div class="cardbody">
        <div class="pshead">${ctl('room:' + r.id, 'name', r.name, 'text', { label: 'Room name' })}${on ? '<span class="chip cab">Open</span>' : ''}</div>
        <div class="note">${r.walls.length} walls · ${n.Base || 0} base · ${n.Wall || 0} wall · ${n.Tall || 0} tall</div>
        <div class="roomsum">${swatch(mat(doorStyle(dt.door).mat), 16)}<span>${esc(dt.name)}</span></div>
        <div class="roomsum">${swatch(mat(mt.carcass), 16)}<span>${esc(mt.name)}</span></div>
        <div class="note">${own ? `${own} setting${own === 1 ? '' : 's'} different from the job` : 'Uses the job settings'}</div>
        <div class="row-actions"><button class="btn sm primary" data-act="room-open" data-id="${r.id}">Open room</button><button class="btn sm" data-act="room-settings" data-id="${r.id}">Settings</button><button class="btn sm" data-act="room-dup" data-id="${r.id}" title="Duplicate room">${icon('copy')}Copy</button><button class="btn sm danger" data-act="room-del" data-id="${r.id}" title="Delete room" aria-label="Delete room"${S.rooms.length < 2 ? ' disabled' : ''}>${icon('trash')}</button></div>
      </div></div>`;
  }).join('')}<button class="card addroom" data-act="room-add"><span>+</span>Add room</button></div>`;
}

/* ---------- Settings ---------- */
const SETTINGS = [
  { k: 'cabMatT', label: 'Cabinet materials', list: () => opts(S.matTemplates.cabinet), tab: 'materials' },
  { k: 'drawerMatT', label: 'Drawer materials', list: () => opts(S.matTemplates.drawer), tab: 'materials' },
  { k: 'doorT', label: 'Door template', list: () => opts(S.doorTemplates), tab: 'doors' },
  { k: 'pull', label: 'Pulls and knobs', list: () => opts(hwOf('pull')), tab: 'hardware', blank: 'From door template' },
  { k: 'slide', label: 'Drawer slides', list: () => opts(hwOf('slide')), tab: 'hardware' },
  { k: 'hinge', label: 'Hinges', list: () => opts(hwOf('hinge')), tab: 'hardware' },
  { k: 'shelfpin', label: 'Shelf pins', list: () => opts(hwOf('shelfpin')), tab: 'hardware' },
  { k: 'jointU', label: 'Joints, unfinished ends', list: () => opts(hwOf('joint')), tab: 'hardware' },
  { k: 'jointF', label: 'Joints, finished ends', list: () => opts(hwOf('joint')), tab: 'hardware' },
  { k: 'leg', label: 'Legs', list: () => opts(hwOf('leg')), tab: 'hardware' },
  { k: 'finish', label: 'Finish', list: () => azOpts(finishList()), tab: 'materials' },
  { k: 'panelDoor', label: 'Applied end panel door style', list: () => opts(S.doorStyles), tab: 'doors', blank: 'Same as the doors' },
  { k: 'panelStyle', label: 'Applied end panel fit', list: () => opts(S.panels), tab: 'panels' },
  { k: 'faceFrame', label: 'Construction', list: () => ffOpts(), tab: 'faceframes' },
  { k: 'partT', label: 'Part template (edgebanding)', list: () => opts(S.partTemplates), tab: 'parts' },
  { k: 'countertop', label: 'Countertop', list: () => opts(S.countertops), tab: 'countertops' },
  { k: 'molding', label: 'Quick molding', list: () => opts(S.moldings), tab: 'moldings' },
];
// Clears the picks under a Settings page pick so it reaches every cabinet: room ones too when it is the whole job's.
// Mini cabinets keep the mini picks their library gives them (3/4 melamine kit, no hinges or joints).
function setFollowDown(k, room) {
  let n = 0;
  (room ? [room] : S.rooms).forEach(r => {
    if (!room && r.settings && r.settings[k]) { delete r.settings[k]; n++; }
    if (SETTING_FIELDS.includes(k)) (r.cabinets || []).forEach(c => { if (c[k] && !/^mini-/.test(c.libId || '')) { c[k] = ''; n++; } });
  });
  return n;
}
function settingPreview(k, id) {
  if (k === 'doorT') { const t = doorTpl(id); return swatch(mat(doorStyle(t.door).mat), 16); }
  if (k === 'cabMatT') return swatch(mat(cabMatT(id).carcass), 16);
  if (k === 'drawerMatT') return swatch(mat(drawerMatT(id).sides), 16);
  if (k === 'countertop') return swatch(mat(countertop(id).mat), 16);
  if (k === 'panelDoor') return id ? swatch(mat(doorStyle(id).mat), 16) : '';
  if (k === 'finish') { const f = finishList().find(x => x.id === id) || finishList()[0]; return f ? swatch(mat(f.front), 16) : ''; }
  return '';
}
/* ---------- Material template: door, cabinet and drawer materials for the whole job in one pick ---------- */
const matSetNow = () => matSets().find(t => MAT_SET_KEYS.every(k => t[k] === S.job.defaults[k]));
// Picking a template sets the job and clears room and cabinet picks of those three, so every cabinet changes. Undo puts them back.
function applyMatSet(id) {
  const t = matSets().find(x => x.id === id); if (!t) return;
  let own = 0;
  mutate(() => MAT_SET_KEYS.forEach(k => {
    S.job.defaults[k] = t[k];
    S.rooms.forEach(r => { if (r.settings && r.settings[k]) { delete r.settings[k]; own++; } r.cabinets.forEach(c => { if (c[k]) { c[k] = ''; own++; } }); });
  }));
  flash(`Every cabinet now uses ${t.name}${own ? `. ${own} room or cabinet pick${own === 1 ? ' was' : 's were'} reset; Undo puts ${own === 1 ? 'it' : 'them'} back` : ''}.`);
}
function saveMatSet() {
  const d = S.job.defaults, t = { id: uid('ms'), name: `${doorTpl(d.doorT).name}, ${(finishList().find(f => f.id === d.finish) || {}).name || cabMatT(d.cabMatT).name}`, doorT: d.doorT, finish: d.finish, cabMatT: d.cabMatT, drawerMatT: d.drawerMatT };
  mutate(() => matSets().push(t)); flash(`Saved as “${t.name}”. Rename it under Libraries › Materials.`);
}
function matSetPick() {
  const now = matSetNow();
  return `<label class="setx-tpl"><span>Template</span><select data-act-change="mat-set" aria-label="Material template for the whole job">${now ? '' : '<option value="" selected>Own picks</option>'}${matSets().map(t => `<option value="${t.id}"${now && now.id === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    ${now ? '' : '<button class="btn" data-act="mat-set-save">Save as template</button>'}<button class="btn" data-act="tab" data-id="materials" title="Edit templates">${icon('edit')}</button>`;
}
/* ---------- Templates and hardware: picture tiles by category, like Mozaik ---------- */
const TPL_CATS = [
  ['fronts', 'Doors and fronts', ['doorT', 'dt.door', 'dt.wallDoor', 'dt.drawerTop', 'dt.drawer', 'dt.drawerBot', 'dt.falseFront', 'pull', 'hinge']],
  ['drawers', 'Drawers', ['drawerMatT', 'slide']],
  ['box', 'Cabinet and panels', ['faceFrame', 'cabMatT', 'finish', 'panelDoor', 'panelStyle', 'shelfpin', 'jointU', 'jointF', 'leg', 'partT']],
  ['tops', 'Tops and molding', ['countertop', 'molding']],
  ['walls', 'Walls', ['wallThick', 'wallHeight']],
];
const TPL_WALL = { wallThick: 'New wall thickness', wallHeight: 'Ceiling height' };
// Styles inside the picked door template, shown as their own tiles like Mozaik's base door, wall door and drawer fronts.
const TPL_DT = { door: ['Base door'], wallDoor: ['Wall door', 'Same as base door'], drawerTop: ['Top drawer front', 'Same as mid drawer fronts'], drawer: ['Mid drawer fronts'], drawerBot: ['Bottom drawer front', 'Same as mid drawer fronts'], falseFront: ['False front'] };
const dtKeys = ks => ks.filter(k => !k.startsWith('dt.'));
function stylePic(id, drawer, lc) {
  const ds = doorStyle(id), c = lc || (mat(ds.mat) || {}).color || '#d8d2c4';
  return `<svg viewBox="0 0 120 90" aria-hidden="true">${drawer ? frontPic(ds, c, 14, 26, 92, 38, 24, 9.5) : frontPic(ds, c, 33, 5, 54, 80, 15, 22)}</svg>`;
}
// One front drawn with its depth: the field of a shaker sits low (shadow under the top rail and left stile, a light
// edge along the bottom and right), a raised panel shows its four slopes light and dark, glass is pale blue. Light comes
// from the upper left, like the 3D preview. Laid out from the style's own stiles, rails and mid rails at about wd x ht inches.
function frontPic(ds, c, x, y, w, h, wd, ht) {
  const framed = ds.type !== 'slab', lay = doorLayout(ds, wd, ht, framed), kx = w / wd, ky = h / ht;
  const X = v => +(x + v * kx).toFixed(2), Y = v => +(y + h - v * ky).toFixed(2), poly = (pts, f) => `<path d="M${pts.map(p => p.join(' ')).join(' L')} Z" fill="${f}"/>`;
  let o = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${c}"/>`;
  lay.fields.forEach(fl => {
    const a = X(fl.x0), b = X(fl.x1), t = Y(fl.z1), u = Y(fl.z0), e = framed ? 1.6 : 0;
    if (framed) {
      if (fl.pt === 'glass') o += `<rect x="${a}" y="${t}" width="${b - a}" height="${u - t}" fill="#cfe1ea"/><path d="M${a + 3} ${u - 4} L${a + 10} ${t + 4}" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>`;
      else if (fl.pt === 'open') o += `<rect x="${a}" y="${t}" width="${b - a}" height="${u - t}" fill="#2b2b2b" fill-opacity=".55"/>`;
      // Sunk field: the frame shades its top and left inside edge, the bottom and right edges catch the light.
      o += poly([[a, t], [b, t], [b - e, t + e], [a + e, t + e], [a + e, u - e], [a, u]], 'rgba(0,0,0,.30)') + poly([[b, t], [b, u], [a, u], [a + e, u - e], [b - e, u - e], [b - e, t + e]], 'rgba(255,255,255,.75)');
      if (fl.pt === 'raised') {
        const r = Math.min((ds.raiseW || 1.75), (fl.x1 - fl.x0) / 2 - 0.5, (fl.z1 - fl.z0) / 2 - 0.5);
        if (r > 0.2) { const A = a + e, B = b - e, T = t + e, U = u - e, ra = A + r * kx, rb = B - r * kx, rt = T + r * ky, ru = U - r * ky;
          o += poly([[A, T], [B, T], [rb, rt], [ra, rt]], 'rgba(255,255,255,.55)') + poly([[A, T], [ra, rt], [ra, ru], [A, U]], 'rgba(255,255,255,.3)')
            + poly([[A, U], [ra, ru], [rb, ru], [B, U]], 'rgba(0,0,0,.24)') + poly([[B, T], [B, U], [rb, ru], [rb, rt]], 'rgba(0,0,0,.14)')
            + `<rect x="${ra}" y="${rt}" width="${+(rb - ra).toFixed(2)}" height="${+(ru - rt).toFixed(2)}" fill="none" stroke="#555" stroke-opacity=".35" stroke-width=".6"/>`; }
      }
    }
    if (ds.design && ds.design !== 'none' && fl.pt !== 'glass' && fl.pt !== 'open' && typeof designLines === 'function')
      designLines(ds, fl).forEach(l => { o += `<path d="M${X(l.x1)} ${Y(l.z1)} L${X(l.x2)} ${Y(l.z2)}" stroke="rgba(0,0,0,.35)" stroke-width=".9"/><path d="M${X(l.x1) + 0.9} ${Y(l.z1)} L${X(l.x2) + 0.9} ${Y(l.z2)}" stroke="rgba(255,255,255,.7)" stroke-width=".6"/>`; });
  });
  // The door's own edge: light along the top and left, a little shade along the bottom and right.
  o += `<path d="M${x + 0.6} ${y + h - 0.6} V${y + 0.6} H${x + w - 0.6}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.2"/><path d="M${x + w - 0.6} ${y + 0.6} V${y + h - 0.6} H${x + 0.6}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1.2"/>`;
  return o + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="none" stroke="#555"/>`;
}
// A small drawing for each tile, in the colors of what is picked.
function tplPic(k, id, lc) {
  const col = m => lc || (m && m.color) || '#d8d2c4', svg = b => `<svg viewBox="0 0 120 90" aria-hidden="true">${b}</svg>`;
  if (k === 'doorT') {
    const t = doorTpl(id), ds = doorStyle(t.door), c = col(mat(ds.mat)), p = hw(t.pull);
    return svg(`${frontPic(ds, c, 33, 5, 54, 80, 15, 22)}<rect x="78" y="34" width="3" height="22" rx="1.5" fill="${(typeof txqColor === 'function' && texPickOf('pulls') && pickColor(texPickOf('pulls'))) || (p && p.finish) || '#333'}"/>`);
  }
  if (k === 'cabMatT' || k === 'drawerMatT') {
    const t = k === 'cabMatT' ? cabMatT(id) : drawerMatT(id), c = col(mat(k === 'cabMatT' ? t.carcass : t.sides));
    return k === 'cabMatT'
      ? svg(`<path d="M30 24 L60 12 L94 22 L94 74 L64 86 L30 76 Z" fill="${c}" stroke="#555"/><path d="M30 24 L64 34 L94 22 M64 34 L64 86" fill="none" stroke="#555"/><path d="M36 30 L60 37 L60 78 L36 71 Z" fill="#000" fill-opacity=".12"/>`)
      : svg(`<path d="M22 40 L58 28 L100 38 L100 62 L64 74 L22 64 Z" fill="${c}" stroke="#555"/><path d="M22 40 L64 50 L100 38 M64 50 L64 74" fill="none" stroke="#555"/><path d="M28 44 L60 52 L96 42" fill="none" stroke="#555" stroke-opacity=".4"/>`);
  }
  if (k === 'panelDoor') { const ds = id ? doorStyle(id) : doorStyle(doorTpl(S.job.defaults.doorT).door), c = col(mat(ds.mat)); return svg(frontPic(ds, c, 44, 4, 32, 82, 12, 30)); }
  if (k === 'finish') { const f = finishList().find(x => x.id === id) || finishList()[0], m = f && mat(f.front); return svg(`<rect x="20" y="10" width="38" height="72" rx="1.5" fill="${col(m)}" stroke="#555"/><rect x="62" y="10" width="38" height="72" rx="1.5" fill="${col(m)}" stroke="#555"/><rect x="28" y="20" width="22" height="52" fill="none" stroke="#555" stroke-opacity=".45"/><rect x="70" y="20" width="22" height="52" fill="none" stroke="#555" stroke-opacity=".45"/>`); }
  if (k === 'panelStyle') return svg('<rect x="44" y="4" width="32" height="82" fill="#e8e1d2" stroke="#555"/><path d="M76 10 h14 M76 80 h14" stroke="var(--accent)" stroke-width="2"/>');
  if (k === 'faceFrame') { const t = (S.faceFrames || []).find(f => f.id === id); return t ? ffPic(t) : svg('<rect x="38" y="8" width="44" height="74" fill="#e8e1d2" stroke="#555"/><rect x="40" y="10" width="40" height="70" fill="none" stroke="#555" stroke-opacity=".4"/>'); }
  if (k === 'partT') return svg('<rect x="20" y="30" width="80" height="30" fill="#e8e1d2" stroke="#555"/><rect x="20" y="56" width="80" height="4" fill="var(--accent)"/><text x="60" y="80" text-anchor="middle" font-size="10" fill="currentColor">banded edge</text>');
  if (k === 'countertop') { const t = countertop(id), c = col(mat(t.mat)); return svg(`<path d="M10 40 L40 26 L112 26 L82 40 Z" fill="${c}" stroke="#555"/><path d="M10 40 L82 40 L82 48 L10 48 Z" fill="${c}" stroke="#555"/><path d="M82 40 L112 26 L112 34 L82 48 Z" fill="#000" fill-opacity=".15" stroke="#555"/>`); }
  if (k === 'molding') {
    // The picked molding's own side profile on the corner of a cabinet top, scaled to fill the tile.
    const m = S.moldings.find(x => x.id === id); if (!m) return svg('<text x="60" y="50" text-anchor="middle" font-size="11" fill="currentColor">None</text>');
    const h = Math.max(0.25, +m.h || 0), d = Math.max(0.25, +m.d || 0), sc = Math.min(70 / h, 62 / d), x0 = 60 - (d * sc) / 2 + 6, y0 = m.bottom ? 10 : 80;
    // A light rail hangs under the cabinet bottom, so it is drawn upside down below it.
    return svg(`<rect x="${x0 - 46}" y="${m.bottom ? 1 : y0}" width="46" height="9" fill="#e8e1d2" stroke="#555"/><g transform="translate(${x0} ${y0}) scale(${r3(sc)} ${r3(m.bottom ? -sc : sc)})">${moldProfileShape(m, col(mat(m.mat)), r3(1.2 / sc))}</g>`);
  }
  if (k === 'pull') { const p = id ? hw(id) : null, f = lc || (p && p.finish) || '#555'; return svg(`<rect x="26" y="40" width="68" height="7" rx="3.5" fill="${f}"/><rect x="34" y="46" width="5" height="10" fill="${f}"/><rect x="81" y="46" width="5" height="10" fill="${f}"/>${p ? '' : '<text x="60" y="76" text-anchor="middle" font-size="10" fill="currentColor">from door template</text>'}`); }
  if (k === 'slide') return svg('<rect x="12" y="34" width="96" height="9" rx="2" fill="#b7bcc4" stroke="#666"/><rect x="22" y="46" width="86" height="8" rx="2" fill="#d4d8de" stroke="#666"/><rect x="8" y="56" width="16" height="10" rx="2" fill="#e05252"/>');
  if (k === 'hinge') return svg('<circle cx="36" cy="46" r="15" fill="#c9ced6" stroke="#666"/><circle cx="36" cy="46" r="9" fill="#9aa1ab"/><rect x="48" y="40" width="44" height="12" rx="3" fill="#b7bcc4" stroke="#666"/><rect x="84" y="30" width="18" height="32" rx="2" fill="#d4d8de" stroke="#666"/>');
  if (k === 'shelfpin') return svg('<rect x="28" y="20" width="10" height="56" fill="#e8e1d2" stroke="#555"/><circle cx="33" cy="32" r="2" fill="#555"/><circle cx="33" cy="44" r="2" fill="#555"/><circle cx="33" cy="56" r="2" fill="#555"/><circle cx="33" cy="68" r="2" fill="#555"/><rect x="38" y="42" width="14" height="5" rx="2" fill="#9aa1ab"/><rect x="38" y="47" width="62" height="6" fill="#e8e1d2" stroke="#555"/>');
  if (k === 'jointU' || k === 'jointF') { const h = hw(id) || {}, dowel = /dowel/i.test(h.name || '');
    return svg(`<rect x="14" y="10" width="16" height="72" fill="#e8e1d2" stroke="#555"/><rect x="30" y="56" width="80" height="16" fill="#e8e1d2" stroke="#555"/>${dowel ? '<rect x="22" y="61" width="22" height="6" rx="3" fill="#c9a77a" stroke="#7a5c33"/>' : '<rect x="6" y="61" width="6" height="6" fill="#666"/><path d="M12 64 H58" stroke="#666" stroke-width="3" stroke-dasharray="3 2"/>'}${k === 'jointF' ? '<path d="M8 16 L14 10" stroke="#2563eb" stroke-width="3"/>' : ''}`); }
  if (k === 'leg') return svg('<rect x="14" y="20" width="92" height="14" fill="#e8e1d2" stroke="#555"/><rect x="26" y="34" width="12" height="40" rx="2" fill="#3a3f47"/><rect x="82" y="34" width="12" height="40" rx="2" fill="#3a3f47"/><rect x="21" y="72" width="22" height="6" rx="2" fill="#3a3f47"/><rect x="77" y="72" width="22" height="6" rx="2" fill="#3a3f47"/>');
  if (k === 'wallThick') return svg('<rect x="44" y="8" width="32" height="76" fill="#3a4250"/><path d="M40 92 L80 92" stroke="currentColor"/>');
  if (k === 'wallHeight') return svg('<rect x="30" y="8" width="60" height="76" fill="#d9dcd8" stroke="#555"/><path d="M100 8 L100 84 M96 8 L104 8 M96 84 L104 84" stroke="currentColor"/>');
  return svg('');
}
// The sample cabinet in the settings preview, built with the picks of the room being edited.
let tplSampleArgs = null, tplViewer = null;
function tplSample(prevId) {
  const c = sampleCab(), l = libItem(prevId);
  if (l) Object.assign(c, newCab(S, l, null, 1, 0), { id: '_sample' });
  return c;
}
// Light for the settings preview: a low light from the upper left rakes across the fronts, so the frame of a
// shaker throws a thin shadow into its panel and a raised panel's slopes turn light and dark. Look only.
function tplLight(v, c) {
  const r = v.renderer, sun = v.sun, sh = sun.shadow, R = Math.max(c.w, c.h, c.d) * 0.75 + 4;
  if (!r.shadowMap.enabled) { r.shadowMap.enabled = true; [plain3, metal3, matCache3].forEach(m => Object.values(m).forEach(x => { if (x && x.isMaterial) x.needsUpdate = true; })); }
  sun.castShadow = true; sun.intensity = 1.15; v.hemi.intensity = 0.5; v.hemi.groundColor.set(0x6f6a60); v.fill.intensity = 0.12;
  sh.bias = -0.0004; sh.normalBias = 0.02; sh.radius = 1.5;
  const ctr = new THREE.Vector3(0, c.h / 2, c.d / 2);
  sun.target.position.copy(ctr); sun.position.copy(ctr).add(new THREE.Vector3(-0.72, 0.58, 0.38).normalize().multiplyScalar(R * 2));
  const cam = sh.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = R * 4; cam.updateProjectionMatrix();
  v.root.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow = !o.userData.noBounds; o.receiveShadow = true; } });
}
function mountTpl3D(keep) {
  const slot = $('#tpl3d-slot'); if (!slot) return;
  if (keep) slot.replaceWith(keep); else slot.id = 'tpl3d';
  const host = $('#tpl3d');
  if (!tplViewer) { tplViewer = new Viewer3D(host); viewers.push(tplViewer); }
  else if (tplViewer.host !== host && tplViewer.ok) { host.appendChild(tplViewer.renderer.domElement); tplViewer.host = host; new ResizeObserver(() => tplViewer.resize()).observe(host); }
  const v = tplViewer; if (!v.ok || !tplSampleArgs) return;
  const [r0, prevId] = tplSampleArgs;
  v.setBackground(cssVar('--paper')); v.clear();
  withRoom(r0, () => { const c = tplSample(prevId), m = cabinetMeshes(c); m.position.x = -c.w / 2; v.root.add(m);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(c.w + 40, c.d + 40), flat3(cssVar('--floor3d'))); fl.rotation.x = -Math.PI / 2; fl.position.set(0, -0.02, c.d / 2); fl.userData.noBounds = true; v.root.add(fl);
    tplLight(v, c);
    v.resize();
    // Frame it again when the cabinet or the size of the preview changes (the preview column is tall and narrow).
    const sz = host.clientWidth + 'x' + host.clientHeight;
    if (v.fittedFor !== prevId || v.fittedSz !== sz) { v.fittedFor = prevId; v.fittedSz = sz; v.look({ x: -0.8, y: 0.55, z: 1.4 }); if (v.cam.isPerspectiveCamera) { v.cam.position.lerp(v.controls.target, 0.28); v.controls.update(); } } });
  v.requestRender();
}
function renderTplTab() {
  // Like Mozaik, settings open on the room you are working in; Whole job sets what every room starts from.
  const scope = ui.tplScope === undefined || ui.tplScope === null ? curRoom() : ui.tplScope && roomById(ui.tplScope) ? roomById(ui.tplScope) : null, cat = TPL_CATS.find(c => c[0] === ui.tplCat) || TPL_CATS[0], d = S.job.defaults;
  const r0 = scope || curRoom();
  const tile = k => {
    if (k.startsWith('dt.')) {
      const f = k.slice(3), [label, blank] = TPL_DT[f], dt = doorTpl(scope ? roomSet('doorT', scope) : d.doorT), v = dt[f] || '';
      const eff = v || (f === 'wallDoor' ? dt.door : dt.drawer);
      return `<div class="tpltile"><div class="tt-h">${label}</div><div class="tt-pic">${stylePic(eff, /drawer|false/i.test(f), typeof txqColor === 'function' ? txqColor('doorT', scope ? scope.id : '') : '')}</div>${ctl('dtpl:' + dt.id, f, v, 'select', { options: [...(blank ? [{ v: '', l: blank }] : []), ...opts(S.doorStyles)], label })}
        <div class="tt-f"><span class="tt-in">in ${esc(dt.name)}</span><button class="linkbtn" data-act="tab" data-id="doors">Door designer</button></div></div>`;
    }
    if (TPL_WALL[k]) {
      const own = scope && scope[k] !== undefined && scope[k] !== S.job[k];
      return `<div class="tpltile${own ? ' own' : ''}"><div class="tt-h">${TPL_WALL[k]}</div><div class="tt-pic">${tplPic(k)}</div>${scope ? ctl('room:' + scope.id, k, scope[k] ?? S.job[k], 'len', { label: TPL_WALL[k] }) : ctl('job', k, S.job[k], 'len', { label: TPL_WALL[k] })}${own ? '<span class="tt-own">This room</span>' : ''}</div>`;
    }
    const sd = SETTINGS.find(x => x.k === k), list = sd.list();
    const v = scope ? (scope.settings || {})[k] || '' : d[k] || '', eff = scope ? roomSet(k, scope) : d[k] || '';
    const lc = typeof txqColor === 'function' ? txqColor(k, scope ? scope.id : '') : '';
    const pic = k === 'pull' && !eff ? tplPic('pull', doorTpl(scope ? roomSet('doorT', scope) : d.doorT).pull, lc) : tplPic(k, eff, lc);
    const qa = typeof qmOpt === 'function' ? qmOpt(k) : [];
    const sel = scope ? ctl('rset:' + scope.id, k, v, 'select', { options: [...setOpts(k, list), ...qa], label: sd.label + ' for ' + scope.name })
      : ctl('jobd', k, v, 'select', { options: [...(sd.blank ? [{ v: '', l: sd.blank }, ...list] : list), ...qa], label: sd.label });
    return `<div class="tpltile${scope && v ? ' own' : ''}"><div class="tt-h">${sd.label.replace(' (edgebanding)', '')}</div><div class="tt-pic">${pic}</div>${sel}${typeof txqBtn === 'function' ? txqBtn(k, scope ? scope.id : '') : ''}
      <div class="tt-f">${scope && v ? '<span class="tt-own">This room</span>' : ''}<button class="linkbtn" data-act="tab" data-id="${sd.tab}">Edit library</button></div></div>`;
  };
  const lib = S.library.filter(l => l.cat !== 'Shape'), prevId = lib.some(l => l.id === ui.tplPrev) ? ui.tplPrev : (libItem('b-1d1dr') ? 'b-1d1dr' : (lib[0] || {}).id);
  const is3d = ui.tpl3d !== false;
  tplSampleArgs = [r0, prevId];
  const preview = is3d ? '<div id="tpl3d-slot"></div>' : withRoom(r0, () => frontPreviewSVG(tplSample(prevId), 360, 0, false));
  const own = scope ? Object.values(scope.settings || {}).filter(Boolean).length : 0;
  const cabOwn = scope ? scope.cabinets.reduce((n, c) => n + SETTING_FIELDS.filter(k => c[k]).length, 0) : 0;
  const foot = `<div class="tplfoot${(scope ? own || cabOwn : S.rooms.some(r => Object.values(r.settings || {}).some(Boolean))) ? '' : ' helponly'}">${scope ? `${own ? `${own} pick${own === 1 ? '' : 's'} in ${esc(scope.name)} differ from the job. <button class="linkbtn" data-act="set-room-job" data-id="${scope.id}">Use the job picks</button>` : `${esc(scope.name)} uses the job picks. Change a tile to give this room its own.`}${cabOwn ? ` · ${cabOwn} pick${cabOwn === 1 ? '' : 's'} on single cabinets. <button class="linkbtn" data-act="set-room-follow" data-id="${scope.id}">Make cabinets follow the room</button>` : ''}`
        : `These picks are for every room. Pick a room above to give it its own.${S.rooms.some(r => Object.values(r.settings || {}).some(Boolean)) ? ' <button class="linkbtn" data-act="set-job-all">Make every room follow the job</button>' : ''}`}</div>`;
  // The parts of the Settings screen that belong to these picks: the sample cabinet on the left, who the picks are for, and the tiles.
  return {
    prev: `<aside class="setx-prev"><div class="setx-pic${is3d ? ' is3d' : ''}">${preview}</div>
      <div class="setx-prevbar"><select data-act-change="tpl-prev" aria-label="Preview cabinet">${lib.map(l => `<option value="${l.id}"${l.id === prevId ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Preview">${[['3d', '3D'], ['2d', 'Front']].map(([k, l]) => `<button data-act="tpl-3d" data-id="${k}" aria-pressed="${(k === '3d') === is3d}">${l}</button>`).join('')}</div></div>
      <div class="note">Shown with ${scope ? esc(scope.name) + "'s" : 'the job'} picks.</div></aside>`,
    scope: `<label class="setx-for"><span>Settings for</span><select data-act-change="tpl-scope" aria-label="Settings for">${[['', 'Whole job'], ...S.rooms.map(r => [r.id, r.name])].map(([id, l]) => `<option value="${id}"${(scope ? scope.id : '') === id ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${scope ? `<button class="btn${ui.roomNotes ? ' primary' : ''}" data-act="room-notes">${icon('list')}Room notes</button>` : ''}`,
    notes: scope && ui.roomNotes ? `<label class="f wide roomnotes"><span>Notes for ${esc(scope.name)}</span><textarea data-obj="room:${scope.id}" data-field="notes" data-type="text" rows="3" aria-label="Room notes">${esc(scope.notes || '')}</textarea></label>` : '',
    body: `<div class="tplgrid">${cat[2].map(tile).join('')}</div>${cat[0] === 'fronts' ? `<div class="note tplnote">Base door, wall door and drawer front tiles change the door template itself, so every room using it changes too.</div>` : ''}${foot}`,
  };
}
// Job dashboard: one row per room, a tab per group of settings, like Mozaik's. Picks left on "Job" follow the whole job.
function renderDash() {
  const cat = TPL_CATS.find(c => c[0] === ui.dashCat) || TPL_CATS[0], n = S.rooms.length;
  const cell = (r, k) => {
    if (TPL_WALL[k]) return ctl('room:' + r.id, k, r[k] ?? S.job[k], 'len', { label: TPL_WALL[k] + ' for ' + r.name });
    const sd = SETTINGS.find(x => x.k === k), v = (r.settings || {})[k] || '';
    return `<div class="setcell${v ? ' own' : ''}">${settingPreview(k, roomSet(k, r))}${ctl('rset:' + r.id, k, v, 'select', { options: [...setOpts(k, sd.list()), ...(typeof qmOpt === 'function' ? qmOpt(k) : [])], label: sd.label + ' for ' + r.name })}</div>`;
  };
  const label = k => TPL_WALL[k] || SETTINGS.find(x => x.k === k).label.replace(' (edgebanding)', '');
  return `<div class="card dashcard"><div class="cardhead"><h3>${icon('home')}Rooms in this job</h3><div class="row-actions"><button class="btn" data-act="dash-csv">${icon('download')}Export</button><button class="btn primary" data-act="room-add">${icon('plus')}Add room</button></div></div>
    <div class="subtabs dashcats" role="tablist">${TPL_CATS.map(([id, l]) => `<button role="tab" data-act="dash-cat" data-id="${id}" aria-selected="${cat[0] === id}">${l}</button>`).join('')}</div>
    <div class="tscroll"><table class="t dashtable"><thead><tr><th></th><th>Room</th><th class="r">Cabinets</th>${dtKeys(cat[2]).map(k => `<th>${label(k)}</th>`).join('')}<th></th></tr></thead><tbody>
    ${S.rooms.map((r, i) => `<tr class="${r.id === S.roomId ? 'on' : ''}"><td class="mv"><button class="btn sm iconbtn" data-act="room-move" data-id="${r.id}:-1" title="Move up" aria-label="Move ${esc(r.name)} up"${i ? '' : ' disabled'}>↑</button><button class="btn sm iconbtn" data-act="room-move" data-id="${r.id}:1" title="Move down" aria-label="Move ${esc(r.name)} down"${i < n - 1 ? '' : ' disabled'}>↓</button></td>
      <td style="min-width:150px">${ctl('room:' + r.id, 'name', r.name, 'text', { label: 'Room name' })}</td><td class="n">${r.cabinets.length}</td>
      ${dtKeys(cat[2]).map(k => `<td style="min-width:${TPL_WALL[k] ? 100 : 190}px">${cell(r, k)}</td>`).join('')}
      <td><div class="row-actions nowrap"><button class="btn sm primary" data-act="room-open" data-id="${r.id}">Open</button><button class="btn sm" data-act="room-dup" data-id="${r.id}" title="Duplicate room">${icon('copy')}Copy</button><button class="btn sm danger" data-act="room-del" data-id="${r.id}" title="Delete room" aria-label="Delete room"${n < 2 ? ' disabled' : ''}>${icon('trash')}</button></div></td></tr>`).join('')}
    </tbody></table></div><div class="cardbody"><div class="note">Outlined picks are the room's own. "Job ·" picks follow Templates and hardware.</div></div></div>`;
}
// Every room's picks, by name, for a spreadsheet.
function dashCSV() {
  const ks = dtKeys(TPL_CATS.flatMap(c => c[2]));
  const name = (k, r) => { if (TPL_WALL[k]) return fmtLen(r[k] ?? S.job[k]); const sd = SETTINGS.find(x => x.k === k), id = roomSet(k, r); return ((sd.list().find(o => o.v === id) || {}).l) || (k === 'pull' ? 'From door template' : sd.blank || ''); };
  const rows = [['Room', 'Cabinets', ...ks.map(k => TPL_WALL[k] || SETTINGS.find(x => x.k === k).label)], ...S.rooms.map(r => [r.name, r.cabinets.length, ...ks.map(k => name(k, r))])];
  return rows.map(r => r.map(csvq).join(',')).join('\n');
}
function renderSettings() {
  const rooms = S.rooms;
  if (ui.setRoom && !roomById(ui.setRoom)) ui.setRoom = null;
  const head = `<tr><th>Setting</th><th class="jobcol">Whole job</th>${rooms.map(r => `<th class="${r.id === ui.setRoom ? 'hl' : ''}">${esc(r.name)}${r.id === S.roomId ? ' <span class="chip cab">Open</span>' : ''}</th>`).join('')}</tr>`;
  const pRow = pd => {
    const jv = S.job.params[pd.k];
    const shown = v => pd.type === 'len' ? fmtLen(v) : v;
    return `<tr><td>${pd.label}</td><td class="jobcol">${pd.type === 'select' ? ctl('jobp', pd.k, jv, 'select', { options: pd.options, label: pd.label }) : ctl('jobp', pd.k, jv, pd.type, { label: pd.label })}</td>
      ${rooms.map(r => { const own = has(r.params, pd.k); return `<td class="${own ? 'own' : ''}${r.id === ui.setRoom ? ' hl' : ''}">${pd.type === 'select'
        ? ctl('roomp:' + r.id, pd.k, own ? r.params[pd.k] : '', 'select', { options: [{ v: '', l: 'Job: ' + ((pd.options.find(o => (o.v ?? o) === jv) || {}).l || jv) }, ...pd.options], label: pd.label + ' for ' + r.name })
        : ctl('roomp:' + r.id, pd.k, own ? r.params[pd.k] : '', pd.type, { label: pd.label + ' for ' + r.name, ph: 'Job ' + shown(jv), blank: true })}</td>`; }).join('')}</tr>`;
  };
  const pRows = paramGroups(PARAM_DEFS).map(([g, gl, ds]) => pgroupRow(g, gl, rooms.length + 2, ds.length) + (paramShut(g) ? '' : ds.map(pRow).join(''))).join('');
  // One row of tabs like Mozaik's settings: the picture-tile groups first, then the rest.
  const tabsS = [...TPL_CATS.map(([k, l]) => ['cat:' + k, l]), ['params', 'Construction'], ['rooms', 'Rooms'], ['vars', 'Variables'], ['look', 'Look and feel'], ['company', 'Company']];
  if (!ui.setTab || ui.setTab === 'templates') ui.setTab = 'templates';
  const st = ui.setTab, cur = st === 'templates' ? 'cat:' + ((TPL_CATS.find(c => c[0] === ui.tplCat) || TPL_CATS[0])[0]) : st;
  const tp = st === 'templates' || st === 'params' ? renderTplTab() : null;
  const body = st === 'rooms' ? renderDash()
    : st === 'templates' ? tp.body
    : st === 'vars' ? renderVars() + (typeof fxVarsExtra === 'function' ? fxVarsExtra() : '')
    : st === 'look' ? renderLook()
    : st === 'company' && typeof companyCard === 'function' ? companyCard()
    : (typeof methodsBox === 'function' ? methodsBox() : '') + `<div class="card"><div class="cardhead"><h3>${icon('sliders')}Construction parameters</h3><span class="note">Leave a room cell blank to use the job value. Library templates and single cabinets can still override.</span></div>
    <div class="tscroll"><table class="t settable"><thead>${head}</thead><tbody>${pRows}</tbody></table></div></div>`;
  const keep3d = $('#tpl3d');
  $('#tab-settings').innerHTML = `<div class="setx${tp ? '' : ' noprev'}">
    ${tp ? tp.prev : ''}
    <section class="setx-main">
      <div class="setx-top">${st === 'templates' ? tp.scope : '<h2>Settings</h2>'}<div class="setx-r">${matSetPick()}</div></div>
      ${st === 'templates' ? tp.notes : ''}
      <div class="setx-tabs" role="tablist">${tabsS.map(([k, l]) => `<button role="tab" data-act="${k.startsWith('cat:') ? 'set-cat' : 'set-tab'}" data-id="${k.replace('cat:', '')}" aria-selected="${cur === k}">${l}</button>`).join('')}</div>
      <div class="setx-body">${body}</div>
    </section></div>`;
  if (tp && ui.tpl3d !== false) requestAnimationFrame(() => mountTpl3D(keep3d));
}
document.addEventListener('change', e => {
  const ms = e.target.closest('[data-act-change="mat-set"]'); if (ms) { applyMatSet(ms.value); return; }
  const sc = e.target.closest('[data-act-change="tpl-scope"]'); if (sc) { ui.tplScope = sc.value || ''; renderSettings(); return; }
  const el = e.target.closest('[data-act-change="tpl-prev"]'); if (!el) return;
  ui.tplPrev = el.value; renderSettings();
});
