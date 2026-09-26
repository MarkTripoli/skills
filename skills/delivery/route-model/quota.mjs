import { execFile } from 'node:child_process';

export const DEFAULT_OMP_MAX_AGE_MS = 5 * 60 * 1000;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function timestamp(value) {
  if (finite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function providerOf(model) {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : null;
}

function requiredHeadroom(model, quota) {
  const configured = quota?.requiredHeadroom;
  const value = typeof configured === 'number' ? configured : configured?.[model];
  if (value === undefined) return 0;
  if (!finite(value) || value < 0 || value > 1) throw new Error(`requiredHeadroom for ${model} must be finite in [0,1]`);
  return value;
}

function reportFetchedAt(report) {
  return timestamp(report?.fetchedAt ?? report?.metadata?.fetchedAt);
}

function accountBinding(report) {
  const value = report?.accountId ?? report?.metadata?.accountId;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  return ['unknown', 'unbound', 'mixed', 'multiple'].includes(normalized) ? null : value.trim();
}

function reportFreshness(report, now, maxAgeMs) {
  const fetchedAt = reportFetchedAt(report);
  if (fetchedAt === null) return { status: 'unknown', reason: 'unknown-report-freshness' };
  const age = now - fetchedAt;
  if (age < -60_000 || age > maxAgeMs) return { status: 'stale', reason: 'stale-report', fetchedAt };
  return { status: 'fresh', fetchedAt };
}

function assessReport(report, provider, snapshot, model, quota, now, maxAgeMs) {
  if (!report || report.provider !== provider) return { eligible: false, reason: 'no-matching-provider-account' };
  const matching = snapshot.reports.filter((item) => item && item.provider === provider);
  if (matching.length !== 1) return { eligible: false, reason: matching.length > 1 ? 'mixed-accounts' : 'no-matching-provider-account' };
  if (!accountBinding(report)) return { eligible: false, reason: 'unknown-account-binding' };
  const freshness = reportFreshness(report, now, maxAgeMs);
  if (freshness.status !== 'fresh') return { eligible: false, reason: freshness.reason };
  const limits = Array.isArray(report.limits)
    ? report.limits.filter((limit) => {
        const scope = limit?.scope;
        if (scope?.provider && scope.provider !== provider) return false;
        if (scope?.model && scope.model !== model) return false;
        return true;
      })
    : [];
  if (limits.length === 0) return { eligible: false, reason: 'unknown-headroom' };
  const headrooms = [];
  for (const limit of limits) {
    const status = typeof limit.status === 'string' ? limit.status.toLowerCase() : null;
    if (status === 'exhausted') return { eligible: false, reason: 'quota-exhausted', remainingFraction: 0 };
    if (status !== 'ok' && status !== 'warning') return { eligible: false, reason: 'unknown-headroom' };
    const remaining = limit.amount?.remainingFraction;
    if (!finite(remaining) || remaining < 0 || remaining > 1) return { eligible: false, reason: 'unknown-headroom' };
    if (remaining === 0) return { eligible: false, reason: 'quota-exhausted', remainingFraction: 0 };
    headrooms.push(remaining);
  }
  const capacity = snapshot.capacity[provider];
  if (!Array.isArray(capacity) || capacity.length === 0) return { eligible: false, reason: 'unknown-provider-capacity' };
  for (const window of capacity) {
    if (!finite(window?.remainingAccounts)) return { eligible: false, reason: 'unknown-provider-capacity' };
    if (window.remainingAccounts <= 0) return { eligible: false, reason: 'provider-capacity-exhausted', remainingFraction: 0 };
  }
  const remainingFraction = Math.min(...headrooms);
  const needed = requiredHeadroom(model, quota);
  if (remainingFraction + Number.EPSILON < needed) return { eligible: false, reason: 'insufficient-headroom', remainingFraction };
  return { eligible: true, remainingFraction };
}

function snapshotFreshness(snapshot, now, maxAgeMs) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { status: 'unknown', reason: 'unknown-usage' };
  const generatedAt = timestamp(snapshot.generatedAt);
  if (generatedAt === null) return { status: 'unknown', reason: 'unknown-usage' };
  const age = now - generatedAt;
  if (age < -60_000 || age > maxAgeMs) return { status: 'stale', reason: 'stale-usage', generatedAt };
  if (!Array.isArray(snapshot.reports) || !snapshot.capacity || typeof snapshot.capacity !== 'object' || Array.isArray(snapshot.capacity)) {
    return { status: 'unknown', reason: 'unknown-usage', generatedAt };
  }
  return { status: 'fresh', generatedAt };
}


/**
 * Filter exact caller candidates before any Jev request. The report is kept local;
 * returned data contains model names and generic reasons only.
 */
export function filterCandidatesByQuota(candidates, snapshot, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('candidates must contain at least one candidate');
  const now = options.now instanceof Date ? options.now.getTime() : (finite(options.now) ? options.now : Date.now());
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_OMP_MAX_AGE_MS;
  if (!finite(maxAgeMs) || maxAgeMs < 0) throw new Error('OMP maxAgeMs must be finite and non-negative');
  const freshness = snapshotFreshness(snapshot, now, maxAgeMs);
  if (freshness.status !== 'fresh') {
    return {
      candidates: [],
      exclusions: candidates.map((candidate) => ({ model: candidate.model, reason: freshness.reason })),
      summary: { mode: 'omp', status: freshness.status, generatedAt: freshness.generatedAt ?? null, eligibleCount: 0, excludedCount: candidates.length },
    };
  }
  const eligible = [];
  const exclusions = [];
  for (const candidate of candidates) {
    const provider = providerOf(candidate.model);
    if (!provider) {
      exclusions.push({ model: candidate.model, reason: 'model-provider-unknown' });
      continue;
    }
    const report = snapshot.reports.find((item) => item?.provider === provider);
    const result = assessReport(report, provider, snapshot, candidate.model, options, now, maxAgeMs);
    if (result.eligible) eligible.push(candidate);
    else exclusions.push({ model: candidate.model, reason: result.reason });
  }
  return {
    candidates: eligible,
    exclusions,
    summary: { mode: 'omp', status: 'fresh', generatedAt: freshness.generatedAt, eligibleCount: eligible.length, excludedCount: exclusions.length },
  };
}

/** Run the documented OMP usage command without exposing its raw output to callers. */
export async function readOmpUsage(options = {}) {
  const command = options.command ?? 'omp';
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const maxBuffer = options.maxBuffer ?? 8 * 1024 * 1024;
  const timeout = options.timeoutMs ?? 30_000;
  const stdout = await new Promise((resolve, reject) => {
    execFile(command, ['usage', '--json'], { cwd, env, maxBuffer, timeout }, (error, output) => {
      if (error) {
        reject(new Error(`OMP usage --json failed (${error.code ?? 'unknown error'})`));
        return;
      }
      resolve(output);
    });
  });
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('OMP usage --json returned invalid JSON');
  }
}
