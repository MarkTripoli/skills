const normalizePath = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

function pathsConflict(left, right) {
  if (!left.length || !right.length) return true;
  return left.some(a => right.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

export function childBatches(ready, children, limit = 1) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Child concurrency limit must be a positive integer');
  const bySlug = new Map(children.map(child => [child.slug, child]));
  const remaining = [...ready];
  const batches = [];

  while (remaining.length) {
    const batch = [];
    for (let i = 0; i < remaining.length && batch.length < limit;) {
      const slug = remaining[i];
      const child = bySlug.get(slug);
      if (!child) throw new Error(`Unknown ready child ${slug}`);
      const paths = Array.isArray(child.write_paths) ? child.write_paths.map(normalizePath).filter(Boolean) : [];
      const conflicts = batch.some(otherSlug => {
        const other = bySlug.get(otherSlug);
        const depends = child.depends_on?.includes(otherSlug) || other.depends_on?.includes(slug);
        const otherPaths = Array.isArray(other.write_paths) ? other.write_paths.map(normalizePath).filter(Boolean) : [];
        return depends || pathsConflict(paths, otherPaths);
      });
      if (conflicts) { i++; continue; }
      batch.push(slug);
      remaining.splice(i, 1);
    }
    if (!batch.length) batch.push(remaining.shift());
    batches.push(batch);
  }

  return batches;
}
