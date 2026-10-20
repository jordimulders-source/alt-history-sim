// New names in this timeline: places renamed in the tongue of their conquerors (and sometimes renamed
// back), new peoples born from settlers far from home, and great realms proclaiming themselves empires.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  // given names as the settlers would say them (the culture files keep names in English)
  const NATIVE = {
    dutch: ['Willem', 'Maurits', 'Frederik', 'Hendrik', 'Jan', 'Pieter', 'Cornelis', 'Anthonie', 'Oranje'],
    flemish: ['Filips', 'Karel', 'Jan', 'Pieter', 'Leopold'],
    english: ['William', 'George', 'James', 'Charles', 'Victoria', 'Elizabeth', 'Albert', 'Henry'],
    scots: ['James', 'Charles', 'Robert', 'David', 'Andrew'],
    french: ['Louis', 'Henri', 'Charles', 'Philippe', 'Marie', 'Joseph', 'François'],
    castilian: ['Juan', 'Felipe', 'Carlos', 'Fernando', 'Isabel', 'Antonio', 'Francisco', 'Cristóbal'],
    portuguese: ['João', 'Manuel', 'Pedro', 'Sebastião', 'Luís', 'António', 'Henrique'],
    catalan: ['Jaume', 'Pere', 'Joan', 'Martí'],
    aragonese: ['Fernando', 'Pedro', 'Jaime'],
    danish: ['Frederik', 'Christian', 'Valdemar', 'Erik'], swedish: ['Gustav', 'Karl', 'Kristina', 'Erik'], norwegian: ['Håkon', 'Olav', 'Harald'],
    russian: ['Pyotr', 'Yekaterina', 'Nikolai', 'Aleksandr', 'Vladimir', 'Pavel'],
    turkish: ['Selim', 'Mehmed', 'Süleyman', 'Murad', 'Bayezid'],
    venetian: ['Marco', 'Giovanni', 'Pietro'], ligurian: ['Giorgio', 'Giovanni', 'Andrea'],
  };
  const SAINT = { iberian: 'San', italian: 'San', gallic: 'Saint-', netherlandish: 'Sint-', portuguese: 'São' };
  // naming patterns per family of peoples: {h} = a town of the homeland, {g} = a given name
  const PATTERNS = {
    netherlandish: ['Nieuw-{h}', 'Fort {g}', '{g}stad', 'Kaap {g}', 'Sint-{g}', '{g}sburg'],
    anglo_saxon: ['New {h}', 'Fort {g}', '{g}town', 'Port {g}', '{g}ton', 'Cape {g}'],
    celtic: ['New {h}', 'Fort {g}', 'Port {g}'],
    gallic: ['Nouvelle-{h}', 'Fort-{g}', 'Port-{g}', 'Saint-{g}', '{g}ville'],
    iberian: ['Nueva {h}', 'San {g}', 'Villa {g}', 'Puerto {g}', 'Santa Cruz de {h}', 'Real de {g}'],
    italian: ['Nuova {h}', 'San {g}', 'Porto {g}', 'Forte {g}'],
    high_german: ['Neu-{h}', '{g}sburg', '{g}stadt', 'Fort {g}', '{g}shafen'],
    low_german: ['Neu-{h}', '{g}sburg', '{g}stadt', '{g}shafen'],
    norse: ['Ny-{h}', '{g}borg', '{g}havn', '{g}sstad'],
    east_slavic: ['Novo-{h}', '{g}grad', '{g}sk', '{g}ovsk'],
    west_slavic: ['Nowy {h}', '{g}grod', '{g}ów'],
    south_slavic: ['Novi {h}', '{g}grad'],
    turkic_oghuz: ['Yeni {h}', '{g}kale', '{g}iye'],
    turkic_kipchak: ['{g}kent', 'Yangi {h}'], turkic_eastern: ['{g}kent', 'Yangi {h}'],
    iranian: ['{g}abad', 'Shahr-e {g}'], indo_aryan: ['{g}pur', '{g}abad', '{g}nagar'], dravidian: ['{g}pattinam', '{g}puram'],
    arabic_mashriq: ['Madinat {g}', 'Qasr {g}', 'Al-{g}iyya'], arabic_maghreb: ['Qasr {g}', 'Ribat {g}', 'Al-{g}iyya'],
    mongolic: ['{g} Khot', '{g} Balgas'],
  };
  const SYL = {
    chinese: [['An', 'Ning', 'Ping', 'Ding', 'Jing', 'Zhen', 'Hai', 'Shan', 'Yuan', 'Xing', 'Hua', 'Fu', 'Tai', 'Kang', 'Yong'], ['zhou', 'fu', 'cheng', 'an', 'ning', 'yang', 'kou', 'hai']],
    japanese: [['Shin', 'Naka', 'Kita', 'Minami', 'Taka', 'Yama', 'Hama', 'Matsu', 'Toyo', 'Asa'], ['mura', 'shima', 'yama', 'gawa', 'saki', 'oka', 'hama']],
    korean: [['Sin', 'An', 'Pyeong', 'Gang', 'Cheon', 'Hae', 'Seo'], ['ju', 'san', 'do', 'won', 'yang']],
  };
  const strip = n => String(n).replace(/ [IVX]+$/, '').replace(/ \d+$/, '');

  P._initNames = function () {
    // every timeline keeps its own copy of the provinces, so a place can be renamed here and not elsewhere
    for (const id of Object.keys(this.prov)) this.prov[id] = Object.create(this.prov[id]);
    this.renames = [];          // {pid, t, name, old}
    this.realmNames = {};       // tag -> [{t, name}]
    this.newCultures = [];
    this._homeTowns = {};
    this._usedNames = new Set(this.world.provinces.map(p => p.name));
  };

  // the largest towns of a people at the start: what settlers name their new homes after
  P._homeTownsOf = function (cult) {
    if (!this._homeTowns[cult]) {
      this._homeTowns[cult] = this.world.provinces.filter(p => p.culture === cult && !/ /.test(strip(p.name)) && !/ern /.test(p.name))
        .sort((a, b) => b.pop - a.pop).slice(0, 10).map(p => strip(p.name));
    }
    return this._homeTowns[cult];
  };

  const COLONIAL = /^(New |Nieuw-|Nueva |Nouvelle-|Nuova |Neu-|Ny-|Novo-|Nowy |Novi |Yeni |Yangi |Nova |Santa Cruz de )/;
  P.townName = function (cult, colonial = true) {
    const C = this.world.cultures[cult] || {}, g = C.group;
    const rng = this.rng;
    if (SYL[g]) { const [a, b] = SYL[g]; return rng.pick(a) + rng.pick(b); }
    const pats = PATTERNS[g] || ['New {h}', 'Fort {g}'];
    const given = NATIVE[cult] || ((C.names && C.names.m) || ['Victor']).slice(0, 12);
    const homes = this._homeTownsOf(cult);
    for (let i = 0; i < 8; i++) {
      let pat = rng.pick(pats);
      if (cult === 'portuguese') pat = pat.replace(/^San /, 'São ').replace(/^Nueva /, 'Nova ').replace(/^Puerto /, 'Porto ').replace(/^Villa /, 'Vila ');
      if (pat.includes('{h}') && !homes.length) continue;
      if (!colonial && (COLONIAL.test(pat) || pat.includes('{h}'))) continue;
      const n = pat.replace('{h}', rng.pick(homes)).replace('{g}', rng.pick(given));
      if (!this._usedNames.has(n)) return n;
    }
    return null;
  };

  P._renameProv = function (pid, name, why) {
    if (!name || name === this.prov[pid].name) return;
    const old = this.prov[pid].name;
    this.renames.push({ pid, t: this.t, name, old });
    this.prov[pid].name = name;
    this._usedNames.add(name);
    if (why) this.log('rename', why.replace('{old}', old).replace('{new}', name), { states: [this.owner[pid]].filter(Boolean), pid, major: false });
  };
  // the name of a place in a given year
  P.provNameAt = function (pid, year) {
    const t = year * 12 + 11;
    let n = null;
    for (const r of this.renames) if (r.pid === pid && r.t <= t) n = r.name;
    return n || this.world.provById[pid].name;
  };
  P.renamesAt = function (year) {
    const t = year * 12 + 11, out = {};
    for (const r of this.renames) if (r.t <= t) out[r.pid] = r.name;
    return out;
  };
  // the name of a realm in a given year
  P.realmNameAt = function (tag, year) {
    const h = this.realmNames[tag];
    if (!h) return null;
    const t = year * 12 + 11;
    let n = null;
    for (const x of h) if (x.t <= t) n = x.name;
    return n;
  };

  // ---------------- when land changes hands ----------------
  const transfer = P._transfer;
  P._transfer = function (pid, to, w) {
    transfer.call(this, pid, to, w);
    if (!this.renames || !to || !this.states[to]) return;
    // a place that returns to its own people may take back its old name
    const orig = this.world.provById[pid].culture;
    if (this.prov[pid].name !== this.world.provById[pid].name && this.states[to].culture === orig && this.rng.chance(0.6)) {
      this._renameProv(pid, this.world.provById[pid].name, `{old} takes back its old name: {new}.`);
    }
  };

  // ---------------- yearly ----------------
  P._yearlyNames = function () {
    const W = this.world, y = this.year();
    // new colonies get names from home; land long ruled and assimilated sometimes does too
    for (const e of this.ownerLog) {
      if (e.t <= this.t - 12 || !e.colony) continue;
      if (this.prov[e.pid].name !== W.provById[e.pid].name) continue;
      const americas = this.prov[e.pid].lonlat[0] < -30 || this.prov[e.pid].lonlat[1] < -25;
      if (this.rng.chance(americas ? 0.6 : 0.3)) {
        const n = this.townName(this.states[e.to].culture);
        if (n) this._renameProv(e.pid, n, `The settlers of ${this.states[e.to].name} call their new home {new}.`);
      }
    }
    if (y % 5 === 0) for (const p of W.provinces) {
      const o = this.owner[p.id];
      if (!o || this.prov[p.id].name !== p.name) continue;
      const cult = this.cultureOf(p.id);
      if (cult === p.culture || cult !== this.states[o].culture) continue;
      const g0 = (W.cultures[p.culture] || {}).group, g1 = (W.cultures[cult] || {}).group;
      // only smaller places, and only by peoples with a naming custom we know
      if (g0 === g1 || this.pop[p.id] > 1.5e5 || !(PATTERNS[g1] || SYL[g1]) || !this.rng.chance(0.015)) continue;
      const n = this.townName(cult, false);
      if (n) this._renameProv(p.id, n, `Under ${this.states[o].name}, {old} becomes {new}.`);
    }
    this._ethnogenesis();
    this._proclaimEmpires();
  };

  // ---------------- names for new lands ----------------
  // a new state in the New World takes the name of its main settlement if that has a settlers' name
  // (Nueva Zaragoza), otherwise a name made from the land (Cascade Range: Cascadia; Amazon basin: Amazonia)
  const GEO = /^(Range|Mountains|Plateau|Plains?|Basin|basin|Shield|Highlands|Lowlands|Peninsula|Desert|Islands?|Sierra|Cordillera|del|de|la|Sur|Norte|Great|Central|Northern|Southern|Eastern|Western|North|South|East|West|Upper|Lower|National|Park|Valley|Coast|Lake|Lakes|River)$/;
  const INVENTED = ['Columbia', 'Vespucia', 'Hesperia', 'Occidentia', 'Atlantica', 'Meridia', 'Aurelia', 'Septentria', 'Novaterra', 'Arcadia'];
  P._landName = function (block, cult, taken = () => false) {
    const renamed = block.filter(pid => this.prov[pid].name !== this.world.provById[pid].name).sort((a, b) => this.pop[b] - this.pop[a]);
    for (const pid of renamed) { const n = strip(this.prov[pid].name); if (!taken(n)) return n; }
    const big = block.slice().sort((a, b) => this.pop[b] - this.pop[a]);
    for (const pid of big) {
      const words = strip(this.world.provById[pid].name).split(/[ -]/).filter(w => !GEO.test(w));
      if (!words.length) continue;
      let w = words[0];
      if (/ian$/.test(w)) w = w.replace(/ian$/, 'ia');
      else if (/an$/.test(w) && w.length > 5) w = w.replace(/an$/, 'ania');
      else if (/e$/.test(w)) w = w.slice(0, -1) + 'ia';
      else if (/[aos]$/.test(w)) w = w;
      else if (/on$/.test(w)) w = w + 'ia';
      else w = w + 'ia';
      if (!taken(w)) return w;
    }
    for (let i = 0; i < 6; i++) { const n = this.rng.pick(INVENTED); if (!taken(n)) return n; }
    return strip(this.world.provById[big[0]].name);
  };

  // ---------------- new peoples ----------------
  // settlers who have ruled themselves for generations far from their homeland become a people of their own
  const REGIONAL = /(ern |Peninsula|Plain|Highlands|Lowlands|Mountains|Desert|Range|Plateau|Steppe|Basin|Islands|Shield|Sierra|Cordillera)/;
  function adjOf(b) {
    if (/ia$/.test(b) || /a$/.test(b)) return b + 'n';
    if (/y$/.test(b)) return b.slice(0, -1) + 'ian';
    if (/[eiou]$/.test(b)) return b.slice(0, -1) + 'an';
    if (/(an|en|in|on)$/.test(b)) return b + 'ese';
    return b + 'ian';
  }
  // what a new people calls itself: after an adjective in the land's name (Brazilian Highlands: Brazilians),
  // after the old town a colony was named for (Nueva Zaragoza: Neo-Zaragozans), or after the land
  P._demonym = function (tag) {
    const st = this.states[tag], cap = this.capitalOf[tag];
    const orig = cap != null ? this.world.provById[cap].name : '';
    const word = orig.split(' ').find(w => /(ian|ican|ese)$/.test(w));
    if (word) return word;
    const nm = st.name.replace(/^(The |Republic of |Free State of |United Provinces of |Confederation of |Kingdom of )+/, '');
    const m = nm.match(/^(New |Nieuw-|Nueva |Nouvelle-|Nuova |Neu-|Nova |Ny-)(.+)$/);
    if (m) return 'Neo-' + niceC(this.world, st.culture);
    if (REGIONAL.test(nm)) return null;
    return adjOf(nm.split(' ').pop().replace(/^(San|Saint|Sint|São)-?/, ''));
  };
  P._ethnogenesis = function () {
    const W = this.world;
    for (const [t, st] of Object.entries(this.states)) {
      if (!this._statePop[t] || st.born == null || st.newPeople || this.t - st.born < 12 * 40) continue;
      const cult = st.culture, home = W.cultures[cult];
      if (!home) continue;
      const cap = this.capitalOf[t];
      if (cap == null) continue;
      // far from the homeland of its people
      const homeTowns = W.provinces.filter(p => p.culture === cult);
      if (!homeTowns.length || Math.min(...homeTowns.slice(0, 30).map(p => this._dist(p.lonlat, this.prov[cap].lonlat))) < 2500) continue;
      if ((this._statePop[t] || 0) < 8e5 || !this.rng.chance(0.012)) continue;
      const name = this._demonym(t);
      if (!name || name.toLowerCase() === niceC(W, cult).toLowerCase()) continue;
      const key = `${name.toLowerCase().replace(/[^a-z]/g, '')}_${this.seed}`;
      const hue = (parseInt(home.color.slice(1), 16) * 7919 + t.charCodeAt(1)) % 360;
      W.cultures[key] = { name, group: home.group, religion: home.religion, color: hslHex(hue / 360, 0.45, 0.6), names: home.names, dynasties: home.dynasties, born: this.year(), from: cult };
      this.cultIndex[key] = this.cultKeys.length;
      this.cultKeys.push(key);
      for (const pid of this.provsOf[t] || []) if (this.cultureOf(pid) === cult) this.cult[pid] = this.cultIndex[key];
      st.culture = key; this.stateInfo[t].culture = key;
      st.newPeople = key;
      this.newCultures.push({ key, tag: t, t: this.t });
      this.log('people', `After generations far from home, the settlers of ${st.name} no longer call themselves ${niceC(W, cult)}: a new people, the ${/(s|sh|ch|ese)$/.test(name) ? name : name + 's'}, is born.`, { states: [t], major: true });
    }
  };
  function niceC(W, k) { return (W.cultures[k] && W.cultures[k].name) || String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  function hslHex(h, s, l) {
    const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  // ---------------- empires ----------------
  // a great realm of many peoples may take a grander name
  P._proclaimEmpires = function () {
    for (const [t, st] of Object.entries(this.states)) {
      const n = (this.provsOf[t] || []).length;
      if (n < 60 || st.empire || st.government !== 'monarchy' || !this._statePop[t]) continue;
      const peoples = new Set((this.provsOf[t] || []).map(p => this.cultureOf(p)));
      if (peoples.size < 6 || !this.rng.chance(0.003)) continue;
      const adj = this.adjective(t);
      const plural = Sim.isPlural && Sim.isPlural(st.name);
      const name = /Empire|Khanate|Horde|Sultanate|Order|Kingdom/.test(st.name) || plural || adj === st.name ? null : `${adj} Empire`;
      st.empire = true;
      if (!name) continue;
      const old = st.name;
      (this.realmNames[t] = this.realmNames[t] || [{ t: -Infinity, name: old }]).push({ t: this.t, name });
      st.name = name; this.stateInfo[t].name = name;
      const r = this.chars.get(st.ruler);
      this.log('empire', `${r ? this.fullName(r) + ' of ' : ''}${old} proclaims the ${name}: ${n} provinces and ${peoples.size} peoples under one crown.`, { states: [t], chars: r ? [r.id] : [], major: true });
    }
  };

  // ---------------- hooks ----------------
  const yearly = P._yearly;
  P._yearly = function () {
    yearly.call(this);
    this._yearlyNames();
  };
  const afterInit = P._afterInit;
  P._afterInit = function () {
    afterInit.call(this);
    this._initNames();
  };
})(typeof window !== 'undefined' ? window : globalThis);
