// Mozaik import: reads a Mozaik job (zipped job folder, .moz room files or Mozaik XML) into a new job.
// Rooms, walls and cabinets with their sizes come across. Each product is matched by its Mozaik name and type (0.61.0);
// one with no match is listed after the import, never swapped for whatever library product is closest in size.
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
// Which end of a 45° or 90° corner sits in the room's corner: the end whose back is nearest another wall
// (L = its left end as you face it). Null when neither end is near one.
function mozCornerSide(c, walls = S.walls) {
  const w = walls.find(o => o.id === c.wall); if (!w) return null;
  const g = wg(w), f = w.thick / 2;
  const gap = a => { const P = wallPt(w, g, c.side, a, f); return Math.min(Infinity, ...walls.filter(o => o.id !== w.id).map(o => segDist(P, o).d - o.thick / 2)); };
  const lo = gap(c.off), hi = gap(c.off + c.w), near = Math.min(lo, hi);
  if (near > 3 || Math.abs(lo - hi) < 1) return null;
  // On the front side of a wall the cabinet's left is its low end along the wall; on the back side it is the high end.
  return (lo < hi) === (c.side === 1) ? 'L' : 'R';
}
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
        w: mzNum(f, 'W'), h: mzNum(f, 'H'), x: mzNum(f, 'X') || 0, y: mzNum(f, 'Y') || 0, z: mzNum(f, 'Z') || 0, face: f.getAttribute('FaceIdx') || '', hinge: (f.getAttribute('HingeEdge') || '')[0] || '', style: f.getAttribute('DoorStyle') || '',
      })).filter(f => f.w > 0 && f.h > 0),
    };
  }).filter(p => p.w > 0 && p.h > 0 && p.d > 0);
  // Appliances and sinks (Appls, Wall="2_1" like products) and wall openings and windows (Fixts, Wall="1").
  const fx = (x, src) => ({ src, name: x.getAttribute('Name') || '', type: +x.getAttribute('Type') || 0, wall: parseInt(x.getAttribute('Wall'), 10) || 0, back: /_2$/.test(x.getAttribute('Wall') || ''),
    w: mzNum(x, 'Width'), h: mzNum(x, 'Height'), d: mzNum(x, 'Depth') || 0, x: mzNum(x, 'X') || 0, elev: mzNum(x, 'Elev') || 0 });
  const appls = [...kids(el.querySelector(':scope > Appls'), 'Appl').map(x => fx(x, 'appl')), ...kids(el.querySelector(':scope > Fixts'), 'Fixt').map(x => fx(x, 'fixt'))].filter(a => a.w > 0 && a.h > 0);
  const set = el.querySelector(':scope > RoomSet'), hwNames = {}, mats = {};
  if (set) [['slide', 'DrawerGuide'], ['hinge', 'BaseHinges'], ['pull', 'BasePulls']].forEach(([k, a]) => { const v = set.getAttribute(a); if (v) hwNames[k] = v; });
  // 0.61.0: the room's Mozaik materials. Material template by category (1 doors and finished parts, 2 drawer boxes, 3 cabinet,
  // 4 countertop), the top's colour, and the door style (NonColumnBaseDoor, e.g. "Shaker 60 (SP)").
  if (set) {
    [...set.getElementsByTagName('BaseMatTempSel')].forEach(b => {
      const t = b.getElementsByTagName('MaterialTemplateSelection')[0], n = t && t.getAttribute('MissingTemplateName'); if (!n) return;
      const k = { 1: 'finish', 2: 'drawer', 3: 'cabinet', 4: 'top' }[b.getAttribute('CategoryId')]; if (k && !mats[k]) mats[k] = n;
      if (k === 'top') { const tx = [...t.getElementsByTagName('TextureIdOverrideByPartType')].find(x => x.getAttribute('PartType') === 'COUNTERTOP'); if (tx && tx.getAttribute('MissingTextureName')) mats.topColor = tx.getAttribute('MissingTextureName'); }
    });
    const ds = set.getAttribute('NonColumnBaseDoor'); if (ds) mats.door = ds;
  }
  // Room quantity (Mozaik's Quan): the same room built that many times.
  const qty = Math.max(1, Math.round(+el.getAttribute('Quan') || +el.getAttribute('Quantity') || 1));
  return { name: el.getAttribute('Name') || fallbackName, walls, prods, appls, hwNames, mats, qty };
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
// 0.61.0 (Ayden 2026-11-23: closet hang units came in as range hoods, a cooktop base as a sink base): the library product for a
// Mozaik cabinet, by name and type only. The same name first; then the shop's standard cabinet for what the Mozaik name
// says (door, drawer, sink, blind, open, oven...). Size never picks the product, and a hood, filler, mantel, shelf or
// shop-made piece only matches its own name. null = no match: the product is listed after the import, not swapped.
const MOZ_STD = { Base: ['b-1d1dr', 'b-2d1dr', 'b-3dr', 'b-sink', 'b-blind', 'b-corner45', 'b-corner90', 'b-open-shelf', 'b-mw-drawer', 'b-vanity-legs', 'b-vanity-legs-sink'],
  Wall: ['w-1d', 'w-2d', 'w-blind', 'w-corner45', 'w-corner90', 'w-open-shelf', 'w-mw-shelf', 'w-mw-upper', 'w-hood'], Tall: ['t-pantry', 't-open-pantry'] };
// Bid Reader rows (codes like B24 and a description) keep the word-and-width pick they always had; their products are
// chosen by Bid Reader's own plan first.
function bidNearLib(p, cat) {
  const cornerOk = /blind|susan|corner/i.test(p.name || '') && !/^(bf|wf)\d*\b/i.test(p.name || '');
  const libs = S.library.filter(l => l.cat === cat && !l.made && (cornerOk || !l.corner)); if (!libs.length) return S.library[0];
  const words = s => new Set(s.toLowerCase().replace(/(\d)\s*(drw|drawers?)\b/g, '$1drawer').replace(/(\d)\s*(dr|doors?)\b/g, '$1door').split(/[^a-z0-9]+/).filter(Boolean));
  const pw = words(p.name + ' ' + (typeof bidNoEndWords === 'function' ? bidNoEndWords(p.desc) : p.desc));
  const score = l => { let s = 0; words(l.name).forEach(x => { if (pw.has(x)) s += /\d/.test(x) ? 3 : 1; }); return s - Math.abs(l.w - p.w) / 100; };
  return libs.reduce((a, b) => score(b) > score(a) ? b : a);
}
function mozPick(p, cat) {
  const n = (p.name + ' ' + p.desc).toLowerCase(), pair = /\bpair\b|\bdouble door|\b2 ?(door|dr)\b/.test(n), door = /\bdoors?\b|\bdr\b/.test(n);
  const drw = /drawer|\bdrw\b/.test(n), corner = /corner|susan/.test(n) && !/filler|^\s*(bf|wf)\d*\b/.test(n);
  if (cat === 'Tall') {
    if (/\bopen\b/.test(n)) return 't-open-pantry';
    if (/oven|pantry|linen|utility|broom|\bdoors?\b/.test(n)) return 't-pantry';
    return null;
  }
  if (cat === 'Wall') {
    if (/hood/.test(n)) return /wall hood|hood cab/.test(n) ? 'w-hood' : null;
    if (/microwave/.test(n)) return /open/.test(n) ? 'w-mw-upper' : 'w-mw-shelf';
    if (/blind/.test(n)) return 'w-blind';
    if (corner) return /45/.test(n) ? 'w-corner45' : 'w-corner90';
    if (/\bopen\b|shelves/.test(n)) return 'w-open-shelf';
    if (pair) return 'w-2d';
    if (door || /^\s*(wall|upper|island upper)\b/.test(n)) return p.w > 24 ? 'w-2d' : 'w-1d';
    return null;
  }
  if (/sink|\blav\b/.test(n)) return 'b-sink';
  if (/cooktop/.test(n)) return 'b-3dr';
  if (/microwave/.test(n)) return 'b-mw-drawer';
  if (/blind/.test(n)) return 'b-blind';
  if (corner) return /45/.test(n) ? 'b-corner45' : 'b-corner90';
  if (/\bopen\b/.test(n)) return 'b-open-shelf';
  if (drw && !door) return 'b-3dr';
  if (pair) return 'b-2d1dr';
  if (door || /\b(base|vanity|bench)\b/.test(n)) return p.w > 24 ? 'b-2d1dr' : 'b-1d1dr';
  return null;
}
function mozLib(p, cat) {
  const same = mozSameName(p); if (same && (same.cat === cat || /shelf/i.test(p.name))) return same;
  if (p.fromBid) return bidNearLib(p, cat);
  const id = mozPick(p, cat), l = id && libItem(id);
  if (l && l.cat === cat) return l;
  // A library without that product (American Cabinets): its standard cabinet of the same kind, by name words.
  if (id) { const want = id.replace(/^[bwt]-/, ''), alt = S.library.find(x => x.cat === cat && !x.made && !x.moz && (x.id === id || x.id.endsWith(want))); if (alt) return alt; }
  return null;
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
  const tall = bands.reduce((a, b) => b.h > a.h ? b : a), out = [];
  // 0.61.0: a space between two rows of fronts (a wall oven's or microwave's opening) is an open row that tall.
  bands.forEach((b, i) => {
    const up = bands[i - 1], gap = up ? up.z - (b.z + b.h) : 0;
    if (sz(gap) > 3) out.push({ type: 'open', h: sz(gap) });
    out.push(row(b));
  });
  // The opening holds the appliance, so it gets no shelves; shelves set row by row then, about one per 14" of door.
  if (out.some(r => r.type === 'open')) {
    const fixed = out.reduce((t, r) => t + (r.h === '*' ? 0 : +r.h), 0), star = Math.max(0, sz(p.h) - fixed);
    out.forEach(r => { if (r.type === 'open') r.shelves = 0; else if (r.type === 'door') r.shelves = Math.max(0, Math.floor((r.h === '*' ? star : +r.h) / 14)); });
  }
  return out;
  function row(b) {
    const fs = b.fs.sort((x, y) => x.x - y.x), type = fs.some(f => f.type === 'door') ? 'door' : 'drawer';
    const r = { type, h: b === tall ? '*' : sz(b.h), count: fs.length };
    if (type === 'door' && fs.length === 1 && /[LR]/.test(fs[0].hinge)) r.hinge = fs[0].hinge;
    const st = style(fs[0].style); if (st) r.style = st;
    return r;
  }
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
// The library product with the same name as the Mozaik one (e.g. the Sheppard Bracket shelf), if there is one.
const mozSameName = p => S.library.find(l => l.cat !== 'Shape' && (l.name || '').trim().toLowerCase() === (p.name || '').trim().toLowerCase());
// 0.61.0: Mozaik products that aren't cabinets, each made as what it is. Returns true when the product was handled
// (placed, or listed after the import).
const mozPR = p => { const n = (p.name + ' ' + p.desc).toLowerCase(); return p.type !== 2 && (/dish ?washer/.test(n) || /\(pr\)|panel ?ready/.test(n)); };
function mozThing(rm, p, at, put, flag, sz) {
  const n = (p.name + ' ' + p.desc).toLowerCase(), same = mozSameName(p);
  // A panel-ready appliance (fridge or freezer column, dishwasher): the appliance, and its panel fronts in front of it.
  if (mozPR(p)) {
    const kind = /dish/.test(n) ? 'dw' : p.h < 40 ? 'ucfridge' : 'fridge';
    const pre = FIXT_LIB.find(x => x.name.toLowerCase() === p.name.trim().toLowerCase()) || FIXT_LIB.find(x => x.kind === kind && x.pr);
    const f = fixtNew(pre.id);
    Object.assign(f, { name: p.name, w: p.w, h: p.h, d: p.d, wall: at.wall, side: at.side, off: at.off, elev: p.elev || 0, pr: true, panels: true, fromMozaik: true });
    rm.fixtures.push(f);
    const lib = libItem('made-apfront');
    if (lib) {
      const fr = p.fronts.map(q => ({ z: sz(q.z), h: sz(q.h), x: sz(q.x), w: sz(q.w), hinge: q.hinge, type: q.type })).sort((a, b) => b.z - a.z || a.x - b.x);
      put(lib, p, at, { name: p.name + ' panel front', d: 0.75, outset: r3((p.outset || 0) + p.d), mp: { fr: fr.length ? fr : [] }, fixt: f.id });
    }
    return true;
  }
  if (same) return false;
  // A loose countertop (a wood top over a washer and dryer): a flat top piece at its height, cut from the room's top
  // material (butcher block for a wood top).
  if (/\b(wood|butcher|laminate|quartz|stone|counter|solid) ?tops?\b|^\s*tops?\s*$/.test(n) && !/cap|rail/.test(n)) {
    const tp = (typeof countertop === 'function' && countertop(roomSet('countertop', rm))) || {}, wood = /wood|butcher/.test(n) && mat('m-butcher');
    const t = p.h > 0 && p.h <= 3 ? p.h : +tp.thick || 1.5;
    rm.shapes.push({ id: uid('s'), libId: null, name: p.name, plane: 'flat', pts: rect4(p.w, p.d), thick: r3(t), mat: wood ? 'm-butcher' : tp.mat || 'm-butcher', wall: at.wall, side: at.side, off: at.off, outset: p.outset || 0, elev: r3(p.elev + p.h - t), fromMozaik: true });
    return true;
  }
  // A leg or column (an island's 6x6 legs): a solid post cut from the finish.
  if (/column|\blegs?\b|\bpost\b/.test(n)) {
    rm.shapes.push({ id: uid('s'), libId: null, name: p.name, plane: 'upright', pts: rect4(p.w, p.h), thick: r3(p.d), mat: SHAPE_FIN, wall: at.wall, side: at.side, off: at.off, outset: p.outset || 0, elev: p.elev || 0, fromMozaik: true });
    return true;
  }
  // A standing panel (a closet's floor mount panel): a Support Panel at its size.
  if (/\bpanel\b/.test(n) && !p.fronts.length && p.w <= 3 && !/applied|door|back|valance|end panel/.test(n) && !isEndPanel(p) && libItem('made-panel')) {
    put(libItem('made-panel'), p, at, { d: p.d });
    return true;
  }
  // Floating shelves: the library's floating shelf product at the Mozaik size.
  if (/shel(f|ves)/.test(n) && !p.fronts.length && !/open|unit|cabinet|microwave/.test(n)) {
    const lib = typeof bidShelfLib === 'function' && bidShelfLib();
    if (lib) put(lib, p, at); else flag(p, 'no floating shelf in the library');
    return true;
  }
  // Ceiling trim: the library's C Mold.
  if (/ceiling trim|c ?mold/.test(n)) {
    const lib = libItem('moz-frost-ceiling-trim');
    if (lib) put(lib, p, at, { h: lib.h, d: lib.d }); else flag(p, 'no ceiling trim in the library');
    return true;
  }
  // Crown and molding are drawn by the molding runs here.
  if (/trim|molding|crown/.test(n) && !p.fronts.length) { (rm._skip = rm._skip || []).push(p.name); return true; }
  return false;
}
// Mozaik's panel backs (the finished back of an island) become an upright panel in the room.
const isPanelBack = p => /panel back|back panel/i.test(p.name);
// The Cabinet Designer appliance or opening for a Mozaik one. Outlets, faucets and other pictures (Type 20) are left out
// quietly; a Mozaik wall stub (TWall) and anything unknown is listed after the import.
function mozFixtPreset(a) {
  const n = a.name.toLowerCase();
  // 0.61.0: a faucet is a picture on the sink, never a second sink (it cut a second hole in the top).
  if (/faucet|tap\b/.test(n)) return 'quiet';
  const same = a.src !== 'fixt' && FIXT_LIB.find(x => x.name.toLowerCase() === n.trim()); if (same) return same.id;
  if (/cooktop|cook top|hob\b/.test(n)) return (/induc|electric/.test(n) ? 'ck-ind' : 'ck-gas') + (a.w > 33 * 25.4 || (a.w > 33 && a.w < 80) ? '36' : '30');
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
// Cut from the room's finish material (Ayden 2026-11-19: not plywood with plastic laminate, cut it out of the finish).
function mozPanel(rm, name, wallId, side, off, w, h, t) {
  const sh = { id: uid('s'), libId: null, name, plane: 'upright', pts: rect4(w, h), thick: t, mat: SHAPE_FIN, wall: wallId, side, off: r3(off), outset: 0, elev: 0, fromMozaik: true };
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
  // Bid Reader's rooms are always inches; a long wall there must not be read as millimetres.
  const k = data.inches ? 1 : mozScale(data.rooms);
  const sz = v => k === 1 ? r3(v) : Math.round(v * k * 32) / 32, cv = v => r3(v * k);
  return data.rooms.map((src, i) => {
    const rm = newRoom(uid('r'), src.name || 'Room ' + (i + 1), []); rm.block = i + 1;
    const th = src.walls.map(w => w.thick).find(t => t > 0), ht = src.walls.map(w => w.height).find(t => t > 0);
    rm.wallThick = th ? sz(th) : S.job.wallThick; rm.wallHeight = ht ? sz(ht) : S.job.wallHeight;
    mozHardware(rm, src);
    mozMaterials(rm, src, data);
    const walls = mozWalls(src.walls, sz, rm);
    rm.walls = walls.map(({ a0, L, ...w }) => w);
    // Wall end caps Bid Reader read (bidWalls): Left/Right end caps and custom caps, sticking out on the cabinet side.
    src.walls.forEach((sw, j) => {
      const bc = sw.bidCaps, w = rm.walls[j]; if (!bc || !w || w.hidden) return;
      if (bc.S) w.capS = { on: true, len: bc.S, side: 1 };
      if (bc.E) w.capE = { on: true, len: bc.E, side: 1 };
      if (bc.along.length) w.caps = bc.along.map(c => ({ id: uid('cap'), a: r3(c.a), len: c.len, side: 1 }));
    });
    const ps = src.prods.map(p0 => ({ ...p0, w: sz(p0.w), h: sz(p0.h), d: sz(p0.d), x: cv(p0.x), y: isFinite(p0.y) ? cv(p0.y) : NaN, elev: sz(p0.elev), outset: sz(p0.outset) }));
    const cabs = [], extras = [], flag = (p, why) => (data.flagged = data.flagged || []).push(why ? `${p.name} (${why})` : p.name);
    // A library product placed where the Mozaik one is, at its size.
    const put = (lib, p, at, o = {}) => {
      const c = newCab(S, lib, at.wall, at.side, at.off);
      Object.assign(c, { name: p.name || lib.name, w: p.w, h: p.h, d: p.d, elev: p.elev, fromMozaik: true }, o);
      if (p.outset && o.outset === undefined) c.outset = p.outset;
      if (p.num) c.num = p.num;
      if (c.made && typeof madeSync === 'function') madeSync(c);
      rm.cabinets.push(c); return c;
    };
    ps.forEach(p => {
      if (isPanelBack(p) && walls[p.wall - 1]) {
        const wl = walls[p.wall - 1], side = p.back ? -1 : 1, off = p.back ? wl.a0 + wl.L - p.x - p.w : p.x + wl.a0;
        mozPanel(rm, wl.hidden ? 'Island back panel' : p.name, wl.id, side, off, p.w, p.h, p.d > 0 && p.d < 2 ? p.d : 0.75);
        return;
      }
      const wl = walls[p.wall - 1];
      // On the back of a wall Mozaik measures X from the wall's far end, the viewer's left from that side.
      const at = !wl ? mozIsland(rm, p) : p.back ? { wall: wl.id, side: -1, off: r3(wl.a0 + wl.L - p.x - p.w) } : { wall: wl.id, side: 1, off: r3(p.x + wl.a0) };
      // Pieces that aren't cabinets: panel-ready appliances, tops, legs, shelves, trim, standing panels (0.61.0).
      if (!p.fromBid && mozThing(rm, p, at, put, flag, sz)) return;
      if (p.fromBid && /shelf|trim|molding|crown/i.test(p.name) && !p.fronts.length && !mozSameName(p)) { (data.skipped = data.skipped || []).push(p.name); return; }
      if (isFiller(p) || isEndPanel(p)) {
        // A filler the library has by name (BTH, TTH, BTF, TTF, Wall fillers) is placed as itself, as in Mozaik.
        const fl = isFiller(p) && !p.fromBid && mozSameName(p);
        if (fl) put(fl, p, at); else extras.push({ p, at });
        return;
      }
      const cat = mozCat(p), lib = mozLib(p, cat);
      if (!lib) { flag(p, 'no product of that name or kind in the library'); return; }
      const c = newCab(S, lib, at.wall, at.side, at.off);
      Object.assign(c, { name: p.name || lib.name, w: p.w, h: p.h, d: p.d, elev: p.elev, fromMozaik: true });
      // From a Bid Reader row: its notes, and ADA (9" toe) when the row says so.
      if (p.fromBid) { if (p.notes) c.notes = p.notes; if (p.ada && c.cat !== 'Wall') c.params = { ...(c.params || {}), ada: 'on' }; if (p.ends && !c.made && !c.moz) Object.assign(c, p.ends); }
      // A base or tall cabinet hung off the floor (a floating vanity drawer) has no toe kick, legs or toe skin.
      if (p.elev > 0.5 && c.cat !== 'Wall' && c.construction && c.construction.toeKick) c.construction.toeKick = false;
      // Corner products keep their own fronts; Mozaik's name says which end goes in the corner.
      if (c.corner) { if (/right|\(r\)/i.test(p.name)) c.corner.side = 'R'; else if (/left|\(l\)/i.test(p.name)) c.corner.side = 'L'; }
      // A 45° or 90° corner ("45 Susan Cabinet") has no side in its name: its full-depth end goes against the other wall.
      if (angledCorner(c)) { const s = mozCornerSide(c, rm.walls); if (s) c.corner.side = s; }
      // 0.61.10 (Ayden 2026-11-23, Argil laundry: "in yours the corner cab is all weird"): a 45° or 90° corner takes its leg
      // depth from Mozaik (how far out its doors stand from the back, 15" on the laundry talls, not the library's 12") and its
      // rows of doors from one face (Mozaik's 90° corner has a tall door with a short one over it on each leg).
      let rows = null;
      if (angledCorner(c)) {
        const ys = p.fronts.map(f => sz(f.y)).filter(y => y > 3 && y < Math.min(p.w, p.d) - 3);
        if (ys.length) c.corner = { ...c.corner, leg: Math.round(Math.max(...ys) * 4) / 4 };
        // 0.62.6 (Ayden 2026-11-24: "its two separate doors"): a Mozaik 90° corner's doors are two doors, each hung on
        // the cabinet, not a bi-fold.
        if (c.corner.type === 'l' && new Set(p.fronts.map(f => f.face)).size > 1) c.corner = { ...c.corner, doors: 'pair' };
        const faces = [...new Set(p.fronts.map(f => f.face))], one = p.fronts.filter(f => f.face === faces[0]);
        if (one.length) { rows = mozRows({ ...p, fronts: one }, sz); if (rows) rows.forEach(r => { if (r.count) r.count = 1; }); }
      } else rows = mozRows(p, sz);
      if (rows) c.rows = rows;
      if (/oven/i.test(p.name) && !(rows || []).some(r => r.type === 'open')) flag(p, 'check the oven opening');
      // 0.62.6 (Ayden 2026-11-24: "the tall cabinet in the butler pantry is a double oven"): an oven cabinet gets its wall
      // oven (or two, one over the other for a "double") standing in the opening between its fronts, front flush with the
      // cabinet's face.
      if (/oven/i.test(p.name) && (rows || []).some(r => r.type === 'open') && typeof fixtNew === 'function') {
        const fr = p.fronts.map(f => ({ z0: sz(f.z), z1: sz(f.z + f.h) })).sort((a, b) => a.z0 - b.z0);
        let gap = null; for (let i = 1; i < fr.length; i++) { const g0 = Math.max(...fr.slice(0, i).map(q => q.z1)), g1 = fr[i].z0; if (g1 - g0 > 3 && (!gap || g1 - g0 > gap.h)) gap = { z: g0, h: g1 - g0 }; }
        if (gap) {
          const dbl = /double|\b2\b|two/i.test(p.name + ' ' + (p.desc || '')) || gap.h > 40, ow = r3(Math.max(10, c.w - 1.5)), od = Math.min(23.5, c.d - 0.5);
          const f = fixtNew(dbl ? (c.w < 29 ? 'ov-d27' : 'ov-d30') : (c.w < 29 ? 'ov-s27' : 'ov-s30'));
          Object.assign(f, { w: ow, h: r3(gap.h - 0.25), elev: r3((c.elev || 0) + gap.z + 0.125), wall: at.wall, side: at.side, off: r3(at.off + (c.w - ow) / 2), outset: r3((c.outset || 0) + c.d - od), d: od, ovens: dbl ? 2 : 1, fromMozaik: true });
          rm.fixtures.push(f);
        }
      }
      if (p.outset) c.outset = p.outset;
      if (p.num) c.num = p.num;
      if (p.inserts.length) c.inserts = p.inserts.map(mozInsert);
      rm.cabinets.push(c); cabs.push(c);
    });
    if (rm._skip) { (data.skipped = data.skipped || []).push(...rm._skip); delete rm._skip; }
    // End panels belong to the cabinet beside them; a filler with no product of its name too: one that reaches a wall turns
    // that cabinet's filler on, anything else becomes its end panel.
    extras.forEach(({ p, at }) => {
      // hi: the piece sits past the cabinet's far end along the wall. Which of those is the viewer's left or right
      // depends on the side of the wall.
      const near = (c, hi) => c.wall === at.wall && c.side === at.side && p.elev < c.elev + c.h - 0.5 && p.elev + p.h > c.elev + 0.5 && Math.abs(hi ? at.off - (c.off + c.w) : c.off - (at.off + p.w)) < 0.2;
      let c = cabs.find(x => near(x, true)) || cabs.find(x => near(x, false));
      // A panel standing well above the cabinet beside it (a 105" panel beside a fridge, next to a base or under an upper) is
      // its own full-height panel, not that cabinet's end (0.60.0 for bids, 0.61.0 for every import).
      if (c && isEndPanel(p) && p.h > c.h + 6) c = null;
      // 0.59.27: an end panel with no cabinet beside it (a fridge panel, a panel at the end of open shelves) stands on its own
      // as a Support Panel instead of being left out.
      const sp = !c && isEndPanel(p) && typeof libItem === 'function' && libItem('made-panel');
      if (sp) {
        const k = put(sp, p, at, { name: p.name && !/^finished panel$/i.test(p.name) ? p.name : sp.name, h: p.h > 0 ? p.h : sp.h, d: p.d > 3 ? p.d : p.w > 3 ? p.w : sp.d, elev: p.elev || 0, outset: p.outset || 0 });
        return;
      }
      // 0.61.0: a filler with no cabinet beside it (in a washer niche, beside a bench) is placed as the library's filler.
      if (!c && isFiller(p) && !p.fromBid) {
        const cat = mozCat(p), r = /right|\(r\)/i.test(p.name) ? 'right' : 'left', fl = libItem(cat === 'Wall' ? 'moz-frost-wall-' + r : cat === 'Tall' ? 'moz-frost-tth-' + r : 'moz-frost-bth-' + r);
        if (fl) { put(fl, p, at); return; }
      }
      if (!c) { (data.skipped = data.skipped || []).push(p.name); return; }
      const hi = near(c, true), end = (hi === (at.side === 1)) ? 'R' : 'L';
      const wl = rm.walls.find(w => w.id === at.wall), L = wl ? Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) : 0, ref = walls.find(w => w.id === at.wall);
      const toWall = ref && !ref.hidden && (hi ? at.off + p.w > L - 0.5 : at.off < 0.5 + ref.a0) && rm.walls.length > 1;
      if (isFiller(p) && toWall) c['fill' + end] = 'on'; else c['panel' + end] = 'on';
    });
    // A cabinet under a top brought in from Mozaik (a washer pedestal or bench under a wood top) gets no automatic
    // countertop as well.
    rm.shapes.filter(x => x.fromMozaik && x.plane === 'flat').forEach(t => {
      const w = t.pts.reduce((a, q) => Math.max(a, q.x), 0);
      rm.cabinets.forEach(c => { if (c.wall === t.wall && c.side === t.side && Math.min(c.off + c.w, t.off + w) - Math.max(c.off, t.off) > 1 && Math.abs(c.elev + c.h - t.elev) < 1) c.noTop = true; });
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
      if (pid === 'quiet') return;
      if (!pid || !wl) { if (a.type !== 20) (data.skipped = data.skipped || []).push(a.name); return; }
      const f = fixtNew(pid), w = sz(a.w), x = cv(a.x);
      Object.assign(f, { w, h: sz(a.h), wall: wl.id, side: a.back ? -1 : 1, off: r3(a.back ? wl.a0 + wl.L - x - w : x + wl.a0), fromMozaik: true });
      if (fixtDef(f).top) { f.name = a.name || f.name; if (f.cooktop) f.d = sz(a.d) || f.d; }
      else if (a.src === 'fixt') { f.name = a.name || f.name; f.elev = sz(a.elev); }
      // 0.61.0: an appliance up off the floor (a washer and dryer on a 31 1/2" pedestal) keeps its height.
      else { f.d = sz(a.d) || f.d; if (a.elev > 0) f.elev = sz(a.elev); if (a.name) f.name = a.name; }
      rm.fixtures.push(f);
    });
    rm.autoTops = true;
    const keepR = S.rooms; S.rooms = [rm];
    try { withRoom(rm, () => mozCornerFit(rm)); } finally { S.rooms = keepR; }
    return rm;
  }).flatMap((rm, i) => {
    // 0.61.0 (Ayden 2026-11-23: "Laundry Room Bath" set to 6 in Mozaik came in once): a room with a quantity comes in that
    // many times, so the cut list, CNC file and price count every one.
    const n = data.rooms[i].qty || 1; if (n < 2 || typeof duplicateRoom !== 'function') return [rm];
    const base = rm.name, out = [rm]; rm.name = `${base} (1 of ${n})`;
    for (let j = 2; j <= n; j++) { const r = duplicateRoom(rm); r.name = `${base} (${j} of ${n})`; out.push(r); }
    return out;
  }).map((rm, i) => { rm.block = i + 1; return rm; });
}
// 0.61.0 (Ayden 2026-11-23: the laundry Wall 90 Corner ran 3/4" into the tall beside it on the next wall): Mozaik
// butts the cabinet on the next wall against the corner's return a little inside the corner's depth, so the corner's
// return leg is cut back to meet it (up to 2"; more than that is a real overlap and is left to see).
function mozCornerFit(rm) {
  rm.cabinets.filter(c => c.corner && c.corner.type === 'l' && angledCorner(c)).forEach(c => {
    rm.cabinets.forEach(k => {
      if (k === c || k.wall === c.wall || angledCorner(k) || !vOverlap(c, k)) return;
      const o = obstacles(k.wall, k.side, k, k.id).find(x => x.id === c.id); if (!o) return;
      const ov = Math.min(o.a1, k.off + k.w) - Math.max(o.a0, k.off);
      if (ov > 0.01 && ov <= 2 && c.d - ov > 6) c.d = r3(c.d - ov);
    });
  });
}
// 0.61.0 (Ayden 2026-11-23: the white oak shaker, white melamine and Caldera tops came in as the default paint-grade shaker
// on MDF): the room's Mozaik materials picked by name. A name with nothing like it here is listed in the job notes.
function mozMaterials(rm, src, data) {
  const m = src.mats || {}, miss = [], words = t => String(t || '').toLowerCase();
  const pick = (k, list, name, test, alt) => { const hit = list.find(x => test(words(name), words(x.name), x)) || (alt && list.find(x => alt(words(name), words(x.name)))); if (hit) rm.settings[k] = hit.id; else miss.push(name); };
  const wood = n => /white ?oak|rift/.test(n) ? 'oak' : /alder/.test(n) ? 'alder' : /maple/.test(n) ? 'maple' : /walnut/.test(n) ? 'walnut' : /cherry/.test(n) ? 'cherry'
    : /melamine|\bmel\b|thermofoil|laminate/.test(n) ? 'melamine' : /mdf|hdm|paint/.test(n) ? 'paint' : '';
  const same = (a, b) => { const x = wood(a); return !!x && (x === wood(b) || (x === 'paint' && /mdf|paint/.test(b)) || (x === 'melamine' && /melamine|laminate/.test(b))); };
  // "White Oak/ White Melamine" is the outside / the inside: the cabinet material is the inside (the finished outside comes
  // from the Finish). A drawer template "15mm Rubberwood/White Mel" is sides / bottom: the box is picked by its sides.
  const part = (n, i) => { const a = String(n).split('/').map(x => x.trim()).filter(Boolean); return a.length > 1 ? a[i < 0 ? a.length - 1 : i] : n; };
  if (m.cabinet) pick('cabMatT', (S.matTemplates || {}).cabinet || [], part(m.cabinet, -1), (n, l) => same(n, l));
  if (m.drawer) pick('drawerMatT', (S.matTemplates || {}).drawer || [], part(m.drawer, 0), (n, l) => same(n, l), (n, l) => /baltic|birch|ply/.test(n) && /birch/.test(l));
  // Doors and finished parts: the finish by wood, the door template by shape (style = shape only; the finish decides material).
  const fin = m.finish || m.door, fw = wood(words(fin));
  if (fin && fw && fw !== 'melamine') pick('finish', S.finishes || [], fin, (n, l) => same(n, l));
  else if (fin && fw === 'melamine') pick('finish', S.finishes || [], fin, (n, l) => /laminate|melamine/.test(l));
  const shape = words(m.door || m.finish);
  if (shape) {
    const want = /shaker/.test(shape) ? /shaker/ : /slab|flat/.test(shape) ? /^slab/ : /5 ?piece|raised/.test(shape) ? /5-piece|raised/ : null;
    const t = want && (S.doorTemplates || []).find(x => want.test(words(x.name)));
    if (t) rm.settings.doorT = t.id; else if (m.door) miss.push(m.door);
  }
  if (m.top) {
    const n = words(m.top + ' ' + (m.topColor || ''));
    const t = (S.countertops || []).find(x => /butcher|wood/.test(n) ? /butcher/.test(words(x.name)) : /laminate|formica|wilsonart/.test(n) ? /laminate/.test(words(x.name)) : /quartz|stone|granite|thinscape|caesar|silestone|cambria|corian|solid|caldera/.test(n) ? /quartz/.test(words(x.name)) : false);
    if (t) rm.settings.countertop = t.id; else miss.push(m.top);
    if (m.topColor) (data.matNotes = data.matNotes || []).push(`${rm.name}: tops ${m.top}, ${m.topColor}`);
  }
  if (miss.length) (data.matNotes = data.matNotes || []).push(`${rm.name}: no match here for ${[...new Set(miss)].join(', ')}`);
}
// Builds a new job from the Mozaik files and saves it next to the other jobs.
// opts.folder: the Jobs folder to save it in; opts.from: where it came from, for the job notes. Resolves to the
// new job's path, or null when nothing was imported.
async function importMozaik(files, opts = {}) {
  let data = readMozaik(await mozTexts(files));
  // A job sent from Bid Reader carries its takeoff (bid-reader-takeoff.json) for what a Mozaik job can't hold.
  const tk = typeof bidTakeoffOf === 'function' ? await bidTakeoffOf(files) : null;
  // A native takeoff (no Mozaik files at all): the rooms, walls and cabinets are built straight from it.
  if (!data.rooms.length && tk && tk.native && typeof bidNativeData === 'function') data = bidNativeData(tk);
  if (!data.rooms.length && !(tk && bidTakeoffItems(tk).length)) { flash('No rooms, walls or cabinets found in that Mozaik file. Send it to Claude so the import can learn it.'); return null; }
  await flushJob();
  const first = files[0].name.replace(/\.[^.]+$/, '').replace(/ - Cabinet Designer$/, '');
  const s = blankJob(safeName(data.jobName || (tk && tk.job) || first) || 'Mozaik job', '');
  // 0.59.34 (Ayden 2026-11-20: "unless we import a bid, i want him to follow the bid exactly"): Bid Reader says how to
  // draw it (takeoff "draw"). 'exact' = only what the bid shows: no automatic end panels, fillers, fridge panels or shelf
  // supports (the switches stay in the item bar to turn on). 'larkul' (and older Bid Reader) = the shop's rules.
  if (tk) {
    s.job.bidDraw = tk.draw === 'exact' ? 'exact' : 'larkul';
    if (s.job.bidDraw === 'exact') s.job.layout = { ...(s.job.layout || {}), autoPanels: false, autoFillers: false, fridgePanels: false };
    s.bidSupp = 1; s.fridgeP = 1;
  }
  // The texture list, for showing the bid's finish (bidFinishLook).
  if (tk && typeof loadTexLib === 'function') await loadTexLib().catch(() => {});
  const prev = S; S = s; attachRoom(S);
  let rooms, added = null;
  try {
    rooms = mozRooms(data);
    if (tk) added = bidTakeoffAdd(rooms, tk);
    // 0.60.0: and the way the chat takeoffs draw bids (tops by others at $0, finish look, corner panels, overlap check).
    if (tk && typeof bidRules === 'function') added = bidRules(rooms, tk, added);
  } finally { S = prev; }
  if (!rooms.length) { flash('Nothing in that job to bring in.'); return null; }
  s.rooms = rooms; s.roomId = rooms[0].id; s.job.notes = `Imported from ${opts.from || 'Mozaik'} ${new Date().toLocaleDateString()}`;
  if (added && added.overlaps && typeof bidOverlapNote === 'function') s.job.notes += '\n' + bidOverlapNote(added.overlaps);
  if (added && added.cornerChecks && added.cornerChecks.length) s.job.notes += '\nCorners to check:\n' + added.cornerChecks.join('\n');
  // 0.61.0: Mozaik products with no match here, and the Mozaik materials (tops colour, names with no match).
  const tally = list => { const k = {}; (list || []).forEach(n => { k[n] = (k[n] || 0) + 1; }); return Object.entries(k).map(([n, q]) => q > 1 ? `${q} × ${n}` : n); };
  const flagged = tally(data.flagged);
  if (flagged.length) s.job.notes += '\nNot matched, check these (not drawn):\n' + flagged.join('\n');
  if (data.matNotes && data.matNotes.length) s.job.notes += '\nMozaik materials:\n' + data.matNotes.join('\n');
  const folder = opts.folder || jobs.view || 'My jobs', p = freePath(folder, s.job.name);
  s.job.name = jobNameOf(p);
  ['status', 'stageAt', 'was', 'tag'].forEach(k => delete s.job[k]);
  await jobStore().mkdir(folder).catch(() => {}); await jobStore().write(p, JSON.stringify(s));
  await refreshJobs();
  loadJobState(attachRoom(s), p);
  const nc = rooms.reduce((t, r) => t + r.cabinets.length, 0), nw = rooms.reduce((t, r) => t + r.walls.filter(w => !w.island && !w.hidden).length, 0);
  const sk = {}; (data.skipped || []).forEach(n => { sk[n] = (sk[n] || 0) + 1; });
  const left = Object.entries(sk).map(([n, k]) => k > 1 ? `${k} ${n}` : n).join(', ');
  flash(`Imported ${s.job.name} from ${opts.from || 'Mozaik'}: ${rooms.length} room${rooms.length > 1 ? 's' : ''}, ${nw} walls, ${nc} cabinets.${flagged.length ? ` No match for ${flagged.length} product${flagged.length > 1 ? 's' : ''}, listed in the job notes.` : ''}${left ? ' Not brought in: ' + left + '.' : ''}${typeof bidTakeoffNote === 'function' ? bidTakeoffNote(added) : ''}`);
  return p;
}
// Anything that is not a Cabinet Designer job file is read as Mozaik.
const isMozaikPick = files => files.length > 1 || !/\.json$/i.test(files[0].name);
