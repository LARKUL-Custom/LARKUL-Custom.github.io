// Jobs from Bid Reader, drawn the way the chat takeoffs draw them (Ayden 2026-11-20: "I want the bid reader extension to
// follow all your logic when it comes to understanding and replicating bids into the cabinet designer"). Runs once on
// import, after the rooms, cabinets, shelves and built pieces are in (bidTakeoffAdd), with S the new job and S.rooms
// its rooms. What it does, in either Draw mode unless said:
//  - Countertops marked by others are still drawn, so the job looks right, but priced at $0 (room Tops $/sq ft 0).
//  - An island top with a seating overhang from the bid gets the overhang drawn on the open side (by others: $0 too).
//  - The finish named in the bid (species or melamine color, pulls) shows on the fronts, ends and toe in 3D. Look only.
//  - LARKUL rules only: automatic end panels that would run into a cabinet on the next wall (a dead corner), or into
//    another automatic panel, are turned off, so nothing is built that can't be seen or doesn't fit.
//  - The overlap check (boxes that run into each other, into a wall, past a wall's end or above the ceiling) runs on
//    every room, and what it finds goes in the import message and the job notes.
'use strict';

const bidTx = r => [r.code, r.product, r.material, r.notes].filter(Boolean).join(' ').toLowerCase();
const bidByOthers = r => r.by === 'others' || /\bby\s*(others|owner|gc)\b|\bn\.?i\.?c\b|\bofci\b|\bnot in contract\b/.test(bidTx(r));

function bidRules(rooms, tk, done) {
  done = done || { options: [] }; done.options = done.options || [];
  const keepRooms = S.rooms; S.rooms = rooms;
  try {
    bidTopsByOthers(rooms, tk, done);
    bidFinishLook(tk, done);
    bidToe(tk, done);
    bidShelves(rooms, done);
    if (!done.exact && lay().autoPanels !== false) {
      done.cornerOff = bidCornerPanels(rooms);
      if (done.cornerOff) done.options.push(`${done.cornerOff} automatic end panel${done.cornerOff === 1 ? '' : 's'} left off where ${done.cornerOff === 1 ? 'it' : 'they'} would run into a corner cabinet`);
    }
    done.overlaps = bidOverlaps(rooms);
  } finally { S.rooms = keepRooms; }
  return done;
}

/* ---------- Countertops by others, and island seating overhangs ---------- */
// The countertop template that fits the bid's words (quartz, solid surface, marble, laminate), else the room's own.
function bidTopFor(text) {
  const t = String(text || '').toLowerCase(), by = re => S.countertops.find(x => re.test((x.name || '') + ' ' + (x.id || '')));
  if (/quartz/.test(t)) return by(/quartz/i);
  if (/solid\s*surface|corian/.test(t)) return by(/solid/i) || by(/quartz/i);
  if (/marble|cultured/.test(t)) return by(/marble/i) || by(/quartz/i);
  if (/granite/.test(t)) return by(/granite/i) || by(/quartz/i);
  if (/p\.?\s*lam|laminate|formica|wilsonart/.test(t)) return S.countertops.find(x => x.id === 'top-lam2') || by(/lam/i);
  return null;
}
function bidTopsByOthers(rooms, tk, done) {
  const key = n => String(n || '').trim().toLowerCase();
  rooms.forEach(rm => withRoom(rm, () => {
    const tops = (tk.rows || []).filter(r => r.category === 'countertop' && key(r.room || 'Room') === key(rm.name));
    const bases = S.cabinets.filter(c => c.cat === 'Base');
    if (!tops.length || !bases.length) return;
    const others = tops.filter(bidByOthers);
    // Every top in the room by others: drawn on the cabinets for the look, priced at $0.
    if (others.length === tops.length) {
      const t = bidTopFor(others.map(bidTx).join(' '));
      rm.settings = { ...(rm.settings || {}), ...(t ? { countertop: t.id } : {}) };
      rm.autoTops = true; rm.topSq = 0;
      done.options.push(`countertops in ${rm.name} drawn but priced $0 (by others)`);
      tops.forEach(r => { r._drawn = true; });
      // Their Quote lines go too: nothing to price.
      const n0 = (rm.bidItems || []).length;
      rm.bidItems = (rm.bidItems || []).filter(it => !(it.cat === 'countertop' && bidByOthers({ by: it.by, notes: it.notes, material: it.material, product: it.name })));
      if (done.priced) done.priced = Math.max(0, done.priced - (n0 - rm.bidItems.length));
    }
    // An island top with seating: the bid gives the overhang ("12in overhang", "seating overhang 12"), drawn on the open side.
    const isl = rm.walls.filter(w => w.island || w.hidden);
    isl.forEach(w => {
      const on = S.cabinets.filter(c => c.wall === w.id && c.cat === 'Base' && c.elev < 1);
      const sides = new Set(on.map(c => c.side)); if (sides.size !== 1) return;
      const row = tops.find(r => /island|peninsula/.test(bidTx(r)) && /overhang|seating|bar\b|stool/.test(bidTx(r))) || (isl.length === 1 ? tops.find(r => /overhang|seating/.test(bidTx(r))) : null);
      if (!row) return;
      const m = bidTx(row).match(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch)?\s*(?:seating\s*)?overhang|overhang[^\d]{0,12}(\d+(?:\.\d+)?)/);
      const oh = m ? +(m[1] || m[2]) : 12; if (!(oh > 2 && oh < 30)) return;
      const all = S.cabinets.filter(c => c.wall === w.id && c.elev < 1);
      const a0 = Math.min(...all.map(c => c.off)), a1 = Math.max(...all.map(c => c.off + c.w));
      const tp = countertop(roomSet('countertop')) || {}, z = Math.max(...on.map(c => c.elev + c.h));
      rm.genTops = rm.genTops || [];
      rm.genTops.push({ id: uid('gt'), name: `Island top, ${oh}" seating overhang`, wall: w.id, side: -[...sides][0], off: r3(a0 - 1), len: r3(a1 - a0 + 2), depth: r3(oh + 0.75), z: r3(z), top: tp.id || roomSet('countertop') });
      done.options.push(`a ${oh}" seating overhang on the island top in ${rm.name}`);
    });
  }));
}

/* ---------- The finish look ---------- */
// The texture or color that best fits the bid's finish words ("Stevens Wood 592 Battle Creek Oak TFM", "white melamine",
// "PLAM Wilsonart Ashbee Oak"), or ''. Look only: the materials and the price don't change.
const BID_SPECIES = ['oak', 'maple', 'walnut', 'cherry', 'alder', 'hickory', 'birch', 'ash', 'pine', 'teak'];
function bidFinishPick(text) {
  const t = String(text || '').toLowerCase(); if (!t.trim()) return '';
  const list = (typeof TEXLIB !== 'undefined' && Array.isArray(TEXLIB) ? TEXLIB : null) || [];
  const words = new Set(t.split(/[^a-z0-9]+/).filter(w => w.length > 2));
  let best = null, bs = 0;
  list.forEach(x => {
    if (!/^(Wood|Melamine|Paint)\//.test(x.p || '') || /hardware|metal|glass/i.test((x.p || '') + ' ' + (x.c || ''))) return;
    const n = (x.n || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const s = n.filter(w => words.has(w)).length / Math.max(1, n.length) + n.filter(w => words.has(w)).length;
    if (s > bs) { bs = s; best = x; }
  });
  if (best && bs >= 1.5) return 'textures/' + best.p;
  const sp = BID_SPECIES.find(s => words.has(s));
  if (sp) { const x = list.find(y => (y.p || '').toLowerCase().startsWith('wood/' + sp + '/')) || list.find(y => (y.n || '').toLowerCase().includes(sp)); if (x) return 'textures/' + x.p; }
  const paint = typeof TEX_PAINTS !== 'undefined' ? TEX_PAINTS : [];
  const p = paint.find(([, n]) => words.has(n.toLowerCase())) || (/\bwhite\b/.test(t) ? paint.find(([, n]) => n === 'White') : /\bblack\b/.test(t) ? paint.find(([, n]) => n === 'Black') : /\bgr[ae]y\b/.test(t) ? paint.find(([, n]) => n === 'Grey') : null);
  return p ? p[0] : '';
}
// The finish schedule's toe height beats the shop default (miss #24): Bid Reader sends it as tk.toe.
function bidToe(tk, done) {
  const t = +tk.toe;
  if (!(t >= 2 && t <= 6)) return;
  S.job.params = { ...(S.job.params || {}), toeKickHeight: t };
  done.options.push(`toe kick ${t}" from the finish schedule`);
}
// Shelves by box height (miss #25), unless the row says how many: uppers 36"+ get 2, 24-35" get 1, under 24" none;
// talls 80"+ get 4; sink bases none; other door bases 1. Drawer-only boxes keep 0.
function bidShelves(rooms, done) {
  let n = 0;
  for (const rm of rooms) for (const c of rm.cabinets || []) {
    if (!c.fromMozaik || !c.libParams || c.libParams.shelfCount == null) continue;
    const said = String(c.notes || '').match(/(\d+)\s*(?:adj(?:ustable)?\.?\s*)?shel(?:f|ves)\b/i);
    const doors = (c.rows || []).some(r => r.type === 'door');
    let want = c.libParams.shelfCount;
    if (said) want = +said[1];
    else if (!doors) want = 0;
    else if (c.cat === 'Wall') want = c.h >= 36 ? 2 : c.h >= 24 ? 1 : 0;
    else if (c.cat === 'Tall') want = c.h >= 80 ? 4 : c.h >= 60 ? 3 : 2;
    else if (c.cat === 'Base') want = /sink/i.test(`${c.libId} ${c.name}`) ? 0 : 1;
    if (want !== c.libParams.shelfCount) { c.libParams = { ...c.libParams, shelfCount: want }; n++; }
  }
  if (n) done.options.push(`shelf counts set by box height on ${n} cabinet${n === 1 ? '' : 's'}`);
}
function bidFinishLook(tk, done) {
  const rows = (tk.rows || []).filter(r => !['countertop', 'millwork', 'other'].includes(r.category));
  const finish = String(tk.finish || '') || (() => {
    // The most common finish words on the cabinet rows.
    const n = {}; rows.forEach(r => { const m = String(r.material || '').trim(); if (m) n[m] = (n[m] || 0) + Math.max(1, +r.qty || 1); });
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k]) => k)[0] || '';
  })();
  const pick = bidFinishPick(finish);
  const tex = {};
  if (pick) ['doors', 'drawers', 'finished', 'toe'].forEach(k => { tex[k] = pick; });
  const pulls = String(tk.pulls || '') + ' ' + rows.map(bidTx).join(' ');
  const pc = /matte?\s*black|\bblack\b(?=[^.]{0,30}(pull|knob|hardware))|(pull|knob|hardware)[^.]{0,30}\bblack\b/i.test(pulls) ? '#232427'
    : /brass|gold/i.test(String(tk.pulls || '')) ? '#b08d57' : /nickel|stainless|chrome|satin/i.test(String(tk.pulls || '')) ? '#a9a8a3' : '';
  if (pc) tex.pulls = pc;
  if (!Object.keys(tex).length) return;
  S.job.tex = { ...(S.job.tex || {}), ...tex };
  done.options.push(`${pick ? `the finish (${finish.slice(0, 60)}) shown in 3D` : ''}${pick && pc ? ' with ' : ''}${pc ? `${pick ? '' : 'pulls shown '}${pc === '#232427' ? 'black' : pc === '#b08d57' ? 'brass' : 'nickel'} pulls` : ''}`);
}

/* ---------- Footprints, for the corner panels and the overlap check ---------- */
// Overlap depth of two convex polygons (separating axis); 0 when apart or only touching.
function bidPolyDepth(A, B) {
  let m = Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], c = P[(i + 1) % P.length], nx = -(c.y - a.y), ny = c.x - a.x, L = Math.hypot(nx, ny); if (L < 1e-9) continue;
    const pr = Q => Q.map(q => (q.x * nx + q.y * ny) / L), pa = pr(A), pb = pr(B);
    const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (o <= 0) return 0; m = Math.min(m, o);
  }
  return m;
}
// Automatic end panels that would run into a cabinet on the next wall (a dead corner), and the one of two automatic
// panels meeting in a corner that is hidden, are turned off for that end. Returns how many.
function bidCornerPanels(rooms) {
  let n = 0;
  rooms.forEach(rm => withRoom(rm, () => {
    S.cabinets.forEach(c => ['L', 'R'].forEach(end => {
      if (c['panel' + end]) return;
      const sp = panelSpans(c, false).find(x => x.end === end); if (!sp) return;
      const w = wall(c.wall); if (!w) return;
      const g = wg(w), f = w.thick / 2 + (c.outset || 0), dp = panelFor(c).frontOverhang + endDepth(c, end), [a0, a1] = sp.a;
      const P = [wallPt(w, g, c.side, a0, f), wallPt(w, g, c.side, a1, f), wallPt(w, g, c.side, a1, f + dp), wallPt(w, g, c.side, a0, f + dp)];
      if (S.cabinets.some(k => k !== c && vOverlap(k, c) && cabPoly(k) && bidPolyDepth(P, cabPoly(k)) > 0.1)) { c['panel' + end] = 'off'; n++; }
    }));
    const gapOf = (c, end) => { const w = wall(c.wall), L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), lo = (end === 'L') === (c.side === 1); return lo ? c.off : L - (c.off + c.w); };
    const pl = [];
    S.cabinets.forEach(c => ['L', 'R'].forEach(end => {
      if (c['panel' + end] === 'off') return;
      const spans = panelSpans(c, false), sp = spans.find(x => x.end === end); if (!sp) return;
      const P = panelPolys(c, false)[spans.indexOf(sp)]; if (P) pl.push({ c, end, P });
    }));
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
      const A = pl[i], B = pl[j];
      if (A.c === B.c || !vOverlap(A.c, B.c) || bidPolyDepth(A.P, B.P) <= 0.1) continue;
      const X = gapOf(A.c, A.end) <= gapOf(B.c, B.end) ? A : B;
      if (X.c['panel' + X.end] !== 'off') { X.c['panel' + X.end] = 'off'; n++; }
    }
  }));
  return n;
}
// The overlap check (the same one the chat takeoffs run before a job goes out): boxes at the same height that run into
// each other, into a wall, past their wall's end, or above the ceiling. 0.1" of touching is fine.
function bidOverlaps(rooms) {
  const TOL = 0.1, out = [];
  rooms.forEach(rm => withRoom(rm, () => {
    const cabs = S.cabinets, wn = id => { const w = S.walls.find(x => x.id === id); return w ? wallName(w) : 'no wall'; };
    const lbl = c => `${c.name} ${fmtLen(c.w)} wide at ${fmtLen(c.off)} on ${wn(c.wall)}`;
    const poly = c => [cabPoly(c), ...panelPolys(c, false)].filter(Boolean);
    for (let i = 0; i < cabs.length; i++) for (let j = i + 1; j < cabs.length; j++) {
      const a = cabs[i], c = cabs[j]; if (!vOverlap(a, c)) continue;
      let dd = 0; poly(a).forEach(P => poly(c).forEach(Q => { dd = Math.max(dd, bidPolyDepth(P, Q)); }));
      if (dd > TOL) out.push({ room: rm.name, what: `${lbl(a)} runs ${fmtLen(dd)} into ${lbl(c)}` });
    }
    cabs.forEach(c => {
      const P = cabPoly(c); if (!P) return;
      S.walls.forEach(w => { if (w.hidden || w.island) return; const d = bidPolyDepth(P, wallPoly(w)); if (d > TOL) out.push({ room: rm.name, what: `${lbl(c)} runs ${fmtLen(d)} into ${wallName(w)}` }); });
      const w = S.walls.find(x => x.id === c.wall); if (!w) return;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (c.off < -TOL || c.off + c.w > L + TOL) out.push({ room: rm.name, what: `${lbl(c)} runs past the end of ${wn(w.id)} (${fmtLen(L)} long)` });
      const H = w.height || rm.wallHeight;
      if (H && c.elev + c.h > H + TOL) out.push({ room: rm.name, what: `${lbl(c)} goes ${fmtLen(c.elev + c.h - H)} above the ${fmtLen(H)} ceiling` });
    });
  }));
  return out;
}
// For the job notes: the overlap check's findings, by room.
function bidOverlapNote(list) {
  if (!list || !list.length) return 'Overlap check on import: no overlaps.';
  const by = {}; list.forEach(o => { (by[o.room] = by[o.room] || []).push(o.what); });
  return `Overlap check on import: ${list.length} to fix.\n` + Object.entries(by).map(([r, v]) => `${r}: ${v.join('; ')}`).join('\n');
}
