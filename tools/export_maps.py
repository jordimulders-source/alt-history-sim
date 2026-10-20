"""Save map images of a timeline for a series of years (needs: pip install playwright, and Chromium).

python3 tools/export_maps.py --seed 42 --years 1444 1494 1544 --style atlas political --out runs/seed_42

A timelapse film (one frame per year step; mp4 with ffmpeg, otherwise an animated gif):
python3 tools/export_maps.py --seed 42 --timelapse 2 --size 1600x1000
"""
import argparse, base64, functools, http.server, io, os, shutil, subprocess, tempfile, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', default='1444')
    ap.add_argument('--years', nargs='+', type=int, default=[1444, 1494, 1544])
    ap.add_argument('--style', nargs='+', default=['atlas'])
    ap.add_argument('--size', default='2400x1500')
    ap.add_argument('--view', nargs=4, type=float, default=[-12, 70, 62, 14], help='lon0 lat0 lon1 lat1')
    ap.add_argument('--chromium', default=os.environ.get('CHROMIUM'))
    ap.add_argument('--out', default=None)
    ap.add_argument('--timelapse', type=int, default=0, help='make a film with a frame every N years')
    ap.add_argument('--fps', type=int, default=8)
    a = ap.parse_args()
    out = a.out or os.path.join(ROOT, 'runs', f'seed_{a.seed}')
    os.makedirs(out, exist_ok=True)
    w, h = map(int, a.size.split('x'))
    # serve the page over http (images loaded from file:// cannot be exported from a canvas)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=os.path.join(ROOT, 'web'))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/index.html#s{a.seed}'
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=a.chromium) if a.chromium else p.chromium.launch()
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.goto(url)
        pg.wait_for_function('window.atlasApp && window.atlasApp.ready()', timeout=120000)
        if a.timelapse:
            last = pg.evaluate('+document.getElementById("slider").max')
            a.years = list(range(1444, last + 1, a.timelapse))
            if a.years[-1] != last:
                a.years.append(last)
        # wait until the page has written history as far as needed
        pg.wait_for_function(f'atlasApp.written() >= {max(a.years)}', timeout=600000)
        pg.add_style_tag(content='.bar, .panel, .tooltip, .cmp-label { display: none !important; }')
        pg.evaluate(f'atlasApp.fit({a.view[0]}, {a.view[1]}, {a.view[2]}, {a.view[3]})')
        frames = []
        for style in a.style:
            pg.evaluate(f'atlasApp.setStyle("{style}")')
            pg.wait_for_timeout(2500)
            for y in a.years:
                pg.evaluate(f'atlasApp.setYear({y})')
                pg.wait_for_timeout(300)
                data = pg.evaluate('atlasApp.map.exportPNG()')
                png = base64.b64decode(data.split(',')[1])
                if a.timelapse:
                    frames.append(stamp(png, y, pg.evaluate('document.getElementById("age").textContent')))
                    continue
                path = os.path.join(out, f'map_{y}_{style}.png')
                open(path, 'wb').write(png)
                print('saved', os.path.relpath(path, ROOT))
            if a.timelapse:
                film(frames, os.path.join(out, f'timelapse_{style}'), a.fps)
                frames.clear()
        b.close()

def stamp(png, year, age):
    """Write the year (and the age) in a small cartouche in the lower left corner of a frame."""
    from PIL import Image, ImageDraw, ImageFont
    im = Image.open(io.BytesIO(png)).convert('RGB')
    d = ImageDraw.Draw(im, 'RGBA')
    def font(size, names):
        for n in names:
            try:
                return ImageFont.truetype(n, size)
            except OSError:
                pass
        return ImageFont.load_default()
    big = font(max(28, im.width // 28), ['DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'])
    small = font(max(14, im.width // 70), ['DejaVuSerif-Italic.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'])
    pad = im.width // 60
    w = max(d.textlength(str(year), font=big), d.textlength(age, font=small)) + 2 * pad
    h = big.size + small.size + 2 * pad
    x0, y0 = pad, im.height - h - pad
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=8, fill=(239, 228, 200, 225), outline=(122, 36, 20, 255), width=2)
    d.text((x0 + pad, y0 + pad * 0.6), str(year), font=big, fill=(122, 36, 20))
    d.text((x0 + pad, y0 + pad * 0.8 + big.size), age, font=small, fill=(60, 45, 30))
    out = io.BytesIO()
    im.save(out, 'PNG')
    return out.getvalue()

def film(frames, base, fps):
    """Frames (png bytes) -> base.mp4 with ffmpeg, otherwise base.gif."""
    if shutil.which('ffmpeg'):
        with tempfile.TemporaryDirectory() as d:
            for i, f in enumerate(frames):
                open(os.path.join(d, f'{i:05d}.png'), 'wb').write(f)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(d, '%05d.png'),
                            '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', base + '.mp4'], check=True)
        print('saved', os.path.relpath(base + '.mp4', ROOT))
        return
    from PIL import Image
    imgs = [Image.open(io.BytesIO(f)).convert('P', palette=Image.ADAPTIVE) for f in frames]
    imgs[0].save(base + '.gif', save_all=True, append_images=imgs[1:], duration=int(1000 / fps), loop=0)
    print('saved', os.path.relpath(base + '.gif', ROOT))

if __name__ == '__main__':
    main()
