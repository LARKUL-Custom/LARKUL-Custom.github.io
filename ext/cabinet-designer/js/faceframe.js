/* ---------- Face frame cabinets ----------
   A face frame is a frame of stiles and rails glued to the front of the box, like Mozaik's face frame construction.
   S.faceFrames is the library of frame sizes. The pick (setting key faceFrame) follows job -> room -> cabinet like
   every other setting; 'none' is frameless. A cabinet can also have its own stile and rail sizes (c.ffSize).
   The cabinet's depth includes the frame: the box gets shallower by the frame's thickness.
   Doors and drawer fronts overlay the frame openings (overlay on every side). Row heights are front heights,
   the same as frameless, so a job swaps between the two without redoing its rows. */
'use strict';
// Starting sizes from Ayden's 2026 Larkul Mozaik parameters: TR, TRW, BR, FS/US, CR, CS and DoorOL.
const FF_DEFAULTS = { thick: 0.75, stile: 1.5, topRail: 1.5, topRailWall: 3, bottomRail: 1.5, midRail: 1.5, midStile: 1.5, overlay: 0.5, mat: '' };
function defaultFaceFrames() {
  return [
    { id: 'ff-std', name: 'Face frame 1 1/2"', ...FF_DEFAULTS },
    { id: 'ff-wide', name: 'Face frame 2", 3" top rail', ...FF_DEFAULTS, stile: 2, topRail: 3, topRailWall: 3, bottomRail: 2, midRail: 2, midStile: 2 },
  ];
}
// Older jobs get the library and stay frameless.
function ensureFaceFrames(s) {
  if (!s) return s;
  if (!Array.isArray(s.faceFrames) || !s.faceFrames.length) s.faceFrames = defaultFaceFrames();
  if (s.job && s.job.defaults && !s.job.defaults.faceFrame) s.job.defaults.faceFrame = 'none';
  return s;
}
const ffOpts = () => [{ v: 'none', l: 'Frameless' }, ...opts(S.faceFrames || [])];
const ffNum = (v, d) => v === '' || v === null || v === undefined || !isFinite(+v) ? d : Math.max(0, +v);
// The frame a cabinet gets, with its own sizes applied, or null when it is frameless.
// 45° and 90° corners and shaped fronts stay frameless for now.
function faceFrame(c) {
  if (!c || !S.faceFrames || angledCorner(c) || (c.shape || {}).front) return null;
  const id = cabSet(c, 'faceFrame'); if (!id || id === 'none') return null;
  const t = S.faceFrames.find(f => f.id === id); if (!t) return null;
  const o = c.ffSize || {}, st = ffNum(t.stile, 1.5), wall = c.cat === 'Wall';
  const tr = wall ? ffNum(t.topRailWall, ffNum(t.topRail, 1.5)) : ffNum(t.topRail, 1.5);
  const f = { id, name: t.name, mat: t.mat, thick: ffNum(t.thick, 0.75) || 0.75, overlay: ffNum(t.overlay, 0.5),
    ls: ffNum(o.ls, st), rs: ffNum(o.rs, st), tr: ffNum(o.tr, tr), br: ffNum(o.br, ffNum(t.bottomRail, 1.5)), mr: ffNum(t.midRail, 1.5), ms: ffNum(t.midStile, 1.5) };
  // A blind corner's frame covers the blind side with a wide stile.
  if (blindCorner(c)) { const bw = blindWidth(c); f.blind = cornerSide(c); if (f.blind === 'L') f.ls = Math.max(f.ls, bw); else f.rs = Math.max(f.rs, bw); }
  return f;
}
const ffThick = c => { const f = faceFrame(c); return f ? f.thick : 0; };
const ffMat = (c, f) => mat((f || faceFrame(c) || {}).mat) || mat(fillerMat(c)) || mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0];

// Frame members and fronts of a face frame cabinet, in cabinet coordinates (x from the left, z up from the floor).
// Members: stiles run full height, rails run between the stiles, center stiles sit between the rails of their row.
function ffLayout(c, p, f) {
  const tk = hasToe(c) ? p.toeKickHeight : 0, W = c.w, H = c.h, o = f.overlay, gap = p.frontGap;
  const xl = f.ls, xr = W - f.rs, rows = c.rows || [];
  const members = [
    { kind: 'ls', x0: 0, x1: f.ls, z0: tk, z1: H }, { kind: 'rs', x0: xr, x1: W, z0: tk, z1: H },
    { kind: 'tr', x0: xl, x1: xr, z0: H - f.tr, z1: H }, { kind: 'br', x0: xl, x1: xr, z0: tk, z1: tk + f.br },
  ];
  // Openings: a fixed row is a front height, so its opening is that less the overlay top and bottom.
  const room = (H - f.tr) - (tk + f.br) - f.mr * Math.max(0, rows.length - 1);
  const oh = r => r.h === '*' ? null : Math.max(0.5, (+r.h || 0) - 2 * o);
  const fixed = rows.reduce((a, r) => a + (oh(r) || 0), 0), stars = rows.filter(r => r.h === '*').length;
  const starH = stars ? Math.max(0, (room - fixed) / stars) : 0;
  const fronts = []; let z = H - f.tr;
  rows.forEach((r, ri) => {
    const h = oh(r) === null ? starH : oh(r), z1 = z, z0 = z - h, n = Math.max(1, r.count | 0);
    if (ri) members.push({ kind: 'mr', x0: xl, x1: xr, z0: z1, z1: z1 + f.mr });
    const hingeOf = i => r.type !== 'door' ? null : n === 1 ? (r.hinge === 'L' || r.hinge === 'R' ? r.hinge : p.hingeSide) : n === 2 ? (i === 0 ? 'L' : 'R') : (i % 2 ? 'R' : 'L');
    const push = (i, x0, x1, op) => fronts.push({ type: r.type, row: ri, idx: i, n, x0, x1, z0: r.type === 'open' ? z0 : z0 - o, z1: r.type === 'open' ? z1 : z1 + o, hinge: hingeOf(i), style: r.style || '', open: op });
    if (r.type === 'door' || r.type === 'open' || n === 1) {
      // Doors side by side share one opening, with the pair gap between them.
      const op = { x0: xl, x1: xr, z0, z1 };
      if (r.type === 'open') for (let i = 0; i < n; i++) { const w = (xr - xl) / n; push(i, xl + i * w, xl + (i + 1) * w, op); }
      else { const a = xl - o, b = xr + o, fw = ((b - a) - gap * (n - 1)) / n; for (let i = 0; i < n; i++) push(i, a + i * (fw + gap), a + i * (fw + gap) + fw, op); }
    } else {
      // Drawers and false fronts side by side each get their own opening, with a center stile between.
      const ow = ((xr - xl) - f.ms * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x0 = xl + i * (ow + f.ms);
        if (i) members.push({ kind: 'ms', x0: x0 - f.ms, x1: x0, z0, z1 });
        push(i, x0 - o, x0 + ow + o, { x0, x1: x0 + ow, z0, z1 });
      }
    }
    z = z0 - f.mr;
  });
  fronts.overfull = fixed > room + 0.001;
  return { members, fronts };
}
function ffFronts(c, p, f) { const L = ffLayout(c, p, f); L.fronts.ff = f; return L.fronts; }

// Cut list parts of the frame, named like Mozaik's (LS, RS, TR, BR, CR, CS).
const FF_NAMES = { ls: ['Face frame left stile', 'LS'], rs: ['Face frame right stile', 'RS'], tr: ['Face frame top rail', 'TR'], br: ['Face frame bottom rail', 'BR'], mr: ['Face frame mid rail', 'CR'], ms: ['Face frame center stile', 'CS'] };
function ffParts(c, p, f, part, addB, warn) {
  const m = ffMat(c, f), groups = {};
  if (Math.abs(m.thick - f.thick) > 0.03) warn.push(`The face frame is ${fmtLen(f.thick, 1)} thick but ${m.name} is ${fmtLen(m.thick, 1)}. Pick a frame material that matches in the face frame library.`);
  let ends = 0;
  ffLayout(c, p, f).members.forEach(mb => {
    const vert = mb.kind === 'ls' || mb.kind === 'rs' || mb.kind === 'ms', L = r3(vert ? mb.z1 - mb.z0 : mb.x1 - mb.x0), Wd = r3(vert ? mb.x1 - mb.x0 : mb.z1 - mb.z0);
    if (!(L > 0) || !(Wd > 0)) return;
    if (mb.kind !== 'ls' && mb.kind !== 'rs') ends += 2;
    const k = mb.kind + L + 'x' + Wd, blind = f.blind && mb.kind === (f.blind === 'L' ? 'ls' : 'rs');
    (groups[k] = groups[k] || { kind: mb.kind, L, Wd, blind, qty: 0 }).qty++;
  });
  Object.values(groups).forEach(g => { const pt = part(FF_NAMES[g.kind][0] + (g.blind ? ' (blind side)' : ''), m, g.L, g.Wd, { qty: g.qty, kind: 'faceFrame' }); pt.report = FF_NAMES[g.kind][1]; });
  // Rails and center stiles are pocket screwed: two screws in each end, one when the piece is under 2" wide.
  const screws = ffLayout(c, p, f).members.filter(mb => mb.kind !== 'ls' && mb.kind !== 'rs').reduce((a, mb) => a + 2 * (Math.min(mb.x1 - mb.x0, mb.z1 - mb.z0) >= 2 ? 2 : 1), 0);
  if (ends) addB('Pocket screws 1 1/4" fine thread (face frame)', screws);
}

// Elevation drawing of the frame, behind the fronts.
function ffSVG(c, ex, Y, mats) {
  const f = faceFrame(c); if (!f) return '';
  const m = ffMat(c, f); mats.push(m && m.id);
  return ffLayout(c, effParams(c), f).members.map(mb => `<rect ${fillFor(m, 'ev-front')} x="${ex + mb.x0}" y="${Y(mb.z1)}" width="${mb.x1 - mb.x0}" height="${mb.z1 - mb.z0}"/>`).join('');
}
// 3D frame members, flush with the cabinet's front.
function ffMeshes(c, p, M, add) {
  const f = faceFrame(c); if (!f) return;
  const mm = M(ffMat(c, f));
  ffLayout(c, p, f).members.forEach(mb => add(box3(mb.x1 - mb.x0, mb.z1 - mb.z0, f.thick, mm, (mb.x0 + mb.x1) / 2, (mb.z0 + mb.z1) / 2, c.d - f.thick / 2)));
}

// The job's pick swaps every cabinet: rooms and single cabinets with their own pick follow the job again.
function ffSwapAll() {
  let n = 0;
  S.rooms.forEach(r => { if (r.settings && r.settings.faceFrame) { delete r.settings.faceFrame; n++; } r.cabinets.forEach(c => { if (c.faceFrame) { delete c.faceFrame; n++; } }); });
  return n;
}
const ffJobName = () => (ffOpts().find(o => o.v === (S.job.defaults.faceFrame || 'none')) || {}).l || 'Frameless';

// Cabinet editor box: the frame pick and this cabinet's own stile and rail sizes (blank = the frame's size).
function ffBox(c) {
  if (angledCorner(c)) return '';
  const R = 'cab:' + c.id, F = 'cabff:' + c.id, f = faceFrame(c), o = c.ffSize || {};
  const t = f && S.faceFrames.find(x => x.id === f.id), st = t ? ffNum(t.stile, 1.5) : 0;
  const size = (label, k, def) => fld(label, F, k, o[k] ?? '', 'len', { blank: true, ph: fmtLen(def) });
  return `<div class="psec box">${secHead('door', 'Face frame', 'amber')}
    <div class="grid2">${fld('Construction', R, 'faceFrame', c.faceFrame || '', 'select', { options: setOpts('faceFrame', ffOpts(), 'cab') })}</div>
    ${f ? `<div class="grid4">${size('Left stile', 'ls', blindCorner(c) && cornerSide(c) === 'L' ? f.ls : st)}${size('Right stile', 'rs', blindCorner(c) && cornerSide(c) === 'R' ? f.rs : st)}${size('Top rail', 'tr', c.cat === 'Wall' ? ffNum(t.topRailWall, 3) : ffNum(t.topRail, 1.5))}${size('Bottom rail', 'br', ffNum(t.bottomRail, 1.5))}</div>
      <div class="row-actions"><span class="note">Blank uses ${esc(f.name)}. Doors overlay the frame ${fmtLen(f.overlay)}.</span>${Object.values(o).some(v => v !== '' && v !== undefined) ? `<button class="btn sm" data-act="ff-reset" data-id="${c.id}">Use the frame's sizes</button>` : ''}<button class="linkbtn" data-act="tab" data-id="faceframes">Face frame library</button></div>` : ''}</div>`;
}

/* ---------- Library page ---------- */
function ffPic(t) {
  const s = ffNum(t.stile, 1.5), tr = ffNum(t.topRail, 1.5), br = ffNum(t.bottomRail, 1.5), mr = ffNum(t.midRail, 1.5);
  const W = 30, H = 34.5, col = ((mat(t.mat) || mat(fillerMat({})) || {}).color) || '#e8e1d2';
  const r = (x, y, w, h) => `<rect x="${x}" y="${-y - h}" width="${w}" height="${h}" fill="${esc(col)}" stroke="#555" stroke-width=".25"/>`;
  return `<svg viewBox="-2 ${-H - 2} ${W + 4} ${H + 4}" class="ffpic" aria-hidden="true">${r(0, 0, s, H)}${r(W - s, 0, s, H)}${r(s, H - tr, W - 2 * s, tr)}${r(s, 0, W - 2 * s, br)}${r(s, H - tr - 6 - mr, W - 2 * s, mr)}</svg>`;
}
function renderFaceFrames() {
  const el = $('#tab-faceframes'); if (!el) return;
  const list = S.faceFrames || [];
  if (typeof LIB_REFS === 'object' && !LIB_REFS.ff) LIB_REFS.ff = ['ff', () => S.faceFrames];
  el.innerHTML = `<div class="pagehead"><div><h2>Face frames</h2><p>Stile and rail sizes for face frame cabinets. Pick one for the whole job under Settings › Box and panels, or for one cabinet in its editor.</p></div><button class="btn primary" data-act="ff-add">${icon('plus')}Add face frame</button></div>
  <div class="card"><div class="cardbody"><div class="roomsum"><span>This job is <b>${esc(ffJobName())}</b></span><button class="linkbtn" data-act="ff-settings">Change for the whole job</button></div></div></div>
  ${pickBar('ff', list, 'Face frame')}<div class="cards">${picked('ff', list).map(t => {
    const R = 'ff:' + t.id, L = (k, l) => fld(l, R, k, t[k], 'len');
    return `<div class="card ffcard">${cardHead(esc(t.name), `<span class="note">${nCab(usedBy(c => !!faceFrame(c) && faceFrame(c).id === t.id))}</span>`)}
    <div class="cardbody"><div class="cardsplit"><div class="stack">
      ${fld('Name', R, 'name', t.name, 'text', { wide: true })}
      <div class="grid2">${L('stile', 'Stiles')}${L('topRail', 'Top rail')}${L('topRailWall', 'Top rail, wall cabinets')}${L('bottomRail', 'Bottom rail')}${L('midRail', 'Mid rails')}${L('midStile', 'Center stiles')}${L('thick', 'Thickness')}${L('overlay', 'Door overlay')}</div>
      ${fld('Material', R, 'mat', t.mat || '', 'select', { options: [{ v: '', l: 'Same as the doors' }, ...matOpts('sheet')] })}
    </div><div class="preview pad">${ffPic(t)}</div></div></div></div>`;
  }).join('')}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="ff-"]'); if (!b) return;
  e.stopPropagation();
  const a = b.dataset.act;
  if (a === 'ff-add') { const nid = uid('ff'); mutate(() => S.faceFrames.push({ ...FF_DEFAULTS, id: nid, name: 'New face frame' })); pickState().pick.ff = nid; render(); }
  else if (a === 'ff-reset') { const c = cab(b.dataset.id); if (c) mutate(() => { delete c.ffSize; }); if (ui.quick) renderQuick(); }
  else if (a === 'ff-settings') { ui.setTab = 'templates'; ui.tplScope = ''; ui.tplCat = 'box'; ui.tab = 'settings'; render(); }
}, true);
// How far the frame's stiles stand in past the box sides; roll-outs and drawer runners are packed out by this much.
// A blind corner's wide stile is left out (its drawers run beside the blind panel).
function ffOverhang(c, t) {
  const f = faceFrame(c); if (!f) return 0;
  const s = blindCorner(c) ? (cornerSide(c) === 'L' ? f.rs : f.ls) : Math.max(f.ls, f.rs);
  return Math.max(0, s - t);
}
