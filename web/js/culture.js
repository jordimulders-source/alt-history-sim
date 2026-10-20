// Milestone 6: culture and religion. Conversion and assimilation under foreign rule, unrest,
// peasant risings, and separatist revolts that create new realms or bring old ones back.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  P._initCulture = function () {
    const W = this.world;
    // per-timeline copy of the realms' descriptions (new realms are added to it)
    this.stateInfo = {};
    for (const [t, s] of Object.entries(W.states)) this.stateInfo[t] = Object.assign({}, s);
    this.cultKeys = Object.keys(W.cultures);
    this.relKeys = Object.keys(W.religions);
    const ci = {}, ri = {};
    this.cultKeys.forEach((k, i) => { ci[k] = i; });
    this.relKeys.forEach((k, i) => { ri[k] = i; });
    this.cultIndex = ci; this.relIndex = ri;
    const n = this.pop.length;
    this.cult = new Int16Array(n); this.rel = new Int16Array(n);
    for (const p of W.provinces) { this.cult[p.id] = ci[p.culture] ?? 0; this.rel[p.id] = ri[p.religion] ?? 0; }
    this.unrest = new Float32Array(n);
    this.conqueredAt = {};
    this.revolts = [];
    this.cultHist = [];
    this.nextTag = 1;
  };

  const group = (dict, k) => (dict[k] || {}).group || k;

  P.cultureOf = function (pid) { return this.cultKeys[this.cult[pid]]; };
  P.religionOf = function (pid) { return this.relKeys[this.rel[pid]]; };

  // ---------------- the yearly round ----------------
  P._yearlyCulture = function () {
    const W = this.world, cfg = this.cfg, y = this.year();
    for (const e of this.ownerLog) if (e.t > this.t - 12) this.conqueredAt[e.pid] = e.t;
    const sick = new Set(this._plagueYears && this._plagueYears[y] || []);
    for (const p of W.provinces) {
      const o = this.owner[p.id];
      if (!o || !this.states[o].ruler) { this.unrest[p.id] = 0; continue; }
      const st = this.states[o];
      const r = this.chars.get(st.ruler);
      const capital = this._capitalProv(o);
      const near = capital ? this._dist(p.lonlat, capital.lonlat) < 450 : false;
      const myCult = this.cultureOf(p.id), myRel = this.religionOf(p.id);
      // conversion to the faith of the crown
      if (myRel !== st.religion && this.relIndex[st.religion] != null) {
        const sameGroup = group(W.religions, myRel) === group(W.religions, st.religion);
        const pagan = ['animist', 'shamanist', 'tengri', 'totemist'].includes(myRel);
        let c = (sameGroup ? 0.01 : 0.0025) * (pagan ? 3 : 1) * (cfg.conversion ?? 1);
        if (r && (r.traits.includes('zealous') || r.traits.includes('pious'))) c *= 2;
        if (r && r.traits.includes('cynical')) c *= 0.5;
        if (near) c *= 1.4;
        if (myCult === st.culture) c *= 1.5;
        // a secular age converts few, and those who believe in nothing rarely go back
        if (this.secularOf) c *= 1 - 0.9 * this.secularOf(o);
        if (myRel === 'irreligious') c *= 0.15;
        if (this.rng.chance(c)) this.rel[p.id] = this.relIndex[st.religion];
      }
      // assimilation into the culture of the crown
      if (myCult !== st.culture && this.cultIndex[st.culture] != null) {
        const sameGroup = group(W.cultures, myCult) === group(W.cultures, st.culture);
        let a = (sameGroup ? 0.006 : 0.0012) * (near ? 1.6 : 1) * (cfg.assimilation ?? 1);
        if (this.conqueredAt[p.id] && this.t - this.conqueredAt[p.id] < 12 * 30) a *= 0.3;
        if (this.rng.chance(a)) this.cult[p.id] = this.cultIndex[st.culture];
      }
      // unrest
      let u = 0;
      const relNow = this.religionOf(p.id), cultNow = this.cultureOf(p.id);
      const sec = this.secularOf ? this.secularOf(o) : 0;
      if (relNow !== st.religion) u += (group(W.religions, relNow) === group(W.religions, st.religion) ? 9 : 20) * (1 - 0.8 * sec) * (relNow === 'irreligious' ? 0.3 : 1);
      // the far ends of a giant realm are hard to govern
      const nProv = (this.provsOf[o] || []).length;
      if (nProv > 60 && capital && !near) u += Math.min(10, (nProv - 60) / 12) * (this._dist(p.lonlat, capital.lonlat) > 1500 ? 1 : 0.4);
      // after the age of revolutions, peoples want nations of their own
      const nation = this.devs && this.devs.revolution ? 1 + 0.7 * (this.cfg.nationalism ?? 1) : 1;
      if (cultNow !== st.culture) u += (group(W.cultures, cultNow) === group(W.cultures, st.culture) ? 4 : 13) * nation;
      if (this.conqueredAt[p.id]) u += 16 * Math.max(0, 1 - (this.t - this.conqueredAt[p.id]) / (12 * 25));
      if (this._inWarCache && this._inWarCache.has(o)) u += 6;
      if (this.bankrupt && this.bankrupt[o] > this.t) u += 8;
      if (sick.has(p.id)) u += 6;
      if (r) u -= (r.adm - 3) * 3 + (this.age(r) < 16 ? -6 : 0);
      if (capital && capital.id === p.id) u -= 10;
      u *= cfg.unrest ?? 1;
      this.unrest[p.id] = Math.max(0, Math.min(100, u));
    }
    this._revolts();
    this.cultHist.push({ year: y, cult: this.cult.slice(), rel: this.rel.slice() });
  };

  // ---------------- revolts ----------------
  P._revolts = function () {
    const W = this.world;
    // high unrest, grouped per realm and per people (culture, else faith)
    const groups = new Map();
    for (const p of W.provinces) {
      const u = this.unrest[p.id];
      if (u < 22) continue;
      const o = this.owner[p.id];
      if (!o) continue;
      const k = o + '|' + this.cultureOf(p.id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p.id);
    }
    for (const [k, pids] of groups) {
      const [owner, cult] = k.split('|');
      const st = this.states[owner];
      const mean = pids.reduce((s, x) => s + this.unrest[x], 0) / pids.length;
      const pop = pids.reduce((s, x) => s + this.pop[x], 0);
      const foreign = cult !== st.culture;
      // a whole people rises and wants a realm of its own
      if (foreign && pids.length >= 2 && pop > 1.5e5 && !pids.includes(this.capitalOf[owner]) &&
          this.rng.chance(0.03 * (mean - 20) / 20 * (this.cfg.revolts ?? 1))) {
        const block = this._connected(pids);
        if (block.length >= 2 || this.pop[block[0]] > 3e5) { this._separatists(owner, cult, block); continue; }
      }
      // otherwise peasants rise here and there
      if (this.rng.chance(0.05 * (mean - 20) / 20 * (this.cfg.revolts ?? 1))) {
        const pid = this.rng.pick(pids);
        const crushed = this.rng.chance(0.75);
        this.pop[pid] *= crushed ? 0.97 : 0.99;
        this.unrest[pid] *= 0.5;
        this.revolts.push({ t: this.t, pid, owner, kind: 'peasants', crushed });
        if ((this._statePop[owner] || 0) > 1.2e6) {
          const why = this.religionOf(pid) !== st.religion ? `the ${niceName(this.religionOf(pid))} faithful` : foreign ? `the ${niceName(cult)} peasants` : 'the peasants';
          this.log('revolt', `Unrest in ${this.prov[pid].name}: ${why} rise against ${st.name}${crushed ? ' and are put down' : ' and wring concessions from the crown'}.`,
            { states: [owner], pid, major: false });
        }
      }
    }
  };

  function niceName(k) { return String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  // the largest connected group of provinces (by land)
  P._connected = function (pids) {
    const set = new Set(pids), seen = new Set();
    let best = [];
    for (const s of pids) {
      if (seen.has(s)) continue;
      const comp = [], stack = [s];
      seen.add(s);
      while (stack.length) {
        const x = stack.pop();
        comp.push(x);
        for (const q of this.pAdj[x]) if (set.has(q) && !seen.has(q)) { seen.add(q); stack.push(q); }
      }
      if (comp.length > best.length) best = comp;
    }
    return best;
  };

  P._separatists = function (owner, cult, pids) {
    const W = this.world;
    // an old realm of this people may rise again
    let tag = null;
    for (const [t, s] of Object.entries(this.states)) {
      if (!s.destroyed || s.culture !== cult) continue;
      const cap = this.stateInfo[t].capital;
      if (pids.includes(cap) || this.rng.chance(0.3)) { tag = t; break; }
    }
    const capital = pids.slice().sort((a, b) => this.pop[b] - this.pop[a])[0];
    const relCount = {};
    for (const pid of pids) relCount[this.religionOf(pid)] = (relCount[this.religionOf(pid)] || 0) + this.pop[pid];
    const religion = Object.entries(relCount).sort((a, b) => b[1] - a[1])[0][0];
    const reborn = !!tag;
    if (!tag) tag = this._newState(this._realmName(pids, cult), cult, religion, capital);
    const st = this.states[tag];
    st.destroyed = null;
    st.rebel = true;
    st.culture = cult; st.religion = religion;
    this.stateInfo[tag].capital = capital;
    this.capitalOf[tag] = capital;
    // a living claimant of the old crown leads the rising, otherwise a local lord
    let ruler = null;
    for (const cl of this.claims) if (cl.tag === tag && cl.to == null && this.alive(this.chars.get(cl.char))) { ruler = this.chars.get(cl.char); break; }
    if (!ruler || ruler.titles.length) ruler = this._generateRuler(tag, { age: this.rng.int(22, 50) });
    ruler.culture = cult; ruler.religion = religion;
    if (!ruler.name) ruler.name = this._pickName(ruler, cult);
    this._setRuler(tag, ruler, { how: reborn ? 'raised by the rebels' : 'leader of the revolt' });
    for (const pid of pids) this._transfer(pid, tag, null);
    this.army[tag] = this.maxArmy(tag) * 1.6;            // the whole land takes up arms
    this.treasury[tag] = 0; this.funding[tag] = 1;
    const ownerName = this.states[owner].name;
    this.revolts.push({ t: this.t, pid: capital, owner, kind: 'separatists', tag });
    this.log('revolt', reborn
      ? `${st.name} rises again: the ${niceName(cult)} lands throw off the rule of ${ownerName} and hail ${this.nameIn(ruler, tag)} as their ruler.`
      : `The ${niceName(cult)} lands around ${this.prov[capital].name} revolt against ${ownerName} and proclaim ${this.nameIn(ruler, tag)} their ruler.`,
      { states: [tag, owner], chars: [ruler.id], major: true, pid: capital });
    if (this._startWar) this._startWar(tag, owner, { type: 'independence' }, `${this.adjective(tag)} Revolt against ${ownerName}`, { allies: false, quiet: true });
  };

  // a name for a new realm: its largest place with a real name, else its people
  P._realmName = function (pids, cult) {
    // its largest real town (not "Uncharted Land", not a mountain range or a plain)
    const geo = /(Uncharted|ern |Peninsula|Plain|Highlands|Lowlands|Mountains|Desert|Range|Plateau|Steppe|Basin|basin|Islands|Shield|Sierra|Cordillera|Valley|Coast|National Park|Upland)/;
    const named = pids.filter(pid => !geo.test(this.prov[pid].name)).sort((a, b) => this.pop[b] - this.pop[a]);
    const taken = n => Object.values(this.states).some(x => x.name === n && !x.destroyed);
    for (const pid of named.slice(0, 4)) { const n = this.prov[pid].name.replace(/ [IVX]+$/, ''); if (!taken(n)) return n; }
    // otherwise after its people: the Bashkir Khanate, the Komi Principality
    const c = this.world.cultures[cult] || {};
    const people = c.name || niceName(cult);
    const g = c.group || '';
    const title = /turkic|mongolic|tungusic|siberian|kipchak/.test(g) ? 'Khanate' : /arabic|iranian|berber/.test(g) ? 'Emirate'
      : /slavic|baltic|finnic|uralic|germanic|german/.test(g) ? 'Principality' : /indo_aryan|dravidian/.test(g) ? 'Sultanate' : 'Confederacy';
    const n = `${people} ${title}`;
    return taken(n) ? `Free ${people} ${title}` : n;
  };

  // a new realm born in this timeline
  P._newState = function (name, cult, religion, capital) {
    // two living realms never share a name
    const alive = n => Object.values(this.states).some(x => x.name === n && !x.destroyed && this._statePop[x.tag]);
    if (alive(name)) name = [`Free ${name}`, `${name} League`, `New ${name}`, `${name} March`].find(n => !alive(n)) || name + ' II';
    let tag;
    do { tag = 'N' + String(this.nextTag++).padStart(2, '0'); } while (this.states[tag]);
    const hue = this.rng.next();
    const col = hsl(hue, 0.42, 0.58);
    this.stateInfo[tag] = { name, color: col, government: 'monarchy', succession: 'primogeniture', capital, culture: cult, religion, overlord: null, born: this.t };
    this.states[tag] = {
      tag, name, government: 'monarchy', succession: 'primogeniture', culture: cult, religion, ruler: null, regent: null,
      history: [], regnalCounts: {}, fallback: [], hasCounts: false, dynasty: null, born: this.t,
    };
    if (this.army) this.army[tag] = 0;
    if (this.treasury) { this.treasury[tag] = 0; this.funding[tag] = 1; }
    return tag;
  };

  function hsl(h, s, l) {
    const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  // ---------------- questions the page asks ----------------
  P.cultureAt = function (year) {
    let best = null;
    for (const h of this.cultHist) if (h.year <= year) best = h;
    return best;
  };
  P.revoltsIn = function (year) { return this.revolts.filter(r => Math.floor(r.t / 12) === year); };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyCulture();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initCulture();
  };
})(typeof window !== 'undefined' ? window : globalThis);
