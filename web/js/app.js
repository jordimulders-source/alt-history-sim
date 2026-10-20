// The page: runs a timeline, drives the map, the year slider and the panels.
(function () {
  const W = window.WORLD;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const LAW = {
    primogeniture: 'Primogeniture (sons first, then daughters)', salic: 'Salic law (men only)',
    elective: 'Elective crown', open: 'Open succession (any son may claim)', seniority: 'Seniority (eldest of the dynasty)',
    republic: 'Elected for life', theocracy: 'Elected by the clergy',
  };
  const GOV = { monarchy: 'Monarchy', republic: 'Republic', theocracy: 'Theocracy', order: 'Military order', tribal: 'Tribal confederation' };
  const BAD = new Set(['cruel', 'mad', 'sickly', 'lazy', 'craven', 'greedy', 'paranoid', 'deceitful', 'wrathful', 'simple', 'extravagant']);
  const nice = s => s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

  // ---------- state of the page ----------
  const S = {
    seed: '1444', years: (W.config.end_year || 1544) - (W.config.start_year || 1444),
    interventions: [], year: 1444, playing: false, speed: 1, sim: null,
    selected: null, selectedChar: null, panel: null,
  };
  try {
    const h = location.hash.slice(1);
    if (/^s[\w.-]+$/.test(h)) S.seed = h.slice(1);
  } catch (e) { /* ignore */ }

  const provById = {};
  W.provinces.forEach(p => { provById[p.id] = p; });
  const ownerOf = {};
  W.provinces.forEach(p => { ownerOf[p.id] = p.owner; });

  // ---------- assets & map ----------
  function img(src) { const i = new Image(); i.decoding = 'async'; i.src = src; return i; }
  const assets = {
    atlas: { small: img('data/base_atlas_small.jpg'), large: null },
    political: { small: img('data/base_political_small.jpg'), large: null },
  };
  let map;

  function loadLarge(style) {
    if (assets[style].large) return;
    const i = img(`data/base_${style}.jpg`);
    i.onload = () => map && map.draw();
    assets[style].large = i;
  }

  // ---------- running a timeline ----------
  function runTimeline(done) {
    $('loading').hidden = false;
    $('loading-text').textContent = `Writing the history of timeline #${S.seed}…`;
    setTimeout(() => {
      const t0 = performance.now();
      const sim = new Sim(W, { seed: S.seed, interventions: S.interventions });
      sim.run(W.start.year + S.years);
      S.sim = sim;
      console.log(`timeline #${S.seed}: ${sim.events.length} events, ${sim.chars.size} characters, ${Math.round(performance.now() - t0)} ms`);
      $('loading').hidden = true;
      $('seed-label').textContent = S.seed;
      $('altered').hidden = !S.interventions.length;
      $('altered').textContent = S.interventions.length ? `altered ×${S.interventions.length}` : '';
      const end = W.start.year + S.years;
      $('slider').max = end;
      if (S.year > end) S.year = end;
      $('slider').value = S.year;
      buildTicks();
      done && done();
      refresh();
    }, 30);
  }

  const tMid = y => y * 12 + 6;
  function rulerAt(tag, y) { return S.sim.rulerAt(tag, tMid(y)); }
  function regentAt(tag, y) {
    const snap = S.sim.yearSnapshots.find(s => s.year === y);
    const id = snap && snap.rulers[tag] && snap.rulers[tag][1];
    return id ? S.sim.char(id) : null;
  }
  function nameOf(c) { return c ? S.sim.fullName(c) : '—'; }
  function isAliveAt(c, y) { return c.born <= tMid(y) && (c.died == null || c.died > tMid(y)); }
  function ageAt(c, y) { const end = c.died != null && c.died < tMid(y) ? c.died : tMid(y); return Math.floor((end - c.born) / 12); }

  // ---------- refresh everything for the current year ----------
  function refresh() {
    $('year').textContent = S.year;
    if (!map) return;
    map.subLabel = tag => { const r = rulerAt(tag, S.year); return r ? S.sim.nameAt(r, tMid(S.year), tag) : ''; };
    map.draw();
    renderPanel();
    renderChronicle();
  }

  function buildTicks() {
    const t = $('ticks');
    const a = W.start.year, b = W.start.year + S.years;
    const step = S.years > 300 ? 100 : S.years > 120 ? 50 : 20;
    let html = '';
    for (let y = Math.ceil(a / step) * step; y <= b; y += step) html += `<span style="left:${(y - a) / (b - a) * 100}%">${y}</span>`;
    // a mark for each great succession crisis or personal union
    for (const e of S.sim.events) {
      if (e.type === 'crisis' || e.type === 'union') {
        const y = Math.floor(e.t / 12);
        html += `<i style="left:${(y - a) / (b - a) * 100}%" title="${esc(e.text)}"></i>`;
      }
    }
    t.innerHTML = html;
  }

  // ---------- panel: state ----------
  function selectState(tag, focus) {
    S.selected = tag; S.selectedChar = null; S.panel = 'state';
    map.selected = tag;
    if (focus) {
      const p = provById[W.states[tag].capital];
      map.centerOn(p.label[0], p.label[1], Math.max(map.view.s, 1.1));
    }
    $('panel').hidden = false;
    refresh();
  }
  function selectChar(id) {
    S.selectedChar = id; S.panel = 'char';
    const c = S.sim.char(id);
    if (c && c.titles.length) { S.selected = c.titles[0]; map.selected = S.selected; }
    $('panel').hidden = false;
    refresh();
  }

  function medal(c, tag) {
    const col = tag && W.states[tag] ? W.states[tag].color : '#7a6a55';
    const init = c ? c.name[0] : '?';
    return `<div class="medal" style="background:${col}">${esc(init)}</div>`;
  }

  function traitChips(c) {
    return `<div class="chips">${c.traits.map(t => `<span class="chip${BAD.has(t) ? ' bad' : ''}">${esc(t)}</span>`).join('')}</div>`;
  }

  function charLink(c, atYear, tag) {
    if (!c) return '—';
    const n = atYear ? S.sim.nameAt(c, tMid(S.year), tag) : tag ? S.sim.nameIn(c, tag) : nameOf(c);
    return `<button class="link" data-char="${esc(c.id)}">${esc(n)}</button>`;
  }

  function stateLink(tag) {
    const s = W.states[tag];
    if (!s) return esc(tag);
    return `<button class="link" data-state="${tag}"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</button>`;
  }

  function stateStats(tag) {
    let n = 0, pop = 0;
    for (const p of W.provinces) if (ownerOf[p.id] === tag) { n++; pop += p.pop; }
    return { n, pop };
  }

  function fmtPop(p) { return p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + ' million' : Math.round(p / 1000) + ' thousand'; }
  function mon(t) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t % 12]; }

  function renderPanel() {
    if ($('panel').hidden) return;
    const body = $('panel-body');
    if (S.panel === 'char' && S.selectedChar) { body.innerHTML = charPanel(S.sim.char(S.selectedChar)); return; }
    if (!S.selected) { $('panel').hidden = true; return; }
    const tag = S.selected, s = W.states[tag], st = S.sim.states[tag];
    const r = rulerAt(tag, S.year), reg = regentAt(tag, S.year);
    const { n, pop } = stateStats(tag);
    const sy = S.sim;
    let html = `<p class="eyebrow">${esc(GOV[s.government] || s.government)}</p>
      <h2><span class="swatch" style="background:${s.color};width:16px;height:16px"></span>${esc(s.name)}</h2>`;
    if (r) {
      html += `<div class="ruler-card">${medal(r, tag)}<div>
        <div class="nm">${charLink(r, true, tag)}</div>
        <div class="sub">${r.dynasty ? 'House of ' + esc(r.dynasty) + ' · ' : ''}age ${ageAt(r, S.year)}${reg ? ' · regent: ' + charLink(reg) : ''}</div>
        ${traitChips(r)}
        <div class="stats"><span>Administration <b>${r.adm}</b></span><span>Diplomacy <b>${r.dip}</b></span><span>Military <b>${r.mil}</b></span></div>
      </div></div>`;
      const other = st.history.length && r.titles.filter(x => x !== tag && sy.rulerAt(x, tMid(S.year)) === r);
      if (other && other.length) html += `<p class="note">Also rules ${other.map(stateLink).join(', ')} in personal union.</p>`;
    }
    html += `<dl class="facts">
      <dt>Succession</dt><dd>${esc(LAW[s.succession] || s.succession)}</dd>
      <dt>Capital</dt><dd>${esc(provById[s.capital].name)}</dd>
      <dt>Provinces</dt><dd>${n}</dd>
      <dt>People</dt><dd>${fmtPop(pop)}</dd>
      <dt>Culture</dt><dd>${esc(nice(s.culture))}</dd>
      <dt>Faith</dt><dd>${esc(nice(s.religion))}</dd>
      ${s.overlord ? `<dt>Overlord</dt><dd>${stateLink(s.overlord)}</dd>` : ''}
    </dl>`;
    if (r && isAliveAt(r, S.year)) {
      html += `<div class="actions">
        <button class="ghost" data-act="kill" data-char="${esc(r.id)}">Strike down ${esc(r.name)} in ${S.year}</button>
        ${r.spouse ? `<button class="ghost" data-act="heir" data-state="${tag}">Grant an heir in ${S.year}</button>` : ''}
      </div><p class="note">Interventions rewrite this timeline from that year on.</p>`;
    }
    html += `<h3>Rulers</h3><ul class="reigns">`;
    for (const h of st.history) {
      const c = sy.char(h.char);
      const y0 = Math.floor(h.from / 12), y1 = h.to != null ? Math.floor(h.to / 12) : null;
      const now = y0 <= S.year && (y1 == null || y1 >= S.year);
      const future = y0 > S.year;
      html += `<li class="${now ? 'now' : ''}${future ? ' future' : ''}"><span class="yrs">${y0}–${y1 ?? ''}</span><span>${charLink(c, false, tag)}</span></li>`;
    }
    html += `</ul><h3>Chronicle of ${esc(s.name)}</h3>`;
    const evs = sy.events.filter(e => e.states.includes(tag) && e.type !== 'start');
    if (!evs.length) html += `<p class="note">Nothing of note was recorded.</p>`;
    for (const e of evs) html += eventRow(e);
    body.innerHTML = html;
  }

  function eventRow(e) {
    const y = Math.floor(e.t / 12);
    const future = y > S.year;
    const link = e.chars[0] ? ` data-char="${esc(e.chars[0])}"` : e.states[0] ? ` data-state="${e.states[0]}"` : '';
    return `<div class="ev${e.major ? ' major' : ''}${future ? ' future' : ''}"><span class="when">${mon(e.t)} ${y}</span>
      <span class="txt"><button class="link" style="color:inherit;text-decoration:none"${link}>${esc(e.text)}</button></span></div>`;
  }

  function charPanel(c) {
    const sy = S.sim;
    if (!c) return '';
    const born = Math.floor(c.born / 12);
    const died = c.died != null ? Math.floor(c.died / 12) : null;
    const tag = c.titles[0] || (sy.states && Object.keys(sy.states).find(t => sy.states[t].history.some(h => h.char === c.id)));
    const reigns = [];
    for (const [t, st] of Object.entries(sy.states)) for (const h of st.history) if (h.char === c.id) reigns.push([t, h]);
    let html = `<p class="eyebrow">${c.historical ? 'Historical figure' : 'Born of this timeline'}</p>
      <div class="ruler-card" style="margin-top:4px">${medal(c, tag)}<div>
      <div class="nm" style="font-size:20px">${esc(nameOf(c))}</div>
      <div class="sub">${c.dynasty ? 'House of ' + esc(c.dynasty) + ' · ' : ''}${born}–${died ?? ''}${died != null ? ` (aged ${Math.floor((c.died - c.born) / 12)})` : ''}</div>
      ${traitChips(c)}
      <div class="stats"><span>Administration <b>${c.adm}</b></span><span>Diplomacy <b>${c.dip}</b></span><span>Military <b>${c.mil}</b></span></div>
      </div></div>`;
    if (died != null && c.deathCause) html += `<p class="note">Died ${mon(c.died)} ${died} of ${esc(c.deathCause)}.</p>`;
    if (reigns.length) {
      html += `<h3>Reigns</h3><ul class="reigns">`;
      for (const [t, h] of reigns) {
        html += `<li><span class="yrs">${Math.floor(h.from / 12)}–${h.to != null ? Math.floor(h.to / 12) : ''}</span><span>${stateLink(t)} <span class="dead">(${esc(h.how)})</span></span></li>`;
      }
      html += `</ul>`;
    }
    const fa = c.father && sy.char(c.father), mo = c.mother && sy.char(c.mother), sp = c.spouse && sy.char(c.spouse);
    const kids = c.children.map(id => sy.char(id)).filter(Boolean).sort((a, b) => a.born - b.born);
    html += `<h3>Family</h3><div class="family">
      ${fa ? `<div><span class="role">Father</span>${charLink(fa)}</div>` : ''}
      ${mo ? `<div><span class="role">Mother</span>${charLink(mo)}</div>` : ''}
      ${sp ? `<div><span class="role">Spouse</span>${charLink(sp)}</div>` : ''}
      ${kids.map(k => `<div><span class="role">${k.sex === 'm' ? 'Son' : 'Daughter'}</span>${charLink(k)} <span class="dead">${Math.floor(k.born / 12)}–${k.died != null ? Math.floor(k.died / 12) : ''}</span></div>`).join('')}
      ${!fa && !mo && !sp && !kids.length ? '<p class="note">No family recorded.</p>' : ''}
    </div>`;
    if (kids.length) html += `<h3>Descendants</h3><div class="tree">${tree(c, 3)}</div>`;
    if (isAliveAt(c, S.year)) {
      html += `<div class="actions"><button class="ghost" data-act="kill" data-char="${esc(c.id)}">Strike down in ${S.year}</button></div>
        <p class="note">Interventions rewrite this timeline from that year on.</p>`;
    }
    const evs = sy.events.filter(e => e.chars.includes(c.id) && e.type !== 'start');
    if (evs.length) { html += `<h3>Life</h3>`; for (const e of evs) html += eventRow(e); }
    return html;
  }

  function tree(c, depth) {
    const kids = c.children.map(id => S.sim.char(id)).filter(Boolean).sort((a, b) => a.born - b.born);
    if (!kids.length || depth === 0) return '';
    return `<ul>${kids.map(k => `<li>${k.titles.length || k.everRuled ? '♛ ' : ''}${charLink(k)} <span class="dead">${Math.floor(k.born / 12)}–${k.died != null ? Math.floor(k.died / 12) : ''}</span>${tree(k, depth - 1)}</li>`).join('')}</ul>`;
  }

  // ---------- chronicle ----------
  // great events: things that happen to the larger realms, plus unions, crises and interventions
  let popCache = null;
  function isGreat(e) {
    if (!e.major) return false;
    if (e.type === 'intervention' || e.type === 'union') return true;
    if (!popCache) { popCache = {}; for (const p of W.provinces) if (p.owner) popCache[p.owner] = (popCache[p.owner] || 0) + p.pop; }
    const pop = Math.max(0, ...e.states.map(t => popCache[t] || 0));
    if (e.type === 'marriage') return pop > 4e6;
    return pop > 1.2e6 || (e.type === 'crisis' && pop > 4e5);
  }

  function renderChronicle() {
    if ($('chronicle').hidden) return;
    const majorOnly = $('major-only').checked;
    let html = '', dec = null;
    for (const e of S.sim.events) {
      if (e.type === 'start') continue;
      if (majorOnly && !isGreat(e)) continue;
      const d = Math.floor(e.t / 120) * 10;
      if (d !== dec) { html += `<h4 id="dec-${d}">${d}s</h4>`; dec = d; }
      html += eventRow(e);
    }
    $('chron-body').innerHTML = html || '<p class="note">The chronicle is empty.</p>';
    const target = document.getElementById(`dec-${Math.floor(S.year / 10) * 10}`);
    if (target && S.scrollChron) { target.scrollIntoView({ block: 'start' }); S.scrollChron = false; }
  }

  function alertNote(msg) {
    const t = $('tooltip');
    t.innerHTML = esc(msg); t.hidden = false;
    t.style.left = '50%'; t.style.top = '90px'; t.style.transform = 'translateX(-50%)';
    setTimeout(() => { t.hidden = true; t.style.transform = ''; }, 6000);
  }

  // ---------- interventions ----------
  function intervene(iv) {
    S.interventions.push(iv);
    const keepYear = S.year;
    runTimeline(() => { S.year = keepYear; });
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'kill') {
      const c = S.sim.char(b.dataset.char);
      intervene({ type: 'kill', char: c.id, t: S.year * 12 + 1, text: `By the hand of fate, ${nameOf(c)} dies suddenly.` });
      return;
    }
    if (b.dataset.act === 'heir') {
      const st = W.states[b.dataset.state];
      intervene({ type: 'heir', state: b.dataset.state, t: S.year * 12 + 1, text: `Against all expectation, an heir is born in ${st.name}.` });
      return;
    }
    if (b.dataset.char) { selectChar(b.dataset.char); return; }
    if (b.dataset.state) { selectState(b.dataset.state, true); return; }
  });

  // ---------- controls ----------
  function setYear(y, animate) {
    const prev = S.year;
    S.year = Math.max(W.start.year, Math.min(+$('slider').max, y));
    $('slider').value = S.year;
    if (animate && S.year === prev + 1) showYearMarkers(S.year);
    refresh();
  }

  function showYearMarkers(y) {
    const evs = S.sim.events.filter(e => Math.floor(e.t / 12) === y && (e.type === 'succession' || e.type === 'union' || e.type === 'crisis'));
    const big = evs.map(e => [e, stateStats(e.states[0]).pop]).sort((a, b) => b[1] - a[1]).slice(0, 7);
    for (const [e] of big) {
      const tag = e.states[0];
      const p = provById[W.states[tag].capital];
      const r = S.sim.char(e.chars[0]);
      const txt = e.type === 'union' ? `${W.states[tag].name}: personal union` : r ? `♛ ${nameOf(r)}` : '';
      map.addMarker(p.label[0], p.label[1], txt, e.type);
    }
  }

  let playTimer = null;
  function play(on) {
    S.playing = on;
    $('play').textContent = on ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
    clearInterval(playTimer);
    if (on) {
      if (S.year >= +$('slider').max) setYear(W.start.year);
      playTimer = setInterval(() => {
        if (S.year >= +$('slider').max) { play(false); return; }
        setYear(S.year + 1, true);
      }, 900 / S.speed);
    }
  }

  function init() {
    const canvas = $('map');
    map = new MapView(canvas, W, window.SHAPES, assets);
    map.labelText = tag => W.states[tag].name;
    map.setOwners(ownerOf, W.states);
    assets.atlas.small.onload = () => map.draw();
    assets.political.small.onload = () => map.draw();
    loadLarge('atlas');
    map.on('click', pid => {
      const tag = pid && ownerOf[pid];
      if (tag) selectState(tag); else { S.selected = null; map.selected = null; $('panel').hidden = true; map.draw(); }
    });
    const tip = $('tooltip');
    const showTip = (pid, e) => {
      if (!pid || !e) { tip.hidden = true; return; }
      const p = provById[pid];
      const owner = ownerOf[pid] ? W.states[ownerOf[pid]].name : 'Unclaimed';
      tip.innerHTML = `<b>${esc(p.name)}</b> · ${esc(owner)}<br><span class="muted">${nice(p.terrain)} · ${fmtPop(p.pop)} · ${nice(p.culture)} · ${nice(p.religion)}</span>`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 270) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    };
    map.on('hover', showTip);
    map.on('hovermove', showTip);

    $('slider').addEventListener('input', e => setYear(+e.target.value));
    $('play').addEventListener('click', () => play(!S.playing));
    $('speed-btn').addEventListener('click', () => {
      S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 4 : 1;
      $('speed-btn').textContent = S.speed + '×';
      if (S.playing) play(true);
    });
    const setStyle = st => {
      map.setStyle(st);
      loadLarge(st);
      $('style-atlas').classList.toggle('on', st === 'atlas');
      $('style-political').classList.toggle('on', st === 'political');
      $('style-atlas').setAttribute('aria-pressed', st === 'atlas');
      $('style-political').setAttribute('aria-pressed', st === 'political');
    };
    const setMode = m => {
      map.setMode(m);
      for (const k of ['realms', 'cultures', 'faiths']) {
        $('mode-' + k).classList.toggle('on', k === m);
        $('mode-' + k).setAttribute('aria-pressed', k === m);
      }
    };
    for (const k of ['realms', 'cultures', 'faiths']) $('mode-' + k).addEventListener('click', () => setMode(k));
    $('style-atlas').addEventListener('click', () => setStyle('atlas'));
    $('style-political').addEventListener('click', () => setStyle('political'));
    $('panel-close').addEventListener('click', () => { $('panel').hidden = true; S.selected = null; map.selected = null; map.draw(); });
    $('chron-btn').addEventListener('click', () => { $('chronicle').hidden = !$('chronicle').hidden; S.scrollChron = true; renderChronicle(); });
    $('chron-close').addEventListener('click', () => { $('chronicle').hidden = true; });
    $('major-only').addEventListener('change', renderChronicle);
    // seed dialog
    $('seed-btn').addEventListener('click', () => {
      $('seed-input').value = S.seed; $('years-input').value = S.years; $('seed-dialog').hidden = false; $('seed-input').focus();
    });
    $('seed-random').addEventListener('click', () => { $('seed-input').value = String(Math.floor(Math.random() * 1e6)); });
    $('seed-cancel').addEventListener('click', () => { $('seed-dialog').hidden = true; });
    $('seed-form').addEventListener('submit', e => {
      e.preventDefault();
      S.seed = ($('seed-input').value.trim() || '1444').replace(/[^\w.-]/g, '');
      S.years = Math.max(10, Math.min(600, +$('years-input').value || 100));
      S.interventions = [];
      $('seed-dialog').hidden = true;
      try { history.replaceState(null, '', '#s' + S.seed); } catch (err) { /* ignore */ }
      runTimeline();
    });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setYear(S.year + 1, true);
      if (e.key === 'ArrowLeft') setYear(S.year - 1);
      if (e.key === ' ') { e.preventDefault(); play(!S.playing); }
    });
    // saving files only works when the page runs on your own computer
    if (location.protocol === 'https:') $('save-btn').hidden = true;
    $('save-btn').addEventListener('click', () => {
      const a = document.createElement('a');
      try { a.href = map.exportPNG(); } catch (err) {
        alertNote('The browser blocks saving images from a page opened as a file. Start it with "python3 -m http.server --directory web" and open http://localhost:8000.');
        return;
      }
      a.download = `atlas_${S.seed}_${S.year}_${map.style}.png`;
      a.click();
    });
    // hooks for tools/export_maps.py
    window.atlasApp = { setYear: y => setYear(y), setStyle, map, ready: () => !!S.sim, fit: (a, b, c, d) => { map.fitTo(a, b, c, d); map.draw(); } };
    runTimeline();
  }

  // let the fonts arrive before the first labelled frame (with a short timeout)
  const ready = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  ready.then(init);
})();
