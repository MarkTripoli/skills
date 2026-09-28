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

function visiblePlanLines(text) {
  let fence = null;
  const visible = [];
  for (const line of String(text).split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!fence) {
      if (marker) fence = { character: marker[1][0], length: marker[1].length };
      visible.push(marker ? '' : line);
      continue;
    }
    const closes = marker && marker[1][0] === fence.character && marker[1].length >= fence.length && /^\s*$/.test(marker[2]);
    if (closes) fence = null;
    visible.push('');
  }
  return visible;
}

// Phase headings follow planProgress: ##/### Phase N, with optional title text.
// Each phase declares Depends on: (a preceding phase number or `-`) and one or
// more template **File** paths. Waves are admission evidence, never dispatch.
export function admitPlanWaves(text) {
  const lines = visiblePlanLines(text);
  const phases = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{2,3})\s+(.+)$/);
    if (!heading || !/^(?:Phase|Step)\b/i.test(heading[2])) continue;
    const phaseMatch = heading[2].match(/^(?:Phase|Step)\s+(\d+)\b/i);
    if (!phaseMatch) return { ok: false, error: `Malformed numbered phase heading: ${heading[2]}.` };
    const phase = phaseMatch[1];
    let end = i + 1;
    while (end < lines.length) {
      const next = lines[end].match(/^(#{2,3})\s+(.+)$/);
      if (next && (/^(?:Phase|Step)\b/i.test(next[2]) || next[1].length === 2)) break;
      end++;
    }
    const body = lines.slice(i + 1, end);
    const dependencyLines = body.filter(line => /^\s*(?:\*\*)?Depends on(?:\*\*)?:\s*/i.test(line));
    if (dependencyLines.length !== 1) return { ok: false, error: `Phase ${phase} must declare exactly one Depends on: line; dependency ownership is unknown.` };
    const dependencyValue = dependencyLines[0].replace(/^\s*(?:\*\*)?Depends on(?:\*\*)?:\s*/i, '').trim();
    const dependencies = dependencyValue === '-' ? [] : dependencyValue.split(',').map(value => {
      const match = value.trim().match(/^(?:(?:Phase|Step)\s+)?(\d+)$/i);
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
  if (!phases.length) return { ok: false, error: 'Plan has no numbered ##/### Phase N sections; dependency and file ownership are unknown.' };
  const byId = new Map();
  for (const phase of phases) {
    if (byId.has(phase.id)) return { ok: false, error: `Duplicate phase ${phase.id}.` };
    byId.set(phase.id, phase);
  }
  for (const phase of phases) for (const dependency of phase.dependencies) {
    if (!byId.has(dependency)) return { ok: false, error: `Phase ${phase.id} depends on unknown phase ${dependency}.` };
    if (dependency === phase.id) return { ok: false, error: `Plan phase dependencies contain a cycle at phase ${phase.id}.` };
  }
  const visited = new Set();
  const active = new Set();
  function hasCycle(id) {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    if (byId.get(id).dependencies.some(hasCycle)) return true;
    active.delete(id);
    visited.add(id);
    return false;
  }
  if (phases.some(phase => hasCycle(phase.id))) return { ok: false, error: 'Plan phase dependencies contain a cycle.' };
  for (const [index, phase] of phases.entries()) for (const dependency of phase.dependencies) {
    const dependencyIndex = phases.findIndex(candidate => candidate.id === dependency);
    if (dependencyIndex >= index) return { ok: false, error: `Phase ${phase.id} depends on phase ${dependency} that appears later; runtime implements phases in document order.` };
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
