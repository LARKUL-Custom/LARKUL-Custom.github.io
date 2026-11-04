/* ---------- Mozaik products (fillers, C mold, hoods, mitre fold shelves) ----------
   Ayden's own Mozaik library products, brought in part for part: every part's outline, notches, grooves, holes,
   tool paths and pockets come straight from his .moz files, with Mozaik's own formulas, so a product worked out at
   any size gives the parts Mozaik would. The library data is in js/mozlib.js (MOZ_LIB); a placed product is a
   cabinet with c.moz = the product's key.
   Mozaik works in mm with X across the product from its left, Y from the front to the back and Z up from the floor.
   A part is drawn with its length along x, its width along y and its thickness along z, then turned by its three
   angles (each about the product's own X, Y or Z axis, in order) and moved to its X, Y, Z. */
'use strict';

/* ----- Reading Mozaik files ----- */
// A small XML reader for Mozaik's files: { tag, a: attributes, k: children }.
function mozXml(text) {
  const s = String(text), i0 = s.indexOf('<?xml'), src = i0 >= 0 ? s.slice(i0) : s;
  const ent = v => v.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e.toLowerCase()] ?? (e[1].toLowerCase() === 'x' ? String.fromCharCode(parseInt(e.slice(2), 16)) : String.fromCharCode(+e.slice(1))));
  const root = { tag: '#root', a: {}, k: [] }, stack = [root], re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src))) {
    if (!m[2]) continue;
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const el = { tag: m[2], a: {}, k: [] }, ar = /([\w:.-]+)\s*=\s*"([^"]*)"/g; let q;
    while ((q = ar.exec(m[3]))) el.a[q[1]] = ent(q[2]);
    stack[stack.length - 1].k.push(el);
    if (!m[4]) stack.push(el);
  }
  return root.k[0] || null;
}
const mozKid = (el, tag) => (el && el.k.find(k => k.tag === tag)) || null;
const mozKids = (el, tag) => (el ? el.k.filter(k => k.tag === tag) : []);

// A library's parameters.dat: name, description, value, ..., in blocks of 17 lines.
function mozParseParams(text) {
  const L = String(text).replace(/\r/g, '').split('\n'), out = {};
  let i = 5; const nc = parseInt(L[i], 10); if (!(nc >= 0)) return out; i += 1 + nc * 2;
  const n = parseInt(L[i], 10); i++;
  for (let k = 0; k < n && i + 2 < L.length; k++, i += 17) { const v = parseFloat(L[i + 2]); if (L[i] && isFinite(v)) out[L[i]] = v; }
  return out;
}

// One .moz product into the library format (all mm; formulas kept as written).
// Each number is stored as [value, formula] when it has a formula, else as the plain value.
function mozParseProduct(text, lib) {
  const r = mozXml(text); if (!r || r.tag !== 'Product') return null;
  const A = r.a, num = v => { const x = parseFloat(v); return isFinite(x) ? Math.round(x * 1e5) / 1e5 : 0; };
  const nv = (v, e) => (e && e.trim() ? [num(v), e.trim()] : num(v));
  const pt = r.k.find(k => k.tag === 'ProductType') || { a: {} };
  const shape = sh => {
    if (!sh) return { t: 1, p: [] };
    return { t: +sh.a.Type || 0, p: mozKids(sh, 'ShapePoint').map(p => ({ x: nv(p.a.X, p.a.X_Eq), y: nv(p.a.Y, p.a.Y_Eq), k: +p.a.PtType || 0, d: nv(p.a.Data, p.a.Data_Eq), ...(+p.a.EBand ? { eb: 1 } : {}) })) };
  };
  const nodes = o => mozKids(o, 'OperationToolPathNode').map(n => ({ x: nv(n.a.X, n.a.X_Eq), y: nv(n.a.Y, n.a.Y_Eq), k: +n.a.PtType || 0, d: nv(n.a.Data, n.a.Data_Eq), ...(+n.a.DepthOR > -9000 ? { dz: num(n.a.DepthOR) } : {}) }));
  const op = o => {
    const a = o.a, base = { x: nv(a.X, a.X_Eq), y: nv(a.Y, a.Y_Eq), dp: nv(a.Depth, a.Depth_Eq), hide: nv(a.Hide === 'True' ? 1 : 0, a.Hide_Eq), ...(a.FlipSideOp === 'True' ? { flip: 1 } : {}), ...(a.IsUserOp === 'False' ? { auto: 1 } : {}) };
    if (o.tag === 'OperationGroove') return { t: 'groove', ...base, w: nv(a.Width, a.W_Eq), len: nv(a.Len, a.L_Eq), ang: nv(a.Ang, a.Ang_Eq) };
    if (o.tag === 'OperationHole') return { t: 'hole', ...base, dia: nv(a.Diameter, a.Diameter_Eq) };
    if (o.tag === 'OperationLineBore') return { t: 'linebore', ...base, dia: nv(a.Diameter, a.Diameter_Eq), n: nv(a.Quan, a.Quan_Eq), ang: nv(a.Ang, a.Ang_Eq) };
    if (o.tag === 'OperationToolPath') return { t: 'path', ...base, closed: a.ClosedShape === 'True' ? 1 : 0, tool: +a.ToolID, ...(+a.ToolGroupID > 0 ? { tg: +a.ToolGroupID } : {}), ...(+a.DecorativeProfileID > 0 ? { prof: +a.DecorativeProfileID } : {}), pts: nodes(o) };
    if (o.tag === 'OperationPocket') return { t: 'pocket', ...base, tool: +a.PocketingToolID, pts: nodes(o) };
    return { t: 'other', tag: o.tag, ...base };
  };
  const parts = mozKids(mozKid(r, 'CabProdParts'), 'CabProdPart').map(p => {
    const a = p.a, ops = mozKid(p, 'PartOpsXml');
    return {
      n: (a.Name || '').trim(), t: (a.Type || '').toUpperCase(), lay: +a.Layer || 0, q: nv(a.Quan, a.Q_EQ),
      l: nv(a.L, a.L_EQ), w: nv(a.W, a.W_EQ), x: nv(a.X, a.X_EQ), y: nv(a.Y, a.Y_EQ), z: nv(a.Z, a.Z_EQ),
      a: [nv(a.A1, a.A1_EQ), nv(a.A2, a.A2_EQ), nv(a.A3, a.A3_EQ)], r: (a.R1 || '') + (a.R2 || '') + (a.R3 || ''),
      ...(a.Comment ? { note: a.Comment } : {}), sh: shape(mozKid(p, 'PartShapeXml')), ops: ops ? ops.k.map(op) : [],
    };
  });
  const prm = {}; mozKids(mozKid(r, 'CabProdParms'), 'CabProdParm').forEach(p => { prm[p.a.Name] = num(p.a.Value); });
  const top = mozKid(r, 'TopShapeXml');
  return {
    n: A.ProdName, lib: lib || A.SourceLib || '', desc: A.ProductDesc || '', W: num(A.Width), H: num(A.Height), D: num(A.Depth), elev: num(A.Elev),
    sub: +(pt.a.SubType || 0), ss: +(pt.a.SubSubType || 0), prm, parts,
    ...(top ? { top: mozKids(top, 'ShapePoint').map(p => [num(p.a.X), num(p.a.Y)]) } : {}),
  };
}

/* ----- Mozaik formulas ----- */
// "base | If cond Then Name= value | If ...": the base value, then each If that holds replaces it, in order.
// Numbers are mm; TOMM is 25.4. Angles in SQRT/COS/ATAN/ASIN are degrees, like Mozaik's.
const MOZ_FN = {
  sqrt: Math.sqrt, abs: Math.abs, int: Math.trunc, round: v => Math.round(v), min: Math.min, max: Math.max,
  sin: d => Math.sin(d * Math.PI / 180), cos: d => Math.cos(d * Math.PI / 180), tan: d => Math.tan(d * Math.PI / 180),
  asin: v => Math.asin(Math.max(-1, Math.min(1, v))) * 180 / Math.PI, acos: v => Math.acos(Math.max(-1, Math.min(1, v))) * 180 / Math.PI, atan: v => Math.atan(v) * 180 / Math.PI,
};
const mozExprCache = new Map();
function mozCompile(src) {
  let f = mozExprCache.get(src); if (f) return f;
  const s = src; let i = 0;
  const err = m => { throw new Error(m); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const kw = w => { ws(); const m = new RegExp('^' + w + '\\b', 'i').exec(s.slice(i)); if (m) { i += m[0].length; return true; } return false; };
  // Each piece returns a function of the name lookup.
  function primary() {
    ws(); const ch = s[i];
    if (ch === '(') { i++; const v = orx(); ws(); if (s[i] !== ')') err('Missing )'); i++; return v; }
    if (ch === '-') { i++; const v = power(); return e => -v(e); }
    if (ch === '+') { i++; return power(); }
    // A name may start with a digit, like Ayden's 1Fin.
    let m = /^\d+[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?/.exec(s.slice(i));
    if (!m || /^\d+e[+-]?\d+$/i.test(m[0])) {
      m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (m) { i += m[0].length; const v = parseFloat(m[0]); return () => v; }
    }
    m = m || /^[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length; const name = m[0].toLowerCase(); ws();
      if (s[i] === '(' && MOZ_FN[name]) {
        i++; const args = []; ws();
        if (s[i] !== ')') { args.push(orx()); ws(); while (s[i] === ',') { i++; args.push(orx()); ws(); } }
        if (s[i] !== ')') err('Missing )'); i++;
        const fn = MOZ_FN[name]; return e => fn(...args.map(a => a(e)));
      }
      return e => { const v = e(name); if (v === undefined || !isFinite(v)) err('Unknown name ' + m[0]); return v; };
    }
    err(ch === undefined ? 'Unfinished formula' : `Unexpected "${ch}"`);
  }
  function power() { const a = primary(); ws(); if (s[i] === '^') { i++; const b = power(); return e => Math.pow(a(e), b(e)); } return a; }
  function product() {
    let a = power();
    for (;;) { ws(); const c = s[i]; if (c === '*') { i++; if (s[i] === '*') i++; const l = a, b = power(); a = e => l(e) * b(e); } else if (c === '/') { i++; const l = a, b = power(); a = e => { const d = b(e); return d ? l(e) / d : 0; }; } else return a; }
  }
  // Mozaik works + - * / strictly left to right (h-(1.75*TOMM)/2 is (h - 1.75")/2), only brackets group.
  function chain() {
    let a = power();
    for (;;) {
      ws(); const c = s[i]; if (!'+-*/'.includes(c) || !c) return a;
      i++; ws(); if (s[i] === '*') i++; // a stray * after an operator (d-*(2*tomm), 5**TOMM) is skipped, as Mozaik does
      const l = a, b = power();
      a = c === '+' ? e => l(e) + b(e) : c === '-' ? e => l(e) - b(e) : c === '*' ? e => l(e) * b(e) : e => { const d = b(e); return d ? l(e) / d : 0; };
    }
  }
  function sum() {
    if (mozLtr) return chain();
    let a = product();
    for (;;) { ws(); const c = s[i]; if (c === '+') { i++; const l = a, b = product(); a = e => l(e) + b(e); } else if (c === '-') { i++; const l = a, b = product(); a = e => l(e) - b(e); } else return a; }
  }
  function compare() {
    const a = sum(); ws();
    const m = /^(<=|>=|<>|!=|==|=<|=>|<|>|=)/.exec(s.slice(i)); if (!m) return a;
    i += m[0].length; const b = sum(), op = m[0], E = 1e-4;
    return e => { const x = a(e), y = b(e); return (op === '<' ? x < y - E : op === '>' ? x > y + E : op === '<=' || op === '=<' ? x <= y + E : op === '>=' || op === '=>' ? x >= y - E : op === '<>' || op === '!=' ? Math.abs(x - y) > E : Math.abs(x - y) <= E) ? 1 : 0; };
  }
  function notx() { if (kw('not')) { const a = notx(); return e => (a(e) ? 0 : 1); } return compare(); }
  function andx() { let a = notx(); while (kw('and')) { const l = a, b = notx(); a = e => (l(e) && b(e) ? 1 : 0); } return a; }
  function orx() { let a = andx(); while (kw('or')) { const l = a, b = andx(); a = e => (l(e) || b(e) ? 1 : 0); } return a; }
  f = orx(); ws(); if (i < s.length) err(`Unexpected "${s[i]}"`);
  mozExprCache.set(src, f); return f;
}
// Works out a stored number: [value, formula] or a plain value. fb gives the value when there is no formula
// (or no base before the first If). bad(formula, message) hears about a formula that failed; its saved value is used.
let mozTrace = null, mozWhere = '', mozLtr = true, mozQuiet = false;
function mozVal(v, env, fb, bad) {
  if (mozTrace && Array.isArray(v) && !mozQuiet) { const r = mozVal0(v, env, fb, bad); mozTrace(v, r, mozWhere); return r; }
  return mozVal0(v, env, fb, bad);
}
function mozVal0(v, env, fb, bad) {
  if (!Array.isArray(v)) return fb ? fb(v) : v;
  const [saved, eq] = v, parts = String(eq).split('|');
  if (/^\s*If\b/i.test(parts[0])) parts.unshift('');
  try {
    let val = parts[0].trim() ? mozCompile(parts[0].trim())(env) : (fb ? fb(saved) : saved);
    for (let k = 1; k < parts.length; k++) {
      const st = parts[k].trim(); if (!st) continue;
      const m = /^If\s+([\s\S]+?)\s+Then\s+([^=]*?)=\s*([\s\S]*)$/i.exec(st);
      if (!m) throw new Error('Not a Mozaik If: ' + st);
      if (mozCompile(m[1])(env)) val = mozCompile(m[3].trim())(env);
    }
    return isFinite(val) ? val : saved;
  } catch (e) { if (bad) bad(eq, e.message); return saved; }
}

/* ----- Working out a product at a size ----- */
// The thickness a Mozaik part type is cut from in Ayden's Mozaik materials (mm); the program uses its own
// materials when it builds the parts (mozThick in the cabinet code).
const MOZ_TYPE_THICK = { UBACK: 19.05, FBACK: 19.05, METAL: 1.5875, DOORPANEL: 19.05 };
const mozGroup = t => /^(UBACK|FBACK)$/.test(t) ? 'back' : /^(DOOR|DOORFRAME|DOORPANEL|FRAME|PANELIZEDEND|FINSKIN|FINEXTERIOR|FININTERIOR|FEND|MOLDING|TOESKIN|FRAMELESSRAIL)$/.test(t) ? 'show' : t === 'METAL' ? 'metal' : 'box';

/* mozBuild(def, { W, H, D }, opts) → { parts: [...], warn: [...] }, all mm.
   opts.thick(type) gives a part type's thickness (mm); opts.prm adds or changes parameters; opts.libPrm is the
   library's parameters.dat. Each part: { name, type, group, qty, L, W, T, pos: {x,y,z}, ang: [a1,a2,a3], axes,
   outline: [{x,y}] (y up from the part's bottom edge), ops: [...] (x along the length, y up, mm) }. */
function mozBuild(def, size, opts = {}) {
  const warn = [], W = size.W, H = size.H, D = size.D;
  const thick = opts.thick || (t => MOZ_TYPE_THICK[t] || 19.05);
  const P = {}; Object.entries(opts.libPrm || {}).forEach(([k, v]) => { P[k.toLowerCase()] = v; });
  Object.entries(def.prm || {}).forEach(([k, v]) => { P[k.toLowerCase()] = v; });
  Object.entries(opts.prm || {}).forEach(([k, v]) => { if (isFinite(v)) P[k.toLowerCase()] = +v; });
  const types = new Set(def.parts.map(p => p.t));
  const base = { w: W, h: H, d: D, tomm: 25.4, mm: 1, width: W, height: H, depth: D, lethick: thick('FEND'), rethick: thick('FEND') };
  const thByName = n => { const m = /^(\w+)\.th$/.exec(n); return m ? thick(m[1].toUpperCase()) : undefined; };
  const envFor = own => n => own[n] !== undefined ? own[n] : base[n] !== undefined ? base[n] : P[n] !== undefined ? P[n] : thByName(n);
  // Without a formula, a size that was close to the product's width, height or depth follows it; a place past the
  // middle keeps its distance from the far side (like Mozaik's standard parts and the part editor's anchors).
  const follow = (v0, olds, news) => {
    let best = -1, bd = Infinity;
    olds.forEach((o, k) => { const dd = Math.abs(v0 - o); if (o > 0 && dd <= Math.max(1, o * 0.2) && dd < bd) { bd = dd; best = k; } });
    return best < 0 ? v0 : v0 + news[best] - olds[best];
  };
  const anchor = (v0, old, now) => (old > 0 && v0 > old / 2 + 1e-6 ? v0 + now - old : v0);
  const out = [];
  def.parts.forEach(p => {
    const name = p.n || p.t, bad = (eq, m) => warn.push(`${def.n} · ${name}: "${eq}" did not work (${m}); its saved value is used.`);
    const T = (opts.thickPart && opts.thickPart(p)) || thick(p.t), own = { partth: T, partt: T }; mozWhere = name;
    let env = envFor(own);
    const qty = Math.round(mozVal(p.q, env, null, bad));
    const l0 = Array.isArray(p.l) ? p.l[0] : p.l, w0 = Array.isArray(p.w) ? p.w[0] : p.w;
    // Length and width can name each other (PartW in a length), so each is worked out with the other's saved value first.
    const fol = v => follow(v, [def.W, def.H, def.D], [W, H, D]);
    own.partw = own.width = w0; own.partl = own.length = l0;
    let L = mozVal(p.l, env, fol, null); own.length = own.partl = L;
    const Wd = mozVal(p.w, env, fol, bad); own.width = own.partw = Wd;
    L = mozVal(p.l, env, fol, bad); own.length = own.partl = L;
    own.partlength = L; own.partwidth = Wd; own.partthickness = T;
    env = envFor(own);
    const pos = {
      x: mozVal(p.x, env, v => anchor(v, def.W, W), bad), y: mozVal(p.y, env, v => anchor(v, def.D, D), bad), z: mozVal(p.z, env, v => anchor(v, def.H, H), bad),
    };
    const ang = p.a.map(a => mozVal(a, env, null, bad));
    const X = v => mozVal(v, env, v0 => anchor(v0, l0, L), bad), Y = v => mozVal(v, env, v0 => anchor(v0, w0, Wd), bad);
    const pts = p.sh.t === 1 || p.sh.p.length < 3 ? [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: Wd }, { x: 0, y: Wd }]
      : p.sh.p.map(s => ({ x: X(s.x), y: Y(s.y), k: s.k, d: mozVal(s.d, env, null, bad) }));
    const outline = mozOutline(pts, true);
    const ops = [];
    p.ops.forEach((o, oi) => {
      mozWhere = name + ' op' + oi + ' ' + o.t;
      if (mozVal(o.hide, env, null, bad)) return;
      // A back side (flip) operation's formulas are written looking at the back, so a worked out y is turned
      // over (PartW - y) and a worked out angle reversed; saved numbers are already as the part is machined.
      const fy = o.flip ? v => { if (!Array.isArray(v)) return Y(v); mozQuiet = true; const r = Wd - Y(v); mozQuiet = false; if (mozTrace) mozTrace(v, r, mozWhere); return r; } : Y;
      const fa = v => { if (!o.flip || !Array.isArray(v)) return mozVal(v, env, null, bad); mozQuiet = true; const r = -mozVal(v, env, null, bad); mozQuiet = false; return r; };
      const face = o.flip ? 'bottom' : 'top', depth = mozVal(o.dp, env, null, bad), ox = X(o.x), oy = fy(o.y), id = oi;
      if (o.t === 'groove') {
        const len = mozVal(o.len, env, v0 => anchor(v0, Math.abs(Math.cos((Array.isArray(o.ang) ? o.ang[0] : o.ang) * Math.PI / 180)) > 0.5 ? l0 : w0, Math.abs(Math.cos((Array.isArray(o.ang) ? o.ang[0] : o.ang) * Math.PI / 180)) > 0.5 ? L : Wd), bad);
        const a = fa(o.ang) * Math.PI / 180, wd = mozVal(o.w, env, null, bad);
        if (!(len > 0) || !(wd > 0)) return;
        ops.push({ type: 'groove', x1: ox, y1: oy, x2: ox + Math.cos(a) * len, y2: oy + Math.sin(a) * len, width: wd, depth, face, id });
      } else if (o.t === 'hole') {
        ops.push({ type: 'bore', x: ox, y: oy, dia: mozVal(o.dia, env, null, bad), depth, face, id, ...(o.auto ? { auto: 1 } : {}) });
      } else if (o.t === 'linebore') {
        const n = Math.max(0, Math.round(mozVal(o.n, env, null, bad))), a = fa(o.ang) * Math.PI / 180, dia = mozVal(o.dia, env, null, bad);
        for (let k = 0; k < n; k++) ops.push({ type: 'bore', x: ox + Math.cos(a) * 32 * k, y: oy + Math.sin(a) * 32 * k, dia, depth, face, id, line: 1 });
      } else if (o.t === 'path' || o.t === 'pocket') {
        const np = o.pts.map(s => ({ x: ox + X(s.x), y: oy + fy(s.y) - (o.flip && Array.isArray(s.y) && Array.isArray(o.y) ? Wd : 0), k: s.k, d: mozVal(s.d, env, null, bad) }));
        if (np.length < 2) return;
        const closed = o.t === 'pocket' || !!o.closed;
        ops.push({ type: 'path', pts: mozOutline(np, closed), closed, pocket: o.t === 'pocket', depth, tool: o.tool, face, id, ...(o.tg ? { tg: o.tg } : {}), ...(o.prof ? { prof: o.prof } : {}) });
      } else warn.push(`${def.n} · ${name}: a Mozaik ${o.tag} operation isn't brought in yet.`);
    });
    out.push({ name, type: p.t, group: mozGroup(p.t), layer: p.lay, qty, L, W: Wd, T, pos, ang, axes: p.r, outline, ops, note: p.note || '' });
  });
  return { parts: out, warn };
}

// Points with Mozaik's point types into plain points: 1 rounds the corner at the point with radius Data, 2 bends
// the line to the next point into an arc that rises Data off the straight line (+ to the right of travel).
function mozOutline(pts, closed) {
  const n = pts.length, R = v => Math.round(v * 1e4) / 1e4;
  const corner = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i - 1 + n) % n], B = pts[(i + 1) % n];
    const ends = !closed && (i === 0 || i === n - 1);
    if (P.k !== 1 || !(P.d > 0) || ends) { corner.push([{ x: P.x, y: P.y }]); continue; }
    const la = Math.hypot(A.x - P.x, A.y - P.y), lb = Math.hypot(B.x - P.x, B.y - P.y);
    if (!la || !lb) { corner.push([{ x: P.x, y: P.y }]); continue; }
    const v1 = { x: (A.x - P.x) / la, y: (A.y - P.y) / la }, v2 = { x: (B.x - P.x) / lb, y: (B.y - P.y) / lb };
    const phi = Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y)));
    if (phi < 0.01 || phi > Math.PI - 0.01) { corner.push([{ x: P.x, y: P.y }]); continue; }
    let dd = P.d / Math.tan(phi / 2); dd = Math.min(dd, la, lb); const r = dd * Math.tan(phi / 2);
    const t1 = { x: P.x + v1.x * dd, y: P.y + v1.y * dd }, t2 = { x: P.x + v2.x * dd, y: P.y + v2.y * dd };
    const bx = v1.x + v2.x, by = v1.y + v2.y, bl = Math.hypot(bx, by) || 1, h = r / Math.sin(phi / 2);
    const C = { x: P.x + bx / bl * h, y: P.y + by / bl * h };
    const a0 = Math.atan2(t1.y - C.y, t1.x - C.x); let da = Math.atan2(t2.y - C.y, t2.x - C.x) - a0;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(da) / 0.12)), arc = [];
    for (let k = 0; k <= steps; k++) { const t = a0 + da * k / steps; arc.push({ x: C.x + r * Math.cos(t), y: C.y + r * Math.sin(t) }); }
    corner.push(arc);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(...corner[i]);
    const P = pts[i], Q = pts[(i + 1) % n];
    if (P.k === 2 && P.d && (closed || i < n - 1)) out.push(...mozArc(corner[i][corner[i].length - 1], corner[(i + 1) % n][0], P.d));
  }
  return out.map(p => ({ x: R(p.x), y: R(p.y) }));
}
// Arc from a to b rising s off the chord, + to the right of travel.
function mozArc(a, b, s) {
  const c = Math.hypot(b.x - a.x, b.y - a.y); if (!s || c < 1e-6) return [];
  const nx = (b.y - a.y) / c, ny = -(b.x - a.x) / c, as = Math.abs(s), sg = Math.sign(s);
  const R = (c * c / 4 + as * as) / (2 * as), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const C = { x: m.x - nx * sg * (R - as), y: m.y - ny * sg * (R - as) }, apex = { x: m.x + nx * s, y: m.y + ny * s };
  const a0 = Math.atan2(a.y - C.y, a.x - C.x), a1 = Math.atan2(b.y - C.y, b.x - C.x), am = Math.atan2(apex.y - C.y, apex.x - C.x);
  const wrap = v => { while (v <= -Math.PI) v += 2 * Math.PI; while (v > Math.PI) v -= 2 * Math.PI; return v; };
  let d = wrap(a1 - a0); const dm = wrap(am - a0);
  if (!(Math.sign(dm) === Math.sign(d) && Math.abs(dm) < Math.abs(d))) d -= 2 * Math.PI * Math.sign(d || 1);
  const n = Math.max(8, Math.ceil(Math.abs(d) / 0.08)), out = [];
  for (let k = 1; k < n; k++) { const t = a0 + d * k / n; out.push({ x: C.x + R * Math.cos(t), y: C.y + R * Math.sin(t) }); }
  return out;
}
// The 3×3 turn of a part: each angle about the product's own axis, in order (Mozaik's A1/R1, A2/R2, A3/R3).
function mozRot(ang, axes) {
  let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let k = 0; k < 3; k++) {
    const ax = (axes || '')[k], a = (ang[k] || 0) * Math.PI / 180; if (!ax || !a) continue;
    const c = Math.cos(a), s = Math.sin(a);
    const Rm = ax === 'X' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : ax === 'Y' ? [[c, 0, s], [0, 1, 0], [-s, 0, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
    M = Rm.map(row => [0, 1, 2].map(j => row[0] * M[0][j] + row[1] * M[1][j] + row[2] * M[2][j]));
  }
  return M;
}

/* ----- In Cabinet Designer ----- */
const mozDef = key => (typeof MOZ_LIB !== 'undefined' && key && MOZ_LIB.items.find(d => d.key === key)) || null;
const isMoz = c => !!(c && c.moz && mozDef(c.moz));
// Part kinds for the cut list, from Mozaik's part types.
const MOZ_KIND = { FEND: 'side', UEND: 'side', TOP: 'topbot', BOTTOM: 'topbot', STRETCHER: 'stretcher', NAILER: 'stretcher', CLEAT: 'stretcher', FRAMELESSRAIL: 'stretcher',
  UBACK: 'back', FBACK: 'back', PARTITION: 'divider', FIXEDSHELF: 'shelf', DOOR: 'door', DOORPANEL: 'door', DOORFRAME: 'frame', FRAME: 'frame', DRAWERSIDE: 'drawerBox', TOESKIN: 'toekick' };
const mozKind = t => MOZ_KIND[t] || 'filler';
// Each part is cut from the cabinet's material for its kind: show panels from the front material (like fillers),
// box parts from the carcass, backs from the back material. When Mozaik cut a part from a different thickness
// (1/4" back, 1" strapping), the sheet material closest to that thickness is used instead.
function mozMatFor(c, q) {
  const mt = cabMatT(cabSet(c, 'cabMatT')), cm = mat(mt.carcass) || S.materials[0];
  const g = mozGroup(q.t), m = g === 'back' ? mat(mt.back) || cm : g === 'show' ? mat(fillerMat(c)) || cm : cm;
  const want = (q.mt || 19.05) / 25.4;
  if (!m || Math.abs(m.thick - want) <= 0.06) return m;
  const near = S.materials.filter(x => x.kind === 'sheet' && Math.abs(x.thick - want) <= 0.06).sort((a, b) => Math.abs(a.thick - want) - Math.abs(b.thick - want));
  return near.find(x => x.color === m.color) || near[0] || m;
}
const mozCache = new Map();
// The product worked out at this cabinet's size, in mm, with each part's material. Cached by everything it reads.
function mozRun(c) {
  const def = mozDef(c.moz); if (!def) return null;
  const mats = def.parts.map(q => mozMatFor(c, q)), key = [c.moz, c.w, c.h, c.d, JSON.stringify(c.mozPrm || {}), mats.map(m => m && m.id + ':' + m.thick).join(',')].join('|');
  let r = mozCache.get(key); if (r) return r;
  const thByType = {}; def.parts.forEach((q, i) => { if (mats[i] && !(q.t in thByType)) thByType[q.t] = mats[i].thick * 25.4; });
  const prm = {}; Object.entries(c.mozPrm || {}).forEach(([k, v]) => { prm[k] = +v * 25.4; });
  r = mozBuild(def, { W: c.w * 25.4, H: c.h * 25.4, D: c.d * 25.4 }, {
    libPrm: MOZ_LIB.libs[def.lib] || {}, prm,
    thick: t => thByType[t] || (def.th && def.th[t]) || 19.05,
    thickPart: q => { const m = mats[def.parts.indexOf(q)]; return m ? m.thick * 25.4 : q.mt; },
  });
  r.mats = mats; r.def = def;
  if (mozCache.size > 200) mozCache.clear();
  mozCache.set(key, r); return r;
}
// Cut list parts: outline and every operation from Mozaik, in inches. The drawing's y runs up; operations measure
// y down from the top edge (L1), as the rest of the program does.
function mozBuildParts(c) {
  const r = mozRun(c), lbl = LBL[c.id] || c.name, parts = [], bom = {}, warn = r ? r.warn.slice(0, 6) : ['This Mozaik product is not in the library any more.'];
  if (!r) return { parts, bom, warn, fronts: [], inD: c.d, inW: c.w, removed: [] };
  const ptT = partTpl(cabSet(c, 'partT')), I = v => r3(v / 25.4), tools = typeof peTools === 'function' ? peTools() : [];
  r.parts.forEach((q, i) => {
    if (!(q.qty > 0)) return;
    if (q.group === 'metal') { const k = `${q.name} (metal, ${fmtLen(I(q.L))} × ${fmtLen(I(q.W))})`; bom[k] = (bom[k] || 0) + q.qty; return; }
    const m = r.mats[i] || S.materials[0], kind = mozKind(q.type), L = I(q.L), W = I(q.W), T = m.thick;
    const outline = q.outline.map(p => ({ x: I(p.x), y: I(p.y) }));
    const rect = outline.length === 4 && outline.every(p => (Math.abs(p.x) < 0.01 || Math.abs(p.x - L) < 0.01) && (Math.abs(p.y) < 0.01 || Math.abs(p.y - W) < 0.01));
    // Edge banding from Mozaik's banded edges: first edge along the bottom (L2), then the right end, top, left end.
    const tplBand = partBands(ptT, kind), eb = Object.values(tplBand).find(Boolean) || (S.edgebands[0] || {}).id || '';
    const def = r.def.parts[i], band = { L1: '', L2: '', W1: '', W2: '' };
    if (rect && def.sh.t !== 1) def.sh.p.forEach((p, k) => { if (p.eb && k < 4) band[['L2', 'W2', 'L1', 'W1'][k]] = eb; });
    const Y = y => r3(W - I(y)), why = 'Mozaik ' + (def.n || q.type), ops = [];
    q.ops.forEach(o => {
      const face = o.face, depth = I(o.depth), through = !(depth > 0 && depth < T - 0.001);
      if (o.type === 'bore') ops.push({ type: 'bore', x: I(o.x), y: Y(o.y), dia: I(o.dia), depth: through ? T : depth, through, face, why: why + ' hole' });
      else if (o.type === 'groove') ops.push({ type: 'groove', x1: I(o.x1), y1: Y(o.y1), x2: I(o.x2), y2: Y(o.y2), width: I(o.width), depth: through ? r3(T / 2) : depth, tool: 'flat bit', face, why: why + ' groove' });
      else if (o.type === 'path') {
        const tool = mozToolFor(o, tools);
        ops.push({ type: 'path', pts: o.pts.map(p => ({ x: I(p.x), y: Y(p.y) })), closed: o.closed, pocket: o.pocket, side: 'center', depth: through ? T : depth, through, tool, dia: r3(typeof peToolDia === 'function' ? peToolDia(tool) : 0.375), face, why: why + (o.pocket ? ' pocket' : ' tool path') + ` (Mozaik tool ${o.tool})`, passes: typeof pePassCount === 'function' ? pePassCount(tool, through ? T : depth) : 1, mozTool: o.tool,
          ...(o.pocket ? { pocketOpts: { style: 'raster', order: 'out-in', dir: '', stepover: 80 } } : {}) });
      }
    });
    const pt = { cab: lbl, cabId: c.id, name: q.name, kind, mat: m.id, L, W, T, qty: q.qty, grain: !!m.grain, band, edges: edgeSummary(kind, band), ops, moz: i };
    if (!rect) pt.outline = outline;
    if (q.note) pt.note = q.note;
    parts.push(pt);
  });
  if (c.addParts && c.addParts.length && typeof addedParts === 'function') addedParts(c, parts, warn, (name, m, L, Wd, o = {}) => { const q = { cab: lbl, cabId: c.id, name, kind: o.kind || '', mat: m.id, L, W: Wd, T: m.thick, qty: o.qty || 1, grain: !!m.grain, band: partBands(ptT, o.kind), edges: '', ops: o.ops || [] }; parts.push(q); return q; }, mat(cabMatT(cabSet(c, 'cabMatT')).carcass) || S.materials[0]);
  const removed = (c.partEdits && typeof applyPartEdits === 'function') ? applyPartEdits(c, parts, warn, ptT) : [];
  return { parts, bom, warn, fronts: [], inD: c.d, inW: c.w, removed };
}
// Mozaik's tool numbers (from Ayden's Mozaik machine setup) matched to this shop's CNC bits. Until they are
// matched, a tool path uses the CNC's usual straight bit; the Mozaik number stays on the operation.
const MOZ_TOOLS = {};
function mozToolFor(o, tools) { const t = MOZ_TOOLS[o.tool]; if (t) return t; return typeof peDefTool === 'function' ? peDefTool() : (tools[0] || {}).v || '3_8COMP'; }

// Each part's corners in the cabinet's own inches: x from its left, y from the front (0) back, z up from its bottom.
function mozPlace(q, T) {
  const R = mozRot(q.ang, q.axes), P = q.pos;
  return (x, y, z) => ({ x: (R[0][0] * x + R[0][1] * y + R[0][2] * z + P.x) / 25.4, y: (R[1][0] * x + R[1][1] * y + R[1][2] * z + P.y) / 25.4, z: (R[2][0] * x + R[2][1] * y + R[2][2] * z + P.z) / 25.4 });
}
// 3D: every part as its real outline, cut to its thickness, turned and placed as Mozaik places it.
function mozMeshes(c, opts = {}) {
  const grp = new THREE.Group(), r = mozRun(c); if (!r) return grp;
  const D = c.d;
  // A mitre fold part is drawn flat in Mozaik's file; once folded it is the product's box, so that is what is shown.
  if (mozFolded(r)) { const m = r.mats.find(Boolean); grp.add(box3(c.w, c.h, c.d, mat3(m, opts), c.w / 2, c.h / 2, c.d / 2)); grp.traverse(o => { o.userData.cabId = c.id; }); return grp; }
  r.parts.forEach((q, i) => {
    if (!(q.qty > 0) || q.outline.length < 3) return;
    const m0 = r.mats[i], T = q.group === 'metal' ? q.T : (m0 ? m0.thick * 25.4 : q.T);
    const M = q.group === 'metal' ? (typeof metal3 === 'function' && R3 ? metal3('#8a9096') : flat3('#8a9096')) : mat3(m0, opts);
    const sh = new THREE.Shape(q.outline.map(p => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 1 });
    const k = ((M.userData && M.userData.texScale) || 24) * 25.4, uv = g.attributes.uv;
    if (uv) for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) / k, uv.getY(j) / k);
    // Mozaik's frame (X right, Y back from the front, Z up, mm) into the cabinet group's (x right, y up, z out to the front, inches).
    const R = mozRot(q.ang, q.axes), P = q.pos, s = 1 / 25.4;
    const mtx = new THREE.Matrix4().set(
      R[0][0] * s, R[0][1] * s, R[0][2] * s, P.x * s,
      R[2][0] * s, R[2][1] * s, R[2][2] * s, P.z * s,
      -R[1][0] * s, -R[1][1] * s, -R[1][2] * s, D - P.y * s,
      0, 0, 0, 1);
    const mesh = new THREE.Mesh(g, M); mesh.applyMatrix4(mtx);
    if (!R3) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat3()));
    mesh.userData.part = q.name; grp.add(mesh);
  });
  if (c.addParts && c.addParts.length && typeof addedParts3d === 'function') addedParts3d(c, grp, m => mat3(m, opts));
  grp.traverse(o => { o.userData.cabId = c.id; });
  return grp;
}
const mozFolded = r => r.def.group === 'shelf' || r.def.group === 'mantel';
// Elevation: each part's outline seen from the front, back parts first, so the drawing has the product's real shape.
function mozFrontSVG(c, ex, by, opts = {}) {
  const r = mozRun(c), mats = []; let s = '';
  if (!r) { s = `<rect class="ev-box" x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/>`; return opts.withDefs ? { svg: s, mats } : s; }
  if (mozFolded(r)) { const m = r.mats.find(Boolean); mats.push(m && m.id); s = `<rect ${fillFor(m, 'ev-box')} x="${ex}" y="${by - c.h}" width="${c.w}" height="${c.h}"/>`; return opts.withDefs ? { svg: s, mats } : s; }
  const faces = [];
  r.parts.forEach((q, i) => {
    if (!(q.qty > 0) || q.outline.length < 3) return;
    const m = r.mats[i], T = m ? m.thick * 25.4 : q.T, f = mozPlace(q, T);
    [0, T].forEach(z => {
      const pts = q.outline.map(p => f(p.x, p.y, z)), ys = pts.map(p => p.y);
      const area = pts.reduce((a, p, k) => { const n = pts[(k + 1) % pts.length]; return a + p.x * n.z - n.x * p.z; }, 0);
      if (Math.abs(area) < 0.05) return; // seen edge on
      faces.push({ y: ys.reduce((a, b) => a + b, 0) / ys.length, pts, m, metal: q.group === 'metal' });
    });
  });
  faces.sort((a, b) => b.y - a.y);
  faces.forEach(F => { mats.push(F.m && F.m.id); s += `<polygon ${F.metal ? 'class="ev-box nss" style="fill:#9aa0a6"' : fillFor(F.m, 'ev-box')} points="${F.pts.map(p => `${r3(ex + p.x)},${r3(by - p.z)}`).join(' ')}"/>`; });
  return opts.withDefs ? { svg: s, mats } : s;
}

// The products go into the job's own library once each (a product deleted from the library stays deleted).
function ensureMozLib(s) {
  if (typeof MOZ_LIB === 'undefined' || !s) return s;
  const lib = s.libSet && s.libSet !== 'main' ? ((s.libSets = s.libSets || {}).main = s.libSets.main || []) : (s.library = s.library || []);
  const had = new Set(s.mozLibKeys || []);
  MOZ_LIB.items.forEach(d => {
    if (had.has(d.key)) return; had.add(d.key);
    if (lib.some(l => l.id === d.key)) return;
    const cat = d.sub === 3 ? 'Tall' : d.sub === 2 ? 'Wall' : 'Base', I = v => r3(v / 25.4);
    lib.push({ id: d.key, name: d.name, cat, w: I(d.W), h: I(d.H), d: I(d.D), elev: d.elev > 0 ? I(d.elev) : cat === 'Wall' ? 54 : 0, group: d.group, folder: d.folder, moz: d.key,
      rows: [], params: {}, construction: { toeKick: false, top: 'full' }, ...(d.desc ? { desc: d.desc } : {}) });
  });
  s.mozLibKeys = [...had];
  return s;
}
if (typeof module !== 'undefined') module.exports = { setTrace: f => { mozTrace = f; }, setLtr: v => { mozLtr = v; mozExprCache.clear(); }, mozXml, mozParseParams, mozParseProduct, mozBuild, mozVal, mozCompile, mozOutline, mozRot };
