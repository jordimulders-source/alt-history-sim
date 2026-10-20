"""Environment rasters on the world grid: land, elevation, vegetation colour -> terrain."""
import glob, os
import numpy as np
from PIL import Image
from .proj import W, H, pixel_lonlat
from .raster import burn_mask, load

Image.MAX_IMAGE_PIXELS = None
RAW = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'raw')

def land_mask():
    land = burn_mask([f['geometry'] for f in load(f'{RAW}/ne_10m_land.geojson')])
    land |= burn_mask([f['geometry'] for f in load(f'{RAW}/ne_10m_minor_islands.geojson')])
    lakes = burn_mask([f['geometry'] for f in load(f'{RAW}/ne_10m_lakes.geojson')
                       if (f['properties'].get('scalerank') or 9) <= 5])
    return land & ~lakes, lakes

def sample_equirect(img):
    """Sample an equirectangular (lon -180..180, lat 90..-90) image onto our grid (nearest)."""
    h, w = img.shape[:2]
    lon, lat = pixel_lonlat()
    xs = np.clip(((lon + 180) / 360 * w).astype(int), 0, w - 1)
    ys = np.clip(((90 - lat) / 180 * h).astype(int), 0, h - 1)
    return img[ys[:, None], xs[None, :]]

def ne2_colour():
    im = np.array(Image.open(f'{RAW}/NE2_50M_SR_W.tif').convert('RGB'))
    return sample_equirect(im)

def elevation():
    """Elevation in metres from the terrarium tiles (zoom 4, web mercator)."""
    files = glob.glob(f'{RAW}/terrain/*.png')
    z = 4
    n = 2 ** z
    mosaic = np.zeros((n * 256, n * 256), np.float32)
    for f in files:
        x, y = map(int, os.path.basename(f)[:-4].split('_'))
        t = np.array(Image.open(f).convert('RGB')).astype(np.float32)
        mosaic[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    lon, lat = pixel_lonlat()
    size = n * 256
    xs = np.clip(((lon + 180) / 360 * size).astype(int), 0, size - 1)
    latr = np.radians(np.clip(lat, -85, 85))
    ys = np.clip(((1 - np.log(np.tan(latr) + 1 / np.cos(latr)) / np.pi) / 2 * size).astype(int), 0, size - 1)
    return mosaic[ys[:, None], xs[None, :]]

# terrain classes (index into TERRAINS)
TERRAINS = ['farmland', 'grassland', 'forest', 'hills', 'mountains', 'steppe', 'desert',
            'marsh', 'jungle', 'tundra', 'glacier', 'coastal_desert']
FERTILITY = {'farmland': 1.0, 'grassland': 0.75, 'forest': 0.4, 'hills': 0.55, 'mountains': 0.2,
             'steppe': 0.3, 'desert': 0.03, 'marsh': 0.3, 'jungle': 0.3, 'tundra': 0.04,
             'glacier': 0.0, 'coastal_desert': 0.15}

def classify(col, elev, rough, lat):
    """Per-pixel terrain from vegetation colour, elevation and roughness."""
    r, g, b = [col[..., i].astype(np.int16) for i in range(3)]
    v = g - r
    lum = (r + g + b) / 3
    alat = np.abs(lat)[:, None] * np.ones_like(v)
    t = np.full(v.shape, TERRAINS.index('farmland'), np.uint8)
    t[v < 12] = TERRAINS.index('grassland')
    t[v < 1] = TERRAINS.index('steppe')
    t[v < -12] = TERRAINS.index('desert')
    forest_t = 28 - 9 * np.clip((alat - 47) / 12, 0, 1)
    t[v >= forest_t] = TERRAINS.index('forest')
    t[(v >= 38) & (alat < 23)] = TERRAINS.index('jungle')
    t[(alat > 64) & (v < 20)] = TERRAINS.index('tundra')
    t[(lum > 222) & (b > r + 8)] = TERRAINS.index('glacier')
    hills = (rough > 140) | (elev > 900)
    mountains = (rough > 380) | (elev > 2000)
    keep = ~np.isin(t, [TERRAINS.index('glacier')])
    t[hills & keep] = TERRAINS.index('hills')
    t[mountains & keep] = TERRAINS.index('mountains')
    return t
