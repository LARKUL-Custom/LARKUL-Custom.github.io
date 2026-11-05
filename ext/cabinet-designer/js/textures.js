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
// Surfaces a single cabinet can have its own pick for; tops, molding, walls and floor belong to the room.
const TEX_CAB = ['doors', 'drawers', 'finished', 'inside', 'toe', 'drawerBox', 'pulls'];
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
function texLook(m, k, c) { const p = texPickOf(k, c); return p ? skinOf(p, m) : m; }
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
  if (k === 'toe') return mat(mt.toeKick) || cm;
  if (k === 'drawerBox') return mat(drawerMatT(cabSet(c, 'drawerMatT')).sides);
  if (k === 'tops') return mat(countertop(roomSet('countertop')).mat);
  if (k === 'molding') { const m = S.moldings.find(x => x.id === roomSet('molding')) || S.moldings[0]; return m && mat(m.mat); }
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
  const shown = k => { const p = own[k] || texAbove(k, lv), b = texBase(k, lv.c); return { p, b, m: p ? skinOf(p, b) : b }; };
  const where = k => own[k] ? `<span class="tx-src set">${lv.s === 'job' ? 'Job' : lv.s === 'room' ? 'Room' : 'Cabinet'}</span> ` : texAbove(k, lv) ? `<span class="tx-src">${lv.s === 'cab' && (curRoom().tex || {})[k] ? 'Room' : 'Job'}</span> ` : '';
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
  mutate(() => { const t = lv.obj.tex = { ...(lv.obj.tex || {}) }; keys.forEach(k => { if (p) t[k] = p; else delete t[k]; }); if (!Object.keys(t).length) delete lv.obj.tex; });
}
function texAct(a, id) {
  switch (a) {
    case 'tx-surf': ui.texSurf = id; renderDock(); return true;
    case 'tx-scope': ui.texScope = id; renderDock(); return true;
    case 'tx-set': texSet(id); return true;
    case 'tx-clear': texSet(''); return true;
    case 'tx-fin': { const [cid, on] = id.split(':'), c = cab(cid); if (c) mutate(() => { if (on === '1') c.finished = true; else delete c.finished; }); return true; }
    case 'tx-reset': { const lv = texLevel(); if (lv.obj) mutate(() => { delete lv.obj.tex; }); return true; }
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
