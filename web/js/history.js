// Milestone 10: historiography. After the fact, the log is turned into prose: a chronicle for every
// decade and an encyclopaedia article for every realm. Only templates, no AI; the words are chosen
// with a random generator of their own (seed + decade), so reading never changes the history.
// Links in the text are written as [[s:TAG]], [[c:ID]] and [[w:ID]]; the page turns them into buttons.
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const nice = k => String(k || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const num = n => (n < NUM.length ? NUM[n] : String(n));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  // longer clauses are kept apart with semicolons
  const clauses = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join('; ') + '; and ' + a[a.length - 1]);
  const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : num(n) + ' times');
  const S = t => `[[s:${t}]]`, C = c => `[[c:${c.id}]]`, Wr = w => `the [[w:${w.id}]]`;
  function people(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' billion';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million';
    return (Math.round(n / 1000) * 1000).toLocaleString('en');
  }

  // the state of every realm at the start of a year: [people, income, treasury, provinces]
  P._econYear = function (y) {
    const h = this.econHist;
    if (!h.length) return {};
    const i = Math.max(0, Math.min(h.length - 1, y - h[0].year));
    return h[i].states;
  };
  P._startYear = function () { return Math.floor(this.startT / 12); };
  P._isPluralName = function (tag) { return Sim.isPlural && Sim.isPlural((this.stateInfo || this.world.states)[tag].name); };

  // ---------------- the chronicle of a decade ----------------
  P.decadeStory = function (d) {
    const t0 = d * 12, t1 = Math.min((d + 10) * 12, this.t);
    if (t1 <= t0) return null;
    const rng = new root.Rng(`${this.seed}|decade|${d}`);
    const E0 = this._econYear(d), E1 = this._econYear(Math.min(d + 10, this.year()) - 0);
    // the great realms of the decade: the twelve most populous at its start (and those that rose during it)
    const great = new Set(Object.entries(E0).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(x => x[0]));
    for (const [t, v] of Object.entries(E1).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12)) great.add(t);
    const evs = this.events.filter(e => e.t >= t0 && e.t < t1);
    const paras = [];

    // 1. the mood of the decade
    const wars = this.wars.filter(w => w.start >= t0 && w.start < t1);
    const bigWars = wars.filter(w => great.has(w.leaderA) || great.has(w.leaderD));
    const plagues = (this.plague ? this.plague.outbreaks : []).filter(o => o.start >= d && o.start < d + 10);
    const dead = plagues.reduce((s, o) => s + o.dead, 0);
    const battles = this.wars.reduce((s, w) => s + w.battles.filter(b => b.t >= t0 && b.t < t1).length, 0);
    let mood;
    if (dead > 5e6) mood = rng.pick(['a decade of death', 'years when the bells never stopped tolling', 'a decade the survivors did not like to remember']);
    else if (bigWars.length >= 5 || battles > 60) mood = rng.pick(['a decade of iron', 'years of fire and sword', 'a restless, warlike decade']);
    else if (bigWars.length <= 1 && battles < 10) mood = rng.pick(['a quiet decade', 'years of rare calm', 'a decade in which the great realms mostly kept the peace']);
    else mood = rng.pick(['a decade of shifting fortunes', 'unsettled years', 'a decade of ordinary troubles']);
    let p1 = `The ${d}s were ${mood}.`;
    if (wars.length) p1 += ` ${cap(num(wars.length))} war${wars.length > 1 ? 's' : ''} broke out${bigWars.length ? `, ${bigWars.length === wars.length ? 'all' : num(bigWars.length)} of them involving great powers` : ''}, and ${num(battles)} battle${battles === 1 ? ' was' : 's were'} fought.`;
    if (plagues.length) p1 += ` Plague broke out ${times(plagues.length)}${dead > 1e5 ? ` and took some ${people(dead)} lives` : ''}.`;
    const age = (this.ages || []).find(a => a.year >= d && a.year < d + 10 && a.year > this._startYear());
    if (age) p1 += ` Later historians would date the beginning of ${age.name.replace(/^The /, 'the ')} to ${age.year}.`;
    paras.push(p1);

    // 2. crowns
    const succ = [];
    for (const tag of great) {
      const st = this.states[tag];
      for (const h of st.history) {
        if (h.from < t0 || h.from >= t1 || h.from <= this._startYear() * 12) continue;
        const prev = st.history[st.history.indexOf(h) - 1];
        succ.push({ tag, h, prev, pop: (E0[tag] || [0])[0] });
      }
    }
    succ.sort((a, b) => b.pop - a.pop);
    // one line per realm; a realm whose crown changed hands often is told in one breath
    const byTag = new Map();
    for (const x of succ) { if (!byTag.has(x.tag)) byTag.set(x.tag, []); byTag.get(x.tag).push(x); }
    const lines = [];
    for (const [tag, xs] of [...byTag].slice(0, 4)) {
      if (xs.length > 1) {
        lines.push(`${S(tag)} saw ${num(xs.length)} rulers in ten years: ${list(xs.map(x => C(this.chars.get(x.h.char))))}`);
        continue;
      }
      const { h, prev } = xs[0];
      const c = this.chars.get(h.char), p = prev && this.chars.get(prev.char);
      const how = h.how && /usurp|rebels|revolt|deposed|seized|claim|independence/i.test(h.how) ? ` (${h.how})` : '';
      if (p && p.died != null && Math.abs(p.died - h.from) < 3) {
        const reign = Math.round((h.from - prev.from) / 12);
        lines.push(rng.pick([
          `in ${S(tag)}, ${C(p)} died${reign > 25 ? ` after ${reign} years on the throne` : ''} and ${C(c)} succeeded${how}`,
          `${S(tag)} mourned ${C(p)} and crowned ${C(c)}${how}`,
          `the crown of ${S(tag)} passed from ${C(p)} to ${C(c)}${how}`,
        ]));
      } else if (p) lines.push(`${C(p)} lost the throne of ${S(tag)} to ${C(c)}${how}`);
      else lines.push(`${C(c)} came to rule ${S(tag)}${how}`);
    }
    const crises = (this.crises || []).filter(c => c.from >= t0 && c.from < t1 && great.has(c.tag));
    if (lines.length) {
      let p2 = cap(rng.pick(['among the great crowns, ', 'at the courts, ', 'as for the thrones, '])) + clauses(lines) + '.';
      if (crises.length) p2 += ` ${crises.length > 1 ? 'Succession crises shook ' + list(crises.map(c => S(c.tag))) : 'A succession crisis shook ' + S(crises[0].tag)}.`;
      paras.push(p2.charAt(0).toUpperCase() + p2.slice(1));
    } else if (succ.length === 0 && great.size) paras.push(rng.pick(['No great crown changed hands.', 'The great thrones were all still held by the same heads at the end of the decade.']));

    // 3. wars that ended, and wars that began
    const seen = new Set();
    const ended = this.wars.filter(w => w.end != null && w.end >= t0 && w.end < t1 && (great.has(w.leaderA) || great.has(w.leaderD)))
      .filter(w => w.outcome !== 'the revolt is crushed' || (w.gained || []).length >= 8)
      .sort((a, b) => (b.gained || []).length - (a.gained || []).length)
      .filter(w => !seen.has(w.name) && seen.add(w.name)).slice(0, 4);
    const wl = [];
    for (const w of ended) {
      const win = w.result === 'attackers' ? w.leaderA : w.result === 'defenders' ? w.leaderD : null;
      const lose = win === w.leaderA ? w.leaderD : w.leaderA;
      const n = (w.gained || []).length;
      if (!win) wl.push(`${Wr(w)} ended without a victor`);
      else if (w.outcome === 'the revolt is crushed') wl.push(`${S(win)} crushed ${Wr(w)}`);
      else if (n) wl.push(`${Wr(w)} ended in victory for ${S(win)}, who took ${num(n)} province${n > 1 ? 's' : ''} from ${S(lose)}`);
      else wl.push(`${S(win)} came out of ${Wr(w)} the victor${w.outcome ? ` (${w.outcome})` : ''}`);
    }
    const open = bigWars.filter(w => (w.end == null || w.end >= t1) && !/Revolt against/.test(w.name)).slice(0, 3);
    if (wl.length || open.length) {
      let p3 = wl.length ? cap(clauses(wl)) + '.' : '';
      if (open.length) p3 += ` ${open.length > 1 ? 'Still raging as the decade closed were ' + list(open.map(Wr)) : 'Still raging as the decade closed was ' + Wr(open[0])}.`;
      paras.push(p3.trim());
    }

    // 4. realms that fell and realms that rose
    const fell = Object.entries(this.states).filter(([, s]) => s.destroyed && s.destroyed.t >= t0 && s.destroyed.t < t1 && (E0[s.tag] || [0])[0] > 3e5);
    const born = Object.entries(this.states).filter(([, s]) => s.born != null && s.born >= t0 && s.born < t1 && (E1[s.tag] || [0])[0] > 3e5);
    const unions = (this.unions || []).filter(u => u.from >= t0 && u.from < t1 && u.tags.some(t => great.has(t)));
    const p4 = [];
    if (fell.length) p4.push(`${list(fell.slice(0, 5).map(([t, s]) => `${S(t)} (to ${S(s.destroyed.by)})`))} disappeared from the map`);
    if (born.length) p4.push(`${list(born.slice(0, 5).map(([t]) => S(t)))} ${born.length > 1 ? 'were' : 'was'} born`);
    if (unions.length) p4.push(`${list(unions.slice(0, 3).map(u => list(u.tags.map(S))))} came to share a ruler`);
    if (p4.length) paras.push(cap(list(p4)) + '.');

    // 5. the turning points (inventions, discoveries, revolutions, ...), told as they were logged
    const turning = evs.filter(e => ['red', 'dictator', 'democracy', 'coldwar', 'secular', 'revival', 'curiosity', 'restoration', 'people', 'empire', 'rise', 'catastrophe', 'collapse', 'conqueror', 'crisis_nuclear', 'golden', 'intervention', 'invention', 'discovery', 'reformation', 'revolution', 'unification', 'independence', 'worldwar', 'constitution'].includes(e.type) && e.major);
    const said = new Set();
    const annals = turning.filter(e => !said.has(e.text) && said.add(e.text)).slice(0, 4);
    if (annals.length) paras.push('From the annals: ' + annals.map(e => `${Math.floor(e.t / 12)}: ${this._linkText(e)}`).join(' '));

    // 6. the balance of the decade
    let up = null, down = null;
    for (const t of new Set([...Object.keys(E0), ...Object.keys(E1)])) {
      const dlt = (E1[t] ? E1[t][3] : 0) - (E0[t] ? E0[t][3] : 0);
      if (!up || dlt > up[1]) up = [t, dlt];
      if (!down || dlt < down[1]) down = [t, dlt];
    }
    const bal = [];
    if (up && up[1] >= 4) bal.push(`${S(up[0])} gained more land than any other realm (${up[1]} provinces)`);
    if (down && down[1] <= -4 && down[0] !== up[0]) bal.push(`${S(down[0])} lost the most (${-down[1]})`);
    if (bal.length) paras.push(`${cap(rng.pick(['by the end of the decade, ', 'when the decade was done, ', 'in the reckoning of the decade, ']))}${list(bal)}.`);
    return { decade: d, paras };
  };

  // put links into a logged sentence: names of realms and people named in its references
  P._linkText = function (e) {
    let s = e.text;
    const info = this.stateInfo || this.world.states;
    for (const t of e.states || []) {
      const nm = info[t] && info[t].name;
      if (nm && s.includes(nm)) s = s.replace(nm, S(t));
    }
    return s;
  };

  // ---------------- an encyclopaedia article about a realm ----------------
  const REGIONS = [
    [l => l[0] < -30 && l[1] > 15, 'North America'], [l => l[0] < -30 && l[1] > 7, 'Central America'], [l => l[0] < -30, 'South America'],
    [l => l[1] > 54 && l[0] < 32, 'Northern Europe'], [l => l[0] < 2 && l[1] > 43, 'Western Europe'], [l => l[0] < 10 && l[1] > 35 && l[0] > -10, 'Western Europe'],
    [l => l[1] > 44 && l[0] < 22, 'Central Europe'], [l => l[1] > 36 && l[0] < 28 && l[1] < 47, 'Southern Europe'], [l => l[1] > 44 && l[0] < 60, 'Eastern Europe'],
    [l => l[1] > 50, 'Siberia'], [l => l[0] < 60 && l[1] > 28 && l[0] > 26, 'the Near East'], [l => l[0] < 33 && l[1] > 18, 'North Africa'],
    [l => l[0] < 25 && l[1] > -5, 'West Africa'], [l => l[0] < 52 && l[1] > -12 && l[0] >= 25, 'East Africa'], [l => l[0] < 52, 'Southern Africa'],
    [l => l[0] < 75 && l[1] > 34, 'Central Asia'], [l => l[0] < 90 && l[1] > 5, 'South Asia'], [l => l[0] < 66 && l[1] > 12, 'Arabia'],
    [l => l[1] > 20 && l[0] > 98, 'East Asia'], [l => l[0] < 98 && l[1] > 27, 'Central Asia'], [l => l[0] > 110 && l[1] < -10, 'Oceania'],
    [() => true, 'Southeast Asia'],
  ];
  P.regionOf = function (pid) {
    const l = this.prov[pid].lonlat;
    return REGIONS.find(r => r[0](l))[1];
  };
  const GOVN = { monarchy: 'kingdom', dictatorship: 'dictatorship', republic: 'republic', theocracy: 'theocracy', order: 'military order', tribal: 'tribal confederation' };

  P.realmArticle = function (tag, upto) {
    const st = this.states[tag], info = this.stateInfo[tag];
    const tEnd = Math.min(upto * 12 + 11, this.t);
    const rng = new root.Rng(`${this.seed}|realm|${tag}`);
    const hist = this.econHist.filter(h => h.year <= upto);
    const alive = hist.filter(h => h.states[tag] && h.states[tag][3] > 0);
    const plural = this._isPluralName(tag);
    const isWas = st.destroyed && st.destroyed.t <= tEnd ? (plural ? 'were' : 'was') : (plural ? 'are' : 'is');
    const capPid = this.capitalAt ? this.capitalAt(tag, upto) : info.capital;
    const region = capPid != null ? this.regionOf(capPid) : 'the world';
    const gov = (st.republicSince != null && st.republicSince > tEnd && st.oldGov) ? st.oldGov.government : st.government;
    const reigns = st.history.filter(h => h.from <= tEnd);
    // houses that ruled
    const houses = {};
    for (const h of reigns) { const c = this.chars.get(h.char); if (c && c.dynasty) houses[c.dynasty] = (houses[c.dynasty] || 0) + 1; }
    const mainHouse = Object.entries(houses).sort((a, b) => b[1] - a[1])[0];
    // greatest extent and people
    let peakP = null, peakN = null;
    for (const h of alive) {
      const v = h.states[tag];
      if (!peakN || v[3] > peakN[1]) peakN = [h.year, v[3]];
      if (!peakP || v[0] > peakP[1]) peakP = [h.year, v[0]];
    }
    // wars
    const wars = this.wars.filter(w => w.start <= tEnd && (w.A.includes(tag) || w.D.includes(tag)));
    const won = [], lost = [], drawn = [];
    for (const w of wars) {
      if (w.end == null || w.end > tEnd) continue;
      const side = w.A.includes(tag) ? 'attackers' : 'defenders';
      (w.result === 'white peace' ? drawn : w.result === side ? won : lost).push(w);
    }
    const foes = {};
    for (const w of wars) for (const o of (w.A.includes(tag) ? w.D : w.A)) foes[o] = (foes[o] || 0) + 1;
    const rivals = Object.entries(foes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);

    // the lead
    const founded = info.born != null ? Math.floor(info.born / 12) : null;
    let lead = `${S(tag)} ${isWas} a ${GOVN[gov] || gov} in ${region}`;
    lead += founded ? `, founded in ${founded}${st.rebel ? ' in a rising against foreign rule' : ''}.` : `, already old when this history begins in ${this._startYear()}.`;
    if (peakN && alive.length > 1) lead += ` At its height in ${peakN[0]} it held ${num(peakN[1])} province${peakN[1] > 1 ? 's' : ''}${peakP && peakP[1] > 1e5 ? `; its people numbered ${people(peakP[1])} in ${peakP[0]}` : ''}.`;
    if (mainHouse && reigns.length > 2) lead += ` ${cap(num(reigns.length))} rulers sat on its throne, ${mainHouse[1] === reigns.length ? 'all' : num(mainHouse[1])} of them of the House of ${mainHouse[0]}.`;
    if (st.destroyed && st.destroyed.t <= tEnd) lead += ` It was conquered by ${S(st.destroyed.by)} in ${Math.floor(st.destroyed.t / 12)}.`;
    else if (st.republicSince != null && st.republicSince <= tEnd) lead += ` A revolution made it a republic in ${Math.floor(st.republicSince / 12)}.`;

    // sections, one per age
    // ages that lasted only a few years are folded into the age before them
    const ages = [];
    for (const a of (this.ages || [{ year: this._startYear(), name: 'History' }]).filter(a => a.year <= upto)) {
      if (ages.length && a.year - ages[ages.length - 1].year < 12) { if (ages.length > 1) ages[ages.length - 1] = { year: ages[ages.length - 1].year, name: a.name }; continue; }
      ages.push(a);
    }
    const sections = [];
    for (let i = 0; i < ages.length; i++) {
      const a = ages[i], y0 = i ? a.year : this._startYear(), y1 = Math.min(upto, ages[i + 1] ? ages[i + 1].year - 1 : upto);
      const s0 = y0 * 12, s1 = y1 * 12 + 11;
      const paras = [];
      const rs = reigns.filter(h => h.from <= s1 && (h.to == null || h.to >= s0));
      if (!rs.length && !alive.some(h => h.year >= y0 && h.year <= y1)) continue;
      // rulers
      if (rs.length) {
        const names = rs.slice(0, 8).map(h => `${C(this.chars.get(h.char))} (${Math.floor(h.from / 12)}–${h.to != null && h.to <= tEnd ? Math.floor(h.to / 12) : ''})`);
        const more = rs.length > 8 ? ` and ${num(rs.length - 8)} more` : '';
        paras.push(rs.length === 1 ? `Throughout these years ${S(tag)} was ruled by ${names[0]}.` : `${cap(num(rs.length))} rulers reigned in this age: ${list(names)}${more}.`);
      }
      // wars of the age
      const ww = won.filter(w => w.end >= s0 && w.end <= s1), wl = lost.filter(w => w.end >= s0 && w.end <= s1), wd = drawn.filter(w => w.end >= s0 && w.end <= s1);
      const pw = [];
      // wars with the same name (a third Ragusan rising...) are named once
      const named = ws => { const seen = new Set(); return ws.filter(w => !seen.has(w.name) && seen.add(w.name)); };
      const more = n => (n > 0 ? ` and ${num(n)} other war${n > 1 ? 's' : ''}` : '');
      if (ww.length) { const u = named(ww).slice(0, 4); pw.push(`won ${list(u.map(Wr))}${more(ww.length - u.length)}`); }
      if (wl.length) { const u = named(wl).slice(0, 4); pw.push(`lost ${list(u.map(Wr))}${more(wl.length - u.length)}`); }
      if (wd.length && pw.length < 2) pw.push(`fought ${list(wd.slice(0, 2).map(Wr))} to a draw`);
      if (pw.length) paras.push(`${cap(plural ? 'they' : 'it')} ${list(pw)}.`);
      else if (rs.length) paras.push(rng.pick([`${plural ? 'They' : 'It'} fought no great war in these years.`, 'These were years of peace for the realm.']));
      // land
      const e0 = (hist.find(h => h.year === y0) || {}).states, e1 = (hist.find(h => h.year === y1) || {}).states;
      const n0 = e0 && e0[tag] ? e0[tag][3] : 0, n1 = e1 && e1[tag] ? e1[tag][3] : 0;
      if (n0 && n1 && n1 !== n0) paras.push(`${n1 > n0 ? 'Its lands grew' : 'Its lands shrank'} from ${num(n0)} to ${num(n1)} provinces${e1[tag][0] > 1e5 ? `, and ${people(e1[tag][0])} people lived in them by ${y1}` : ''}.`);
      // notable moments
      const notable = this.events.filter(e => e.t >= s0 && e.t <= s1 && e.major && e.states.includes(tag) &&
        ['union', 'union_broken', 'crisis', 'usurpation', 'deposed', 'revolution', 'bankruptcy', 'reformation', 'conversion', 'independence', 'unification', 'invention', 'discovery', 'rising', 'colony', 'constitution', 'worldwar', 'people', 'empire', 'rise', 'rename', 'red', 'dictator', 'democracy', 'coldwar', 'secular', 'revival', 'restoration', 'catastrophe', 'collapse', 'conqueror', 'golden', 'crisis_nuclear', 'atom', 'intervention'].includes(e.type));
      // at most two moments of each kind (personal unions come and go often)
      const kinds = {};
      const keep = notable.filter(e => (kinds[e.type] = (kinds[e.type] || 0) + 1) <= 2).slice(0, 5);
      if (keep.length) paras.push(keep.map(e => this._linkText(e)).join(' '));
      sections.push({ title: `${a.name.replace(/^The /, '')} (${y0}–${y1})`, paras });
    }
    const box = {
      Capital: capPid != null ? this.prov[capPid].name : '—',
      Government: cap(GOVN[gov] || gov),
      Faith: nice(st.religion),
      Culture: nice(st.culture),
      'Greatest extent': peakN ? `${peakN[1]} provinces (${peakN[0]})` : '—',
      'Most people': peakP ? `${people(peakP[1])} (${peakP[0]})` : '—',
      Rulers: String(reigns.length),
      Wars: `${won.length} won · ${lost.length} lost · ${drawn.length} drawn`,
    };
    return { tag, title: info.name, lead, box, sections, rivals };
  };

  // plain text (for the command line): links become names
  P.plainText = function (s) {
    const info = this.stateInfo || this.world.states;
    return s.replace(/\[\[(s|c|w):([^\]]+)\]\]/g, (m, k, id) => {
      if (k === 's') return info[id] ? info[id].name : id;
      if (k === 'c') { const c = this.chars.get(isNaN(+id) ? id : +id) || this.chars.get(id); return c ? this.fullName(c) : '?'; }
      const w = this.wars.find(x => String(x.id) === id);
      return w ? w.name : 'a war';
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
