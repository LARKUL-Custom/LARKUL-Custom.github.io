/* ---------- Operations, part 2 (Mozaik list O1–O19) ----------
   The CNC tool library and machine settings, more operation types (32 mm line bore, perimeter path, edge bore,
   engraved text), operation templates, copy and paste of operations, the bit simulation and the checks that
   warn when an operation runs off its part. */
'use strict';

/* ----- CNC tool library (O12) and machine settings (O14). Kept for every job, like the price sheets. ----- */
// Sizes in mm, rates in mm a minute. Pass depth 0 = cut the full depth in one pass.
const CNC_TOOL_TYPES = [['cutout', 'Cut out / route'], ['pocket', 'Pocket'], ['drill', 'Drill'], ['vbit', 'V-bit'], ['engrave', 'Engrave']];
const defaultCncTools = () => [
  { id: '1_2COMP', number: 1, dia: 12.7, type: 'cutout', passDepth: 19, stepover: 70, plunge: 4000, feed: 12000, thruExtra: 0.3 },
  { id: '3_8COMP', number: 2, dia: 9.525, type: 'pocket', passDepth: 12, stepover: 70, plunge: 4000, feed: 10000, thruExtra: 0.3 },
  { id: '1_4SPDN', number: 3, dia: 6.11, type: 'pocket', passDepth: 8, stepover: 60, plunge: 3000, feed: 8000, thruExtra: 0.3 },
  { id: '1_8DOWN', number: 4, dia: 3.175, type: 'engrave', passDepth: 4, stepover: 50, plunge: 2000, feed: 5000, thruExtra: 0.3 },
  { id: '90SHARP', number: 5, dia: 12.7, type: 'vbit', passDepth: 0, stepover: 0, plunge: 2000, feed: 6000, thruExtra: 0 },
];
const defaultMachine = () => ({ edgeDrill: false, tabs: false, tabLen: 10, tabH: 3, tabsUnder: 0.25, onion: 0, ramp: true, rampLen: 50, climb: true,
  bradTip: 0, forstnerTip: 0, fileName: '{JOB} parts', cixName: '{JOB} {MATERIAL} {SHEET}', pass2: false, pass2Climb: false, returnSkin: false, stayDown: false, remnantMin: 0 });
let CNC_LIB = { tools: defaultCncTools(), machine: defaultMachine() };
async function loadCncLib() {
  try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get('cncTools') : JSON.parse(localStorage.getItem(KEY + '.cncTools') || 'null'); if (v && v.value) v = v.value; if (v && Array.isArray(v.tools) && v.tools.length) CNC_LIB = { tools: v.tools, machine: { ...defaultMachine(), ...(v.machine || {}) } }; } catch (_) {}
}
let cncLibTimer = null;
function saveCncLib() {
  clearTimeout(cncLibTimer);
  cncLibTimer = setTimeout(() => {
    try { localStorage.setItem(KEY + '.cncTools', JSON.stringify(CNC_LIB)); } catch (_) {}
    if (typeof inHub === 'function' && inHub()) Hub.storage.set('cncTools', CNC_LIB).catch(() => flash('Could not save the CNC tools.'));
  }, 300);
}
const cncTool = id => CNC_LIB.tools.find(t => t.id === id);
// Straight bits for routes and pockets, biggest first, as [name, mm] like the old fixed list.
const cncStraight = () => CNC_LIB.tools.filter(t => t.type !== 'vbit' && t.type !== 'drill').sort((a, b) => b.dia - a.dia).map(t => [t.id, t.dia]);
// How many passes a cut this deep takes with this tool, and the depth of each.
function cncPasses(toolId, depth) {
  const t = cncTool(toolId), pd = t && t.passDepth > 0 ? t.passDepth : 0;
  if (!pd || depth <= pd + 1e-6) return [depth];
  const n = Math.ceil(depth / pd - 1e-6); return Array.from({ length: n }, (_, i) => Math.round(depth * (i + 1) / n * 1000) / 1000);
}

function renderCncTools() {
  const T = CNC_LIB.tools, m = CNC_LIB.machine, n = (k, v, step = 'any') => `<input type="number" step="${step}" class="ct-in" data-k="${k}" value="${esc(String(v ?? ''))}" aria-label="${k}">`;
  $('#tab-cnctools').innerHTML = `<div class="pagehead"><div><h2>CNC tools</h2><p>Every tool the part editor and the CNC file can use. Sizes in millimeters, rates in mm a minute. Pass depth splits deep cuts into passes; 0 cuts the full depth at once. These are kept for every job.</p></div>
    <div class="row-actions"><button class="btn primary" data-act="ct-add">${icon('plus')}Add tool</button><button class="btn" data-act="ct-reset">Back to the starting tools</button></div></div>
    <div class="card tscroll"><table class="t cttab"><thead><tr><th>Name</th><th class="r">Number</th><th>Type</th><th class="r">Diameter</th><th class="r">Pass depth</th><th class="r">Stepover %</th><th class="r">Plunge rate</th><th class="r">Feed rate</th><th class="r">Through-cut extra</th><th></th></tr></thead><tbody>
    ${T.map((t, i) => `<tr data-i="${i}"><td><input class="ct-in" data-k="id" value="${esc(t.id)}" aria-label="Tool name"></td><td>${n('number', t.number, 1)}</td><td><select class="ct-in" data-k="type" aria-label="Tool type">${CNC_TOOL_TYPES.map(([v, l]) => `<option value="${v}"${t.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
      <td>${n('dia', t.dia)}</td><td>${n('passDepth', t.passDepth)}</td><td>${n('stepover', t.stepover, 1)}</td><td>${n('plunge', t.plunge, 1)}</td><td>${n('feed', t.feed, 1)}</td><td>${n('thruExtra', t.thruExtra)}</td>
      <td><button class="btn sm danger" data-act="ct-del" data-id="${i}"${T.length < 2 ? ' disabled' : ''} aria-label="Delete ${esc(t.id)}">×</button></td></tr>`).join('')}</tbody></table></div>
    <div class="card cardbody"><h3>Machine settings</h3><div class="note">Sent with the parts file so CNC Cutlist can use them when it cuts the parts out.</div>
      <div class="grid4 ctmach">
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="edgeDrill"${m.edgeDrill ? ' checked' : ''}> <span>Machine drills into edges</span></label>
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="tabs"${m.tabs ? ' checked' : ''}> <span>Tabs hold small parts</span></label>
        <label class="f"><span>Tab length (mm)</span><input type="number" class="cm-in" data-k="tabLen" value="${m.tabLen}"></label>
        <label class="f"><span>Tab height (mm)</span><input type="number" class="cm-in" data-k="tabH" value="${m.tabH}"></label>
        <label class="f"><span>Tabs on parts under (sq ft)</span><input type="number" step="any" class="cm-in" data-k="tabsUnder" value="${m.tabsUnder}"></label>
        <label class="f"><span>Onion skin left on cut-outs (mm)</span><input type="number" step="any" class="cm-in" data-k="onion" value="${m.onion}"></label>
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="ramp"${m.ramp ? ' checked' : ''}> <span>Ramp in instead of plunging</span></label>
        <label class="f"><span>Ramp length (mm)</span><input type="number" class="cm-in" data-k="rampLen" value="${m.rampLen}"></label>
        <label class="f"><span>Cut direction</span><select class="cm-in" data-k="climb"><option value="1"${m.climb ? ' selected' : ''}>Climb</option><option value=""${m.climb ? '' : ' selected'}>Conventional</option></select></label>
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="pass2"${m.pass2 ? ' checked' : ''}> <span>Second (finish) pass on cut-outs</span></label>
        ${m.pass2 ? `<label class="f"><span>Second pass direction</span><select class="cm-in" data-k="pass2Climb"><option value="1"${m.pass2Climb ? ' selected' : ''}>Climb</option><option value=""${m.pass2Climb ? '' : ' selected'}>Conventional</option></select></label>` : ''}
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="returnSkin"${m.returnSkin ? ' checked' : ''}> <span>Come back and cut the onion skin</span></label>
        <label class="f chk"><input type="checkbox" class="cm-in" data-k="stayDown"${m.stayDown ? ' checked' : ''}> <span>Stay down between passes</span></label>
        <label class="f"><span>Brad point tip allowance (mm)</span><input type="number" step="any" class="cm-in" data-k="bradTip" value="${m.bradTip ?? 0}"></label>
        <label class="f"><span>Forstner tip allowance (mm)</span><input type="number" step="any" class="cm-in" data-k="forstnerTip" value="${m.forstnerTip ?? 0}"></label>
        <label class="f"><span>Keep a remnant when its short side is over (mm, 0 = off)</span><input type="number" step="any" class="cm-in" data-k="remnantMin" value="${m.remnantMin ?? 0}"></label>
        <label class="f"><span>Parts file name</span><input type="text" class="cm-in cm-txt" data-k="fileName" value="${esc(m.fileName || '{JOB} parts')}" placeholder="{JOB} parts"></label>
        <label class="f"><span>CNC program name</span><input type="text" class="cm-in cm-txt" data-k="cixName" value="${esc(m.cixName || '')}" placeholder="{JOB} {MATERIAL} {SHEET}"></label>
      </div><div class="note">Names can use {JOB}, {CUSTOMER}, {DATE}, and for programs {MATERIAL} and {SHEET}. Allowances go on blind holes 15 mm and up (Forstner) or smaller (brad point). The second pass, return skin, stay down and remnant size go to CNC Cutlist with the file.</div></div>`;
}
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.classList && t.classList.contains('ct-in')) {
    const i = +t.closest('tr').dataset.i, tool = CNC_LIB.tools[i], k = t.dataset.k; if (!tool) return;
    tool[k] = k === 'id' ? (t.value.trim().replace(/\s+/g, '_') || tool.id) : k === 'type' ? t.value : (isFinite(+t.value) ? +t.value : 0);
    saveCncLib(); renderCncTools();
  } else if (t.classList && t.classList.contains('cm-in')) {
    const k = t.dataset.k; CNC_LIB.machine[k] = t.type === 'checkbox' ? t.checked : t.classList.contains('cm-txt') ? t.value : (k === 'climb' || k === 'pass2Climb') ? !!t.value : +t.value || 0; saveCncLib(); if (k === 'pass2') renderCncTools();
  }
});
function cncToolsAct(a, id) {
  if (a === 'ct-add') { const n = Math.max(0, ...CNC_LIB.tools.map(t => t.number || 0)) + 1; CNC_LIB.tools.push({ id: 'TOOL' + n, number: n, dia: 6, type: 'pocket', passDepth: 6, stepover: 60, plunge: 2000, feed: 6000, thruExtra: 0.3 }); }
  else if (a === 'ct-del') CNC_LIB.tools.splice(+id, 1);
  else if (a === 'ct-reset') CNC_LIB.tools = defaultCncTools();
  else return false;
  saveCncLib(); renderCncTools(); return true;
}

/* ----- Engraved text (O18): a small single-line font, drawn on a 4 wide by 6 tall grid ----- */
const STROKE_FONT = {
  A: [[[0, 0], [2, 6], [4, 0]], [[1, 3], [3, 3]]], B: [[[0, 0], [0, 6], [3, 6], [4, 5], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]], D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]], F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]], J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]], K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1, 3], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]], M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]], N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]], P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  Q: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], [[2, 2], [4, 0]]], R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]], T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]], V: [[[0, 6], [2, 0], [4, 6]]], W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]], Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]], Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  0: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], [[0, 1], [4, 5]]], 1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]], 3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]], [[1, 3], [3, 3]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]], 5: [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  6: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]], 7: [[[0, 6], [4, 6], [1, 0]]],
  8: [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  9: [[[4, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  '-': [[[1, 3], [3, 3]]], '.': [[[2, 0], [2, 0.4]]], '/': [[[0, 0], [4, 6]]], '#': [[[1, 0], [1, 6]], [[3, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]], '+': [[[2, 1], [2, 5]], [[0, 3], [4, 3]]],
  ':': [[[2, 1], [2, 1.4]], [[2, 4], [2, 4.4]]], '&': [[[4, 0], [1, 4], [1, 5], [2, 6], [3, 5], [0, 2], [0, 1], [1, 0], [2, 0], [4, 2]]],
};
// Strokes for a line of text: height is the capital height, x and y the left end of the baseline, angle in degrees.
function textStrokes(text, height, x, y, angle) {
  const k = height / 6, a = (angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), out = [];
  [...String(text || '').toUpperCase()].forEach((ch, i) => {
    const g = STROKE_FONT[ch]; if (!g) return; const ox = i * 6;
    g.forEach(st => out.push(st.map(([gx, gy]) => { const u = (ox + gx) * k, v = gy * k; return { x: x + u * ca - v * sa, y: y + u * sa + v * ca }; })));
  });
  return out;
}

/* ----- More operation types in the part editor. Each turns into the plain operations the cut list and CNC know. ----- */
// u: the user operation, P: point evaluator (user frame, y up), Y: to the drilling frame, push: adds a finished operation.
function peExtraOp(u, q, n, P, Y, push, face, why, thru, depth, ui_) {
  const pt0 = P((u.pts || [])[0] || { x: 0, y: 0 });
  if (u.type === 'linebore') {
    const cnt = Math.max(1, Math.round(n(u.count) || 1)), sp = n(u.spacing) || 32 / 25.4, ang = (n(u.angle) || 0) * Math.PI / 180, dia = n(u.dia) || 5 / 25.4, row = n(u.row2) || 0;
    const rows = row ? [0, row] : [0];
    rows.forEach(off => { for (let i = 0; i < cnt; i++) { const x = pt0.x + Math.cos(ang) * sp * i - Math.sin(ang) * off, y = pt0.y + Math.sin(ang) * sp * i + Math.cos(ang) * off; push({ type: 'bore', x: r3(x), y: Y(y), dia: r3(dia), depth: thru ? q.T : r3(depth), through: thru, face, why, user: ui_ }); } });
    return true;
  }
  if (u.type === 'perimeter') {
    const o = q.outline || [{ x: 0, y: 0 }, { x: q.L, y: 0 }, { x: q.L, y: q.W }, { x: 0, y: q.W }], ccw = polyArea(o) > 0, inset = n(u.inset) || 0;
    const ring = offsetPath(o, ccw ? inset : -inset, true);
    const tool = u.tool || peDefTool(), d = thru ? q.T : r3(depth);
    push({ type: 'path', pts: ring.map(z => ({ x: r3(z.x), y: Y(z.y) })), closed: true, pocket: false, side: u.side || 'center', depth: d, through: thru, tool, dia: r3(peToolDia(tool)), face, why, user: ui_, passes: pePassCount(tool, d) });
    return true;
  }
  if (u.type === 'edgebore') {
    // Positions along the edge: from the bottom edge on W1/W2, from the left end on L1/L2. Drilling frame: L1 is y = 0.
    const dia = n(u.dia) || 8 / 25.4, inset = n(u.inset) || q.T / 2, edge = u.edge || 'W1';
    String(u.at ?? '').split(/[,;]/).map(t => t.trim()).filter(Boolean).forEach(t => {
      const v = n(t); if (!isFinite(v)) return;
      const at = edge === 'W1' ? { x: 0, y: Y(v) } : edge === 'W2' ? { x: q.L, y: Y(v) } : edge === 'L1' ? { x: v, y: 0 } : { x: v, y: q.W };
      push({ type: 'hbore', edge: edge + ' edge', ...{ x: r3(at.x), y: r3(at.y) }, dia: r3(dia), depth: r3(depth > 0 ? depth : 1), inset: r3(inset), why, user: ui_ });
    });
    return true;
  }
  if (u.type === 'text') {
    textStrokes(u.text || '', n(u.height) || 1, pt0.x, pt0.y, n(u.angle)).forEach(st => push({ type: 'path', pts: st.map(z => ({ x: r3(z.x), y: Y(z.y) })), closed: false, pocket: false, side: 'center', depth: r3(depth || 0.04), through: false, tool: u.tool || peEngraveTool(), dia: r3(peToolDia(u.tool || peEngraveTool())), face, why: why + ' (engrave)', engrave: true, user: ui_ }));
    return true;
  }
  return false;
}
const peEngraveTool = () => { const t = CNC_LIB.tools.find(x => x.type === 'engrave') || CNC_LIB.tools.slice().sort((a, b) => a.dia - b.dia)[0]; return t ? t.id : 'TOOL'; };
// O17: arcs inside a tool path. A point's b bulges the segment to the next point (+ to the right of travel).
function peFlatPath(pts, closed) {
  if (!pts.some(p => p.b)) return pts;
  const out = []; pts.forEach((p, i) => { out.push({ x: p.x, y: p.y }); const nx = pts[i + 1] || (closed ? pts[0] : null); if (nx && p.b) out.push(...bulgeArc(p, nx, p.b, true)); });
  return out;
}
// O19: an operation that runs off the part, or goes deeper than it.
function peCheckOps(q, warn) {
  const off = (x, y) => x < -0.01 || y < -0.01 || x > q.L + 0.01 || y > q.W + 0.01, seen = new Set(), say = (o, m) => { const k = o.user + m; if (!seen.has(k)) { seen.add(k); warn.push(`${q.name}: ${o.why || o.type} ${m}.`); } };
  q.ops.forEach(o => {
    if (o.user === undefined) return;
    if (o.type === 'bore' && off(o.x, o.y)) say(o, 'has a hole off the part');
    if (o.type === 'groove' && (off(o.x1, o.y1) || off(o.x2, o.y2))) say(o, 'runs off the part');
    if (o.type === 'path' && o.pts.some(z => off(z.x, z.y))) say(o, 'runs off the part');
    if (!o.through && o.depth > q.T + 0.001 && o.type !== 'hbore') say(o, `is deeper (${fmtLen(o.depth, 1)}) than the part is thick (${fmtLen(q.T, 1)})`);
    if (o.type === 'hbore' && o.depth > (/^W/.test(o.edge) ? q.L : q.W)) say(o, 'goes deeper than the part is long');
    if (o.type === 'hbore' && o.inset > q.T) say(o, 'is set in further than the part is thick');
  });
}

/* ----- Operation templates (O11) and copy and paste of operations (O10) ----- */
const defaultOpTemplates = () => [
  { id: 'opt-led', name: 'LED groove', op: { type: 'groove', name: 'LED groove', width: 0.5, depth: 0.375, face: 'top', pts: [{ x: 0, y: 1, ay: 'T' }, { x: 0, y: 1, ax: 'R', ay: 'T' }] } },
  { id: 'opt-legs', name: 'Leg holes', op: { type: 'drill', name: 'Leg holes', dia: 1.375, depth: 0.375, face: 'back', pts: [{ x: 3, y: 3 }, { x: 3, y: 3, ax: 'R' }, { x: 3, y: 3, ax: 'R', ay: 'T' }, { x: 3, y: 3, ay: 'T' }] } },
  { id: 'opt-slide', name: 'Sliding door track', op: { type: 'groove', name: 'Sliding door track', width: 0.25, depth: 0.25, face: 'top', pts: [{ x: 0, y: 1 }, { x: 0, y: 1, ax: 'R' }] } },
  { id: 'opt-32', name: 'System holes (32 mm)', op: { type: 'linebore', name: 'System holes', count: 'floor((PartL - 4)/(32*mm)) + 1', spacing: '32*mm', angle: 0, row2: 0, dia: '5*mm', depth: '13*mm', face: 'top', pts: [{ x: 2, y: '37*mm' }] } },
];
let OP_TEMPLATES = [];
async function loadOpTemplates() {
  try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get('opTemplates') : JSON.parse(localStorage.getItem(KEY + '.opTemplates') || 'null'); if (v && v.value) v = v.value; OP_TEMPLATES = Array.isArray(v) ? v : defaultOpTemplates(); } catch (_) { OP_TEMPLATES = defaultOpTemplates(); }
}
function saveOpTemplates() {
  try { localStorage.setItem(KEY + '.opTemplates', JSON.stringify(OP_TEMPLATES)); } catch (_) {}
  if (typeof inHub === 'function' && inHub()) Hub.storage.set('opTemplates', OP_TEMPLATES).catch(() => flash('Could not save the operation templates.'));
}
let opClip = null;

/* ----- Simulation (O8): a dot runs the bit over every cut on the part, in order ----- */
function peSimPaths(q) {
  // Operations are already in the drawing's frame (y down from L1); only the outline is stored y up.
  const Y = y => q.W - y, out = [];
  q.ops.forEach(o => {
    if (o.type === 'bore') out.push({ pts: [{ x: o.x, y: o.y }], drill: true });
    else if (o.type === 'groove') out.push({ pts: [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }] });
    else if (o.type === 'path') {
      const pts = o.pts.map(z => ({ x: z.x, y: z.y }));
      if (o.pocket) pocketPaths(o.pts, o.dia || 0.375, o.pocketOpts).forEach(pp => out.push({ pts: pp.map(z => ({ x: z.x, y: z.y })) }));
      else out.push({ pts: o.closed ? [...pts, pts[0]] : pts });
    }
  });
  const o = q.outline || [{ x: 0, y: 0 }, { x: q.L, y: 0 }, { x: q.L, y: q.W }, { x: 0, y: q.W }];
  out.push({ pts: [...o, o[0]].map(z => ({ x: z.x, y: Y(z.y) })), outline: true });
  return out;
}
let peSimRun = 0;
function peSimulate() {
  const r = pePart(), svg = $('#partedit svg.pe-draw'); if (!r || !r.q || !svg) return;
  const runId = ++peSimRun, paths = peSimPaths(r.q), segs = [];
  let last = null;
  paths.forEach(p => { if (last) segs.push({ a: last, b: p.pts[0], rapid: true }); for (let i = 0; i + 1 < p.pts.length; i++) segs.push({ a: p.pts[i], b: p.pts[i + 1] }); if (p.drill) segs.push({ a: p.pts[0], b: p.pts[0], drill: true }); last = p.pts[p.pts.length - 1]; });
  const len = s => s.drill ? 3 : Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * (s.rapid ? 0.25 : 1), total = segs.reduce((a, s) => a + len(s), 0) || 1;
  const ns = 'http://www.w3.org/2000/svg', g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'pe-sim'); svg.appendChild(g);
  const trail = document.createElementNS(ns, 'polyline'); trail.setAttribute('class', 'pe-simtrail nss'); g.appendChild(trail);
  const dot = document.createElementNS(ns, 'circle'); dot.setAttribute('r', String(Math.max(r.q.L, r.q.W) / 90 + 0.15)); dot.setAttribute('class', 'pe-simdot'); g.appendChild(dot);
  const ms = Math.min(12000, 2500 + total * 25), t0 = performance.now(), pts = [];
  const step = now => {
    if (runId !== peSimRun || !dot.isConnected) return;
    let d = Math.min(1, (now - t0) / ms) * total, at = segs.length ? segs[segs.length - 1].b : { x: 0, y: 0 }, rapid = false;
    for (const s of segs) { const l = len(s); if (d <= l) { const k = l ? d / l : 1; at = { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k }; rapid = s.rapid; break; } d -= l; }
    dot.setAttribute('cx', at.x); dot.setAttribute('cy', at.y); dot.classList.toggle('rapid', rapid);
    if (!rapid) { pts.push(`${r3(at.x)},${r3(at.y)}`); trail.setAttribute('points', pts.join(' ')); }
    if (now - t0 < ms) requestAnimationFrame(step); else setTimeout(() => { if (g.isConnected) g.remove(); }, 1500);
  };
  requestAnimationFrame(step);
}

loadCncLib(); loadOpTemplates();
