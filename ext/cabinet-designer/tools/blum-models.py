#!/usr/bin/env python3
"""Blum hardware models for the 3D drawings (0.64.22).

Ayden 2026-11-26 sent Blum's own SketchUp models: CLIP top hinge 71B3750, cruciform plate 173L6100, TANDEM 563H
runners 563H3810B / 4570B / 5330B (15", 18", 21") and the T51.1901 locking device. This reads them (tools/skp-read.py,
no SketchUp needed), cuts each into the pieces that move apart (hinge cup on the door, arm on the cabinet; runner's
drawer member out with the drawer, the rest on the side), puts each piece in the frame js/hw3d.js places it by, and packs
them like the appliance models (tools/std-models.py) into models/blum-*.cdb.

  python3 tools/blum-models.py <folder with the 6 .skp files>

Frames (inches; X, Y, Z as js/hw3d.js uses them for a left-hand hinge / left runner; the right hand is mirrored in X):
  Blum Hinge Cup   X across the door from the cup's centre toward the cabinet's middle, Y up from the hinge's centre,
                   Z out from the door's back face (the cup goes in at +Z).
  Blum Hinge Arm   X off the side's inside face, Y up from the hinge's centre, Z forward from the plate's hole line.
                   71B3750 is the inset hinge (18 mm crank); hw3d.js bends the front of the arm onto the real cup.
  Blum Plate       X off the side's inside face, Y up from its centre, Z forward from its hole line.
  Blum Lock        X in from the end that hooks the runner, Y down from the face screwed under the drawer bottom,
                   Z back from its front edge.
  Blum 563H <L> Cabinet / Drawer   X in from the cabinet side's face, Y up from the drawer bottom's underside (the top
                   of the drawer member), Z back from the runner's front end.
"""
import importlib.util, json, os, struct, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, file):
  sp = importlib.util.spec_from_file_location(name, os.path.join(HERE, file)); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
skp = load('skp_read', 'skp-read.py')
std = load('std_models', 'std-models.py')


def parts_of(path):
  """{definition name: {'tris': {colour: [tri]}, 'edges': [...]}} for each group inside the model's one component."""
  s = skp.Skp(path)
  out = {}
  for blk in s.kids(s.top, '8c13'):
    for ins in skp.walk_tag(blk, '6419'):
      dfn = s.defs[s.raw(s.kid(ins, '6719'))]
      M = skp.mul(skp.ID, struct.unpack_from('<13d', s.d, s.kid(ins, '6619')[1]))
      kids = [k for b in s.kids(dfn[1], '8d13') for k in skp.walk_tag(b, '6419')]
      if not kids:
        o = {'tris': {}, 'edges': []}; s.walk(dfn[1], M, None, o); out[dfn[0]] = o
      for k in kids:
        d2 = s.defs[s.raw(s.kid(k, '6719'))]
        o = {'tris': {}, 'edges': []}
        s.walk(d2[1], skp.mul(M, struct.unpack_from('<13d', s.d, s.kid(k, '6619')[1])), None, o)
        # A group is named for the Blum part inside it.
        inner = [s.defs[s.raw(s.kid(i, '6719'))][0] for b in s.kids(d2[1], '8c13') for i in skp.walk_tag(b, '6419')]
        out[(inner or [d2[0]])[0]] = o
  return out


def merge(parts):
  o = {'tris': {}, 'edges': []}
  for p in parts:
    for c, t in p['tris'].items(): o['tris'].setdefault(c, []).extend(t)
    o['edges'].extend(p['edges'])
  return o


def mapped(o, f):
  return {'tris': {c: [tuple(f(*q) for q in t) for t in ts] for c, ts in o['tris'].items()}, 'edges': [(f(*a), f(*b)) for a, b in o['edges']]}


def split(o, test):
  a, b = {'tris': {}, 'edges': []}, {'tris': {}, 'edges': []}
  for c, ts in o['tris'].items():
    for t in ts: (a if all(test(*q) for q in t) else b)['tris'].setdefault(c, []).append(t)
  for e in o['edges']: (a if test(*e[0]) and test(*e[1]) else b)['edges'].append(e)
  return a, b


def cdm(o, name):
  """The .cdm.json shape tools/std-models.py packs (points kept in this frame: x, y, z as given)."""
  mats, lo, hi = [], [1e300] * 3, [-1e300] * 3
  for col, tris in o['tris'].items():
    m, p, i = {}, [], []
    for t in tris:
      for q in t:
        k = tuple(round(v, 5) for v in q)
        if k not in m:
          m[k] = len(m); p.extend(k)
          for a in range(3): lo[a] = min(lo[a], k[a]); hi[a] = max(hi[a], k[a])
        i.append(m[k])
    c, op = col or ('#e8e8e8', 1)
    mats.append({'c': c, 'o': op, 'p': p, 'i': i})
  e = [round(v, 5) for a, b in o['edges'] for v in a + b]
  return {'v': 2, 'name': name, 'unit': 'in', 'box': lo + hi, 'mats': mats, 'e': e}


def box(o):
  pts = [q for ts in o['tris'].values() for t in ts for q in t]
  return [min(p[k] for p in pts) for k in range(3)] + [max(p[k] for p in pts) for k in range(3)]


def build(src):
  out = {}
  # Hinge. In Blum's drawing the side's inside face is x = 0 (the cabinet's inside is -x), the plate's hole line y = 0,
  # the hinge's centre z = 0, the door's back face y = 1.5 (the cup going in at +y).
  h = parts_of(os.path.join(src, '71B3750.skp'))
  pick = lambda key: [v for k, v in h.items() if key in k]
  cup = merge(pick('71B355') + pick('70T310') + pick('71T310'))
  arm = merge(pick('70T330') + pick('bau0019416036'))
  cb = [q for t in cup['tris'].values() for tri in t for q in tri if q[1] > 1.9]   # the cup's bottom
  cupX = (min(q[0] for q in cb) + max(q[0] for q in cb)) / 2
  YD = 1.5
  out['Blum Hinge Cup'] = mapped(cup, lambda x, y, z: (-(x - cupX), z, y - YD))
  out['Blum Hinge Arm'] = mapped(arm, lambda x, y, z: (-x, z, y))
  out['_hinge'] = {'cupX': -cupX, 'doorZ': YD}
  # Plate: its base on the side at x = 0, its block toward -x, holes on y = 0.
  pl = merge(parts_of(os.path.join(src, '173L6100.skp')).values())
  out['Blum Plate'] = mapped(pl, lambda x, y, z: (-x, z, y))
  # Lock: lies flat, screwed up under the drawer bottom by its lowest face; the end that hooks the runner at min x, min y.
  lk = merge(parts_of(os.path.join(src, 'T51.1901.skp')).values())
  b = box(lk)
  out['Blum Lock'] = mapped(lk, lambda x, y, z: (x - b[0], -(z - b[2]), -(y - b[1])))
  # Runners: the side's face is the max x, the front end the min y (the rear hook that goes into the drawer back is at
  # max y); the drawer member is the box section under the drawer bottom (in from the side's flange, above the cabinet
  # member's floor). The three files are drawn a little apart, so the cut is measured from each one's own box.
  for L, f in ((15, '563H3810B'), (18, '563H4570B'), (21, '563H5330B')):
    r = merge(parts_of(os.path.join(src, f + '.skp')).values())
    b = box(r)
    dr, cab = split(r, lambda x, y, z, b=b: x < b[0] + 1.24 and z > b[2] + 0.26)
    # The drawer member's top along its middle (its front hook stands higher).
    top = max(q[2] for t in dr['tris'].values() for tri in t for q in tri if b[1] + 3 < q[1] < b[4] - 2)
    fx = lambda x, y, z, b=b, top=top: (b[3] - x, z - top, b[1] - y)
    out['Blum 563H %d Cabinet' % L] = mapped(cab, fx)
    out['Blum 563H %d Drawer' % L] = mapped(dr, fx)
  return out


def main():
  src = sys.argv[1]
  dst = os.path.join(HERE, '..', 'models')
  got = build(src)
  info = got.pop('_hinge')
  tmp = tempfile.mkdtemp()
  for name, o in got.items():
    j = cdm(o, name)
    json.dump(j, open(os.path.join(tmp, name + '.cdm.json'), 'w'))
    b = std.pack(tmp, name)
    open(os.path.join(dst, std.slug(name) + '.cdb'), 'wb').write(b)
    print('%-24s %5d triangles %4d KB  box %s' % (name, sum(len(m['i']) for m in j['mats']) // 3, len(b) // 1024, ' '.join('%.3f' % v for v in j['box'])))
  print('hinge', info)


if __name__ == '__main__':
  main()
