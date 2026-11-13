/* ---------- Cutout card: the 3D view printed with the cabinets cut out ---------- */
// The view is drawn twice from the same camera: once as it looks, once with every cabinet front and case in its own flat color.
// The flat picture tells exactly where each cabinet is, and its outlines are straightened into the cut lines.
// The page prints at actual size; the cut file (SVG, inches) lines up with it for a print-and-cut machine.

const CO_SKIP = new Set(['tops', 'glass', 'drawerBox', 'lights', 'labels', 'fasteners']);
const CO_PAGE = { land: [11, 8.5], port: [8.5, 11] };
const CO_DPI = 300;

function openCutout() {
  if (typeof roomViewer === 'undefined' || !roomViewer || !roomViewer.ok) return flash('Open the 3D view first, then make the cutout card from it');
  ui.co = { doors: true, busy: true, res: null };
  renderCutout();
  setTimeout(makeCutout, 30);
}
function closeCutout() { ui.co = null; renderCutout(); }

// Draws the room twice at the same size: the picture, and a label for each pixel (0 = not cut).
function coRender(v, W) {
  const keep = ui.sel; ui.sel = null; buildRoom3D();
  const r = v.renderer, pr = r.getPixelRatio(), cw = v.host.clientWidth, ch = v.host.clientHeight, cam = v.cam;
  const keys = [''], keyOf = new Map();
  // Flat colors: every front its own label, the rest of a cabinet one label per cabinet.
  const labelOf = o => {
    let cabId = null, front = null;
    for (let p = o; p; p = p.parent) {
      if (!cabId && p.userData.cabId) cabId = p.userData.cabId;
      if (!cabId && p.userData.shapeId) cabId = 'shape:' + p.userData.shapeId;   // panels drawn as shapes (an island back) show the finish too
      if (!front && p.userData.coFront) front = p.userData.coFront;
    }
    if (!cabId || CO_SKIP.has(o.userData.layer)) return 0;
    const k = front || 'cab:' + cabId;
    if (!keyOf.has(k)) { keyOf.set(k, keys.length); keys.push(k); }
    return keyOf.get(k);
  };
  const mr = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); mr.setPixelRatio(1);
  // One shot = the normal picture, then the same view in flat label colors.
  const shot = (w, h, off) => {
    if (off) cam.setViewOffset(off.fw, off.fh, off.x, off.y, w, h); else cam.clearViewOffset();
    r.setSize(w, h, false);
    const tags = [];   // no size tags or other floating labels on the card
    v.scene.traverse(o => { if ((o.isSprite || o.userData.layer === 'labels') && o.visible) { tags.push(o); o.visible = false; } });
    v.draw();
    const photo = document.createElement('canvas'); photo.width = w; photo.height = h;
    photo.getContext('2d').drawImage(r.domElement, 0, 0, w, h);
    tags.forEach(o => { o.visible = true; });
    const saved = [], mats = {}, bg = v.scene.background, env = v.scene.environment;
    let lab;
    try {
      v.scene.traverse(o => {
        if (o === v.scene) return;
        if (o.isMesh) {
          const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
          saved.push([o, o.material, o.visible]);
          // Same faces as the photo: a ceiling seen from above is culled there, so it must not block here either.
          if (!m0 || m0.colorWrite === false || (m0.transparent && m0.opacity < 0.05)) { o.visible = false; return; }
          const n = labelOf(o), side = m0.side, mk = n + ':' + side;
          o.material = mats[mk] || (mats[mk] = new THREE.MeshBasicMaterial({ color: n ? new THREE.Color((n & 255) / 255, ((n >> 8) & 255) / 255, 1) : 0x000000, side }));
        } else if (o.isLine || o.isLineSegments || o.isSprite || o.isPoints) { saved.push([o, o.material, o.visible]); o.visible = false; }
      });
      v.scene.background = new THREE.Color(0x000000); v.scene.environment = null;
      mr.setSize(w, h, false); mr.render(v.scene, cam);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g = c2.getContext('2d'); g.drawImage(mr.domElement, 0, 0);
      const px = g.getImageData(0, 0, w, h).data;
      lab = new Int32Array(w * h);
      for (let i = 0, j = 0; j < lab.length; i += 4, j++) if (px[i + 2] > 200) { const n = px[i] + (px[i + 1] << 8); lab[j] = n < keys.length ? n : 0; }
    } finally {
      v.scene.background = bg; v.scene.environment = env;
      saved.forEach(([o, m, vis]) => { o.material = m; o.visible = vis; });
      Object.values(mats).forEach(m => m.dispose());
    }
    return { photo, lab, w, h, keys };
  };
  try {
    r.setPixelRatio(1);
    // A small shot finds where the cabinets are; the big one is framed on them, so the card stays sharp.
    const w1 = 800, h1 = Math.round(w1 * ch / cw), A = shot(w1, h1);
    let x0 = w1, y0 = h1, x1 = -1, y1 = -1;
    for (let i = 0; i < A.lab.length; i++) if (A.lab[i]) { const x = i % w1, y = (i - x) / w1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return A;
    const m = Math.max(x1 - x0, y1 - y0) * 0.08;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w1, x1 + 1 + m); y1 = Math.min(h1, y1 + 1 + m);
    const k = W / Math.max(x1 - x0, y1 - y0), fw = w1 * k, fh = h1 * k;
    return shot(Math.round((x1 - x0) * k), Math.round((y1 - y0) * k), { fw, fh, x: x0 * k, y: y0 * k });
  } finally {
    cam.clearViewOffset(); mr.dispose(); if (mr.forceContextLoss) mr.forceContextLoss();
    r.setPixelRatio(pr); r.setSize(cw, ch, false); ui.sel = keep; buildRoom3D();
  }
}

// Drops parts thinner than 2r (a top edge, a cabinet side seen edge on): they would close a ring around countertop
// or be too thin to cut. Shrinks every piece r pixels, then grows what is left back inside its own label.
function coOpen(lab, w, h, r) {
  const n = lab.length, d = new Float32Array(n), BIG = 1e9;
  const nb = (i, j) => j >= 0 && j < n && Math.abs((j % w) - (i % w)) <= 1;
  for (let i = 0; i < n; i++) d[i] = lab[i] ? BIG : 0;
  const pass = (from, to, step, offs) => {
    for (let i = from; i !== to; i += step) {
      if (!lab[i]) continue;
      let m = d[i];
      for (const o of offs) { const j = i + o; if (!nb(i, j)) { m = Math.min(m, 1); continue; } m = Math.min(m, lab[j] === lab[i] ? d[j] + 1 : 1); }
      d[i] = m;
    }
  };
  pass(0, n, 1, [-1, -w - 1, -w, -w + 1]);
  pass(n - 1, -1, -1, [1, w + 1, w, w - 1]);
  const out = new Int32Array(n); let edge = [];
  for (let i = 0; i < n; i++) if (d[i] > r) { out[i] = lab[i]; edge.push(i); }
  for (let s = 0; s < r + 1 && edge.length; s++) {
    const next = [];
    for (const i of edge) { const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w, x > 0 ? i - w - 1 : -1, x < w - 1 ? i - w + 1 : -1, x > 0 ? i + w - 1 : -1, x < w - 1 ? i + w + 1 : -1]) if (j >= 0 && j < n && !out[j] && lab[j] === lab[i]) { out[j] = lab[i]; next.push(j); } }
    edge = next;
  }
  return out;
}

// Grows labels a few pixels at a time into a set of pixels (breadth first, 4 neighbours).
function coGrow(lab, w, h, from, into, steps) {
  let edge = [];
  for (let i = 0; i < lab.length; i++) if (from(lab[i])) edge.push(i);
  for (let s = 0; s < steps && edge.length; s++) {
    const next = [];
    for (const i of edge) {
      const x = i % w, l = lab[i];
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) if (j >= 0 && j < lab.length && into(lab[j])) { lab[j] = l; next.push(j); }
    }
    edge = next;
  }
}

// Labels after the cut rules: plain = everything one hole; doors = each front its own hole, with a paper web between.
function coRegions(R, doors, webPx, absorb, thin) {
  const { w, h, keys } = R;
  if (!doors) return { lab: Int32Array.from(R.open), web: new Uint8Array(R.lab.length) };
  const lab = Int32Array.from(R.lab);
  const isFront = n => n > 0 && !keys[n].startsWith('cab:'), isCase = n => n > 0 && keys[n].startsWith('cab:');
  // The thin case edges and gaps between fronts go with the nearest front, so the web lands in the gap.
  coGrow(lab, w, h, isFront, isCase, Math.max(3, Math.round(w / 300)));
  // Case parts that wrap around fronts go with the fronts entirely: cut on their own they would take the doors with them.
  if (absorb && absorb.size) coGrow(lab, w, h, isFront, n => absorb.has(n), w + h);
  // Web: pixels near a border between two different labels.
  const web = new Uint8Array(lab.length); let edge = [];
  for (let i = 0; i < lab.length; i++) {
    const l = lab[i]; if (!l) continue;
    const x = i % w;
    if ((x < w - 1 && lab[i + 1] && lab[i + 1] !== l) || (i + w < lab.length && lab[i + w] && lab[i + w] !== l)) { web[i] = 1; edge.push(i); }
  }
  for (let s = 0; s < webPx && edge.length; s++) {
    const next = [];
    for (const i of edge) { const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < lab.length && lab[j] && !web[j]) { web[j] = 1; next.push(j); } }
    edge = next;
  }
  for (let i = 0; i < lab.length; i++) if (web[i]) lab[i] = 0;
  return { lab: thin ? coOpen(lab, w, h, thin) : lab, web };
}

// Outer outline of every piece to cut, as straight-line polygons (pixel corners).
function coPolys(lab, w, h, minArea, eps, tri = 0, minW = 0) {
  const seen = new Uint8Array(lab.length), polys = [];
  for (let start = 0; start < lab.length; start++) {
    const l = lab[start]; if (!l || seen[start]) continue;
    // The piece: 8-connected pixels with the same label.
    const comp = [start]; seen[start] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (!seen[j] && lab[j] === l) { seen[j] = 1; comp.push(j); }
      }
    }
    if (comp.length < minArea) continue;
    const set = new Set(comp), inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
    // Walk the pixel edges with the piece on the right; start is its first pixel in scan order.
    const x0 = start % w, y0 = (start - x0) / w, D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const ahead = (x, y, d) => d === 0 ? [inside(x, y - 1), inside(x, y)] : d === 1 ? [inside(x, y), inside(x - 1, y)] : d === 2 ? [inside(x - 1, y), inside(x - 1, y - 1)] : [inside(x - 1, y - 1), inside(x, y - 1)];
    let x = x0 + 1, y = y0, d = 0; const pts = [[x0, y0]];
    for (let guard = 0; guard < 4 * comp.length + 8; guard++) {
      if (x === x0 && y === y0) break;
      const [L, Rt] = ahead(x, y, d), nd = L ? (d + 3) % 4 : Rt ? d : (d + 1) % 4;
      if (nd !== d) pts.push([x, y]);
      d = nd; x += D[d][0]; y += D[d][1];
    }
    const q = coTrim(coSimplify(pts, eps), tri); if (q.length < 3) continue;
    q.label = l;
    // Slivers (a cabinet side seen edge on) are too thin to cut: they stay paper.
    if (minW) { let A = 0, L = 0; q.forEach((a, i) => { const b = q[(i + 1) % q.length]; A += a[0] * b[1] - b[0] * a[1]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }); if (Math.abs(A) / L < minW) continue; }
    polys.push(q);
  }
  return polys;
}
function coInside(p, [x, y]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
// Takes off small bumps and notches (a pull or a countertop edge peeking in): drops any corner whose triangle is under tri px².
function coTrim(p, tri) {
  if (!tri) return p; p = p.slice();
  const area = i => { const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]; return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; };
  for (let n = 0; n < 10000 && p.length > 3; n++) {
    let im = -1, am = tri; for (let i = 0; i < p.length; i++) { const A = area(i); if (A < am) { am = A; im = i; } }
    if (im < 0) break; p.splice(im, 1);
  }
  return p;
}
// Douglas-Peucker on a closed outline: stair steps along a slanted edge become one straight line.
function coSimplify(pts, eps) {
  if (pts.length < 4) return pts;
  let far = 0, best = -1; pts.forEach((p, i) => { const dd = (p[0] - pts[0][0]) ** 2 + (p[1] - pts[0][1]) ** 2; if (dd > best) { best = dd; far = i; } });
  const dp = (a) => {
    if (a.length < 3) return a;
    const [ax, ay] = a[0], [bx, by] = a[a.length - 1], L = Math.hypot(bx - ax, by - ay) || 1;
    let im = 0, dm = 0;
    for (let i = 1; i < a.length - 1; i++) { const dd = Math.abs((bx - ax) * (ay - a[i][1]) - (ax - a[i][0]) * (by - ay)) / L; if (dd > dm) { dm = dd; im = i; } }
    if (dm <= eps) return [a[0], a[a.length - 1]];
    const l = dp(a.slice(0, im + 1)), r = dp(a.slice(im));
    return l.slice(0, -1).concat(r);
  };
  const A = dp(pts.slice(0, far + 1)), B = dp(pts.slice(far).concat([pts[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}

// Lays the page out at 300 dpi and makes the cut file to match.
function coPage(R, reg, polys) {
  const port = R.h > R.w * 1.05, [pw, ph] = port ? CO_PAGE.port : CO_PAGE.land;
  const maxW = pw - 1, maxH = ph - 1.9, iw = Math.min(maxW, maxH * R.w / R.h), ih = iw * R.h / R.w;
  const ox = (pw - iw) / 2, oy = 1.25 + (maxH - ih) / 2, s = iw / R.w;   // inches per render pixel
  const cv = document.createElement('canvas'); cv.width = Math.round(pw * CO_DPI); cv.height = Math.round(ph * CO_DPI);
  const g = cv.getContext('2d'), P = v => v * CO_DPI;
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.imageSmoothingQuality = 'high'; g.drawImage(R.photo, P(ox), P(oy), P(iw), P(ih));
  // Paper strips between doors print dark, like the gap they stand for.
  const path = p => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](P(ox + x * s), P(oy + y * s))); g.closePath(); };
  // Paper left between the holes prints dark, like the gap it stands for. Straight edges: the cabinet outline filled, holes cut out of it.
  if (reg.outline) { g.fillStyle = '#464644'; reg.outline.forEach(p => { path(p); g.fill(); });
    (reg.gaps || []).forEach(p => { g.save(); path(p); g.clip(); g.drawImage(R.photo, P(ox), P(oy), P(iw), P(ih)); g.restore(); }); }
  g.fillStyle = '#fff'; polys.forEach(p => { path(p); g.fill(); });
  g.strokeStyle = '#141414'; g.lineWidth = 3; g.lineJoin = 'miter'; polys.forEach(p => { path(p); g.stroke(); });
  g.strokeRect(P(ox), P(oy), P(iw), P(ih));
  const job = (S.job && S.job.name) || 'Job', room = (curRoom() || {}).name || '';
  g.fillStyle = '#141414'; g.font = '600 44px Helvetica, Arial, sans-serif'; g.fillText('LARKUL Custom · Cutout card', P(ox), P(oy) - 80);
  g.fillStyle = '#6e6e6e'; g.font = '30px Helvetica, Arial, sans-serif'; g.fillText(job + (room ? ' · ' + room : ''), P(ox), P(oy) - 30);
  g.fillStyle = '#5a5a5a'; g.font = '32px Helvetica, Arial, sans-serif';
  g.fillText(reg.outline ? 'Cut out the white areas along the black line. Leave the dark strips between doors. Print at 100%.' : 'Cut out the white areas along the black line. Print at 100% (actual size).', P(ox), P(oy + ih) + 60);
  const f = n => n.toFixed(4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}in" height="${ph}in" viewBox="0 0 ${pw} ${ph}"><g fill="none" stroke="#ff0000" stroke-width="0.005">`
    + polys.map(p => `<polygon points="${p.map(([x, y]) => f(ox + x * s) + ',' + f(oy + y * s)).join(' ')}"/>`).join('') + '</g></svg>';
  return { canvas: cv, url: cv.toDataURL('image/png'), svg, pw, ph, port, holes: polys.length };
}

function makeCutout() {
  const co = ui.co; if (!co) return;
  co.busy = true; co.err = ''; renderCutout();
  setTimeout(() => {
    try {
      const R = co.R || (co.R = coRender(roomViewer, 2400));
      if (!R.keys.length || R.keys.length < 2 || !R.lab.some(Boolean)) throw new Error('No cabinets in this view. Turn the 3D view so the cabinets show, then try again.');
      const port = R.h > R.w * 1.05, iw = Math.min((port ? 7.5 : 10), ((port ? 11 : 8.5) - 1.9) * R.w / R.h);
      const pxPerIn = R.w / iw, webPx = Math.max(1, Math.round(0.6 / 25.4 * pxPerIn));   // strips about 1.2 mm wide
      const minA = Math.round((2 / 25.4 * pxPerIn) ** 2);
      const tri = Math.round((R.w / 200) ** 2), minW = 1.5 / 25.4 * pxPerIn;
      const thin = Math.max(2, Math.round(0.8 / 25.4 * pxPerIn));   // pieces need to be at least ~1.6 mm wide
      R.open = R.open || coOpen(R.lab.map(l => l ? 1 : 0), R.w, R.h, thin);
      let reg = coRegions(R, co.doors, webPx, null, thin), polys = coPolys(reg.lab, R.w, R.h, minA, 1.2, tri, minW);
      if (co.doors) {
        const ring = new Set(polys.filter(p => polys.some(o => o !== p && o.every(q => coInside(p, q)))).map(p => p.label).filter(l => R.keys[l].startsWith('cab:')));
        if (ring.size) { reg = coRegions(R, true, webPx, ring, thin); polys = coPolys(reg.lab, R.w, R.h, minA, 1.2, tri, minW); }
      }
      if (co.doors) {
        reg.outline = coPolys(R.open.map(l => l ? 1 : 0), R.w, R.h, minA, 1.2, tri);
        // Room showing through inside a ring of cabinets stays a picture, not dark paper.
        reg.gaps = coPolys(R.open.map(l => l ? 0 : 1), R.w, R.h, 4, 1.2).filter(p => p.every(([x, y]) => x > 0 && y > 0 && x < R.w && y < R.h));
      }
      co.res = coPage(R, reg, polys);
    } catch (e) { co.err = e.message || String(e); co.res = null; }
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
