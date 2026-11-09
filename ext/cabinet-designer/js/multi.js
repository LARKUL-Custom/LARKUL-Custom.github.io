/* Selecting several cabinets at once (Shift or Ctrl click, or Shift-drag a box in the plan) and changing
   them together: materials, door template, hardware, joints, size and build, for things like two-tone kitchens.
   Fields the cabinets don't agree on show as Mixed until you pick a value. */
const MIXED = '__mixed';
const multiIds = () => (ui.multi || []).filter(id => cab(id));
const inMulti = id => multiIds().length > 1 && ui.multi.includes(id);
function setMulti(ids, primary) {
  ui.multi = [...new Set(ids)].filter(id => cab(id));
  const p = primary && ui.multi.includes(primary) ? primary : ui.multi[ui.multi.length - 1];
  select(p ? { type: 'cab', id: p } : null, true);
}
function toggleMulti(id) {
  let m = multiIds(); if (!m.length && ui.sel && ui.sel.type === 'cab') m = [ui.sel.id];
  setMulti(m.includes(id) ? m.filter(x => x !== id) : [...m, id], id);
}
// Cabinets whose middle is inside the box, in plan coordinates.
function cabsInBox(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return S.cabinets.filter(c => { const m = cabPt(c, c.w / 2, c.d / 2); return m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1; }).map(c => c.id);
}
function boxSVG() {
  const d = ui.drag; if (!d || d.mode !== 'box' || !d.p1) return '';
  return `<rect class="selbox nss" x="${Math.min(d.p0.x, d.p1.x)}" y="${Math.min(d.p0.y, d.p1.y)}" width="${Math.abs(d.p1.x - d.p0.x)}" height="${Math.abs(d.p1.y - d.p0.y)}"/>`;
}
function finishBox(d) {
  if (!d.p1) return;
  const ids = cabsInBox(d.p0, d.p1), keep = d.add ? multiIds().length ? multiIds() : ui.sel && ui.sel.type === 'cab' ? [ui.sel.id] : [] : [];
  setMulti([...keep, ...ids]);
  if (ids.length) flash(`${multiIds().length} cabinets selected`);
}

const bulkCons = (c, k) => k === 'toeKick' ? (toeOn(c) ? 'yes' : 'no') : ((c.construction || {}).top || 'full');
function multiProps() {
  const ids = multiIds(), cs = ids.map(cab);
  const agree = vals => vals.every(v => v === vals[0]) ? vals[0] : MIXED;
  const sel = (label, f, options, get = c => c[f] || '') => {
    const v = agree(cs.map(c => String(get(c))));
    return `<label class="f"><span>${label}</span><select class="bulk-set" data-field="${f}" aria-label="${esc(label)}">${v === MIXED ? `<option value="${MIXED}" selected>Mixed</option>` : ''}${options.map(o => `<option value="${esc(o.v)}"${String(o.v) === v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
  };
  const num = (label, f) => { const v = agree(cs.map(c => String(c[f] ?? 0))); return `<label class="f"><span>${label}</span><input class="bulk-num" data-field="${f}" inputmode="decimal" aria-label="${esc(label)}" value="${v === MIXED ? '' : esc(fmtLen(+v))}" placeholder="Mixed"></label>`; };
  const so = (k, list) => setOpts(k, list, 'cab');
  const yn = [{ v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }];
  return `<div class="psec box multi"><div class="multi-head"><b>${ids.length} cabinets selected</b><span class="note">${ids.map(id => esc(LBL[id] || '')).join(', ')}</span></div>
    <div class="row-actions"><button class="btn sm" data-act="multi-none">Select none</button><button class="btn sm danger" data-act="multi-del">Delete ${ids.length}</button></div>
    <div class="note">Shift or Ctrl click adds or removes a cabinet; Shift-drag in the plan selects a box. A change here goes to every selected cabinet.</div></div>
  <div class="psec box">${secHead('palette', 'Materials and fronts', 'amber')}<div class="mgrid">
    ${sel('Construction', 'faceFrame', so('faceFrame', ffOpts()))}${sel('Cabinet materials', 'cabMatT', so('cabMatT', opts(S.matTemplates.cabinet)))}${sel('Drawer materials', 'drawerMatT', so('drawerMatT', opts(S.matTemplates.drawer)))}
    ${sel('Door template', 'doorT', so('doorT', opts(S.doorTemplates)))}${sel('Applied panel fit', 'panelStyle', so('panelStyle', opts(S.panels)))}
    ${sel('Part template', 'partT', so('partT', opts(S.partTemplates)))}${sel('Top molding', 'molding', [{ v: '', l: 'None' }, ...opts(S.moldings)])}
    ${sel('Finished interior', 'finInt', yn, c => c.finInt ? 'yes' : 'no')}</div></div>
  <div class="psec box">${secHead('sliders', 'Hardware and joints', 'blue')}<div class="mgrid">
    ${sel('Pulls', 'pull', so('pull', opts(hwOf('pull'))))}${sel('Drawer slide', 'slide', so('slide', opts(hwOf('slide'))))}${sel('Hinge', 'hinge', so('hinge', opts(hwOf('hinge'))))}
    ${sel('Joints, unfinished ends', 'jointU', so('jointU', opts(hwOf('joint'))))}${sel('Joints, finished ends', 'jointF', so('jointF', opts(hwOf('joint'))))}</div></div>
  <div class="psec box">${secHead('ruler', 'Size and build', 'teal')}<div class="mgrid">
    ${num('Width', 'w')}${num('Height', 'h')}${num('Depth', 'd')}${num('Elevation', 'elev')}
    ${sel('Feet / toe kick', 'cons:toeKick', yn, c => bulkCons(c, 'toeKick'))}${sel('Top', 'cons:top', [{ v: 'full', l: 'Full top' }, { v: 'stretchers', l: 'Stretchers' }], c => bulkCons(c, 'top'))}</div></div>`;
}
function bulkApply(f, v) {
  const ids = multiIds(); if (ids.length < 2 || v === MIXED) return;
  mutate(() => ids.forEach(id => {
    const c = cab(id); if (!c) return;
    if (f.startsWith('cons:')) { const k = f.slice(5); c.construction = c.construction || defaultConstruction(c.cat); c.construction[k] = k === 'toeKick' ? v === 'yes' : v; }
    else if (f === 'finInt') c.finInt = v === 'yes';
    else if (['w', 'h', 'd'].includes(f)) { const r = typeof qSizeRule === 'function' ? qSizeRule(c, f, v) : { v }; if (!r.refuse) c[f] = r.v; }
    else if (f === 'elev') c[f] = v;
    else if (v) c[f] = v; else delete c[f];
  }));
  flash(`Changed ${ids.length} cabinets`);
}
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('.bulk-set, .bulk-num'); if (!s) return;
  if (s.classList.contains('bulk-num')) { const n = parseLen(s.value); if (n === null || !isFinite(n) || n < 0 || (s.dataset.field !== 'elev' && n <= 0)) return; bulkApply(s.dataset.field, n); }
  else bulkApply(s.dataset.field, s.value);
});
function showMultiCtx(x, y) {
  const m = $('#ctxmenu'), n = multiIds().length, item = (act, label, extra = '') => `<button role="menuitem" data-act="${act}"${extra}>${label}</button>`;
  m.innerHTML = `<div class="ctxhead">${n} cabinets</div>` + item('multi-edit', `Change all ${n}…`) + item('q-equal', 'Equalize widths') + item('multi-cut', `Cut only these ${n}`) + item('q-copyset', 'Copy settings from the first') + (typeof setClip !== 'undefined' && setClip ? item('q-pasteset', `Paste settings on all ${n}`) : '') + item('multi-none', 'Select none') + (lightClip && lightClip.length ? item('light-paste-multi', `Paste lights on all ${n}`) : '') + item('multi-del', `Delete ${n}`, ' class="danger"');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const first = m.querySelector('[role=menuitem]'); if (first) first.focus({ preventScroll: true });
}
function multiAct(act) {
  if (act === 'light-paste-multi') { pasteLights(multiIds()); return true; }
  if (act === 'multi-none') { ui.multi = []; select(null); return true; }
  if (act === 'multi-cut') { cutPickOnly(multiIds()); return true; }
  if (act === 'multi-edit') { ui.propsShut = false; renderProps(); const el = $('#props'); if (el) el.scrollTop = 0; return true; }
  if (act === 'multi-del') { const ids = multiIds(); mutate(() => { S.cabinets = S.cabinets.filter(c => !ids.includes(c.id)); }); ui.multi = []; ui.sel = null; render(); flash(`Deleted ${ids.length} cabinets`); return true; }
  return false;
}
