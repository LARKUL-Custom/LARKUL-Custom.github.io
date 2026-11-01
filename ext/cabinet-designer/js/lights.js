/* ---------- Lights: LED strips on cabinets and ceiling lights, per room ---------- */
// A strip is { kind: 'strip', cab, where, temp } and runs the cabinet's width; a ceiling light is
// { kind: 'ceiling', x, y, style, temp } at a plan point, hung from the tallest wall height.
const LIGHT_TEMPS = [{ v: 'warm', l: 'Warm white', c: '#ffc97a' }, { v: 'neutral', l: 'Neutral white', c: '#fff1dc' }, { v: 'cool', l: 'Cool white', c: '#e8f1ff' }];
const STRIP_SPOTS = [{ v: 'under', l: 'Under the cabinet' }, { v: 'top', l: 'On top (up light)' }, { v: 'inside', l: 'Inside, under the top' }, { v: 'toe', l: 'Toe kick' }];
const CEIL_STYLES = [{ v: 'can', l: 'Recessed can' }, { v: 'flush', l: 'Flush mount' }, { v: 'pendant', l: 'Pendant' }];
const lightColor = t => (LIGHT_TEMPS.find(x => x.v === t) || LIGHT_TEMPS[0]).c;
const roomLights = () => S.lights || [];
const stripCab = l => l.kind === 'strip' && S.cabinets.find(c => c.id === l.cab);
const stripLen = c => Math.max(0, c.w - 2);
function ceilHeight() { return S.walls.length ? Math.max(...S.walls.map(w => w.height || 96)) : 96; }

/* The Lights tab under the room view. */
function lightsCard() {
  const L = roomLights(), strips = L.filter(stripCab), ceil = L.filter(l => l.kind === 'ceiling');
  const feet = strips.reduce((a, l) => a + stripLen(stripCab(l)), 0) / 12;
  const cabOpts = S.cabinets.map(c => ({ v: c.id, l: `${LBL[c.id] || ''} ${c.name}` }));
  const temp = (R, l) => ctl(R, 'temp', l.temp || 'warm', 'select', { options: LIGHT_TEMPS, label: 'Light color' });
  return `<div class="card">${cardHead('LED strips', `<span class="muted">${strips.length} strip${strips.length === 1 ? '' : 's'} · ${feet.toFixed(1)} ft</span>`)}<div class="cardbody">
    <div class="row-actions"><button class="btn${ui.placeLight === 'strip' ? ' on' : ''}" data-act="${ui.placeLight === 'strip' ? 'light-place-stop' : 'light-draw'}" aria-pressed="${ui.placeLight === 'strip'}">${icon(ui.placeLight === 'strip' ? 'check' : 'plus')}${ui.placeLight === 'strip' ? 'Done drawing' : 'Draw LED strip'}</button><label class="f inl"><span>Where</span>${`<select class="strip-where" aria-label="Where the strip goes"><option value="auto"${(ui.stripWhere || 'auto') === 'auto' ? ' selected' : ''}>Auto (under uppers, toe kick on bases)</option>${STRIP_SPOTS.map(o => `<option value="${o.v}"${ui.stripWhere === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select>`}</label></div><div class="row-actions"><button class="btn" data-act="light-strips" data-id="under">${icon('plus')}Under every wall cabinet</button><button class="btn" data-act="light-strips" data-id="top">${icon('plus')}On top of every wall cabinet</button><button class="btn" data-act="light-strips" data-id="toe">${icon('plus')}Toe kick on every base</button>${ui.sel && ui.sel.type === 'cab' ? `<button class="btn" data-act="light-strip-sel">${icon('plus')}Selected cabinet</button>` : ''}${strips.length ? `<button class="btn danger" data-act="light-clear" data-id="strip">Remove all strips</button>` : ''}</div>
    ${strips.length ? `<div class="tscroll"><table class="t gentab"><thead><tr><th>Cabinet</th><th>Where</th><th>Color</th><th class="r">Length</th><th></th></tr></thead><tbody>${strips.map(l => { const R = 'light:' + l.id; return `<tr><td style="min-width:150px">${ctl(R, 'cab', l.cab, 'select', { options: cabOpts, label: 'Cabinet' })}</td><td style="min-width:150px">${ctl(R, 'where', l.where, 'select', { options: STRIP_SPOTS, label: 'Where' })}</td><td style="min-width:120px">${temp(R, l)}</td><td class="n">${fmtLen(stripLen(stripCab(l)))}</td><td><button class="btn sm danger" data-act="light-del" data-id="${l.id}" aria-label="Delete strip">${icon('trash')}</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="note">Strips run the width of the cabinet, less an inch at each end, and glow in 3D and Realistic.</div>'}</div></div>
  <div class="card">${cardHead('Ceiling lights', `<span class="muted">${ceil.length} light${ceil.length === 1 ? '' : 's'}</span>`)}<div class="cardbody">
    <div class="row-actions"><button class="btn${ui.placeLight === true ? ' on' : ''}" data-act="${ui.placeLight === true ? 'light-place-stop' : 'light-place'}" aria-pressed="${ui.placeLight === true}">${icon(ui.placeLight === true ? 'check' : 'plus')}${ui.placeLight === true ? 'Done placing' : 'Click to place in the plan'}</button><button class="btn" data-act="light-grid">${icon('gridsplit')}Lay out cans every ${fmtLen((S.job.layout || {}).lightGrid || 48)}</button>${ceil.length ? `<button class="btn danger" data-act="light-clear" data-id="ceiling">Remove all</button>` : ''}</div>
    ${fld('Spacing for lay out', 'layout', 'lightGrid', (S.job.layout || {}).lightGrid || 48, 'len')}
    ${ceil.length ? `<div class="tscroll"><table class="t gentab"><thead><tr><th>Light</th><th>Across (X)</th><th>Down (Y)</th><th>Color</th><th>Pendant drop</th><th></th></tr></thead><tbody>${ceil.map(l => { const R = 'light:' + l.id; return `<tr><td style="min-width:140px">${ctl(R, 'style', l.style || 'can', 'select', { options: CEIL_STYLES, label: 'Light style' })}</td><td style="width:90px">${ctl(R, 'x', l.x, 'len', { label: 'X' })}</td><td style="width:90px">${ctl(R, 'y', l.y, 'len', { label: 'Y' })}</td><td style="min-width:120px">${temp(R, l)}</td><td style="width:90px">${l.style === 'pendant' ? ctl(R, 'drop', l.drop || 30, 'len', { label: 'Drop' }) : ''}</td><td><button class="btn sm danger" data-act="light-del" data-id="${l.id}" aria-label="Delete light">${icon('trash')}</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="note">Place lights by clicking in the plan, or lay out a grid of cans over the room. They hang from the tallest wall height.</div>'}</div></div>`;
}
/* Drawing strips one cabinet at a time: Draw LED strip, then click each cabinet (plan or elevation).
   Clicking a cabinet that already has a strip in that spot takes it off. Lights copy and paste with cabinets,
   and Copy its lights / Paste lights (right-click) puts the same strips on other cabinets. */
let lightClip = null;
const cabStrips = id => roomLights().filter(l => l.kind === 'strip' && l.cab === id).map(l => ({ where: l.where, temp: l.temp }));
function addCabStrips(id, list) {
  S.lights = S.lights || [];
  list.forEach(x => { if (!S.lights.some(l => l.kind === 'strip' && l.cab === id && l.where === x.where)) S.lights.push({ id: uid('lt'), kind: 'strip', cab: id, where: x.where, temp: x.temp || 'warm' }); });
}
const stripWhereFor = c => { const w = ui.stripWhere || 'auto'; return w !== 'auto' ? w : c.cat === 'Wall' ? 'under' : c.cat === 'Tall' ? 'inside' : 'toe'; };
function startStripDraw() { stopWalls(); if (ui.drawMold) stopMoldDraw(); ui.placing = null; ui.placeLight = 'strip'; ui.dock = 'lights'; ui.dockOpen = true; render(); }
function toggleStrip(id) {
  const c = cab(id); if (!c) return;
  const where = stripWhereFor(c), have = roomLights().find(l => l.kind === 'strip' && l.cab === id && l.where === where);
  mutate(() => { if (have) S.lights = S.lights.filter(l => l !== have); else addCabStrips(id, [{ where, temp: ui.stripTemp || 'warm' }]); });
  flash(`${have ? 'Took the strip off' : 'Added a strip to'} ${LBL[id] || c.name} (${(STRIP_SPOTS.find(x => x.v === where) || {}).l.toLowerCase()})`);
}
function pasteLights(ids) {
  if (!lightClip || !lightClip.length) return;
  mutate(() => ids.forEach(id => addCabStrips(id, lightClip)));
  flash(`Pasted lights on ${ids.length} cabinet${ids.length === 1 ? '' : 's'}`);
}
function addStrips(where) {
  const want = c => where === 'toe' ? c.cat !== 'Wall' && c.cat !== 'Tall' : c.cat === 'Wall';
  const have = new Set(roomLights().filter(l => l.kind === 'strip' && l.where === where).map(l => l.cab));
  const add = S.cabinets.filter(c => want(c) && !have.has(c.id));
  if (!add.length) { flash(have.size ? 'Those cabinets already have strips.' : 'No cabinets for that here.'); return; }
  mutate(() => add.forEach(c => S.lights.push({ id: uid('lt'), kind: 'strip', cab: c.id, where, temp: 'warm' })));
}
// Cans over the space the walls enclose, kept off the walls by half a spacing.
function lightGrid() {
  const pts = S.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]); if (!pts.length) { flash('Draw the walls first.'); return; }
  const sp = Math.max(12, +(S.job.layout || {}).lightGrid || 48), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const nx = Math.max(1, Math.round((x1 - x0) / sp)), ny = Math.max(1, Math.round((y1 - y0) / sp));
  mutate(() => {
    S.lights = S.lights.filter(l => l.kind !== 'ceiling');
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) S.lights.push({ id: uid('lt'), kind: 'ceiling', style: 'can', temp: 'warm', x: r3(x0 + (x1 - x0) * (i + 0.5) / nx), y: r3(y0 + (y1 - y0) * (j + 0.5) / ny) });
  });
}
function startLightPlace() { stopWalls(); if (ui.drawMold) stopMoldDraw(); ui.placing = null; ui.placeLight = true; ui.dock = 'lights'; ui.dockOpen = true; if (ui.viewMode !== 'plan') setView('plan'); else render(); }
function stopLightPlace() { ui.placeLight = false; render(); }
function placeLightAt(p) { mutate(() => S.lights.push({ id: uid('lt'), kind: 'ceiling', style: 'can', temp: 'warm', x: Math.round(p.x), y: Math.round(p.y) })); }

/* Plan symbols: a ceiling light is a circle with a cross, a strip a dashed line along the cabinet front. */
function lightsPlanSVG(px) {
  let s = '';
  roomLights().forEach(l => {
    if (l.kind === 'ceiling') {
      const r = l.style === 'pendant' ? 5 : 4, k = r * 0.7;
      s += `<g class="lightsym"><circle class="nss" cx="${l.x}" cy="${l.y}" r="${r}"/><path class="nss" d="M${l.x - k} ${l.y - k}L${l.x + k} ${l.y + k}M${l.x + k} ${l.y - k}L${l.x - k} ${l.y + k}"/></g>`;
      return;
    }
    const c = stripCab(l), p = c && cabPoly(c); if (!p) return;
    const t = l.where === 'top' ? 0.55 : l.where === 'toe' ? 0.8 : 0.92, a = { x: p[0].x + (p[3].x - p[0].x) * t, y: p[0].y + (p[3].y - p[0].y) * t }, b = { x: p[1].x + (p[2].x - p[1].x) * t, y: p[1].y + (p[2].y - p[1].y) * t };
    s += `<line class="ledsym nss" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  });
  if (ui.placeLight === true && ui.mouse) s += `<circle class="lightsym ghost nss" cx="${ui.mouse.x}" cy="${ui.mouse.y}" r="4"/>`;
  return s;
}

/* 3D: glowing strips and fixtures; in Realistic each also casts light (a limited number, for speed). */
const MAX_LAMPS = 24;
const glow3 = {};
let shade3 = null;
const shadeMat = () => shade3 || (shade3 = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide }));
function glowMat(col) { return glow3[col] || (glow3[col] = new THREE.MeshBasicMaterial({ color: new THREE.Color(col), toneMapped: false })); }
const wash3 = {};
// Additive gradient, brightest at the strip and fading away from it.
function washMat(col, up) {
  const key = col + up; if (wash3[key]) return wash3[key];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, up ? 128 : 0, 0, up ? 0 : 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  // Soften the ends.
  g.globalCompositeOperation = 'destination-in';
  const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.12, 'rgba(0,0,0,1)'); gx.addColorStop(0.88, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 64, 128);
  return (wash3[key] = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.3 }));
}
function addLights3d(v, R3, layerOn) {
  if (!layerOn) return;
  let lamps = 0;
  const lamp = (grp, col, x, y, z, k, dist) => {
    if (!R3 || lamps >= MAX_LAMPS) return;
    const pl = new THREE.PointLight(new THREE.Color(col), k, dist, 2); pl.position.set(x, y, z); grp.add(pl); lamps++;
  };
  roomLights().forEach(l => {
    if (l.kind !== 'strip') return;
    const c = stripCab(l), w = c && wall(c.wall); if (!w) return;
    const grp = wallGroup(w, c.side, c.side === 1 ? c.off : c.off + c.w, c.outset || 0), D = c.d, len = stripLen(c), col = lightColor(l.temp);
    const spot = { under: [-0.2, D - 2.5, -3], top: [c.h + 0.2, D - 3, 6], inside: [c.h - 1.2, D - 2, -4], toe: [1.2, D - 4, 2] }[l.where] || [-0.2, D - 2.5, -3];
    const [y, z, ly] = spot, m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.6), glowMat(col));
    m.position.set(c.w / 2, c.elev + y, z); m.userData.noBounds = true; m.userData.layer = 'lights'; grp.add(m);
    // A soft wash on the wall below (or above) the strip, so the light shows even on white cabinets in daylight.
    if (l.where === 'under' || l.where === 'top') {
      const wh = l.where === 'under' ? Math.min(20, Math.max(8, c.elev - 36)) : 14;
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(len + 4, wh), washMat(col, l.where === 'top'));
      wash.position.set(c.w / 2, l.where === 'under' ? c.elev - wh / 2 : c.elev + c.h + wh / 2, 0.15); wash.userData.noBounds = true; wash.userData.layer = 'lights'; wash.renderOrder = 2; grp.add(wash);
    }
    const n = len > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) lamp(grp, col, c.w * (i + 1) / (n + 1), c.elev + y + ly, z + 2, l.where === 'top' ? 1.2 : 1.8, 40);
    grp.userData.noBounds = true; v.root.add(grp);
  });
  const hgt = ceilHeight();
  roomLights().forEach(l => {
    if (l.kind !== 'ceiling') return;
    const col = lightColor(l.temp), g = new THREE.Group(); g.position.set(+l.x || 0, 0, +l.y || 0); g.userData.noBounds = true;
    if (l.style === 'pendant') {
      const drop = Math.max(6, +l.drop || 30), bottom = hgt - drop;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, drop - 5, 6), flat3('#2b2b2b')); cord.position.y = bottom + 5 + (drop - 5) / 2; g.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 24, 1, true), shadeMat()); shade.position.y = bottom + 2.5; g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), glowMat(col)); bulb.position.y = bottom + 0.8; g.add(bulb);
      lamp(g, col, 0, bottom - 1, 0, 1.2, 200);
    } else {
      const r = l.style === 'flush' ? 6 : 2.6;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l.style === 'flush' ? 1.6 : 0.3, 24), glowMat(col)); disc.position.y = hgt - (l.style === 'flush' ? 0.8 : 0.16); g.add(disc);
      lamp(g, col, 0, hgt - 4, 0, 1.1, 220);
    }
    g.traverse(o => { o.userData.layer = 'lights'; o.userData.noBounds = true; });
    v.root.add(g);
  });
}

document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('.strip-where'); if (s) { ui.stripWhere = s.value; render(); } });
