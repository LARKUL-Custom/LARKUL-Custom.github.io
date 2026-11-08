# Mozaik "Insert Libraries" folder -> js/mozinserts.js + img/inserts/*.webp
# usage: python3 -I mozins.py <Insert Libraries dir> <cabinet-designer dir>
import sys, os, re, io, json, glob, hashlib, struct
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops

root, cd = sys.argv[1], sys.argv[2]
imgdir = os.path.join(cd, 'img', 'inserts'); os.makedirs(imgdir, exist_ok=True)
for f in glob.glob(imgdir + '/*.webp'): os.remove(f)
MM = 25.4
def r(v): return round(float(v) / MM * 16) / 16
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def kind_of(n, parts, lib=''):
    t = n.lower()
    if re.search(r'graphic|decorative', lib.lower()): return 'other'
    if re.search(r'pull ?out shelf|roll ?out shelf', t): return 'rollout'
    if re.search(r'lazy|susan', t): return 'lazy'
    if re.search(r'trash|waste|recycl|garbage|hamper', t): return 'trash'
    if re.search(r'\brod\b|valet|wardrobe|closet rod|hang', t): return 'rod'
    if re.search(r'spice|pull ?out|cargo|paper towel|towel pull|le ?mans|magic corner|swing', t): return 'pullout'
    if re.search(r'inner drawer|drawer|roll ?out|tier|\bdb\b', t): return 'rollout'
    if re.search(r'tray div|trey div|divider|dividers', t): return 'traydiv'
    return 'other'

def skp_png(path):
    try: d = open(path, 'rb').read()
    except OSError: return None
    i = d.find(b'\x89PNG\r\n\x1a\n')
    if i < 0: return None
    j = d.find(b'IEND', i)
    return d[i:j + 8] if j > 0 else None

def prep(raw):
    try: im = Image.open(io.BytesIO(raw)).convert('RGBA')
    except Exception: return None
    a = im.getchannel('A')
    if a.getextrema()[0] < 250: box = a.point(lambda v: 255 if v > 20 else 0).getbbox()
    else:
        bg = Image.new('RGB', im.size, (255, 255, 255))
        diff = ImageChops.difference(im.convert('RGB'), bg).convert('L').point(lambda v: 255 if v > 24 else 0)
        box = diff.getbbox()
    if not box: return None
    w, h = box[2] - box[0], box[3] - box[1]
    if max(w, h) < 14: return None
    # SketchUp scene grabs with the red/green axes showing are not pictures of the product.
    px = list(im.convert('RGB').crop(box).get_flattened_data()) if hasattr(Image.Image, 'get_flattened_data') else list(im.convert('RGB').crop(box).getdata())
    red = sum(1 for (R, G, B) in px if R > 170 and G < 90 and B < 90); grn = sum(1 for (R, G, B) in px if G > 120 and R < 110 and B < 110)
    if red > 8 and grn > 8: return None
    im = im.crop(box)
    pad = max(2, int(max(w, h) * .06))
    out = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0)); out.paste(im, (pad, pad), im)
    out.thumbnail((256, 256), Image.LANCZOS)
    buf = io.BytesIO(); out.save(buf, 'WEBP', quality=82, method=6); return buf.getvalue()

seen = {}
def save_img(raw):
    data = prep(raw) if raw else None
    if not data: return ''
    h = hashlib.sha1(data).hexdigest()[:10]
    if h not in seen:
        open(os.path.join(imgdir, h + '.webp'), 'wb').write(data); seen[h] = 1
    return 'img/inserts/' + h + '.webp'

def lower_map(d):
    return {f.lower(): os.path.join(d, f) for f in os.listdir(d)}

out, libs = [], []
for dat in sorted(glob.glob(os.path.join(root, '*', 'Inserts.dat'))):
    d = os.path.dirname(dat); lib = os.path.basename(d); files = lower_map(d)
    txt = open(dat, encoding='utf-8', errors='ignore').read()
    txt = txt[txt.find('<'):]
    try: tree = ET.fromstring(txt)
    except ET.ParseError as e: print('skip', lib, e); continue
    n0 = len(out)
    for ins in tree.iter('Insert'):
        a = ins.attrib; name = a.get('Name', '').strip()
        if not name: continue
        raw = None
        for key in (a.get('Image', ''), a.get('InsertSkp', '')):
            p = files.get(key.lower()) if key else None
            if not p: continue
            if p.lower().endswith('.skp'): raw = skp_png(p)
            else:
                b = open(p, 'rb').read()
                try: Image.open(io.BytesIO(b)); raw = b
                except Exception: raw = None
            if raw: break
        # Parts and formulas stay in Mozaik's units (mm), so its formulas work as written.
        mm = lambda v: ('%g' % round(float(v or 0), 4))
        parts = []
        for pt in ins:
            b = pt.attrib
            if pt.tag == 'InsertPartV2':
                q = {'n': b.get('Name', ''), 't': b.get('Type', ''), 'q': b.get('Q_EQ') or b.get('Quan', '1'),
                     'w': b.get('W_EQ') or mm(b.get('W')), 'l': b.get('L_EQ') or mm(b.get('L')),
                     'x': b.get('X_EQ') or mm(b.get('X')), 'y': b.get('Y_EQ') or mm(b.get('Y')), 'z': b.get('Z_EQ') or mm(b.get('Z')),
                     'a1': b.get('A1_EQ') or b.get('A1', '0'), 'a2': b.get('A2_EQ') or b.get('A2', '0'), 'a3': b.get('A3_EQ') or b.get('A3', '0'),
                     'r': b.get('R1', 'X') + b.get('R2', 'Y') + b.get('R3', 'Z')}
            elif pt.tag == 'InsertPart':
                q = {'n': b.get('Name', ''), 't': b.get('Type', ''), 'q': b.get('Quan', '1'), 'w': b.get('Weq') or mm(b.get('W')), 'l': b.get('Leq') or mm(b.get('L'))}
            else: continue
            parts.append({k: v for k, v in q.items() if v not in ('', '0', 'XYZ') or k in ('w', 'l', 'n', 't')})
        params = [{k: v for k, v in {'n': b.get('Name', ''), 'd': b.get('Desc', ''), 't': int(b.get('Type', 0) or 0), 'v': b.get('Value', '0'), 'o': b.get('Options', '')}.items() if v not in ('', 0) or k in ('n', 'v')}
                  for b in (e.attrib for e in ins if e.tag == 'InsertParm')]
        W, H, D = (float(a.get(k, 0) or 0) for k in ('Width', 'Height', 'Depth'))
        fill = lambda k: a.get(k) == 'True'
        cost = float(a.get('CostEach', 0) or 0)
        x = {
            'id': ('mz-' if lib == '2026 Larkul' else 'mzc-' + slug(lib) + '-') + slug(name),
            'lib': lib, 'name': name, 'kind': kind_of(name, parts, lib),
            'price': round(cost, 2) if cost > 0 else '',
            'minW': r(W) if W > 0 and not fill('WOpening') else '', 'minH': r(H) if H > 0 and not fill('HOpening') else '', 'minD': r(D) if D > 0 and not fill('DOpening') else '',
            'img': save_img(raw), 'model': a.get('InsertSkp', ''),
        }
        place = ''.join(c for c, k in (('w', 'WOpening'), ('h', 'HOpening'), ('d', 'DOpening')) if fill(k))
        at = ','.join(k for k in ('WCenter', 'WRight', 'HCenter', 'HTop', 'DBack') if fill(k))
        if place: x['fill'] = place
        if at: x['at'] = at
        if float(a.get('Inset', 0) or 0): x['inset'] = r(a['Inset'])
        if a.get('Comment'): x['note'] = a['Comment']
        if parts: x['parts'] = parts
        if params: x['params'] = params
        if a.get('GraphicOnly') == 'True': x['graphic'] = 1
        out.append(x)
    libs.append(lib); print(lib, len(out) - n0)

# An insert with no picture of its own borrows one from a same-named insert in another library.
norm = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
byname = {}
for x in out:
    if x['img']: byname.setdefault(norm(x['name']), x['img'])
for x in out:
    if not x['img']: x['img'] = byname.get(norm(x['name']), '')
# ids must be unique
ids = {}
for x in out:
    b = x['id']; k = 2
    while x['id'] in ids: x['id'] = f'{b}-{k}'; k += 1
    ids[x['id']] = 1

order = ['2026 Larkul'] + sorted(l for l in libs if l != '2026 Larkul')
js = ('/* Mozaik insert libraries, made by tools/mozaik-inserts.py from Ayden\'s "Insert Libraries" folder.\n'
      '   One line per insert: its library, name, how it builds here, price (CostEach), the smallest opening it needs\n'
      '   (sizes Mozaik does not stretch to the opening), its picture (pulled out of the Mozaik model) and its parts. */\n'
      'const MOZ_INS_LIBS = ' + json.dumps(order) + ';\n'
      'const MOZ_INS = [\n' + ',\n'.join(json.dumps(x, separators=(',', ':')) for x in out) + '];\n')
open(os.path.join(cd, 'js', 'mozinserts.js'), 'w').write(js)
print(len(out), 'inserts', len(seen), 'pictures', sum(1 for x in out if x['img']), 'with pictures')
