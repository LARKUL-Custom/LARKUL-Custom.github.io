/* ---------- Right-click: split vertical or horizontal, and a leg's styled sides (0.63.79) ----------
   Ayden 2026-11-25: "with columns usually multiple sides need to be the style, give these columns an option in their
   editor or a simple right click to change the sides to the applied door style"; "a simple right click on end panels with
   a ask to split vertical or horizontal would be cool"; "honestly for everything it would be cool, like all doors".
   Split vertical = one more mid stile, split horizontal = one more mid rail, in the same counts the Face tab's Stiles and
   rails box keeps (pspl: a panel or leg, secm: a face section), so the door style's split rules stay in charge until one
   is changed here, and Auto gives it back to them. */

// What was right-clicked on a cabinet: { fi } a front (its index in computeFronts), { end } an end panel, or {}.
function splitHitAt(e, id) {
  const c = cab(id); if (!c) return null;
  const el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return null;
  if (el.closest('#room3d') && roomViewer && roomViewer.ok && roomViewer.pickPart) {
    const h = roomViewer.pickPart(e.clientX, e.clientY); return h && h.id === id ? h : null;
  }
  const svg = el.closest('#elev'), w = wall(c.wall);
  if (svg && w && svg.getScreenCTM()) {
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()), L = wg(w).L;
    const x = q.x - elevX(c, L), z = -q.y - (c.elev || 0);
    let fr = []; try { fr = computeFronts(c); } catch (_) {}
    const fi = fr.findIndex(f => { if (f.type === 'open') return false; const [a, b] = frontEX(f); return x >= a && x <= b && z >= f.z0 && z <= f.z1; });
    return fi >= 0 ? { id, fi } : { id };
  }
  return null;
}
const splKey = f => f.cell !== undefined ? String(f.cell) : String(f.row);
// The panels and fronts of cabinet (or leg) c that can take mid stiles and rails, the one clicked first.
// Each: { ref, label, info ({ ds, fw, fh, kind }, null for a flat slab), own (its own counts) }.
function splitTargets(c, hit) {
  const out = [], seen = new Set(), add = t => { if (t && !seen.has(t.ref)) { seen.add(t.ref); out.push(t); } };
  if (c.plane) {
    const P = shapePost(c), f = P && (P.faces.find(x => x.framed) || P.faces[0]);
    add({ ref: `pspl:${c.id}`, label: c.name || 'Leg', info: f && f.framed ? { ds: f.ds, fw: f.w, fh: f.h, kind: 'leg' } : null, own: c.pSplit, why: P && P.faces.some(x => x.on) ? '' : 'Give it a door style first' });
    return out;
  }
  if (c.made === 'panel' && typeof fsPanelInfo === 'function') {
    const P = fsPanelInfo(c), lk = panelLook(P.src, P.w, P.h, null, P.end), k = panelSplitOf(P.src, P.end);
    add({ ref: P.ref, label: c.autoOf ? 'End panel' : c.name || 'Panel', info: lk.framed ? { ds: lk.ds, fw: P.w, fh: P.h, kind: k.kind } : null, own: P.own });
    return out;
  }
  // The fronts, grouped by face section (a pair of doors splits together), lettered like the Face tab.
  const fronts = [], letters = (() => { try { return faceLetters(typeof fsView === 'function' ? fsView(c) : c); } catch (_) { return {}; } })();
  if (!c.made || c.made === 'apfront') {
    let fr = []; try { fr = typeof fsFronts === 'function' ? fsFronts(c) : computeFronts(c); } catch (_) {}
    const groups = new Map();
    fr.forEach((f, i) => { if (f.type === 'open' || f.face) return; const k = splKey(f); if (!groups.has(k)) groups.set(k, { k, f, fis: [] }); groups.get(k).fis.push(i); });
    groups.forEach(g => {
      let st = null; try { st = frontStyle(c, g.f); } catch (_) {}
      const t = (g.f.was || g.f.type) === 'drawer' ? 'Drawer' : g.f.type === 'false' ? 'False front' : g.fis.length > 1 ? 'Doors' : 'Door';
      let own = null; try { const lf = fsLeaf(typeof fsView === 'function' ? fsView(c) : c, g.k); own = lf && lf.mids; } catch (_) {}
      fronts.push({ ref: `secm:${c.id}:${g.k}`, label: `${t} ${letters[g.k] || ''}`.trim(), info: st && st.framed ? { ds: st.ds, fw: g.f.x1 - g.f.x0, fh: g.f.z1 - g.f.z0, kind: frontKind(c, g.f, st.ds) } : null, own, fis: g.fis });
    });
  }
  // The cabinet's own end panels.
  const ends = [];
  if (!c.made && typeof panelPieces === 'function') ['L', 'R'].forEach(sd => {
    let pcs = null; try { pcs = drawnPanels(() => panelPieces(c, sd)); } catch (_) {}
    if (!pcs || !pcs.length) return;
    const ps = panelFor(c), pc = pcs[0], w = endDepth(c, sd) + ps.frontOverhang, h = pc.z1 - pc.z0, lk = panelLook(c, w, h, ps.door, sd), k = panelSplitOf(c, sd);
    ends.push({ ref: `pspl:${c.id}:${sd}`, end: sd, label: `${sd === 'L' ? 'Left' : 'Right'} end panel${k.kind === 'island' ? ' (island)' : ''}`, info: lk.framed ? { ds: lk.ds, fw: w, fh: h, kind: k.kind } : null, own: (c.pSplit || {})[sd] });
  });
  if (hit && hit.end) add(ends.find(t => t.end === hit.end));
  if (hit && hit.fi !== undefined) add(fronts.find(t => t.fis.includes(hit.fi)));
  ends.forEach(add); fronts.forEach(add);
  // A flat slab can't be split: it stays on the list only when it is the one clicked, to say why.
  return out.filter((t, i) => t.info || (i === 0 && hit && (hit.end || hit.fi !== undefined)));
}
const splCount = t => t.info ? doorMids(t.info.ds, t.info.fw, t.info.fh) : { nS: 0, nR: 0 };
const splOwn = t => !!t.own && (splitNum(t.own.S) || splitNum(t.own.R));

// The split menu, in the right-click menu's place: one row per panel or front, the clicked one first.
function showSplitMenu(id, hit, x, y) {
  const c = cab(id) || (S.shapes || []).find(s => s.id === id); if (!c) return;
  const ts = splitTargets(c, hit); ui.splCtx = { id, hit, x, y, ts };
  const m = $('#ctxmenu'), b = (act, i, label, title, dis) => `<button role="menuitem" data-act="${act}" data-id="${i}" title="${esc(title)}"${dis ? ' disabled' : ''}>${label}</button>`;
  const row = (t, i) => {
    const n = splCount(t), what = t.info ? `${n.nS} mid stile${n.nS === 1 ? '' : 's'}, ${n.nR} mid rail${n.nR === 1 ? '' : 's'}${splOwn(t) ? '' : ' · Auto'}` : t.why || 'Flat slab, nothing to split';
    return `<div class="splrow${i ? '' : ' first'}"><div class="spllbl"><b>${esc(t.label)}</b><span>${esc(what)}</span></div>
      <div class="splbtns">${b('spl-v', i, `${icon('vsplit')}Vertical`, 'Split it side to side: one more mid stile', !t.info)}${b('spl-h', i, `${icon('hsplit')}Horizontal`, 'Split it top to bottom: one more mid rail', !t.info)}${splOwn(t) ? b('spl-auto', i, 'Auto', 'Back to the door style and its split rules') : ''}</div></div>`;
  };
  m.innerHTML = `<div class="ctxhead">Split ${esc(LBL[id] || c.name || '')}</div>${ts.length ? ts.slice(0, 8).map(row).join('') : '<div class="note show splnone">Nothing here to split.</div>'}`;
  m.hidden = false; m.classList.add('splmenu');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
// Right-click on a leg, column or other standing shape: which sides take the door style, and its splits.
function showShapeCtx(id, x, y) {
  const s = (S.shapes || []).find(q => q.id === id); if (!s) return;
  select({ type: 'shape', id });
  const m = $('#ctxmenu'), on = postSides(s), item = (act, i, label, extra = '') => `<button role="menuitem" data-act="${act}" data-id="${i}"${extra}>${label}</button>`;
  const upright = s.plane === 'upright';
  m.innerHTML = `<div class="ctxhead">${esc(s.name || 'Shape')}</div>`
    + (upright ? `<div class="ctxsub">Sides in the door style</div>` + POST_SIDES.map(k => item('psd-side', `${id}:${k}`, `<span class="ck">${on.includes(k) ? '✓' : ''}</span>${POST_SIDE_NAME[k]}`, ` aria-checked="${on.includes(k)}"`)).join('')
      + (on.length < 4 ? item('psd-side', `${id}:all`, '<span class="ck"></span>All four sides') : '') + (on.length ? item('psd-side', `${id}:none`, '<span class="ck"></span>No sides (all flat)') : '')
      + item('spl-open', id, 'Split vertical or horizontal…') : '')
    + item('shape-edit', id, 'Edit shape') + item('shape-dup', id, 'Duplicate') + item('shape-del', id, 'Delete', ' class="danger"');
  m.hidden = false; m.classList.remove('splmenu'); m.dataset.ctxAt = `${x},${y}`; ui.splCtx = { id, x, y, shape: true };
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
// The menu's buttons (and the side switches in the shape's editor and item bar). el = the button clicked.
function splitCtxAct(a, id, el) {
  const inMenu = !!(el && el.closest && el.closest('#ctxmenu')), at = ui.splCtx || {};
  if (a === 'psd-side') {
    const j = id.lastIndexOf(':'), sid = id.slice(0, j), k = id.slice(j + 1), s = (S.shapes || []).find(q => q.id === sid); if (!s) return true;
    mutate(() => postSideSet(s, k));
    if (inMenu) showShapeCtx(sid, at.x, at.y);
    return true;
  }
  if (a === 'spl-open') { const m = $('#ctxmenu'), [x, y] = (m.dataset.ctxAt || `${at.x || 0},${at.y || 0}`).split(',').map(Number); showSplitMenu(id, ui.ctxHit && ui.ctxHit.id === id ? ui.ctxHit : null, x, y); return true; }
  if (a === 'spl-v' || a === 'spl-h' || a === 'spl-auto') {
    const t = (at.ts || [])[+id]; if (!t) return true;
    const dim = a === 'spl-v' ? 'S' : 'R', before = splCount(t), cur = dim === 'S' ? before.nS : before.nR;
    // A new count starts its openings and mid widths over (they are numbered across the old count), as on the Face tab.
    mutate(() => { const o = resolve(t.ref); if (!o) return;
      if (a === 'spl-auto') { ['S', 'R', 'W', 'H', 'ms', 'mr'].forEach(q => delete o[q]); return; }
      o[dim] = Math.max(0, Math.min(MAX_MIDS, cur + 1)); if (dim === 'S') { delete o.W; delete o.ms; } else { delete o.H; delete o.mr; } });
    showSplitMenu(at.id, at.hit, at.x, at.y);
    if (a !== 'spl-auto') {
      const t2 = (ui.splCtx.ts || []).find(q => q.ref === t.ref), n = t2 ? splCount(t2) : before;
      if ((dim === 'S' ? n.nS : n.nR) <= cur) flash(`No room for another mid ${dim === 'S' ? 'stile' : 'rail'} on the ${t.label.toLowerCase()} in its door style.`);
    }
    return true;
  }
  return false;
}
