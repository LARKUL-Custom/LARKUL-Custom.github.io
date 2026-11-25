/* ---------- Realistic look: corner shading (ambient occlusion) ----------
   After the picture is drawn, the room is drawn once more at half size as plain normals and depth. A small shader
   darkens every spot that has things close around it (inside corners, under wall cabinets, the toe kick, between
   doors), and that shade is laid over the picture. Look only: nothing here touches what is built or cut. */
'use strict';
const AO = { on: true };
// Phones and tablets take fewer samples so turning the view stays smooth.
const aoCoarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } };
const AO_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Shade from depth and normals: spiral samples within `radius` inches around each point (the SAO way).
const AO_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth; uniform sampler2D tNormal;
uniform mat4 invProj; uniform mat4 proj; uniform vec2 size; uniform float radius; uniform float strength;
#define SAMPLES __N__
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = invProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
  // How many pixels the radius covers at this depth.
  vec4 e = proj * vec4(P + vec3(radius, 0.0, 0.0), 1.0); vec4 c = proj * vec4(P, 1.0);
  float rpx = clamp(abs(e.x / e.w - c.x / c.w) * 0.5 * size.x, 3.0, 90.0);
  // Every pixel uses the same spiral (no random turn), so flat faces come out clean, not grainy.
  float a0 = 0.0, occ = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float ang = a0 + float(i) * 2.39996;
    // Snapped to a pixel centre, so the depth read belongs to the exact spot the position is worked out for.
    vec2 uv = (floor((vUv * size) + vec2(cos(ang), sin(ang)) * max(t * rpx, 1.5)) + 0.5) / size;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
    vec3 v = viewPos(uv) - P;
    float vv = dot(v, v), vn = dot(v, N);
    // Closer and more in front of the surface shades more; far things fade out so edges don't halo.
    float f = max(1.0 - vv / (radius * radius), 0.0);
    occ += f * max(vn / sqrt(vv + 0.01) - 0.08, 0.0);
  }
  occ = clamp(occ * 2.0 * strength / float(SAMPLES), 0.0, 1.0);
  gl_FragColor = vec4(vec3(1.0 - occ), 1.0);
}`;
// Smooths the shade in two passes (across, then up and down), 5 taps each so door details stay crisp; taps on a surface at another depth are skipped so the shade stays sharp at edges. The second pass
// multiplies it over the picture.
const AO_BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO; uniform sampler2D tDepth; uniform sampler2D tNormal; uniform vec2 dir; uniform mat4 invProj;
float lin(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = invProj * vec4(0.0, 0.0, d * 2.0 - 1.0, 1.0); return -p.z / p.w; }
void main() {
  float z0 = lin(vUv), tol = 0.12 + 0.002 * z0, sum = 0.0, wsum = 0.0, dsum = 0.0, dw = 0.0;
  vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  // A one or two pixel wide crack (a door gap seen from afar) gets no shade of its own: depth catches it only here and
  // there, which would draw it as a dashed line.
  float zl = min(lin(vUv - dir), lin(vUv - 2.0 * dir)), zr = min(lin(vUv + dir), lin(vUv + 2.0 * dir));
  if (zl < z0 - tol && zr < z0 - tol) { gl_FragColor = vec4(1.0); return; }
  for (int i = -2; i <= 2; i++) {
    vec2 uv = vUv + float(i) * dir;
    // Only taps on the same face count: same depth and facing the same way (eased edges don't smear onto faces).
    float a = texture2D(tAO, uv).x, wd = abs(lin(uv) - z0) < tol ? 1.0 : 0.02, w = wd * (dot(texture2D(tNormal, uv).xyz * 2.0 - 1.0, n0) > 0.9 ? 1.0 : 0.02);
    sum += a * w; wsum += w; dsum += a * wd; dw += wd;
  }
  // A pixel with hardly any neighbours on its face (an eased edge seen from afar) takes the plain depth blur instead,
  // so thin edges don't come out as dotted lines.
  gl_FragColor = vec4(vec3(wsum > 1.5 ? sum / wsum : dsum / dw), 1.0);
}`;
function aoSetup(v) {
  if (v.aoS) return v.aoS;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = m => { const s = new THREE.Scene(), me = new THREE.Mesh(tri, m); me.frustumCulled = false; s.add(me); return s; };
  const shade = new THREE.ShaderMaterial({
    vertexShader: AO_VERT, fragmentShader: AO_FRAG.replace('__N__', aoCoarse() ? '10' : '16'), depthTest: false, depthWrite: false,
    uniforms: { tDepth: { value: null }, tNormal: { value: null }, invProj: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, size: { value: new THREE.Vector2() }, radius: { value: 2.5 }, strength: { value: 1.3 } },
  });
  const blur = () => new THREE.ShaderMaterial({
    vertexShader: AO_VERT, fragmentShader: AO_BLUR, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    uniforms: { tAO: { value: null }, tDepth: { value: null }, tNormal: { value: null }, dir: { value: new THREE.Vector2() }, invProj: { value: new THREE.Matrix4() } },
  });
  const blurX = blur(), mix = blur();
  // dst = dst * src: the shade only ever darkens the picture.
  Object.assign(mix, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor });
  const normal = new THREE.MeshNormalMaterial();
  return (v.aoS = { cam, shade, blurX, mix, normal, shadeScene: quad(shade), blurScene: quad(blurX), mixScene: quad(mix), w: 0, h: 0 });
}
function aoTargets(S, w, h) {
  if (S.w === w && S.h === h) return;
  if (S.nt) { S.nt.depthTexture.dispose(); S.nt.dispose(); S.at.dispose(); S.bt.dispose(); }
  const dt = new THREE.DepthTexture(w, h); dt.type = THREE.FloatType;
  S.nt = new THREE.WebGLRenderTarget(w, h, { depthTexture: dt, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  S.at = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  S.bt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  S.w = w; S.h = h;
}
// Called by Viewer3D.draw() right after the picture is drawn, only in the realistic look.
function realAO(v) {
  if (!AO.on) return;
  const r = v.renderer, S = aoSetup(v), sz = r.getDrawingBufferSize(new THREE.Vector2());
  // Full size on a computer; half size on phones and tablets (and very big pictures) for speed.
  const k = aoCoarse() || sz.x * sz.y > 5e6 ? 2 : 1, w = Math.max(1, Math.round(sz.x / k)), h = Math.max(1, Math.round(sz.y / k));
  aoTargets(S, w, h);
  // Only solid things shade: glass, glows, light washes, labels and lines stay out of the shade picture.
  const hide = [];
  v.scene.traverse(o => {
    if (!o.visible) return;
    if (o.isSprite || o.isLine || o.isLineSegments || o.isPoints || o.isLight) { if (!o.isLight) { hide.push(o); o.visible = false; } return; }
    if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || o.userData.noAO || m.transparent || m.depthWrite === false || m.colorWrite === false || m.visible === false) { hide.push(o); o.visible = false; } }
  });
  const keep = { bg: v.scene.background, ov: v.scene.overrideMaterial, tm: r.toneMapping, sh: r.shadowMap.autoUpdate, ac: r.autoClear, cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha() };
  try {
    v.scene.background = null; v.scene.overrideMaterial = S.normal; r.toneMapping = THREE.NoToneMapping; r.shadowMap.autoUpdate = false;
    r.setClearColor(0x8080ff, 1); r.setRenderTarget(S.nt); r.clear(); r.render(v.scene, v.cam);
    const cam = v.cam;
    S.shade.uniforms.tDepth.value = S.nt.depthTexture; S.shade.uniforms.tNormal.value = S.nt.texture;
    S.shade.uniforms.proj.value.copy(cam.projectionMatrix); S.shade.uniforms.invProj.value.copy(cam.projectionMatrixInverse);
    S.shade.uniforms.size.value.set(w, h);
    // Radius grows a little with the room so whole-room views still read, but stays near a hand's width.
    S.shade.uniforms.radius.value = cam.isOrthographicCamera ? Math.max(4, (cam.top - cam.bottom) / cam.zoom / 60) : 2.5;
    r.setRenderTarget(S.at); r.render(S.shadeScene, S.cam);
    const B = S.blurX.uniforms, M = S.mix.uniforms;
    B.tAO.value = S.at.texture; B.tDepth.value = S.nt.depthTexture; B.tNormal.value = S.nt.texture; B.dir.value.set(1 / w, 0); B.invProj.value.copy(cam.projectionMatrixInverse);
    r.setRenderTarget(S.bt); r.render(S.blurScene, S.cam);
    M.tAO.value = S.bt.texture; M.tDepth.value = S.nt.depthTexture; M.tNormal.value = S.nt.texture; M.dir.value.set(0, 1 / h); M.invProj.value.copy(cam.projectionMatrixInverse);
    r.setRenderTarget(null); r.autoClear = false; S.mix.blending = AO.debug ? THREE.NoBlending : THREE.CustomBlending; r.render(S.mixScene, S.cam);
  } finally {
    v.scene.background = keep.bg; v.scene.overrideMaterial = keep.ov; r.toneMapping = keep.tm; r.shadowMap.autoUpdate = keep.sh; r.autoClear = keep.ac;
    r.setClearColor(keep.cc, keep.ca); r.setRenderTarget(null);
    hide.forEach(o => { o.visible = true; });
  }
}

/* ---------- Realistic look: eased edges ----------
   Real parts have slightly eased edges that catch the light. In the realistic look a box gets a small round edge
   (about 1/16"), drawn only: its size and place are the same as the plain box. UVs stay in world inches. */
function bevelBox3(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const half = [w / 2, h / 2, d / 2], hi = half.map(a => a - r);
  // The two inner grid lines (at a sixth) move out to where the round starts.
  const at = (v, a) => Math.abs(Math.abs(v) - half[a] / 3) < 1e-6 * (half[a] + 1) ? Math.sign(v) * hi[a] : v;
  const p = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    p[0] = at(pos.getX(i), 0); p[1] = at(pos.getY(i), 1); p[2] = at(pos.getZ(i), 2);
    const q = p.map((v, a) => Math.max(-hi[a], Math.min(hi[a], v))), o = p.map((v, a) => v - q[a]), L = Math.hypot(o[0], o[1], o[2]) || 1;
    pos.setXYZ(i, q[0] + o[0] / L * r, q[1] + o[1] / L * r, q[2] + o[2] / L * r);
    nor.setXYZ(i, o[0] / L, o[1] / L, o[2] / L);
  }
  // Same for the UVs of each face, whose u and v run along these face sizes (BoxGeometry's face order).
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], per = uv.count / 6;
  const ut = (t, L) => Math.abs(t - 1 / 3) < 1e-4 ? r / L : Math.abs(t - 2 / 3) < 1e-4 ? 1 - r / L : t;
  for (let f = 0; f < 6; f++) for (let i = 0; i < per; i++) { const j = f * per + i; uv.setXY(j, ut(uv.getX(j), dims[f][0]), ut(uv.getY(j), dims[f][1])); }
  return g;
}

/* ---------- Realistic look: light from the real sources ----------
   The sun stands where it would at the chosen time of day (plan top = north) and only gets in where nothing blocks it:
   walls and the ceiling cast shadows, so daylight comes through windows, door openings and open sides of the room.
   The room's own ceiling lights and LED strips stay lit (lights.js); at night they are what lights the room. The sky
   and the light bounced around the room fade with the sun. */
const SUN = { hour: 15 };
try { const h = parseFloat(localStorage.getItem('cabinet-designer.v2.sunhour')); if (h >= 5 && h <= 22) SUN.hour = h; } catch (_) {}
const sunLabel = h => { const m = Math.round(h * 60), hh = Math.floor(m / 60) % 24, mm = m % 60; return `${(hh + 11) % 12 + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
// Sun position for an hour of the day: rises in the east at 6, highest (60°) in the south at 1 PM, sets in the west at 20.
function sunAt(h) {
  const t = (h - 6) / 14, el = Math.sin(Math.PI * Math.max(0, Math.min(1, t))) * 60 * Math.PI / 180, az = (90 + 180 * t) * Math.PI / 180;
  const up = t > 0 && t < 1 ? Math.sin(el) : -0.2;
  // x east, y up, z south (plan y runs down the page).
  return { dir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.max(up, 0.02), -Math.cos(az) * Math.cos(el)).normalize(), day: Math.max(0, Math.min(1, (h - 5.5) / 1.5, (20.5 - h) / 1.5)), low: Math.max(0, 1 - el / (25 * Math.PI / 180)) };
}
const mixHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k)));
function realLight(v) {
  const S0 = sunAt(SUN.hour), d = S0.day, hasLamps = typeof roomLights === 'function' && (roomLights().some(l => l.kind === 'ceiling') || (typeof AUTO_CEIL === 'object' && AUTO_CEIL.n > 0));
  v.sunDir = S0.dir;
  // Sun: warm and orange when low, white at midday, gone at night.
  v.sun.intensity = 2.4 * d; v.sun.castShadow = d > 0.01; v.sun.color.copy(mixHex(0xfff3e2, 0xffa860, S0.low));
  // Sky and bounce: bright in the day, a dim blue at night.
  v.hemi.intensity = hasLamps ? 0.12 + 0.26 * d : 0.14 + 0.42 * d; v.hemi.color.copy(mixHex(0x5a6a90, 0xeef2ff, d)); v.hemi.groundColor.copy(mixHex(0x2a2a30, 0xb39b7e, d));
  // A soft light from overhead stands in for room lighting when the room has no ceiling lights drawn.
  v.fill.intensity = hasLamps ? 0.05 + 0.1 * d : 0.18 + 0.12 * d; v.fill.color.set(0xfff4e8);
  v.fill.position.set(0, 1, 0.25); v.fill.target.position.set(0, 0, 0);
  v.renderer.toneMappingExposure = hasLamps ? 0.72 + 0.1 * d : 0.75 + 0.2 * d;
  if (typeof realCeil3 === 'function') realCeil3().emissive.copy(mixHex(0x141418, hasLamps ? 0x2a2927 : 0x5a5854, d));
  // 0.63.52 (Ayden 2026-11-25: "look at how bright and like hard to see it is"): ceiling cans on in daylight used to add
  // their full night strength on top of the sun and sky, washing the room out. Their light and bounce now ease off as
  // the daylight comes up (cans still show by day, softer), and the exposure is a little lower when cans are on.
  v.root.traverse(o => { const u = o.userData; if (!o.isLight || !u.puck || u.k0 === undefined) return;
    const k = u.k0 * (o.isAmbientLight ? 1 - 0.75 * d : 1 - 0.5 * d); if (u.lit0 !== undefined) u.lit0 = k; if (!(typeof WALK === 'object' && WALK.darkOn)) o.intensity = k; });
  v.envK = 0.25 + 0.75 * d;
  // Only through windows (Lights tab): no fill from overhead, almost no sky everywhere, a dark ceiling, and the sky
  // light at each window (windowSky3 in lights.js) follows the daylight. The sun still comes in where walls let it.
  if (typeof lay === 'function' && lay().winOnly) {
    v.hemi.intensity = 0; v.hemi.color.set(0xf4efe6); v.hemi.groundColor.set(0xb8a894); v.fill.intensity = 0;
    v.renderer.toneMappingExposure = 1.05;
    if (typeof realCeil3 === 'function') realCeil3().emissive.set(0x000000);
    v.envK = 0;
    v.root.traverse(o => { if (o.isSpotLight && o.userData.winSky) o.intensity = o.userData.winSky * 3.2 * d; if (o.isPointLight && o.userData.winBounce) o.intensity = o.userData.winBounce * d; });
  }
  v.scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
    if (!m || !m.isMeshStandardMaterial) return;
    if (m.userData.env0 === undefined) m.userData.env0 = m.envMapIntensity;
    m.envMapIntensity = m.userData.env0 * v.envK;
  }); });
  v.setBackground('#' + mixHex(0x1c2233, 0xe4e1db, d).getHexString());
  // 0.63.48: the sky and far hills of a landscape outside follow the time of day too (landscape.js).
  if (typeof landSun === 'function') landSun(v, S0);
}
// The small time of day slider beside Realistic.
function sunSet(h) {
  SUN.hour = h; try { localStorage.setItem('cabinet-designer.v2.sunhour', String(h)); } catch (_) {}
  const l = document.getElementById('sunlbl'); if (l) l.textContent = sunLabel(h);
  viewers.forEach(v => { if (v.ok && v.real) { v.fitShadow(); v.requestRender(); } });
}
document.addEventListener('input', e => { if (e.target && e.target.id === 'sunhour') sunSet(+e.target.value); });
