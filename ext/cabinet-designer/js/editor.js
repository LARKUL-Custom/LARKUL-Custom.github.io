// The cabinet editor: one large popup with everything about a cabinet, laid out like Mozaik's product editor.
// Tabs across the top, the clickable face on the left, actions down the right, Previous and Next to walk the room.
// Double-click, Enter, the right-click menu and the side panel all open it.
'use strict';
const ED_TABS = [['size', 'Size', 'ruler'], ['face', 'Face', 'face'], ['interior', 'Interior', 'shelf'], ['materials', 'Materials and hardware', 'palette'], ['ends', 'Ends', 'ends'], ['shape', 'Shape', 'ruler'], ['params', 'Parameters', 'sliders'], ['parts', 'Parts', 'list'], ['price', 'Price', 'tag'], ['info', 'Info', 'hint'], ['notes', 'Notes', 'list']];
function openEditor(id, tab) {
  if (!cab(id)) return;
  hideCtx(); ui.quick = id; ui.qeBig = true; ui.qeRow = 0;
  if (tab) ui.edTab = tab;
  select({ type: 'cab', id });
}
// Cabinets of the open room in number order, for Previous and Next.
function edOrder() {
  const n = c => parseInt(String(LBL[c.id] || '').replace(/\D/g, ''), 10) || 0;
  return S.cabinets.map((c, i) => ({ c, i })).sort((a, b) => n(a.c) - n(b.c) || a.i - b.i).map(x => x.c);
}
function edStep(d) {
  const list = edOrder(), i = list.findIndex(c => c.id === ui.quick); if (!list.length) return;
  const next = list[(i + d + list.length) % list.length];
  ui.quick = next.id; ui.qeRow = 0; select({ type: 'cab', id: next.id });
}
// Split one opening into equal openings stacked on top of each other.
function edSplitRows(c, i, n) {
  const row = c.rows[i]; if (!row || n < 2) return;
  const h = row.h === '*' || row.h === '' || row.h === undefined ? '*' : +row.h / n;
  const add = Array.from({ length: n - 1 }, () => ({ type: row.type, h, count: row.count || 1 }));
  row.h = h;
  c.rows.splice(i + 1, 0, ...add);
  (c.inserts || []).forEach(it => { if (it.row !== undefined && it.row !== '' && +it.row > i) it.row = +it.row + n - 1; });
}
// Split tools over the front view, like Mozaik's: half across, half side by side, or a grid split with a count and a front.
function edTools(c, qr) {
  const row = (c.rows || [])[qr]; if (!row) return '';
  const dir = ui.edGridDir || 'h', n = +(ui.edGridN || 2), type = ui.edGridType || row.type, style = ui.edGridStyle ?? '';
  const seg = (k, list, cur) => `<div class="seg" role="group">${list.map(([v, l]) => `<button data-act="ed-gridset" data-id="${k}:${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  return `<div class="ed-tools" role="toolbar" aria-label="Split the selected opening">
      <button class="btn sm icon-only" data-act="ed-hsplit" data-id="${qr}" title="Split opening ${qr + 1} in half, top and bottom">${icon('hsplit')}</button>
      <button class="btn sm icon-only" data-act="ed-vsplit" data-id="${qr}" title="Split opening ${qr + 1} in half, side by side">${icon('vsplit')}</button>
      <button class="btn sm icon-only${ui.edGrid ? ' on' : ''}" data-act="ed-grid" title="Split into equal spaces: pick the direction, how many and the fronts" aria-expanded="${!!ui.edGrid}">${icon('gridsplit')}</button>
      <button class="btn sm icon-only" data-act="ed-join" data-id="${qr}" title="${(row.count | 0) > 1 ? `Join the ${row.count} fronts of opening ${qr + 1} into one` : `Join opening ${qr + 1} with the one below it`}"${(row.count | 0) > 1 || qr < c.rows.length - 1 ? '' : ' disabled'}>${icon('join')}</button>
      <span class="ed-sep"></span>
      <button class="btn sm icon-only" data-act="qe-rowmove" data-id="${qr}:-1" title="Move opening ${qr + 1} up"${qr ? '' : ' disabled'}>${icon('up')}</button>
      <button class="btn sm icon-only" data-act="qe-rowmove" data-id="${qr}:1" title="Move opening ${qr + 1} down"${qr < c.rows.length - 1 ? '' : ' disabled'}>${icon('down')}</button>
      <button class="btn sm icon-only" data-act="qe-rowequal" data-id="${c.id}" title="Make every opening the same height"${c.rows.length > 1 ? '' : ' disabled'}>${icon('equal')}</button>
      <button class="btn sm icon-only danger" data-act="qe-rowdel" data-id="${qr}" title="Remove opening ${qr + 1}"${c.rows.length > 1 ? '' : ' disabled'}>${icon('trash')}</button>
      <span class="muted">Opening ${qr + 1} of ${c.rows.length}</span></div>
    ${ui.edGrid ? `<div class="ed-gridform psec box">
      <div class="ed-split"><span>Direction</span>${seg('Dir', [['h', 'Stacked'], ['v', 'Side by side']], dir)}</div>
      <div class="ed-split"><span>Equal spaces</span>${seg('N', [2, 3, 4, 5, 6].map(x => [x, x]), n)}</div>
      <div class="ed-split"><span>Fill with</span>${seg('Type', QE_TYPES, type)}</div>
      ${type === 'open' ? '' : `<label class="f wide"><span>Front style</span><select data-act-change="ed-gridstyle" id="edgridstyle"><option value="">From the door template</option>${S.doorStyles.map(d => `<option value="${d.id}"${d.id === style ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`}
      <div class="row-actions"><button class="btn sm primary" data-act="ed-grid-apply" data-id="${qr}">Split opening ${qr + 1} into ${n}</button><button class="btn sm" data-act="ed-grid">Cancel</button></div></div>` : ''}`;
}
function edGridSplit(c, i) {
  const row = c.rows[i], n = Math.max(2, +(ui.edGridN || 2)), type = ui.edGridType || row.type, style = ui.edGridStyle || '';
  const set = r => { r.type = type; if (style && type !== 'open') r.style = style; else delete r.style; };
  if ((ui.edGridDir || 'h') === 'v') { row.count = n; delete row.hinge; set(row); return; }
  edSplitRows(c, i, n);
  for (let k = i; k < i + n; k++) set(c.rows[k]);
}
// Every part of the cabinet; click one to see it drawn with its banding and machining, like Mozaik's part view.
function edParts(c, b) {
  // Every part, plus the ones left out, sortable like Mozaik's Parts tab. Colour shows what was changed by hand.
  const all = [...b.parts.filter(p => p.cabId === c.id || !p.cabId), ...(b.removed || []).map(p => ({ ...p, out: true }))];
  const bandTxt = p => EDGE_KEYS.filter(k => p.band && p.band[k]).join(' ') || '';
  const cols = [['name', 'Part'], ['qty', 'Qty', 1], ['L', 'Length', 1], ['W', 'Width', 1], ['T', 'Thick', 1], ['mat', 'Material'], ['band', 'Banding'], ['ops', 'Ops', 1]];
  const sk = ui.edSort || { k: '', d: 1 }, val = (p, k) => k === 'mat' ? (mat(p.mat) || {}).name || '' : k === 'band' ? bandTxt(p) : k === 'ops' ? p.ops.length : p[k];
  const rows = sk.k ? [...all].sort((a, z) => { const x = val(a, sk.k), y = val(z, sk.k); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sk.d; }) : all;
  const K = p => peKeyOf(p), selName = all.some(p => K(p) === ui.edPart) ? ui.edPart : all[0] && K(all[0]), sel = all.find(p => K(p) === selName);
  const n = b.parts.reduce((a, p) => a + p.qty, 0), E = c.partEdits || {};
  const cls = p => { const e = E[K(p)] || {}; return [p.added ? 'pc-added' : '', e.pts ? 'pc-shape' : '', (e.ops || []).length || (e.hide || []).length ? 'pc-ops' : '', e.band ? 'pc-band' : '', e.mat ? 'pc-mat' : '', p.out ? 'pc-out' : ''].filter(Boolean).join(' '); };
  const legend = ui.edLegend ? `<div class="pc-legend"><span class="pc-shape">Shape changed</span><span class="pc-ops">Operations changed</span><span class="pc-band">Banding changed</span><span class="pc-mat">Material changed</span><span class="pc-added">Added by hand</span><span class="pc-out">Left out (not built)</span></div>` : '';
  return `<div class="psec box">${secHead('list', `${n} parts`, 'teal')}
    <div class="row-actions ed-ptools"><button class="btn sm primary" data-act="pe-add-part">${icon('plus')}Add part</button><button class="btn sm" data-act="pe-copy-part"${sel && !sel.out ? '' : ' disabled'}>Copy part</button><button class="btn sm" data-act="pe-open-name"${sel ? '' : ' disabled'}>Edit</button><button class="btn sm" data-act="pe-rebuild"${sel && E[K(sel)] ? '' : ' disabled'}>Rebuild</button>${sel && sel.added ? '<button class="btn sm danger" data-act="pe-del-part">Delete part</button>' : ''}<button class="btn sm${ui.edRebuildAll ? ' danger' : ''}" data-act="pe-rebuild-all"${Object.keys(E).length || (c.addParts || []).length ? '' : ' disabled'}>${ui.edRebuildAll ? 'Click again to rebuild every part' : 'Rebuild all parts'}</button><button class="btn sm" data-act="pe-legend" aria-pressed="${!!ui.edLegend}">Color codes</button></div>${legend}
    <div class="tscroll ed-plist"><table class="t qe-parts"><thead><tr><th title="Parts to build">Build</th>${cols.map(([k, l, num]) => `<th class="sortable${num ? ' r' : ''}" data-act="pe-sort" data-id="${k}">${l}${sk.k === k ? (sk.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(p => `<tr class="click ${cls(p)}${K(p) === selName ? ' on' : ''}" data-act="ed-part" data-id="${esc(K(p))}" title="Double-click to open the part editor"><td><input type="checkbox" class="pe-build" data-id="${esc(K(p))}"${p.out ? '' : ' checked'} aria-label="Build ${esc(p.name)}"></td><td>${esc(p.name)}${p.report ? ` <span class="muted">(${esc(p.report)})</span>` : ''}${peBadges(E[K(p)])}</td><td class="n">${p.qty}</td>${['L', 'W'].map(k => { const f = (E[K(p)] || {})[k]; return typeof f === 'string' && f ? `<td class="n fxcell" title="${esc('= ' + f)}">${fmtLen(p[k])}<span class="fxtag">ƒ</span></td>` : `<td class="n">${fmtLen(p[k])}</td>`; }).join('')}<td class="n">${fmtLen(p.T)}</td><td>${esc((mat(p.mat) || {}).name || '')}</td><td class="muted">${bandTxt(p)}</td><td class="n">${p.ops.length || ''}</td></tr>`).join('')}</tbody></table></div></div>
    ${sel ? `<div class="psec box ed-part">${secHead('ruler', esc(sel.name), 'blue')}<div class="row-actions"><button class="btn primary sm" data-act="pe-open-name">Open part editor</button><span class="note">Shape, operations, banding and details. Or double-click the part.</span></div>
      <div class="note">${fmtLen(sel.L, 1)} × ${fmtLen(sel.W, 1)} × ${fmtLen(sel.T, 1)} · ${esc((mat(sel.mat) || {}).name || '')} · banded ${EDGE_KEYS.filter(k => sel.band && sel.band[k]).join(', ') || 'nowhere'}${sel.grain ? ' · grain along the length' : ''}${sel.out ? ' · <b>left out, not built</b>' : ''}</div>
      <div class="preview">${partSVG(sel, 300)}</div>
      <div class="eyebrow">Operations (${sel.ops.length})</div>
      <div class="tscroll" style="max-height:220px;overflow:auto"><table class="t"><thead><tr><th>Operation</th><th>For</th></tr></thead><tbody>${sel.ops.map(o => `<tr><td>${esc(opText(o))}</td><td class="muted">${esc(o.why || '')}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No machining on this part</td></tr>'}</tbody></table></div></div>` : ''}`;
}
function edPrice(c) {
  const ps = priceSheet(); if (!ps) return '<div class="note">No price sheet yet. Open Pricing to make one.</div>';
  const pr = priceCab(c, ps), m = v => money(v), row = (k, v, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${k}</td><td class="n">${v}</td></tr>`;
  const fronts = ps.doors.on ? computeFronts(c).filter(f => f.type !== 'open').map(f => { const { ds } = frontStyle(c, f), sq = (f.x1 - f.x0) * (f.z1 - f.z0) / 144, p = priceFront(ds, sq, ps); return `<tr><td>${esc({ door: 'Door', drawer: 'Drawer front', false: 'False front' }[f.type] || f.type)} ${fmtLen(f.x1 - f.x0, 1)} × ${fmtLen(f.z1 - f.z0, 1)}</td><td>${esc(ds.name)}${ds.source === 'buyout' ? ' <span class="muted">buyout</span>' : ''}</td><td class="n">${m(p.labor)}</td><td class="n">${m(p.material)}</td><td class="n">${m(p.total)}</td></tr>`; }).join('') : '';
  return `<div class="psec box">${secHead('tag', `${m(pr.total)} before markup and tax`, 'teal')}<div class="note">${esc(ps.name)}. Change prices on the Pricing tab.</div>
    <table class="t ed-price"><tbody>${row('Cabinet', m(pr.box))}${ps.doors.on ? row('Doors and fronts', m(pr.doors)) : ''}${row('Drawers, shelves, inserts', m(pr.extras))}${row('Panels and fillers', m(pr.ends))}${ps.hardware.on ? row('Hardware', m(pr.hardware)) : ''}${ps.materials.on ? row('Materials', m(pr.materials)) : ''}${pr.paint ? row('Paint', m(pr.paint)) : ''}${row('<b>Total</b>', `<b>${m(pr.total)}</b>`, 'tot')}</tbody></table></div>
    ${fronts ? `<div class="psec box">${secHead('door', 'Doors and fronts', 'violet')}<div class="tscroll"><table class="t"><thead><tr><th>Front</th><th>Style</th><th class="r">Labor</th><th class="r">Material</th><th class="r">Total</th></tr></thead><tbody>${fronts}</tbody></table></div></div>` : ''}`;
}
function edTab(c, tab, qr) {
  const id = c.id, R = 'cab:' + id, P = 'cabp:' + id, p = effParams(c);
  const roomHinge = (Object.assign({}, SHOP_PARAMS, S.job.params, curRoom().params || {}, c.libParams || {})).hingeSide;
  const b = buildParts(c);
  const warns = `${b.warn.map(w => `<div class="warnbox">${esc(w)}</div>`).join('')}${conflicts(c) ? '<div class="warnbox">This cabinet runs into a wall or another cabinet. Drag it, or change its width, to clear it.</div>' : ''}`;
  switch (tab) {
    case 'size': return `${warns}<div class="psec box">${secHead('ruler', 'Size', 'teal')}${fld('Name', R, 'name', c.name, 'text', { wide: true })}${fld('Description', R, 'desc', c.desc || '', 'text', { wide: true, ph: (libItem(c.libId) || {}).name || '' })}
        <div class="grid4">${fld('Width', R, 'w', c.w, 'len')}${fld('Height', R, 'h', c.h, 'len')}${fld('Depth', R, 'd', c.d, 'len')}${fld('Elevation', R, 'elev', c.elev, 'len')}</div></div>
      <div class="psec box">${secHead('magnet', 'Position on the wall', 'blue')}
        <div class="grid4">${fld('From left', 'cabpos:' + id, 'L', r3(fromEnd(c, 'L')), 'len')}${fld('From right', 'cabpos:' + id, 'R', r3(fromEnd(c, 'R')), 'len')}${fld('Outset', R, 'outset', c.outset || 0, 'len')}</div>
        <div class="row-actions"><button class="btn sm" data-act="cab-center" data-id="${id}">${icon('ends')}Center on wall</button><button class="btn sm" data-act="cab-center-open" data-id="${id}">${icon('ends')}Center in opening</button></div></div>${typeof qSizeExtras === 'function' ? qSizeExtras(c) : ''}`;
    case 'face': {
      return `${qeOpening(c, qr, 'face')}
        <div class="psec box">${secHead('door', 'Doors and drawers', 'violet')}
          <div class="grid2">${fld('Door template', R, 'doorT', c.doorT || '', 'select', { options: setOpts('doorT', opts(S.doorTemplates), 'cab') })}${fld('Pulls', R, 'pull', c.pull || '', 'select', { options: setOpts('pull', opts(hwOf('pull')), 'cab') })}
          ${fld('Grain match', R, 'grainMatch', c.grainMatch || '', 'select', { options: [{ v: '', l: 'Off' }, { v: 'v', l: 'Vertical (fronts stacked)' }, { v: 'h', l: 'Horizontal (fronts side by side)' }] })}</div></div>`;
    }
    case 'interior': return `${qeOpening(c, qr, 'inside')}${qeInside(c)}${typeof qInteriorExtras === 'function' ? qInteriorExtras(c) : ''}`;
    case 'materials': return `<div class="psec box">${secHead('palette', 'Materials and hardware', 'amber')}${dockBody('cab-tpl')}
        <div class="grid2">${fld('Joints, unfinished ends', R, 'jointU', c.jointU || '', 'select', { options: setOpts('jointU', opts(hwOf('joint')), 'cab') })}${fld('Joints, finished ends', R, 'jointF', c.jointF || '', 'select', { options: setOpts('jointF', opts(hwOf('joint')), 'cab') })}</div></div>`;
    case 'ends': return `<div class="psec box">${secHead('ends', 'End panels and fillers', 'amber')}${endRows(c)}
        <div class="grid2">${['L', 'R'].map(e => { const k = 'end' + e, auto = (() => { const o = c[k]; c[k] = ''; const f = endFinished(c, e); c[k] = o; return f; })(); return fld(`${e === 'L' ? 'Left' : 'Right'} end`, R, k, c[k] || '', 'select', { options: [{ v: '', l: `Auto · ${auto ? 'finished' : 'unfinished'}` }, { v: 'fin', l: 'Finished (exposed)' }, { v: 'unfin', l: 'Unfinished' }] }); }).join('')}</div></div>`;
    case 'params': {
      const vars = c.vars || [];
      return `${typeof fxParamBox === 'function' ? fxParamBox(c) : `<div class="psec box">${secHead('calc', 'Custom parameters', 'violet')}
        <div class="note">Your own named values for this cabinet. Use them in any of its formulas, like <code>=W - REVEAL</code> in a width or a row height.</div>
        <table class="t ptab cvars"><tbody>${vars.map(v => `<tr><td>${ctl(`cvar:${id}:${v.id}`, 'k', v.k, 'text', { label: 'Parameter name', ph: 'NAME' })}</td><td style="width:130px">${calcWrap(ctl(`cvar:${id}:${v.id}`, 'v', v.v, 'len', { label: 'Parameter value' }), `cvar:${id}:${v.id}`, 'v')}</td><td style="width:34px"><button class="btn sm danger" data-act="cvar-del" data-id="${id}:${v.id}" aria-label="Delete ${esc(v.k)}">${icon('trash')}</button></td></tr>`).join('') || '<tr><td class="muted">None yet.</td></tr>'}</tbody></table>
        <div class="row-actions"><button class="btn sm" data-act="cvar-add" data-id="${id}">${icon('plus')}Add a parameter</button></div></div>`}
        <div class="psec box">${secHead('sliders', 'Construction parameters', 'blue')}${dockBody('cab-par')}</div>`;
    }
    case 'shape': return cabShapeTab(c);
    case 'parts': return `${edParts(c, b)}<div class="psec box">${secHead('sliders', 'Hardware', 'blue')}<table class="t bomt"><tbody>${Object.entries(b.bom).map(([n, q]) => `<tr><td>${esc(n)}</td><td class="n">${q}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</tbody></table></div>`;
    case 'price': return edPrice(c) + (typeof qPriceExtras === 'function' ? qPriceExtras(c) : '');
    case 'info': return `${qeInfo(c)}${typeof qInfoExtras === 'function' ? qInfoExtras(c) : ''}<div class="psec box">${secHead('tag', 'Custom fields', 'blue')}${dockBody('cab-cus')}</div>${typeof qLogBox === 'function' ? qLogBox(c) : ''}`;
    case 'notes': return `<div class="psec box">${secHead('list', 'Notes', 'teal')}<label class="f wide"><span>Notes for this cabinet</span><textarea data-obj="${R}" data-field="notes" data-type="text" rows="8" aria-label="Cabinet notes">${esc(c.notes || '')}</textarea></label><div class="note">Notes go out with the job file and the cut list export.</div></div>${typeof qDrawings === 'function' ? qDrawings(c) : ''}`;
  }
  return '';
}
function renderEditor(el, c) {
  const id = c.id, rows = c.rows || [], qr = Math.min(Math.max(0, ui.qeRow | 0), Math.max(0, rows.length - 1));
  if (!ED_TABS.some(([k]) => k === ui.edTab)) ui.edTab = 'size';
  const list = edOrder(), at = list.findIndex(x => x.id === id) + 1;
  const keep = el.querySelector('.ed-main'), top = keep ? keep.scrollTop : 0;
  const act = (a, ic, l, x = '') => `<button class="btn${x}" data-act="${a}" data-id="${id}">${icon(ic)}${l}</button>`;
  el.hidden = false;
  el.innerHTML = `<div class="qe big" role="dialog" aria-modal="true" aria-labelledby="qe-title">
    <div class="qe-head"><span class="chip cab">${LBL[id] || ''}</span><b id="qe-title">${esc(c.name)}</b><span class="mono muted">${fmtLen(c.w, 1)} × ${fmtLen(c.h, 1)} × ${fmtLen(c.d, 1)}</span>
      <div class="ed-nav"><button class="btn sm" data-act="ed-step" data-id="-1" title="Previous cabinet">${icon('chevl')}Previous</button><span class="muted">${at} of ${list.length}</span><button class="btn sm" data-act="ed-step" data-id="1" title="Next cabinet">Next${icon('chevr')}</button></div>
      <button class="btn sm qe-x" data-act="qe-close" aria-label="Close the cabinet editor">${icon('close')}</button></div>
    <div class="ed-tabs" role="tablist" aria-label="Cabinet editor">${ED_TABS.map(([k, l, ic]) => `<button role="tab" data-act="ed-tab" data-id="${k}" aria-selected="${ui.edTab === k}">${icon(ic)}${l}</button>`).join('')}</div>
    <div class="ed-body">
      <div class="qe-prev">${ui.edTab === 'face' ? edTools(c, qr) : ''}<div class="preview pad">${qeFaceSVG(c, qr, 620, ui.edTab === 'interior')}</div><div class="note qe-tip">${ui.edTab === 'interior' ? 'Inside view, with the doors and drawer fronts off. ' : ''}${isPhone() ? 'Tap' : 'Click'} an opening to edit it.</div></div>
      <div class="ed-main">${edTab(c, ui.edTab, qr)}</div>
      <div class="ed-acts">${act('qe-close', 'check', 'Done', ' primary')}${act('q-save', 'check', 'Save changes')}
        ${openable(c) ? act('open-toggle', 'open', ui.open[id] ? 'Close fronts' : 'Open fronts', ui.open[id] ? ' on' : '') : ''}
        ${act('cab-dup', 'copy', 'Duplicate')}${act('cab-flip', 'flip', 'Flip')}${act('show-parts', 'list', 'View cut list')}${act('q-tolib', 'stack', 'Save to library')}${act('cab-to-designer', 'cube', 'Open in Designer')}${act('cab-zoom3d', 'cube', 'See it in 3D')}
        <span class="ed-gap"></span>${act('cab-del', 'trash', 'Delete', ' danger')}</div>
    </div>
    <div class="qe-foot"><span class="note">Changes save as you go. Undo with Ctrl Z. Esc closes.</span></div></div>`;
  const m = el.querySelector('.ed-main'); if (m) m.scrollTop = top;
}
