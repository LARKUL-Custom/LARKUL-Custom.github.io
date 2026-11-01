// Touch screens (phones and tablets). The browser tells the page about fingers twice: as pointer events,
// which the drawings use, and as touch events, which always carry the true list of fingers still down.
// Sometimes a phone loses a finger's "lifted" pointer event, and the drawing then thinks that finger is
// still down: every new touch looks like a second finger, so zooming, drawing and dragging stop working.
// When the touch events say the last finger has lifted, everything that follows fingers starts fresh.
const fingerResets = new Set();
// fn runs once every finger is off the screen; the returned function stops that.
function onAllFingersUp(fn) { fingerResets.add(fn); return () => fingerResets.delete(fn); }
let fingersDown = 0;
(() => {
  let t = 0;
  const now = e => { fingersDown = e.touches.length; clearTimeout(t); };
  const lifted = e => {
    now(e); if (fingersDown) return;
    // A moment later, so any pointer events still on their way are handled first.
    t = setTimeout(() => { if (!fingersDown) [...fingerResets].forEach(fn => { try { fn(); } catch (err) { console.error(err); } }); }, 80);
  };
  const o = { capture: true, passive: true };
  addEventListener('touchstart', now, o);
  addEventListener('touchend', lifted, o);
  addEventListener('touchcancel', lifted, o);
})();

// iPhone and iPad: a tap on a text box must bring up the keyboard. Inside the hub's frame the phone
// sometimes lets a tap through without focusing the box, and then no keyboard comes up; focusing it
// here, while the finger is lifting, counts as the tap itself, so the keyboard opens.
(() => {
  let start = null;
  const typable = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=color]):not([type=file]),textarea,[contenteditable=""],[contenteditable=true]') && !el.disabled && !el.readOnly;
  addEventListener('touchstart', e => { const t = e.touches[0]; start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, el: e.target } : null; }, { capture: true, passive: true });
  addEventListener('touchend', e => {
    const s = start; start = null; const t = e.changedTouches[0];
    if (!s || !t || e.touches.length || Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) return;
    const el = s.el && s.el.closest ? s.el.closest('input,textarea,[contenteditable]') || (s.el.closest('label') && s.el.closest('label').control) : null;
    if (!typable(el) || document.activeElement === el) return;
    try { el.focus(); } catch (_) {}
  }, { capture: true, passive: true });
})();
