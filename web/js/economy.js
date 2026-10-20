// Milestone 5: economy and population. Growth, taxes, trade along the great routes, treasuries and
// bankruptcy, plague spreading along roads and sea lanes, famines and the damage done by war. Yearly.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  P._initEconomy = function () {
    const W = this.world;
    let maxId = 0;
    for (const p of W.provinces) maxId = Math.max(maxId, p.id);
    this.pop = new Float64Array(maxId + 1);
    this.pop0 = new Float64Array(maxId + 1);
    for (const p of W.provinces) { this.pop[p.id] = p.pop; this.pop0[p.id] = p.pop; }
    this.treasury = {};
    this.funding = {};
    this.econ = {};               // tag -> {tax, trade, upkeep} last year
    this.bankrupt = {};
    this.popHist = [];            // {year, pop: Float32Array}
    this.econHist = [];           // {year, states: {tag: [pop, income, treasury]}, routes: [value, ...]}
    this.plague = { active: new Map(), immune: new Map(), gen: new Map(), outbreaks: [] };
    // trade centres on routes
    this.routes = (W.trade && W.trade.routes) || [];
    this.centres = (W.trade && W.trade.centres) || {};
    this.centreOfProv = {};
    for (const [k, c] of Object.entries(this.centres)) this.centreOfProv[c.prov] = k;
    for (const t of Object.keys(this.states)) { this.treasury[t] = 0; this.funding[t] = 1; }
  };

  P.popOf = function (pid) { return this.pop ? this.pop[pid] : this.prov[pid].pop; };

  const price = (W, g) => ((W.goods || {})[g] || { price: 2.5 }).price;

  // ---------------- the yearly economy ----------------
  P._yearlyEconomy = function () {
    const W = this.world, cfg = this.cfg;
    const y = this.year();
    // 1. growth: slower where the land is poor or already crowded
    for (const p of W.provinces) {
      const cap = (this.pop0[p.id] * 2.6 + 2000) * (this.popCapFactor ? this.popCapFactor(p.id) : 1);
      const r = 0.0042 * (0.55 + p.fert) * (cfg.growth ?? 1) * (this.growthFactor ? this.growthFactor(p.id) : 1);
      this.pop[p.id] += this.pop[p.id] * r * (1 - this.pop[p.id] / cap);
    }
    // 2. war: occupied land and battlefields suffer
    if (this.ctrl) for (const pid of Object.keys(this.ctrl)) this.pop[pid] *= 0.97;
    if (this.wars) for (const w of this.wars) for (const b of w.battles) if (b.t > this.t - 12) this.pop[b.pid] *= 0.985;
    // 3. famine: a bad harvest strikes a realm now and then, worse in war
    for (const tag of Object.keys(this.states)) {
      if (!this._statePop[tag]) continue;
      const atWar = this._inWarCache && this._inWarCache.has(tag);
      if (!this.rng.chance(0.012 * (cfg.famine ?? 1) * (atWar ? 2 : 1))) continue;
      const m = 0.02 + this.rng.next() * 0.05;
      let dead = 0;
      for (const pid of this.provsOf[tag] || []) {
        if (this.prov[pid].terrain === 'desert' || this.rng.chance(0.3)) continue;
        dead += this.pop[pid] * m;
        this.pop[pid] *= 1 - m;
      }
      if (this._statePop[tag] > 4e5) {
        this.log('famine', `Famine in ${this.states[tag].name}: the harvest fails${atWar ? ' while armies strip the land' : ''}, and some ${round(dead)} die.`,
          { states: [tag], major: this._statePop[tag] > 1.5e6 });
      }
    }
    // 4. plague
    this._plagueYear();
    // 5. money: taxes, trade, armies
    this._money();
    // 6. new totals and a snapshot for the page
    this._recount();
    const snap = new Float32Array(this.pop.length);
    snap.set(this.pop);
    this.popHist.push({ year: y, pop: snap });
  };

  function round(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
    if (n >= 1e4) return Math.round(n / 1000) + ',000';
    return String(Math.round(n / 100) * 100);
  }

  P._plagueYear = function () {
    const W = this.world, pl = this.plague, y = this.year();
    // a new outbreak, most often in a busy port
    if (this.rng.chance(0.11 * (this.cfg.plague_chance ?? 1))) {
      const cs = Object.entries(this.centres);
      const [k, c] = this.rng.weighted(cs, ([, c]) => c.value);
      const pid = c.prov;
      if (!pl.active.has(pid) && !(pl.immune.get(pid) > y)) {
        const ob = { id: pl.outbreaks.length + 1, start: y, origin: pid, dead: 0, provs: 0, reached: new Set(), end: null };
        pl.outbreaks.push(ob);
        pl.active.set(pid, { left: this.rng.int(2, 3), ob: ob.id });
        pl.gen.set(pid, 0);
        this.log('plague', `Plague breaks out in ${this.prov[pid].name}.`, { states: [this.owner[pid]].filter(Boolean), major: true, pid, plague: ob.id });
      }
    }
    if (!pl.active.size) return;
    // the sick die, the disease travels
    const next = new Map();
    for (const [pid, a] of pl.active) {
      const ob = pl.outbreaks[a.ob - 1];
      const dens = this.pop[pid] / Math.max(1, this.prov[pid].area);
      const m = (0.03 + this.rng.next() * 0.07 + Math.min(0.06, dens / 800)) * (this.cfg.plague_severity ?? 1);
      ob.dead += this.pop[pid] * m;
      this.pop[pid] *= 1 - m;
      ob.provs++;
      const owner = this.owner[pid];
      if (owner && pid === this.capitalOf[owner] && !ob.reached.has(owner) && this._statePop[owner] > 1e6) {
        ob.reached.add(owner);
        this.log('plague', `The plague reaches ${this.prov[pid].name}, capital of ${this.states[owner].name}.`, { states: [owner], major: true, pid, plague: ob.id });
      }
      const g = pl.gen.get(pid) || 0;
      const spread = 0.3 * Math.exp(-g / 4);
      const tryInfect = (q, p) => {
        if (pl.active.has(q) || next.has(q) || pl.immune.get(q) > y || !this.rng.chance(p)) return;
        next.set(q, { left: this.rng.int(1, 3), ob: a.ob });
        pl.gen.set(q, g + 1);
      };
      for (const q of this.pAdj[pid]) tryInfect(q, spread);
      // along the trade routes
      const ck = this.centreOfProv[pid];
      if (ck) for (const r of this.routes) {
        const i = r.via.indexOf(ck);
        if (i < 0) continue;
        for (const j of [i - 1, i + 1]) if (r.via[j]) tryInfect(this.centres[r.via[j]].prov, spread * 0.8);
      }
      if (a.left > 1) next.set(pid, { left: a.left - 1, ob: a.ob });
      else pl.immune.set(pid, y + 15 + this.rng.int(0, 10));
    }
    pl.active = next;
    // outbreaks that ended
    const live = new Set([...next.values()].map(a => a.ob));
    for (const ob of pl.outbreaks) {
      if (ob.end == null && !live.has(ob.id)) {
        ob.end = y;
        if (ob.dead > 1.5e5) this.log('plague', `The plague that broke out in ${this.prov[ob.origin].name} in ${ob.start} has run its course; some ${round(ob.dead)} have died.`,
          { states: [...ob.reached], major: ob.dead > 1e6, plague: ob.id });
      }
    }
  };

  P._money = function () {
    const W = this.world;
    const tax = {}, trade = {};
    for (const p of W.provinces) {
      const o = this.owner[p.id];
      if (!o) continue;
      const occupied = this.ctrl && this.ctrl[p.id];
      tax[o] = (tax[o] || 0) + (occupied ? 0 : this.pop[p.id] / 1e4 * price(W, p.good) * 0.12);
    }
    // the great routes: each centre takes its share; war between neighbours on a route chokes it
    const routeVals = [];
    for (const r of this.routes) {
      let flow = r.value;
      for (let i = 0; i + 1 < r.via.length; i++) {
        const a = this.owner[this.centres[r.via[i]].prov], b = this.owner[this.centres[r.via[i + 1]].prov];
        if (a && b && a !== b && this.atWarWith && this.atWarWith(a, b)) flow *= 0.6;
      }
      routeVals.push(flow);
      const sum = r.via.reduce((s, k) => s + this.centres[k].value, 0);
      for (const k of r.via) {
        const pid = this.centres[k].prov;
        const o = (this.ctrl && this.ctrl[pid]) || this.owner[pid];
        if (o) trade[o] = (trade[o] || 0) + flow * this.centres[k].value / sum * 6;
      }
    }
    this._routeFlow = routeVals;
    for (const tag of Object.keys(this.states)) {
      if (!this._statePop[tag]) { this.econ[tag] = { tax: 0, trade: 0, upkeep: 0 }; continue; }
      const r = this.chars.get(this.states[tag].ruler);
      const admin = (r ? 1 + (r.adm - 3) * 0.06 : 1) * (this.tech ? 1 + (this.techOf(tag).adm - 3) * 0.08 : 1);
      const atWar = this._inWarCache && this._inWarCache.has(tag);
      const t = (tax[tag] || 0) * admin, tr = trade[tag] || 0;
      const upkeep = (this.army ? this.army[tag] || 0 : 0) / 1000 * (atWar ? 2.2 : 1.0) * 1.4;
      const income = t + tr;
      this.econ[tag] = { tax: t, trade: tr, upkeep };
      let tre = (this.treasury[tag] || 0) + income - upkeep;
      tre = Math.min(tre, income * 4 + 10);              // surplus goes into courts and churches
      if (r && r.traits.includes('extravagant')) tre -= income * 0.15;
      if (r && r.traits.includes('greedy')) tre += income * 0.05;
      this.treasury[tag] = tre;
      if (this.bankrupt[tag] > this.t) this.funding[tag] = 0.55;
      else if (tre < -income * 2.5 && income > 0) {
        // the crown cannot pay its debts
        this.bankrupt[tag] = this.t + 36;
        this.treasury[tag] = 0;
        this.funding[tag] = 0.55;
        if (this._statePop[tag] > 5e5) this.log('bankruptcy', `${this.states[tag].name} cannot pay its creditors: the crown declares bankruptcy and its armies melt away.`,
          { states: [tag], major: this._statePop[tag] > 2e6 });
      } else this.funding[tag] = tre < 0 ? 0.8 : 1;
    }
    const states = {};
    for (const tag of Object.keys(this.states)) if (this._statePop[tag]) {
      const e = this.econ[tag];
      states[tag] = [Math.round(this._statePop[tag]), Math.round(e.tax + e.trade), Math.round(this.treasury[tag])];
    }
    this.econHist.push({ year: this.year(), states, routes: routeVals.slice() });
  };

  // ---------------- questions the page asks ----------------
  P.popAt = function (year) {
    let best = null;
    for (const h of this.popHist) if (h.year <= year) best = h;
    return best ? best.pop : this.pop0;
  };
  P.econAt = function (tag, year) {
    let best = null;
    for (const h of this.econHist) if (h.year <= year) best = h;
    return best && best.states[tag];
  };
  P.routesAt = function (year) {
    let best = null;
    for (const h of this.econHist) if (h.year <= year) best = h;
    return best ? best.routes : this.routes.map(r => r.value);
  };
  P.plagueAt = function (year) {
    // provinces sick in a year: replay from the outbreak log kept in events
    return this._plagueYears ? (this._plagueYears[year] || []) : [];
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    this._yearlyEconomy();
    // remember which provinces were sick this year (for the map)
    this._plagueYears = this._plagueYears || {};
    this._plagueYears[this.year()] = [...this.plague.active.keys()];
    yearly.call(this);
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    this._initEconomy();
    afterInit.call(this);
  };
})(typeof window !== 'undefined' ? window : globalThis);
