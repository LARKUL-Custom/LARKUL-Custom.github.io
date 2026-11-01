// Main screen (Room) from Ayden's UI design: view bar icons, the item bar under the drawing and its position tools.
'use strict';
// View bar icons, from Ayden's view icon set. Teal ones are the Draw tools.
const VIEW_ICONS = {
  Plan: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h6V3M13 17v-5h4"/>',
  Elevation: '<path d="M2.5 17h15"/><rect x="4" y="9" width="5" height="8"/><rect x="11" y="9" width="5" height="8"/><rect x="4" y="3" width="12" height="4"/>',
  '3D': '<path d="M10 2.5l6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z"/><path d="M3.5 6.2L10 10l6.5-3.8M10 10v7.5"/>',
  Dimensions: '<path d="M2.5 13.5l11-11 4 4-11 11z"/><path d="M6 10l1.5 1.5M8.5 7.5L10 9M11 5l1.5 1.5"/>',
  Walls: '<path d="M3 16.5V5h14"/><circle class="dot" cx="17" cy="5" r="1.6"/><circle class="dot" cx="3" cy="16.5" r="1.6"/>',
  Molding: '<path d="M2.5 13.5l11-11 4 4-11 11z"/><path d="M6 10l1.5 1.5M8.5 7.5L10 9M11 5l1.5 1.5"/>',
  Tops: '<path d="M3 16.5V4h14v5H8.5v7.5z"/><circle class="dot" cx="17" cy="4" r="1.6"/>',
  'Open all': '<path d="M4 3.5h7v13H4z"/><path d="M11 3.5l5 2v11l-5-1"/><circle class="dot" cx="9" cy="10" r=".6"/>',
};
const vic = k => `<svg class="vic${['Walls', 'Molding', 'Tops'].includes(k) ? ' teal' : ''}" viewBox="0 0 20 20" aria-hidden="true">${VIEW_ICONS[k] || ''}</svg>`;
// The desktop layout from the design; phones and narrow windows keep their own layout.
const deskQuery = matchMedia('(min-width: 961px) and (min-height: 561px), (min-width: 961px) and (pointer: fine)');
const deskUI = () => deskQuery.matches;
deskQuery.addEventListener('change', () => { if (ui.tab === 'room') renderRoom(); });

// Space between a cabinet and whatever is next to it (another cabinet, an end cap or the wall), by the viewer's end.
const gapDir = (c, end) => (c.side === 1) === (end === 'L') ? -1 : 1;
function openGap(c, end) {
  const dir = gapDir(c, end), n = nearestAt(c, dir), { lo, hi } = runLimits(c);
  const toWall = dir < 0 ? c.off - lo : hi - (c.off + c.w);
  return Math.max(0, n ? Math.min(n.gap, toWall) : toWall);
}
// Nothing but the wall on that side: the opening is the wall, so it works like From left / From right.
const gapIsWall = (c, end) => Math.abs(openGap(c, end) - fromEnd(c, end)) < 0.01;
function setOpenGap(c, end, v) { c.off = r3(c.off - gapDir(c, end) * (v - openGap(c, end))); }

// Item bar: the selected cabinet's position on its wall, its size, and the automatic fillers and panels.
function itemBar(c) {
  const L = lay(), id = c && c.id, onWall = !!(c && c.wall);
  const posOk = onWall, pos = (label, ref, end, val) => `<label class="ib-f"><span>${label}</span>${posOk ? ctl(ref + id, end, r3(val), 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  const ctr = (act, n, t) => `<button class="ib-ctr" data-act="${act}" data-id="${id || ''}" title="${t}" aria-label="${t}"${posOk ? '' : ' disabled'}>${n}</button>`;
  let slide = '';
  if (posOk) {
    const { lo, hi } = runLimits(c), span = Math.max(0, r3(hi - lo - c.w));
    slide = `<input type="range" class="ib-slide" data-slide="${id}" min="0" max="${span}" step="0.125" value="${r3(fromEnd(c, 'L'))}" aria-label="Slide along the wall" title="Slide it along the wall">`;
  } else slide = '<input type="range" class="ib-slide" disabled aria-label="Slide along the wall">';
  const R = c ? 'cab:' + id : '';
  const sz = (label, f) => `<label class="ib-f"><span>${label}</span>${c ? ctl(R, f, f === 'outset' ? c.outset || 0 : c[f], 'len', { label }) : `<input type="text" disabled aria-label="${label}">`}</label>`;
  const tog = (k, label) => `<label class="ib-tog"><span>${label}</span>${ctl('layout', k, L[k], 'bool', { label })}<i aria-hidden="true"></i></label>`;
  return `<div class="itembar${c ? '' : ' none'}">
    <div class="ib-pos">
      ${pos('Left opening', 'cabgap:', 'L', c ? openGap(c, 'L') : 0)}${ctr('cab-center-open', 1, 'Center it in the opening')}${pos('Right opening', 'cabgap:', 'R', c ? openGap(c, 'R') : 0)}
      ${pos('From left wall', 'cabpos:', 'L', c ? fromEnd(c, 'L') : 0)}${ctr('cab-center', 2, 'Center it on the whole wall')}${pos('From right wall', 'cabpos:', 'R', c ? fromEnd(c, 'R') : 0)}
      <div class="ib-slidewrap">${slide}</div>
    </div>
    <div class="ib-size">${sz('Width', 'w')}${sz('Height', 'h')}${sz('Elevation', 'elev')}<span class="ib-gap"></span>${sz('Depth', 'd')}${sz('Outset', 'outset')}</div>
    <div class="ib-togs">${tog('autoFillers', 'Automatic fillers')}${tog('autoPanels', 'Automatic panels')}</div>
    <div class="ib-more">${c ? `<div class="ib-name"><b>${esc(LBL[c.id] || '')}</b> ${esc(c.name)}</div>${typeof growSeg === 'function' && onWall ? growSeg() : ''}<button class="btn sm" data-act="ed-open" data-id="${id}">${icon('edit')}Cabinet editor</button>`
      : `<div class="ib-name muted">${multiIds().length > 1 ? `${multiIds().length} items picked. Edit them together in the side panel.` : 'Pick a cabinet to size and place it here.'}</div>`}</div>
  </div>`;
}

// Sliding: the cabinet follows the slider live, and one undo step is saved when it is let go.
let slideWas = null;
document.addEventListener('input', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-slide]')) return;
  const c = cab(el.dataset.slide); if (!c) return;
  if (!slideWas || slideWas.id !== c.id) slideWas = { id: c.id, off: c.off };
  setFromEnd(c, 'L', +el.value);
  if (ui.viewMode === 'plan') renderPlan(); else if (ui.viewMode === 'elev') renderElev();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('.ib-slide[data-slide]')) return;
  const c = cab(el.dataset.slide); if (!c) return;
  const v = +el.value; if (slideWas && slideWas.id === c.id) c.off = slideWas.off; slideWas = null;
  mutate(() => { const was = c.off; setFromEnd(c, 'L', v); if (!settle(c)) { c.off = was; flash('There is no room for it there.'); } });
});
// The job name box wraps over two lines; Enter saves it instead of starting a new line.
document.addEventListener('keydown', e => { if (e.target.id === 'jobname' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
// The design scales as one piece with the window, like the design tool's "Scale with screen":
// one design pixel is min(width / 1920, height / 1080) of the window, never smaller than 0.62.
function setDesignScale() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const u = Math.max(0.62, Math.min(innerWidth / 1920, innerHeight / 1080)) / z;
  document.documentElement.style.setProperty('--u', u.toFixed(4) + 'px');
  document.body && document.body.classList.toggle('desk', deskUI());
}
addEventListener('resize', setDesignScale);
deskQuery.addEventListener('change', setDesignScale);
setDesignScale();
