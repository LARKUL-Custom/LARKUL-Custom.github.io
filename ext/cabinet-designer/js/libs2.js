// Section L of the Mozaik list: door size rule use (L4), label layouts and multi-print presets (L5),
// recuts (L6), the paperless shop view (L7) and construction methods (L8).
'use strict';

// Shop-wide lists kept in Hub storage (or this browser outside the hub), like the CNC tools and rules.
function shopLoad(name, set) {
  (async () => { try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get(name) : JSON.parse(localStorage.getItem(KEY + '.' + name) || 'null'); if (v && v.value !== undefined) v = v.value; if (v != null) set(v); } catch (_) {} })();
}
function shopSave(name, val, what) {
  try { localStorage.setItem(KEY + '.' + name, JSON.stringify(val)); } catch (_) {}
  if (typeof inHub === 'function' && inHub()) Hub.storage.set(name, val).catch(() => flash(`Could not save ${what || name}.`));
}

/* ----- L4: which fronts in the job a style's size rules swap ----- */
function sizeRuleUse(d) {
  let n = 0; const to = {};
  (typeof allCabs === 'function' ? allCabs() : S.cabinets).forEach(c => {
    let fr = []; try { fr = computeFronts(c); } catch (_) { return; }
    fr.forEach(f => {
      if (!['door', 'drawer', 'false'].includes(f.type)) return;
      let st; try { st = frontStyle(c, f); } catch (_) { return; }
      const base = frontBaseStyle(c, f);
      if (base && base.id === d.id && st.ds.id !== d.id) { n++; to[st.ds.name] = (to[st.ds.name] || 0) + 1; }
    });
  });
  return n ? `<div class="note l4-use"><b>In this job:</b> ${n} front${n > 1 ? 's' : ''} swapped to ${Object.entries(to).map(([k, v]) => `${esc(k)} (${v})`).join(', ')}.</div>` : '<div class="note l4-use">No fronts in this job are outside these sizes.</div>';
}

/* ----- L5: label layout with variables ----- */
let LABEL_TPL = { on: false, lines: ['Job {JOB}  ·  Cab# {CAB}', '{PART}  {SIZE}', 'MATERIAL {MAT} {GRAIN}', '{ROOM}  ·  Part# {N} {OF}', 'Banding {BAND}  ·  Ops {OPS}'] };
shopLoad('labelTpl', v => { if (v && Array.isArray(v.lines)) LABEL_TPL = v; });
const LABEL_VARS = [['JOB', 'Job name'], ['CUSTOMER', 'Customer'], ['ROOM', 'Room'], ['CAB', 'Cabinet number'], ['CABNAME', 'Cabinet name'], ['PART', 'Part name'], ['SIZE', 'Length × width'], ['L', 'Length'], ['W', 'Width'], ['T', 'Thickness'], ['MAT', 'Material'], ['GRAIN', 'Grain arrow'], ['QTY', 'Quantity'], ['N', 'Label number'], ['OF', '"2 of 4" for repeats'], ['OPS', 'Operation count'], ['BORES', 'Hole count'], ['BAND', 'Banded edges'], ['NOTES', 'Cabinet notes'], ['DATE', "Today's date"]];
function labelVars(p, i, n) {
  const c = p.cabId && typeof cab === 'function' ? cab(p.cabId) : null;
  const band = EDGE_KEYS.filter(k => p.band && p.band[k]).map(k => { const b = edgeband(p.band[k]); return b && b.code ? `${k} ${b.code}` : k; }).join(' ') || 'none';
  return {
    JOB: S.job.name || '', CUSTOMER: S.job.customer || '', ROOM: p.room || '', CAB: p.cab || '', CABNAME: c ? c.name || '' : '', PART: p.report || p.name,
    SIZE: `${fmtLen(p.L)} × ${fmtLen(p.W)}`, L: fmtLen(p.L), W: fmtLen(p.W), T: fmtLen(p.T), MAT: (mat(p.mat) || {}).name || '', GRAIN: p.grain ? 'grain ↔' : '',
    QTY: String(p.qty), N: String(n + 1), OF: p.qty > 1 ? `${i} of ${p.qty}` : '', OPS: String(p.ops.length), BORES: String(p.ops.filter(o => o.type === 'bore' || o.type === 'hbore').length),
    BAND: band, NOTES: c ? (c.notes || '').split('\n')[0] : '', DATE: new Date().toLocaleDateString(),
  };
}
// Fills {NAME} from a part's values, then job fields and variables (F8), and leaves unknown names as typed.
function fillVars(text, vars) {
  return String(text || '').replace(/\{([A-Za-z_][\w]*)\}/g, (m, k) => { const u = k.toUpperCase(); if (vars && u in vars) return vars[u]; const j = typeof jobText === 'function' ? jobText(k) : undefined; return j !== undefined ? j : m; });
}
function labelLinesHTML(p, i, n) {
  const v = labelVars(p, i, n);
  return LABEL_TPL.lines.filter(l => l.trim()).map((l, k) => `<div class="lz-line${k === 1 ? ' lz-big' : ''}">${esc(fillVars(l, v))}</div>`).join('');
}
function labelTplBox() {
  return `<details class="lt-tpl"${ui.lblTplOpen ? ' open' : ''}><summary class="btn sm">${icon('edit')}Label layout</summary><div class="lt-tpl-body">
    <label class="checkrow"><input type="checkbox" class="lt-on"${LABEL_TPL.on ? ' checked' : ''}> Use my layout</label>
    <label class="checkrow"><input type="checkbox" class="lt-qr"${LABEL_TPL.qr ? ' checked' : ''}> QR code with the job, room, cabinet and part (on small labels it takes the drawing's place)</label>
    ${LABEL_TPL.lines.map((l, k) => `<label class="f wide"><span>Line ${k + 1}</span><input type="text" class="lt-line" data-k="${k}" value="${esc(l)}" aria-label="Label line ${k + 1}"></label>`).join('')}
    <div class="note">Type a name in braces to fill it in: ${LABEL_VARS.map(([k, l]) => `<code title="${esc(l)}">{${k}}</code>`).join(' ')}. Job fields and variables work too, like {PO}.</div></div></details>`;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest) return;
  if (t.classList.contains('lt-on')) { LABEL_TPL.on = t.checked; shopSave('labelTpl', LABEL_TPL, 'the label layout'); ui.lblTplOpen = true; showLabels(); }
  else if (t.classList.contains('lt-qr')) { LABEL_TPL.qr = t.checked; shopSave('labelTpl', LABEL_TPL, 'the label layout'); ui.lblTplOpen = true; showLabels(); }
  else if (t.classList.contains('lt-line')) { LABEL_TPL.lines[+t.dataset.k] = t.value; shopSave('labelTpl', LABEL_TPL, 'the label layout'); ui.lblTplOpen = true; showLabels(); }
});

/* ----- L5: multi-print presets: one print of the pages you pick ----- */
const MP_ITEMS = [['cover', 'Cover page'], ['specs', 'Job specs (door style, materials, hardware, color)'], ['plan', 'Floor plan (one per room)'], ['elev', 'Wall elevations with cabinet numbers'], ['3d', '3D views (saved views, or one per room)'], ['cutlist', 'Cut list'], ['hardware', 'Hardware list'], ['cabinets', 'Cabinet sheets (one per cabinet)'], ['ops', 'Machining per part'], ['recuts', 'Recut list']];
const PP_BUILD = { id: 'pp-build', name: 'Builder drawings', title: '{JOB}', items: ['cover', 'specs', 'plan', 'elev', '3d'] };
let PRINT_PRESETS = [PP_BUILD, { id: 'pp-shop', name: 'Shop packet', title: '{JOB}', items: ['cover', 'cutlist', 'hardware', 'cabinets'] }, { id: 'pp-cut', name: 'Cut list only', title: '{JOB} cut list', items: ['cutlist'] }];
// Saved preset lists from before drawings could print get the builder preset added at the top.
shopLoad('printPresets', v => { if (Array.isArray(v) && v.length) PRINT_PRESETS = v.some(p => p.id === PP_BUILD.id) ? v : [{ ...PP_BUILD }, ...v]; });
function mpPreset() { return PRINT_PRESETS.find(p => p.id === ui.mpPreset) || PRINT_PRESETS[0]; }
function mpPages(pr) {
  const sc = cutScope(), title = fillVars(pr.title || '{JOB}', {}), out = [];
  // Drawing pages carry a title strip like a drawing sheet: job and room on the left, customer, date and page on the right.
  const head = (room, what) => (typeof printBlock === 'function' && printBlock(pr, room, what)) || `<header class="mp-hd"><div><b>${esc(title)}</b> · ${esc(room)} · <b>${esc(what)}</b></div><div>${esc(S.job.customer || '')}${S.job.customer ? ' · ' : ''}${new Date().toLocaleDateString()} · %%PG%%</div></header>`;
  const tbl = (head, rows) => `<table class="t mp-t"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">None</td></tr>`}</tbody></table>`;
  if (pr.items.includes('cover') && typeof printCover === 'function') out.push(printCover(pr, sc.rooms));
  else if (pr.items.includes('cover')) out.push(`<section class="mp-page"><h1>${esc(title)}</h1><p><b>Customer</b> ${esc(S.job.customer || '')}</p>${(S.job.fields || []).map(f => `<p><b>${esc(f.k)}</b> ${esc(f.v ?? '')}</p>`).join('')}
    <p><b>Rooms</b> ${sc.rooms.map(r => esc(r.name)).join(', ')}</p><p><b>Cabinets</b> ${sc.cabs.length} · <b>Parts</b> ${sc.parts.reduce((a, p) => a + p.qty, 0)}</p>${S.job.notes ? `<p><b>Notes</b> ${esc(S.job.notes)}</p>` : ''}<p class="muted">Printed ${new Date().toLocaleString()}</p></section>`);
  if (pr.items.includes('specs') && typeof printSpecPage === 'function') out.push(printSpecPage(pr, sc.rooms, head));
  if (typeof printDrawings === 'function') out.push(...printDrawings(pr, sc.rooms, head));
  if (pr.items.includes('cutlist')) out.push(`<section class="mp-page"><h2>Cut list · ${esc(title)}</h2>${tbl(['Room', 'Cab', 'Part', 'Qty', 'Length', 'Width', 'Thick', 'Material', 'Edges'], sc.parts.map(p => `<tr><td>${esc(p.room)}</td><td>${esc(p.cab)}</td><td>${esc(p.report || p.name)}</td><td>${p.qty}</td><td>${fmtLen(p.L)}</td><td>${fmtLen(p.W)}</td><td>${fmtLen(p.T)}</td><td>${esc((mat(p.mat) || {}).name || '')}</td><td>${esc(p.edges || '')}</td></tr>`))}</section>`);
  if (pr.items.includes('hardware')) { const bom = {}; sc.cabs.forEach(({ c, room }) => withRoom(room, () => Object.entries(buildParts(c).bom || {}).forEach(([k, q]) => bom[k] = (bom[k] || 0) + q))); out.push(`<section class="mp-page"><h2>Hardware · ${esc(title)}</h2>${tbl(['Item', 'Qty'], Object.entries(bom).sort().map(([k, q]) => `<tr><td>${esc(k)}</td><td>${q}</td></tr>`))}</section>`); }
  if (pr.items.includes('cabinets')) sc.cabs.forEach(({ c, room }) => withRoom(room, () => { const ps = buildParts(c).parts.filter(p => p.cabId === c.id); out.push(`<section class="mp-page">${typeof qrSVG === 'function' ? `<div class="mp-qr">${qrSVG([S.job.name, room.name, LBL[c.id] || '', c.name].join(' | '), '0.9in')}</div>` : ''}<h2>${esc(LBL[c.id] || '')} · ${esc(c.name)} <span class="muted">${esc(room.name)}</span></h2><p>${fmtLen(c.w)} W × ${fmtLen(c.h)} H × ${fmtLen(c.d)} D</p>${c.notes ? `<p><b>Notes</b> ${esc(c.notes)}</p>` : ''}${tbl(['✓', 'Part', 'Qty', 'Size', 'Material'], ps.map(p => `<tr><td class="mp-box"></td><td>${esc(p.report || p.name)}</td><td>${p.qty}</td><td>${fmtLen(p.L)} × ${fmtLen(p.W)}</td><td>${esc((mat(p.mat) || {}).name || '')}</td></tr>`))}</section>`); }));
  if (pr.items.includes('ops')) out.push(`<section class="mp-page"><h2>Machining · ${esc(title)}</h2>${tbl(['Cab', 'Part', 'Operations'], sc.parts.filter(p => p.ops.length).map(p => `<tr><td>${esc(p.cab)}</td><td>${esc(p.report || p.name)}</td><td>${p.ops.map(o => esc(opText(o))).join('<br>')}</td></tr>`))}</section>`);
  if (pr.items.includes('recuts')) out.push(`<section class="mp-page"><h2>Recuts · ${esc(title)}</h2>${tbl(['Room', 'Cab', 'Part', 'Qty', 'Why'], (S.job.recuts || []).map(r => `<tr><td>${esc(r.room)}</td><td>${esc(r.cab)}</td><td>${esc(r.name)}</td><td>${r.qty}</td><td>${esc(r.why || '')}</td></tr>`))}</section>`);
  return out.map((pg, i) => pg.split('%%PG%%').join(`${i + 1} of ${out.length}`)).join('');
}
function showMultiPrint() {
  let el = $('#multiprint'); if (!el) { el = document.createElement('div'); el.id = 'multiprint'; el.className = 'labelsheet mpsheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Print'); document.body.appendChild(el); }
  const pr = mpPreset();
  el.innerHTML = `<div class="lbbar"><label class="f"><span>Preset</span><select class="mp-pick" aria-label="Print preset">${PRINT_PRESETS.map(p => `<option value="${p.id}"${p.id === pr.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Preset name</span><input type="text" class="mp-name" value="${esc(pr.name)}" aria-label="Preset name"></label>${S.rooms.length > 1 ? `<label class="f"><span>Rooms</span><select class="mp-room" aria-label="Rooms to print"><option value="all">Whole job (${S.rooms.length} rooms)</option>${S.rooms.map(r => `<option value="${r.id}"${ui.cutRoom === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    <label class="f"><span>Title</span><input type="text" class="mp-title" value="${esc(pr.title || '')}" aria-label="Title (variables allowed)" placeholder="{JOB}"></label>
    <div class="mp-items">${MP_ITEMS.map(([k, l]) => `<label class="checkrow"><input type="checkbox" class="mp-item" value="${k}"${pr.items.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}<label class="checkrow mp-colorrow"><input type="checkbox" class="mp-color"${pr.color ? ' checked' : ''}> Drawings in color</label></div>
    ${typeof PRINT_LAYOUTS !== 'undefined' ? `<div class="mp-lay"><label class="f"><span>Cover</span><select class="mp-lpick" data-k="cover" aria-label="Cover layout">${PRINT_LAYOUTS.filter(l => l.kind === 'cover').map(l => `<option value="${l.id}"${plFor(pr, 'cover') === l ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Title block</span><select class="mp-lpick" data-k="block" aria-label="Title block layout"><option value="none"${pr.block === 'none' ? ' selected' : ''}>Plain strip</option>${PRINT_LAYOUTS.filter(l => l.kind === 'block').map(l => `<option value="${l.id}"${plFor(pr, 'block') === l ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <button class="btn sm" data-act="pl-open" data-id="${(plFor(pr, 'cover') || {}).id || ''}">${icon('edit')}Edit layouts</button></div>` : ''}
    <div class="row-actions"><button class="btn sm" data-act="mp-new">${icon('plus')}New preset</button>${PRINT_PRESETS.length > 1 ? `<button class="btn sm" data-act="mp-del">${icon('trash')}Delete preset</button>` : ''}<button class="btn primary" data-act="mp-print">${icon('print')}Print</button><button class="btn" data-act="mp-close">Close</button></div></div>
    <div class="mp-pages${pr.color ? '' : ' mp-line'}">${mpPages(pr)}</div>`;
  el.hidden = false;
  // Pages are drawn at paper size; a narrow window shows them smaller.
  const pg = el.querySelector('.mp-pages'); if (pg) pg.style.zoom = String(Math.min(1, (el.clientWidth - 40) / 1056));
}
function mpSave() { shopSave('printPresets', PRINT_PRESETS, 'print presets'); }
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#multiprint')) return;
  const pr = mpPreset();
  if (t.classList.contains('mp-room')) { ui.cutRoom = t.value; showMultiPrint(); return; }
  if (t.classList.contains('mp-pick')) ui.mpPreset = t.value;
  else if (t.classList.contains('mp-name')) pr.name = t.value || pr.name;
  else if (t.classList.contains('mp-title')) pr.title = t.value;
  else if (t.classList.contains('mp-color')) pr.color = t.checked;
  else if (t.classList.contains('mp-lpick')) pr[t.dataset.k] = t.value;
  else if (t.classList.contains('mp-item')) pr.items = [...document.querySelectorAll('#multiprint .mp-item:checked')].map(x => x.value);
  else return;
  mpSave(); showMultiPrint();
});

/* ----- L6: recuts (broken or miscut parts to run again). Remnants are kept in CNC Cutlist. ----- */
// The recut file: the same CNC file with only the parts on the recut list, at the recut quantity.
function cncRecutFile() {
  const all = cncPartFile(), list = S.job.recuts || [];
  // Same cabinet, part name and size: a cabinet can have three drawer fronts of different heights.
  const size = p => { const xs = (p.outline || []).map(q => q.x ?? q[0]), ys = (p.outline || []).map(q => q.y ?? q[1]); return xs.length ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map(v => v / 25.4).sort((a, b) => b - a) : null; };
  const fits = (r, p) => { if (!(r.L > 0)) return true; const z = size(p); if (!z) return true; const w = [r.L, r.W].sort((a, b) => b - a); return Math.abs(z[0] - w[0]) < 0.05 && Math.abs(z[1] - w[1]) < 0.05; };
  const pick = list.map(r => { const p = all.file.parts.find(q => q.cabinet === r.cab && q.name === r.name && fits(r, q)); return p ? { ...p, id: p.id + '-R', quantity: r.qty, recut: true } : null; }).filter(Boolean);
  const mats = new Set(pick.map(p => p.material));
  return { ...all.file, job: { ...all.file.job, name: all.file.job.name + ' recuts' }, materials: all.file.materials.filter(m => mats.has(m.id)), parts: pick };
}
function recutCard() {
  const list = S.job.recuts || []; if (!list.length) return '';
  return `<div class="card recuts">${cardHead(`Recuts (${list.reduce((a, r) => a + r.qty, 0)})`, `<button class="btn sm primary" data-act="rc-send">${icon('upload')}Send recuts to CNC</button><button class="btn sm" data-act="rc-clear">Clear</button>`)}
    <div class="tscroll"><table class="t"><thead><tr><th>Room</th><th>Cab</th><th>Part</th><th>Qty</th><th>Why</th><th></th></tr></thead><tbody>${list.map((r, i) => `<tr><td>${esc(r.room)}</td><td>${esc(r.cab)}</td><td>${esc(r.name)}${r.L ? ` <span class="muted">${fmtLen(r.L)} × ${fmtLen(r.W)}</span>` : ''}</td>
      <td style="width:70px"><input type="text" class="rc-in num" data-i="${i}" data-k="qty" value="${r.qty}" aria-label="Recut quantity"></td><td><input type="text" class="rc-in" data-i="${i}" data-k="why" value="${esc(r.why || '')}" placeholder="Chipped edge" aria-label="Why"></td>
      <td style="width:40px"><button class="btn sm" data-act="rc-del" data-id="${i}" aria-label="Remove from recuts">×</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList || !t.classList.contains('rc-in')) return;
  mutate(() => { const r = (S.job.recuts || [])[+t.dataset.i]; if (!r) return; if (t.dataset.k === 'qty') r.qty = Math.max(1, parseInt(t.value, 10) || 1); else r.why = t.value; });
});

/* ----- L7: paperless shop view, one cabinet at a time, sized for a phone ----- */
function shopCabs() { const out = []; S.rooms.forEach(rm => withRoom(rm, () => S.cabinets.forEach(c => out.push({ c, room: rm, lbl: LBL[c.id] || c.name })))); return out; }
function renderShop() {
  const el = $('#tab-shop'); if (!el) return;
  const list = shopCabs(); if (!list.length) { el.innerHTML = '<div class="pagehead"><h2>Shop view</h2></div><div class="card cardbody muted">No cabinets yet.</div>'; return; }
  let i = list.findIndex(x => x.c.id === ui.shopCab); if (i < 0) i = 0;
  const { c, room, lbl } = list[i], done = (S.job.shopDone || {})[c.id] || {};
  const parts = withRoom(room, () => buildParts(c).parts.filter(p => p.cabId === c.id)), keyOf = (p, k) => `${p.name}#${k}`;
  const n = parts.length, got = parts.filter((p, k) => done[keyOf(p, k)]).length, pct = n ? Math.round(got / n * 100) : 0;
  const cabDone = x => { const d = (S.job.shopDone || {})[x.c.id] || {}; return Object.keys(d).length && Object.values(d).every(Boolean) ? ' ✓' : ''; };
  el.innerHTML = `<div class="shopview">
    <div class="sv-nav"><button class="btn" data-act="sv-go" data-id="${list[(i - 1 + list.length) % list.length].c.id}" aria-label="Previous cabinet">${icon('chevl')}</button>
      <select class="sv-pick" aria-label="Cabinet">${list.map(x => `<option value="${x.c.id}"${x.c.id === c.id ? ' selected' : ''}>${esc(x.lbl)} · ${esc(x.c.name)}${S.rooms.length > 1 ? ' · ' + esc(x.room.name) : ''}${cabDone(x)}</option>`).join('')}</select>
      <button class="btn" data-act="sv-go" data-id="${list[(i + 1) % list.length].c.id}" aria-label="Next cabinet">${icon('chevr')}</button></div>
    <div class="sv-head"><h2>${esc(lbl)} <span>${esc(c.name)}</span></h2><div class="muted">${esc(room.name)} · ${fmtLen(c.w)} W × ${fmtLen(c.h)} H × ${fmtLen(c.d)} D</div>
      <div class="sv-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><div class="sv-count">${got} of ${n} parts done</div></div>
    ${c.notes ? `<div class="sv-notes">${esc(c.notes).replace(/\n/g, '<br>')}</div>` : ''}
    <ul class="sv-parts">${parts.map((p, k) => `<li><label class="${done[keyOf(p, k)] ? 'on' : ''}"><input type="checkbox" class="sv-chk" data-cab="${c.id}" data-k="${esc(keyOf(p, k))}"${done[keyOf(p, k)] ? ' checked' : ''}>
      <span class="sv-p"><b>${esc(p.report || p.name)}${p.qty > 1 ? ` ×${p.qty}` : ''}</b><span>${fmtLen(p.L)} × ${fmtLen(p.W)} · ${esc((mat(p.mat) || {}).name || '')}${p.ops.length ? ` · ${p.ops.length} ops` : ''}</span></span></label></li>`).join('')}</ul>
    <div class="row-actions"><button class="btn" data-act="sv-all" data-id="${c.id}">${icon('check')}All done</button><button class="btn" data-act="sv-none" data-id="${c.id}">Clear</button>${typeof qDrawings === 'function' && (c.drawings || []).length ? '' : ''}</div>
    ${(c.drawings || []).length && typeof qDrawings === 'function' ? qDrawings(c) : ''}</div>`;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList) return;
  if (t.classList.contains('sv-pick')) { ui.shopCab = t.value; renderShop(); }
  if (t.classList.contains('sv-chk')) mutate(() => { S.job.shopDone = S.job.shopDone || {}; const d = S.job.shopDone[t.dataset.cab] = S.job.shopDone[t.dataset.cab] || {}; if (t.checked) d[t.dataset.k] = true; else delete d[t.dataset.k]; });
});

/* ----- L8: construction methods: save the job's build settings by name and load them into another job ----- */
let METHODS = [];
shopLoad('methods', v => { if (Array.isArray(v)) METHODS = v; });
function methodsBox() {
  const cur = METHODS.find(m => m.id === ui.method) || METHODS[0];
  return `<div class="card methods">${cardHead('Construction methods', '<span class="note">A saved set of construction parameters and job picks (joints, slides, templates)</span>')}<div class="cardbody mt-row">
    ${METHODS.length ? `<label class="f"><span>Method</span><select class="mt-pick" aria-label="Construction method">${METHODS.map(m => `<option value="${m.id}"${cur && m.id === cur.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <button class="btn primary" data-act="mt-load">Use for this job</button><button class="btn" data-act="mt-update" title="Save this job's settings over the picked method">Update from job</button><button class="btn" data-act="mt-del">${icon('trash')}Delete</button><button class="btn" data-act="mt-exp">${icon('download')}Export</button>` : '<span class="muted">None saved yet.</span>'}
    <label class="f"><span>Save this job's settings as</span><input type="text" class="mt-name" placeholder="Frameless, 3/4 confirmat" aria-label="New method name"></label><button class="btn" data-act="mt-save">${icon('plus')}Save as method</button>
    <label class="btn">${icon('upload')}Import<input type="file" class="mt-imp" accept=".json,application/json" hidden></label></div></div>`;
}
function methodFromJob(name) { return { id: uid('cm'), name, params: JSON.parse(JSON.stringify(S.job.params || {})), defaults: JSON.parse(JSON.stringify(S.job.defaults || {})) }; }
function methodsSave() { shopSave('methods', METHODS, 'construction methods'); }
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList) return;
  if (t.classList.contains('mt-pick')) { ui.method = t.value; render(); }
  if (t.classList.contains('mt-imp') && t.files[0]) {
    t.files[0].text().then(tx => { const d = JSON.parse(tx), l = (Array.isArray(d) ? d : d.methods || [d]).filter(m => m && m.params); if (!l.length) throw new Error('none'); l.forEach(m => METHODS.push({ ...m, id: uid('cm') })); methodsSave(); render(); flash(`Imported ${l.length}`); }).catch(() => flash('That file has no construction methods'));
    t.value = '';
  }
});

/* ----- Actions ----- */
function libs2Act(a, id) {
  switch (a) {
    case 'mp-open': if (typeof printPicsClear === 'function') printPicsClear(); showMultiPrint(); return true;
    case 'mp-close': { const el = $('#multiprint'); if (el) el.hidden = true; document.body.classList.remove('printing-multi'); return true; }
    case 'mp-print': document.body.classList.add('printing-multi'); setTimeout(() => { window.print(); document.body.classList.remove('printing-multi'); }, 50); return true;
    case 'mp-new': { const p = { id: uid('pp'), name: 'New preset', title: '{JOB}', items: ['cutlist'] }; PRINT_PRESETS.push(p); ui.mpPreset = p.id; mpSave(); showMultiPrint(); return true; }
    case 'mp-del': { const pr = mpPreset(); PRINT_PRESETS = PRINT_PRESETS.filter(p => p !== pr); ui.mpPreset = PRINT_PRESETS[0].id; mpSave(); showMultiPrint(); return true; }
    case 'rc-add': {
      const sc = cutScope(), p = sc.parts.find((q, i) => q.cabId + '#' + i === id); if (!p) return true;
      mutate(() => { S.job.recuts = S.job.recuts || []; const ex = S.job.recuts.find(r => r.cab === p.cab && r.name === p.name && r.room === p.room && Math.abs((r.L || 0) - p.L) < 0.01 && Math.abs((r.W || 0) - p.W) < 0.01); if (ex) ex.qty++; else S.job.recuts.push({ room: p.room, cab: p.cab, name: p.name, L: p.L, W: p.W, qty: 1, why: '' }); });
      flash(`${p.name} added to recuts`); return true;
    }
    case 'rc-del': mutate(() => { (S.job.recuts || []).splice(+id, 1); }); return true;
    case 'rc-clear': mutate(() => { S.job.recuts = []; }); return true;
    case 'rc-send': {
      const f = cncRecutFile(); if (!f.parts.length) { flash('None of the recut parts are in the CNC file'); return true; }
      const job = S.job.name.replace(/[^\w -]/g, '').trim() || 'job', name = `${job} recuts.json`, text = JSON.stringify(f, null, 2);
      if (typeof inHub === 'function' && inHub() && Hub.files) Hub.files.upload(new File([text], name), `CNC/${job}`).then(() => flash(`Saved to Files › CNC › ${job}`), err => flash('Could not save: ' + err.message));
      else libDownload(name, f);
      return true;
    }
    case 'sv-open': ui.shopCab = id || ui.shopCab; goTab('shop'); return true;
    case 'sv-go': ui.shopCab = id; renderShop(); return true;
    case 'sv-all': case 'sv-none': {
      const x = shopCabs().find(q => q.c.id === id); if (!x) return true;
      const parts = withRoom(x.room, () => buildParts(x.c).parts.filter(p => p.cabId === x.c.id));
      mutate(() => { S.job.shopDone = S.job.shopDone || {}; S.job.shopDone[id] = a === 'sv-all' ? Object.fromEntries(parts.map((p, k) => [`${p.name}#${k}`, true])) : {}; }); return true;
    }
    case 'mt-save': { const n = ($('.mt-name') || {}).value || ''; if (!n.trim()) { flash('Type a name for the method first'); return true; } const m = methodFromJob(n.trim()); METHODS.push(m); ui.method = m.id; methodsSave(); render(); flash(`Saved ${m.name}`); return true; }
    case 'mt-update': { const m = METHODS.find(x => x.id === ui.method) || METHODS[0]; if (!m) return true; const f = methodFromJob(m.name); m.params = f.params; m.defaults = f.defaults; methodsSave(); flash(`Updated ${m.name}`); return true; }
    case 'mt-del': { const m = METHODS.find(x => x.id === ui.method) || METHODS[0]; if (!m) return true; METHODS = METHODS.filter(x => x !== m); ui.method = null; methodsSave(); render(); return true; }
    case 'mt-exp': { const m = METHODS.find(x => x.id === ui.method) || METHODS[0]; if (m) libDownload(`${m.name.replace(/[^\w -]/g, '')}.json`, { format: 'cabinet-designer-methods', methods: [m] }); return true; }
    case 'mt-load': {
      const m = METHODS.find(x => x.id === ui.method) || METHODS[0]; if (!m) return true;
      // Picks that name something this job doesn't have (a joint or slide from another shop) are left as they are.
      const have = JSON.stringify({ ...S, job: null }), skip = [];
      mutate(() => {
        S.job.params = { ...JSON.parse(JSON.stringify(m.params)) };
        Object.entries(m.defaults || {}).forEach(([k, v]) => { if (typeof v !== 'string' || !v || have.includes(`"${v}"`)) S.job.defaults[k] = v; else skip.push(k); });
      });
      flash(`Using ${m.name}${skip.length ? ` (${skip.length} pick${skip.length > 1 ? 's' : ''} not in this job kept as they were)` : ''}`); return true;
    }
  }
  return false;
}
