"""Assign every land pixel to a state at the start date, from Cliopatria + curated splits."""
import os, re
import numpy as np
import yaml
from scipy import ndimage
from .proj import W, H, pixel_lonlat, pixel_area_km2
from .raster import burn, load

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
START_YEAR = 1444
R_KM = 6371.0

def unit(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)

def pixel_units(ys, xs):
    lon, lat = pixel_lonlat()
    return unit(lon[xs], lat[ys])

def auto_tag(name, used):
    base = re.sub(r'[^A-Z]', '', name.upper().replace('KINGDOM OF ', '').replace('SULTANATE', ''))[:3] or 'XXX'
    tag, i = base, 0
    while tag in used:
        i += 1
        tag = base[:2] + str(i)
    return tag

def start_polities():
    feats = [f for f in load(f'{ROOT}/data/raw/cliopatria_polities_only_v021.geojson')
             if f['properties']['FromYear'] <= START_YEAR <= f['properties']['ToYear']
             and not f['properties']['Name'].startswith('(') and f['properties']['Type'] == 'POLITY']
    feats.sort(key=lambda f: -f['properties']['Area'])
    return feats

def all_states(feats=None):
    """Curated states + one automatic state for every Cliopatria polity not mentioned in states.yaml."""
    states = yaml.safe_load(open(f'{ROOT}/data/curated/states.yaml'))
    feats = feats if feats is not None else start_polities()
    clio_to_tag = {}
    for tag, s in states.items():
        for c in s.get('clio', []):
            clio_to_tag[c] = tag
    used = set(states)
    for f in feats:
        n = f['properties']['Name']
        if n not in clio_to_tag and n not in ('Holy Roman Empire Minor States', 'Kalmar Union'):
            t = auto_tag(n, used)
            used.add(t)
            states[t] = {'name': n, 'clio': [n], 'auto': True}
            clio_to_tag[n] = t
    return states, clio_to_tag

def build_owners(land):
    feats = start_polities()
    states, clio_to_tag = all_states(feats)
    names = [f['properties']['Name'] for f in feats]
    clio = np.zeros((H, W), np.int32)
    burn([f['geometry'] for f in feats], range(1, len(feats) + 1), clio)

    tags = ['---'] + list(states)          # index 0 = unowned
    tag_idx = {t: i for i, t in enumerate(tags)}
    owner = np.zeros((H, W), np.int32)
    for i, n in enumerate(names, 1):
        if n in clio_to_tag:
            owner[clio == i] = tag_idx[clio_to_tag[n]]

    # splits: carve parents
    parents = {}
    for tag, s in states.items():
        if 'split_from' in s:
            parents.setdefault(s['split_from'], []).append(tag)
    for parent, members in parents.items():
        ids = [i for i, n in enumerate(names, 1) if n == parent]
        if not ids:
            print('  split parent not found:', parent)
            continue
        ys, xs = np.nonzero(np.isin(clio, ids))
        if len(ys) == 0:
            continue
        P = pixel_units(ys, xs)
        best = np.full(len(ys), np.inf)
        best_any = np.full(len(ys), np.inf)
        who = np.full(len(ys), -1)
        who_any = np.full(len(ys), -1)
        for k, m in enumerate(members):
            A = unit(*np.array(states[m]['anchors'], float).T)
            d = np.full(len(ys), np.inf)
            for a in A:
                d = np.minimum(d, np.arccos(np.clip(P @ a, -1, 1)) * R_KM)
            rad = states[m].get('radius_km', np.inf)
            ok = (d <= rad) & (d < best)
            best[ok] = d[ok]
            who[ok] = k
            ok2 = d < best_any
            best_any[ok2] = d[ok2]
            who_any[ok2] = k
        parent_is_state = parent in clio_to_tag
        if not parent_is_state:      # land of a non-state parent always goes to a member
            unr = who < 0
            unlimited = np.array([states[m].get('radius_km') is None for m in members])
            # nearest member without a radius limit
            best2 = np.full(len(ys), np.inf)
            for k, m in enumerate(members):
                if not unlimited[k]:
                    continue
                A = unit(*np.array(states[m]['anchors'], float).T)
                d = np.full(len(ys), np.inf)
                for a in A:
                    d = np.minimum(d, np.arccos(np.clip(P @ a, -1, 1)) * R_KM)
                ok = unr & (d < best2)
                best2[ok] = d[ok]
                who[ok] = k
        sel = who >= 0
        owner[ys[sel], xs[sel]] = [tag_idx[members[k]] for k in who[sel]]

    owner[~land] = 0
    # fill small coastal gaps (Cliopatria polygons are coarser than the coastline)
    area = pixel_area_km2()
    unowned = land & (owner == 0)
    dist, (iy, ix) = ndimage.distance_transform_edt(owner == 0, return_indices=True)
    fill = unowned & (dist <= 6)
    owner[fill] = owner[iy[fill], ix[fill]]

    # claims on unowned land
    lon, lat = pixel_lonlat()
    for tag, s in states.items():
        for c in s.get('claim', []):
            A = np.array(c['anchors'], float)
            r = c['radius_km']
            for alon, alat in A:
                # bounding box in pixels
                dlat = r / 111.0
                dlon = r / (111.0 * max(np.cos(np.radians(alat)), 0.1))
                cols = np.nonzero((lon >= alon - dlon) & (lon <= alon + dlon))[0]
                rows = np.nonzero((lat >= alat - dlat) & (lat <= alat + dlat))[0]
                if len(cols) == 0 or len(rows) == 0:
                    continue
                sub = owner[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
                lsub = land[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
                gy, gx = np.meshgrid(rows, cols, indexing='ij')
                P = unit(lon[gx], lat[gy])
                d = np.arccos(np.clip(P @ unit(alon, alat), -1, 1)) * R_KM
                m = (d <= r) & lsub & (sub == 0)
                sub[m] = tag_idx[tag]
    return owner, tags, states
