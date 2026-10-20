// Run a timeline without the browser:  node cli/run.js --seed 42 --years 100 [--out runs/seed_42]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
globalThis.window = globalThis;
for (const f of ['web/data/world.js', 'web/js/rng.js', 'web/js/sim.js', 'web/js/dynasty.js', 'web/js/diplomacy.js', 'web/js/war.js', 'web/js/economy.js', 'web/js/culture.js', 'web/js/progress.js', 'web/js/modern.js', 'web/js/history.js', 'web/js/fate.js', 'web/js/wildcards.js', 'web/js/names.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const seed = args.seed || '1444';
const years = +(args.years || ((WORLD.config.end_year || 1544) - WORLD.start.year));
const t0 = Date.now();
const sim = new Sim(WORLD, { seed });
sim.run(WORLD.start.year + years);
console.log(`seed ${seed}: ${years} years, ${sim.events.length} events, ${sim.chars.size} characters in ${Date.now() - t0} ms`);
const out = args.out || path.join(root, 'runs', 'seed_' + seed);
fs.mkdirSync(out, { recursive: true });
const date = t => `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`;
fs.writeFileSync(path.join(out, 'events.jsonl'), sim.events.map(e => JSON.stringify({ date: date(e.t), ...e, t: undefined })).join('\n') + '\n');
const rulers = {};
for (const [tag, st] of Object.entries(sim.states)) {
  rulers[tag] = st.history.map(h => ({ ruler: sim.fullName(sim.char(h.char)), dynasty: sim.char(h.char).dynasty, from: date(h.from), to: h.to != null ? date(h.to) : null, how: h.how }));
}
fs.writeFileSync(path.join(out, 'rulers.json'), JSON.stringify(rulers, null, 1));
const lines = [];
for (const e of sim.events) if (e.major) lines.push(`${date(e.t)}  ${e.text}`);
fs.writeFileSync(path.join(out, 'chronicle.txt'), lines.join('\n') + '\n');
console.log('written to', path.relative(root, out));
// a short overview: world population per half century and the largest realms at the end
const world = {};
for (const h of sim.popHist) if (h.year % 50 === 0 || h.year === sim.year()) world[h.year] = Math.round(h.pop.reduce((a, b) => a + b, 0) / 1e6);
const big = Object.entries(sim._statePop).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([t, p]) => ({ tag: t, name: sim.states[t].name, millions: Math.round(p / 1e6), provinces: (sim.provsOf[t] || []).length, government: sim.states[t].government }));
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ seed, world_population_millions: world, largest: big, inventions: sim.devs }, null, 1));
console.log('world population (millions):', JSON.stringify(world));
console.log('largest:', big.slice(0, 8).map(b => `${b.name} ${b.millions}M`).join(', '));
// the history as prose: a chronicle per decade (plain text with headings)
const md = [`# The history of timeline #${seed}`, ''];
for (let d = Math.floor(WORLD.start.year / 10) * 10; d < sim.year(); d += 10) {
  const st = sim.decadeStory(d);
  if (!st) continue;
  md.push(`## The ${d}s`, '', ...st.paras.map(p => sim.plainText(p) + '\n'));
}
fs.writeFileSync(path.join(out, 'history.md'), md.join('\n'));
