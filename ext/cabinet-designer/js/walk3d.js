// Walk: a first-person tour of the room in the 3D view, at eye height (5'6").
// Keys W A S D or the arrows walk (Shift walks faster), dragging looks around, a click or tap on a cabinet opens
// or closes its doors and drawers, Esc stops. On a tablet a small stick at the bottom left walks.
// Walls, cabinets, tops, appliances and shapes all block the way; doorways in walls are open.
'use strict';
const WALK = { on: false, eye: 66, r: 10, speed: 48, fast: 110 };

function walkToggle() { if (WALK.on) walkStop(); else walkStart(); }

function walkStart() {
  if (ui.viewMode !== '3d') { setView('3d'); requestAnimationFrame(() => walkStart()); return; }
  ensureRoomViewer(); const v = roomViewer; if (!v || !v.ok || WALK.on) return;
  if (ui.sel) select(null);
  // The tour is in the Realistic look; it goes back to the plain look after if Walk turned it on.
  WALK.lookWas = { render: !!ui.render3d, hidden: !!ui.hidden3d };
  if (!ui.render3d || ui.hidden3d) { ui.render3d = true; ui.hidden3d = false; renderRoom(); }
  WALK.v = v; WALK.saved = v.getView(); WALK.fov = v.persp.fov;
  v.cam = v.persp; v.controls.object = v.persp; v.controls.enabled = false;
  v.persp.fov = 62; v.persp.updateProjectionMatrix();
  WALK.on = true; v.walk = true; WALK.keys = {}; WALK.stick = null; WALK.solids = null;
  walkPlace(v);
  walkUI(v, true);
  walkCam(v); v.requestRender(); walkLoop();
  renderRoomWalkBtn();
}

function walkStop() {
  if (!WALK.on) return;
  const v = WALK.v; WALK.on = false; v.walk = false; WALK.keys = {}; WALK.stick = null;
  if (WALK.raf) cancelAnimationFrame(WALK.raf); WALK.raf = 0;
  walkUI(v, false);
  v.persp.fov = WALK.fov || 40; v.persp.updateProjectionMatrix();
  v.controls.enabled = true; v.setView(WALK.saved);
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
  if (pts.length) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); cx = (Math.min(...xs) + Math.max(...xs)) / 2; cz = (Math.min(...ys) + Math.max(...ys)) / 2; }
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
}

/* ---------- What blocks the way ---------- */
// Every solid mesh from knee to head height, kept as its own box and placement so turned walls and cabinets
// block exactly where they stand (not a big square around them).
function walkSolids(v) {
  const out = [], wb = new THREE.Box3(); v.root.updateMatrixWorld(true);
  v.root.traverse(o => {
    if (!o.isMesh || o.isSprite || o.userData.noBounds || o.userData.hlEdge || !walkSolid(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox; if (!b || b.isEmpty()) return;
    wb.copy(b).applyMatrix4(o.matrixWorld);
    if (wb.max.y < 6 || wb.min.y > WALK.eye + 6) return;
    out.push({ box: b.clone(), m: o.matrixWorld.clone(), inv: o.matrixWorld.clone().invert(), x0: wb.min.x, x1: wb.max.x, y0: wb.min.y, y1: wb.max.y, z0: wb.min.z, z1: wb.max.z });
  });
  WALK.solids = out; WALK.first = v.root.children[0]; WALK.count = v.root.children.length; WALK.at = performance.now();
}
// A mesh you can bump into: shown (walls hidden by the cutaway still count), not a light, not see-through helpers.
function walkSolid(o) {
  const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m0 || m0.visible === false || m0.colorWrite === false || !o.geometry) return false;
  for (let p = o; p; p = p.parent) { if (p.userData.layer === 'lights') return false; if (p.visible === false && !p.userData.cut) return false; }
  return true;
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
      if ((Q.x - x) ** 2 + (Q.y - y) ** 2 + (Q.z - z) ** 2 < r * r) return true;
    }
  }
  return false;
}
// Moves by dx,dz, sliding along whatever is in the way. Someone already touching something (a door swung
// into them) can always step out.
function walkMove(dx, dz) {
  if (!dx && !dz) return false;
  const x = WALK.x, z = WALK.z, stuck = walkHits(x, z);
  const ok = (nx, nz) => stuck || !walkHits(nx, nz);
  if (ok(x + dx, z + dz)) { WALK.x += dx; WALK.z += dz; return true; }
  if (dx && ok(x + dx, z)) { WALK.x += dx; return true; }
  if (dz && ok(x, z + dz)) { WALK.z += dz; return true; }
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
    if (rebuilt || (typeof openAnim !== 'undefined' && openAnim && now - WALK.at > 150)) walkSolids(v);
    const k = WALK.keys, fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), turn = (k.ArrowLeft || k.KeyQ ? 1 : 0) - (k.ArrowRight || k.KeyE ? 1 : 0);
    let f = fwd, s = side;
    if (WALK.stick) { f += -WALK.stick.y; s += WALK.stick.x; }
    const sp = (k.ShiftLeft || k.ShiftRight ? WALK.fast : WALK.speed) * dt, n = Math.hypot(f, s), go = n > 0.05;
    if (turn) WALK.yaw += turn * 1.6 * dt;
    if (go) {
      const m = Math.min(1, n), fx = -Math.sin(WALK.yaw), fz = -Math.cos(WALK.yaw);
      const dx = (fx * f - fz * s) / n * m * sp, dz = (fz * f + fx * s) / n * m * sp;
      walkMove(dx, dz);
    }
    if (go || turn || rebuilt) { walkCam(v); v.requestRender(); }
    if (go || turn || (typeof openAnim !== 'undefined' && openAnim)) WALK.raf = requestAnimationFrame(step);
  };
  WALK.raf = requestAnimationFrame(step);
}

// Keys while walking go to the walk only (so W does not start drawing walls and F does not change the view).
window.addEventListener('keydown', e => {
  if (!WALK.on) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (e.key === 'Escape') { walkStop(); return; }
  WALK.keys[e.code] = true; walkLoop();
}, true);
window.addEventListener('keyup', e => { if (WALK.on) { delete WALK.keys[e.code]; } }, true);
window.addEventListener('blur', () => { WALK.keys = {}; WALK.stick = null; });

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
    + `<button class="btn sm" data-walk="stop">${icon('close')}Stop walking</button></div>`
    + (coarse ? '<div class="walkstick"><i></i></div>' : '');
  v.host.parentElement.appendChild(box); WALK.ui = box;
  WALK.hintT = setTimeout(() => { const h = box.querySelector('.walkhint'); if (h) h.classList.add('gone'); }, 6000);
  box.querySelector('[data-walk=stop]').addEventListener('click', e => { e.stopPropagation(); walkStop(); });

  // Dragging looks; a short tap or click on a cabinet opens or closes it.
  const drags = new Map();
  const down = e => {
    if (e.target !== el) return;
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const move = e => {
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

// Opens or closes the cabinet under the pointer when it is within reach of the room (12').
function walkTap(v, cx, cy) {
  const r = v.renderer.domElement.getBoundingClientRect();
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), v.cam);
  rc.far = 144;
  const hit = rc.intersectObjects(v.root.children, true).find(h => h.object.isMesh && !h.object.isSprite && h.object.visible && walkSolid(h.object));
  const id = hit && hit.object.userData.cabId, c = id && cab(id);
  if (c && openable(c)) { setOpen([c.id]); walkLoop(); }
}
