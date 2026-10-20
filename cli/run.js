// Run a timeline without the browser:  node cli/run.js --seed 42 --years 100 [--out runs/seed_42]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
globalThis.window = globalThis;
for (const f of ['web/data/world.js', 'web/js/rng.js', 'web/js/sim.js', 'web/js/dynasty.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
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
