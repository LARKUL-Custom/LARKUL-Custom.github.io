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
// Smooths the shade in two passes (across, then up and down), 8 taps each; taps on a surface at another depth are skipped so the shade stays sharp at edges. The second pass
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
  for (int i = -4; i <= 3; i++) {
    vec2 uv = vUv + float(i) * dir;
    // Only taps on the same face count: same depth and facing the same way (eased edges don't smear onto faces).
    float a = texture2D(tAO, uv).x, wd = abs(lin(uv) - z0) < tol ? 1.0 : 0.02, w = wd * (dot(texture2D(tNormal, uv).xyz * 2.0 - 1.0, n0) > 0.9 ? 1.0 : 0.02);
    sum += a * w; wsum += w; dsum += a * wd; dw += wd;
  }
  // A pixel with hardly any neighbours on its face (an eased edge seen from afar) takes the plain depth blur instead,
  // so thin edges don't come out as dotted lines.
  gl_FragColor = vec4(vec3(wsum > 2.5 ? sum / wsum : dsum / dw), 1.0);
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
    uniforms: { tDepth: { value: null }, tNormal: { value: null }, invProj: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, size: { value: new THREE.Vector2() }, radius: { value: 4 }, strength: { value: 1.6 } },
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
    if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.transparent || m.depthWrite === false || m.colorWrite === false || m.visible === false) { hide.push(o); o.visible = false; } }
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
    S.shade.uniforms.radius.value = cam.isOrthographicCamera ? Math.max(4, (cam.top - cam.bottom) / cam.zoom / 60) : 3;
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
