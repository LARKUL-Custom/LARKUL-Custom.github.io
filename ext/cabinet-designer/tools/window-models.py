#!/usr/bin/env python3
"""Built-in window models (0.63.44).

Ayden's windows showed as a plain pane of flat glass in a casing (and an opaque block while picked). This packs the
window models from his SketchUp export ("CD Models" folder, Mozaik's windows: casing, sash, mullions and clear glass)
as built-in models in models/, the same way tools/std-models.py does the appliances:

  python3 tools/window-models.py "<path to CD Models>"

js/fixtures.js (STD_OF) says which window preset draws with which model; js/models.js lists them (STD_WINDOW_MODELS).
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'std-models.py')).read().replace('\nmain()\n', '\n'))  # pack(), slug()

WINDOWS = ['Window_Basic 1', 'Window_Basic 2', 'Window_Basic 3', 'Window_Single Hung 1', 'Window_Single Hung 2',
           'Window_Single Hung 1 (w Top Mullions)', 'Window_Picture', 'Window_Picture w Bars', 'Window_Casement 1 (Transom)',
           'Window_Casement 2 (Transom)', 'Window_Farm House 1', 'Window_Farm House 2', 'Window_Sliding']

def main():
  src = sys.argv[1] if len(sys.argv) > 1 else 'CD Models'
  out = os.path.join(HERE, '..', 'models')
  total = 0
  for n in WINDOWS:
    b = pack(src, n)
    open(os.path.join(out, slug(n) + '.cdb'), 'wb').write(b)
    total += len(b)
    print('%-40s %6d B' % (n, len(b)))
  print('total %d KB' % (total // 1024))

main()
