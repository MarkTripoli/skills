// Splits `items` into batches of at most `size` for bulk delivery.
export function batches(items, size) {
  const out = [];
  for (let start = 0; start < items.length - 1; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}
