// Milestone 2: royal houses, marriage politics, claims, succession crises and personal unions.
// Adds methods to Sim (loaded after sim.js). All randomness still goes through this.rng.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  // ---------------- royal houses ----------------
  P._initDynasties = function () {
    this.dynasties = {};       // name -> {name, culture, members: [ids], prestige, crowns: {tag: months}}
    this.claims = [];          // {id, tag, char, from, to, strength, reason, endReason}
    this.crises = [];          // {id, tag, name, kind, from, to, claimants: [ids], winner, text}
    this.unions = [];          // {ruler, tags, from, to}
    this.ties = {};            // 'A|B' -> {n, last}: marriages between the ruling houses of two realms
    this.nextClaim = 1;
    this._statePop = {};
    for (const p of this.world.provinces) if (p.owner) this._statePop[p.owner] = (this._statePop[p.owner] || 0) + p.pop;
  };

  P._dynAdd = function (c) {
    if (!c.dynasty) return;
    let d = this.dynasties[c.dynasty];
    if (!d) d = this.dynasties[c.dynasty] = { name: c.dynasty, culture: c.culture, members: [], prestige: 0, crowns: {} };
    d.members.push(c.id);
  };

  P.dynasty = function (name) { return this.dynasties[name]; };

  // a house's standing: crowns it wears, weighted by the size of the realms
  P._yearlyPrestige = function () {
    for (const d of Object.values(this.dynasties)) d.prestige *= 0.96;
    for (const [tag, st] of Object.entries(this.states)) {
      const r = this.chars.get(st.ruler);
      if (!r || !r.dynasty || r.cleric || r.republican) continue;
      const d = this.dynasties[r.dynasty];
      if (!d) continue;
      d.prestige += Math.sqrt((this._statePop[tag] || 1e5) / 1e6) * 2;
      d.crowns[tag] = (d.crowns[tag] || 0) + 12;
    }
  };

  P.prestigeOf = function (c) {
    const d = c && c.dynasty && this.dynasties[c.dynasty];
    return d ? d.prestige : 0;
  };

  P._afterInit = function () {
    for (const st of Object.values(this.states)) {
      const r = this.chars.get(st.ruler);
      if (r && r.titles.length > 1) this._unionCheck(r);
    }
  };

  // ---------------- the yearly round ----------------
  P._yearly = function () {
    this._yearlyPrestige();
    this._bastards();
    this._regentCoups();
    this._pressClaims();
    this._endClaims();
  };

  // ---------------- marriage politics ----------------
  // Replaces the simple marriage of milestone 1: parents look for the best match among the ruling houses.
  P._marriage = function (c, months = 1) {
    if (c.spouse && this.alive(this.chars.get(c.spouse))) return;
    if (c.cleric || c.royal > 1) return;
    const a = this.age(c);
    const min = c.sex === 'f' ? 15 : 17;
    if (a < min || a > (c.sex === 'f' ? 40 : 58)) return;
    // a quick first roll with the highest chance, the exact one only when it might succeed
    let p = (c.titles.length ? 0.6 : 0.5) / 12 * months;
    if (c.spouse) p *= 0.6;                         // widowed
    if (a > 30 && !c.titles.length) p *= 0.5;
    const roll = this.rng.next();
    if (roll >= p) return;
    const isHeir = this._isHeirApparent(c);
    if (!c.titles.length && !isHeir && roll >= p * 0.6) return;

    const relGroup = r => (this.world.religions[r] || {}).group || r;
    if (!this._marriagePool) {
      this._marriagePool = [...this.living].filter(o => !o.cleric && !o.republican && o.royal <= 1 &&
        !(o.spouse && this.alive(this.chars.get(o.spouse))));
    }
    const myRealms = this._familyRealms(c);
    const myPrestige = this.prestigeOf(c);
    const cands = [];
    for (const o of this._marriagePool) {
      if (!this.alive(o) || o.sex === c.sex || o.cleric || o.royal > 1) continue;
      if (o.spouse && this.alive(this.chars.get(o.spouse))) continue;
      if (o.dynasty && o.dynasty === c.dynasty) continue;
      const oa = this.age(o);
      if (oa < (o.sex === 'f' ? 15 : 17) || Math.abs(oa - a) > 14) continue;
      // the same church; across the Catholic-Orthodox divide only now and then
      if (o.religion !== c.religion && (relGroup(o.religion) !== relGroup(c.religion) || !this.rng.chance(0.08))) continue;
      if (!this._nearChars(c, o, 1400)) continue;
      if (this._closeKin(c, o)) continue;
      cands.push(o);
    }
    // heirs and kings marry into ruling houses; younger children often marry the local nobility
    const royalBias = Math.min(0.95, (this.cfg.royal_marriages ?? 0.55) + (c.titles.length || isHeir ? 0.3 : 0));
    let sp = null;
    if (cands.length && this.rng.chance(royalBias)) {
      sp = this.rng.weighted(cands, o => {
        const theirRealms = this._familyRealms(o);
        let w = 1 + this.prestigeOf(o) / 25;                           // a great house is a great match
        let realm = 0;
        for (const x of theirRealms) realm = Math.max(realm, this._statePop ? (this._statePop[x] || 0) : 0);
        w *= 0.3 + Math.sqrt(realm / 1e6);                            // ...and a great realm even more
        if (o.titles.length) w *= 3;
        if (this._isHeirApparent(o)) w *= 2.5;
        if (o.culture === c.culture) w *= 1.6;
        // an old alliance is renewed more readily
        for (const x of myRealms) for (const y of theirRealms) if (this._tie(x, y)) w *= 1.4;
        w /= 1 + Math.abs(this.age(o) - a) * 0.15;
        w *= Math.exp(-this._charDist(c, o) / 500);                 // neighbours marry neighbours
        if (this.prestigeOf(o) < myPrestige * 0.1) w *= 0.6;        // marrying down
        return w;
      });
    }
    if (!sp) {
      const cul = c.culture;
      sp = this._newChar({
        name: null, sex: c.sex === 'm' ? 'f' : 'm',
        born: this.t - Math.max(15, Math.round(a + this.rng.normal(c.sex === 'm' ? -6 : 4, 4))) * 12,
        dynasty: this._newDynastyName(cul), culture: cul, religion: c.religion, home: c.titles[0] || c.home,
      });
      sp.name = this._pickName(sp, cul);
    }
    this._wed(c, sp);
    this._logMarriage(c, sp);
  };

  P._isHeirApparent = function (c) {
    // cached for the current month (asked many times while matchmaking)
    if (this._heirCacheT !== this.t) { this._heirCacheT = this.t; this._heirCache = new Map(); }
    if (this._heirCache.has(c.id)) return this._heirCache.get(c.id);
    const v = this._isHeirApparentRaw(c);
    this._heirCache.set(c.id, v);
    return v;
  };

  P._isHeirApparentRaw = function (c) {
    const fa = c.father && this.chars.get(c.father), mo = c.mother && this.chars.get(c.mother);
    for (const parent of [fa, mo]) {
      if (!parent || !parent.titles.length) continue;
      for (const tag of parent.titles) {
        const st = this.states[tag];
        if (!['primogeniture', 'salic', 'elective'].includes(st.succession)) continue;
        const line = this._lineOfSuccession(parent, st.succession === 'salic' ? 'salic' : 'primogeniture', 1);
        if (line[0] === c) return true;
      }
    }
    return false;
  };

  // realms ruled by a person or their parents (the families that make the match)
  P._familyRealms = function (c) {
    const out = new Set(c.titles);
    for (const p of [c.father, c.mother]) {
      const pc = p && this.chars.get(p);
      if (pc) for (const t of pc.titles) out.add(t);
    }
    return [...out];
  };

  P._charDist = function (a, b) {
    const pa = (a.titles.length ? a.titles : this._homeTags(a)).map(t => this._capital(t)).filter(Boolean);
    const pb = (b.titles.length ? b.titles : this._homeTags(b)).map(t => this._capital(t)).filter(Boolean);
    let d = 1500;
    for (const x of pa) for (const y of pb) d = Math.min(d, this._dist(x.lonlat, y.lonlat));
    return d;
  };

  P._tie = function (a, b) { return this.ties[a < b ? a + '|' + b : b + '|' + a]; };

  P._logMarriage = function (c, sp) {
    const A = this._familyRealms(c), B = this._familyRealms(sp);
    const desc = x => {
      if (x.titles.length) return this.nameIn(x, x.titles[0]) + ' of ' + this.states[x.titles[0]].name;
      const parent = [x.father, x.mother].map(id => id && this.chars.get(id)).find(p => p && p.titles.length);
      if (parent) return `${x.name}, ${x.sex === 'm' ? 'son' : 'daughter'} of ${this.nameIn(parent, parent.titles[0])} of ${this.states[parent.titles[0]].name}`;
      return x.name + (x.dynasty ? ' of ' + x.dynasty : '');
    };
    if (c.royal > 1 && sp.royal > 1) return;
    // a marriage between two ruling families binds their realms
    const bound = [];
    for (const x of A) for (const y of B) {
      if (x === y) continue;
      const k = x < y ? x + '|' + y : y + '|' + x;
      const t = this.ties[k] || (this.ties[k] = { n: 0, times: [] });
      t.n++; t.times.push(this.t);
      bound.push([x, y]);
    }
    const states = [...new Set([...A, ...B])];
    const major = !!(c.titles.length || sp.titles.length || (bound.length && (this._isHeirApparent(c) || this._isHeirApparent(sp))));
    let txt = `${desc(c)} marries ${desc(sp)}.`;
    if (bound.length && major) {
      const [x, y] = bound[0];
      txt += ` The marriage binds ${this.states[x].name} and ${this.states[y].name}.`;
    }
    this.log('marriage', txt, { states, chars: [c.id, sp.id], major });
  };

  // ---------------- natural children ----------------
  P._bastards = function () {
    for (const st of Object.values(this.states)) {
      const r = this.chars.get(st.ruler);
      if (!r || r.sex !== 'm' || r.cleric || r.republican) continue;
      const a = this.age(r);
      if (a < 18 || a > 60) continue;
      const p = r.traits.includes('lustful') ? 0.14 : r.traits.includes('chaste') || r.traits.includes('pious') ? 0.005 : 0.025;
      if (!this.rng.chance(p * (this.cfg.bastards ?? 1))) continue;
      const mother = this._newChar({
        name: null, sex: 'f', born: r.born + this.rng.int(60, 240), dynasty: this._newDynastyName(r.culture),
        culture: r.culture, religion: r.religion, home: st.tag,
      });
      mother.name = this._pickName(mother, r.culture);
      mother.royal = 9;
      const k = this._birth(r, mother, this.t, true);
      k.illegitimate = true;
      k.dynasty = null;          // natural children do not carry the royal house name...
      k.surname = r.dynasty;     // ...but everyone knows whose they are
    }
  };

  // when the legitimate line fails, a natural son may be legitimised
  P._legitimise = function (tag, dead) {
    const sons = dead.children.map(id => this.chars.get(id))
      .filter(k => k && this.alive(k) && k.illegitimate && k.sex === 'm' && this.age(k) >= 12);
    if (!sons.length || !this.rng.chance(0.6)) return null;
    const k = sons.sort((a, b) => a.born - b.born)[0];
    k.illegitimate = false;
    k.dynasty = dead.dynasty;
    if (k.dynasty) this._dynAdd(k);
    this.log('legitimised', `${k.name}, natural son of ${this.nameIn(dead, tag)}, is legitimised to save the line.`,
      { states: [tag], chars: [k.id, dead.id], major: true });
    return k;
  };

  // ---------------- claims ----------------
  P._addClaim = function (tag, char, strength, reason) {
    if (!char || !this.alive(char) || char.titles.includes(tag)) return;
    const have = this.claims.find(c => c.tag === tag && c.char === char.id && c.to == null);
    if (have) { have.strength = Math.max(have.strength, strength); return; }
    this.claims.push({ id: this.nextClaim++, tag, char: char.id, from: this.t, to: null, strength, reason });
  };

  P._endClaim = function (cl, why) {
    if (cl.to != null) return;
    cl.to = this.t;
    cl.endReason = why;
  };

  P._afterSuccession = function (tag, dead, heir, how, crisis) {
    const st = this.states[tag];
    // the new ruler's own claim is fulfilled
    for (const cl of this.claims) if (cl.tag === tag && cl.char === heir.id && cl.to == null) this._endClaim(cl, 'crowned');
    if (['republic', 'theocracy'].includes(st.succession) || ['republic', 'theocracy', 'order'].includes(st.government)) return;
    // those passed over keep a claim
    const law = st.succession;
    const blood = this._lineOfSuccession(dead, 'primogeniture', 6)
      .filter(x => x !== heir && !x.cleric && this._sameFaith(x, tag));
    let rank = 0;
    for (const x of blood) {
      if (rank >= 2) break;
      if (law === 'salic' && x.sex === 'f') continue;
      if (x.titles.includes(tag)) continue;
      const strength = (how === 'inherited' && law !== 'elective' ? 0.25 : 0.6) - rank * 0.2;
      if (strength <= 0.05) break;
      const reason = law === 'salic' && x.mother && !this._agnatic(x, dead) ? 'through the female line'
        : how === 'elected' ? 'passed over by the electors' : 'by blood';
      // under settled hereditary law, only a real dispute leaves claims behind
      if (how === 'inherited' && !crisis && rank === 0 && law !== 'elective' && this.rng.chance(0.75)) { rank++; continue; }
      this._addClaim(tag, x, strength, reason);
      rank++;
    }
    // Ottoman-style brothers who survived
    if (law === 'open') {
      for (const id of dead.children) {
        const k = this.chars.get(id);
        if (k && k !== heir && k.sex === 'm' && this.alive(k) && this.age(k) >= 14) this._addClaim(tag, k, 0.8, 'son of the late ruler');
      }
    }
    // a crisis gets a name and an entry in the history books
    if (crisis) {
      const claimants = this.claims.filter(c => c.tag === tag && c.to == null).map(c => c.char);
      const kind = how === 'claimed through the female line' ? 'female line'
        : how === 'legitimised' ? 'legitimacy' : law === 'open' ? 'brothers' : law === 'elective' ? 'election' : 'extinction';
      this.crises.push({
        id: this.crises.length + 1, tag, kind, from: this.t, to: this.t + 12 * this.rng.int(1, 4),
        name: `${st.name} succession crisis`, claimants: claimants.slice(0, 4), winner: heir.id,
      });
    }
  };

  P._agnatic = function (x, dead) {
    // is x related to dead only through men?
    let c = x;
    for (let i = 0; i < 6 && c; i++) {
      if (c.dynasty && c.dynasty === dead.dynasty) return true;
      c = c.father && this.chars.get(c.father);
    }
    return false;
  };

  // claimants who are already dead pass a weaker claim to their eldest child, once
  P._endClaims = function () {
    for (const cl of this.claims) {
      if (cl.to != null) continue;
      const c = this.chars.get(cl.char);
      if (!c || !this.alive(c)) {
        this._endClaim(cl, 'died');
        if (!cl.inherited && cl.strength * 0.5 >= 0.15 && c) {
          const kids = c.children.map(id => this.chars.get(id)).filter(k => k && this.alive(k) && !k.illegitimate && !k.cleric)
            .sort((a, b) => (a.sex === b.sex ? a.born - b.born : a.sex === 'm' ? -1 : 1));
          if (kids[0]) {
            this._addClaim(cl.tag, kids[0], cl.strength * 0.5, `a claim inherited from ${c.sex === 'm' ? 'the father' : 'the mother'}, ${c.name}`);
            const nc = this.claims[this.claims.length - 1];
            if (nc && nc.char === kids[0].id) nc.inherited = true;
          }
        }
      } else if (this.t - cl.from > 12 * 50) {
        this._endClaim(cl, 'forgotten');
      } else if (c.titles.includes(cl.tag)) {
        this._endClaim(cl, 'crowned');
      }
    }
  };

  // a strong claimant may rise against a weak ruler (the war itself comes in milestone 4)
  P._pressClaims = function () {
    const base = this.cfg.claim_risings ?? 0.03;
    for (const cl of this.claims) {
      if (cl.to != null) continue;
      const c = this.chars.get(cl.char), st = this.states[cl.tag], r = st && this.chars.get(st.ruler);
      if (!c || !r || !this.alive(c) || this.age(c) < 17 || c === r) continue;
      // risings come from inside or near the realm; a far-away claim waits for a war (milestone 4)
      if (!this._near(c, cl.tag, 700) && c.culture !== st.culture) continue;
      if (c.titles.length && c.titles.some(t => (this._statePop[t] || 0) > (this._statePop[cl.tag] || 0))) {
        // a king with a claim on a smaller realm waits for war (milestone 4)
        continue;
      }
      let risk = base * cl.strength;
      if (c.traits.includes('ambitious')) risk *= 1.8;
      if (c.traits.includes('content') || c.traits.includes('craven')) risk *= 0.4;
      if (this.age(r) < 16) risk *= 2;
      if ((r.adm || 0) + (r.mil || 0) <= 4) risk *= 1.5;
      if (r.traits.includes('mad')) risk *= 2;
      if (!this.rng.chance(risk)) continue;
      this._rising(cl, c, r);
    }
  };

  P._rising = function (cl, c, r) {
    const tag = cl.tag, st = this.states[tag];
    let win = 0.35 + (c.mil - r.mil) * 0.05 + (this.age(r) < 16 ? 0.15 : 0) + (r.traits.includes('mad') ? 0.15 : 0);
    if (st.regent) win += 0.05;
    win = Math.max(0.1, Math.min(0.8, win));
    const rName = this.nameIn(r, tag);
    const crisis = { id: this.crises.length + 1, tag, kind: 'rising', from: this.t, to: this.t + 12 * this.rng.int(1, 3),
      name: `Rising of ${c.name} in ${st.name}`, claimants: [c.id, r.id] };
    this.crises.push(crisis);
    if (this.rng.chance(win)) {
      crisis.winner = c.id;
      const fate = this.rng.next();
      this.log('rising', `${c.name} rises in arms to claim the throne of ${st.name}, ${cl.reason}.`, { states: [tag], chars: [c.id, r.id], major: true });
      if (fate < 0.45) {
        this._die(r, 'the axe, after a short reign was cut shorter by rebellion');
        // _die already ran the succession; make sure the claimant takes it
        if (this.states[tag].ruler !== c.id && this.alive(c)) this._usurp(tag, c, 'seized the throne');
      } else {
        this._usurp(tag, c, 'seized the throne');
        this.log('deposed', `${rName} is deposed and ${fate < 0.75 ? 'shut away in a monastery' : 'flees into exile'}.`, { states: [tag], chars: [r.id], major: true });
        this._addClaim(tag, r, 0.7, 'deposed by force');
      }
      this._endClaim(cl, 'crowned');
    } else {
      crisis.winner = r.id;
      if (this.rng.chance(0.5)) {
        this.log('rising', `${c.name} rises against ${rName} of ${st.name}, ${cl.reason}, but is defeated and put to death.`, { states: [tag], chars: [c.id, r.id], major: true });
        this._die(c, 'execution after a failed rising');
        this._endClaim(cl, 'executed');
      } else {
        this.log('rising', `${c.name} rises against ${rName} of ${st.name}, ${cl.reason}, but is defeated and flees abroad.`, { states: [tag], chars: [c.id, r.id], major: true });
        cl.strength *= 0.5;
      }
    }
  };

  // put someone on a throne outside the normal succession
  P._usurp = function (tag, c, how) {
    const st = this.states[tag];
    const old = this.chars.get(st.ruler);
    const otherCrowns = c.titles.filter(x => x !== tag);
    this._setRuler(tag, c, { how });
    if (old && this.alive(old)) old.deposed = (old.deposed || []).concat([tag]);
    this.log('succession', `${this.nameIn(c, tag)} is crowned ruler of ${st.name}.`, { states: [tag], chars: [c.id], major: true });
    if (otherCrowns.length) this._unionCheck(c);
  };

  // ---------------- regents ----------------
  P._regentCoups = function () {
    for (const st of Object.values(this.states)) {
      if (!st.regent) continue;
      const reg = this.chars.get(st.regent), r = this.chars.get(st.ruler);
      if (!reg || !r || !this.alive(reg) || reg.sex === 'f' || reg.id === r.mother) continue;
      let p = (this.cfg.regent_coups ?? 0.015) * (reg.traits.includes('ambitious') ? 2 : 0.5) * (reg.traits.includes('cruel') ? 1.5 : 1);
      if (!this.rng.chance(p)) continue;
      const tag = st.tag, child = r;
      const childName = this.nameIn(child, tag);
      this.crises.push({ id: this.crises.length + 1, tag, kind: 'usurpation', from: this.t, to: this.t + 12,
        name: `Usurpation of ${reg.name} in ${st.name}`, claimants: [reg.id, child.id], winner: reg.id });
      st.regent = null;
      this._usurp(tag, reg, 'usurped the throne');
      if (this.rng.chance(0.5)) {
        this.log('usurpation', `The regent ${reg.name} takes the crown of ${st.name} for himself. The young ${childName} is never seen again.`,
          { states: [tag], chars: [reg.id, child.id], major: true });
        this._die(child, 'a death no one would explain');
      } else {
        this.log('usurpation', `The regent ${reg.name} takes the crown of ${st.name} for himself and sends the young ${childName} away.`,
          { states: [tag], chars: [reg.id, child.id], major: true });
        this._addClaim(tag, child, 0.9, 'the rightful heir, set aside by the regent');
      }
    }
  };

  // ---------------- personal unions ----------------
  P._unionCheck = function (c) {
    if (c.titles.length < 2) return;
    const key = c.titles.slice().sort().join('+');
    const open = this.unions.find(u => u.ruler === c.id && u.to == null);
    if (open && open.tags.slice().sort().join('+') === key) return;
    if (open) open.to = this.t;
    this.unions.push({ ruler: c.id, tags: c.titles.slice(), from: this.t, to: null });
  };

  P._afterDeathOfRuler = function (dead, titles) {
    const u = this.unions.find(x => x.ruler === dead.id && x.to == null);
    if (u) {
      u.to = this.t;
      const heirs = new Set(u.tags.map(t => this.states[t].ruler));
      if (heirs.size > 1) {
        this.log('union_broken', `With the death of ${this.fullName(dead)} the crowns of ${u.tags.map(t => this.states[t].name).join(' and ')} go separate ways.`,
          { states: u.tags.slice(), chars: [dead.id], major: true });
      }
    }
    // the heirs may now hold several crowns
    const seen = new Set();
    for (const t of titles) {
      const r = this.chars.get(this.states[t].ruler);
      if (r && !seen.has(r.id)) { seen.add(r.id); this._unionCheck(r); }
    }
  };

  // ---------------- questions the page asks ----------------
  P.aliveAt = function (c, t) { return c && c.born <= t && (c.died == null || c.died > t); };

  // who would inherit if the ruler died at time t?
  P.heirAt = function (tag, t) {
    const st = this.states[tag];
    const r = this.rulerAt(tag, t);
    if (!r || ['republic', 'theocracy'].includes(st.succession) || ['republic', 'theocracy', 'order'].includes(st.government)) return null;
    const law = st.succession;
    if (law === 'open') {
      const sons = r.children.map(id => this.chars.get(id)).filter(k => k && k.sex === 'm' && this.aliveAt(k, t));
      return sons.length ? { char: sons.sort((a, b) => a.born - b.born)[0], note: 'one of the sons, by force or favour' } : null;
    }
    if (law === 'seniority') {
      let best = null;
      for (const id of (this.dynasties[r.dynasty] || { members: [] }).members) {
        const x = this.chars.get(id);
        if (!x || x === r || x.sex !== 'm' || x.cleric || !this.aliveAt(x, t) || (t - x.born) / 12 < 16) continue;
        if (!best || x.born < best.born) best = x;
      }
      return best ? { char: best, note: 'eldest of the house' } : null;
    }
    const line = this._lineOfSuccession(r, law === 'salic' ? 'salic' : 'primogeniture', 1, t);
    if (!line[0]) return null;
    return { char: line[0], note: law === 'elective' ? 'favoured candidate of the electors' : this._relationTo(line[0], r).replace(/^his |^her /, '') };
  };

  P.claimsAt = function (tag, t) {
    return this.claims.filter(c => c.tag === tag && c.from <= t && (c.to == null || c.to > t));
  };

  P.unionAt = function (tag, t) {
    return this.unions.find(u => u.tags.includes(tag) && u.from <= t && (u.to == null || u.to > t));
  };

  P.tiesOf = function (tag, t) {
    const out = [];
    for (const [k, v] of Object.entries(this.ties)) {
      const n = v.times.filter(x => x <= t).length;
      if (!n) continue;
      const [a, b] = k.split('|');
      if (a === tag) out.push({ tag: b, n }); else if (b === tag) out.push({ tag: a, n });
    }
    return out.sort((x, y) => y.n - x.n);
  };
})(typeof window !== 'undefined' ? window : globalThis);
