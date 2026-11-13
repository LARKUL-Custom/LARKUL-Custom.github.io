// Mozaik import: reads a Mozaik job (zipped job folder, .moz room files or Mozaik XML) into a new job.
// Rooms, walls and cabinets with their sizes come across; each cabinet is matched to the closest product in the library.
'use strict';

/* ---------- Zip reading (stored or deflated entries) ---------- */
async function unzipTexts(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), out = [];
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('the zip file is damaged');
  let p = v.getUint32(e + 16, true);
  const n = v.getUint16(e + 10, true), dec = new TextDecoder();
  for (let k = 0; k < n && v.getUint32(p, true) === 0x02014b50; k++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u8.subarray(start, start + size);
    let data = null;
    if (method === 0) data = raw;
    else if (method === 8 && typeof DecompressionStream === 'function') {
      try { data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); } catch (_) { data = null; }
    }
    if (data) out.push({ name, data });
  }
  return out;
}
const isZip = u8 => u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
function bytesText(u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
  return new TextDecoder().decode(u8);
}
// Every text file in what was picked, unzipping job folders (and zips inside them).
async function mozTexts(files) {
  const out = [];
  const add = async (name, u8, depth) => {
    if (isZip(u8)) { if (depth < 3) for (const f of await unzipTexts(u8.slice().buffer)) await add(f.name, f.data, depth + 1); return; }
    const t = bytesText(u8);
    if (t.indexOf('<') >= 0 && !/\.(png|jpe?g|gif|bmp|pdf|dll|exe)$/i.test(name)) out.push({ name, text: t });
  };
  for (const f of files) await add(f.name, new Uint8Array(await f.arrayBuffer()), 0);
  // A Mozaik job folder keeps each room in RoomN.des, with .bak and .sbk backups beside it.
  const rooms = out.filter(f => /\.(des|moz)$/i.test(f.name));
  return rooms.length ? rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : out.filter(f => !/\.(bak|sbk|dat)$/i.test(f.name));
}

// Product names in Ayden's 2026 Larkul Mozaik library by type (from its Library.ndx), so imported cabinets get the right type.
const MOZ_LIB_CATS = {"Base": ["(J) Left Base End", "(J) Right Base End", "(R)Arched End Panel Wide", "1 Drawer", "2 drawer", "3 Drawer Bank 1-2", "3 Drawer Equal", "4 Drawer Bank 1-3", "4 Drawer Equal", "45 Susan Cabinet", "4Drawer Bank 3-1", "90 Susan Cabinet", "ADA Sink", "ADA Vanity", "AppliedBarPanel", "Apron Sink Base", "Apron Sink Front", "BF 45 Outside Crnr", "BF Corner", "BF3 Return Left", "BF3 Return Right", "Base End Panel", "Base Filler 3 (Left)", "Base Filler 3 (Right)", "Base Panel Back (1_4)", "Base Panel Back (3_4)", "Base trash can", "Bench", "Blind Base W_Unit Left", "Blind Corner Left", "Blind Corner Right", "Blind corner W_unit  Right", "Blind(R)  Corner Sink", "Blink(L) Corner Sink", "Cooktop with Drawers", "Corner Sink", "Desk Drawer", "Drawer Front Sink", "Drawer Sink", "Floating vanity", "Full Height Doors Sink", "Full Heigth Pair door", "Full Heigth Single door", "Inset Vanity", "Island End Panel", "Left Applied Door", "Left BEP", "Left End Panel", "Microwave drawer", "Pair Door - Single Drawer", "Pair Door-Pair Drawer", "Right Applied Door", "Right BEP", "Right End Panel", "Single Door", "Single Door Sink", "Solid Wood (J)Panel Left", "Stove Panel", "Tip out Sink Bace", "ToeValance1", "ToeValance2", "VEP-Left", "VEP-Right", "Van-Applied-Dr-Left", "Van-Applied-Dr-Right", "Vanity Base", "Vanity Combo", "Vanity Combo Left", "Vanity ComboRight", "Vanity Drawer Bank", "Vanity Filler", "Vanity Sink Base", "Wood Box Panel (R)", "Wood Box Panel(L)", "Wood Box Panel(R)", "X_Bar Panel", "big base end", "file drawer", "open base"], "Wall": ["24 Deep Fridge", "Angled", "Angled Soffit", "Arch Front Hood", "Arched", "CNC Front Angle Hood", "CNC Taper Hood", "Countertop Panel(R)", "Hood 3", "Island Upper", "Left Filler Box", "Left Wall Filler", "Microwave Upper", "Microwave Upper Open", "Open Shelves", "Parade Hood", "Range Hood - Compound Curve Step", "Right Filler Box", "Right Wall Filler", "Split Box hood", "Straight", "Tall Wall Double door", "Tall Wall Single Door", "Traditional", "WEP - Left", "WEP - Right", "WF 45 Outside Corner", "WF Corner", "WF2 Return Left", "WF2 Return Right", "Wall 45 Corner", "Wall 90 Corner", "Wall Blind Left", "Wall Blind Right", "Wall End Panel", "Wall Filler", "Wall Pair Door", "Wall Right Applied Dr", "Wall Single Door", "Wall with Bottom Rail", "Wall with Top Rail", "Wall-Left Applied Dr"], "Tall": ["1.25 Left TF", "1.25 Right TF", "TEP Live Edge - Right", "TEP Live Edge- left", "TEP-Left", "TEP-Right", "TWall Pair Door", "TWall Single Door", "Tall -Left Applied Dr", "Tall 12in open", "Tall Blind Left", "Tall Corner 45", "Tall Double Oven", "Tall Pair Doors", "Tall Single Doors", "Tall Single Oven", "Tall-Right Applied Dr"]};

/* ---------- Reading Mozaik room files ---------- */
// A room file is a version line, then <Room Name=...> with <Walls><Wall PosX PosY Ang Len Thickness Height/>
// and <Products><Product ProdName Width Height Depth X Elev Outset Wall="2_1"/>. Everything is in millimetres,
// Y points up, X on a product runs along its wall from the wall's start, and cabinets sit to the right of the
// wall's direction.
const mzNum = (el, k) => { const v = parseFloat(el.getAttribute(k)); return isFinite(v) ? v : NaN; };
function parseMozXml(text) {
  const i = text.indexOf('<'); if (i < 0) return null;
  const doc = new DOMParser().parseFromString(text.slice(i), 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}
const kids = (el, tag) => el ? [...el.children].filter(x => x.tagName === tag) : [];
function readMozRoom(el, fallbackName) {
  const walls = kids(el.querySelector(':scope > Walls'), 'Wall').map(x => ({
    x: mzNum(x, 'PosX') || 0, y: mzNum(x, 'PosY') || 0, len: mzNum(x, 'Len'), ang: mzNum(x, 'Ang') || 0,
    thick: mzNum(x, 'Thickness'), height: mzNum(x, 'Height'), hidden: x.getAttribute('Invisible') === 'True',
  })).filter(w => w.len > 0);
  const prods = kids(el.querySelector(':scope > Products'), 'Product').map(x => {
    const t = x.querySelector(':scope > ProductType');
    return {
      name: x.getAttribute('ProdName') || x.getAttribute('Name') || '', desc: x.getAttribute('ProductDesc') || '',
      w: mzNum(x, 'Width'), h: mzNum(x, 'Height'), d: mzNum(x, 'Depth'), x: mzNum(x, 'X') || 0, y: mzNum(x, 'Y'),
      elev: mzNum(x, 'Elev') || 0, outset: mzNum(x, 'Outset') || 0, rot: mzNum(x, 'Rot') || 0,
      // Wall="3_1": wall 3, front side; "_2" is the back of the wall (an island back or the room behind).
      wall: parseInt(x.getAttribute('Wall'), 10) || 0, back: /_2$/.test(x.getAttribute('Wall') || ''),
      // ProductType SubType 1 base, 2 wall, 3 tall; SubSubType 7 filler, 9 end panel or applied door.
      type: t ? +t.getAttribute('SubType') : NaN, sub: t ? +t.getAttribute('SubSubType') : NaN, num: +x.getAttribute('CabNo') || 0,
      // Inserts placed in the cabinet's openings (graphic-only ones like an oven picture are left out).
      inserts: [...x.getElementsByTagName('*')].filter(e => /^Insert[ABC]$/.test(e.tagName) && e.getAttribute('GraphicOnly') !== 'True').map(e => e.getAttribute('Name') || ''),
      // Every door and drawer front with its spot on the cabinet face (Z up from the cabinet bottom).
      fronts: [...x.getElementsByTagName('ProductDoor'), ...x.getElementsByTagName('DrawerFront')].map(f => ({
        type: f.tagName === 'DrawerFront' || f.getAttribute('IsDrawerFront') === 'True' ? 'drawer' : 'door',
        w: mzNum(f, 'W'), h: mzNum(f, 'H'), x: mzNum(f, 'X') || 0, z: mzNum(f, 'Z') || 0, hinge: (f.getAttribute('HingeEdge') || '')[0] || '', style: f.getAttribute('DoorStyle') || '',
      })).filter(f => f.w > 0 && f.h > 0),
    };
  }).filter(p => p.w > 0 && p.h > 0 && p.d > 0);
  // Appliances and sinks (Appls, Wall="2_1" like products) and wall openings and windows (Fixts, Wall="1").
  const fx = (x, src) => ({ src, name: x.getAttribute('Name') || '', type: +x.getAttribute('Type') || 0, wall: parseInt(x.getAttribute('Wall'), 10) || 0, back: /_2$/.test(x.getAttribute('Wall') || ''),
    w: mzNum(x, 'Width'), h: mzNum(x, 'Height'), d: mzNum(x, 'Depth') || 0, x: mzNum(x, 'X') || 0, elev: mzNum(x, 'Elev') || 0 });
  const appls = [...kids(el.querySelector(':scope > Appls'), 'Appl').map(x => fx(x, 'appl')), ...kids(el.querySelector(':scope > Fixts'), 'Fixt').map(x => fx(x, 'fixt'))].filter(a => a.w > 0 && a.h > 0);
  const set = el.querySelector(':scope > RoomSet'), hwNames = {};
  if (set) [['slide', 'DrawerGuide'], ['hinge', 'BaseHinges'], ['pull', 'BasePulls']].forEach(([k, a]) => { const v = set.getAttribute(a); if (v) hwNames[k] = v; });
  return { name: el.getAttribute('Name') || fallbackName, walls, prods, appls, hwNames };
}
function readMozaik(texts) {
  const rooms = []; let jobName = '';
  texts.forEach(({ name, text }) => {
    const doc = parseMozXml(text); if (!doc) return;
    const parts = name.split('/'); if (!jobName && parts.length > 1) jobName = parts[parts.length - 2];
    const roomEls = doc.documentElement.tagName === 'Room' ? [doc.documentElement] : [...doc.getElementsByTagName('Room')];
    roomEls.forEach(el => { const r = readMozRoom(el, parts[parts.length - 1].replace(/\.[^.]+$/, '')); if (r.walls.length || r.prods.length) rooms.push(r); });
  });
  return { rooms, jobName };
}

/* ---------- Turning it into Cabinet Designer rooms ---------- */
// Sizes decide the units: Mozaik files hold millimetres, and no cabinet is over 80" in any size.
function mozScale(rooms) {
  const v = rooms.flatMap(r => r.prods.flatMap(p => [p.w, p.h])).sort((a, b) => a - b);
  const l = rooms.flatMap(r => r.walls.map(w => w.len)).sort((a, b) => a - b);
  if (v.length) return v[v.length >> 1] > 80 ? 1 / 25.4 : 1;
  return l.length && l[l.length >> 1] > 600 ? 1 / 25.4 : 1;
}
const isFiller = p => /filler/i.test(p.name + ' ' + p.desc) || p.sub === 7;
const isEndPanel = p => /end panel/i.test(p.name + ' ' + p.desc) || p.sub === 9;
function mozCat(p) {
  const known = Object.keys(MOZ_LIB_CATS).find(k => MOZ_LIB_CATS[k].includes(p.name.trim()));
  if (known) return known;
  if (p.type === 1 || p.type === 2 || p.type === 3) return ['Base', 'Wall', 'Tall'][p.type - 1];
  const n = (p.name + ' ' + p.desc).toLowerCase();
  if (/\b(upper|wall (single|pair|cab|corner|blind|with|end|filler)|uppers)/.test(n)) return 'Wall';
  if (/\b(tall|pantry|oven|utility|linen|broom)\b/.test(n) || p.h >= 66) return 'Tall';
  if (p.elev >= 40) return 'Wall';
  return 'Base';
}
// Closest library product: same type, then most words and door/drawer counts in common, then nearest width.
function mozLib(p, cat) {
  // Corner products only match Mozaik corners (not BF/WF corner fillers).
  const cornerOk = /blind|susan|corner/i.test(p.name || '') && !/^(bf|wf)\d*\b/i.test(p.name || '');
  const libs = S.library.filter(l => l.cat === cat && (cornerOk || !l.corner)); if (!libs.length) return S.library[0];
  const words = s => new Set(s.toLowerCase().replace(/(\d)\s*(drw|drawers?)\b/g, '$1drawer').replace(/(\d)\s*(dr|doors?)\b/g, '$1door').split(/[^a-z0-9]+/).filter(Boolean));
  const pw = words(p.name + ' ' + p.desc);
  const score = l => { let s = 0; words(l.name).forEach(x => { if (pw.has(x)) s += /\d/.test(x) ? 3 : 1; }); return s - Math.abs(l.w - p.w) / 100; };
  return libs.reduce((a, b) => score(b) > score(a) ? b : a);
}
// Mozaik draws a wall from its inside face; here a wall is drawn on its centerline, so each wall moves back half
// its thickness and joined walls meet again where the moved lines cross. a0 is how far the Mozaik start sits along the new wall.
function mozWalls(src, cv, rm) {
  const W = src.map(w => {
    const a = w.ang * Math.PI / 180, u = { x: Math.cos(a), y: -Math.sin(a) }, n = { x: -u.y, y: u.x };
    const t = w.thick > 0 ? cv(w.thick) : w.hidden || w.thick === 0 ? 0 : rm.wallThick, L = cv(w.len), sx = cv(w.x), sy = -cv(w.y);
    const back = { x: -n.x * t / 2, y: -n.y * t / 2 };
    return { u, t, L, ms: { x: sx, y: sy }, me: { x: sx + u.x * L, y: sy + u.y * L }, s: { x: sx + back.x, y: sy + back.y }, e: { x: sx + u.x * L + back.x, y: sy + u.y * L + back.y }, height: w.height > 0 ? cv(w.height) : rm.wallHeight };
  });
  const cross = (A, B) => {
    const den = A.u.x * B.u.y - A.u.y * B.u.x; if (Math.abs(den) < 1e-6) return null;
    const dx = B.s.x - A.s.x, dy = B.s.y - A.s.y, k = (dx * B.u.y - dy * B.u.x) / den;
    return { x: A.s.x + A.u.x * k, y: A.s.y + A.u.y * k };
  };
  W.forEach(A => W.forEach(B => {
    if (A === B || Math.hypot(A.me.x - B.ms.x, A.me.y - B.ms.y) > 0.1) return;
    const p = cross(A, B); if (p) { A.e = { ...p }; B.s = { ...p }; }
  }));
  return W.map((w, i) => ({ id: uid('w'), x1: r3(w.s.x), y1: r3(w.s.y), x2: r3(w.e.x), y2: r3(w.e.y), thick: r3(w.t), height: r3(w.height), ...(src[i].hidden ? { hidden: true } : {}), a0: (w.ms.x - w.s.x) * w.u.x + (w.ms.y - w.s.y) * w.u.y, L: w.L }));
}
// The cabinet face from Mozaik's own doors and drawer fronts, when they stack in clean rows: each row is the fronts
// that share a height band, left to right. Faces Mozaik splits into columns (a drawer bank beside doors) don't fit
// rows, so those keep the face of the closest library product. Heights are in inches; the tallest row stretches.
function mozRows(p, sz) {
  if (!p.fronts.length) return null;
  const bands = [];
  p.fronts.forEach(f => { let b = bands.find(b => Math.abs(b.z - f.z) < 2 && Math.abs(b.h - f.h) < 2); if (!b) bands.push(b = { z: f.z, h: f.h, fs: [] }); b.fs.push(f); });
  bands.sort((a, b) => b.z - a.z);
  for (let i = 1; i < bands.length; i++) if (bands[i].z + bands[i].h > bands[i - 1].z + 2) return null;
  const style = n => { const k = String(n || '').toLowerCase(), d = S.doorStyles.find(x => x.name.toLowerCase() === k) || S.doorStyles.find(x => x.name.toLowerCase() === shapeName(n).toLowerCase()); return d ? d.id : ''; };
  const tall = bands.reduce((a, b) => b.h > a.h ? b : a);
  return bands.map(b => {
    const fs = b.fs.sort((x, y) => x.x - y.x), type = fs.some(f => f.type === 'door') ? 'door' : 'drawer';
    const r = { type, h: b === tall ? '*' : sz(b.h), count: fs.length };
    if (type === 'door' && fs.length === 1 && /[LR]/.test(fs[0].hinge)) r.hinge = fs[0].hinge;
    const st = style(fs[0].style); if (st) r.style = st;
    return r;
  });
}
// The room's Mozaik drawer guide, hinge and pull, when the job has the same product: it must share a model word
// like "563H", "TANDEM" or "CLIP", not just a maker's name.
function mozHardware(rm, src) {
  const words = n => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !/^(blum|salice|hafele|grass|slides?|mat|in|full|ext|for|and|the|with|old|plate|pull|bar|knob|hinges?|drawer|door|\d+)$/.test(w)));
  Object.entries(src.hwNames || {}).forEach(([kind, name]) => {
    const want = words(name), hit = hwOf(kind).find(h => [...words(h.name)].some(w => want.has(w)));
    if (hit) rm.settings[kind] = hit.id;
  });
}
// Mozaik inserts that Cabinet Designer has: trash pull-outs, tray dividers, lazy susans and roll-outs; anything else
// goes on the hardware list as an Other insert with its Mozaik name.
function mozInsert(name) {
  // The same name in the interior library (it came from the same Mozaik library) links the product and its price.
  const lib = typeof ensureInteriorLib === 'function' && (ensureInteriorLib(S).interiorLib || []).find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase() && !['divider', 'finint', 'shelf', 'fixed'].includes(x.kind));
  if (lib) { const t = INSERT_TYPES.find(y => y.id === lib.kind) || INSERT_TYPES[INSERT_TYPES.length - 1], o = { type: t.id, ...clone(t.def || {}), item: lib.id }; if (t.fields.includes('name')) o.name = lib.name; if (+lib.h > 0 && t.fields.includes('h')) o.h = +lib.h; return o; }
  const n = name.toLowerCase(), def = id => ({ type: id, ...clone((INSERT_TYPES.find(t => t.id === id) || {}).def || {}) });
  if (/trash|waste|recycl/.test(n)) return { ...def('trash'), name };
  if (/tray div/.test(n)) return def('traydiv');
  if (/susan/.test(n)) return { ...def('lazy'), name };
  if (/roll ?out|rollout|pull ?out shel/.test(n)) return def('rollout');
  return { ...def('other'), name };
}
// Not cabinets: floating shelves, crown and ceiling trim. They're listed after the import instead.
const mozSkip = p => /shelf|trim|molding|crown/i.test(p.name) && !p.fronts.length;
// Mozaik's panel backs (the finished back of an island) become an upright panel in the room.
const isPanelBack = p => /panel back|back panel/i.test(p.name);
// The Cabinet Designer appliance or opening for a Mozaik one. Outlets, faucets and other pictures (Type 20) are left out
// quietly; a Mozaik wall stub (TWall) and anything unknown is listed after the import.
function mozFixtPreset(a) {
  const n = a.name.toLowerCase();
  if (a.src === 'fixt') return /window/.test(n) || a.type === 6 ? 'wn-1' : /door/.test(n) && !/opening/.test(n) ? 'dr-int-l' : 'op-cased';
  if (a.type === 1 || /fridge|refrig/.test(n)) return 'fr-std';
  if (a.type === 2 || /dish ?washer/.test(n)) return 'dw';
  if (a.type === 5 || /sink/.test(n)) return /farm/.test(n) ? 'sk-farm' : /apron/.test(n) ? 'sk-apron' : /bar/.test(n) ? 'sk-bar' : /bath|vanity|oval/.test(n) ? 'sk-bath'
    : /drop/.test(n) ? (/double/.test(n) ? 'sk-di2' : 'sk-di1') : /triple/.test(n) ? 'sk-um3' : /double/.test(n) ? 'sk-um2' : 'sk-um1';
  if (/range|stove|cooktop/.test(n)) return 'rg-slide';
  if (/washer/.test(n)) return 'ld-fw';
  if (/dryer/.test(n)) return 'ld-fd';
  return null;
}
// An upright panel standing on one side of a wall, from off along it, like the shapes drawn in the Shapes tool.
function mozPanel(rm, name, wallId, side, off, w, h, t) {
  const sheet = S.materials.find(m => (m.kind || 'sheet') === 'sheet') || S.materials[0];
  const sh = { id: uid('s'), libId: null, name, plane: 'upright', pts: rect4(w, h), thick: t, mat: sheet.id, wall: wallId, side, off: r3(off), outset: 0, elev: 0, fromMozaik: true };
  rm.shapes.push(sh); return sh;
}
// A product with no wall (an island) gets a thin back wall of its own at its spot in the room.
function mozIsland(rm, p) {
  const a = p.rot * Math.PI / 180, u = { x: Math.cos(a), y: -Math.sin(a) }, x = p.x, y = -(p.y || 0);
  const w = { id: uid('w'), x1: r3(x), y1: r3(y), x2: r3(x + u.x * p.w), y2: r3(y + u.y * p.w), thick: 0.75, height: r3(p.h + p.elev), island: true };
  rm.walls.push(w);
  return { wall: w.id, side: 1, off: 0 };
}
function mozRooms(data) {
  const k = mozScale(data.rooms);
  const sz = v => k === 1 ? r3(v) : Math.round(v * k * 32) / 32, cv = v => r3(v * k);
  return data.rooms.map((src, i) => {
    const rm = newRoom(uid('r'), src.name || 'Room ' + (i + 1), []); rm.block = i + 1;
    const th = src.walls.map(w => w.thick).find(t => t > 0), ht = src.walls.map(w => w.height).find(t => t > 0);
    rm.wallThick = th ? sz(th) : S.job.wallThick; rm.wallHeight = ht ? sz(ht) : S.job.wallHeight;
    mozHardware(rm, src);
    const walls = mozWalls(src.walls, sz, rm);
    rm.walls = walls.map(({ a0, L, ...w }) => w);
    const ps = src.prods.map(p0 => ({ ...p0, w: sz(p0.w), h: sz(p0.h), d: sz(p0.d), x: cv(p0.x), y: isFinite(p0.y) ? cv(p0.y) : NaN, elev: sz(p0.elev), outset: sz(p0.outset) }));
    const cabs = [], extras = [];
    ps.forEach(p => {
      if (mozSkip(p)) { (data.skipped = data.skipped || []).push(p.name); return; }
      if (isPanelBack(p) && walls[p.wall - 1]) {
        const wl = walls[p.wall - 1], side = p.back ? -1 : 1, off = p.back ? wl.a0 + wl.L - p.x - p.w : p.x + wl.a0;
        mozPanel(rm, wl.hidden ? 'Island back panel' : p.name, wl.id, side, off, p.w, p.h, p.d > 0 && p.d < 2 ? p.d : 0.75);
        return;
      }
      const wl = walls[p.wall - 1];
      // On the back of a wall Mozaik measures X from the wall's far end, the viewer's left from that side.
      const at = !wl ? mozIsland(rm, p) : p.back ? { wall: wl.id, side: -1, off: r3(wl.a0 + wl.L - p.x - p.w) } : { wall: wl.id, side: 1, off: r3(p.x + wl.a0) };
      if (isFiller(p) || isEndPanel(p)) { extras.push({ p, at }); return; }
      const cat = mozCat(p), lib = mozLib(p, cat), c = newCab(S, lib, at.wall, at.side, at.off);
      Object.assign(c, { name: p.name || lib.name, w: p.w, h: p.h, d: p.d, elev: p.elev, fromMozaik: true });
      // A base or tall cabinet hung off the floor (a floating vanity drawer) has no toe kick, legs or toe skin.
      if (p.elev > 0.5 && c.cat !== 'Wall' && c.construction && c.construction.toeKick) c.construction.toeKick = false;
      // Corner products keep their own fronts; Mozaik's name says which end goes in the corner.
      if (c.corner) { if (/right|\(r\)/i.test(p.name)) c.corner.side = 'R'; else if (/left|\(l\)/i.test(p.name)) c.corner.side = 'L'; }
      const rows = angledCorner(c) ? null : mozRows(p, sz); if (rows) c.rows = rows;
      if (p.outset) c.outset = p.outset;
      if (p.num) c.num = p.num;
      if (p.inserts.length) c.inserts = p.inserts.map(mozInsert);
      rm.cabinets.push(c); cabs.push(c);
    });
    // Fillers and end panels belong to the cabinet beside them: a filler that reaches a wall turns that cabinet's
    // filler on, anything else becomes its end panel.
    extras.forEach(({ p, at }) => {
      // hi: the piece sits past the cabinet's far end along the wall. Which of those is the viewer's left or right
      // depends on the side of the wall.
      const near = (c, hi) => c.wall === at.wall && c.side === at.side && p.elev < c.elev + c.h - 0.5 && p.elev + p.h > c.elev + 0.5 && Math.abs(hi ? at.off - (c.off + c.w) : c.off - (at.off + p.w)) < 0.2;
      const c = cabs.find(x => near(x, true)) || cabs.find(x => near(x, false)); if (!c) { (data.skipped = data.skipped || []).push(p.name); return; }
      const hi = near(c, true), end = (hi === (at.side === 1)) ? 'R' : 'L';
      const wl = rm.walls.find(w => w.id === at.wall), L = wl ? Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) : 0, ref = walls.find(w => w.id === at.wall);
      const toWall = ref && !ref.hidden && (hi ? at.off + p.w > L - 0.5 : at.off < 0.5 + ref.a0) && rm.walls.length > 1;
      if (isFiller(p) && toWall) c['fill' + end] = 'on'; else c['panel' + end] = 'on';
    });
    // An island line (Mozaik's see-through wall) with cabinets on one side gets one finished back panel along its
    // whole length on the open side, as tall as the cabinets, unless Mozaik already had one there.
    walls.forEach(wl => {
      if (!wl.hidden) return;
      const on = rm.cabinets.filter(c => c.wall === wl.id && c.elev < 1), sides = new Set(on.map(c => c.side));
      if (sides.size !== 1) return;
      const open = -[...sides][0];
      if (rm.shapes.some(x => x.wall === wl.id && x.side === open)) return;
      mozPanel(rm, 'Island back panel', wl.id, open, wl.a0, wl.L, Math.max(...on.map(c => c.elev + c.h)), 0.75);
    });
    // Appliances, sinks, openings and windows, placed along their wall like the cabinets.
    (src.appls || []).forEach(a => {
      const pid = mozFixtPreset(a), wl = walls[a.wall - 1];
      if (!pid || !wl) { if (a.type !== 20) (data.skipped = data.skipped || []).push(a.name); return; }
      const f = fixtNew(pid), w = sz(a.w), x = cv(a.x);
      Object.assign(f, { w, h: sz(a.h), wall: wl.id, side: a.back ? -1 : 1, off: r3(a.back ? wl.a0 + wl.L - x - w : x + wl.a0), fromMozaik: true });
      if (fixtDef(f).top) f.name = a.name || f.name; else if (a.src === 'fixt') { f.name = a.name || f.name; f.elev = sz(a.elev); } else f.d = sz(a.d) || f.d;
      rm.fixtures.push(f);
    });
    rm.autoTops = true;
    return rm;
  });
}
// Builds a new job from the Mozaik files and saves it next to the other jobs.
// opts.folder: the Jobs folder to save it in; opts.from: where it came from, for the job notes. Resolves to the
// new job's path, or null when nothing was imported.
async function importMozaik(files, opts = {}) {
  const data = readMozaik(await mozTexts(files));
  // A job sent from Bid Reader carries its takeoff (bid-reader-takeoff.json) for what a Mozaik job can't hold.
  const tk = typeof bidTakeoffOf === 'function' ? await bidTakeoffOf(files) : null;
  if (!data.rooms.length && !(tk && bidTakeoffItems(tk).length)) { flash('No rooms, walls or cabinets found in that Mozaik file. Send it to Claude so the import can learn it.'); return null; }
  await flushJob();
  const first = files[0].name.replace(/\.[^.]+$/, '').replace(/ - Cabinet Designer$/, '');
  const s = blankJob(safeName(data.jobName || (tk && tk.job) || first) || 'Mozaik job', '');
  const prev = S; S = s; attachRoom(S);
  let rooms, added = null;
  try { rooms = mozRooms(data); if (tk) added = bidTakeoffAdd(rooms, tk); } finally { S = prev; }
  if (!rooms.length) { flash('Nothing in that job to bring in.'); return null; }
  s.rooms = rooms; s.roomId = rooms[0].id; s.job.notes = `Imported from ${opts.from || 'Mozaik'} ${new Date().toLocaleDateString()}`;
  const folder = opts.folder || jobs.view || 'My jobs', p = freePath(folder, s.job.name);
  s.job.name = jobNameOf(p);
  ['status', 'stageAt', 'was', 'tag'].forEach(k => delete s.job[k]);
  await jobStore().mkdir(folder).catch(() => {}); await jobStore().write(p, JSON.stringify(s));
  await refreshJobs();
  loadJobState(attachRoom(s), p);
  const nc = rooms.reduce((t, r) => t + r.cabinets.length, 0), nw = rooms.reduce((t, r) => t + r.walls.filter(w => !w.island && !w.hidden).length, 0);
  const sk = {}; (data.skipped || []).forEach(n => { sk[n] = (sk[n] || 0) + 1; });
  const left = Object.entries(sk).map(([n, k]) => k > 1 ? `${k} ${n}` : n).join(', ');
  flash(`Imported ${s.job.name} from ${opts.from || 'Mozaik'}: ${rooms.length} room${rooms.length > 1 ? 's' : ''}, ${nw} walls, ${nc} cabinets.${left ? ' Not brought in: ' + left + '.' : ''}${typeof bidTakeoffNote === 'function' ? bidTakeoffNote(added) : ''}`);
  return p;
}
// Anything that is not a Cabinet Designer job file is read as Mozaik.
const isMozaikPick = files => files.length > 1 || !/\.json$/i.test(files[0].name);
