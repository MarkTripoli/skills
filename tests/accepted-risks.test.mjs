import assert from 'node:assert/strict';
import test from 'node:test';
import {applyAcceptedRisks} from '../skills/delivery/security-check/scripts/accepted-risks.mjs';

const repository = 'https://example.test/owner/project';
const finding = (path = 'src/auth.js') => ({
  schema_version: 1,
  finding_id: 'finding-1',
  repository,
  revision: 'abc123',
  rule_id: 'javascript.security.example',
  path,
  line: 12,
  severity: 'ERROR',
  scanner: 'semgrep',
  message: 'Unsafe operation',
  evidence_ref: 'sha256:abc',
});
const accepted = overrides => ({
  rule_id: 'javascript.security.example',
  repository: 'git@example.test:owner/project.git',
  path: 'src/auth.js',
  reason: 'Remediation is scheduled',
  expires: '2026-10-01T00:00:00Z',
  ...overrides,
});

test('suppresses exact current matches with an audit record and leaves expired or invalid entries active', () => {
  const current = applyAcceptedRisks([finding()], [accepted()], {repository, now: '2026-09-27T00:00:00Z'});
  assert.equal(current.coverage, 'complete');
  assert.deepEqual(current.active, []);
  assert.equal(current.suppressed.length, 1);
  assert.equal(current.suppressed[0].disposition, 'suppressed');
  assert.deepEqual(current.suppressed[0].accepted_risk, {
    reason: 'Remediation is scheduled',
    expires: '2026-10-01T00:00:00Z',
  });

  const expired = applyAcceptedRisks([finding()], [accepted({expires: '2026-09-26T23:59:59Z'})], {repository, now: '2026-09-27T00:00:00Z'});
  assert.equal(expired.coverage, 'complete');
  assert.equal(expired.active.length, 1);
  assert.deepEqual(expired.suppressed, []);

  const invalid = applyAcceptedRisks([finding()], [accepted({reason: '  '})], {repository, now: '2026-09-27T00:00:00Z'});
  assert.equal(invalid.coverage, 'incomplete');
  assert.equal(invalid.active.length, 1);
  assert.deepEqual(invalid.suppressed, []);
  assert.match(invalid.errors[0], /reason is required/);
});

test('requires explicit anchored glob scope for broader paths', () => {
  const implicit = applyAcceptedRisks([finding('src/deep/auth.js')], [accepted({path: 'src/**/*.js'})], {repository, now: '2026-09-27T00:00:00Z'});
  assert.equal(implicit.coverage, 'incomplete');
  assert.equal(implicit.active.length, 1);

  const scoped = applyAcceptedRisks([finding('src/deep/auth.js')], [accepted({path: 'src/**/*.js', scope: 'glob'})], {repository, now: '2026-09-27T00:00:00Z'});
  assert.equal(scoped.coverage, 'complete');
  assert.equal(scoped.active.length, 0);
  assert.equal(scoped.suppressed.length, 1);
});
