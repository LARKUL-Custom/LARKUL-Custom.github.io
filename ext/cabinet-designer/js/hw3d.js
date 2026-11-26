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

// The hinge cups and pull screws of one front, in the front's own group (cabinetMeshes' frame: the front's back face
// at z = D, its outside face at D + ft). Rides with the door or drawer as it opens.
function hw3dFront(c, p, f, ft, D, add) {
  const list = [], isDoor = f.type === 'door';
  const hg = isDoor && ((f.face && typeof cornerHingeHw === 'function' && cornerHingeHw(c, f)) || hwPick(cabSet(c, 'hinge'), 'hinge'));
  if (hg && hg.cupDiaMM) {
    const fh = f.z1 - f.z0, r = hwMM(hg.cupDiaMM) / 2, cupY = hwMM((+hg.cupEdgeMM || 0) + hg.cupDiaMM / 2), R = f.hinge === 'R';
    const cx = R ? f.x1 - cupY : f.x0 + cupY, toEdge = R ? 1 : -1;
    hingeHeights(p, fh, hg).forEach(hp => {
      const z = f.z0 + hp;
      list.push({ g: hwCyl(), m: hwM(cx, z, D - hwMM(0.6), r + hwMM(1.5), r + hwMM(1.5), hwMM(1.2)) });       // cup flange on the door
      list.push({ g: hwBox(), m: hwM(cx + toEdge * hwMM(6), z, D - hwMM(4), hwMM(16), hwMM(30), hwMM(8)) });   // knuckle the arm clips to
    });
  }
  const pp = pullPlacement(c, f);
  if (pp) {
    // On a drawer the screw comes through the drawer box front; the head sits on its inside face.
    let zb = D, dir = -1;
    if (f.type === 'drawer' && typeof drawerBoxAt === 'function') { const bx = drawerBoxAt(c, p, f); if (bx && bx.st) zb = bx.front - bx.st; }
    const hr = Math.max(hwMM(3.8), (pp.hw.holeDiaMM ? hwMM(pp.hw.holeDiaMM) : 0) * 0.9);
    pullHoles(pp, ft).forEach(h => list.push({ g: hwCyl(), m: hwM(f.x0 + h.y, f.z0 + h.x, zb + dir * hwMM(1), hr, hr, hwMM(2)) }));
  }
  const m = hwMerge(list, hwMat()); if (m) add(m, 'hardware');
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
  return JSON.stringify(c) + '|' + JSON.stringify(near) + '|' + sig;
}
function hw3dCab(c, grp) {
  if (typeof ops3dPlace !== 'function' || !(angledCorner(c) || (!hasCabShape(c) && !(cabTopShape(c) || {}).edges))) return;
  let key = null; try { key = hw3dKey(c); } catch (_) {}
  const hit = key && HW3C.get(key);
  if (hit) { hit.forEach(h => { const m = hwMesh(h.pos, h.nor, h.hole ? hwHoleMat() : hwMat()); if (h.hole) m.receiveShadow = false; grp.add(m); }); return; }
  const got = hw3dCabMake(c);
  if (key) { if (HW3C.size > 400) HW3C.clear(); HW3C.set(key, got); }
  got.forEach(h => { const m = hwMesh(h.pos, h.nor, h.hole ? hwHoleMat() : hwMat()); if (h.hole) m.receiveShadow = false; grp.add(m); });
}
function hw3dCabMake(c) {
  let P; try { P = ops3dPlace(c); } catch (e) { console.warn('hw3d', e); return []; }
  const { pls, D } = P, holes = [], metal = [], q = new THREE.Quaternion(), Zax = new THREE.Vector3(0, 0, 1);
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
      const C = at(z.x, z.y, z.s ? T : 0), sx = N.x, zFront = Math.max(C.z, D - hwMM(2));
      // Mounting plate flat on the side, centred on its holes; the arm on it runs forward to the door.
      metal.push({ g: hwBox(), m: hwM(C.x + sx * hwMM(1.5), C.y, C.z, hwMM(3), hwMM(42), hwMM(18)) });
      const a0 = C.z - hwMM(24), a1 = zFront;
      metal.push({ g: hwBox(), m: hwM(C.x + sx * hwMM(3 + 6), C.y, (a0 + a1) / 2, hwMM(12), hwMM(18), Math.max(hwMM(10), a1 - a0)) });
    });
  });
  const out = [], hb = hwBake(holes), mb = hwBake(metal);
  if (hb) out.push({ ...hb, hole: true }); if (mb) out.push(mb);
  return out;
}
