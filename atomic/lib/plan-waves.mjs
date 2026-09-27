const normalizePath = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

function overlaps(left, right) {
  return left.some(a => right.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

// Plans declare atomic work units as `### Task: id`, followed by exactly one
// `Depends on:` and `Files:` line. `-` means no dependencies; paths are explicit.
export function admitPlanWaves(text) {
  const tasks = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^### Task:\s*([a-z0-9][a-z0-9_-]*)\s*$/i);
    if (!heading) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++;
    const body = lines.slice(i + 1, end).join('\n');
    const deps = [...body.matchAll(/^Depends on:\s*(.*)$/gmi)];
    const files = [...body.matchAll(/^Files:\s*(.*)$/gmi)];
    if (deps.length !== 1 || files.length !== 1) return { ok: false, error: `Task ${heading[1]} has unknown dependency or file ownership; declare one Depends on: and Files: line.` };
    const paths = files[0][1].split(',').map(normalizePath).filter(Boolean);
    if (!paths.length || paths.some(path => path.startsWith('/') || path.split('/').includes('..'))) return { ok: false, error: `Task ${heading[1]} has unknown or unsafe file ownership.` };
    tasks.push({ id: heading[1], dependencies: deps[0][1].trim() === '-' ? [] : deps[0][1].split(',').map(value => value.trim()).filter(Boolean), paths });
    i = end - 1;
  }
  if (!tasks.length) return { ok: false, error: 'Plan has no declared ### Task: units; dependency and file ownership are unknown.' };
  const byId = new Map();
  for (const task of tasks) {
    if (byId.has(task.id)) return { ok: false, error: `Duplicate task id ${task.id}.` };
    byId.set(task.id, task);
  }
  for (const task of tasks) for (const dependency of task.dependencies) {
    if (!byId.has(dependency)) return { ok: false, error: `Task ${task.id} depends on unknown task ${dependency}.` };
    if (dependency === task.id) return { ok: false, error: `Task ${task.id} depends on itself.` };
  }
  const remaining = new Set(tasks.map(task => task.id));
  const completed = new Set();
  const waves = [];
  while (remaining.size) {
    const ready = tasks.filter(task => remaining.has(task.id) && task.dependencies.every(id => completed.has(id)));
    if (!ready.length) return { ok: false, error: 'Plan dependencies contain a cycle.' };
    for (let i = 0; i < ready.length; i++) {
      for (let j = i + 1; j < ready.length; j++) {
        if (overlaps(ready[i].paths, ready[j].paths)) return { ok: false, error: `Tasks ${ready[i].id} and ${ready[j].id} have overlapping declared file scope.` };
      }
    }
    const wave = ready.map(task => task.id);
    waves.push(wave);
    for (const id of wave) { remaining.delete(id); completed.add(id); }
  }
  return { ok: true, waves };
}
