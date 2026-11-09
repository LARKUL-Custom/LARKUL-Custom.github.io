/* Ask Claude: a button beside every library Import. Say what to add (a slide, a hinge, a material...), paste a link,
   a screenshot or a spec sheet, and Claude reads it and writes the library items. Nothing is added until you look it over
   and press Add. Claude runs on this PC through the hub (server.js): your Claude plan by default, or an API key. */
'use strict';
const AI_API = '/api/ext/cabinet-designer/ai';
const AI_LABELS = { mat: 'Materials', eb: 'Edge banding', doorT: 'Door templates', panel: 'Applied panels', top: 'Countertops', mold: 'Moldings', ptpl: 'Part templates', ff: 'Face frames' };
// What the fields mean, from the library pages' own labels. Claude also gets the library's own items as examples.
const AI_GUIDES = {
  'hw-slide': `Drawer slide (kind "slide"). One item covers every length.
lengths: nominal lengths in inches. partNos, runnerMM (runner length), minDepthMM (shortest inside cabinet depth it fits), holeSets (runner screw holes measured back from the cabinet front, mm, per length) and prices (US$ per pair) are objects keyed by length.
sideThickMM: drawer side thickness it is made for. widthDeductMM: opening width minus drawer box outside width. bottomRecessMM: how far the drawer bottom is set up from the bottom of the sides. bottomClearMM: drawer box bottom above the opening bottom. topClearMM: clearance above the box. rearClearMM: extra depth the slide needs behind the box.
cabHoles: holes on each cabinet side per drawer. ref "set" with i = hole number in holeSets for that length (1 = first); other refs: "front" (y from cabinet front), "mid32", "rear32", "slideEnd". y mm, z mm up from the drawer box bottom, dia, depth mm.
boxOps: drilling on the drawer box: part side/back/bottom, type "hbore" (edge bore) or "bore" (face bore), edge rear/front, x from the part front, y up from its bottom edge, inset from the outer face, dia, depth (mm).
bomExtra: anything else to add to the hardware list (locking devices, brackets). notes: plain notes for the shop.`,
  'hw-hinge': `Hinge (kind "hinge"). cupDiaMM, cupDepthMM, cupEdgeMM (cup hole edge distance from the door edge). cupExtra: extra holes on the door per hinge, dx along the door from the cup centre, dy from the cup centre toward the middle of the door, dia, depth (mm). plateHoles: mounting plate holes on the cabinet side per hinge, dz up or down from the hinge centreline, y back from the cabinet front, dia, depth (mm). max2 / max3: doors up to this height (in) get 2 / 3 hinges, taller get more. cost: US$ each hinge, plateCost: US$ each plate when sold separately.`,
  'hw-pull': `Pull or knob (kind "pull"). ccMM hole spacing (0 = knob, one hole), lengthMM overall length, holeDiaMM, finish as a hex colour (#rrggbb) close to the real finish, cost US$ each.`,
  'hw-shelfpin': `Shelf pin (kind "shelfpin"). pinDiaMM hole, pinDepthMM hole depth, pinSetbackMM row setback from the front and back, pitchMM hole pitch.`,
  'hw-leg': `Cabinet leg (kind "leg", feet true). cost US$ each. width, depth: leg footprint (in). inToe, inFin, inUnfin, inBack: insets from the outside of the cabinet to the leg centre at the toe, a finished end, an unfinished end and the back (in). maxSep: max leg separation (in, 0 = off). noBack: no back legs. holeDia, holeDepth: hole in the bottom (in). holesMM: optional list of {x, y} mm marks per leg from the leg centre.`,
  'hw-joint': `Joint template (kind "joint"): confirmats, dowels and the like. Copy the example's structure exactly.`,
  'hw-other': `Other hardware (kind "other"), counted into the hardware list. perCabinet: how many per cabinet. cats: cabinet types it applies to (Base, Wall, Tall). cost US$ each.`,
  mat: `Material. kind "sheet" (sheet goods), "top" (countertop slabs) or as in the examples. thick: real thickness in inches (3/4 prefinished ply is often 0.71875). sheetW, sheetL: sheet size in inches. grain: true if the grain runs along the length. cost: US$ per sheet. color: hex colour close to the real look. texture null, procedural one of maple, birch, oak, walnut, stone or null. group: header it is listed under (Plywood, MDF, Melamine...).`,
  eb: `Edge band. Copy the example fields. thickMM and width are the band's thickness and width; code is the maker's part number; price is per roll when a roll length is given.`,
};
function aiLabel(key) { if (/^hw-/.test(key)) { const k = (HW_KINDS.find(x => x[0] === key.slice(3)) || [])[1]; return k ? 'Hardware: ' + k : 'Hardware'; } return AI_LABELS[key] || key; }
function aiAskBtn(key, iconOnly) {
  if (typeof libRef !== 'function' || !libRef(key)) return '';
  const t = 'Ask Claude to add one: say what it is, paste a link, a screenshot or a spec sheet';
  return `<button class="btn sm ai-ask" data-act="ai-open" data-id="${esc(key)}" title="${t}" aria-label="Ask Claude">${icon('sparkle')}${iconOnly ? '' : 'Ask Claude'}</button>`;
}

// The library itself, short: a few of its items as examples, and the ids of things the items can point at.
function aiContext(key) {
  const r = libRef(key), arr = r[1](), mine = r[2] ? arr.filter(r[2]) : arr, cur = mine.find(x => x.id === (ui.pick || {})[key]);
  const ex = [...new Set([cur, ...mine].filter(Boolean))].slice(0, 3).map(x => JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'string' && v.length > 600 ? undefined : v)));
  const ids = (label, list) => list && list.length ? `${label}: ${list.slice(0, 120).map(x => `${x.id} = ${x.name}`).join('; ')}` : '';
  const refs = [
    ids('Materials', S.materials), ids('Edge bands', S.edgebands), ids('Door styles', S.doorStyles),
    ids('Pulls', (S.hardware || []).filter(h => h.kind === 'pull')),
  ].filter(Boolean);
  return [AI_GUIDES[key] || '', `Items already in this library: ${mine.map(x => x.name).slice(0, 150).join('; ') || 'none'}.`,
    `Example items from this library (copy their shape):\n${JSON.stringify(ex, null, 1)}`,
    `Other library items new items can point at by id:\n${refs.join('\n')}`].filter(Boolean).join('\n\n');
}

function aiState() { return ui.ai; }
function openAsk(key) {
  ui.ai = { key, text: '', links: '', files: [], busy: false, res: null, err: '', set: false, st: null };
  renderAsk(); aiStatus();
  setTimeout(() => { const t = $('#ai-text'); if (t) t.focus(); }, 30);
}
function closeAsk() { if (ui.ai && ui.ai.busy && !confirm('Claude is still working on this. Close anyway?')) return; ui.ai = null; renderAsk(); }
async function aiStatus(recheck) {
  const a = aiState(); if (!a) return;
  if (!inHub()) { a.st = { configured: false, problem: 'Ask Claude works when Cabinet Designer runs in the Extension Hub on your PC.' }; renderAsk(); return; }
  try { a.st = await (await fetch(`${AI_API}/status${recheck ? '?recheck=1' : ''}`)).json(); }
  catch (e) { a.st = { configured: false, problem: 'Could not reach the hub. Restart the hub after updating Cabinet Designer, then try again.' }; }
  if (!a.st.configured) a.set = true;
  renderAsk();
}
async function aiSaveSettings(o) {
  try { await fetch(`${AI_API}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }); } catch (_) {}
  aiStatus(true);
}
function aiReadFile(f) {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
}
async function aiAddFiles(list) {
  const a = aiState(); if (!a) return;
  for (const f of [...list]) {
    if (!/^image\/|^application\/pdf$/.test(f.type)) { flash(`${f.name || 'That file'} is not a picture or a PDF`); continue; }
    if (f.size > 10 * 1024 * 1024) { flash(`${f.name} is over 10 MB`); continue; }
    if (a.files.length >= 8) { flash('Up to 8 files'); break; }
    const url = await aiReadFile(f);
    a.files.push({ name: f.name || `screenshot-${a.files.length + 1}.png`, type: f.type, url });
  }
  renderAsk();
}
async function aiSend() {
  const a = aiState(); if (!a || a.busy) return;
  const t = $('#ai-text'), l = $('#ai-links'); if (t) a.text = t.value; if (l) a.links = l.value;
  const links = (a.links.match(/https?:\/\/\S+/g) || []).concat(a.text.match(/https?:\/\/\S+/g) || []);
  if (!a.text.trim() && !links.length && !a.files.length) { a.err = 'Tell Claude what to add, or paste a link or a picture.'; renderAsk(); return; }
  a.busy = true; a.err = ''; a.res = null; a.started = Date.now(); renderAsk();
  const tick = setInterval(() => { const el = $('#ai-secs'); if (el && ui.ai === a) el.textContent = Math.round((Date.now() - a.started) / 1000) + 's'; }, 1000);
  try {
    const body = { label: aiLabel(a.key), request: a.text, links: [...new Set(links)], context: aiContext(a.key),
      files: a.files.map(f => ({ name: f.name, type: f.type, data: f.url.slice(f.url.indexOf(',') + 1) })) };
    const res = await fetch(`${AI_API}/import`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({ error: 'The hub did not answer. Restart the hub and try again.' }));
    if (ui.ai !== a) return;
    if (!res.ok || j.error) { a.err = j.error || 'Something went wrong.'; if (j.checks && j.checks.length) a.err += ' ' + j.checks.join(' '); }
    else { a.res = j; a.res.pick = j.items.map(() => true); }
  } catch (e) { if (ui.ai === a) a.err = 'Could not reach the hub: ' + e.message; }
  finally { clearInterval(tick); a.busy = false; if (ui.ai === a) renderAsk(); }
}
function aiAdd() {
  const a = aiState(); if (!a || !a.res) return;
  const list = a.res.items.filter((_, i) => a.res.pick[i]);
  const kind = /^hw-/.test(a.key) ? a.key.slice(3) : null;
  if (kind) list.forEach(x => { x.kind = kind; });
  if (kind === 'leg') list.forEach(x => { x.feet = true; });
  const n = libAddItems(a.key, list);
  if (!n) { a.err = 'Nothing was picked to add.'; renderAsk(); return; }
  const checks = a.res.checks || [];
  ui.ai = null; renderAsk();
  flash(`Added ${n} to ${aiLabel(a.key)}${checks.length ? '. Check the flagged numbers before cutting.' : ''}`);
}

// A few of the item's plain values, so it can be judged without reading JSON.
function aiFacts(x) {
  return Object.entries(x).filter(([k, v]) => !['id', 'name', 'notes', 'kind'].includes(k) && v !== null && v !== '' && (typeof v !== 'object' || Array.isArray(v) && v.every(n => typeof n !== 'object')))
    .slice(0, 10).map(([k, v]) => `<span><small>${esc(k)}</small>${esc(Array.isArray(v) ? v.join(', ') : String(v))}</span>`).join('');
}
function renderAsk() {
  const el = $('#askclaude'); if (!el) return;
  const a = aiState();
  if (!a) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const st = a.st || {}, keep = { text: ($('#ai-text') || {}).value, links: ($('#ai-links') || {}).value };
  if (keep.text !== undefined) a.text = keep.text; if (keep.links !== undefined) a.links = keep.links;
  const setBox = `<details class="ai-set" id="ai-setd"${a.set ? ' open' : ''}><summary>${icon('sliders')}Claude settings <span class="muted">${st.engine === 'api' ? 'API key' : 'Your Claude plan'}${st.configured ? ' · ready' : ''}</span></summary>
    <div class="ai-setb">${st.problem ? `<div class="warnbox">${esc(st.problem)}</div>` : st.cli && st.cli.version ? `<div class="hwx-ok">${icon('check')}<span>Claude Code ${esc(st.cli.version)} on this PC</span></div>` : ''}
      <div class="seg" role="group" aria-label="How to reach Claude"><button data-act="ai-engine" data-id="subscription" aria-pressed="${st.engine !== 'api'}">Your Claude plan</button><button data-act="ai-engine" data-id="api" aria-pressed="${st.engine === 'api'}">API key</button></div>
      <div class="note">${st.engine === 'api' ? 'Uses an Anthropic API key, billed per use.' : 'Uses Claude Code on this PC, signed in with your Claude account (the same as Bid Reader). To sign in: open PowerShell, type claude, press Enter.'}</div>
      ${st.engine === 'api' ? `<label class="f"><span>API key ${st.api && st.api.key ? '<span class="muted">(saved)</span>' : ''}</span><input type="password" id="ai-key" placeholder="${st.api && st.api.key ? 'Saved. Paste a new one to change it' : 'sk-ant-...'}" autocomplete="off"></label>` : `<label class="f"><span>Claude Code path <span class="muted">(blank finds it)</span></span><input id="ai-path" value="${esc(st.claudePath || '')}" placeholder="claude"></label>`}
      <label class="f"><span>Model</span><input id="ai-model" value="${esc(st.model || '')}" placeholder="claude-opus-5-5"></label>
      <div class="row-actions"><button class="btn sm" data-act="ai-saveset">Save and check</button></div></div></details>`;
  let body;
  if (a.res) {
    const r = a.res;
    body = `<div class="ai-res"><div class="ai-sum">${icon('sparkle')}<span>${esc(r.summary || 'Here is what Claude found.')}</span></div>
      ${r.checks.length ? `<div class="warnbox ai-checks"><b>Check before cutting</b><ul>${r.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : `<div class="hwx-ok">${icon('check')}<span>Every number came from the source.</span></div>`}
      <div class="ai-items">${r.items.map((x, i) => `<div class="ai-item${r.pick[i] ? ' on' : ''}"><label class="checkrow"><input type="checkbox" data-ai-pick="${i}"${r.pick[i] ? ' checked' : ''}> <b>${esc(x.name || 'Unnamed')}</b></label>
        ${x.notes ? `<div class="note">${esc(x.notes)}</div>` : ''}<div class="ai-facts">${aiFacts(x)}</div>
        <details><summary>All values</summary><pre>${esc(JSON.stringify(x, null, 1))}</pre></details></div>`).join('')}</div>
      ${r.sources.length ? `<div class="note ai-src"><b>Sources:</b> ${r.sources.map(s => /^https?:/.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>` : esc(s)).join(' · ')}</div>` : ''}
      <div class="note">You can change anything after it's added, on the library page.</div></div>`;
  } else {
    body = `<label class="f ai-f"><span>What should Claude add?</span><textarea id="ai-text" rows="4" placeholder="e.g. Add the Blum MOVENTO 760H slides, 15 to 21 inch, with the locking devices. Or: Add 3/4 Columbia PureBond walnut ply at $165 a sheet.">${esc(a.text)}</textarea></label>
      <label class="f ai-f"><span>Links <span class="muted">(maker's page, spec or install sheet)</span></span><input id="ai-links" value="${esc(a.links)}" placeholder="https://..."></label>
      <div class="ai-drop" data-ai-drop><span>${icon('camera')}Paste a screenshot here (Ctrl+V), drop pictures or PDFs, or</span><label class="btn sm">${icon('upload')}Pick files<input type="file" id="ai-files" accept="image/*,application/pdf" multiple hidden></label></div>
      ${a.files.length ? `<div class="ai-files">${a.files.map((f, i) => `<div class="ai-file">${/^image\//.test(f.type) ? `<img src="${f.url}" alt="">` : `<span class="ai-pdf">PDF</span>`}<span>${esc(f.name)}</span><button class="btn sm" data-act="ai-unfile" data-id="${i}" aria-label="Remove ${esc(f.name)}">${icon('close')}</button></div>`).join('')}</div>` : ''}
      ${a.busy ? `<div class="hwx-ok ai-busy"><span class="ai-spin"></span><span>Claude is reading it and writing the ${esc(aiLabel(a.key).toLowerCase())}… <span id="ai-secs">0s</span>. Spec sheets can take a couple of minutes.</span></div>` : ''}`;
  }
  const foot = a.res
    ? `<button class="btn" data-act="ai-again">${icon('back')}Change the request</button><button class="btn primary" data-act="ai-add"${r0(a) ? '' : ' disabled'}>${icon('plus')}Add ${r0(a)} to the library</button>`
    : `<button class="btn" data-act="ai-close">Cancel</button><button class="btn primary" data-act="ai-send"${a.busy || st.configured === false ? ' disabled' : ''}>${icon('sparkle')}${a.busy ? 'Working…' : 'Ask Claude'}</button>`;
  el.innerHTML = `<div class="qe ai-dlg" role="dialog" aria-modal="true" aria-labelledby="ai-title">
    <div class="qe-head"><b id="ai-title">${icon('sparkle')}Ask Claude</b><span class="muted">add to ${esc(aiLabel(a.key))}</span><button class="btn sm qe-x" data-act="ai-close" aria-label="Close">${icon('close')}</button></div>
    <div class="ai-body">${a.err ? `<div class="warnbox">${esc(a.err)}</div>` : ''}${body}${setBox}</div>
    <div class="qe-foot">${foot}</div></div>`;
}
function r0(a) { return a.res ? a.res.pick.filter(Boolean).length : 0; }

function askAct(a, id) {
  const s = aiState();
  switch (a) {
    case 'ai-open': openAsk(id); return true;
    case 'ai-close': closeAsk(); return true;
    case 'ai-send': aiSend(); return true;
    case 'ai-add': aiAdd(); return true;
    case 'ai-again': if (s) { s.res = null; renderAsk(); } return true;
    case 'ai-unfile': if (s) { s.files.splice(+id, 1); renderAsk(); } return true;
    case 'ai-engine': aiSaveSettings({ engine: id }); return true;
    case 'ai-saveset': {
      const o = {}, k = $('#ai-key'), m = $('#ai-model'), p = $('#ai-path');
      if (k && k.value.trim()) o.key = k.value.trim(); if (m) o.model = m.value; if (p) o.claudePath = p.value;
      aiSaveSettings(o); return true;
    }
  }
  return false;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act^="ai-"]');
  if (b && askAct(b.dataset.act, b.dataset.id)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (e.target.id === 'askclaude') closeAsk();
}, true);
document.addEventListener('change', e => {
  if (e.target.id === 'ai-files' && e.target.files.length) { aiAddFiles(e.target.files); e.target.value = ''; }
  const p = e.target.dataset && e.target.dataset.aiPick; const s = aiState();
  if (p !== undefined && s && s.res) { s.res.pick[+p] = e.target.checked; renderAsk(); }
});
document.addEventListener('toggle', e => { if (e.target.id === 'ai-setd' && ui.ai) ui.ai.set = e.target.open; }, true);
document.addEventListener('paste', e => {
  if (!ui.ai || ui.ai.res) return;
  const fs = [...(e.clipboardData || {}).files || []].filter(f => /^image\/|pdf$/.test(f.type));
  if (fs.length) { e.preventDefault(); aiAddFiles(fs); }
});
document.addEventListener('dragover', e => { if (ui.ai && e.target.closest && e.target.closest('#askclaude')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!ui.ai || !(e.target.closest && e.target.closest('#askclaude'))) return;
  e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) aiAddFiles(e.dataTransfer.files);
});
document.addEventListener('keydown', e => {
  if (!ui.ai) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); closeAsk(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ui.ai.res) { e.preventDefault(); aiSend(); }
}, true);
