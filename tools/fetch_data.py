"""Download the open source data into data/raw/ (not stored in git).

Sources (all open, see DATA_SOURCES.md):
- Cliopatria (Seshat): historical polity borders, CC BY 4.0
- Natural Earth: land, lakes, rivers, regions, shaded relief rasters (public domain)
- Terrain Tiles on AWS (Mapzen terrarium format): elevation
"""
import io, os, sys, zipfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

RAW = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')
NE_VEC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
NE_RASTER = 'https://naturalearth.s3.amazonaws.com/50m_raster/'
CLIO = 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip'
CITIES = 'https://raw.githubusercontent.com/lutangar/cities.json/master/cities.json'  # GeoNames, CC BY 4.0
TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
TERRAIN_ZOOM = 4

def get(url):
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()

def fetch(url, dest, unzip=False):
    if os.path.exists(dest):
        return
    print('downloading', url)
    data = get(url)
    if unzip:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.endswith(('.tif', '.geojson')):
                    with open(os.path.join(RAW, os.path.basename(name)), 'wb') as f:
                        f.write(z.read(name))
        open(dest, 'w').write('ok')
    else:
        with open(dest, 'wb') as f:
            f.write(data)

def main():
    os.makedirs(os.path.join(RAW, 'terrain'), exist_ok=True)
    jobs = [(CLIO, os.path.join(RAW, 'cliopatria.done'), True)]
    for f in ['ne_10m_land', 'ne_10m_lakes', 'ne_10m_minor_islands',
              'ne_50m_rivers_lake_centerlines', 'ne_10m_geography_regions_polys',
              'ne_10m_populated_places_simple', 'ne_10m_geography_marine_polys',
              'ne_10m_rivers_lake_centerlines']:
        jobs.append((NE_VEC + f + '.geojson', os.path.join(RAW, f + '.geojson'), False))
    for f in ['NE2_50M_SR_W', 'HYP_50M_SR_W']:
        jobs.append((NE_RASTER + f + '.zip', os.path.join(RAW, f + '.done'), True))
    jobs.append((CITIES, os.path.join(RAW, 'cities.json'), False))
    n = 2 ** TERRAIN_ZOOM
    for x in range(n):
        for y in range(n):
            jobs.append((TERRAIN.format(z=TERRAIN_ZOOM, x=x, y=y),
                         os.path.join(RAW, 'terrain', f'{x}_{y}.png'), False))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: fetch(*j), jobs))
    print('done')

if __name__ == '__main__':
    main()
