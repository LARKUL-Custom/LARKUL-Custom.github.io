// Cabinet Designer on a phone (phone app only). Works with the designer's own globals (ui, renderRail,
// redrawView, renderPlan, planSize) and only moves its elements around, so designer updates keep working.
(function () {
  const phone = matchMedia('(max-width: 960px), (max-height: 560px) and (pointer: coarse)');
  const room = document.getElementById('tab-room');
  const views = document.getElementById('views');
  const tab = document.getElementById('railtab');
  if (!room || !views || !tab) return;

  // The details (selected cabinet and the dock) scroll together under or beside the drawing.
  const panel = document.createElement('div');
  panel.className = 'phonepanel';
  const props = document.getElementById('props');
  const dock = document.getElementById('dock');
  const home = { tab: tab.parentElement, props: props.parentElement };
  // Draw the room again for its new size, once the designer has loaded a job.
  const redraw = () => requestAnimationFrame(() => { if (typeof S !== 'undefined' && S && ui.tab === 'room') redrawView(); });

  const details = document.createElement('button');
  details.type = 'button';
  details.className = 'phonefab details';
  // Sideways it's a slim tab on the drawing's right edge, like the hub's own menu tab.
  const sideways = matchMedia('(orientation: landscape)');
  const setDetails = () => {
    const shut = room.classList.contains('panel-shut');
    if (sideways.matches) details.textContent = shut ? '‹' : '›';
    else details.textContent = shut ? '▴ Details' : '▾ Bigger drawing';
    details.title = shut ? 'Show the details' : 'Hide the details';
    details.setAttribute('aria-label', details.title);
  };
  try { if (localStorage.getItem('cabinet-designer.phone.panelShut')) room.classList.add('panel-shut'); } catch (_) {}
  details.onclick = () => {
    const shut = room.classList.toggle('panel-shut');
    try { localStorage.setItem('cabinet-designer.phone.panelShut', shut ? '1' : ''); } catch (_) {}
    setDetails();
    redraw();
  };
  sideways.addEventListener('change', setDetails);

  function apply() {
    if (phone.matches) {
      panel.append(props, dock);
      room.append(panel);
      views.append(tab, details);
      tab.classList.add('phonefab');
      setDetails();
    } else {
      home.props.append(props, dock);
      panel.remove();
      details.remove();
      home.tab.prepend(tab);
      tab.classList.remove('phonefab');
    }
    redraw();
  }
  apply();
  phone.addEventListener('change', apply);
  // Turning the phone changes the drawing's shape: draw it again for the new size.
  addEventListener('orientationchange', () => setTimeout(redraw, 300));

  // Start with the library folded away on a phone, so the drawing is what you see first
  // (the designer reads this when it starts, just after this script runs).
  if (phone.matches) try { localStorage.setItem(`${KEY}.rail`, '1'); } catch (_) {}
  // Picking something in the library: fold the sheet away so you can tap where it goes.
  // (Sideways, the list sits beside the drawing instead, so it stays open.)
  document.addEventListener('click', (e) => {
    if (!phone.matches || sideways.matches || typeof ui === 'undefined' || ui.railShut) return;
    if (!e.target.closest('#tab-room .rail [data-drag], #tab-room .rail .libitem, #tab-room .rail .srcitem')) return;
    setTimeout(() => { ui.railShut = true; renderRail(); redraw(); }, 0);
  }, true); // before the designer redraws the library

  // Two fingers on the plan: pinch to zoom and move.
  const card = document.getElementById('plan-card');
  const plan = document.getElementById('plan');
  if (!card || !plan) return;
  const touches = new Map();
  let pinch = null;
  const two = () => [...touches.values()];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size !== 2) return;
    // A cabinet or wall already being moved keeps going; otherwise the first finger's pan becomes a pinch.
    if (ui.drag && ui.drag.live) return;
    ui.drag = null;
    const [a, b] = two();
    pinch = { d: dist(a, b), m: mid(a, b), view: { ...ui.view } };
    e.stopPropagation();
  }, true);
  card.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch || touches.size < 2) return;
    e.stopPropagation();
    const [a, b] = two();
    const sz = planSize();
    const v0 = pinch.view;
    const w = Math.max(20, Math.min(4000, v0.w * pinch.d / Math.max(10, dist(a, b))));
    const h = w * (sz.h / sz.w);
    // The point that was under the fingers at the start stays under them.
    const wx = v0.x + (pinch.m.x - sz.left) / sz.w * v0.w;
    const wy = v0.y + (pinch.m.y - sz.top) / sz.h * v0.h;
    const m = mid(a, b);
    ui.view = { x: wx - (m.x - sz.left) / sz.w * w, y: wy - (m.y - sz.top) / sz.h * h, w, h };
    renderPlan();
  }, true);
  const lift = (e) => {
    touches.delete(e.pointerId);
    if (pinch && touches.size < 2) { pinch = null; ui.drag = null; e.stopPropagation(); }
  };
  card.addEventListener('pointerup', lift, true);
  card.addEventListener('pointercancel', lift, true);
})();
