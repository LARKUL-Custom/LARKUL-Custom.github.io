// Formulas in number fields: type "=W/2 - 1" or use the calculator button. A formula that names a value
// (W, H, D, E, WALL, another cabinet like B1.W, or a job variable) is kept and worked out again on every change.
'use strict';

/* ---------- Expression evaluator ---------- */
const FX_FUNCS = { min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt,
  // Choices and tests, like Mozaik's: if(PartW < 12, 1, 0); true is 1 and false is 0.
  if: (c, a, b) => (c ? a : (b ?? 0)), and: (...a) => (a.every(Boolean) ? 1 : 0), or: (...a) => (a.some(Boolean) ? 1 : 0), not: a => (a ? 0 : 1) };
// Lengths read like the inputs do: 30 1/2, 3/4, 775mm, 2' (feet), 30".
function fxPrep(text) {
  return String(text).trim().replace(/^=/, '')
    .replace(/(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)(?![\d.])/g, '($1+$2/$3)')
    .replace(/(\d*\.?\d+)\s*mm\b/gi, '($1/25.4)')
    .replace(/(\d*\.?\d+)\s*(?:'|ft\b)/gi, '($1*12)')
    .replace(/["”]/g, '');
}
function evalExpr(text, vars) {
  const s = fxPrep(text); let i = 0;
  const err = m => { throw new Error(m); };
  const ws = () => { while (s[i] === ' ' || s[i] === '\t') i++; };
  const peek = () => { ws(); return s[i]; };
  function primary() {
    const ch = peek();
    if (ch === '(') { i++; const v = logic(); if (peek() !== ')') err('Missing )'); i++; return v; }
    if (ch === '-') { i++; return -primary(); }
    if (ch === '+') { i++; return primary(); }
    let m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    m = /^[A-Za-z_][\w]*(?:\.[A-Za-z]+)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length; const name = m[0];
      if (peek() === '(' && FX_FUNCS[name.toLowerCase()]) {
        i++; const args = [];
        if (peek() !== ')') { args.push(logic()); while (peek() === ',') { i++; args.push(logic()); } }
        if (peek() !== ')') err('Missing )'); i++;
        return FX_FUNCS[name.toLowerCase()](...args);
      }
      const v = vars(name);
      if (v === undefined || !isFinite(v)) err(`Unknown name ${name}`);
      return v;
    }
    err(ch === undefined ? 'Unfinished formula' : `Unexpected "${ch}"`);
  }
  function power() { let v = primary(); if (peek() === '^') { i++; v = Math.pow(v, power()); } return v; }
  function product() {
    let v = power();
    for (;;) { const c = peek(); if (c === '*' || c === '×') { i++; v *= power(); } else if (c === '/' || c === '÷') { i++; const d = power(); if (!d) err('Divide by zero'); v /= d; } else return v; }
  }
  function sum() {
    let v = product();
    for (;;) { const c = peek(); if (c === '+') { i++; v += product(); } else if (c === '-' || c === '−') { i++; v -= product(); } else return v; }
  }
  // Comparisons (<, >, <=, >=, =, ==, <>, !=) give 1 or 0; and / or (also && and ||) join them.
  function compare() {
    const v = sum(); ws();
    const m = /^(<=|>=|<>|!=|==|<|>|=)/.exec(s.slice(i)); if (!m) return v;
    i += m[0].length; const w = sum(), e = 1e-9;
    return ({ '<': v < w - e, '>': v > w + e, '<=': v <= w + e, '>=': v >= w - e, '=': Math.abs(v - w) <= e, '==': Math.abs(v - w) <= e, '<>': Math.abs(v - w) > e, '!=': Math.abs(v - w) > e })[m[0]] ? 1 : 0;
  }
  function conj() { let v = compare(); for (;;) { ws(); const m = /^(&&|and\b)/i.exec(s.slice(i)); if (!m) return v; i += m[0].length; const w = compare(); v = v && w ? 1 : 0; } }
  function logic() { let v = conj(); for (;;) { ws(); const m = /^(\|\||or\b)/i.exec(s.slice(i)); if (!m) return v; i += m[0].length; const w = conj(); v = v || w ? 1 : 0; } }
  if (!s) err('Empty');
  const v = logic(); ws();
  if (i < s.length) err(`Unexpected "${s[i]}"`);
  return v;
}
// A formula worth keeping names something; plain arithmetic is just worked out once.
const fxNames = text => (fxPrep(text).match(/[A-Za-z_][\w]*(?:\.[A-Za-z]+)?/g) || []).filter(n => !FX_FUNCS[n.toLowerCase()]);
const isLiveFx = text => fxNames(text).length > 0;

/* ---------- Names a formula can use ---------- */
const DIM_VARS = { W: 'w', H: 'h', D: 'd', E: 'elev' };
// The cabinet, library item or design a field belongs to, for its own W, H, D and E.
function fxOwner(ref) {
  const k = ref.replace(/^sub:[^|]*\|/, '').split(':')[0], id = ref.replace(/^sub:[^|]*\|/, '').split(':').slice(1).join(':');
  if (['cab', 'cabp', 'cabc', 'cabpos', 'cabgap'].includes(k)) return { kind: 'cab', o: cab(id) };
  if (k === 'lib' || k === 'libp') return { kind: 'lib', o: libItem(id) };
  if (k === 'des' || k === 'desp' || k === 'desc') return { kind: 'des', o: S.designer };
  if (k === 'shp') return { kind: 'shape', o: typeof shapeById === 'function' ? shapeById(id) : null };
  return { kind: '', o: null };
}
function fxVarsFor(ref, field) {
  // A size never uses itself: W inside the width formula would grow on every change.
  const own = fxOwner(ref), self = /^(cab|lib|des|shp)(:|$)/.test(ref) ? field : null;
  return name => {
    if (DIM_VARS[name] && own.o) { if (DIM_VARS[name] === self) return undefined; return own.o[DIM_VARS[name]]; }
    if (name === 'WALL' && own.kind === 'cab' && own.o) { const w = wall(own.o.wall); return w ? wg(w).L : undefined; }
    const m = /^([A-Za-z]+\d+)\.([WHDE])$/.exec(name);
    if (m) { const id = Object.keys(LBL).find(k => LBL[k] === m[1].toUpperCase() && cab(k)), c = id && cab(id); return c ? c[DIM_VARS[m[2]]] : undefined; }
    const cv = own.o && (own.o.vars || []).find(x => x.k === name);
    if (cv) return +cv.v;
    const v = (S.job.vars || []).find(x => x.k === name);
    return v ? +v.v : undefined;
  };
}
function fxNameList(ref) {
  const own = fxOwner(ref), out = [];
  if (own.o) Object.entries(DIM_VARS).forEach(([n, f]) => { if (typeof own.o[f] === 'number') out.push({ n, v: own.o[f], what: { W: 'width', H: 'height', D: 'depth', E: 'elevation' }[n] }); });
  if (own.kind === 'cab' && own.o && wall(own.o.wall)) out.push({ n: 'WALL', v: wg(wall(own.o.wall)).L, what: 'wall length' });
  if (own.o) (own.o.vars || []).filter(v => v.k).forEach(v => out.push({ n: v.k, v: +v.v, what: 'cabinet parameter' }));
  (S.job.vars || []).filter(v => v.k).forEach(v => out.push({ n: v.k, v: +v.v, what: 'job variable' }));
  return out;
}

/* ---------- Kept formulas ---------- */
// S.formulas maps "ref|field" to its formula text.
const fxKey = (ref, field) => ref + '|' + field;
const fxOf = (ref, field) => S && S.formulas && S.formulas[fxKey(ref, field)];
function setFormula(ref, field, text) {
  S.formulas = S.formulas || {};
  if (text) S.formulas[fxKey(ref, field)] = text; else delete S.formulas[fxKey(ref, field)];
}
function fxSet(o, field, v) { if (field.includes('.')) { const [i, k] = field.split('.'); if (o[+i]) o[+i][k] = v; } else o[field] = v; }
// Works every kept formula out again, room by room, twice so values that feed each other settle.
function recalcFormulas() {
  const F = S && S.formulas; if (!F || !Object.keys(F).length) return;
  for (let pass = 0; pass < 2; pass++) Object.entries(F).forEach(([key, text]) => {
    const cut = key.lastIndexOf('|'), ref = key.slice(0, cut), field = key.slice(cut + 1);
    const rooms = /^(sub:[^|]*\|)?(cab|cabp|cabc|shp)[:]/.test(ref) ? S.rooms : [curRoom()];
    for (const rm of rooms) {
      const done = withRoom(rm, () => {
        const o = resolve(ref); if (!o) return false;
        try { const v = evalExpr(text, fxVarsFor(ref, field)); if (isFinite(v)) { fxSet(o, field, Math.round(v * 10000) / 10000); if (typeof FX_ERR !== 'undefined') delete FX_ERR[key]; } } catch (e) { if (typeof FX_ERR !== 'undefined') FX_ERR[key] = e.message; /* leave the last good value */ }
        return true;
      });
      if (done) return;
    }
    if (!S.rooms.some(rm => withRoom(rm, () => !!resolve(ref)))) delete F[key];
  });
}

/* ---------- Calculator ---------- */
let calcFor = null;
function openCalc(inputId) {
  const el = document.getElementById(inputId); if (!el) return;
  const ref = el.dataset.obj, field = el.dataset.field, kept = fxOf(ref, field);
  calcFor = { id: inputId, ref, field, type: el.dataset.type };
  const pop = $('#calcpop'), label = (el.closest('label') && el.closest('label').querySelector('span') || {}).textContent || field;
  const names = fxNameList(ref);
  pop.innerHTML = `<div class="calc-head"><b>${icon('calc')}${esc(label)}</b><button class="btn sm" data-act="calc-close" aria-label="Close calculator">${icon('close')}</button></div>
    <input type="text" id="calc-in" class="calc-in" value="${esc(kept ? '=' + kept : el.value)}" aria-label="Formula" spellcheck="false" autocomplete="off">
    <div class="calc-out" id="calc-out"></div>
    ${names.length ? `<div class="calc-names">${names.map(n => `<button class="chipbtn" data-act="calc-ins" data-id="${esc(n.n)}" title="${esc(n.what)}: ${esc(fmtLen(n.v))}"><b>${esc(n.n)}</b> ${esc(fmtLen(n.v))}</button>`).join('')}</div>` : ''}
    <div class="calc-keys">${['7', '8', '9', '/', '(', '4', '5', '6', '*', ')', '1', '2', '3', '-', ' 1/2', '0', '.', '⌫', '+', ' 1/4'].map(k => `<button class="btn sm${/[/*\-+()]/.test(k.trim()) && k.length === 1 ? ' op' : ''}" data-act="calc-key" data-id="${esc(k)}">${esc(k.trim())}</button>`).join('')}</div>
    <label class="checkrow"><input type="checkbox" id="calc-keep"${kept ? ' checked' : ''}> Keep as a formula (updates when the values it uses change)</label>
    <div class="note">Use W, H, D, E for this item, WALL for its wall, another cabinet like B1.W, or job variables from Settings › Variables. min( ), max( ) and round( ) work too.</div>
    <div class="row-actions">${kept ? '<button class="btn sm" data-act="calc-clear">Remove formula</button>' : ''}<button class="btn primary" data-act="calc-apply">${icon('check')}Use this</button></div>`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pr.width - 8)) + 'px';
  pop.style.top = (r.bottom + pr.height + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - pr.height - 6)) + 'px';
  const inp = $('#calc-in');
  inp.addEventListener('input', calcPreview);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); calcApply(); } if (e.key === 'Escape') { e.stopPropagation(); closeCalc(); } });
  inp.focus(); inp.select(); calcPreview();
}
function closeCalc() { calcFor = null; const p = $('#calcpop'); if (p) { p.hidden = true; p.innerHTML = ''; } }
function calcPreview() {
  if (!calcFor) return;
  const t = $('#calc-in').value, out = $('#calc-out'), keep = $('#calc-keep');
  try {
    const v = evalExpr(t, fxVarsFor(calcFor.ref, calcFor.field));
    out.className = 'calc-out ok'; out.textContent = '= ' + (calcFor.type === 'len' ? fmtLen(v) : Math.round(v * 1000) / 1000);
    if (!keep.dataset.touched) keep.checked = isLiveFx(t);
  } catch (e) { out.className = 'calc-out bad'; out.textContent = e.message; }
}
function calcApply() {
  if (!calcFor) return;
  const t = $('#calc-in').value.trim(), el = document.getElementById(calcFor.id);
  let v; try { v = evalExpr(t, fxVarsFor(calcFor.ref, calcFor.field)); } catch (e) { calcPreview(); return; }
  if (!el) return closeCalc();
  const keep = $('#calc-keep').checked && isLiveFx(t);
  el.value = keep ? '=' + t.replace(/^=/, '') : calcFor.type === 'len' ? fmtLen(v) : String(Math.round(v * 1000) / 1000);
  closeCalc();
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
document.addEventListener('pointerdown', e => { if (calcFor && !e.target.closest('#calcpop') && !e.target.closest('[data-act=calc]')) closeCalc(); }, true);
document.addEventListener('change', e => { if (e.target.id === 'calc-keep') e.target.dataset.touched = '1'; });
// Focusing a field with a kept formula shows the formula, so it can be edited in place.
document.addEventListener('focusin', e => {
  const el = e.target; if (!el.dataset || !el.dataset.obj) return;
  const f = fxOf(el.dataset.obj, el.dataset.field); if (f && el.value !== '=' + f) { el.dataset.shown = el.value; el.value = '=' + f; el.select(); }
});
document.addEventListener('focusout', e => {
  const el = e.target; if (!el.dataset || !el.dataset.shown) return;
  const f = fxOf(el.dataset.obj, el.dataset.field); if (f && el.value === '=' + f) el.value = el.dataset.shown;
  delete el.dataset.shown;
});

/* ---------- Job variables (Settings › Variables) ---------- */
function renderVars() {
  const vars = S.job.vars || [];
  return `<div class="card"><div class="cardhead"><h3>${icon('calc')}Variables</h3><button class="btn primary" data-act="var-add">${icon('plus')}Add variable</button></div>
    <div class="cardbody stack"><div class="note">Name a size once and use it in any number field, like <b>=SINK + 3</b> or <b>=WALL - FILL*2</b>. Change it here and every field that uses it updates. A variable can be a formula too.</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Name</th><th>Value</th><th>Used by</th><th></th></tr></thead><tbody>
    ${vars.map(v => { const used = Object.values(S.formulas || {}).filter(t => fxNames(t).includes(v.k)).length; return `<tr><td style="width:200px">${ctl('jvar:' + v.id, 'k', v.k, 'text', { label: 'Variable name', ph: 'NAME' })}</td><td style="width:200px">${calcWrap(ctl('jvar:' + v.id, 'v', v.v, 'len', { label: 'Variable value' }), 'jvar:' + v.id, 'v')}</td><td class="muted">${used ? `${used} field${used === 1 ? '' : 's'}` : 'Not used yet'}</td><td><button class="btn sm danger" data-act="var-del" data-id="${v.id}">${icon('trash')}</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No variables yet.</td></tr>'}
    </tbody></table></div>
    <div class="note">Names start with a letter and use letters, numbers and _. Built in: W, H, D, E (the item's own width, height, depth, elevation), WALL (its wall's length) and other cabinets by label, like B1.W or W2.H.</div></div></div>`;
}
const varName = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
// Number field with a calculator button at its right end.
const fxErrOf = (ref, field) => typeof FX_ERR !== 'undefined' && fxOf(ref, field) ? FX_ERR[fxKey(ref, field)] : '';
const calcWrap = (input, ref, field) => `<span class="inwrap${fxOf(ref, field) ? ' fx' : ''}${fxErrOf(ref, field) ? ' fxbad' : ''}"${fxErrOf(ref, field) ? ` title="${esc('This formula did not work: ' + fxErrOf(ref, field) + '. It keeps its last good value.')}"` : ''}>${input}<button type="button" class="calcbtn" data-act="calc" data-id="${fid(ref, field)}" title="Calculator and formulas" aria-label="Calculator">${fxOf(ref, field) ? 'ƒ' : icon('calc')}</button></span>`;
