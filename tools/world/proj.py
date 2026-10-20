"""Map projection (Miller cylindrical) and the pixel grid used for building the world."""
import numpy as np

W = 8192                      # width of the world raster in pixels
LAT_MIN, LAT_MAX = -56.0, 78.0  # cropped: no Antarctica, little Arctic

def _miller_y(lat_deg):
    phi = np.radians(lat_deg)
    return 1.25 * np.log(np.tan(np.pi / 4 + 0.4 * phi))

def _miller_lat(y):
    return np.degrees(2.5 * np.arctan(np.exp(0.8 * y)) - 0.625 * np.pi)

Y_TOP, Y_BOT = _miller_y(LAT_MAX), _miller_y(LAT_MIN)
SCALE = W / (2 * np.pi)       # pixels per radian of longitude
H = int(round((Y_TOP - Y_BOT) * SCALE))

def project(lon, lat):
    """lon/lat in degrees -> pixel x, y (y down)."""
    x = (np.asarray(lon) + 180.0) / 360.0 * W
    y = (Y_TOP - _miller_y(np.clip(lat, LAT_MIN - 5, LAT_MAX + 5))) * SCALE
    return x, y

def unproject(x, y):
    lon = np.asarray(x) / W * 360.0 - 180.0
    lat = _miller_lat(Y_TOP - np.asarray(y) / SCALE)
    return lon, lat

def pixel_lonlat():
    """Longitude per column and latitude per row of pixel centres."""
    lon, _ = unproject(np.arange(W) + 0.5, 0)
    _, lat = unproject(0, np.arange(H) + 0.5)
    return lon, lat

def pixel_area_km2():
    """Area of one pixel per row (km²)."""
    _, lat = pixel_lonlat()
    dlon = 2 * np.pi / W
    # dlat per pixel row from the inverse projection
    _, lat0 = unproject(0, np.arange(H))
    _, lat1 = unproject(0, np.arange(H) + 1)
    R = 6371.0
    return R * R * dlon * np.abs(np.sin(np.radians(lat0)) - np.sin(np.radians(lat1)))
