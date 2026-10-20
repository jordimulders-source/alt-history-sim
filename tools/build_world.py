"""Build the 1444 world: provinces, terrain, states and the base map images.

Run:  python3 tools/fetch_data.py   (once, downloads open data to data/raw/)
      python3 tools/build_world.py  (writes web/data/*)
"""
import json, os, sys, time
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from tools.world.proj import W, H, pixel_lonlat, pixel_area_km2
from tools.world import env
from tools.world.owners import build_owners
from tools.world.provinces import build_provinces, detail_weight

ROOT = os.path.join(os.path.dirname(__file__), '..')
BUILD = f'{ROOT}/data/build'
N_PROVINCES = 2400

def log(*a):
    print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)

def stage_grid():
    path = f'{BUILD}/grid.npz'
    if os.path.exists(path):
        return dict(np.load(path, allow_pickle=True))
    os.makedirs(BUILD, exist_ok=True)
    log('land mask'); land, lakes = env.land_mask()
    log('owners'); owner, tags, states = build_owners(land)
    log('environment')
    col = env.ne2_colour()
    elev = env.elevation()
    elev[~land] = 0
    lon, lat = pixel_lonlat()
    rough = ndimage.generic_filter(elev[::4, ::4], np.std, size=3)
    rough = np.kron(rough, np.ones((4, 4), np.float32))[:H, :W]
    terrain = env.classify(col, elev, rough, lat)
    fert = np.array([env.FERTILITY[t] for t in env.TERRAINS], np.float32)[terrain]
    area = pixel_area_km2()[:, None] * np.ones((1, W), np.float32)
    weight = area * detail_weight(lon, lat) * (0.35 + fert)
    weight[owner == 0] *= 0.2
    weight[~land] = 0
    log('provinces')
    prov = build_provinces(land, owner, weight, area, N_PROVINCES)
    log('provinces:', prov.max())
    g = dict(land=land, lakes=lakes, owner=owner, tags=np.array(tags), elev=elev.astype(np.float32),
             terrain=terrain, prov=prov, col=col)
    np.savez_compressed(path, **g)
    return g


def stage_basemaps(g):
    from tools.world import basemap
    out = f'{ROOT}/web/data'
    os.makedirs(out, exist_ok=True)
    for name, fn in (('atlas', basemap.atlas), ('political', basemap.political)):
        log('basemap', name)
        img = fn(g)
        basemap.save(img, f'{out}/base_{name}.jpg')
        basemap.save(img, f'{out}/base_{name}_small.jpg', (W // 2, H // 2))

def stage_shapes(g):
    """Province shapes, edges and static attributes -> data/build/shapes.json (slow part, cached)."""
    from tools.world import export
    path = f'{BUILD}/shapes.json'
    if os.path.exists(path):
        return json.load(open(path))
    log('province stats'); st = export.province_stats(g)
    log('names'); names = export.province_names(g, st, list(g['tags']))
    log('vectorize'); geoms = export.vectorize(g['prov'])
    log('edges'); edges = export.edges(geoms, g['prov'])
    shapes = {}
    for pid, geom in geoms.items():
        shapes[pid] = [export.encode_ring(r.coords) for r in export._rings(geom)]
    lon, lat = pixel_lonlat()
    provs = []
    for i in range(len(st['area'])):
        provs.append({
            'id': i + 1, 'name': names[i], 'owner_idx': int(st['owner'][i]),
            'terrain': env.TERRAINS[st['terrain'][i]], 'area': round(float(st['area'][i])),
            'fert': round(float(st['fert'][i]), 3), 'elev': round(float(st['elev'][i])),
            'coastal': bool(st['coastal'][i]),
            'label': [round(float(st['lx'][i]), 1), round(float(st['ly'][i]), 1)],
            'lonlat': [round(float(lon[int(st['lx'][i])]), 2), round(float(lat[int(st['ly'][i])]), 2)],
            'shape': shapes.get(i + 1, []),
        })
    res = {'provinces': provs, 'edges': edges, 'adj': [list(map(int, p)) for p in st['adj']]}
    json.dump(res, open(path, 'w'))
    return res

# rough people per km² on the best land, per world region
def region_density(lon, lat):
    if -26 < lon < 66 and lat > 8:
        return 22.0
    if 60 <= lon < 150 and -12 < lat < 45:
        return 45.0
    if -20 < lon < 55 and lat <= 8:
        return 7.0
    if lon < -30:
        return 2.5
    return 1.0

def nearest_anchor(points, anchors):
    """points (n,2) lon/lat, anchors list of (key, lon, lat) -> key per point (spherical nearest)."""
    from tools.world.owners import unit
    P = unit(points[:, 0], points[:, 1])
    A = unit(np.array([a[1] for a in anchors]), np.array([a[2] for a in anchors]))
    return [anchors[i][0] for i in np.argmax(P @ A.T, axis=1)], np.max(P @ A.T, axis=1)

def centres_to_provinces(centres, provs, prov_grid):
    """The province that contains each trade centre (the nearest one if the point lies at sea)."""
    from tools.world.owners import unit
    from tools.world.proj import project
    pts = np.array([p['lonlat'] for p in provs], float)
    P = unit(pts[:, 0], pts[:, 1])
    out = {}
    for k, c in centres.items():
        x, y = project(*c['at'])
        pid = int(prov_grid[int(y), int(x)])
        if pid == 0:
            # look around a little for land
            win = prov_grid[max(0, int(y) - 6):int(y) + 7, max(0, int(x) - 6):int(x) + 7]
            vals = win[win > 0]
            pid = int(np.bincount(vals).argmax()) if len(vals) else provs[int(np.argmax(P @ unit(*c['at'])))]['id']
        out[k] = {'prov': pid, 'value': c['value'], 'name': c.get('name', k.capitalize())}
    return out

def assign_goods(provs, trade, cultures):
    from tools.world.owners import unit
    rng = np.random.default_rng(1444)
    pts = np.array([p['lonlat'] for p in provs], float)
    P = unit(pts[:, 0], pts[:, 1])
    special = [None] * len(provs)
    for sp in trade['special']:
        d = np.arccos(np.clip(P @ unit(*sp['at']), -1, 1)) * 6371
        for i in np.nonzero(d <= sp['r'])[0]:
            if special[i] is None:
                special[i] = sp['good']
    for i, p in enumerate(provs):
        lon, lat = p['lonlat']
        t, coastal = p['terrain'], p['coastal']
        r = rng.random()
        if special[i]:
            g = special[i]
        elif t == 'mountains':
            g = 'iron' if r < 0.22 else 'copper' if r < 0.32 else 'salt' if r < 0.4 else 'livestock' if r < 0.75 else 'wool'
        elif t == 'hills':
            wine = -10 < lon < 30 and 36 < lat < 48
            g = 'wine' if wine and r < 0.2 else 'iron' if r < 0.32 else 'copper' if r < 0.37 else 'salt' if r < 0.43 else 'livestock' if r < 0.78 else 'wool'
        elif t == 'desert' or t == 'coastal_desert':
            g = 'incense' if 40 < lon < 60 and lat < 25 else 'salt' if r < 0.3 else 'livestock'
        elif t == 'tundra' or t == 'glacier':
            g = 'furs' if r < 0.7 else 'fish'
        elif t == 'jungle':
            g = 'spices' if lon > 70 else 'ivory' if -20 < lon < 50 else 'sugar' if r < 0.3 else 'dyes'
        elif t == 'forest':
            g = 'furs' if (lon > 20 and lat > 52) or lat > 60 else 'timber'
        elif t in ('steppe', 'grassland'):
            g = 'livestock' if r < 0.6 else 'wool' if r < 0.8 else 'grain'
        elif t == 'marsh':
            g = 'fish' if coastal else 'livestock'
        else:  # farmland
            wine = -10 < lon < 30 and 36 < lat < 50
            if wine and r < 0.3: g = 'wine'
            elif 100 < lon and lat < 35 and r < 0.4: g = 'silk' if r < 0.2 else 'tea'
            elif 68 < lon < 92 and lat < 28 and r < 0.4: g = 'cotton'
            elif lat < 30 and -20 < lon < 40 and r < 0.2: g = 'sugar'
            else: g = 'grain'
        if coastal and lat > 50 and not special[i] and g in ('grain', 'livestock', 'timber') and rng.random() < 0.4:
            g = 'fish'
        p['good'] = g

def stage_world(g, sh):
    """Combine shapes, curated states, rulers and cultures into web/data/world.js."""
    import yaml
    cur = f'{ROOT}/data/curated'
    from tools.world.owners import all_states
    states_cfg, _ = all_states()
    rulers = yaml.safe_load(open(f'{cur}/rulers_1444.yaml')) or {}
    cultures = yaml.safe_load(open(os.environ.get('CULTURES', f'{cur}/cultures.yaml')))
    pop_target = yaml.safe_load(open(f'{cur}/population_1444.yaml'))
    config = yaml.safe_load(open(f'{ROOT}/config.yaml'))
    tags = list(g['tags'])
    provs = sh['provinces']
    for p in provs:
        p['owner'] = tags[p.pop('owner_idx')] if p['owner_idx'] else None
    pts = np.array([p['lonlat'] for p in provs], float)
    # culture & religion
    anchors = [(k, a[0], a[1]) for k, c in cultures['cultures'].items() for a in c['anchors']]
    cul, _ = nearest_anchor(pts, anchors)
    for p, c in zip(provs, cul):
        p['culture'] = c
        p['religion'] = cultures['cultures'][c]['religion']
    from tools.world.owners import unit
    P = unit(pts[:, 0], pts[:, 1])
    for ov in cultures.get('religion_overrides', []) or []:
        A = unit(np.array([a[0] for a in ov['anchors']]), np.array([a[1] for a in ov['anchors']]))
        d = np.arccos(np.clip(P @ A.T, -1, 1)).min(1) * 6371
        for i in np.nonzero(d <= ov['radius_km'])[0]:
            provs[i]['religion'] = ov['religion']
    # trade goods: famous products first, then rules by terrain, climate and region
    trade = yaml.safe_load(open(f'{cur}/trade.yaml'))
    assign_goods(provs, trade, cultures)
    # population
    for p in provs:
        dens = region_density(*p['lonlat']) * (p['fert'] ** 1.4 + 0.02)
        if p['owner'] is None:
            dens *= 0.3
        p['pop'] = p['area'] * dens
    by_owner = {}
    for p in provs:
        by_owner.setdefault(p['owner'], []).append(p)
    for tag, target in pop_target.items():
        ps = by_owner.get(tag, [])
        tot = sum(p['pop'] for p in ps)
        for p in ps:
            p['pop'] = p['pop'] * target * 1e6 / max(tot, 1)
    for p in provs:
        p['pop'] = int(round(p['pop'] / 100) * 100)
    # states (only those that own land)
    states = {}
    for tag in tags[1:]:
        ps = by_owner.get(tag)
        if not ps:
            continue
        s = states_cfg.get(tag, {})
        r = rulers.get(tag, {})
        cap = s.get('capital')
        if cap:
            d = np.arccos(np.clip(unit(np.array([q['lonlat'][0] for q in ps]), np.array([q['lonlat'][1] for q in ps])) @ unit(cap[0], cap[1]), -1, 1))
            capital = ps[int(np.argmin(d))]['id']
        else:
            capital = max(ps, key=lambda q: q['pop'])['id']
        # state culture/religion: majority by population
        cpop, rpop = {}, {}
        for q in ps:
            cpop[q['culture']] = cpop.get(q['culture'], 0) + q['pop']
            rpop[q['religion']] = rpop.get(q['religion'], 0) + q['pop']
        states[tag] = {
            'name': s.get('name', tag), 'color': s.get('color'), 'government': s.get('government', 'monarchy'),
            'succession': s.get('succession', 'primogeniture'), 'overlord': s.get('overlord'),
            'capital': capital,
            # the ruling culture is the culture of the capital (Venice is Venetian, not Greek)
            'culture': s.get('culture') or next(q['culture'] for q in ps if q['id'] == capital),
            'religion': s.get('religion') or next(q['religion'] for q in ps if q['id'] == capital),
            'ruler': r.get('ruler'), 'regent': r.get('regent'), 'fallback_heirs': r.get('fallback_heirs', []),
            'regnal_counts': r.get('regnal_counts', {}),
        }
    # characters: default culture/religion from their state
    chars = []
    for tag, r in rulers.items():
        for c in r.get('characters', []) or []:
            c = dict(c)
            c['tag'] = tag
            st = states.get(tag)
            if st:
                c.setdefault('culture', st['culture'])
                c.setdefault('religion', st['religion'])
            chars.append(c)
    # automatic colours for states without one
    rng = np.random.default_rng(5)
    for tag, s in states.items():
        if not s['color']:
            h = rng.random()
            import colorsys
            r_, g_, b_ = colorsys.hls_to_rgb(h, 0.62, 0.42)
            s['color'] = '#%02x%02x%02x' % (int(r_ * 255), int(g_ * 255), int(b_ * 255))
    diplomacy = yaml.safe_load(open(f'{cur}/diplomacy_1444.yaml'))
    # overlords from states.yaml count as vassals too
    for tag, s in states.items():
        if s.get('overlord'):
            diplomacy.setdefault('vassals', {})[tag] = s['overlord']
    known = set(states)
    diplomacy['alliances'] = [p for p in diplomacy.get('alliances', []) if p[0] in known and p[1] in known]
    diplomacy['rivals'] = [p for p in diplomacy.get('rivals', []) if p[0] in known and p[1] in known]
    diplomacy['vassals'] = {k: v for k, v in diplomacy.get('vassals', {}).items() if k in known and v in known}
    world = {
        'start': {'year': 1444, 'month': 1},
        'diplomacy': diplomacy,
        'size': [W, H],
        'config': config,
        'provinces': [{k: v for k, v in p.items() if k != 'shape'} for p in provs],
        'adj': sh['adj'],
        'states': states,
        'characters': chars,
        'cultures': {k: {'group': v.get('group'), 'religion': v['religion'], 'color': v.get('color'),
                         'names': v.get('names', {}), 'dynasties': v.get('dynasties', [])}
                     for k, v in cultures['cultures'].items()},
        'culture_groups': cultures.get('culture_groups', {}),
        'religions': cultures['religions'],
        'terrains': env.TERRAINS,
        'goods': trade['goods'],
        'trade': {'routes': trade['routes'], 'centres': centres_to_provinces(trade['centres'], provs, g['prov'])},
    }
    out = f'{ROOT}/web/data'
    with open(f'{out}/world.js', 'w') as f:
        f.write('window.WORLD = ' + json.dumps(world, ensure_ascii=False, separators=(',', ':')) + ';\n')
    shapes = {'provinces': {p['id']: p['shape'] for p in provs}, 'edges': sh['edges']}
    with open(f'{out}/shapes.js', 'w') as f:
        f.write('window.SHAPES = ' + json.dumps(shapes, separators=(',', ':')) + ';\n')
    log('world.js: %d provinces, %d states, %d characters, population %.0f M' % (
        len(provs), len(states), len(chars), sum(p['pop'] for p in provs) / 1e6))

if __name__ == '__main__':
    g = stage_grid()
    if 'basemaps' in sys.argv or 'all' in sys.argv:
        stage_basemaps(g)
    sh = stage_shapes(g)
    stage_world(g, sh)
