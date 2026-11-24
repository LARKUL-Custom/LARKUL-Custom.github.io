#!/usr/bin/env python3
"""Built-in appliance models (0.62.0).

Packs the appliance, sink, faucet and hood models from Ayden's SketchUp export ("CD Models" folder, made with
tools/sketchup) into small binary files in models/, so every Cabinet Designer shows real models without importing
anything. Run:  python3 tools/std-models.py "<path to CD Models>"

Each <slug>.cdb file:  b'CDB1', uint32 header length, header JSON (padded to 4 bytes), then the data blocks the
header points at (byte offsets from the start of the file):
  header = { name, box: [x0,y0,z0,x1,y1,z1] (inches, SketchUp axes), mats: [{ c, o, n, ni, p, i, i32, u, tex }], e }
  p   n x 3 uint16 corner positions, 0..65535 across the box
  i   ni uint16 (or uint32 when i32) triangle corner numbers
  u   n x 2 float32 picture coordinates (only with tex)
  tex [offset, bytes, type] a JPEG picture, at most 256 px a side
  e   [offset, count] count x 3 uint16 edge line points, same scale as p
js/models.js (stdLoad) reads them back into the same shape an imported model has.
"""
import io, json, os, re, struct, sys
from PIL import Image

# Every model shipped. js/fixtures.js (STD_OF) says which preset draws with which.
NAMES = [
  # Refrigerators
  'Standard Fridge (L)', 'French Door Fridge', 'French Door Fridge w Ice', 'Side by Side Fridge', 'Bottom Drawer Fridge (L)',
  'Pro French Door', 'Pro Column (L)', 'Pro Side By Side', 'Undercounter Glass Door (L)', 'Wine Cooler (L)',
  # Dishwashers
  'Dishwasher', 'Pro Dishwasher',
  # Ranges, cooktops and rangetops
  'Slide In Range', 'Floor Mount Range', 'Pro Range 30', 'Pro Range 36', 'Pro Range 48', 'Pro Range 60',
  'Cooktop', 'Gas Range', 'Pro Rangetop 30', 'Pro Rangetop 36', 'Pro Rangetop 48',
  # Microwaves
  'Microwave', 'Over the Range Microwave',
  # Laundry
  'Front Load Washer', 'Front Load Dryer', 'Top Load Washer', 'Top Load Dryer', 'Washer_Dryer_Combo',
  # Sinks
  'Undermount Single Sink', 'Undermount Double Sink', 'Undermount Triple Sink', 'Undermount Zero Radius Single',
  'Undermount Zero Radius Double', 'Single Drop In Sink', 'Double Drop In Sink', 'Farmhouse', 'Apron Stainless',
  'Undermount Bar Sink', 'Drop In Vanity Oval', 'Undermount Vanity Oval',
  # Faucets
  'Faucet_Kitchen 1', 'Faucet_Kitchen 4', 'Faucet_Kitchen 5', 'Faucet_Kitchen 7', 'Faucet_Pot Filler 1',
  'Faucet_Vanity 1', 'Faucet_Vanity 5',
  # Hoods
  'Chimney Hood', 'Glass Hood', 'Contemorary Hood', 'Metal Hood_Taper 3s', 'Professional Hood w Full Extention', 'Standard Hood',
]
TEX_MAX = 256

def slug(n):
  return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', n.lower())).strip('-')

def pad4(b, fill=b'\0'):
  return b + fill * (-len(b) % 4)

def pack(src, name):
  j = json.load(open(os.path.join(src, name + '.cdm.json')))
  x0, y0, z0, x1, y1, z1 = j['box']
  sx, sy, sz = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6), max(z1 - z0, 1e-6)
  q = lambda v, a, s: max(0, min(65535, round((v - a) / s * 65535)))
  def qpts(p):
    out = bytearray()
    for k in range(0, len(p), 3):
      out += struct.pack('<3H', q(p[k], x0, sx), q(p[k + 1], y0, sy), q(p[k + 2], z0, sz))
    return bytes(out)
  blocks, mats, at = [], [], [0]
  def add(b):
    off = at[0]; b = pad4(b); blocks.append(b); at[0] += len(b); return off
  for m in j['mats']:
    n, idx = len(m['p']) // 3, m['i']
    if not idx: continue
    i32 = n > 65535
    mm = { 'c': m.get('c', '#cccccc'), 'o': m.get('o', 1), 'n': n, 'ni': len(idx), 'i32': i32 }
    mm['p'] = add(qpts(m['p']))
    mm['i'] = add(struct.pack('<%d%s' % (len(idx), 'I' if i32 else 'H'), *idx))
    if m.get('t') and m.get('u'):
      tp = os.path.join(src, m['t'])
      if os.path.exists(tp):
        im = Image.open(tp).convert('RGB')
        im.thumbnail((TEX_MAX, TEX_MAX), Image.LANCZOS)
        bio = io.BytesIO(); im.save(bio, 'JPEG', quality=82, optimize=True)
        mm['u'] = add(struct.pack('<%df' % len(m['u']), *m['u']))
        tb = bio.getvalue(); mm['tex'] = [add(tb), len(tb), 'image/jpeg']
    mats.append(mm)
  e = None
  if j.get('e'):
    e = [add(qpts(j['e'])), len(j['e']) // 3]
  head = { 'name': name, 'box': j['box'], 'mats': mats, 'e': e }
  hb = pad4(json.dumps(head, separators=(',', ':')).encode(), b' ')
  base = 8 + len(hb)
  # Offsets become counted from the start of the file.
  for mm in mats:
    mm['p'] += base; mm['i'] += base
    if 'u' in mm: mm['u'] += base
    if 'tex' in mm: mm['tex'][0] += base
  if e: e[0] += base
  hb2 = pad4(json.dumps(head, separators=(',', ':')).encode(), b' ')
  if len(hb2) != len(hb):  # offsets grew the header; redo with the new base
    d = len(hb2) - len(hb)
    for mm in mats:
      mm['p'] += d; mm['i'] += d
      if 'u' in mm: mm['u'] += d
      if 'tex' in mm: mm['tex'][0] += d
    if e: e[0] += d
    hb2 = pad4(json.dumps(head, separators=(',', ':')).encode(), b' ')
    assert len(hb2) == len(hb) + d
  return b'CDB1' + struct.pack('<I', len(hb2)) + hb2 + b''.join(blocks)

def main():
  src = sys.argv[1] if len(sys.argv) > 1 else 'CD Models'
  out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
  os.makedirs(out, exist_ok=True)
  total, index = 0, {}
  for n in NAMES:
    b = pack(src, n)
    open(os.path.join(out, slug(n) + '.cdb'), 'wb').write(b)
    j = json.load(open(os.path.join(src, n + '.cdm.json')))
    index[n] = { 'file': slug(n) + '.cdb', 'box': [round(v, 3) for v in j['box']] }
    total += len(b)
    print('%-40s %7d KB' % (n, len(b) // 1024))
  print('total %.1f MB' % (total / 1048576))

main()
