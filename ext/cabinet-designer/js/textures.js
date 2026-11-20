/* ---------- Textures (0.48.3): how each surface looks, kept apart from what it is made of ----------
   A pick is '#rrggbb' (a paint color), 'textures/...' (a photo from the texture library) or 'm:<material id>' (that
   material's look). Picks are saved as tex: { surface: pick } on the job (S.job.tex), a room (room.tex) or one cabinet
   (c.tex). A blank pick follows the level above, and with no pick anywhere a surface shows its material, so the door
   style, cabinet materials and finish material still decide the look until a texture is picked. Textures never change
   the cut list or the price. */
'use strict';
const TEX_SURF = [
  ['doors', 'Doors'], ['drawers', 'Drawer fronts'], ['finished', 'Finished ends'], ['inside', 'Cabinet inside'],
  ['toe', 'Toe skin'], ['drawerBox', 'Drawer boxes'], ['pulls', 'Pulls'], ['tops', 'Countertops'], ['molding', 'Molding'],
  ['walls', 'Walls'], ['floor', 'Floor'],
];
// Surfaces a single cabinet can have its own pick for; tops, walls and floor belong to the room. A cabinet's molding
// pick colors the molding run it is in (0.58.16).
const TEX_CAB = ['doors', 'drawers', 'finished', 'inside', 'toe', 'drawerBox', 'pulls', 'molding'];
// The first tile sets these three at once, for a one-color job.
const TEX_ALL = ['doors', 'drawers', 'finished'];
const TEX_PAINTS = [['#ffffff', 'White'], ['#f3efe6', 'Off-white'], ['#ece3cf', 'Cream'], ['#d9d6cf', 'Light grey'], ['#a9a8a3', 'Grey'], ['#5f6266', 'Charcoal'],
  ['#232427', 'Black'], ['#2a3a55', 'Navy'], ['#4f6f8f', 'Blue'], ['#8f9f86', 'Sage'], ['#3f5a45', 'Green'], ['#b5a48c', 'Taupe'], ['#7a4b32', 'Brown'], ['#c9a77a', 'Natural oak']];

// The pick that shows on surface k of cabinet c (or of the open room when c is not given).
function texPickOf(k, c) {
  const r = curRoom();
  return (c && c.tex && TEX_CAB.includes(k) && c.tex[k]) || (r && r.tex && r.tex[k]) || (S.job.tex && S.job.tex[k]) || '';
}
const skinHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
// A look-only stand-in for material m wearing pick p. It keeps m's size and kind; mat(id) finds it (SKINS in core.js) so the
// elevation can make its texture pattern.
function skinOf(p, m) {
  const base = m || { kind: 'sheet', thick: 0.75 }, kind = base.kind || 'sheet', id = 'sk' + skinHash(p + '|' + kind);
  let lk = null;
  if (p[0] === '#') lk = { name: 'Paint color', color: p, texture: null, procedural: null, texScale: 24 };
  else if (isLibTex(p)) {
    if (typeof loadTexLib === 'function' && !TEXLIB) loadTexLib().then(() => { if (typeof redrawView === 'function') redrawView(); });
    const t = (TEXLIB || []).find(x => 'textures/' + x.p === p);
    lk = { name: t ? t.n : 'Photo', color: (t && t.col) || base.color || '#cccccc', texture: p, procedural: null, texScale: kind === 'top' || (t && t.c === 'Tops') ? 48 : 24 };
  } else if (p.startsWith('m:')) {
    const src = S.materials.find(x => x.id === p.slice(2)); if (!src) return m;
    lk = { name: src.name, color: src.color, texture: src.texture, procedural: src.procedural, texScale: src.texScale || 24 };
  }
  if (!lk) return m;
  return (SKINS[id] = { ...base, ...lk, id, kind, dynamic: false, skin: p });
}
// Material m as it should look on surface k of cabinet c.
function texLook(m, k, c) { const p = texPickOf(k, c) || (k === 'toe' ? texPickOf('finished', c) : ''); return p ? skinOf(p, m) : m; }
// Finished interior (c.finInt, Ayden 2026-11-20): the inside looks like the picked finish (with its Finished look pick),
// the same way the cut list cuts it from the finish material. Look only.
function inLook(m, k, c) {
  if (c && c.finInt && typeof finishMat === 'function') { const f = mat(finishMat(c)); if (f) return texLook(f, 'finished', c); }
  return texLook(m, k, c);
}
// A cabinet marked Finished shows its whole box as finished; otherwise the box is the inside.
const boxKey = c => (c && c.finished ? 'finished' : 'inside');
const frontKey = f => (f && (f.type === 'drawer' || f.type === 'false') ? 'drawers' : 'doors');
// Mozaik products: doors, toe skins and show parts by part type; the box follows Finished.
function mozSurf(q, c) {
  const t = (q && (q.type || q.t)) || '';
  if (/^(DOOR|DOORFRAME|DOORPANEL)$/.test(t)) return 'doors';
  if (t === 'TOESKIN') return 'toe';
  const g = q && (q.group || (typeof mozGroup === 'function' ? mozGroup(t) : ''));
  return g === 'show' ? 'finished' : g === 'back' ? 'inside' : boxKey(c);
}
const pickColor = (p, m) => !p ? '' : p[0] === '#' ? p : ((skinOf(p, m) || {}).color || '');
// Pull finish: a pick's color, else the pull's own.
function pullColor(c, h) { return pickColor(texPickOf('pulls', c)) || (h && h.finish) || '#333333'; }
// Walls and floor (3D and the elevation's wall).
function wallLook3(op, def) {
  const p = texPickOf('walls'); if (!p) return def;
  if (p[0] === '#' || op < 0.98) return flat3(pickColor(p), op);
  return mat3(skinOf(p, { kind: 'sheet' }));
}
function floorLook3(def, geo, w, h) {
  const p = texPickOf('floor'); if (!p) return def;
  const m = skinOf(p, { kind: 'sheet' }), mm = mat3(m), k = (mm.userData && mm.userData.texScale) || m.texScale || 24, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / k, uv.getY(i) * h / k);
  return mm;
}
const wallFill2d = () => { const p = texPickOf('walls'); return p ? ` style="fill:${esc(pickColor(p))}"` : ''; };

/* ----- What each surface shows when nothing is picked: its material (or the pull's finish) ----- */
function texBase(k, c) {
  if (k === 'doors' || k === 'drawers') { const t = doorTpl(cabSet(c, 'doorT')), ds = withFinish(doorStyle(k === 'drawers' ? t.drawer || t.door : t.door), c); return mat(ds.mat); }
  if (k === 'finished') return mat(finishMat(c || null));
  const mt = cabMatT(cabSet(c, 'cabMatT')), cm = mat(mt.carcass);
  if (k === 'inside') return cm;
  if (k === 'toe') return toeMat(c, mt) || cm;
  if (k === 'drawerBox') return mat(drawerMatT(cabSet(c, 'drawerMatT')).sides);
  if (k === 'tops') return mat(countertop(roomSet('countertop')).mat);
  if (k === 'molding') { const m = S.moldings.find(x => x.id === roomSet('molding')) || S.moldings[0]; return moldFinishLook(m && mat(m.mat), c); }
  if (k === 'pulls') { const t = doorTpl(cabSet(c, 'doorT')), h = hw(t.pull); return { id: '_pull', color: (h && h.finish) || '#333333' }; }
  if (k === 'walls') return { id: '_wall', name: 'Wall', color: cssVar('--wall3d') || '#ece9e2' };
  if (k === 'floor') return { id: '_floor', name: 'Wood floor', color: '#b98d5f', procedural: 'oak' };
  return null;
}

/* ----- The Textures tab under the drawing ----- */
function texLevel() {
  const c = ui.sel && ui.sel.type === 'cab' && multiIds().length < 2 ? cab(ui.sel.id) : null;
  let s = ui.texScope || 'job'; if (s === 'cab' && !c) s = 'room';
  return { s, c, obj: s === 'cab' ? c : s === 'room' ? curRoom() : S.job };
}
// The pick a level would show if it had none of its own (the level above, then the material).
function texAbove(k, lv) {
  const r = curRoom();
  if (lv.s === 'cab') return (r.tex && r.tex[k]) || (S.job.tex && S.job.tex[k]) || '';
  if (lv.s === 'room') return (S.job.tex && S.job.tex[k]) || '';
  return '';
}
const texName = p => !p ? '' : p[0] === '#' ? ((TEX_PAINTS.find(([c]) => c === p.toLowerCase()) || [])[1] || p.toUpperCase()) : (skinOf(p) || {}).name || 'Texture';
function texDock() {
  const lv = texLevel(), own = (lv.obj && lv.obj.tex) || {}, surfs = lv.s === 'cab' ? TEX_CAB : TEX_SURF.map(([k]) => k);
  const label = k => k === 'all' ? 'All fronts' : (TEX_SURF.find(([x]) => x === k) || [])[1];
  if (!ui.texSurf || (ui.texSurf !== 'all' && !surfs.includes(ui.texSurf))) ui.texSurf = 'all';
  // At Whole job, a room's own pick is what the open room shows, so the tile shows that (marked Room) until a job pick replaces it.
  const rmOwn = k => lv.s === 'job' ? ((curRoom() || {}).tex || {})[k] || '' : '';
  const shown = k => { const p = rmOwn(k) || own[k] || texAbove(k, lv), b = texBase(k, lv.c); return { p, b, m: p ? skinOf(p, b) : b }; };
  const where = k => rmOwn(k) ? `<span class="tx-src">Room</span> ` : own[k] ? `<span class="tx-src set">${lv.s === 'job' ? 'Job' : lv.s === 'room' ? 'Room' : 'Cabinet'}</span> ` : texAbove(k, lv) ? `<span class="tx-src">${lv.s === 'cab' && (curRoom().tex || {})[k] ? 'Room' : 'Job'}</span> ` : '';
  const tile = k => {
    const keys = k === 'all' ? TEX_ALL : [k], sh = shown(keys[0]), same = keys.every(x => shown(x).p === sh.p);
    const sub = k === 'all' ? (same ? (sh.p ? texName(sh.p) : 'Their materials') : 'Mixed') : sh.p ? texName(sh.p) : (sh.b && sh.b.name) || '';
    return `<button class="tx-surf${ui.texSurf === k ? ' on' : ''}" data-act="tx-surf" data-id="${k}" aria-pressed="${ui.texSurf === k}">
      ${k === 'pulls' ? `<span class="sw" style="width:26px;height:26px;background:${esc(sh.p ? pickColor(sh.p) : (sh.b || {}).color || '#333')}"></span>` : swatch(sh.m, 26) || '<span class="sw none"></span>'}
      <span class="tx-sl"><b>${esc(label(k))}</b><span>${k === 'all' ? '' : where(k)}${esc(sub)}</span></span></button>`;
  };
  const k = ui.texSurf, keys = k === 'all' ? TEX_ALL : [k], cur = own[keys[0]] && keys.every(x => own[x] === own[keys[0]]) ? own[keys[0]] : '';
  const used = [...new Set([S.job, ...S.rooms, ...allCabs()].flatMap(o => Object.values((o && o.tex) || {})).filter(Boolean))].slice(0, 16);
  const chip = (p, ttl) => `<button class="accsw${cur === p ? ' on' : ''}" data-act="tx-set" data-id="${esc(p)}" title="${esc(ttl || texName(p))}" aria-label="${esc(ttl || texName(p))}" style="${p[0] === '#' ? `--c:${esc(p)}` : `--c:${esc(pickColor(p))};background-image:url('${esc(texURL(skinOf(p)) || '')}');background-size:cover`}"></button>`;
  const mats = azOpts(S.materials, m => !m.dynamic);
  const scope = [['job', 'Whole job'], ['room', 'This room'], ...(lv.c ? [['cab', `Cabinet ${esc(cabLabel(lv.c))}`]] : [])];
  return `<div class="tx-dock">
    <div class="tx-picks"><div class="seg" role="group" aria-label="Where the textures apply">${scope.map(([s, l]) => `<button data-act="tx-scope" data-id="${s}" aria-pressed="${lv.s === s}">${l}</button>`).join('')}</div>
      <b class="tx-for">${esc(label(k))}</b>
      <button class="btn sm${cur ? '' : ' on'}" data-act="tx-clear" aria-pressed="${!cur}">${lv.s === 'job' ? 'Material' : 'Same as ' + (lv.s === 'cab' ? 'room' : 'job')}</button>
      <div class="swatches">${TEX_PAINTS.map(([p, n]) => chip(p, n)).join('')}<label class="accsw custom" title="Any color"><input type="color" id="tx-color" value="${esc(cur && cur[0] === '#' ? cur : '#8f9f86')}" aria-label="Any color"></label></div>
      ${k === 'pulls' ? '' : `<button class="btn sm" data-act="tx-lib">${icon('palette')}Wood and photos</button>
      <label class="tx-like"><span>Like</span><select id="tx-mat" aria-label="Look like a material"><option value="">a material…</option>${mats.map(o => `<option value="${esc(o.v)}"${cur === 'm:' + o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`}
      ${used.length ? `<span class="tx-used"><span class="tx-src">In this job</span>${used.map(p => chip(p)).join('')}</span>` : ''}
      ${Object.keys(own).length ? `<button class="btn sm" data-act="tx-reset">${lv.s === 'job' ? 'Clear all textures' : lv.s === 'room' ? 'Room follows the job' : 'Cabinet follows the room'}</button>` : ''}
      <span class="note help">Look only: the cut list, materials and price don't change.</span></div>
    <div class="tx-surfs">${['all', ...surfs].map(tile).join('')}</div></div>`;
}
const cabLabel = c => (typeof LBL !== 'undefined' && LBL[c.id]) || c.name || '';
function texSet(p) {
  const lv = texLevel(), keys = ui.texSurf === 'all' ? TEX_ALL : [ui.texSurf]; if (!lv.obj) return;
  mutate(() => { const t = lv.obj.tex = { ...(lv.obj.tex || {}) }; keys.forEach(k => { if (p) t[k] = p; else delete t[k]; }); if (!Object.keys(t).length) delete lv.obj.tex; texClearBelow(lv.s, lv.obj, keys); });
}
// 0.60.1 (Ayden 2026-11-20, "this textures tab doesnt actually change the textures"): a pick for the whole job or a room
// now reaches everything in it. Before, a room's or cabinet's own pick (e.g. one made with a Settings Look button for
// "This room") stayed on top, so a Whole job pick changed nothing you could see. Picking at a level clears the same
// surfaces below it: job -> rooms, cabinets, placed molding runs and panels; room -> its cabinets, runs and panels.
function texClearBelow(s, obj, keys) {
  const rooms = s === 'job' ? S.rooms : s === 'room' ? [obj] : [];
  const drop = o => { if (!o || !o.tex) return; keys.forEach(k => delete o.tex[k]); if (!Object.keys(o.tex).length) delete o.tex; };
  rooms.forEach(r => {
    if (s === 'job') drop(r);
    (r.cabinets || []).forEach(drop);
    if (keys.includes('molding')) (r.genMolds || []).forEach(drop);
    if (keys.includes('finished')) (r.shapes || []).forEach(drop);
  });
}
function texAct(a, id) {
  switch (a) {
    case 'tx-surf': ui.texSurf = id; renderDock(); return true;
    case 'tx-scope': ui.texScope = id; renderDock(); return true;
    case 'tx-set': texSet(id); return true;
    case 'tx-clear': texSet(''); return true;
    case 'tx-fin': { const [cid, on] = id.split(':'), c = cab(cid); if (c) mutate(() => { if (on === '1') c.finished = true; else delete c.finished; }); return true; }
    case 'tx-reset': { const lv = texLevel(); if (lv.obj) mutate(() => { delete lv.obj.tex; }); return true; }
    case 'tx-q': case 'tx-qclose': case 'tx-qset': case 'tx-qlib': return txqAct(a, id);
    case 'tx-lib': { const b = texBase(ui.texSurf === 'all' ? 'doors' : ui.texSurf, texLevel().c); openTexPick(null); ui.texPick.surf = ui.texSurf; ui.texPick.cat = ui.texSurf === 'tops' ? 'Tops' : texGuessCat(b); renderTexPick(); return true; }
  }
  return false;
}
document.addEventListener('change', e => {
  if (e.target.id === 'tx-color') texSet(e.target.value.toLowerCase());
  else if (e.target.id === 'tx-mat' && e.target.value) texSet('m:' + e.target.value);
});

/* ----- Finished product: every surface you can see is a finished one ----- */
// On: the box takes the Finished ends and panels texture, and its visible parts are cut from the finish material.
function finishedBox(c) {
  const fm = mat(finishMat(c));
  return `<div class="psec box">${secHead('palette', 'Finished product', 'amber')}
    <div class="seg" role="group" aria-label="Finished product"><button data-act="tx-fin" data-id="${c.id}:0" aria-pressed="${!c.finished}">Not finished</button><button data-act="tx-fin" data-id="${c.id}:1" aria-pressed="${!!c.finished}">Finished</button></div>
    <div class="note">${c.finished ? `Every surface you see is finished: it is cut from ${esc((fm || {}).name || 'the finish material')} and wears the finished texture.` : 'Turn on for shelves, mantels and boxes that are seen all over.'}</div></div>`;
}

/* ----- Quick look on the Settings tiles (0.58.12, Ayden 2026-11-19): change how a pick looks without swapping the
   template or finish. Writes the same tex picks as the Textures tab (S.job.tex or room.tex), so there is one texture
   system; look only, the cut list, CNC and price never change. ----- */
const TXQ_KEYS = {
  doorT: [['doors', 'drawers'], 'Doors and drawer fronts'],
  finish: [TEX_ALL, 'Doors, drawer fronts and finished ends'],
  cabMatT: [['inside'], 'Cabinet (unfinished parts)'],
  drawerMatT: [['drawerBox'], 'Drawer boxes'],
  pull: [['pulls'], 'Pulls'],
  countertop: [['tops'], 'Countertops'],
  molding: [['molding'], 'Molding'],
};
// Where a tile's look is saved: the room it is for, or the whole job.
const txqObj = rid => (rid && roomById(rid)) || S.job;
// The pick a tile shows: its own (same on every surface it covers), the job's when a room has none, or '' (the material).
function txqPick(k, rid) {
  if (k === 'shape') { const s = shapeById(rid), own = (s && s.tex && s.tex.finished) || '', up = s && s.mat === SHAPE_FIN ? texPickOf('finished') : '';
    return own ? { p: own, from: 'own' } : up ? { p: up, from: 'room' } : { p: '', from: s && s.mat === SHAPE_FIN ? 'finish' : '' }; }
  if (k === 'mrun') { const r = mrunFind(rid), own = r ? mrunOwn(r) : '', up = texPickOf('molding');
    return own ? { p: own, from: 'own' } : up ? { p: up, from: 'room' } : { p: '', from: 'finish' }; }
  const keys = (TXQ_KEYS[k] || [[]])[0], o = txqObj(rid), t = o.tex || {}, j = S.job.tex || {};
  const one = src => src[keys[0]] && keys.every(x => src[x] === src[keys[0]]) ? src[keys[0]] : keys.some(x => src[x]) ? 'mixed' : '';
  const own = one(t), none = k === 'molding' ? 'finish' : ''; if (own || o === S.job) return { p: own, from: own ? 'own' : none };
  const up = one(j); return { p: up, from: up ? 'job' : none };
}
// Color for the tile's little drawing (blank = draw it in the material's color).
function txqColor(k, rid) { const q = txqPick(k, rid); return q.p && q.p !== 'mixed' ? pickColor(q.p) : ''; }
function txqSet(k, rid, p) {
  const putK = (o, x) => { const t = o.tex = { ...(o.tex || {}) }; if (p) t[x] = p; else delete t[x]; if (!Object.keys(t).length) delete o.tex; };
  const put = o => putK(o, 'molding'), put2 = o => putK(o, 'finished');
  if (k === 'shape') { const s = shapeById(rid); if (!s) return; mutate(() => put2(s)); renderTxq(); return; }
  if (k === 'mrun') { const r = mrunFind(rid); if (!r) return; mutate(() => { if (r.generic) put((S.genMolds || []).find(g => g.id === r.generic) || {}); else r.cabs.forEach(id => { const c = cab(id); if (c) put(c); }); }); renderTxq(); return; }
  const keys = (TXQ_KEYS[k] || [[]])[0], o = txqObj(rid); if (!keys.length) return;
  mutate(() => { const t = o.tex = { ...(o.tex || {}) }; keys.forEach(x => { if (p) t[x] = p; else delete t[x]; }); if (!Object.keys(t).length) delete o.tex; texClearBelow(o === S.job ? 'job' : 'room', o, keys); });
  renderTxq();
}
// The Look button under a tile's dropdown.
function txqBtn(k, rid) {
  if (!TXQ_KEYS[k] && k !== 'mrun' && k !== 'shape') return '';
  const q = txqPick(k, rid), id = k + ':' + (rid || ''), on = ui.txq && ui.txq.id === id;
  const sw = q.p && q.p !== 'mixed' ? `<span class="sw" style="background:${esc(pickColor(q.p))}${isLibTex(q.p) || q.p.startsWith('m:') ? `;background-image:url('${esc(texURL(skinOf(q.p)) || '')}');background-size:cover` : ''}"></span>` : '<span class="sw none"></span>';
  const txt = q.p === 'mixed' ? 'Mixed' : q.p ? texName(q.p) + (q.from === 'job' ? ' (job)' : q.from === 'room' ? ' (room)' : '') : q.from === 'finish' ? 'Finish' : 'Material';
  return `<button class="tt-look${q.from === 'own' ? ' set' : ''}" data-act="tx-q" data-id="${esc(id)}" aria-expanded="${on}" aria-haspopup="dialog" title="Change the look only">${sw}<span class="tt-lk">Look</span><span class="tt-lv">${esc(txt)}</span></button>`;
}
function renderTxq() {
  let el = document.getElementById('txqpop');
  const q = ui.txq;
  if (!q) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'txqpop'; el.className = 'txq'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); }
  const [k, rid] = q.id.split(':'), shp = k === 'shape' ? shapeById(rid) : null, run = k === 'mrun' ? mrunFind(rid) : null, room = run || shp ? curRoom() : rid ? roomById(rid) : null, cur = txqPick(k, rid), own = cur.from === 'own' ? cur.p : '';
  if (k === 'shape' && !shp) { ui.txq = null; el.remove(); return; }
  const title = shp ? 'Panel: ' + (shp.name || 'Shape') : run ? 'Molding: ' + mrunName(run) : TXQ_KEYS[k][1];
  const jobHas = keys => room && !run && !shp && keys.some(x => (S.job.tex || {})[x]);
  const clear = shp ? (shp.mat === SHAPE_FIN ? 'Same as finished ends' : 'Material') : run ? (texPickOf('molding') ? 'Same as the room' : 'Same as finish') : jobHas(TXQ_KEYS[k][0]) ? 'Same as job' : k === 'molding' ? 'Same as finish' : 'Material';
  const chip = (p, ttl) => `<button class="accsw${own === p ? ' on' : ''}" data-act="tx-qset" data-id="${esc(p)}" title="${esc(ttl || texName(p))}" aria-label="${esc(ttl || texName(p))}" style="${p[0] === '#' ? `--c:${esc(p)}` : `--c:${esc(pickColor(p))};background-image:url('${esc(texURL(skinOf(p)) || '')}');background-size:cover`}"></button>`;
  const used = [...new Set([S.job, ...S.rooms, ...allCabs()].flatMap(o => Object.values((o && o.tex) || {})).filter(Boolean))].filter(p => !TEX_PAINTS.some(([c]) => c === p)).slice(0, 10);
  const mats = azOpts(S.materials, m => !m.dynamic);
  el.setAttribute('aria-label', 'Look of ' + title);
  el.innerHTML = `<div class="txq-h"><b>${esc(title)}</b><span class="muted">${room ? esc(room.name) : 'Whole job'}</span><button class="btn sm iconbtn" data-act="tx-qclose" aria-label="Close">${icon('close')}</button></div>
    <button class="btn sm${own ? '' : ' on'}" data-act="tx-qset" data-id="" aria-pressed="${!own}">${esc(clear)}</button>
    <div class="swatches">${TEX_PAINTS.map(([p, n]) => chip(p, n)).join('')}<label class="accsw custom" title="Any color"><input type="color" id="tx-qcolor" value="${esc(own && own[0] === '#' ? own : '#8f9f86')}" aria-label="Any color"></label></div>
    ${used.length ? `<div class="txq-used"><span class="muted">In this job</span>${used.map(p => chip(p)).join('')}</div>` : ''}
    ${k === 'pull' ? '' : `<div class="txq-row"><button class="btn sm" data-act="tx-qlib">${icon('palette')}Wood and photos</button>
    <select id="tx-qmat" aria-label="Look like a material"><option value="">Like a material…</option>${mats.map(o => `<option value="${esc(o.v)}"${own === 'm:' + o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>`}
    <div class="note">Look only. The cut list, CNC and price stay the same.</div>`;
  txqPlace(); requestAnimationFrame(txqPlace);
}
// Sit under the Look button (found again after each redraw); stay on screen.
function txqPlace() {
  const el = document.getElementById('txqpop'); if (!el || !ui.txq) return;
  const b = document.querySelector(`.tt-look[data-id="${CSS.escape(ui.txq.id)}"]`);
  if (!b) { ui.txq = null; el.remove(); return; }
  const r = b.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let x = Math.min(Math.max(8, r.left), innerWidth - w - 8), y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
  el.style.left = x + 'px'; el.style.top = y + 'px';
}
function txqAct(a, id) {
  switch (a) {
    case 'tx-q': ui.txq = ui.txq && ui.txq.id === id ? null : { id }; renderTxq(); return true;
    case 'tx-qclose': ui.txq = null; renderTxq(); return true;
    case 'tx-qset': { const [k, rid] = ui.txq.id.split(':'); txqSet(k, rid, id); return true; }
    case 'tx-qlib': { const [k] = ui.txq.id.split(':'), s = k === 'mrun' ? 'molding' : k === 'shape' ? 'finished' : TXQ_KEYS[k][0][0]; openTexPick(null); ui.texPick.quick = ui.txq.id; ui.texPick.surf = s; ui.texPick.cat = s === 'tops' ? 'Tops' : texGuessCat(texBase(s)); renderTexPick(); return true; }
  }
  return false;
}
document.addEventListener('change', e => {
  if (!ui.txq) return;
  const [k, rid] = ui.txq.id.split(':');
  if (e.target.id === 'tx-qcolor') txqSet(k, rid, e.target.value.toLowerCase());
  else if (e.target.id === 'tx-qmat' && e.target.value) txqSet(k, rid, 'm:' + e.target.value);
});
document.addEventListener('pointerdown', e => {
  if (ui.txq && !e.target.closest('#txqpop, .tt-look, #texpick')) { ui.txq = null; renderTxq(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.txq) { ui.txq = null; renderTxq(); } });
addEventListener('resize', () => txqPlace());

/* ----- Molding look (0.58.16, Ayden 2026-11-19): molding wears the finish look unless it is given its own. Order: the
   run's own pick (its cabinets' molding pick, or a placed run's), then the room's or job's Molding pick, then the
   Finished ends look, then the finish material. Look only: runs, lengths, cut list and price come from the molding. ----- */
function moldFinishLook(base, c) {
  const fp = texPickOf('finished', c); if (fp) return skinOf(fp, base);
  const fm = typeof finishMat === 'function' && finishMat(c || null), m = fm && mat(fm);
  return m && base ? skinOf('m:' + m.id, base) : m || base;
}
// The run's own pick: the one on most of its width (a placed run keeps its own).
function mrunOwn(r) {
  if (r.generic) { const g = (S.genMolds || []).find(x => x.id === r.generic); return (g && g.tex && g.tex.molding) || ''; }
  const w = {}; r.cabs.forEach(id => { const c = cab(id); if (!c) return; const p = (c.tex && c.tex.molding) || ''; w[p] = (w[p] || 0) + (c.w || 1); });
  return Object.keys(w).sort((a, b) => w[b] - w[a])[0] || '';
}
function moldLook(r) {
  const base = mat(r.m.mat), p = mrunOwn(r) || texPickOf('molding');
  return p ? skinOf(p, base) : moldFinishLook(base, null);
}
// A run is found again by its first cabinet, or by a placed run's id.
const mrunKey = r => r.generic ? 'g.' + r.generic : 'c.' + r.cabs[0];
const mrunFind = key => moldingRuns().find(r => mrunKey(r) === key);
function mrunName(r) {
  const wn = typeof wallName === 'function' ? wallName(wall(r.wall)) : '';
  if (r.generic) return `${wn ? wn + ', ' : ''}placed run`;
  const nm = r.cabs.map(id => cab(id)).filter(Boolean).map(c => cabLabel(c) || c.name).filter(Boolean);
  return `${wn ? wn + ': ' : ''}${nm.slice(0, 3).join(', ')}${nm.length > 3 ? ' +' + (nm.length - 3) : ''}`;
}
// Under the Molding tab: one Look for the room, then one per run, so a hood's molding can be its own color.
function moldLookCard() {
  const runs = moldingRuns(), rm = curRoom();
  return `<div class="card cardbody ml-card"><div class="ml-row"><b>Look of all molding in ${esc(rm.name)}</b>${txqBtn('molding', rm.id)}</div>
    ${runs.length ? `<div class="ml-runs">${runs.map(r => `<div class="ml-row"><span class="ml-n">${esc(mrunName(r))} <span class="muted">${esc(r.m.name)}, ${fmtLen(r.len)}</span></span>${txqBtn('mrun', mrunKey(r))}</div>`).join('')}</div>` : ''}
    <div class="note">Molding wears the finish look unless you pick one. Pick a run to give just it a color, or select a cabinet and use Textures › Molding. Look only: lengths and price stay the same.</div></div>`;
}
