#!/usr/bin/env python3
"""Built-in room door leaves (0.63.40).

Ayden picked his own Mozaik door graphics (2026-11-24) for the doors in doorways. Each Mozaik door model is one piece
(casing, jambs and leaf together, and a bifold drawn folded), so Walk could not open it. This cuts the moving parts
out of the models in his SketchUp export ("CD Models" folder) and packs each as its own built-in model in models/,
in the same format as tools/std-models.py:

  python3 tools/door-models.py "<path to CD Models>"

A model's parts are the groups of triangles that share corners (the casing is one, the leaf another, each handle
another), so the leaf is picked by its place. A bifold's left panel is turned flat (it is drawn open at an angle).
js/roomdoors.js (ROOM_DOOR_MODELS) says which piece each door style draws with, and where its leaf is.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src_std = open(os.path.join(HERE, 'std-models.py')).read().replace('\nmain()\n', '\n')
exec(src_std)  # pack(), slug()

def load(src, name):
  return json.load(open(os.path.join(src, name + '.cdm.json')))

def parts(d):
  """[(mat index, [triangle start indices], bbox)] for every group of joined triangles."""
  out = []
  for mi, m in enumerate(d['mats']):
    p, i, n = m['p'], m['i'], len(m['p']) // 3
    rep, key = list(range(n)), {}
    def f(a):
      while rep[a] != a: rep[a] = rep[rep[a]]; a = rep[a]
      return a
    def u(a, b):
      a, b = f(a), f(b)
      if a != b: rep[a] = b
    for v in range(n):
      k = (round(p[3*v], 3), round(p[3*v+1], 3), round(p[3*v+2], 3))
      if k in key: u(v, key[k])
      else: key[k] = v
    for t in range(0, len(i), 3): u(i[t], i[t+1]); u(i[t], i[t+2])
    groups = {}
    for t in range(0, len(i), 3): groups.setdefault(f(i[t]), []).append(t)
    for ts in groups.values():
      vs = [i[t+k] for t in ts for k in range(3)]
      bb = [min(p[3*v+a] for v in vs) for a in range(3)] + [max(p[3*v+a] for v in vs) for a in range(3)]
      out.append((mi, ts, bb))
  return out

def piece(d, name, pick, xf=None):
  """A new model from the parts pick(mat index, bbox) keeps; xf(x, y, z) moves its corners."""
  mats, pts = [], []
  for mi, m in enumerate(d['mats']):
    p, i = m['p'], m['i']
    keep = [ts for (pm, ts, bb) in parts(d) if pm == mi and pick(mi, bb)]
    tris = [t for ts in keep for t in ts]
    if not tris: continue
    np_, ni, remap = [], [], {}
    for t in tris:
      for k in range(3):
        v = i[t+k]
        if v not in remap:
          x, y, z = p[3*v], p[3*v+1], p[3*v+2]
          if xf: x, y, z = xf(x, y, z)
          remap[v] = len(np_) // 3; np_ += [x, y, z]; pts.append((x, y, z))
        ni.append(remap[v])
    mats.append({ 'c': m.get('c', '#cccccc'), 'o': m.get('o', 1), 'p': np_, 'i': ni })
  box = [min(q[a] for q in pts) for a in range(3)] + [max(q[a] for q in pts) for a in range(3)]
  # The SketchUp edge lines that lie on what was kept.
  e, E = [], d.get('e') or []
  for k in range(0, len(E), 6):
    a, b = E[k:k+3], E[k+3:k+6]
    if xf: a, b = list(xf(*a)), list(xf(*b))
    if all(box[j] - 0.01 <= q[j] <= box[j+3] + 0.01 for q in (a, b) for j in range(3)):
      if pick(-1, [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2]), max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2])]) is not False: e += a + b
  return { 'v': 2, 'name': name, 'unit': 'in', 'box': box, 'mats': mats, 'e': e }

inside = lambda bb, x0, x1: bb[0] >= x0 - 0.01 and bb[3] <= x1 + 0.01
not_frame = lambda W: (lambda mi, bb: not (bb[0] <= 0.01 and bb[3] >= W - 0.01))

def bifold_panel(d):
  """The left panel of the folded bifold, turned flat along x (hinge edge at x = 0), its face toward -y."""
  b = d['box']; mid = (b[0] + b[3]) / 2
  m = d['mats'][0]; p = m['p']
  xs = [(p[3*v], p[3*v+1]) for v in range(len(p)//3) if p[3*v] < mid - 0.5]
  cx = sum(q[0] for q in xs) / len(xs); cy = sum(q[1] for q in xs) / len(xs)
  sxx = sum((q[0]-cx)**2 for q in xs); syy = sum((q[1]-cy)**2 for q in xs); sxy = sum((q[0]-cx)*(q[1]-cy) for q in xs)
  ang = 0.5 * math.atan2(2*sxy, sxx - syy)
  c, s = math.cos(-ang), math.sin(-ang)
  xf = lambda x, y, z: ((x-cx)*c - (y-cy)*s, (x-cx)*s + (y-cy)*c, z)
  return xf, mid

def main():
  src = sys.argv[1] if len(sys.argv) > 1 else 'CD Models'
  out = os.path.join(HERE, '..', 'models')
  made = []
  def keep(j):
    made.append(j)
  # Swing doors: the leaf with its handles (LH: hinge at the low x end).
  for mdl, nm in [('Door_Interior (LH)', 'Door Leaf Panel'), ('Door_Interior Slab (LH)', 'Door Leaf Slab'),
                  ('Door_Glass Full (LH)', 'Door Leaf Glass'), ('Door_Glass Half (LH)', 'Door Leaf Half Glass')]:
    d = load(src, mdl); W = d['box'][3]
    keep(piece(d, nm, not_frame(W)))
    # The same leaf with no handles, for pocket, bypass and bifold doors (their own pulls go on).
    keep(piece(d, nm + ' Bare', lambda mi, bb: not_frame(W)(mi, bb) and mi != 1))
  # Closet pair: the left leaf and its handles.
  d = load(src, 'Door_Double Closet'); W = d['box'][3]
  keep(piece(d, 'Door Leaf Closet', lambda mi, bb: not_frame(W)(mi, bb) and (bb[0] + bb[3]) / 2 < 19.56))
  keep(piece(d, 'Door Leaf Closet Bare', lambda mi, bb: not_frame(W)(mi, bb) and mi != 1 and (bb[0] + bb[3]) / 2 < 19.56))
  # Patio slider (R model: the sliding panel with the handle is on the left) and its fixed panel.
  d = load(src, 'Door_Patio Door (R)'); W = d['box'][3]
  keep(piece(d, 'Door Leaf Patio Slider', lambda mi, bb: not_frame(W)(mi, bb) and (bb[0] + bb[3]) / 2 < 36.5))
  keep(piece(d, 'Door Leaf Patio Fixed', lambda mi, bb: not_frame(W)(mi, bb) and (bb[0] + bb[3]) / 2 > 36.5))
  # Pocket door finger pulls (both faces).
  d = load(src, 'Door_Pocket (L)')
  keep(piece(d, 'Door Pocket Pull', lambda mi, bb: mi == 1))
  # Barn door: the door, its two hangers and pull; the rail on its own.
  d = load(src, 'BarnDoor LH')
  keep(piece(d, 'Barn Door Leaf', lambda mi, bb: mi != -1 and inside(bb, 2.9, 35.1) and not (bb[3] - bb[0] < 0.2)))
  keep(piece(d, 'Barn Door Rail', lambda mi, bb: mi != -1 and not inside(bb, 2.9, 35.1)))
  # Bifold: the left panel, laid flat.
  d = load(src, 'Door_BiFold Louvred')
  xf, mid = bifold_panel(d)
  # Triangles of one part (the whole bifold is one part): keep the left half by triangle, then turn it flat.
  m = d['mats'][0]; p, i = m['p'], m['i']
  tris = [t for t in range(0, len(i), 3) if sum(p[3*i[t+k]] for k in range(3)) / 3 < mid]
  np_, ni, remap = [], [], {}
  for t in tris:
    for k in range(3):
      v = i[t+k]
      if v not in remap: remap[v] = len(np_) // 3; np_ += list(xf(p[3*v], p[3*v+1], p[3*v+2]))
      ni.append(remap[v])
  P = [np_[k:k+3] for k in range(0, len(np_), 3)]
  E, e = d.get('e') or [], []
  for k in range(0, len(E), 6):
    a, b = E[k:k+3], E[k+3:k+6]
    if a[0] < mid and b[0] < mid: e += list(xf(*a)) + list(xf(*b))
  box = [min(q[a] for q in P) for a in range(3)] + [max(q[a] for q in P) for a in range(3)]
  keep({ 'v': 2, 'name': 'Door Leaf Louvred', 'unit': 'in', 'box': box, 'mats': [{ 'c': m['c'], 'o': 1, 'p': np_, 'i': ni }], 'e': e })
  tmp = os.path.join(out, '.door-tmp'); os.makedirs(tmp, exist_ok=True)
  for j in made:
    json.dump(j, open(os.path.join(tmp, j['name'] + '.cdm.json'), 'w'))
    b = pack(tmp, j['name'])
    open(os.path.join(out, slug(j['name']) + '.cdb'), 'wb').write(b)
    print('%-26s %6d B  box %s' % (j['name'], len(b), [round(v, 3) for v in j['box']]))
    os.remove(os.path.join(tmp, j['name'] + '.cdm.json'))
  os.rmdir(tmp)

main()
