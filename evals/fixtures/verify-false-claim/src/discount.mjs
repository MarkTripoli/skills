// Price in cents after a percent discount; never below zero.
export function applyDiscount(priceCents, percent) {
  return Math.max(0, priceCents - Math.round((priceCents * percent) / 100));
}
