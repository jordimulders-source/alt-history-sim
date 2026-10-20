// The hand of fate: what the observer can change. Every intervention is stored with the seed and
// applied at its moment while the timeline is written again from 1444, so history stays reproducible:
// the same seed with the same interventions always gives the same world.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  const base = P._applyIntervention;
  P._applyIntervention = function (iv) {
    if (['kill', 'heir', 'trait'].includes(iv.type)) return base.call(this, iv);
    const st = iv.state && this.states[iv.state];
    if (iv.state && (!st || !this._statePop[iv.state])) return;   // the realm is gone in this version of history
    const r = st && this.chars.get(st.ruler);
    // the hand of fate is written down first, then what follows from it (taken back if nothing happens)
    const mark = this.events.length;
    this.log('intervention', iv.text || 'The hand of fate intervenes.', { states: [iv.state, iv.target].filter(Boolean), chars: iv.char ? [iv.char] : [], major: true });
    let ok = true;
    if (iv.type === 'gift' || iv.type === 'madness') {
      const c = this.chars.get(iv.char);
      if (!c || !this.alive(c)) { this.events.splice(mark, 1); return; }
      if (iv.type === 'gift') c[iv.stat] = Math.min(8, Math.max(c[iv.stat], 4) + 3);
      else { if (!c.traits.includes('mad')) c.traits.push('mad'); c.adm = Math.max(0, c.adm - 2); c.dip = Math.max(0, c.dip - 2); }
    } else if (iv.type === 'war') {
      ok = this._fateWar(iv.state, iv.target);
    } else if (iv.type === 'peace') {
      const ws = this.wars.filter(w => w.end == null && (w.leaderA === iv.state || w.leaderD === iv.state));
      for (const w of ws) this._peace(w, null, 'white');
      ok = ws.length > 0;
    } else if (iv.type === 'plague') {
      ok = this._fatePlague(this.capitalOf[iv.state]);
    } else if (iv.type === 'invent') {
      ok = this._fateInvent(iv.state, iv.dev);
    } else if (iv.type === 'revolution') {
      ok = !!this._becomeRepublic && st.government === 'monarchy';
      if (ok) this._becomeRepublic(iv.state, r);
    } else if (iv.type === 'gold') {
      const inc = this.econ && this.econ[iv.state] ? this.econ[iv.state].tax + this.econ[iv.state].trade : 50;
      this.treasury[iv.state] = (this.treasury[iv.state] || 0) + inc * 6 + 200;
      this.bankrupt[iv.state] = 0;
      this.funding[iv.state] = 1;
    } else if (iv.type === 'revolt') {
      ok = this._fateRevolt(iv.state);
    } else if (iv.type === 'unite') {
      ok = this._fateUnite(iv.state);
    } else if (iv.type === 'disaster') {
      ok = this._fateDisaster(iv.state, iv.kind);
    } else if (iv.type === 'legend') {
      ok = this._fateLegend(iv.state, iv.legend);
    } else if (iv.type === 'conqueror') {
      ok = this._riseConqueror(iv.state);
    } else if (iv.type === 'collapse') {
      this.events.splice(mark, 1);
      ok = this._collapse(iv.state, `By the hand of fate, ${st.name} falls apart.`);
      return;
    } else if (iv.type === 'golden') {
      st.golden = 0;
      ok = this._goldenAge(iv.state);
    } else if (iv.type === 'voyage') {
      st.voyager = true;
      this.explore[iv.state] = (this.explore[iv.state] || 0) + 3;
    } else if (iv.type === 'convert') {
      ok = this._fateConvert(iv.state, iv.faith);
    }
    if (!ok) this.events.splice(mark, 1);
  };

  // ---------------- disasters ----------------
  P._fateDisaster = function (tag, kind) {
    const cap = this.capitalOf[tag];
    const provs = this.provsOf[tag] || [];
    const hit = (pid, m) => { this.pop[pid] *= 1 - m; if (this.unrest) this.unrest[pid] = Math.min(100, this.unrest[pid] + 15); };
    const inc = this.econ && this.econ[tag] ? this.econ[tag].tax + this.econ[tag].trade : 30;
    if (kind === 'earthquake') {
      hit(cap, 0.12 + this.rng.next() * 0.1);
      for (const q of this.pAdj[cap]) if (this.owner[q] === tag) hit(q, 0.05);
      this.treasury[tag] -= inc * 2;
    } else if (kind === 'flood') {
      for (const pid of provs) if (this.prov[pid].terrain === 'farmland' || this.prov[pid].coastal) if (this.rng.chance(0.5)) hit(pid, 0.03 + this.rng.next() * 0.05);
    } else if (kind === 'fire') {
      hit(cap, 0.05);
      this.treasury[tag] -= inc * 3;
    } else if (kind === 'locusts') {
      for (const pid of provs) if (this.prov[pid].terrain !== 'tundra') hit(pid, 0.03 + this.rng.next() * 0.04);
    } else if (kind === 'pestilence') {
      return this._pandemic(tag);
    } else if (kind === 'volcano') {
      return this._volcanicWinter();
    } else return false;
    return true;
  };

  // ---------------- legends return ----------------
  const LEGENDS = {
    alexander: { name: 'Alexander', dynasty: 'Argead', sex: 'm', age: 22, adm: 6, dip: 6, mil: 8, traits: ['ambitious', 'brave', 'charismatic'], conqueror: true },
    caesar: { name: 'Gaius Julius', dynasty: 'Caesar', sex: 'm', age: 40, adm: 7, dip: 6, mil: 8, traits: ['ambitious', 'cunning', 'charismatic'], conqueror: true },
    charlemagne: { name: 'Charles', dynasty: 'Carolingian', sex: 'm', age: 30, adm: 7, dip: 5, mil: 7, traits: ['pious', 'diligent', 'robust'], conqueror: true },
    genghis: { name: 'Temüjin', dynasty: 'Borjigin', sex: 'm', age: 35, adm: 6, dip: 4, mil: 8, traits: ['wrathful', 'ambitious', 'robust'], conqueror: true },
    timur: { name: 'Timur', dynasty: 'Barlas', sex: 'm', age: 34, adm: 4, dip: 3, mil: 8, traits: ['cruel', 'ambitious', 'martial'], conqueror: true },
    saladin: { name: 'Salah ad-Din', dynasty: 'Ayyubid', sex: 'm', age: 35, adm: 6, dip: 7, mil: 7, traits: ['just', 'generous', 'pious'] },
    cleopatra: { name: 'Cleopatra', dynasty: 'Ptolemaic', sex: 'f', age: 22, adm: 6, dip: 8, mil: 3, traits: ['charismatic', 'cunning', 'ambitious'] },
    ashoka: { name: 'Ashoka', dynasty: 'Maurya', sex: 'm', age: 30, adm: 8, dip: 6, mil: 5, traits: ['kind', 'pious', 'diligent'] },
    qin: { name: 'Ying Zheng', dynasty: 'Qin', sex: 'm', age: 25, adm: 8, dip: 3, mil: 6, traits: ['paranoid', 'ambitious', 'diligent'] },
    musa: { name: 'Musa', dynasty: 'Keita', sex: 'm', age: 32, adm: 7, dip: 7, mil: 3, traits: ['generous', 'pious', 'extravagant'], gold: true },
    joan: { name: 'Joan', dynasty: 'of Arc', sex: 'f', age: 19, adm: 3, dip: 5, mil: 7, traits: ['zealous', 'brave', 'pious'] },
    elizabeth: { name: 'Elizabeth', dynasty: 'Tudor', sex: 'f', age: 25, adm: 7, dip: 8, mil: 4, traits: ['cunning', 'chaste', 'diligent'] },
    suleiman: { name: 'Suleiman', dynasty: 'Osman', sex: 'm', age: 26, adm: 8, dip: 6, mil: 7, traits: ['just', 'ambitious', 'scholarly'] },
    akbar: { name: 'Akbar', dynasty: 'Timurid', sex: 'm', age: 20, adm: 8, dip: 7, mil: 6, traits: ['just', 'cynical', 'scholarly'] },
    peter: { name: 'Pyotr', dynasty: 'Romanov', sex: 'm', age: 24, adm: 8, dip: 4, mil: 6, traits: ['wrathful', 'diligent', 'robust'] },
    catherine: { name: 'Catherine', dynasty: 'Anhalt-Zerbst', sex: 'f', age: 33, adm: 7, dip: 7, mil: 5, traits: ['ambitious', 'lustful', 'scholarly'] },
    napoleon: { name: 'Napoleon', dynasty: 'Bonaparte', sex: 'm', age: 30, adm: 7, dip: 5, mil: 8, traits: ['ambitious', 'brave', 'diligent'], conqueror: true },
  };
  Sim.LEGENDS = LEGENDS;
  P._fateLegend = function (tag, key) {
    const L = LEGENDS[key], st = this.states[tag];
    if (!L) return false;
    const old = this.chars.get(st.ruler);
    const c = this._newChar({
      name: L.name, sex: L.sex, born: this.t - L.age * 12, dynasty: L.dynasty, culture: st.culture, religion: st.religion,
      traits: L.traits.slice(), adm: L.adm, dip: L.dip, mil: L.mil, home: tag,
    });
    c.legend = key;
    if (L.conqueror) c.conqueror = true;
    if (st.government === 'republic') c.republican = true;
    if (old && this.alive(old) && this._addClaim) this._addClaim(tag, old, 0.5, 'pushed aside by a legend');
    this._setRuler(tag, c, { how: 'returned from the pages of history' });
    c.regnalName = L.name; c.regnalByTag = { [tag]: L.name };
    if (L.gold) this.treasury[tag] = (this.treasury[tag] || 0) + 2000;
    if (L.conqueror && this.army) this.army[tag] = Math.max(this.army[tag] || 0, this.maxArmy(tag));
    return true;
  };

  // ---------------- conversion ----------------
  P._fateConvert = function (tag, faith) {
    const st = this.states[tag];
    if (!faith || st.religion === faith || this.relIndex[faith] == null) return false;
    st.religion = faith;
    this.stateInfo[tag].religion = faith;
    const r = this.chars.get(st.ruler);
    if (r) r.religion = faith;
    const cap = this.capitalOf[tag];
    for (const pid of this.provsOf[tag] || []) if (pid === cap || this.rng.chance(0.35)) this.rel[pid] = this.relIndex[faith];
    return true;
  };

  // a war nobody planned
  P._fateWar = function (a, d) {
    if (!this.states[d] || !this._statePop[d] || a === d) return false;
    if (this.wars.some(w => w.end == null && ((w.A.includes(a) && w.D.includes(d)) || (w.A.includes(d) && w.D.includes(a))))) return false;
    if (this.chars.get(this.states[a].ruler) === this.chars.get(this.states[d].ruler)) return false;
    const goal = (this._conquestGoal && this._conquestGoal(a, d)) || { type: 'humiliate' };
    this.truces && this.truces.delete && this.truces.delete([a, d].sort().join('|'));
    this._startWar(a, d, goal, null);
    return true;
  };

  P._fatePlague = function (pid) {
    const pl = this.plague;
    if (pid == null || !pl || pl.active.has(pid)) return false;
    const y = this.year();
    const ob = { id: pl.outbreaks.length + 1, start: y, origin: pid, dead: 0, provs: 0, reached: new Set(), end: null };
    pl.outbreaks.push(ob);
    pl.immune.delete(pid);
    pl.active.set(pid, { left: 3, ob: ob.id });
    pl.gen.set(pid, 0);
    return true;
  };

  const DEV_TEXT = {
    printing: (p, s) => `In ${p}, a craftsman of ${s} prints books with movable type, decades before anyone thought possible.`,
    gunpowder: (p, s) => `The gunfounders of ${p} cast great bombards for ${s}: no castle wall is safe any more.`,
    industry: (p, s) => `In ${p} the first steam engines drive looms and pumps: ${s} begins to industrialise.`,
    medicine: (p, s) => `Physicians of ${s} in ${p} prove that germs spread disease. Vaccines and clean water follow.`,
  };
  P._fateInvent = function (tag, dev) {
    if (!this.devs || this.devs[dev] || !DEV_TEXT[dev]) return false;
    const pid = this.capitalOf[tag];
    if (pid == null) return false;
    this.devs[dev] = { year: this.year(), origin: pid, by: tag, adopted: new Set(this.provsOf[tag] || [pid]) };
    this.log('invention', DEV_TEXT[dev](this.prov[pid].name, this.states[tag].name), { states: [tag], major: true, pid });
    return true;
  };

  // the largest foreign people in the realm rises; if there is none, the peasants do
  P._fateRevolt = function (tag) {
    const st = this.states[tag];
    const groups = {};
    for (const pid of this.provsOf[tag] || []) {
      if (pid === this.capitalOf[tag]) continue;
      const c = this.cultureOf(pid);
      if (c === st.culture) continue;
      (groups[c] = groups[c] || []).push(pid);
    }
    const best = Object.entries(groups).map(([c, ps]) => [c, this._connected(ps)]).sort((a, b) => b[1].length - a[1].length)[0];
    if (best && best[1].length >= 1) { this._separatists(tag, best[0], best[1]); return true; }
    // a peasant rising
    const ps = (this.provsOf[tag] || []).filter(p => p !== this.capitalOf[tag]);
    if (!ps.length) return false;
    for (const p of ps) this.unrest[p] = Math.min(100, this.unrest[p] + 30);
    return true;
  };

  // realms of the same people agree to become one (the smaller ones join the largest)
  P._fateUnite = function (tag) {
    const st = this.states[tag];
    const g = (this.world.cultures[st.culture] || {}).group || st.culture;
    const kin = Object.keys(this.states).filter(t => t !== tag && this._statePop[t] && !this._inWar(t) &&
      ((this.world.cultures[this.states[t].culture] || {}).group || this.states[t].culture) === g &&
      (this._statePop[t] || 0) < (this._statePop[tag] || 0) && (!this.borders || !this.borders[tag] || this.borders[tag].has(t)));
    if (!kin.length) return false;
    for (const t of kin) {
      this.log('unification', `${this.states[t].name} joins ${st.name}.`, { states: [tag, t], major: true });
      for (const pid of (this.provsOf[t] || []).slice()) this._transfer(pid, tag, null);
    }
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
