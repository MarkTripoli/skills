import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);

export function commandTimeoutMs() {
  const value = Number(process.env.JEV_UI_NATIVE_TIMEOUT_MS || 15000);
  return Number.isFinite(value) && value > 0 ? value : 15000;
}
export function boundedRunner(runner, timeoutMs = commandTimeoutMs()) {
  const deadline = Number(timeoutMs);
  if (!Number.isFinite(deadline) || deadline <= 0) throw new TypeError('native command timeout must be finite and positive');
  return (command, args, options = {}) => {
    const controller = new AbortController();
    let timer;
    let settled = false;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        controller.abort();
        reject(Object.assign(new Error(`native command timed out: ${command}`), {code: 'NATIVE_TIMEOUT'}));
      }, deadline);
      // A pending deadline must never keep a settled caller alive.
      timer.unref?.();
    });
    const invocation = Promise.resolve().then(() => runner(command, args, {
      ...options,
      timeout: deadline,
      killSignal: 'SIGKILL',
      signal: options.signal || controller.signal,
    }));
    return Promise.race([invocation, timeout]).finally(() => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    });
  };
}
export async function commandAvailable(command, runner = exec) {
  const bounded = boundedRunner(runner);
  try { await bounded('sh', ['-c', `command -v ${command}`]); return true; } catch { return false; }
}
export async function discoverCapabilities({runner = exec} = {}) {
  const bounded = boundedRunner(runner);
  const names = ['adb', 'maestro'];
  const available = {};
  for (const name of names) available[name] = await commandAvailable(name, bounded);
  return available;
}

async function adbTargets(runner) {
  try {
    const {stdout} = await runner('adb', ['devices', '-l']);
    return stdout.split(/\r?\n/).slice(1).filter(Boolean).map(line => {
      const [id, state, ...rest] = line.trim().split(/\s+/);
      return {id, name: rest.join(' '), state, simulator: id?.startsWith('emulator-')};
    }).filter(x => x.id);
  } catch { return []; }
}
export async function listTargets(platform, {runner = exec} = {}) { return platform === 'android' ? adbTargets(runner) : []; }
export async function selectTarget(platform, {id, authorizedId, excludedIds = [], runner = exec} = {}) {
  const bounded = boundedRunner(runner);
  const capabilities = await discoverCapabilities({runner:bounded});
  const required = platform === 'android' ? ['adb'] : [];
  const missing = required.filter(x => !capabilities[x]);
  if (missing.length) return {blocked: true, reason: `missing driver: ${missing.join(', ')}`, capabilities};
  const targets = await listTargets(platform, {runner:bounded}); const requested = id || authorizedId;
  if (!requested && targets.length !== 1) return {blocked:true, reason: targets.length ? 'target selection is ambiguous; explicit identity is required' : 'no target available', capabilities, targets};
  const selected = targets.find(t => t.id === requested) || (requested ? null : targets[0]);
  if (!selected) return {blocked:true, reason:`target not found: ${requested}`, capabilities, targets};
  if (excludedIds.includes(selected.id) && selected.id !== authorizedId) return {blocked:true, reason:`target is excluded: ${selected.id}`, capabilities, target:selected};
  if (selected.state !== 'device') return {blocked:true, reason:`target offline: ${selected.id}`, capabilities, target:selected};
  if (authorizedId && selected.id !== authorizedId) return {blocked:true, reason:`target is not authorized: ${selected.id}`, capabilities, target:selected};
  return {blocked:false, driver:'adb', id:selected.id, name:selected.name, state:selected.state, simulator:!!selected.simulator, target:selected, capabilities};
}
export const resolveTarget = selectTarget;
export {exec};
