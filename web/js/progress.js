// Milestone 7: technology, ages and the great developments as possibilities, not certainties.
// The printing press, gunpowder artillery, a Reformation, the voyages of discovery and colonies
// can come earlier, later, elsewhere or not at all. `historicity` (config) pulls them toward the
// places and dates of our own history.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  const H = s => s.cfg.historicity ?? 0.6;
  // a chance that ripens around a historical year: early is possible, late becomes likely
  const ripe = (sim, year, spread) => {
    const y = sim.year();
    const h = H(sim);
    return 1 / (1 + Math.exp(-(y - year - sim.paceShift(year)) / (spread * (1.6 - h))));
  };

  // starting levels of learning and arms by region (rough, 1444)
  function baseTech(lon, lat) {
    if (lon < -30) return lat > 10 && lat < 25 ? 1.6 : lat < -5 && lat > -20 ? 1.6 : 1.1;
    if (lon > 100 && lat > 18 && lat < 45) return 3.1;     // China, Korea, Japan
    if (lon > 95 && lat <= 18) return 2.4;                 // South-East Asia
    if (lon > 66 && lat < 35) return 2.8;                  // India
    if (lat > 55 && lon > 60) return 1.2;                  // Siberia
    if (lat < 12 && lon > -20 && lon < 55) return 2.0;     // Africa south of the Sahara
    if (lon > 50 && lat > 40) return 2.3;                  // the steppe
    if (lon > 30 && lat < 40) return 3.0;                  // the Middle East
    if (lon < 20 && lat > 36) return 3.0;                  // Latin Europe
    return 2.75;                                           // eastern Europe, the Balkans, North Africa
  }

  P._initProgress = function () {
    this.tech = {};
    for (const t of Object.keys(this.states)) {
      const c = this._capital(t);
      const b = c ? baseTech(c.lonlat[0], c.lonlat[1]) : 2;
      this.tech[t] = { adm: b, mil: b };
    }
    this.devs = {};          // name -> {year, origin, by, adopted: Set of pids}
    this.explore = {};       // tag -> progress on the oceans
    this.discovered = {};    // what a realm knows: {africa, india, newworld}
    this.techHist = [];
    // the trade routes become this timeline's own (a sea road to India may appear)
    this.routes = JSON.parse(JSON.stringify(this.routes));
    this.centres = JSON.parse(JSON.stringify(this.centres));
    this.ages = [{ year: this.year(), name: 'The Late Middle Ages' }];
  };

  P.techOf = function (t) { return this.tech[t] || (this.tech[t] = { adm: 2, mil: 2 }); };

  // ---------------- yearly ----------------
  P._yearlyProgress = function () {
    const W = this.world;
    // 1. learning and arms grow with wealth, able rulers and new ideas; neighbours catch up
    const tags = Object.keys(this.states).filter(t => this._statePop[t]);
    for (const t of tags) {
      const T = this.techOf(t);
      const r = this.chars.get(this.states[t].ruler);
      const e = this.econ && this.econ[t];
      const perHead = e ? (e.tax + e.trade) / Math.max(1, this._statePop[t] / 1e5) : 1;
      const wealth = Math.min(1.6, 0.6 + perHead / 4);
      const print = this.share('printing', t), guns = this.share('gunpowder', t);
      T.adm += 0.0045 * wealth * (1 + (r ? r.adm : 3) / 8) * (1 + print * 0.6) * (this.cfg.tech_speed ?? 1);
      T.mil += 0.0045 * wealth * (1 + (r ? r.mil : 3) / 8) * (1 + guns * 0.5) * (this.cfg.tech_speed ?? 1);
      // ideas travel across borders
      let best = T.adm, bestM = T.mil;
      for (const o of (this.borders && this.borders[t]) || []) {
        const O = this.techOf(o);
        best = Math.max(best, O.adm); bestM = Math.max(bestM, O.mil);
      }
      T.adm += (best - T.adm) * 0.02;
      T.mil += (bestM - T.mil) * 0.025;
    }
    // 2. the great developments
    this._invent('printing', 1450, 10, t => this._latin(t) && this.techOf(t).adm > 3.1, 'adm',
      (pid, t) => `In ${this.prov[pid].name} (${this.states[t].name}) a craftsman prints books with movable type. Learning will never be the same.`);
    this._invent('gunpowder', 1455, 12, t => this.techOf(t).mil > 3.15, 'mil',
      (pid, t) => `The gunfounders of ${this.prov[pid].name} cast great bombards for ${this.states[t].name}: no castle wall is safe any more.`);
    for (const k of ['printing', 'gunpowder']) this._diffuse(k, k === 'printing' ? 0.16 : 0.12);
    this._reformation();
    this._voyages();
    this._colonies();
    // 3. ages of the world
    this._ages();
    // snapshot
    const snap = {};
    for (const t of tags) snap[t] = [Math.round(this.techOf(t).adm * 10) / 10, Math.round(this.techOf(t).mil * 10) / 10];
    this.techHist.push({ year: this.year(), tech: snap });
  };

  P._latin = function (t) {
    const rel = this.states[t].religion;
    return rel === 'catholic' || rel === 'protestant' || rel === 'reformed' || rel === 'hussite';
  };

  // share of a realm's people that has taken up a development
  P.share = function (dev, t) {
    const d = this.devs[dev];
    if (!d) return 0;
    let a = 0, all = 0;
    for (const pid of this.provsOf[t] || []) { all += this.pop[pid]; if (d.adopted.has(pid)) a += this.pop[pid]; }
    return all ? a / all : 0;
  };

  // a development is born somewhere when its time has come and someone is ready for it
  P._invent = function (name, year, spread, ready, track, text) {
    if (this.devs[name]) return;
    if (!this.rng.chance(0.06 * ripe(this, year, spread))) return;
    const cands = Object.keys(this.states).filter(t => this._statePop[t] && ready(t));
    if (!cands.length) return;
    const h = H(this);
    const hist = { printing: ['MAI', 'KOL', 'TRI', 'PAL', 'BUR', 'VEN'], gunpowder: ['FRA', 'BUR', 'TUR', 'HUN'],
      industry: ['ENG', 'SCO', 'BUR'], medicine: ['FRA', 'ENG', 'SAX', 'BRA'], revolution: ['FRA', 'ENG', 'BUR'] }[name] || [];
    const t = this.rng.weighted(cands, x => this.techOf(x)[track] ** 4 * (hist.includes(x) ? 1 + 6 * h : 1) *
      Math.pow((this._statePop[x] || 0) / 1e6, 0.8) *                         // big, rich realms have more workshops
      (this.chars.get(this.states[x].ruler) && this.chars.get(this.states[x].ruler).traits.includes('scholarly') ? 2 : 1));
    if (!t) return;
    const pid = (this.provsOf[t] || []).slice().sort((a, b) => this.pop[b] / this.prov[b].area - this.pop[a] / this.prov[a].area)[0];
    this.devs[name] = { year: this.year(), origin: pid, by: t, adopted: new Set([pid]) };
    this.log('invention', text(pid, t), { states: [t], major: true, pid });
  };

  // ideas spread to neighbouring provinces and along trade routes
  P._diffuse = function (name, rate) {
    const d = this.devs[name];
    if (!d) return;
    const add = [];
    for (const pid of d.adopted) {
      for (const q of this.pAdj[pid]) if (!d.adopted.has(q) && this.owner[q] && this.rng.chance(rate)) add.push(q);
      const ck = this.centreOfProv[pid];
      if (ck) for (const r of this.routes) {
        const i = r.via.indexOf(ck);
        if (i >= 0) for (const j of [i - 1, i + 1]) if (r.via[j] && this.rng.chance(rate)) add.push(this.centres[r.via[j]].prov);
      }
    }
    // learned realms copy it from afar (envoys, books, engineers by ship) once it has proven itself
    if (this.year() - d.year >= 8) {
      let top = 0;
      for (const t of Object.keys(this.states)) if (this._statePop[t]) top = Math.max(top, this.techOf(t).adm);
      for (const t of Object.keys(this.states)) {
        const cap = this.capitalOf[t];
        if (!this._statePop[t] || cap == null || d.adopted.has(cap)) continue;
        if (this.rng.chance(rate * 0.12 * Math.pow(this.techOf(t).adm / Math.max(1, top), 4))) add.push(cap);
      }
    }
    for (const q of add) d.adopted.add(q);
  };

  // ---------------- a Reformation ----------------
  P._reformation = function () {
    const W = this.world;
    const prot = this.relIndex.protestant, cath = this.relIndex.catholic, ref = this.relIndex.reformed;
    if (prot == null) return;
    if (!this.devs.reformation) {
      if (!this.devs.printing || this.year() - this.devs.printing.year < 25) return;
      if (!this.rng.chance(0.05 * ripe(this, 1517, 12) * (this.cfg.reformation ?? 1))) return;
      // a Catholic province with printing presses, far from Rome
      const rome = this._capitalProv('PAP') || this.prov[this.world.states.PAP.capital];
      const cands = W.provinces.filter(p => this.rel[p.id] === cath && this.devs.printing.adopted.has(p.id) && this.owner[p.id]);
      if (!cands.length) return;
      const h = H(this);
      const germanic = p => ['high_german', 'low_german', 'netherlandish', 'norse'].includes((W.cultures[this.cultureOf(p.id)] || {}).group);
      const p = this.rng.weighted(cands, p => this.pop[p.id] / 1e4 * Math.min(3, this._dist(p.lonlat, rome.lonlat) / 600) * (germanic(p) ? 1 + 5 * h : 1));
      if (!p) return;
      const t = this.owner[p.id];
      const reformer = this._pickName({ sex: 'm' }, this.cultureOf(p.id));
      this.devs.reformation = { year: this.year(), origin: p.id, by: t, adopted: new Set([p.id]), reformer };
      this.rel[p.id] = prot;
      this.log('reformation', `In ${p.name} the preacher ${reformer} denounces the corruption of Rome. His theses spread on the printing presses: the Reformation has begun.`,
        { states: [t], major: true, pid: p.id });
      return;
    }
    // a second, stricter branch
    if (ref != null && !this.devs.reformed && this.year() - this.devs.reformation.year > 12 && this.rng.chance(0.06)) {
      const cands = W.provinces.filter(p => (this.rel[p.id] === prot || this.rel[p.id] === cath) && this.devs.printing.adopted.has(p.id) && this.owner[p.id] &&
        ['french', 'swiss', 'arpitan', 'dutch', 'flemish', 'scots'].includes(this.cultureOf(p.id)));
      const p = cands.length ? this.rng.pick(cands) : null;
      if (p) {
        this.devs.reformed = { year: this.year(), origin: p.id, by: this.owner[p.id], adopted: new Set([p.id]) };
        this.rel[p.id] = ref;
        this.log('reformation', `In ${p.name} a stricter Reformed teaching takes hold, breaking with Rome and with the Lutherans alike.`, { states: [this.owner[p.id]], major: true, pid: p.id });
      }
    }
    // the new faiths spread among Catholic provinces (printing helps); rulers may follow their people
    const rome = this._capitalProv('PAP');
    for (const p of W.provinces) {
      if (this.rel[p.id] !== cath || !this.owner[p.id]) continue;
      for (const nf of [prot, ref]) {
        if (nf == null) continue;
        let near = 0;
        for (const q of this.pAdj[p.id]) if (this.rel[q] === nf) near++;
        if (!near) continue;
        let c = 0.035 * near * (this.devs.printing.adopted.has(p.id) ? 1.6 : 0.6);
        if (rome) c *= Math.min(1.6, this._dist(p.lonlat, rome.lonlat) / 900);
        const st = this.states[this.owner[p.id]];
        if (st.religion === 'catholic') { const r = this.chars.get(st.ruler); if (r && (r.traits.includes('zealous') || r.traits.includes('pious'))) c *= 0.4; }
        if (this.rng.chance(c * (this.cfg.reformation ?? 1))) { this.rel[p.id] = nf; break; }
      }
    }
    for (const [t, st] of Object.entries(this.states)) {
      if (!this._statePop[t] || st.religion !== 'catholic' || t === 'PAP' || st.government === 'theocracy') continue;
      let all = 0;
      const by = {};
      for (const pid of this.provsOf[t] || []) {
        all += this.pop[pid];
        const k = this.relKeys[this.rel[pid]];
        by[k] = (by[k] || 0) + this.pop[pid];
      }
      for (const nf of ['protestant', 'reformed']) {
        const share = (by[nf] || 0) / Math.max(1, all);
        const r = this.chars.get(st.ruler);
        if (share < 0.3 || !r) continue;
        let c = 0.12 * share;
        if (r.traits.includes('greedy') || r.traits.includes('ambitious') || r.traits.includes('cynical')) c *= 1.6;   // the church's lands are tempting
        if (r.traits.includes('pious') || r.traits.includes('zealous')) c *= 0.35;
        if (!this.rng.chance(c)) continue;
        st.religion = nf;
        this.stateInfo[t].religion = nf;
        this.log('conversion', `${this.nameIn(r, t)} of ${st.name} embraces the ${nf === 'protestant' ? 'Protestant' : 'Reformed'} faith and breaks with Rome.`,
          { states: [t], chars: [r.id], major: (this._statePop[t] || 0) > 5e5 });
        break;
      }
    }
  };

  // ---------------- the oceans ----------------
  const ATLANTIC = ['POR', 'CAS', 'ARA', 'ENG', 'FRA', 'BUR', 'SCO', 'BRI', 'NAV', 'DAN', 'NOR', 'SWE', 'GEN', 'VEN', 'MOR', 'GRA', 'HOL', 'IRE'];
  P._voyages = function () {
    const h = H(this);
    for (const t of Object.keys(this.states)) {
      if (!this._statePop[t]) continue;
      const cap = this._capitalProv(t);
      if (!cap) continue;
      // realms with an ocean coast in the west of the Old World
      const atlantic = ATLANTIC.includes(t) || (cap.lonlat[0] < 10 && cap.lonlat[0] > -12 && cap.lonlat[1] > 35 && cap.lonlat[1] < 62 && cap.coastal);
      if ((!atlantic && !this.states[t].voyager) || (this._statePop[t] || 0) < 6e5) continue;
      if (!this._latin(t) && !this.states[t].voyager && this.rng.next() < h) continue;          // in our history the Christian sea powers went
      const coast = (this.provsOf[t] || []).filter(pid => this.prov[pid].coastal && this.prov[pid].lonlat[0] < 10).length;
      if (coast < 3 && !this.states[t].voyager) continue;
      const T = this.techOf(t), r = this.chars.get(this.states[t].ruler);
      if (T.adm < 3.0 || (this.treasury[t] || 0) < 0) continue;
      const fame = { POR: 4, CAS: 2.5, ENG: 1.2, FRA: 1, BUR: 1 }[t] || 0.6;
      const push = 0.012 * (1 + ((r && r.dip) || 2) / 4) * Math.max(0.3, 1 + (fame - 1) * h + (1 - h) * 0.5) * (T.adm - 2.8) * (this.cfg.exploration ?? 1);
      this.explore[t] = (this.explore[t] || 0) + Math.max(0, push);
      const d = this.discovered[t] = this.discovered[t] || {};
      const captain = () => `${this._pickName({ sex: 'm' }, this.states[t].culture)} ${this._newDynastyName(this.states[t].culture) || ''}`.trim();
      const firstTo = k => !Object.values(this.discovered).some(x => x !== d && x[k]);
      if (!d.africa && this.explore[t] > 0.8) {
        const first = firstTo('africa');
        d.africa = this.year();
        if (first || (this._statePop[t] > 2e6 && this.year() < 1650)) this.log('discovery', `${this.adjective(t)} caravels sail down the coast of Africa, trading for gold and ivory.`, { states: [t], major: first });
      }
      if (!d.india && this.explore[t] > 2.2 && this.rng.chance(0.25)) {
        const first = firstTo('india');
        d.india = this.year();
        const c = captain();
        if (first) this.log('discovery', `${c}, sailing for ${this.states[t].name}, rounds the southern cape of Africa and reaches the spice ports of India by sea.`, { states: [t], major: true });
        else if (this._statePop[t] > 2e6 && this.year() < 1700) this.log('discovery', `${this.states[t].name} sends its own fleets around Africa to the Indies.`, { states: [t] });
        this._seaRoad(t);
      }
      if (!d.newworld && this.explore[t] > 1.8 && this.rng.chance(0.18 * (t === 'CAS' ? 1 + 2 * h : 1))) {
        // the first to cross reveals the New World to everyone in a few decades
        d.newworld = this.year();
        const c = captain();
        const first = !Object.values(this.discovered).some(x => x !== d && x.newworld && x.newworld < this.year());
        this.log('discovery', first
          ? `${c}, sailing west for ${this.states[t].name}, sights land: a New World lies across the ocean.`
          : `${this.states[t].name} sends its own ships across the ocean to the New World.`, { states: [t], major: first });
      }
    }
  };

  // a sea road around Africa takes trade away from the old spice road
  P._seaRoad = function (t) {
    if (this.routes.some(r => r.cape)) {
      // a second sea power joins the route: its capital port becomes a centre too
      this._addCentre(t);
      return;
    }
    const home = this._addCentre(t);
    const spice = this.routes.find(r => r.name === 'The Spice Road');
    const cut = spice ? spice.value * 0.4 : 15;
    if (spice) spice.value -= cut;
    this.routes.push({ name: 'The Cape Road', value: cut + 10, via: ['malacca', 'calicut', home], cape: true });
  };
  P._addCentre = function (t) {
    const k = 'port_' + t;
    if (this.centres[k]) return k;
    const ports = (this.provsOf[t] || []).filter(pid => this.prov[pid].coastal);
    const cap = this._capitalProv(t);
    const pid = ports.sort((a, b) => (cap ? this._dist(this.prov[a].lonlat, cap.lonlat) - this._dist(this.prov[b].lonlat, cap.lonlat) : 0))[0];
    this.centres[k] = { prov: pid, value: 6, name: this.prov[pid].name };
    this.centreOfProv[pid] = this.centreOfProv[pid] || k;
    const cape = this.routes.find(r => r.cape);
    if (cape && !cape.via.includes(k)) cape.via.push(k);
    return k;
  };

  // ---------------- colonies ----------------
  P._colonies = function () {
    const W = this.world;
    const anyNew = Object.values(this.discovered).filter(d => d.newworld).map(d => d.newworld);
    if (!anyNew.length) return;
    const firstNew = Math.min(...anyNew);
    for (const [t, d] of Object.entries(this.discovered)) {
      if (!this._statePop[t]) continue;
      // knowledge of the New World spreads to other sea powers within a generation
      if (!d.newworld && this.year() - firstNew > 15 && this.explore[t] > 1.2 && this.rng.chance(0.08)) d.newworld = this.year();
      const zones = [];
      if (d.newworld) zones.push('americas');
      if (d.africa) zones.push('africa');
      if (d.india) zones.push('asia');
      if (!zones.length || !this.rng.chance(0.13 * (this.cfg.colonization ?? 1))) continue;
      const zoneOf = p => p.lonlat[0] < -30 ? 'americas' : (p.lonlat[1] < 15 && p.lonlat[0] > -20 && p.lonlat[0] < 52) ? 'africa' : p.lonlat[0] > 60 && p.lonlat[1] < 25 ? 'asia' : null;
      const mine = new Set(this.provsOf[t] || []);
      // in Africa and Asia only trading posts on the coast, a few per realm
      const posts = [...mine].filter(pid => { const z = zoneOf(this.prov[pid]); return z === 'africa' || z === 'asia'; }).length;
      if (!d.newworld && (posts >= 4 || !this.rng.chance(0.25))) continue;
      const pref = { CAS: [-75, 18], POR: [-42, -12], ENG: [-72, 41], FRA: [-66, 46], SCO: [-62, 46], BUR: [-74, 40] }[t] || [-60, 20];
      const cands = W.provinces.filter(p => {
        if (this.owner[p.id]) return false;
        const z = zoneOf(p);
        if (!zones.includes(z)) return false;
        if (z !== 'americas') return p.coastal && posts < 4 && this.rng.chance(0.3);
        // first the coasts; the interior only after a few generations of settlement
        const inland = this.year() - (d.newworld || this.year()) > 50;
        return p.coastal || (inland && this.pAdj[p.id].some(q => mine.has(q)) && this.rng.chance(0.4));
      });
      if (!cands.length) continue;
      const pick = this.rng.weighted(cands, p => {
        const nearMine = this.pAdj[p.id].some(q => mine.has(q)) ? 8 : 1;
        const z = zoneOf(p);
        const dist = z === 'americas' ? this._dist(p.lonlat, pref) : z === 'africa' ? 2500 : 4000;
        return nearMine * Math.exp(-dist / 1500) * (0.3 + p.fert);
      });
      if (pick) this._colonize(pick.id, t);
    }
    // the diseases of the Old World run ahead of the settlers
    const settled = new Set();
    for (const p of W.provinces) if (p.lonlat[0] < -30 && this.owner[p.id] && this._isColonist(this.owner[p.id])) settled.add(p.id);
    for (const p of W.provinces) {
      if (p.lonlat[0] >= -30 || settled.has(p.id)) continue;
      if (this.pAdj[p.id].some(q => settled.has(q))) this.pop[p.id] *= 0.96;
    }
  };

  P._isColonist = function (t) {
    const c = this._capitalProv(t);
    return c && c.lonlat[0] > -30;
  };

  P._colonize = function (pid, t) {
    const first = !(this.provsOf[t] || []).some(q => this.prov[q].lonlat[0] < -30);
    this.owner[pid] = t;
    this.ownerLog.push({ t: this.t, pid, from: null, to: t, war: null, colony: true });
    this.pop[pid] = this.pop[pid] * 0.75 + 3000;
    // settlers bring their language and faith to the Americas
    if (this.prov[pid].lonlat[0] < -30 && this.cult && this.rng.chance(0.5)) {
      const ci = this.cultIndex[this.states[t].culture], ri = this.relIndex[this.states[t].religion];
      if (ci != null) this.cult[pid] = ci;
      if (ri != null) this.rel[pid] = ri;
    }
    this._statePop[t] = (this._statePop[t] || 0) + this.pop[pid];
    this._provCount[t] = (this._provCount[t] || 0) + 1;
    (this.provsOf[t] = this.provsOf[t] || []).push(pid);
    this._bordersDirty = true;
    this.colonies = this.colonies || [];
    this.colonies.push({ t: this.t, pid, by: t });
    if (first || this.rng.chance(0.15)) {
      this.log('colony', `${this.states[t].name} founds a colony at ${this.prov[pid].name}.`, { states: [t], major: first, pid });
    }
  };

  // ---------------- the ages ----------------
  P._ages = function () {
    const add = name => {
      if (this.ages.some(a => a.name === name)) return;
      this.ages.push({ year: this.year(), name });
      this.log('age', `A new age begins: ${name}.`, { major: true });
    };
    const disc = Object.values(this.discovered).some(d => d.newworld || d.india);
    if (disc && this.year() >= 1470) add('The Age of Discovery');
    if (this.devs.reformation && this.year() - this.devs.reformation.year >= 5) add('The Age of Reformation');
    // the ages follow this timeline's own pace, not our calendar
    if (this.year() >= 1620 + this.paceShift(1620) && this.devs.gunpowder) add('The Age of Absolutism');
  };

  P.ageAt = function (year) {
    let a = this.ages[0];
    for (const x of this.ages) if (x.year <= year) a = x;
    return a.name;
  };
  P.techAt = function (t, year) {
    let best = null;
    for (const h of this.techHist) if (h.year <= year) best = h;
    return best && best.tech[t];
  };

  // ---------------- hooks into earlier systems ----------------
  // better arms win battles and break walls
  P.techEdge = function (w) {
    const avg = side => w[side].reduce((s, t) => s + this.techOf(t).mil, 0) / Math.max(1, w[side].length);
    return Math.pow(1.18, avg('A') - avg('D'));
  };
  P.siegeBonus = function (t) { return 1 + this.share('gunpowder', t) * 0.8; };

  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyProgress();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initProgress();
  };
})(typeof window !== 'undefined' ? window : globalThis);
