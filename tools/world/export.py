"""Province attributes, names, vector shapes and border edges for the web viewer."""
import json, os
import numpy as np
import yaml
from scipy import ndimage
import shapely
from shapely.geometry import shape
import rasterio.features
from .proj import W, H, pixel_lonlat, pixel_area_km2, project
from . import env

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
RAW = f'{ROOT}/data/raw'

def province_stats(g):
    prov, land, owner, terrain, elev = g['prov'], g['land'], g['owner'], g['terrain'], g['elev']
    n = int(prov.max())
    idx = np.arange(1, n + 1)
    area = pixel_area_km2()[:, None] * np.ones((1, W), np.float32)
    yy, xx = np.indices((H, W))
    st = {}
    st['area'] = ndimage.sum(area, prov, idx)
    st['cx'] = ndimage.mean(xx, prov, idx)
    st['cy'] = ndimage.mean(yy, prov, idx)
    st['elev'] = ndimage.mean(elev, prov, idx)
    fert = np.array([env.FERTILITY[t] for t in env.TERRAINS], np.float32)[terrain]
    st['fert'] = ndimage.mean(fert, prov, idx)
    # dominant owner / terrain
    st['owner'] = np.zeros(n, np.int32)
    st['terrain'] = np.zeros(n, np.int32)
    objs = ndimage.find_objects(prov)
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        m = prov[sl] == i + 1
        st['owner'][i] = np.bincount(owner[sl][m]).argmax()
        tt = np.bincount(terrain[sl][m], minlength=len(env.TERRAINS))
        st['terrain'][i] = tt.argmax()
    # label point: province pixel closest to the centroid (inside the province)
    st['lx'] = np.zeros(n)
    st['ly'] = np.zeros(n)
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        m = prov[sl] == i + 1
        d = ndimage.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]
        cy, cx = st['cy'][i] - sl[0].start, st['cx'][i] - sl[1].start
        ys, xs = np.nonzero(m)
        score = d[ys, xs] * 2 - np.hypot(ys - cy, xs - cx) * 0.5
        k = score.argmax()
        st['lx'][i] = xs[k] + sl[1].start
        st['ly'][i] = ys[k] + sl[0].start
    # adjacency
    pairs = set()
    water = ~land & ~g['lakes']
    coastal = np.zeros(n + 1, bool)
    for a, b in ((prov[:, :-1], prov[:, 1:]), (prov[:-1], prov[1:])):
        m = (a != b) & (a > 0) & (b > 0)
        for p, q in set(zip(a[m].tolist(), b[m].tolist())):
            pairs.add((min(p, q), max(p, q)))
    for a, b, wa, wb in ((prov[:, :-1], prov[:, 1:], water[:, :-1], water[:, 1:]), (prov[:-1], prov[1:], water[:-1], water[1:])):
        coastal[a[wb]] = True
        coastal[b[wa]] = True
    st['coastal'] = coastal[1:]
    st['adj'] = sorted(pairs)
    return st

def province_names(g, st, tags):
    renames = yaml.safe_load(open(f'{ROOT}/data/curated/place_names.yaml'))
    places = json.load(open(f'{RAW}/ne_10m_populated_places_simple.geojson'))['features']
    prov = g['prov']
    best = {}
    for f in places:
        p = f['properties']
        if p['featurecla'] in ('Meteorological Station', 'Scientific station'):
            continue
        name = p['name']
        if name in renames:
            name = renames[name]
            if not name:
                continue
        x, y = project(p['longitude'], p['latitude'])
        x, y = int(x), int(y)
        if not (0 <= x < W and 0 <= y < H):
            continue
        pid = prov[y, x]
        if pid == 0:
            continue
        score = p['scalerank'] - (3 if 'capital' in p['featurecla'] else 0)
        if pid not in best or score < best[pid][0]:
            best[pid] = (score, name)
    # GeoNames towns: the town nearest to the label point of each province
    towns = {}
    for c in json.load(open(f'{RAW}/cities.json')):
        x, y = project(float(c['lng']), float(c['lat']))
        x, y = int(x), int(y)
        if not (0 <= x < W and 0 <= y < H):
            continue
        pid = prov[y, x]
        if pid == 0 or pid in best:
            continue
        d = (x - st['lx'][pid - 1]) ** 2 + (y - st['ly'][pid - 1]) ** 2
        if pid not in towns or d < towns[pid][0]:
            towns[pid] = (d, renames.get(c['name'], c['name']) or c['name'])
    # regions for provinces without cities (and for the Americas/Oceania, where city names are anachronistic)
    regions = json.load(open(f'{RAW}/ne_10m_geography_regions_polys.geojson'))['features']
    lon, lat = pixel_lonlat()
    names = []
    used = {}
    region_geoms = [(shape(f['geometry']), f['properties']['name'], f['properties'].get('scalerank', 9))
                    for f in regions if f['properties'].get('name')]
    tree = shapely.STRtree([r[0] for r in region_geoms])
    for i in range(len(st['area'])):
        plon, plat = lon[int(st['lx'][i])], lat[int(st['ly'][i])]
        newworld = plon < -30 or (plon > 110 and plat < -10)
        nm = None
        if i + 1 in best and not newworld:
            nm = best[i + 1][1]
        if nm is None and not newworld and i + 1 in towns:
            nm = towns[i + 1][1]
        if nm is None:
            pt = shapely.Point(plon, plat)
            cand = [region_geoms[j] for j in tree.query(pt) if region_geoms[j][0].contains(pt)]
            if cand:
                nm = sorted(cand, key=lambda r: -r[2])[0][1]   # most local region
        if nm is None:
            nm = 'Uncharted Land'
        used[nm] = used.get(nm, 0) + 1
        names.append(nm)
    # number duplicates: "Sahara", "Sahara II", ...
    count = {}
    out = []
    roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X']
    for nm in names:
        if used[nm] > 1:
            count[nm] = count.get(nm, 0) + 1
            k = count[nm]
            nm = nm + (roman[k - 1] if k <= 10 else f' {k}')
        out.append(nm)
    return out

def vectorize(prov, tolerance=0.8):
    """Province polygons in pixel coordinates (shared borders stay identical)."""
    shapes = rasterio.features.shapes(prov.astype(np.int32), mask=prov > 0, connectivity=4)
    polys = {}
    for geom, v in shapes:
        polys.setdefault(int(v), []).append(shape(geom))
    ids = sorted(polys)
    geoms = [shapely.MultiPolygon([p for p in polys[i]]) if len(polys[i]) > 1 else polys[i][0] for i in ids]
    simp = shapely.coverage_simplify(geoms, tolerance)
    return dict(zip(ids, simp))

def _rings(geom):
    for p in getattr(geom, 'geoms', [geom]):
        if p.is_empty:
            continue
        yield p.exterior
        yield from p.interiors

def encode_ring(coords):
    """Delta-encode a ring as integers in half-pixel units."""
    a = np.round(np.asarray(coords)[:-1] * 2).astype(np.int64)
    d = np.diff(a, axis=0, prepend=np.zeros((1, 2), np.int64))
    return d.ravel().tolist()

def edges(geoms):
    """Border polylines between neighbouring provinces and along coasts."""
    seg_owner = {}
    for pid, g in geoms.items():
        for ring in _rings(g):
            c = np.round(np.asarray(ring.coords) * 2).astype(np.int64)
            for k in range(len(c) - 1):
                a, b = tuple(c[k]), tuple(c[k + 1])
                key = (a, b) if a < b else (b, a)
                seg_owner.setdefault(key, []).append(pid)
    out = {}   # (p, q) -> list of polylines ; q = 0 for coast
    for pid, g in geoms.items():
        for ring in _rings(g):
            c = np.round(np.asarray(ring.coords) * 2).astype(np.int64)
            nb = []
            for k in range(len(c) - 1):
                a, b = tuple(c[k]), tuple(c[k + 1])
                key = (a, b) if a < b else (b, a)
                others = [o for o in seg_owner[key] if o != pid]
                nb.append(others[0] if others else 0)
            # split ring into runs of equal neighbour
            if not nb:
                continue
            start = 0
            # rotate so a run boundary is at index 0
            for k in range(len(nb)):
                if nb[k] != nb[k - 1]:
                    start = k
                    break
            order = list(range(start, len(nb))) + list(range(0, start))
            run, cur = [], None
            def flush():
                if run and (cur == 0 or pid < cur):
                    pts = [tuple(c[run[0]])] + [tuple(c[j + 1]) for j in run]
                    out.setdefault((pid, cur), []).append(pts)
            for j in order:
                if nb[j] != cur:
                    flush()
                    run, cur = [], nb[j]
                run.append(j)
            flush()
    res = []
    for (p, q), lines in out.items():
        for pts in lines:
            a = np.array(pts, np.int64)
            d = np.diff(a, axis=0, prepend=np.zeros((1, 2), np.int64))
            res.append([p, q, d.ravel().tolist()])
    return res
