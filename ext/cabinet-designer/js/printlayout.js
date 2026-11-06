// Print layouts: the cover page and the title block on every drawing page, built from pieces (text with {NAMES},
// the logo, pictures, boxes, lines, the 3D picture) placed in inches. Shop-wide, like the print presets, with the
// shop's company details and a Symbols library of ready pieces to drop in. The editor opens from Print › Edit layouts.
'use strict';

/* ----- Company details (shop-wide) ----- */
let COMPANY = { name: 'LARKUL Custom', address: '', phone: '', email: '', web: '', logo: 'img/logo.png' };
shopLoad('company', v => { if (v && typeof v === 'object') COMPANY = { ...COMPANY, ...v }; });
function companySave() { shopSave('company', COMPANY, 'the company details'); }

/* ----- Layouts ----- */
// Page sizes in inches: the cover fills the landscape sheet; a title block runs across a drawing page inside its margins.
const PL_COVER = { w: 11, h: 8.5 }, PL_BLOCK_W = 10.3;
const plId = () => uid('pe');
// The cover: logo top left, the job title over a 3D picture of the main room cropped to fit the middle of the page,
// a double frame with orange corner marks around the paper, and the company details along the bottom.
function plDefaultCover() {
  const e = (o) => ({ id: plId(), ...o }), O = '#d9731b', K = '#16202c', corner = (x, y, sx, sy) => [
    e({ type: 'rect', x: sx > 0 ? x : x - 0.9, y: sy > 0 ? y : y - 0.09, w: 0.9, h: 0.09, fill: O }),
    e({ type: 'rect', x: sx > 0 ? x : x - 0.09, y: sy > 0 ? y : y - 0.9, w: 0.09, h: 0.9, fill: O })];
  return { id: 'pl-cover', v: 2, name: 'Cover with 3D', kind: 'cover', els: [
    e({ type: 'rect', x: 0.3, y: 0.3, w: 10.4, h: 7.9, stroke: K, sw: 2.25 }),
    e({ type: 'rect', x: 0.42, y: 0.42, w: 10.16, h: 7.66, stroke: K, sw: 0.5 }),
    ...corner(0.3, 0.3, 1, 1), ...corner(10.7, 0.3, -1, 1), ...corner(0.3, 8.2, 1, -1), ...corner(10.7, 8.2, -1, -1),
    e({ type: 'logo', x: 0.7, y: 0.65, w: 1.15, h: 1.15 }),
    e({ type: 'text', x: 0.7, y: 1.82, w: 1.9, h: 0.25, text: '{COMPANY}', size: 8, bold: true, color: K }),
    e({ type: 'text', x: 2.4, y: 0.7, w: 6.2, h: 0.62, text: '{JOB}', size: 30, bold: true, align: 'center', color: K }),
    e({ type: 'text', x: 2.4, y: 1.34, w: 6.2, h: 0.32, text: '{CUSTOMER}', size: 13, align: 'center', color: '#4d5b70' }),
    e({ type: 'rect', x: 4.9, y: 1.76, w: 1.2, h: 0.05, fill: O }),
    e({ type: 'text', x: 8.4, y: 0.75, w: 1.9, h: 0.6, text: '{PHONE}\n{EMAIL}\n{WEB}', size: 8, align: 'right', color: '#4d5b70' }),
    e({ type: 'view3d', x: 1.0, y: 2.1, w: 9.0, h: 4.95 }),
    e({ type: 'rect', x: 1.0, y: 2.1, w: 9.0, h: 4.95, stroke: K, sw: 1 }),
    e({ type: 'line', x: 1.0, y: 7.3, w: 9.0, h: 0, stroke: '#c9d3e1', sw: 0.75 }),
    e({ type: 'text', x: 1.0, y: 7.4, w: 3.4, h: 0.6, text: '{COMPANY}\n{ADDRESS}', size: 8, color: K }),
    e({ type: 'text', x: 4.4, y: 7.4, w: 2.2, h: 0.5, text: '{ROOMS}', size: 8, align: 'center', color: '#4d5b70' }),
    e({ type: 'text', x: 6.6, y: 7.4, w: 3.4, h: 0.5, text: 'Printed {DATE}', size: 8, align: 'right', color: '#4d5b70' }),
  ] };
}
function plDefaultBlock() {
  const e = (o) => ({ id: plId(), ...o }), lbl = (x, y, t) => e({ type: 'text', x, y, w: 2, h: 0.14, text: t, size: 5.5, color: '#666666', bold: true });
  return { id: 'pl-block', name: 'Title block', kind: 'block', h: 0.85, els: [
    e({ type: 'rect', x: 0, y: 0, w: PL_BLOCK_W, h: 0.85, stroke: '#111111', sw: 1 }),
    e({ type: 'logo', x: 0.08, y: 0.08, w: 0.69, h: 0.69 }),
    e({ type: 'line', x: 0.85, y: 0, w: 0, h: 0.85, stroke: '#111111', sw: 0.75 }),
    e({ type: 'text', x: 0.95, y: 0.07, w: 2.6, h: 0.25, text: '{COMPANY}', size: 10, bold: true }),
    e({ type: 'text', x: 0.95, y: 0.32, w: 2.6, h: 0.5, text: '{ADDRESS}\n{PHONE}', size: 7 }),
    e({ type: 'line', x: 3.65, y: 0, w: 0, h: 0.85, stroke: '#111111', sw: 0.75 }),
    lbl(3.75, 0.07, 'JOB'), e({ type: 'text', x: 3.75, y: 0.19, w: 2.2, h: 0.25, text: '{JOB}', size: 10, bold: true }),
    lbl(3.75, 0.47, 'CUSTOMER'), e({ type: 'text', x: 3.75, y: 0.59, w: 2.2, h: 0.22, text: '{CUSTOMER}', size: 8.5 }),
    e({ type: 'line', x: 6.05, y: 0, w: 0, h: 0.85, stroke: '#111111', sw: 0.75 }),
    lbl(6.15, 0.07, 'SHEET'), e({ type: 'text', x: 6.15, y: 0.19, w: 2.75, h: 0.36, text: '{SHEET}', size: 14, bold: true }),
    e({ type: 'text', x: 6.15, y: 0.6, w: 2.75, h: 0.2, text: '{ROOM}', size: 8 }),
    e({ type: 'line', x: 9.0, y: 0, w: 0, h: 0.85, stroke: '#111111', sw: 0.75 }),
    lbl(9.1, 0.07, 'PAGE'), e({ type: 'text', x: 9.1, y: 0.19, w: 1.15, h: 0.25, text: '{PAGE}', size: 10, bold: true }),
    lbl(9.1, 0.47, 'DATE'), e({ type: 'text', x: 9.1, y: 0.59, w: 1.15, h: 0.2, text: '{DATE}', size: 8 }),
  ] };
}
let PRINT_LAYOUTS = [plDefaultCover(), plDefaultBlock()];
// A saved copy of the first built-in cover is swapped for the new one (covers you made or renamed are kept).
shopLoad('printLayouts', v => { if (Array.isArray(v) && v.length) PRINT_LAYOUTS = v.map(l => l.id === 'pl-cover' && !l.v && l.name === 'Cover with 3D' ? plDefaultCover() : l); });
function plSave() { shopSave('printLayouts', PRINT_LAYOUTS, 'print layouts'); }
const plById = id => PRINT_LAYOUTS.find(l => l.id === id);
// The preset's cover or title block ('none' for no title block), else the first of that kind.
function plFor(pr, kind) {
  const id = kind === 'cover' ? pr.cover : pr.block;
  if (kind === 'block' && id === 'none') return null;
  return (id && plById(id)) || PRINT_LAYOUTS.find(l => l.kind === kind) || null;
}

/* ----- Names filled in on the page ----- */
function plVars(x = {}) {
  return { COMPANY: COMPANY.name || '', ADDRESS: COMPANY.address || '', PHONE: COMPANY.phone || '', EMAIL: COMPANY.email || '', WEB: COMPANY.web || '',
    JOB: S.job.name || '', CUSTOMER: S.job.customer || '', DATE: new Date().toLocaleDateString(), ROOMS: S.rooms.map(r => r.name).join(', '), ROOM: '', SHEET: '', PAGE: '%%PG%%', ...x };
}
const PL_NAMES = [['COMPANY', 'Company name'], ['ADDRESS', 'Address'], ['PHONE', 'Phone'], ['EMAIL', 'Email'], ['WEB', 'Website'], ['JOB', 'Job name'], ['CUSTOMER', 'Customer'], ['ROOM', 'Room'], ['ROOMS', 'All rooms'], ['SHEET', 'Sheet name (Wall 2, Floor plan)'], ['PAGE', 'Page 3 of 8'], ['DATE', "Today's date"]];

/* ----- Drawing a layout ----- */
// One piece as HTML, in inches. pic() gives the 3D picture for a view3d piece.
function plElHTML(e, vars, pic, edit) {
  const box = `left:${e.x}in;top:${e.y}in;width:${Math.max(0, e.w)}in;height:${Math.max(0, e.h)}in`, id = edit ? ` data-pe="${e.id}"` : '';
  switch (e.type) {
    case 'text': {
      const t = fillVars(e.text || '', vars).replace(/\n{2,}/g, '\n').trim();
      return `<div class="pl-el pl-text"${id} style="${box};font-size:${e.size || 10}pt;font-weight:${e.bold ? 700 : 400};${e.italic ? 'font-style:italic;' : ''}text-align:${e.align || 'left'};color:${e.color || '#111111'}">${esc(t)}</div>`;
    }
    case 'rect': return `<div class="pl-el"${id} style="${box};background:${e.fill || 'transparent'};${e.stroke ? `border:${e.sw || 1}pt solid ${e.stroke};` : ''}border-radius:${e.r || 0}in"></div>`;
    case 'line': { const flat = e.w >= e.h; return `<div class="pl-el pl-line"${id} style="left:${e.x}in;top:${e.y}in;${flat ? `width:${e.w}in;height:0;border-top` : `height:${e.h}in;width:0;border-left`}:${e.sw || 1}pt solid ${e.stroke || '#111111'}"></div>`; }
    case 'logo': return COMPANY.logo ? `<img class="pl-el pl-img"${id} style="${box}" src="${esc(COMPANY.logo)}" alt="Logo">` : (edit ? `<div class="pl-el pl-empty"${id} style="${box}">Logo</div>` : '');
    case 'image': return e.src ? `<img class="pl-el pl-img"${id} style="${box}" src="${esc(e.src)}" alt="">` : (edit ? `<div class="pl-el pl-empty"${id} style="${box}">Picture</div>` : '');
    case 'view3d': { const p = pic && pic(e); return p ? `<img class="pl-el pl-img pl-cover"${id} style="${box}" src="${p.url}" data-pic="${esc(p.key)}" alt="3D view">` : `<div class="pl-el pl-empty"${id} style="${box}">3D view of the main room</div>`; }
  }
  return '';
}
function plHTML(l, vars, pic, edit) { return (l.els || []).map(e => plElHTML(e, vars, pic, edit)).join(''); }

// The main room is the one with the most cabinets; its best view is its first saved 3D view, else the front corner.
function plMainRoom(rooms) { return (rooms && rooms.length ? rooms : S.rooms).slice().sort((a, b) => b.cabinets.length - a.cabinets.length)[0]; }
function plPic(rooms) {
  return e => {
    const room = plMainRoom(rooms); if (!room || typeof printPic !== 'function') return null;
    const vw = (room.views || [])[0] || { id: 'iso' }, aspect = e.w / (e.h || 1), key = `cover|${room.id}|${vw.id}|${aspect.toFixed(2)}`;
    const url = printPic(key, () => print3DShot(room, vw, { real: true, aspect, tight: true }));
    return url ? { url, key } : null;
  };
}
function printCover(pr, rooms) {
  const l = plFor(pr, 'cover'); if (!l) return '';
  return `<section class="mp-page mp-cover"><div class="pl-box" style="width:${PL_COVER.w}in;height:${PL_COVER.h}in">${plHTML(l, plVars({ ROOMS: rooms.map(r => r.name).join(', ') }), plPic(rooms))}</div></section>`;
}
// The title block across the bottom of a drawing page, or the plain strip when the preset has none.
function printBlock(pr, room, what) {
  const l = plFor(pr, 'block'); if (!l) return null;
  return `<footer class="pl-block" style="height:${l.h || 0.85}in"><div class="pl-box" style="width:${PL_BLOCK_W}in;height:${l.h || 0.85}in">${plHTML(l, plVars({ ROOM: room, SHEET: what }), plPic())}</div></footer>`;
}

/* ----- Symbols: ready pieces to drop on a layout ----- */
const plLabel = (t, v, w = 2) => [{ type: 'text', x: 0, y: 0, w, h: 0.14, text: t, size: 5.5, bold: true, color: '#666666' }, { type: 'text', x: 0, y: 0.13, w, h: 0.26, text: v, size: 10, bold: true }];
const PL_SYMBOLS = [
  ['Text', [{ type: 'text', x: 0, y: 0, w: 2, h: 0.3, text: 'Text', size: 10 }]],
  ['Company name', [{ type: 'text', x: 0, y: 0, w: 3, h: 0.35, text: '{COMPANY}', size: 14, bold: true }]],
  ['Address and phone', [{ type: 'text', x: 0, y: 0, w: 2.6, h: 0.8, text: '{ADDRESS}\n{PHONE}\n{EMAIL}', size: 8.5 }]],
  ['Logo', [{ type: 'logo', x: 0, y: 0, w: 1, h: 1 }]],
  ['Picture', [{ type: 'image', x: 0, y: 0, w: 2, h: 1.5 }]],
  ['3D view of the main room', [{ type: 'view3d', x: 0, y: 0, w: 4, h: 2.7 }]],
  ['Job name', plLabel('JOB', '{JOB}')],
  ['Customer', plLabel('CUSTOMER', '{CUSTOMER}')],
  ['Sheet name', plLabel('SHEET', '{SHEET}', 2.6)],
  ['Page number', plLabel('PAGE', '{PAGE}', 1.2)],
  ['Date', plLabel('DATE', '{DATE}', 1.2)],
  ['Drawn by', plLabel('DRAWN BY', 'Name', 1.5)],
  ['Box', [{ type: 'rect', x: 0, y: 0, w: 2, h: 1, stroke: '#111111', sw: 1 }]],
  ['Color band', [{ type: 'rect', x: 0, y: 0, w: 4, h: 0.4, fill: '#16202c' }]],
  ['Circle', [{ type: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: '#111111', sw: 1, r: 0.5 }]],
  ['Line', [{ type: 'line', x: 0, y: 0, w: 3, h: 0, stroke: '#111111', sw: 1 }]],
  ['Customer approval', [{ type: 'rect', x: 0, y: 0, w: 3.4, h: 0.7, stroke: '#111111', sw: 1 }, { type: 'text', x: 0.08, y: 0.06, w: 3, h: 0.16, text: 'CUSTOMER APPROVAL', size: 5.5, bold: true, color: '#666666' },
    { type: 'line', x: 0.08, y: 0.5, w: 2.1, h: 0, stroke: '#111111', sw: 0.75 }, { type: 'line', x: 2.35, y: 0.5, w: 0.95, h: 0, stroke: '#111111', sw: 0.75 }, { type: 'text', x: 0.08, y: 0.52, w: 1, h: 0.15, text: 'Signature', size: 5.5, color: '#666666' }, { type: 'text', x: 2.35, y: 0.52, w: 1, h: 0.15, text: 'Date', size: 5.5, color: '#666666' }]],
  ['Revisions', [{ type: 'rect', x: 0, y: 0, w: 2.6, h: 0.8, stroke: '#111111', sw: 1 }, { type: 'text', x: 0.08, y: 0.05, w: 2.4, h: 0.16, text: 'REV      DATE        BY      NOTE', size: 5.5, bold: true, color: '#666666' }, { type: 'line', x: 0, y: 0.24, w: 2.6, h: 0, stroke: '#111111', sw: 0.5 }]],
];
let MY_SYMBOLS = [];
shopLoad('printSymbols', v => { if (Array.isArray(v)) MY_SYMBOLS = v; });

/* ----- The layout editor ----- */
let plEd = null; // { id, sel, drag }
const plCur = () => plById(plEd && plEd.id) || PRINT_LAYOUTS[0];
const plSize = l => l.kind === 'cover' ? PL_COVER : { w: PL_BLOCK_W, h: l.h || 0.85 };
const r16 = v => Math.round(v * 16) / 16;
function openLayoutEditor(id) { plEd = { id: id || (PRINT_LAYOUTS[0] || {}).id, sel: null }; renderLayoutEditor(); }
function closeLayoutEditor() { const el = $('#pleditor'); if (el) el.hidden = true; plEd = null; if (typeof showMultiPrint === 'function' && $('#multiprint') && !$('#multiprint').hidden) showMultiPrint(); }
function renderLayoutEditor() {
  let el = $('#pleditor');
  if (!el) { el = document.createElement('div'); el.id = 'pleditor'; el.className = 'labelsheet plsheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Print layouts'); document.body.appendChild(el); }
  const l = plCur(); if (!l) return;
  const sz = plSize(l), e = (l.els || []).find(x => x.id === plEd.sel), opt = (k, n) => PRINT_LAYOUTS.filter(x => x.kind === k).map(x => `<option value="${x.id}"${x.id === l.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const num = (k, lab, v, st = '1/16') => `<label class="f"><span>${lab}</span><input type="text" class="pl-in num" data-k="${k}" value="${k === 'size' || k === 'sw' ? v : fmtLen(v)}" aria-label="${lab}" title="${st}"></label>`;
  const col = (k, lab, v) => `<label class="f pl-col"><span>${lab}</span><span class="pl-colrow"><input type="color" class="pl-in" data-k="${k}" value="${v && v !== 'transparent' ? esc(v) : '#ffffff'}" aria-label="${lab}">${k !== 'color' ? `<button class="btn sm" data-act="pl-nocol" data-id="${k}" title="None"${!v || v === 'transparent' ? ' aria-pressed="true"' : ''}>None</button>` : ''}</span></label>`;
  const props = !e ? `<div class="note">Click a piece on the page to change it, or add one from Symbols. Drag pieces to move them; drag the corner to size them.</div>` : `
    <div class="pl-props">
      ${e.type === 'text' ? `<label class="f wide"><span>Text</span><textarea class="pl-in" data-k="text" rows="3" aria-label="Text">${esc(e.text || '')}</textarea></label>
        <div class="note pl-names">${PL_NAMES.map(([k, d]) => `<code title="${esc(d)}">{${k}}</code>`).join(' ')}</div>
        <div class="pl-row">${num('size', 'Size (pt)', e.size || 10)}<label class="f"><span>Align</span><select class="pl-in" data-k="align" aria-label="Align">${['left', 'center', 'right'].map(a => `<option${(e.align || 'left') === a ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
          <label class="checkrow"><input type="checkbox" class="pl-in" data-k="bold"${e.bold ? ' checked' : ''}> Bold</label><label class="checkrow"><input type="checkbox" class="pl-in" data-k="italic"${e.italic ? ' checked' : ''}> Italic</label>${col('color', 'Color', e.color || '#111111')}</div>` : ''}
      ${e.type === 'rect' ? `<div class="pl-row">${col('fill', 'Fill', e.fill)}${col('stroke', 'Border', e.stroke)}${num('sw', 'Border (pt)', e.sw || 1)}${num('r', 'Round corners', e.r || 0)}</div>` : ''}
      ${e.type === 'line' ? `<div class="pl-row">${col('stroke', 'Color', e.stroke || '#111111')}${num('sw', 'Thickness (pt)', e.sw || 1)}</div>` : ''}
      ${e.type === 'image' ? `<label class="btn">${icon('upload')}Pick a picture<input type="file" class="pl-pic" accept="image/*" hidden></label>` : ''}
      ${e.type === 'logo' ? '<div class="note">The logo comes from Company below.</div>' : ''}
      ${e.type === 'view3d' ? `<div class="note">The main room's first saved 3D view (Save view in 3D), else the corner view, in the realistic look.</div>` : ''}
      <div class="pl-row">${num('x', 'Left', e.x)}${num('y', 'Top', e.y)}${num('w', 'Width', e.w)}${num('h', 'Height', e.h)}</div>
      <div class="row-actions"><button class="btn sm" data-act="pl-front">To front</button><button class="btn sm" data-act="pl-back">To back</button><button class="btn sm" data-act="pl-dup">${icon('copy')}Copy</button><button class="btn sm" data-act="pl-sym">${icon('plus')}Save as symbol</button><button class="btn sm" data-act="pl-eldel">${icon('trash')}Delete</button></div>
    </div>`;
  const sym = (n, i, mine) => `<button class="pl-symbtn" data-act="pl-add" data-id="${mine ? 'm' : 's'}${i}">${esc(n)}${mine ? `<span class="pl-symdel" data-act="pl-symdel" data-id="${i}" title="Remove from my symbols" aria-label="Remove ${esc(n)}">×</span>` : ''}</button>`;
  el.innerHTML = `<div class="lbbar">
      <label class="f"><span>Layout</span><select class="pl-pick" aria-label="Layout"><optgroup label="Covers">${opt('cover')}</optgroup><optgroup label="Title blocks">${opt('block')}</optgroup></select></label>
      <label class="f"><span>Name</span><input type="text" class="pl-name" value="${esc(l.name)}" aria-label="Layout name"></label>
      ${l.kind === 'block' ? `<label class="f"><span>Block height</span><input type="text" class="pl-bh num" value="${fmtLen(l.h || 0.85)}" aria-label="Title block height"></label>` : ''}
      <div class="row-actions"><button class="btn sm" data-act="pl-new" data-id="cover">${icon('plus')}New cover</button><button class="btn sm" data-act="pl-new" data-id="block">${icon('plus')}New title block</button><button class="btn sm" data-act="pl-copy">${icon('copy')}Copy</button>${PRINT_LAYOUTS.filter(x => x.kind === l.kind).length > 1 ? `<button class="btn sm" data-act="pl-del">${icon('trash')}Delete</button>` : ''}<button class="btn primary" data-act="pl-done">Done</button></div></div>
    <div class="pl-work">
      <div class="pl-stage" id="plstage"><div class="pl-paper ${l.kind}" style="width:${sz.w}in;height:${sz.h}in" id="plpaper">${plHTML(l, plVars({ ROOM: curRoom().name, SHEET: 'Wall 1', PAGE: '3 of 8' }), plPic(), true)}${e ? `<div class="pl-selbox" style="left:${e.x}in;top:${e.y}in;width:${Math.max(e.w, 0.02)}in;height:${Math.max(e.h, 0.02)}in"><i class="pl-handle" data-handle="1"></i></div>` : ''}</div></div>
      <div class="pl-side">
        <div class="card"><div class="cardbody">${props}</div></div>
        <div class="card"><div class="cardbody"><h3 class="pl-h">Symbols</h3><div class="pl-syms">${PL_SYMBOLS.map(([n], i) => sym(n, i)).join('')}</div>${MY_SYMBOLS.length ? `<h3 class="pl-h">My symbols</h3><div class="pl-syms">${MY_SYMBOLS.map((s, i) => sym(s.name, i, true)).join('')}</div>` : ''}</div></div>
        <div class="card"><div class="cardbody"><h3 class="pl-h">Company</h3>
          <label class="f wide"><span>Company name</span><input type="text" class="pl-co" data-k="name" value="${esc(COMPANY.name)}" aria-label="Company name"></label>
          <label class="f wide"><span>Address</span><textarea class="pl-co" data-k="address" rows="2" aria-label="Address" placeholder="123 Main St\nTown, ST 00000">${esc(COMPANY.address)}</textarea></label>
          <div class="pl-row"><label class="f"><span>Phone</span><input type="text" class="pl-co" data-k="phone" value="${esc(COMPANY.phone)}" aria-label="Phone"></label><label class="f"><span>Email</span><input type="text" class="pl-co" data-k="email" value="${esc(COMPANY.email)}" aria-label="Email"></label><label class="f"><span>Website</span><input type="text" class="pl-co" data-k="web" value="${esc(COMPANY.web)}" aria-label="Website"></label></div>
          <div class="pl-row pl-logo">${COMPANY.logo ? `<img src="${esc(COMPANY.logo)}" alt="Logo">` : ''}<label class="btn sm">${icon('upload')}Change logo<input type="file" class="pl-logoin" accept="image/*" hidden></label></div></div></div>
      </div></div>`;
  el.hidden = false;
  plFit();
}
// The page is drawn at its real size in inches and scaled to fit the space beside the side panel.
function plFit() {
  const st = $('#plstage'), pp = $('#plpaper'); if (!st || !pp) return;
  pp.style.zoom = ''; const k = Math.min(1.6, (st.clientWidth - 24) / pp.offsetWidth, plCur().kind === 'cover' ? (st.clientHeight - 24) / pp.offsetHeight : 9);
  pp.style.zoom = String(Math.max(0.2, k)); plEd.k = Math.max(0.2, k);
}
window.addEventListener('resize', () => { if (plEd) plFit(); });
function plEdit(fn, again = true) { const l = plCur(); fn(l, (l.els || []).find(x => x.id === plEd.sel)); plSave(); if (again) renderLayoutEditor(); }
function plAddSymbol(els) {
  const l = plCur(), sz = plSize(l), ws = els.map(e => e.x + e.w), hs = els.map(e => e.y + e.h), bw = Math.max(...ws), bh = Math.max(...hs);
  const ox = r16(Math.max(0, (sz.w - bw) / 2)), oy = r16(Math.max(0, (sz.h - bh) / 2)), ids = [];
  plEdit(l => { els.forEach(e => { const n = { ...JSON.parse(JSON.stringify(e)), id: plId(), x: r16(e.x + ox), y: r16(e.y + oy) }; ids.push(n.id); l.els.push(n); }); plEd.sel = ids[0]; });
}
function plAct(a, id) {
  const l = plCur();
  switch (a) {
    case 'pl-open': openLayoutEditor(id); return true;
    case 'pl-done': closeLayoutEditor(); return true;
    case 'pl-new': { const n = id === 'cover' ? { id: uid('pl'), name: 'New cover', kind: 'cover', els: [] } : { id: uid('pl'), name: 'New title block', kind: 'block', h: 0.85, els: [{ id: plId(), type: 'rect', x: 0, y: 0, w: PL_BLOCK_W, h: 0.85, stroke: '#111111', sw: 1 }] }; PRINT_LAYOUTS.push(n); plEd.id = n.id; plEd.sel = null; plSave(); renderLayoutEditor(); return true; }
    case 'pl-copy': { const n = { ...JSON.parse(JSON.stringify(l)), id: uid('pl'), name: l.name + ' copy' }; n.els.forEach(e => { e.id = plId(); }); PRINT_LAYOUTS.push(n); plEd.id = n.id; plEd.sel = null; plSave(); renderLayoutEditor(); return true; }
    case 'pl-del': PRINT_LAYOUTS = PRINT_LAYOUTS.filter(x => x !== l); plEd.id = (PRINT_LAYOUTS.find(x => x.kind === l.kind) || PRINT_LAYOUTS[0]).id; plEd.sel = null; plSave(); renderLayoutEditor(); return true;
    case 'pl-add': { const src = id[0] === 'm' ? (MY_SYMBOLS[+id.slice(1)] || {}).els : (PL_SYMBOLS[+id.slice(1)] || [])[1]; if (src) plAddSymbol(src); return true; }
    case 'pl-symdel': MY_SYMBOLS.splice(+id, 1); shopSave('printSymbols', MY_SYMBOLS, 'symbols'); renderLayoutEditor(); return true;
    case 'pl-eldel': plEdit(l => { l.els = l.els.filter(e => e.id !== plEd.sel); plEd.sel = null; }); return true;
    case 'pl-dup': plEdit((l, e) => { if (!e) return; const n = { ...JSON.parse(JSON.stringify(e)), id: plId(), x: r16(e.x + 0.25), y: r16(e.y + 0.25) }; l.els.push(n); plEd.sel = n.id; }); return true;
    case 'pl-front': plEdit((l, e) => { if (e) { l.els = l.els.filter(x => x !== e); l.els.push(e); } }); return true;
    case 'pl-back': plEdit((l, e) => { if (e) { l.els = l.els.filter(x => x !== e); l.els.unshift(e); } }); return true;
    case 'pl-nocol': plEdit((l, e) => { if (e) e[id] = ''; }); return true;
    case 'pl-sym': { const e = (l.els || []).find(x => x.id === plEd.sel); if (!e) return true; const name = (e.type === 'text' ? (e.text || '').split('\n')[0] : e.type).slice(0, 30) || 'Symbol'; MY_SYMBOLS.push({ name, els: [{ ...JSON.parse(JSON.stringify(e)), x: 0, y: 0 }] }); shopSave('printSymbols', MY_SYMBOLS, 'symbols'); renderLayoutEditor(); flash(`Saved "${name}" to My symbols`); return true; }
  }
  return false;
}
document.addEventListener('click', e => {
  const t = e.target; if (!t.closest || !t.closest('#pleditor')) return;
  const b = t.closest('[data-act]');
  if (b && /^pl-/.test(b.dataset.act)) { e.preventDefault(); e.stopPropagation(); plAct(b.dataset.act, b.dataset.id); }
}, true);
const readPic = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#pleditor')) return;
  if (t.classList.contains('pl-pick')) { plEd.id = t.value; plEd.sel = null; renderLayoutEditor(); return; }
  if (t.classList.contains('pl-name')) { plEdit(l => { l.name = t.value || l.name; }); return; }
  if (t.classList.contains('pl-bh')) { const v = parseLen(t.value); if (v > 0.2 && v < 4) plEdit(l => { l.h = v; }); else renderLayoutEditor(); return; }
  if (t.classList.contains('pl-co')) { COMPANY[t.dataset.k] = t.value; companySave(); renderLayoutEditor(); return; }
  if (t.classList.contains('pl-logoin') && t.files[0]) { readPic(t.files[0]).then(u => { COMPANY.logo = u; companySave(); renderLayoutEditor(); }); return; }
  if (t.classList.contains('pl-pic') && t.files[0]) { readPic(t.files[0]).then(u => plEdit((l, el) => { if (el) el.src = u; })); return; }
  if (t.classList.contains('pl-in')) {
    const k = t.dataset.k;
    plEdit((l, el) => {
      if (!el) return;
      if (t.type === 'checkbox') el[k] = t.checked;
      else if (['x', 'y', 'w', 'h', 'r'].includes(k)) { const v = parseLen(t.value); if (isFinite(v) && v >= 0) el[k] = v; }
      else if (k === 'size' || k === 'sw') { const v = parseFloat(t.value); if (v > 0) el[k] = v; }
      else el[k] = t.value;
    });
  }
});
// Click to pick a piece; drag to move it, or drag the corner handle to size it, in 1/16" steps.
document.addEventListener('pointerdown', e => {
  if (!plEd || !e.target.closest || !e.target.closest('#plpaper')) return;
  const l = plCur(), hd = e.target.closest('[data-handle]'), hit = e.target.closest('[data-pe]');
  const el = hd ? (l.els || []).find(x => x.id === plEd.sel) : hit && (l.els || []).find(x => x.id === hit.dataset.pe);
  if (!el) { if (plEd.sel) { plEd.sel = null; renderLayoutEditor(); } return; }
  e.preventDefault();
  if (plEd.sel !== el.id) { plEd.sel = el.id; renderLayoutEditor(); }
  plEd.drag = { el, resize: !!hd, sx: e.clientX, sy: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h, moved: false };
});
document.addEventListener('pointermove', e => {
  const d = plEd && plEd.drag; if (!d) return;
  const k = 96 * (plEd.k || 1), dx = (e.clientX - d.sx) / k, dy = (e.clientY - d.sy) / k; if (Math.abs(dx) + Math.abs(dy) > 0.02) d.moved = true;
  if (d.resize) { d.el.w = Math.max(0, r16(d.w + dx)); d.el.h = Math.max(0, r16(d.h + dy)); if (d.el.type === 'line') { if (d.w >= d.h) d.el.h = 0; else d.el.w = 0; } }
  else { d.el.x = r16(d.x + dx); d.el.y = r16(d.y + dy); }
  const n = document.querySelector(`#plpaper [data-pe="${d.el.id}"]`), sb = document.querySelector('#plpaper .pl-selbox');
  [n, sb].forEach(x => { if (!x) return; x.style.left = d.el.x + 'in'; x.style.top = d.el.y + 'in'; if (x === sb || d.el.type !== 'line') { x.style.width = Math.max(d.el.w, 0.02) + 'in'; x.style.height = Math.max(d.el.h, 0.02) + 'in'; } else if (d.el.w >= d.el.h) x.style.width = d.el.w + 'in'; else x.style.height = d.el.h + 'in'; });
});
document.addEventListener('pointerup', () => { const d = plEd && plEd.drag; if (!d) return; plEd.drag = null; if (d.moved) { plSave(); renderLayoutEditor(); } });
document.addEventListener('keydown', e => {
  if (!plEd || !plEd.sel || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); plAct('pl-eldel'); }
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (mv) { e.preventDefault(); const st = e.shiftKey ? 0.25 : 1 / 16; plEdit((l, el) => { if (el) { el.x = r16(el.x + mv[0] * st); el.y = r16(el.y + mv[1] * st); } }); }
});
