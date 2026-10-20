// Society changes too. With printing, factories, medicine and republics, faith slowly loses its hold:
// fewer conversions, less religious strife, fewer holy wars, and in the end people who believe in nothing
// in particular. Prince-bishoprics are secularised. But not in every timeline, and not for ever: a great
// revival or a revolution of the faithful can turn it back. Also: the sillier side of history.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const NONE = 'irreligious';

  P._initSociety = function () {
    const W = this.world;
    if (!W.religions[NONE]) W.religions[NONE] = { name: 'Nonreligious', group: 'none', color: '#d8d2c2' };
    if (this.relIndex[NONE] == null) { this.relIndex[NONE] = this.relKeys.length; this.relKeys.push(NONE); }
    this.secular = {};
    this.secHist = [];
    // how strongly this timeline turns away from the churches (around 1; sometimes hardly at all)
    const m = new root.Rng(this.seed + '|mood').normal(1, 0.4);
    this.secularMood = Math.max(0.15, Math.min(1.7, m)) * (this.cfg.secularisation ?? 1);
  };

  P.secularOf = function (t) { return this.secular[t] || 0; };
  P.secularAt = function (t, year) {
    let best = null;
    for (const h of this.secHist) if (h.year <= year) best = h; else break;
    return best ? best.s[t] || 0 : 0;
  };

  P._yearlySociety = function () {
    const y = this.year();
    if (y < 1600) return;
    const share = k => t => (this.devs[k] ? this.share(k, t) : 0);
    const snap = {};
    for (const [t, st] of Object.entries(this.states)) {
      if (!this._statePop[t]) continue;
      let target = 0.12 * share('printing')(t) + 0.3 * share('industry')(t) + 0.25 * share('medicine')(t) +
        (st.modernRepublic ? 0.12 : 0) + (st.constitution ? 0.05 : 0) + Math.max(0, (this.techOf(t).adm - 6) * 0.02);
      if (st.government === 'theocracy' || st.revival > y) target *= 0.2;
      target = Math.min(0.95, target * this.secularMood);
      const s = this.secular[t] || 0;
      this.secular[t] = s + (target - s) * 0.03;
      if (this.secular[t] > 0.01) snap[t] = Math.round(this.secular[t] * 100) / 100;
    }
    this.secHist.push({ year: y, s: snap });
    // people who believe in nothing in particular
    if (y >= 1860) {
      const none = this.relIndex[NONE];
      for (const p of this.world.provinces) {
        const o = this.owner[p.id];
        const s = o ? this.secular[o] || 0 : 0;
        if (s > 0.45 && this.rel[p.id] !== none && this.rng.chance((s - 0.4) * 0.012)) this.rel[p.id] = none;
      }
    }
    // the prince-bishops lose their lands
    if (this.devs.revolution && y > 1780) for (const [t, st] of Object.entries(this.states)) {
      if (st.government !== 'theocracy' || t === 'PAP' || !this._statePop[t] || !this.rng.chance(0.01 * this.secularMood)) continue;
      st.government = 'monarchy'; st.succession = 'primogeniture';
      this.stateInfo[t].government = 'monarchy'; this.stateInfo[t].succession = 'primogeniture';
      st.secularised = y;
      const c = this._generateRuler(t, { age: this.rng.int(30, 50) });
      this.log('secular', `The prince-bishopric of ${st.name} is secularised: the bishop keeps his mitre, a duke gets his lands.`, { states: [t], major: (this._statePop[t] || 0) > 5e5 });
      this._setRuler(t, c, { how: 'given the secularised lands' });
    }
    // and sometimes the tide turns
    if (y > 1700 && this.rng.chance(0.004 * (this.cfg.catastrophes ?? 1))) this._revival();
  };

  P._revival = function (tag) {
    const c = Object.keys(this.states).filter(t => (this._statePop[t] || 0) > 1e6 && (tag ? t === tag : true));
    const t = tag || (c.length && this.rng.weighted(c, x => 0.2 + (this.secular[x] || 0)));
    if (!t) return false;
    const st = this.states[t], y = this.year();
    st.revival = y + 40;
    this.secular[t] = (this.secular[t] || 0) * 0.3;
    // back to the old faith
    const faith = st.religion === NONE ? this.world.states[t] && this.world.states[t].religion || 'catholic' : st.religion;
    for (const pid of this.provsOf[t] || []) if (this.religionOf(pid) === NONE && this.rng.chance(0.6)) this.rel[pid] = this.relIndex[faith];
    // after 1900 the faithful may take power themselves
    if (y > 1900 && st.government !== 'theocracy' && this.rng.chance(0.35)) {
      st.government = 'theocracy'; st.succession = 'theocracy'; st.modernRepublic = false;
      this.stateInfo[t].government = 'theocracy'; this.stateInfo[t].succession = 'theocracy';
      const c = this._generateRuler(t, { age: this.rng.int(55, 75) });
      c.cleric = true;
      this.log('revival', `A revolution of the faithful in ${st.name}: the clerics take power and rule in the name of God.`, { states: [t], major: true });
      this._setRuler(t, c, { how: 'chosen by the clerics' });
    } else {
      this.log('revival', `A great religious revival sweeps ${st.name}: preachers fill the fields, and the churches fill again.`, { states: [t], major: true });
    }
    return true;
  };

  // ---------------- the sillier side of history ----------------
  const QUIRKS = [
    { w: 1, ok: () => true, text: (s, r, cap) => `A comet over ${cap}. The astrologers of ${s} predict the end of the world for the following Tuesday. Tuesday comes and goes.` },
    { w: 1, ok: (sim, t) => sim.states[t].government === 'monarchy', text: (s, r) => `The court of ${s} spends an entire year arguing about the shape of ${r}'s new crown.` },
    { w: 0.6, ok: (sim, t, y) => y < 1700, text: (s, r, cap) => `A dancing plague breaks out in ${cap}: hundreds dance in the streets for weeks and nobody knows why.`, fx: (sim, t) => { const c = sim.capitalOf[t]; sim.pop[c] *= 0.998; } },
    { w: 2, ok: (sim, t, y, r) => r && r.traits.includes('mad'), text: (s, r) => `${r} of ${s} appoints his favourite horse to the royal council. The horse is said to be the wisest member.` },
    { w: 2, ok: (sim, t, y, r) => r && r.traits.includes('mad'), text: (s, r) => `${r} of ${s} declares war on the sea and has the waves whipped for disobedience. The sea does not reply.` },
    { w: 1.5, ok: (sim, t, y, r) => r && r.traits.includes('mad'), text: (s, r) => `${r} of ${s} forbids the colour yellow throughout the realm. Lemons are confiscated.` },
    { w: 1, ok: (sim, t, y, r) => r && (r.traits.includes('extravagant') || r.traits.includes('greedy')), text: (s, r) => `${r} of ${s} commissions a portrait of himself twice as tall as the palace door. The door is widened.`, fx: (sim, t) => { sim.treasury[t] -= 30; } },
    { w: 2, ok: (sim, t, y) => ['netherlandish', 'low_german'].includes((sim.world.cultures[sim.states[t].culture] || {}).group) && y > 1580 && y < 1800, text: s => `Tulip mania in ${s}: a single bulb sells for the price of a canal house. The next spring, the market collapses.`, fx: (sim, t) => { sim.treasury[t] = (sim.treasury[t] || 0) * 0.6; } },
    { w: 1, ok: (sim, t, y) => ['high_german', 'low_german', 'netherlandish', 'west_slavic'].includes((sim.world.cultures[sim.states[t].culture] || {}).group), text: s => `A great beer shortage in ${s}. The council declares a state of emergency; riots are narrowly avoided.` },
    { w: 0.8, ok: (sim, t, y) => y > 1650 && y < 1800, text: s => `The learned men of ${s} debate for nine days whether the potato is poisonous. The potato wins.` },
    { w: 1, ok: (sim, t, y) => y > 1850, text: (s, r, cap) => `The people of ${cap} vote on a new name for their main bridge. The winning name is so rude that the vote is annulled.` },
    { w: 2, ok: (sim, t, y) => y > 1900 && (sim.provsOf[t] || []).some(p => sim.prov[p].lonlat[0] > 112 && sim.prov[p].lonlat[1] < -18), text: s => `The army of ${s} goes to war against the emus of the southern continent, with machine guns. The emus win.` },
    { w: 1, ok: (sim, t, y) => y > 1950 && sim.isNuclear && sim.isNuclear(t), text: s => `${s} sends a dog into the heavens on a rocket. The dog is declared a national hero.` },
    { w: 0.7, ok: (sim, t, y, r) => r && sim.age(r) < 12 && sim.states[t].government === 'monarchy', text: (s, r) => `The child ruler ${r} of ${s} issues his first decree: lessons are abolished. His regent annuls it the same day.` },
  ];
  const FUNNY_DEATHS = ['a surfeit of lampreys', 'laughing too hard at {his} own joke', 'a fall down the palace stairs while fleeing a goose',
    'a cannon that burst at {his} own celebration', 'eating too many melons', 'a wedding feast that lasted nine days', 'wounds from a duel over a poem',
    'the excitement of finally winning at chess', 'a bee sting during {his} own victory parade', 'tripping over {his} own ceremonial sword'];
  const MAD_DEATHS = ['trying to fly from the cathedral tower', 'a quarrel with a bear {he} had made a duke', 'drinking a potion that was to make {him} immortal'];

  P._yearlyQuirks = function () {
    if (!this.rng.chance(0.045)) return;
    const y = this.year();
    const big = Object.keys(this.states).filter(t => (this._statePop[t] || 0) > 8e5);
    if (!big.length) return;
    const t = this.rng.pick(big), st = this.states[t];
    const rc = this.chars.get(st.ruler);
    // the same curiosity is not told twice within a century and a half
    this._quirkSeen = this._quirkSeen || {};
    const ok = QUIRKS.filter((q, i) => q.ok(this, t, y, rc) && !(this._quirkSeen[i] > y - 150));
    if (!ok.length) return;
    const q = this.rng.weighted(ok, x => x.w);
    this._quirkSeen[QUIRKS.indexOf(q)] = y;
    const cap = this.capitalOf[t] != null ? this.prov[this.capitalOf[t]].name : st.name;
    let text = q.text(st.name, rc ? this.nameIn(rc, t) : 'the ruler', cap);
    if (rc && rc.sex === 'f') text = text.replace(/\bhis\b/g, 'her').replace(/\bhimself\b/g, 'herself');
    if (q.fx) q.fx(this, t);
    this.log('curiosity', text, { states: [t], chars: rc ? [rc.id] : [], major: true });
  };

  // a few rulers leave the world in a way the chroniclers enjoy writing down
  const die = Sim.prototype._die;
  Sim.prototype._die = function (c, cause) {
    if (c && c.titles && c.titles.length && this.alive(c) && this.rng && ['natural causes', 'illness', 'a fever', 'old age', 'a stroke', 'gout', 'a hunting accident'].includes(cause)) {
      const mad = c.traits.includes('mad');
      if (this.rng.chance(mad ? 0.12 : 0.004)) {
        const list = mad && this.rng.chance(0.6) ? MAD_DEATHS : FUNNY_DEATHS;
        const f = c.sex === 'f';
        cause = this.rng.pick(list).replace(/\{his\}/g, f ? 'her' : 'his').replace(/\{he\}/g, f ? 'she' : 'he').replace(/\{him\}/g, f ? 'her' : 'him');
      }
    }
    // a conqueror who dies young: his generals divide what he took (as after Alexander)
    const conq = c && c.conqueror && this.alive(c) && c.titles.length ? c.titles[0] : null;
    const age = c ? this.age(c) : 99;
    die.call(this, c, cause);
    if (conq && this._collapse && age < 50 && this.states[conq] && !this.states[conq].destroyed) {
      const now = (this.provsOf[conq] || []).length, start = c.conquerorStart || now;
      if (now >= Math.max(8, start * 1.4) && this.rng.chance(0.65)) {
        this.wild.lastCollapse[conq] = 0;
        this._collapse(conq, `${this.fullName(c)} is dead at ${Math.floor(age)}, and no one can hold what ${c.sex === 'f' ? 'she' : 'he'} built: the generals divide the empire among themselves.`);
      }
    }
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlySociety();
    this._yearlyQuirks();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initSociety();
  };
})(typeof window !== 'undefined' ? window : globalThis);
