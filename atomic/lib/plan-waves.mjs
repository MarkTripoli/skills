function overlaps(left, right) {
  return left.some(a => right.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

function parsePath(value, phase) {
  const match = value.match(/^\s*\*\*File\*\*:\s*`([^`]+)`\s*$/i);
  if (!match) throw new Error(`Phase ${phase} has an ambiguous file declaration; use **File**: \`repo-relative/path\`.`);
  const file = match[1].replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
  if (!file || file.startsWith('/') || /^[a-z]:\//i.test(file) || file.includes('\0') || file.split('/').some(part => !part || part === '.' || part === '..') || /[*?{}[\]]/.test(file)) {
    throw new Error(`Phase ${phase} has an unsafe or ambiguous file path: ${match[1]}.`);
  }
  return file;
}

// Each numbered phase declares Depends on: (a phase number or `-`) and one or
// more template **File** paths. Admission reports ordered waves only; it never
// dispatches implementation concurrently.
export function admitPlanWaves(text) {
  const lines = String(text).split(/\r?\n/);
  const phases = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^## Phase\s+(\d+)\s*:/i);
    if (!heading) continue;
    let end = i + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end++;
    const phase = heading[1];
    const body = lines.slice(i + 1, end);
    const dependencyLines = body.filter(line => /^\s*(?:\*\*)?Depends on(?:\*\*)?:\s*/i.test(line));
    if (dependencyLines.length !== 1) return { ok: false, error: `Phase ${phase} must declare exactly one Depends on: line; dependency ownership is unknown.` };
    const dependencyValue = dependencyLines[0].replace(/^\s*(?:\*\*)?Depends on(?:\*\*)?:\s*/i, '').trim();
    const dependencies = dependencyValue === '-' ? [] : dependencyValue.split(',').map(value => {
      const match = value.trim().match(/^(?:Phase\s+)?(\d+)$/i);
      return match?.[1] || '';
    });
    if (dependencies.some(value => !value)) return { ok: false, error: `Phase ${phase} has an ambiguous dependency declaration.` };
    const fileLines = body.filter(line => /^\s*\*\*File\*\*:/i.test(line));
    if (!fileLines.length) return { ok: false, error: `Phase ${phase} has unknown file ownership; declare **File**: paths.` };
    let paths;
    try { paths = [...new Set(fileLines.map(line => parsePath(line, phase)))]; }
    catch (error) { return { ok: false, error: String(error.message || error) }; }
    phases.push({ id: phase, dependencies: [...new Set(dependencies)], paths });
    i = end - 1;
  }
  if (!phases.length) return { ok: false, error: 'Plan has no numbered ## Phase N: sections; dependency and file ownership are unknown.' };
  const byId = new Map();
  for (const phase of phases) {
    if (byId.has(phase.id)) return { ok: false, error: `Duplicate phase ${phase.id}.` };
    byId.set(phase.id, phase);
  }
  for (const phase of phases) for (const dependency of phase.dependencies) {
    if (!byId.has(dependency)) return { ok: false, error: `Phase ${phase.id} depends on unknown phase ${dependency}.` };
    if (dependency === phase.id) return { ok: false, error: `Phase ${phase.id} depends on itself.` };
  }
  const remaining = new Set(phases.map(phase => phase.id));
  const completed = new Set();
  const waves = [];
  while (remaining.size) {
    const ready = phases.filter(phase => remaining.has(phase.id) && phase.dependencies.every(id => completed.has(id)));
    if (!ready.length) return { ok: false, error: 'Plan phase dependencies contain a cycle.' };
    for (let i = 0; i < ready.length; i++) {
      for (let j = i + 1; j < ready.length; j++) {
        if (overlaps(ready[i].paths, ready[j].paths)) return { ok: false, error: `Phases ${ready[i].id} and ${ready[j].id} have overlapping declared file scope.` };
      }
    }
    const wave = ready.map(phase => phase.id);
    waves.push(wave);
    for (const id of wave) { remaining.delete(id); completed.add(id); }
  }
  return { ok: true, waves };
}
