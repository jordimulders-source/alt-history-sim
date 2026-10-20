// The age of ideologies (about 1840-2026). Socialism is an idea that can be born where the factories
// are; workers may make a red revolution, a defeated or bankrupt realm may fall to a strongman, and
// both kinds of regime may fall again. Realms of the same creed draw together, rival creeds glare at
// each other across a cold war. How red, how brown or how free the twentieth century turns out is
// different in every timeline.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  P._initIdeology = function () {
    this.govLog = [];
    this._govCode = {};
    // how much this timeline is drawn to revolutions of the left and to strongmen
    this.redMood = Math.max(0, Math.min(2.2, new root.Rng(this.seed + '|red').normal(1, 0.55))) * (this.cfg.ideologies ?? 1);
    this.brownMood = Math.max(0, Math.min(2.2, new root.Rng(this.seed + '|brown').normal(1, 0.55))) * (this.cfg.ideologies ?? 1);
    this._recordGov();
  };

  // what kind of state a realm is, for the map of politics
  P.govCode = function (t) {
    const st = this.states[t];
    if (st.ideology === 'communist') return 'communist';
    if (st.government === 'dictatorship') return 'dictatorship';
    if (st.government === 'theocracy' || st.government === 'order') return 'theocracy';
    if (st.government === 'tribal') return 'tribal';
    if (st.government === 'republic') return st.modernRepublic ? 'democracy' : 'republic';
    return st.constitution ? 'constitutional' : 'monarchy';
  };
  P._recordGov = function () {
    for (const t of Object.keys(this.states)) {
      if (!this._statePop[t] && this._govCode[t]) continue;
      const c = this.govCode(t);
      if (this._govCode[t] !== c) { this._govCode[t] = c; this.govLog.push({ t: this.t, tag: t, code: c }); }
    }
  };
  P.govMapAt = function (year) {
    const T = year * 12 + 11, out = {};
    for (const e of this.govLog) { if (e.t > T) break; out[e.tag] = e.code; }
    return out;
  };

  const share = (sim, k, t) => (sim.devs[k] ? sim.share(k, t) : 0);
  const meanUnrest = (sim, t) => {
    let m = 0, n = 0;
    for (const pid of sim.provsOf[t] || []) { m += sim.unrest[pid]; n++; }
    return n ? m / n : 0;
  };
  // a realm that lost a war (and land) in the last few years
  const humiliated = (sim, t) => sim.wars.some(w => w.end != null && sim.t - w.end < 12 * 6 &&
    ((w.result === 'attackers' && w.D.includes(t)) || (w.result === 'defenders' && w.A.includes(t))));

  P._yearlyIdeology = function () {
    const y = this.year();
    if (y >= 1820 && this.devs.industry) {
      this._invent('socialism', 1848, 14, t => share(this, 'industry', t) > 0.25, 'adm',
        (pid, t) => `In ${this.prov[pid].name}, a bearded philosopher of ${this.states[t].name} writes that the workers have nothing to lose but their chains.`);
      this._diffuse('socialism', 0.05);
    }
    if (y >= 1880) for (const [t, st] of Object.entries(this.states)) {
      if ((this._statePop[t] || 0) < 1e6) continue;
      const u = meanUnrest(this, t), lost = humiliated(this, t), broke = this.bankrupt && this.bankrupt[t] > this.t;
      // a red revolution
      if (st.ideology !== 'communist' && st.government !== 'theocracy' && share(this, 'socialism', t) > 0.3 && share(this, 'industry', t) > 0.15) {
        let p = 0.0035 * this.redMood * (1 + u / 20) * (lost ? 4 : 1) * (broke ? 2 : 1) * (y > 1990 ? 0.3 : 1);
        if (st.government === 'monarchy' && !st.constitution) p *= 2;
        if (st.government === 'dictatorship') p *= 1.5;
        if (this.rng.chance(p)) { this._redRevolution(t); continue; }
      }
      // a strongman
      if (y >= 1905 && y < 2000 && ['republic', 'monarchy'].includes(st.government) && st.ideology !== 'communist' && (lost || broke || u > 22)) {
        const p = 0.006 * this.brownMood * (lost ? 2 : 1) * (st.modernRepublic && this.t - (st.republicSince || 0) < 12 * 25 ? 1.6 : 1);
        if (this.rng.chance(p)) { this._strongman(t); continue; }
      }
      // regimes fall too
      if (st.ideology === 'communist' && this.t - (st.ideologySince || 0) > 12 * 20) {
        const p = (y < 1975 ? 0.004 : 0.02) * (1 + u / 25) * (this.rng.next() < 0.5 ? 1 : 0.5);
        if (this.rng.chance(p)) this._toDemocracy(t, `The party's rule in ${st.name} collapses: crowds tear down the statues, and free elections follow.`);
      } else if (st.government === 'dictatorship' && this.t - (st.ideologySince || 0) > 12 * 8) {
        const p = 0.025 * (1 + u / 25) * (lost ? 3 : 1);
        if (this.rng.chance(p)) this._toDemocracy(t, `The dictatorship in ${st.name} ends; the generals go back to their barracks and the people go to the polls.`);
      }
    }
    // the cold war: the greatest powers of rival creeds become rivals
    if (y >= 1946 && this.dip && y % 5 === 0) {
      const top = c => Object.keys(this.states).filter(t => this._statePop[t] && this.govCode(t) === c).sort((a, b) => this._statePop[b] - this._statePop[a])[0];
      const red = top('communist'), free = [top('democracy'), top('constitutional')].filter(Boolean).sort((a, b) => this._statePop[b] - this._statePop[a])[0];
      if (red && free && !(this.dip.rivals.get(red) || new Set()).has(free)) {
        if (!this.dip.rivals.has(red)) this.dip.rivals.set(red, new Set());
        if (!this.dip.rivals.has(free)) this.dip.rivals.set(free, new Set());
        this.dip.rivals.get(red).add(free); this.dip.rivals.get(free).add(red);
        if (!this._coldWar) {
          this._coldWar = y;
          this.log('coldwar', `A cold war begins: ${this.states[red].name} and ${this.states[free].name} divide the world into two camps, and each waits for the other to blink.`, { states: [red, free], major: true });
        }
      }
    }
    this._recordGov();
  };

  // the old head of state leaves the stage (the reign is closed in the records)
  P._clearRuler = function (t) {
    const st = this.states[t], r = this.chars.get(st.ruler);
    if (r) r.titles = r.titles.filter(x => x !== t);
    const h = st.history[st.history.length - 1];
    if (h && h.to == null) h.to = this.t;
    st.ruler = null; st.regent = null;
  };

  P._rename = function (t, name) {
    const st = this.states[t];
    if (!this.realmNames || name === st.name) return;
    (this.realmNames[t] = this.realmNames[t] || [{ t: -Infinity, name: st.name }]).push({ t: this.t, name });
    st.name = name; this.stateInfo[t].name = name;
  };
  const baseName = st => st.name.replace(/^(People's Republic of |Republic of |Empire of |Kingdom of )/, '').replace(/ Empire$/, '');

  P._redRevolution = function (t) {
    const st = this.states[t], r = this.chars.get(st.ruler);
    const old = st.name;
    st.government = 'republic'; st.succession = 'republic'; st.modernRepublic = false;
    st.ideology = 'communist'; st.ideologySince = this.t;
    this.stateInfo[t].government = 'republic'; this.stateInfo[t].succession = 'republic';
    for (const cl of this.claims) if (cl.tag === t) this._endClaim(cl, 'the revolution');
    const plain = (this.world.states[t] ? this.world.states[t].name.replace(/^The /, '') : baseName(st)).replace(/ Kingdom$/, '');
    const nm = Sim.isPlural && Sim.isPlural(plain) ? `${this.adjective(t)} People's Republic` : `People's Republic of ${plain}`;
    this._rename(t, nm);
    const c = this._generateRuler(t, { age: this.rng.int(38, 55) });
    c.republican = true;
    if (!c.traits.includes('paranoid') && this.rng.chance(0.5)) c.traits.push('paranoid');
    this.log('red', `Red flags over ${this.prov[this.capitalOf[t]].name}: the workers of ${old} rise${r ? `, ${this.nameIn(r, t)} is ${this.rng.chance(0.4) ? 'shot' : 'driven into exile'}` : ''}, and the ${nm} is proclaimed.`,
      { states: [t], chars: r ? [r.id] : [], major: true });
    this._clearRuler(t);
    this._setRuler(t, c, { how: 'chairman of the party' });
    if (this.secular) this.secular[t] = Math.max(this.secular[t] || 0, 0.7);
    // the lands are collectivised; sometimes the harvest pays for it
    if (this.rng.chance(0.35)) {
      let dead = 0;
      for (const pid of this.provsOf[t] || []) if (this.rng.chance(0.4)) { dead += this.pop[pid] * 0.04; this.pop[pid] *= 0.96; }
      this.log('famine', `The farms of ${nm} are collectivised; the harvest fails, and some ${Math.round(dead / 1e5) / 10} million starve.`, { states: [t], major: true });
    }
    // neighbours fear the contagion
    if (this.dip) for (const o of this.borders && this.borders[t] ? this.borders[t] : []) if (this.govCode(o) !== 'communist' && this.rng.chance(0.4)) {
      if (!this.dip.rivals.has(o)) this.dip.rivals.set(o, new Set());
      this.dip.rivals.get(o).add(t);
    }
  };

  P._strongman = function (t, quiet) {
    const st = this.states[t], r = this.chars.get(st.ruler);
    const c = this._generateRuler(t, { age: this.rng.int(38, 56) });
    c.mil = Math.max(c.mil, 5);
    c.traits = c.traits.filter(x => !['content', 'kind', 'craven'].includes(x));
    for (const tr of ['ambitious', this.rng.chance(0.5) ? 'cruel' : 'wrathful']) if (!c.traits.includes(tr)) c.traits.push(tr);
    c.republican = false;
    const title = this.rng.pick(['the Leader', 'the Generalissimo', 'the Father of the Nation', 'the Protector']);
    if (!quiet) this.log('dictator', `${c.name} ${c.dynasty || ''} seizes power in ${st.name} and has himself called ${title}. Parliament is dissolved, opponents vanish, and the nation is told it was always destined for greatness.`.replace('  ', ' '),
      { states: [t], chars: [c.id], major: true });
    st.government = 'dictatorship'; st.succession = 'republic'; st.modernRepublic = false;
    st.ideology = 'nationalist'; st.ideologySince = this.t;
    this.stateInfo[t].government = 'dictatorship'; this.stateInfo[t].succession = 'republic';
    for (const cl of this.claims) if (cl.tag === t) this._endClaim(cl, 'the dictatorship');
    this._clearRuler(t);
    this._setRuler(t, c, { how: 'seized power' });
    if (this.army) this.army[t] = Math.max(this.army[t] || 0, this.maxArmy(t) * 1.3);
  };

  P._toDemocracy = function (t, text) {
    const st = this.states[t];
    st.government = 'republic'; st.succession = 'republic'; st.modernRepublic = true;
    st.republicSince = this.t; st.restoredT = null;
    st.ideology = 'democracy'; st.ideologySince = this.t;
    this.stateInfo[t].government = 'republic'; this.stateInfo[t].succession = 'republic';
    if (/People's Republic/.test(st.name)) this._rename(t, st.name.replace(/^People's Republic of /, 'Republic of ').replace(/ People's Republic$/, ' Republic'));
    this.log('democracy', text, { states: [t], major: true });
    this._newPresident(t);
  };

  // creeds draw realms together and apart
  const opinion = P.opinion;
  P.opinion = function (a, b) {
    let o = opinion.call(this, a, b);
    if (this.year() < 1900 || !this._govCode) return o;
    const A = this.govCode(a), B = this.govCode(b);
    const free = c => c === 'democracy' || c === 'constitutional';
    if (A === 'communist' && B === 'communist') o += 30;
    else if (free(A) && free(B)) o += 15;
    else if ((A === 'communist' && free(B)) || (B === 'communist' && free(A))) o -= 35;
    else if ((A === 'communist' && B === 'dictatorship') || (B === 'communist' && A === 'dictatorship')) o -= 30;
    else if ((A === 'dictatorship' && free(B)) || (B === 'dictatorship' && free(A))) o -= 12;
    // in a secular age, a different faith matters less
    if (this.secularOf) {
      const s = (this.secularOf(a) + this.secularOf(b)) / 2;
      if (this.states[a].religion !== this.states[b].religion) o += 15 * s;
    }
    return o;
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyIdeology();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initIdeology();
  };
})(typeof window !== 'undefined' ? window : globalThis);
