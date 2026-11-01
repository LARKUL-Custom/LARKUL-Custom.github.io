// Look and feel: theme, accent color, text size, panel widths, borders and corners. Kept on this computer, not in the job.
'use strict';
const LOOK_DEFAULTS = { theme: '', accent: '', size: 'm', borders: 'normal', corners: 'round', panel: 'm', rail: 'm', libsize: 'm', help: 'hide' };
const LOOK_KEY = 'cabinet-designer.look';
const ACCENTS = [['#2563eb', 'Blue'], ['#7c3aed', 'Violet'], ['#0d9488', 'Teal'], ['#16a34a', 'Green'], ['#ea580c', 'Orange'], ['#e11d48', 'Rose'], ['#475569', 'Slate']];
const LOOK_OPTS = {
  theme: [['', 'Match my computer'], ['light', 'Light'], ['dark', 'Dark']],
  size: [['s', 'Small'], ['m', 'Normal'], ['l', 'Large'], ['xl', 'Extra large']],
  borders: [['soft', 'Soft'], ['normal', 'Normal'], ['strong', 'Strong']],
  corners: [['square', 'Square'], ['round', 'Rounded'], ['pill', 'Extra round']],
  panel: [['s', 'Narrow'], ['m', 'Normal'], ['l', 'Wide']],
  rail: [['s', 'Narrow'], ['m', 'Normal'], ['l', 'Wide']],
  libsize: [['s', 'Small'], ['m', 'Normal'], ['l', 'Large']],
  help: [['show', 'Show'], ['hide', 'Hide']],
};
const LOOK_ZOOM = { s: 0.9, m: 1, l: 1.12, xl: 1.25 };
let look = { ...LOOK_DEFAULTS };
try { look = { ...LOOK_DEFAULTS, ...(JSON.parse(localStorage.getItem(LOOK_KEY)) || {}) }; } catch (_) {}
// Help text used to be a side panel only switch (notes). It now covers the whole app and starts hidden.
delete look.notes;
function hexLum(hex) { const v = parseInt(String(hex).slice(1), 16), c = [v >> 16 & 255, v >> 8 & 255, v & 255].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function applyLook() {
  const r = document.documentElement, st = r.style;
  if (look.theme) r.dataset.theme = look.theme; else delete r.dataset.theme;
  ['borders', 'corners', 'panel', 'rail', 'libsize', 'help'].forEach(k => { r.dataset[k] = look[k]; });
  if (/^#[0-9a-f]{6}$/i.test(look.accent)) {
    st.setProperty('--accent', look.accent);
    st.setProperty('--accent-soft', `color-mix(in srgb, ${look.accent} 16%, var(--panel))`);
    st.setProperty('--accent-ink', hexLum(look.accent) > 0.45 ? '#0b1430' : '#ffffff');
  } else ['--accent', '--accent-soft', '--accent-ink'].forEach(k => st.removeProperty(k));
  st.setProperty('--ui-zoom', LOOK_ZOOM[look.size] || 1);
  const b = document.getElementById('themebtn');
  if (b && typeof icon === 'function') {
    const dark = isDarkNow(), t = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.innerHTML = icon(dark ? 'sun' : 'moon'); b.title = t; b.setAttribute('aria-label', t);
  }
  const hb = document.getElementById('helpbtn');
  if (hb) { const on = look.help === 'show'; hb.setAttribute('aria-pressed', on); hb.title = on ? 'Hide help text' : 'Show help text'; hb.classList.toggle('on', on); }
}
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function isDarkNow() { return look.theme ? look.theme === 'dark' : !!(darkQuery && darkQuery.matches); }
// The sun/moon button in the top bar flips between light and dark.
function flipTheme() { setLook('theme', isDarkNow() ? 'light' : 'dark'); }
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => applyLook());
function setLook(k, v) {
  look[k] = v; try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (_) {}
  applyLook();
  if (S && roomViewer && ui.tab === 'room') requestAnimationFrame(() => renderRoom());
}
function renderLook() {
  const seg = k => `<div class="seg" role="group" aria-label="${k}">${LOOK_OPTS[k].map(([v, l]) => `<button data-act="look" data-id="${k}:${v}" aria-pressed="${look[k] === v}">${l}</button>`).join('')}</div>`;
  const row = (label, body, note) => `<div class="lookrow"><div><b>${label}</b>${note ? `<div class="note">${note}</div>` : ''}</div><div>${body}</div></div>`;
  return `<div class="card"><div class="cardhead"><h3>${icon('eye')}Look and feel</h3><button class="btn" data-act="look-reset">Reset to normal</button></div>
    <div class="cardbody stack">
      <div class="note">These are saved on this computer and apply to every job.</div>
      ${row('Theme', seg('theme'))}
      ${row('Accent color', `<div class="swatches">${ACCENTS.map(([c, n]) => `<button class="accsw${look.accent === c || (!look.accent && c === ACCENTS[0][0]) ? ' on' : ''}" data-act="look" data-id="accent:${c}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}<label class="accsw custom" title="Pick any color"><input type="color" id="look-accent" value="${esc(look.accent || ACCENTS[0][0])}" aria-label="Any color"></label></div>`, 'Buttons, tabs and highlights.')}
      ${row('Text and controls size', seg('size'), 'Makes the whole screen bigger or smaller.')}
      ${row('Borders', seg('borders'), 'How strongly boxes and input fields are outlined.')}
      ${row('Corners', seg('corners'))}
      ${row('Library width', seg('rail'), 'The cabinet list on the left of the room.')}
      ${row('Library size', seg('libsize'), 'How big the cabinets and tabs in the library are drawn. Also on the library itself.')}
      ${row('Help text', seg('help'), 'The explanations at the top of each page, under fields and in the room. Also the ? button at the top.')}
      ${row('Side panel width', seg('panel'), 'The cabinet and wall details on the right of the room.')}
    </div></div>`;
}
document.addEventListener('input', e => { if (e.target.id === 'look-accent') { look.accent = e.target.value; applyLook(); } });
document.addEventListener('change', e => { if (e.target.id === 'look-accent') { setLook('accent', e.target.value); if (typeof renderSettings === 'function') renderSettings(); } });
applyLook();
