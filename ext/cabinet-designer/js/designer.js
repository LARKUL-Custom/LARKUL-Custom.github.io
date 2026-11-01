// Cabinet designer: build a custom cabinet with a live 3D and front preview, then save it to the library.
'use strict';
let designerViewer = null;
function blankDesign(cat = 'Base') {
  return {
    sourceLib: null, name: 'Custom ' + cat.toLowerCase() + ' cabinet', cat,
    w: 24, h: cat === 'Wall' ? 36 : cat === 'Tall' ? 90 : 34.5, d: cat === 'Wall' ? 12 : 24, elev: cat === 'Wall' ? 54 : 0,
    rows: clone(cat === 'Base' ? FACE_PRESETS[2].rows : cat === 'Wall' ? FACE_PRESETS[1].rows : FACE_PRESETS[9].rows),
    params: {}, construction: defaultConstruction(cat),
    cabMatT: '', drawerMatT: '', doorT: '', slide: '', hinge: '', partT: '', appliedL: false, appliedR: false, custom: [], inserts: [],
  };
}
function designFromLib(l) {
  return { ...blankDesign(l.cat), sourceLib: l.id, name: l.name, cat: l.cat, w: l.w, h: l.h, d: l.d, elev: l.elev, rows: clone(l.rows), params: clone(l.params || {}),
    construction: clone(l.construction || defaultConstruction(l.cat)), cabMatT: l.cabMatT || '', drawerMatT: l.drawerMatT || '',
    doorT: l.doorT || '', slide: l.slide || '', hinge: l.hinge || '', partT: l.partT || '', appliedL: !!l.appliedL, appliedR: !!l.appliedR, custom: clone(l.custom || []), inserts: clone(l.inserts || []) };
}
function designCab() {
  const d = S.designer;
  return { id: '_designer', libId: d.sourceLib, name: d.name, cat: d.cat, w: d.w, h: d.h, d: d.d, elev: d.elev, wall: null, side: 1, off: 0,
    cabMatT: d.cabMatT, drawerMatT: d.drawerMatT, doorT: d.doorT, slide: d.slide, hinge: d.hinge, partT: d.partT || '', pull: '', panelStyle: '',
    appliedL: d.appliedL, appliedR: d.appliedR, molding: null, construction: d.construction, rows: d.rows, libParams: {}, params: d.params, custom: d.custom, inserts: d.inserts || [],
    finInt: d.finInt, grainMatch: d.grainMatch, vars: d.vars };
}
// The design as a cabinet whose changes write back into the design.
function desCabLive() {
  const d = S && S.designer; if (!d) return null;
  if (!d.inserts) d.inserts = [];
  const skip = { id: 1, libId: 1, wall: 1, side: 1, off: 1, libParams: 1, molding: 1, pull: 1, panelStyle: 1 };
  return new Proxy(designCab(), {
    set(o, k, v) { o[k] = v; if (!skip[k]) d[k] = v; return true; },
    deleteProperty(o, k) { delete o[k]; if (!skip[k]) delete d[k]; return true; },
  });
}
function designToLib(d, id) {
  return { id, name: d.name, cat: d.cat, w: d.w, h: d.h, d: d.d, elev: d.elev, rows: clone(d.rows), params: clone(d.params), construction: clone(d.construction),
    cabMatT: d.cabMatT, drawerMatT: d.drawerMatT, doorT: d.doorT, slide: d.slide, hinge: d.hinge, partT: d.partT || '', appliedL: d.appliedL, appliedR: d.appliedR, custom: clone(d.custom), inserts: clone(d.inserts || []), finInt: d.finInt, grainMatch: d.grainMatch };
}
// A folded section of the designer form; it stays open or shut as you left it.
function desFold(k, title, body) {
  const open = (ui.desFold || {})[k];
  return `<details class="psec box des-fold" data-fold="${k}"${open ? ' open' : ''}><summary><b>${title}</b></summary>${open ? body : ''}</details>`;
}
document.addEventListener('toggle', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('des-fold')) return;
  ui.desFold = ui.desFold || {}; if (!!ui.desFold[t.dataset.fold] === t.open) return;
  ui.desFold[t.dataset.fold] = t.open; renderDesigner();
}, true);
function renderDesigner() {
  if (ui.desMode === 'shape') return renderShapeDesigner();
  if (!S.designer) S.designer = blankDesign();
  const d = S.designer, c = designCab(); LBL[c.id] = 'New';
  const qr = Math.min(Math.max(0, ui.qeRow | 0), Math.max(0, (d.rows || []).length - 1));
  const b = buildParts(c), nParts = b.parts.reduce((a, p) => a + p.qty, 0), nOps = b.parts.reduce((a, p) => a + p.ops.length * p.qty, 0);
  const src = d.sourceLib && libItem(d.sourceLib);
  const host = $('#tab-designer');
  const keep3d = host.querySelector('#des3d');
  const html = `<div class="pagehead"><div><button class="linkbtn back" data-act="tab" data-id="library">${icon('back')}Products</button><h2>Cabinet designer</h2></div>
    <div class="row-actions">${desModeSeg()}<select id="des-load" aria-label="Start from"><option value="">Start from…</option><option value="new:Base">Blank base</option><option value="new:Wall">Blank wall</option><option value="new:Tall">Blank tall</option>${S.library.map(l => `<option value="lib:${l.id}">${esc(l.name)}</option>`).join('')}</select>
    ${src ? `<button class="btn" data-act="des-update">Update “${esc(src.name)}”</button>` : ''}<button class="btn primary" data-act="des-save">Save as new template</button></div></div>
  <div class="designer">
    <div class="card stack cardbody des-form">
      ${src ? `<div class="note">Editing a copy of <b>${esc(src.name)}</b>.</div>` : ''}
      <div class="psec box"><div class="grid2">${fld('Name', 'des', 'name', d.name, 'text')}${fld('Category', 'des', 'cat', d.cat, 'select', { options: ['Base', 'Wall', 'Tall'] })}</div>
      <div class="grid3">${fld('Width', 'des', 'w', d.w, 'len')}${fld('Height', 'des', 'h', d.h, 'len')}${fld('Depth', 'des', 'd', d.d, 'len')}</div></div>
      ${qeOpening(c, qr)}
      ${desFold('box', 'Box', `${fld('Elevation', 'des', 'elev', d.elev, 'len')}
        <div class="checkrow"><label>${ctl('desc', 'toeKick', d.construction.toeKick, 'bool', { label: 'Raised base (feet or toe kick)' })} Feet / toe kick</label>${ctl('desc', 'top', d.construction.top, 'select', { options: [{ v: 'full', l: 'Full top' }, { v: 'stretchers', l: 'Stretchers' }], label: 'Top' })}</div>
        <div class="checkrow"><label>${ctl('des', 'appliedL', d.appliedL, 'bool', { label: 'Left panel' })} Applied left end</label><label>${ctl('des', 'appliedR', d.appliedR, 'bool', { label: 'Right panel' })} Applied right end</label></div>
        ${qeInside(c)}`)}
      ${desFold('mat', 'Materials and hardware', `${fld('Cabinet materials', 'des', 'cabMatT', d.cabMatT, 'select', { options: setOpts('cabMatT', opts(S.matTemplates.cabinet), 'cab') })}
      ${fld('Drawer materials', 'des', 'drawerMatT', d.drawerMatT, 'select', { options: setOpts('drawerMatT', opts(S.matTemplates.drawer), 'cab') })}
      ${fld('Door template', 'des', 'doorT', d.doorT, 'select', { options: setOpts('doorT', opts(S.doorTemplates), 'cab') })}
      ${fld('Drawer slide', 'des', 'slide', d.slide, 'select', { options: setOpts('slide', opts(hwOf('slide')), 'cab') })}
      ${fld('Hinge', 'des', 'hinge', d.hinge, 'select', { options: setOpts('hinge', opts(hwOf('hinge')), 'cab') })}
      ${fld('Part template', 'des', 'partT', d.partT || '', 'select', { options: setOpts('partT', opts(S.partTemplates), 'cab') })}`)}
      ${desFold('par', 'Parameters', paramRows('desp', effParams(c), d.params, {}, d.cat, 'This template', curRoom().params))}
      ${desFold('cus', 'Custom fields', `${customRows('des', d.custom)}<div class="row-actions"><button class="btn sm" data-act="cust-add" data-ref="des">${icon('plus')}Add field</button></div>`)}
    </div>
    <div class="stack">
      <div class="card cardbody stack">
        <div class="des-view"><div class="seg" role="group" aria-label="Designer view">${[['2d', '2D'], ['3d', '3D']].map(([k, l]) => `<button data-act="des-view" data-id="${k}" aria-pressed="${ui.des3d === (k === '3d')}">${l}</button>`).join('')}</div>
          ${openable(c) ? `<button class="btn sm${ui.open[c.id] ? ' primary' : ''}" data-act="open-toggle" data-id="${c.id}">${ui.open[c.id] ? 'Close doors and drawers' : 'Open doors and drawers'}</button>` : ''}</div>
        ${ui.des3d ? '' : `<div class="des-2d"><div>${edTools(c, qr)}<div class="preview pad">${qeFaceSVG(c, qr, 460)}</div><div class="cap">Front · opening ${qr + 1} selected</div></div><div><div class="preview pad">${sideSectionSVG(c, 460, !!ui.open[c.id])}</div><div class="cap">Side section</div></div></div>`}
        <div class="view3d-wrap des-3d"${ui.des3d ? '' : ' hidden'}><div class="viewctl">${['persp', 'iso', 'front', 'fit'].map(k => `<button class="btn sm" data-act="des3d" data-id="${k}">${{ persp: '3D', iso: 'Iso', front: 'Front', fit: 'Fit' }[k]}</button>`).join('')}</div><div id="des3d-slot"></div></div>
      </div>
      <div class="card cardbody"><h3>${nParts} parts, ${nOps} machining operations</h3>${b.warn.map(w => `<div class="warnbox">${esc(w)}</div>`).join('')}
          <table class="t"><tbody>${Object.entries(b.bom).map(([k, q]) => `<tr><td>${esc(k)}</td><td class="n">${q}</td></tr>`).join('')}</tbody></table>
          <div class="row-actions"><button class="btn" data-act="des-place">Save and place in room</button></div></div>
    </div>
  </div>`;
  host.innerHTML = html;
  const slot = $('#des3d-slot');
  if (keep3d) slot.replaceWith(keep3d); else { slot.id = 'des3d'; }
  const h3 = $('#des3d');
  // The 3D preview is made the first time it is shown, then kept.
  if (ui.des3d) {
    if (!designerViewer) { designerViewer = new Viewer3D(h3); viewers.push(designerViewer); }
    else if (designerViewer.host !== h3 && designerViewer.ok) { h3.appendChild(designerViewer.renderer.domElement); designerViewer.host = h3; new ResizeObserver(() => designerViewer.resize()).observe(h3); }
    buildDesigner3D();
  }
  $('#des-load').addEventListener('change', e => {
    const v = e.target.value; if (!v) return;
    const [k, id] = v.split(':');
    mutate(() => { S.designer = k === 'new' ? blankDesign(id) : designFromLib(libItem(id)); });
    if (designerViewer) designerViewer.fitted = false;
  });
}
function buildDesigner3D() {
  const v = designerViewer; if (!v || !v.ok) return;
  v.setBackground(cssVar('--paper')); v.clear();
  const c = designCab(), m = cabinetMeshes(c); m.position.x = -c.w / 2; v.root.add(m);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(c.w + 60, c.d + 60), flat3(cssVar('--floor3d')));
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, -0.02, c.d / 2); fl.userData.noBounds = true; v.root.add(fl);
  v.resize();
  if (!v.fitted) { v.fitted = true; v.look({ x: -0.8, y: 0.6, z: 1.4 }); }
  v.requestRender();
}
function customRows(ref, list) {
  const r = 'sub:custom|' + ref;
  return (list || []).length ? list.map((f, i) => `<div class="custrow">${ctl(r, i + '.k', f.k, 'text', { label: 'Field name', ph: 'Name' })}${ctl(r, i + '.v', f.v, 'text', { label: 'Value', ph: 'Value' })}<button class="btn sm" data-act="cust-del" data-ref="${esc(ref)}" data-i="${i}" aria-label="Remove field">×</button></div>`).join('')
    : '<div class="note">Free-form notes that ride along in the export, such as "Finish: Natural" or "Lazy susan: yes".</div>';
}
// Side section through the cabinet: front on the left, back on the right, with shelves, inserts and fronts.
function sideSectionSVG(c, maxH, open) {
  const p = effParams(c), fr = computeFronts(c, p), lay = interiorLayout(c, p, fr), t = lay.t, D = c.d, H = c.h;
  const tk = hasToe(c) ? p.toeKickHeight : 0, ts = tk ? p.toeKickSetback : 0, ft = 0.75, bt = 0.25, by = D - p.backInset - bt;
  const Y = z => -z, rect = (cls, x, z, w, h, x2 = '') => `<rect class="${cls} nss" x="${x}" y="${Y(z + h)}" width="${w}" height="${h}"${x2}/>`;
  const feet = onFeet(c, p);
  let s = feet ? `<path class="sec-box nss" d="M0 ${-tk}H${D}V${-H}H0Z"/>` : `<path class="sec-box nss" d="M${ts} 0H${D}V${-H}H0V${-tk}H${ts}Z"/>`;
  if (feet && tk) [ts + t + 1.5, D - 3].forEach(x => { s += `<rect class="ev-leg nss" x="${x - 0.8}" y="${-tk}" width="1.6" height="${tk}"/>`; });
  s += rect('sec-part', 0, lay.zIn0 - t, D, t) + rect('sec-part', 0, H - t, D, t) + rect('sec-part', by, lay.zIn0, bt, lay.zIn1 - lay.zIn0);
  if (tk && p.toeSkin !== 'off') s += rect('sec-part', ts, 0, t, tk);
  shelfHeights(lay, Math.max(0, p.shelfCount | 0)).forEach(z => { s += rect('sec-part', p.shelfFrontSetback, z, by - p.shelfFrontSetback, t); });
  const travel = D * 0.85;
  lay.rollouts.forEach(ro => { s += rect('ev-dbox', 1 - (open ? travel : 0), ro.z, by - 2, ro.h); });
  lay.trays.forEach(tr => { s += rect('ev-dbox', 1, tr.z0 + 0.5, by - 2, tr.z1 - tr.z0 - 1, ' stroke-dasharray="2 2"'); });
  lay.bins.forEach(bn => { const bh = Math.min(20, bn.z1 - bn.z0 - 2); s += rect('ev-bin', 1.5 - (open ? travel : 0), bn.z0 + 0.5, by - 3, bh, ' rx="1"'); });
  const rows = new Map(); fr.forEach(f => { if (!rows.has(f.row)) rows.set(f.row, f); });
  rows.forEach(f => {
    const h = f.z1 - f.z0;
    if (f.type === 'open') return;
    if (f.type === 'drawer') {
      const dx = open ? -travel : 0;
      s += rect('ev-dbox', 1 + dx, f.z0 + 0.75, by - 2, Math.max(1, h - 2.5));
      s += rect('sec-front', -ft + dx, f.z0, ft, h);
    } else if (!(open && f.type === 'door')) s += rect('sec-front', -ft, f.z0, ft, h);
  });
  const x0 = -(open ? travel : 0) - ft - 2, w = D + 4 - x0;
  return `<svg viewBox="${x0} ${-H - 2} ${w} ${H + 4}" style="max-height:${maxH || 260}px">${s}<line class="ev-floor nss" x1="${x0}" x2="${x0 + w}" y1="0" y2="0"/></svg>`;
}
