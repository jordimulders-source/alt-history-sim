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
    const [main, fate] = h.split('|f:');
    if (/^s[\w.-]+(~[\w.-]+)?$/.test(main)) { S.seed = main.slice(1).split('~')[0]; S.compareSeed = main.split('~')[1] || null; }
    if (fate) S.interventions = JSON.parse(decodeURIComponent(escape(atob(fate.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch (e) { /* ignore */ }

  const provById = {};
  W.provinces.forEach(p => { provById[p.id] = p; });
  // descriptions of the realms in this timeline (new ones appear in revolts)
  const SI = () => (S.sim && S.sim.stateInfo) || W.states;

  // who owns which province in the chosen year (land changes hands in wars)
  let ownerOf = {};
  W.provinces.forEach(p => { ownerOf[p.id] = p.owner; });
  let ownCache = {};
  function ownersFor(y) { return ownCache[y] || (ownCache[y] = S.sim.ownersAt(y)); }
  const capCache = {};
  function capitalOf(tag) {
    const k = S.year + tag;
    if (!(k in capCache)) capCache[k] = S.sim.capitalAt(tag, S.year);
    return provById[capCache[k]] || provById[SI()[tag].capital];
  }

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
  // The first century is written behind the loading screen; the rest is written in the background
  // while the map can already be explored. S.written is the last year history has reached.
  let runId = 0;
  function runTimeline(done, untilYear) {
    const id = ++runId;
    $('loading').hidden = false;
    $('loading-text').textContent = `Writing the history of timeline #${S.seed}…`;
    const t0 = performance.now();
    const end = W.start.year + S.years;
    // write at least the first century, and on an intervention as far as the year being watched
    const first = Math.min(end, Math.max(W.start.year + 100, (untilYear || 0) + 1));
    let sim = null, shown = false, lastTicks = 0;
    S.written = W.start.year;
    const chunk = () => {
      if (id !== runId) return;                       // another history was asked for meanwhile
      if (!sim) sim = new Sim(W, { seed: S.seed, interventions: S.interventions });
      const t1 = performance.now();
      while (sim.year() < end && performance.now() - t1 < (shown ? 40 : 120)) sim.step();
      if (!shown) {
        const pct = Math.round((sim.year() - W.start.year) / (first - W.start.year) * 100);
        $('loading-text').textContent = `Writing the history of timeline #${S.seed}… ${sim.year()}`;
        $('loading-bar').style.width = Math.min(100, pct) + '%';
        if (sim.year() >= first) show();
      } else {
        S.written = sim.year();
        showWritten();
        if (S.written - lastTicks >= 25 || S.written >= end) { lastTicks = S.written; buildTicks(); }
        if (S.waiting && S.year < S.written) { S.waiting = false; }
      }
      if (sim.year() < end) setTimeout(chunk, shown ? 15 : 0);
      else console.log(`timeline #${S.seed}: ${sim.events.length} events, ${sim.chars.size} characters, ${Math.round(performance.now() - t0)} ms`);
    };
    const show = () => {
      shown = true;
      S.sim = sim;
      S.written = sim.year();
      ownCache = {};
      for (const k in econFillCache) delete econFillCache[k];
      for (const k in statsCache) delete statsCache[k];
      for (const k in capCache) delete capCache[k];
      for (const k in storyCache) delete storyCache[k];
      $('loading').hidden = true;
      $('seed-label').textContent = S.seed;
      $('altered').hidden = !S.interventions.length;
      $('altered').textContent = S.interventions.length ? `altered ×${S.interventions.length}` : '';
      writeHash();
      $('slider').max = end;
      if (S.year > S.written) S.year = S.written;
      $('slider').value = S.year;
      lastTicks = S.written;
      buildTicks();
      showWritten();
      done && done();
      refresh();
    };
    setTimeout(chunk, 30);
  }

  // the part of the timeline that is still being written is shaded
  function showWritten() {
    const a = W.start.year, b = W.start.year + S.years;
    const f = Math.max(0, Math.min(1, (S.written - a) / (b - a)));
    const el = $('unwritten');
    el.style.left = `calc(16px + (100% - 32px) * ${f})`;
    el.hidden = f >= 1;
    el.title = `History is still being written… (${S.written})`;
  }

  // before a revolution the realm still had its old crown
  function lawAt(tag) {
    const st = S.sim.states[tag], s = SI()[tag];
    if (st.republicSince != null) {
      if (st.republicSince <= tMid(S.year)) return 'Elected president for a term of years';
      if (st.oldGov) return LAW[st.oldGov.succession] || st.oldGov.succession;
    }
    return LAW[s.succession] || s.succession;
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
    if (S.sim && S.sim.ageAt) $('age').textContent = S.sim.ageAt(S.year);
    if (!map) return;
    ownerOf = ownersFor(S.year);
    map.setOwnersSoft(ownerOf, SI());
    map.setOccupation(S.sim.occupationAt(S.year));
    const ch = S.sim.cultureAt(S.year);
    map.setPeoples(ch ? { cult: ch.cult, rel: ch.rel, cultKeys: S.sim.cultKeys, relKeys: S.sim.relKeys } : null);
    map.setBattles(battlesIn(S.year).concat(S.sim.revoltsIn(S.year).map(r => {
      const p = provById[r.pid];
      return { x: p.label[0], y: p.label[1], glyph: '⚑', color: r.kind === 'separatists' ? '#7a1414' : '#6b4a1c' };
    })));
    map.subLabel = tag => { const r = rulerAt(tag, S.year); return r ? S.sim.nameAt(r, tMid(S.year), tag) : ''; };
    // personal unions in this year: the smaller crowns are striped in the colour of the largest
    const unionOf = {};
    for (const u of S.sim.unions) {
      if (u.from > tMid(S.year) || (u.to != null && u.to <= tMid(S.year))) continue;
      const senior = u.tags.slice().sort((a, b) => stateStats(b).pop - stateStats(a).pop)[0];
      for (const t of u.tags) if (t !== senior) unionOf[t] = senior;
    }
    // vassals are striped in the colour of their overlord as well
    const dipl = S.sim.diplomacyAt(S.year);
    if (dipl) for (const [v, o] of Object.entries(dipl.overlord)) if (!unionOf[v]) unionOf[v] = o;
    map.setUnions(unionOf);
    diplomacyLayer();
    economyLayer();
    progressLayer();
    map.flush();
    map.draw();
    feedB();
    renderPanel();
    renderChronicle();
  }

  function buildTicks() {
    const t = $('ticks');
    const a = W.start.year, b = W.start.year + S.years;
    const step = S.years > 300 ? 100 : S.years > 120 ? 50 : 20;
    let html = '';
    for (let y = Math.ceil(a / step) * step; y <= b; y += step) html += `<span style="left:${(y - a) / (b - a) * 100}%">${y}</span>`;
    // wars between sizeable realms (dark marks)
    for (const w of S.sim.wars) {
      const pop = Math.max(stateStatsRaw(w.leaderA).pop, stateStatsRaw(w.leaderD).pop);
      if (pop < (S.years > 300 ? 2e7 : 2.5e6)) continue;
      const y = Math.floor(w.start / 12);
      html += `<i class="w" style="left:${(y - a) / (b - a) * 100}%" title="${esc(w.name)} (${y})"></i>`;
    }
    // a mark for each succession crisis or rising in a sizeable realm
    for (const c of S.sim.crises) {
      if (stateStats(c.tag).pop < (S.years > 300 ? 1.5e7 : 8e5)) continue;
      const y = Math.floor(c.from / 12);
      html += `<i style="left:${(y - a) / (b - a) * 100}%" title="${esc(c.name)} (${y})"></i>`;
    }
    t.innerHTML = html;
  }

  // ---------- panel: state ----------
  function selectState(tag, focus) {
    S.selected = tag; S.selectedChar = null; S.panel = 'state';
    map.selected = tag;
    if (focus) {
      const p = capitalOf(tag);
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
    const col = tag && SI()[tag] ? SI()[tag].color : '#7a6a55';
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
    const s = SI()[tag];
    if (!s) return esc(tag);
    return `<button class="link" data-state="${tag}"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</button>`;
  }

  function houseLink(c) {
    if (!c.dynasty || c.cleric || c.republican) return '';
    return `<button class="link" data-house="${esc(c.dynasty)}">House of ${esc(c.dynasty)}</button> · `;
  }

  // ---------- economy ----------
  const DENS = ['#f3ead0', '#e8cf8e', '#d9a441', '#b86d2c', '#8a3a24', '#55201c'];
  function densColor(d) {
    // people per km², on a log scale from 0.5 to 120
    const t = Math.max(0, Math.min(1, (Math.log(Math.max(d, 0.5)) - Math.log(0.5)) / (Math.log(120) - Math.log(0.5))));
    const f = t * (DENS.length - 1), i = Math.min(DENS.length - 2, Math.floor(f));
    return mixHex(DENS[i], DENS[i + 1], f - i);
  }
  const econFillCache = {};
  function economyLayer() {
    if (map.mode !== 'economy') { $('legend').hidden = !['diplomacy', 'progress'].includes(map.mode); return; }
    const pop = S.sim.popAt(S.year);
    let fill = econFillCache[S.year];
    if (!fill) {
      fill = {};
      for (const p of W.provinces) fill[p.id] = densColor(pop[p.id] / Math.max(1, p.area));
      econFillCache[S.year] = fill;
    }
    const flows = S.sim.routesAt(S.year);
    const routes = S.sim.routes.map((r, i) => {
      const centres = r.via.map(k => { const c = S.sim.centres[k], p = provById[c.prov]; return { name: c.name, x: p.label[0], y: p.label[1] }; });
      return { value: flows[i] || 0, choked: flows[i] < r.value * 0.9, pts: centres.map(c => [c.x, c.y]), centres };
    }).filter(r => r.value > 0);
    map.setEconomy(fill, routes, S.sim.plagueAt(S.year));
    $('legend').hidden = false;
    $('legend').innerHTML = `<b>Wealth of the land in ${S.year}</b><span><i style="background:linear-gradient(90deg,${DENS.join(',')})"></i>people per km², few to many</span>
      <span><i style="background:#b0721a"></i>great trade routes (dashed: choked by war)</span><span><i style="background:repeating-linear-gradient(45deg,#7a1414 0 2px,transparent 2px 4px)"></i>plague this year</span>`;
  }

  // who lives in the realm, and what they believe
  function peoplesPanel(tag) {
    const ch = S.sim.cultureAt(S.year);
    if (!ch) return '';
    const pop = S.sim.popAt(S.year);
    const cul = {}, rel = {};
    let tot = 0;
    for (const p of W.provinces) {
      if (ownerOf[p.id] !== tag) continue;
      const n = pop[p.id];
      tot += n;
      const c = S.sim.cultKeys[ch.cult[p.id]], r = S.sim.relKeys[ch.rel[p.id]];
      cul[c] = (cul[c] || 0) + n; rel[r] = (rel[r] || 0) + n;
    }
    if (!tot) return '';
    const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${nice(k)} <span class="dead">${Math.round(v / tot * 100)}%</span>`).join(', ');
    return `<h3>Peoples in ${S.year}</h3><dl class="facts"><dt>Cultures</dt><dd>${fmt(cul)}</dd><dt>Faiths</dt><dd>${fmt(rel)}</dd></dl>`;
  }

  function economyPanel(tag) {
    const e = S.sim.econAt(tag, S.year);
    if (!e) return '';
    const [pop, income, treasury] = e;
    const e0 = S.sim.econHist[0] && S.sim.econHist[0].states[tag];
    const change = e0 && e0[0] ? Math.round((pop / e0[0] - 1) * 100) : 0;
    const goods = {};
    for (const p of W.provinces) if (ownerOf[p.id] === tag) goods[p.good] = (goods[p.good] || 0) + 1;
    const top = Object.entries(goods).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => nice(g));
    const centres = Object.values(S.sim.centres).filter(c => ownerOf[c.prov] === tag).map(c => c.name);
    const hist = S.sim.econHist.map(h => [h.year, h.states[tag] ? h.states[tag][0] : null]).filter(x => x[1] != null && x[0] <= S.year);
    return `<h3>Economy in ${S.year}</h3><dl class="facts">
      <dt>People</dt><dd>${fmtPop(pop)} <span class="op ${change >= 0 ? 'pos' : 'neg'}">${change >= 0 ? '+' : ''}${change}% since 1444</span></dd>
      <dt>Income</dt><dd>${income.toLocaleString('en')} ducats a year</dd>
      <dt>Treasury</dt><dd class="${treasury < 0 ? 'debt' : ''}">${treasury.toLocaleString('en')} ducats${treasury < 0 ? ' (in debt)' : ''}</dd>
      ${top.length ? `<dt>Goods</dt><dd>${top.join(', ')}</dd>` : ''}
      ${centres.length ? `<dt>Trade</dt><dd>${centres.join(', ')}</dd>` : ''}
    </dl>${hist.length > 3 ? popSpark(hist) : ''}`;
  }

  function popSpark(hist) {
    const W2 = 320, H2 = 44;
    const ys = hist.map(h => h[1]), lo = Math.min(...ys) * 0.97, hi = Math.max(...ys) * 1.03;
    const x0 = hist[0][0], x1 = Math.max(x0 + 1, hist[hist.length - 1][0]);
    const X = y => 2 + (y - x0) / (x1 - x0) * (W2 - 4), Y = v => H2 - 4 - (v - lo) / Math.max(1, hi - lo) * (H2 - 10);
    const d = hist.map(([y, v], i) => `${i ? 'L' : 'M'}${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" width="100%" height="${H2}" role="img" aria-label="Population over time">
      <path d="${d} L${X(hist[hist.length - 1][0])},${H2} L${X(x0)},${H2} Z" class="area"/><path d="${d}" class="line"/>
      <text x="3" y="10" class="lab">population since 1444</text></svg>`;
  }

  // ---------- the lands of a realm through the centuries ----------
  function extentPanel(tag) {
    const hist = S.sim.econHist.map(h => [h.year, h.states[tag] ? h.states[tag][3] || 0 : 0]);
    const alive = hist.filter(h => h[1] > 0);
    if (alive.length < 3) return '';
    const W2 = 320, H2 = 56;
    const x0 = W.start.year, x1 = Math.max(x0 + 1, S.written);
    const hi = Math.max(...alive.map(h => h[1]));
    const X = y => 2 + (y - x0) / (x1 - x0) * (W2 - 4), Y = v => H2 - 3 - v / hi * (H2 - 14);
    const d = hist.map(([y, v], i) => `${i ? 'L' : 'M'}${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const best = alive.reduce((a, b) => (b[1] > a[1] ? b : a));
    const first = alive[0][0], last = alive[alive.length - 1][0];
    const gone = last < S.written - 1;
    return `<h3>Lands through time</h3>
      <svg class="spark extent" data-x0="${x0}" data-x1="${x1}" viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" width="100%" height="${H2}" role="img" aria-label="Number of provinces over time; click to go to a year">
        <path d="${d} L${X(hist[hist.length - 1][0])},${H2} L${X(hist[0][0])},${H2} Z" class="area"/><path d="${d}" class="line"/>
        <line x1="${X(S.year)}" x2="${X(S.year)}" y1="0" y2="${H2}" class="now"/>
        <text x="3" y="10" class="lab">provinces, ${x0}–${x1} · click to travel</text></svg>
      <p class="note">${first > W.start.year + 1 ? `Born ${first}. ` : ''}Greatest extent: <a href="#" data-year="${best[0]}">${best[1]} provinces in ${best[0]}</a>.${gone ? ` Gone from the map after ${last}.` : ''}</p>`;
  }

  // ---------- progress ----------
  const TECH = ['#efe6cc', '#cfdcb0', '#8fbf8a', '#4f9a86', '#2f6f8c', '#2a3f7a'];
  function progressLayer() {
    if (map.mode !== 'progress') return;
    const fill = {};
    // learning of each realm against the most advanced realm of the year
    let top = 0;
    const vals = {};
    for (const t of Object.keys(SI())) {
      const v = S.sim.techAt(t, S.year);
      if (!v) continue;
      vals[t] = (v[0] + v[1]) / 2;
      top = Math.max(top, vals[t]);
    }
    for (const [t, v] of Object.entries(vals)) {
      const x = Math.max(0, Math.min(1, 1 - (top - v) / 2.5));
      const f = x * (TECH.length - 1), i = Math.min(TECH.length - 2, Math.floor(f));
      fill[t] = mixHex(TECH[i], TECH[i + 1], f - i);
    }
    if (map._fillKey !== 'progress' + S.year) {
      map.fillOverride = fill;
      map._fillKey = 'progress' + S.year;
      map._dirty = true;
    }
    const devs = Object.entries(S.sim.devs).filter(([, d]) => d.year <= S.year);
    $('legend').hidden = false;
    $('legend').innerHTML = `<b>Learning and arms in ${S.year}</b><span><i style="background:linear-gradient(90deg,${TECH.join(',')})"></i>behind to ahead of the most advanced realm</span>` +
      (devs.length ? devs.map(([k, d]) => `<span>${esc(DEV_NAMES[k] || k)}: ${d.year}, ${esc(provById[d.origin].name)}</span>`).join('') : '<span>no great inventions yet</span>');
  }
  const DEV_NAMES = { printing: 'Printing press', gunpowder: 'Gunpowder artillery', reformation: 'Reformation', reformed: 'Reformed churches' };

  function progressPanel(tag) {
    const v = S.sim.techAt(tag, S.year);
    if (!v) return '';
    const sy = S.sim;
    const d = sy.discovered[tag] || {};
    const seen = [d.africa && d.africa <= S.year ? 'the coast of Africa' : null, d.india && d.india <= S.year ? 'the sea road to India' : null,
      d.newworld && d.newworld <= S.year ? 'the New World' : null].filter(Boolean);
    const has = Object.entries(sy.devs).filter(([k, x]) => x.year <= S.year && ['printing', 'gunpowder'].includes(k));
    const colonies = (sy.colonies || []).filter(c => c.by === tag && Math.floor(c.t / 12) <= S.year && ownerOf[c.pid] === tag).length;
    return `<h3>Learning in ${S.year}</h3><dl class="facts">
      <dt>Learning</dt><dd>${v[0].toFixed(1)} <span class="dead">administration</span> · ${v[1].toFixed(1)} <span class="dead">arms</span></dd>
      ${has.length ? `<dt>Has</dt><dd>${has.map(([k]) => DEV_NAMES[k]).join(', ')}</dd>` : ''}
      ${seen.length ? `<dt>Has reached</dt><dd>${seen.join(', ')}</dd>` : ''}
      ${colonies ? `<dt>Colonies</dt><dd>${colonies} provinces overseas</dd>` : ''}
    </dl>`;
  }

  // ---------- war ----------
  function battlesIn(y) {
    const out = [];
    for (const w of S.sim.wars) {
      if (Math.floor(w.start / 12) > y || (w.end != null && Math.floor(w.end / 12) < y)) continue;
      for (const b of w.battles) {
        if (Math.floor(b.t / 12) !== y) continue;
        const p = provById[b.pid];
        const victor = b.win === 'A' ? w.leaderA : w.leaderD;
        out.push({ x: p.label[0], y: p.label[1], color: SI()[victor] ? SI()[victor].color : null, size: b.A + b.D });
      }
    }
    return out;
  }

  function warLink(w) { return `<button class="link" data-war="${w.id}">${esc(w.name)}</button>`; }
  function yrs(w) { return `${Math.floor(w.start / 12)}–${w.end != null ? Math.floor(w.end / 12) : ''}`; }
  function wsAt(w, y) {
    let v = 0;
    for (const [yy, ws] of w.wsHistory) if (yy <= y) v = ws;
    return v;
  }

  function warsPanel(tag) {
    const sy = S.sim, t = tMid(S.year);
    const mine = sy.wars.filter(w => w.A.includes(tag) || w.D.includes(tag) || w.transfers.some(x => x.from === tag || x.to === tag));
    if (!mine.length) return '';
    const now = mine.filter(w => w.start <= t && (w.end == null || w.end > t));
    let html = '';
    if (now.length) {
      html += `<h3>At war in ${S.year}</h3><div class="wars">`;
      for (const w of now) {
        const side = w.A.includes(tag) ? 'A' : 'D';
        const ws = wsAt(w, S.year) * (side === 'A' ? 1 : -1);
        const foe = side === 'A' ? w.leaderD : w.leaderA;
        html += `<div class="war-row">${warLink(w)}<br><span class="dead">against ${esc(SI()[foe].name)} · since ${Math.floor(w.start / 12)}</span>
          <div class="wsbar" title="war score ${ws}"><i style="left:${50 + ws / 2}%"></i></div></div>`;
      }
      html += `</div>`;
    }
    const past = mine.filter(w => w.end != null && w.end <= t);
    if (past.length) {
      html += `<h3>Wars fought</h3><ul class="reigns">`;
      for (const w of past.slice(-12).reverse()) {
        const side = w.A.includes(tag) ? 'A' : w.D.includes(tag) ? 'D' : null;
        const won = w.result === 'white peace' ? 'draw' : side && ((w.result === 'attackers') === (side === 'A')) ? 'won' : side ? 'lost' : '';
        html += `<li><span class="yrs">${yrs(w)}</span><span>${warLink(w)} <span class="res ${won}">${won}</span></span></li>`;
      }
      html += `</ul>`;
    }
    return html;
  }

  function openWar(id) {
    const sy = S.sim, w = sy.wars.find(x => x.id === +id);
    if (!w) return;
    const sideList = side => w[side].map(stateLink).join(', ');
    const goal = w.goal.type === 'claim' ? `to put ${esc(sy.fullName(sy.char(w.goal.claimant)))} on the throne of ${esc(SI()[w.leaderD].name)}`
      : w.goal.type === 'independence' ? `independence for ${esc(SI()[w.leaderA].name)}`
      : w.goal.type === 'conquest' ? `conquest of ${w.goal.provs.map(p => esc(provById[p].name)).join(', ')}` : 'to humble the enemy';
    const result = w.end == null ? 'still being fought' : w.result === 'white peace' ? 'white peace' : `victory for the ${w.result}`;
    let html = `<p class="eyebrow">War · ${yrs(w)}</p><h2>${esc(w.name)}</h2>
      <dl class="facts"><dt>Attackers</dt><dd>${sideList('A')}</dd><dt>Defenders</dt><dd>${sideList('D')}</dd>
      <dt>Aim</dt><dd>${goal}</dd><dt>Outcome</dt><dd>${esc(result)}${w.treaty && w.end != null ? ` (${esc(w.treaty)})` : ''}</dd>
      ${w.transfers.length ? `<dt>Land</dt><dd>${w.transfers.map(x => `${esc(provById[x.pid].name)} <span class="dead">${esc(SI()[x.from].name)} → ${esc(SI()[x.to].name)}</span>`).join('<br>')}</dd>` : ''}
      </dl>`;
    if (w.wsHistory.length > 1) html += `<h3>War score</h3>${spark(w)}`;
    if (w.battles.length) {
      html += `<h3>Battles</h3><ul class="battles">`;
      for (const b of w.battles) {
        const victor = b.win === 'A' ? w.leaderA : w.leaderD;
        html += `<li><span class="yrs">${mon(b.t)} ${Math.floor(b.t / 12)}</span><span><b>${esc(b.name)}</b> · ${esc(SI()[victor].name)} wins<br>
          <span class="dead">${b.A.toLocaleString('en')} attackers (lost ${b.lossA.toLocaleString('en')}) against ${b.D.toLocaleString('en')} defenders (lost ${b.lossD.toLocaleString('en')})</span></span></li>`;
      }
      html += `</ul>`;
    }
    $('war-body').innerHTML = html;
    $('war').hidden = false;
  }

  // war score over the years: above the line the attackers lead
  function spark(w) {
    const pts = w.wsHistory;
    const W2 = 320, H2 = 70, x0 = pts[0][0], x1 = pts[pts.length - 1][0] || x0 + 1;
    const X = y => 4 + (y - x0) / Math.max(1, x1 - x0) * (W2 - 8), Y = v => H2 / 2 - v / 100 * (H2 / 2 - 4);
    const d = pts.map(([y, v], i) => `${i ? 'L' : 'M'}${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W2} ${H2}" preserveAspectRatio="none" width="100%" height="${H2}" role="img" aria-label="War score over time">
      <line x1="0" x2="${W2}" y1="${H2 / 2}" y2="${H2 / 2}" class="axis"/><path d="${d}" class="line"/>
      <text x="4" y="11" class="lab">${esc(SI()[w.leaderA].name)} ahead</text><text x="4" y="${H2 - 4}" class="lab">${esc(SI()[w.leaderD].name)} ahead</text></svg>`;
  }

  // ---------- diplomacy ----------
  const DIP = { ally: '#4a78b8', rival: '#b8432f', vassal: '#8a62b0', none: '#d9cfb8' };
  function mixHex(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('');
  }
  // the diplomacy layer: alliance blocs, or the relations of the selected realm
  function diplomacyLayer() {
    if (map.mode !== 'diplomacy') return;
    $('legend').hidden = false;
    $('legend').innerHTML = S.selected
      ? `<b>${esc(SI()[S.selected].name)} in ${S.year}</b><span><i style="background:${DIP.ally}"></i>allies</span><span><i style="background:${DIP.rival}"></i>rivals</span><span><i style="background:${DIP.vassal}"></i>vassals and overlord</span><span><i style="background:linear-gradient(90deg,#c98a5a,${DIP.none},#6f9e58)"></i>opinion, bad to good</span>`
      : `<b>Alliances in ${S.year}</b><span>each alliance in the colour of its strongest member</span><span>pale: realms without allies</span><span>stripes: vassals and personal unions</span><span>click a realm for its relations</span>`;
    const fill = {}, lines = [];
    const sel = S.selected;
    if (sel) {
      const r = S.sim.relationsOf(sel, S.year);
      const cap = t => capitalOf(t).label;
      fill[sel] = SI()[sel].color;
      for (const [o, v] of r.opinions) {
        // opinion as a wash from red through parchment to green
        fill[o] = v >= 0 ? mixHex(DIP.none, '#6f9e58', Math.min(1, v / 60)) : mixHex(DIP.none, '#c98a5a', Math.min(1, -v / 60));
      }
      for (const o of r.allies) { fill[o] = DIP.ally; lines.push({ from: cap(sel), to: cap(o), kind: 'ally' }); }
      for (const o of r.vassals) { fill[o] = DIP.vassal; lines.push({ from: cap(sel), to: cap(o), kind: 'vassal' }); }
      if (r.overlord) { fill[r.overlord] = DIP.vassal; lines.push({ from: cap(sel), to: cap(r.overlord), kind: 'overlord' }); }
      for (const o of new Set([...r.rivals, ...r.rivalOf])) { fill[o] = DIP.rival; lines.push({ from: cap(sel), to: cap(o), kind: 'rival' }); }
    } else {
      // each alliance in the colour of its strongest member; realms on their own stay pale
      const lead = S.sim.leaderAt(S.year);
      for (const t of Object.keys(SI())) fill[t] = lead[t] ? SI()[lead[t]].color : mixHex(SI()[t].color, DIP.none, 0.78);
    }
    map.setDiplomacy(fill, lines);
  }

  function diplomacyPanel(tag) {
    const r = S.sim.relationsOf(tag, S.year);
    if (!r) return '';
    const list = xs => xs.length ? xs.map(stateLink).join(', ') : '<span class="dead">none</span>';
    const opin = (t, v) => `${stateLink(t)} <span class="op ${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v}</span>`;
    const best = r.opinions.filter(x => x[1] > 0).slice(0, 3), worst = r.opinions.filter(x => x[1] < 0).slice(-3).reverse();
    let html = `<h3>Diplomacy in ${S.year}</h3><dl class="facts">`;
    if (r.overlord) html += `<dt>Overlord</dt><dd>${stateLink(r.overlord)}${r.liberty != null ? ` <span class="dead">· desire for freedom ${r.liberty}%</span>` : ''}</dd>`;
    html += `<dt>Allies</dt><dd>${list(r.allies)}</dd>`;
    html += `<dt>Rivals</dt><dd>${list(r.rivals)}</dd>`;
    const rivalOnly = r.rivalOf.filter(x => !r.rivals.includes(x));
    if (rivalOnly.length) html += `<dt>Rivalled by</dt><dd>${list(rivalOnly)}</dd>`;
    if (r.vassals.length) html += `<dt>Vassals</dt><dd>${list(r.vassals)}</dd>`;
    if (best.length) html += `<dt>Friends</dt><dd>${best.map(x => opin(...x)).join(', ')}</dd>`;
    if (worst.length) html += `<dt>Foes</dt><dd>${worst.map(x => opin(...x)).join(', ')}</dd>`;
    return html + `</dl>`;
  }

  // heir, claimants, marriage ties: the dynastic picture of a realm in the chosen year
  function succession(tag) {
    const sy = S.sim, t = tMid(S.year);
    let html = '';
    const h = sy.heirAt(tag, t);
    // an elected republic has no crown to claim and no royal marriages
    const rep = sy.states[tag].republicSince != null && sy.states[tag].republicSince <= t;
    const cls = rep ? [] : sy.claimsAt(tag, t).sort((a, b) => b.strength - a.strength);
    const ties = rep ? [] : sy.tiesOf(tag, t).slice(0, 6);
    if (!h && !cls.length && !ties.length) return '';
    html += `<dl class="facts">`;
    if (h) html += `<dt>Heir</dt><dd>${charLink(h.char, true)} <span class="dead">${esc(h.note)}, age ${ageAt(h.char, S.year)}</span></dd>`;
    if (cls.length) html += `<dt>Claimants</dt><dd class="claims">${cls.slice(0, 4).map(c => {
      const x = sy.char(c.char);
      return `<div>${charLink(x, true)} <span class="pips" title="strength of the claim">${'●'.repeat(Math.max(1, Math.round(c.strength * 4)))}</span><br><span class="dead">${esc(c.reason)}</span></div>`;
    }).join('')}</dd>`;
    if (ties.length) html += `<dt>Married into</dt><dd>${ties.map(x => stateLink(x.tag) + (x.n > 1 ? ` <span class="dead">×${x.n}</span>` : '')).join(', ')}</dd>`;
    html += `</dl>`;
    return html;
  }

  const statsCache = {};
  function stateStats(tag) {
    const k = S.year + tag;
    if (statsCache[k]) return statsCache[k];
    return (statsCache[k] = stateStatsRaw(tag));
  }
  function stateStatsRaw(tag) {
    let n = 0, pop = 0;
    const pp = S.sim && S.sim.popAt ? S.sim.popAt(S.year) : null;
    for (const p of W.provinces) if (ownerOf[p.id] === tag) { n++; pop += pp ? pp[p.id] : p.pop; }
    return { n, pop };
  }

  function fmtPop(p) { return p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + ' million' : Math.round(p / 1000) + ' thousand'; }
  function mon(t) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t % 12]; }

  function renderPanel() {
    if ($('panel').hidden) return;
    const body = $('panel-body');
    if (S.panel === 'char' && S.selectedChar) { body.innerHTML = charPanel(S.sim.char(S.selectedChar)); return; }
    if (!S.selected) { $('panel').hidden = true; return; }
    const tag = S.selected, s = SI()[tag], st = S.sim.states[tag];
    const r = rulerAt(tag, S.year), reg = regentAt(tag, S.year);
    const { n, pop } = stateStats(tag);
    const sy = S.sim;
    const gov = st.republicSince != null && st.republicSince > tMid(S.year) && st.oldGov ? st.oldGov.government : s.government;
    let html = `<p class="eyebrow">${esc(GOV[gov] || gov)}</p>
      <h2><span class="swatch" style="background:${s.color};width:16px;height:16px"></span>${esc(s.name)}</h2>`;
    if (st.born) html += `<p class="note">Born of a revolt in ${Math.floor(st.born / 12)}.</p>`;
    if (st.destroyed && st.destroyed.t <= tMid(S.year)) html += `<p class="note">Conquered: its last lands fell to ${stateLink(st.destroyed.by)} in ${Math.floor(st.destroyed.t / 12)}.</p>`;
    if (r) {
      html += `<div class="ruler-card">${medal(r, tag)}<div>
        <div class="nm">${charLink(r, true, tag)}</div>
        <div class="sub">${houseLink(r)}age ${ageAt(r, S.year)}${reg ? ' · regent: ' + charLink(reg) : ''}</div>
        ${traitChips(r)}
        <div class="stats"><span>Administration <b>${r.adm}</b></span><span>Diplomacy <b>${r.dip}</b></span><span>Military <b>${r.mil}</b></span></div>
      </div></div>`;
      const u = sy.unionAt(tag, tMid(S.year));
      if (u) html += `<p class="note">In personal union: ${u.tags.filter(x => x !== tag).map(stateLink).join(', ')} share this ruler since ${Math.floor(u.from / 12)}.</p>`;
    }
    html += succession(tag);
    html += `<dl class="facts">
      <dt>Succession</dt><dd>${esc(lawAt(tag))}</dd>
      <dt>Capital</dt><dd>${esc(capitalOf(tag).name)}</dd>
      <dt>Provinces</dt><dd>${n}</dd>
      <dt>People</dt><dd>${fmtPop(pop)}</dd>
      <dt>Culture</dt><dd>${esc(nice(st.culture || s.culture))}</dd>
      <dt>Faith</dt><dd>${esc(nice(st.religion || s.religion))}</dd>
    </dl>`;
    html += `<div class="actions"><button class="ghost" data-act="article" data-state="${tag}">Read the history of ${esc(s.name)}</button></div>`;
    html += fatePanel(tag, r);
    html += progressPanel(tag);
    html += peoplesPanel(tag);
    html += economyPanel(tag);
    html += warsPanel(tag);
    html += diplomacyPanel(tag);
    html += extentPanel(tag);
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
    const link = e.war ? ` data-war="${e.war}"` : e.chars[0] ? ` data-char="${esc(e.chars[0])}"` : e.states[0] ? ` data-state="${e.states[0]}"` : '';
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
      <div class="sub">${houseLink(c)}${c.illegitimate ? 'natural child · ' : ''}${born}–${died ?? ''}${died != null ? ` (aged ${Math.floor((c.died - c.born) / 12)})` : ''}</div>
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
      ${(c.marriages || []).map(m => { const x = sy.char(m.spouse); return x ? `<div><span class="role">${c.sex === 'm' ? 'Wife' : 'Husband'}</span>${charLink(x)} <span class="dead">${m.t != null ? 'm. ' + Math.floor(m.t / 12) : ''}</span></div>` : ''; }).join('')}
      ${!(c.marriages || []).length && sp ? `<div><span class="role">Spouse</span>${charLink(sp)}</div>` : ''}
      ${kids.map(k => `<div><span class="role">${k.sex === 'm' ? 'Son' : 'Daughter'}</span>${charLink(k)} <span class="dead">${Math.floor(k.born / 12)}–${k.died != null ? Math.floor(k.died / 12) : ''}</span></div>`).join('')}
      ${!fa && !mo && !sp && !kids.length ? '<p class="note">No family recorded.</p>' : ''}
    </div>`;
    const cls = sy.claims.filter(x => x.char === c.id);
    if (cls.length) {
      html += `<h3>Claims</h3><div class="family">${cls.map(x => `<div>${stateLink(x.tag)} <span class="dead">${Math.floor(x.from / 12)}–${x.to != null ? Math.floor(x.to / 12) : ''} · ${esc(x.reason)}${x.endReason ? ' · ' + esc(x.endReason) : ''}</span></div>`).join('')}</div>`;
    }
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

  // ---------- a royal house and its family tree ----------
  function openHouse(name) {
    const sy = S.sim, d = sy.dynasty(name);
    if (!d) return;
    const members = new Set(d.members.filter(id => sy.char(id)));
    const crowns = Object.entries(d.crowns).sort((a, b) => b[1] - a[1]);
    $('house-title').textContent = `House of ${name}`;
    const rulers = d.members.map(id => sy.char(id)).filter(c => c && c.everRuled).length;
    $('house-sub').innerHTML = `${members.size} members · ${rulers} rulers` +
      (crowns.length ? ` · crowns: ${crowns.map(([t, m]) => `${stateLink(t)} <span class="dead">${Math.round(m / 12)} yrs</span>`).join(', ')}` : '');
    // children who died young are counted but left out of the drawing
    const young = [...members].filter(id => { const c = sy.char(id); return c.died != null && c.died - c.born < 15 * 12 && !c.everRuled; });
    for (const id of young) members.delete(id);
    if (young.length) $('house-sub').innerHTML += ` · ${young.length} died in childhood (not shown)`;
    $('house-tree').innerHTML = houseTree(members);
    $('house').hidden = false;
    // scroll the tree (not the page) to the member who rules in the chosen year
    const box = $('house-tree'), ruling = box.querySelector('.node.now') || box.querySelector('.node.ruler');
    box.scrollLeft = 0; box.scrollTop = 0;
    if (ruling) {
      box.scrollLeft = Math.max(0, ruling.offsetLeft - box.clientWidth / 2 + ruling.offsetWidth / 2);
      box.scrollTop = Math.max(0, ruling.offsetTop - box.clientHeight / 2);
    }
  }

  function houseTree(members) {
    const sy = S.sim;
    const NW = 138, NH = 54, GX = 10, GY = 40;
    const kidsOf = c => c.children.map(id => sy.char(id)).filter(k => k && members.has(k.id)).sort((a, b) => a.born - b.born);
    const roots = [...members].map(id => sy.char(id)).filter(c => !(c.father && members.has(c.father)) && !(c.mother && members.has(c.mother) && sy.char(c.mother).dynasty === c.dynasty))
      .sort((a, b) => a.born - b.born);
    const nodes = [], links = [];
    let slot = 0, maxDepth = 0;
    const place = (c, depth, seen) => {
      if (seen.has(c.id)) return null;
      seen.add(c.id);
      maxDepth = Math.max(maxDepth, depth);
      const kids = kidsOf(c);
      const xs = kids.map(k => place(k, depth + 1, seen)).filter(x => x != null);
      const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : slot++;
      nodes.push({ c, x, depth });
      for (const kx of xs) links.push([x, depth, kx, depth + 1]);
      return x;
    };
    const seen = new Set();
    for (const r of roots) { place(r, 0, seen); slot += 0.4; }
    const W2 = Math.max(1, slot) * (NW + GX) + 40, H2 = (maxDepth + 1) * (NH + GY) + 30;
    const px = x => 20 + x * (NW + GX), py = d => 16 + d * (NH + GY);
    let svg = `<svg width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Family tree">`;
    for (const [x0, d0, x1, d1] of links) {
      const ax = px(x0) + NW / 2, ay = py(d0) + NH, bx = px(x1) + NW / 2, by = py(d1);
      const my = (ay + by) / 2;
      svg += `<path class="edge" d="M${ax},${ay} V${my} H${bx} V${by}" />`;
    }
    svg += '</svg>';
    let html = `<div class="tree-canvas" style="width:${W2}px;height:${H2}px">${svg}`;
    const t = tMid(S.year);
    for (const n of nodes) {
      const c = n.c;
      const ruled = [];
      for (const [tag, st] of Object.entries(sy.states)) if (st.history.some(h => h.char === c.id)) ruled.push(tag);
      const col = ruled.length ? SI()[ruled[0]].color : null;
      const sp = (c.marriages || []).map(m => sy.char(m.spouse)).filter(Boolean)[0];
      const now = ruled.some(tag => sy.rulerAt(tag, t) === c);
      const cls = ['node', c.born > t ? 'future' : '', ruled.length ? 'ruler' : '', now ? 'now' : '', c.died != null && c.died - c.born < 15 * 12 ? 'child' : ''].join(' ');
      html += `<button class="${cls}" data-char="${esc(c.id)}" style="left:${px(n.x)}px;top:${py(n.depth)}px;width:${NW}px;height:${NH}px${col ? `;--realm:${col}` : ''}">
        <span class="n">${ruled.length ? '♛ ' : ''}${esc(ruled.length ? sy.nameIn(c, ruled[0]) : c.name)}</span>
        <span class="y">${Math.floor(c.born / 12)}–${c.died != null ? Math.floor(c.died / 12) : ''}${ruled.length ? ' · ' + esc(ruled.map(x => SI()[x].name).join(', ')) : ''}</span>
        ${sp ? `<span class="y">∞ ${esc(sp.name)}${sp.dynasty ? ' of ' + esc(sp.dynasty) : ''}</span>` : ''}
      </button>`;
    }
    return html + '</div>';
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

  // text from history.js with [[s:TAG]], [[c:ID]] and [[w:ID]] turned into links
  function linkify(text) {
    return esc(text).replace(/\[\[(s|c|w):([^\]]+)\]\]/g, (m, k, id) => {
      if (k === 's') return stateLink(id);
      if (k === 'c') { const c = S.sim.char(id) || S.sim.char(+id); return c ? charLink(c, true) : '?'; }
      const w = S.sim.wars.find(x => String(x.id) === id);
      return w ? warLink(w) : 'a war';
    });
  }

  const storyCache = {};
  function decadeStories() {
    let html = '';
    const last = Math.floor(S.year / 10) * 10;
    for (let d = Math.floor(W.start.year / 10) * 10; d <= last; d += 10) {
      let st = storyCache[d];
      if (!st) {
        st = S.sim.decadeStory(d);
        if (st && d + 10 <= S.written) storyCache[d] = st;
      }
      if (!st) continue;
      html += `<h4 id="dec-${d}">The ${d}s</h4>` + st.paras.map(p => `<p class="story">${linkify(p)}</p>`).join('');
    }
    return html;
  }

  function openArticle(tag) {
    const a = S.sim.realmArticle(tag, S.year), s = SI()[tag];
    let html = `<p class="eyebrow">From the encyclopaedia of timeline #${esc(S.seed)} · as known in ${S.year}</p>
      <h2><span class="swatch" style="background:${s.color};width:18px;height:18px"></span>${esc(a.title)}</h2>
      <aside class="infobox"><div class="ib-flag" style="background:${s.color}"></div><dl>
        ${Object.entries(a.box).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl></aside>
      <p class="lead">${linkify(a.lead)}</p>`;
    for (const sec of a.sections) html += `<h3>${esc(sec.title)}</h3>` + sec.paras.map(p => `<p>${linkify(p)}</p>`).join('');
    if (a.rivals.length) html += `<h3>See also</h3><p>Old enemies: ${a.rivals.map(stateLink).join(', ')}</p>`;
    html += `<p class="note">Written from the records of this timeline. Change the year to read what was known then.</p>`;
    $('article-body').innerHTML = html;
    $('article').hidden = false;
    $('article').querySelector('.article-card').scrollTop = 0;
  }

  function renderChronicle() {
    if ($('chronicle').hidden) return;
    if (S.chronMode !== 'events') {
      $('chron-body').innerHTML = decadeStories() || '<p class="note">The chronicle is empty.</p>';
      const tg = document.getElementById(`dec-${Math.floor(S.year / 10) * 10}`);
      if (tg && S.scrollChron) { tg.scrollIntoView({ block: 'start' }); S.scrollChron = false; }
      return;
    }
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
    rewrite();
  }
  function rewrite() {
    const keepYear = S.year;
    runTimeline(() => { S.year = Math.min(keepYear, S.written); $('slider').value = S.year; }, keepYear);
  }

  // the link remembers the seed, a compared seed and the changes, so a version of history can be shared
  function writeHash() {
    let h = '#s' + S.seed + (CMP.seed ? '~' + CMP.seed : '');
    if (S.interventions.length) h += '|f:' + btoa(unescape(encodeURIComponent(JSON.stringify(S.interventions)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try { history.replaceState(null, '', h); } catch (err) { /* ignore */ }
  }

  // ---------- the hand of fate: the panel of a realm ----------
  const DEVS = { printing: 'the printing press', gunpowder: 'gunpowder artillery', industry: 'the steam engine', medicine: 'modern medicine' };
  const DISASTERS = { earthquake: 'An earthquake', flood: 'A great flood', fire: 'A great fire', locusts: 'A plague of locusts',
    pestilence: 'A pestilence (spreads worldwide)', volcano: 'A volcanic winter (half the world)' };
  const LEGEND_NAMES = { alexander: 'Alexander the Great', caesar: 'Julius Caesar', charlemagne: 'Charlemagne', genghis: 'Genghis Khan', timur: 'Tamerlane',
    saladin: 'Saladin', cleopatra: 'Cleopatra', ashoka: 'Ashoka', qin: 'Qin Shi Huang', musa: 'Mansa Musa', joan: 'Joan of Arc', elizabeth: 'Elizabeth I',
    suleiman: 'Suleiman the Magnificent', akbar: 'Akbar', peter: 'Peter the Great', catherine: 'Catherine the Great', napoleon: 'Napoleon' };
  function neighboursOf(tag) {
    const sy = S.sim, out = new Set();
    for (const p of W.provinces) if (ownerOf[p.id] === tag) for (const q of sy.pAdj[p.id]) if (ownerOf[q] && ownerOf[q] !== tag) out.add(ownerOf[q]);
    const dipl = sy.diplomacyAt(S.year);
    if (dipl && dipl.rivals) for (const [a, b] of dipl.rivals) { if (a === tag) out.add(b); if (b === tag) out.add(a); }
    return [...out].filter(t => SI()[t]).sort((a, b) => stateStats(b).pop - stateStats(a).pop).slice(0, 20);
  }
  function fatePanel(tag, r) {
    const s = SI()[tag], st = S.sim.states[tag], y = S.year, sy = S.sim;
    const alive = r && isAliveAt(r, y);
    const atWar = sy.warsAt(y).some(w => (w.end == null || w.end > tMid(y)) && (w.leaderA === tag || w.leaderD === tag));
    const devs = Object.keys(DEVS).filter(k => !sy.devs[k] || sy.devs[k].year > y);
    const mon = st.republicSince == null || st.republicSince > tMid(y);
    const neigh = neighboursOf(tag);
    const b = (act, label, extra = '') => `<button class="ghost" data-act="${act}" data-state="${tag}"${extra}>${label}</button>`;
    let html = `<h3>The hand of fate in ${y}</h3><div class="fate">`;
    if (alive) {
      html += `<div class="fate-row"><span class="fate-k">The ruler</span>
        <button class="ghost" data-act="kill" data-char="${esc(r.id)}">Strike down ${esc(r.name)}</button>
        ${r.spouse ? b('heir', 'Grant an heir') : ''}
        ${b('gift', 'A wise ruler', ` data-char="${esc(r.id)}" data-stat="adm"`)}
        ${b('gift', 'A great general', ` data-char="${esc(r.id)}" data-stat="mil"`)}
        ${b('gift', 'A silver tongue', ` data-char="${esc(r.id)}" data-stat="dip"`)}
        ${r.traits.includes('mad') ? '' : b('madness', 'Madness', ` data-char="${esc(r.id)}"`)}</div>`;
    }
    if (neigh.length) html += `<div class="fate-row"><span class="fate-k">War</span>
      <select id="fate-target" aria-label="Realm to attack">${neigh.map(t => `<option value="${t}">${esc(SI()[t].name)}</option>`).join('')}</select>
      ${b('war', 'Declare war')}${atWar ? b('peace', 'Force a peace') : ''}</div>`;
    else if (atWar) html += `<div class="fate-row"><span class="fate-k">War</span>${b('peace', 'Force a peace')}</div>`;
    html += `<div class="fate-row"><span class="fate-k">The realm</span>${b('gold', 'Fill the treasury')}${b('plague', 'Send the plague')}${b('revolt', 'Stir a rebellion')}
      ${b('unite', 'Unite its people')}${mon && y >= 1600 ? b('revolution', 'Topple the crown') : ''}</div>`;
    html += `<div class="fate-row"><span class="fate-k">Disaster</span>
      <select id="fate-disaster" aria-label="Disaster">${Object.entries(DISASTERS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>${b('disaster', 'Unleash')}</div>`;
    html += `<div class="fate-row"><span class="fate-k">A legend returns</span>
      <select id="fate-legend" aria-label="Figure from history">${Object.entries(LEGEND_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>${b('legend', 'Put on the throne')}</div>`;
    const faiths = Object.keys(W.religions).filter(f => f !== st.religion && ['catholic', 'orthodox', 'protestant', 'reformed', 'sunni', 'shiite', 'buddhist', 'hindu', 'confucian', 'jewish', 'mahayana', 'theravada', 'shinto', 'sikh', 'coptic'].includes(f));
    html += `<div class="fate-row"><span class="fate-k">Destiny</span>${b('conqueror', 'A conqueror')}${b('golden', 'A golden age')}${b('voyage', 'Great voyages')}
      ${(sy.provsOf[tag] || []).length >= 6 || stateStats(tag).n >= 6 ? b('collapse', 'Break it apart') : ''}</div>`;
    if (faiths.length) html += `<div class="fate-row"><span class="fate-k">Faith</span>
      <select id="fate-faith" aria-label="Faith">${faiths.map(f => `<option value="${f}">${nice(f)}</option>`).join('')}</select>${b('convert', 'Convert the crown')}</div>`;
    if (devs.length) html += `<div class="fate-row"><span class="fate-k">Ideas</span>
      <select id="fate-dev" aria-label="Invention">${devs.map(k => `<option value="${k}">${DEVS[k]}</option>`).join('')}</select>${b('invent', 'Invent it here')}</div>`;
    html += `</div><p class="note">Every change writes history again from 1444 with your hand in it, from ${y} on.</p>`;
    return html;
  }
  function fateAct(act, el) {
    const tag = el.dataset.state, s = SI()[tag], y = S.year, t = y * 12 + 1;
    const c = el.dataset.char && S.sim.char(el.dataset.char);
    const nm = c ? S.sim.nameAt(c, tMid(y), tag) : '';
    const iv = { type: act, state: tag, t };
    if (act === 'gift') {
      Object.assign(iv, { char: c.id, stat: el.dataset.stat });
      iv.text = { adm: `${nm} of ${s.name} wakes with a mind as sharp as a blade.`, mil: `${nm} of ${s.name} is touched by the god of war.`, dip: `${nm} of ${s.name} could charm a stone.` }[el.dataset.stat];
    } else if (act === 'madness') { iv.char = c.id; iv.text = `${nm} of ${s.name} loses his wits.`.replace(' his ', c.sex === 'f' ? ' her ' : ' his '); }
    else if (act === 'war') { iv.target = $('fate-target').value; iv.text = `Out of nowhere, ${s.name} goes to war with ${SI()[iv.target].name}.`; }
    else if (act === 'peace') iv.text = `Exhausted, ${s.name} lays down its arms.`;
    else if (act === 'gold') iv.text = `A vein of silver is found in ${s.name}; the treasury overflows.`;
    else if (act === 'plague') iv.text = `A ship brings the plague to ${capitalOf(tag).name}.`;
    else if (act === 'revolt') iv.text = `Rebellion stirs in ${s.name}.`;
    else if (act === 'unite') iv.text = `The kin of ${s.name} agree to live under one crown.`;
    else if (act === 'revolution') iv.text = `The people of ${s.name} storm the palace.`;
    else if (act === 'invent') { iv.dev = $('fate-dev').value; iv.text = `In ${s.name}, someone has an idea ahead of the times: ${DEVS[iv.dev]}.`; }
    else if (act === 'disaster') {
      iv.kind = $('fate-disaster').value;
      iv.text = { earthquake: `The earth shakes ${capitalOf(tag).name} to rubble.`, flood: `The rivers of ${s.name} burst their banks.`, fire: `${capitalOf(tag).name} burns for three days.`,
        locusts: `Clouds of locusts darken the fields of ${s.name}.`, pestilence: `A new pestilence is born in ${capitalOf(tag).name}.`, volcano: `A mountain explodes and the sky goes dark.` }[iv.kind];
    } else if (act === 'legend') { iv.legend = $('fate-legend').value; iv.text = `${LEGEND_NAMES[iv.legend]} walks out of the pages of history and takes the throne of ${s.name}.`; }
    else if (act === 'conqueror') iv.text = `The ruler of ${s.name} dreams of an empire without end.`;
    else if (act === 'golden') iv.text = `A golden age dawns in ${s.name}.`;
    else if (act === 'voyage') iv.text = `${s.name} builds great ships and sends them beyond the horizon.`;
    else if (act === 'collapse') iv.text = `${s.name} falls apart.`;
    else if (act === 'convert') { iv.faith = $('fate-faith').value; iv.text = `The crown of ${s.name} embraces the ${nice(iv.faith)} faith.`; }
    intervene(iv);
  }

  function openFateList() {
    $('fate-seed').textContent = S.seed;
    $('fate-list').innerHTML = S.interventions.map((iv, i) => `<li><span class="dead">${Math.floor(iv.t / 12)}</span> ${esc(iv.text || iv.type)}
      <button class="ghost" data-undo="${i}">Undo</button></li>`).join('') || '<li>No changes.</li>';
    $('fate-dialog').hidden = false;
  }

  document.addEventListener('click', e => {
    // travel through time from the panels
    const ya = e.target.closest('a[data-year]');
    if (ya) { e.preventDefault(); setYear(+ya.dataset.year); return; }
    const ex = e.target.closest('svg.extent');
    if (ex) {
      const r = ex.getBoundingClientRect(), x0 = +ex.dataset.x0, x1 = +ex.dataset.x1;
      setYear(Math.round(x0 + (e.clientX - r.left) / r.width * (x1 - x0)));
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'kill') {
      const c = S.sim.char(b.dataset.char);
      intervene({ type: 'kill', char: c.id, t: S.year * 12 + 1, text: `By the hand of fate, ${nameOf(c)} dies suddenly.` });
      return;
    }
    if (b.dataset.act === 'heir') {
      const st = SI()[b.dataset.state];
      intervene({ type: 'heir', state: b.dataset.state, t: S.year * 12 + 1, text: `Against all expectation, an heir is born in ${st.name}.` });
      return;
    }
    if (b.dataset.act === 'article') { openArticle(b.dataset.state); return; }
    if (['gift', 'madness', 'war', 'peace', 'gold', 'plague', 'revolt', 'unite', 'revolution', 'invent', 'disaster', 'legend', 'conqueror', 'golden', 'voyage', 'collapse', 'convert'].includes(b.dataset.act)) { fateAct(b.dataset.act, b); return; }
    if (b.dataset.undo != null) { S.interventions.splice(+b.dataset.undo, 1); $('fate-dialog').hidden = true; rewrite(); return; }
    if (b.dataset.war) { $('article').hidden = true; openWar(b.dataset.war); return; }
    if (b.dataset.house) { openHouse(b.dataset.house); return; }
    if (b.dataset.char) { $('house').hidden = true; $('war').hidden = true; $('article').hidden = true; selectChar(b.dataset.char); return; }
    if (b.dataset.state && !$('war').hidden) $('war').hidden = true;
    if (b.dataset.state && !$('article').hidden) $('article').hidden = true;
    if (b.dataset.state) { selectState(b.dataset.state, true); return; }
  });

  // ---------- controls ----------
  function setYear(y, animate) {
    const prev = S.year;
    S.year = Math.max(W.start.year, Math.min(S.written, +$('slider').max, y));
    $('slider').value = S.year;
    if (animate && S.year === prev + 1) showYearMarkers(S.year);
    refresh();
  }

  function showYearMarkers(y) {
    for (const e of S.sim.events) {
      if (Math.floor(e.t / 12) !== y || e.type !== 'plague' || !e.pid || !/breaks out/.test(e.text)) continue;
      const p = provById[e.pid];
      map.addMarker(p.label[0], p.label[1], `Plague in ${p.name}`, 'death');
    }
    const evs = S.sim.events.filter(e => Math.floor(e.t / 12) === y && (e.type === 'succession' || e.type === 'union' || e.type === 'crisis' || e.type === 'peace'));
    const big = evs.map(e => [e, stateStats(e.states[0]).pop]).sort((a, b) => b[1] - a[1]).slice(0, 7);
    for (const [e] of big) {
      const tag = e.states[0];
      const p = capitalOf(tag);
      const r = S.sim.char(e.chars[0]);
      const war = e.war && S.sim.wars.find(x => x.id === e.war);
      const txt = e.type === 'peace' ? (war && war.transfers.length ? `${war.treaty}` : '') : e.type === 'union' ? `${SI()[tag].name}: personal union` : r ? `♛ ${nameOf(r)}` : '';
      if (e.type === 'peace' && !txt) continue;
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
        if (S.year >= S.written) return;            // wait until history has been written this far
        setYear(S.year + 1, true);
      }, 900 / S.speed);
    }
  }

  // ---------- a second timeline beside the first ----------
  const CMP = { seed: null, sim: null, written: 0, map: null, run: 0, own: {} };

  function compareWith(seed) {
    const id = ++CMP.run;
    CMP.seed = seed; CMP.sim = null; CMP.own = {}; CMP.written = W.start.year;
    $('app').classList.add('compare');
    $('map2').hidden = false;
    map.resize();
    if (!CMP.map) {
      CMP.map = new MapView($('map2'), W, window.SHAPES, assets);
      CMP.map.labelText = tag => CMP.sim ? CMP.sim.stateInfo[tag].name : W.states[tag].name;
      CMP.map.setOwners(Object.fromEntries(W.provinces.map(p => [p.id, p.owner])), W.states);
      // the two maps move together
      const link = (a, b) => {
        const draw = a.draw.bind(a);
        a.draw = () => {
          draw();
          if (!CMP.seed || $('map2').hidden) return;
          // same centre and scale (the maps may differ in size, e.g. one above the other on a phone)
          const v = a.view, w = b.view;
          const x = v.x + a.cw / 2 / v.s - b.cw / 2 / v.s, y = v.y + a.ch / 2 / v.s - b.ch / 2 / v.s;
          if (Math.abs(x - w.x) > 1e-3 || Math.abs(y - w.y) > 1e-3 || v.s !== w.s) { b.view = { x, y, s: v.s }; b._viewSet = true; b.requestDraw(); }
        };
      };
      link(map, CMP.map); link(CMP.map, map);
      CMP.map.on('hover', (pid, e) => tipB(pid, e));
      CMP.map.on('hovermove', (pid, e) => tipB(pid, e));
    } else CMP.map.resize();
    CMP.map.setStyle(map.style);
    CMP.map.view = Object.assign({}, map.view); CMP.map._viewSet = true;
    map.draw();
    const end = W.start.year + S.years;
    let sim = null;
    const chunk = () => {
      if (id !== CMP.run) return;
      if (!sim) { sim = new Sim(W, { seed }); CMP.sim = sim; }
      const t1 = performance.now();
      while (sim.year() < end && performance.now() - t1 < 40) sim.step();
      CMP.written = sim.year();
      if (CMP.written % 5 === 0 || CMP.written >= end) feedB();
      if (sim.year() < end) setTimeout(chunk, 15);
    };
    setTimeout(chunk, 30);
    labelSides();
    writeHash();
  }

  function stopCompare() {
    CMP.run++; CMP.seed = null; CMP.sim = null; CMP.own = {};
    $('app').classList.remove('compare');
    $('map2').hidden = true; $('cmp-a').hidden = true; $('cmp-b').hidden = true;
    map.resize();
    writeHash();
  }

  function labelSides() {
    if (!CMP.seed) return;
    const big = (sim, y, own) => {
      if (!sim) return '';
      const pop = sim.popAt(y), tot = {};
      for (const p of W.provinces) { const o = own[p.id]; if (o) tot[o] = (tot[o] || 0) + pop[p.id]; }
      const top = Object.entries(tot).sort((a, b) => b[1] - a[1])[0];
      return top ? `greatest realm: ${esc(sim.stateInfo[top[0]].name)}` : '';
    };
    $('cmp-a').hidden = false; $('cmp-b').hidden = false;
    $('cmp-a').innerHTML = `Timeline #${esc(S.seed)}<small>${S.sim ? big(S.sim, S.year, ownerOf) : ''}</small>`;
    const yb = Math.min(S.year, CMP.written);
    $('cmp-b').innerHTML = `Timeline #${esc(CMP.seed)}<small>${CMP.sim && yb < S.year ? `still writing… (${CMP.written})` : big(CMP.sim, yb, CMP.own[yb] || {})}</small>`;
  }

  // the second map shows the same year (or as far as its history has been written)
  function feedB() {
    if (!CMP.seed || !CMP.sim || !CMP.map) return;
    const sim = CMP.sim, m = CMP.map;
    const y = Math.max(W.start.year, Math.min(S.year, CMP.written));
    const own = CMP.own[y] || (y < CMP.written ? (CMP.own[y] = sim.ownersAt(y)) : sim.ownersAt(y));
    // layers that need the panels of the first timeline are shown as realms
    const mode = ['realms', 'cultures', 'faiths'].includes(map.mode || 'realms') ? (map.mode || 'realms') : 'realms';
    if (m.mode !== mode) m.setMode(mode);
    if (m.style !== map.style) m.setStyle(map.style);
    m.setOwnersSoft(own, sim.stateInfo);
    m.setOccupation(sim.occupationAt(y));
    const ch = sim.cultureAt(y);
    m.setPeoples(ch ? { cult: ch.cult, rel: ch.rel, cultKeys: sim.cultKeys, relKeys: sim.relKeys } : null);
    m.subLabel = tag => { const r = sim.rulerAt(tag, tMid(y)); return r ? sim.nameAt(r, tMid(y), tag) : ''; };
    const unionOf = {};
    const pop = sim.popAt(y), size = {};
    for (const p of W.provinces) if (own[p.id]) size[own[p.id]] = (size[own[p.id]] || 0) + pop[p.id];
    for (const u of sim.unions) {
      if (u.from > tMid(y) || (u.to != null && u.to <= tMid(y))) continue;
      const senior = u.tags.slice().sort((a, b) => (size[b] || 0) - (size[a] || 0))[0];
      for (const t of u.tags) if (t !== senior) unionOf[t] = senior;
    }
    const dipl = sim.diplomacyAt(y);
    if (dipl) for (const [v, o] of Object.entries(dipl.overlord)) if (!unionOf[v]) unionOf[v] = o;
    m.setUnions(unionOf);
    m.flush();
    m.draw();
    labelSides();
  }

  function tipB(pid, e) {
    const tip = $('tooltip');
    if (!pid || !e || !CMP.sim) { tip.hidden = true; return; }
    const y = Math.min(S.year, CMP.written);
    const own = CMP.own[y] || CMP.sim.ownersAt(y);
    const p = provById[pid];
    const owner = own[pid] ? CMP.sim.stateInfo[own[pid]].name : 'Unclaimed';
    tip.innerHTML = `<b>${esc(p.name)}</b> · ${esc(owner)}<br><span class="muted">in timeline #${esc(CMP.seed)} · ${fmtPop(CMP.sim.popAt(y)[pid])}</span>`;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 270) + 'px';
    tip.style.top = (e.clientY + 16) + 'px';
  }

  function init() {
    const canvas = $('map');
    map = new MapView(canvas, W, window.SHAPES, assets);
    map.labelText = tag => SI()[tag].name;
    map.setOwners(ownerOf, SI());
    assets.atlas.small.onload = () => map.draw();
    assets.political.small.onload = () => map.draw();
    loadLarge('atlas');
    map.on('click', pid => {
      const tag = pid && ownerOf[pid];
      if (tag) selectState(tag); else { S.selected = null; map.selected = null; $('panel').hidden = true; refresh(); }
    });
    const tip = $('tooltip');
    const showTip = (pid, e) => {
      if (!pid || !e) { tip.hidden = true; return; }
      const p = provById[pid];
      const owner = ownerOf[pid] ? SI()[ownerOf[pid]].name : 'Unclaimed';
      const pop = S.sim ? S.sim.popAt(S.year)[pid] : p.pop;
      const ch = S.sim && S.sim.cultureAt(S.year);
      const cul = ch ? S.sim.cultKeys[ch.cult[pid]] : p.culture, rel = ch ? S.sim.relKeys[ch.rel[pid]] : p.religion;
      tip.innerHTML = `<b>${esc(p.name)}</b> · ${esc(owner)}<br><span class="muted">${nice(p.terrain)} · ${nice(p.good)} · ${fmtPop(pop)}<br>${nice(cul)} · ${nice(rel)}</span>`;
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
      map.setStyle(st); feedB();
      loadLarge(st);
      $('style-atlas').classList.toggle('on', st === 'atlas');
      $('style-political').classList.toggle('on', st === 'political');
      $('style-atlas').setAttribute('aria-pressed', st === 'atlas');
      $('style-political').setAttribute('aria-pressed', st === 'political');
    };
    const setMode = m => {
      map.setMode(m);
      for (const k of ['realms', 'cultures', 'faiths', 'diplomacy', 'economy', 'progress']) {
        $('mode-' + k).classList.toggle('on', k === m);
        $('mode-' + k).setAttribute('aria-pressed', k === m);
      }
    };
    for (const k of ['realms', 'cultures', 'faiths', 'diplomacy', 'economy', 'progress']) $('mode-' + k).addEventListener('click', () => { setMode(k); refresh(); });
    $('style-atlas').addEventListener('click', () => setStyle('atlas'));
    $('style-political').addEventListener('click', () => setStyle('political'));
    $('panel-close').addEventListener('click', () => { $('panel').hidden = true; S.selected = null; map.selected = null; refresh(); });
    $('chron-btn').addEventListener('click', () => { $('chronicle').hidden = !$('chronicle').hidden; S.scrollChron = true; renderChronicle(); });
    $('chron-close').addEventListener('click', () => { $('chronicle').hidden = true; });
    $('house-close').addEventListener('click', () => { $('house').hidden = true; });
    $('war-close').addEventListener('click', () => { $('war').hidden = true; });
    $('war').addEventListener('click', e => { if (e.target.id === 'war') $('war').hidden = true; });
    $('house').addEventListener('click', e => { if (e.target.id === 'house') $('house').hidden = true; });
    $('major-only').addEventListener('change', renderChronicle);
    const chronMode = m => {
      S.chronMode = m; S.scrollChron = true;
      $('chron-decades').classList.toggle('on', m !== 'events'); $('chron-decades').setAttribute('aria-pressed', m !== 'events');
      $('chron-events').classList.toggle('on', m === 'events'); $('chron-events').setAttribute('aria-pressed', m === 'events');
      $('major-wrap').hidden = m !== 'events';
      renderChronicle();
    };
    $('chron-decades').addEventListener('click', () => chronMode('decades'));
    $('chron-events').addEventListener('click', () => chronMode('events'));
    $('altered').addEventListener('click', openFateList);
    $('fate-close').addEventListener('click', () => { $('fate-dialog').hidden = true; });
    $('fate-clear').addEventListener('click', () => { S.interventions = []; $('fate-dialog').hidden = true; rewrite(); });
    $('article-close').addEventListener('click', () => { $('article').hidden = true; });
    $('article').addEventListener('click', e => { if (e.target.id === 'article') $('article').hidden = true; });
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
      runTimeline();
    });
    $('zoom-in').addEventListener('click', () => map.zoomBy(1.6));
    $('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.6));
    $('zoom-world').addEventListener('click', () => { map.fitTo(-180, 76, 180, -56); map.draw(); });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === '+' || e.key === '=') map.zoomBy(1.6);
      if (e.key === '-' || e.key === '_') map.zoomBy(1 / 1.6);
      if (e.key === 'ArrowRight') setYear(S.year + 1, true);
      if (e.key === 'ArrowLeft') setYear(S.year - 1);
      if (e.key === ' ') { e.preventDefault(); play(!S.playing); }
    });
    // comparing two timelines
    $('cmp-btn').addEventListener('click', () => {
      $('cmp-input').value = CMP.seed || String(Math.floor(Math.random() * 1e6));
      $('cmp-stop').hidden = !CMP.seed;
      $('cmp-dialog').hidden = false; $('cmp-input').focus();
    });
    $('cmp-random').addEventListener('click', () => { $('cmp-input').value = String(Math.floor(Math.random() * 1e6)); });
    $('cmp-cancel').addEventListener('click', () => { $('cmp-dialog').hidden = true; });
    $('cmp-stop').addEventListener('click', () => { $('cmp-dialog').hidden = true; stopCompare(); });
    $('cmp-form').addEventListener('submit', e => {
      e.preventDefault();
      $('cmp-dialog').hidden = true;
      compareWith(($('cmp-input').value.trim() || '1').replace(/[^\w.-]/g, ''));
    });
    // saving files only works when the page runs on your own computer
    if (/claude\.ai|claudeusercontent/.test(location.hostname)) $('save-btn').hidden = true;
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
    window.atlasApp = { compare: seed => compareWith(seed), setYear: y => setYear(y), setStyle, map, sim: () => S.sim, ready: () => !!S.sim, written: () => S.written, fit: (a, b, c, d) => { map.fitTo(a, b, c, d); map.draw(); } };
    runTimeline(() => { if (S.compareSeed && !CMP.seed) compareWith(S.compareSeed); });
  }

  // let the fonts arrive before the first labelled frame (with a short timeout)
  const ready = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  ready.then(init);
})();
