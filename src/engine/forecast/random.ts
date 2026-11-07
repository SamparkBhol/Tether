export type Rng = () => number;

export const seeded = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const hashSeed = (...parts: string[]): number => {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const poisson = (rng: Rng, mean: number): number => {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng();
  while (p > limit) {
    k++;
    p *= rng();
  }
  return k;
};
