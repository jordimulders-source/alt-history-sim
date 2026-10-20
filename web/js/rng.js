// Seeded random numbers: the same seed always gives the same history.
(function (root) {
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // sfc32: small, fast, good quality
  function Rng(seed) {
    const s = hashSeed(String(seed));
    let a = s(), b = s(), c = s(), d = s();
    this.next = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 15; i++) this.next();
  }
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.int = function (lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.weighted = function (items, weightFn) {
    let total = 0;
    const w = items.map(x => { const v = Math.max(0, weightFn(x)); total += v; return v; });
    if (total <= 0) return null;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  Rng.prototype.normal = function (mu, sigma) {
    const u = Math.max(1e-9, this.next()), v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  root.Rng = Rng;
})(typeof window !== 'undefined' ? window : globalThis);
