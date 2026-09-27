import {canonicalRepository} from './security-check.mjs';

function validPath(value, {glob = false} = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\')) return false;
  const segments = value.split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return false;
  return glob || !/[?*]/.test(value);
}

function globExpression(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

function expirationTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new Error('expires must be an ISO date or timestamp');
  }
  const parsed = Date.parse(value);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(parsed) || calendarDay.getUTCFullYear() !== year ||
      calendarDay.getUTCMonth() + 1 !== month || calendarDay.getUTCDate() !== day) {
    throw new Error('expires must be a valid ISO date or timestamp');
  }
  return parsed;
}

function compileEntry(entry, index) {
  const prefix = `entries[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${prefix} must be an object`);
  if (typeof entry.rule_id !== 'string' || !entry.rule_id.trim()) throw new Error(`${prefix}.rule_id is required`);
  if (typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error(`${prefix}.reason is required`);
  const expires = expirationTime(entry.expires);
  let repository;
  try { repository = canonicalRepository(entry.repository); }
  catch (error) { throw new Error(`${prefix}.repository is invalid: ${error.message}`); }
  const scope = entry.scope ?? 'exact';
  if (scope !== 'exact' && scope !== 'glob') throw new Error(`${prefix}.scope must be "exact" or "glob"`);
  if (!validPath(entry.path, {glob: scope === 'glob'})) throw new Error(`${prefix}.path must be a repository-relative ${scope === 'glob' ? 'anchored glob' : 'exact path'}`);
  return {
    rule_id: entry.rule_id,
    repository,
    path: entry.path,
    pathMatches: scope === 'glob' ? globExpression(entry.path) : null,
    reason: entry.reason.trim(),
    expires,
    expiresAt: entry.expires,
  };
}

function canonicalFinding(finding, index, errors) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding) || finding.schema_version !== 1 ||
      typeof finding.finding_id !== 'string' || !finding.finding_id ||
      typeof finding.revision !== 'string' || !finding.revision ||
      typeof finding.rule_id !== 'string' || !finding.rule_id ||
      typeof finding.path !== 'string' || !validPath(finding.path) || !Number.isSafeInteger(finding.line) || finding.line < 1 ||
      typeof finding.severity !== 'string' || typeof finding.scanner !== 'string' ||
      typeof finding.message !== 'string' || typeof finding.evidence_ref !== 'string' ||
      typeof finding.repository !== 'string') {
    errors.push(`findings[${index}] is not a normalized schema_version 1 finding`);
    return null;
  }
  try { return canonicalRepository(finding.repository); }
  catch (error) {
    errors.push(`findings[${index}].repository is invalid: ${error.message}`);
    return null;
  }
}

/** Apply validated, unexpired accepted-risk entries to normalized findings. */
export function applyAcceptedRisks(findings, entries, {repository, now = new Date()} = {}) {
  const errors = [];
  const active = Array.isArray(findings) ? [...findings] : [];
  if (!Array.isArray(findings)) errors.push('findings must be an array');
  if (!Array.isArray(entries)) errors.push('entries must be an array');
  let currentTime;
  try {
    currentTime = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
    if (!Number.isFinite(currentTime)) throw new Error();
  } catch {
    currentTime = NaN;
    errors.push('now must be a valid date, timestamp, or epoch milliseconds');
  }
  let canonicalTarget;
  try { canonicalTarget = canonicalRepository(repository); }
  catch (error) { errors.push(`repository is invalid: ${error.message}`); }

  const compiled = [];
  if (Array.isArray(entries)) {
    for (let index = 0; index < entries.length; index += 1) {
      try { compiled.push(compileEntry(entries[index], index)); }
      catch (error) { errors.push(error.message); }
    }
  }
  const suppressed = [];
  if (Array.isArray(findings) && canonicalTarget && Number.isFinite(currentTime)) {
    const kept = [];
    for (let index = 0; index < findings.length; index += 1) {
      const finding = findings[index];
      const findingRepository = canonicalFinding(finding, index, errors);
      const matched = findingRepository === canonicalTarget && compiled.find(entry =>
        entry.expires > currentTime && entry.rule_id === finding.rule_id && entry.repository === canonicalTarget &&
        (entry.pathMatches ? entry.pathMatches.test(finding.path) : entry.path === finding.path));
      if (matched) {
        suppressed.push({...finding, disposition: 'suppressed', accepted_risk: {reason: matched.reason, expires: matched.expiresAt}});
      } else kept.push(finding);
    }
    active.splice(0, active.length, ...kept);
  }
  return {active, suppressed, coverage: errors.length === 0 ? 'complete' : 'incomplete', errors};
}
