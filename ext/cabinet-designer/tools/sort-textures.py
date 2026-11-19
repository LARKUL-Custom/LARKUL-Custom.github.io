#!/usr/bin/env python3
"""Sorts textures/index.json into clear categories (Ayden 2026-11-19). Only the c (category) and s (sub) fields change, and
exact repeats get h: 1 (hidden in the picker). Files never move, so every saved pick ('textures/<path>') keeps working.
Run again after adding photos: python3 tools/sort-textures.py  (from extensions/cabinet-designer)."""
import colorsys, json, re, sys
P = sys.argv[1] if len(sys.argv) > 1 else 'textures/index.json'
L = json.load(open(P))

SPECIES = [  # first match wins
  ('Oak', r'\boak\b'), ('Walnut', r'walnut'), ('Cherry', r'cherry'), ('Maple', r'maple|birds ?eye'), ('Alder', r'alder'),
  ('Hickory', r'hickory'), ('Birch', r'birch'), ('Ash', r'\bash\b'), ('Beech', r'beech'),
  ('Pine, fir and cedar', r'pine|fir\b|douglas|cedar'),
  ('Exotic', r'ebony|macassar|mahogany|makore|wenge|teak|coco ?bolo|olive ?wood|zebra|rosewood|bamboo|pearwood|fruitwood|sapele|padauk|bubinga|wood boards'),
  ('Stains', r'^stain|\bstain\b'), ('MDF and particleboard', r'mdf|chipboard|particle|hdf'),
]
MELA = r'melamine|fleetwood|kendal|charleston|arizona|orleans|havana|rustic hewn|kansas|barolo|ellmau|navarra|lindau|aland|lyon|fineline|champagne'
METAL = r'stainless|nickel|chrome|brass|bronze(?! wood)|steel(?! grey)|\bglass\b|mirror'

def hsl(col):
  try: r, g, b = (int(col[i:i + 2], 16) / 255 for i in (1, 3, 5))
  except Exception: return 0, 0, .5
  h, l, s = colorsys.rgb_to_hls(r, g, b); return h * 360, s, l

def family(t):
  n = t['n'].lower(); h, s, l = hsl(t.get('col', ''))
  try: r, g, b = (int(t['col'][i:i + 2], 16) / 255 for i in (1, 3, 5))
  except Exception: r = g = b = .5
  c, v = max(r, g, b) - min(r, g, b), max(r, g, b)  # chroma and value: how colorful and how light
  for f, rx in [('Blacks and charcoals', r'black|charcoal|onyx|inkwell|iron ore|midnight'), ('Blues', r'blue|navy|indigo|teal|sky\b'),
                ('Greens', r'green|olive|sage|moss|willow|rosemary'), ('Reds and pinks', r'\bred\b|crimson|caliente|firebrick'),
                ('Oranges and yellows', r'orange|yellow')]:
    if re.search(rx, n): return f
  if v < .25: return 'Blacks and charcoals'
  if c < .07:
    if v > .9 or re.search(r'white|lace|dove', n): return 'Whites'
    return 'Greys'
  if c < .16 and v > .82: return 'Whites' if v > .93 else 'Creams and off-whites'
  if c < .16 and (h < 70 or h > 300): return 'Greys' if re.search(r'gr[ae]y|pewter|silver', n) else 'Beiges, tans and browns'
  if c < .12: return 'Greys'
  if 70 <= h < 170: return 'Greens'
  if 170 <= h < 255: return 'Blues'
  if 255 <= h < 300: return 'Purples'
  if h >= 300 or h < 12: return 'Reds and pinks'
  if h < 45 and (v < .6 or c < .3): return 'Beiges, tans and browns'
  return 'Oranges and yellows'

def sort(t):
  # Worked out from the photo's path and name only, so running this again gives the same result.
  n, parts = t['n'].lower(), t['p'].split('/')
  top, sub, fname = parts[0], (parts[1] if len(parts) > 2 else ''), parts[-1]
  if top == 'Tops': return t['c'], t.get('s', '')
  if re.search(METAL, n) and not re.search(r'wood', n): return 'Metal', 'Glass' if 'glass' in n or 'mirror' in n else 'Metal'
  if fname.startswith('COLOURpyne'): return 'Melamine', 'COLOURpyne'
  if top == 'Paint' and re.search(MELA, n) or sub == 'Melamine': return 'Melamine', 'Woodgrain' if re.search(r'oak|maple|pine|birch|hewn|ash|beech|pearwood|barolo|wood', n) else 'Solid colors'
  if top == 'Wood' or re.search(r'plywood', n):
    for sp, rx in SPECIES:
      if re.search(rx, n): return 'Wood', sp
    return 'Wood', 'Other wood'
  if re.match(r'1[a-p] ', n): return 'Paint', 'Shop paint chart'
  return 'Paint', family(t)

seen = set()
for t in L:
  t.pop('h', None)
  t['c'], t['s'] = sort(t)
  key = (re.sub(r'^\d+\s*[a-z]?\s*', '', t['n'].lower()).replace('paint ', '').strip(), t.get('col'))
  if t['c'] == 'Paint' and t['s'] != 'Shop paint chart' and key in seen: t['h'] = 1
  seen.add(key)
json.dump(L, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(L), 'hidden', sum(1 for t in L if t.get('h')))
for k, v in sorted(Counter((t['c'], t['s']) for t in L if not t.get('h')).items()): print(k, v)
