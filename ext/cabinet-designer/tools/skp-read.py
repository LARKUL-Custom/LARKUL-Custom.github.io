#!/usr/bin/env python3
"""Reads SketchUp 2021+ .skp files without SketchUp (0.64.22).

A SketchUp 2021 or newer .skp is a zip. Its model.dat is a tree of records: 2-byte tag, 4-byte length, then the
record's bytes, which are often more records. The parts used here:
  f901 > ... > 7c15        one component definition: 8813 its entities, 7e15 its name
  f601 > 8813              the model's own entities
  8813 entities            d007 its id; 8913 points; 8a13 edges; 8b13 faces; 8c13 components; 8d13 groups
  c409 point               dc05 > de05 id, c509 x y z (3 doubles, inches)
  b80b edge                d007 id + d307 flags (0x06 hard, 0x1e soft/smooth), b90b start point, ba0b end point
  ac0d face                d007 id + d107 front material, af0d back material, ad0d plane, ae0d loops
  ae0d > 9411 > 9511       one loop: a00f edge uses (a10f edge id, a20f 1 when walked end to start); first loop is outside
  6419 component/group     6619 transform (x axis, y axis, z axis, origin, 1: 13 doubles), 6719 definition id
  f701 > ... > c832        a material: d007 id, cc32 name; colour in the zip's materials/<name>/material.xml
Writes the same .cdm.json that tools/sketchup (CD Model Export) writes, so tools/std-models.py can pack it.

  python3 tools/skp-read.py <file.skp> [<more.skp>] <out folder>
"""
import json, math, os, re, struct, sys, zipfile


def records(b, o, e):
  out = []
  while o < e:
    if o + 6 > e: return None
    n = struct.unpack_from('<I', b, o + 2)[0]
    if o + 6 + n > e: return None
    out.append([b[o:o + 2].hex(), o + 6, n, None])
    o += 6 + n
  return out


def tree(b, o, e, dep=0):
  r = records(b, o, e)
  if not r: return None
  for x in r:
    if x[2] >= 6 and dep < 60: x[3] = tree(b, x[1], x[1] + x[2], dep + 1)
  return r


class Skp:
  def __init__(self, path):
    z = zipfile.ZipFile(path)
    self.d = d = z.read('model.dat')
    self.root = tree(d, 0, len(d))
    if not self.root: raise ValueError('not a SketchUp 2021+ model')
    self.colors = {}
    for n in z.namelist():
      m = re.match(r'materials/(.+)/material\.xml$', n)
      if not m: continue
      x = z.read(n).decode('utf8', 'replace')
      g = lambda k, dflt: (re.search(k + r'="([^"]*)"', x) or [None, dflt])[1]
      c = '#%02x%02x%02x' % (int(g('colorRed', 200)), int(g('colorGreen', 200)), int(g('colorBlue', 200)))
      o = 1 - float(g('trans', 0)) if g('useTrans', '0') == '1' else 1
      self.colors[m.group(1)] = (c, o)
    self.mats, self.defs, self.top = {}, {}, None
    self._index(self.root, None)

  def raw(self, x): return self.d[x[1]:x[1] + x[2]]
  def kid(self, x, t): return next((k for k in (x[3] or []) if k[0] == t), None)
  def kids(self, x, t): return [k for k in (x[3] or []) if k[0] == t]

  def ident(self, x):  # [d007 >] dc05 > de05
    a = self.kid(x, 'd007') or x; b = self.kid(a, 'dc05'); c = b and self.kid(b, 'de05')
    return self.raw(c) if c else None

  def _index(self, tr, par):
    for x in tr:
      t = x[0]
      if t == 'c832':
        nm = self.kid(x, 'cc32')
        i = self.kid(x, 'dc05'); i = i and self.kid(i, 'de05')
        if nm and i: self.mats[self.raw(i)] = self.raw(nm).decode('utf8', 'replace')
      elif t == '7c15':
        ents, nm = self.kid(x, '8813'), self.kid(x, '7e15')
        if ents: self.defs[self.ident(ents)] = (self.raw(nm).decode('utf8', 'replace') if nm else '', ents)
      elif t == '8813' and par == 'f601':
        self.top = x
      if x[3]: self._index(x[3], t)

  def color(self, ref):
    nm = self.mats.get(ref)
    return self.colors.get(nm) if nm else None

  # Every face (as front-facing triangles) and hard edge, in the model's axes.
  def walk(self, ents, M, mat, out, depth=0):
    if depth > 30: return
    pts, edges = {}, {}
    for blk in self.kids(ents, '8913'):
      for v in self.kids(blk, 'c409'):
        p = self.kid(v, 'c509')
        if p: pts[self.ident(v)] = struct.unpack_from('<3d', self.d, p[1])
    for blk in self.kids(ents, '8a13'):
      for e in self.kids(blk, 'b80b'):
        a, b = self.kid(e, 'b90b'), self.kid(e, 'ba0b')
        f = self.kid(self.kid(e, 'd007'), 'd307')
        flag = self.raw(f)[0] if f else 6
        edges[self.ident(e)] = (self.raw(a), self.raw(b))
        if flag & 0x18 == 0 and self.raw(a) in pts and self.raw(b) in pts:
          out['edges'].append((xf(M, pts[self.raw(a)]), xf(M, pts[self.raw(b)])))
    for blk in self.kids(ents, '8b13'):
      for f in self.kids(blk, 'ac0d'):
        info = self.kid(f, 'd007')
        fr, bk = self.kid(info, 'd107'), self.kid(f, 'af0d')
        own = self.color(self.raw(fr)) if fr else None
        back = self.color(self.raw(bk)) if bk else None
        col = own or back or mat
        pl = struct.unpack_from('<4d', self.d, self.kid(f, 'ad0d')[1])
        loops = []
        for lp in self.kids(self.kid(f, 'ae0d'), '9411'):
          ring = []
          for u in self.kids(self.kid(lp, '9511'), 'a00f'):
            e = edges.get(self.raw(self.kid(u, 'a10f')))
            if not e: ring = None; break
            rev = self.raw(self.kid(u, 'a20f'))[:1] == b'\x01'
            ring.append(pts.get(e[1] if rev else e[0]))
          if ring and None not in ring and len(ring) >= 3: loops.append(ring)
        if not loops: continue
        for tri in triangulate(loops, pl[:3]):
          out['tris'].setdefault(col, []).append(tuple(xf(M, p) for p in tri))
    for kind in ('8c13', '8d13'):
      for blk in self.kids(ents, kind):
        for ins in walk_tag(blk, '6419'):
          r, t = self.kid(ins, '6719'), self.kid(ins, '6619')
          dfn = self.defs.get(self.raw(r)) if r else None
          if not dfn: continue
          T = struct.unpack_from('<13d', self.d, t[1]) if t and t[2] >= 104 else (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
          info = self.kid(ins, 'd007'); im = info and self.kid(info, 'd107')
          sub = (self.color(self.raw(im)) if im else None) or mat
          self.walk(dfn[1], mul(M, T), sub, out, depth + 1)


def walk_tag(x, t):
  for k in x[3] or []:
    if k[0] == t: yield k
    else: yield from walk_tag(k, t)


ID = (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
def xf(M, p):
  x, y, z = p
  return (M[0] * x + M[3] * y + M[6] * z + M[9], M[1] * x + M[4] * y + M[7] * z + M[10], M[2] * x + M[5] * y + M[8] * z + M[11])
def mul(A, B):  # A after B
  ax = lambda v: (A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2], A[2] * v[0] + A[5] * v[1] + A[8] * v[2])
  w = B[12] or 1
  o = xf(A, (B[9] / w, B[10] / w, B[11] / w))
  return ax(B[0:3]) + ax(B[3:6]) + ax(B[6:9]) + o + (1,)


# Ear clipping with holes joined to the outside by a cut, in the face's plane; triangles come out facing the normal.
def triangulate(loops, n):
  nx, ny, nz = n
  ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
  nx, ny, nz = nx / ln, ny / ln, nz / ln
  ux, uy, uz = (0, 0, 1) if abs(nx) > 0.9 else (1, 0, 0)
  ux, uy, uz = uy * nz - uz * ny, uz * nx - ux * nz, ux * ny - uy * nx  # u = a x n
  l = math.sqrt(ux * ux + uy * uy + uz * uz); ux, uy, uz = ux / l, uy / l, uz / l
  vx, vy, vz = ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux  # v = n x u
  P, rings = [], []
  for lp in loops:
    r = []
    for p in lp:
      P.append(p); r.append((len(P) - 1, p[0] * ux + p[1] * uy + p[2] * uz, p[0] * vx + p[1] * vy + p[2] * vz))
    rings.append(r)
  area = lambda r: sum(r[i][1] * r[(i + 1) % len(r)][2] - r[(i + 1) % len(r)][1] * r[i][2] for i in range(len(r))) / 2
  rings.sort(key=lambda r: -abs(area(r)))
  outer = rings[0] if area(rings[0]) > 0 else rings[0][::-1]
  for h in sorted(rings[1:], key=lambda r: -max(q[1] for q in r)):
    if area(h) > 0: h = h[::-1]
    hi = max(range(len(h)), key=lambda i: h[i][1])
    hp = h[hi]
    best, bd = None, 1e300
    for i, q in enumerate(outer):
      dd = (q[1] - hp[1]) ** 2 + (q[2] - hp[2]) ** 2
      if q[1] >= hp[1] - 1e-9 and dd < bd and not crosses(outer, rings[1:], hp, q): best, bd = i, dd
    if best is None: best = min(range(len(outer)), key=lambda i: (outer[i][1] - hp[1]) ** 2 + (outer[i][2] - hp[2]) ** 2)
    hr = h[hi:] + h[:hi]
    outer = outer[:best + 1] + hr + [hr[0], outer[best]] + outer[best + 1:]
  tris = earclip(outer)
  return [(P[a], P[b], P[c]) for a, b, c in tris]


def seg_x(a, b, c, d):
  def o(p, q, r): return (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1])
  d1, d2, d3, d4 = o(c, d, a), o(c, d, b), o(a, b, c), o(a, b, d)
  return ((d1 > 1e-12 and d2 < -1e-12) or (d1 < -1e-12 and d2 > 1e-12)) and ((d3 > 1e-12 and d4 < -1e-12) or (d3 < -1e-12 and d4 > 1e-12))


def crosses(outer, holes, a, b):
  for r in [outer] + holes:
    for i in range(len(r)):
      c, d = r[i], r[(i + 1) % len(r)]
      if c[0] in (a[0], b[0]) or d[0] in (a[0], b[0]): continue
      if seg_x(a, b, c, d): return True
  return False


def earclip(ring):
  idx = list(range(len(ring)))
  out, guard = [], 0
  cross = lambda a, b, c: (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
  def inside(p, a, b, c):
    return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12
  while len(idx) > 3 and guard < 100000:
    guard += 1
    n, cut = len(idx), False
    for k in range(n):
      i0, i1, i2 = idx[(k - 1) % n], idx[k], idx[(k + 1) % n]
      a, b, c = ring[i0], ring[i1], ring[i2]
      if cross(a, b, c) <= 1e-14: continue
      if any(inside(ring[j], a, b, c) for j in idx if j not in (i0, i1, i2) and ring[j][0] not in (a[0], b[0], c[0])): continue
      out.append((a[0], b[0], c[0])); idx.pop(k); cut = True; break
    if not cut:  # bad or flat: fan the rest
      for k in range(1, len(idx) - 1):
        out.append((ring[idx[0]][0], ring[idx[k]][0], ring[idx[k + 1]][0]))
      return out
  if len(idx) == 3: out.append(tuple(ring[i][0] for i in idx))
  return out


def fmt(v): return ('%.5f' % v).rstrip('0').rstrip('.') if abs(v) > 5e-6 else '0'


def export(path, dst):
  s = Skp(path)
  out = {'tris': {}, 'edges': []}
  s.walk(s.top, ID, None, out)
  mats, lo, hi = [], [1e300] * 3, [-1e300] * 3
  for col, tris in out['tris'].items():
    m, p, i = {}, [], []
    for t in tris:
      for q in t:
        k = tuple(round(v, 5) for v in q)
        if k not in m:
          m[k] = len(m); p.extend(k)
          for a in range(3): lo[a] = min(lo[a], k[a]); hi[a] = max(hi[a], k[a])
        i.append(m[k])
    c, o = col or ('#e8e8e8', 1)
    mats.append({'c': c, 'o': o, 'p': p, 'i': i})
  e = [v for a, b in out['edges'] for v in a + b]
  name = os.path.splitext(os.path.basename(path))[0]
  j = {'v': 2, 'name': name, 'unit': 'in', 'box': lo + hi, 'mats': mats, 'e': [round(v, 5) for v in e]}
  json.dump(j, open(dst, 'w'), separators=(',', ':'))
  return j


if __name__ == '__main__':
  *srcs, outdir = sys.argv[1:]
  os.makedirs(outdir, exist_ok=True)
  for src in srcs:
    nm = os.path.splitext(os.path.basename(src))[0]
    j = export(src, os.path.join(outdir, nm + '.cdm.json'))
    b = j['box']
    print('%-14s %6d triangles  %5d edges  box %.3f x %.3f x %.3f in' % (nm, sum(len(m['i']) for m in j['mats']) // 3,
          len(j['e']) // 6, b[3] - b[0], b[4] - b[1], b[5] - b[2]))
