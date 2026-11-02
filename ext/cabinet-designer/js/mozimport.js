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
  return out;
}

/* ---------- Reading Mozaik XML ---------- */
// Attribute lookup that ignores case and tries each name in turn; child elements with that name count too.
function mzAttr(el, names) {
  const map = {};
  for (const a of el.attributes) map[a.name.toLowerCase()] = a.value;
  for (const ch of el.children) if (!ch.children.length && ch.textContent.trim()) { const k = ch.tagName.toLowerCase(); if (!(k in map)) map[k] = ch.textContent.trim(); }
  for (const n of names) { const v = map[n.toLowerCase()]; if (v !== undefined && v !== '') return v; }
  return undefined;
}
function mzNum(el, names) { const v = mzAttr(el, names); if (v === undefined) return NaN; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : NaN; }
const MZ = {
  x: ['X', 'PosX', 'X1', 'StartX', 'LocX', 'XPos'], y: ['Y', 'PosY', 'Y1', 'StartY', 'LocY', 'YPos'],
  x2: ['X2', 'EndX', 'PosX2'], y2: ['Y2', 'EndY', 'PosY2'],
  len: ['Len', 'Length', 'Width', 'W'], ang: ['Ang', 'Angle', 'Rot', 'Rotation', 'Dir'],
  thick: ['Thickness', 'Thick', 'Thk', 'Depth', 'WallThickness'], height: ['Height', 'Hgt', 'H', 'WallHeight'],
  w: ['Width', 'W', 'Wid'], h: ['Height', 'H', 'Hgt'], d: ['Depth', 'D', 'Dep'],
  elev: ['Elev', 'Elevation', 'Z', 'PosZ', 'Bottom', 'Floor'],
  name: ['Name', 'ProdName', 'Description', 'Desc', 'Title', 'Type', 'ProductName'],
};
const mzTag = (el, re) => re.test(el.tagName.replace(/^.*:/, ''));
function parseMozXml(text) {
  const i = text.indexOf('<'); if (i < 0) return null;
  const doc = new DOMParser().parseFromString(text.slice(i).replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  return doc;
}
// One room from an element: its walls and products, raw numbers in the file's units.
function readMozRoom(el, fallbackName) {
  const all = [...el.getElementsByTagName('*')];
  const walls = all.filter(x => mzTag(x, /^wall$/i)).map(x => {
    const r = { x: mzNum(x, MZ.x), y: mzNum(x, MZ.y), x2: mzNum(x, MZ.x2), y2: mzNum(x, MZ.y2), len: mzNum(x, MZ.len), ang: mzNum(x, MZ.ang), thick: mzNum(x, MZ.thick), height: mzNum(x, MZ.height) };
    if (!isFinite(r.x2) && isFinite(r.len)) { const a = (isFinite(r.ang) ? r.ang : 0) * Math.PI / 180; r.x2 = (r.x || 0) + Math.cos(a) * r.len; r.y2 = (r.y || 0) + Math.sin(a) * r.len; }
    return r;
  }).filter(r => isFinite(r.x2) && isFinite(r.y2));
  // Products, skipping parts nested inside another product.
  const PROD = /^(product|cabinet|cab|prod)$/i, nested = x => { for (let p = x.parentElement; p && p !== el; p = p.parentElement) if (mzTag(p, PROD)) return true; return false; };
  const prods = all.filter(x => mzTag(x, PROD) && !nested(x))
    .map(x => ({ name: mzAttr(x, MZ.name) || '', w: mzNum(x, MZ.w), h: mzNum(x, MZ.h), d: mzNum(x, MZ.d), x: mzNum(x, MZ.x), y: mzNum(x, MZ.y), elev: mzNum(x, MZ.elev), ang: mzNum(x, MZ.ang), all: [...x.attributes].map(a => a.name + '=' + a.value).join(' ') }))
    .filter(p => p.w > 0 && p.h > 0 && p.d > 0);
  const name = mzAttr(el, ['Name', 'RoomName', 'Title']) || fallbackName;
  const unit = (mzAttr(el, ['Units', 'Unit', 'UnitType']) || '').toLowerCase();
  return { name, walls, prods, unit };
}
function readMozaik(texts) {
  const rooms = []; let jobName = '';
  texts.forEach(({ name, text }) => {
    const doc = parseMozXml(text); if (!doc) return;
    const root = doc.documentElement;
    if (!jobName && mzTag(root, /job/i)) jobName = mzAttr(root, ['Name', 'JobName', 'Title']) || '';
    const roomEls = [...doc.getElementsByTagName('*')].filter(x => mzTag(x, /^room$/i));
    const base = name.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
    (roomEls.length ? roomEls : [root]).forEach((el, k) => {
      const r = readMozRoom(el, roomEls.length > 1 ? base + ' ' + (k + 1) : base);
      if (r.walls.length || r.prods.length) rooms.push(r);
    });
  });
  return { rooms, jobName };
}

/* ---------- Turning it into Cabinet Designer rooms ---------- */
// Mozaik works in millimetres inside its files; inches come through as they are.
function mozScale(rooms) {
  const u = rooms.map(r => r.unit).find(Boolean) || '';
  if (/mm|metric|milli/.test(u)) return 1 / 25.4;
  if (/in|imperial/.test(u)) return 1;
  const ws = rooms.flatMap(r => r.prods.map(p => p.w)).sort((a, b) => a - b);
  const ls = rooms.flatMap(r => r.walls.map(w => Math.hypot(w.x2 - w.x, w.y2 - w.y))).sort((a, b) => a - b);
  const mid = ws.length ? ws[ws.length >> 1] : ls.length ? ls[ls.length >> 1] / 10 : 0;
  return mid > 80 ? 1 / 25.4 : 1;
}
function mozCat(p) {
  const n = (p.name + ' ' + p.all).toLowerCase();
  if (/\b(upper|wall cab|wall\b|uppers|w\d)/.test(p.name.toLowerCase()) || /upper/.test(n)) return 'Wall';
  if (/\b(tall|pantry|oven|utility|linen|broom)\b/.test(n) || p.h >= 66) return 'Tall';
  if (p.elev >= 30) return 'Wall';
  return 'Base';
}
// Closest library product: same type, then most words and door/drawer counts in common, then nearest width.
function mozLib(p, cat) {
  const libs = S.library.filter(l => l.cat === cat); if (!libs.length) return S.library[0];
  const words = s => new Set(s.toLowerCase().replace(/(\d)\s*(dr|drw|drawers?)\b/g, '$1drawer').replace(/(\d)\s*(dr?s?|doors?)\b/g, '$1door').split(/[^a-z0-9]+/).filter(Boolean));
  const pw = words(p.name);
  const score = l => { let s = 0; words(l.name).forEach(x => { if (pw.has(x)) s += /\d/.test(x) ? 3 : 1; }); return s - Math.abs(l.w - p.w) / 100; };
  return libs.reduce((a, b) => score(b) > score(a) ? b : a);
}
// Puts a product on the wall its back sits against; islands get a low back wall of their own.
function mozPlace(rm, p) {
  const a = (isFinite(p.ang) ? p.ang : 0) * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) };
  const b0 = { x: p.x || 0, y: p.y || 0 }, b1 = { x: b0.x + d.x * p.w, y: b0.y + d.y * p.w };
  let best = null;
  rm.walls.forEach(w => {
    const g = wg(w); if (Math.abs(Math.abs(g.u.x * d.x + g.u.y * d.y) - 1) > 0.02) return;
    const fr = q => ({ a: (q.x - w.x1) * g.u.x + (q.y - w.y1) * g.u.y, b: (q.x - w.x1) * g.n.x + (q.y - w.y1) * g.n.y });
    const f0 = fr(b0), f1 = fr(b1), lo = Math.min(f0.a, f1.a), hi = Math.max(f0.a, f1.a);
    if (hi < -1 || lo > g.L + 1) return;
    const gap = Math.abs(Math.abs(f0.b) - w.thick / 2);
    if (gap > (w.island ? 1 : 6)) return;
    if (!best || gap < best.gap) best = { w, gap, side: f0.b < 0 ? -1 : 1, off: lo };
  });
  if (best) return { wall: best.w.id, side: best.side, off: r3(best.off) };
  const w = { id: uid('w'), x1: r3(b0.x), y1: r3(b0.y), x2: r3(b1.x), y2: r3(b1.y), thick: 0.75, height: r3(p.h + (p.elev || 0)), island: true };
  rm.walls.push(w);
  return { wall: w.id, side: 1, off: 0 };
}
function mozRooms(data) {
  // Millimetres round to the nearest 1/32", so a 457.2 mm cabinet comes in as 18".
  const k = mozScale(data.rooms), cv = v => !isFinite(v) ? v : k === 1 ? r3(v) : Math.round(v * k * 32) / 32;
  return data.rooms.map((src, i) => {
    const rm = newRoom(uid('r'), src.name || 'Room ' + (i + 1), []);
    const th = src.walls.map(w => w.thick).find(t => t > 0), ht = src.walls.map(w => w.height).find(t => t > 0);
    rm.wallThick = th ? cv(th) : S.job.wallThick; rm.wallHeight = ht ? cv(ht) : S.job.wallHeight;
    rm.walls = src.walls.map(w => ({ id: uid('w'), x1: cv(w.x || 0), y1: cv(w.y || 0), x2: cv(w.x2), y2: cv(w.y2), thick: w.thick > 0 ? cv(w.thick) : rm.wallThick, height: w.height > 0 ? cv(w.height) : rm.wallHeight }))
      .filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.5);
    src.prods.forEach(p0 => {
      const p = { ...p0, w: cv(p0.w), h: cv(p0.h), d: cv(p0.d), x: cv(p0.x), y: cv(p0.y), elev: cv(p0.elev) };
      const cat = mozCat(p), lib = mozLib(p, cat), at = mozPlace(rm, p);
      const c = newCab(S, lib, at.wall, at.side, at.off);
      Object.assign(c, { name: p.name || lib.name, w: p.w, h: p.h, d: p.d, elev: isFinite(p.elev) ? p.elev : lib.elev, fromMozaik: true });
      rm.cabinets.push(c);
    });
    return rm;
  });
}
// Builds a new job from the Mozaik files and saves it next to the other jobs.
async function importMozaik(files) {
  const data = readMozaik(await mozTexts(files));
  if (!data.rooms.length) { flash('No rooms, walls or cabinets found in that Mozaik file. Send it to Claude so the import can learn it.'); return; }
  await flushJob();
  const first = files[0].name.replace(/\.[^.]+$/, '');
  const s = blankJob(safeName(data.jobName || first) || 'Mozaik job', '');
  const prev = S; S = s; attachRoom(S);
  let rooms;
  try { rooms = mozRooms(data); } finally { S = prev; }
  s.rooms = rooms; s.roomId = rooms[0].id; s.job.notes = 'Imported from Mozaik ' + new Date().toLocaleDateString();
  const folder = jobs.view || 'My jobs', p = freePath(folder, s.job.name);
  s.job.name = jobNameOf(p);
  s.job.status = jobs.cats.stages[0].id; s.job.stageAt = new Date().toISOString();
  await jobStore().mkdir(folder).catch(() => {}); await jobStore().write(p, JSON.stringify(s));
  await refreshJobs();
  loadJobState(attachRoom(s), p);
  const nc = rooms.reduce((t, r) => t + r.cabinets.length, 0), nw = rooms.reduce((t, r) => t + r.walls.filter(w => !w.island).length, 0);
  flash(`Imported ${s.job.name} from Mozaik: ${rooms.length} room${rooms.length > 1 ? 's' : ''}, ${nw} walls, ${nc} cabinets`);
}
// Anything that is not a Cabinet Designer job file is read as Mozaik.
const isMozaikPick = files => files.length > 1 || !/\.json$/i.test(files[0].name);
