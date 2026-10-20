"""Divide every state's land into provinces (weighted k-means with warped, organic borders)."""
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from PIL import Image
from .proj import W, H, pixel_lonlat, unproject
from .owners import unit

def detail_weight(lon, lat):
    """1 in the detailed core (Europe, Middle East, North Africa), lower elsewhere."""
    lo, la = lon[None, :], lat[:, None]
    core = (lo > -26) & (lo < 66) & (la > 8) & (la < 72)
    near = (lo > -35) & (lo < 80) & (la > 0) & (la < 75)
    return np.where(core, 1.0, np.where(near, 0.45, 0.2)).astype(np.float32)

def smooth_noise(seed, cells, octaves=3):
    """Low-frequency noise field of shape (H, W), values roughly in -1..1."""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp = 1.0
    for o in range(octaves):
        cw = cells * 2 ** o
        ch = max(2, int(cw * H / W))
        small = rng.standard_normal((ch, cw)).astype(np.float32)
        out += amp * np.array(Image.fromarray(small).resize((W, H), Image.BICUBIC))
        amp *= 0.5
    return out / 1.5

def build_provinces(land, owner, weight, area, n_target, seed=1444):
    lon, lat = pixel_lonlat()
    # warped pixel coordinates -> organic borders
    wx = smooth_noise(seed, 180) * 7.0
    wy = smooth_noise(seed + 1, 180) * 7.0
    prov = np.zeros((H, W), np.int32)
    unit_w = weight[land].sum() / n_target
    next_id = 1
    rng = np.random.default_rng(seed)
    pending_small = []
    for o in np.unique(owner[land]):
        omask = land & (owner == o)
        lab, n = ndimage.label(omask, structure=np.ones((3, 3)))
        objs = ndimage.find_objects(lab)
        comps = []
        for c in range(1, n + 1):
            sl = objs[c - 1]
            m = lab[sl] == c
            wsum = weight[sl][m].sum()
            comps.append((c, sl, m, wsum))
        comps.sort(key=lambda t: -t[3])
        for idx, (c, sl, m, wsum) in enumerate(comps):
            k = int(round(wsum / unit_w))
            if k == 0:
                if idx == 0 or wsum >= 0.3 * unit_w:
                    k = 1
                else:
                    pending_small.append((sl, m))
                    continue
            ys, xs = np.nonzero(m)
            ys = ys + sl[0].start
            xs = xs + sl[1].start
            if k == 1:
                prov[ys, xs] = next_id
                next_id += 1
                continue
            gx = xs + wx[ys, xs]
            gy = ys + wy[ys, xs]
            glon, glat = unproject(gx, gy)
            P = unit(glon, glat)
            wt = weight[ys, xs]
            # k-means++ style init on a sample
            samp = rng.choice(len(ys), size=min(len(ys), 60000), replace=False)
            Ps, ws = P[samp], wt[samp]
            cent = [Ps[rng.choice(len(samp), p=ws / ws.sum())]]
            d2 = ((Ps - cent[0]) ** 2).sum(1)
            for _ in range(1, k):
                p = d2 * ws
                cent.append(Ps[rng.choice(len(samp), p=p / p.sum())])
                d2 = np.minimum(d2, ((Ps - cent[-1]) ** 2).sum(1))
            cent = np.array(cent)
            for _ in range(20):
                _, a = cKDTree(cent).query(Ps)
                for j in range(k):
                    sel = a == j
                    if sel.any():
                        v = (Ps[sel] * ws[sel, None]).sum(0)
                        cent[j] = v / np.linalg.norm(v)
            _, a = cKDTree(cent).query(P)
            prov[ys, xs] = next_id + a
            next_id += k
    # tiny islands join the nearest province of the same owner (or become their own)
    if pending_small:
        dist, (iy, ix) = ndimage.distance_transform_edt(prov == 0, return_indices=True)
        for sl, m in pending_small:
            ys, xs = np.nonzero(m)
            ys = ys + sl[0].start
            xs = xs + sl[1].start
            y0, x0 = ys[0], xs[0]
            p = prov[iy[y0, x0], ix[y0, x0]]
            area_km2 = area[ys, xs].sum()
            if p and owner[iy[y0, x0], ix[y0, x0]] == owner[y0, x0] and dist[y0, x0] < 400:
                prov[ys, xs] = p
            elif owner[y0, x0] == 0 and area_km2 < 600:
                continue                      # tiny unclaimed island: stays empty
            else:
                prov[ys, xs] = next_id
                next_id += 1
    prov = make_contiguous(prov, owner, land)
    # small holes of land without a province (left over from the steps above) join the nearest one
    holes = land & (prov == 0)
    if holes.any():
        dist, (iy, ix) = ndimage.distance_transform_edt(prov == 0, return_indices=True)
        fill = holes & (dist <= 4)
        prov[fill] = prov[iy[fill], ix[fill]]
    # renumber 1..N
    ids = np.unique(prov[prov > 0])
    remap = np.zeros(prov.max() + 1, np.int32)
    remap[ids] = np.arange(1, len(ids) + 1)
    return remap[prov]

def make_contiguous(prov, owner, land):
    """Each province keeps its largest piece per land mass; stray fragments join a neighbour."""
    landlab, _ = ndimage.label(land, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(prov)
    stray = np.zeros_like(land)
    for pid, sl in enumerate(objs, 1):
        if sl is None:
            continue
        m = prov[sl] == pid
        lab, n = ndimage.label(m, structure=np.ones((3, 3)))
        if n <= 1:
            continue
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        ll = landlab[sl]
        # keep the largest piece on each land mass
        keep = np.zeros(n + 1, bool)
        best = {}
        for c in range(1, n + 1):
            lm = ll[lab == c][0]
            if lm not in best or sizes[c - 1] > sizes[best[lm] - 1]:
                best[lm] = c
        for c in best.values():
            keep[c] = True
        drop = (~keep[lab]) & m
        stray[sl] |= drop
    for _ in range(50):
        if not stray.any():
            break
        # assign stray pixels to the most common same-owner neighbour province
        ys, xs = np.nonzero(stray)
        done = np.zeros(len(ys), bool)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = np.clip(ys + dy, 0, H - 1), np.clip(xs + dx, 0, W - 1)
            ok = (~done) & (~stray[ny, nx]) & (prov[ny, nx] > 0) & (owner[ny, nx] == owner[ys, xs]) \
                 & (prov[ny, nx] != prov[ys, xs])
            prov[ys[ok], xs[ok]] = prov[ny[ok], nx[ok]]
            done |= ok
        stray[ys[done], xs[done]] = False
    return prov
