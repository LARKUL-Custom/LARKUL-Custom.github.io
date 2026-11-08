/* ---------- Insert designer: inserts made of parts sized by formulas, like Mozaik's ----------
   A product in Libraries › Inserts can carry a list of parts. Each part has a name, a kind (what it is cut from), a
   quantity, and a width and length written as formulas of the opening it goes in, the same way Mozaik writes them:
   in millimetres, with names like openw, openh, opend (the opening), d (cabinet depth), drawerside.th (a part kind's
   thickness), tomm (25.4, so 4*tomm is 4 inches), and the product's own settings (its parameters). A formula can add
   rules after a bar: "openw-30 | If OpenD > (21*tomm) Then Length= (21*tomm)". A later rule that holds wins.
   When a product has parts, the cabinet builds those parts for it (they go to the cut list and the price) instead
   of the standard parts for its kind. */

// What each Mozaik part kind is cut from: the drawer box material, the drawer bottom material, the back, the
// cabinet material, or nothing (bought hardware: metal and plastic parts are listed, not cut).
const DP_KINDS = [
  ['DrawerSide', 'Drawer side', 'box'], ['DrawerFront', 'Drawer box front', 'box'], ['DrawerBack', 'Drawer box back', 'box'], ['DrawerBottom', 'Drawer bottom', 'bottom'],
  ['DrawerPartition', 'Drawer partition', 'box'], ['DrawerDivider', 'Drawer divider', 'box'],
  ['TraySide', 'Tray side', 'box'], ['TrayFront', 'Tray front', 'box'], ['TrayBack', 'Tray back', 'box'], ['TrayBottom', 'Tray bottom', 'bottom'],
  ['Shelf', 'Shelf', 'shelf'], ['AdjustableShelf', 'Adjustable shelf', 'shelf'], ['FixedShelf', 'Fixed shelf', 'case'],
  ['Partition', 'Partition', 'case'], ['Divider', 'Divider', 'back'], ['UBack', 'Back', 'back'], ['UEnd', 'End', 'case'], ['FEnd', 'Finished end', 'case'],
  ['PanelizedEnd', 'Panelized end', 'case'], ['Frame', 'Frame', 'case'], ['Door', 'Door', 'case'], ['Special', 'Special', 'case'],
  ['Metal', 'Metal (bought)', 'none'], ['Plastic', 'Plastic (bought)', 'none'],
];
const dpKind = t => DP_KINDS.find(k => k[0].toLowerCase() === String(t || '').toLowerCase()) || ['Special', t || 'Part', 'case'];

// Turns a Mozaik formula into a number. Only numbers, names, + - * / ( ), comparisons, And/Or and Not are allowed;
// a name that isn't known counts as 0 and is reported in miss.
const DP_FN = { sqrt: 'sqrt', abs: 'abs', round: 'round', int: 'trunc', min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan', atan: 'atan' };
function dpExpr(src, vars, miss) {
  const toks = String(src).replace(/&gt;/g, '>').replace(/&lt;/g, '<').match(/\d*\.\d+|\d+\.?|[A-Za-z_][A-Za-z_0-9.]*|<>|<=|>=|[-+*/()<>=,]|\S/g) || [];
  let js = '';
  for (const t of toks) {
    if (/^[\d.]+$/.test(t)) js += t;
    else if (/^[A-Za-z_]/.test(t)) {
      const k = t.toLowerCase();
      if (k === 'and') js += '&&'; else if (k === 'or') js += '||'; else if (k === 'not') js += '!';
      else if (DP_FN[k]) js += 'Math.' + DP_FN[k];
      else { if (!(k in vars)) { miss && miss.add(t); js += '0'; } else js += '(' + (+vars[k] || 0) + ')'; }
    } else if (t === '=') js += '==';
    else if (t === '<>') js += '!=';
    else if ('+-*/()<>,'.includes(t) || t === '<=' || t === '>=') js += t;
    else throw new Error(`"${t}" can't be used in a formula`);
  }
  if (!js.trim()) return NaN;
  const v = Function('"use strict";return (' + js + ');')();
  return typeof v === 'boolean' ? (v ? 1 : 0) : +v;
}
function dpEval(eq, vars, miss) {
  const segs = String(eq ?? '').split('|'), rule = /^\s*if\s/i.test(segs[0]);
  let v = rule || segs[0].trim() === '' ? NaN : dpExpr(segs[0], vars, miss);
  for (const s of rule ? segs : segs.slice(1)) {
    const m = s.match(/^\s*if\s+([\s\S]+?)\s+then\s+[A-Za-z ]+=\s*([\s\S]+)$/i);
    if (!m) { if (s.trim()) throw new Error(`Can't read the rule "${s.trim()}"`); continue; }
    if (dpExpr(m[1], vars, miss)) v = dpExpr(m[2], vars, miss);
  }
  return v;
}

// The names a formula can use for cabinet c with this insert in opening o ({w,h,d} in inches): sizes in mm.
function dpVars(c, o, x, mats) {
  const M = 25.4, p = c ? effParams(c) : SHOP_PARAMS, v = { tomm: M, pi: Math.PI };
  Object.assign(v, { openw: o.w * M, openh: o.h * M, opend: o.d * M, openinset: 0, openhcleartop: o.h * M, topclear: 0,
    w: (c ? c.w : o.w) * M, h: (c ? c.h : o.h) * M, d: (c ? c.d : o.d) * M, cabtoe: (c && hasToe(c) ? p.toeKickHeight : 0) * M,
    bkdado: (+p.drawerBottomDado || 0.25) * M, dslopw: 0, dslopd: 0, x: 0, y: 0, pos: 0 });
  const th = { box: mats.box, bottom: mats.bottom, back: mats.back, shelf: mats.shelf, case: mats.case, none: mats.case };
  DP_KINDS.forEach(([k, , m]) => { v[k.toLowerCase() + '.th'] = th[m] * M; });
  // Mozaik's backs sit in front of a nailer, so its formulas take "nailer.th" off the depth for what is behind the back;
  // here that is the back's inset from the back of the cabinet.
  Object.assign(v, { 'shelf.th': mats.shelf * M, 'uback.th': mats.back * M, 'nailer.th': (c && +p.backInset > 0 ? +p.backInset : mats.case) * M, 'end.th': mats.case * M, 'top.th': mats.case * M, 'bottom.th': mats.case * M });
  (x.params || []).forEach(q => { v[String(q.n).toLowerCase()] = +q.v || 0; });
  return v;
}
// The material thicknesses (inches) for cabinet c: drawer box, drawer bottom, back, shelf and cabinet.
function dpMats(c) {
  const mt = cabMatT(cabSet(c, 'cabMatT')), dmt = drawerMatT(cabSet(c, 'drawerMatT'));
  const cm = mat(mt.carcass) || S.materials[0], bm = mat(mt.back) || cm, sm = mat(mt.shelf) || cm;
  const dm = mat(dmt.sides) || cm, dbm = mat(dmt.bottom) || bm;
  return { m: { box: dm, bottom: dbm, back: bm, shelf: sm, case: cm }, t: { box: dm.thick, bottom: dbm.thick, back: bm.thick, shelf: sm.thick, case: cm.thick } };
}
// Works out every part of product x for opening o. Each line: { n, kind, cut ('box'|...|'none'), q, W, L (inches), err }.
function dpParts(x, o, c) {
  const { t } = c ? dpMats(c) : { t: { box: 0.5, bottom: 0.25, back: 0.25, shelf: 0.75, case: 0.75 } };
  const base = dpVars(c, o, x, t), miss = new Set();
  const out = (x.parts || []).map(pt => {
    const [k, label, cut] = dpKind(pt.t), v = Object.assign({}, base, { partth: t[cut === 'none' ? 'case' : cut] * 25.4 });
    const line = { n: pt.n || label, kind: label, cut, q: 1, W: 0, L: 0, err: '' };
    try {
      v.quan = line.q = Math.max(0, Math.round(dpEval(pt.q === '' || pt.q == null ? '1' : pt.q, v, miss)));
      if (!Number.isFinite(line.q)) line.q = 1;
      v.partw = v.width = dpEval(pt.w, v, miss); v.partl = v.length = dpEval(pt.l, v, miss);
      line.W = v.partw / 25.4; line.L = v.partl / 25.4;
      if (!(line.W > 0) || !(line.L > 0)) line.err = line.q ? 'comes out zero or less' : '';
    } catch (e) { line.err = e.message; }
    return line;
  });
  return { parts: out, miss: [...miss] };
}

/* ----- The designer, under the product in Libraries › Inserts ----- */
// The opening the designer tries the formulas on: the product's smallest opening, else a 24" deep base opening.
function dpTestOpening(x) {
  const t = ui.dpTest || {};
  return { w: +t.w || +x.minW || 18, h: +t.h || +x.minH || 24, d: +t.d || +x.minD || 22.5 };
}
function dpCard(x) {
  const R = 'ilib:' + x.id, o = dpTestOpening(x), { parts, miss } = dpParts(x, o, null);
  const kOpts = DP_KINDS.map(([v, l]) => ({ v, l }));
  const rows = (x.parts || []).map((pt, i) => {
    const r = parts[i], P = 'dpart:' + x.id + ':' + i;
    return `<tr${r.err ? ' class="bad"' : ''}><td>${ctl(P, 'n', pt.n || '', 'text', { label: 'Part name' })}</td>
      <td>${ctl(P, 't', dpKind(pt.t)[0], 'select', { label: 'Kind', options: kOpts })}</td>
      <td class="dp-q">${ctl(P, 'q', pt.q ?? '1', 'text', { label: 'Quantity formula' })}</td>
      <td>${ctl(P, 'w', pt.w || '', 'text', { label: 'Width formula' })}</td>
      <td>${ctl(P, 'l', pt.l || '', 'text', { label: 'Length formula' })}</td>
      <td class="dp-res">${r.err ? `<span class="dp-err" title="${esc(r.err)}">${esc(r.err)}</span>` : `<b>${r.q} ×</b> ${fmtLen(r.W, 1)} × ${fmtLen(r.L, 1)}`}</td>
      <td><button class="btn sm danger" data-act="dp-del" data-id="${esc(x.id)}:${i}" aria-label="Delete ${esc(pt.n || 'part')}">×</button></td></tr>`;
  }).join('');
  const prm = (x.params || []).map((q, i) => { const P = 'dparm:' + x.id + ':' + i;
    return `<tr><td>${ctl(P, 'n', q.n, 'text', { label: 'Setting name' })}</td><td>${ctl(P, 'd', q.d || '', 'text', { label: 'What it is', ph: 'What it is' })}</td><td class="dp-v">${q.t === 2 && q.o ? ctl(P, 'v', q.v, 'select', { label: q.n, options: String(q.o).split(',').map((l, k) => ({ v: String(k + 1), l })) }) : ctl(P, 'v', q.v, 'text', { label: q.n })}</td><td><button class="btn sm danger" data-act="dp-pdel" data-id="${esc(x.id)}:${i}" aria-label="Delete ${esc(q.n)}">×</button></td></tr>`; }).join('');
  const T = k => `<label class="dp-t"><span>${k.toUpperCase()}</span><input type="number" step="0.0625" data-dptest="${k}" value="${o[k]}" aria-label="Test opening ${k}"></label>`;
  return `<div class="card dpcard">${cardHead(`Designer <span class="ct">${(x.parts || []).length} part${(x.parts || []).length === 1 ? '' : 's'}</span>`, `<button class="btn sm" data-act="dp-padd" data-id="${esc(x.id)}">${icon('sliders')}Add a setting</button><button class="btn sm primary" data-act="dp-add" data-id="${esc(x.id)}">${icon('plus')}Add a part</button>`)}
    <div class="cardbody">
      <div class="dp-top"><div class="note help">Formulas work like Mozaik's, in millimetres: <code>openw</code> <code>openh</code> <code>opend</code> are the opening, <code>d</code> the cabinet depth, <code>drawerside.th</code> a part's thickness, <code>4*tomm</code> is 4". Add rules after a bar: <code>openw-30 | If OpenD &gt; (21*tomm) Then Length= (21*tomm)</code>.${(x.parts || []).length ? ' The cabinet builds these parts in place of the standard ones for its kind.' : ''}</div>
        <div class="dp-test"><span>Try it in an opening</span>${T('w')}${T('h')}${T('d')}</div></div>
      ${miss.length ? `<div class="note show warn">Not known, counted as 0: ${miss.map(m => `<code>${esc(m)}</code>`).join(' ')}. Add them as settings.</div>` : ''}
      ${rows ? `<div class="tscroll"><table class="t dpt"><thead><tr><th>Part</th><th>Kind</th><th>Qty</th><th>Width</th><th>Length</th><th>In this opening</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note show">No parts yet. Add a part to design this insert from parts, like Mozaik\'s insert designer. Leave it empty to use the standard parts for its kind.</div>'}
      ${prm ? `<div class="eyebrow">Settings</div><div class="tscroll"><table class="t dpt"><thead><tr><th>Name</th><th>What it is</th><th>Value</th><th></th></tr></thead><tbody>${prm}</tbody></table></div>` : ''}
    </div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="dp-"]'); if (!b) return;
  e.stopPropagation();
  const [id, i] = String(b.dataset.id).split(':'), x = intItem(id); if (!x) return;
  if (b.dataset.act === 'dp-add') mutate(() => { (x.parts = x.parts || []).push({ n: 'Part ' + ((x.parts.length || 0) + 1), t: 'DrawerSide', q: '1', w: '4*tomm', l: 'opend-(1*tomm)' }); });
  else if (b.dataset.act === 'dp-del') mutate(() => { x.parts.splice(+i, 1); });
  else if (b.dataset.act === 'dp-padd') mutate(() => { (x.params = x.params || []).push({ n: 'Setting' + ((x.params.length || 0) + 1), v: '0' }); });
  else if (b.dataset.act === 'dp-pdel') mutate(() => { x.params.splice(+i, 1); });
}, true);
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.dptest; if (!k) return;
  ui.dpTest = Object.assign(ui.dpTest || {}, { [k]: +e.target.value || 0 }); renderInserts();
});

// The cabinet builds a designed insert's parts. Called from buildParts with the part() maker.
function dpBuild(c, part, addB, warn) {
  const ins = (c.inserts || []).filter(it => (intItemOf(it) || {}).parts && intItemOf(it).parts.length);
  if (!ins.length) return;
  const { m } = dpMats(c);
  ins.forEach(it => {
    const x = intItemOf(it), row = it.row !== undefined && it.row !== '' ? +it.row : (c.rows || []).length - 1;
    const o = intOpening(c, row); if (!o) return;
    const n = Math.max(1, it.n | 0), { parts, miss } = dpParts(x, o, c);
    parts.forEach(r => {
      if (!r.q) return;
      if (r.err) { warn.push(`${x.name}: ${r.n} ${r.err}. Check its formulas in Libraries › Inserts.`); return; }
      if (r.cut === 'none') { addB(`${x.name}: ${r.n}`, r.q * n); return; }
      part(`${x.name} ${r.n}`, m[r.cut] || m.case, Math.max(r.L, r.W), Math.min(r.L, r.W), { qty: r.q * n, kind: r.cut === 'box' ? 'drawerBox' : r.cut === 'bottom' ? 'drawerBottom' : r.cut === 'shelf' ? 'shelf' : 'divider' });
    });
    if (miss.length) warn.push(`${x.name}: ${miss.join(', ')} not known, counted as 0.`);
  });
}
