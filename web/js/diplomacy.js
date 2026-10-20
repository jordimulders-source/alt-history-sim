// Milestone 3: diplomacy. Opinions between realms, rivalries, alliances and vassals.
// Recomputed once a year; a yearly snapshot lets the page show any year.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  P._initDiplomacy = function () {
    const W = this.world;
    const D = W.diplomacy || {};
    this.dip = {
      pairs: [],             // [a, b] for every pair of realms that know each other
      pairIndex: new Map(),  // key -> index
      dist: new Map(),       // key -> km between capitals
      memory: new Map(),     // key -> remembered favours and grudges (decays)
      allies: new Set(),     // keys
      rivals: new Map(),     // tag -> Set of rival tags (one-sided)
      overlord: {},          // vassal -> overlord
      history: [],           // yearly snapshots
    };
    const tags = Object.keys(this.states).filter(t => this._statePop[t]);
    // which realms border each other
    const owner = {};
    for (const p of W.provinces) owner[p.id] = p.owner;
    this.borders = {};
    for (const [a, b] of W.adj) {
      const A = owner[a], B = owner[b];
      if (!A || !B || A === B) continue;
      (this.borders[A] = this.borders[A] || new Set()).add(B);
      (this.borders[B] = this.borders[B] || new Set()).add(A);
    }
    // realms know their neighbours, everyone within reach, and the great powers further away
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const a = tags[i], b = tags[j];
        const ca = this._capital(a), cb = this._capital(b);
        if (!ca || !cb) continue;
        const d = this._dist(ca.lonlat, cb.lonlat);
        const big = Math.max(this._statePop[a], this._statePop[b]);
        const border = this.borders[a] && this.borders[a].has(b);
        if (border || d < 900 || (d < 2200 && big > 1.5e6) || (d < 3200 && Math.min(this._statePop[a], this._statePop[b]) > 2e6)) {
          this.dip.pairIndex.set(key(a, b), this.dip.pairs.length);
          this.dip.pairs.push([a, b]);
          this.dip.dist.set(key(a, b), border ? Math.min(d, 400) : d);
        }
      }
    }
    // the situation of 1444
    for (const [a, b] of D.alliances || []) if (this.states[a] && this.states[b]) this.dip.allies.add(key(a, b));
    for (const [a, b] of D.rivals || []) {
      if (!this.states[a] || !this.states[b]) continue;
      this._rivalSet(a).add(b);
      this._rivalSet(b).add(a);
    }
    for (const [v, o] of Object.entries(D.vassals || {})) if (this.states[v] && this.states[o]) this.dip.overlord[v] = o;
    for (const [a, b, v] of D.opinion || []) this._remember(a, b, v, true);
  };

  P._rivalSet = function (t) {
    let s = this.dip.rivals.get(t);
    if (!s) { s = new Set(); this.dip.rivals.set(t, s); }
    return s;
  };
  P.isAllied = function (a, b) { return this.dip.allies.has(key(a, b)); };
  P.isRival = function (a, b) { const s = this.dip.rivals.get(a); return !!(s && s.has(b)); };
  P.knows = function (a, b) { return this.dip.pairIndex.has(key(a, b)); };

  // events leave memories that fade by a tenth a year
  P._remember = function (a, b, v, lasting) {
    if (!this.dip || a === b) return;
    const k = key(a, b);
    this.dip.memory.set(k, Math.max(-100, Math.min(100, (this.dip.memory.get(k) || 0) + v)));
    if (lasting) this.dip.lasting = this.dip.lasting || new Set(), this.dip.lasting.add(k);
  };

  // military and economic weight of a realm, with its vassals and crowns in union
  P.power = function (tag) {
    const r = this.chars.get(this.states[tag].ruler);
    let p = (this._statePop[tag] || 0) / 1e6;
    p *= 1 + ((r ? r.adm + r.mil : 4) - 4) / 16;
    for (const [v, o] of Object.entries(this.dip.overlord)) if (o === tag) p += (this._statePop[v] || 0) / 1e6 * 0.5;
    if (r) for (const t of r.titles) if (t !== tag) p += (this._statePop[t] || 0) / 1e6 * 0.6;
    return p;
  };

  // opinion of a toward b (symmetric here): standing facts + what they remember
  P.opinion = function (a, b) {
    const sa = this.states[a], sb = this.states[b];
    let o = 0;
    const rel = r => (this.world.religions[r] || {}).group;
    const cg = c => (this.world.cultures[c] || {}).group;
    // faith matters most between neighbours
    const near = (this.dip.dist.get(key(a, b)) ?? 9999) < 1200;
    if (sa.religion === sb.religion) o += 12; else if (rel(sa.religion) === rel(sb.religion)) o += 0; else o -= near ? 22 : 8;
    if (cg(sa.culture) === cg(sb.culture)) o += 8;
    if (this.borders[a] && this.borders[a].has(b)) o -= 10;
    if (this.isAllied(a, b)) o += 30;
    if (this.isRival(a, b) || this.isRival(b, a)) o -= 45;
    if (this.dip.overlord[a] === b || this.dip.overlord[b] === a) o += 10;
    const ra = this.chars.get(sa.ruler), rb = this.chars.get(sb.ruler);
    if (ra && rb) {
      if (ra === rb) o += 60;
      if (ra.dynasty && ra.dynasty === rb.dynasty) o += 15;
      const temper = r => (r.traits.includes('kind') || r.traits.includes('charismatic') ? 6 : 0) + (r.traits.includes('trusting') ? 4 : 0)
        - (r.traits.includes('cruel') || r.traits.includes('wrathful') ? 6 : 0) - (r.traits.includes('paranoid') ? 6 : 0) + (r.dip - 3) * 2;
      o += temper(ra) + temper(rb);
      // a ruler who claims the other's throne
      for (const cl of (this._claimsByChar && this._claimsByChar.get(ra.id)) || []) if (cl.tag === b) o -= 30 * cl.strength + 10;
      for (const cl of (this._claimsByChar && this._claimsByChar.get(rb.id)) || []) if (cl.tag === a) o -= 30 * cl.strength + 10;
    }
    const t = this.ties[key(a, b)];
    if (t) o += Math.min(30, t.times.filter(x => this.t - x < 12 * 40).length * 8);
    o += this.dip.memory.get(key(a, b)) || 0;
    return Math.max(-100, Math.min(100, Math.round(o)));
  };

  // ---------------- the yearly diplomatic round ----------------
  P._yearlyDiplomacy = function () {
    const D = this.dip;
    for (const [k, v] of D.memory) D.memory.set(k, v * (D.lasting && D.lasting.has(k) ? 0.95 : 0.9));
    const tags = Object.keys(this.states).filter(t => this._statePop[t]);
    const pw = {};
    for (const t of tags) pw[t] = this.power(t);
    this._claimsByChar = new Map();
    for (const cl of this.claims) if (cl.to == null) {
      if (!this._claimsByChar.has(cl.char)) this._claimsByChar.set(cl.char, []);
      this._claimsByChar.get(cl.char).push(cl);
    }
    const op = new Map();
    for (const [a, b] of D.pairs) op.set(key(a, b), this.opinion(a, b));
    const dist = (a, b) => D.dist.get(key(a, b)) ?? 9999;
    // close enough to matter: a rival or an ally has to be within reach
    const reach = (a, b, km) => dist(a, b) < km * (Math.max(pw[a], pw[b]) > 3 ? 1.5 : 1);
    const opi = (a, b) => op.get(key(a, b)) ?? 0;
    const partners = t => D.pairs.filter(([a, b]) => a === t || b === t).map(([a, b]) => (a === t ? b : a));
    this._partnerCache = this._partnerCache || {};
    const known = t => this._partnerCache[t] || (this._partnerCache[t] = partners(t));
    const ruler = t => this.chars.get(this.states[t].ruler);
    const free = t => !D.overlord[t] && !['theocracy'].includes(this.states[t].government) || ['PAP'].includes(t);
    const name = t => this.states[t].name;

    // personal unions: one ruler, one foreign policy (the junior crowns follow the senior)
    const seniorOf = {};
    for (const t of tags) {
      const r = ruler(t);
      if (r && r.titles.length > 1) {
        const s = r.titles.slice().sort((x, y) => (this._statePop[y] || 0) - (this._statePop[x] || 0))[0];
        if (s !== t) seniorOf[t] = s;
      }
    }

    // 1. rivalries: a realm watches up to three others of similar weight
    for (const t of tags) {
      if (pw[t] < 0.25 || D.overlord[t] || seniorOf[t]) continue;
      const mine = this._rivalSet(t);
      for (const r of [...mine]) {
        const ratio = pw[r] / pw[t];
        const gone = !this._statePop[r] || ratio < 0.2 || ratio > 6 || D.overlord[r] === t || ruler(r) === ruler(t) || !reach(t, r, 1400);
        if (gone || (opi(t, r) > 10 && this.rng.chance(0.15))) {
          mine.delete(r);
          if (!gone && pw[t] > 1) this.log('rivalry_end', `${name(t)} and ${name(r)} put their old rivalry aside.`, { states: [t, r] });
        }
      }
      if (mine.size >= 3 || !this.rng.chance(0.25)) continue;
      const cands = known(t).filter(o => reach(t, o, 1000) && !mine.has(o) && !this.isAllied(t, o) && D.overlord[o] !== t && D.overlord[t] !== o &&
        ruler(o) !== ruler(t) && pw[o] / pw[t] > 0.4 && pw[o] / pw[t] < 3 && opi(t, o) < 0);
      if (!cands.length) continue;
      const pick = this.rng.weighted(cands, o => (-opi(t, o)) * (this.borders[t] && this.borders[t].has(o) ? 2 : 1));
      if (pick && opi(t, pick) < -20) {
        mine.add(pick);
        this._remember(t, pick, -10);
        if (pw[t] > 0.8) this.log('rivalry', `${name(t)} comes to see ${name(pick)} as its great rival.`, { states: [t, pick], major: pw[t] > 1.5 });
      }
    }

    // 2. alliances
    const alliesOf = t => [...D.allies].filter(k => k.split('|').includes(t)).map(k => k.split('|').find(x => x !== t));
    // broken alliances
    for (const k of [...D.allies]) {
      const [a, b] = k.split('|');
      const bad = !this._statePop[a] || !this._statePop[b] || D.overlord[a] || D.overlord[b] || this.isRival(a, b) || this.isRival(b, a);
      if (bad || (opi(a, b) < 0 && this.rng.chance(0.3))) {
        D.allies.delete(k);
        if (!bad || this.isRival(a, b) || this.isRival(b, a)) {
          this._remember(a, b, -20);
          if (Math.max(pw[a] || 0, pw[b] || 0) > 0.8) this.log('alliance_end', `The alliance between ${name(a)} and ${name(b)} falls apart.`, { states: [a, b], major: Math.max(pw[a], pw[b]) > 2 });
        }
      }
    }
    // new alliances: the enemy of my enemy...
    for (const t of tags) {
      if (!free(t) || seniorOf[t] || pw[t] < 0.08) continue;
      const r = ruler(t);
      const max = 1 + Math.floor(((r && r.dip) || 2) / 2);
      if (alliesOf(t).length >= max || !this.rng.chance(0.35)) continue;
      const myRivals = this._rivalSet(t);
      const score = (a, b) => {
        let s = opi(a, b);
        for (const x of this._rivalSet(a)) if (this._rivalSet(b).has(x)) s += 30;
        for (const x of this._rivalSet(a)) if (this.isAllied(b, x)) s -= 40;
        if (this.states[a].religion !== this.states[b].religion) s -= 10;
        s += Math.min(20, pw[b] * 3);
        return s;
      };
      const cands = known(t).filter(o => free(o) && !seniorOf[o] && !this.isAllied(t, o) && !myRivals.has(o) && !this.isRival(o, t) && ruler(o) !== ruler(t) &&
        (reach(t, o, 1300) || [...myRivals].some(x => this._rivalSet(o).has(x) && reach(o, x, 1300))));
      if (!cands.length) continue;
      let best = null, bs = 35;
      for (const o of cands) { const s = score(t, o); if (s > bs) { bs = s; best = o; } }
      if (!best) continue;
      const ro = ruler(best);
      const omax = 1 + Math.floor(((ro && ro.dip) || 2) / 2);
      if (alliesOf(best).length >= omax || score(best, t) < 30) continue;
      D.allies.add(key(t, best));
      this._remember(t, best, 10);
      if (Math.max(pw[t], pw[best]) > 0.6) this.log('alliance', `${name(t)} and ${name(best)} conclude an alliance.`, { states: [t, best], major: Math.max(pw[t], pw[best]) > 1.5 });
    }

    // 3. vassals: the urge to be free, and small realms seeking protection
    for (const [v, o] of Object.entries(D.overlord)) {
      if (!this._statePop[v] || !this._statePop[o] || ruler(v) === ruler(o)) { delete D.overlord[v]; continue; }
      let liberty = 25;
      if ((this.world.cultures[this.states[v].culture] || {}).group !== (this.world.cultures[this.states[o].culture] || {}).group) liberty += 12;
      if (this.states[v].religion !== this.states[o].religion) liberty += 20;
      liberty += Math.min(50, pw[v] / Math.max(pw[o], 0.01) * 80);
      liberty -= opi(v, o) / 3;
      const ro = ruler(o);
      if (ro && this.age(ro) < 16) liberty += 10;
      if (ro && ro.dip <= 1) liberty += 8;
      this.states[v].liberty = Math.round(Math.max(0, Math.min(100, liberty)));
      if (liberty > 55 && this.rng.chance((liberty - 50) / 250)) {
        delete D.overlord[v];
        this._remember(v, o, -40);
        this._rivalSet(o).add(v);
        this.log('independence', `${name(v)} throws off the overlordship of ${name(o)}.`, { states: [v, o], major: true });
      }
    }
    for (const t of tags) {
      if (D.overlord[t] || seniorOf[t] || pw[t] > 0.35 || this.states[t].government === 'theocracy' || !this.rng.chance(0.03)) continue;
      if (Object.values(D.overlord).includes(t)) continue;          // overlords do not submit
      const threats = known(t).filter(o => pw[o] > pw[t] * 4 && opi(t, o) < -10);
      if (!threats.length) continue;
      const protectors = (this.borders[t] ? [...this.borders[t]] : []).filter(o =>
        pw[o] > pw[t] * 3 && !D.overlord[o] && opi(t, o) > 30 && this.states[o].religion === this.states[t].religion && !threats.includes(o));
      if (!protectors.length) continue;
      const o = protectors.sort((a, b) => opi(t, b) - opi(t, a))[0];
      D.overlord[t] = o;
      for (const k of [...D.allies]) if (k.split('|').includes(t)) D.allies.delete(k);
      this.log('vassal', `Fearing ${name(threats[0])}, ${name(t)} places itself under the protection of ${name(o)}.`, { states: [t, o], major: pw[o] > 1.5 });
    }

    // 4. snapshot for the page
    const snap = { year: this.year(), allies: [...D.allies], rivals: [], overlord: Object.assign({}, D.overlord), op: new Int8Array(D.pairs.length) };
    for (const [t, set] of D.rivals) for (const r of set) snap.rivals.push([t, r]);
    D.pairs.forEach(([a, b], i) => { snap.op[i] = op.get(key(a, b)) ?? 0; });
    snap.liberty = {};
    for (const v of Object.keys(D.overlord)) snap.liberty[v] = this.states[v].liberty;
    D.history.push(snap);
  };

  // ---------------- questions the page asks ----------------
  P.diplomacyAt = function (year) {
    const H = this.dip.history;
    let best = H[0];
    for (const h of H) if (h.year <= year) best = h;
    return best;
  };

  P.relationsOf = function (tag, year) {
    const s = this.diplomacyAt(year);
    if (!s) return null;
    const out = { allies: [], rivals: [], rivalOf: [], vassals: [], overlord: s.overlord[tag] || null, opinions: [], liberty: s.liberty[tag] };
    for (const k of s.allies) { const [a, b] = k.split('|'); if (a === tag) out.allies.push(b); else if (b === tag) out.allies.push(a); }
    for (const [a, b] of s.rivals) { if (a === tag) out.rivals.push(b); if (b === tag) out.rivalOf.push(a); }
    for (const [v, o] of Object.entries(s.overlord)) if (o === tag) out.vassals.push(v);
    this.dip.pairs.forEach(([a, b], i) => {
      if (a === tag) out.opinions.push([b, s.op[i]]); else if (b === tag) out.opinions.push([a, s.op[i]]);
    });
    out.opinions.sort((x, y) => y[1] - x[1]);
    return out;
  };

  // for the map: every realm in an alliance takes the colour of the strongest realm it is tied to
  P.leaderAt = function (year) {
    const s = this.diplomacyAt(year);
    const pop = t => this._statePop[t] || 0;
    const partners = {};
    const add = (a, b) => { (partners[a] = partners[a] || []).push(b); };
    for (const k of s.allies) { const [a, b] = k.split('|'); add(a, b); add(b, a); }
    const lead = {};
    for (const t of Object.keys(partners)) {
      if (s.overlord[t]) continue;
      let best = t;
      for (const o of partners[t]) if (!s.overlord[o] && pop(o) > pop(best)) best = o;
      lead[t] = best;
    }
    // vassals follow their overlord's leader
    for (const [v, o] of Object.entries(s.overlord)) lead[v] = lead[o] || o;
    if (Object.keys(lead).length) for (const t of Object.keys(lead)) if (lead[lead[t]] && lead[lead[t]] !== lead[t]) lead[t] = lead[lead[t]];
    return lead;
  };

  // alliance blocs (connected groups of allies and vassals) in a year
  P.blocsAt = function (year) {
    const s = this.diplomacyAt(year);
    const parent = {};
    const find = x => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
    const join = (a, b) => { parent[find(a)] = find(b); };
    for (const k of s.allies) { const [a, b] = k.split('|'); join(a, b); }
    for (const [v, o] of Object.entries(s.overlord)) join(v, o);
    const groups = {};
    for (const x of Object.keys(parent)) (groups[find(x)] = groups[find(x)] || []).push(x);
    return Object.values(groups).filter(g => g.length > 1);
  };

  // hook into the yearly round of milestone 2
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyDiplomacy();
  };
  const initDyn = P._initDynasties;
  P._initDynasties = function () { initDyn.call(this); };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    if (afterInit) afterInit.call(this);
    this._initDiplomacy();
    this._yearlyDiplomacy();
  };
  // a royal marriage warms the relations between the two realms
  const logMarriage = P._logMarriage;
  P._logMarriage = function (c, sp) {
    logMarriage.call(this, c, sp);
    if (!this.dip) return;
    for (const x of this._familyRealms(c)) for (const y of this._familyRealms(sp)) if (x !== y) this._remember(x, y, 12);
  };
})(typeof window !== 'undefined' ? window : globalThis);
