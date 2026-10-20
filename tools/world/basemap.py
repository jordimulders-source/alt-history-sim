"""Painted base maps: 'atlas' (old parchment map) and 'political' (clean, relief-shaded)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from .proj import W, H
from . import env
from .provinces import smooth_noise

def _hex(c):
    return [int(c[i:i + 2], 16) for i in (1, 3, 5)]

ATLAS_TERRAIN = {'farmland': '#e5d4a6', 'grassland': '#e2d29d', 'forest': '#c8c088', 'hills': '#d9c493',
                 'mountains': '#cbb083', 'steppe': '#e8d6a0', 'desert': '#efd9a3', 'marsh': '#cbcb9c',
                 'jungle': '#bfbd85', 'tundra': '#e0d8c2', 'glacier': '#f1ece0', 'coastal_desert': '#ecd7a2'}

def shading(col, land):
    lum = col.astype(np.float32).mean(-1)
    base = ndimage.gaussian_filter(lum, 10)
    s = np.clip(lum / np.maximum(base, 1), 0.55, 1.35)
    s = ndimage.gaussian_filter(s, 0.6)
    s[~land] = 1.0
    return s

def coast_distance(land):
    return ndimage.distance_transform_edt(~land).astype(np.float32)

def blur_rgb(a, sigma):
    return np.stack([ndimage.gaussian_filter(a[..., i], sigma) for i in range(3)], -1)

def atlas(g):
    land, terrain, col, lakes = g['land'], g['terrain'], g['col'], g['lakes']
    pal = np.array([_hex(ATLAS_TERRAIN[t]) for t in env.TERRAINS], np.float32)
    base = blur_rgb(pal[terrain], 4)
    s = shading(col, land)
    img = base * (s[..., None] ** 1.35)
    # paper: fine grain + soft blotches
    grain = np.random.default_rng(7).normal(0, 1, (H, W)).astype(np.float32)
    grain = ndimage.gaussian_filter(grain, 0.7) * 5
    blot = smooth_noise(11, 40, 4) * 9
    # sea
    d = coast_distance(land | lakes)
    sea_near, sea_far = np.array(_hex('#c9d3bd'), np.float32), np.array(_hex('#a9b9a7'), np.float32)
    t = np.clip(d / 90, 0, 1)[..., None]
    sea = sea_near * (1 - t) + sea_far * t
    # ripple lines along the coast, like engraved maps
    ripple = np.zeros((H, W), np.float32)
    for k, (r, a) in enumerate(((3, 0.32), (7, 0.24), (12, 0.17), (19, 0.11), (28, 0.07))):
        ripple += a * np.exp(-((d - r) ** 2) / 0.9)
    sea = sea * (1 - ripple[..., None] * 0.55)
    lake_col = np.array(_hex('#b7c6b4'), np.float32)
    img = np.where(land[..., None], img, sea)
    img = np.where(lakes[..., None], lake_col * (1 - ripple[..., None] * 0.3), img)
    # dark coastal edge on land (ink)
    dl = ndimage.distance_transform_edt(land)
    edge = np.exp(-((dl - 1.0) ** 2) / 1.2) * land
    img = img * (1 - edge[..., None] * 0.18)
    img += (grain + blot)[..., None]
    # vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - 0.18 * (((xx / W - 0.5) * 2) ** 4 + ((yy / H - 0.5) * 2) ** 4)
    img *= v[..., None]
    return np.clip(img, 0, 255).astype(np.uint8)

def political(g):
    land, col, lakes = g['land'], g['col'], g['lakes']
    s = shading(col, land)
    img = np.ones((H, W, 3), np.float32) * np.array(_hex('#f2f0ea'), np.float32) * (s[..., None] ** 1.5)
    d = coast_distance(land | lakes)
    near, far = np.array(_hex('#86a9c6'), np.float32), np.array(_hex('#3e6489'), np.float32)
    t = np.clip(d / 120, 0, 1)[..., None] ** 0.7
    sea = near * (1 - t) + far * t
    ripple = 0.10 * np.exp(-((d - 4) ** 2) / 2) + 0.06 * np.exp(-((d - 10) ** 2) / 3)
    sea = sea * (1 + ripple[..., None])
    img = np.where(land[..., None], img, sea)
    img = np.where(lakes[..., None], np.array(_hex('#7fa2c0'), np.float32), img)
    return np.clip(img, 0, 255).astype(np.uint8)

def save(img, path, size=None, quality=86):
    im = Image.fromarray(img)
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(path, quality=quality, optimize=True, progressive=True)
