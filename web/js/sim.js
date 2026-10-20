// The simulation: characters, births, deaths, marriages and succession.
// Runs month by month. Everything random goes through one seeded Rng, so a seed
// (+ config + interventions) always produces the same timeline.
(function (root) {
  const Rng = root.Rng;

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII',
    'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV'];
  const roman = n => ROMAN[n] || String(n);

  const TRAITS = {
    // trait: [mortality factor, fertility factor, adm, dip, mil] (small nudges)
    ambitious: [1, 1, 0, 0, 1], content: [1, 1, 0, 0, 0], brave: [1.05, 1, 0, 0, 1], craven: [0.97, 1, 0, 0, -1],
    cruel: [1, 1, 0, -1, 0], kind: [1, 1, 0, 1, 0], just: [1, 1, 1, 0, 0], deceitful: [1, 1, 0, 1, 0],
    honest: [1, 1, 0, 0, 0], zealous: [1, 1, 0, -1, 1], cynical: [1, 1, 0, 0, 0], pious: [1, 0.95, 0, 0, 0],
    greedy: [1, 1, 1, -1, 0], generous: [1, 1, -1, 1, 0], diligent: [1, 1, 1, 0, 0], lazy: [1, 1, -1, 0, 0],
    paranoid: [1, 1, 0, -1, 0], trusting: [1, 1, 0, 1, 0], patient: [0.98, 1, 0, 0, 0], wrathful: [1.03, 1, 0, -1, 1],
    scholarly: [1, 1, 1, 0, 0], martial: [1.08, 1, 0, 0, 2], charismatic: [1, 1.05, 0, 2, 0], shy: [1, 0.9, 0, -1, 0],
    lustful: [1.02, 1.3, 0, 0, 0], chaste: [1, 0.6, 0, 0, 0], sickly: [2.2, 0.75, 0, 0, -1], robust: [0.6, 1.1, 0, 0, 1],
    mad: [1.4, 0.8, -2, -2, 0], simple: [1, 1, -2, -1, 0], cunning: [1, 1, 0, 1, 0], frugal: [1, 1, 1, 0, 0],
    extravagant: [1, 1, -1, 1, 0], cautious: [0.97, 1, 0, 0, 0],
  };
  const PERSONALITY = ['ambitious', 'content', 'brave', 'craven', 'cruel', 'kind', 'just', 'deceitful', 'honest',
    'zealous', 'cynical', 'pious', 'greedy', 'generous', 'diligent', 'lazy', 'paranoid', 'trusting', 'patient',
    'wrathful', 'scholarly', 'martial', 'charismatic', 'shy', 'lustful', 'chaste', 'cunning', 'frugal', 'extravagant'];
  const OPPOSITE = { ambitious: 'content', brave: 'craven', cruel: 'kind', just: 'deceitful', honest: 'deceitful',
    zealous: 'cynical', greedy: 'generous', diligent: 'lazy', paranoid: 'trusting', patient: 'wrathful',
    charismatic: 'shy', lustful: 'chaste', frugal: 'extravagant', sickly: 'robust' };
  Object.keys(OPPOSITE).forEach(k => { OPPOSITE[OPPOSITE[k]] = OPPOSITE[OPPOSITE[k]] || k; });

  const PAPAL_NAMES = { Pius: 1, Paul: 1, Sixtus: 3, Innocent: 7, Alexander: 5, Julius: 1, Leo: 9, Adrian: 5,
    Clement: 6, Gregory: 12, Urban: 5, Nicholas: 4, Callixtus: 2, Martin: 5, Eugene: 4, Boniface: 9, Benedict: 11 };

  const TITLE = {
    monarchy: ['King', 'Queen'], republic: ['Doge', 'Doge'], theocracy: ['Prince-Bishop', 'Abbess'],
    order: ['Grand Master', 'Grand Master'], tribal: ['Khan', 'Khatun'],
  };

  const PLURAL = { is: 'are', was: 'were', has: 'have', declares: 'declare', cedes: 'cede', remains: 'remain', becomes: 'become',
    begins: 'begin', takes: 'take', rises: 'rise', loses: 'lose', wins: 'win', breaks: 'break', joins: 'join', votes: 'vote',
    falls: 'fall', cannot: 'cannot', gains: 'gain', marches: 'march', sues: 'sue', returns: 'return', invades: 'invade' };
  const SINGULAR_S = new Set(['Tunis', 'Cyprus', 'Orléans', 'Orleans', 'Athens', 'Paris', 'Brabant', 'Mosquitos']);
  function isPlural(nm) {
    if (SINGULAR_S.has(nm) || / of /.test(nm)) return false;
    return /(ids|ans|ats|uks|ecs|nis|ols|ars|ites|ais|ens|ics|aks)$/.test(nm);
  }

  class Sim {
    constructor(world, opts) {
      this.world = world;
      this.cfg = Object.assign({}, world.config || {}, opts.config || {});
      this.seed = String(opts.seed);
      this.rng = new Rng(this.seed);
      this.interventions = (opts.interventions || []).slice().sort((a, b) => a.t - b.t);
      this.t = (world.start.year * 12) + (world.start.month - 1);   // months since year 0
      this.startT = this.t;
      this.chars = new Map();
      this.living = new Set();
      this.states = {};
      this.events = [];
      this.nextId = 1;
      if (this._initDynasties) this._initDynasties();
      this.yearSnapshots = [];
      this._init();
    }

    // ---------------- helpers ----------------
    year() { return Math.floor(this.t / 12); }
    month() { return (this.t % 12) + 1; }
    dateStr(t = this.t) { return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
    age(c, t = this.t) { return (t - c.born) / 12; }
    alive(c) { return c && c.died == null; }
    char(id) { return this.chars.get(id); }
    culture(c) { return this.world.cultures[c.culture] || this.world.cultures[Object.keys(this.world.cultures)[0]]; }
    log(type, text, refs = {}) {
      // realms with plural names take a plural verb: "the Ottomans are victorious"
      for (const tag of refs.states || []) {
        const nm = this.states[tag] && this.states[tag].name;
        if (nm && isPlural(nm)) text = text.replace(new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (${Object.keys(PLURAL).join('|')})\\b`, 'g'), (m, v) => `${nm} ${PLURAL[v]}`);
      }
      const e = { t: this.t, type, text, states: refs.states || [], chars: refs.chars || [], major: !!refs.major };
      if (refs.war) e.war = refs.war;
      if (refs.pid) e.pid = refs.pid;
      this.events.push(e);
    }
    // the name as people knew it at time t (epithets come after death), in realm `tag`
    nameAt(c, t, tag) {
      if (!c) return '?';
      const regnal = tag && c.regnalByTag && c.regnalByTag[tag];
      let v = regnal ? Object.assign({}, c, { regnalName: regnal }) : c;
      // before the coronation there is no regnal number yet
      const crowned = c.crownedAt ? Math.min(...Object.values(c.crownedAt)) : null;
      if (crowned != null && crowned > t) v = Object.assign({}, c, { regnalName: null });
      if (c.died != null && c.died <= t) return this.fullName(v);
      return this.fullName(Object.assign({}, v, { epithet: null }));
    }
    nameIn(c, tag) {
      const regnal = tag && c && c.regnalByTag && c.regnalByTag[tag];
      return this.fullName(regnal ? Object.assign({}, c, { regnalName: regnal }) : c);
    }

    fullName(c, withTitle = false) {
      if (!c) return '?';
      let n = c.name;
      if (c.regnalName) n = c.regnalName;
      else if (c.dynasty && (c.cleric || c.republican)) n = `${c.name} ${c.dynasty}`;   // e.g. Francesco Foscari
      if (c.epithet) n += ' ' + c.epithet;
      return n;
    }

    // ---------------- set-up ----------------
    _init() {
      const W = this.world;
      if (!W.provById) { W.provById = {}; for (const p of W.provinces) W.provById[p.id] = p; }
      for (const [tag, s] of Object.entries(W.states)) {
        this.states[tag] = {
          tag, name: s.name, government: s.government || 'monarchy', succession: s.succession || 'primogeniture',
          culture: s.culture, religion: s.religion, ruler: null, regent: null, history: [],
          regnalCounts: Object.assign({}, s.regnal_counts || {}), fallback: (s.fallback_heirs || []).slice(),
          hasCounts: !!(s.regnal_counts && Object.keys(s.regnal_counts).length),
          dynasty: null,
        };
      }
      // curated characters
      const start = this.t;
      for (const c of W.characters) {
        const born = c.born * 12 + this.rng.int(0, 11);
        const ch = this._newChar({
          id: c.id, name: c.name, sex: c.sex || 'm', born: Math.min(born, start - 1), dynasty: c.dynasty || null,
          father: c.father || null, mother: c.mother || null, traits: (c.traits || []).filter(x => TRAITS[x]),
          adm: c.adm, dip: c.dip, mil: c.mil, culture: c.culture, religion: c.religion,
          epithet: c.epithet || null, illegitimate: !!c.illegitimate, historical: true,
        });
        ch.home = c.tag || null;
        if (c.died != null) { ch.died = c.died * 12 + 6; this.living.delete(ch); }
        else ch.epithet = null;          // epithets are earned in this timeline, not borrowed from ours
        if (c.regnal) ch.regnalName = `${c.name} ${c.regnal}`;
        ch.spouseRef = c.spouse || null;
      }
      for (const ch of this.chars.values()) {
        if (ch.spouseRef && this.chars.has(ch.spouseRef)) {
          const sp = this.chars.get(ch.spouseRef);
          if (this.alive(sp) && this.alive(ch)) { ch.spouse = sp.id; sp.spouse = ch.id; }
          ch.marriages = [{ spouse: sp.id, t: null }];
        }
        delete ch.spouseRef;
        for (const p of [ch.father, ch.mother]) {
          const pc = p && this.chars.get(p);
          if (pc && !pc.children.includes(ch.id)) pc.children.push(ch.id);
        }
      }
      // rulers
      for (const [tag, s] of Object.entries(W.states)) {
        const st = this.states[tag];
        let ruler = s.ruler && this.chars.get(s.ruler);
        if (!ruler || !this.alive(ruler)) ruler = this._generateRuler(tag);
        if (st.government === 'theocracy' || st.government === 'order') ruler.cleric = true;
        if (!ruler.regnalName && st.hasCounts) st.regnalCounts[ruler.name] = Math.max(1, st.regnalCounts[ruler.name] || 0);
        this._setRuler(tag, ruler, { initial: true });
        if (s.regent && this.chars.get(s.regent)) { st.regent = s.regent; const rg = this.chars.get(s.regent); (rg.regentOf = rg.regentOf || []).push(tag); }
        // a historical ruler without known family gets a plausible one
        if (!ruler.historical || (!ruler.children.length && !ruler.spouse && W.characters_generate_family !== false)) {
          this._generateFamily(ruler);
        }
      }
      for (const c of this.chars.values()) this._updateRoyal(c);
      if (this._afterInit) this._afterInit();
      this.log('start', `The world on 1 January ${this.year()}.`, { major: true });
      this._snapshot();
    }

    _newChar(o) {
      const id = o.id || `g${this.nextId++}`;
      const c = {
        id, name: o.name, sex: o.sex, born: o.born, died: null, dynasty: o.dynasty, father: o.father || null,
        mother: o.mother || null, spouse: null, children: [], traits: o.traits || [], titles: [],
        adm: o.adm ?? null, dip: o.dip ?? null, mil: o.mil ?? null, culture: o.culture || null, religion: o.religion || null,
        epithet: o.epithet || null, regnalName: null, historical: !!o.historical, illegitimate: !!o.illegitimate,
        royal: 9, cleric: !!o.cleric, deathCause: null, everRuled: false, home: o.home || null,
      };
      if (c.adm == null) this._rollStats(c);
      if (!c.traits.length) this._rollTraits(c);
      this.chars.set(id, c);
      if (this.living) this.living.add(c);
      if (this._dynAdd) this._dynAdd(c);
      return c;
    }

    _rollStats(c) {
      const f = c.father && this.chars.get(c.father), m = c.mother && this.chars.get(c.mother);
      for (const k of ['adm', 'dip', 'mil']) {
        let base = 2.4;
        if (f && f[k] != null && m && m[k] != null) base = (f[k] + m[k]) / 2 * 0.4 + 2.4 * 0.6;
        let v = Math.round(this.rng.normal(base, 1.4));
        for (const t of c.traits || []) v += (TRAITS[t] ? TRAITS[t][2 + ['adm', 'dip', 'mil'].indexOf(k)] : 0) * 0.5;
        c[k] = Math.max(0, Math.min(6, Math.round(v)));
      }
    }

    _rollTraits(c) {
      const out = [];
      const n = this.rng.int(1, 3);
      const f = c.father && this.chars.get(c.father);
      for (let i = 0; i < 20 && out.length < n; i++) {
        let t = this.rng.pick(PERSONALITY);
        if (f && this.rng.chance(0.2)) t = this.rng.pick(f.traits.length ? f.traits : PERSONALITY);
        if (!TRAITS[t] || out.includes(t) || out.includes(OPPOSITE[t])) continue;
        if (t === 'sickly' || t === 'robust' || t === 'mad') continue;
        out.push(t);
      }
      if (this.rng.chance(0.08)) out.push('sickly');
      else if (this.rng.chance(0.08)) out.push('robust');
      if (this.rng.chance(0.012 * (this.cfg.madness || 1))) out.push('mad');
      c.traits = out;
    }

    _pickName(c, cultureKey) {
      const cul = this.world.cultures[cultureKey] || this.culture(c);
      const list = (cul && cul.names && cul.names[c.sex === 'f' ? 'f' : 'm']) || ['John'];
      // dynastic naming: often reuse names of ancestors
      const fam = [];
      const add = id => { const x = id && this.chars.get(id); if (x && x.sex === c.sex) fam.push(x.name); };
      const fa = c.father && this.chars.get(c.father), mo = c.mother && this.chars.get(c.mother);
      add(c.father); add(c.mother);
      if (fa) { add(fa.father); add(fa.mother); }
      if (mo) { add(mo.father); add(mo.mother); }
      if (fam.length && this.rng.chance(0.45)) return this.rng.pick(fam);
      // earlier names in a list are more common
      const i = Math.floor(Math.pow(this.rng.next(), 1.7) * list.length);
      return list[i];
    }

    _cultureOf(tag) {
      const s = this.states[tag] && this.states[tag].culture ? this.states[tag] : this.world.states[tag];
      return (s && s.culture) || Object.keys(this.world.cultures)[0];
    }
    _religionOf(tag) {
      const s = this.states[tag] && this.states[tag].religion ? this.states[tag] : this.world.states[tag];
      return (s && s.religion) || 'catholic';
    }

    _newDynastyName(cultureKey, unique) {
      const cul = this.world.cultures[cultureKey];
      const list = (cul && cul.dynasties) || [];
      if (!list.length) return null;
      if (!unique) return this.rng.pick(list);
      // a new ruling house: prefer a name no ruling family uses yet
      const used = new Set(Object.values(this.states).map(st => st.dynasty));
      const free = list.filter(d => !used.has(d));
      if (free.length) return this.rng.pick(free);
      const a = this.rng.pick(list), b = this.rng.pick(list.filter(x => x !== a)) || a;
      return a === b ? a : `${a}-${b}`;
    }

    _generateRuler(tag, opts = {}) {
      const st = this.states[tag];
      const cul = this._cultureOf(tag);
      const gov = st.government;
      const cleric = gov === 'theocracy' || gov === 'order';
      const ageY = opts.age ?? (gov === 'republic' ? this.rng.int(44, 64) : cleric ? this.rng.int(42, 66) : this.rng.int(18, 50));
      const c = this._newChar({
        name: null, sex: 'm', born: this.t - ageY * 12 - this.rng.int(0, 11),
        dynasty: opts.dynasty || this._newDynastyName(cul, !cleric && gov !== 'republic'), culture: cul, religion: this._religionOf(tag),
        cleric, home: tag,
      });
      c.name = this._pickName(c, cul);
      if (cleric) c.traits = c.traits.filter(t => t !== 'lustful');
      if (gov === 'republic') c.republican = true;
      return c;
    }

    _generateFamily(ruler) {
      // spouse + children consistent with the ruler's age (only for rulers without known family)
      if (ruler.cleric || this.states[ruler.titles[0]]?.government === 'republic') return;
      const a = this.age(ruler);
      if (a < 17) return;
      const cul = ruler.culture || this._cultureOf(ruler.titles[0]);
      const sp = this._newChar({
        name: null, sex: ruler.sex === 'm' ? 'f' : 'm',
        born: ruler.born + (ruler.sex === 'm' ? this.rng.int(12, 120) : this.rng.int(-120, 24)),
        dynasty: this._newDynastyName(cul), culture: cul, religion: ruler.religion, home: ruler.titles[0],
      });
      sp.name = this._pickName(sp, cul);
      if (this.age(sp) < 15) { this.chars.delete(sp.id); return; }
      ruler.spouse = sp.id; sp.spouse = ruler.id;
      ruler.marriages = [{ spouse: sp.id, t: null }]; sp.marriages = [{ spouse: ruler.id, t: null }];
      const mother = ruler.sex === 'f' ? ruler : sp, father = ruler.sex === 'm' ? ruler : sp;
      let t = Math.max(mother.born + 17 * 12, father.born + 18 * 12) + this.rng.int(0, 24);
      while (t < this.t && (t - mother.born) / 12 < 42) {
        if (this.rng.chance(0.75)) {
          const ch = this._birth(father, mother, t, true);
          // historical child mortality before the start
          const ageNow = (this.t - t) / 12;
          if (this.rng.chance(Math.min(0.45, 0.2 + ageNow * 0.02))) {
            ch.died = t + this.rng.int(1, Math.max(1, this.t - t - 1));
            ch.deathCause = 'illness';
            this.living.delete(ch);
          }
        }
        t += this.rng.int(14, 34);
      }
    }

    _birth(father, mother, t, silent) {
      const c = this._newChar({
        name: null, sex: this.rng.chance(0.51) ? 'm' : 'f', born: t, dynasty: father.dynasty || mother.dynasty,
        father: father.id, mother: mother.id, culture: father.culture || mother.culture,
        religion: father.religion || mother.religion,
        home: father.titles[0] || mother.titles[0] || father.home || mother.home,
      });
      c.name = this._pickName(c, c.culture);
      father.children.push(c.id);
      mother.children.push(c.id);
      this._updateRoyal(c);
      if (!silent && (father.titles.length || mother.titles.length)) {
        const parent = father.titles.length ? father : mother;
        this.log('birth', `${this.fullName(parent)} ${parent.titles.length ? 'of ' + this.states[parent.titles[0]].name : ''} has a ${c.sex === 'm' ? 'son' : 'daughter'}, ${c.name}.`,
          { states: parent.titles.slice(), chars: [c.id, parent.id] });
      }
      return c;
    }

    _updateRoyal(c) {
      // distance (in generations) to the nearest ruler; only close relatives are simulated in detail
      if (c.titles.length || c.everRuled) { c.royal = 0; return; }
      let d = 9;
      for (const p of [c.father, c.mother]) {
        const pc = p && this.chars.get(p);
        if (pc) d = Math.min(d, pc.royal + 1);
      }
      c.royal = d;
    }

    // ---------------- the monthly tick ----------------
    step() {
      this.t++;
      const living = [...this.living];
      if (this.interventions.length) for (const iv of this.interventions) if (iv.t === this.t) this._applyIntervention(iv);
      // rulers every month; everyone else once a quarter (three months' worth of chance at once)
      const quarter = this.t % 3 === 0;
      for (const c of living) if (c.royal === 0 || quarter) this._mortality(c, c.royal === 0 ? 1 : 3);
      for (const c of living) if ((c.royal === 0 || quarter) && c.died == null && c.sex === 'f' && c.spouse) this._fertility(c, c.royal === 0 ? 1 : 3);
      this._marriagePool = null;
      if (quarter) for (const c of living) if (c.died == null && c.royal <= 1 && !c.cleric) this._marriage(c, 3);
      if (this.month() === 1) { this._regencies(); if (this._yearly) this._yearly(); }
      if (this._monthly) this._monthly();
      if (this.month() === 12) this._snapshot();
    }

    run(untilYear, onYear) {
      while (this.year() < untilYear) {
        this.step();
        if (onYear && this.month() === 12) onYear(this);
      }
    }

    _mortality(c, months = 1) {
      // the monthly death chance is recomputed once a year (it only changes with age)
      if (c._pmT == null || this.t - c._pmT >= 12) {
        const a = this.age(c);
        let h;   // yearly hazard
        if (a < 1) h = 0.16; else if (a < 5) h = 0.035; else if (a < 15) h = 0.008;
        else h = 0.006 * Math.exp(0.073 * (a - 15));
        for (const t of c.traits) if (TRAITS[t]) h *= TRAITS[t][0];
        h *= (this.cfg.mortality ?? 1) * (this.ageMortality ? this.ageMortality() : 1);
        c._pm = 1 - Math.pow(1 - Math.min(h, 0.95), 1 / 12);
        c._pmT = this.t;
      }
      const pm = months === 1 ? c._pm : 1 - Math.pow(1 - c._pm, months);
      if (this.rng.chance(pm)) {
        const a = this.age(c);
        let cause = 'natural causes';
        if (a < 15) cause = this.rng.pick(['a fever', 'illness', 'a sudden illness', 'the pox']);
        else if (a < 50) cause = this.rng.weighted(['illness', 'a fever', 'a hunting accident', 'a fall from a horse', 'dysentery', 'a wasting disease', 'poison, it was whispered'],
          x => ({ 'a hunting accident': c.traits.includes('brave') || c.traits.includes('martial') ? 3 : 1, 'poison, it was whispered': c.titles.length ? 1.2 : 0.2 })[x] || 2);
        else cause = this.rng.pick(['old age', 'illness', 'a stroke', 'a fever', 'natural causes', 'gout']);
        this._die(c, cause);
      }
    }

    _fertility(c, months = 1) {
      if (c.sex !== 'f' || !c.spouse) return;
      const h = this.chars.get(c.spouse);
      if (!this.alive(h)) return;
      if (c.royal > 1 && h.royal > 1) return;        // distant relatives: not tracked further
      if (c.cleric || h.cleric) return;
      const a = this.age(c);
      if (a < 16 || a > 45) return;
      if (c.lastBirth && this.t - c.lastBirth < 11) return;
      let p = 0.026 * (a > 35 ? 0.5 : a > 30 ? 0.8 : 1);
      for (const t of c.traits) if (TRAITS[t]) p *= Math.sqrt(TRAITS[t][1]);
      for (const t of h.traits) if (TRAITS[t]) p *= Math.sqrt(TRAITS[t][1]);
      p *= (this.cfg.fertility ?? 1) * months;
      if (this.rng.chance(p)) {
        c.lastBirth = this.t;
        const kid = this._birth(h, c, this.t, false);
        if (this.rng.chance(0.012)) this._birth(h, c, this.t, false);   // twins
        if (this.rng.chance(0.012)) this._die(c, 'childbirth');
        if (kid && this._isHeirOfAny(kid)) {
          kid.importantBirth = true;
        }
      }
    }

    _isHeirOfAny(c) { return false; }

    _marriage(c) {
      if (c.spouse && this.alive(this.chars.get(c.spouse))) return;
      if (c.cleric || c.royal > 1) return;
      const a = this.age(c);
      const min = c.sex === 'f' ? 15 : 17;
      if (a < min || a > (c.sex === 'f' ? 40 : 55)) return;
      let p = (c.titles.length ? 0.55 : 0.32) / 12;
      if (c.spouse) p *= 0.6;   // widowed
      if (a > 30 && !c.titles.length) p *= 0.5;
      if (!this.rng.chance(p)) return;
      // prefer a spouse from another ruling family of the same religion
      const rel = c.religion;
      const relGroup = r => (this.world.religions[r] || {}).group || r;
      const cands = [];
      if (!this._marriagePool) this._marriagePool = [...this.living].filter(o => this.alive(o) && !o.cleric && o.royal <= 1 && !(o.spouse && this.alive(this.chars.get(o.spouse))));
      for (const o of this._marriagePool) {
        if (!this.alive(o) || o.sex === c.sex || o.cleric || o.royal > 1) continue;
        if (o.spouse && this.alive(this.chars.get(o.spouse))) continue;
        if (o.dynasty && o.dynasty === c.dynasty) continue;
        const oa = this.age(o);
        if (oa < (o.sex === 'f' ? 15 : 17) || Math.abs(oa - a) > 12) continue;
        if (relGroup(o.religion) !== relGroup(rel)) continue;
        if (!this._nearChars(c, o)) continue;
        if (this._closeKin(c, o)) continue;
        cands.push(o);
      }
      let sp = null;
      const royalBias = this.cfg.royal_marriages ?? 0.55;
      if (cands.length && this.rng.chance(royalBias)) {
        sp = this.rng.weighted(cands, o => (o.titles.length ? 4 : 1) * (o.royal === 0 ? 2 : 1) *
          (o.culture === c.culture ? 2 : 1) * (1 / (1 + Math.abs(this.age(o) - a))));
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
      const ruler = [c, sp].find(x => x.titles.length);
      const desc = x => this.fullName(x) + (x.titles.length ? ` of ${this.states[x.titles[0]].name}` : x.dynasty ? ` of ${x.dynasty}` : '');
      if (c.royal <= 1 || sp.royal <= 1) {
        const states = [...new Set([...c.titles, ...sp.titles, ...this._houseStates(c), ...this._houseStates(sp)])];
        this.log('marriage', `${desc(c)} marries ${desc(sp)}.`, { states, chars: [c.id, sp.id], major: !!ruler });
      }
    }

    _wed(a, b) {
      a.spouse = b.id; b.spouse = a.id;
      (a.marriages = a.marriages || []).push({ spouse: b.id, t: this.t });
      (b.marriages = b.marriages || []).push({ spouse: a.id, t: this.t });
    }

    _houseStates(c) {
      const out = [];
      for (const p of [c.father, c.mother]) {
        const pc = p && this.chars.get(p);
        if (pc) out.push(...pc.titles);
      }
      return out;
    }

    _closeKin(a, b) {
      const anc = (c, d) => {
        const s = new Set([c.id]);
        let lvl = [c];
        for (let i = 0; i < d; i++) {
          const nx = [];
          for (const x of lvl) for (const p of [x.father, x.mother]) {
            const pc = p && this.chars.get(p);
            if (pc && !s.has(pc.id)) { s.add(pc.id); nx.push(pc); }
          }
          lvl = nx;
        }
        return s;
      };
      const A = anc(a, 2);
      for (const x of anc(b, 2)) if (A.has(x)) return true;
      return false;
    }

    // ---------------- death & succession ----------------
    _die(c, cause) {
      if (!this.alive(c)) return;
      c.died = this.t;
      c.deathCause = cause;
      this.living.delete(c);
      const titles = c.titles.slice();
      if (titles.length) {
        const age = Math.floor(this.age(c));
        const where = titles.map(t => this.states[t].name).join(', ');
        this._giveEpithet(c);
        this.log('death', `${this.fullName(c)} of ${where} dies of ${cause} at the age of ${age}.`,
          { states: titles, chars: [c.id], major: true });
        for (const tag of titles) this._succession(tag, c);
        if (this._afterDeathOfRuler) this._afterDeathOfRuler(c, titles);
      } else if (c.royal <= 1 && this.age(c) >= 1) {
        const p = [c.father, c.mother].map(x => x && this.chars.get(x)).find(x => x && x.titles.length);
        if (p) this.log('death', `${c.name}, ${c.sex === 'm' ? 'son' : 'daughter'} of ${this.fullName(p)}, dies of ${cause} aged ${Math.floor(this.age(c))}.`,
          { states: p.titles.slice(), chars: [c.id, p.id] });
      }
      if (c.regentOf) for (const tag of c.regentOf) if (this.states[tag].regent === c.id) this.states[tag].regent = null;
    }

    _giveEpithet(c) {
      if (c.epithet || c.cleric) return;
      if (c.titles.every(t => ['republic', 'theocracy', 'order'].includes(this.states[t].government))) return;
      const reign = c.reignStart != null ? (this.t - c.reignStart) / 12 : 10;
      const age = this.age(c);
      const T = c.traits;
      const opts = [];
      const skill = (c.adm || 0) + (c.dip || 0) + (c.mil || 0);
      if (T.includes('mad')) opts.push(['the Mad', 6]);
      if (skill >= 15 && reign > 15) opts.push(['the Great', 5]);
      if (T.includes('cruel')) opts.push([this.rng.pick(['the Cruel', 'the Terrible', 'the Grim']), 3]);
      if (T.includes('pious') || T.includes('zealous')) opts.push([this.rng.pick(['the Pious', 'the Devout']), 2.5]);
      if (T.includes('scholarly')) opts.push([this.rng.pick(['the Wise', 'the Learned']), 2.5]);
      if (T.includes('just')) opts.push(['the Just', 2.5]);
      if (T.includes('kind') && T.includes('just')) opts.push(['the Good', 3]);
      if (T.includes('brave') || (c.mil || 0) >= 5) opts.push([this.rng.pick(['the Bold', 'the Lion', 'the Valiant']), 2]);
      if (T.includes('lazy')) opts.push(['the Idle', 1.5]);
      if (T.includes('greedy')) opts.push(['the Grasping', 1.5]);
      if (T.includes('generous')) opts.push(['the Generous', 1.5]);
      if (T.includes('extravagant')) opts.push(['the Magnificent', 1.5]);
      if (T.includes('lustful')) opts.push(['the Amorous', 1.2]);
      if (T.includes('chaste')) opts.push(['the Chaste', 1.2]);
      if (T.includes('cunning') || T.includes('deceitful')) opts.push(['the Fox', 1.2]);
      if (T.includes('paranoid')) opts.push(['the Suspicious', 1.2]);
      if (T.includes('sickly')) opts.push(['the Frail', 1.2]);
      if (T.includes('robust')) opts.push(['the Strong', 1.2]);
      if (age < 25) opts.push(['the Young', 2]);
      if (age > 74) opts.push(['the Old', 2]);
      if (c.reignStart != null && reign < 1 && age > 16) opts.push(['the Brief', 2]);
      if (reign > 40) opts.push(['the Long-Reigning', 1]);
      if (skill <= 4) opts.push(['the Unready', 1.5]);
      if (!opts.length || !this.rng.chance(0.42)) return;
      c.epithet = this.rng.weighted(opts, o => o[1])[0];
    }

    _setRuler(tag, c, info = {}) {
      const st = this.states[tag];
      const prev = st.ruler && this.chars.get(st.ruler);
      if (prev) prev.titles = prev.titles.filter(x => x !== tag);
      st.ruler = c.id;
      if (!c.titles.includes(tag)) c.titles.push(tag);
      c.everRuled = true;
      c.royal = 0;
      c.crownedAt = c.crownedAt || {};
      if (c.crownedAt[tag] == null) c.crownedAt[tag] = info.initial ? -Infinity : this.t;
      if (c.reignStart == null && !info.initial) c.reignStart = this.t;
      // regnal name
      if (!info.initial || !c.regnalName) this._assignRegnal(tag, c);
      if (info.initial && c.regnalName) { c.regnalByTag = c.regnalByTag || {}; c.regnalByTag[tag] = c.regnalByTag[tag] || c.regnalName; }
      st.dynasty = c.dynasty;
      st.history.push({ char: c.id, from: this.t, to: null, how: info.how || (info.initial ? 'start' : 'inherited') });
      if (prev) {
        const h = st.history[st.history.length - 2];
        if (h && h.to == null) h.to = this.t;
      }
      // regency for minors
      st.regent = null;
      if (this.age(c) < 16 && st.government !== 'republic') {
        const reg = this._findRegent(c, tag);
        if (reg) {
          st.regent = reg.id;
          (reg.regentOf = reg.regentOf || []).push(tag);
          if (!info.initial) this.log('regency', `${this.fullName(reg)} becomes regent of ${st.name} for the young ${this.fullName(c)}.`,
            { states: [tag], chars: [reg.id, c.id] });
        }
      }
      // relatives within reach of the throne are now tracked closely
      for (const id of c.children) { const k = this.chars.get(id); if (k) this._updateRoyal(k); }
    }

    _assignRegnal(tag, c) {
      const st = this.states[tag];
      const gov = st.government;
      if (gov === 'republic' || (gov === 'theocracy' && tag !== 'PAP') || gov === 'order') return;
      if (c.regnalByTag && c.regnalByTag[tag]) return;     // a restored ruler keeps his number
      let name = c.name;
      if (tag === 'PAP') {
        name = this.rng.weighted(Object.keys(PAPAL_NAMES), n => 1 + (st.regnalCounts[n] || PAPAL_NAMES[n]) * 0.3);
        st.regnalCounts[name] = st.regnalCounts[name] ?? PAPAL_NAMES[name];
        c.papalName = name;
      }
      const n = (st.regnalCounts[name] || 0) + 1;
      st.regnalCounts[name] = n;
      // numbering where the realm keeps count (from the data or because the name came back)
      const keepsCount = st.hasCounts || n > 1;
      const rn = keepsCount ? `${name} ${roman(n)}` : name;
      c.regnalByTag = c.regnalByTag || {};
      c.regnalByTag[tag] = rn;
      if (!c.regnalName || c.titles.length <= 1) c.regnalName = rn;   // known by the name of the first crown
    }

    _findRegent(c, tag) {
      const mother = c.mother && this.chars.get(c.mother);
      if (mother && this.alive(mother) && this.age(mother) >= 18) return mother;
      // an adult uncle or elder half-brother
      const fa = c.father && this.chars.get(c.father);
      const gf = fa && fa.father && this.chars.get(fa.father);
      const uncles = gf ? gf.children.map(id => this.chars.get(id)).filter(x => x && x.sex === 'm' && this.alive(x) && x.id !== fa.id && this.age(x) >= 20) : [];
      if (uncles.length) return uncles[0];
      // a noble of the realm
      const r = this._generateRuler(tag, { age: this.rng.int(35, 60) });
      r.cleric = false;
      return r;
    }

    // candidate list by (male-preference or agnatic) primogeniture from the family tree
    _lineOfSuccession(dead, law, limit = 8, t = this.t) {
      const out = [];
      const seen = new Set([dead.id]);
      const male = law === 'salic';
      const aliveAt = c => c.born <= t && (c.died == null || c.died > t);
      const visit = (c, depthOk) => {
        // children ordered: sons by age then daughters by age (male preference)
        const kids = c.children.map(id => this.chars.get(id)).filter(k => k && !k.illegitimate && k.born <= t);
        kids.sort((a, b) => (a.sex === b.sex ? a.born - b.born : a.sex === 'm' ? -1 : 1));
        for (const k of kids) {
          if (seen.has(k.id)) continue;
          seen.add(k.id);
          if (male && k.sex === 'f') continue;
          if (aliveAt(k) && !k.cleric) out.push(k);
          if (out.length >= limit) return;
          visit(k);
          if (out.length >= limit) return;
        }
      };
      visit(dead);
      // then the dead ruler's siblings' lines, then uncles' lines (up to 4 generations up)
      let cur = dead;
      for (let up = 0; up < 4 && out.length < limit; up++) {
        const parent = cur.father && this.chars.get(cur.father) || (!male && cur.mother && this.chars.get(cur.mother));
        if (!parent) break;
        seen.add(parent.id);
        if (aliveAt(parent) && !parent.cleric && !(male && parent.sex === 'f')) out.push(parent);
        visit(parent);
        cur = parent;
      }
      return out;
    }

    _succession(tag, dead) {
      const st = this.states[tag];
      const law = st.succession;
      const gov = st.government;
      let heir = null, how = 'inherited', crisis = false;

      if (law === 'republic' || law === 'theocracy' || gov === 'republic' || gov === 'theocracy' || gov === 'order') {
        heir = this._generateRuler(tag);
        how = 'elected';
      } else if (law === 'elective') {
        const line = this._lineOfSuccession(dead, 'primogeniture', 4).filter(x => this.age(x) >= 16 || this.rng.chance(0.12));
        const roll = this.rng.next();
        const continuity = this.cfg.elective_continuity ?? 0.7;
        if (line.length && roll < continuity) { heir = line[0]; how = 'elected'; }
        else {
          // a foreign prince (only Christian electoral crowns did this) or a native noble
          const christian = (this.world.religions[this._religionOf(tag)] || {}).group === 'christian';
          const foreign = !christian ? [] : [...this.living].filter(x => this.alive(x) && x.sex === 'm' && x.royal <= 1 && !x.cleric && !x.republican &&
            this.age(x) >= 16 && x.dynasty !== dead.dynasty && this._sameFaith(x, tag) && this._near(x, tag, 1100));
          const rel = foreign.filter(x => this._relatedByMarriage(x, dead));
          if (rel.length && this.rng.chance(0.6)) heir = this.rng.pick(rel);
          else if (foreign.length && this.rng.chance(0.25)) {
            // electors look for a prince of a great house (milestone 2: prestige)
            heir = this.rng.weighted(foreign, x => (x.titles.length ? 3 : 1) * (1 + (this.prestigeOf ? this.prestigeOf(x) : 0) / 20) *
              ((this.world.cultures[x.culture] || {}).group === (this.world.cultures[this._cultureOf(tag)] || {}).group ? 2 : 1));
          }
          if (!heir) heir = this._generateRuler(tag, { age: this.rng.int(20, 50) });
          how = 'elected';
          if (line.length) crisis = this.rng.chance(0.5);
        }
      } else if (law === 'open') {
        const sons = dead.children.map(id => this.chars.get(id)).filter(k => k && this.alive(k) && k.sex === 'm');
        if (sons.length) {
          heir = this.rng.weighted(sons, k => (this.age(k) >= 16 ? 4 : 1) * (1 + k.mil + k.adm) * (k.traits.includes('ambitious') ? 1.5 : 1));
          const adultRivals = sons.filter(k => k !== heir && this.age(k) >= 16);
          if (adultRivals.length) {
            crisis = true;
            if (this.rng.chance(this.cfg.fratricide ?? 0.6) && this.age(heir) >= 16) {
              for (const r of adultRivals) this._die(r, 'strangulation on his brother\'s orders');
              this.log('crisis', `${heir.name} secures the throne of ${st.name}; his brothers are put to death.`, { states: [tag], chars: [heir.id], major: true });
            } else {
              this.log('crisis', `${heir.name} and his brothers contest the throne of ${st.name}.`, { states: [tag], chars: [heir.id, ...adultRivals.map(r => r.id)], major: true });
            }
          }
        } else {
          heir = this._lineOfSuccession(dead, 'salic', 1)[0];
        }
      } else if (law === 'seniority') {
        const pool = this.dynasties && this.dynasties[dead.dynasty] ? this.dynasties[dead.dynasty].members.map(id => this.chars.get(id)) : [...this.living];
        const dyn = pool.filter(x => x && this.alive(x) && x.sex === 'm' && x.dynasty === dead.dynasty &&
          !x.cleric && !x.republican && this.age(x) >= 16 && this._near(x, tag));
        dyn.sort((a, b) => (a.titles.length - b.titles.length) || (a.born - b.born));
        heir = dyn[0] || this._lineOfSuccession(dead, 'salic', 1)[0];
      } else {
        heir = this._lineOfSuccession(dead, law === 'salic' ? 'salic' : 'primogeniture', 4).find(x => this._sameFaith(x, tag)) || null;
      }

      // a natural son may be legitimised
      if (!heir && this._legitimise && (law === 'primogeniture' || law === 'salic')) {
        heir = this._legitimise(tag, dead);
        if (heir) { how = 'legitimised'; crisis = true; }
      }
      // fallback claimants from the data (e.g. Richard of York)
      if (!heir) {
        while (st.fallback.length && !heir) {
          const f = this.chars.get(st.fallback.shift());
          if (f && this.alive(f)) heir = f;
          else if (f) heir = this._lineOfSuccession(f, law === 'salic' ? 'salic' : 'primogeniture', 1)[0] || null;
        }
        if (heir) how = 'claimed';
      }
      // salic law failed: a female-line relative may claim (crisis)
      if (!heir && law === 'salic') {
        heir = this._lineOfSuccession(dead, 'primogeniture', 3).find(x => x.sex === 'm') || null;
        if (heir) { how = 'claimed through the female line'; crisis = true; }
      }
      if (!heir) {
        // the dynasty is extinct: a related prince from abroad or a new native house
        const rel = [...this.living].filter(x => this.alive(x) && x.royal <= 1 && !x.cleric && !x.republican && this.age(x) >= 14 &&
          this._relatedByMarriage(x, dead) && this._sameFaith(x, tag) && this._near(x, tag, 900));
        if (rel.length && this.rng.chance(0.55)) { heir = this.rng.pick(rel); how = 'claimed by marriage ties'; }
        else { heir = this._generateRuler(tag, { age: this.rng.int(22, 50) }); how = 'raised to the throne'; this._generateFamily(heir); }
        crisis = true;
        this.log('crisis', `The ${dead.dynasty ? 'House of ' + dead.dynasty : 'line'} dies out in ${st.name}. A succession crisis follows.`, { states: [tag], chars: [dead.id], major: true });
      }

      const otherCrowns = heir.titles.filter(x => x !== tag);
      this._setRuler(tag, heir, { how });
      const name = this.nameIn(heir, tag);
      let txt;
      if (how === 'elected') {
        const role = gov === 'republic' ? ({ VEN: 'Doge', GEN: 'Doge', FLO: 'Gonfaloniere', NOV: 'Posadnik', PSK: 'Posadnik', SWI: 'Landammann' }[tag] || 'head')
          : tag === 'PAP' ? 'Pope' : gov === 'order' ? 'Grand Master' : gov === 'theocracy' ? 'Prince-Bishop' : 'monarch';
        txt = tag === 'PAP' ? `${this.fullName(Object.assign({}, heir, { regnalName: null, epithet: null }))} is elected Pope and takes the name ${heir.regnalName}.`
          : `${name} is elected ${role} of ${st.name}.`;
      } else if (how === 'inherited') {
        const rel = this._relationTo(heir, dead);
        txt = `${name}, ${rel}, succeeds to the throne of ${st.name}.`;
      } else {
        txt = `${name} takes the throne of ${st.name} (${how}).`;
      }
      if (this.age(heir) < 16 && gov !== 'republic') txt += ` He is only ${Math.floor(this.age(heir))}.`.replace('He', heir.sex === 'f' ? 'She' : 'He');
      this.log('succession', txt, { states: [tag], chars: [heir.id, dead.id], major: true });
      const ukey = heir.id + '@' + this.t;
      if (otherCrowns.length && this._lastUnion !== ukey) {
        this._lastUnion = ukey;
        this.log('union', `${name} now wears the crowns of ${[tag, ...otherCrowns].map(x => this.states[x].name).join(' and ')}: a personal union.`,
          { states: [tag, ...otherCrowns], chars: [heir.id], major: true });
      }
      if (crisis) st.contested = (st.contested || 0) + 1;
      if (this._afterSuccession) this._afterSuccession(tag, dead, heir, how, crisis);
    }

    // a claimant must share the realm's faith and live (or rule) within reach of it
    _sameFaith(x, tag) {
      const g = r => (this.world.religions[r] || {}).group || r;
      return g(x.religion) === g(this._religionOf(tag));
    }
    _capital(tag) {
      if (this.capitalOf && this.capitalOf[tag]) return this.world.provById[this.capitalOf[tag]];
      const s = (this.stateInfo && this.stateInfo[tag]) || this.world.states[tag];
      return s && this.world.provById[s.capital];
    }
    _near(x, tag, km = 1600) {
      const here = this._capital(tag);
      if (!here) return true;
      const places = x.titles.length ? x.titles : this._homeTags(x);
      if (!places.length) return (this.world.cultures[x.culture] || {}).group === (this.world.cultures[this._cultureOf(tag)] || {}).group;
      return places.some(t => {
        const c = this._capital(t);
        return c && this._dist(c.lonlat, here.lonlat) < km;
      });
    }
    _nearChars(a, b, km = 2000) {
      const pa = (a.titles.length ? a.titles : this._homeTags(a)).map(t => this._capital(t)).filter(Boolean);
      const pb = (b.titles.length ? b.titles : this._homeTags(b)).map(t => this._capital(t)).filter(Boolean);
      if (!pa.length || !pb.length) return true;
      return pa.some(x => pb.some(y => this._dist(x.lonlat, y.lonlat) < km));
    }
    _homeTags(x) {
      return x.home && this.states[x.home] ? [x.home] : [];
    }
    _dist(a, b) {
      const r = Math.PI / 180;
      const s = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(s));
    }

    _relatedByMarriage(x, dead) {
      // x is a spouse or child of a spouse of dead's close family
      const fam = new Set([dead.id, dead.father, dead.mother, ...dead.children]);
      const sp = x.spouse && this.chars.get(x.spouse);
      if (sp && fam.has(sp.id)) return true;
      if (x.mother && fam.has(x.mother)) return true;
      return false;
    }

    _relationTo(heir, dead) {
      const he = heir.sex === 'm';
      if (heir.father === dead.id || heir.mother === dead.id) return he ? 'his son' : 'his daughter';
      if (heir.father && heir.father === dead.father) return he ? 'his brother' : 'his sister';
      const fa = heir.father && this.chars.get(heir.father);
      if (fa && (fa.father === dead.id || fa.mother === dead.id)) return he ? 'his grandson' : 'his granddaughter';
      const mo = heir.mother && this.chars.get(heir.mother);
      if (mo && (mo.father === dead.id || mo.mother === dead.id)) return he ? 'his grandson' : 'his granddaughter';
      if (fa && fa.father && fa.father === dead.father) return he ? 'his nephew' : 'his niece';
      if (dead.father && heir.id === dead.father) return 'his father';
      const df = dead.father && this.chars.get(dead.father);
      if (df && heir.father && heir.father === df.father) return he ? 'his uncle' : 'his aunt';
      return he ? 'a kinsman' : 'a kinswoman';
    }

    _regencies() {
      for (const st of Object.values(this.states)) {
        if (!st.regent) continue;
        const r = this.chars.get(st.ruler);
        if (r && this.age(r) >= 16) {
          st.regent = null;
          this.log('coming_of_age', `${this.fullName(r)} comes of age and takes up the government of ${st.name}.`,
            { states: [st.tag], chars: [r.id] });
        }
      }
    }

    // ---------------- the pace of this timeline ----------------
    // Every timeline has its own tempo: inventions and turning points may come decades earlier or later
    // than in our history. Drawn from a generator of its own, so the rest of history is not disturbed.
    paceShift(year) {
      if (!this._pace) this._pace = { g: new Rng(this.seed + '|pace').normal(0, 28), by: {} };
      const P = this._pace, v = this.cfg.pace_variation ?? 1;
      // one draw per turning point, independent of the order in which they are asked for
      if (P.by[year] == null) P.by[year] = (P.g + new Rng(`${this.seed}|pace|${year}`).normal(0, 14)) * v * (year > 1800 ? 0.6 : 1);
      return P.by[year];
    }

    // ---------------- interventions (the hand of the observer) ----------------
    _applyIntervention(iv) {
      if (iv.type === 'kill') {
        const c = this.chars.get(iv.char);
        if (c && this.alive(c)) this._die(c, iv.cause || 'a mysterious death');
      } else if (iv.type === 'heir') {
        const st = this.states[iv.state];
        const r = st && this.chars.get(st.ruler);
        const sp = r && r.spouse && this.chars.get(r.spouse);
        if (r && sp && this.alive(sp)) {
          const [f, m] = r.sex === 'm' ? [r, sp] : [sp, r];
          const k = this._birth(f, m, this.t, false);
          k.sex = 'm';
          k.name = this._pickName(k, k.culture);
        }
      } else if (iv.type === 'trait') {
        const c = this.chars.get(iv.char);
        if (c && !c.traits.includes(iv.trait)) c.traits.push(iv.trait);
      }
      this.log('intervention', iv.text || 'The hand of fate intervenes.', { states: iv.state ? [iv.state] : [], chars: iv.char ? [iv.char] : [], major: true });
    }

    // ---------------- output ----------------
    _snapshot() {
      // per year: who rules each state (owners don't change in milestone 1)
      const rulers = {};
      for (const [tag, st] of Object.entries(this.states)) rulers[tag] = [st.ruler, st.regent];
      this.yearSnapshots.push({ year: this.year(), rulers });
    }

    rulerAt(tag, t) {
      const st = this.states[tag];
      for (const h of st.history) if (h.from <= t && (h.to == null || h.to > t)) return this.chars.get(h.char);
      return null;
    }

    summary() {
      return {
        seed: this.seed, start: this.startT, end: this.t, events: this.events.length,
        characters: this.chars.size,
      };
    }
  }

  Sim.TRAITS = TRAITS;
  Sim.roman = roman;
  Sim.isPlural = isPlural;
  root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
