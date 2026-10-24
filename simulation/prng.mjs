// Deterministic, seedable PRNG (Mulberry32 + SplitMix32)
// Ensures 100% byte-for-byte reproducibility across runs with the same seed.

export function createPRNG(initialSeed = 133742) {
  let s = typeof initialSeed === 'string' ? hashString(initialSeed) : (initialSeed >>> 0);

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // Mulberry32 generator
  function next() {
    let t = (s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function float(min, max, decimals = 2) {
    const val = next() * (max - min) + min;
    const factor = 10 ** decimals;
    return Math.round(val * factor) / factor;
  }

  function bool(p = 0.5) {
    return next() < p;
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[int(0, arr.length - 1)];
  }

  function weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Box-Muller transform for normal distribution
  function normal(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + num * stdDev;
  }

  function getState() {
    return s;
  }

  function setState(newState) {
    s = newState >>> 0;
  }

  return {
    next,
    int,
    float,
    bool,
    pick,
    weightedPick,
    shuffle,
    normal,
    getState,
    setState
  };
}
