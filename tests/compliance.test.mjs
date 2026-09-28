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
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name: name.startsWith('trivy_') ? 'trivy' : name, version: '1.0', status: 'ok'}, coverage: 'complete', findings: []}]));
  lanes.semgrep.findings = [finding];
  const complete = {schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: [finding]};
  const report = assessCompliance(complete);
  assert.equal(report.findings[0].control_id, 'SEC-CODE-REVIEW');
  assert.equal(report.coverage, 'complete');
  assert.equal(report.accounting.reported_findings, 1);

  delete lanes.trivy_fs;
  const missingLane = assessCompliance(complete);
  assert.equal(missingLane.coverage, 'incomplete');
  assert.ok(missingLane.tool_coverage.some(tool => tool.name === 'trivy_fs' && tool.status === 'unavailable'));

  lanes.trivy_fs = {tool: {name: 'trivy_fs', version: '1.0', status: 'ok'}, findings: []};
  assert.equal(assessCompliance(complete).coverage, 'incomplete');
  lanes.trivy_fs.coverage = 'complete';
  lanes.unexpected = {tool: {name: 'unexpected', status: 'ok'}, coverage: 'complete', findings: []};
  assert.equal(assessCompliance(complete).coverage, 'incomplete');
});

test('suppression retains its proof, duplicate IDs fail closed, and lane tool identity is bound', () => {
  const names = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name: name.startsWith('trivy_') ? 'trivy' : name, version: '1.0', status: 'ok'}, coverage: 'complete', findings: []}]));
  const finding = makeFinding('same-id', 'semgrep', 'javascript.example', 'src/app.js');
  lanes.semgrep.findings = [finding];
  const scan = {schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: [finding]};
  const risk = {repository, rule_id: finding.rule_id, path: finding.path, reason: 'Remediation scheduled', expires: '2026-10-01'};
  const suppressed = assessCompliance(scan, {risks: [risk], now: new Date('2026-09-27T00:00:00Z')}).findings[0];
  assert.equal(suppressed.disposition, 'suppressed');
  assert.deepEqual(suppressed.accepted_risk, {reason: risk.reason, expires: risk.expires});
  assert.equal(suppressed.citation.line, finding.line);
  assert.equal(suppressed.citation.evidence_ref, finding.evidence_ref);

  scan.findings = [finding, {...finding, rule_id: 'javascript.other', path: 'src/other.js'}];
  lanes.semgrep.findings = [...scan.findings];
  const duplicate = assessCompliance(scan);
  assert.deepEqual(duplicate.findings.map(item => item.disposition), ['unknown', 'unknown']);
  assert.equal(duplicate.coverage, 'incomplete');

  scan.findings = [finding];
  lanes.semgrep.findings = [finding];
  lanes.hadolint.tool.name = 'actionlint';
  const swapped = assessCompliance(scan);
  assert.equal(swapped.tool_coverage.find(item => item.name === 'hadolint').coverage, 'incomplete');
  assert.equal(swapped.coverage, 'incomplete');
});

test('actual Trivy binary identity permits complete six-lane scanner coverage', () => {
  const names = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name: name.startsWith('trivy_') ? 'trivy' : name, status: 'ok'}, coverage: 'complete', findings: []}]));
  const report = assessCompliance({schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: []});
  assert.equal(report.coverage, 'complete');
  assert.equal(report.tool_coverage.find(tool => tool.name === 'trivy_fs').coverage, 'complete');
});

test('line-less Trivy observations remain explicit unknown inventory, not zero findings', () => {
  const report = assessCompliance({schema_version: 1, repository, revision, coverage: 'incomplete', secret_coverage: 'complete',
    findings: [], file_findings: [{repository, revision, scanner: 'trivy_fs', rule_id: 'CVE-2026-1234', path: 'src/library.js', severity: 'HIGH', message: 'Finding reported by Trivy without a source line'}]});
  assert.equal(report.accounting.input_findings, 1);
  assert.equal(report.accounting.reported_findings, 1);
  assert.equal(report.findings[0].disposition, 'unknown');
  assert.equal(report.findings[0].citation_status, 'missing');
  assert.equal(report.findings[0].location.path, 'src/library.js');
});

test('missing normalized IDs and malformed rules remain unknown instead of active or crashing', () => {
  const noId = makeFinding('missing-id', 'semgrep', 'javascript.example', 'src/app.js');
  delete noId.finding_id;
  const badRule = makeFinding('numeric-rule', 'semgrep', 123, 'src/app.js');
  const report = assessCompliance({schema_version: 1, repository, revision, findings: [noId, badRule]});
  assert.deepEqual(report.findings.map(finding => finding.disposition), ['unknown', 'unknown']);
  assert.ok(report.findings.every(finding => finding.citation_status === 'missing'));
  assert.equal(report.coverage, 'incomplete');
});

test('historical Gitleaks location does not claim verified HEAD line citation', () => {
  const secret = makeFinding('secret', 'gitleaks', 'generic-api-key', 'src/removed-secret.js');
  const report = assessCompliance({schema_version: 1, repository, revision, findings: [secret]});
  assert.equal(report.findings[0].citation, null);
  assert.equal(report.findings[0].citation_status, 'historical-unverified');
  assert.equal(report.findings[0].historical_location.path, secret.path);
  assert.equal(report.findings[0].disposition, 'unknown');
  assert.equal(report.coverage, 'incomplete');
});

test('rejected accepted-risk entries expose validation failure without suppressing an issue', () => {
  const entry = makeFinding('risk', 'semgrep', 'javascript.example', 'src/app.js');
  const report = assessCompliance({schema_version: 1, repository, revision, findings: [entry]}, {risks: [
    {repository, rule_id: entry.rule_id, path: entry.path, reason: 'exception', expires: '2026-02-30'},
  ], now: new Date('2026-02-01T00:00:00Z')});
  assert.equal(report.findings[0].disposition, 'active');
  assert.equal(report.accepted_risk_validation.coverage, 'incomplete');
  assert.ok(report.accepted_risk_validation.errors.some(error => /expires/.test(error)));
  assert.equal(report.coverage, 'incomplete');
});

test('valid historical Gitleaks risk remains suppressed without asserting a HEAD line', () => {
  const secret = makeFinding('historical-risk', 'gitleaks', 'generic-api-key', 'src/removed-secret.js');
  const risk = {repository, rule_id: secret.rule_id, path: secret.path, reason: 'Approved historical remediation', expires: '2026-10-01'};
  const report = assessCompliance({schema_version: 1, repository, revision, findings: [secret]}, {risks: [risk], now: new Date('2026-09-27T00:00:00Z')});
  assert.equal(report.findings[0].disposition, 'suppressed');
  assert.deepEqual(report.findings[0].accepted_risk, {reason: risk.reason, expires: risk.expires});
  assert.equal(report.findings[0].citation, null);
  assert.equal(report.findings[0].citation_status, 'historical-unverified');
  assert.equal(report.coverage, 'incomplete');
});

test('contradictory lane findings and missing lane arrays cannot claim clean inventory', () => {
  const names = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];
  const lanes = Object.fromEntries(names.map(name => [name, {tool: {name: name.startsWith('trivy_') ? 'trivy' : name, status: 'ok'}, coverage: 'complete', findings: []}]));
  const scan = {schema_version: 1, repository, revision, coverage: 'complete', secret_coverage: 'complete', lanes, findings: []};
  const clean = assessCompliance(scan);
  assert.equal(clean.coverage, 'complete');
  lanes.semgrep.findings = [makeFinding('hidden', 'semgrep', 'javascript.example', 'src/hidden.js')];
  assert.throws(() => assessCompliance(scan), /lane findings disagree/);
  delete lanes.semgrep.findings;
  assert.throws(() => assessCompliance(scan), /lane findings disagree/);
});
