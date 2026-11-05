/* ---------- Imported 3D models: SketchUp models brought in a whole folder at a time ---------- */
// SketchUp files can't be read in the browser, so the SketchUp extension in tools/sketchup turns a folder of them
// into small mesh files (.cdm.json) in a "CD Models" folder. Picking that folder here (a Mozaik library folder
// works as is) brings in every model at once. With Mozaik's .moz products and Library.ndx in the same pick, each
// product comes in under its Mozaik name, folder and size, with the SketchUp model its .moz names.
// The models are kept in this browser (IndexedDB), not in the job: a job only stores which model a fixture uses,
// so it opens anywhere and shows a plain box where the model isn't imported.
'use strict';
let MODEL_LIB = [];      // [{ id, kind, folder, name, w, h, d, elev, model, md, lib }]
const modelGeo = {};     // model key -> { box, mats } once read, or a promise while it loads
const modelTpl = {};     // model key -> THREE.Group in a 1 x 1 x 1 box, shared by every copy in the room

/* ---------- Storage ---------- */
function mdbOpen() {
  if (mdbOpen.p) return mdbOpen.p;
  mdbOpen.p = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(KEY + '.models', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('geo'); r.result.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return mdbOpen.p;
}
function mdb(store, mode, fn) {
  return mdbOpen().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
async function loadModelLib() {
  try { const v = await mdb('meta', 'readonly', s => s.get('items')); if (Array.isArray(v)) MODEL_LIB = v; } catch (_) {}
}
const saveModelLib = () => mdb('meta', 'readwrite', s => s.put(MODEL_LIB, 'items'));
const modelItem = id => MODEL_LIB.find(x => x.id === id);
// Each imported library shows on its own in the Products tree, picked on the library switch, with Mozaik's folder
// tree: its top folders are the categories and the folders under them open below.
const modelLibs = () => [...new Set(MODEL_LIB.map(x => x.lib))].sort((a, b) => a.localeCompare(b));
function modelTreeItems(lib) {
  return MODEL_LIB.filter(x => x.lib === lib).map(d => {
    const p = String(d.path || d.folder || '').split(/\/| › /).map(s => s.trim()).filter(Boolean), top = p[0] || 'Models';
    return { key: 'fixt:' + d.id, g: 'mdl:' + top, f: p.slice(1).join(' › ') || top, name: d.name, html: fixtButton(d) };
  });
}
const modelGroups = lib => [...new Set(modelTreeItems(lib).map(x => x.g))].map(g => [g, g.slice(4)]);

/* ---------- 3D ---------- */
const modelReady = key => !!(modelGeo[key] && !modelGeo[key].then);
// Starts reading a model from storage; redraws the room and the preview once it's in.
function modelLoad(key) {
  if (!key || modelGeo[key]) return;
  modelGeo[key] = mdb('geo', 'readonly', s => s.get(key)).then(g => {
    modelGeo[key] = g || { missing: true };
    if (g) {
      if (typeof roomViewer !== 'undefined' && roomViewer && ui.viewMode === '3d') buildRoom3D();
      const el = document.getElementById('libpeek'); if (el && ui.libPeek) el.innerHTML = libPeekHTML(ui.libPeek);
    }
  }).catch(() => { modelGeo[key] = { missing: true }; });
}
const mdlMats = {};
function mdlMat(c, o, tex) {
  const k = c + '|' + o + '|' + (tex ? tex.uuid : '');
  if (mdlMats[k]) return mdlMats[k];
  // A textured material's picture already carries SketchUp's colour, so it isn't tinted again.
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tex ? '#ffffff' : c), map: tex || null, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide, transparent: o < 1, opacity: o, depthWrite: !(o < 1) });
  return mdlMats[k] = m;
}
// Pictures for textured materials, read once from storage and shared.
const mdlTex = new Map();
function mdlTexture(blob) {
  if (mdlTex.has(blob)) return mdlTex.get(blob);
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (THREE.SRGBColorSpace && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  const img = new Image(), url = URL.createObjectURL(blob);
  img.onload = () => {
    t.image = img; t.needsUpdate = true; URL.revokeObjectURL(url);
    if (typeof roomViewer !== 'undefined' && roomViewer && roomViewer.draw) try { roomViewer.draw(); } catch (_) {}
    for (const k in peekPics) if (k.startsWith('fixt|')) delete peekPics[k];
    const el = document.getElementById('libpeek'); if (el && ui.libPeek) el.innerHTML = libPeekHTML(ui.libPeek);
  };
  img.src = url; mdlTex.set(blob, t);
  return t;
}
// Smooth shading across curved surfaces (SketchUp's soft edges), sharp corners kept: each corner's normal averages
// the triangles at that point that face within 35 degrees of its own. Worked out in inches, before the stretch.
function creaseNormals(pos) {
  const n = pos.length / 9, fn = new Float32Array(n * 3), map = new Map(), out = new Float32Array(pos.length), cos = Math.cos(35 * Math.PI / 180);
  const key = j => Math.round(pos[j] * 200) + ',' + Math.round(pos[j + 1] * 200) + ',' + Math.round(pos[j + 2] * 200);
  for (let t = 0; t < n; t++) {
    const a = t * 9, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;
    for (let c = 0; c < 3; c++) { const k = key(a + c * 3); let l = map.get(k); if (!l) map.set(k, l = []); l.push(t); }
  }
  const len = t => Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1;
  for (let t = 0; t < n; t++) {
    const lt = len(t), ax = fn[t * 3] / lt, ay = fn[t * 3 + 1] / lt, az = fn[t * 3 + 2] / lt;
    for (let c = 0; c < 3; c++) {
      let x = 0, y = 0, z = 0;
      for (const o of map.get(key(t * 9 + c * 3))) {
        const lo = len(o), d = (fn[o * 3] * ax + fn[o * 3 + 1] * ay + fn[o * 3 + 2] * az) / lo;
        // Triangles facing the other way (a face drawn twice, back to back) count turned over.
        if (Math.abs(d) >= cos) { const sg = d < 0 ? -1 : 1; x += sg * fn[o * 3]; y += sg * fn[o * 3 + 1]; z += sg * fn[o * 3 + 2]; }
      }
      const l = Math.hypot(x, y, z) || 1, j = t * 9 + c * 3; out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
    }
  }
  return out;
}
// The model fitted into a 1 x 1 x 1 box in the room's fixture axes: x along the wall, y up, z out from the wall.
// SketchUp's axes are x right, y back, z up, and Mozaik's models face -y, so y turns into the depth.
function modelTemplate(key) {
  if (modelTpl[key]) return modelTpl[key];
  const g = modelGeo[key]; if (!g || g.then || g.missing) return null;
  const [x0, y0, z0, x1, y1, z1] = g.box, sx = Math.max(x1 - x0, 1e-6), sy = Math.max(y1 - y0, 1e-6), sz = Math.max(z1 - z0, 1e-6);
  const grp = new THREE.Group();
  let tris = 0;
  g.mats.forEach(m => {
    const p = m.p, idx = m.i, raw = new Float32Array(idx.length * 3), pos = new Float32Array(idx.length * 3), uv = m.u && m.tex ? new Float32Array(idx.length * 2) : null;
    for (let n = 0; n < idx.length; n++) {
      const j = idx[n] * 3;
      raw[n * 3] = p[j]; raw[n * 3 + 1] = p[j + 1]; raw[n * 3 + 2] = p[j + 2];
      pos[n * 3] = (p[j] - x0) / sx; pos[n * 3 + 1] = (p[j + 2] - z0) / sz; pos[n * 3 + 2] = (y1 - p[j + 1]) / sy;
      if (uv) { uv[n * 2] = m.u[idx[n] * 2]; uv[n * 2 + 1] = m.u[idx[n] * 2 + 1]; }
    }
    // Normals from inches, turned into the box's axes (a normal stretches the other way from the points).
    const nr = creaseNormals(raw), nm = new Float32Array(nr.length);
    for (let n = 0; n < nr.length; n += 3) {
      const a = nr[n] * sx, b = nr[n + 2] * sz, c = -nr[n + 1] * sy, l = Math.hypot(a, b, c) || 1;
      nm[n] = a / l; nm[n + 1] = b / l; nm[n + 2] = c / l;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    grp.add(new THREE.Mesh(geo, mdlMat(m.c, m.o, uv ? mdlTexture(m.tex) : null))); tris += idx.length / 3;
  });
  // SketchUp's own edge lines (the hard ones), like the rest of the drawing.
  if (g.e && g.e.length) {
    const e = g.e, ep = new Float32Array(e.length);
    for (let n = 0; n < e.length; n += 3) { ep[n] = (e[n] - x0) / sx; ep[n + 1] = (e[n + 2] - z0) / sz; ep[n + 2] = (y1 - e[n + 1]) / sy; }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    const ln = new THREE.LineSegments(eg, mdlEdgeMat()); ln.userData.mdlEdges = true; grp.add(ln);
  }
  grp.userData.tris = tris;
  return modelTpl[key] = grp;
}
const mdlEdgeMat = () => mdlEdgeMat.m || (mdlEdgeMat.m = new THREE.LineBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.45 }));
// A copy sized w x h x d with its low front-left corner at the origin, or null until the model is loaded.
// Selected, it keeps its pictures and glows in the selection colour. Realistic view leaves the edge lines off.
function modelMesh(key, w, h, d, selCol) {
  modelLoad(key);
  const t = modelTemplate(key); if (!t) return null;
  const grp = new THREE.Group();
  t.children.forEach(m => {
    if (m.userData.mdlEdges) { if (!R3) grp.add(new THREE.LineSegments(m.geometry, m.material)); return; }
    let mat = m.material;
    if (selCol) { mat = mat.clone(); mat.emissive = new THREE.Color(selCol); mat.emissiveIntensity = 0.35; }
    grp.add(new THREE.Mesh(m.geometry, mat));
  });
  grp.scale.set(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
  return grp;
}

/* ---------- Kinds ---------- */
// Which fixture kind a Mozaik product acts as, from its library folder and name. Anything else is a loose model:
// it goes where it's put and keeps nothing out of its space (rugs, art, lights, decor).
function modelKind(folder, name) {
  const p = (folder + '/' + name).toLowerCase(), n = name.toLowerCase(), leaf = (folder.split('/').pop() + '/' + name).toLowerCase();
  if (/dishwasher/.test(p)) return 'dw';
  // Looked at on the last folder only, since Mozaik files ranges under "Ranges+Cooktops".
  if (/hood|microwave|cooktop|rangetop|small appliance|commercial/.test(leaf) || /commercial/.test(p)) return 'model';
  if (/refrigerator|fridge|wine|beverage/.test(p)) return /undercounter|under counter|u-c\b|\buc\b/.test(p) ? 'ucfridge' : 'fridge';
  if (/(^|\/)ranges\b|ranges -|\brange\b/.test(p)) return 'range';
  if (/laundry - (front|top) load|laundry - combo|\bwasher\b|\bdryer\b/.test(p)) return /dryer/.test(n) && !/washer/.test(n) ? 'dryer' : 'washer';
  if (/kitchen sinks|bathroom sinks\/(drop-in|undermount)/.test(p)) return 'sink';
  if (/architectural\/doors/.test(p)) return 'door';
  if (/architectural\/windows/.test(p)) return 'window';
  return 'model';
}

/* ---------- Import ---------- */
const relOf = f => String(f.webkitRelativePath || f.name).replace(/\\/g, '/');
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const baseOf = p => p.slice(p.lastIndexOf('/') + 1);
const xmlAttr = (tag, k) => { const m = tag.match(new RegExp('\\s' + k + '="([^"]*)"')); return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") : ''; };
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
// Mozaik's Library.ndx: product name -> its folder path.
function ndxFolders(text) {
  const nodes = {}, out = {};
  for (const m of text.matchAll(/<Node\b[^>]*>/g)) { const t = m[0], id = xmlAttr(t, 'ID'); nodes[id] = { name: xmlAttr(t, 'Name').trim(), parent: xmlAttr(t, 'ParentID'), folder: xmlAttr(t, 'IsFolder') === 'True' }; }
  const path = id => { const p = []; let n = nodes[id], k = 0; while (n && k++ < 50) { p.unshift(n.name); n = nodes[n.parent]; } return p.join('/'); };
  // A product can also sit in Quick Access; its real folder wins.
  Object.values(nodes).forEach(n => { if (n.folder) return; const f = path(n.parent); if (!(n.name in out) || /^quick access/i.test(out[n.name])) out[n.name] = f; });
  return out;
}
const showFolder = f => f.split('/').filter(Boolean).slice(-2).join(' › ') || 'Models';
function modelProg(text) { const el = document.getElementById('mdlprog'); if (el) { el.textContent = text; el.hidden = !text; } }

async function importModels(fileList) {
  const files = [...fileList], cdm = files.filter(f => /\.cdm\.json$/i.test(f.name));
  if (!cdm.length) {
    flash(files.some(f => /\.skp$/i.test(f.name)) ? 'That folder has SketchUp files but no exported models yet. Run Extensions > Export models for Cabinet Designer in SketchUp on it first.' : 'There are no exported models in that folder.');
    return;
  }
  try { await mdbOpen(); } catch (_) { flash('This browser can\'t store models.'); return; }
  // Models by file name; the key is the path inside "CD Models", so two libraries can each have a "Sink.skp".
  const keyOf = f => { const r = relOf(f), i = r.toLowerCase().indexOf('cd models/'); return (i >= 0 ? r.slice(i + 10) : r).replace(/\.cdm\.json$/i, '').toLowerCase(); };
  const byName = {};
  cdm.forEach(f => { const k = keyOf(f), b = baseOf(k); (byName[b] || (byName[b] = [])).push({ f, k }); });
  const pickModel = (skp, mozRel) => {
    const c = byName[skp.replace(/\.skp$/i, '').toLowerCase()]; if (!c) return null;
    const want = dirOf(mozRel.split('/').slice(1).join('/')).toLowerCase();
    return c.find(x => dirOf(x.k) === want) || c.find(x => want.endsWith(dirOf(x.k)) || dirOf(x.k).endsWith(want)) || c[0];
  };
  // Mozaik products, each filed under its library's folder tree.
  modelProg('Reading the Mozaik products…');
  const ndx = {};
  for (const f of files.filter(f => /(^|\/)library\.ndx$/i.test(relOf(f)))) { try { ndx[dirOf(relOf(f))] = { lib: baseOf(dirOf(relOf(f))), map: ndxFolders(await f.text()) }; } catch (_) {} }
  const items = [], used = new Set();
  let noModel = 0;
  for (const f of files.filter(f => /\.moz$/i.test(f.name))) {
    const rel = relOf(f), libDir = dirOf(dirOf(rel)), lib = ndx[libDir] || ndx[dirOf(rel)];
    let tag = '';
    try { const t = await f.text(), m = t.match(/<Product\b[^>]*>/); tag = m ? m[0] : ''; } catch (_) {}
    if (!tag) continue;
    // Mozaik's tree lists a product by its file name. A .moz the tree doesn't list is an old leftover Mozaik doesn't show.
    const name = f.name.replace(/\.moz$/i, '').trim() || xmlAttr(tag, 'ProdName').trim(), skp = xmlAttr(tag, 'SketchUpFile');
    if (lib && !(name in lib.map)) continue;
    const mdl = skp && xmlAttr(tag, 'UseSUModel') !== '0' && pickModel(skp, rel);
    if (!mdl) { noModel++; continue; }
    used.add(mdl.k);
    const folder = (lib && lib.map[name]) || '', kind = modelKind(folder, name), mm = v => r3((parseFloat(v) || 0) / 25.4);
    const w = mm(xmlAttr(tag, 'Width')), h = mm(xmlAttr(tag, 'Height')), d = mm(xmlAttr(tag, 'Depth'));
    let elev = mm(xmlAttr(tag, 'Elev'));
    if (kind === 'window' && !elev) elev = r3(Math.max(0, 84 - h));
    const libName = (lib && lib.lib) || baseOf(libDir) || 'Mozaik';
    items.push({ id: 'mdl-' + hashStr(libName + '/' + name), kind, lib: libName, folder: showFolder(folder || dirOf(mdl.k)), path: folder || 'Other', name, w: w || 24, h: h || 24, d: kind === 'door' || kind === 'window' ? 0 : d || 24, elev, model: mdl.k });
  }
  // Models no Mozaik product points at come in under their own file name, except the extra graphics inside a
  // Mozaik library (its Products and CustomParts folders), which are only there for the products above.
  const loose = cdm.map(f => ({ f, k: keyOf(f) })).filter(x => !used.has(x.k) && !/(^|\/)(products|customparts)(\/|$)/.test(dirOf(x.k)));
  const todo = cdm.filter(f => used.has(keyOf(f)) || loose.some(x => x.f === f));
  // Geometry, a batch at a time so a thousand files don't sit in memory together.
  const boxes = {}, pics = new Map(files.filter(f => /\.(jpe?g|png)$/i.test(f.name)).map(f => [relOf(f).toLowerCase(), f]));
  let done = 0, bad = 0;
  for (let i = 0; i < todo.length; i += 25) {
    const batch = [];
    for (const f of todo.slice(i, i + 25)) {
      try {
        const j = JSON.parse(await f.text());
        // A textured material names its picture beside the model file ("<model>.tex/0.jpg"); the picture is stored with it.
        const here = dirOf(relOf(f));
        const g = { box: j.box, e: Array.isArray(j.e) && j.e.length ? Float32Array.from(j.e) : null, mats: (j.mats || []).map(m => {
          const tf = m.t && Array.isArray(m.u) ? pics.get((here + '/' + m.t).toLowerCase()) : null;
          return { c: m.c || '#cccccc', o: +m.o || 1, p: Float32Array.from(m.p), i: Uint32Array.from(m.i), ...(tf ? { u: Float32Array.from(m.u), tex: tf.slice(0, tf.size, tf.type || (/\.png$/i.test(tf.name) ? 'image/png' : 'image/jpeg')) } : {}) };
        }) };
        if (!g.mats.length || !Array.isArray(g.box)) { bad++; continue; }
        const k = keyOf(f); batch.push([k, g]); boxes[k] = g.box;
      } catch (_) { bad++; }
    }
    try { await mdb('geo', 'readwrite', s => { batch.forEach(([k, g]) => s.put(g, k)); }); } catch (_) { flash('Ran out of room to store the models.'); break; }
    batch.forEach(([k]) => { delete modelGeo[k]; delete modelTpl[k]; });
    done += batch.length; modelProg(`Importing models: ${done} of ${todo.length}`);
  }
  loose.forEach(({ f, k }) => {
    const b = boxes[k]; if (!b) return;
    const r = relOf(f), i = r.toLowerCase().indexOf('cd models/'), name = baseOf(r).replace(/\.cdm\.json$/i, ''), folder = dirOf(i >= 0 ? r.slice(i + 10) : r) || 'SketchUp models', kind = modelKind(folder, name);
    items.push({ id: 'mdl-' + hashStr('file/' + k), kind, lib: 'SketchUp models', folder: showFolder(folder), path: folder, name, w: r3(b[3] - b[0]), h: r3(b[5] - b[2]), d: kind === 'door' || kind === 'window' ? 0 : r3(b[4] - b[1]), elev: 0, model: k });
  });
  items.forEach(it => { const b = boxes[it.model]; if (b) it.md = r3(b[4] - b[1]); });
  const kept = items.filter(it => boxes[it.model]), ids = new Set(kept.map(x => x.id));
  // Importing a library again replaces it whole: its old items and their stored models go, so nothing from an
  // earlier export lingers.
  const libsNew = new Set(kept.map(x => x.lib));
  const keepKeys = new Set(kept.map(x => x.model).concat(MODEL_LIB.filter(x => !libsNew.has(x.lib)).map(x => x.model)));
  const dropKeys = [...new Set(MODEL_LIB.filter(x => libsNew.has(x.lib)).map(x => x.model))].filter(k => !keepKeys.has(k));
  if (dropKeys.length) { try { await mdb('geo', 'readwrite', s => { dropKeys.forEach(k => s.delete(k)); }); } catch (_) {} dropKeys.forEach(k => { delete modelGeo[k]; delete modelTpl[k]; }); }
  MODEL_LIB = MODEL_LIB.filter(x => !libsNew.has(x.lib)).concat(kept).sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  try { await saveModelLib(); } catch (_) { flash('Could not save the model list.'); }
  modelProg('');
  // Show the library just brought in.
  const libsIn = [...new Set(kept.map(x => x.lib))]; if (libsIn.length) ui.libView = libsIn.includes(ui.libView) ? ui.libView : libsIn[0];
  renderSources();
  flash(`Imported ${kept.length} model${kept.length === 1 ? '' : 's'}${noModel ? `. ${noModel} Mozaik product${noModel === 1 ? ' has' : 's have'} no 3D model` : ''}${bad ? `. ${bad} file${bad === 1 ? '' : 's'} could not be read` : ''}.`);
}
function pickModelFolder() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true; inp.webkitdirectory = true;
  inp.onchange = () => { if (inp.files && inp.files.length) importModels(inp.files); };
  inp.click();
}
async function removeModels(ids) {
  const gone = MODEL_LIB.filter(x => ids.includes(x.id)), keep = MODEL_LIB.filter(x => !ids.includes(x.id));
  const still = new Set(keep.map(x => x.model)), drop = [...new Set(gone.map(x => x.model))].filter(k => !still.has(k));
  MODEL_LIB = keep;
  try { await saveModelLib(); await mdb('geo', 'readwrite', s => { drop.forEach(k => s.delete(k)); }); } catch (_) {}
  drop.forEach(k => { delete modelGeo[k]; delete modelTpl[k]; });
  renderSources();
}

loadModelLib().then(() => { try { const v = localStorage.getItem(KEY + '.libView'); if (v && MODEL_LIB.some(x => x.lib === v)) ui.libView = v; } catch (_) {} if (MODEL_LIB.length && typeof renderSources === 'function') try { renderSources(); } catch (_) {} });
