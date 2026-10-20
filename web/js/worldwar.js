// World wars. A war between great powers in the modern age can pull in their allies, the allies of
// their allies, and the realms that share their creed, until the whole world is at war. Such a war is
// fought with mass armies and costs ordinary people dearly; it ends with a peace conference that
// redraws the map, topples the losers' regimes, and founds a league of nations to keep the peace for ever.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  const great = (sim, t) => (sim._statePop[t] || 0) > 1.5e7;

  // is this war big enough to be called a world war?
  P._isWorldWar = function (w) {
    if (w.world || /Revolt/.test(w.name)) return false;
    if (this._lastWorldWarEnd && this.t - this._lastWorldWarEnd < 12 * 20) return false;
    const gA = w.A.filter(t => great(this, t)).length, gD = w.D.filter(t => great(this, t)).length;
    if (gA < 2 || gD < 2) return false;
    let world = 0, inWar = 0;
    for (const v of Object.values(this._statePop)) world += v || 0;
    for (const t of [...w.A, ...w.D]) inWar += this._statePop[t] || 0;
    return inWar >= 0.3 * world;
  };

  P._makeWorldWar = function (w) {
    if (w.world || !this._isWorldWar(w)) return;
    w.world = true;
    this._worldWars = (this._worldWars || 0) + 1;
    const old = w.name;
    w.name = this._worldWars === 1 && this.rng.chance(0.4) ? 'The Great War' : `The ${ORD[this._worldWars - 1] || this._worldWars + 'th'} World War`;
    const side = s => w[s].filter(t => great(this, t)).map(t => this.states[t].name);
    this.log('worldwar', `${w.name} begins: what started as the ${old.replace(/^The /, '')} now sets the whole world ablaze. On one side: ${side('A').join(', ')}; on the other: ${side('D').join(', ')}.`,
      { states: [...w.A, ...w.D], major: true, war: w.id });
  };

  // the war widens: allies answer the call, kindred regimes take sides
  P._yearlyWorldWars = function () {
    const y = this.year();
    if (y < 1850 || !this.dip) return;
    for (const w of this.wars) {
      if (w.end != null) continue;
      const powersA = w.A.filter(t => great(this, t)), powersD = w.D.filter(t => great(this, t));
      if (!powersA.length || !powersD.length) continue;
      for (const t of Object.keys(this.states)) {
        if ((this._statePop[t] || 0) < 3e6 || this._side(w, t) || this._inWar(t) || (this.dip.overlord[t])) continue;
        let side = null, p = 0;
        for (const s of ['A', 'D']) {
          const other = s === 'A' ? 'D' : 'A';
          if (w[other].some(x => this.isAllied(t, x))) continue;
          const allied = w[s].some(x => this.isAllied(t, x));
          const kin = this.govCode && this.govCode(t) === this.govCode(s === 'A' ? w.leaderA : w.leaderD) &&
            ['communist', 'democracy', 'dictatorship'].includes(this.govCode(t)) && this.govCode(t) !== this.govCode(other === 'A' ? w.leaderA : w.leaderD);
          const hate = w[other].some(x => this.isRival(t, x) || this.isRival(x, t));
          const q = (allied ? 0.15 : 0) + (kin ? 0.025 : 0) + (hate ? 0.04 : 0);
          if (q > p) { p = q; side = s; }
        }
        if (side && this.rng.chance(p)) {
          w[side].push(t);
          for (const v of this._subjects ? this._subjects(t) : []) if (!this._side(w, v)) w[side].push(v);
          if (w.world && great(this, t)) this.log('war', `${this.states[t].name} enters ${w.name} on the side of ${this.states[side === 'A' ? w.leaderA : w.leaderD].name}.`, { states: [t], major: true, war: w.id });
        }
      }
      if (!w.world) this._makeWorldWar(w);
      // total war: everyone pays
      if (w.world) {
        for (const t of [...w.A, ...w.D]) for (const pid of this.provsOf[t] || []) this.pop[pid] *= 0.996;
        for (const b of w.battles) if (b.t > this.t - 12) this.pop[b.pid] *= 0.97;
      }
    }
  };

  // world wars do not end early: no peace before the losing side is beaten or exhausted
  const warMonth = P._warMonth;
  P._warMonth = function (w) {
    if (w.world && this.t - w.start < 36 && Math.abs(w.ws) < 70) {
      w._hold = true;
      const r = warMonth.call(this, w);
      w._hold = false;
      return r;
    }
    return warMonth.call(this, w);
  };
  const peace = P._peace;
  P._peace = function (w, winner, how) {
    if (w._hold && how !== 'collapse') return;          // too early: the war goes on
    if (!w.world) return peace.call(this, w, winner, how);
    const winSide = winner === 'A' ? w.A.slice() : winner === 'D' ? w.D.slice() : [];
    const loseSide = winner === 'A' ? w.D.slice() : winner === 'D' ? w.A.slice() : [];
    // every occupied town of a loser goes to the winner who holds it (the leader's share is settled below)
    const gainedBy = {};
    if (winner) for (const [pid, by] of Object.entries(this.ctrl)) {
      const p = +pid, own = this.owner[p];
      if (!winSide.includes(by) || !loseSide.includes(own) || own === (winner === 'A' ? w.leaderD : w.leaderA)) continue;
      if (p === this.capitalOf[own]) continue;
      (gainedBy[by] = gainedBy[by] || []).push(p);
    }
    peace.call(this, w, winner, how);
    this._lastWorldWarEnd = this.t;
    const moved = [];
    for (const [to, ps] of Object.entries(gainedBy)) for (const p of ps.slice(0, 6)) if (this.owner[p] !== to && this._statePop[to]) { this._transfer(p, to, w); moved.push(p); }
    if (winner) {
      const place = this._capitalProv(winner === 'A' ? w.leaderA : w.leaderD);
      this.log('peace', `The Conference of ${place ? place.name : 'the victors'} ends ${w.name}. The victors redraw the map${moved.length ? `: ${moved.length} more provinces change hands` : ''}.`,
        { states: [...w.A, ...w.D], major: true, war: w.id });
      // the losers' regimes rarely survive defeat
      for (const t of loseSide) {
        if (!this._statePop[t] || !great(this, t)) continue;
        const st = this.states[t], r = this.chars.get(st.ruler);
        const roll = this.rng.next();
        if (st.government === 'monarchy' && roll < 0.55 && this._becomeRepublic) this._becomeRepublic(t, r);
        else if (roll < 0.25 && this._redRevolution && this.devs.socialism && st.ideology !== 'communist') this._redRevolution(t);
        else if (['dictatorship'].includes(st.government) && roll < 0.8 && this._toDemocracy) this._toDemocracy(t, `With ${w.name} lost, the regime of ${st.name} falls; the victors oversee free elections.`);
      }
      if (!this._league) {
        this._league = this.year();
        this.log('league', `Never again, the victors say, and found a League of Nations in ${place ? place.name : 'a neutral city'} to keep the peace for ever.`, { states: winSide, major: true });
      }
      this.peaceUntil = this.t + 12 * 15;
    }
  };

  // after a world war, the world is tired of war for a while
  const declare = P._declareWars;
  P._declareWars = function () {
    if (this.peaceUntil && this.t < this.peaceUntil && !this.rng.chance(0.4)) return;
    return declare.call(this);
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyWorldWars();
  };
})(typeof window !== 'undefined' ? window : globalThis);
