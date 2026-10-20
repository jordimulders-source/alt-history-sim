"""Save map images of a timeline for a series of years (needs: pip install playwright, and Chromium).

python3 tools/export_maps.py --seed 42 --years 1444 1494 1544 --style atlas political --out runs/seed_42
"""
import argparse, base64, functools, http.server, os, threading
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
        pg.add_style_tag(content='.bar, .panel, .tooltip { display: none !important; }')
        pg.evaluate(f'atlasApp.fit({a.view[0]}, {a.view[1]}, {a.view[2]}, {a.view[3]})')
        for style in a.style:
            pg.evaluate(f'atlasApp.setStyle("{style}")')
            pg.wait_for_timeout(2500)
            for y in a.years:
                pg.evaluate(f'atlasApp.setYear({y})')
                pg.wait_for_timeout(300)
                data = pg.evaluate('atlasApp.map.exportPNG()')
                path = os.path.join(out, f'map_{y}_{style}.png')
                open(path, 'wb').write(base64.b64decode(data.split(',')[1]))
                print('saved', os.path.relpath(path, ROOT))
        b.close()

if __name__ == '__main__':
    main()
