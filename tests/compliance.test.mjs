import assert from 'node:assert/strict';
import test from 'node:test';
import {assessCompliance} from '../skills/delivery/security-check/scripts/compliance.mjs';

const repository = 'https://example.test/acme/project';
const revision = 'a'.repeat(40);
const makeFinding = (id, scanner, rule_id, path) => ({schema_version: 1, finding_id: id, repository, revision, rule_id, path, line: 1, severity: 'LOW', scanner, message: 'Normalized fixture finding', evidence_ref: 'sha256:fixture'});

test('compliance report preserves complete accounting, citation failures, risk expiry, and unknown tools', () => {
  const findings = [
    makeFinding('missing-citation', 'semgrep', 'javascript.example', 'src/missing.js'),
    makeFinding('expired-risk', 'semgrep', 'javascript.example', 'src/expired.js'),
    makeFinding('unknown-tool', 'future-scanner', 'new-rule', 'src/new.js'),
    makeFinding('active', 'gitleaks', 'generic-api-key', 'config/example'),
  ];
  findings[0].revision = 'b'.repeat(40);
  const scan = {
    schema_version: 1, repository, revision, findings,
    tool: {name: 'semgrep', version: '1.0', status: 'ok'},
    secret_tool: {name: 'gitleaks', version: '2.0', status: 'ok'},
  };
  const report = assessCompliance(scan, {
    now: new Date('2026-09-27T00:00:00Z'),
    risks: [{repository, rule_id: 'javascript.example', path: 'src/expired.js', reason: 'temporary', expires: '2026-09-26'}, {repository, rule_id: 'javascript.example', path: 'src/missing.js', reason: 'must not override citation mismatch', expires: '2026-10-01'}],
  });
  assert.equal(report.coverage, 'incomplete');
  assert.deepEqual(report.findings.map(item => item.finding_id), findings.map(item => item.finding_id));
  assert.equal(report.findings[0].citation_status, 'missing');
  assert.equal(report.findings[0].disposition, 'unknown');
  assert.equal(report.findings[1].disposition, 'active');
  assert.ok(report.tool_coverage.some(tool => tool.name === 'future-scanner' && tool.status === 'unknown'));
  assert.equal(report.accounting.input_findings, 4);
  assert.equal(report.accounting.reported_findings, 4);
  assert.equal(report.catalog.version, '2026-09-27.2');
  assert.match(report.catalog.disclaimer, /not a certification audit/i);
});

test('forged acceptance and missing lanes cannot produce complete coverage', () => {
  const finding = {...makeFinding('forged', 'semgrep', 'javascript.lang.security.audit.child-process-exec', 'src/app.js'), disposition: 'accepted'};
  const names = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name, version: '1.0', status: 'ok'}, coverage: 'complete'}]));
  const complete = {schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: [finding]};
  const report = assessCompliance(complete);
  assert.equal(report.findings[0].control_id, 'SEC-CODE-REVIEW');
  assert.equal(report.coverage, 'complete');
  assert.equal(report.accounting.reported_findings, 1);

  delete lanes.trivy_fs;
  const missingLane = assessCompliance(complete);
  assert.equal(missingLane.coverage, 'incomplete');
  assert.ok(missingLane.tool_coverage.some(tool => tool.name === 'trivy_fs' && tool.status === 'unavailable'));

  lanes.trivy_fs = {tool: {name: 'trivy_fs', version: '1.0', status: 'ok'}};
  assert.equal(assessCompliance(complete).coverage, 'incomplete');
  lanes.trivy_fs.coverage = 'complete';
  lanes.unexpected = {tool: {name: 'unexpected', status: 'ok'}, coverage: 'complete'};
  assert.equal(assessCompliance(complete).coverage, 'incomplete');
});

test('suppression retains its proof, duplicate IDs fail closed, and lane tool identity is bound', () => {
  const names = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name, version: '1.0', status: 'ok'}, coverage: 'complete'}]));
  const finding = makeFinding('same-id', 'semgrep', 'javascript.example', 'src/app.js');
  const scan = {schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: [finding]};
  const risk = {repository, rule_id: finding.rule_id, path: finding.path, reason: 'Remediation scheduled', expires: '2026-10-01'};
  const suppressed = assessCompliance(scan, {risks: [risk], now: new Date('2026-09-27T00:00:00Z')}).findings[0];
  assert.equal(suppressed.disposition, 'suppressed');
  assert.deepEqual(suppressed.accepted_risk, {reason: risk.reason, expires: risk.expires});
  assert.equal(suppressed.citation.line, finding.line);
  assert.equal(suppressed.citation.evidence_ref, finding.evidence_ref);

  scan.findings = [finding, {...finding, rule_id: 'javascript.other', path: 'src/other.js'}];
  const duplicate = assessCompliance(scan);
  assert.deepEqual(duplicate.findings.map(item => item.disposition), ['unknown', 'unknown']);
  assert.equal(duplicate.coverage, 'incomplete');

  scan.findings = [finding];
  lanes.hadolint.tool.name = 'actionlint';
  const swapped = assessCompliance(scan);
  assert.equal(swapped.tool_coverage.find(item => item.name === 'hadolint').coverage, 'incomplete');
  assert.equal(swapped.coverage, 'incomplete');
});
