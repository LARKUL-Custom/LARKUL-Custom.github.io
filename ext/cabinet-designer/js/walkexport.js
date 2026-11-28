// Walk file: one .html file a client can open in any browser (phone, tablet or computer, nothing to install) to walk
// through their job in first person. It holds the Realistic 3D of every room (parts, appliance models, pictures),
// the same Walk controls as the 3D view (js/walk3d.js, copied in as it is when the file is made) and the LARKUL
// logo. No prices, cut lists, drilling or part data go in: only shapes, looks and lights.
// Doors and drawers still open with a tap, and the time of day can be changed.
'use strict';
const WX = { busy: false, maxTex: 1024, floorTex: 2048 };

async function walkExport(opt = {}) {
  if (WX.busy) return;
  if (typeof CompressionStream === 'undefined') { flash('This browser cannot make a walk file (it needs a newer Chrome or Edge)'); return; }
  WX.busy = true;
  const keep = { tab: ui.tab, view: ui.viewMode, room: S.roomId, render: ui.render3d, hidden: ui.hidden3d, cut: ui.cutaway, op: ui.wallOp, layers: ui.layers, open: ui.open, house: ui.house3d, cam: null };
  const openWas = { ...openT };
  if (typeof WALK !== 'undefined' && WALK.on) walkStop();
  if (ui.sel) select(null);
  try {
    flash('Making the walk file…');
    if (ui.tab !== 'room') goTab('room');
    if (ui.viewMode !== '3d') setView('3d');
    await wxFrames(2); ensureRoomViewer();
    const v = roomViewer; if (!v || !v.ok) throw new Error('3D is not available in this browser');
    keep.cam = v.getView();
    // Realistic, every wall shown, no labels, every door and drawer shut.
    ui.render3d = true; ui.hidden3d = false; ui.cutaway = false; ui.wallOp = 1;
    ui.layers = { ...(ui.layers || {}), walls: true, ceiling: true, floor: true, labels: false, fasteners: false };
    ui.open = {}; Object.keys(openT).forEach(k => delete openT[k]);
    const ctx = wxCtx(), rooms = [], scenes = [];
    const list = S.rooms.filter(r => (r.walls && r.walls.length) || (r.cabinets && r.cabinets.length));
    // 0.63.53: rooms joined at their doorways (house.js) go in as one scene, so walking from one into the next is
    // seamless in the file too. Each room keeps its own plan and its place in the scene (M).
    ui.house3d = true;
    const done = new Set();
    for (const r of list) {
      if (done.has(r.id)) continue;
      const H = (typeof houseOf === 'function' ? houseOf(r.id) : [{ r, M: { c: 1, s: 0, x: 0, y: 0 } }]).filter(h => !done.has(h.r.id));
      H.forEach(h => done.add(h.r.id));
      if (S.roomId !== r.id) { S.roomId = r.id; if (v) v.fitted = false; }
      buildRoom3D(); await wxModels(); buildRoom3D(); v.fitShadow(); await wxFrames(1);
      const k = scenes.length; scenes.push(await wxScene(v, ctx, k));
      H.forEach(h => { if (list.includes(h.r)) rooms.push(withRoom(h.r, () => wxRoom(h.r, k, h.M, h.r.id === keep.room && h.r.id === r.id ? keep.cam : null))); });
    }
    if (!rooms.length) throw new Error('this job has no rooms to walk');
    const html = await wxFile(rooms, scenes, ctx);
    const clean = t => String(t || '').replace(/[^\w -]/g, '').trim();
    const name = `${clean(S.job.name) || 'Job'} walkthrough.html`, blob = new Blob([html], { type: 'text/html' });
    const mb = (blob.size / 1048576).toFixed(1);
    // In the hub: saved to Files › Cabinet Designer and put on the clipboard as a file, so Ctrl+V in an email attaches it.
    if (inHub()) {
      await hubSaveOver(new File([blob], name, { type: 'text/html' }), 'Cabinet Designer');
      const clip = await fetch(`/api/ext/cabinet-designer/walk/clip?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: blob }).then(r => r.ok).catch(() => false);
      flash(clip ? `Walk file copied (${mb} MB). Paste it into an email with Ctrl+V. Also saved to Files › Cabinet Designer.` : `Walk file saved to Files › Cabinet Designer (${mb} MB). Send it to the client; it opens in any browser.`);
    }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); flash(`Walk file downloaded (${mb} MB)`); }
    return blob;
  } catch (e) {
    flash('Could not make the walk file: ' + (e && e.message || e)); console.error(e);
  } finally {
    S.roomId = keep.room; ui.house3d = keep.house; ui.render3d = keep.render; ui.hidden3d = keep.hidden; ui.cutaway = keep.cut; ui.wallOp = keep.op; ui.layers = keep.layers; ui.open = keep.open;
    Object.assign(openT, openWas);
    WX.busy = false;
    if (ui.tab === 'room') { renderRoom(); if (keep.cam && roomViewer) requestAnimationFrame(() => roomViewer.setView(keep.cam)); }
    if (keep.view !== ui.viewMode) setView(keep.view);
    if (keep.tab !== ui.tab) goTab(keep.tab);
  }
}
// 0.64.34 (Ayden 2026-11-27: "i think ill just get rid of the share link entirely and just give them an option to download
// a file to walk through it"): the Share link button (0.64.27, the walk file put on the website) is gone; the walk file
// is the one way to send a walkthrough.
const wxFrames = n => new Promise(res => { const f = () => (n-- <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
// Waits for appliance and shape models that are still being read (each one redraws the room when it comes in).
async function wxModels() {
  const t0 = performance.now(); let calm = 0;
  while (performance.now() - t0 < 30000 && calm < 2) {
    const busy = typeof modelGeo === 'object' && Object.values(modelGeo).some(g => g && typeof g.then === 'function');
    calm = busy ? 0 : calm + 1;
    await new Promise(r => setTimeout(r, 120));
  }
}

/* ---------- The scene, packed small ---------- */
// Geometry goes into one binary block (normals as bytes, indexes as 16 bit where they fit, the same data stored once);
// materials, textures and pictures use three.js's own JSON format, with pictures shrunk to 1024 px (the floor 2048).
const WX_TEX = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'alphaMap', 'emissiveMap', 'aoMap', 'lightMap', 'displacementMap', 'specularMap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'transmissionMap'];
function wxCtx() {
  return { meta: { geometries: {}, materials: {}, textures: {}, images: {}, shapes: {}, skeletons: {}, animations: {}, nodes: {} }, chunks: [], size: 0, seen: new Map(), mats: new Set(), badTex: new Set(), imgDone: new Set(), geo: new Map() };
}
function wxHash(u8) {
  let h = 2166136261 >>> 0, h2 = 0x9e3779b9;
  const n = u8.length, step = n > 4096 ? 1 : 1;
  for (let i = 0; i < n; i += step) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; h2 = (h2 + u8[i] * (i + 1)) >>> 0; }
  return n + ':' + h + ':' + h2;
}
function wxChunk(ctx, arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), key = arr.constructor.name + wxHash(u8);
  if (ctx.seen.has(key)) return ctx.seen.get(key);
  const pad = (4 - ctx.size % 4) % 4; if (pad) { ctx.chunks.push(new Uint8Array(pad)); ctx.size += pad; }
  const ref = { $b: [ctx.size, arr.length, arr.constructor.name] };
  ctx.chunks.push(u8.slice()); ctx.size += u8.byteLength; ctx.seen.set(key, ref);
  return ref;
}
function wxAttrArray(a) {
  if (!a.isInterleavedBufferAttribute) return a.array;
  const out = new (a.array.constructor)(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : [a.getX, a.getY, a.getZ, a.getW][k].call(a, i);
  return out;
}
function wxGeo(g, ctx) {
  if (ctx.geo.has(g.uuid)) return ctx.geo.get(g.uuid);
  const attributes = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    let arr = wxAttrArray(a), normalized = !!a.normalized;
    // 0.64.26: points rounded to 1/512" (a twentieth of a millimetre, never seen): the low bits go quiet and the file packs
    // about a third smaller.
    if (name === 'position' && arr instanceof Float32Array) { const q = new Float32Array(arr.length); for (let i = 0; i < arr.length; i++) q[i] = Math.round(arr[i] * 512) / 512; arr = q; }
    if (name === 'uv' && arr instanceof Float32Array) { const q = new Float32Array(arr.length); for (let i = 0; i < arr.length; i++) q[i] = Math.round(arr[i] * 4096) / 4096; arr = q; }
    if (name === 'normal' && arr instanceof Float32Array) { const q = new Int8Array(arr.length); for (let i = 0; i < arr.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, arr[i])) * 127); arr = q; normalized = true; }
    attributes[name] = { itemSize: a.itemSize, type: arr.constructor.name, array: wxChunk(ctx, arr), normalized };
  }
  if (!attributes.position) { ctx.geo.set(g.uuid, null); return null; }
  const data = { attributes };
  if (g.index) {
    let ix = g.index.array; let mx = 0; for (let i = 0; i < ix.length; i++) if (ix[i] > mx) mx = ix[i];
    if (mx < 65536 && !(ix instanceof Uint16Array)) ix = Uint16Array.from(ix);
    data.index = { type: ix.constructor.name, array: wxChunk(ctx, ix) };
  }
  if (g.groups && g.groups.length) data.groups = g.groups.map(x => ({ ...x }));
  ctx.meta.geometries[g.uuid] = { uuid: g.uuid, type: 'BufferGeometry', data };
  ctx.geo.set(g.uuid, g.uuid);
  return g.uuid;
}
// A texture's picture as a small JPEG (PNG when it has see-through parts), or null when it is not a picture.
async function wxImage(tex, ctx) {
  const src = tex.source || { uuid: tex.uuid, data: tex.image }, d = src.data;
  if (ctx.imgDone.has(src.uuid)) return !!ctx.meta.images[src.uuid];
  ctx.imgDone.add(src.uuid);
  if (!d || tex.isRenderTargetTexture || tex.isCubeTexture || tex.isDataTexture && !(d.data instanceof Uint8Array || d.data instanceof Uint8ClampedArray)) return false;
  if (typeof HTMLImageElement !== 'undefined' && d instanceof HTMLImageElement && !d.complete) { try { await d.decode(); } catch (_) { return false; } }
  const w = d.naturalWidth || d.videoWidth || d.width, h = d.naturalHeight || d.videoHeight || d.height; if (!w || !h) return false;
  const floor = typeof realFloor3 === 'function' && realFloor3.m && realFloor3.m.map === tex || !!(tex.userData && (tex.userData.floor || tex.userData.land));
  const k = Math.min(1, (floor ? WX.floorTex : WX.maxTex) / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
  try {
    if (d.data && !d.getContext && !(d instanceof HTMLImageElement)) { const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, w * h * 4), w, h), 0, 0); g.drawImage(t, 0, 0, cw, ch); }
    else g.drawImage(d, 0, 0, cw, ch);
    const px = g.getImageData(0, 0, cw, ch).data; let alpha = false;
    for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) { alpha = true; break; }
    ctx.meta.images[src.uuid] = { uuid: src.uuid, url: alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.82) };
    return true;
  } catch (e) { return false; }
}
async function wxPrepMats(v, ctx) {
  const mats = new Set();
  v.root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m && mats.add(m)); });
  for (const m of mats) for (const k of WX_TEX) { const t = m[k]; if (t && t.isTexture && !(await wxImage(t, ctx))) ctx.badTex.add(t); }
}
function wxMat(m, ctx) {
  if (!m) return undefined;
  if (ctx.meta.materials[m.uuid]) return m.uuid;
  const off = []; WX_TEX.forEach(k => { if (m[k] && ctx.badTex.has(m[k])) { off.push([k, m[k]]); m[k] = null; } });
  try {
    const j = m.toJSON(ctx.meta);
    if (typeof realCeil3 === 'function' && realCeil3.m === m) j.userData = { ...(j.userData || {}), ceil: 1 };
    ctx.meta.materials[m.uuid] = j;
  } finally { off.forEach(([k, t]) => { m[k] = t; }); }
  return m.uuid;
}
// What the walk file keeps from each object's notes: what blocks the way, what opens, and nothing about parts.
function wxUserData(o) {
  const u = o.userData || {}, out = {};
  ['noBounds', 'cut', 'layer', 'fixtId', 'wall', 'land', 'noAO', 'wallDetail', 'room', 'hw', 'hwHide'].forEach(k => { if (u[k] !== undefined && typeof u[k] !== 'object') out[k] = u[k]; });
  // 0.64.21: hinge links and guide middle members follow their door or drawer (hwFollow) in the file too.
  if (u.hwLink) out.hwLink = u.hwLink; if (u.hwP) out.hwP = u.hwP; if (u.hwHalf) out.hwHalf = true;
  if (u.cabId) out.cabId = u.cabId;
  if (u.open && u.cabId) {
    const op = u.open;
    if (op.kind === 'door') out.open = { kind: 'door', sign: op.sign, swing: doorSwing(o), ...(op.lead ? { lead: op.lead } : {}) };
    else if (op.kind === 'pocket') out.open = { kind: 'pocket', sign: op.sign, base: { x: op.base.x, z: op.base.z }, dx: op.dx, dz: op.dz };
    else out.open = { kind: 'drawer', travel: drawerOut(o) };
  }
  if (u.doorLeaf) out.doorLeaf = JSON.parse(JSON.stringify(u.doorLeaf));
  return Object.keys(out).length ? out : null;
}
function wxNode(o, ctx) {
  if (o.isSprite || o.isCamera || o.userData.hlEdge) return null;
  // 0.64.30 (Ayden 2026-11-27: "remove the hinges guides and locks and remove the background outside"): the walk file
  // carries no hinges, plates, drawer guides or locks and no outside landscape (sky dome, ground, trees); the app keeps them.
  if (o.userData.hw || o.userData.land) return null;
  if (o.visible === false && !o.userData.cut) return null;
  let j;
  if (o.isLight) { j = o.toJSON().object; delete j.children; }
  else {
    o.updateMatrix();
    j = { uuid: o.uuid, type: o.isMesh ? 'Mesh' : o.isLineSegments ? 'LineSegments' : o.isLine ? 'Line' : o.isPoints ? 'Points' : 'Group', matrix: o.matrix.toArray().map(n => Math.round(n * 1e5) / 1e5) };
    if (o.geometry && (o.isMesh || o.isLine || o.isPoints)) {
      const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m0 || m0.visible === false) return null;
      j.geometry = wxGeo(o.geometry, ctx); if (!j.geometry) return null;
      j.material = Array.isArray(o.material) ? o.material.map(m => wxMat(m, ctx)) : wxMat(o.material, ctx);
    }
  }
  if (o.castShadow) j.castShadow = true;
  if (o.receiveShadow) j.receiveShadow = true;
  if (o.renderOrder) j.renderOrder = o.renderOrder;
  if (o.frustumCulled === false) j.frustumCulled = false;
  const ud = wxUserData(o); if (ud) j.userData = ud; else delete j.userData;
  const kids = o.children.map(c => wxNode(c, ctx)).filter(Boolean);
  if (kids.length) j.children = kids;
  if (j.type === 'Group' && !kids.length && !(ud && ud.open)) return null;
  return j;
}
// The 3D scene as it stands (one room, or the rooms joined to it), packed.
async function wxScene(v, ctx, k) {
  v.root.updateMatrixWorld(true);
  await wxPrepMats(v, ctx);
  const kids = v.root.children.map(c => wxNode(c, ctx)).filter(Boolean);
  return { uuid: THREE.MathUtils.generateUUID(), type: 'Group', matrix: new THREE.Matrix4().toArray(), userData: { scene: k }, children: kids };
}
// One room as the Walk needs it (the open room's own plan), in scene k at place M.
function wxRoom(r, k, M, cam) {
  const L = typeof roomLights === 'function' ? roomLights() : [];
  return {
    id: r.id, name: r.name || 'Room', cam: cam && cam.mode !== 'ortho' ? cam : null, scene: k, M,
    lamps: L.some(l => l.kind === 'ceiling') || (typeof AUTO_CEIL === 'object' && AUTO_CEIL.n > 0),
    sunFace: typeof sunFacing === 'function' ? sunFacing() : null,
    walls: S.walls.map(w => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, thick: w.thick, height: w.height, hidden: !!w.hidden })),
    fixtures: (S.fixtures || []).filter(f => /door|opening|window|arch|pass/i.test(f.kind || f.type || '')).map(f => wxFixt(f)),
    cabs: (S.cabinets || []).map(c => ({ wall: c.wall, side: c.side, w: c.w })),
  };
}
// Doorways and windows as the Walk needs them (where they are in the wall and where they lead); nothing else.
function wxFixt(f) {
  const out = {};
  for (const [k, val] of Object.entries(f)) if (val === null || ['string', 'number', 'boolean'].includes(typeof val)) out[k] = val;
  delete out.price; delete out.cost; delete out.note; delete out.notes;
  return out;
}

/* ---------- The file ---------- */
async function wxText(url) { const r = await fetch(url); if (!r.ok) throw new Error('could not read ' + url); return r.text(); }
async function wxDataUrl(url) { const b = await (await fetch(url)).blob(); return new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); }); }
async function wxGzip(parts) {
  const s = new Blob(parts).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(s).blob();
}
// The Walk's own styles from the app, so the walk file looks like Walk in the 3D view.
function wxWalkCss() {
  let out = '';
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (_) { continue; } for (const r of rules || []) if (r.selectorText && /walk/.test(r.selectorText)) out += r.cssText + '\n'; }
  return out;
}
function wxPlayerCode(lib) {
  const fns = [Viewer3D, aoSetup, aoTargets, realAO, sunAt, sunTurn, realLight, landSun, pocketMove, wg, roomViewDir, hwLinkSet, hwFollow].map(f => f.toString()).join('\n');
  const consts = `const AO = { on: true };\nconst aoCoarse = ${aoCoarse.toString()};\nconst AO_VERT = ${JSON.stringify(AO_VERT)};\nconst AO_FRAG = ${JSON.stringify(AO_FRAG)};\nconst AO_BLUR = ${JSON.stringify(AO_BLUR)};\nconst sunLabel = ${sunLabel.toString()};\nconst mixHex = ${mixHex.toString()};\nconst ease = ${ease.toString()};\nconst CASE = ${JSON.stringify(CASE)};\nconst fixtInner = ${fixtInner.toString()};\n${doorType.toString()}\n${doorHasLeaf.toString()}\nconst fixtList = () => S.fixtures || [];\nconst fixtById = id => fixtList().find(f => f.id === id);\n`;
  return [lib.three, lib.orbit, lib.icons, WX_SHIM, consts, fns, lib.walk, wxPlayer.toString(), 'wxPlayer(WXDATA);'].join('\n;\n');
}
async function wxFile(rooms, scenes, ctx) {
  const [three, orbit, icons, walk, logo] = await Promise.all([wxText('vendor/three.min.js'), wxText('vendor/OrbitControls.js'), wxText('js/icons.js'), wxText('js/walk3d.js'), wxDataUrl('img/logo.png')]);
  const meta = ctx.meta, vals = o => Object.values(o);
  const data = {
    v: 1, name: S.job.name || 'Your job', made: new Date().toISOString().slice(0, 10), sun: typeof SUN === 'object' ? SUN.hour : 15,
    rooms,
    scene: { metadata: { version: 4.5, type: 'Object', generator: 'Cabinet Designer walk file' }, geometries: vals(meta.geometries), materials: vals(meta.materials), textures: vals(meta.textures), images: vals(meta.images), object: { uuid: THREE.MathUtils.generateUUID(), type: 'Group', matrix: new THREE.Matrix4().toArray(), children: scenes } },
  };
  const enc = new TextEncoder(), code = enc.encode(wxPlayerCode({ three, orbit, icons, walk })), json = enc.encode(JSON.stringify(data));
  const head = new Uint32Array([code.length, json.length]), pad = new Uint8Array((4 - (8 + code.length + json.length) % 4) % 4);
  const gz = await wxGzip([head, code, json, pad, ...ctx.chunks]);
  const b64 = await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.readAsDataURL(gz); });
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>${esc(data.name)} · Walkthrough</title><meta name="description" content="3D walkthrough by LARKUL Custom">
<style>${wxWalkCss()}\n${WX_CSS}</style></head><body>
<div class="wx-wrap view3d-wrap" id="wxwrap"><div class="wx-host" id="wxhost"></div></div>
<div class="wx-load" id="wxload"><img src="${logo}" alt="LARKUL Custom"><b>${esc(data.name)}</b><span id="wxmsg">This is only a preview, which can’t run the 3D walkthrough. Open the file in a web browser (Chrome, Safari or Edge) to walk through it.</span></div>
<img id="wxlogo" src="${logo}" alt="" hidden>
<script id="wxd" type="application/octet-stream">${b64}</script>
<script>${WX_BOOT}</script></body></html>`;
}
// Unpacks the file: the code and the room come gzipped in one block (about a quarter of the size).
const WX_BOOT = `(async function () {
  var msg = function (t) { var m = document.getElementById('wxmsg'); if (m) m.textContent = t; };
  // 0.64.27: the card's own words are for a viewer that runs no code (a phone's file preview); running code says so.
  // Anything that goes wrong while opening is written on the card, so a phone shows why instead of waiting forever.
  var ld = document.getElementById('wxload'); if (ld) ld.className += ' run';
  msg('Opening your 3D walkthrough…');
  var fail = function (t) { if (document.getElementById('wxload')) { msg('This walkthrough could not open: ' + t); if (ld) ld.className = 'wx-load'; } };
  window.addEventListener('error', function (e) { fail(e.message || 'an error'); });
  window.addEventListener('unhandledrejection', function (e) { fail((e.reason && e.reason.message) || String(e.reason)); });
  setTimeout(function () { var m = document.getElementById('wxmsg'); if (m && document.getElementById('wxload') && / …$|…$/.test(m.textContent)) m.textContent += ' (taking a while: if nothing changes, close other apps and tabs and open the file again)'; }, 30000);
  try {
    if (typeof DecompressionStream === 'undefined') { msg('Please open this file in an up to date Chrome, Safari, Edge or Firefox.'); return; }
    // 0.64.26: the browser's own base64 reader (fetch of a data: link) is many times quicker on a phone than a loop.
    var el0 = document.getElementById('wxd'), t = el0.textContent, blob; el0.remove();
    try { blob = await (await fetch('data:application/octet-stream;base64,' + t)).blob(); }
    catch (_) { var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); s = null; blob = new Blob([u]); }
    t = null; msg('Unpacking the rooms…');
    var buf = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    msg('Building the 3D…'); await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); });
    var head = new Uint32Array(buf, 0, 2), dec = new TextDecoder(), code = dec.decode(new Uint8Array(buf, 8, head[0]));
    var json = JSON.parse(dec.decode(new Uint8Array(buf, 8 + head[0], head[1]))), at = 8 + head[0] + head[1]; at += (4 - at % 4) % 4;
    window.WXDATA = { data: json, bin: buf.slice(at) };
    var el = document.createElement('script'); el.textContent = code; document.body.appendChild(el);
  } catch (e) { fail(e && e.message || e); }
})();`;

// Names the Walk and the 3D view expect from the app, answered by the walk file.
const WX_SHIM = `
const ui = { viewMode: '3d', tab: 'room', sel: null, render3d: true, hidden3d: false, open: {}, layers: {} };
const S = { walls: [], fixtures: [], rooms: [], roomId: null, cabinets: [], shapes: [] };
let roomViewer = null, openAnim = 0, R3 = true;
const openT = {}, plain3 = {}, metal3 = {}, matCache3 = {}, viewers = [], AUTO_CEIL = { n: 0 };
const SUN = { hour: 15 };
const $ = s => document.querySelector(s);
const has3D = () => typeof THREE !== 'undefined';
const WXP = { scenes: {}, shown: null, opens: new Set(), lamps: false, ceil: null };
function setView() {} function select() {} function fixSel() {} function save() {} function view3dPreset() {} function render() {}
function ensureRoomViewer() {} function renderRoom() {} function fitView() {}
function flash(t) { const f = document.getElementById('wxflash'); if (!f) return; f.textContent = t; f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { f.hidden = true; }, 2600); }
function curRoom() { return S.rooms.find(r => r.id === S.roomId) || S.rooms[0]; }
function roomById(id) { return S.rooms.find(r => r.id === id); }
function switchRoom(id) { if (!roomById(id) || id === S.roomId) return; wxShow(id); }
function roomQuiet(id) { switchRoom(id); }
// Where a room is in the scene on show: rooms joined to the open one share its scene (see walk3d.js walkM).
function houseM(id) { const r = roomById(id), c = curRoom(); return r && c && r.scene === c.scene ? r.M || { c: 1, s: 0, x: 0, y: 0 } : null; }
function buildRoom3D() {
  const v = roomViewer; if (!v) return;
  // Door leaves stand as far open as the Walk says (the app redraws them; here they turn in place).
  if (typeof DOORS === 'object') v.root.traverse(o => { const d = o.userData.doorLeaf; if (d) doorLeafPose(o, ease(doorAjar(d.id))); });
  v.requestRender();
}
function wall(id) { return S.walls.find(w => w.id === id); }
function cab(id) { return WXP.opens.has(id) ? { id } : null; }
function openable(c) { return !!c && WXP.opens.has(c.id); }
function clearDoorLimits() {}
function setOpen(ids, v) { ids.forEach(id => { if (v === undefined ? !ui.open[id] : v) ui.open[id] = true; else delete ui.open[id]; }); wxAnimateOpen(); }
function roomLights() { return WXP.lamps ? [{ kind: 'ceiling' }] : []; }
function realCeil3() { return WXP.ceil || (WXP.ceil = new THREE.MeshStandardMaterial()); }
function onAllFingersUp() {}
// 0.64.28: problems after the walkthrough opened are listed in a small box at the bottom (tap it to hide), so a phone
// shows what went wrong instead of just stopping.
function wxLog(t) {
  let b = document.getElementById('wxlog');
  if (!b) { b = document.createElement('div'); b.id = 'wxlog'; b.className = 'wx-log'; b.addEventListener('click', () => { b.hidden = true; }); document.body.appendChild(b); }
  const line = document.createElement('div'); line.textContent = String(t).slice(0, 300); b.appendChild(line);
  while (b.children.length > 6) b.firstChild.remove();
  b.hidden = false;
}
window.addEventListener('error', e => { if (!document.getElementById('wxload')) wxLog('Error: ' + (e.message || 'unknown') + (e.lineno ? ' (line ' + e.lineno + ')' : '')); });
window.addEventListener('unhandledrejection', e => { if (!document.getElementById('wxload')) wxLog('Error: ' + ((e.reason && e.reason.message) || e.reason)); });
// A picture bigger than max pixels is drawn smaller (phones: less graphics memory).
function wxShrinkTex(t, max) {
  const im = t.image; if (!im || !im.width || Math.max(im.width, im.height) <= max || !(im instanceof HTMLImageElement || im instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap))) return;
  const k = max / Math.max(im.width, im.height), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  try { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); t.image = c; t.needsUpdate = true; } catch (_) {}
}
`;

// The walk file's page: everything below runs in the client's browser, not in Cabinet Designer.
function wxPlayer(W) {
  const D = W.data, bin = W.bin;
  // Geometry: point each attribute at its part of the binary block.
  const T = { Float32Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float64Array };
  D.scene.geometries.forEach(g => {
    const fix = a => { if (a && a.array && a.array.$b) { const [o, n, t] = a.array.$b; a.array = new T[t](bin, o, n); } };
    Object.values(g.data.attributes).forEach(fix); fix(g.data.index);
  });
  const host = document.getElementById('wxhost'), wrap = document.getElementById('wxwrap'), logo = document.getElementById('wxlogo').src;
  // 0.64.30: the simple look (now only with ?lite=1 on the link) draws without smoothed edges.
  const gc0 = HTMLCanvasElement.prototype.getContext, fastStart = new URLSearchParams(location.search).get('lite') === '1';
  if (fastStart) HTMLCanvasElement.prototype.getContext = function (t, o) { return gc0.call(this, t, o && typeof o === 'object' ? { ...o, antialias: false } : o); };
  let v;
  try { v = new Viewer3D(host); } finally { HTMLCanvasElement.prototype.getContext = gc0; }
  roomViewer = v; viewers.push(v);
  if (!v.ok) { document.getElementById('wxmsg').textContent = 'This browser could not start 3D. Try Chrome or Safari.'; document.getElementById('wxload').className = 'wx-load'; return; }
  // 0.64.28: a phone that runs out of graphics memory drops the 3D; it's noted on screen and brought back when the
  // browser allows (every look and picture is sent to the graphics chip again).
  const el3 = v.renderer.domElement;
  el3.addEventListener('webglcontextlost', e => { e.preventDefault(); wxLog('The phone dropped the 3D (graphics memory). Trying to bring it back…'); });
  el3.addEventListener('webglcontextrestored', () => {
    v.scene.traverse(o => [].concat(o.material || []).forEach(m => { if (!m) return; m.needsUpdate = true; for (const k in m) if (m[k] && m[k].isTexture) m[k].needsUpdate = true; }));
    v.renderer.shadowMap.needsUpdate = true; v.requestRender(); wxLog('3D back.');
  });
  v.setReal(true); SUN.hour = D.sun || 15;
  S.rooms = D.rooms;
  // 0.64.28 (Ayden 2026-11-27: the link "loads once then freezes after running like 7 frames"): phones and tablets run a
  // safe mode. One picture pixel per screen pixel, never changed while walking (changing the picture's size makes the
  // phone set up its drawing memory again, and Walk's speed check did that as you started and stopped). No soft shade
  // (it draws the whole room a second time into extra pictures each frame). One small sun shadow, drawn only when
  // something changes; no lamp shadows. Pictures at most 1024 px. Add ?safe=1 to the link to try it on a computer,
  // ?safe=0 to turn it off on a phone.
  const qs = new URLSearchParams(location.search), force = qs.get('safe');
  const phone = WXP.phone = force === '1' ? true : force === '0' ? false : matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  if (phone) {
    v.renderer.setPixelRatio(1); v.sun.shadow.mapSize.set(1024, 1024); v.resize();
    AO.on = false; walkRes = function () {};
    v.renderer.shadowMap.autoUpdate = false;
  }
  // 0.64.29 (Ayden 2026-11-27: "literally runs at like 5 frames a second even with the safe=1 added", on the PC): a
  // browser drawing 3D without the graphics card (hardware acceleration off or the card refused, so the computer's main
  // chip draws every pixel) runs this room at about 5 frames a second, the same as Ayden saw. Such a browser, or any
  // that walks slower than about 20 frames a second, switches once to Simple look: no shadows, plain (matte) surfaces,
  // and a smaller picture stretched to the screen; about 8 times quicker there. ?lite=1 forces it, ?lite=0 never.
  const soft = (() => { try { const gl = v.renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); const n = String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(n) ? n : ''; } catch (_) { return ''; } })();
  WXP.soft = soft;
  const liteQ = qs.get('lite'), mats = new Map();
  const plain = m => {
    if (!m || !(m.isMeshStandardMaterial)) return m;
    let l = mats.get(m); if (l) return l;
    l = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, alphaMap: m.alphaMap, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, visible: m.visible, toneMapped: m.toneMapped });
    l.userData = m.userData; l.name = m.name; mats.set(m, l); return l;
  };
  const liteObj = o => o.traverse(x => { if (x.isMesh && x.material) x.material = Array.isArray(x.material) ? x.material.map(plain) : plain(x.material); });
  window.wxLite = why => {
    if (WXP.lite) return; WXP.lite = why;
    const r = v.renderer; AO.on = false;
    r.shadowMap.enabled = false; mats.forEach(l => { l.needsUpdate = true; });
    Object.values(WXP.scenes).flat().forEach(liteObj); liteObj(v.scene);
    if (WXP.ceil) WXP.ceil = mats.get(WXP.ceil) || WXP.ceil;
    v.requestRender();
  };
  // 0.64.33 (Ayden 2026-11-27: "that share link looks so bad there is no point of it, could we do a 3d preview that they
  // can rotate maybe at near full quality"): the walkthrough opens at the full look (shadows, soft shading, smooth edges,
  // shiny surfaces) and draws only when something moves. While the view turns or you walk, the picture is drawn smaller
  // with no soft shading (its size follows how fast this computer keeps up); a moment after it stops, one full picture.
  // A computer drawing without its graphics card only draws the small picture while moving, so turning stays smooth.
  // Phones keep their safe mode (one size, no soft shading). ?lite=1 on the link still gives the old simple look.
  walkRes = function () {};
  const D2 = WXP.draft = { full: v.renderer.getPixelRatio(), pr: 0, ft: 0, at: 0, movedAt: 0, last: 0, t: 0 };
  const capW = soft ? 640 : 1100;
  v.controls.addEventListener('change', () => { D2.movedAt = performance.now(); });
  const movedAt = () => Math.max(D2.movedAt, (typeof WALK === 'object' && WALK.movedAt) || 0);
  v.beforeDraw = () => {
    // Hinges, guides and screws behind shut doors are hidden when looking around too, not only while walking.
    if (!v.walk && typeof walkHwCull === 'function') walkHwCull(v);
    const r = v.renderer;
    if (WXP.lite) {
      AO.on = false;
      v.scene.traverse(x => { if (x.isMesh && x.material && x.material.isMeshStandardMaterial) x.material = plain(x.material); });
      if (WXP.ceil && mats.get(WXP.ceil)) WXP.ceil = mats.get(WXP.ceil);
      return;
    }
    if (phone) { AO.on = false; r.shadowMap.autoUpdate = false; return; }
    const now = performance.now(), moving = now - movedAt() < 200, anim = typeof openAnim !== 'undefined' && !!openAnim;
    const w = v.host.clientWidth, h = v.host.clientHeight; if (!w || !h) return;
    if (!D2.pr) D2.pr = Math.min(D2.full, capW / w);
    if (moving) {
      // How long frames take while moving; every half second the moving picture gets smaller or bigger to keep up.
      const gap = now - D2.last; if (gap < 300) D2.ft = D2.ft ? D2.ft * 0.8 + gap * 0.2 : gap;
      if (now - D2.at > 500 && D2.ft) {
        D2.at = now;
        if (D2.ft > 40) D2.pr = Math.max(0.2, D2.pr * 0.8);
        else if (D2.ft < 22) D2.pr = Math.min(D2.full, capW / w, D2.pr * 1.15);
      }
    } else D2.ft = 0;
    D2.last = now;
    const pr = moving ? D2.pr : D2.full;
    if (Math.abs(r.getPixelRatio() - pr) > 0.001) { r.setPixelRatio(pr); r.setSize(w, h, false); }
    AO.on = !moving;
    // Shadows don't change when only the view turns or you walk; worked out again for the still picture and while
    // doors swing.
    r.shadowMap.autoUpdate = !moving || anim;
    // The full picture a moment after the last move.
    if (moving) { clearTimeout(D2.t); D2.t = setTimeout(() => v.requestRender(), 230); }
  };
  // A picture that takes over 1.5 s to draw is noted on screen (what the phone was doing helps find what froze it).
  const draw0 = v.draw.bind(v);
  v.draw = function () {
    const t0 = performance.now(); draw0(); const dt = performance.now() - t0;
    if (dt > 1500 && WXP.shownOnce && (phone || now0() - movedAt() < 200)) wxLog(`A picture took ${(dt / 1000).toFixed(1)} s to draw (${WALK.on ? 'walking' : 'looking around'}${typeof openAnim !== 'undefined' && openAnim ? ', opening' : ''}).`);
  };
  const now0 = () => performance.now();
  if (liteQ === '1') wxLite('asked');
  const say = t => { const m = document.getElementById('wxmsg'); if (m) m.textContent = t; };
  new THREE.ObjectLoader().parseAsync(D.scene).then(all => {
    all.children.forEach(g => { WXP.scenes[g.userData.scene] = g.children.slice(); });
    Object.values(WXP.scenes).flat().forEach(o => o.traverse(x => {
      if (x.userData.open && x.userData.cabId) WXP.opens.add(x.userData.cabId);
      if (x.material) [].concat(x.material).forEach(m => { if (m && m.userData && m.userData.ceil) WXP.ceil = m; });
      if (phone && x.isLight && x.castShadow) x.castShadow = false;
      if (phone && x.material) [].concat(x.material).forEach(m => { if (m) for (const k in m) if (m[k] && m[k].isTexture) wxShrinkTex(m[k], 1024); });
    }));
    wxUI();
    wxShow(D.rooms[0].id, true);
    say('Getting the picture ready…');
    // The first picture builds every look the room needs (slow on a phone); done behind the loading card.
    requestAnimationFrame(() => setTimeout(() => {
      try { v.renderer.compile(v.scene, v.cam); } catch (_) {}
      v.draw(); WXP.shownOnce = true;
      const l = document.getElementById('wxload'); if (l) l.remove();
    }, 0));
  }).catch(e => { say('This walkthrough could not open: ' + (e && e.message || e)); const l = document.getElementById('wxload'); if (l) l.className = 'wx-load'; });

  window.wxShow = (id, first) => {
    const r = roomById(id); if (!r) return;
    // A room joined to the one on show is already in the scene: only the open room changes.
    const same = WXP.shown === r.scene;
    if (!same) {
      while (v.root.children.length) v.root.remove(v.root.children[0]);
      (WXP.scenes[r.scene] || []).forEach(o => v.root.add(o)); WXP.shown = r.scene;
    }
    S.roomId = id; S.walls = r.walls || []; S.fixtures = r.fixtures || []; S.cabinets = r.cabs || []; WXP.lamps = !!r.lamps; WXP.sunFace = r.sunFace || null;
    if (!same) { WXP.ceil = null; v.root.traverse(x => { if (x.material) [].concat(x.material).forEach(m => { if (m && m.userData && m.userData.ceil) WXP.ceil = m; }); }); v.fitShadow(); }
    if (!(typeof WALK !== 'undefined' && WALK.on)) { if (r.cam) v.setView(r.cam); else v.look(roomViewDir(0.75)); }
    v.requestRender();
    const sel = document.getElementById('wxroom'); if (sel) sel.value = id;
    const nm = document.getElementById('wxrname'); if (nm) nm.textContent = r.name;
  };

  // Doors and drawers open with the same moves as Cabinet Designer, using the swing each one was given there.
  window.wxAnimateOpen = () => {
    if (openAnim) return;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; let moving = false;
      new Set([...Object.keys(openT), ...Object.keys(ui.open)]).forEach(id => {
        const goal = ui.open[id] ? 1 : 0, cur = openT[id] || 0;
        if (Math.abs(goal - cur) < 1e-3) { openT[id] = goal; return; }
        openT[id] = cur + Math.sign(goal - cur) * Math.min(Math.abs(goal - cur), dt / 0.45); moving = true;
      });
      v.root.traverse(o => { const op = o.userData.open; if (!op || !o.userData.cabId) return; const t = openT[o.userData.cabId] || 0;
        if (op.kind === 'pocket') { const m = pocketMove(o, t); o.rotation.y = op.sign * m.a; o.position.set(op.base.x + m.dx, 0, op.base.z + m.dz); }
        else if (op.kind === 'door') o.rotation.y = op.sign * (op.lead ? ease(t) * ease(t) : ease(t)) * op.swing;
        else o.position.z = ease(t) * op.travel;
        hwFollow(o);
      });
      v.requestRender();
      openAnim = moving ? requestAnimationFrame(step) : 0;
      // Safe mode draws shadows only on a change: once the door or drawer stops.
      if (!moving) v.renderer.shadowMap.needsUpdate = true;
    };
    openAnim = requestAnimationFrame(step);
  };

  // The page around the 3D: logo and job name, room picker, time of day, Walk; a welcome card to start.
  function wxUI() {
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const coarse = matchMedia('(pointer: coarse)').matches;
    const top = document.createElement('div'); top.className = 'wx-top';
    top.innerHTML = `<img src="${logo}" alt="LARKUL Custom"><div><b>${esc(D.name)}</b><span id="wxrname"></span></div>`;
    const bar = document.createElement('div'); bar.className = 'wx-bar';
    bar.innerHTML = (D.rooms.length > 1 ? `<select id="wxroom" aria-label="Room">${D.rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>` : '')
      + `<label class="wx-sun" title="Time of day">${icon('sun')}<input type="range" id="wxsun" min="5" max="22" step="0.25" value="${SUN.hour}" aria-label="Time of day"><span id="wxsunl">${sunLabel(SUN.hour)}</span></label>`
      + `<button class="btn primary" id="walk3d" data-act="walk3d"></button>`;
    const card = document.createElement('div'); card.className = 'wx-card'; card.id = 'wxcard';
    card.innerHTML = `<img src="${logo}" alt=""><h1>${esc(D.name)}</h1><p>See your new ${D.rooms.length > 1 ? 'rooms' : 'room'} in 3D. ${coarse ? 'Drag to turn it, pinch to zoom.' : 'Drag to turn it, scroll to zoom.'} Or walk through it: ${coarse ? 'the stick at the bottom left walks, or tap the floor.' : 'W A S D or the arrow keys walk.'} ${coarse ? 'Tap' : 'Click'} a cabinet to open it.</p>`
      + `<button class="btn primary big" data-go="look">Look around in 3D</button><button class="btn big" data-go="walk">${icon('walk')}Walk through it</button>`
      + `<small>Designed by LARKUL Custom · ${esc(D.made)}</small>`;
    const fl = document.createElement('div'); fl.className = 'wx-flash'; fl.id = 'wxflash'; fl.hidden = true;
    wrap.append(top, bar, card, fl);
    card.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; card.remove(); if (b.dataset.go === 'walk') walkStart(); });
    bar.querySelector('#walk3d').addEventListener('click', () => { const c = document.getElementById('wxcard'); if (c) c.remove(); walkToggle(); });
    const rs = bar.querySelector('#wxroom'); if (rs) rs.addEventListener('change', () => { const on = WALK.on; if (on) walkStop(); wxShow(rs.value); if (on) walkStart(); });
    bar.querySelector('#wxsun').addEventListener('input', e => { SUN.hour = +e.target.value; document.getElementById('wxsunl').textContent = sunLabel(SUN.hour); v.fitShadow(); v.requestRender(); });
    wxBtn();
  }
  window.wxBtn = () => { if (typeof renderRoomWalkBtn === 'function') renderRoomWalkBtn(); };
}

const WX_CSS = `
:root{--accent:#2563eb;--panel:#fff;--line:#d8dce3;--t-n:#56647a;--ink:#1d2533;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#e4e1db;font:14px/1.4 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);-webkit-tap-highlight-color:transparent}
.wx-wrap{position:fixed;inset:0}.wx-host{position:absolute;inset:0}.wx-host canvas{display:block;width:100%!important;height:100%!important;touch-action:none}
.walkui{position:absolute;inset:0}
.wx-wrap:has(.walkui) #walk3d,.wx-wrap:has(.walkui) .wx-sun{display:none}
.ic{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}
.btn.sm{padding:4px 9px;font-size:12px}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.big{font-size:16px;padding:12px 22px;border-radius:10px}.btn.link{border:0;background:none;color:var(--t-n);font-weight:500;text-decoration:underline}
.wx-top{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 12px 6px 6px;max-width:calc(100% - 24px);z-index:6}
.wx-top img{height:34px;width:auto}.wx-top div{display:flex;flex-direction:column;min-width:0}.wx-top b,.wx-top span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wx-top span{font-size:12px;color:var(--t-n)}
.wx-bar{position:absolute;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:6px;z-index:6;max-width:calc(100% - 24px)}
.wx-bar select{font:inherit;border:1px solid var(--line);border-radius:8px;padding:7px 8px;background:#fff;max-width:40vw}
.wx-sun{display:flex;align-items:center;gap:6px;color:var(--t-n);font-size:12px;white-space:nowrap}.wx-sun input{width:110px;accent-color:var(--accent)}
.wx-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100% - 32px));background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px;text-align:center;z-index:8;display:flex;flex-direction:column;align-items:center;gap:12px}
.wx-card img{height:64px}.wx-card h1{font-size:20px;margin:0}.wx-card p{margin:0;color:var(--t-n)}.wx-card small{color:var(--t-n);font-size:11px}
.wx-load{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#f4f3f0;z-index:20;padding:16px;text-align:center}.wx-load img{height:80px}.wx-load span{color:var(--t-n)}
.wx-load.run span::before{content:'';display:block;width:26px;height:26px;margin:4px auto 10px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:wxspin .8s linear infinite}
@keyframes wxspin{to{transform:rotate(360deg)}}
button,select,input{touch-action:manipulation}
.wx-flash{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:6px 12px;font-size:13px;z-index:9}
@media (max-width:700px),(max-height:500px){.wx-wrap:has(.walkui) .wx-top{display:none}}
@media (max-width:560px){.wx-sun span{display:none}.wx-sun input{width:80px}.wx-top img{height:28px}}
/* 0.64.26: phones and tablets. While walking the room picker moves to the bottom right, clear of the stick; the Walk
   bar shows icons only, in finger-sized buttons, its hints in a note under it. */
.wx-wrap:has(.walkui) .wx-bar{left:auto;right:max(12px,env(safe-area-inset-right));transform:none}
.wx-wrap:has(.walkui) .wx-bar:not(:has(select)){display:none}
.wx-log{position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:30;background:rgba(150,20,20,.92);color:#fff;font-size:12px;line-height:1.35;border-radius:8px;padding:6px 10px;max-height:30vh;overflow:auto}
@media (pointer:coarse){
.btn{min-height:40px}.wx-bar select{min-height:40px}
.walkbar{top:max(10px,env(safe-area-inset-top));gap:6px;padding:5px}
.walkbar .btn{width:44px;height:44px;padding:0;justify-content:center;font-size:0;gap:0}.walkbar .btn .ic{width:20px;height:20px}
.walkbar .walklights[aria-pressed=true]{background:var(--ink);color:#fff}
.walkhint{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(29,37,51,.88);color:#fff;font-size:13px;padding:7px 12px;border-radius:9px;white-space:normal;width:max-content;max-width:min(92vw,420px);text-align:center;pointer-events:none}
.walkbar:has(.walkhint){padding-left:5px}
.walksun span{display:none}.walksun input{width:min(34vw,140px)}
.walkstick{width:128px;height:128px;left:max(18px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom))}.walkstick i{width:52px;height:52px}
.wx-card{max-height:calc(100% - 24px);overflow:auto}
}
@media (pointer:coarse) and (max-height:500px){.wx-card{padding:14px;gap:8px}.wx-card img{height:40px}.wx-card h1{font-size:17px}.btn.big{padding:9px 18px}}
`;
