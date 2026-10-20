// Milestone 4: war. Reasons for war, calls to arms, battles, sieges, war score and peace treaties
// that move provinces from one realm to another. Wars are fought month by month.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // adjectives for war names ("Franco-Burgundian War")
  const ADJ = {
    FRA: ['French', 'Franco'], ENG: ['English', 'Anglo'], SCO: ['Scottish', 'Scoto'], CAS: ['Castilian'], ARA: ['Aragonese'],
    NAV: ['Navarrese'], POR: ['Portuguese', 'Luso'], GRA: ['Granadan'], VEN: ['Venetian'], MLO: ['Milanese'], GEN: ['Genoese'],
    FLO: ['Florentine'], PAP: ['Papal'], NAP: ['Neapolitan'], FER: ['Ferrarese'], MAN: ['Mantuan'], SAV: ['Savoyard'],
    HAB: ['Austrian', 'Austro'], TIR: ['Tyrolean'], SAX: ['Saxon'], BRA: ['Brandenburgian'], POL: ['Polish', 'Polono'],
    LIT: ['Lithuanian'], HUN: ['Hungarian', 'Hungaro'], BOH: ['Bohemian'], DAN: ['Danish', 'Dano'], SWE: ['Swedish', 'Swedo'],
    NOR: ['Norwegian'], MOS: ['Muscovite', 'Russo'], NOV: ['Novgorodian'], PSK: ['Pskovian'], TVE: ['Tverian'], TUR: ['Ottoman'],
    BYZ: ['Byzantine'], MAM: ['Mamluk'], TIM: ['Timurid'], TEU: ['Teutonic'], LIV: ['Livonian'], SWI: ['Swiss'],
    GOL: ['Horde'], CRI: ['Crimean'], KAZ: ['Kazan'], MOR: ['Moroccan'], TUN: ['Hafsid'], TLE: ['Zayyanid'], ETH: ['Ethiopian'],
    ADA: ['Adali'], WAL: ['Wallachian'], MOL: ['Moldavian'], SER: ['Serbian'], BOS: ['Bosnian'], ALB: ['Albanian'],
    GEO: ['Georgian'], KAR: ['Karamanid'], BRI: ['Breton'], BUR: ['Burgundian'], BAV: ['Bavarian'], BAL: ['Bavarian'],
    PAL: ['Palatine'], WUR: ['Württemberger'], BAD: ['Badenese'], HES: ['Hessian'], POM: ['Pomeranian'], MKL: ['Mecklenburgian'],
    KOL: ['Colognian'], MAI: ['Mainz'], TRI: ['Trier'], QAR: ['Qara Qoyunlu'], AKK: ['Aq Qoyunlu'], MNG: ['Ming'],
    JOS: ['Korean'], JAP: ['Japanese'], VIJ: ['Vijayanagara'], BAH: ['Bahmani'], DEL: ['Delhi'], AZT: ['Aztec'], INC: ['Inca'],
    CYP: ['Cypriot'], KNI: ['Hospitaller'], TRE: ['Trapezuntine'], EPI: ['Epirote'], ANJ: ['Angevin'], LOR: ['Lorrainer'],
    HLS: ['Holsteiner'], OLD: ['Oldenburger'], BRU: ['Brunswicker'], LUN: ['Lüneburger'], GEL: ['Guelderian'], UTR: ['Utrecht'],
  };
  const NUM = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

  P.adjective = function (tag, combining) {
    const a = ADJ[tag];
    if (a) return combining && a[1] ? a[1] : a[0];
    const n = this.states[tag].name;
    if (/ia$/.test(n)) return n.replace(/ia$/, 'ian');
    if (/y$/.test(n)) return n.replace(/y$/, 'ian');
    return n;
  };

  // ---------------- set-up ----------------
  P._initWar = function () {
    const W = this.world;
    this.owner = {};
    this.ctrl = {};               // occupied provinces: pid -> occupying realm
    this.siege = {};              // pid -> progress
    this.wars = [];
    this.truces = new Map();      // key -> month the truce ends
    this.army = {};               // realm -> soldiers
    this.ownerLog = [];           // {t, pid, from, to, war}
    this.ctrlSnaps = [];          // {year, occ: [[pid, tag]]}
    this.capitalOf = {};
    this.pAdj = {};
    this.prov = {};
    for (const p of W.provinces) { this.owner[p.id] = p.owner; this.prov[p.id] = p; this.pAdj[p.id] = []; }
    for (const [a, b] of W.adj) { this.pAdj[a].push(b); this.pAdj[b].push(a); }
    // coasts within a short crossing count as neighbours for landings (the Channel, the Strait of Otranto, ...)
    const coast = W.provinces.filter(p => p.coastal);
    this.pSea = {};
    for (let i = 0; i < coast.length; i++) {
      for (let j = i + 1; j < coast.length; j++) {
        const a = coast[i], b = coast[j];
        if (Math.abs(a.lonlat[1] - b.lonlat[1]) > 5 || Math.abs(a.lonlat[0] - b.lonlat[0]) > 9) continue;
        if (this._dist(a.lonlat, b.lonlat) < 420) {
          (this.pSea[a.id] = this.pSea[a.id] || []).push(b.id);
          (this.pSea[b.id] = this.pSea[b.id] || []).push(a.id);
        }
      }
    }
    for (const [tag, s] of Object.entries(W.states)) this.capitalOf[tag] = s.capital;
    this._recount();
    for (const t of Object.keys(this.states)) this.army[t] = this.maxArmy(t);
  };

  // the wars raging in 1444 (after diplomacy is set up, so subjects join)
  P._historicalWars = function () {
    const W = this.world;
    for (const w of (W.diplomacy && W.diplomacy.wars) || []) {
      const A = w.attackers.filter(t => this._statePop[t]), D = w.defenders.filter(t => this._statePop[t]);
      if (!A.length || !D.length) continue;
      const goal = this._conquestGoal(A[0], D[0]) || { type: 'humiliate' };
      this._startWar(A[0], D[0], goal, w.name, { allies: false, A: A.slice(1), D: D.slice(1), silent: true });
    }
  };

  // province counts and population per realm (owners change in wars)
  P._recount = function () {
    this._statePop = {};
    this._provCount = {};
    this.provsOf = {};
    for (const p of this.world.provinces) {
      const o = this.owner ? this.owner[p.id] : p.owner;
      if (!o) continue;
      this._statePop[o] = (this._statePop[o] || 0) + this.popOf(p.id);
      this._provCount[o] = (this._provCount[o] || 0) + 1;
      (this.provsOf[o] = this.provsOf[o] || []).push(p.id);
    }
  };

  P.maxArmy = function (tag) {
    const st = this.states[tag];
    const r = this.chars.get(st.ruler);
    const mil = r ? r.mil : 3;
    const horse = st.government === 'tribal' || ['GOL', 'KAZ', 'CRI', 'NOG', 'SIB', 'OIR', 'CHG', 'TIM', 'QAR', 'AKK'].includes(tag) ? 1.6 : 1;
    const funds = this.funding ? (this.funding[tag] ?? 1) : 1;
    return (this._statePop[tag] || 0) * 0.006 * horse * funds * (1 + (mil - 3) * 0.06) * (this.cfg.army_size ?? 1);
  };

  P._capitalProv = function (tag) {
    const c = this.capitalOf && this.capitalOf[tag];
    return c && this.world.provById[c];
  };

  // ---------------- who is fighting whom ----------------
  P.activeWars = function () { return this.wars.filter(w => w.end == null); };
  P._side = function (w, t) { return w.A.includes(t) ? 'A' : w.D.includes(t) ? 'D' : null; };
  P.atWarWith = function (a, b) {
    for (const w of this.wars) if (w.end == null) {
      const sa = this._side(w, a), sb = this._side(w, b);
      if (sa && sb && sa !== sb) return w;
    }
    return null;
  };
  P._inWar = function (t) { return this.wars.some(w => w.end == null && this._side(w, t)); };
  P._hasTruce = function (a, b) { return (this.truces.get(key(a, b)) || 0) > this.t; };

  // a realm's land that borders another realm (by land, or across a short crossing)
  P._frontier = function (fromTags, toTags, sea) {
    const from = new Set(fromTags), to = new Set(toTags);
    const ctl = pid => this.ctrl[pid] || this.owner[pid];
    // only the land the target side holds needs checking
    const held = [];
    for (const t of toTags) for (const pid of this.provsOf[t] || []) if (to.has(ctl(pid))) held.push(pid);
    for (const [pid, by] of Object.entries(this.ctrl)) if (to.has(by) && !to.has(this.owner[pid])) held.push(+pid);
    const out = [];
    for (const pid of held) {
      for (const q of this.pAdj[pid]) if (from.has(ctl(q))) { out.push(pid); break; }
    }
    if (!out.length && sea) {
      for (const pid of held) {
        if (!this.pSea[pid]) continue;
        for (const q of this.pSea[pid]) if (from.has(ctl(q))) { out.push(pid); break; }
      }
    }
    return out;
  };

  // ---------------- reasons for war ----------------
  P._conquestGoal = function (a, d) {
    const front = this._frontier([a, ...this._subjects(a)], [d], true);
    if (!front.length) return null;
    // prefer land of the attacker's own culture, then rich land
    const ac = this.states[a].culture;
    const score = pid => this.popOf(pid) * (this.prov[pid].culture === ac ? 3 : 1) * (pid === this.capitalOf[d] ? 0.3 : 1);
    const picks = front.sort((x, y) => score(y) - score(x)).slice(0, this.rng.int(1, 3));
    return { type: 'conquest', provs: picks };
  };

  P._subjects = function (t) {
    const out = [];
    if (this.dip) for (const [v, o] of Object.entries(this.dip.overlord)) if (o === t) out.push(v);
    return out;
  };

  P._aggression = function (r) {
    let a = 1;
    if (!r) return a;
    if (r.traits.includes('ambitious')) a *= 1.7;
    if (r.traits.includes('martial') || r.traits.includes('wrathful')) a *= 1.4;
    if (r.traits.includes('brave')) a *= 1.2;
    if (r.traits.includes('zealous')) a *= 1.2;
    if (r.traits.includes('content') || r.traits.includes('craven')) a *= 0.5;
    if (r.traits.includes('kind') || r.traits.includes('patient')) a *= 0.8;
    a *= 1 + (r.mil - 3) * 0.12;
    if (this.age(r) < 16) a *= 0.3;
    return a;
  };

  // the strength a realm can bring to bear, with subjects and allies that would likely come
  P._coalition = function (t, against) {
    let s = this.army[t] || 0;
    for (const v of this._subjects(t)) s += (this.army[v] || 0) * 0.8;
    if (this.dip) for (const k of this.dip.allies) {
      const [a, b] = k.split('|');
      const o = a === t ? b : b === t ? a : null;
      if (o && o !== against) s += (this.army[o] || 0) * 0.5;
    }
    return s;
  };

  P._declareWars = function () {
    if (!this.dip) return;
    const freq = this.cfg.war_frequency ?? 1;
    const tags = Object.keys(this.states).filter(t => (this._statePop[t] || 0) > 1.2e5);
    for (const t of tags) {
      if (this.dip.overlord[t]) {
        // a vassal that longs for freedom may fight for it
        const lib = this.states[t].liberty || 0;
        const o = this.dip.overlord[t];
        if (lib > 60 && !this._inWar(t) && !this._hasTruce(t, o) && this.rng.chance(0.05 * freq / 12) && this._coalition(t, o) > this.army[o] * 0.6) {
          this._startWar(t, o, { type: 'independence' }, `${this.adjective(t)} War of Independence`);
        }
        continue;
      }
      const r = this.chars.get(this.states[t].ruler);
      if (!r || this._inWar(t)) continue;
      if (r.titles.length > 1 && r.titles[0] !== t && (this._statePop[r.titles[0]] || 0) > (this._statePop[t] || 0)) continue; // junior crown
      // small realms rarely start wars; the bigger ones less often than in milestone tests
      const size = Math.min(1, (this._statePop[t] || 0) / 1.5e6) * 0.7 + 0.3;
      if (!this.rng.chance(0.022 * freq * this._aggression(r) * size / 12)) continue;
      const opts = [];
      // a claim on a neighbouring throne
      for (const cl of this.claims) {
        if (cl.to != null || cl.char !== r.id || cl.strength < 0.3) continue;
        const d = cl.tag;
        if (!this._statePop[d] || this._hasTruce(t, d) || this.chars.get(this.states[d].ruler) === r) continue;
        opts.push({ d, goal: { type: 'claim', claimant: r.id }, w: 3 * cl.strength });
      }
      // conquest of a rival or a weak, disliked neighbour
      const neigh = this.borders && this.borders[t] ? [...this.borders[t]] : [];
      const rivals = this.dip.rivals.get(t) || new Set();
      for (const d of new Set([...neigh, ...rivals])) {
        if (!this._statePop[d] || this._hasTruce(t, d) || this.isAllied(t, d) || this.dip.overlord[d] === t || this.dip.overlord[d]) continue;
        if (this.chars.get(this.states[d].ruler) === r) continue;
        const op = this.opinion(t, d);
        const relDiff = (this.world.religions[this.states[t].religion] || {}).group !== (this.world.religions[this.states[d].religion] || {}).group;
        let w = (rivals.has(d) ? 2 : 0.4) + (op < -30 ? 1 : 0) + (relDiff && r.traits.includes('zealous') ? 1.5 * (1 - (this.secularOf ? this.secularOf(t) : 0)) : 0);
        if (op > 20) w *= 0.2;
        opts.push({ d, goal: null, w, holy: relDiff });
      }
      if (!opts.length) continue;
      const pick = this.rng.weighted(opts, o => o.w);
      if (!pick) continue;
      const d = pick.d;
      // only when the odds look good
      const mine = this._coalition(t, d), theirs = this._coalition(d, t);
      const nerve = r.traits.includes('ambitious') || r.traits.includes('brave') ? 0.85 : 1.15;
      if (mine < theirs * nerve) continue;
      const goal = pick.goal || this._conquestGoal(t, d);
      if (!goal) continue;
      let name;
      if (goal.type === 'claim') name = `War of the ${this.adjective(d)} Succession`;
      else if (pick.holy && !(this.secularOf && this.secularOf(t) > 0.4)) {
        const tg = (this.world.religions[this.states[t].religion] || {}).group;
        name = tg === 'christian' ? `${this.adjective(t)} Crusade against ${this.states[d].name}` : `${this.adjective(t)} Holy War against ${this.states[d].name}`;
      } else name = null;
      this._startWar(t, d, goal, name);
    }
  };

  P._warName = function (a, d) {
    const k = key(a, d);
    this._warCount = this._warCount || {};
    const n = (this._warCount[k] = (this._warCount[k] || 0) + 1);
    const base = `${this.adjective(a, true)}-${this.adjective(d)} War`;
    return n > 1 ? `${NUM[n] || n + 'th'} ${base}` : base;
  };

  P._startWar = function (a, d, goal, name, opts = {}) {
    const w = {
      id: this.wars.length + 1, name: name || this._warName(a, d), A: [a], D: [d], leaderA: a, leaderD: d, goal,
      start: this.t, end: null, ws: 0, battleScore: 0, battles: [], outcome: null, transfers: [], wsHistory: [],
      claimant: goal.claimant || null,
    };
    if (name) { this._warCount = this._warCount || {}; this._warCount[key(a, d)] = (this._warCount[key(a, d)] || 0) + 1; }
    this.wars.push(w);
    for (const t of opts.A || []) if (!this._side(w, t)) w.A.push(t);
    for (const t of opts.D || []) if (!this._side(w, t)) w.D.push(t);
    // subjects follow, allies may answer the call
    const join = (t, side) => { if (!this._side(w, t) && this._statePop[t]) w[side].push(t); };
    for (const v of this._subjects(a)) join(v, 'A');
    for (const v of this._subjects(d)) if (goal.type !== 'independence' || v !== a) join(v, 'D');
    if (opts.allies !== false && this.dip) {
      for (const k of this.dip.allies) {
        const [x, y] = k.split('|');
        for (const [leader, side, other] of [[a, 'A', d], [d, 'D', a]]) {
          const ally = x === leader ? y : y === leader ? x : null;
          if (!ally || this._side(w, ally) || this.isAllied(ally, other) || this._inWar(ally)) continue;
          const op = this.opinion(ally, leader);
          const p = side === 'D' ? 0.55 + op / 200 : 0.3 + op / 250;      // defending an ally is a duty, attacking a choice
          if (this.rng.chance(p)) join(ally, side);
          else this._remember(ally, leader, -25);
        }
      }
    }
    if (!opts.quiet) {
      const goalTxt = goal.type === 'claim' ? `to place ${this.fullName(this.chars.get(goal.claimant))} on the throne of ${this.states[d].name}`
        : goal.type === 'independence' ? `to be free of ${this.states[d].name}`
        : goal.type === 'conquest' ? `for ${goal.provs.map(p => this.prov[p].name).join(', ')}` : '';
      const allies = (side, lead) => w[side].filter(x => x !== lead).map(x => this.states[x].name);
      const aa = allies('A', a), dd = allies('D', d);
      this.log('war', `${opts.silent ? 'At the start of 1444' : this.states[a].name + ' declares war on ' + this.states[d].name}: the ${w.name} begins${goalTxt ? ', ' + goalTxt : ''}.` +
        (aa.length ? ` With ${this.states[a].name}: ${aa.join(', ')}.` : '') + (dd.length ? ` With ${this.states[d].name}: ${dd.join(', ')}.` : ''),
        { states: [...w.A, ...w.D], major: true, war: w.id });
    }
    return w;
  };

  // ---------------- a month of war ----------------
  P._warMonth = function (w) {
    const months = this.t - w.start;
    w.A = w.A.filter(t => this._statePop[t]);
    w.D = w.D.filter(t => this._statePop[t]);
    if (!w.A.includes(w.leaderA) || !w.D.includes(w.leaderD)) { this._peace(w, !w.A.includes(w.leaderA) ? 'D' : 'A', 'collapse'); return; }
    // strength at the front: realms far from the fighting send less
    const frontD = this._frontier(w.A, w.D, true), frontA = this._frontier(w.D, w.A, true);
    const theater = (frontD[0] && this.prov[frontD[0]]) || this._capitalProv(w.leaderD);
    const reach = t => {
      if (this.borders[t] && [...this.borders[t]].some(o => w.A.includes(o) || w.D.includes(o))) return 1;
      const c = this._capitalProv(t);
      return c && theater ? Math.exp(-this._dist(c.lonlat, theater.lonlat) / 1400) : 0.3;
    };
    const str = side => w[side].reduce((s, t) => s + (this.army[t] || 0) * reach(t), 0);
    let SA = str('A'), SD = str('D');
    if (!frontD.length && !frontA.length) {          // nothing left to fight over within reach
      if (months > 12 && Math.abs(w.ws) >= 25) this._peace(w, w.ws > 0 ? 'A' : 'D');
      else if (months > 24) this._peace(w, null, 'stalemate');
      return;
    }
    // a battle
    if (SA > 500 && SD > 500 && this.rng.chance(0.22)) {
      const places = frontD.concat(frontA);
      const pid = this.rng.pick(places);
      const prov = this.prov[pid];
      const holder = this.ctrl[pid] || this.owner[pid];
      const defSide = w.A.includes(holder) ? 'A' : 'D';
      const terrain = { hills: 1.2, mountains: 1.45, forest: 1.15, marsh: 1.25, jungle: 1.2 }[prov.terrain] || 1;
      const gen = side => Math.max(...w[side].map(t => { const r = this.chars.get(this.states[t].ruler); return r ? r.mil : 2; })) + this.rng.normal(0, 1);
      const ea = SA * this.rng.next() * 0.4 + SA * 0.2, ed = SD * this.rng.next() * 0.4 + SD * 0.2;
      let ratio = (ea * (1 + 0.07 * gen('A'))) / (ed * (1 + 0.07 * gen('D'))) * Math.exp(this.rng.normal(0, 0.3));
      ratio = defSide === 'A' ? ratio * terrain : ratio / terrain;
      if (this.techEdge) ratio *= this.techEdge(w);
      const win = ratio > 1 ? 'A' : 'D';
      const lose = win === 'A' ? 'D' : 'A';
      const lossW = 0.04 + this.rng.next() * 0.08, lossL = 0.14 + this.rng.next() * 0.18;
      const eng = { A: ea, D: ed };
      for (const side of ['A', 'D']) {
        const f = (side === win ? lossW : lossL) * eng[side] / Math.max(1, side === 'A' ? SA : SD);
        for (const t of w[side]) this.army[t] = Math.max(0, (this.army[t] || 0) * (1 - f * reach(t)));
      }
      const size = ea + ed;
      const swing = 5 + 12 * Math.min(1, size / 60000);
      w.battleScore = Math.max(-45, Math.min(45, w.battleScore + (win === 'A' ? swing : -swing)));
      w.momentum = win;
      const b = { t: this.t, pid, name: `Battle of ${prov.name}`, A: Math.round(ea), D: Math.round(ed), win, lossA: Math.round(ea * (win === 'A' ? lossW : lossL)), lossD: Math.round(ed * (win === 'D' ? lossW : lossL)) };
      w.battles.push(b);
      const victor = win === 'A' ? w.leaderA : w.leaderD, loser = win === 'A' ? w.leaderD : w.leaderA;
      const vr = this.chars.get(this.states[victor].ruler);
      if (vr) vr.victories = (vr.victories || 0) + 1;
      if (size > 8000) {
        this.log('battle', `${b.name}: ${this.states[victor].name} defeats ${this.states[loser].name} (${fmt(ea)} against ${fmt(ed)}).`,
          { states: [victor, loser], major: size > 30000, war: w.id, pid });
      }
      SA = str('A'); SD = str('D');
    }
    // sieges: the side that holds the field takes fortresses
    const sup = SA / Math.max(1, SD);
    const besiege = (side, targets, ratio) => {
      if (ratio < 1.2 || !targets.length) return;
      const n = Math.min(2, Math.floor(ratio / 1.5) + 1);
      const pref = pid => (w.goal.provs && w.goal.provs.includes(pid) ? 3 : 1) * (this.owner[pid] === (side === 'A' ? w.leaderA : w.leaderD) ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const pid = this.rng.weighted(targets, pref);
        if (pid == null) break;
        // months of siege: a capital holds out longer, mountains even more
        const fort = (pid === this.capitalOf[this.owner[pid]] ? 8 : 3) * ({ mountains: 1.8, hills: 1.3, marsh: 1.3 }[this.prov[pid].terrain] || 1);
        const guns = this.siegeBonus ? this.siegeBonus(side === 'A' ? w.leaderA : w.leaderD) : 1;
        this.siege[pid] = (this.siege[pid] || 0) + Math.min(1.2, (ratio - 1) * 0.6 + 0.3) * guns;
        if (this.siege[pid] >= fort) {
          delete this.siege[pid];
          const own = this.owner[pid];
          if (w[side].includes(own)) delete this.ctrl[pid];          // liberated
          else this.ctrl[pid] = side === 'A' ? w.leaderA : w.leaderD;
          if (pid === this.capitalOf[w.leaderD] && side === 'A') this.log('siege', `${this.prov[pid].name}, capital of ${this.states[w.leaderD].name}, falls to the ${this.adjective(w.leaderA)}.`, { states: [w.leaderA, w.leaderD], major: true, war: w.id, pid });
          if (pid === this.capitalOf[w.leaderA] && side === 'D') this.log('siege', `${this.prov[pid].name}, capital of ${this.states[w.leaderA].name}, falls to the ${this.adjective(w.leaderD)}.`, { states: [w.leaderA, w.leaderD], major: true, war: w.id, pid });
        }
        targets = targets.filter(x => x !== pid);
      }
    };
    // targets: enemy land on the front, or our own occupied land
    const occupiedBy = side => Object.keys(this.ctrl).map(Number).filter(pid => w[side].includes(this.ctrl[pid]));
    besiege('A', frontD.concat(occupiedBy('D').filter(pid => w.A.includes(this.owner[pid]))), sup);
    besiege('D', frontA.concat(occupiedBy('A').filter(pid => w.D.includes(this.owner[pid]))), 1 / sup);
    // war score
    const popOf = side => w[side].reduce((s, t) => s + (this._statePop[t] || 0), 0);
    let occA = 0, occD = 0;
    for (const [pid, by] of Object.entries(this.ctrl)) {
      const own = this.owner[pid];
      if (w.A.includes(by) && w.D.includes(own)) occA += this.popOf(pid);
      if (w.D.includes(by) && w.A.includes(own)) occD += this.popOf(pid);
    }
    let ws = w.battleScore + occA / Math.max(1, popOf('D')) * 90 - occD / Math.max(1, popOf('A')) * 90;
    if (w.goal.provs && w.goal.provs.every(pid => this.ctrl[pid] && w.A.includes(this.ctrl[pid]))) ws += 12;
    if (this.ctrl[this.capitalOf[w.leaderD]] && w.A.includes(this.ctrl[this.capitalOf[w.leaderD]])) ws += 15;
    if (this.ctrl[this.capitalOf[w.leaderA]] && w.D.includes(this.ctrl[this.capitalOf[w.leaderA]])) ws -= 15;
    w.ws = Math.round(Math.max(-100, Math.min(100, ws)));
    if (this.month() === 6) w.wsHistory.push([this.year(), w.ws]);
    // peace?
    if (months < 6) return;
    const tired = months / 12;
    if (w.ws >= 50 && this.rng.chance(0.25)) return this._peace(w, 'A');
    if (w.ws <= -45 && this.rng.chance(0.3)) return this._peace(w, 'D');
    if (w.ws >= 25 && tired > 2 && this.rng.chance(0.08)) return this._peace(w, 'A');
    if (w.ws <= -25 && tired > 2 && this.rng.chance(0.1)) return this._peace(w, 'D');
    if (tired > 4 && Math.abs(w.ws) < 20 && this.rng.chance(0.06)) return this._peace(w, null, 'white');
    if (tired > 7) return this._peace(w, w.ws > 10 ? 'A' : w.ws < -10 ? 'D' : null, 'exhaustion');
  };

  function fmt(n) { return n >= 1000 ? Math.round(n / 1000) + ',000' : String(Math.round(n)); }

  // ---------------- peace ----------------
  P._peace = function (w, winner, how) {
    w.end = this.t;
    const A = w.leaderA, D = w.leaderD;
    const placeOf = tag => (this._capitalProv(tag) || { name: this.states[tag].name }).name;
    const treaty = `Peace of ${placeOf(winner === 'A' ? D : winner === 'D' ? A : (this.rng.chance(0.5) ? A : D))}`;
    w.treaty = treaty;
    const gained = [];
    const sideA = w.A.slice(), sideD = w.D.slice();
    if (winner === 'A') {
      let budget = Math.max(w.ws, 20);
      if (w.goal.type === 'claim') {
        const c = this.chars.get(w.claimant);
        if (c && this.alive(c) && this._statePop[D]) {
          this._usurp(D, c, 'won the throne by war');
          w.outcome = `${this.fullName(c)} takes the throne of ${this.states[D].name}`;
        }
      } else if (w.goal.type === 'independence') {
        if (this.dip) delete this.dip.overlord[A];
        this.states[A].rebel = false;
        w.outcome = `${this.states[A].name} is free`;
      } else {
        // provinces: the goal first, then occupied land next to the winner
        const popD = Math.max(1, this._statePop[D] || 1);
        const cost = pid => 100 * this.popOf(pid) / popD * 1.1 + 6;
        const cand = (w.goal.provs || []).filter(pid => this.owner[pid] === D || sideD.includes(this.owner[pid]));
        for (const [pid, by] of Object.entries(this.ctrl)) {
          const p = +pid;
          if (sideA.includes(by) && sideD.includes(this.owner[p]) && !cand.includes(p)) cand.push(p);
        }
        if (w.goal.unify && w.ws >= 40) for (const pid of this.provsOf[D] || []) if (!cand.includes(pid)) cand.push(pid);
        const maxProv = w.goal.unify && w.ws >= 40 ? 99 : Math.max(1, Math.min(4, Math.round(w.ws / 22)));
        if (w.goal.unify && w.ws >= 40) budget = 9999;
        for (const pid of cand) {
          if (gained.length >= maxProv) break;
          const c = cost(pid);
          if (c > budget && gained.length) continue;
          budget -= c;
          gained.push(pid);
        }
        // a beaten small realm may be swallowed whole or made a vassal
        const left = this.world.provinces.filter(p => this.owner[p.id] === D && !gained.includes(p.id)).length;
        if (left <= 1 && w.ws >= 80 && this._statePop[D] < 0.2 * this._statePop[A]) {
          for (const p of this.world.provinces) if (this.owner[p.id] === D && !gained.includes(p.id)) gained.push(p.id);
        } else if (w.ws >= 75 && this.dip && this.states[A].religion === this.states[D].religion && this._statePop[D] < 0.3 * this._statePop[A] && this.rng.chance(0.4)) {
          this.dip.overlord[D] = A;
          w.vassalized = true;
        }
      }
    } else if (winner === 'D') {
      if (w.goal.type === 'independence' && this.states[A].rebel) {
        // a crushed revolt: the land goes back to its old master
        for (const p of this.world.provinces) if (this.owner[p.id] === A) gained.push(p.id);
        w.outcome = `the revolt is crushed`;
      } else if (w.goal.type === 'independence') w.outcome = `${this.states[A].name} remains a vassal of ${this.states[D].name}`;
      else {
        // the defender keeps what it took, a little of it
        let budget = Math.abs(w.ws) / 2;
        const popA = Math.max(1, this._statePop[A] || 1);
        for (const [pid, by] of Object.entries(this.ctrl)) {
          const p = +pid;
          if (sideD.includes(by) && this.owner[p] === A && budget > 0 && gained.length < 3) {
            budget -= 100 * this.popOf(p) / popA + 6;
            gained.push(p);
          }
        }
      }
    }
    // all occupations end; land changes hands
    for (const pid of Object.keys(this.ctrl)) {
      const by = this.ctrl[pid];
      if (sideA.includes(by) || sideD.includes(by)) delete this.ctrl[pid];
    }
    const to = winner === 'A' ? A : D;
    for (const pid of gained) this._transfer(pid, to, w);
    w.gained = gained;
    // truce and grudges
    for (const x of sideA) for (const y of sideD) this.truces.set(key(x, y), this.t + 12 * (x === A && y === D ? 12 : 6));
    if (winner) this._remember(A, D, -30);
    let txt;
    const names = gained.map(pid => this.prov[pid].name);
    if (!winner) txt = `The ${w.name} ends without a victor (${how === 'stalemate' ? 'neither side could reach the other' : 'a white peace'}).`;
    else {
      const wn = this.states[to].name, ln = this.states[to === A ? D : A].name;
      txt = `The ${treaty} ends the ${w.name}: ${wn} is victorious.`;
      if (names.length) txt += ` ${ln} cedes ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more provinces` : ''} to ${wn}.`;
      if (w.outcome === 'the revolt is crushed') txt = `The ${w.name} is crushed: ${wn} takes back ${names.length > 4 ? names.length + ' provinces' : names.join(', ')}.`;
      else if (w.outcome) txt += ` ${w.outcome.charAt(0).toUpperCase() + w.outcome.slice(1)}.`;
      if (w.vassalized) txt += ` ${ln} becomes a vassal of ${wn}.`;
    }
    w.result = winner ? (winner === 'A' ? 'attackers' : 'defenders') : 'white peace';
    this.log('peace', txt, { states: [...sideA, ...sideD], major: true, war: w.id });
  };

  P._transfer = function (pid, to, w) {
    const from = this.owner[pid];
    if (from === to) return;
    this.owner[pid] = to;
    delete this.ctrl[pid];
    this.ownerLog.push({ t: this.t, pid, from, to, war: w ? w.id : null });
    if (w) w.transfers.push({ pid, from, to });
    // update the totals of both realms (cheaper than counting the whole world again)
    const n = this.popOf(pid);
    if (from) {
      this._statePop[from] = Math.max(0, (this._statePop[from] || 0) - n);
      this._provCount[from] = (this._provCount[from] || 1) - 1;
      const L = this.provsOf[from]; if (L) { const i = L.indexOf(pid); if (i >= 0) L.splice(i, 1); }
      if (!this._provCount[from]) this._statePop[from] = 0;
    }
    this._statePop[to] = (this._statePop[to] || 0) + n;
    this._provCount[to] = (this._provCount[to] || 0) + 1;
    (this.provsOf[to] = this.provsOf[to] || []).push(pid);
    this._bordersDirty = true;
    // a lost capital moves to the realm's richest remaining province
    if (this.capitalOf[from] === pid && this._statePop[from]) {
      const rest = this.world.provinces.filter(p => this.owner[p.id] === from).sort((a, b) => b.pop - a.pop);
      if (rest[0]) this.capitalOf[from] = rest[0].id;
    }
    if (!this._statePop[from]) this._destroyState(from, to, w);
  };

  P._destroyState = function (tag, by, w) {
    const st = this.states[tag];
    const r = this.chars.get(st.ruler);
    st.destroyed = { t: this.t, by };
    this.log('annexed', `${st.name} is no more: its last lands pass to ${this.states[by].name}.`, { states: [tag, by], major: true, war: w ? w.id : null });
    if (r) {
      r.titles = r.titles.filter(x => x !== tag);
      if (this.alive(r)) this._addClaim && this._addClaim(tag, r, 0.8, `the last ruler of ${st.name}`);
      const h = st.history[st.history.length - 1];
      if (h && h.to == null) h.to = this.t;
    }
    st.ruler = null;
    st.regent = null;
    if (this.dip) {
      delete this.dip.overlord[tag];
      for (const [v, o] of Object.entries(this.dip.overlord)) if (o === tag) delete this.dip.overlord[v];
      for (const k of [...this.dip.allies]) if (k.split('|').includes(tag)) this.dip.allies.delete(k);
      this.dip.rivals.delete(tag);
      for (const s of this.dip.rivals.values()) s.delete(tag);
    }
  };

  // borders between realms after land changed hands
  P._recomputeBorders = function () {
    this.borders = {};
    for (const [a, b] of this.world.adj) {
      const A = this.owner[a], B = this.owner[b];
      if (!A || !B || A === B) continue;
      (this.borders[A] = this.borders[A] || new Set()).add(B);
      (this.borders[B] = this.borders[B] || new Set()).add(A);
      if (this.dip && !this.dip.pairIndex.has(key(A, B))) {
        this.dip.pairIndex.set(key(A, B), this.dip.pairs.length);
        this.dip.pairs.push([A, B]);
        this.dip.dist.set(key(A, B), 400);
        this._partnerCache = {};
      }
    }
    this._bordersDirty = false;
  };

  // ---------------- hooks ----------------
  P._monthly = function () {
    if (!this.wars) return;
    // armies recover toward their size; at war the levies are raised
    for (const t of Object.keys(this.states)) {
      if (!this._statePop[t]) { this.army[t] = 0; continue; }
      const max = this.maxArmy(t) * (this._inWarCache && this._inWarCache.has(t) ? 1.4 : 1);
      const a = this.army[t] || 0;
      this.army[t] = a + (max - a) * (a < max ? 0.03 : 0.1);
    }
    this._inWarCache = new Set();
    for (const w of this.wars) if (w.end == null) for (const t of [...w.A, ...w.D]) this._inWarCache.add(t);
    for (const w of this.wars) if (w.end == null) this._warMonth(w);
    if (this.dip) this._declareWars();
    if (this._bordersDirty) this._recomputeBorders();
    if (this.month() === 6) {
      const occ = Object.entries(this.ctrl).map(([p, t]) => [+p, t]);
      this.ctrlSnaps.push({ year: this.year(), occ });
    }
  };


  const afterInit = P._afterInit;
  P._afterInit = function () {
    this._initWar();
    afterInit.call(this);
    this._historicalWars();
  };
  // a vassal that wants to be free now fights for it instead of simply leaving
  const yd = P._yearlyDiplomacy;
  P._yearlyDiplomacy = function () {
    const before = Object.assign({}, this.dip.overlord);
    yd.call(this);
    if (!this.wars) return;
    for (const [v, o] of Object.entries(before)) {
      if (this.dip.overlord[v] || !this._statePop[v] || !this._statePop[o] || this.chars.get(this.states[v].ruler) === this.chars.get(this.states[o].ruler)) continue;
      if (this._hasTruce(v, o)) { this.dip.overlord[v] = o; continue; }      // beaten recently: stays put
      // undo the peaceful break and go to war
      this.dip.overlord[v] = o;
      if (!this._inWar(v)) this._startWar(v, o, { type: 'independence' }, `${this.adjective(v)} War of Independence`);
    }
  };

  // ---------------- questions the page asks ----------------
  P.ownersAt = function (year) {
    const t = year * 12 + 6;
    const own = {};
    for (const p of this.world.provinces) own[p.id] = p.owner;
    for (const e of this.ownerLog) { if (e.t > t) break; own[e.pid] = e.to; }
    return own;
  };
  P.occupationAt = function (year) {
    const s = this.ctrlSnaps.find(x => x.year === year);
    return s ? s.occ : [];
  };
  P.warsAt = function (year) {
    const t = year * 12 + 6;
    return this.wars.filter(w => w.start <= t && (w.end == null || w.end > t - 6));
  };
  P.capitalAt = function (tag, year) {
    // the capital moves only when it is lost; replay the land changes
    const own = this.ownersAt(year);
    const info = (this.stateInfo && this.stateInfo[tag]) || this.world.states[tag];
    const c = info && info.capital;
    if (c && own[c] === tag) return c;
    let best = null;
    for (const p of this.world.provinces) if (own[p.id] === tag && (!best || p.pop > best.pop)) best = p;
    return best ? best.id : c;
  };
})(typeof window !== 'undefined' ? window : globalThis);
