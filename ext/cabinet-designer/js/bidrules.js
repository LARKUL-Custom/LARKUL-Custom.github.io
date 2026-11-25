// Jobs from Bid Reader, drawn the way the chat takeoffs draw them (Ayden 2026-11-20: "I want the bid reader extension to
// follow all your logic when it comes to understanding and replicating bids into the cabinet designer"). Runs once on
// import, after the rooms, cabinets, shelves and built pieces are in (bidTakeoffAdd), with S the new job and S.rooms
// its rooms. What it does, in either Draw mode unless said:
//  - Countertops marked by others are still drawn, so the job looks right, but priced at $0 (room Tops $/sq ft 0).
//  - An island top with a seating overhang from the bid gets the overhang drawn on the open side (by others: $0 too).
//  - The finish named in the bid (species or melamine color, pulls) shows on the fronts, ends and toe in 3D. Look only.
//  - LARKUL rules only: automatic end panels that would run into a cabinet on the next wall (a dead corner), or into
//    another automatic panel, are turned off, so nothing is built that can't be seen or doesn't fit.
//  - LARKUL rules only (0.60.8, Ayden 2026-11-20): an inside corner that both base runs stop short of (no corner cabinet,
//    the corner left empty) gets his Mozaik Corner Filler sized to the gap, and the tops carry on over it to the corner.
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
    bidBrief(tk, done);
    bidShelves(rooms, done);
    if (!done.exact && typeof isCornerFiller === 'function') {
      done.cornerChecks = [];
      done.cornerFill = bidCornerFillers(rooms, done.cornerChecks);
      if (done.cornerFill) done.options.push(`${done.cornerFill} corner filler${done.cornerFill === 1 ? '' : 's'} in the empty corner${done.cornerFill === 1 ? '' : 's'}`);
      if (done.cornerChecks.length) done.options.push(`${done.cornerChecks.length} corner${done.cornerChecks.length === 1 ? '' : 's'} to check in the job notes`);
    }
    if (!done.exact && lay().autoPanels !== false) {
      done.cornerOff = bidCornerPanels(rooms);
      if (done.cornerOff) done.options.push(`${done.cornerOff} automatic end panel${done.cornerOff === 1 ? '' : 's'} left off where ${done.cornerOff === 1 ? 'it' : 'they'} would run into a corner cabinet`);
    }
    done.flushFill = bidFlushFillers(rooms);
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

/* ---------- The job brief (0.63.75, Bid Reader 0.33.0) ---------- */
// Ayden 2026-11-25: "You are his eyes, he has the actual logic to build". Bid Reader sends what the set says about the
// job (tk.brief: box material, finish type, door style, construction, hardware, custom millwork described, and every
// issue it isn't sure of). The job's own picks change only where the bid names something this job has a template for;
// everything else, and every issue, goes in Job › Notes with what to do about it.
const BRIEF_BOX = { plywood: t => /\bply|plywood|prefinished maple|birch/i.test(t) && !/melamine|tfm/i.test(t), melamine: t => /melamine|tfm|particle|furniture board/i.test(t), mdf: t => /\bmdf\b/i.test(t) };
const BRIEF_FIN = { laminate: t => /laminate|\bp-?lam\b|\bhpl\b/i.test(t) && !/melamine/i.test(t), melamine: t => /melamine|tfm/i.test(t), wood: t => /veneer|stain|\boak\b|maple|walnut|cherry|alder|hickory|\bwood\b/i.test(t) && !/paint|melamine|laminate|tfm/i.test(t), paint: t => /paint/i.test(t), thermofoil: t => /thermofoil|\brtf\b/i.test(t) };
const BRIEF_DOOR = { shaker: t => /shaker|5[- ]?piece|five[- ]piece/i.test(t), slab: t => /slab|flat/i.test(t), 'raised panel': t => /raised/i.test(t) };
function bidBrief(tk, done) {
  const b = tk && tk.brief; if (!b || typeof b !== 'object') return;
  const d = S.job.defaults = S.job.defaults || {}, set = [], todo = [];
  const mName = id => ((S.materials || []).find(m => m.id === id) || {}).name || '';
  // One pick: keep the job's own when it already matches, else the first that does, else say so.
  const pick = (what, kind, list, key, text, test) => {
    if (!test || !Array.isArray(list) || !list.length) return;
    const cur = list.find(x => x.id === d[key]) || list[0];
    if (cur && test(text(cur))) { set.push(`${what}: ${cur.name} (the bid asks for ${kind})`); return; }
    const hit = list.find(x => test(text(x)));
    if (hit) { d[key] = hit.id; set.push(`${what} changed to ${hit.name} (the bid asks for ${kind}; was ${cur ? cur.name : 'none'})`); }
    else todo.push(`${what}: the bid asks for ${kind} and this job has nothing like it. Add one in Materials and pick it on the job.`);
  };
  if (b.box && b.box.kind) {
    if (BRIEF_BOX[b.box.kind]) pick('Cabinet boxes', b.box.kind, (S.matTemplates || {}).cabinet, 'cabMatT', t => `${t.name || ''} ${mName(t.carcass)}`, BRIEF_BOX[b.box.kind]);
    else todo.push(`Cabinet boxes: the bid says "${String(b.box.text || b.box.kind).slice(0, 160)}". Check the cabinet material on the job.`);
  }
  if (b.finish && b.finish.kind) {
    const fins = typeof finishList === 'function' ? finishList() : S.finishes;
    if (BRIEF_FIN[b.finish.kind]) pick('Finish', b.finish.kind, fins, 'finish', f => f.name || mName(f.front), BRIEF_FIN[b.finish.kind]);
    else todo.push(`Finish: the bid allows ${b.finish.kind} ("${String(b.finish.text || '').slice(0, 160)}"). Pick the one to price.`);
  }
  if (b.doors && BRIEF_DOOR[b.doors.style]) {
    const fk = b.finish && BRIEF_FIN[b.finish.kind], dt = S.doorTemplates || [];
    // A door style in the bid's finish first (melamine shaker for a melamine job), then any of that style.
    const both = t => BRIEF_DOOR[b.doors.style](t) && (!fk || fk(t));
    const txt = x => `${x.name || ''} ${mName(x.door)}`;
    pick('Door style', b.doors.style, dt, 'doorT', txt, dt.some(x => both(txt(x))) ? both : BRIEF_DOOR[b.doors.style]);
  }
  if (b.construction === 'face frame' && (!d.faceFrame || d.faceFrame === 'none')) todo.push('Construction: the bid calls for face frame cabinets. Pick a face frame on the job (Settings › Face frame).');
  if (+b.toe > 0 && !(done.options || []).some(o => /toe kick/.test(o))) set.push(`toe ${b.toe}"`);
  done.brief = { set, todo, specs: BRIEF_SPECS.map(([k, l]) => [l, k === 'box' || k === 'finish' ? (b[k] || {}).text : k === 'doors' ? (b.doors || {}).style : b[k]]).filter(([, v]) => v), millwork: Array.isArray(b.millwork) ? b.millwork : [], issues: Array.isArray(b.issues) ? b.issues : [] };
  const n = done.brief.issues.length, m = done.brief.millwork.length;
  done.options.push(`job brief from the bid${set.length ? `: ${set.length} setting${set.length === 1 ? '' : 's'} checked or set` : ''}${todo.length ? `, ${todo.length} to set by hand` : ''}${m ? `, ${m} custom millwork piece${m === 1 ? '' : 's'} described` : ''}${n ? `, ${n} issue${n === 1 ? '' : 's'} to look at` : ''} (Job › Notes)`);
}
const BRIEF_SPECS = [['box', 'Box'], ['finish', 'Finish'], ['doors', 'Door style'], ['construction', 'Construction'], ['grade', 'Grade'], ['edges', 'Edges'], ['hinges', 'Hinges'], ['slides', 'Slides / drawer boxes'], ['pulls', 'Pulls'], ['shelves', 'Shelves'], ['tops', 'Tops']];
// What Cabinet Designer does about each kind of issue, so the note says what to do, not only what's wrong.
const BRIEF_DO = { fix: 'sizes on the bid don\'t add up: check this run against the walls in the plan view', check: 'check it in 3D', scaled: 'drawn at the scaled size: verify before ordering, qualify it on the bid', spec: 'priced on the job\'s current pick until you change it', gap: 'not in the job: add it or qualify it', question: 'ask the GC, or qualify the bid' };
function bidBriefNote(bb) {
  if (!bb) return '';
  const out = ['Job brief from Bid Reader:'];
  if (bb.set.length) out.push('Set from the bid: ' + bb.set.join('; '));
  if (bb.todo.length) out.push('To set by hand:\n' + bb.todo.map(t => '- ' + t).join('\n'));
  if (bb.specs.length) out.push('What the set says:\n' + bb.specs.map(([l, v]) => `- ${l}: ${String(v).slice(0, 300)}`).join('\n'));
  if (bb.millwork.length) out.push('Custom millwork (not drawn; priced on Pricing › Quote › From the bid):\n' + bb.millwork.map(x => `- ${x.room ? x.room + ': ' : ''}${x.what}${x.qty > 1 ? ` x${x.qty}` : ''}${x.size ? `, ${x.size}` : ''}${x.material ? `, ${x.material}` : ''}${x.by ? ' (by others)' : ''}${x.description ? `. ${x.description}` : ''}`).join('\n'));
  if (bb.issues.length) {
    const by = {}; bb.issues.forEach(i => { (by[i.kind] = by[i.kind] || []).push(i); });
    out.push(`Issues Bid Reader flagged (${bb.issues.length}):\n` + Object.entries(by).map(([k, l]) => `${k === 'fix' ? 'Doesn\'t add up' : k === 'scaled' ? 'Scaled sizes' : k === 'spec' ? 'Specs not stated or conflicting' : k === 'gap' ? 'Gaps in the set' : k === 'question' ? 'Open questions' : 'To check'} (${BRIEF_DO[k] || 'check it'}):\n` + l.map(i => `- ${i.room ? i.room + ': ' : ''}${i.text}`).join('\n')).join('\n'));
  }
  return out.join('\n');
}

/* ---------- Empty corners ---------- */
// Where the base runs on two walls meeting at an inside corner both stop short of it, leaving the corner square empty,
// a Corner Filler (Ayden's Mozaik one) goes in the corner: as wide as the gap on its own wall and as deep as the gap on
// the other, its notch's fillers reaching out to the cabinets' faces. It stands with its back right in the corner, so it
// goes on the wall whose corner is on its right as you face it. Its top carries the countertops over the corner
// (runsBy and cornerBridges in build.js). Up to 12" of filler on each side; a gap wider than that is left as drawn.
// 0.60.9 (Ayden's corner-and-countertop-rules.md, 2026-11-20): what it can't fill goes in checks for the job notes: a
// gap wider than 12" a side (left as drawn), base runs stopped right at the cabinet depth (no room for a filler, the
// doors and pulls can hit), and uppers that leave a corner empty (only bases get a corner filler for now).
// Drawn fillers from a bid sit flush with the doors of the cabinet they belong to, like a filler placed by hand
// (a Mozaik filler is only 4" deep, so left at the wall it hides behind the cabinets). When a filler touches cabinets
// on both ends, it goes with the one of its own height. Two fillers that meet in an inside corner: the one on the
// second wall is set back by the overlap (the door thickness) so it butts behind the first one's face.
function bidFlushFillers(rooms) {
  let n = 0;
  rooms.forEach(rm => withRoom(rm, () => {
    const isF = c => c.moz && /frost-(wall|btf|bth)-(left|right)/.test(c.moz) && c.wall && wall(c.wall);
    const fl = S.cabinets.filter(isF);
    fl.forEach(c => {
      const nbs = S.cabinets.filter(k => k !== c && !k.moz && !k.made && k.wall === c.wall && k.side === c.side
        && Math.min(Math.abs(k.off - (c.off + c.w)), Math.abs(c.off - (k.off + k.w))) <= 1.01
        && (k.elev || 0) < (c.elev || 0) + c.h && (c.elev || 0) < (k.elev || 0) + k.h);
      if (!nbs.length) return;
      const fit = k => Math.abs((k.elev || 0) - (c.elev || 0)) + Math.abs(k.h - c.h);
      const nb = nbs.sort((a, b) => fit(a) - fit(b))[0], fr = computeFronts(nb).find(f => f.type !== 'open');
      const ft = fr ? ((mat(frontStyle(nb, fr).ds.mat) || {}).thick || 0.75) : 0;
      c.outset = r3((nb.outset || 0) + nb.d + ft - c.d); n++;
    });
    fl.forEach((a, i) => fl.slice(i + 1).forEach(b => {
      if (a.wall === b.wall || !vOverlap(a, b)) return;
      const pa = cabPoly(a), pb = cabPoly(b); if (!pa || !pb) return;
      const dd = bidPolyDepth(pa, pb); if (dd > 0.05) b.outset = r3((b.outset || 0) - dd);
    }));
  }));
  return n;
}
function bidCornerFillers(rooms, checks) {
  let n = 0; checks = checks || [];
  rooms.forEach(rm => withRoom(rm, () => {
    const lib = (S.library || []).find(l => l.moz === MOZ_CF) || (() => { const d = mozDef(MOZ_CF); return d && { id: MOZ_CF, name: d.name, cat: 'Base', w: 27, h: 34.5, d: 27, elev: 0, moz: MOZ_CF, rows: [], params: {}, construction: { toeKick: false, top: 'full' } }; })();
    if (!lib) return;
    const onWall = c => !c.moz && !c.made && !isFloatShelf(c) && wall(c.wall) && !(wall(c.wall).island || wall(c.wall).hidden);
    const bases = S.cabinets.filter(c => c.cat === 'Base' && (c.elev || 0) < 1 && onWall(c)), uppers = S.cabinets.filter(c => c.cat === 'Wall' && onWall(c));
    const walls = S.walls.filter(w => !w.island && !w.hidden);
    const face = (w, side) => { const g = wg(w); return { w, g, side, p: wallPt(w, g, side, 0, w.thick / 2), n: { x: g.n.x * side, y: g.n.y * side } }; };
    const dot = (a, b) => a.x * b.x + a.y * b.y;
    const nm = (A, B) => `${rm.name}, the corner of ${wallName(A.w)} and ${wallName(B.w)}`, f1 = v => (t => /["']/.test(t) ? t : t + '"')(fmtLen(Math.max(0, r3(v))));
    const scan = (bases, up) => { for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) [1, -1].forEach(sA => [1, -1].forEach(sB => {
      const A = face(walls[i], sA), B = face(walls[j], sB);
      const onA = bases.filter(c => c.wall === A.w.id && c.side === sA), onB = bases.filter(c => c.wall === B.w.id && c.side === sB);
      if (!onA.length || !onB.length || Math.abs(dot(A.g.u, B.g.u)) > 0.1) return;
      const P = ctjMeet(A.p, A.g.u, B.p, B.g.u); if (!P) return;
      const aP = dot({ x: P.x - A.w.x1, y: P.y - A.w.y1 }, A.g.u), bP = dot({ x: P.x - B.w.x1, y: P.y - B.w.y1 }, B.g.u);
      // The corner is at one end of each wall, and each wall's cabinets come out into the room toward the other's.
      const end = (F, at) => at < F.w.thick + 1 ? 1 : at > F.g.L - F.w.thick - 1 ? -1 : 0, eA = end(A, aP), eB = end(B, bP);
      if (!eA || !eB || dot({ x: A.g.u.x * eA, y: A.g.u.y * eA }, B.n) < 0.9 || dot({ x: B.g.u.x * eB, y: B.g.u.y * eB }, A.n) < 0.9) return;
      // The cabinet nearest the corner on each wall, and the gap from the corner to it.
      const near = (list, at, e) => list.map(c => ({ c, gap: e > 0 ? c.off - at : at - (c.off + c.w) })).filter(x => x.gap > -0.5).sort((a, b) => a.gap - b.gap)[0];
      const nA = near(onA, aP, eA), nB = near(onB, bP, eB); if (!nA || !nB) return;
      const dA = nA.c.d + (nA.c.outset || 0), dB = nB.c.d + (nB.c.outset || 0);
      const xA = nA.gap - dB, xB = nB.gap - dA;
      if (xA < -0.25 || xB < -0.25) return;
      if (up) { if (Math.max(xA, xB) >= 0.5) checks.push(`${nm(A, B)}: the uppers stop ${f1(nA.gap)} and ${f1(nB.gap)} from the corner and leave it empty (no corner filler on uppers yet), check it`); return; }
      if (Math.max(xA, xB) < 0.5) { checks.push(`${nm(A, B)}: the base runs stop right at the cabinet depth, so there is no room for a corner filler and the doors or pulls can hit; the usual is 27" from the corner (a 3" filler each side), check it`); return; }
      if (xA > 12 || xB > 12) { checks.push(`${nm(A, B)}: the empty corner needs ${f1(xA)} and ${f1(xB)} of filler, more than 12" a side, so it is left as drawn, check it`); return; }
      // It stands on the wall whose corner is on its right: the high end on side 1, the low end on side -1.
      const ownA = (eA < 0) === (sA === 1), own = ownA ? { F: A, at: aP, e: eA, nb: nA, gap: nA.gap, x: Math.max(0, xA) } : { F: B, at: bP, e: eB, nb: nB, gap: nB.gap, x: Math.max(0, xB) };
      const oth = ownA ? { nb: nB, gap: nB.gap, x: Math.max(0, xB) } : { nb: nA, gap: nA.gap, x: Math.max(0, xA) };
      if ((own.e < 0) !== (own.F.side === 1)) return;
      const W = r3(own.gap), D = r3(oth.gap);
      const c = newCab(S, lib, own.F.w.id, own.F.side, r3(own.e < 0 ? own.at - W : own.at));
      Object.assign(c, { w: W, d: D, h: own.nb.c.h, elev: own.nb.c.elev || 0, cfN: [r3(own.x), r3(oth.x)], fromBid: true, notes: 'Corner filler in the empty corner (added on import)' });
      // Nothing else may be in the corner already (a corner cabinet, an appliance box).
      const poly = cabPoly(c);
      if (!poly || S.cabinets.some(k => vOverlap(k, c) && cabPoly(k) && bidPolyDepth(poly, cabPoly(k)) > 0.1)) return;
      S.cabinets.push(c); n++;
    })); };
    scan(bases, false); scan(uppers, true);
  }));
  return n;
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
