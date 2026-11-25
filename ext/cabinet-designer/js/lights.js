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

/* The Lights tab under the room view. Kept small (Ayden 2026-11-24: it took up most of the screen): LED strips and
   ceiling lights side by side, one row of buttons each, and the list of every light only when List is pressed. */
function lightsCard() {
  const L = roomLights(), strips = L.filter(stripCab), ceil = L.filter(l => l.kind === 'ceiling'), nAuto = ceil.filter(l => l.auto).length;
  const feet = strips.reduce((a, l) => a + stripLen(stripCab(l)), 0) / 12;
  const cabOpts = S.cabinets.map(c => ({ v: c.id, l: `${LBL[c.id] || ''} ${c.name}` }));
  const temp = (R, l) => ctl(R, 'temp', l.temp || 'warm', 'select', { options: LIGHT_TEMPS, label: 'Light color' });
  const listBtn = (k, n) => n ? `<button class="btn sm${ui.lightList === k ? ' on' : ''}" data-act="light-list" data-id="${k}" aria-pressed="${ui.lightList === k}">${icon('list')}List</button>` : '';
  const del = (id, what) => `<button class="btn sm danger" data-act="light-del" data-id="${id}" aria-label="Delete ${what}">${icon('trash')}</button>`;
  const drawing = ui.placeLight === 'strip', placing = ui.placeLight === true;
  const stripList = ui.lightList === 'strip' && strips.length ? `<div class="tscroll lt-list"><table class="t gentab"><thead><tr><th>Cabinet</th><th>Where</th><th>Color</th><th class="r">Length</th><th></th></tr></thead><tbody>${strips.map(l => { const R = 'light:' + l.id; return `<tr><td>${ctl(R, 'cab', l.cab, 'select', { options: cabOpts, label: 'Cabinet' })}</td><td>${ctl(R, 'where', l.where, 'select', { options: STRIP_SPOTS, label: 'Where' })}</td><td>${temp(R, l)}</td><td class="n">${fmtLen(stripLen(stripCab(l)))}</td><td>${del(l.id, 'strip')}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  const ceilList = ui.lightList === 'ceiling' && ceil.length ? `<div class="tscroll lt-list"><table class="t gentab"><thead><tr><th>Light</th><th>Across (X)</th><th>Down (Y)</th><th>Color</th><th>Drop</th><th></th></tr></thead><tbody>${ceil.map(l => { const R = 'light:' + l.id; return `<tr><td>${ctl(R, 'style', l.style || 'can', 'select', { options: CEIL_STYLES, label: 'Light style' })}${l.auto ? '<span class="lt-auto" title="Made by Regenerate ceiling lights. Regenerate replaces these and keeps the ones you placed.">auto</span>' : ''}</td><td>${ctl(R, 'x', l.x, 'len', { label: 'X' })}</td><td>${ctl(R, 'y', l.y, 'len', { label: 'Y' })}</td><td>${temp(R, l)}</td><td>${l.style === 'pendant' ? ctl(R, 'drop', l.drop || 30, 'len', { label: 'Drop' }) : ''}</td><td>${del(l.id, 'light')}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  const ap = !ceil.length ? autoPucks().length : 0, wo = !!lay().winOnly;
  return `<div class="lt-dock">
  <div class="lt-box"><div class="lt-head"><b>LED strips</b><span class="muted">${strips.length} · ${feet.toFixed(1)} ft</span>${listBtn('strip', strips.length)}</div>
    <div class="lt-row"><button class="btn sm${drawing ? ' on' : ''}" data-act="${drawing ? 'light-place-stop' : 'light-draw'}" aria-pressed="${drawing}" title="Then click each cabinet. Click again to take it off.">${icon(drawing ? 'check' : 'edit')}${drawing ? 'Done' : 'Draw'}</button><select class="strip-where" aria-label="Where the strip goes" title="Where the strip goes"><option value="auto"${(ui.stripWhere || 'auto') === 'auto' ? ' selected' : ''}>Auto spot</option>${STRIP_SPOTS.map(o => `<option value="${o.v}"${ui.stripWhere === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select><button class="btn sm" data-act="light-strips" data-id="under" title="A strip under every wall cabinet">${icon('plus')}Under uppers</button><button class="btn sm" data-act="light-strips" data-id="top" title="A strip on top of every wall cabinet">${icon('plus')}On uppers</button><button class="btn sm" data-act="light-strips" data-id="toe" title="A strip in the toe kick of every base">${icon('plus')}Toe kicks</button>${strips.length ? `<button class="btn sm danger" data-act="light-clear" data-id="strip" title="Remove all strips">${icon('trash')}All</button>` : ''}</div>${stripList}</div>
  <div class="lt-box"><div class="lt-head"><b>Ceiling lights</b><span class="muted">${ceil.length ? ceil.length + (nAuto ? ` (${nAuto} auto)` : '') : ap ? ap + ' automatic' : 'none'}</span><button class="btn sm" data-act="light-reset" title="Back to the best-looking lighting: 3 PM daylight, Only through windows off, automatic ceiling cans at the usual spacing (the cans Regenerate laid out and a typed spacing are cleared). Lights you placed stay. Undo brings it back.">${icon('regen')}Reset lighting</button><button class="btn sm${wo ? ' on' : ''}" data-act="light-winonly" aria-pressed="${wo}" title="Realistic only: no daylight or fill from outside the drawing except what comes in through the windows (following the time of day). Ceiling lights and LED strips you placed by hand stay on. Automatic and regenerated cans go off.">${icon(wo ? 'check' : 'sun')}Only through windows</button>${listBtn('ceiling', ceil.length)}</div>
    <div class="lt-row"><button class="btn sm${placing ? ' on' : ''}" data-act="${placing ? 'light-place-stop' : 'light-place'}" aria-pressed="${placing}" title="Click in the plan to place a light">${icon(placing ? 'check' : 'plus')}${placing ? 'Done' : 'Place'}</button><button class="btn sm" data-act="light-regen" title="Lays out recessed cans over the room again. Replaces the automatic ones, keeps lights you placed.">${icon('regen')}Regenerate ceiling lights</button><label class="lt-sp" title="Spacing between cans">${icon('gridsplit')}${ctl('layout', 'lightGrid', (S.job.layout || {}).lightGrid || canSpacing(), 'len', { label: 'Spacing between cans' })}</label>${ceil.length ? `<button class="btn sm danger" data-act="light-clear" data-id="ceiling" title="Remove all ceiling lights">${icon('trash')}All</button>` : ''}</div>${ceilList}</div>
</div>`;
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
/* Regenerate ceiling lights (Ayden 2026-11-24, for when the automatic ones don't show or land badly): the same
   layout as the automatic pucks, at the Spacing set beside the button, but forced (any walls, even an open room)
   and saved as real recessed cans marked auto. Pressing it again replaces the auto ones and keeps every light
   placed by hand, leaving out any spot within a foot and a half of one. Replaces the old plain Lay out cans grid. */
function regenCeilLights() {
  if (!S.walls.length) { flash('Draw the walls first.'); return; }
  const sp = +(S.job.layout || {}).lightGrid > 0 ? Math.max(12, +S.job.layout.lightGrid) : canSpacing();
  const mine = roomLights().filter(l => l.kind === 'ceiling' && !l.auto);
  const P = puckSpots(true, sp, 60).filter(p => !mine.some(m => Math.hypot((+m.x || 0) - p.x, (+m.y || 0) - p.y) < 18));
  if (!P.length && !mine.length) { flash('The room is too small for ceiling lights. Walls need to enclose at least 4 ft each way.'); return; }
  mutate(() => {
    S.lights = S.lights.filter(l => !(l.kind === 'ceiling' && l.auto));
    P.forEach(p => S.lights.push({ id: uid('lt'), kind: 'ceiling', style: 'can', temp: 'warm', x: Math.round(p.x), y: Math.round(p.y), auto: true }));
  });
  flash(`${P.length} ceiling light${P.length === 1 ? '' : 's'} laid out${mine.length ? `, kept the ${mine.length} you placed` : ''}.`);
}
/* Reset lighting (Ayden 2026-11-25: "a baseline reset lighting button so it looks as visually appealing as possible
   without me messing with it"). One click, one undo: Only through windows off, Automatic ceiling lights on, the cans
   Regenerate laid out and any typed can spacing cleared (so the cans come back on their own, at the spacing from the
   ceiling height), 3 PM daylight, and in Walk the room's lights back on. Lights placed by hand stay. */
function resetLighting() {
  mutate(() => {
    const L = { ...(S.job.layout || {}) }; delete L.winOnly; delete L.lightGrid; L.autoLights = true; S.job.layout = L;
    S.lights = (S.lights || []).filter(l => !(l.kind === 'ceiling' && l.auto));
  });
  if (typeof sunSet === 'function') sunSet(15);
  if (typeof WALK === 'object' && WALK.on && typeof walkLights === 'function' && typeof roomViewer !== 'undefined' && roomViewer) {
    WALK.dark = false; walkLights(roomViewer, false); if (typeof walkLightsBtn === 'function') walkLightsBtn();
    if (typeof walkSunSet === 'function') walkSunSet(roomViewer, 15);
    const r = WALK.ui && WALK.ui.querySelector('.walksun input'); if (r) { r.value = 15; const t = WALK.ui.querySelector('.walksun span'); if (t) t.textContent = sunLabel(15); }
  }
  const mine = roomLights().filter(l => l.kind === 'ceiling').length, auto = autoPucks().length;
  flash(`Lighting reset: 3 PM daylight${auto ? `, ${auto} ceiling cans` : ''}${mine ? `, your ${mine} ceiling light${mine === 1 ? '' : 's'} kept` : ''}.`);
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
  // The automatic pucks, dashed: they are not saved and go away once a ceiling light is placed.
  autoPucks().forEach(p => { s += `<circle class="lightsym ghost auto nss" cx="${r3(p.x)}" cy="${r3(p.y)}" r="3"><title>Automatic ceiling light (Realistic). Switch off with Ceiling lights in the bottom bar.</title></circle>`; });
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
/* Realistic only: a room that is mostly closed in by walls and has a ceiling but no ceiling lights drawn gets a few
   recessed pucks so it isn't dark. Placing any ceiling light turns these off. Look only, never saved. */
const AUTO_CEIL = { n: 0 };
const CAN_LAMPS = 16;
const CAN_K = { k: 1.8 };
// The soft glow on the ceiling round a can's trim (a down-facing disc of added light that fades out by 9 inches).
let haloGeo3_ = null; const halo3 = {};
function haloGeo3() { return haloGeo3_ || (haloGeo3_ = new THREE.CircleGeometry(9, 32).rotateX(Math.PI / 2)); }
function haloMat3(col) {
  if (halo3[col]) return halo3[col];
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(0.35, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (halo3[col] = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
}
function autoPucks() {
  // 0.58.30: Automatic ceiling lights switch in the bottom bar (on by default).
  if (lay().autoLights === false || S.walls.length < 3 || roomLights().some(l => l.kind === 'ceiling')) return [];
  return puckSpots(false, 0, 16);
}
/* Where recessed cans go (0.63.42, Ayden 2026-11-25: "have them be more spread out than this, more realistic"). Even
   rows and columns like a real can layout, no nudges. Spacing from the ceiling height (3/4 of it: 6 ft under an 8 ft
   ceiling, never under 4 ft); the outer cans half a spacing in from the walls (24" to 36"), so they sit over the
   counter's front edge, not over the wall cabinets. sp > 0 sets the spacing (Regenerate ceiling lights).
   force: any walls, open rooms too. max = most cans. */
// Can spacing from the ceiling height: 3/4 of it, to the nearest 6" (72" under a 96" ceiling), never under 48".
function canSpacing(H) { if (!(H > 0)) { const cl = typeof roomCeiling === 'function' ? roomCeiling() : {}; H = +cl.h > 0 ? +cl.h : ceilHeight(); } return Math.max(48, Math.round(H * 0.75 / 6) * 6); }
function puckSpots(force, sp, max) {
  const ws = S.walls; if (!ws.length) return [];
  const xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), W = x1 - x0, D = y1 - y0;
  if (W < 48 || D < 48) return [];
  const loop = typeof roomLoop === 'function' ? roomLoop() : null;
  const wallLen = ws.reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 0);
  if (!force && !loop && wallLen < 0.75 * 2 * (W + D)) return []; // open on more than a quarter: daylight is enough
  const cl = typeof roomCeiling === 'function' ? roomCeiling() : {}, H = +cl.h > 0 ? +cl.h : ceilHeight();
  const slope = cl.slope && cl.slope !== 'none' ? cl.slope : null, run = +cl.run > 0 ? +cl.run : 60;
  const s0 = sp > 0 ? sp : canSpacing(H);
  // Cans along a side: as many as fit at the spacing, spread evenly between the end ones.
  const fit = L => { const ins = Math.min(36, Math.max(24, s0 / 2), L / 4); return { n: Math.max(1, Math.round((L - 2 * ins) / s0) + 1), ins }; };
  const fx = fit(W), fy = fit(D);
  while (fx.n * fy.n > max) { if (fx.n >= fy.n) fx.n--; else fy.n--; }
  const at = (a, L, f, i) => f.n === 1 ? a + L / 2 : a + f.ins + (L - 2 * f.ins) * i / (f.n - 1);
  const out = [];
  for (let i = 0; i < fx.n; i++) for (let j = 0; j < fy.n; j++) {
    const x = at(x0, W, fx, i), y = at(y0, D, fy, j);
    if (loop && !vInPoly(x, y, loop)) continue;
    if (slope) { const d = slope === 'N' ? y - y0 : slope === 'S' ? y1 - y : slope === 'W' ? x - x0 : x1 - x; if (d < run) continue; }
    out.push({ x, y, h: H });
  }
  return out;
}
let puckGeo3 = null;
/* Only through windows (Ayden 2026-11-24: "the simulation light to literally only pass through the windows, there
   should be no other lights unless it is ceiling or LED strips or whatever we build"). realLight (real3d.js) turns off
   the sky fill, the overhead fill and reflections of the made-up surroundings. The sun is kept out of the room by
   an invisible shadow-only shell (winSeal3): every wall again with only its windows cut out (so walls cut away for the
   view, faded walls and doorways still block it), the open sides of the room and a roof. Each window also gets a soft
   sky light just inside it, aimed into the room, that follows the time of day. Lights placed in the drawing stay on. */
const SEAL3 = (() => { let m = null; return () => m || (m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })); })();
function winSeal3(v) {
  const ws = S.walls.filter(w => !w.hidden && !w.island); if (!ws.length) return;
  const g0 = new THREE.Group(), mat = SEAL3(), add = (o, grp = g0) => { o.castShadow = true; o.receiveShadow = false; o.userData.noBounds = true; o.userData.layer = 'lights'; o.userData.seal = true; grp.add(o); };
  const cl = typeof roomCeiling === 'function' ? roomCeiling() : {}, H = Math.max(+cl.h || 0, ...ws.map(w => w.height || 96));
  const T = Math.max(...ws.map(w => w.thick || 4)), isWin = f => f.kind === 'window';
  // Only walls on the room's outline are raised to the ceiling (a low wall inside the room, like a half wall, isn't).
  const bx = ws.flatMap(w => [w.x1, w.x2]), by = ws.flatMap(w => [w.y1, w.y2]), bx0 = Math.min(...bx), bx1 = Math.max(...bx), by0 = Math.min(...by), by1 = Math.max(...by);
  const edge = (x, y) => Math.min(Math.abs(x - bx0), Math.abs(x - bx1), Math.abs(y - by0), Math.abs(y - by1)) <= T + 6, outer = w => edge(w.x1, w.y1) && edge(w.x2, w.y2);
  ws.forEach(w => {
    const g = wg(w), grp = new THREE.Group(); grp.position.set((w.x1 + w.x2) / 2, 0, (w.y1 + w.y2) / 2); grp.rotation.y = Math.atan2(-g.u.y, g.u.x);
    fixtWall3(w, g, mat, false, isWin).forEach(m => add(m, grp));
    // Up to the ceiling where the wall is lower than it.
    const wh = w.height || 96; if (H - wh > 0.5 && outer(w)) add(new THREE.Mesh(new THREE.BoxGeometry(g.L + w.thick, H - wh + 1, w.thick), mat).translateY(wh + (H - wh + 1) / 2), grp);
    g0.add(grp);
  });
  // Open sides: stretches of the room's outline with no wall along them get a wall, a little outside the room.
  const xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), o = T + 1;
  const near = (x, y) => ws.some(w => { const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / L2)); return Math.hypot(w.x1 + t * dx - x, w.y1 + t * dy - y) <= (w.thick || 4) + 6; });
  [[x0, y0, x1, y0, 0, -o], [x0, y1, x1, y1, 0, o], [x0, y0, x0, y1, -o, 0], [x1, y0, x1, y1, o, 0]].forEach(([ax, ay, bx, by, ox, oy]) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 3)); let run = null;
    const flush = (k) => { if (!run) return; const a = (run - 0.5) / n, b = Math.min(1, (k + 0.5) / n), len = (b - a) * L + 2 * o, cx = ax + (bx - ax) * (a + b) / 2 + ox, cy = ay + (by - ay) * (a + b) / 2 + oy;
      add(new THREE.Mesh(ox ? new THREE.BoxGeometry(2, H + 2, len) : new THREE.BoxGeometry(len, H + 2, 2), mat).translateX(cx).translateY((H + 2) / 2).translateZ(cy)); run = null; };
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; if (!near(x, y)) { if (run === null) run = Math.max(0.5, i); } else flush(i - 1); }
    flush(n);
  });
  // A roof over everything.
  add(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 2 * o + 4, 2, y1 - y0 + 2 * o + 4), mat).translateX((x0 + x1) / 2).translateY(H + 1.5).translateZ((y0 + y1) / 2));
  g0.userData.noBounds = true; g0.userData.layer = 'lights'; v.root.add(g0);
}
const winOnly3 = R3 => !!(R3 && lay().winOnly);
const WIN_SKY = { max: 6 };
function windowSky3(v) {
  const ws = S.walls; if (!ws.length || typeof fixtList !== 'function') return;
  const xs = ws.flatMap(w => [w.x1, w.x2]), ys = ws.flatMap(w => [w.y1, w.y2]);
  const mid = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2);
  let n = 0;
  fixtList().filter(f => f.kind === 'window').forEach(f => {
    const w = wall(f.wall); if (!w || n >= WIN_SKY.max) return;
    const [a0, a1, z0, z1] = fixtInner(f), T = w.thick, g = wallGroup(w, 1, 0, -w.thick);
    g.updateMatrixWorld(true);
    const P = new THREE.Vector3((a0 + a1) / 2, (z0 + z1) / 2, T / 2).applyMatrix4(g.matrixWorld);
    const N = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld); N.y = 0; N.normalize();
    const flat = new THREE.Vector3(P.x, 0, P.z);
    if (flat.clone().add(N).distanceTo(mid) > flat.clone().sub(N).distanceTo(mid)) N.negate();
    const area = Math.max(1, (a1 - a0) * (z1 - z0)) / 1440; // a 30x48 window is 1
    const sl = new THREE.SpotLight(0xdfe8ff, 0, 360, 1.25, 1, 1.6);
    sl.position.copy(P).addScaledVector(N, T / 2 + 1);
    sl.target.position.copy(P).addScaledVector(N, 80).add(new THREE.Vector3(0, -40, 0));
    sl.userData.winSky = Math.min(2.5, Math.sqrt(area)); sl.userData.noBounds = true; sl.target.userData.noBounds = true;
    v.root.add(sl); v.root.add(sl.target); n++;
    // 0.63.45 (Ayden 2026-11-25: "global lighting comes through ceiling even when only through windows is selected"):
    // the daylight bouncing round the room used to be an even fill everywhere, ceiling included. Now it starts at the
    // window: a soft light 3 ft into the room at the window's middle height, fading with distance, so the room is
    // brightest by the window and dark far from it. realLight sets it by the hour.
    const b = new THREE.PointLight(0xf4efe6, 0, Math.max(240, 2.2 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))), 1.6);
    b.position.copy(P).addScaledVector(N, 36); b.userData.winBounce = Math.min(1.6, 0.8 * Math.sqrt(area)); b.userData.noBounds = true; v.root.add(b);
  });
}
function addLights3d(v, R3, layerOn, ceilOn) {
  if (R3) AUTO_CEIL.n = 0;
  if (winOnly3(R3)) { windowSky3(v); winSeal3(v); }
  if (!layerOn) return;
  // The automatic and regenerated cans are not lights anyone placed, so they stay off while only windows light the room.
  const off = winOnly3(R3);
  let lamps = 0;
  let shadows = 0;
  const lamp = (grp, col, x, y, z, k, dist, ceiling) => {
    if (!R3 || lamps >= MAX_LAMPS) return;
    const pl = new THREE.PointLight(new THREE.Color(col), k, dist, 2); pl.position.set(x, y, z); grp.add(pl); lamps++;
    // The first few ceiling lights cast soft shadows (under wall cabinets, beside tall ones), so a room lit by its
    // ceiling lights looks different from one lit by a window. Phones and tablets skip this for speed.
    if (ceiling && shadows < 4 && !(typeof aoCoarse === 'function' && aoCoarse())) {
      pl.castShadow = true; pl.shadow.mapSize.set(512, 512); pl.shadow.bias = -0.002; pl.shadow.normalBias = 0.4; pl.shadow.radius = 3; pl.shadow.camera.near = 1; pl.shadow.camera.far = dist; shadows++;
    }
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
  // Regenerated cans light the room like the automatic pucks (a few real lights for many glowing discs), so the
  // look stays the same and a big room doesn't add a light per can.
  const isPuck = l => R3 && l.kind === 'ceiling' && l.auto && (l.style || 'can') === 'can';
  roomLights().forEach(l => {
    if (l.kind !== 'ceiling' || isPuck(l)) return;
    const col = lightColor(l.temp), g = new THREE.Group(); g.position.set(+l.x || 0, 0, +l.y || 0); g.userData.noBounds = true;
    if (l.style === 'pendant') {
      const drop = Math.max(6, +l.drop || 30), bottom = hgt - drop;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, drop - 5, 6), flat3('#2b2b2b')); cord.position.y = bottom + 5 + (drop - 5) / 2; g.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 24, 1, true), shadeMat()); shade.position.y = bottom + 2.5; g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), glowMat(col)); bulb.position.y = bottom + 0.8; g.add(bulb);
      lamp(g, col, 0, bottom - 1, 0, 1.3, 200, true);
    } else {
      const r = l.style === 'flush' ? 6 : 2.6;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l.style === 'flush' ? 1.6 : 0.3, 24), glowMat(col)); disc.position.y = hgt - (l.style === 'flush' ? 0.8 : 0.16); g.add(disc);
      lamp(g, col, 0, hgt - 4, 0, 1.3, 220, true);
    }
    g.traverse(o => { o.userData.layer = 'lights'; o.userData.noBounds = true; });
    v.root.add(g);
  });
  // Recessed cans, automatic or regenerated (0.63.42, Ayden 2026-11-25: "lights dont line up or work... they work but
  // not all of them"). Before, at most 6 cans carried a light, hung 4" under the ceiling, so bright spots on the
  // ceiling sat between cans and the rest stayed dark. Now each can (up to CAN_LAMPS) shines a spot light straight
  // down from its trim, so the light falls under it, and every can gets a soft glow on the ceiling round it.
  if (!R3) return;
  const saved = roomLights().filter(isPuck), H = (() => { const cl = typeof roomCeiling === 'function' ? roomCeiling() : {}; return +cl.h > 0 ? +cl.h : hgt; })();
  // Only through windows: the made-for-you cans (automatic, or laid out by Regenerate ceiling lights) are off too;
  // only lights placed by hand stay on (Ayden 2026-11-25: with 28 regenerated cans on, the room looked the same).
  const P = off ? [] : saved.length ? saved.map(l => ({ x: +l.x || 0, y: +l.y || 0, h: H, col: lightColor(l.temp) })) : ceilOn ? autoPucks() : [];
  if (!P.length) return;
  AUTO_CEIL.n = P.length;
  const col = lightColor('warm'), g = new THREE.Group(); g.userData.noBounds = true;
  // A disc facing down only, so looking in from above the room shows no floating dots.
  puckGeo3 = puckGeo3 || new THREE.CircleGeometry(2.2, 20).rotateX(Math.PI / 2);
  P.forEach(p => {
    const m = new THREE.Mesh(puckGeo3, glowMat(p.col || col)); m.position.set(p.x, p.h - 0.05, p.y); g.add(m);
    const hl = new THREE.Mesh(haloGeo3(), haloMat3(p.col || col)); hl.position.set(p.x, p.h - 0.1, p.y); hl.renderOrder = 2; g.add(hl);
  });
  const coarse = typeof aoCoarse === 'function' && aoCoarse(), budget = Math.min(coarse ? 8 : CAN_LAMPS, Math.max(0, MAX_LAMPS - lamps));
  const lit = Math.min(P.length, budget), step = P.length / Math.max(1, lit);
  // More cans than lamps (very big rooms): each lamp stands for the cans round it and is that much brighter.
  const k = CAN_K.k * (P.length / Math.max(1, lit));
  let sh = 0;
  for (let i = 0; i < lit; i++) {
    const p = P[Math.floor(i * step + step / 2)], dist = p.h * 3;
    const sl = new THREE.SpotLight(new THREE.Color(p.col || col), k, dist, 1.4, 1, 1.2);
    sl.position.set(p.x, p.h - 0.6, p.y); sl.target.position.set(p.x, 0, p.y); sl.userData.puck = true;
    // A few cast shadows (under wall cabinets, beside talls); phones and tablets skip it.
    if (!coarse && sh < 4) { sl.castShadow = true; sl.shadow.mapSize.set(512, 512); sl.shadow.bias = -0.0015; sl.shadow.normalBias = 0.4; sl.shadow.radius = 3; sl.shadow.camera.near = 1; sl.shadow.camera.far = dist; sh++; }
    sl.userData.k0 = k; g.add(sl); g.add(sl.target); lamps++;
  }
  // Light from the cans bouncing off the floor and counters lights the ceiling and upper walls a little (a real room
  // with cans on isn't dark above them). Warm, even, and off with the cans (Walk's Lights off).
  const bo = new THREE.AmbientLight(new THREE.Color(col), Math.min(0.45, 0.16 * Math.sqrt(P.length))); bo.userData.puck = true; bo.userData.k0 = bo.intensity; g.add(bo);
  g.traverse(o => { o.userData.layer = 'lights'; o.userData.noBounds = true; });
  v.root.add(g);
}

document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('.strip-where'); if (s) { ui.stripWhere = s.value; render(); } });
