// 0.63.73: machining in the Wireframe look (Ayden 2026-11-25: "when in wireframe operations on the cabinet should show up
// as well, so i can see drawer holes, or shelf holes, or anything like that").
// Every hole, hinge cup, edge hole, dado, groove, pocket and tool path the cut list (and so the CNC file) has for a part is
// drawn in red where it lands on the cabinet: a hole as its circle on the face plus its bottom, a groove as its outline at
// the face and at its depth. The ops come straight from buildParts (or Mozaik's own parts), so it shows what will be cut.
// Look only: nothing in the build, cut list, CNC file or price changes.

const OPS3D = { col: 0xe01b24 };
const o3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], o3mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const o3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const o3norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Line segments for one part's ops in its own frame: x along its length, y across from its L1 edge, z through it
// (0 and T are its two faces). side(face) gives 0 or 1 for the face an op is cut from, null when it is not known.
// seg(p, q) takes two points in that frame.
function ops3dPart(ops, T, side, seg, opts = {}) {
  let n = 0;
  const circle = (c, ax, r) => {
    const a = o3norm(ax), h = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = o3norm(o3cross(a, h)), e2 = o3cross(a, e1), k = 16;
    for (let i = 0; i < k; i++) {
      const t0 = i / k * Math.PI * 2, t1 = (i + 1) / k * Math.PI * 2;
      seg(o3add(c, o3add(o3mul(e1, Math.cos(t0) * r), o3mul(e2, Math.sin(t0) * r))), o3add(c, o3add(o3mul(e1, Math.cos(t1) * r), o3mul(e2, Math.sin(t1) * r))));
    }
  };
  // A hole: its circle where it goes in, its bottom, and two lines down its sides.
  const hole = (E, dir, depth, r) => {
    const B = o3add(E, o3mul(dir, depth)); circle(E, dir, r); circle(B, dir, r);
    const h = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = o3mul(o3norm(o3cross(dir, h)), r);
    seg(o3add(E, e1), o3add(B, e1)); seg(o3add(E, o3mul(e1, -1)), o3add(B, o3mul(e1, -1))); n++;
  };
  const loop = (pts, z, closed) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; seg([a.x, a.y, z], [b.x, b.y, z]); } };
  const faceZ = (s, d) => s ? T - d : d;   // d in from the face the op is cut from
  ops.forEach(o => {
    if (o.type === 'hbore') {
      // Edge hole: into the edge it starts on, at its inset through the thickness.
      const e = opts.edgeTol || 0.02, L = opts.L, W = opts.W;
      const dir = o.x <= e ? [1, 0, 0] : o.x >= L - e ? [-1, 0, 0] : o.y <= e ? [0, 1, 0] : o.y >= W - e ? [0, -1, 0] : null; if (!dir) return;
      hole([o.x, o.y, o.inset], dir, o.depth, o.dia / 2); return;
    }
    if (o.type === 'notch') return;
    const s = side(o.face); if (s === null) return;
    const nz = s ? -1 : 1, z0 = faceZ(s, 0);
    if (o.type === 'bore') { hole([o.x, o.y, z0], [0, 0, nz], o.through ? T : Math.min(o.depth, T), o.dia / 2); return; }
    const dz = Math.min(o.through ? T : o.depth || 0, T), z1 = faceZ(s, dz);
    if (o.type === 'groove') {
      const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * o.width / 2, ny = dx / l * o.width / 2;
      const R = [{ x: o.x1 + nx, y: o.y1 + ny }, { x: o.x2 + nx, y: o.y2 + ny }, { x: o.x2 - nx, y: o.y2 - ny }, { x: o.x1 - nx, y: o.y1 - ny }];
      loop(R, z0, true); if (dz > 0) { loop(R, z1, true); R.forEach(p => seg([p.x, p.y, z0], [p.x, p.y, z1])); } n++; return;
    }
    if (o.type === 'path' && o.pts && o.pts.length > 1) { loop(o.pts, z0, !!o.closed); if (dz > 0 && (o.closed || o.pocket)) loop(o.pts, z1, true); n++; return; }
    if ((o.type === 'pocket' || o.type === 'rabbet' || o.type === 'cutout') && o.w > 0 && o.h > 0) {
      const R = [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
      loop(R, z0, true); if (o.type !== 'cutout' && o.depth > 0) loop(R, faceZ(s, Math.min(o.depth, T)), true); n++;
    }
  });
  return n;
}

// Where each cut part of a regular cabinet sits (the same placing the 2026-11-20 assembly check proved hole by hole).
// Frame: X right from the left outside face, Y back from the front edge of the sides, Z up from the floor.
// A placed part: o + u*x + v*y + n*z; f0 and f1 are the face names at z = 0 and z = T.
function ops3dPlace(c) {
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], nX = [-1, 0, 0], nY = [0, -1, 0], nZ = [0, 0, -1];
  const P = (pt, o, u, v, n, f0, f1, ex = {}) => ({ pt, o, u, v, n, f0, f1, ...ex });
  const b = buildParts(c), parts = b.parts.filter(q => q.cabId === c.id);
  const p = effParams(c), mt = cabMatT(cabSet(c, 'cabMatT')), cm = mat(mt.carcass) || S.materials[0], t = cm.thick;
  const bm = mat(mt.back) || cm, bt = bm.thick;
  const ffr = faceFrame(c), W = c.w, H = c.h, D = c.d - (ffr ? ffr.thick : 0), tk = hasToe(c) ? p.toeKickHeight : 0;
  const sh = onFeet(c, p) ? tk : 0, zIn0 = tk + t, zIn1 = H - t, backY = D - p.backInset - bt;
  const fronts = b.fronts || computeFronts(c, p), rails = caseRails(c, p, fronts, t), dParts = drawerPartitions(c, p, fronts, t, rails);
  const lay = interiorLayout(c, p, fronts), bp = blindPart(c, p, t), sl = hwPick(cabSet(c, 'slide'), 'slide');
  const pls = [], used = new Set(), put = pl => { pls.push(pl); used.add(pl.pt); return pl; };
  const plain = n => n.replace(/ \(finished inside\)$/, '');
  const sideT = n => (parts.find(q => plain(q.name) === n) || { T: t }).T, lt = sideT('Left side'), rt = sideT('Right side'), iW = W - lt - rt;
  const between = q => lt + (iW - q.L) / 2;
  const tOf = n => { const q = parts.find(z => plain(z.name).startsWith(n)); return q ? q.T - t : 0; };
  const dBot = tOf('Bottom'), dTop = parts.some(z => plain(z.name) === 'Top') ? tOf('Top') : tOf('Front stretcher'), dRear = parts.some(z => plain(z.name) === 'Rear stretcher') ? tOf('Rear stretcher') : tOf('Top');
  const endD = z => { if (Math.abs(z - zIn0) < 2e-3) return dBot; if (Math.abs(z - zIn1) < 2e-3) return dTop;
    const s = rails.stretchers.find(q => Math.abs(q.z - t / 2 - z) < 2e-3 || Math.abs(q.z + t / 2 - z) < 2e-3); if (s && s.pt) return (s.pt.T - t) / 2;
    const f = rails.shelves.find(q => Math.abs(q.z - t / 2 - z) < 2e-3 || Math.abs(q.z + t / 2 - z) < 2e-3); if (f) return tOf(`Fixed shelf ${f.row + 1}`) / 2; return 0; };
  const midZ = (z0, z1, L) => (z0 + endD(z0) + z1 - endD(z1)) / 2 - L / 2;
  parts.forEach(q => {
    const nm = plain(q.name);
    if (nm === 'Left side') put(P(q, [0, D - q.W, sh], Z, Y, X, 'outside', 'inside'));
    else if (nm === 'Right side') put(P(q, [W, D - q.W, sh], Z, Y, nX, 'outside', 'inside'));
    else if (nm === 'Bottom') put(P(q, [between(q), 0, zIn0 - t], X, Y, Z, 'outside', 'inside'));
    else if (nm === 'Top' || nm === 'Front stretcher') put(P(q, [between(q), 0, zIn1 + t - q.T], X, Y, Z, 'inside', 'outside'));
    else if (nm === 'Rear stretcher') { const ra = rearStretcherAt(p, D, backY, bt); put(P(q, [between(q), ra ? ra.y0 : backY - p.stretcherWidth, zIn1 + t - q.T], X, Y, Z, 'inside', 'outside')); }
    else if (/^Drawer stretcher/.test(nm)) { const k = rails.stretchers.find(s => s.pt === q) || rails.stretchers[(+(nm.match(/\d+$/) || [1])[0]) - 1] || rails.stretchers[0]; if (k) put(P(q, [between(q), 0, k.z - q.T / 2], X, Y, Z, ['bottom', 'inside'], 'top')); }
    else if (nm === 'Sink apron') put(P(q, [between(q), 0, H], X, nZ, Y, 'front', 'back'));
    else if (/^Fixed shelf \d+$/.test(nm) && q.jx !== undefined) put(P(q, [bp ? bp.o0 : between(q), 0, q.jx - q.T / 2], X, Y, Z, 'bottom', 'top'));
    // 0.63.74: the partitions and fixed shelves of an opening split inside (intsplit.js) say where they are.
    else if (q.inq && q.inq.x !== undefined) put(P(q, [q.inq.x, 0, q.inq.z0], Z, Y, X, 'left', 'right'));
    else if (q.inq) put(P(q, [q.inq.x0, 0, q.inq.z], X, Y, Z, 'bottom', 'top'));
    else if (/nailer$/.test(nm) && q.jz) put(P(q, [between(q), q.jy - t / 2, q.jz[1]], X, nZ, Y, 'front', 'back'));
    else if (nm === 'Back' && !angledCorner(c)) put(P(q, [lt + (iW - q.W) / 2, backY, zIn0 + dBot - (q.L - (zIn1 - zIn0 - dBot - dRear)) / 2], Z, X, Y, 'inside', 'outside'));
    else if (/^Blind corner inside panel/.test(nm) && bp) { const pcs = blindPieces(c, p, t, rails), d = /\(upper\)$/.test(nm) ? pcs[pcs.length - 1] : pcs[0]; if (d) put(P(q, [d.x, 0, midZ(d.z0, d.z1, q.L)], Z, Y, X, 'left', 'right')); }
    else if (/^Drawer partition/.test(nm)) { const k = +(nm.match(/(\d+)$/) || [0, 1])[1] - 1, d = dParts[k] || dParts[0]; if (d) put(P(q, [d.x, 0, midZ(d.z0, d.z1, q.L)], Z, Y, X, 'left', 'right')); }
    else if (nm === 'Vertical divider' && lay.divX !== null) put(P(q, [lay.divX - t / 2, 0, midZ(lay.zIn0, lay.zIn1, q.L)], Z, Y, X, 'left', 'right'));
  });
  // Fronts in the order buildParts makes them; drawer boxes follow their drawer front. They stand in front of the face frame.
  const fy = -(ffr ? ffr.thick : 0);
  const fq = parts.filter(q => !used.has(q)), frontsOrd = fronts.filter(f => ['door', 'drawer', 'false'].includes(f.type));
  let k = 0;
  for (const f of frontsOrd) {
    if (f.face) continue;
    const lbl = f.type === 'door' ? 'Door' : f.type === 'false' ? 'False front' : 'Drawer front';
    if (frontStyle(c, f).ds.source === 'buyout') continue;
    const isF = q => q && q.name.startsWith(lbl) && ['door', 'drawerFront', 'frame'].includes(q.kind);
    while (k < fq.length && !isF(fq[k])) k++;
    if (k >= fq.length) break;
    const first = fq[k];
    if (first.kind === 'door' || first.kind === 'drawerFront') {
      put(P(first, [f.x0, fy - first.T, f.z0], Z, X, Y, 'front', 'back', { front: f })); k++;
      while (isF(fq[k]) && fq[k].kind === 'frame') used.add(fq[k++]);
    } else {
      let n = 0;
      while (isF(fq[k]) && !(n && /stile \(left\)$/.test(fq[k].name))) {
        const q = fq[k++]; n++;
        if (/stile \(left\)$/.test(q.name)) put(P(q, [f.x0, fy - q.T, f.z0], Z, X, Y, 'front', 'back', { front: f }));
        else if (/stile \(right\)$/.test(q.name)) put(P(q, [f.x1, fy - q.T, f.z0], Z, nX, Y, 'front', 'back', { front: f }));
        else used.add(q);
      }
    }
    if (f.type === 'drawer' && sl && typeof drawerBoxAt === 'function') {
      const bx = drawerBoxAt(c, p, f); if (!bx) continue;
      const got = {}; ['Drawer side', 'Drawer box front', 'Drawer box back', 'Drawer bottom'].forEach(n => { const i = fq.findIndex((q, j) => j >= k && q.name === n && !used.has(q)); if (i >= 0) got[n] = fq[i]; });
      const sd = got['Drawer side']; if (!sd) continue;
      const st = sd.T, z = bx.z, ow = bx.x1 - bx.x0, y0 = D - bx.front;  // the box's front edge, back from the sides' front
      put(P(sd, [bx.x0, y0, z], Y, Z, X, 'outside', 'inside', { front: f, box: 1 }));
      pls.push(P(sd, [bx.x1, y0 + sd.L, z], nY, Z, nX, 'outside', 'inside', { front: f, box: 1 }));
      const fr = got['Drawer box front'], bk = got['Drawer box back'], bo = got['Drawer bottom'];
      const dove = (p.drawerBox || 'butt') === 'dovetail' && !bx.full && !DRAWER_BOX_TYPES.some(t2 => t2.v && t2.v === drawerMatT(cabSet(c, 'drawerMatT')).box), fx0 = dove ? bx.x0 : bx.x0 + st;
      if (fr) put(P(fr, [fx0, y0, z], X, Z, Y, 'front', 'inside', { front: f, box: 1 }));
      const bdT = bo ? bo.T : bx.bt;
      if (bk) put(P(bk, [fx0, y0 + sd.L - st, bx.full ? z : z + bx.rec + bdT], X, Z, Y, 'inside', 'back', { front: f, box: 1 }));
      if (bo) { const gd = (sd.ops.find(o => o.why === 'drawer bottom') || {}).depth || p.drawerBottomDado; put(P(bo, [bx.x0 + st - gd + (ow - 2 * st + 2 * gd - bo.W) / 2, y0 + st - gd, z + bx.rec], Y, X, Z, 'bottom', 'top', { front: f, box: 1 })); }
      // Face frame: spacers on the sides bring the runners out to the frame's opening.
      const sps = fq.filter((q, j) => j >= k && q.name === 'Drawer slide spacer' && !used.has(q));
      if (sps[0] && ffr) { const q = sps[0], zc = bx.z + (sl.cabHoles[0] || { z: 0 }).z / 25.4; used.add(q);
        pls.push(P(q, [t, 0, zc - q.W / 2], Y, Z, X, 'outside', 'inside')); pls.push(P(q, [W - t, 0, zc + q.W / 2], Y, nZ, nX, 'outside', 'inside')); }
    }
  }
  return { pls, D };
}

// Adds the ops of cabinet c to its 3D group (cabinetMeshes' frame: x right, y up, z out to the front, inches).
// layers: the big view's Show picks; fronts or drawer boxes turned off take their holes with them.
function ops3d(c, grp, layers) {
  const pos = [];
  try {
    if (c.moz && typeof isMoz === 'function' && isMoz(c)) ops3dMoz(c, pos);
    else if (!(c.made && typeof madeDef === 'function' && madeDef(c)) && (angledCorner(c) || (!hasCabShape(c) && !(cabTopShape(c) || {}).edges))) {
      const { pls, D } = ops3dPlace(c), open = (typeof openT !== 'undefined' && openT[c.id]) || 0;
      pls.forEach(pl => {
        if (pl.front && open > 0.01) return;   // a swung door or pulled drawer: its holes would float where it was
        const ly = layers || {}; if (pl.box ? ly.drawerBox === false : pl.front && ly.fronts === false) return;
        const has = (f, nm) => f === nm || (Array.isArray(f) && f.includes(nm));
        const at = q => { const w = o3add(o3add(o3add(pl.o, o3mul(pl.u, q[0])), o3mul(pl.v, q[1])), o3mul(pl.n, q[2])); pos.push(w[0], w[2], D - w[1]); };
        ops3dPart(pl.pt.ops || [], pl.pt.T, f => has(pl.f1, f) ? 1 : has(pl.f0, f) ? 0 : null, (a, b) => { at(a); at(b); }, { L: pl.pt.L, W: pl.pt.W, edgeTol: pl.pt.outline ? pl.pt.T + 0.02 : 0.02 });
      });
    }
  } catch (e) { console.warn('ops3d', e); }
  if (!pos.length) return 0;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  OPS3D.mat = OPS3D.mat || new THREE.LineBasicMaterial({ color: OPS3D.col });
  const ls = new THREE.LineSegments(g, OPS3D.mat); ls.userData.keepLine = true; ls.userData.layer = 'ops'; ls.userData.cabId = c.id; ls.renderOrder = 2;
  grp.add(ls); return pos.length / 6;
}

// Mozaik products: each part's ops in its own outline frame (mm, y up, top face at z = T), placed like mozMeshes places it.
function ops3dMoz(c, pos) {
  const r = mozRun(c); if (!r || mozFolded(r)) return;
  const D = c.d, v = new THREE.Vector3();
  r.parts.forEach((q, i) => {
    if (!(q.qty > 0) || q.outline.length < 3 || q.group === 'metal' || !q.ops.length || mozKerf(r, q, c.w * 25.4, D * 25.4)) return;
    const m0 = r.mats[i], T = m0 ? m0.thick * 25.4 : q.T, mtx = mozMtx(mozRot(q.ang, q.axes), q.pos, D);
    const at = a => { v.set(a[0], a[1], a[2]).applyMatrix4(mtx); pos.push(v.x, v.y, v.z); };
    // Mozaik's y runs up from the bottom edge and an edge hole is not one of its ops, so only the face matters here.
    ops3dPart(q.ops, T, f => f === 'top' ? 1 : f === 'bottom' ? 0 : null, (a, b) => { at(a); at(b); }, { L: q.L, W: q.W });
  });
}
