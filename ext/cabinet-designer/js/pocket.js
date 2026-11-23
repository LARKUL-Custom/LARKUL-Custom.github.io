// Pocket doors (Ayden 2026-11-23): a door that swings open to 90° and then slides back into a pocket inside the cabinet,
// like a Blum REVEGO or Häfele Concepta system. Any cabinet or product can be marked (c.pocket = 'on', Pocket doors on
// the editor's Fronts tab or the Pocket button in the item bar), and the library has pocket door cabinets.
// Each side a door hinges on gets a pocket: a clear slot (shop setting pocketGap) and a pocket panel between the slot and
// the shelves, so the shelves and roll-outs lose that much width. The pocket system goes on the hardware list per door.
'use strict';

const POCKET_HW = 'Pocket door system (Blum REVEGO), per door';
// A door can go into a pocket when it hinges on the cabinet's own side. Corners, face frames, Mozaik products and shop
// pieces (desks, panels) don't take pockets.
function pocketable(c) {
  if (!c || c.pocket !== 'on' || c.moz || c.made) return false;
  if (typeof faceFrame === 'function' && faceFrame(c)) return false;
  if (typeof angledCorner === 'function' && angledCorner(c)) return false;
  if (typeof blindCorner === 'function' && blindCorner(c)) return false;
  return true;
}
// The pockets of a cabinet: which sides, how wide the slot is, and the heights the pocket panel spans (the doors that
// hinge into it, kept inside the box). null when the cabinet has none.
function pocketInfo(c, p, fronts, t, zIn0, zIn1) {
  if (!pocketable(c)) return null;
  p = p || effParams(c); fronts = fronts || computeFronts(c, p);
  const W = c.w, edge = 0.5, doors = fronts.filter(f => f.type === 'door' && !f.face && (f.hinge === 'L' ? f.x0 < t + edge : f.hinge === 'R' ? f.x1 > W - t - edge : false));
  if (!doors.length) return null;
  const gap = Math.max(0.5, +p.pocketGap || 2), sides = {};
  doors.forEach(f => { const s = sides[f.hinge] = sides[f.hinge] || { side: f.hinge, z0: Infinity, z1: -Infinity, doors: [] };
    s.z0 = Math.min(s.z0, f.z0); s.z1 = Math.max(s.z1, f.z1); s.doors.push(f); });
  Object.values(sides).forEach(s => { s.z0 = r3(Math.max(zIn0, s.z0)); s.z1 = r3(Math.min(zIn1, s.z1)); });
  const L = sides.L || null, R = sides.R || null;
  // A pocket panel sits gap in from the side; its centre in cabinet x.
  if (L) L.x = r3(t + gap + t / 2);
  if (R) R.x = r3(W - t - gap - t / 2);
  return { gap, t, L, R, wL: L ? gap + t : 0, wR: R ? gap + t : 0, doors };
}
// The pocket a single door slides into, if any.
function pocketOf(c, f, pk) {
  if (!pk || !f || f.type !== 'door' || f.face) return null;
  const s = pk[f.hinge]; return s && s.doors.some(d => d.row === f.row && d.idx === f.idx) ? s : null;
}
// The pockets of a cabinet as the 3D view needs them (it doesn't run buildParts).
function pocketFor3D(c, p, fronts, t) {
  const tk = hasToe(c) ? p.toeKickHeight : 0;
  return pocketInfo(c, p, fronts, t, tk + t, c.h - t);
}
// How a pocket door moves at open amount t (0 shut .. 1 in its pocket): first it swings to 90°, then it steps in off
// the cabinet side into the slot and slides back. Returns the hinge turn (radians, before sign) and the shift.
function pocketMove(o, t) {
  const op = o.userData.open, sw = Math.min(1, t / 0.45), sl = Math.max(0, (t - 0.45) / 0.55);
  const e = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return { a: Math.PI / 2 * e(sw), dx: op.dx * e(Math.min(1, sl * 3)), dz: op.dz * e(sl) };
}
// The pocket one door of cabinet c slides into (for the open-door solver and plan), or null.
function pocketDoor(c, f) {
  if (!pocketable(c) || !f || f.type !== 'door') return null;
  const p = effParams(c), t = (mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]).thick;
  return pocketOf(c, f, pocketFor3D(c, p, computeFronts(c, p), t));
}
// Item bar switch: Pocket doors on/off for the picked cabinet. Shown on cabinets with doors that can take pockets.
function pocketBtn(c) {
  if (!c || c.moz || c.made || !(c.rows || []).some(r => r.type === 'door')) return '';
  if ((typeof faceFrame === 'function' && faceFrame(c)) || (typeof angledCorner === 'function' && angledCorner(c)) || (typeof blindCorner === 'function' && blindCorner(c))) return '';
  const on = c.pocket === 'on';
  return `<button data-act="cab-pocket" data-id="${c.id}" aria-pressed="${on}" title="${on ? 'Pocket doors are on: the doors swing open and slide back into pockets inside the cabinet. Click to turn them off.' : 'Pocket doors: the doors swing open, then slide back into pockets inside the cabinet (Blum REVEGO style). Pockets take width from the inside.'}">${icon('door')}Pocket</button>`;
}
