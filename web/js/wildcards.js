// Turning points: rare events that send the world down another road. A great pestilence, a volcanic
// winter, a conqueror out of nowhere, a great realm falling apart into warlord states, a golden age,
// and after the splitting of the atom: crises between nuclear powers that usually end well. Usually.
// Each is unlikely in a given year, so every timeline gets a few of them, and never the same ones.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const nice = k => String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  P._initWild = function () {
    this.wild = { lastCollapse: {} };
  };

  P._yearlyWild = function () {
    const y = this.year(), cat = this.cfg.catastrophes ?? 1;
    if (y < 1450) return;
    // 1. a great pestilence: plague in many ports at once, and deadlier than usual
    if (this.rng.chance((y < 1900 ? 0.0035 : 0.0015) * cat)) this._pandemic();
    // 2. a volcano darkens the sky: a year without summer
    if (this.rng.chance(0.005 * cat)) this._volcanicWinter();
    // 3. a conqueror rises
    if (y < 1920 && this.rng.chance(0.004 * cat)) this._riseConqueror();
    // 3b. a town nobody has heard of sets out to rule the world
    if (y < 1900 && this.rng.chance(0.0025 * cat)) this._risingCity(null);
    // 4. great realms fall apart
    for (const t of Object.keys(this.states)) {
      const n = (this.provsOf[t] || []).length;
      if (n < 50 || this.year() - (this.wild.lastCollapse[t] || 0) < 80) continue;
      const st = this.states[t], r = this.chars.get(st.ruler);
      let weak = 1;
      if (r && r.adm <= 2) weak += 1;
      if (r && this.age(r) < 16) weak += 1;
      if (this.bankrupt && this.bankrupt[t] > this.t) weak += 1.5;
      if (this._inWar(t)) weak += 0.5;
      if (r && r.conqueror) weak *= 0.2;
      if (this.rng.chance(0.00035 * Math.pow(Math.min(5, n / 50), 1.3) * weak * cat)) this._collapse(t, null);
    }
    // 5. a golden age of learning
    if (this.rng.chance(0.004 * cat)) {
      const c = Object.keys(this.states).filter(t => (this._statePop[t] || 0) > 1e6);
      const t = c.length && this.rng.weighted(c, x => Math.sqrt(this._statePop[x]));
      if (t) this._goldenAge(t);
    }
    for (const [t, st] of Object.entries(this.states)) if (st.golden && st.golden > y && this._statePop[t]) {
      const T = this.techOf(t); T.adm += 0.07; T.mil += 0.03;
    }
    // 6. the atom
    if (this._invent && this.devs.industry && this.devs.medicine) {
      this._invent('atom', 1945, 9, t => this.share('industry', t) > 0.7 && this.share('medicine', t) > 0.3, 'mil',
        (pid, t) => `Over the desert near ${this.prov[pid].name} a light brighter than the sun: ${this.states[t].name} has split the atom.`);
      this._diffuse('atom', 0.015);
      this._nuclearAge();
    }
  };

  // ---------------- the pestilence ----------------
  P._pandemic = function (fromTag) {
    const pl = this.plague, y = this.year();
    if (!pl) return false;
    const cs = Object.values(this.centres).sort((a, b) => b.value - a.value).slice(0, 14);
    const seeds = fromTag ? [this.capitalOf[fromTag]] : [];
    while (seeds.length < 6 && cs.length) seeds.push(cs.splice(this.rng.int(0, cs.length - 1), 1)[0].prov);
    const ob = { id: pl.outbreaks.length + 1, start: y, origin: seeds[0], dead: 0, provs: 0, reached: new Set(), end: null, sev: 2.2, great: true };
    pl.outbreaks.push(ob);
    for (const pid of seeds) if (pid != null) { pl.immune.delete(pid); pl.active.set(pid, { left: 3, ob: ob.id }); pl.gen.set(pid, 0); }
    const name = this.rng.pick(['The Great Pestilence', 'The Grey Death', 'The Sweating Sickness', 'The Black Fever', 'The Great Mortality']);
    ob.name = name;
    this.log('catastrophe', `${name}: a new sickness breaks out in ${this.prov[seeds[0]].name} and the great ports at once. Nothing the physicians know can stop it.`,
      { states: seeds.map(p => this.owner[p]).filter(Boolean), major: true, pid: seeds[0] });
    return true;
  };

  // ---------------- the volcanic winter ----------------
  const VOLCANOES = [['Tambora', 118, -8], ['Hekla', -19.7, 64], ['Vesuvius', 14.4, 40.8], ['Krakatoa', 105.4, -6.1], ['Laki', -18.2, 64.1],
    ['Popocatépetl', -98.6, 19], ['Huaynaputina', -70.9, -16.6], ['Etna', 15, 37.7], ['Fuji', 138.7, 35.4], ['Pinatubo', 120.4, 15.1], ['Mount St. Helens', -122.2, 46.2]];
  P._volcanicWinter = function (name) {
    const v = name ? VOLCANOES.find(x => x[0] === name) || VOLCANOES[0] : this.rng.pick(VOLCANOES);
    // the modern world has railways, ships and food aid: a dark year kills far fewer
    const strength = (0.02 + this.rng.next() * 0.05) * (this.year() > 1850 ? 0.2 : 1);
    let dead = 0;
    const north = v[2] > -10;
    for (const p of this.world.provinces) {
      const lat = p.lonlat[1];
      const band = north ? lat > 25 && lat < 65 : lat < 10;
      if (!band || !this.owner[p.id]) continue;
      const m = strength * (0.5 + this.rng.next());
      dead += this.pop[p.id] * m;
      this.pop[p.id] *= 1 - m;
      if (this.unrest) this.unrest[p.id] = Math.min(100, this.unrest[p.id] + 12);
    }
    this.log('catastrophe', `${v[0]} explodes. Ash darkens the sky for a year; frost in summer, the harvests fail ${north ? 'across the north' : 'across the south'} and some ${Math.round(dead / 1e5) / 10} million starve. People will call it the Year without Summer.`,
      { states: [], major: true });
    return true;
  };

  // ---------------- the conqueror ----------------
  P._riseConqueror = function (tag) {
    let t = tag;
    if (!t) {
      const c = Object.keys(this.states).filter(x => (this._statePop[x] || 0) > 8e5 && this.states[x].ruler && !this.states[x].modernRepublic &&
        this.age(this.chars.get(this.states[x].ruler)) < 42);
      t = c.length && this.rng.weighted(c, x => (this.chars.get(this.states[x].ruler).mil + 1) ** 2 * Math.pow(this._statePop[x] / 1e6, 0.4));
    }
    if (!t) return false;
    const r = this.chars.get(this.states[t].ruler);
    if (!r || !this.alive(r)) return false;
    r.conqueror = true;
    r.mil = Math.max(r.mil, 7);
    for (const tr of ['martial', 'ambitious']) if (!r.traits.includes(tr)) r.traits.push(tr);
    r.traits = r.traits.filter(x => x !== 'content' && x !== 'craven');
    if (this.army) this.army[t] = Math.max(this.army[t] || 0, this.maxArmy(t));
    if (!tag) this.log('conqueror', `${this.nameIn(r, this.states[t].name ? t : t)} of ${this.states[t].name} dreams of an empire without end. The neighbours do not yet know the name, but they will.`,
      { states: [t], chars: [r.id], major: true });
    return true;
  };

  // ---------------- a town becomes an empire ----------------
  P._risingCity = function (pid, ownerTag) {
    if (pid == null) {
      const c = this.world.provinces.filter(p => {
        const o = this.owner[p.id];
        if (!o || (ownerTag && o !== ownerTag) || this.capitalOf[o] === p.id || this.pop[p.id] < 2e4) return false;
        if (/(ern |Peninsula|Plain|Highlands|Lowlands|Mountains|Desert|Range|Plateau|Steppe|Basin|Islands|Shield)/.test(this.prov[p.id].name)) return false;
        return ownerTag || (this.provsOf[o] || []).length >= 4;
      });
      if (!c.length) return false;
      pid = this.rng.weighted(c, p => Math.sqrt(this.pop[p.id]) * (5 + (this.unrest ? this.unrest[p.id] : 0))).id;
    }
    const owner = this.owner[pid];
    if (!owner || this.capitalOf[owner] === pid) return false;
    const town = this.prov[pid].name.replace(/ [IVX]+$/, '');
    const cult = this.cultureOf(pid), rel = this.religionOf(pid);
    const tag = this._newState(town, cult, rel, pid);
    const st = this.states[tag];
    st.born = this.t;
    const f = this._generateRuler(tag, { age: this.rng.int(24, 34) });
    f.conqueror = true; f.mil = 8; f.adm = Math.max(f.adm, 5); f.dip = Math.max(f.dip, 5);
    f.traits = ['ambitious', 'charismatic', 'martial'];
    this._setRuler(tag, f, { how: 'the founder' });
    this._transfer(pid, tag, null);
    this.capitalOf[tag] = pid;
    this.army[tag] = Math.max(this.maxArmy(tag) * 3, (this.army[owner] || 0) * 0.6);
    this.treasury[tag] = 100; this.funding[tag] = 1;
    this.log('rise', `In ${town}, a town of ${this.states[owner].name} that nobody far away has heard of, ${this.fullName(f)} gathers followers and swears that ${town} will rule the world. Few take it seriously.`,
      { states: [tag, owner], chars: [f.id], major: true, pid });
    const goal = (this._conquestGoal && this._conquestGoal(tag, owner)) || { type: 'humiliate' };
    this._startWar(tag, owner, goal, `Rise of ${town}`, { allies: false });
    return tag;
  };

  // ---------------- a great realm falls apart ----------------
  P._collapse = function (tag, why) {
    const st = this.states[tag];
    const provs = (this.provsOf[tag] || []).slice();
    if (provs.length < 6) return false;
    this.wild.lastCollapse[tag] = this.year();
    const cap = this.capitalOf[tag];
    const k = provs.length >= 90 ? 4 : provs.length >= 50 ? 3 : 2;
    // centres: the capital and the provinces farthest away from what was chosen so far
    const ll = pid => this.prov[pid].lonlat;
    const cents = [ll(cap)];
    while (cents.length < k) {
      let best = null, bd = -1;
      for (const pid of provs) {
        const d = Math.min(...cents.map(c => this._dist(ll(pid), c)));
        if (d > bd) { bd = d; best = pid; }
      }
      cents.push(ll(best));
    }
    let part = new Map();
    for (let it = 0; it < 6; it++) {
      part = new Map();
      for (const pid of provs) {
        let bi = 0, bd = Infinity;
        cents.forEach((c, i) => { const d = this._dist(ll(pid), c); if (d < bd) { bd = d; bi = i; } });
        part.set(pid, bi);
      }
      for (let i = 1; i < k; i++) {
        const mem = provs.filter(p => part.get(p) === i);
        if (mem.length) cents[i] = [mem.reduce((s, p) => s + ll(p)[0], 0) / mem.length, mem.reduce((s, p) => s + ll(p)[1], 0) / mem.length];
      }
    }
    const pieces = [];
    for (let i = 1; i < k; i++) {
      const mem = this._connected(provs.filter(p => part.get(p) === i && p !== cap));
      if (mem.length >= 3) pieces.push(mem);
    }
    if (!pieces.length) return false;
    const born = [];
    for (const mem of pieces) {
      const cc = {}, rc = {};
      for (const pid of mem) { cc[this.cultureOf(pid)] = (cc[this.cultureOf(pid)] || 0) + this.pop[pid]; rc[this.religionOf(pid)] = (rc[this.religionOf(pid)] || 0) + this.pop[pid]; }
      const cult = Object.entries(cc).sort((a, b) => b[1] - a[1])[0][0], rel = Object.entries(rc).sort((a, b) => b[1] - a[1])[0][0];
      const capital = mem.slice().sort((a, b) => this.pop[b] - this.pop[a])[0];
      const t = this._newState(this._realmName(mem, cult), cult, rel, capital);
      const ns = this.states[t];
      ns.born = this.t;
      ns.government = st.government === 'theocracy' ? 'monarchy' : st.government;
      ns.succession = st.government === 'republic' ? 'republic' : 'primogeniture';
      this.stateInfo[t].government = ns.government; this.stateInfo[t].succession = ns.succession;
      if (st.modernRepublic) { ns.modernRepublic = true; ns.republicSince = this.t; }
      for (const pid of mem) { this._transfer(pid, t, null); this.pop[pid] *= 0.95; }
      this.capitalOf[t] = capital;
      if (ns.modernRepublic && this._newPresident) this._newPresident(t);
      else this._setRuler(t, this._generateRuler(t, { age: this.rng.int(28, 55) }), { how: 'a warlord who seized the province' });
      this.army[t] = this.maxArmy(t) * 1.2;
      this.treasury[t] = 0; this.funding[t] = 1;
      born.push(t);
    }
    this.log('collapse', `${why || `${st.name} can no longer hold together.`} Generals and governors make themselves masters of their provinces: ${born.map(t => this.states[t].name).join(', ')} go their own way. An age of warlords begins.`,
      { states: [tag, ...born], major: true, pid: cap });
    // the old centre will try to win its lands back
    const biggest = born.slice().sort((a, b) => (this._statePop[b] || 0) - (this._statePop[a] || 0))[0];
    if (biggest && this._startWar && !this.states[tag].destroyed && this.rng.chance(0.6)) {
      this._startWar(tag, biggest, { type: 'conquest', provs: (this.provsOf[biggest] || []).slice(0, 6), unify: true }, `War of ${this.adjective(tag)} Reunification`, { allies: false });
    }
    return true;
  };

  // ---------------- a golden age ----------------
  P._goldenAge = function (t) {
    const st = this.states[t];
    if (st.golden && st.golden > this.year()) return false;
    st.golden = this.year() + 30;
    const what = this.rng.pick(['poets and mathematicians', 'astronomers and physicians', 'architects and philosophers', 'scholars and engineers']);
    this.log('golden', `A golden age begins in ${st.name}: its cities fill with ${what}, and travellers come from far away to learn.`, { states: [t], major: true });
    return true;
  };

  // ---------------- the nuclear age ----------------
  P.isNuclear = function (t) {
    const d = this.devs.atom, cap = this.capitalOf[t];
    return !!(d && cap != null && d.adopted.has(cap));
  };
  P._nuclearAge = function () {
    const cat = this.cfg.catastrophes ?? 1;
    const nukes = Object.keys(this.states).filter(t => this._statePop[t] && this.isNuclear(t));
    if (nukes.length && !this._nuclearLogged) this._nuclearLogged = new Set();
    for (const t of nukes) if (!this._nuclearLogged.has(t) && this.devs.atom.by !== t) {
      this._nuclearLogged.add(t);
      if ((this._statePop[t] || 0) > 5e6) this.log('atom', `${this.states[t].name} tests its first atomic bomb.`, { states: [t], major: this._nuclearLogged.size <= 6 });
    }
    if (nukes.length < 1) return;
    // a war between nuclear powers may cross the line
    for (const w of this.wars) {
      if (w.end != null || w.nuclearChecked === this.year()) continue;
      w.nuclearChecked = this.year();
      const a = w.A.filter(t => this.isNuclear(t)), d = w.D.filter(t => this.isNuclear(t));
      if (a.length && d.length && this.rng.chance(0.02 * cat)) { this._nuclearWar(w); return; }
    }
    // crises between rival nuclear powers in peacetime: almost always someone blinks
    if (nukes.length >= 2 && this.dip && this.rng.chance(0.012 * cat)) {
      const pairs = [];
      for (const a of nukes) for (const b of nukes) if (a < b && (this.dip.rivals.get(a) || new Set()).has(b)) pairs.push([a, b]);
      if (!pairs.length) return;
      const [a, b] = this.rng.pick(pairs);
      const place = this.rng.pick(this.world.provinces.filter(p => p.coastal && this.owner[p.id] && this.owner[p.id] !== a && this.owner[p.id] !== b)) || this.world.provinces[0];
      const name = `${place.name.replace(/^(Northern|Southern|Eastern|Western|Central|North|South|East|West)\w* /, '')} Crisis`;
      if (this.rng.chance(0.15 * cat)) {
        this.log('crisis_nuclear', `The ${name}: missiles near ${place.name}, ultimatums, and this time nobody blinks.`, { states: [a, b], major: true });
        const w = this._startWar(a, b, { type: 'humiliate' }, `The ${name} War`);
        const war = w || this.wars[this.wars.length - 1];
        if (war && war.end == null) this._nuclearWar(war);
      } else {
        this.log('crisis_nuclear', `The ${name}: for thirteen days ${this.states[a].name} and ${this.states[b].name} stand at the edge of atomic war over ${place.name}. Then someone blinks.`, { states: [a, b], major: true });
      }
    }
  };

  P._nuclearWar = function (w) {
    const sides = [...w.A, ...w.D].filter(t => this.isNuclear(t) || w.leaderA === t || w.leaderD === t);
    let dead = 0;
    const struck = [];
    for (const t of sides) {
      const ps = (this.provsOf[t] || []).slice().sort((a, b) => this.pop[b] - this.pop[a]);
      ps.slice(0, 6).forEach(pid => { dead += this.pop[pid] * 0.45; this.pop[pid] *= 0.55; struck.push(pid); });
      for (const pid of ps) { dead += this.pop[pid] * 0.08; this.pop[pid] *= 0.92; }
    }
    // the winter after
    for (const p of this.world.provinces) if (this.owner[p.id] && p.lonlat[1] > 0) { dead += this.pop[p.id] * 0.03; this.pop[p.id] *= 0.97; }
    this.log('catastrophe', `The ${w.name} turns atomic. ${struck.slice(0, 4).map(p => this.prov[p].name).join(', ')} and other cities vanish in fire; in the winter that follows, harvests fail across the north. Some ${Math.round(dead / 1e6)} million die.`,
      { states: sides, major: true, war: w.id, pid: struck[0] });
    this._peace(w, null, 'white');
    for (const t of sides) if ((this.provsOf[t] || []).length >= 20 && this.rng.chance(0.6)) this._collapse(t, `In the ruins, ${this.states[t].name} can no longer hold together.`);
  };

  // ---------------- hooks ----------------
  const aggression = P._aggression;
  P._aggression = function (r) {
    return aggression.call(this, r) * (r && r.conqueror ? 4 : 1);
  };
  const maxArmy = P.maxArmy;
  P.maxArmy = function (tag) {
    const r = this.chars.get(this.states[tag].ruler);
    return maxArmy.call(this, tag) * (r && r.conqueror ? 1.8 : 1);
  };
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyWild();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initWild();
  };
  P.wildNice = nice;
})(typeof window !== 'undefined' ? window : globalThis);
