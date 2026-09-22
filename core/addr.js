// L0: address algebra. Pure, stateless, importing nothing.
// No stateful RNG anywhere in generation — every value is a hash of its own
// coordinates, so any address can be evaluated in isolation and in any order.

export function h(...nums) {
  let x = 0x9e3779b9;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i] | 0;
    x ^= (n + 0x9e3779b9 + (x << 6) + (x >>> 2)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
    x = (x ^ (x >>> 12)) >>> 0;
  }
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export const hi = (max, ...c) => h(...c) % max;
export const hrange = (lo, hi_, ...c) => lo + (h(...c) % (hi_ - lo + 1));
export const hpick = (arr, ...c) => arr[h(...c) % arr.length];
export const hchance = (num, den, ...c) => h(...c) % den < num;

// Normalized pair key, so two neighbours agree about a shared edge without
// either one storing anything.
export const pair = (a, b) => (a < b ? [a, b] : [b, a]);
