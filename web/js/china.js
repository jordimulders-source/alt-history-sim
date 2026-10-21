// China keeps its own rhythm of history: when the ruling house changes, the realm takes the name of the new
// dynasty (as the Ming gave way to the Qing), and when the empire breaks apart, the pieces take the names of the
// old kingdoms of their regions (Shu in Sichuan, Wu on the lower Yangtze, Chu, Min, Yue...).
(function (root) {
  const Sim = root.Sim;
  const P = Sim.prototype;

  const DYNASTIES = ['Qing', 'Shun', 'Da Xi', 'Xin', 'Zhou', 'Tang', 'Song', 'Han', 'Jin', 'Liang', 'Chen', 'Sui', 'Yuan', 'Xia', 'Wei', 'Qi'];
  // [name, lon, lat] of the old kingdoms of China
  const KINGDOMS = [['Shu', 104, 30.5], ['Wu', 120, 31], ['Chu', 112.5, 30], ['Min', 118.5, 26], ['Yue', 113.5, 23.5], ['Qi', 118, 36.5],
    ['Yan', 116.5, 40], ['Jin', 112.5, 37.5], ['Qin', 108.5, 34.5], ['Zheng', 113.5, 34.5], ['Dian', 102.5, 25], ['Liao', 123, 42], ['Xia', 106, 38]];
  const isChinese = (sim, t) => ((sim.world.cultures[sim.states[t].culture] || {}).group === 'chinese');

  P._dynastyName = function (t) {
    this._usedDyn = this._usedDyn || new Set(['Ming']);
    const taken = new Set(Object.values(this.states).filter(x => !x.destroyed).map(x => x.name));
    const free = DYNASTIES.filter(d => !this._usedDyn.has(d) && !taken.has(d) && d !== this.states[t].name);
    const d = free.length ? this.rng.pick(free) : `Later ${this.rng.pick(DYNASTIES)}`;
    this._usedDyn.add(d);
    return d;
  };

  // a new house on the dragon throne proclaims a new dynasty
  const setRuler = P._setRuler;
  P._setRuler = function (tag, c, info = {}) {
    const st = this.states[tag];
    const before = st && st.dynasty;
    setRuler.call(this, tag, c, info);
    if (!st || info.initial || !this.realmNames || !this._rename || !isChinese(this, tag)) return;
    if ((this._statePop[tag] || 0) < 2e7 || st.government !== 'monarchy' || !before || c.dynasty === before) return;
    if (!this.rng.chance(0.5)) return;
    const d = this._dynastyName(tag);
    const old = st.name;
    this._rename(tag, d);
    this.log('dynasty', `${this.fullName(c)} founds a new dynasty: the ${old} gives way to the Great ${d}. The Mandate of Heaven has passed.`,
      { states: [tag], chars: [c.id], major: true });
  };

  // the name of a piece of a broken Chinese empire
  P._chineseKingdomName = function (pid) {
    const [lon, lat] = this.prov[pid].lonlat;
    const k = KINGDOMS.slice().sort((a, b) => Math.hypot(a[1] - lon, a[2] - lat) - Math.hypot(b[1] - lon, b[2] - lat))[0];
    if (Math.hypot(k[1] - lon, k[2] - lat) > 6) return null;
    const alive = n => Object.values(this.states).some(x => x.name === n && !x.destroyed && this._statePop[x.tag]);
    for (const pre of ['', 'Later ', 'Southern ', 'Northern ', 'Eastern ', 'Western ']) if (!alive(pre + k[0])) return pre + k[0];
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
