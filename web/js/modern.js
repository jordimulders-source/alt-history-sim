// Milestone 8: the modern age (about 1700-2026). Industry and medicine, revolutions and republics
// with elected presidents, nationalism and unification wars, colonial independence, decolonisation
// and world wars. Like everything else these are possibilities with a ripening time, not fixed dates.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const H = s => s.cfg.historicity ?? 0.6;
  const ripe = (sim, year, spread) => 1 / (1 + Math.exp(-(sim.year() - year - sim.paceShift(year)) / (spread * (1.6 - H(sim)))));

  P._initModern = function () {
    this.modern = { republics: {}, unions: [] };
  };

  // ---------------- demography ----------------
  // more people can live on the same land once industry and medicine arrive
  P.popCapFactor = function (pid) {
    if (!this.devs) return 1;
    const ind = this.devs.industry && this.devs.industry.adopted.has(pid) ? 1 : 0;
    const med = this.devs.medicine && this.devs.medicine.adopted.has(pid) ? 1 : 0;
    return 1 + (ind * 7 + med * 36) * this._modernRoom(pid);
  };
  // lands that were already crowded in 1444 have less room to grow than empty ones
  P._modernRoom = function (pid) {
    if (!this._room) {
      const W = this.world, dens = W.provinces.filter(p => p.pop > 0).map(p => p.pop / Math.max(1, p.area)).sort((a, b) => a - b);
      const ref = dens[Math.floor(dens.length * 0.5)];
      this._room = new Float32Array(this.pop.length);
      for (const p of W.provinces) {
        const empty = Math.max(0.07, Math.min(1.8, Math.pow(ref / Math.max(1e-6, p.pop / Math.max(1, p.area)), 1.0)));
        this._room[p.id] = Math.max(0.07, empty * Math.min(1, 0.25 + p.fert));   // tundra and desert stay thin
      }
    }
    return this._room[pid];
  };
  P.growthFactor = function (pid) {
    if (!this.devs) return 1;
    const ind = this.devs.industry && this.devs.industry.adopted.has(pid) ? 1 : 0;
    const med = this.devs.medicine && this.devs.medicine.adopted.has(pid) ? 1 : 0;
    return 1 + ind * 1.6 + med * 3.6;
  };
  // people (and rulers) live longer in the modern world
  P.ageMortality = function (a) {
    const y = this.year();
    const f = y < 1800 ? 1 : y < 1900 ? 0.85 : y < 1950 ? 0.65 : 0.45;
    // modern medicine flattens the curve of old age: people now reach their eighties and nineties
    const old = y >= 1880 && a > 40 ? Math.exp(-(y >= 1950 ? 0.022 : 0.012) * (Math.min(a, 85) - 40)) : 1;      // past 85 the old curve returns: hardly anyone sees 105
    return f * old;
  };

  // ---------------- yearly ----------------
  P._yearlyModern = function () {
    const y = this.year();
    if (y < 1650) return;
    // industry: coal, steam and machines
    this._invent('industry', 1770, 18, t => this.techOf(t).adm > 6 && (this._statePop[t] || 0) > 2e6, 'adm',
      (pid, t) => `In ${this.prov[pid].name} the first steam engines drive looms and pumps: ${this.states[t].name} begins to industrialise.`);
    this._invent('medicine', 1860, 12, t => this.devs.industry && y - this.devs.industry.year >= 40 && this.share('industry', t) > 0.4, 'adm',
      (pid, t) => `Physicians of ${this.states[t].name} prove that germs spread disease. Vaccines and clean water follow.`);
    this._invent('revolution', 1789, 15, t => this.devs.printing && this.share('printing', t) > 0.6 && this.states[t].government === 'monarchy' && (this._statePop[t] || 0) > 3e6, 'adm',
      (pid, t) => `Revolution in ${this.prov[pid].name}! The people of ${this.states[t].name} rise against the crown in the name of liberty.`);
    this._diffuse('industry', 0.07);
    this._diffuse('medicine', 0.14);
    this._diffuse('revolution', 0.06);
    // technology speeds up with industry
    for (const t of Object.keys(this.states)) {
      if (!this._statePop[t]) continue;
      const T = this.techOf(t), ind = this.share('industry', t);
      T.adm += 0.025 * ind * (this.cfg.tech_speed ?? 1);
      T.mil += 0.03 * ind * (this.cfg.tech_speed ?? 1);
    }
    this._revolutions();
    this._restorations();
    this._elections();
    this._unification();
    this._colonialIndependence();
    this._modernAges();
  };

  // ---------------- revolutions and republics ----------------
  P._revolutions = function () {
    const rev = this.devs.revolution;
    if (!rev) return;
    for (const [t, st] of Object.entries(this.states)) {
      if (!this._statePop[t] || st.government !== 'monarchy') continue;
      const share = rev.year === this.year() && rev.by === t ? 1 : this.share('revolution', t);
      if (share < 0.25) continue;
      const r = this.chars.get(st.ruler);
      // unrest and bad rulers make a revolution likelier
      let mean = 0, n = 0;
      for (const pid of this.provsOf[t] || []) { mean += this.unrest[pid]; n++; }
      mean = n ? mean / n : 0;
      let p = 0.012 * share * (1 + mean / 25) * (this.cfg.revolutions ?? 1);
      if (r && (r.adm + r.dip <= 4 || r.traits.includes('cruel') || r.traits.includes('mad'))) p *= 2;
      // a crown that already shares power with a parliament is rarely toppled
      if (st.constitution) p *= 0.15;
      if (rev.by === t && rev.year === this.year()) p = 1;
      if (!this.rng.chance(p)) continue;
      // a republic, or a king who accepts a constitution
      if (st.constitution || this.rng.chance(0.5)) this._becomeRepublic(t, r);
      else {
        st.constitution = this.year();
        if (r) this.log('constitution', `${this.nameIn(r, t)} of ${st.name} accepts a constitution and an elected parliament.`, { states: [t], chars: [r.id], major: (this._statePop[t] || 0) > 5e6 });
      }
    }
  };

  // republics are not forever: a general or a pretender may bring back a crown
  P._restorations = function () {
    for (const [t, st] of Object.entries(this.states)) {
      if (!st.modernRepublic || st.government !== 'republic' || !this._statePop[t]) continue;
      let mean = 0, n = 0;
      for (const pid of this.provsOf[t] || []) { mean += this.unrest[pid]; n++; }
      mean = n ? mean / n : 0;
      const young = this.t - (st.republicSince || 0) < 12 * 30 ? 2 : 1;
      if (!this.rng.chance(0.0015 * young * (1 + mean / 20) * (this._inWar(t) ? 2 : 1))) continue;
      const ex = st.exiled && this.chars.get(st.exiled);
      const pretender = ex && this.alive(ex) && !ex.titles.length ? { char: ex.id } : null;
      const pres = this.chars.get(st.ruler);
      // in the twentieth century a general does not crown himself: he becomes a dictator
      if (this.year() > 1900 && !pretender && this._strongman) { this._strongman(t); continue; }
      st.government = 'monarchy'; st.succession = 'primogeniture'; st.modernRepublic = false;
      this.stateInfo[t].government = 'monarchy'; this.stateInfo[t].succession = 'primogeniture';
      st.restored = this.year(); st.restoredT = this.t;
      let c;
      if (pretender && this.rng.chance(0.5)) {
        c = this.chars.get(pretender.char);
        this.log('restoration', `The republic of ${st.name} falls; the crown returns to ${this.fullName(c)}, who had waited in exile.`, { states: [t], chars: [c.id], major: true });
        this._setRuler(t, c, { how: 'restored to the throne' });
      } else {
        c = this._generateRuler(t, { age: this.rng.int(36, 52) });
        c.mil = Math.max(c.mil, 5);
        if (!c.traits.includes('ambitious')) c.traits.push('ambitious');
        this.log('restoration', `General ${c.name} ${c.dynasty || ''} marches on the capital of ${st.name}, dissolves the republic and has himself crowned.`.replace('  ', ' '), { states: [t], chars: [c.id], major: true });
        this._setRuler(t, c, { how: 'seized the throne' });
      }
      if (pres && pres !== c) pres.republican = true;
    }
  };

  P._becomeRepublic = function (t, r) {
    const st = this.states[t];
    st.oldGov = { government: st.government, succession: st.succession };
    st.republicSince = this.t;
    for (const cl of this.claims) if (cl.tag === t) this._endClaim(cl, 'the monarchy fell');   // no crown left to claim
    st.government = 'republic';
    st.succession = 'republic';
    st.modernRepublic = true;
    this.stateInfo[t].government = 'republic';
    this.stateInfo[t].succession = 'republic';
    const fate = this.rng.next();
    const king = r ? this.nameIn(r, t) : null, cap = this.prov[this.capitalOf[t]].name;
    if (r) this.log('revolution', this.rng.pick([
      `The monarchy of ${st.name} is overthrown. ${king} is ${fate < 0.35 ? 'executed' : 'driven into exile'}, and ${st.name} becomes a republic.`,
      `Crowds storm the palace in ${cap}. ${king} ${fate < 0.35 ? 'goes to the scaffold' : 'flees in a borrowed coat'}; ${st.name} proclaims a republic.`,
      `The army refuses to fire on the people of ${cap}. ${king} ${fate < 0.35 ? 'is tried and executed' : 'abdicates and sails into exile'}, and ${st.name} is a republic.`,
      `A parliament in ${cap} declares the crown abolished. ${king} ${fate < 0.35 ? 'is put to death' : 'is sent abroad with a pension'}; the Republic of ${st.name.replace(/^the /i, '')} is born.`,
    ]),
      { states: [t], chars: [r.id], major: true });
    this._newPresident(t);
    if (r) {
      if (fate < 0.35) this._die(r, 'the guillotine');
      else { st.exiled = r.id; if (this._addClaim) this._addClaim(t, r, 0.6, 'the deposed monarch'); }
    }
  };

  P._newPresident = function (t) {
    const st = this.states[t];
    const c = this._generateRuler(t, { age: this.rng.int(42, 66) });
    c.republican = true;
    // the old head of state steps down (and keeps living)
    const old = this.chars.get(st.ruler);
    if (old) old.titles = old.titles.filter(x => x !== t);
    const h = st.history[st.history.length - 1];
    if (h && h.to == null) h.to = this.t;
    st.ruler = null;
    st.regent = null;
    this._setRuler(t, c, { how: 'elected' });
    st.termEnds = this.t + 12 * this.rng.int(4, 7);
    this.log('election', `${this.fullName(c)} is elected President of ${st.name}.`, { states: [t], chars: [c.id], major: (this._statePop[t] || 0) > 8e6 });
  };

  // modern republics elect their heads for a term, not for life
  P._elections = function () {
    for (const [t, st] of Object.entries(this.states)) {
      if (!st.modernRepublic || !this._statePop[t]) continue;
      if (st.termEnds && this.t >= st.termEnds) {
        const cur = this.chars.get(st.ruler);
        // sometimes re-elected once
        if (cur && this.alive(cur) && !cur.reelected && this.rng.chance(0.35)) {
          cur.reelected = true;
          st.termEnds = this.t + 12 * this.rng.int(4, 6);
          continue;
        }
        this._newPresident(t);
      }
    }
  };

  // ---------------- nationalism ----------------
  // the strongest realm of a people unites the smaller realms of the same people
  P._unification = function () {
    if (!this.devs.revolution || this.year() < this.devs.revolution.year + 10) return;
    const byGroup = {};
    for (const [t, st] of Object.entries(this.states)) {
      if (!this._statePop[t]) continue;
      const g0 = (this.world.cultures[st.culture] || {}).group;
      if (!g0) continue;
      // nations bigger than one family of languages: India, Germany
      const g = NATION[g0] || g0;
      (byGroup[g] = byGroup[g] || []).push(t);
    }
    for (const [g, tags] of Object.entries(byGroup)) {
      if (tags.length < 2) continue;
      tags.sort((a, b) => this.power(b) - this.power(a));
      const lead = tags[0];
      if (this._inWar(lead) || !this.rng.chance((g === 'indian' || g === 'german' ? 0.08 : 0.05) * (this.cfg.nationalism ?? 1))) continue;
      const small = tags.slice(1).filter(t => this.borders[lead] && this.borders[lead].has(t) && !this._hasTruce(lead, t) && this.power(t) < this.power(lead) * 0.5);
      if (!small.length) continue;
      const target = this.rng.pick(small);
      // small realms may join of their own will
      if (this.opinion(lead, target) > 20 && this.rng.chance(0.4)) {
        for (const pid of (this.provsOf[target] || []).slice()) this._transfer(pid, lead, null);
        this.log('unification', `${this.states[target].name} votes to join ${this.states[lead].name}: one more step toward a single ${niceGroup(g)} nation.`, { states: [lead, target], major: true });
        continue;
      }
      const goal = { type: 'conquest', provs: (this.provsOf[target] || []).slice(0, 6), unify: true };
      this._startWar(lead, target, goal, `War of ${this.adjective(lead)} Unification`);
    }
  };
  const NATION = { indo_aryan: 'indian', dravidian: 'indian', high_german: 'german', low_german: 'german' };
  function niceGroup(g) { return String(g).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  // ---------------- colonies break away ----------------
  P._colonialIndependence = function () {
    const y = this.year();
    if (y < 1740) return;
    for (const [t, st] of Object.entries(this.states)) {
      const cap = this._capitalProv(t);
      if (!cap || !this._statePop[t]) continue;
      // provinces far from the capital, overseas
      const far = (this.provsOf[t] || []).filter(pid => this._dist(this.prov[pid].lonlat, cap.lonlat) > 3000 && !this._sameLandmass(pid, cap.id));
      if (far.length < 3) continue;
      const block = this._connected(far);
      if (block.length < 3) continue;
      const pop = block.reduce((s, pid) => s + this.pop[pid], 0);
      const americas = this.prov[block[0]].lonlat[0] < -30;
      // the Americas earlier (settlers), Africa and Asia in the twentieth century
      const when = americas ? ripe(this, 1790, 25) : ripe(this, 1955, 12);
      if (!this.rng.chance(0.06 * when * Math.min(2, pop / 1e6 + 0.3) * (this.cfg.decolonization ?? 1))) continue;
      const capital = block.slice().sort((a, b) => this.pop[b] - this.pop[a])[0];
      const cultCount = {};
      for (const pid of block) cultCount[this.cultureOf(pid)] = (cultCount[this.cultureOf(pid)] || 0) + this.pop[pid];
      const cult = Object.entries(cultCount).sort((a, b) => b[1] - a[1])[0][0];
      const relCount = {};
      for (const pid of block) relCount[this.religionOf(pid)] = (relCount[this.religionOf(pid)] || 0) + this.pop[pid];
      const rel = Object.entries(relCount).sort((a, b) => b[1] - a[1])[0][0];
      const region = this._realmName(block, cult).replace(/^(North|South|East|West|Central)\w* /, '');
      const taken = n => Object.values(this.states).some(x => x.name === n && !x.destroyed);
      const home = 'New ' + ((this.world.states[t] || st).name).replace(/^(The |Kingdom of |Duchy of |Republic of )/, '');
      const land = this._landName ? this._landName(block, cult, taken) : region;
      const name = !americas ? region
        : !taken(home) ? home
        : /^(New |Nieuw-|Nueva |Nouvelle-|Nova |Neu-|San |Santa |São |Saint-|Sint-|Fort |Port |Puerto |Villa |Real )/.test(land) || this.rng.chance(0.55) ? land
        : `${this.rng.pick(['United Provinces of', 'Republic of', 'Free State of', 'Confederation of'])} ${land}`;
      const tag = this._newState(name, cult, rel, capital);
      const ns = this.states[tag];
      ns.born = this.t;
      // a republic in the age of revolutions, otherwise whatever the times bring
      if (y >= 1770) { ns.government = 'republic'; ns.succession = 'republic'; ns.modernRepublic = true; ns.republicSince = this.t; this.stateInfo[tag].government = 'republic'; this.stateInfo[tag].succession = 'republic'; }
      for (const pid of block) this._transfer(pid, tag, null);
      this.capitalOf[tag] = capital;
      if (ns.modernRepublic) this._newPresident(tag);
      else this._setRuler(tag, this._generateRuler(tag), { how: 'leader of the independence movement' });
      this.army[tag] = this.maxArmy(tag) * 1.5;
      const peaceful = y >= 1945 && this.rng.chance(0.6);
      this.log('independence', peaceful
        ? `${name} gains its independence from ${st.name}.`
        : `The colonies around ${region} declare their independence from ${st.name} as ${name}.`, { states: [tag, t], major: true, pid: capital });
      if (!peaceful) {
        ns.rebel = true;
        this._startWar(tag, t, { type: 'independence' }, `${name.replace(/^(United Provinces|Republic|Free State|Confederation) of /, '')} War of Independence`, { allies: false, quiet: true });
      }
    }
  };

  // provinces on the same land mass as the capital (walk along land borders, a few hundred steps at most)
  P._sameLandmass = function (pid, capPid) {
    this._landCache = this._landCache || new Map();
    if (!this._landmass) {
      this._landmass = new Int32Array(this.pop.length).fill(-1);
      let id = 0;
      for (const p of this.world.provinces) {
        if (this._landmass[p.id] >= 0) continue;
        const stack = [p.id];
        this._landmass[p.id] = id;
        while (stack.length) {
          const x = stack.pop();
          for (const q of this.pAdj[x]) if (this._landmass[q] < 0) { this._landmass[q] = id; stack.push(q); }
        }
        id++;
      }
    }
    return this._landmass[pid] === this._landmass[capPid];
  };

  // ---------------- ages ----------------
  P._modernAges = function () {
    const add = name => {
      if (this.ages.some(a => a.name === name)) return;
      this.ages.push({ year: this.year(), name });
      this.log('age', `A new age begins: ${name}.`, { major: true });
    };
    const y = this.year();
    const has = n => this.ages.some(a => a.name === n);
    if (y >= 1680 + this.paceShift(1680) && this.devs.printing) add('The Age of Enlightenment');
    if (this.devs.revolution && y - this.devs.revolution.year >= 3) add('The Age of Revolutions');
    if (this.devs.industry && y - this.devs.industry.year >= 30) add('The Industrial Age');
    // the age of extremes needs a world war or red revolutions, and comes before the bomb
    if (!has('The Atomic Age') && ((this._worldWars || 0) >= 1 || (this.govLog && this.govLog.filter(e => e.code === 'communist').length >= 3))) add('The Age of Extremes');
    if (this.devs.atom && y - this.devs.atom.year >= 1) add('The Atomic Age');
    // computers come a generation after the bomb, or with enough factories and medicine anyway
    const info = this.devs.atom ? this.devs.atom.year + 38 : (this.devs.medicine ? this.devs.medicine.year + 120 : 9999);
    if (has('The Atomic Age') ? y >= info : !this.devs.atom && y >= Math.max(2000, info)) add('The Information Age');
  };

  // ---------------- world wars ----------------
  // a war that drags in many great powers gets a bigger name
  const startWar = P._startWar;
  P._startWar = function (a, d, goal, name, opts = {}) {
    const w = startWar.call(this, a, d, goal, name, opts);
    if (this.year() >= 1850) {
      if (this._makeWorldWar) this._makeWorldWar(w);
    }
    return w;
  };

  // armies grow with industry: mass armies of the modern age
  const maxArmy = P.maxArmy;
  P.maxArmy = function (tag) {
    let m = maxArmy.call(this, tag);
    if (this.devs && this.devs.industry) m *= 1 + this.share('industry', tag) * 1.5;
    return m;
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyModern();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initModern();
  };
})(typeof window !== 'undefined' ? window : globalThis);
