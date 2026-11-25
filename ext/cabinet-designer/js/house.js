// House (0.63.53, Ayden 2026-11-24: "draw up a whole job connected but price it as rooms ... so when you're in walk mode
// it feels like a smoother transition"). Rooms stay their own drawings (pricing, cut lists, prints and quotes are per
// room, as before); a doorway that Leads to another room also joins the two rooms there, so the house lays itself out:
// the other room stands against this one, its linked door in the same opening, back to back on the same wall.
// Untick Joined on the doorway for two rooms that aren't really side by side (Walk then jumps between them as before).
// Walk draws every joined room at once (walk3d.js), the 3D view's House button shows them all, and the plan shows the
// joined rooms round the open one in light grey. The math (m2pt, m2mul ...) and doorPartner live in walk3d.js, which
// the walk file carries too.
'use strict';
// The last 3D build: where each drawn room is in the scene (M), and while building, the walls already drawn by an
// earlier room (cover) and the doorway halves left to their partner (skip).
const HOUSE3 = { M: {}, cover: null, skip: null };
function houseM(id) { return HOUSE3.M[id] || null; }

// Where room B goes so that its door g is the same opening as door f of room A: B's place in A's plan. The walls
// share one centre line and face opposite ways (each room's inside is on its own side of it).
function houseJoinM(rA, f, rB, g) {
  const a = doorWhere(rA, f), b = doorWhere(rB, g); if (!a || !b) return null;
  const nA = { x: a.g.n.x * a.inn, y: a.g.n.y * a.inn }, nB = { x: b.g.n.x * b.inn, y: b.g.n.y * b.inn };
  const t = Math.atan2(-nA.y, -nA.x) - Math.atan2(nB.y, nB.x);
  // Square turns stay exactly square, so walls drawn at right angles line up without slivers.
  const sq = v => Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v;
  const M = { c: sq(Math.cos(t)), s: sq(Math.sin(t)), x: 0, y: 0 }, p = m2pt(M, b.cx, b.cy);
  M.x = a.cx - p.x; M.y = a.cy - p.y;
  return M;
}
// Every room joined to room id (through joined doorways, room after room), each with its place in that room's plan.
// The room itself comes first, at no move.
// 0.63.58 (Ayden 2026-11-25: walking into the kitchen, a big blank box from the laundry stood in it): the house is
// laid out the same way whichever room you start from (from the first room of the job in it), so the plan, House and
// Walk always agree. Rooms drawn overlapping still join (Ayden: "just lay the rooms together"); in Walk only the open
// room shows whole and a joined room shows only past its doorway (walk3d.js walkRooms).
function houseOf(id) {
  const r0 = roomById(id); if (!r0) return [];
  const comp = [r0], seen = new Set([r0.id]);
  for (let i = 0; i < comp.length; i++) (comp[i].fixtures || []).forEach(f => { const p = doorPartner(f); if (p && !seen.has(p.r.id)) { seen.add(p.r.id); comp.push(p.r); } });
  if (comp.length < 2) return [{ r: r0, M: M2_ID }];
  const root = comp.reduce((a, b) => (S.rooms.indexOf(b) < S.rooms.indexOf(a) ? b : a));
  const out = [{ r: root, M: M2_ID }], placed = new Map([[root.id, out[0]]]);
  for (let i = 0; i < out.length; i++) {
    const h = out[i];
    (h.r.fixtures || []).forEach(f => {
      const p = doorPartner(f); if (!p || placed.has(p.r.id)) return;
      const J = houseJoinM(h.r, f, p.r, p.g); if (!J) return;
      const e = { r: p.r, M: m2mul(h.M, J) }; placed.set(p.r.id, e); out.push(e);
    });
  }
  const me = placed.get(r0.id); if (!me) return [{ r: r0, M: M2_ID }];
  const I = m2inv(me.M);
  return [me, ...out.filter(o => o !== me)].map(o => ({ r: o.r, M: m2mul(I, o.M) }));
}
// The joined rooms are drawn while walking, and in the 3D view with House on.
function houseOn() { return (typeof WALK === 'object' && (WALK.on || WALK.pending)) || !!ui.house3d; }
function houseFrame() { return typeof WALK === 'object' && (WALK.on || WALK.pending) && roomById(WALK.frame) ? WALK.frame : S.roomId; }
function houseSize(id = S.roomId) { return houseOf(id).length; }

// Before drawing: a wall on the same line as a wall of a room drawn earlier (the shared wall at a doorway) leaves that
// stretch to it, so the two never fight over the same faces; and a joined doorway is drawn once (casing, door), by the
// half with a door to open, else by the earlier room.
function housePrep(list) {
  const cover = new Map(), skip = new Set(), segs = [], at = new Map(list.map((h, i) => [h.r.id, i]));
  list.forEach(h => {
    const mine = [];
    (h.r.walls || []).forEach(w => {
      if (w.hidden) return;
      const a = m2pt(h.M, w.x1, w.y1), b = m2pt(h.M, w.x2, w.y2), L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1) return;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, T = w.thick || 4, ivs = [];
      segs.forEach(s => {
        if (Math.abs(u.x * s.u.y - u.y * s.u.x) > 0.01) return;
        if (Math.abs((s.a.x - a.x) * -u.y + (s.a.y - a.y) * u.x) > 0.75) return;
        const p0 = (s.a.x - a.x) * u.x + (s.a.y - a.y) * u.y, p1 = (s.b.x - a.x) * u.x + (s.b.y - a.y) * u.y;
        const lo = Math.max(-T / 2 - 0.01, Math.min(p0, p1) - s.t / 2), hi = Math.min(L + T / 2 + 0.01, Math.max(p0, p1) + s.t / 2);
        if (hi - lo > 1) ivs.push({ a0: lo, a1: hi });
      });
      if (ivs.length) cover.set(h.r.id + ':' + w.id, ivs);
      mine.push({ a, b, u, t: T });
    });
    segs.push(...mine);
    (h.r.fixtures || []).forEach(f => {
      const p = doorPartner(f); if (!p || !at.has(p.r.id) || at.get(p.r.id) > at.get(h.r.id)) return;
      if (!doorLiveAt(h.r, f, h.M, p, list[at.get(p.r.id)].M)) return;
      if (doorHasLeaf(f) && !doorHasLeaf(p.g)) skip.add(p.r.id + ':' + p.g.id); else skip.add(h.r.id + ':' + f.id);
    });
  });
  return { cover, skip };
}
function houseCover(w) { return (HOUSE3.cover && HOUSE3.cover.get(S.roomId + ':' + w.id)) || null; }
function houseSkip(f) { return !!(HOUSE3.skip && HOUSE3.skip.has(S.roomId + ':' + f.id)); }

// Draws each room of the house (list from houseOf) in its own group at its place; draw(i) draws the open room's things.
// The ceiling lights are shared out so a big house doesn't slow the 3D down, and only the first room's bounce light
// stays (it lights everything in the scene).
function houseBuild3(v, list, draw) {
  HOUSE3.M = {}; list.forEach(h => { HOUSE3.M[h.r.id] = h.M; });
  const prep = housePrep(list), root = v.root;
  HOUSE3.cover = prep.cover; HOUSE3.skip = prep.skip;
  LAMPS3.cap = Math.max(6, Math.floor(36 / list.length)); LAMPS3.sh = 8;
  let ceilN = 0;
  try {
    list.forEach((h, i) => {
      const grp = new THREE.Group(); grp.position.set(h.M.x, 0, h.M.y); grp.rotation.y = -m2ang(h.M);
      v.root = grp; LAMPS3.amb = i === 0;
      try { withRoom(h.r, () => draw(i)); } finally { v.root = root; }
      if (i === 0) ceilN = AUTO_CEIL.n;
      grp.traverse(o => { o.userData.room = h.r.id; });
      root.add(grp);
    });
  } finally {
    HOUSE3.cover = HOUSE3.skip = null; LAMPS3.cap = Infinity; LAMPS3.sh = Infinity; LAMPS3.amb = true; AUTO_CEIL.n = ceilN;
  }
}
// Every wall end of the house, in the scene.
function houseWallPts(list) { return list.flatMap(h => (h.r.walls || []).flatMap(w => [m2pt(h.M, w.x1, w.y1), m2pt(h.M, w.x2, w.y2)]).map(p => [p.x, p.y])); }

// Into the next room without drawing anything again (Walk through a joined doorway): what is open, picked and listed
// follows; the 3D stays as it is.
function roomQuiet(id) {
  if (!roomById(id) || id === S.roomId) return;
  S.roomId = id; save();
  ui.sel = null; ui.drawing = null; ui.ghost = null; fixSel();
  renderRoom.keep3d = true; render();
}

// The plan: the joined rooms round the open one, in light grey; a click on a room's name opens it.
function housePlanSVG(fs) {
  if (ui.printing || ui.drawWalls) return '';
  const H = houseOf(S.roomId); if (H.length < 2) return '';
  return H.slice(1).map(h => {
    const M = h.M; let s = '';
    withRoom(h.r, () => {
      S.cabinets.forEach(c => { const p = cabPoly(c); if (p) s += `<polygon class="hn-cab nss" points="${polyPts(p)}"/>`; });
      S.walls.forEach(w => {
        if (w.hidden) return;
        const g = wg(w), t = (w.thick || 4) / 2, P = (a, b) => ({ x: w.x1 + g.u.x * a + g.n.x * b, y: w.y1 + g.u.y * a + g.n.y * b });
        s += `<polygon class="hn-wall nss" points="${polyPts([P(-t, -t), P(g.L + t, -t), P(g.L + t, t), P(-t, t)])}"/>`;
      });
    });
    const m = roomMid(h.r), c = m && m2pt(M, m.x, m.y);
    return `<g class="house-nb" pointer-events="none" transform="matrix(${r3(M.c)} ${r3(M.s)} ${r3(-M.s)} ${r3(M.c)} ${r3(M.x)} ${r3(M.y)})">${s}</g>`
      + (c ? `<text class="house-lbl" data-hroom="${esc(h.r.id)}" x="${r3(c.x)}" y="${r3(c.y)}" font-size="${fs * 1.15}" text-anchor="middle" dominant-baseline="middle"><title>Open ${esc(h.r.name)}</title>${esc(h.r.name)}</text>` : '');
  }).join('');
}
// Joined on a doorway is one setting for both halves.
function doorSetJoin(f, on) {
  const p = doorPartner(f) || (() => { const r = roomById(f.leadsTo), g = r && (r.fixtures || []).find(x => x.id === f.leadsDoor); return g ? { r, g } : null; })();
  if (on) { delete f.join; if (p) delete p.g.join; } else { f.join = false; if (p) p.g.join = false; }
}
