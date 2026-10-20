// Map rendering: painted base image, province fills, borders, labels, pan/zoom, picking.
(function (root) {
  const LABEL_FONT_ATLAS = '"IM Fell English SC", "IM Fell English", Georgia, serif';
  const LABEL_FONT_POL = '"Alegreya Sans SC", "Alegreya Sans", "Trebuchet MS", sans-serif';
  const PROV_FONT = '"IM Fell English", Georgia, serif';

  function decodeRing(arr) {
    const pts = new Float32Array(arr.length);
    let x = 0, y = 0;
    for (let i = 0; i < arr.length; i += 2) {
      x += arr[i]; y += arr[i + 1];
      pts[i] = x / 2; pts[i + 1] = y / 2;
    }
    return pts;
  }

  function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) { return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)); }
  function rgb(c, a) { return a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  // rotated rectangles for label collisions (separating axis test)
  function orientedBox(cx, cy, w, h, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), hw = w / 2, hh = h / 2;
    return [[cx - c * hw + s * hh, cy - s * hw - c * hh], [cx + c * hw + s * hh, cy + s * hw - c * hh],
      [cx + c * hw - s * hh, cy + s * hw + c * hh], [cx - c * hw - s * hh, cy - s * hw + c * hh]];
  }
  function boxesOverlap(A, B) {
    for (const P of [A, B]) {
      for (let i = 0; i < 2; i++) {
        const nx = P[i + 1][1] - P[i][1], ny = P[i][0] - P[i + 1][0];
        let a0 = 1e18, a1 = -1e18, b0 = 1e18, b1 = -1e18;
        for (const p of A) { const d = p[0] * nx + p[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
        for (const p of B) { const d = p[0] * nx + p[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
        if (a1 < b0 || b1 < a0) return false;
      }
    }
    return true;
  }

  class MapView {
    constructor(canvas, world, shapes, assets) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.world = world;
      this.W = world.size[0]; this.H = world.size[1];
      this.style = 'atlas';
      this.images = assets;          // {atlas: {small, large}, political: {...}}
      this.view = { x: 0, y: 0, s: 1 };
      this.selected = null;          // state tag
      this.hoverProv = null;
      this.markers = [];
      this.listeners = {};
      this._decode(shapes);
      this._bindInput();
      this.fillCanvas = document.createElement('canvas');
      this.FS = 0.5;                  // fill layer scale (4096 px wide)
      this.fillCanvas.width = Math.round(this.W * this.FS);
      this.fillCanvas.height = Math.round(this.H * this.FS);
      this.resize();
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

    _decode(shapes) {
      this.prov = {};
      this.grid = new Map();
      const G = 64;
      for (const p of this.world.provinces) {
        const rings = (shapes.provinces[p.id] || []).map(decodeRing);
        const path = new Path2D();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const r of rings) {
          path.moveTo(r[0], r[1]);
          for (let i = 2; i < r.length; i += 2) {
            path.lineTo(r[i], r[i + 1]);
            if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i];
            if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1];
          }
          path.closePath();
        }
        this.prov[p.id] = { p, rings, path, bbox: [x0, y0, x1, y1] };
        for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++)
          for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) {
            const k = gx * 10000 + gy;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push(p.id);
          }
      }
      this.G = G;
      this.edges = shapes.edges.map(([a, b, d]) => ({ a, b, pts: decodeRing(d) }));
    }

    // ---------- ownership ----------
    setOwners(ownerOf, states) {
      this.ownerOf = ownerOf;
      this.states = states;
      const fc = this.fillCanvas.getContext('2d');
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.clearRect(0, 0, this.fillCanvas.width, this.fillCanvas.height);
      fc.setTransform(this.FS, 0, 0, this.FS, 0, 0);
      const parchment = [233, 220, 184];
      for (const id in this.prov) {
        const tag = ownerOf[id];
        const mode = this.mode || 'realms';
        if (mode === 'realms' && (!tag || !states[tag])) continue;
        const p = this.prov[id].p;
        const cul = this.peoples ? this.peoples.cultKeys[this.peoples.cult[id]] : p.culture;
        const rel = this.peoples ? this.peoples.relKeys[this.peoples.rel[id]] : p.religion;
        const hex = mode === 'cultures' ? (this.world.cultures[cul] || {}).color
          : mode === 'faiths' ? (this.world.religions[rel] || {}).color
          : (mode === 'diplomacy' || mode === 'progress' || mode === 'politics') ? (tag && this.fillOverride && this.fillOverride[tag])
          : mode === 'economy' ? (this.provFill && this.provFill[id])
          : states[tag].color;
        if (!hex) continue;
        let c = hexToRgb(hex);
        if (this.style === 'atlas') c = mix(c, parchment, 0.18);
        fc.fillStyle = rgb(c);
        fc.fill(this.prov[id].path);
        fc.lineWidth = 1.2;
        fc.strokeStyle = rgb(c);
        fc.stroke(this.prov[id].path);   // closes hairline gaps between provinces
        // a realm in personal union is striped with the colour of the senior crown
        const senior = (mode === 'realms' || mode === 'diplomacy') && this.unionOf && this.unionOf[tag];
        if (senior && states[senior]) {
          fc.fillStyle = this._stripes(fc, states[senior].color);
          fc.fill(this.prov[id].path);
        }
      }
      // plague: sick provinces hatched in dark red (economy layer)
      if ((this.mode || 'realms') === 'economy' && this.sick && this.sick.length) {
        fc.fillStyle = this._hatch(fc, '#7a1414');
        for (const pid of this.sick) if (this.prov[pid]) fc.fill(this.prov[pid].path);
      }
      // occupied land: cross-hatched in the occupier's colour
      if (this.occ && this.occ.length && (this.mode || 'realms') !== 'economy') {
        for (const [pid, by] of this.occ) {
          const q = this.prov[pid];
          if (!q || !states[by]) continue;
          fc.fillStyle = this._hatch(fc, states[by].color);
          fc.fill(q.path);
        }
      }
      // borders
      this.stateBorders = new Path2D();
      this.provBorders = new Path2D();
      this.coast = new Path2D();
      this.borderList = [];
      for (const e of this.edges) {
        const oa = ownerOf[e.a] || null, ob = e.b ? (ownerOf[e.b] || null) : undefined;
        let target;
        if (e.b === 0) target = this.coast;
        else if (oa !== ob) { target = this.stateBorders; this.borderList.push(e); }
        else if (!oa) continue;            // no inner lines in unclaimed land
        else target = this.provBorders;
        const r = e.pts;
        target.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) target.lineTo(r[i], r[i + 1]);
      }
      this._computeLabels();
      this.draw();
    }

    _hatch(ctx, hex) {
      this._hatches = this._hatches || {};
      if (this._hatches[hex]) return this._hatches[hex];
      const c = document.createElement('canvas');
      c.width = c.height = 10;
      const g = c.getContext('2d');
      g.strokeStyle = hex;
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 10); g.moveTo(10, 0); g.lineTo(0, 10); g.stroke();
      const pat = ctx.createPattern(c, 'repeat');
      pat.setTransform(new DOMMatrix().scale(1 / this.FS));
      this._hatches[hex] = pat;
      return pat;
    }

    _stripes(ctx, hex) {
      this._patterns = this._patterns || {};
      if (this._patterns[hex]) return this._patterns[hex];
      const c = document.createElement('canvas');
      c.width = c.height = 12;
      const g = c.getContext('2d');
      g.strokeStyle = hex;
      g.lineWidth = 3.2;
      for (let k = -12; k <= 24; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - 12, 12); g.stroke(); }
      const pat = ctx.createPattern(c, 'repeat');
      pat.setTransform(new DOMMatrix().scale(1 / this.FS));   // stripes keep their size on screen
      this._patterns[hex] = pat;
      return pat;
    }

    // colours per realm for the diplomacy layer, and lines from the selected capital
    setDiplomacy(fill, lines) {
      const key = JSON.stringify(fill);
      this.diploLines = lines || [];
      if (key === this._fillKey) return;
      this._fillKey = key;
      this.fillOverride = fill;
      if (this.mode === 'diplomacy') this._dirty = true;
    }

    // land held by an enemy in war: hatched in the colour of the occupier
    setOccupation(list) {
      const key = JSON.stringify(list);
      if (key === this._occKey) return;
      this._occKey = key;
      this.occ = list;
      this._dirty = true;
    }

    setBattles(list) { this.battles = list; }

    // culture and faith of every province in the chosen year
    setPeoples(p) {
      if (p === this.peoples) return;
      this.peoples = p;
      if (this.mode === 'cultures' || this.mode === 'faiths') this._dirty = true;
    }

    // economy layer: a colour per province, the trade routes and the provinces with plague
    setEconomy(fill, routes, sick) {
      this.routeLines = routes;
      const key = (this._yearKey || '') + JSON.stringify(sick);
      if (this.mode !== 'economy') { this.provFill = fill; this.sick = sick; return; }
      if (fill === this.provFill && key === this._sickKey) return;
      this.provFill = fill; this.sick = sick; this._sickKey = key;
      this._dirty = true;
    }

    _drawRoutes(ctx, px) {
      if (this.mode !== 'economy' || !this.routeLines) return;
      const atlas = this.style === 'atlas';
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const r of this.routeLines) {
        const w = (1.2 + Math.sqrt(r.value) * 0.75) * px;
        const path = new Path2D();
        r.pts.forEach(([x, y], i) => {
          if (!i) { path.moveTo(x, y); return; }
          const [x0, y0] = r.pts[i - 1];
          const mx = (x0 + x) / 2, my = (y0 + y) / 2, dx = x - x0, dy = y - y0, len = Math.hypot(dx, dy) || 1;
          const b = Math.min(60, len * 0.12) * (i % 2 ? 1 : -1);
          path.quadraticCurveTo(mx - dy / len * b, my + dx / len * b, x, y);
        });
        ctx.setLineDash(r.choked ? [6 * px, 5 * px] : []);
        ctx.strokeStyle = atlas ? 'rgba(250,240,215,0.85)' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = w + 3 * px;
        ctx.stroke(path);
        ctx.strokeStyle = atlas ? 'rgba(150,100,20,0.9)' : 'rgba(190,130,20,0.95)';
        ctx.lineWidth = w;
        ctx.stroke(path);
      }
      ctx.setLineDash([]);
      // the centres themselves
      const seen = new Set();
      for (const r of this.routeLines) for (const c of r.centres) {
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        ctx.fillStyle = atlas ? '#6b4210' : '#7a4a00';
        ctx.beginPath(); ctx.arc(c.x, c.y, 4.5 * px, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = atlas ? '#f5ead0' : '#fff'; ctx.lineWidth = 1.5 * px; ctx.stroke();
        if (this.view.s > 0.45) {
          const fs = 11 * px;
          ctx.font = `italic ${fs}px ${PROV_FONT}`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = fs * 0.3; ctx.strokeStyle = atlas ? 'rgba(245,234,206,0.9)' : 'rgba(255,255,255,0.9)';
          ctx.strokeText(c.name, c.x + 7 * px, c.y);
          ctx.fillStyle = atlas ? '#4a2c0c' : '#3a2600';
          ctx.fillText(c.name, c.x + 7 * px, c.y);
        }
      }
      ctx.restore();
    }

    // new owners for a year (re-renders the colour layer only when something changed)
    setOwnersSoft(ownerOf, states) {
      if (ownerOf !== this.ownerOf) { this.ownerOf = ownerOf; this.states = states; this._dirty = true; this._ownersChanged = true; }
    }

    flush() {
      if (this._dirty && this.ownerOf) this.setOwners(this.ownerOf, this.states);
      this._dirty = false;
    }

    _drawBattles(ctx, px) {
      if (!this.battles || !this.battles.length || this.view.s < 0.3) return;
      const atlas = this.style === 'atlas';
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = 15 * px;
      ctx.font = `${fs}px "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", sans-serif`;
      for (const b of this.battles) {
        ctx.lineWidth = 3 * px;
        ctx.strokeStyle = atlas ? 'rgba(245,234,206,0.95)' : 'rgba(255,255,255,0.95)';
        const g = b.glyph || '⚔';
        ctx.strokeText(g, b.x, b.y);
        ctx.fillStyle = b.color || (atlas ? '#5a1d14' : '#111');
        ctx.fillText(g, b.x, b.y);
      }
      ctx.restore();
    }

    _drawDiploLines(ctx, px) {
      if (this.mode !== 'diplomacy' || !this.diploLines || !this.diploLines.length) return;
      const atlas = this.style === 'atlas';
      const col = { ally: '#2f5f9e', rival: '#a3281c', vassal: '#6b3f93', overlord: '#6b3f93', tie: '#9a7a1c' };
      ctx.save();
      ctx.lineCap = 'round';
      for (const L of this.diploLines) {
        const [x0, y0] = L.from, [x1, y1] = L.to;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(120, len * 0.18);
        const cx = mx - dy / len * bend, cy = my + dx / len * bend;
        ctx.strokeStyle = atlas ? 'rgba(250,240,215,0.85)' : 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 5.5 * px;
        ctx.setLineDash(L.kind === 'rival' ? [7 * px, 5 * px] : []);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
        ctx.strokeStyle = col[L.kind] || '#333';
        ctx.lineWidth = 2.6 * px;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col[L.kind] || '#333';
        ctx.beginPath(); ctx.arc(x1, y1, 4 * px, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    setUnions(unionOf) {
      const key = JSON.stringify(unionOf);
      if (key === this._unionKey) return;
      this._unionKey = key;
      this.unionOf = unionOf;
      this._dirty = true;
    }

    setMode(m) {
      this.mode = m;
      if (this.ownerOf) this.setOwners(this.ownerOf, this.states);
    }

    setStyle(s) {
      this.style = s;
      if (this.ownerOf) this.setOwners(this.ownerOf, this.states);
    }

    _computeLabels() {
      if (!this.adjMap) {
        this.adjMap = {};
        for (const [a, b] of this.world.adj) {
          (this.adjMap[a] = this.adjMap[a] || []).push(b);
          (this.adjMap[b] = this.adjMap[b] || []).push(a);
        }
      }
      const groups = {};
      for (const id in this.prov) {
        const tag = this.ownerOf[id];
        if (!tag) continue;
        (groups[tag] = groups[tag] || []).push(+id);
      }
      this.labels = [];
      for (const [tag, ids] of Object.entries(groups)) {
        // the label sits on the largest connected piece of territory
        const seen = new Set();
        let main = null, mainArea = -1;
        for (const start of ids) {
          if (seen.has(start)) continue;
          const comp = [], stack = [start];
          seen.add(start);
          let area = 0;
          while (stack.length) {
            const x = stack.pop();
            comp.push(this.prov[x]);
            area += this.prov[x].p.area;
            for (const y of this.adjMap[x] || []) if (!seen.has(y) && this.ownerOf[y] === tag) { seen.add(y); stack.push(y); }
          }
          if (area > mainArea) { mainArea = area; main = comp; }
        }
        let sxx = 0, syy = 0, sxy = 0, w2 = 0, cx = 0, cy = 0;
        for (const q of main) { const w = q.p.area; w2 += w; cx += q.p.label[0] * w; cy += q.p.label[1] * w; }
        cx /= w2; cy /= w2;
        for (const q of main) {
          const w = q.p.area, dx = q.p.label[0] - cx, dy = q.p.label[1] - cy;
          sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy;
        }
        // a single province still has some extent
        const ext = Math.sqrt(w2) * 0.12;   // km² -> roughly pixels
        sxx = sxx / w2 + ext * ext / 12; syy = syy / w2 + ext * ext / 12; sxy /= w2;
        let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ang = Math.max(-0.6, Math.min(0.6, ang));
        const tr = sxx + syy, det = sxx * syy - sxy * sxy;
        const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
        const l2 = Math.max(tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det)), 1);
        const len = Math.sqrt(l1) * 2.6;
        const thick = Math.sqrt(l2) * 2.4;
        // anchor on the province nearest the centre (centres of C-shaped realms fall outside them)
        let best = main[0], bd = 1e18;
        for (const q of main) { const d = (q.p.label[0] - cx) ** 2 + (q.p.label[1] - cy) ** 2; if (d < bd) { bd = d; best = q; } }
        const px = (cx + best.p.label[0] * 2) / 3, py = (cy + best.p.label[1] * 2) / 3;
        this.labels.push({ tag, x: px, y: py, ang, len, thick, area: w2 });
      }
      this.labels.sort((a, b) => b.area - a.area);
    }

    // ---------- view ----------
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      this.dpr = dpr;
      this.cw = r.width; this.ch = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      if (!this._viewSet) { if (r.width < 700) this.fitTo(-11, 62, 42, 32); else this.fitTo(-12, 72, 64, 12); }
      this.draw();
    }

    lonlatToWorld(lon, lat) {
      // Miller projection, same as the build script
      const W = this.W, H = this.H;
      const my = l => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * l * Math.PI / 180));
      const SC = W / (2 * Math.PI);
      const top = my(78);
      return [(lon + 180) / 360 * W, (top - my(lat)) * SC];
    }

    fitTo(lon0, lat0, lon1, lat1) {
      const [x0, y0] = this.lonlatToWorld(lon0, lat0), [x1, y1] = this.lonlatToWorld(lon1, lat1);
      const s = Math.min(this.cw / (x1 - x0), this.ch / (y1 - y0));
      this.view = { s, x: (x0 + x1) / 2 - this.cw / 2 / s, y: (y0 + y1) / 2 - this.ch / 2 / s };
      this._viewSet = true;
      this._clamp();
    }

    centerOn(x, y, s) {
      if (s) this.view.s = s;
      this.view.x = x - this.cw / 2 / this.view.s;
      this.view.y = y - this.ch / 2 / this.view.s;
      this._clamp();
      this.draw();
    }

    _clamp() {
      const v = this.view;
      const minS = Math.max(this.cw / this.W, this.ch / this.H);
      v.s = Math.max(minS, Math.min(v.s, 12));
      v.x = Math.max(0, Math.min(v.x, this.W - this.cw / v.s));
      v.y = Math.max(0, Math.min(v.y, this.H - this.ch / v.s));
    }

    screenToWorld(sx, sy) { return [this.view.x + sx / this.view.s, this.view.y + sy / this.view.s]; }
    worldToScreen(x, y) { return [(x - this.view.x) * this.view.s, (y - this.view.y) * this.view.s]; }

    _bindInput() {
      const c = this.canvas;
      const pointers = new Map();
      let dragStart = null, moved = false, pinch = null;
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
        if (pointers.size === 1) { dragStart = [e.offsetX, e.offsetY, this.view.x, this.view.y]; moved = false; }
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: this.view.s, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        }
      });
      c.addEventListener('pointermove', e => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          this.zoomAt(pinch.mid[0], pinch.mid[1], pinch.s * d / pinch.d / this.view.s);
          moved = true;
          return;
        }
        if (dragStart && pointers.size === 1) {
          const dx = e.offsetX - dragStart[0], dy = e.offsetY - dragStart[1];
          if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
          if (moved) {
            this.view.x = dragStart[2] - dx / this.view.s;
            this.view.y = dragStart[3] - dy / this.view.s;
            this._clamp();
            this.requestDraw();
          }
        } else if (e.pointerType === 'mouse') {
          const [wx, wy] = this.screenToWorld(e.offsetX, e.offsetY);
          const pid = this.pick(wx, wy);
          if (pid !== this.hoverProv) { this.hoverProv = pid; this.emit('hover', pid, e); this.requestDraw(); }
          else this.emit('hovermove', pid, e);
        }
      });
      let lastTap = null;
      const up = e => {
        if (pointers.size === 1 && !moved && dragStart) {
          const [wx, wy] = this.screenToWorld(e.offsetX, e.offsetY);
          // a double click or double tap zooms in on that spot
          const now = performance.now();
          if (lastTap && now - lastTap[0] < 350 && Math.hypot(e.offsetX - lastTap[1], e.offsetY - lastTap[2]) < 30) {
            lastTap = null;
            this.zoomAt(e.offsetX, e.offsetY, 2);
          } else {
            lastTap = [now, e.offsetX, e.offsetY];
            this.emit('click', this.pick(wx, wy));
          }
        }
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 0) dragStart = null;
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch = null; dragStart = null; });
      c.addEventListener('pointerleave', () => { if (this.hoverProv) { this.hoverProv = null; this.emit('hover', null); this.requestDraw(); } });
      c.addEventListener('wheel', e => {
        e.preventDefault();
        this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });
      window.addEventListener('resize', () => this.resize());
    }

    // zoom around the middle of the map (for the buttons and keys)
    zoomBy(f) { this.zoomAt(this.cw / 2, this.ch / 2, f); }

    zoomAt(sx, sy, f) {
      const [wx, wy] = this.screenToWorld(sx, sy);
      this.view.s *= f;
      this._clamp();
      this.view.x = wx - sx / this.view.s;
      this.view.y = wy - sy / this.view.s;
      this._clamp();
      this.requestDraw();
    }

    pick(x, y) {
      const cell = this.grid.get(Math.floor(x / this.G) * 10000 + Math.floor(y / this.G)) || [];
      for (const id of cell) {
        const q = this.prov[id];
        const b = q.bbox;
        if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
        let inside = false;
        for (const r of q.rings) {
          for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
            const yi = r[i + 1], yj = r[j + 1];
            if ((yi > y) !== (yj > y) && x < (r[j] - r[i]) * (y - yi) / (yj - yi) + r[i]) inside = !inside;
          }
        }
        if (inside) return id;
      }
      return null;
    }

    requestDraw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this.draw(); });
    }

    // ---------- drawing ----------
    draw() {
      const ctx = this.ctx, v = this.view, dpr = this.dpr;
      if (!this.ownerOf) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const atlas = this.style === 'atlas';
      ctx.fillStyle = atlas ? '#b9c3ae' : '#3e6489';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(v.s * dpr, 0, 0, v.s * dpr, -v.x * v.s * dpr, -v.y * v.s * dpr);
      ctx.imageSmoothingQuality = 'high';
      const imgs = this.images[this.style];
      const img = (v.s * dpr > 0.55 && imgs.large && imgs.large.complete && imgs.large.naturalWidth) ? imgs.large : imgs.small;
      if (img && img.naturalWidth) ctx.drawImage(img, 0, 0, this.W, this.H);
      // political colour wash
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = atlas ? 0.5 : 0.92;
      ctx.drawImage(this.fillCanvas, 0, 0, this.W, this.H);
      ctx.restore();
      const px = 1 / (v.s * dpr);   // one device pixel in world units
      // hover/selection highlight
      if (this.selected) {
        ctx.save();
        ctx.fillStyle = atlas ? 'rgba(255,248,225,0.22)' : 'rgba(255,255,255,0.18)';
        for (const id in this.prov) if (this.ownerOf[id] === this.selected) ctx.fill(this.prov[id].path);
        ctx.restore();
      }
      if (this.hoverProv) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill(this.prov[this.hoverProv].path);
        ctx.restore();
      }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // province borders (only when zoomed in a little)
      if (v.s > 0.35) {
        ctx.strokeStyle = atlas ? 'rgba(90,60,30,0.35)' : 'rgba(40,40,40,0.25)';
        ctx.lineWidth = Math.max(0.35, 0.8 * px * dpr);
        if (atlas) ctx.setLineDash([3 * px * dpr, 2.5 * px * dpr]);
        ctx.stroke(this.provBorders);
        ctx.setLineDash([]);
      }
      // coastline ink
      ctx.strokeStyle = atlas ? 'rgba(70,50,30,0.75)' : 'rgba(30,45,60,0.55)';
      ctx.lineWidth = Math.max(0.5, 1.1 * px * dpr);
      ctx.stroke(this.coast);
      // state borders
      if (atlas) {
        ctx.strokeStyle = 'rgba(120,40,30,0.22)';
        ctx.lineWidth = 5 * px * dpr;
        ctx.stroke(this.stateBorders);
        ctx.strokeStyle = 'rgba(90,35,25,0.85)';
        ctx.lineWidth = 1.3 * px * dpr;
        ctx.setLineDash([5 * px * dpr, 2 * px * dpr, 1 * px * dpr, 2 * px * dpr]);
        ctx.stroke(this.stateBorders);
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(20,20,25,0.85)';
        ctx.lineWidth = 1.6 * px * dpr;
        ctx.stroke(this.stateBorders);
      }
      // selected state outline
      if (this.selected) {
        ctx.save();
        ctx.strokeStyle = atlas ? 'rgba(120,20,10,0.95)' : '#fff';
        ctx.lineWidth = 3 * px * dpr;
        const sel = new Path2D();
        for (const e of this.borderList) {
          if (this.ownerOf[e.a] !== this.selected && this.ownerOf[e.b] !== this.selected) continue;
          sel.moveTo(e.pts[0], e.pts[1]);
          for (let i = 2; i < e.pts.length; i += 2) sel.lineTo(e.pts[i], e.pts[i + 1]);
        }
        for (const e of this.edges) {
          if (e.b !== 0 || this.ownerOf[e.a] !== this.selected) continue;
          sel.moveTo(e.pts[0], e.pts[1]);
          for (let i = 2; i < e.pts.length; i += 2) sel.lineTo(e.pts[i], e.pts[i + 1]);
        }
        ctx.stroke(sel);
        ctx.restore();
      }
      this._drawDiploLines(ctx, px * dpr);
      this._drawRoutes(ctx, px * dpr);
      this._drawBattles(ctx, px * dpr);
      this._drawLabels(ctx, px * dpr);
      this._drawMarkers(ctx, px * dpr);
      if (atlas) this._drawCartouche();
    }

    _drawLabels(ctx, px) {
      const atlas = this.style === 'atlas';
      const v = this.view;
      const vx0 = v.x, vy0 = v.y, vx1 = v.x + this.cw / v.s, vy1 = v.y + this.ch / v.s;
      const placed = [];
      // province names when zoomed in
      if (v.s > 1.6) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const fs = 10 * px * this.dpr;
        ctx.font = `italic ${fs}px ${PROV_FONT}`;
        for (const id in this.prov) {
          const p = this.prov[id].p;
          const [x, y] = p.label;
          if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
          if (p.area < 2500 / (v.s * v.s)) continue;
          ctx.fillStyle = atlas ? 'rgba(60,40,20,0.75)' : 'rgba(30,30,30,0.7)';
          ctx.fillText(this.provName ? this.provName(p.id) : p.name, x, y);
        }
        ctx.restore();
      }
      for (const L of this.labels) {
        const st = this.states[L.tag];
        if (!st) continue;
        const name = (this.labelText ? this.labelText(L.tag) : st.name);
        const upper = name.toUpperCase();
        const chars = upper.length;
        // font size from the territory extent, in world units
        let fs = Math.min(L.len / (chars * 0.78), L.thick * 0.9, 90);
        if (fs * v.s > 36) fs = 36 / v.s;
        if (L.x < vx0 - 200 || L.x > vx1 + 200 || L.y < vy0 - 100 || L.y > vy1 + 100) continue;
        // collisions in screen space: shift along the territory, then shrink, before giving up
        let box = null, lx = L.x, ly = L.y;
        const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
        const shifts = [[0, 0], [0, -0.35], [0, 0.35], [-0.18, 0], [0.18, 0], [-0.2, -0.3], [0.2, 0.3]];
        outer: for (const k of [1, 0.82, 0.68]) {
          const f = fs * k;
          if (f * v.s < 7.5) break;
          for (const [u, w] of shifts) {
            const x = L.x + ca * u * L.len - sa * w * L.thick, y = L.y + sa * u * L.len + ca * w * L.thick;
            // most of the label must lie on the realm's own land
            const halfW = chars * f * 0.4;
            let inside = 0;
            for (const t of [-0.9, -0.45, 0, 0.45, 0.9]) {
              const pid = this.pick(x + ca * t * halfW, y + sa * t * halfW);
              if (pid && this.ownerOf[pid] === L.tag) inside++;
            }
            if (inside < ((u || w) ? 4 : 3) && !(k === 0.68 && !u && !w)) continue;
            const [sx, sy] = this.worldToScreen(x, y);
            const b = orientedBox(sx, sy, chars * f * 0.8 * v.s, f * v.s * (this.subLabel ? 1.7 : 1.1), L.ang);
            if (!placed.some(o => boxesOverlap(b, o))) { box = b; fs = f; lx = x; ly = y; break outer; }
          }
        }
        if (!box) continue;
        const screenFs = fs * v.s;
        placed.push(box);
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(L.ang);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (atlas) {
          ctx.font = `${fs}px ${LABEL_FONT_ATLAS}`;
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${fs * 0.18}px`;
          ctx.lineWidth = fs * 0.16;
          ctx.strokeStyle = 'rgba(240,229,200,0.65)';
          ctx.strokeText(upper, 0, 0);
          ctx.fillStyle = L.tag === this.selected ? 'rgba(110,20,10,0.95)' : 'rgba(70,40,25,0.86)';
          ctx.fillText(upper, 0, 0);
        } else {
          ctx.font = `600 ${fs}px ${LABEL_FONT_POL}`;
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${fs * 0.08}px`;
          ctx.lineWidth = fs * 0.14;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.strokeText(upper, 0, 0);
          ctx.fillStyle = 'rgba(15,15,20,0.88)';
          ctx.fillText(upper, 0, 0);
        }
        // ruler name under big labels
        if (this.subLabel && screenFs > 13) {
          const sub = this.subLabel(L.tag);
          if (sub) {
            const fs2 = fs * 0.42;
            ctx.font = `italic ${fs2}px ${atlas ? PROV_FONT : '"Alegreya Sans", sans-serif'}`;
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
            ctx.lineWidth = fs2 * 0.2;
            ctx.strokeText(sub, 0, fs * 0.82);
            ctx.fillText(sub, 0, fs * 0.82);
          }
        }
        ctx.restore();
      }
    }

    // ---------- animated markers (successions etc.) ----------
    addMarker(x, y, text, kind) {
      this.markers.push({ x, y, text, kind, t0: performance.now() });
      this._animate();
    }

    _animate() {
      if (this._animating) return;
      this._animating = true;
      const tick = () => {
        const now = performance.now();
        this.markers = this.markers.filter(m => now - m.t0 < 2600);
        this.draw();
        if (this.markers.length) requestAnimationFrame(tick);
        else { this._animating = false; this.draw(); }
      };
      requestAnimationFrame(tick);
    }

    _drawMarkers(ctx, px) {
      const now = performance.now();
      const atlas = this.style === 'atlas';
      for (const m of this.markers) {
        const a = (now - m.t0) / 2600;
        const fade = a < 0.1 ? a / 0.1 : 1 - Math.max(0, a - 0.6) / 0.4;
        const r = (6 + a * 22) * px;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.strokeStyle = m.kind === 'death' ? (atlas ? '#5a1d14' : '#1b1b1b') : (atlas ? '#8a5a12' : '#f5d061');
        ctx.lineWidth = 2 * px;
        ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(m.x, m.y, 2.6 * px, 0, Math.PI * 2); ctx.fill();
        if (m.text) {
          const fs = 12 * px;
          ctx.font = `italic ${fs}px ${PROV_FONT}`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = fs * 0.3;
          ctx.strokeStyle = atlas ? 'rgba(244,234,208,0.9)' : 'rgba(255,255,255,0.85)';
          ctx.strokeText(m.text, m.x + 9 * px, m.y - 9 * px * (1 + a));
          ctx.fillStyle = atlas ? '#3d2414' : '#111';
          ctx.fillText(m.text, m.x + 9 * px, m.y - 9 * px * (1 + a));
        }
        ctx.restore();
      }
    }

    _drawCartouche() {
      // a compass rose in the lower right corner of the screen (screen space)
      const ctx = this.ctx, dpr = this.dpr;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = 30, cx = this.cw - r - 22, cy = this.ch - r - 70;
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#4a2f1c'; ctx.fillStyle = '#4a2f1c';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, long = i % 2 === 0 ? r : r * 0.55;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, -long); ctx.lineTo(r * 0.1, 0); ctx.lineTo(0, r * 0.08); ctx.lineTo(-r * 0.1, 0); ctx.closePath();
        if (i % 2 === 0) ctx.fill(); else ctx.stroke();
        ctx.restore();
      }
      ctx.font = `${r * 0.38}px ${LABEL_FONT_ATLAS}`;
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -r - 5);
      ctx.restore();
    }

    exportPNG() { return this.canvas.toDataURL('image/png'); }
  }

  root.MapView = MapView;
})(window);
