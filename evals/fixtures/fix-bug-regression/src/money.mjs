// Formats an integer number of cents as dollars, for example 250 -> "2.50".
export function formatCents(cents) {
  const dollars = Math.floor(cents / 100);
  return `${dollars}.${cents % 100}`;
}
