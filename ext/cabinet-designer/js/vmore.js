// Section V of the Mozaik list (things found in Mozaik's training pages): construction extras,
// CNC names and bit choice, edge band codes, drawing settings, QR codes on labels, and more.
'use strict';

/* ----- V25: the biggest straight bit that fits a pocket ----- */
function vAutoTool(pts, pocket) {
  const tools = peTools(); if (!pts || pts.length < 2) return peDefTool();
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y), small = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // A pocket needs room for the bit to move: at most 90% of its narrow side.
  const fit = tools.filter(t => t.dia <= (pocket ? small * 0.9 : small)).sort((a, b) => b.dia - a.dia);
  return (fit[0] || [...tools].sort((a, b) => a.dia - b.dia)[0] || { v: peDefTool() }).v;
}

/* ----- V23: file names from variables ----- */
function cncFileName(suffix) {
  const M = typeof CNC_LIB !== 'undefined' ? CNC_LIB.machine : {}, d = new Date();
  const v = { JOB: S.job.name || 'job', CUSTOMER: S.job.customer || '', DATE: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
  const n = (typeof fillVars === 'function' ? fillVars(M.fileName || '{JOB} parts', v) : `${v.JOB} parts`).replace(/[^\w &.()-]/g, '').replace(/\s+/g, ' ').trim() || 'parts';
  return suffix ? `${n} ${suffix}` : n;
}

/* ----- V1-V5: construction extras, run after the box is built ----- */
function vBuildExtras(c, parts, warn, p, x) {
  const mine = n => parts.filter(q => q.cabId === c.id && q.name === n);
  // V2: a rear line bore on wide cabinets, from the bottom to the top of the box on the shelf pin pitch.
  if (+p.backLBMinW > 0 && c.w > +p.backLBMinW && x.pin) {
    const pitch = x.pin.pitchMM * MM, y = x.inD - x.pin.pinSetbackMM * MM, thru = p.backLBThru === 'thru';
    ['Left side', 'Right side'].forEach(n => mine(n).forEach(sd => {
      const sh = c.h - sd.L;
      for (let z = x.zIn0 + (+p.pinZoneInset || 2.5); z <= x.zIn1 - (+p.pinZoneInset || 2.5) + 1e-6; z += pitch) {
        if (sd.ops.some(o => o.type === 'bore' && Math.abs(o.x - (z - sh)) < 0.2 && Math.abs(o.y - y) < 0.2)) continue;
        sd.ops.push({ type: 'bore', x: r3(z - sh), y: r3(y), dia: x.pin.pinDiaMM * MM, depth: thru ? x.t : x.pin.pinDepthMM * MM, through: thru, face: 'inside', why: 'back line bore' });
      }
    }));
  }
  // V3: toe skins longer than the stock come in equal pieces.
  const maxL = +p.toeSkinMaxL > 0 ? +p.toeSkinMaxL : 96;
  [...mine('Toe skin'), ...mine('Toe kick')].forEach(q => { if (q.L > maxL + 1e-6) { const n = Math.ceil(q.L / maxL); q.L = r3(q.L / n); q.qty *= n; q.note = `In ${n} pieces (stock ${fmtLen(maxL, 1)})`; } });
  // V4 dovetail boxes: the front and back run the full width and the sides fit between them, into the pins.
  // V5 no box front: the drawer face screws to the bottom, which runs to the front.
  const kind = p.drawerBox || 'butt';
  if (kind === 'butt') return;
  const sides = mine('Drawer side'), fronts = mine('Drawer box front'), backs = mine('Drawer box back'), bots = mine('Drawer bottom');
  sides.forEach((sd, i) => {
    const st = sd.T, fr = fronts[i], bk = backs[i], bt = bots[i];
    if (kind === 'dovetail') {
      const pin = Math.min(st, +p.dovetailPin > 0 ? +p.dovetailPin : st * 0.67), cut = 2 * (st - pin);
      sd.L = r3(sd.L - cut); sd.ops.forEach(o => { if (o.type === 'groove') o.x2 = Math.min(o.x2, sd.L); if (o.type === 'hbore' && o.x > sd.L) o.x = sd.L; });
      [fr, bk].forEach(q => { if (!q) return; q.L = r3(q.L + 2 * st); q.ops.forEach(o => { if (o.type === 'groove') { o.x2 = q.L; } }); q.note = 'Dovetailed'; });
      sd.note = `Dovetailed, ${fmtLen(pin, 1)} pins`;
    } else if (kind === 'nofront' && fr) {
      parts.splice(parts.indexOf(fr), 1);
      if (bt) { bt.L = r3(bt.L + st); bt.note = 'Runs to the drawer face'; }
      x.addB('Drawer face screw', 4);
    }
  });
  if (kind === 'nofront' && sides.length) warn.push('Drawer boxes have no front: the drawer face screws to the bottom and the sides.');
}

/* ----- V14: short edge band codes ----- */
const bandCode = b => b ? (b.code || b.name) : '';

/* ----- V6: joint fasteners drawn in 3D (Layers › Fasteners) ----- */
function vFasteners3d(c, grp) {
  let parts; try { parts = buildParts(c).parts.filter(q => q.cabId === c.id); } catch (_) { return; }
  const red = vFasteners3d.m || (vFasteners3d.m = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.4 }));
  const D = c.d;
  [['Left side', 'L'], ['Right side', 'R']].forEach(([n, end]) => {
    const sd = parts.find(q => q.name === n); if (!sd) return;
    const sh = c.h - sd.L, t = sd.T;
    sd.ops.filter(o => o.type === 'bore' && / \(/.test(o.why || '')).forEach(o => {
      // A pin through the side and into the panel behind it, about as long as the fastener.
      const len = t + 1.25, m = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(o.dia / 2, 0.09), Math.max(o.dia / 2, 0.09), len, 10), red);
      m.rotation.z = Math.PI / 2; m.position.set(end === 'L' ? len / 2 : c.w - len / 2, o.x + sh, D - o.y);
      m.userData.layer = 'fasteners'; grp.add(m);
    });
  });
}

/* ----- V16: ceiling height and a sloped ceiling, cut to the shape of the room ----- */
function roomCeiling(rm) { return (rm || curRoom()).ceiling || {}; }
function ceilingBox(rm) {
  const cl = roomCeiling(rm), slope = cl.slope && cl.slope !== 'none';
  return `<div class="psec box">${secHead('home', 'Ceiling', 'slate')}
    <div class="autogrid">${fld('Height', 'rceil', 'h', cl.h || '', 'len', { blank: true, ph: 'Tallest wall' })}
    <label class="f"><span>Sloped</span>${ctl('rceil', 'slope', cl.slope || 'none', 'select', { label: 'Sloped ceiling', options: [{ v: 'none', l: 'Flat' }, { v: 'N', l: 'Low side at the top of the plan' }, { v: 'S', l: 'Low side at the bottom' }, { v: 'W', l: 'Low side at the left' }, { v: 'E', l: 'Low side at the right' }] })}</label>
    ${slope ? fld('Height at the low side', 'rceil', 'low', cl.low ?? 48, 'len') + fld('Slope runs this far in', 'rceil', 'run', cl.run ?? 60, 'len') : ''}
    ${fld('Cabinets off the ceiling', 'rceil', 'gap', cl.gap ?? 3, 'len')}</div>
    <div class="note show">Uppers and talls always stay at least this far below the ceiling, also under a slope.</div>
    <div class="note">Shows in the 3D view (Layers › Ceiling).</div></div>`;
}
// The room outline when its walls close into a loop, else null.
function roomLoop() {
  const ws = S.walls.slice(); if (ws.length < 3) return null;
  const k = p => `${Math.round(p[0] * 4)}:${Math.round(p[1] * 4)}`, pts = [[ws[0].x1, ws[0].y1], [ws[0].x2, ws[0].y2]], used = new Set([0]);
  while (used.size < ws.length) {
    const end = k(pts[pts.length - 1]), i = ws.findIndex((w, j) => !used.has(j) && (k([w.x1, w.y1]) === end || k([w.x2, w.y2]) === end));
    if (i < 0) return null; used.add(i); const w = ws[i]; pts.push(k([w.x1, w.y1]) === end ? [w.x2, w.y2] : [w.x1, w.y1]);
  }
  return k(pts[0]) === k(pts[pts.length - 1]) ? pts.slice(0, -1) : null;
}
function vInPoly(x, y, P) { let a = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) a = !a; } return a; }
function vCeiling3d(v, material) {
  const pts = []; S.walls.forEach(w => pts.push([w.x1, w.y1], [w.x2, w.y2])); if (!pts.length) return null;
  const cl = roomCeiling(), H = +cl.h > 0 ? +cl.h : Math.max(...S.walls.map(w => w.height || 96));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const loop = roomLoop(), slope = cl.slope && cl.slope !== 'none' ? cl.slope : null, low = +cl.low > 0 ? +cl.low : 48, run = +cl.run > 0 ? +cl.run : 60;
  const hAt = (x, y) => { if (!slope) return H; const d = slope === 'N' ? y - y0 : slope === 'S' ? y1 - y : slope === 'W' ? x - x0 : x1 - x; return d >= run ? H : low + (H - low) * Math.max(0, d) / run; };
  const n = slope || loop ? 40 : 1, pos = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ax = x0 + (x1 - x0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n, ay = y0 + (y1 - y0) * j / n, by = y0 + (y1 - y0) * (j + 1) / n;
    if (loop && !vInPoly((ax + bx) / 2, (ay + by) / 2, loop)) continue;
    // Two triangles facing down, so the ceiling shows from inside the room.
    [[ax, ay], [bx, ay], [ax, by], [bx, ay], [bx, by], [ax, by]].forEach(([x, y]) => pos.push(x, hAt(x, y), y));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.userData.noBounds = true; m.userData.wall = true; return m;
}

/* ----- V18: glass hidden (Layers › Glass) shows the shelves behind glass doors in elevation ----- */
function vGlassInside(c, f, ds, x, y, w, h) {
  if (typeof layers3d !== 'function' || layers3d().glass !== false || f.type !== 'door') return '';
  if (!(ds.panelType === 'glass' || (ds.fields || []).some(q => q.pt === 'glass'))) return '';
  let zs = []; try { const p = effParams(c), lay = interiorLayout(c, p); zs = shelfHeights(lay, Math.max(0, p.shelfCount | 0)); } catch (_) { return ''; }
  return zs.filter(z => z > f.z0 + 0.5 && z < f.z1 - 0.5).map(z => `<rect class="ev-shelf nss" x="${x + 1}" y="${y + (f.z1 - z) - 0.75}" width="${w - 2}" height="0.75"/>`).join('');
}

/* ----- V19 + V15: line styles per drawing layer, and drawing templates that save them with the dimension and layer picks ----- */
const DRAW_LAYERS = [['walls', 'Walls', '.ev-wall,.wallpoly'], ['fronts', 'Doors and fronts', '.ev-front,.p-front'], ['boxes', 'Cabinet boxes', '.ev-box'], ['swings', 'Door swings', '.ev-swing,.p-swing'], ['dims', 'Dimensions', '.dimln'], ['inside', 'Inside lines', '.ev-inner'], ['tops', 'Countertops', '.ev-top'], ['molding', 'Molding', '.ev-mold']];
const DASHES = { solid: 'none', dashed: '6 4', dotted: '1.5 3', long: '12 5' };
let DRAW_STYLE = {}; try { DRAW_STYLE = JSON.parse(localStorage.getItem(KEY + '.drawStyle') || '{}') || {}; } catch (_) {}
let DRAW_TPLS = []; shopLoad('drawTpls', v => { if (Array.isArray(v)) DRAW_TPLS = v; });
function applyDrawStyle() {
  let st = document.getElementById('drawstyle'); if (!st) { st = document.createElement('style'); st.id = 'drawstyle'; document.head.appendChild(st); }
  st.textContent = DRAW_LAYERS.map(([k, , sel]) => { const d = DRAW_STYLE[k]; if (!d) return ''; const r = [];
    if (d.color) r.push(`stroke:${d.color}`); if (+d.w > 0) r.push(`stroke-width:${+d.w}px`); if (d.dash && DASHES[d.dash]) r.push(`stroke-dasharray:${DASHES[d.dash]}`);
    return r.length ? `${sel.split(',').map(s => `svg ${s}`).join(',')}{${r.map(x => x + '!important').join(';')}}` : ''; }).join('\n');
}
function drawStyleCard() {
  const cur = DRAW_TPLS.find(t => t.id === ui.drawTpl);
  return `<div class="card"><div class="cardhead"><h3>${icon('ruler')}Drawing styles</h3><button class="btn" data-act="ds-reset">Reset</button></div><div class="cardbody stack">
    <div class="note">Line color, weight and style for each kind of line in the plan and elevation. Saved on this computer.</div>
    <table class="t dstab"><thead><tr><th>Lines</th><th>Color</th><th>Weight (px)</th><th>Style</th></tr></thead><tbody>${DRAW_LAYERS.map(([k, l]) => { const d = DRAW_STYLE[k] || {};
      return `<tr><td>${l}</td><td><input type="color" class="ds-in" data-k="${k}" data-f="color" value="${esc(d.color || '#333333')}" aria-label="${l} color">${d.color ? ` <button class="btn sm" data-act="ds-nocolor" data-id="${k}" aria-label="Default color">×</button>` : ''}</td>
        <td><input type="number" step="0.25" min="0" class="ds-in" data-k="${k}" data-f="w" value="${esc(String(d.w ?? ''))}" placeholder="Default" aria-label="${l} weight"></td>
        <td><select class="ds-in" data-k="${k}" data-f="dash" aria-label="${l} style"><option value="">Default</option>${Object.keys(DASHES).map(s => `<option value="${s}"${d.dash === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table>
    <div class="eyebrow">Drawing templates</div><div class="note">Save these line styles with the dimension and 3D layer picks, and load them on any job.</div>
    <div class="mt-row">${DRAW_TPLS.length ? `<label class="f"><span>Template</span><select class="dt-pick" aria-label="Drawing template">${DRAW_TPLS.map(t => `<option value="${t.id}"${cur && cur.id === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><button class="btn primary" data-act="dt-load">Use it</button><button class="btn" data-act="dt-del">${icon('trash')}Delete</button>` : ''}
      <label class="f"><span>Save as</span><input type="text" class="dt-name" placeholder="Shop drawings" aria-label="Template name"></label><button class="btn" data-act="dt-save">${icon('plus')}Save template</button></div></div></div>`;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList) return;
  if (t.classList.contains('ds-in')) { const d = DRAW_STYLE[t.dataset.k] = DRAW_STYLE[t.dataset.k] || {}; d[t.dataset.f] = t.value; try { localStorage.setItem(KEY + '.drawStyle', JSON.stringify(DRAW_STYLE)); } catch (_) {} applyDrawStyle(); render(); }
  if (t.classList.contains('dt-pick')) { ui.drawTpl = t.value; }
});
// Look and feel gets the drawing styles card.
if (typeof renderLook === 'function') { const lookBase = renderLook; renderLook = function () { return lookBase() + drawStyleCard(); }; }
applyDrawStyle();

let vAct = function (a, id) {
  switch (a) {
    case 'ds-reset': DRAW_STYLE = {}; try { localStorage.removeItem(KEY + '.drawStyle'); } catch (_) {} applyDrawStyle(); render(); return true;
    case 'ds-nocolor': if (DRAW_STYLE[id]) delete DRAW_STYLE[id].color; try { localStorage.setItem(KEY + '.drawStyle', JSON.stringify(DRAW_STYLE)); } catch (_) {} applyDrawStyle(); render(); return true;
    case 'dt-save': { const n = (($('.dt-name') || {}).value || '').trim(); if (!n) { flash('Type a name first'); return true; } const tp = { id: uid('dt'), name: n, style: JSON.parse(JSON.stringify(DRAW_STYLE)), dims: JSON.parse(JSON.stringify(ui.dims || {})), layers: JSON.parse(JSON.stringify(ui.layers || {})) }; DRAW_TPLS.push(tp); ui.drawTpl = tp.id; shopSave('drawTpls', DRAW_TPLS, 'drawing templates'); render(); flash(`Saved ${n}`); return true; }
    case 'dt-del': { const tp = DRAW_TPLS.find(t => t.id === ui.drawTpl) || DRAW_TPLS[0]; DRAW_TPLS = DRAW_TPLS.filter(t => t !== tp); shopSave('drawTpls', DRAW_TPLS, 'drawing templates'); render(); return true; }
    case 'dt-load': {
      const tp = DRAW_TPLS.find(t => t.id === ui.drawTpl) || DRAW_TPLS[0]; if (!tp) return true;
      DRAW_STYLE = JSON.parse(JSON.stringify(tp.style || {})); try { localStorage.setItem(KEY + '.drawStyle', JSON.stringify(DRAW_STYLE)); } catch (_) {}
      if (tp.dims) ui.dims = { ...ui.dims, ...tp.dims }; if (tp.layers) { ui.layers = { ...tp.layers }; if (typeof saveLayers3d === 'function') saveLayers3d(); }
      applyDrawStyle(); render(); flash(`Using ${tp.name}`); return true;
    }
  }
  return false;
};

/* ----- V10: price sheet charges by count, and hiding zero lines ----- */
const COUNT_KINDS = [['buyout', 'Buyout doors and fronts', 'each'], ['made', 'Shop-made doors and fronts', 'each'], ['shaped', 'Shaped cabinets (front, side or top shape)', 'each'], ['cnc', 'CNC parts', 'each']];
function vCounts(cabs) {
  const n = { buyout: 0, made: 0, shaped: 0, fillers: 0, panels: 0, cnc: 0 };
  cabs.forEach(({ c }) => {
    if (c.noCount) return;
    try { computeFronts(c).forEach(f => { if (f.type === 'open') return; const { ds } = frontStyle(c, f); n[ds.source === 'buyout' ? 'buyout' : 'made']++; }); } catch (_) {}
    if (typeof hasCabShape === 'function' && hasCabShape(c)) n.shaped++;
    try { n.fillers += fillersOf(c).length; } catch (_) {}
    n.panels += ['L', 'R'].filter(sd => hasPanel(c, sd)).length;
    try { n.cnc += buildParts(c).parts.filter(p => p.cabId === c.id && p.ops.length).reduce((a, p) => a + p.qty, 0); } catch (_) {}
  });
  return n;
}
function vCountLines(ps, cabs) {
  const rates = ps.counts || {}; if (!COUNT_KINDS.some(([k]) => +rates[k])) return [];
  const n = vCounts(cabs);
  return COUNT_KINDS.filter(([k]) => +rates[k]).map(([k, l]) => ({ name: `${l} (${n[k]} × ${money(+rates[k])})`, amount: n[k] * +rates[k], zero: !n[k] }));
}
function vCountCard(ps) {
  const R = `pshp:${ps.id}:counts`, c = ps.counts || {};
  return `<div class="card"><div class="cardhead"><h3>${icon('tag')}Charges by count</h3><span class="note">Added to each room, per item counted</span></div><div class="cardbody">
    <div class="autogrid">${COUNT_KINDS.map(([k, l]) => fld(l, R, k, c[k] ?? '', 'num', { blank: true, ph: '0' })).join('')}</div>
    <label class="checkrow">${ctl('psh:' + ps.id, 'hideZero', !!ps.hideZero, 'bool', { label: 'Hide lines that come to $0' })} Hide lines that come to $0 on the quote</label></div></div>`;
}
if (typeof priceEditor === 'function') { const peBase = priceEditor; priceEditor = function (ps) { return peBase(ps) + vCountCard(ps); }; }
if (typeof priceJob === 'function') {
  const pjBase = priceJob;
  priceJob = function (ps) {
    const q = pjBase(ps);
    // Count charges go into each room, then the totals are worked out again.
    let added = 0;
    q.rooms.forEach(R => { const ls = withRoom(R.r, () => vCountLines(ps, R.cabs)); ls.forEach(l => { R.lines.push(l); R.total += l.amount; added += l.amount; }); if (ps.hideZero) R.lines = R.lines.filter(l => Math.abs(l.amount) > 0.004); });
    if (ps.hideZero) q.jobLines = q.jobLines.filter(l => Math.abs(l.amount) > 0.004);
    if (added) { q.sub += added; q.markup = q.sub * (+ps.markup || 0) / 100; q.tax = (q.sub + q.markup) * (+ps.tax || 0) / 100; q.total = q.sub + q.markup + q.tax; }
    return q;
  };
}

/* ----- V11: QR codes on labels and cabinet sheets ----- */
function qrSVG(text, size) {
  if (typeof qrcode !== 'function') return '';
  try { const q = qrcode(0, 'L'); q.addData(String(text).slice(0, 300)); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }).replace('<svg ', `<svg class="qr" style="width:${size};height:${size}" `); } catch (_) { return ''; }
}
// Short, so the code stays coarse enough to print on a small label: job, room, cabinet, part.
const qrText = p => [S.job.name, p.room || '', p.cab, p.report || p.name].join(' | ');

/* ----- V12: dynamic materials take the look of the material picked for the room ----- */
function dynLook(m) {
  if (!m || !m.dynamic) return m;
  const rm = typeof curRoom === 'function' ? curRoom() : null, id = rm && rm.dynMat || S.job.dynMat, src = id && id !== m.id ? mat(id) : null;
  return src ? { ...m, texture: src.texture, procedural: src.procedural, color: src.color, texScale: src.texScale } : m;
}
if (typeof texURL === 'function') { const txBase = texURL; texURL = function (m) { return txBase(dynLook(m)); }; }
function dynBox(rm) {
  if (!S.materials.some(m => m.dynamic)) return '';
  return `<div class="psec box">${secHead('palette', 'Dynamic finish', 'amber')}${fld('Dynamic materials look like', 'room:' + rm.id, 'dynMat', rm.dynMat || '', 'select', { options: [{ v: '', l: 'Their own look' }, ...azOpts(S.materials, m => !m.dynamic)], wide: true })}
    <div class="note">Materials marked Dynamic (${S.materials.filter(m => m.dynamic).map(m => esc(m.name)).join(', ')}) take this material's texture and color in this room.</div></div>`;
}

/* ----- V13: texture groups that have grain ----- */
let GRAIN_CATS = ['Wood'];
shopLoad('grainCats', v => { if (Array.isArray(v)) GRAIN_CATS = v; });
function grainForTex(path) { const t = (typeof TEXLIB !== 'undefined' && TEXLIB || []).find(x => 'textures/' + x.p === path); return t ? GRAIN_CATS.includes(t.c) : null; }

/* ----- V8: chained dimensions along one line in elevation ----- */
function vChainBtn() { return ui.viewMode === 'elev' ? `<button data-act="v-chain" aria-pressed="${!!ui.chainDim}" title="Click points along one line to chain dimensions; click Done or press Esc to finish">${ui.chainDim ? 'Done' : 'Chain'}</button>` : ''; }
function vChainSnap(x, w, side) {
  const L = wg(w).L, xs = [0, L]; S.cabinets.filter(c => c.wall === w.id && c.side === side).forEach(c => { const a = elevX(c, L); xs.push(a, a + c.w); });
  const best = xs.reduce((m, v) => Math.abs(v - x) < Math.abs(m - x) ? v : m, x); return Math.abs(best - x) < 1.5 ? best : Math.round(x * 16) / 16;
}
function vChainClick(e, w, side) {
  if (!ui.chainDim || e.button !== 0) return false;
  const p = elevPoint(e), x = vChainSnap(p.x, w, side);
  mutate(() => {
    w.chains = w.chains || []; let ch = w.chains.find(k => k.id === ui.chainDim);
    if (!ch) { ch = { id: ui.chainDim, side, z: Math.round(-p.y * 4) / 4, xs: [] }; w.chains.push(ch); }
    if (!ch.xs.some(v => Math.abs(v - x) < 0.01)) ch.xs.push(r3(x)); ch.xs.sort((a, b) => a - b);
  });
  return true;
}
function vChainSVG(w, side, fs, px) {
  return (w.chains || []).filter(k => k.side === side && k.xs.length > 1).map(k => {
    const y = -k.z, t = 3 * px;
    return `<g class="ev-chain"><path class="dimln nss" d="M${k.xs[0]} ${y}H${k.xs[k.xs.length - 1]}${k.xs.map(x => `M${x} ${y - t}V${y + t}`).join('')}"/>${k.xs.slice(1).map((x, i) => `<text class="lbl-m" x="${(x + k.xs[i]) / 2}" y="${y - t}" font-size="${fs}" text-anchor="middle">${fmtLen(x - k.xs[i])}</text>`).join('')}</g>`;
  }).join('');
}

/* ----- V17: fill a drawn shape with a cabinet that takes its size and outline ----- */
function vFitBox(s) {
  const libs = azOpts(S.library || []);
  if (!libs.length) return '';
  return `<div class="psec box">${secHead('box', 'Fill with a cabinet', 'violet')}<label class="f wide"><span>Product</span><select class="v-fitlib" aria-label="Product to fit">${libs.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}</select></label>
    <button class="btn" data-act="v-fit" data-id="${s.id}">${icon('plus')}Place it in this shape</button><div class="note">The cabinet takes the shape's size and position, and its outline as the cabinet's ${s.plane === 'flat' ? 'top' : 'front'} shape.</div></div>`;
}
function vFit(id) {
  const s = shapeById(id), lib = (S.library || []).find(l => l.id === ($('.v-fitlib') || {}).value); if (!s || !lib) return;
  const o = shapeOutline(s.pts), b = shapeBox(s.pts), rect = o.length === 4 && o.every(q => (Math.abs(q.x - b.x0) < 0.01 || Math.abs(q.x - b.x1) < 0.01) && (Math.abs(q.y - b.y0) < 0.01 || Math.abs(q.y - b.y1) < 0.01));
  let nc; mutate(() => {
    nc = newCab(S, lib, s.wall, s.side, s.off); nc.w = r3(b.w);
    const pts = s.pts.map(q => ({ ...q, x: r3(q.x - b.x0), y: r3(q.y - b.y0) }));
    if (s.plane === 'flat') { nc.d = r3(b.h); if (!rect) nc.shape = { top: { pts, w: nc.w, h: nc.d } }; }
    else { nc.h = r3(b.h); nc.elev = s.elev || 0; if (!rect) nc.shape = { front: { pts, w: nc.w, h: nc.h } }; }
    S.cabinets.push(nc);
  });
  ui.sel = { type: 'cab', id: nc.id }; render(); flash(`Placed ${lib.name} in the shape. Delete the shape if you no longer need it.`);
}

const vActBase = vAct;
vAct = function (a, id) {
  if (a === 'v-chain') { ui.chainDim = ui.chainDim ? null : uid('ch'); render(); return true; }
  if (a === 'v-chain-clear') { const w = wall(ui.elevWall); if (w) mutate(() => { w.chains = []; }); return true; }
  if (a === 'v-fit') { vFit(id); return true; }
  return vActBase(a, id);
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && typeof ui !== 'undefined' && ui.chainDim) { ui.chainDim = null; render(); } });
