#!/usr/bin/env python3
# Run: python3 tools/endgrain-texture.py "textures/Tops/Endgrain Butcherblock.jpg" 7  (numpy + Pillow)
# Generates a seamless end grain butcher block texture (original work, no outside photos).
import numpy as np, sys
from PIL import Image, ImageFilter
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 7)
N = 2048; INCH = 24.0; ppi = N / INCH
BW, BH = 1.5, 2.0                      # block size, inches (16 x 12 blocks per tile)
cols, rows = int(INCH / BW), int(INCH / BH)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / ppi   # inches

def pnoise(scale_px, amp=1.0):
    """Periodic smooth noise: filtered white noise in the FFT domain, so it tiles."""
    f = np.fft.fftfreq(N)[:, None] ** 2 + np.fft.fftfreq(N)[None, :] ** 2
    w = np.exp(-f * (scale_px ** 2) * 20)
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * w))
    return (n / (n.std() + 1e-9) * amp).astype(np.float32)

out = np.zeros((N, N, 3), np.float32)
BH = 1.75; rows = 14; BH = INCH / rows
r = np.minimum((yy // BH).astype(int), rows - 1)
edges = []
for i in range(rows):
    w = rng.uniform(1.0, 2.3, 40); cs = np.cumsum(w); k = np.searchsorted(cs, INCH); w = w[:k + 1]; w *= INCH / w.sum()
    off = rng.uniform(0, INCH)
    edges.append((np.concatenate([[0], np.cumsum(w)]), off))
maxc = max(len(e) - 1 for e, _ in edges)
c = np.zeros((N, N), int); lx = np.zeros((N, N), np.float32); BWm = np.zeros((N, N), np.float32)
for i, (e, off) in enumerate(edges):
    m = r == i; xs = (xx[m] + off) % INCH
    j = np.clip(np.searchsorted(e, xs, side='right') - 1, 0, len(e) - 2)
    c[m] = j; lx[m] = xs - e[j]; BWm[m] = (e[j + 1] - e[j])
ly = yy - r * BH
bid = r * maxc + c
nb = rows * maxc
BW = 1.6
ang = rng.uniform(0, 2 * np.pi, nb); dist = rng.uniform(0.6, 4.5, nb)
cx = BW / 2 + np.cos(ang) * dist; cy = BH / 2 + np.sin(ang) * dist
inside = rng.random(nb) < 0.12
cx[inside] = rng.uniform(0.2, BW - 0.2, inside.sum()); cy[inside] = rng.uniform(0.2, BH - 0.2, inside.sum())
spacing = rng.uniform(0.07, 0.2, nb)
base = np.array([[238, 204, 158], [230, 188, 134], [219, 170, 114], [204, 150, 96], [168, 112, 70]], np.float32)
pick = rng.choice(len(base), nb, p=[.3, .36, .24, .08, .02])
tone = base[pick] * rng.uniform(0.96, 1.03, (nb, 1))
tone[:, 2] *= rng.uniform(0.93, 1.04, nb)
dx = lx - cx[bid]; dy = ly - cy[bid]
rad = np.sqrt(dx * dx + dy * dy); th = np.arctan2(dy, dx)
wob = pnoise(60, 0.035) + pnoise(14, 0.012)
ring_ph = (rad + wob) / spacing[bid]
fr = ring_ph % 1.0
late = np.clip((fr - 0.72) / 0.28, 0, 1) ** 1.6          # latewood band, darker
ring = 1 - 0.17 * late - 0.04 * np.sin(fr * np.pi * 2) ** 2
# Medullary rays: thin radial streaks.
rays = np.sin(th * rng.uniform(70, 140, nb)[bid] + pnoise(30, 0.6))
ray = 1 - 0.035 * np.clip((rays - 0.9) * 10, 0, 1) * (pnoise(8, 1) > 0.3)
# Pores and fine fiber noise.
pores = np.where(pnoise(1.2, 1) > 2.6, 0.9, 1.0)
fine = 1 + pnoise(3, 0.018) + pnoise(40, 0.02)
grad = 1 + 0.05 * ((lx / np.maximum(BWm, 1e-3)) - 0.5) * rng.uniform(-1, 1, nb)[bid]
col = tone[bid] * (grad * ring * ray * pores * fine)[..., None]
# Glue lines between blocks.
edge = np.minimum(np.minimum(lx, BWm - lx), np.minimum(ly, BH - ly)) * ppi
glue = np.clip(edge / 1.1, 0, 1)
col = col * (0.8 + 0.2 * glue[..., None])
# Soft sanded/finished sheen variation across the board.
col *= (1 + pnoise(220, 0.03))[..., None]
img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
img = img.filter(ImageFilter.GaussianBlur(0.6))
img.save(sys.argv[1], quality=88)
print('avg', np.clip(col, 0, 255).reshape(-1, 3).mean(0).astype(int))
