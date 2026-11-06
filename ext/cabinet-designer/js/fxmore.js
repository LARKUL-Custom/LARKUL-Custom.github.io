/* ---------- Formulas and parameters, part 2 (Mozaik list F2–F11) ----------
   Part references like Side.th, opening sizes for inserts, parameter levels (cabinet, library, room, job),
   typed custom parameters with a shop-wide parameter library, job fields, a help list in the formula
   pop-up, formula errors on the field itself, and Rules: shop standards applied to every cabinet. */
'use strict';

/* ----- F2: <Part>.th, .l, .w, .qty ----- */
const PART_TH = { side: 'carcass', sides: 'carcass', bottom: 'carcass', top: 'carcass', stretcher: 'carcass', nailer: 'carcass', divider: 'carcass', back: 'back', shelf: 'shelf', fixedshelf: 'carcass', toekick: 'toeKick', toe: 'toeKick', toeskin: 'toeKick' };
let fxPartBusy = false;
function fxPartRef(c, base, prop) {
  const k = base.toLowerCase().replace(/_/g, ''), P = prop.toLowerCase();
  if (P === 'th' && PART_TH[k]) { const mt = cabMatT(cabSet(c, 'cabMatT')), m = mat(mt[PART_TH[k]]) || mat(mt.carcass); return m ? m.thick : undefined; }
  if (P === 'th' && /^drawer(side|box|bottom)?$/.test(k)) { const dm = drawerMatT(cabSet(c, 'drawerMatT')), m = mat(k === 'drawerbottom' ? dm.bottom : dm.sides); return m ? m.thick : undefined; }
  if (fxPartBusy) return undefined;
  fxPartBusy = true;
  try {
    const norm = s => s.replace(/[^a-z0-9]/gi, '').toLowerCase(), alias = { doorpanel: 'door', side: 'leftside' }[k] || k;
    const q = buildParts(c).parts.find(p => p.cabId === c.id && norm(p.name).startsWith(alias)); if (!q) return undefined;
    return { th: q.T, l: q.L, w: q.W, qty: q.qty }[P];
  } catch (_) { return undefined; } finally { fxPartBusy = false; }
}

/* ----- F7: opening sizes for an insert's own fields ----- */
function fxOpening(c, row) {
  const fr = computeFronts(c), rows = c.rows || [], r = row !== undefined && row !== '' ? +row : rows.map((x, i) => i).filter(i => (rows[i] || {}).type === 'door' || (rows[i] || {}).type === 'open').pop();
  const f = fr.find(x => x.row === r) || fr[fr.length - 1], t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || { thick: 0.75 }).thick;
  return { OpenW: r3(c.w - 2 * t), OpenH: f ? r3(f.z1 - f.z0) : r3(c.h - 2 * t), OpenD: r3(c.d - t) };
}

/* ----- F6: parameter levels. A name is looked for on the cabinet, then its library item, then the room, then the job. ----- */
function fxLevels(c) {
  const out = [], seen = new Set(), add = (list, from) => (list || []).filter(v => v && v.k).forEach(v => { if (!seen.has(v.k)) { seen.add(v.k); out.push({ ...v, from }); } else { const o = out.find(x => x.k === v.k); (o.under = o.under || []).push({ from, v: v.v }); } });
  if (c) { add(c.vars, 'Cabinet'); const li = c.libId && libItem(c.libId); if (li) add(li.vars, 'Library'); }
  add((curRoom() || {}).vars, 'Room'); add(S.job.vars, 'Job');
  return out;
}
const fxNum = v => v === true ? 1 : v === false ? 0 : +v;

// Wraps the formula names so the new ones work everywhere a formula is worked out.
const fxVarsBase = fxVarsFor, fxNamesBase = fxNameList;
fxVarsFor = function (ref, field) {
  const base = fxVarsBase(ref, field), own = fxOwner(ref), c = own.kind === 'cab' ? own.o : null;
  const ins = /^sub:inserts\|cab:(.+)$/.exec(ref), opening = ins && cab(ins[1]) ? (() => { const cc = cab(ins[1]), it = (cc.inserts || [])[+String(field).split('.')[0]]; return fxOpening(cc, it && it.row); })() : null;
  return name => {
    if (opening && opening[name] !== undefined) return opening[name];
    const m = /^([A-Za-z_]\w*)\.(th|l|w|qty)$/i.exec(name);
    if (m && c && !/^[A-Za-z]+\d+$/.test(m[1])) { const v = fxPartRef(c, m[1], m[2]); if (v !== undefined) return v; }
    if (c) {
      const cv = (c.vars || []).find(x => x.k === name); if (cv) return fxNum(cv.v);
      const li = c.libId && libItem(c.libId), lv = li && (li.vars || []).find(x => x.k === name); if (lv) return fxNum(lv.v);
    }
    if (!DIM_VARS[name]) { const rv = ((curRoom() || {}).vars || []).find(x => x.k === name); if (rv) return fxNum(rv.v); }
    const v = base(name); if (v !== undefined && !(typeof v === 'number' && isNaN(v))) return v;
    const jf = (S.job.fields || []).find(x => x.k === name); if (jf && isFinite(+jf.v) && String(jf.v).trim() !== '') return +jf.v;
    return v;
  };
};
fxNameList = function (ref) {
  const out = fxNamesBase(ref), own = fxOwner(ref), have = new Set(out.map(x => x.n));
  const c = own.kind === 'cab' ? own.o : null;
  if (c) {
    const li = c.libId && libItem(c.libId); (li && li.vars || []).filter(v => v.k && !have.has(v.k)).forEach(v => { have.add(v.k); out.push({ n: v.k, v: fxNum(v.v), what: 'library parameter' }); });
    ['Side', 'Back', 'Bottom', 'Shelf'].forEach(p => out.push({ n: p + '.th', v: fxPartRef(c, p, 'th'), what: `${p.toLowerCase()} thickness` }));
  }
  ((curRoom() || {}).vars || []).filter(v => v.k && !have.has(v.k)).forEach(v => out.push({ n: v.k, v: fxNum(v.v), what: 'room variable' }));
  const ins = /^sub:inserts\|cab:(.+)$/.exec(ref); if (ins && cab(ins[1])) Object.entries(fxOpening(cab(ins[1]))).forEach(([n, v]) => out.push({ n, v, what: 'opening size' }));
  return out.filter(x => x.v !== undefined);
};

/* ----- F5: typed custom parameters and the parameter library ----- */
const PARAM_TYPES = [['num', 'Number'], ['bool', 'Yes / no'], ['list', 'Pick from a list'], ['qty', 'Quantity']];
let PARAM_LIB = [];
async function loadParamLib() { try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get('paramLib') : JSON.parse(localStorage.getItem(KEY + '.paramLib') || 'null'); if (v && v.value) v = v.value; if (Array.isArray(v)) PARAM_LIB = v; } catch (_) {} }
function saveParamLib() { try { localStorage.setItem(KEY + '.paramLib', JSON.stringify(PARAM_LIB)); } catch (_) {} if (typeof inHub === 'function' && inHub()) Hub.storage.set('paramLib', PARAM_LIB).catch(() => flash('Could not save the parameter library.')); }
const listOpts = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean).map(t => { const m = t.split('='); return m.length > 1 ? { l: m[0].trim(), v: +m[1] } : { l: t, v: +t }; }).filter(o => isFinite(o.v));
// Keeps a value inside its type: yes/no as 1 or 0, quantities whole, numbers inside min and max.
function fxParamClamp(p, v) {
  const t = p.t || 'num';
  if (t === 'bool') return v === true || +v ? 1 : 0;
  let n = +v; if (!isFinite(n)) return v;
  if (t === 'qty') n = Math.max(0, Math.round(n));
  if (p.min !== undefined && p.min !== '' && n < +p.min) { flash(`${p.k} can't go under ${p.min}.`); n = +p.min; }
  if (p.max !== undefined && p.max !== '' && n > +p.max) { flash(`${p.k} can't go over ${p.max}.`); n = +p.max; }
  return n;
}
function fxValueCtl(ref, p) {
  const t = p.t || 'num';
  if (t === 'bool') return ctl(ref, 'v', !!+p.v, 'bool', { label: `${p.k} value` });
  if (t === 'list') { const o = listOpts(p.opts); return o.length ? ctl(ref, 'v', p.v, 'select', { label: `${p.k} value`, options: o.map(x => ({ v: x.v, l: x.l })) }) : '<span class="muted">Add choices</span>'; }
  return calcWrap(ctl(ref, 'v', p.v, t === 'qty' ? 'int' : 'len', { label: 'Parameter value' }), ref, 'v');
}
function fxParamBox(c) {
  const id = c.id, lv = fxLevels(c).filter(x => x.from !== 'Cabinet'), own = c.vars || [];
  const row = v => { const R = `cvar:${id}:${v.id}`, t = v.t || 'num', inh = lv.find(x => x.k === v.k);
    return `<tr><td>${ctl(R, 'k', v.k, 'text', { label: 'Parameter name', ph: 'NAME' })}</td><td>${ctl(R, 't', t, 'select', { label: 'Type', options: PARAM_TYPES.map(([v2, l]) => ({ v: v2, l })) })}</td><td class="fx-val">${fxValueCtl(R, v)}</td>
      <td class="fx-more">${t === 'list' ? ctl(R, 'opts', v.opts || '', 'text', { label: 'Choices', ph: 'Small=12, Large=18' }) : t === 'num' || t === 'qty' ? `${ctl(R, 'min', v.min ?? '', 'num', { label: 'Smallest', ph: 'min', blank: true })}${ctl(R, 'max', v.max ?? '', 'num', { label: 'Largest', ph: 'max', blank: true })}` : ''}</td>
      <td class="muted">${inh ? `over ${esc(inh.from.toLowerCase())}` : 'cabinet'}</td>
      <td class="pe-rowbtn"><button class="btn sm" data-act="fx-plib-save" data-id="${id}:${v.id}" title="Keep it in the parameter library for other jobs">Save</button><button class="btn sm danger" data-act="cvar-del" data-id="${id}:${v.id}" aria-label="Delete ${esc(v.k)}">${icon('trash')}</button></td></tr>`; };
  const inhRows = lv.filter(x => !own.some(o => o.k === x.k)).map(x => `<tr class="muted"><td><b>${esc(x.k)}</b></td><td>${esc((PARAM_TYPES.find(t => t[0] === (x.t || 'num')) || [])[1] || '')}</td><td>${(x.t || 'num') === 'bool' ? (+x.v ? 'Yes' : 'No') : esc(fmtLen(fxNum(x.v)))}</td><td></td><td>from the ${esc(x.from.toLowerCase())}</td><td><button class="btn sm" data-act="fx-override" data-id="${id}:${esc(x.k)}">Change here</button></td></tr>`).join('');
  return `<div class="psec box">${secHead('calc', 'Custom parameters', 'violet')}
    <div class="note">Named values for this cabinet's formulas, like <code>=W - REVEAL</code>. A name is looked for on the cabinet first, then its library item, then the room, then the job.</div>
    <div class="tscroll"><table class="t ptab cvars"><thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Limits / choices</th><th>Level</th><th></th></tr></thead><tbody>${own.map(row).join('')}${inhRows}${!own.length && !inhRows ? '<tr><td class="muted" colspan="6">None yet.</td></tr>' : ''}</tbody></table></div>
    <div class="row-actions"><button class="btn sm" data-act="cvar-add" data-id="${id}">${icon('plus')}Add a parameter</button>
      ${PARAM_LIB.length ? `<select class="fx-plib-pick" aria-label="Parameter from the library"><option value="">From the parameter library…</option>${PARAM_LIB.map((p, i) => `<option value="${i}">${esc(p.k)} (${esc((PARAM_TYPES.find(t => t[0] === (p.t || 'num')) || [])[1] || '')})</option>`).join('')}</select><button class="btn sm" data-act="fx-plib-add" data-id="${id}">Add</button><button class="btn sm danger" data-act="fx-plib-del" title="Delete the picked one from the library">Delete from library</button>` : ''}</div></div>`;
}

/* ----- F8: job fields (text or numbers) for labels and formulas; room variables (F6) ----- */
function fxVarsExtra() {
  const rm = curRoom(), rv = rm.vars || [], jf = S.job.fields || [];
  return `<div class="card"><div class="cardhead"><h3>${icon('calc')}Variables for ${esc(rm.name)}</h3><button class="btn primary" data-act="rvar-add">${icon('plus')}Add room variable</button></div>
    <div class="cardbody stack"><div class="note">These win over the job's variables in this room only. A cabinet's own parameters win over both.</div>
    <table class="t"><tbody>${rv.map(v => `<tr><td style="width:200px">${ctl(`rvar:${rm.id}:${v.id}`, 'k', v.k, 'text', { label: 'Variable name', ph: 'NAME' })}</td><td style="width:200px">${calcWrap(ctl(`rvar:${rm.id}:${v.id}`, 'v', v.v, 'len', { label: 'Variable value' }), `rvar:${rm.id}:${v.id}`, 'v')}</td><td><button class="btn sm danger" data-act="rvar-del" data-id="${v.id}" aria-label="Delete ${esc(v.k)}">${icon('trash')}</button></td></tr>`).join('') || '<tr><td class="muted">None.</td></tr>'}</tbody></table></div></div>
  <div class="card"><div class="cardhead"><h3>${icon('tag')}Job fields</h3><button class="btn primary" data-act="jfield-add">${icon('plus')}Add job field</button></div>
    <div class="cardbody stack"><div class="note">Anything about the job you want on labels, like a PO number or a site. Numbers can also be used in formulas by name. Built in: JOB (the job name), CUSTOMER and NOTES.</div>
    <table class="t"><tbody>${jf.map(f => `<tr><td style="width:200px">${ctl('jfield:' + f.id, 'k', f.k, 'text', { label: 'Field name', ph: 'NAME' })}</td><td>${ctl('jfield:' + f.id, 'v', f.v, 'text', { label: 'Field value' })}</td><td style="width:40px"><button class="btn sm danger" data-act="jfield-del" data-id="${f.id}" aria-label="Delete ${esc(f.k)}">${icon('trash')}</button></td></tr>`).join('') || '<tr><td class="muted">None.</td></tr>'}</tbody></table></div></div>`;
}
// Text for labels: {JOB}, {CUSTOMER}, {NOTES}, any job field, job or room variable.
function jobText(name) {
  const k = String(name).toUpperCase();
  if (k === 'JOB') return S.job.name || ''; if (k === 'CUSTOMER') return S.job.customer || ''; if (k === 'CUSTADDRESS') return S.job.address || ''; if (k === 'NOTES') return S.job.notes || '';
  const f = (S.job.fields || []).find(x => x.k === name || x.k === k); if (f) return String(f.v ?? '');
  const v = [...((curRoom() || {}).vars || []), ...(S.job.vars || [])].find(x => x.k === name || x.k === k); return v ? fmtLen(+v.v, 1) : undefined;
}

/* ----- F4: the formula pop-up gets a ? list of every name and function, and a Test button ----- */
const openCalcBase = openCalc;
openCalc = function (inputId) {
  openCalcBase(inputId); const pop = $('#calcpop'); if (!pop || pop.hidden || !calcFor) return;
  const head = pop.querySelector('.calc-head'), names = fxNameList(calcFor.ref);
  if (head && !head.querySelector('[data-act=calc-help]')) head.querySelector('b').insertAdjacentHTML('afterend', '<button class="btn sm" data-act="calc-help" aria-expanded="false" title="Every name and function you can use">?</button>');
  const acts = pop.querySelector('.row-actions'); if (acts) acts.insertAdjacentHTML('afterbegin', '<button class="btn sm" data-act="calc-test">Test</button>');
  pop.insertAdjacentHTML('beforeend', `<div class="calc-help" hidden><table class="t"><tbody>
    ${names.map(n => `<tr><td><button class="lnk" data-act="calc-ins" data-id="${esc(n.n)}">${esc(n.n)}</button></td><td>${esc(n.what)}</td><td class="n">${esc(typeof n.v === 'number' ? fmtLen(n.v) : String(n.v))}</td></tr>`).join('')}
    <tr><td colspan="3" class="eyebrow">Also</td></tr>
    <tr><td>B1.W, #101.H</td><td colspan="2">another cabinet's size by its label</td></tr>
    <tr><td>Side.th, Back.th, Door.l</td><td colspan="2">a part's thickness, length or width (.th .l .w .qty)</td></tr>
    <tr><td>OpenW, OpenH, OpenD</td><td colspan="2">the opening, in an insert's fields</td></tr>
    <tr><td>PartL, PartW, PartTh, mm, Tomm</td><td colspan="2">in the part editor</td></tr>
    <tr><td colspan="3" class="eyebrow">Functions</td></tr>
    <tr><td colspan="3">${Object.keys(FX_FUNCS).map(f => `<code>${f}( )</code>`).join(' ')}</td></tr>
    <tr><td colspan="3">Compare with <code>&lt; &gt; &lt;= &gt;= = &lt;&gt;</code> (1 if true, 0 if not), join with <code>and</code> / <code>or</code>. Example: <code>if(W &gt; 30, 2, 1)</code></td></tr></tbody></table></div>`);
};
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#calcpop [data-act=calc-help], #calcpop [data-act=calc-test]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.act === 'calc-help') { const h = $('#calcpop .calc-help'), open = h.hidden; h.hidden = !open; b.setAttribute('aria-expanded', String(open)); }
  else { calcPreview(); const o = $('#calc-out'); flash(o ? (o.classList.contains('bad') ? 'Does not work: ' : 'Works out to ') + o.textContent.replace(/^= /, '') : ''); }
}, true);

/* ----- F9: Rules, shop standards applied to every cabinet in every job ----- */
const RULE_ACTS = [['hide', 'Leave out parts'], ['size', 'Change part size'], ['addop', 'Add an operation template to parts'], ['addpart', 'Add a part']];
let RULES = [];
async function loadRules() { try { let v = typeof inHub === 'function' && inHub() ? await Hub.storage.get('rules') : JSON.parse(localStorage.getItem(KEY + '.rules') || 'null'); if (v && v.value) v = v.value; if (Array.isArray(v)) RULES = v; } catch (_) {} }
let rulesTimer = null;
function saveRules() { clearTimeout(rulesTimer); rulesTimer = setTimeout(() => { try { localStorage.setItem(KEY + '.rules', JSON.stringify(RULES)); } catch (_) {} if (typeof inHub === 'function' && inHub()) Hub.storage.set('rules', RULES).catch(() => flash('Could not save the rules.')); }, 300); }
const ruleMatch = (q, pat) => { const p = String(pat || '').trim().toLowerCase(); return !p || p === '*' || q.name.toLowerCase().includes(p); };
function fxApplyRules(c, parts, warn, part, x) {
  const on = RULES.filter(r => r.on !== false && (!r.cat || r.cat === c.cat)); if (!on.length) return;
  const cv = fxVarsFor('cab:' + c.id, null), bad = (r, m) => warn.push(`Rule "${r.name || 'rule'}": ${m}`);
  on.forEach(r => {
    if (String(r.when || '').trim()) { let ok = 0; try { ok = evalExpr(r.when, cv); } catch (e) { bad(r, `the condition did not work (${e.message})`); return; } if (!ok) return; }
    const mine = parts.filter(q => q.cabId === c.id && ruleMatch(q, r.part));
    if (r.act === 'hide') mine.forEach(q => parts.splice(parts.indexOf(q), 1));
    else if (r.act === 'size') mine.forEach(q => { const pv = partVars(c, q); ['L', 'W', 'qty'].forEach(k => { const t = r[k]; if (t === undefined || String(t).trim() === '') return; try { const v = evalExpr(String(t), pv); if (isFinite(v) && v >= 0) q[k] = k === 'qty' ? Math.round(v) : r3(v); } catch (e) { bad(r, `${k} did not work (${e.message})`); } }); });
    else if (r.act === 'addop') {
      const tpl = typeof OP_TEMPLATES !== 'undefined' && OP_TEMPLATES.find(t => t.id === r.tpl); if (!tpl) { bad(r, 'its operation template is missing'); return; }
      mine.forEach(q => {
        const key = q.editKey || peKey(q.name), keep = c.partEdits, n0 = q.ops.length;
        c.partEdits = { [key]: { ops: [clone(tpl.op)] } }; q.editKey = key;
        try { applyPartEdits(c, [q], warn, partTpl(cabSet(c, 'partT'))); } finally { c.partEdits = keep; }
        q.ops.slice(n0).forEach(o => { delete o.user; o.why = `${o.why || tpl.name} (rule)`; });
      });
    } else if (r.act === 'addpart') {
      const vars = cv, num = (t, d) => { try { const v = evalExpr(String(t || d), vars); return isFinite(v) ? v : d; } catch (_) { return d; } };
      part(r.newName || 'Rule part', x.cm, r3(num(r.newL, x.inW)), r3(num(r.newW, x.inD)), { qty: Math.max(1, Math.round(num(r.newQty, 1))), kind: 'divider' });
    }
  });
}
function renderRules() {
  const tpls = typeof OP_TEMPLATES !== 'undefined' ? OP_TEMPLATES : [], inp = (i, k, v, ph, w) => `<input class="rl-in" data-i="${i}" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph || '')}" aria-label="${esc(ph || k)}"${w ? ` style="width:${w}"` : ''}>`;
  $('#tab-rules').innerHTML = `<div class="pagehead"><div><h2>Rules</h2><p>Shop standards worked into every cabinet of every job, like "every Base cabinet wider than 30 gets a center support". Conditions and sizes are formulas.</p></div>
    <div class="row-actions"><button class="btn primary" data-act="rl-add">${icon('plus')}Add rule</button></div></div>
    ${RULES.map((r, i) => `<div class="card cardbody rl-card${r.on === false ? ' off' : ''}"><div class="rl-row">
      <label class="checkrow"><input type="checkbox" class="rl-in" data-i="${i}" data-k="on"${r.on === false ? '' : ' checked'}> <b>On</b></label>${inp(i, 'name', r.name, 'Rule name', '16em')}
      <span>For every</span><select class="rl-in" data-i="${i}" data-k="cat" aria-label="Cabinet type">${[['', 'cabinet'], ['Base', 'Base cabinet'], ['Wall', 'Wall cabinet'], ['Tall', 'Tall cabinet']].map(([v, l]) => `<option value="${v}"${(r.cat || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span>where</span>${inp(i, 'when', r.when, 'W > 30 (blank = always)', '14em')}</div>
      <div class="rl-row"><select class="rl-in" data-i="${i}" data-k="act" aria-label="What the rule does">${RULE_ACTS.map(([v, l]) => `<option value="${v}"${r.act === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${r.act === 'addpart' ? `${inp(i, 'newName', r.newName, 'Part name', '12em')}${inp(i, 'newL', r.newL, 'Length, like H - 1.5', '11em')}${inp(i, 'newW', r.newW, 'Width, like D - 1', '10em')}${inp(i, 'newQty', r.newQty, 'Qty', '4em')}`
        : `<span>on parts named</span>${inp(i, 'part', r.part, 'Bottom (blank = all)', '11em')}${r.act === 'size' ? `${inp(i, 'L', r.L, 'Length, like PartL - 1', '11em')}${inp(i, 'W', r.W, 'Width', '9em')}${inp(i, 'qty', r.qty, 'Qty', '4em')}` : ''}${r.act === 'addop' ? `<select class="rl-in" data-i="${i}" data-k="tpl" aria-label="Operation template"><option value="">Pick a template…</option>${tpls.map(t => `<option value="${esc(t.id)}"${r.tpl === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}`}
      <span class="sp"></span><button class="btn sm danger" data-act="rl-del" data-id="${i}" aria-label="Delete rule">${icon('trash')}</button></div></div>`).join('') || '<div class="card cardbody note">No rules yet. Rules are kept for every job.</div>'}`;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.classList) return;
  if (t.classList.contains('rl-in')) { const r = RULES[+t.dataset.i]; if (!r) return; r[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; saveRules(); if (['act', 'on'].includes(t.dataset.k)) renderRules(); render(); }
});

/* ----- F11: a formula that fails shows on its field ----- */
const FX_ERR = {};

/* ----- Actions ----- */
function fxAct(a, id, el) {
  switch (a) {
    case 'rl-add': RULES.push({ id: uid('rl'), name: 'New rule', on: true, cat: 'Base', when: 'W > 30', act: 'hide', part: '' }); saveRules(); renderRules(); return true;
    case 'rl-del': RULES.splice(+id, 1); saveRules(); renderRules(); render(); return true;
    case 'rvar-add': mutate(() => { const rm = curRoom(); rm.vars = rm.vars || []; rm.vars.push({ id: uid('rv'), k: 'RVAR' + (rm.vars.length + 1), v: 0 }); }); return true;
    case 'rvar-del': mutate(() => { const rm = curRoom(); rm.vars = (rm.vars || []).filter(v => v.id !== id); }); return true;
    case 'jfield-add': mutate(() => { S.job.fields = S.job.fields || []; S.job.fields.push({ id: uid('jf'), k: 'FIELD' + (S.job.fields.length + 1), v: '' }); }); return true;
    case 'jfield-del': mutate(() => { S.job.fields = (S.job.fields || []).filter(f => f.id !== id); }); return true;
    case 'fx-override': { const [cid, k] = id.split(':'), c = cab(cid), src = c && fxLevels(c).find(x => x.k === k); if (src) mutate(() => { c.vars = c.vars || []; const { from, under, ...p } = src; c.vars.push({ ...clone(p), id: uid('cv') }); }); return true; }
    case 'fx-plib-save': { const [cid, vid] = id.split(':'), v = ((cab(cid) || {}).vars || []).find(x => x.id === vid); if (!v) return true; const { id: _i, ...p } = v, i = PARAM_LIB.findIndex(x => x.k === v.k); if (i >= 0) PARAM_LIB[i] = clone(p); else PARAM_LIB.push(clone(p)); saveParamLib(); flash(`${v.k} is in the parameter library`); render(); return true; }
    case 'fx-plib-add': { const p = PARAM_LIB[+(($('.fx-plib-pick') || {}).value)], c = cab(id); if (!p || !c) { flash('Pick one from the list first.'); return true; } if ((c.vars || []).some(v => v.k === p.k)) { flash(`${p.k} is already on this cabinet.`); return true; } mutate(() => { c.vars = c.vars || []; c.vars.push({ ...clone(p), id: uid('cv') }); }); return true; }
    case 'fx-plib-del': { const i = (($('.fx-plib-pick') || {}).value); if (i === '' || i === undefined) { flash('Pick one from the list first.'); return true; } PARAM_LIB.splice(+i, 1); saveParamLib(); render(); return true; }
  }
  return false;
}
loadParamLib(); loadRules();
