// 0.63.28: the cabinet editor's big 3D view (Ayden: "a button that shows this in a 3d view with options for wireframe or just
// the hidden line mode, and camera selections by side ... so we can see all the parts and fix").
// The 3D view button on the editor's right column swaps the picture and the tab's work for one large 3D view of the cabinet.
// It draws into the editor's own 3D viewer (edView3D in view3d.js), so it is the same cabinet the preview shows.
//   Look: Shaded (the room's look), Wireframe (every edge, see-through) or Hidden line (white faces, black edges).
//   Camera: Iso, Front, Back, Left, Right, Top, Bottom, all flat (no perspective) so the sides read like drawings,
//   plus Perspective. Dragging still turns it.
//   Show: doors and drawer fronts, drawer boxes (off shows the parts behind them).
// Look only: nothing in the build, cut list or price changes.

const ED3_LOOKS = [['shaded', 'Shaded'], ['wire', 'Wireframe'], ['hidden', 'Hidden line']];
// Directions from the cabinet to the camera. The cabinet's front faces +z, its left side is -x.
const ED3_CAMS = [['iso', 'Iso', { x: -1, y: 0.8, z: 1.1 }], ['front', 'Front', { x: 0, y: 0, z: 1 }], ['back', 'Back', { x: 0, y: 0, z: -1 }],
  ['left', 'Left', { x: -1, y: 0, z: 0 }], ['right', 'Right', { x: 1, y: 0, z: 0 }], ['top', 'Top', { x: 0, y: 1, z: 0.001 }], ['bottom', 'Bottom', { x: 0, y: -1, z: 0.001 }]];

// What the editor's 3D viewer should draw: the big view's look and shown parts, or the plain preview.
function ed3State() {
  if (!ui.ed3Big) return { look: 'shaded', layers: null };
  const sh = ui.ed3Show || {}, layers = {};
  if (sh.fronts === false) { layers.fronts = false; layers.pulls = false; layers.glass = false; }
  if (sh.drawerBox === false) layers.drawerBox = false;
  return { look: ui.ed3Look || 'shaded', layers: Object.keys(layers).length ? layers : null };
}

// The editor body while the big view is open: a bar of looks, cameras and shown parts over the 3D view.
function ed3BigHTML(c) {
  const look = ui.ed3Look || 'shaded', cam = ui.ed3Cam || 'iso', sh = ui.ed3Show || {};
  const seg = (lbl, items, on, act) => `<div class="ed3-grp"><span class="ed3-lbl">${lbl}</span><div class="seg" role="group" aria-label="${lbl}">${items.map(([k, l]) => `<button data-act="${act}" data-id="${k}" aria-pressed="${on === k}">${l}</button>`).join('')}</div></div>`;
  const chk = (k, l) => `<button class="btn sm${sh[k] === false ? '' : ' on'}" data-act="ed3-show" data-id="${k}" aria-pressed="${sh[k] !== false}">${l}</button>`;
  return `<section class="ed3-big">
    <div class="ed3-bar">${seg('Look', ED3_LOOKS, look, 'ed3-look')}${seg('Camera', [...ED3_CAMS.map(([k, l]) => [k, l]), ['persp', 'Perspective']], cam, 'ed3-cam')}
      <div class="ed3-grp"><span class="ed3-lbl">Show</span>${chk('fronts', 'Fronts')}${chk('drawerBox', 'Drawer boxes')}</div>
      <button class="btn sm" data-act="ed3-cam" data-id="${esc(cam)}" title="Frame the whole cabinet again">${icon('fit')}Fit</button></div>
    <div class="preview ed3d ed3-host" id="ed3d" data-morph-keep></div>
    <div class="note qe-tip helponly">Drag to turn it, right-drag to slide, scroll to zoom. ${esc(c.name || '')}</div>
  </section>`;
}

// Wireframe: every edge of every part shows, the ones behind too. Faces draw nothing; edges come from the part's own outline
// or, for parts without one, its geometry. Applied over the built cabinet like the Hidden line look.
const ED3W = {};
function wire3d(v) {
  if (!ED3W.line) {
    ED3W.line = new THREE.LineBasicMaterial({ color: 0x1f2933 });
    ED3W.none = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  }
  v.setReal(false); v.setBackground('#ffffff');
  const meshes = [];
  v.root.traverse(o => { if (o.isMesh && !o.isSprite) meshes.push(o); else if ((o.isLineSegments || o.isLine) && !o.userData.keepLine) o.material = ED3W.line; });
  meshes.forEach(o => {
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m0 || m0.visible === false || m0.colorWrite === false) return;
    o.material = ED3W.none;
    if (!o.children.some(k => k.isLineSegments) && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count < 60000) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), ED3W.line); e.userData.hlEdge = true; o.add(e);
    }
  });
  v.requestRender();
}

// Points the editor's viewer from one side. Every named side is flat (orthographic) so it reads like a drawing.
function ed3Camera(k) {
  const v = typeof edViewer !== 'undefined' && edViewer; if (!v || !v.ok) return;
  if (k === 'persp') { v.setMode('persp'); v.look({ x: -0.8, y: 0.5, z: 1.4 }); return; }
  const cam = ED3_CAMS.find(([id]) => id === k) || ED3_CAMS[0];
  v.setMode('ortho'); v.resize(); v.look(cam[2]); ed3Frame(v);
}
// Flat views: size the view to the cabinet as seen from that side (look() sizes to its whole diagonal, which cut off an Iso view).
function ed3Frame(v) {
  const b = v.bounds(), cam = v.cam; cam.updateMatrixWorld(); const inv = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  [b.min.x, b.max.x].forEach(x => [b.min.y, b.max.y].forEach(y => [b.min.z, b.max.z].forEach(z => {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  })));
  const w = v.host.clientWidth, h = v.host.clientHeight; if (!w || !h || !isFinite(x0)) return;
  // Center on the box as seen, with a margin all round.
  const d = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0).applyMatrix4(cam.matrixWorld).sub(cam.position);
  v.controls.target.add(d); cam.position.add(d);
  v.orthoH = Math.max(y1 - y0, (x1 - x0) * h / w) * 1.15; v.ortho.zoom = 1; v.resize(); v.controls.update(); v.requestRender();
}

function ed3Act(a, id) {
  if (a === 'ed-big3d') {
    ui.ed3Big = !ui.ed3Big;
    if (ui.ed3Big) { ui.ed3Cam = ui.ed3Cam || 'iso'; ui.ed3Fresh = true; }
    else if (typeof edViewer !== 'undefined' && edViewer && edViewer.ok) { edViewer.setMode('persp'); ui.ed3Fresh = true; }
    renderQuick(); return;
  }
  if (a === 'ed3-look') { ui.ed3Look = id; renderQuick(); return; }
  if (a === 'ed3-show') { ui.ed3Show = { ...(ui.ed3Show || {}), [id]: (ui.ed3Show || {})[id] === false }; renderQuick(); return; }
  if (a === 'ed3-cam') { ui.ed3Cam = id; renderQuick(); ed3Camera(id); }
}
