// 0.64.8: hardware you can see in 3D (Ayden 2026-11-26: "cant see hinges, it would be nice to see them, and the screws
// for handles on the opposite side of them, also the extra adjustable shelf holes").
// - Hinges: the cup (with its knuckle) on the back of every door, at the heights and edge distance the cups are drilled
//   at (hingeHeights in build.js, the hinge's cupEdgeMM / cupDiaMM), riding with the door as it swings; the mounting
//   plate and the hinge arm on the cabinet side, centred on the plate holes the CNC drills there.
// - Pull screws: a screw head on the back of each front at every pull hole (pullHoles), inside the drawer box's front
//   on a drawer, where the screw comes through.
// - Shelf holes: every shelf pin hole the cut list drills in the sides, dividers and partitions, as a dark hole.
// All of it comes from the same drilling as the cut list and the CNC file, so what shows is what gets drilled.
// Look only: nothing in the build, cut list, CNC file or price changes. Layer "hardware" (Show box) turns it off.
// Cheap for Walk: one merged mesh per front and one per cabinet, no shadows cast, nothing in the bounds.
const HW3D = { metal: '#b4b9be', hole: '#16120e', sig: null };
const hwMM = v => v / 25.4;

// One mesh from many small pieces: each { g: geometry, m: Matrix4 } baked into one position + normal list.
function hwBake(list) {
  if (!list.length) return null;
  const gs = list.map(({ g, m }) => { const q = g.index ? g.toNonIndexed() : g.clone(); q.applyMatrix4(m); return q; });
  const n = gs.reduce((a, q) => a + q.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let k = 0;
  gs.forEach(q => { pos.set(q.attributes.position.array, k * 3); nor.set(q.attributes.normal.array, k * 3); k += q.attributes.position.count; q.dispose(); });
  return { pos, nor };
}
function hwMerge(list, material) { const b = hwBake(list); return b ? hwMesh(b.pos, b.nor, material) : null; }
function hwMesh(pos, nor, material) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.noBounds = true; mesh.userData.hw = true; mesh.userData.layer = 'hardware';
  return mesh;
}
const hwGeo = {};
const hwCyl = () => hwGeo.cyl || (hwGeo.cyl = new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2)); // axis along z, r 1, 1 long
const hwBox = () => hwGeo.box || (hwGeo.box = new THREE.BoxGeometry(1, 1, 1));
const hwDisc = () => hwGeo.disc || (hwGeo.disc = new THREE.CircleGeometry(1, 10));
const hwMat = () => (R3 ? metal3 : flat3)(HW3D.metal);
const hwHoleMat = () => hwHoleMat.m || (hwHoleMat.m = new THREE.MeshBasicMaterial({ color: HW3D.hole, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const hwM = (x, y, z, sx, sy, sz, q) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
// Draw it here? Not while the cutout card builds its cut lines, and not when the Show box has it off.
const hw3dOn = opts => !!(opts && opts.layers) && opts.layers.hardware !== false && !(typeof BEVEL3 !== 'undefined' && BEVEL3.off);

// 0.64.24 (Ayden 2026-11-26: "open all these and get them to work in the realistic drawings"): Blum's own SketchUp
// models (tools/blum-models.py, packed in models/blum-*.cdb) in place of the block shapes: the CLIP top hinge's cup on
// the door and its arm on the plate, the cruciform plate, TANDEM 563H runners and the T51.1901 locking device. Each
// piece is drawn in a frame that matches the drilling (the comment in tools/blum-models.py says which); a right-hand
// piece is the left-hand one mirrored. Until a model has loaded (or if it can't), the block shapes draw as before.
const HWM = { cup: 'std:Blum Hinge Cup', arm: 'std:Blum Hinge Arm', plate: 'std:Blum Plate', lock: 'std:Blum Lock' };
const HWM_CUPX = 0.9604;   // the cup's centre off the side's face in Blum's drawing (71B3750 is the inset hinge)
const hwRunKey = (inch, part) => 'std:Blum 563H ' + [15, 18, 21].reduce((a, b) => Math.abs(b - inch) < Math.abs(a - inch) ? b : a) + ' ' + part;
const hwRunLen = key => +key.match(/563H (\d+)/)[1];   // the runner length the model is drawn at, inches
// The model's pieces by colour, as plain geometries in its own frame, or null while it loads.
function hwModel(key) {
  if (hwModel[key]) return hwModel[key];
  if (typeof modelLoad !== 'function' || typeof modelReady !== 'function') return null;
  modelLoad(key); if (!modelReady(key)) return null;
  return hwModel[key] = modelGeo[key].mats.map(m => {
    const raw = new Float32Array(m.i.length * 3);
    for (let n = 0; n < m.i.length; n++) { const j = m.i[n] * 3; raw[n * 3] = m.p[j]; raw[n * 3 + 1] = m.p[j + 1]; raw[n * 3 + 2] = m.p[j + 2]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(raw, 3)); g.setAttribute('normal', new THREE.BufferAttribute(creaseNormals(raw), 3));
    return { g, kind: /^#ff9/i.test(m.c) ? 'orange' : /^#(80|79)/i.test(m.c) ? 'grey' : 'metal' };
  });
}
// The hinge arm with its front bent onto the real cup: Blum's inset hinge has an 18 mm crank; an overlay door's cup
// sits d inches nearer the side, so the arm's front (from its bend on) moves over by d.
function hwArm(d) {
  const base = hwModel(HWM.arm); if (!base) return null;
  const k = 'arm|' + d.toFixed(2); if (hwModel[k]) return hwModel[k];
  return hwModel[k] = base.map(({ g, kind }) => {
    const q = g.clone(), a = q.attributes.position.array; delete q.userData.flip;
    for (let j = 0; j < a.length; j += 3) { const t = Math.min(1, Math.max(0, (a[j + 2] - 0.45) / 0.6)); a[j] += d * t * t * (3 - 2 * t); }
    q.setAttribute('normal', new THREE.BufferAttribute(creaseNormals(a), 3));
    return { g: q, kind };
  });
}
const hwModelsReady = () => [HWM.cup, HWM.arm, HWM.plate, HWM.lock].every(k => !!hwModel(k));
// Pieces of one model placed at origin o, its X along ax (+-1 across the cabinet), Y up, Z out (zs -1 turns it round,
// zScale stretches it front to back).
function hwPut(lists, parts, o, ax, zs = 1, zScale = 1) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ax, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, zs * zScale)).setPosition(o[0], o[1], o[2]);
  // Mirrored, each triangle is wound the other way round, so it's turned back (its front would face in, and shade dark).
  parts.forEach(({ g, kind }) => lists[kind].push({ g: ax * zs < 0 ? hwFlip(g) : g, m }));
}
function hwFlip(g) {
  if (g.userData.flip) return g.userData.flip;
  const q = g.clone();
  ['position', 'normal'].forEach(k => { const a = q.attributes[k].array; for (let j = 0; j < a.length; j += 9) for (let c = 0; c < 3; c++) { const t = a[j + 3 + c]; a[j + 3 + c] = a[j + 6 + c]; a[j + 6 + c] = t; } });
  return g.userData.flip = q;
}
const hwLists = () => ({ metal: [], grey: [], orange: [] });
const hwMatM = () => hwMatM.m || (hwMatM.m = new THREE.MeshStandardMaterial({ color: new THREE.Color(HW3D.metal), roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide }));
const hwMatG = () => hwMatG.m || (hwMatG.m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6f7276'), roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }));
const hwMatO = () => hwMatO.m || (hwMatO.m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e07a1f'), roughness: 0.5, metalness: 0, side: THREE.DoubleSide }));
const hwMatOf = kind => kind === 'orange' ? hwMatO() : kind === 'grey' ? hwMatG() : hwMatM();
// One merged mesh per colour.
function hwMergeAll(lists, put) { for (const k in lists) { const m = hwMerge(lists[k], hwMatOf(k)); if (m) put(m); } }

// The hinges, pull screws and drawer guides of one front. add puts a piece in the front's own group (cabinetMeshes'
// frame: the front's back face at z = D, its outside face at D + ft), so it rides with the door or drawer; fixed puts
// one in the cabinet (the arm and the guide's cabinet member stay put).
// 0.64.21 (Ayden 2026-11-26: "the hinges arent connected and dont really look like our blum hinges"): a Blum CLIP top
// as one piece. On the door: the 35 mm cup with its two dowel ears (where cupExtra drills them) and the hinge body over
// it. On the cabinet: the arm, from behind the mounting plate forward to the door, at the plate's height off the side.
// A link joins the arm to the hinge body and stretches as the door swings (hwFollow), so it never comes apart.
function hw3dFront(c, p, f, ft, D, add, fixed) {
  const list = [], isDoor = f.type === 'door', stat = [];
  const hg = isDoor && ((f.face && typeof cornerHingeHw === 'function' && cornerHingeHw(c, f)) || hwPick(cabSet(c, 'hinge'), 'hinge'));
  const real = hwModelsReady(), L = real ? hwLists() : null, LS = real ? hwLists() : null;
  if (hg && hg.cupDiaMM) {
    const fh = f.z1 - f.z0, r = hwMM(hg.cupDiaMM) / 2, cupY = hwMM((+hg.cupEdgeMM || 0) + hg.cupDiaMM / 2), R = f.hinge === 'R';
    const e = R ? -1 : 1, cx = R ? f.x1 - cupY : f.x0 + cupY;   // e: from the door's hinge edge in toward the cabinet
    // The arm sits on the plate on the cabinet side the door hangs on (an overlay door's edge is at the side's outside).
    const t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick, W = c.w;
    const onSide = !f.face && !faceFrame(c) && !(c.pocket === 'on') && (R ? Math.abs(f.x1 - W) < 1 : Math.abs(f.x0) < 1);
    const sideIn = R ? W - t : t, armX = sideIn + e * hwMM(9 + 5.5);
    const plY = hwMM(((hg.plateHoles || [])[0] || { y: 37 }).y), sideFront = c.d - ffThick(c);
    const ears = (hg.cupExtra || []).length ? hg.cupExtra : [{ dx: -22.5, dy: 9.5 }, { dx: 22.5, dy: 9.5 }];
    hingeHeights(p, fh, hg).forEach(hp => {
      if (real) {
        // Blum's hinge: the cup in its hole on the door; the arm clipped on the plate, its front bent onto the cup.
        const y = f.z0 + hp, cupOff = e * (cx - sideIn);
        hwPut(L, hwModel(HWM.cup), [cx, y, D], e);
        if (!onSide) return;
        hwPut(LS, hwArm(cupOff - HWM_CUPX), [sideIn, y, sideFront - plY], e);
        const lk = new THREE.Mesh(hwBox(), hwMat());
        Object.assign(lk.userData, { hw: true, layer: 'hardware', noBounds: true, hwLink: { A: [sideIn + e * (cupOff + hwMM(4)), y, D - hwMM(6)], K: [cx + e * hwMM(4), y, D - hwMM(5)], w: hwMM(9), h: hwMM(12) } });
        lk.castShadow = false; hwLinkSet(lk, 0, null); add(lk, 'hardware');
        return;
      }
      const y = f.z0 + hp, bx0 = cx - e * hwMM(10), bx1 = onSide ? armX + e * hwMM(6) : cx + e * hwMM(22);
      list.push({ g: hwCyl(), m: hwM(cx, y, D - hwMM(0.8), r + hwMM(1), r + hwMM(1), hwMM(1.6)) });          // cup rim
      ears.forEach(q => list.push({ g: hwCyl(), m: hwM(cx + e * hwMM(q.dy), y + hwMM(q.dx), D - hwMM(0.8), hwMM(7), hwMM(7), hwMM(1.6)) }));
      list.push({ g: hwBox(), m: hwM(cx + e * hwMM(4.75), y, D - hwMM(0.8), hwMM(14), hwMM(45), hwMM(1.6)) });   // cup wings to the dowels
      list.push({ g: hwBox(), m: hwM((bx0 + bx1) / 2, y, D - hwMM(6), Math.abs(bx1 - bx0), hwMM(17), hwMM(11)) });          // hinge body
      if (!onSide) return;
      const a1 = D - hwMM(11), a0 = sideFront - plY - hwMM(30);
      stat.push({ g: hwBox(), m: hwM(armX, y, (a0 + a1) / 2, hwMM(11), hwMM(17), a1 - a0) });                                // arm
      stat.push({ g: hwBox(), m: hwM(armX, y + hwMM(5), a0 + hwMM(6), hwMM(13), hwMM(4), hwMM(12)) });                      // clip lever
      // The link: from the arm's front end to the hinge body, stretched each frame as the door swings.
      const lk = new THREE.Mesh(hwBox(), hwMat());
      Object.assign(lk.userData, { hw: true, layer: 'hardware', noBounds: true, hwLink: { A: [armX, y, D - hwMM(22)], K: [armX, y, D - hwMM(5)], w: hwMM(9), h: hwMM(13) } });
      lk.castShadow = false; hwLinkSet(lk, 0, null); add(lk, 'hardware');
    });
  }
  const pp = pullPlacement(c, f);
  let bx = null;
  if (f.type === 'drawer' && typeof drawerBoxAt === 'function') bx = drawerBoxAt(c, p, f);
  if (pp) {
    // On a drawer the screw comes through the drawer box front; the head sits on its inside face.
    const zb = bx && bx.st ? bx.front - bx.st : D;
    const hr = Math.max(hwMM(3.8), (pp.hw.holeDiaMM ? hwMM(pp.hw.holeDiaMM) : 0) * 0.9);
    pullHoles(pp, ft).forEach(h => list.push({ g: hwCyl(), m: hwM(f.x0 + h.y, f.z0 + h.x, zb - hwMM(1), hr, hr, hwMM(2)) }));
  }
  // 0.64.21 (Ayden 2026-11-26: "add drawer guides, like our blum tandem 563s"): each drawer's guides, a pair of Blum
  // TANDEM 563H at the length the cut list picks (drawerBoxAt: runner length = the box's length), at the height the
  // runner holes are drilled (the box sits bottomClearMM above the runner's bottom). The cabinet member is screwed to
  // the side, the drawer member clips under the box and comes out with it, the middle member comes half way, and the
  // T51.1901 locking device sits under the front of the box.
  const sl = bx && hwPick(cabSet(c, 'slide'), 'slide');
  if (sl && /tandem|563|undermount|optima|movento/i.test(sl.name || '')) {
    const ob = bx.z - hwMM(+sl.bottomClearMM || 14), runL = sl.runnerMM && sl.runnerMM[bx.d] ? hwMM(sl.runnerMM[bx.d]) : bx.d - hwMM(10);
    const gap = hwMM(+sl.widthDeductMM || 10) / 2, mid = [];
    const rk = real && /tandem|563/i.test(sl.name || '') && hwRunKey(runL, 'Cabinet'), rc = rk && hwModel(rk), rd = rk && hwModel(hwRunKey(runL, 'Drawer'));
    if (rc && rd) {
      // Blum's 563H: the cabinet member on the side, the drawer member under the drawer bottom (it comes out with the
      // drawer), stretched a little to the runner length the cut list picks; the T51.1901 under the front of the bottom.
      const zs = runL / hwRunLen(rk), yb = bx.z + (bx.rec || hwMM(13)), zf = bx.front;
      [[bx.x0 - gap, 1], [bx.x1 + gap, -1]].forEach(([xf, e]) => {
        hwPut(LS, rc, [xf, yb, zf], e, 1, zs);
        hwPut(L, rd, [xf, yb, zf], e, 1, zs);
        hwPut(L, hwModel(HWM.lock), [xf + e * hwMM(52), yb, zf - (bx.st || hwMM(16))], e);
      });
    } else
    [[bx.x0 - gap, 1], [bx.x1 + gap, -1]].forEach(([xf, e]) => {
      const z0 = bx.front - hwMM(3) - runL, z1 = bx.front - hwMM(3), zc = (z0 + z1) / 2;
      stat.push({ g: hwBox(), m: hwM(xf + e * hwMM(1), ob + hwMM(21), zc, hwMM(2), hwMM(42), runL) });                  // cabinet member's web on the side
      stat.push({ g: hwBox(), m: hwM(xf + e * hwMM(8), ob + hwMM(4.5), zc, hwMM(14), hwMM(9), runL) });                 // its channel
      mid.push({ g: hwBox(), m: hwM(xf + e * hwMM(8.5), ob + hwMM(10.5), zc, hwMM(12), hwMM(3), runL - hwMM(8)) });     // middle member
      list.push({ g: hwBox(), m: hwM(xf + e * hwMM(13), ob + hwMM(13), bx.front - bx.d / 2, hwMM(14), hwMM(2), bx.d - hwMM(12)) }); // drawer member
      list.push({ g: hwBox(), m: hwM(xf + e * hwMM(30), ob + hwMM(11), bx.front - hwMM(26), hwMM(36), hwMM(6), hwMM(40)) });          // T51.1901 lock
    });
    const mm = hwMerge(mid, hwMat());
    if (mm) { const g = new THREE.Group(); g.userData.hwHalf = true; g.add(mm); add(g, 'hardware'); }
  }
  const m = hwMerge(list, hwMat()); if (m) add(m, 'hardware');
  const sm = hwMerge(stat, hwMat()); if (sm && fixed) fixed(sm);
  if (real) { hwMergeAll(L, o => add(o, 'hardware')); if (fixed) hwMergeAll(LS, fixed); }
}
// A hinge link from the arm (A, in the cabinet) to the hinge body (K, on the door): the door turns th about its pivot
// P (x, z), so A is turned back by th into the door's frame. Runs in the walk file too (copied in).
function hwLinkSet(o, th, P) {
  const L = o.userData.hwLink, A = new THREE.Vector3(L.A[0], L.A[1], L.A[2]), K = new THREE.Vector3(L.K[0], L.K[1], L.K[2]);
  if (P && th) { A.x -= P[0]; A.z -= P[1]; A.applyAxisAngle(new THREE.Vector3(0, 1, 0), -th); A.x += P[0]; A.z += P[1]; }
  const d = K.clone().sub(A), len = Math.max(d.length(), 1e-3);
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
  o.scale.set(L.w, L.h, len);
}
// After a door or drawer moves: stretch its hinge links, bring its guides' middle members half way.
function hwFollow(o) {
  const op = o.userData.open; if (!op) return;
  if (op.kind === 'door') { const P = o.userData.hwP; if (!P) return; o.traverse(k => { if (k.userData.hwLink) hwLinkSet(k, o.rotation.y, P); }); }
  else if (op.kind === 'drawer') o.children.forEach(k => { if (k.userData.hwHalf) k.position.z = -o.position.z / 2; });
}

// The hinge plates and arms, and the shelf pin holes, from the cut list's own drilling (ops3dPlace places every part
// the way the assembly check proved hole by hole). grp is the cabinet's group (x right, y up, z out to the front).
// Placing every part costs about as much as building the cabinet again, so each cabinet's result is kept until it, a
// cabinet beside it, its room's walls or settings, or any library changes (one key per 3D build, cleared after it).
const HW3C = new Map();
function hw3dKey(c) {
  const r = curRoom() || {};
  if (!HW3D.sig) { HW3D.sig = {}; queueMicrotask(() => { HW3D.sig = null; }); }
  const sig = HW3D.sig[r.id] || (HW3D.sig[r.id] = JSON.stringify([S.job, S.materials, S.matTemplates, S.doorStyles, S.doorTemplates, S.panels, S.hardware, S.edgebands, S.partTemplates, S.faceFrames, S.finishes, r.settings, r.walls, r.id]));
  const near = (S.cabinets || []).filter(k => k !== c && Math.abs((k.x || 0) - (c.x || 0)) < (k.w + c.w + k.d + c.d) && Math.abs((k.y || 0) - (c.y || 0)) < (k.w + c.w + k.d + c.d));
  return JSON.stringify(c) + '|' + JSON.stringify(near) + '|' + sig + '|' + !!hwModel(HWM.plate);
}
function hw3dCab(c, grp) {
  if (typeof ops3dPlace !== 'function' || !(angledCorner(c) || (!hasCabShape(c) && !(cabTopShape(c) || {}).edges))) return;
  let key = null; try { key = hw3dKey(c); } catch (_) {}
  const hit = key && HW3C.get(key);
  if (hit) { hit.forEach(h => { const m = hwMesh(h.pos, h.nor, h.hole ? hwHoleMat() : h.real ? hwMatM() : hwMat()); if (h.hole) m.receiveShadow = false; grp.add(m); }); return; }
  const got = hw3dCabMake(c);
  if (key) { if (HW3C.size > 400) HW3C.clear(); HW3C.set(key, got); }
  got.forEach(h => { const m = hwMesh(h.pos, h.nor, h.hole ? hwHoleMat() : h.real ? hwMatM() : hwMat()); if (h.hole) m.receiveShadow = false; grp.add(m); });
}
function hw3dCabMake(c) {
  let P; try { P = ops3dPlace(c); } catch (e) { console.warn('hw3d', e); return []; }
  const { pls, D } = P, holes = [], metal = [], real = [], q = new THREE.Quaternion(), Zax = new THREE.Vector3(0, 0, 1);
  const has = (f, nm) => f === nm || (Array.isArray(f) && f.includes(nm));
  pls.forEach(pl => {
    if (pl.front || pl.box) return;
    const ops = (pl.pt.ops || []).filter(o => o.type === 'bore' && (o.why === 'shelf pin' || o.why === 'hinge plate'));
    if (!ops.length) return;
    const T = pl.pt.T;
    // A point (x, y, z) on the part into the cabinet group's frame, and a direction the same way.
    const at = (x, y, z) => { const w = o3add(o3add(o3add(pl.o, o3mul(pl.u, x)), o3mul(pl.v, y)), o3mul(pl.n, z)); return new THREE.Vector3(w[0], w[2], D - w[1]); };
    const dirOf = s => { const d = o3mul(pl.n, s); return new THREE.Vector3(d[0], d[2], -d[1]).normalize(); };
    const sideOf = face => has(pl.f1, face) ? 1 : has(pl.f0, face) ? 0 : null;
    const plates = [];
    ops.forEach(o => {
      const s = sideOf(o.face); if (s === null) return;
      const N = dirOf(s ? 1 : -1), C = at(o.x, o.y, s ? T : 0);
      if (o.why === 'shelf pin') { q.setFromUnitVectors(Zax, N); holes.push({ g: hwDisc(), m: hwM(C.x + N.x * 0.01, C.y + N.y * 0.01, C.z + N.z * 0.01, o.dia / 2, o.dia / 2, 1, q) }); return; }
      // Plate holes of one hinge sit within a few inches of each other up the side, at the same depth.
      const pk = plates.find(z => z.s === s && Math.abs(z.y - o.y) < hwMM(6) && Math.abs(z.x - o.x) < hwMM(60));
      if (pk) { pk.xs.push(o.x); pk.x = pk.xs.reduce((a, b) => a + b, 0) / pk.xs.length; } else plates.push({ s, x: o.x, y: o.y, xs: [o.x], N });
    });
    plates.forEach(z => {
      const N = z.N; if (Math.abs(N.x) < 0.9) return;   // plates go on sides and partitions (faces across the cabinet)
      const C = at(z.x, z.y, z.s ? T : 0), sx = N.x;
      const pm = hwModel(HWM.plate);
      if (pm) { pm.forEach(({ g }) => real.push({ g: sx < 0 ? hwFlip(g) : g, m: new THREE.Matrix4().makeBasis(new THREE.Vector3(Math.sign(sx), 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)).setPosition(C.x, C.y, C.z) })); return; }
      // Blum's cruciform plate: screw ears flat on the side over its two holes, the block the arm clips onto.
      metal.push({ g: hwBox(), m: hwM(C.x + sx * hwMM(1.5), C.y, C.z, hwMM(3), hwMM(50), hwMM(13)) });
      metal.push({ g: hwBox(), m: hwM(C.x + sx * hwMM(4.5), C.y, C.z - hwMM(4), hwMM(9), hwMM(15), hwMM(46)) });
    });
  });
  const out = [], hb = hwBake(holes), mb = hwBake(metal), rb = hwBake(real);
  if (hb) out.push({ ...hb, hole: true }); if (mb) out.push(mb); if (rb) out.push({ ...rb, real: true });
  return out;
}
