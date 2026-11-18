/* ---------- Cutout card: the 3D view printed with the cabinets cut out ---------- */
// The cut lines come from the 3D parts themselves: every face is projected onto the page, so a door's outline is
// exactly its projected edges (straight, sharp corners). One flat-color render of the same view only says which
// part is in front where two overlap (a countertop over the top of a door), and the part in front is cut away exactly.
// The page prints at actual size; the cut file (SVG, inches) lines up with it for a print-and-cut machine.

// Not cut and not in the way: pulls sit on the door, drawer boxes and glass are behind it, labels float.
const CO_SKIP = new Set(['pulls', 'glass', 'drawerBox', 'lights', 'labels', 'fasteners']);
const CO_PAGE = { land: [11, 8.5], port: [8.5, 11] };
const CO_DPI = 300;
const CO_SC = 16;   // Clipper works in whole numbers: 1/16 of a render pixel

function openCutout() {
  if (typeof roomViewer === 'undefined' || !roomViewer || !roomViewer.ok) return flash('Open the 3D view first, then make the cutout card from it');
  if (typeof ClipperLib === 'undefined') return flash('The cutout card needs vendor/clipper.js');
  ui.co = { doors: true, real: true, busy: true, res: null };
  renderCutout();
  setTimeout(makeCutout, 30);
}
function closeCutout() { ui.co = null; renderCutout(); }

// What each mesh is to the card: a label key (a front, a cabinet's case or a shape), '' for something that only
// gets in the way (walls, countertops, appliances), or null for something that is left out.
function coKeyOf(o) {
  if (!o.isMesh || o.isSprite) return null;
  for (let p = o; p; p = p.parent) if (!p.visible) return null;
  const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m0 || m0.colorWrite === false || (m0.transparent && m0.opacity < 0.05)) return null;
  let cabId = null, front = null, layer = o.userData.layer;
  for (let p = o; p; p = p.parent) {
    if (!layer && p.userData.layer) layer = p.userData.layer;
    if (!cabId && p.userData.cabId) cabId = p.userData.cabId;
    if (!cabId && p.userData.shapeId) cabId = 'shape:' + p.userData.shapeId;   // panels drawn as shapes (an island back) show the finish too
    if (!front && p.userData.coFront) front = p.userData.coFront;
  }
  if (CO_SKIP.has(layer)) return null;
  if (!cabId || layer === 'tops') return '';
  return front || 'cab:' + cabId;
}
// The top of a cabinet's case (the box top seen from above, like the top of a pantry) isn't a face anyone sees in the
// kitchen, so it stays on the card. Floating shelves and shapes keep their tops.
function coShelf(key) {
  if (!key.startsWith('cab:') || key.startsWith('cab:shape:')) return false;
  const c = typeof cab === 'function' && cab(key.slice(4)), l = c && S.library.find(x => x.id === c.libId);
  return !!(c && ((l && typeof libGroup === 'function' && libGroup(l) === 'shelf') || /shelf/i.test(c.name || '')));
}
const coNoTop = key => key.startsWith('cab:') && !key.startsWith('cab:shape:') && !coShelf(key);

// Every triangle of a mesh projected to render pixels (times CO_SC). noTop leaves out faces pointing up.
function coTris(o, cam, w, h, noTop) {
  const g = o.geometry, pos = g && g.attributes && g.attributes.position; if (!pos) return [];
  const n = pos.count, P = new Array(n), W = new Array(n), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); W[i] = v.clone();
    v.project(cam);
    P[i] = v.z < -1 || v.z > 1 ? null : { X: Math.round((v.x + 1) / 2 * w * CO_SC), Y: Math.round((1 - v.y) / 2 * h * CO_SC) };
  }
  const idx = g.index ? g.index.array : null, cnt = idx ? idx.length : n, out = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let y0 = Infinity, y1 = -Infinity; W.forEach(p => { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }); const midY = (y0 + y1) / 2;
  for (let t = 0; t + 2 < cnt; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
    const A = P[a], B = P[b], C = P[c]; if (!A || !B || !C) continue;
    const ar = (B.X - A.X) * (C.Y - A.Y) - (C.X - A.X) * (B.Y - A.Y); if (Math.abs(ar) < 4) continue;
    // A face lying flat in the upper half of its part is a top (the part's own winding can't be trusted: Mozaik parts are built every which way).
    if (noTop) { ab.subVectors(W[b], W[a]); ac.subVectors(W[c], W[a]); if (Math.abs(ab.cross(ac).normalize().y) > 0.9 && (W[a].y + W[b].y + W[c].y) / 3 > midY) continue; }
    out.push(ar > 0 ? [A, B, C] : [A, C, B]);   // all one way round, so overlapping faces add up instead of cancelling
  }
  return out;
}
const coClip = () => new ClipperLib.Clipper();
function coUnion(paths) {
  if (!paths.length) return [];
  const c = coClip(), out = new ClipperLib.Paths();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}
function coInter(a, b) {
  if (!a.length || !b.length) return [];
  const c = coClip(), out = new ClipperLib.Paths();
  c.AddPaths(a, ClipperLib.PolyType.ptSubject, true); c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}
function coDiff(a, b) {
  if (!a.length || !b.length) return a;
  const c = coClip(), out = new ClipperLib.Paths();
  c.AddPaths(a, ClipperLib.PolyType.ptSubject, true); c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  c.Execute(ClipperLib.ClipType.ctDifference, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}
function coOffset(paths, d) {
  if (!paths.length || !d) return paths;
  // Tiny back-and-forth spikes (where two outlines met a hair apart) are cleaned off first: a mitred offset turns them
  // into long points that bite a notch out of the corner when the shape is shrunk back.
  const o = new ClipperLib.ClipperOffset(8, 0.25), out = new ClipperLib.Paths();
  o.AddPaths(ClipperLib.Clipper.CleanPolygons(paths, CO_SC * 0.75), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon); o.Execute(out, d);
  return out;
}
const coArea = p => ClipperLib.Clipper.Area(p);
// Pieces as outer outlines; a piece with a hole in it (a ring) is reported so it can be left alone.
function coPieces(paths, minArea) {
  const outer = paths.filter(p => coArea(p) > 0), holes = paths.filter(p => coArea(p) < 0);
  return outer.filter(p => coArea(p) >= minArea).map(p => {
    const inner = holes.filter(hh => coArea(hh) < -minArea && ClipperLib.Clipper.PointInPolygon(hh[0], p) === 1);
    return { path: p, ring: inner.length > 0 };
  });
}

// Draws the view at the card's size: the picture, a flat-color picture of which part shows at each pixel, and every
// labelled part's projected outline.
function coRender(v, W, real) {
  // The card's picture is Realistic or the regular 3D look, whatever the 3D view is showing right now.
  const keep = ui.sel, look = [ui.render3d, ui.hidden3d]; ui.sel = null; ui.render3d = !!real; ui.hidden3d = false;
  // Cut lines come from the parts' triangles: plain square edges keep them straight and quick (no eased edges).
  BEVEL3.off = true; try { buildRoom3D(); } finally { BEVEL3.off = false; }
  const r = v.renderer, pr = r.getPixelRatio(), cw = v.host.clientWidth, ch = v.host.clientHeight, cam = v.cam;
  const mr = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); mr.setPixelRatio(1);
  // One shot = the normal picture, then the same view with every mesh in its own flat color.
  const shot = (w, h, off) => {
    if (off) cam.setViewOffset(off.fw, off.fh, off.x, off.y, w, h); else cam.clearViewOffset();
    r.setSize(w, h, false);
    const tags = [];   // no size tags or other floating labels on the card
    v.scene.traverse(o => { if ((o.isSprite || o.userData.layer === 'labels') && o.visible) { tags.push(o); o.visible = false; } });
    v.draw();
    const photo = document.createElement('canvas'); photo.width = w; photo.height = h;
    photo.getContext('2d').drawImage(r.domElement, 0, 0, w, h);
    tags.forEach(o => { o.visible = true; });
    const meshes = [], keys = [], saved = [], mats = [], bg = v.scene.background, env = v.scene.environment;
    let ids;
    try {
      v.scene.traverse(o => {
        if (o === v.scene) return;
        if (o.isMesh && !o.isSprite) {
          const k = coKeyOf(o); saved.push([o, o.material, o.visible]);
          if (k === null) { o.visible = false; return; }
          const n = meshes.length + 1, m0 = Array.isArray(o.material) ? o.material[0] : o.material;
          meshes.push(o); keys.push(k);
          const mm = new THREE.MeshBasicMaterial({ color: new THREE.Color((n & 255) / 255, ((n >> 8) & 255) / 255, 1), side: m0.side }); mats.push(mm); o.material = mm;
        } else if (o.isLine || o.isLineSegments || o.isSprite || o.isPoints) { saved.push([o, o.material, o.visible]); o.visible = false; }
      });
      v.scene.background = new THREE.Color(0x000000); v.scene.environment = null;
      mr.setSize(w, h, false); mr.render(v.scene, cam);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g = c2.getContext('2d'); g.drawImage(mr.domElement, 0, 0);
      const px = g.getImageData(0, 0, w, h).data;
      ids = new Int32Array(w * h);
      for (let i = 0, j = 0; j < ids.length; i += 4, j++) if (px[i + 2] > 200) { const n = px[i] + (px[i + 1] << 8); ids[j] = n <= meshes.length ? n : 0; }
    } finally {
      v.scene.background = bg; v.scene.environment = env;
      saved.forEach(([o, m, vis]) => { o.material = m; o.visible = vis; });
      mats.forEach(m => m.dispose());
    }
    // Outlines, while the camera still has this framing.
    v.scene.updateMatrixWorld(true);
    const tri = meshes.map((o, i) => keys[i] ? coTris(o, cam, w, h, coNoTop(keys[i])) : null);
    // Every mesh's own outline is projected now, while the camera has this framing; joined up only when needed.
    const full = meshes.map(o => { const t = coTris(o, cam, w, h, false); let f = null; return () => f || (f = coUnion(t)); });
    return { photo, ids, w, h, meshes, keys, tri, full };
  };
  try {
    r.setPixelRatio(1);
    // A small shot finds where the cabinets are; the big one is framed on them, so the card stays sharp.
    const w1 = 800, h1 = Math.round(w1 * ch / cw), A = shot(w1, h1);
    let x0 = w1, y0 = h1, x1 = -1, y1 = -1;
    for (let i = 0; i < A.ids.length; i++) if (A.ids[i] && A.keys[A.ids[i] - 1]) { const x = i % w1, y = (i - x) / w1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const m = Math.max(x1 - x0, y1 - y0) * 0.08;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w1, x1 + 1 + m); y1 = Math.min(h1, y1 + 1 + m);
    const k = W / Math.max(x1 - x0, y1 - y0);
    return shot(Math.round((x1 - x0) * k), Math.round((y1 - y0) * k), { fw: w1 * k, fh: h1 * k, x: x0 * k, y: y0 * k });
  } finally {
    cam.clearViewOffset(); mr.dispose(); if (mr.forceContextLoss) mr.forceContextLoss();
    r.setPixelRatio(pr); r.setSize(cw, ch, false); ui.sel = keep; [ui.render3d, ui.hidden3d] = look; buildRoom3D();
  }
}

// What shows of each labelled part: its outline, less every other part seen in front of it inside that outline.
function coVisible(R) {
  if (R.vis) return R.vis;
  const { w, h, ids, keys, tri, full } = R, parts = new Map(), shrink = -1.5 * CO_SC;
  // Check against the picture: a piece where this part mostly doesn't show (a shelf end behind a hood that the
  // outlines alone missed) is dropped.
  const shows = (path, holes, k) => {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    path.forEach(q => { bx0 = Math.min(bx0, q.X); by0 = Math.min(by0, q.Y); bx1 = Math.max(bx1, q.X); by1 = Math.max(by1, q.Y); });
    const X0 = Math.max(0, Math.floor(bx0 / CO_SC)), Y0 = Math.max(0, Math.floor(by0 / CO_SC)), X1 = Math.min(w, Math.ceil(bx1 / CO_SC) + 1), Y1 = Math.min(h, Math.ceil(by1 / CO_SC) + 1);
    if (X1 <= X0 || Y1 <= Y0) return false;
    const cv = document.createElement('canvas'); cv.width = X1 - X0; cv.height = Y1 - Y0;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.beginPath();
    [path, ...holes].forEach(p => p.forEach((q, j) => g[j ? 'lineTo' : 'moveTo'](q.X / CO_SC - X0, q.Y / CO_SC - Y0)));
    g.fill('evenodd');
    const a = g.getImageData(0, 0, cv.width, cv.height).data; let all = 0, mine = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      if (a[((y - Y0) * cv.width + (x - X0)) * 4 + 3] < 128) continue;
      all++; const id = ids[y * w + x] - 1; if (id >= 0 && keys[id] === k) mine++;
    }
    return all < 12 || mine >= all * 0.5;
  };
  const checked = (u, k) => {
    const outer = u.filter(p => coArea(p) > 0), holes = u.filter(p => coArea(p) < 0), keep = [];
    outer.forEach(p => { const hs = holes.filter(hh => ClipperLib.Clipper.PointInPolygon(hh[0], p) === 1); if (shows(p, hs, k)) keep.push(p, ...hs); });
    return keep;
  };
  // Counts, inside an outline kept 1.5 px in from its edge, how many picture pixels belong to each mesh.
  const tally = sil => {
    const core = coOffset(sil, shrink), cnt = new Map(); let n = 0;
    if (!core.length) return { cnt, n };
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    core.forEach(p => p.forEach(q => { bx0 = Math.min(bx0, q.X); by0 = Math.min(by0, q.Y); bx1 = Math.max(bx1, q.X); by1 = Math.max(by1, q.Y); }));
    const X0 = Math.max(0, Math.floor(bx0 / CO_SC)), Y0 = Math.max(0, Math.floor(by0 / CO_SC)), X1 = Math.min(w, Math.ceil(bx1 / CO_SC) + 1), Y1 = Math.min(h, Math.ceil(by1 / CO_SC) + 1);
    if (X1 <= X0 || Y1 <= Y0) return { cnt, n };
    const cv = document.createElement('canvas'); cv.width = X1 - X0; cv.height = Y1 - Y0;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.beginPath();
    core.forEach(p => p.forEach((q, j) => g[j ? 'lineTo' : 'moveTo'](q.X / CO_SC - X0, q.Y / CO_SC - Y0)));
    g.fill('nonzero');
    const a = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      if (a[((y - Y0) * cv.width + (x - X0)) * 4 + 3] < 128) continue;
      n++; const id = ids[y * w + x] - 1; if (id >= 0) cnt.set(id, (cnt.get(id) || 0) + 1);
    }
    return { cnt, n };
  };
  const byKey = new Map();
  keys.forEach((k, i) => { if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(i); });
  byKey.forEach((idxs, k) => {
    // Only the meshes of this part that really show count (a cabinet's far side, hidden behind everything, is left out,
    // so a fridge in front of that far side can't cut into the near side).
    const seen = idxs.filter(i => { const s = coUnion(tri[i]); if (!s.length) return false; const t = tally(s); const own = t.cnt.get(i) || 0; return t.n < 12 || own >= t.n * 0.05 || (own >= 20 && own >= t.n * 0.01); });
    const sil = coUnion(seen.flatMap(i => tri[i])); if (!sil.length) return;
    // Which other meshes show inside this part's outline: those are in front of it.
    const t = tally(sil), mine = new Set(idxs);
    // Fronts of the same cabinet sit side by side, never in front of each other (a 5-piece drawer front's frame can
    // poke a hair past its neighbour's edge); where they touch, the overlap check below settles it.
    const cid = k.startsWith('cab:') ? null : k.split(':')[0];
    const sibling = id => cid && keys[id] && !keys[id].startsWith('cab:') && keys[id].split(':')[0] === cid;
    const front = [...t.cnt].filter(([id, c]) => !mine.has(id) && keys[id] !== k && c >= 3 && !sibling(id)).map(([id]) => id);
    const out = checked(front.length ? coDiff(sil, coUnion(front.flatMap(id => full[id]()))) : sil, k);
    if (out.length) parts.set(k, out);
  });
  const vis = new Map();
  parts.forEach((ps, k) => { const keep = checked(coUnion(ps), k); if (keep.length) vis.set(k, keep); });
  // Where two parts' outlines still overlap, the one the picture shows there keeps the overlap.
  const box = ps => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; ps.forEach(p => p.forEach(q => { x0 = Math.min(x0, q.X); y0 = Math.min(y0, q.Y); x1 = Math.max(x1, q.X); y1 = Math.max(y1, q.Y); })); return [x0, y0, x1, y1]; };
  const ks = [...vis.keys()];
  const count = (ps, k) => {
    const [bx0, by0, bx1, by1] = box(ps), X0 = Math.max(0, Math.floor(bx0 / CO_SC)), Y0 = Math.max(0, Math.floor(by0 / CO_SC)), X1 = Math.min(w, Math.ceil(bx1 / CO_SC) + 1), Y1 = Math.min(h, Math.ceil(by1 / CO_SC) + 1);
    if (X1 <= X0 || Y1 <= Y0) return 0;
    const cv = document.createElement('canvas'); cv.width = X1 - X0; cv.height = Y1 - Y0;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.beginPath();
    ps.forEach(p => p.forEach((q, j) => g[j ? 'lineTo' : 'moveTo'](q.X / CO_SC - X0, q.Y / CO_SC - Y0)));
    g.fill('nonzero');
    const a = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (a[((y - Y0) * cv.width + (x - X0)) * 4 + 3] >= 128) { const id = ids[y * w + x] - 1; if (id >= 0 && keys[id] === k) n++; }
    return n;
  };
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const A = vis.get(ks[i]), B = vis.get(ks[j]); if (!A || !B) continue;
    const a = box(A), b = box(B); if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
    const o = coInter(A, B); if (!o.length || o.reduce((t, p) => t + Math.abs(coArea(p)), 0) < CO_SC * CO_SC * 4) continue;
    if (count(o, ks[i]) >= count(o, ks[j])) vis.set(ks[j], coDiff(B, o)); else vis.set(ks[i], coDiff(A, o));
  }
  return (R.vis = vis);
}

// The pieces to cut, in render pixels (times CO_SC). One hole per run: everything that shows, joined up. Keep doors:
// every front and every cabinet is its own hole, pulled in half a strip where it meets another so a thin strip of paper stays
// wherever two of them meet.
function coCuts(R, doors, px) {
  // Everything is kept inside the picture: a part running out of the frame (an island in the front of the view) is cut
  // off along the picture's edge, so no cut line runs into the margin or over the caption.
  const frame = [[{ X: 0, Y: 0 }, { X: R.w * CO_SC, Y: 0 }, { X: R.w * CO_SC, Y: R.h * CO_SC }, { X: 0, Y: R.h * CO_SC }]];
  const vis = new Map();
  coVisible(R).forEach((ps, k) => { const c = coInter(ps, frame); if (c.length) vis.set(k, c); });
  const cuts = coCutsIn(vis, doors, px);
  return cuts.flatMap(p => coInter([p], frame)).filter(p => p.length > 2 && Math.abs(coArea(p)) >= px.minA);
}
function coCutsIn(vis, doors, px) {
  // Drops anything thinner than 2r. Growing back can poke a sharp corner out past where it was, so it is kept inside.
  const open = (paths, r) => coInter(coOffset(coOffset(paths, -r), r), paths);
  // One hole per run: everything joined, with the hairline cracks between parts closed (grow, then shrink back).
  if (!doors) return coPieces(open(coOffset(coUnion(coOffset(coUnion([...vis.values()].flat()), px.web * 0.3)), -px.web * 0.3), px.thin), px.minA).map(p => p.path);
  // Long thin slivers (a case edge or an end panel seen almost edge on, under 4 mm wide on the card) are hard to cut and
  // read as stray strips, so they stay on the paper, also where they hang off a bigger piece. Floating shelves are thin
  // by nature and are always cut.
  const groups = new Map(), thin = [];
  // A part that is wide enough somewhere keeps its tapering ends (a corner of a hood peeking out under a shelf) down
  // to the narrowest a knife can follow; only whole parts that are thin everywhere are slivers.
  vis.forEach((paths, k) => { const p = coShelf(k) ? paths : open(paths, px.sliver).length ? open(paths, px.thin) : []; if (p.length) groups.set(k, p); else thin.push([k, paths]); });
  const area = ps => ps.reduce((a, q) => a + Math.abs(coArea(q)), 0);
  // Doors seen almost edge on beside their own cabinet's side (a tall cabinet seen from its end) join that side, so the
  // cabinet is one clean shape with no paper strip down it. Other slivers stay on the paper.
  thin.forEach(([k, paths]) => {
    if (k.startsWith('cab:')) return;
    const side = 'cab:' + k.split(':')[0], g = groups.get(side); if (!g) return;
    const reach = px.sliver * 1.5, near = coOffset(paths, reach);
    if (area(g) - area(coDiff(g, near)) < 1) return;
    groups.set(side, coOffset(coUnion(coOffset(coUnion(g.concat(paths)), reach)), -reach));
  });
  // A part split by a thin strip of something else (a tall cabinet's side and the edge of its doors, with the case edge
  // between them) is closed up into one shape.
  // What the closing adds never takes ground another part shows on (a hood's inside corner where a shelf end sits).
  groups.forEach((g, k) => {
    const closed = coOffset(coUnion(coOffset(g, px.sliver)), -px.sliver), added = coDiff(closed, g);
    if (!added.length) return groups.set(k, closed);
    const others = [...vis].filter(([o]) => o !== k).flatMap(([, ps]) => ps);
    groups.set(k, coUnion(g.concat(others.length ? coDiff(added, coUnion(others)) : added)));
  });
  // Shelves that run into each other (two shelves meeting in a corner) are one piece.
  for (let again = true; again;) {
    again = false;
    const sh = [...groups.keys()].filter(coShelf);
    for (let i = 0; i < sh.length && !again; i++) {
      const near = coOffset(groups.get(sh[i]), px.web * 1.5);
      for (let j = 0; j < sh.length; j++) {
        if (i === j) continue;
        const g = groups.get(sh[j]); if (area(g) - area(coDiff(g, near)) < 1) continue;
        groups.set(sh[i], coUnion(groups.get(sh[i]).concat(g)));
        // fill the seam between them: grow the pair, then shrink it back
        groups.set(sh[i], coOffset(coUnion(coOffset(groups.get(sh[i]), px.web)), -px.web));
        groups.delete(sh[j]); again = true; break;
      }
    }
  }
  // Pieces only give up paper where they meet another piece (half the strip each), so outside edges stay exactly on
  // the edge of the door, drawer or shelf.
  const keys = [...groups.keys()], out = [];
  keys.forEach(k => {
    // A shelf and what it runs into (a hood, a cabinet) share one line instead of a strip of paper; the shelf gives way.
    const others = keys.filter(o => o !== k && !coShelf(o)).flatMap(o => groups.get(o));
    const own = !others.length ? groups.get(k) : coShelf(k) ? coDiff(groups.get(k), coUnion(others)) : coDiff(groups.get(k), coOffset(coUnion(others), px.web / 2));
    coPieces(open(own, px.thin), px.minA).forEach(p => { if (!p.ring) out.push(p.path); });
  });
  return out;
}

// Lays the page out at 300 dpi and makes the cut file to match.
function coPage(R, polys, doors) {
  const port = R.h > R.w * 1.05, [pw, ph] = port ? CO_PAGE.port : CO_PAGE.land;
  const maxW = pw - 1, maxH = ph - 1.9, iw = Math.min(maxW, maxH * R.w / R.h), ih = iw * R.h / R.w;
  const ox = (pw - iw) / 2, oy = 1.25 + (maxH - ih) / 2, s = iw / R.w / CO_SC;   // inches per path unit
  const cv = document.createElement('canvas'); cv.width = Math.round(pw * CO_DPI); cv.height = Math.round(ph * CO_DPI);
  const g = cv.getContext('2d'), P = v => v * CO_DPI;
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.imageSmoothingQuality = 'high'; g.drawImage(R.photo, P(ox), P(oy), P(iw), P(ih));
  const path = p => { g.beginPath(); p.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](P(ox + q.X * s), P(oy + q.Y * s))); g.closePath(); };
  g.fillStyle = '#fff'; polys.forEach(p => { path(p); g.fill(); });
  g.strokeStyle = '#141414'; g.lineWidth = 3; g.lineJoin = 'miter'; g.miterLimit = 6; polys.forEach(p => { path(p); g.stroke(); });
  g.lineWidth = 3; g.strokeRect(P(ox), P(oy), P(iw), P(ih));
  const job = (S.job && S.job.name) || 'Job', room = (curRoom() || {}).name || '';
  g.fillStyle = '#141414'; g.font = '600 44px Helvetica, Arial, sans-serif'; g.fillText('LARKUL Custom · Cutout card', P(ox), P(oy) - 80);
  g.fillStyle = '#6e6e6e'; g.font = '30px Helvetica, Arial, sans-serif'; g.fillText(job + (room ? ' · ' + room : ''), P(ox), P(oy) - 30);
  g.fillStyle = '#5a5a5a'; g.font = '32px Helvetica, Arial, sans-serif';
  g.fillText(doors ? 'Cut out the white areas along the black line. Leave the thin strips between doors. Print at 100%.' : 'Cut out the white areas along the black line. Print at 100% (actual size).', P(ox), P(oy + ih) + 60);
  const f = n => n.toFixed(4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}in" height="${ph}in" viewBox="0 0 ${pw} ${ph}"><g fill="none" stroke="#ff0000" stroke-width="0.005">`
    + polys.map(p => `<polygon points="${p.map(q => f(ox + q.X * s) + ',' + f(oy + q.Y * s)).join(' ')}"/>`).join('') + '</g></svg>';
  return { canvas: cv, url: cv.toDataURL('image/png'), svg, pw, ph, port, holes: polys.length };
}

function makeCutout() {
  const co = ui.co; if (!co) return;
  co.busy = true; co.err = ''; renderCutout();
  setTimeout(() => {
    try {
      const R = co.R || (co.R = coRender(roomViewer, 2400, co.real));
      if (!R || !R.keys.some(Boolean)) throw new Error('No cabinets in this view. Turn the 3D view so the cabinets show, then try again.');
      const port = R.h > R.w * 1.05, iw = Math.min((port ? 7.5 : 10), ((port ? 11 : 8.5) - 1.9) * R.w / R.h);
      const mm = R.w / iw / 25.4 * CO_SC;   // path units per millimetre on the printed card
      const px = { web: 1.0 * mm, thin: 1.25 * mm, sliver: 2 * mm, minA: (3 * mm) ** 2 };   // strips 1 mm, pieces at least 2.5 mm wide, slivers under 4 mm stay
      co.res = coPage(R, coCuts(R, co.doors, px), co.doors);
    } catch (e) { console.error(e); co.err = e.message || String(e); co.res = null; }
    co.busy = false; renderCutout();
  }, 20);
}

function renderCutout() {
  const el = $('#cutoutdlg'); if (!el) return;
  const co = ui.co;
  if (!co) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const r = co.res;
  el.innerHTML = `<div class="qe co-dlg" role="dialog" aria-modal="true" aria-labelledby="co-title">
    <div class="qe-head"><b id="co-title">${icon('print')}Cutout card</b><span class="muted">this 3D view, cabinets cut out</span><button class="btn sm qe-x" data-act="co-close" aria-label="Close">${icon('close')}</button></div>
    <div class="co-bar"><div class="seg" role="group" aria-label="How to cut"><button data-act="co-doors" data-id="0" aria-pressed="${!co.doors}">One hole per run</button><button data-act="co-doors" data-id="1" aria-pressed="${!!co.doors}">Keep doors</button></div>
      <div class="seg" role="group" aria-label="Picture"><button data-act="co-real" data-id="1" aria-pressed="${!!co.real}">Realistic</button><button data-act="co-real" data-id="0" aria-pressed="${!co.real}">Regular 3D</button></div>
      <span class="note">${co.doors ? 'Each door and drawer is its own hole, with a thin strip left between them.' : 'Each run of cabinets is one hole.'}</span></div>
    <div class="co-body">${co.err ? `<div class="warnbox">${esc(co.err)}</div>` : ''}${co.busy ? `<div class="co-wait muted">Drawing the card…</div>` : r ? `<img class="co-prev${r.port ? ' port' : ''}" src="${r.url}" alt="Cutout card preview">` : ''}</div>
    <div class="qe-foot"><span class="note">${r ? `${r.holes} piece${r.holes === 1 ? '' : 's'} to cut · ${r.port ? 'portrait' : 'landscape'} letter` : ''}</span>
      <button class="btn" data-act="co-svg"${r ? '' : ' disabled'} title="Cut lines only, same page size, for a Silhouette or Cricut print-and-cut">${icon('download')}Cut file</button>
      <button class="btn" data-act="co-png"${r ? '' : ' disabled'}>${icon('download')}Save picture</button>
      <button class="btn primary" data-act="co-print"${r ? '' : ' disabled'}>${icon('print')}Print</button></div></div>`;
}

function coName(ext) {
  const clean = t => String(t || '').replace(/[^\w -]/g, '').trim();
  return `${clean(S.job.name) || 'job'} ${clean((curRoom() || {}).name) || 'room'} cutout card${ext}`;
}
function coPrint() {
  const r = ui.co && ui.co.res; if (!r) return;
  let sheet = $('#cutoutsheet'); if (!sheet) { sheet = document.createElement('div'); sheet.id = 'cutoutsheet'; document.body.appendChild(sheet); }
  sheet.innerHTML = `<style>@page{size:${r.pw}in ${r.ph}in;margin:0}</style><img src="${r.url}" style="width:${r.pw}in;height:${r.ph}in;display:block" alt="">`;
  document.body.classList.add('printing-cutout');
  const img = sheet.querySelector('img');
  const go = () => setTimeout(() => { window.print(); document.body.classList.remove('printing-cutout'); }, 50);
  if (img.complete) go(); else img.onload = go;
}

function cutoutAct(a, id) {
  const co = ui.co;
  switch (a) {
    case 'co-open': openCutout(); return true;
    case 'co-close': closeCutout(); return true;
    case 'co-doors': if (co) { co.doors = id === '1'; makeCutout(); } return true;
    case 'co-real': if (co && co.real !== (id === '1')) { co.real = id === '1'; co.R = null; makeCutout(); } return true;
    case 'co-print': coPrint(); return true;
    case 'co-png': if (co && co.res) co.res.canvas.toBlob(b => saveFile(b, coName('.png'), 'Cabinet Designer')); return true;
    case 'co-svg': if (co && co.res) saveFile(new Blob([co.res.svg], { type: 'image/svg+xml' }), coName(' cut.svg'), 'Cabinet Designer'); return true;
  }
  return false;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="co-"]');
  if (b && cutoutAct(b.dataset.act, b.dataset.id)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (e.target.id === 'cutoutdlg') closeCutout();
}, true);
document.addEventListener('keydown', e => { if (ui.co && e.key === 'Escape') { e.stopImmediatePropagation(); closeCutout(); } }, true);
