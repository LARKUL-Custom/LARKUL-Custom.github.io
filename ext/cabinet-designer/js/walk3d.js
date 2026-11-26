// Walk: a first-person tour of the room in the 3D view, at eye height (5'6").
// Keys W A S D or the arrows walk (Shift walks faster), dragging looks around, a click or tap on a cabinet opens
// or closes its doors and drawers, Esc stops. On a tablet a small stick at the bottom left walks.
// Full screen (button or F) fills the screen and locks the mouse: moving the mouse looks, a click opens what is
// under the dot in the middle, Esc leaves full screen (a second Esc stops walking).
// Walking speeds up and slows down smoothly, at the same pace whatever the frame rate.
// Walls, cabinets, tops, appliances and shapes all block the way; doorways in walls are open.
'use strict';
const WALK = { on: false, eye: 66, r: 9, speed: 54, fast: 120, vx: 0, vz: 0, turnV: 0 };

/* ---------- Rooms joined into one house (0.63.53) ---------- */
// A doorway that leads to another room joins the two rooms there (unless Joined is unticked): the other room stands
// against this one with its linked door in the same opening. Walk draws every joined room at once, so walking through
// the doorway just carries on into the next room. Each room keeps its own plan; M is where a room sits in the scene:
// its plan point x,y is at (c*x - s*y + x, s*x + c*y + y) there (the scene's x and z).
const M2_ID = { c: 1, s: 0, x: 0, y: 0 };
const m2pt = (M, x, y) => ({ x: M.c * x - M.s * y + M.x, y: M.s * x + M.c * y + M.y });
const m2dir = (M, x, y) => ({ x: M.c * x - M.s * y, y: M.s * x + M.c * y });
const m2inv = M => ({ c: M.c, s: -M.s, x: -(M.c * M.x + M.s * M.y), y: M.s * M.x - M.c * M.y });
const m2mul = (A, B) => ({ c: A.c * B.c - A.s * B.s, s: A.s * B.c + A.c * B.s, x: A.c * B.x - A.s * B.y + A.x, y: A.s * B.x + A.c * B.y + A.y });
const m2ang = M => Math.atan2(M.s, M.c);
function doorJoined(f) { return !!(f && f.leadsTo && f.leadsDoor && f.join !== false); }
// The other half of a joined doorway: { r, g } (its room and door), or null.
function doorPartner(f) {
  const r = doorJoined(f) && roomById(f.leadsTo), g = r && (r.fixtures || []).find(x => x.id === f.leadsDoor);
  return g && doorJoined(g) && g.leadsDoor === f.id ? { r, g } : null;
}
// 0.63.58: a joined doorway only counts where both halves really are the same opening in the scene (MA, MB: where
// their rooms are). A room joined through another doorway first, or one left out for overlapping a room already
// placed (house.js houseOf), leaves this pair apart: each half is its own door and Walk jumps through it as before.
function doorLiveAt(rA, f, MA, p, MB) {
  const a = doorWhere(rA, f), b = doorWhere(p.r, p.g); if (!a || !b || !MA || !MB) return false;
  const qa = m2pt(MA, a.cx, a.cy), qb = m2pt(MB, b.cx, b.cy);
  return Math.hypot(qa.x - qb.x, qa.y - qb.y) < 2;
}
// f is a door of room r (the open room unless given): the joined half in the scene, { r, g }, or null.
function doorLive(f, r = curRoom()) { const p = doorPartner(f); return p && r && doorLiveAt(r, f, walkM(r.id), p, walkM(p.r.id)) ? p : null; }
// Both halves of a joined doorway are one door: it opens and shuts as one, under one name.
function doorKey(f, r) { const p = doorLive(f, r); return p && p.g.id < f.id ? p.g.id : f.id; }
// The door of a doorway that has a leaf to open: { f, r } with its own, else its partner's (the one drawn).
function walkLeafDoor(f) { if (doorHasLeaf(f)) return { f, r: curRoom() }; const p = doorLive(f); return p && doorHasLeaf(p.g) ? { f: p.g, r: p.r } : null; }
const leafKey = l => doorKey(l.f, l.r);
// Where a room is in the 3D scene (null when it isn't drawn there); the app and the walk file each answer houseM.
function walkM(id) { return typeof houseM === 'function' ? houseM(id) : id === S.roomId ? M2_ID : null; }
// 0.63.59 (Ayden 2026-11-25: "dont show any other rooms while walking other than what you can see through the door"):
// while walking only the open room shows whole. A room joined to it shows only past the doorway's wall (each of its
// pieces gets its own copy of its look, clipped at that wall), so a room drawn overlapping this one never pokes in;
// rooms further away hide. Done again on each step through a doorway. Lights aren't clipped.
function walkRooms(v) {
  if (!v || !v.root || !v.renderer) return;
  const r = curRoom(), planes = {}, M = r && walkM(r.id);
  // 0.63.62 (Ayden 2026-11-25: "can still see the other side of things through the wall"): the cut is the open room's
  // whole box (its walls and their thickness) on this side of the doorway's wall, so a joined room drawn overlapping
  // it disappears anywhere inside it, behind any wall, not just past the doorway (clipIntersection: a point is cut
  // only when it is inside every plane). Past the doorway's wall it shows, which is what you see through the door.
  const box = r && M && walkRoomBox(r, M);
  if (r && M) (r.fixtures || []).forEach(f => {
    const p = doorLive(f, r); if (!p || planes[p.r.id]) return;
    const d = doorWhere(r, f); if (!d) return;
    const c = m2pt(M, d.cx, d.cy), n = m2dir(M, d.g.n.x * d.inn, d.g.n.y * d.inn);
    // At this room's face of the doorway wall, so the wall between stays whole (one room draws it) and only what
    // reaches into this room is cut.
    planes[p.r.id] = [new THREE.Plane(new THREE.Vector3(-n.x, 0, -n.y), c.x * n.x + c.y * n.y + d.T / 2 + 0.05), ...(box || [])];
  });
  WALK.planes = planes;
  v.renderer.localClippingEnabled = true; v.renderer.shadowMap.needsUpdate = true;
  v.root.children.forEach(g => {
    const id = g.userData.room; if (!id) return;
    const pl = id === S.roomId ? null : planes[id];
    g.visible = id === S.roomId || !!pl;
    const bx = new THREE.Box3(), ctr = new THREE.Vector3(); g.updateMatrixWorld(true);
    g.traverse(o => {
      if (!o.material || o.isLight) return;
      const u = o.userData;
      // A ceiling light's own look stays (Lights off changes it); one inside the cut just hides.
      let lamp = false; for (let p = o; p; p = p.parent) if (p.userData.layer === 'lights') lamp = true;
      if (lamp) {
        if (u.cutHide) { o.visible = true; delete u.cutHide; }
        if (pl && g.visible && o.visible && walkCutPt(pl, bx.setFromObject(o).getCenter(ctr))) { o.visible = false; u.cutHide = true; }
        return;
      }
      if (u.mat0) { [].concat(o.material).forEach(m => m.dispose && m.dispose()); o.material = u.mat0; delete u.mat0; }
      if (!pl || !g.visible) return;
      u.mat0 = o.material;
      const cl = m => { const k = m.clone(); k.clippingPlanes = pl; k.clipIntersection = true; return k; };
      o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
    });
  });
  v.requestRender();
}
// The open room's box in the scene as 4 planes facing out (inside the box = behind all four): its walls' ends, out
// past their thickness.
function walkRoomBox(r, M) {
  const ws = (r.walls || []).filter(w => !w.hidden); if (!ws.length) return null;
  const T = Math.max(...ws.map(w => w.thick || 4)) + 0.5, xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
  const x0 = Math.min(...xs) - T, x1 = Math.max(...xs) + T, y0 = Math.min(...ys) - T, y1 = Math.max(...ys) + T;
  return [[-1, 0, x0, 0], [1, 0, x1, 0], [0, -1, 0, y0], [0, 1, 0, y1]].map(([nx, ny, px, py]) => {
    const n = m2dir(M, nx, ny), q = m2pt(M, px, py);
    return new THREE.Plane(new THREE.Vector3(n.x, 0, n.y), -(n.x * q.x + n.y * q.y));
  });
}
// Cut away by the planes of walkRooms: a point inside all of them; a box wholly inside all of them.
function walkCutPt(pls, Q) { return !!pls && pls.every(pl => pl.distanceToPoint(Q) < 0); }
function walkCutBox(pls, b) { return !!pls && pls.every(pl => pl.normal.x * (pl.normal.x > 0 ? b.max.x : b.min.x) + pl.normal.z * (pl.normal.z > 0 ? b.max.z : b.min.z) + pl.constant < 0.5); }
// Puts each joined room's pieces back on their own looks (leaving Walk, or before the room is drawn again).
function walkRoomsOff(v) {
  if (!v || !v.root) return; WALK.planes = null;
  v.root.traverse(o => { const u = o.userData; if (u.cutHide) { o.visible = true; delete u.cutHide; } if (u.mat0) { [].concat(o.material).forEach(m => m.dispose && m.dispose()); o.material = u.mat0; delete u.mat0; } if (u.room && o.parent === v.root) o.visible = true; });
}
// The walker in the open room's own plan: x, z and the way they face.
function walkLocal() {
  const M = walkM(S.roomId) || M2_ID, I = m2inv(M), p = m2pt(I, WALK.x, WALK.z);
  return { x: p.x, z: p.y, yaw: WALK.yaw + m2ang(M), I };
}
// Puts the walker at x, z (facing yaw) in the open room's own plan.
function walkSetLocal(x, z, yaw) {
  const M = walkM(S.roomId) || M2_ID, p = m2pt(M, x, z);
  WALK.x = p.x; WALK.z = p.y; if (yaw !== undefined) WALK.yaw = yaw - m2ang(M);
}

/* ---------- Doors in doorways (fixtures): open and close while walking ---------- */
// How far each door is open (0 shut, 1 open), for this session only; nothing is saved in the job.
const DOOR_OPEN = Math.PI / 2, DOORS = { goal: {}, t: {} };
function doorAjar(id) { return DOORS.t[id] || 0; }
// 0.63.30: each moving piece of a room door (roomdoors.js) at t (0 shut, 1 open): a swing door turns on its hinge, a
// pocket, barn or bypass door slides, a bifold's first panel turns on the jamb and its second folds back on it.
const DOOR_FOLD = Math.PI * 0.42;
function doorLeafPose(o, t) {
  const d = o.userData.doorLeaf; if (!d) return;
  if (d.kind === 'slide') o.position.x = d.x0 + d.dx * t;
  else if (d.kind === 'fold') o.rotation.y = d.k * DOOR_FOLD * t;
  else if (d.kind === 'fold2') o.rotation.y = -2 * d.k * DOOR_FOLD * t;
  else o.rotation.y = d.k * DOOR_OPEN * t;
}
function doorToggle(id) { DOORS.goal[id] = DOORS.goal[id] ? 0 : 1; walkLoop(); }
// Moves the door leaves toward open or shut; true while any is still moving.
function doorStep(v, dt) {
  let moving = false;
  Object.keys(DOORS.goal).forEach(id => {
    const g = DOORS.goal[id], t = DOORS.t[id] || 0; if (Math.abs(g - t) < 1e-3) { DOORS.t[id] = g; return; }
    DOORS.t[id] = t + Math.sign(g - t) * Math.min(Math.abs(g - t), dt / 0.7); moving = true;
  });
  if (!moving) return false;
  const e = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  let model = false;
  v.root.traverse(o => { const d = o.userData.doorLeaf; if (d) doorLeafPose(o, e(doorAjar(d.id))); });
  // A door drawn from an imported model has no leaf to turn until the room is drawn again with a plain leaf.
  Object.keys(DOORS.goal).forEach(id => { if (DOORS.goal[id] && !walkLeafOf(v, id)) model = true; });
  if (model) buildRoom3D();
  v.requestRender(); return true;
}
function walkLeafOf(v, id) { let f = null; v.root.traverse(o => { if (!f && o.userData.doorLeaf && o.userData.doorLeaf.id === id) f = o; }); return f; }

/* ---------- Doorways that lead to another room ---------- */
// Sets where a doorway leads. The other room gets a door linked back: the one already linked to this door, else one
// already leading here, else its first door that leads nowhere.
function doorLink(f, roomId) {
  const here = S.roomId, old = roomById(f.leadsTo);
  if (old) (old.fixtures || []).forEach(g => { if (g.leadsDoor === f.id) { delete g.leadsTo; delete g.leadsDoor; } });
  delete f.leadsTo; delete f.leadsDoor;
  const r = roomById(roomId); if (!r || roomId === here) return;
  f.leadsTo = roomId;
  const doors = (r.fixtures || []).filter(g => g.kind === 'door' || g.kind === 'opening');
  const g = doors.find(x => x.leadsDoor === f.id) || doors.find(x => x.leadsTo === here && !x.leadsDoor) || doors.find(x => !roomById(x.leadsTo));
  if (g) { g.leadsTo = here; g.leadsDoor = f.id; f.leadsDoor = g.id; }
}
// The room's middle (from its walls), to tell its inside from the other side of a doorway.
function roomMid(r) {
  const ws = (r.walls || []).filter(w => !w.hidden); if (!ws.length) return null;
  const xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
// Where a doorway is: its middle on the wall, the way into the room, and how far along/through counts as inside it.
function doorWhere(r, f) {
  const w = (r.walls || []).find(x => x.id === f.wall); if (!w) return null;
  const g = wg(w), [a0, a1] = fixtInner(f), m = roomMid(r), a = (a0 + a1) / 2;
  const cx = w.x1 + g.u.x * a, cy = w.y1 + g.u.y * a, inn = m && (m.x - cx) * g.n.x + (m.y - cy) * g.n.y < 0 ? -1 : 1;
  return { w, g, a0, a1, cx, cy, inn, T: w.thick || 4 };
}
// Walked out through a linked doorway: on into the room it leads to.
function walkDoorways(v) {
  const r = curRoom(); if (!r) return false;
  const P = walkLocal();
  for (const f of r.fixtures || []) {
    if (!roomById(f.leadsTo) || f.leadsTo === r.id) continue;
    const d = doorWhere(r, f); if (!d) continue;
    const px = P.x - d.w.x1, pz = P.z - d.w.y1, along = px * d.g.u.x + pz * d.g.u.y, across = (px * d.g.n.x + pz * d.g.n.y) * d.inn;
    const out = across < -(d.T / 2 + 6), was = WALK.door && WALK.door[f.id];
    if (WALK.door) WALK.door[f.id] = out ? 'out' : 'in';
    if (out && was === 'in' && along > d.a0 - 6 && along < d.a1 + 6) { if (doorLive(f, r)) walkCross(f); else walkGoRoom(f); return true; }
  }
  return false;
}
// 0.63.53: through a joined doorway the next room is already there: nothing is drawn again and the walker stays
// where they are; only the open room changes (for clicks, its doors and the room name).
function walkCross(f) {
  const to = roomById(f.leadsTo); if (!to) return;
  if (typeof roomQuiet === 'function') roomQuiet(to.id); else switchRoom(to.id);
  WALK.door = {}; walkRooms(WALK.v); walkSolids(WALK.v);
  walkNote(to.name);
}
function walkGoRoom(f) {
  const from = S.roomId, to = roomById(f.leadsTo); if (!to) return;
  const v = WALK.v, keepYaw = WALK.yaw;
  WALK.frame = to.id;
  switchRoom(to.id); v.fitted = true;
  if (ui.viewMode !== '3d') return;
  if (S.roomId !== to.id) return;
  buildRoom3D(); walkRooms(v); walkSolids(v); WALK.door = {};
  // Step in through the door that leads back, a little way into the room, facing in.
  const g = (to.fixtures || []).find(x => x.id === f.leadsDoor) || (to.fixtures || []).find(x => x.leadsTo === from);
  const d = g && doorWhere(to, g);
  if (d) {
    const nx = d.g.n.x * d.inn, ny = d.g.n.y * d.inn, k = d.T / 2 + WALK.r + 14;
    walkSetLocal(d.cx + nx * k, d.cy + ny * k, Math.atan2(-nx, -ny));
    // Its door is open, the way you came through.
    const lg = walkLeafDoor(g);
    if (lg) { const key = leafKey(lg); DOORS.goal[key] = 1; DOORS.t[key] = 1; buildRoom3D(); walkRooms(v); walkSolids(v); }
    if (walkHits(WALK.x, WALK.z)) for (let s = 6; s < 60 && walkHits(WALK.x, WALK.z); s += 6) walkSetLocal(d.cx + nx * (k + s), d.cy + ny * (k + s));
  } else { walkPlace(v); WALK.yaw = keepYaw; }
  WALK.vx = WALK.vz = 0; WALK.pitch = Math.max(-0.3, Math.min(0.3, WALK.pitch));
  walkCam(v); v.requestRender();
  walkNote(to.name);
}

function walkToggle() { if (WALK.on) walkStop(); else walkStart(); }

function walkStart() {
  if (ui.viewMode !== '3d') { setView('3d'); requestAnimationFrame(() => walkStart()); return; }
  ensureRoomViewer(); const v = roomViewer; if (!v || !v.ok || WALK.on) return;
  if (ui.sel) select(null);
  // Every room joined to this one is drawn round it, in this room's plan, for the whole walk (WALK.frame).
  WALK.frame = S.roomId; WALK.pending = true;
  // The tour is in the Realistic look; it goes back to the plain look after if Walk turned it on.
  WALK.lookWas = { render: !!ui.render3d, hidden: !!ui.hidden3d };
  try {
    if (!ui.render3d || ui.hidden3d) { ui.render3d = true; ui.hidden3d = false; renderRoom(); }
    // Drawn again for the walk: joined rooms round it, open sides closed in, or the Lights tab's windows-only light off.
    else if ((typeof houseOf === 'function' && !v.houseBuilt && houseOf(S.roomId).length > 1) || (typeof roomScene3 === 'function' && WALK.autoWalls !== false && walkOpenSides(S.walls).segs.length)) buildRoom3D();
  } finally { WALK.pending = false; }
  WALK.v = v; WALK.saved = v.getView(); WALK.fov = v.persp.fov; WALK.room0 = S.roomId; WALK.door = {};
  v.cam = v.persp; v.controls.object = v.persp; v.controls.enabled = false;
  v.persp.fov = 62; v.persp.updateProjectionMatrix();
  // 0.64.7 (Ayden 2026-11-26: "its still very choppy"): while walking only the camera moves, so the shadows (the sun's
  // and the ceiling lights') are drawn once and kept, and drawn again only when something moves (a door or drawer, a
  // rebuilt room, the sun). Before, every light's shadow was drawn again every frame, the biggest cost in a frame.
  // A high-resolution screen walks at one picture pixel per screen pixel (not two), a quarter of the work.
  WALK.pr0 = v.renderer.getPixelRatio(); if (WALK.pr0 > 1) { v.renderer.setPixelRatio(1); v.resize(); }
  v.renderer.shadowMap.autoUpdate = false; v.renderer.shadowMap.needsUpdate = true;
  WALK.on = true; v.walk = true; WALK.keys = {}; WALK.stick = null; WALK.solids = null; WALK.vx = WALK.vz = WALK.turnV = 0;
  walkRooms(v);
  walkPlace(v);
  walkUI(v, true);
  walkCam(v); v.requestRender(); walkLoop();
  renderRoomWalkBtn();
}

function walkStop() {
  if (!WALK.on) return;
  walkFull(false);
  const v = WALK.v; WALK.on = false; v.walk = false; WALK.keys = {}; WALK.stick = null; WALK.vx = WALK.vz = WALK.turnV = 0;
  if (WALK.raf) cancelAnimationFrame(WALK.raf); WALK.raf = 0;
  // Lights back on: lights off is only for the walk.
  if (WALK.dark || WALK.darkOn) { WALK.dark = false; walkLights(v, false); v.requestRender(); }
  walkRoomsOff(v);
  walkUI(v, false);
  v.renderer.shadowMap.autoUpdate = true; v.renderer.shadowMap.needsUpdate = true;
  if (WALK.pr0 > 1) { v.renderer.setPixelRatio(WALK.pr0); v.resize(); } WALK.pr0 = 0;
  v.persp.fov = WALK.fov || 40; v.persp.updateProjectionMatrix();
  v.controls.enabled = true;
  // Doors go back to shut, and the joined rooms go (or are drawn round the room you ended up in, with House on).
  const doors = Object.keys(DOORS.goal).length; DOORS.goal = {}; DOORS.t = {};
  // The walls the Walk closed open sides with go, and the Lights tab's own light comes back.
  if ((doors || v.houseBuilt || WALK.autoN) && ui.viewMode === '3d') buildRoom3D();
  WALK.frame = null;
  // Walked into another room: show it from the usual corner; else the view from before the walk.
  if (S.roomId !== WALK.room0) { v.fitted = true; v.look(roomViewDir(0.75)); } else v.setView(WALK.saved);
  const lw = WALK.lookWas;
  if (lw && ui.render3d && !ui.hidden3d && (!lw.render || lw.hidden)) { ui.render3d = lw.render; ui.hidden3d = lw.hidden; renderRoom(); }
  renderRoomWalkBtn();
}
function renderRoomWalkBtn() { const b = $('#walk3d'); if (b) { b.innerHTML = `${icon('walk')}Walk`; b.setAttribute('aria-pressed', String(WALK.on)); } }

// Where the tour starts: the middle of the room, looking the way the 3D view was looking, moved to the nearest
// clear spot if a cabinet or island is standing there.
function walkPlace(v) {
  const pts = []; S.walls.filter(w => !w.hidden).forEach(w => pts.push([w.x1, w.y1], [w.x2, w.y2]));
  let cx, cz;
  if (pts.length) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), q = m2pt(walkM(S.roomId) || M2_ID, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2); cx = q.x; cz = q.y; }
  else { const b = v.bounds(), c = b.getCenter(new THREE.Vector3()); cx = c.x; cz = b.max.z + 60; }
  const d = new THREE.Vector3(); v.persp.getWorldDirection(d);
  if (Math.hypot(d.x, d.z) < 0.05) d.set(0, 0, -1);
  WALK.yaw = Math.atan2(-d.x, -d.z); WALK.pitch = -0.08;
  walkSolids(v);
  // Step back from the middle (away from the way we look) so more of the room is in view, if there is room.
  WALK.x = cx; WALK.z = cz;
  const fx = -Math.sin(WALK.yaw), fz = -Math.cos(WALK.yaw);
  for (let k = 36; k > 0; k -= 12) { if (!walkHits(cx - fx * k, cz - fz * k)) { WALK.x = cx - fx * k; WALK.z = cz - fz * k; break; } }
  if (walkHits(WALK.x, WALK.z)) {
    outer: for (let ring = 1; ring < 40; ring++) for (let a = 0; a < 16; a++) {
      const t = a / 16 * Math.PI * 2, x = cx + Math.cos(t) * ring * 8, z = cz + Math.sin(t) * ring * 8;
      if (!walkHits(x, z)) { WALK.x = x; WALK.z = z; break outer; }
    }
  }
}

function walkCam(v) {
  v.persp.position.set(WALK.x, WALK.eye, WALK.z);
  v.persp.rotation.set(WALK.pitch, WALK.yaw, 0, 'YXZ');
  v.persp.updateMatrixWorld();
  walkMoved();
}
// 0.64.6: moving draws the shade at half size (realAO); once still for a moment, one sharp frame.
function walkMoved() {
  WALK.movedAt = performance.now(); clearTimeout(WALK.sharpT);
  WALK.sharpT = setTimeout(() => { if (WALK.on && WALK.v) WALK.v.requestRender(); }, 300);
}

/* ---------- What blocks the way ---------- */
// Every solid mesh from knee to head height, kept as its own box and placement so turned walls and cabinets
// block exactly where they stand (not a big square around them).
function walkSolids(v) {
  const out = [], wb = new THREE.Box3(); v.root.updateMatrixWorld(true); WALK.doorIds = null;
  v.root.traverse(o => {
    if (!o.isMesh || o.isSprite || o.userData.noBounds || o.userData.hlEdge || !walkSolid(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox; if (!b || b.isEmpty()) return;
    wb.copy(b).applyMatrix4(o.matrixWorld);
    if (wb.max.y < 6 || wb.min.y > WALK.eye + 6) return;
    // A joined room's piece wholly in the cut (inside this room, this side of its doorway's wall) is cut away: it doesn't block either.
    const pl = WALK.on && WALK.planes && walkRoomOf(o) !== S.roomId && WALK.planes[walkRoomOf(o)] || null;
    if (walkCutBox(pl, wb)) return;
    out.push({ pl, box: b.clone(), m: o.matrixWorld.clone(), inv: o.matrixWorld.clone().invert(), x0: wb.min.x, x1: wb.max.x, y0: wb.min.y, y1: wb.max.y, z0: wb.min.z, z1: wb.max.z });
  });
  WALK.solids = out; WALK.first = v.root.children[0]; WALK.count = v.root.children.length; WALK.at = performance.now();
}
function walkRoomOf(o) { for (let p = o; p; p = p.parent) if (p.userData.room) return p.userData.room; return null; }
// A mesh you can bump into: shown (walls hidden by the cutaway still count), not a light, not see-through helpers.
function walkSolid(o) {
  const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m0 || m0.visible === false || m0.colorWrite === false || !o.geometry) return false;
  let leaf = false;
  for (let p = o; p; p = p.parent) { if (p.userData.layer === 'lights') return false; if (p.visible === false && !p.userData.cut) return false; if (p.userData.doorLeaf) leaf = true; if (p.userData.wallDetail) return false; }
  // Stone and panels on a wall never block (their mesh's box ran across the doorways: an invisible wall, Ayden
  // 2026-11-24); the wall behind them does. A doorway's casing, jambs or imported model never blocks it (an imported Mozaik door or opening is one mesh whose
  // box fills the whole opening, which stopped you there like an invisible wall). The wall beside it blocks, and a
  // door's own leaf does until you walk into it and it opens.
  if (!leaf && o.userData.fixtId && walkDoorIds().has(o.userData.fixtId)) return false;
  return true;
}
// The doors and openings of every room (Walk can draw joined rooms together), read again for each walkSolids.
function walkDoorIds() {
  if (WALK.doorIds) return WALK.doorIds;
  const ids = new Set(); (S.rooms || []).forEach(r => (r.fixtures || []).forEach(f => { if (f.kind === 'door' || f.kind === 'opening') ids.add(f.id); }));
  return (WALK.doorIds = ids);
}
const WALK_TMP = { p: null, q: null };
// True when a person standing at x,z would touch something (tested at knee, waist and head height).
function walkHits(x, z) {
  const r = WALK.r, P = WALK_TMP.p || (WALK_TMP.p = new THREE.Vector3()), Q = WALK_TMP.q || (WALK_TMP.q = new THREE.Vector3());
  for (const s of WALK.solids || []) {
    if (x + r < s.x0 || x - r > s.x1 || z + r < s.z0 || z - r > s.z1) continue;
    for (const y of [14, 38, WALK.eye - 4]) {
      if (y < s.y0 - r || y > s.y1 + r) continue;
      P.set(x, y, z).applyMatrix4(s.inv); s.box.clampPoint(P, Q); Q.applyMatrix4(s.m);
      // A joined room's piece only blocks outside the cut (the part inside this room is cut away).
      if (walkCutPt(s.pl, Q)) continue;
      if ((Q.x - x) ** 2 + (Q.y - y) ** 2 + (Q.z - z) ** 2 < r * r) return true;
    }
  }
  return false;
}
// Moves by dx,dz, sliding along whatever is in the way. Someone already touching something (a door swung
// into them) can always step out.
function walkMove(dx, dz) {
  // Rounding leaves tiny sideways bits (1e-16) when walking straight along an axis; they are not a move.
  if (Math.abs(dx) < 1e-6) dx = 0; if (Math.abs(dz) < 1e-6) dz = 0;
  if (!dx && !dz) return false;
  const x = WALK.x, z = WALK.z, stuck = walkHits(x, z);
  const ok = (nx, nz) => stuck || !walkHits(nx, nz);
  if (ok(x + dx, z + dz)) { WALK.x += dx; WALK.z += dz; WALK.veer = 0; return true; }
  if (dx && ok(x + dx, z)) { WALK.x += dx; return true; }
  if (dz && ok(x, z + dz)) { WALK.z += dz; return true; }
  // Head-on into a corner or a door jamb: veer round it, to the side that is open (kept while you push on, so you
  // don't wobble), which also eases you into a doorway you aren't quite lined up with.
  if (!WALK.veer) {
    // The nearer side where a step forward would be clear.
    const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = -uz, pz = ux;
    // None within a foot (a flat wall or cabinet run): just stop, don't drift along it.
    WALK.veer = 2;
    for (let k = 2; k <= 12; k += 2) {
      if (!walkHits(x + ux * 4 + px * k, z + uz * 4 + pz * k)) { WALK.veer = 1; break; }
      if (!walkHits(x + ux * 4 - px * k, z + uz * 4 - pz * k)) { WALK.veer = -1; break; }
    }
  }
  if (WALK.veer === 2) return false;
  for (const t0 of [0.45, 0.9, 1.35]) {
    const t = t0 * WALK.veer, c = Math.cos(t), s = Math.sin(t), nx = (dx * c - dz * s) * 0.8, nz = (dx * s + dz * c) * 0.8;
    if (ok(x + nx, z + nz)) { WALK.x += nx; WALK.z += nz; return true; }
  }
  return false;
}

// Opens the shut door just ahead (within a foot) of someone walking toward it (dx,dz is the way they push).
function walkBumpDoor(dx, dz) {
  const r = curRoom(), L = Math.hypot(dx, dz); if (!r || !L) return false;
  const P = walkLocal(), u = m2dir(P.I, dx / L, dz / L), ux = u.x, uz = u.y;
  for (const f of r.fixtures || []) {
    const lf = walkLeafDoor(f); if (!lf || DOORS.goal[leafKey(lf)]) continue;
    const d = doorWhere(r, f); if (!d) continue;
    // Heading at the wall, not along it.
    if (Math.abs(ux * d.g.n.x + uz * d.g.n.y) < 0.5) continue;
    for (let k = WALK.r; k <= WALK.r + 12; k += 3) {
      const px = P.x + ux * k - d.w.x1, pz = P.z + uz * k - d.w.y1;
      const along = px * d.g.u.x + pz * d.g.u.y, across = px * d.g.n.x + pz * d.g.n.y;
      if (along > d.a0 - 2 && along < d.a1 + 2 && Math.abs(across) < d.T / 2 + 10) { doorToggle(leafKey(lf)); return true; }
    }
  }
  return false;
}

/* ---------- Moving ---------- */
function walkLoop() {
  if (WALK.raf || !WALK.on) return;
  let last = performance.now();
  const step = now => {
    WALK.raf = 0; if (!WALK.on) return;
    const v = WALK.v;
    // The tour ends if the 3D view is closed.
    if (ui.viewMode !== '3d' || ui.tab !== 'room' || !v.host.isConnected) { walkStop(); return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // The room was rebuilt (a door opened, a change) or doors are still swinging: read the solids again.
    const rebuilt = v.root.children[0] !== WALK.first || v.root.children.length !== WALK.count;
    if (rebuilt) walkRooms(v);
    if (rebuilt || (typeof openAnim !== 'undefined' && openAnim && now - WALK.at > 150)) walkSolids(v);
    // A room drawn again comes with its lights on; the Walk's lights off goes back on it.
    if (rebuilt && WALK.dark) walkLights(v);
    const k = WALK.keys, fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), turn = (k.ArrowLeft || k.KeyQ ? 1 : 0) - (k.ArrowRight || k.KeyE ? 1 : 0);
    let f = fwd, s = side;
    if (WALK.stick) { f += -WALK.stick.y; s += WALK.stick.x; }
    // The speed you want, as a direction on the floor; the real speed eases toward it (quick to start, a little
    // softer to stop), so steps blend instead of jerking on and off.
    const n = Math.hypot(f, s), want = n > 0.05, sp = k.ShiftLeft || k.ShiftRight ? WALK.fast : WALK.speed;
    let tx = 0, tz = 0;
    if (want) { const m = Math.min(1, n) * sp / n, fx = -Math.sin(WALK.yaw), fz = -Math.cos(WALK.yaw); tx = (fx * f - fz * s) * m; tz = (fz * f + fx * s) * m; }
    const ease = 1 - Math.exp(-dt * (want ? 9 : 7));
    WALK.vx += (tx - WALK.vx) * ease; WALK.vz += (tz - WALK.vz) * ease;
    WALK.turnV += (turn * 1.7 - WALK.turnV) * (1 - Math.exp(-dt * 10));
    if (!want && Math.hypot(WALK.vx, WALK.vz) < 0.4) WALK.vx = WALK.vz = 0;
    if (!turn && Math.abs(WALK.turnV) < 0.005) WALK.turnV = 0;
    const moving = !!(WALK.vx || WALK.vz), turning = !!WALK.turnV;
    if (turning) WALK.yaw += WALK.turnV * dt;
    // Walking into a shut door opens it, so you can go on through.
    if (want) walkBumpDoor(tx, tz);
    if (moving) {
      const x0 = WALK.x, z0 = WALK.z; walkMove(WALK.vx * dt, WALK.vz * dt);
      // Bumping into something takes the speed out of that direction, so you slide along it and don't stick.
      if (WALK.x === x0) WALK.vx = 0; if (WALK.z === z0) WALK.vz = 0;
    }
    if (moving && walkDoorways(v)) { if (!WALK.on) return; }
    const doors = doorStep(v, dt);
    // Shadows follow anything that moved this frame (and once more when it stops).
    const anim = typeof openAnim !== 'undefined' && !!openAnim;
    // 0.64.8 (Ayden 2026-11-26: "slightly framey when i open doors or drawers"): while a door or drawer swings, its
    // shadows are drawn again every 4th frame (each redraw draws the room once per shadow-casting light), and once
    // more when it stops, so the opening itself stays smooth.
    const moved = doors || anim;
    WALK.shN = moved ? (WALK.shN || 0) + 1 : 0;
    // The soft shading is worked out at half size while it swings too (as while walking), sharp again once it stops.
    if (moved) walkMoved();
    if (rebuilt || (moved && WALK.shN % 4 === 1) || (!doors && WALK.doorsMoving) || (!anim && WALK.animWas)) v.renderer.shadowMap.needsUpdate = true;
    if (!anim && WALK.animWas) v.requestRender();
    WALK.animWas = anim;
    // Doors swinging: read where they are now and then, and once more when they stop.
    if ((doors && now - WALK.at > 150) || (!doors && WALK.doorsMoving)) walkSolids(v);
    WALK.doorsMoving = doors;
    if (moving || turning || rebuilt) { walkCam(v); v.requestRender(); }
    if (want || turn || moving || turning || doors || (typeof openAnim !== 'undefined' && openAnim)) WALK.raf = requestAnimationFrame(step);
  };
  WALK.raf = requestAnimationFrame(step);
}

// Keys while walking go to the walk only (so W does not start drawing walls and F does not change the view).
window.addEventListener('keydown', e => {
  if (!WALK.on) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (e.key === 'Escape') {
    // Esc leaves full screen first (the browser may already have done it with this same press).
    if (walkIsFull()) { walkFull(false); return; }
    if (performance.now() - (WALK.fullLeft || 0) < 400) return;
    walkStop(); return;
  }
  if (e.code === 'KeyF' && !e.repeat) { walkFull(!walkIsFull()); return; }
  WALK.keys[e.code] = true; walkLoop();
}, true);
window.addEventListener('keyup', e => { if (WALK.on) { delete WALK.keys[e.code]; } }, true);
window.addEventListener('blur', () => { WALK.keys = {}; WALK.stick = null; });

/* ---------- Full screen with the mouse locked ---------- */
function walkIsFull() { return !!WALK.on && !!WALK.v && (document.fullscreenElement === WALK.v.host.parentElement || document.pointerLockElement === WALK.v.renderer.domElement); }
function walkFull(on) {
  const v = WALK.v; if (!v) return;
  const card = v.host.parentElement, el = v.renderer.domElement;
  if (on) {
    if (!WALK.on) return;
    try { const p = card.requestFullscreen && card.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    walkLock();
  } else {
    if (document.pointerLockElement === el) try { document.exitPointerLock(); } catch (_) {}
    if (document.fullscreenElement === card) try { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
}
function walkLock() {
  const el = WALK.v && WALK.v.renderer.domElement; if (!el || !el.requestPointerLock) return;
  try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
}
// Leaving one leaves the other: the browser's own Esc may only drop the mouse lock or only the full screen.
document.addEventListener('pointerlockchange', () => {
  if (!WALK.v) return;
  const locked = document.pointerLockElement === WALK.v.renderer.domElement;
  if (WALK.ui) WALK.ui.classList.toggle('locked', locked);
  if (!locked) { WALK.fullLeft = performance.now(); WALK.keys = {}; if (document.fullscreenElement === WALK.v.host.parentElement) walkFull(false); }
  else walkNote('Move the mouse to look · click to open · Esc leaves full screen');
});
document.addEventListener('fullscreenchange', () => {
  if (!WALK.v) return;
  const full = document.fullscreenElement === WALK.v.host.parentElement;
  if (WALK.ui) WALK.ui.classList.toggle('full', full);
  if (!full) { WALK.fullLeft = performance.now(); if (document.pointerLockElement === WALK.v.renderer.domElement) try { document.exitPointerLock(); } catch (_) {} }
  WALK.v.resize();
});
// A short note at the top that fades out.
function walkNote(t) {
  const h = WALK.ui && WALK.ui.querySelector('.walkhint'); if (!h) return;
  h.textContent = t; h.classList.remove('gone'); clearTimeout(WALK.hintT);
  WALK.hintT = setTimeout(() => h.classList.add('gone'), 4000);
}

/* ---------- Looking, clicking and the touch stick ---------- */
function walkUI(v, on) {
  const el = v.renderer.domElement;
  if (!on) {
    if (WALK.ui) WALK.ui.remove(); WALK.ui = null;
    if (WALK.off) WALK.off(); WALK.off = null;
    clearTimeout(WALK.hintT); return;
  }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const box = document.createElement('div'); box.className = 'walkui';
  box.innerHTML = `<div class="walkbar"><span class="walkhint">${coarse ? 'Stick to walk · drag to look · tap a cabinet to open it' : 'W A S D or arrows to walk · drag to look · click a cabinet to open it'}</span>`
    + (coarse ? '' : `<button class="btn sm" data-walk="full" title="Fill the screen and look by moving the mouse (F). Esc comes back.">${icon('expand')}Full screen</button>`)
    // 0.63.31 (Ayden 2026-11-24): the time of day and the room's lights, right in the Walk bar, to set before full screen.
    + (v.real && typeof SUN === 'object' ? `<label class="walksun" title="Time of day">${icon('sun')}<input type="range" min="5" max="22" step="0.25" value="${SUN.hour}" aria-label="Time of day"><span>${sunLabel(SUN.hour)}</span></label>` : '')
    + `<button class="btn sm walklights" data-walk="lights" aria-pressed="false" title="Turn the room's ceiling lights and LED strips off or on"></button>`
    // 0.64.1: Only through windows, the same setting as the Lights tab's (0.64.7), off unless turned on.
    + (v.real && typeof winSeal3 === 'function' ? `<button class="btn sm" data-walk="winonly" aria-pressed="false" title="Daylight only comes in through the windows (no sky light from outside the drawing), following the time of day. Lights you placed stay on; the automatic cans go off. Same setting as the Lights tab's."></button>` : '')
    // 0.64.1: the walls Walk puts along open sides of the room, on or off.
    + (typeof walkAutoWalls === 'function' && typeof roomScene3 === 'function' ? `<button class="btn sm" data-walk="walls" aria-pressed="true" title="Close in the open sides of the room with plain walls while walking, so you never look out into empty space. Only for the walk: nothing is added to the drawing."></button>` : '')
    + (v.real && typeof resetLighting === 'function' ? `<button class="btn sm" data-walk="reset" title="Reset lighting: 3 PM daylight, room lights on, automatic ceiling cans, Only through windows off">${icon('regen')}Reset lighting</button>` : '')
    + `<button class="btn sm" data-walk="stop">${icon('close')}Stop walking</button></div><div class="walkdot"></div>`
    + (coarse ? '<div class="walkstick"><i></i></div>' : '');
  v.host.parentElement.appendChild(box); WALK.ui = box;
  WALK.hintT = setTimeout(() => { const h = box.querySelector('.walkhint'); if (h) h.classList.add('gone'); }, 6000);
  box.querySelector('[data-walk=stop]').addEventListener('click', e => { e.stopPropagation(); walkStop(); });
  const fb = box.querySelector('[data-walk=full]'); if (fb) fb.addEventListener('click', e => { e.stopPropagation(); fb.blur(); walkFull(true); });
  const sr = box.querySelector('.walksun input');
  if (sr) sr.addEventListener('input', e => { e.stopPropagation(); walkSunSet(v, +sr.value); });
  const rb = box.querySelector('[data-walk=reset]'); if (rb) rb.addEventListener('click', e => { e.stopPropagation(); rb.blur(); resetLighting(); });
  const wb = box.querySelector('[data-walk=winonly]');
  if (wb) wb.addEventListener('click', e => {
    e.stopPropagation(); wb.blur();
    // The job's setting (undo brings it back); the room is drawn again by the change, the walker stays put.
    mutate(() => { S.job.layout = { ...(S.job.layout || {}), winOnly: !lay().winOnly }; });
    walkRooms(v); walkSolids(v); if (WALK.dark) walkLights(v); walkBarBtns(); walkCam(v); v.requestRender();
    walkNote(lay().winOnly ? 'Daylight only through the windows' : 'Daylight as usual');
  });
  const ab = box.querySelector('[data-walk=walls]');
  if (ab) ab.addEventListener('click', e => { e.stopPropagation(); ab.blur(); WALK.autoWalls = WALK.autoWalls === false; walkRebuild(v); walkNote(WALK.autoWalls ? (WALK.autoN ? 'Open sides closed in' : 'This room has no open sides') : 'Open sides left open'); });
  walkBarBtns();
  const lb = box.querySelector('[data-walk=lights]');
  if (lb) { walkLightsBtn(); lb.addEventListener('click', e => { e.stopPropagation(); lb.blur(); WALK.dark = !WALK.dark; walkLights(v); walkLightsBtn(); v.requestRender(); }); }

  // Dragging looks; a short tap or click on a cabinet opens or closes it.
  const drags = new Map();
  const locked = () => document.pointerLockElement === el;
  const down = e => {
    if (e.target !== el) return;
    // Mouse locked: a click opens what is under the dot in the middle.
    if (locked()) { if (e.button === 0) { const r = el.getBoundingClientRect(); walkTap(v, r.left + r.width / 2, r.top + r.height / 2); } return; }
    // In full screen without the lock (it was refused or lost), a click locks it again.
    if (document.fullscreenElement === v.host.parentElement && e.pointerType === 'mouse') { walkLock(); return; }
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const move = e => {
    // Mouse locked: moving the mouse turns your head (right looks right, up looks up), no button needed.
    if (locked()) {
      const k = 0.0022, mx = e.movementX || 0, my = e.movementY || 0; if (!mx && !my) return;
      WALK.yaw -= mx * k; WALK.pitch = Math.max(-1.35, Math.min(1.35, WALK.pitch - my * k));
      walkCam(v); v.requestRender(); return;
    }
    const d = drags.get(e.pointerId); if (!d) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
    // Grab the view and pull it, like the normal 3D view and street view photos.
    WALK.yaw += (e.clientX - d.x) * k; WALK.pitch = Math.max(-1.3, Math.min(1.3, WALK.pitch + (e.clientY - d.y) * k));
    d.x = e.clientX; d.y = e.clientY; walkCam(v); v.requestRender();
  };
  const up = e => {
    const d = drags.get(e.pointerId); if (!d) return; drags.delete(e.pointerId);
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6 && performance.now() - d.t < 500 && e.button === 0) walkTap(v, e.clientX, e.clientY);
  };
  const cancel = e => drags.delete(e.pointerId);
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
  WALK.off = () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };

  // The touch stick: push it the way you want to walk.
  const st = box.querySelector('.walkstick');
  if (st) {
    const knob = st.querySelector('i'); let id = null;
    const set = e => {
      const r = st.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
      WALK.stick = { x, y }; knob.style.transform = `translate(${x * R * 0.6}px,${y * R * 0.6}px)`; walkLoop();
    };
    const end = e => { if (e.pointerId !== id) return; id = null; WALK.stick = null; knob.style.transform = ''; };
    st.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; try { st.setPointerCapture(id); } catch (_) {} set(e); });
    st.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  }
}

// Time of day from the Walk bar: the app's own slider (sunSet: saved, shadows fitted) or, in a walk file, just the sun.
function walkSunSet(v, h) {
  if (typeof sunSet === 'function') sunSet(h); else { SUN.hour = h; if (v.fitShadow) v.fitShadow(); v.requestRender(); }
  const l = WALK.ui && WALK.ui.querySelector('.walksun span'); if (l) l.textContent = sunLabel(h);
  // The other time sliders on the page follow (the one beside Realistic, the walk file's bar).
  ['sunhour', 'wxsun'].forEach(id => { const r = document.getElementById(id); if (r && +r.value !== h) r.value = h; });
  const wl = document.getElementById('wxsunl'); if (wl) wl.textContent = sunLabel(h);
}
// Lights off (WALK.dark): every room lamp goes to 0, glowing bulbs and discs turn plain, LED washes hide. Window light
// and the sun stay. Only the Walk's look: nothing in the job changes, and it is undone when the walk stops.
// Lamps keep their place in the scene (intensity 0, not hidden), so no shader has to be built again.
const WALK_OFF = {};
function walkLights(v, force) {
  const dark = force === undefined ? !!WALK.dark : force;
  const inLights = o => { for (let p = o; p; p = p.parent) if (p.userData.layer === 'lights') return true; return false; };
  v.root.traverse(o => {
    const u = o.userData;
    if ((o.isPointLight && !u.winBounce) || (o.isLight && u.puck)) { if (u.lit0 === undefined) u.lit0 = o.intensity; o.intensity = dark ? 0 : u.lit0; return; }
    if (!o.isMesh || !inLights(o)) return;
    const m = u.litMat || o.material; if (!m || Array.isArray(m) || m.colorWrite === false) return;
    if (m.blending === THREE.AdditiveBlending) { o.visible = !dark; return; }
    if (m.isMeshBasicMaterial && m.toneMapped === false) {
      if (dark) { u.litMat = m; o.material = WALK_OFF.m || (WALK_OFF.m = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.6 })); }
      else if (u.litMat) { o.material = u.litMat; delete u.litMat; }
    }
  });
  WALK.darkOn = dark;
}
// The Walk bar's Only through windows and Close open sides buttons show what is on.
function walkBarBtns() {
  const b = WALK.ui && WALK.ui.querySelector('[data-walk=winonly]');
  const wo = typeof lay === 'function' && !!lay().winOnly;
  if (b) { b.innerHTML = `${icon(wo ? 'check' : 'sun')}Only through windows`; b.classList.toggle('on', wo); b.setAttribute('aria-pressed', String(wo)); }
  const a = WALK.ui && WALK.ui.querySelector('[data-walk=walls]'), on = WALK.autoWalls !== false;
  if (a) { a.innerHTML = `${icon(on ? 'check' : 'wall')}Close open sides`; a.classList.toggle('on', on); a.setAttribute('aria-pressed', String(on)); }
}
// The room drawn again in the middle of a walk (a Walk bar setting changed): the walker stays put.
function walkRebuild(v) {
  buildRoom3D(); walkRooms(v); walkSolids(v); if (WALK.dark) walkLights(v);
  // Closing a side in round where you stand would trap you: step back into the room.
  if (walkHits(WALK.x, WALK.z)) walkPlace(v);
  walkBarBtns(); walkCam(v); v.requestRender();
}
function walkLightsBtn() {
  const b = WALK.ui && WALK.ui.querySelector('[data-walk=lights]'); if (!b) return;
  b.innerHTML = `${icon('bulb')}${WALK.dark ? 'Lights on' : 'Lights off'}`; b.setAttribute('aria-pressed', String(!!WALK.dark));
}

// Opens or closes the cabinet under the pointer when it is within reach of the room (12').
function walkTap(v, cx, cy) {
  const r = v.renderer.domElement.getBoundingClientRect();
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), v.cam);
  rc.far = 144;
  const hit = rc.intersectObjects(v.root.children, true).find(h => h.object.isMesh && !h.object.isSprite && h.object.visible && walkSolid(h.object));
  const fx = hit && hit.object.userData.fixtId && fixtById(hit.object.userData.fixtId);
  // A door leaf (this room's or a joined room's) opens wherever it is hit; a casing opens its doorway's door.
  let leaf = null; for (let p = hit && hit.object; p && !leaf; p = p.parent) leaf = p.userData.doorLeaf || null;
  const lf = fx && walkLeafDoor(fx), key = leaf ? leaf.id : lf ? leafKey(lf) : null;
  // 0.62.4 (Ayden 2026-11-24: "when walking and opening cabinets it's hard to select the pocket door"): a tap anywhere on
  // a cabinet's closed front face counts, open or shut, even where the door has slid away into its pocket or something
  // in front of it (a trim, a filler edge) took the ray first.
  const fh = walkFrontHit(v, rc, hit ? hit.distance + 2 : 144);
  if (key && !(fh && fh.d < hit.distance - 0.5)) { doorToggle(key); return; }
  if (fh) { setOpen([fh.c.id]); walkLoop(); return; }
  const hr = hit && hit.object.userData.room, id = hit && (!hr || hr === S.roomId) && hit.object.userData.cabId, c = id && cab(id);
  if (c && openable(c)) { setOpen([c.id]); walkLoop(); }
}
// The nearest openable cabinet whose closed front face the ray crosses within maxD: { c, d } or null.
function walkFrontHit(v, rc, maxD) {
  if (typeof frontFrame !== 'function' || !v.root) return null;
  let best = null; const T = new THREE.Vector3();
  const M = walkM(S.roomId) || M2_ID, W = (p, y) => { const q = m2pt(M, p.x, p.y); return v.root.localToWorld(new THREE.Vector3(q.x, y, q.y)); };
  S.cabinets.forEach(c => {
    if (!c.wall || !openable(c)) return;
    const fr = frontFrame(c); if (!fr) return;
    const a = fr.P(0, 0), b = fr.P(c.w, 0), y0 = c.elev || 0, y1 = y0 + c.h;
    const A = W(a, y0), B = W(b, y0), C = W(b, y1), D = W(a, y1);
    const p = rc.ray.intersectTriangle(A, B, C, false, T) || rc.ray.intersectTriangle(A, C, D, false, T);
    if (!p) return;
    const d = rc.ray.origin.distanceTo(p);
    if (d <= maxD && d <= (rc.far || 144) && (!best || d < best.d)) best = { c, d };
  });
  return best;
}

/* ---------- Open sides closed in while walking (0.64.1) ---------- */
// Ayden 2026-11-26: "i need some way to like autobuild walls when in walk so they cant just see the outside void". A
// room drawn with a side left open (a U of walls, an L, one wall, a galley) gets plain walls along the open sides while
// walking, in the room's wall look, as tall as its walls; they block the way like walls. Only the Walk's look (and the
// walk file's): nothing is added to the drawing, the cut list or the price. A side where a joined room stands (house.js)
// stays open, and the Walk bar's Close open sides turns it off (WALK.autoWalls).
// The stretches to close, in the room's own plan: [{ ax, ay, bx, by, nx, ny }] (n points out of the room), and the
// extra floor area past the walls when the room had to be made deeper ({ x0, x1, y0, y1 } or null).
function walkOpenSides(walls, others) {
  const ws = (walls || []).filter(w => !w.hidden && !w.island && Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1);
  if (!ws.length) return { segs: [], ext: null };
  const T = Math.max(...ws.map(w => +w.thick || 4)), tol = T + 2;
  // Wall ends that meet (within a wall's thickness) are one corner.
  const nodes = [], nodeOf = (x, y) => { let k = nodes.findIndex(p => Math.hypot(p.x - x, p.y - y) <= tol); if (k < 0) { k = nodes.length; nodes.push({ x, y, deg: 0 }); } return k; };
  const E = ws.map(w => { const a = nodeOf(w.x1, w.y1), b = nodeOf(w.x2, w.y2); nodes[a].deg++; nodes[b].deg++; return { w, a, b }; });
  const dSeg = (x, y, w) => { const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / L2)); return Math.hypot(w.x1 + t * dx - x, w.y1 + t * dy - y); };
  // Walls that go all the way round (a closed loop anywhere) need nothing.
  const par = nodes.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (const e of E) { const a = find(e.a), b = find(e.b); if (a === b) return { segs: [], ext: null }; par[a] = b; }
  // A loose end: a wall end that meets no other wall (not even the middle of one, like a T).
  const free = nodes.map((p, i) => i).filter(i => nodes[i].deg === 1 && !ws.some(w => !E.some(e => e.w === w && (e.a === i || e.b === i)) && dSeg(nodes[i].x, nodes[i].y, w) <= tol));
  if (!free.length) return { segs: [], ext: null };
  const near = (x, y) => ws.some(w => dSeg(x, y, w) <= (+w.thick || 4) / 2 + 6);
  // Inside another room drawn beside this one (joined at a doorway): left open.
  const inOther = (x, y) => (others || []).some(b => x > b.x0 - T && x < b.x1 + T && y > b.y0 - T && y < b.y1 + T);
  const cand = [];
  let mid = null, ext = null;
  // One run of walls from one loose end to the other: closed straight across, or an L made into a box.
  const comps = new Set(E.map(e => find(e.a)));
  if (comps.size === 1 && E.length >= 2 && free.length === 2) {
    const path = [free[0]], used = new Set();
    while (path.length <= E.length) {
      const at = path[path.length - 1], e = E.find((x, j) => !used.has(j) && (x.a === at || x.b === at)); if (!e) break;
      used.add(E.indexOf(e)); path.push(e.a === at ? e.b : e.a);
    }
    const P = path.map(i => nodes[i]), A = P[0], B = P[P.length - 1];
    if (P.length === 3) {
      const C = { x: A.x + B.x - P[1].x, y: A.y + B.y - P[1].y };
      const u1 = { x: A.x - P[1].x, y: A.y - P[1].y }, u2 = { x: B.x - P[1].x, y: B.y - P[1].y };
      const sin = Math.abs(u1.x * u2.y - u1.y * u2.x) / ((Math.hypot(u1.x, u1.y) * Math.hypot(u2.x, u2.y)) || 1);
      if (sin > 0.3) { mid = { x: (P[1].x + C.x) / 2, y: (P[1].y + C.y) / 2 }; cand.push([A, C], [C, B]); }
    } else if (P.length > 3) { mid = { x: P.reduce((s, p) => s + p.x, 0) / P.length, y: P.reduce((s, p) => s + p.y, 0) / P.length }; cand.push([A, B]); }
  }
  if (!cand.length) {
    // Anything else (one wall, two walls facing each other, walls apart): the box round all the walls, its open stretches closed.
    const xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // Too thin to stand in (one wall, or walls in a line): deeper on the side the cabinets are on, to 10 ft.
    const D = 120;
    if (x1 - x0 < 48 || y1 - y0 < 48) {
      const w = ws.slice().sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1))[0], g = wg(w);
      const s = typeof elevSide === 'function' ? elevSide(w) : 1, nx = g.n.x * s, ny = g.n.y * s, e0 = { x0, x1, y0, y1 };
      if (x1 - x0 < 48) { if (nx >= 0) x1 = Math.max(x1, x0 + D); else x0 = Math.min(x0, x1 - D); }
      if (y1 - y0 < 48) { if (ny >= 0) y1 = Math.max(y1, y0 + D); else y0 = Math.min(y0, y1 - D); }
      ext = { x0, x1, y0, y1, was: e0 };
    }
    mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    const c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    cand.push([c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]);
  }
  // Each side in 3" steps: the stretches with no wall along them and no joined room there get a wall.
  const segs = [];
  cand.forEach(([A, B]) => {
    const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 6) return;
    const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L; let nx = -uy, ny = ux;
    if (mid && ((A.x + B.x) / 2 - mid.x) * nx + ((A.y + B.y) / 2 - mid.y) * ny < 0) { nx = -nx; ny = -ny; }
    // Next to a wall a stretch runs on into it (reach), so the corner is closed; next to a joined room it stops short.
    const n = Math.max(1, Math.ceil(L / 3)), reach = T / 2 + 6; let run = null, runWall = false, last = -1;
    const flush = (endWall) => {
      if (run === null) return;
      const a = Math.max(0, run - (runWall ? reach : 0)), b = Math.min(L, last + (endWall ? reach : 0));
      if (b - a > 4) segs.push({ ax: A.x + ux * a, ay: A.y + uy * a, bx: A.x + ux * b, by: A.y + uy * b, nx, ny, T }); run = null;
    };
    let prevWall = true;
    for (let i = 0; i <= n; i++) {
      const t = i / n * L, x = A.x + ux * t, y = A.y + uy * t, wl = near(x, y), open = !wl && !inOther(x, y);
      if (open) { if (run === null) { run = t; runWall = prevWall; } last = t; } else flush(wl);
      prevWall = !open && wl;
    }
    flush(true);
  });
  return { segs, ext };
}
// Walk (or the walk file being made) with Close open sides on.
function walkWallsOn() { return (WALK.on || WALK.pending || (typeof WX === 'object' && WX.busy)) && WALK.autoWalls !== false; }
// The other rooms drawn round this one (a house), as boxes in this room's plan.
function walkOtherBoxes() {
  if (typeof HOUSE3 !== 'object' || !HOUSE3.M) return [];
  const M = HOUSE3.M[S.roomId]; if (!M) return [];
  const I = m2inv(M), out = [];
  Object.keys(HOUSE3.M).forEach(id => {
    if (id === S.roomId) return; const r = roomById(id), ws = r && (r.walls || []).filter(w => !w.hidden); if (!ws || !ws.length) return;
    const Mo = HOUSE3.M[id], P = ws.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]).map(([x, y]) => m2pt(I, m2pt(Mo, x, y).x, m2pt(Mo, x, y).y));
    out.push({ x0: Math.min(...P.map(p => p.x)), x1: Math.max(...P.map(p => p.x)), y0: Math.min(...P.map(p => p.y)), y1: Math.max(...P.map(p => p.y)) });
  });
  return out;
}
// Into v.root (the open room's plan): the walls along the open sides, in the wall look wm, and a ceiling over any area
// the room was made deeper by. Returns how many walls were added.
function walkAutoWalls(v, wm, ceilMat) {
  const { segs, ext } = walkOpenSides(S.walls, walkOtherBoxes());
  if (!segs.length) return 0;
  const vis = S.walls.filter(w => !w.hidden), cl = typeof roomCeiling === 'function' ? roomCeiling() : {};
  const H = Math.max(+cl.h || 0, ...vis.map(w => +w.height || 96));
  segs.forEach(s => {
    const L = Math.hypot(s.bx - s.ax, s.by - s.ay), T = s.T;
    // A hair thinner than the real walls, so where it runs into one their faces don't flicker against each other.
    const m = new THREE.Mesh(new THREE.BoxGeometry(L + T, H, T - 0.5), wm);
    m.position.set((s.ax + s.bx) / 2, H / 2, (s.ay + s.by) / 2);
    m.rotation.y = Math.atan2(-(s.by - s.ay), s.bx - s.ax);
    m.castShadow = m.receiveShadow = true;
    m.userData.wall = true; m.userData.autoWall = true; v.root.add(m);
  });
  if (ext && ceilMat) {
    const e = ext, w0 = e.was;
    [[e.x0, w0.x0, e.y0, e.y1], [w0.x1, e.x1, e.y0, e.y1], [w0.x0, w0.x1, e.y0, w0.y0], [w0.x0, w0.x1, w0.y1, e.y1]].forEach(([x0, x1, y0, y1]) => {
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), ceilMat);
      c.rotation.x = Math.PI / 2; c.position.set((x0 + x1) / 2, H, (y0 + y1) / 2); c.userData.noBounds = true; c.userData.wall = true; c.userData.autoWall = true; v.root.add(c);
    });
  }
  return segs.length;
}
