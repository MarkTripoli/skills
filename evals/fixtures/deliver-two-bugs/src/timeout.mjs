// A request timeout in milliseconds, kept between `minMs` and `maxMs` inclusive.
export function clampTimeout(ms, minMs, maxMs) {
  return Math.min(Math.max(ms, maxMs), minMs);
}
