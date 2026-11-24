// Walk file: one .html file a client can open in any browser (phone, tablet or computer, nothing to install) to walk
// through their job in first person. It holds the Realistic 3D of every room (parts, appliance models, pictures),
// the same Walk controls as the 3D view (js/walk3d.js, copied in as it is when the file is made) and the LARKUL
// logo. No prices, cut lists, drilling or part data go in: only shapes, looks and lights.
// Doors and drawers still open with a tap, and the time of day can be changed.
'use strict';
const WX = { busy: false, maxTex: 1024, floorTex: 2048 };

async function walkExport() {
  if (WX.busy) return;
  if (typeof CompressionStream === 'undefined') { flash('This browser cannot make a walk file (it needs a newer Chrome or Edge)'); return; }
  WX.busy = true;
  const keep = { tab: ui.tab, view: ui.viewMode, room: S.roomId, render: ui.render3d, hidden: ui.hidden3d, cut: ui.cutaway, op: ui.wallOp, layers: ui.layers, open: ui.open, cam: null };
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
    const ctx = wxCtx(), rooms = [];
    const list = S.rooms.filter(r => (r.walls && r.walls.length) || (r.cabinets && r.cabinets.length));
    for (const r of list) {
      if (S.roomId !== r.id) { S.roomId = r.id; if (v) v.fitted = false; }
      buildRoom3D(); await wxModels(); buildRoom3D(); v.fitShadow(); await wxFrames(1);
      rooms.push(await wxRoom(v, r, ctx, r.id === keep.room ? keep.cam : null));
    }
    if (!rooms.length) throw new Error('this job has no rooms to walk');
    const html = await wxFile(rooms, ctx);
    const clean = t => String(t || '').replace(/[^\w -]/g, '').trim();
    const name = `${clean(S.job.name) || 'Job'} walkthrough.html`, blob = new Blob([html], { type: 'text/html' });
    const mb = (blob.size / 1048576).toFixed(1);
    if (inHub()) await hubSaveOver(new File([blob], name, { type: 'text/html' }), 'Cabinet Designer').then(() => flash(`Walk file saved to Files › Cabinet Designer (${mb} MB). Send it to the client; it opens in any browser.`));
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); flash(`Walk file downloaded (${mb} MB)`); }
    return blob;
  } catch (e) {
    flash('Could not make the walk file: ' + (e && e.message || e)); console.error(e);
  } finally {
    S.roomId = keep.room; ui.render3d = keep.render; ui.hidden3d = keep.hidden; ui.cutaway = keep.cut; ui.wallOp = keep.op; ui.layers = keep.layers; ui.open = keep.open;
    Object.assign(openT, openWas);
    WX.busy = false;
    if (ui.tab === 'room') { renderRoom(); if (keep.cam && roomViewer) requestAnimationFrame(() => roomViewer.setView(keep.cam)); }
    if (keep.view !== ui.viewMode) setView(keep.view);
    if (keep.tab !== ui.tab) goTab(keep.tab);
  }
}
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
  const floor = typeof realFloor3 === 'function' && realFloor3.m && realFloor3.m.map === tex;
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
  ['noBounds', 'cut', 'layer', 'fixtId', 'wall'].forEach(k => { if (u[k] !== undefined && typeof u[k] !== 'object') out[k] = u[k]; });
  if (u.cabId) out.cabId = u.cabId;
  if (u.open && u.cabId) {
    const op = u.open;
    if (op.kind === 'door') out.open = { kind: 'door', sign: op.sign, swing: doorSwing(o) };
    else if (op.kind === 'pocket') out.open = { kind: 'pocket', sign: op.sign, base: { x: op.base.x, z: op.base.z }, dx: op.dx, dz: op.dz };
    else out.open = { kind: 'drawer', travel: drawerOut(o) };
  }
  if (u.doorLeaf) out.doorLeaf = JSON.parse(JSON.stringify(u.doorLeaf));
  return Object.keys(out).length ? out : null;
}
function wxNode(o, ctx) {
  if (o.isSprite || o.isCamera || o.userData.hlEdge) return null;
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
async function wxRoom(v, r, ctx, cam) {
  v.root.updateMatrixWorld(true);
  await wxPrepMats(v, ctx);
  const kids = v.root.children.map(c => wxNode(c, ctx)).filter(Boolean);
  const L = typeof roomLights === 'function' ? roomLights() : [];
  return {
    id: r.id, name: r.name || 'Room', cam: cam && cam.mode !== 'ortho' ? cam : null,
    lamps: L.some(l => l.kind === 'ceiling') || (typeof AUTO_CEIL === 'object' && AUTO_CEIL.n > 0),
    walls: S.walls.map(w => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, thick: w.thick, height: w.height, hidden: !!w.hidden })),
    fixtures: (S.fixtures || []).filter(f => /door|opening|window|arch|pass/i.test(f.kind || f.type || '')).map(f => wxFixt(f)),
    cabs: (S.cabinets || []).map(c => ({ wall: c.wall, side: c.side, w: c.w })),
    node: { uuid: THREE.MathUtils.generateUUID(), type: 'Group', matrix: new THREE.Matrix4().toArray(), userData: { room: r.id }, children: kids },
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
  const fns = [Viewer3D, aoSetup, aoTargets, realAO, sunAt, realLight, pocketMove, wg, roomViewDir].map(f => f.toString()).join('\n');
  const consts = `const AO = { on: true };\nconst aoCoarse = ${aoCoarse.toString()};\nconst AO_VERT = ${JSON.stringify(AO_VERT)};\nconst AO_FRAG = ${JSON.stringify(AO_FRAG)};\nconst AO_BLUR = ${JSON.stringify(AO_BLUR)};\nconst sunLabel = ${sunLabel.toString()};\nconst mixHex = ${mixHex.toString()};\nconst ease = ${ease.toString()};\nconst CASE = ${JSON.stringify(CASE)};\nconst fixtInner = ${fixtInner.toString()};\nconst fixtList = () => S.fixtures || [];\nconst fixtById = id => fixtList().find(f => f.id === id);\n`;
  return [lib.three, lib.orbit, lib.icons, WX_SHIM, consts, fns, lib.walk, wxPlayer.toString(), 'wxPlayer(WXDATA);'].join('\n;\n');
}
async function wxFile(rooms, ctx) {
  const [three, orbit, icons, walk, logo] = await Promise.all([wxText('vendor/three.min.js'), wxText('vendor/OrbitControls.js'), wxText('js/icons.js'), wxText('js/walk3d.js'), wxDataUrl('img/logo.png')]);
  const meta = ctx.meta, vals = o => Object.values(o);
  const data = {
    v: 1, name: S.job.name || 'Your job', made: new Date().toISOString().slice(0, 10), sun: typeof SUN === 'object' ? SUN.hour : 15,
    rooms: rooms.map(r => ({ ...r, node: undefined })),
    scene: { metadata: { version: 4.5, type: 'Object', generator: 'Cabinet Designer walk file' }, geometries: vals(meta.geometries), materials: vals(meta.materials), textures: vals(meta.textures), images: vals(meta.images), object: { uuid: THREE.MathUtils.generateUUID(), type: 'Group', matrix: new THREE.Matrix4().toArray(), children: rooms.map(r => r.node) } },
  };
  const enc = new TextEncoder(), code = enc.encode(wxPlayerCode({ three, orbit, icons, walk })), json = enc.encode(JSON.stringify(data));
  const head = new Uint32Array([code.length, json.length]), pad = new Uint8Array((4 - (8 + code.length + json.length) % 4) % 4);
  const gz = await wxGzip([head, code, json, pad, ...ctx.chunks]);
  const b64 = await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.readAsDataURL(gz); });
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>${esc(data.name)} · Walkthrough</title><meta name="description" content="3D walkthrough by LARKUL Custom">
<style>${WX_CSS}\n${wxWalkCss()}</style></head><body>
<div class="wx-wrap view3d-wrap" id="wxwrap"><div class="wx-host" id="wxhost"></div></div>
<div class="wx-load" id="wxload"><img src="${logo}" alt="LARKUL Custom"><b>${esc(data.name)}</b><span id="wxmsg">Opening your 3D walkthrough…</span></div>
<img id="wxlogo" src="${logo}" alt="" hidden>
<script id="wxd" type="application/octet-stream">${b64}</script>
<script>${WX_BOOT}</script></body></html>`;
}
// Unpacks the file: the code and the room come gzipped in one block (about a quarter of the size).
const WX_BOOT = `(async function () {
  var msg = function (t) { var m = document.getElementById('wxmsg'); if (m) m.textContent = t; };
  try {
    if (typeof DecompressionStream === 'undefined') { msg('Please open this file in an up to date Chrome, Safari, Edge or Firefox.'); return; }
    var s = atob(document.getElementById('wxd').textContent), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    s = null; document.getElementById('wxd').remove();
    var buf = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    var head = new Uint32Array(buf, 0, 2), dec = new TextDecoder(), code = dec.decode(new Uint8Array(buf, 8, head[0]));
    var json = JSON.parse(dec.decode(new Uint8Array(buf, 8 + head[0], head[1]))), at = 8 + head[0] + head[1]; at += (4 - at % 4) % 4;
    window.WXDATA = { data: json, bin: buf.slice(at) };
    var el = document.createElement('script'); el.textContent = code; document.body.appendChild(el);
  } catch (e) { msg('This walkthrough could not open: ' + (e && e.message || e)); }
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
const WXP = { rooms: {}, opens: new Set(), lamps: false, ceil: null };
function setView() {} function select() {} function fixSel() {} function save() {} function view3dPreset() {} function render() {}
function ensureRoomViewer() {} function renderRoom() {} function fitView() {}
function flash(t) { const f = document.getElementById('wxflash'); if (!f) return; f.textContent = t; f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { f.hidden = true; }, 2600); }
function curRoom() { return S.rooms.find(r => r.id === S.roomId) || S.rooms[0]; }
function roomById(id) { return S.rooms.find(r => r.id === id); }
function switchRoom(id) { if (!roomById(id) || id === S.roomId) return; wxShow(id); }
function buildRoom3D() {
  const v = roomViewer; if (!v) return;
  // Door leaves stand as far open as the Walk says (the app redraws them; here they turn in place).
  if (typeof DOORS === 'object') v.root.traverse(o => { const d = o.userData.doorLeaf; if (d) o.rotation.y = d.k * DOOR_OPEN * ease(doorAjar(d.id)); });
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
  const v = new Viewer3D(host); roomViewer = v; viewers.push(v);
  if (!v.ok) { document.getElementById('wxmsg').textContent = 'This browser could not start 3D. Try Chrome or Safari.'; return; }
  v.setReal(true); SUN.hour = D.sun || 15;
  S.rooms = D.rooms;
  new THREE.ObjectLoader().parseAsync(D.scene).then(all => {
    all.children.forEach(g => { WXP.rooms[g.userData.room] = g.children.slice(); });
    Object.values(WXP.rooms).flat().forEach(o => o.traverse(x => {
      if (x.userData.open && x.userData.cabId) WXP.opens.add(x.userData.cabId);
      if (x.material) [].concat(x.material).forEach(m => { if (m && m.userData && m.userData.ceil) WXP.ceil = m; });
    }));
    wxUI();
    wxShow(D.rooms[0].id, true);
    document.getElementById('wxload').remove();
  }).catch(e => { document.getElementById('wxmsg').textContent = 'This walkthrough could not open: ' + (e && e.message || e); });

  window.wxShow = (id, first) => {
    const r = roomById(id); if (!r) return;
    while (v.root.children.length) v.root.remove(v.root.children[0]);
    (WXP.rooms[id] || []).forEach(o => v.root.add(o));
    S.roomId = id; S.walls = r.walls || []; S.fixtures = r.fixtures || []; S.cabinets = r.cabs || []; WXP.lamps = !!r.lamps;
    WXP.ceil = null; v.root.traverse(x => { if (x.material) [].concat(x.material).forEach(m => { if (m && m.userData && m.userData.ceil) WXP.ceil = m; }); });
    v.fitShadow();
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
        else if (op.kind === 'door') o.rotation.y = op.sign * ease(t) * op.swing;
        else o.position.z = ease(t) * op.travel;
      });
      v.requestRender();
      openAnim = moving ? requestAnimationFrame(step) : 0;
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
    card.innerHTML = `<img src="${logo}" alt=""><h1>${esc(D.name)}</h1><p>Walk through your new ${D.rooms.length > 1 ? 'rooms' : 'room'} in 3D. ${coarse ? 'Use the stick at the bottom left to walk and drag to look around.' : 'Use W A S D or the arrow keys to walk and drag to look around.'} ${coarse ? 'Tap' : 'Click'} a cabinet to open it.</p>`
      + `<button class="btn primary big" data-go="walk">${icon('walk')}Start walking</button><button class="btn link" data-go="look">Look around from outside</button>`
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
.wx-wrap:has(.walkui) #walk3d{display:none}
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
.wx-flash{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:6px 12px;font-size:13px;z-index:9}
@media (max-width:700px){.wx-wrap:has(.walkui) .wx-top{display:none}}
@media (max-width:560px){.wx-sun span{display:none}.wx-sun input{width:80px}.wx-top img{height:28px}}
`;
