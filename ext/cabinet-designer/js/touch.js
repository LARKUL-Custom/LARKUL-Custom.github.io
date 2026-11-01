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
