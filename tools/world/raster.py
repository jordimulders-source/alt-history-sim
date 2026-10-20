"""Helpers to burn GeoJSON geometries into the pixel grid."""
import json
import numpy as np
from PIL import Image, ImageDraw
from .proj import W, H, project

def _polys(geom):
    t = geom['type']
    if t == 'Polygon':
        yield geom['coordinates']
    elif t == 'MultiPolygon':
        yield from geom['coordinates']
    elif t == 'GeometryCollection':
        for g in geom['geometries']:
            yield from _polys(g)

def _poly_mask(poly):
    """Rasterise one polygon (exterior + holes). Returns (x0, y0, mask) or None."""
    rings = []
    for ring in poly:
        a = np.asarray(ring, float)[:, :2]
        x, y = project(a[:, 0], a[:, 1])
        rings.append(np.stack([x, y], 1))
    ext = rings[0]
    x0, y0 = int(np.floor(ext[:, 0].min())), int(np.floor(ext[:, 1].min()))
    x1, y1 = int(np.ceil(ext[:, 0].max())) + 1, int(np.ceil(ext[:, 1].max())) + 1
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if x1 <= x0 or y1 <= y0:
        return None
    m = Image.new('1', (x1 - x0, y1 - y0), 0)
    d = ImageDraw.Draw(m)
    for k, r in enumerate(rings):
        pts = [(px - x0, py - y0) for px, py in r.tolist()]
        if len(pts) >= 3:
            d.polygon(pts, fill=1 if k == 0 else 0)
    return x0, y0, np.array(m, bool)

def burn(geoms, values, out):
    """Write value i into `out` wherever geometry i covers (later ones overwrite)."""
    for geom, v in zip(geoms, values):
        for poly in _polys(geom):
            r = _poly_mask(poly)
            if r is None:
                continue
            x0, y0, m = r
            sub = out[y0:y0 + m.shape[0], x0:x0 + m.shape[1]]
            sub[m] = v
    return out

def burn_mask(geoms):
    out = np.zeros((H, W), bool)
    return burn(geoms, [True] * len(geoms), out)

def load(path):
    with open(path) as f:
        return json.load(f)['features']
