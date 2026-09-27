import {applyAcceptedRisks} from './accepted-risks.mjs';

export const CONTROL_CATALOG = {
  schema_version: 1,
  catalog_version: '2026-09-27.2',
  disclaimer: 'Control mapping is triage context, not a certification audit.',
  controls: [
    {id: 'SEC-CODE-REVIEW', title: 'Review static-analysis findings', scanner: 'semgrep', rule_prefix: 'javascript.'},
    {id: 'SEC-SECRET-EXPOSURE', title: 'Review detected secret exposure', scanner: 'gitleaks', rule_prefix: ''},
  ],
};

const EXPECTED_LANES = ['semgrep', 'gitleaks', 'trivy_config', 'trivy_fs', 'hadolint', 'actionlint'];

function laneTools(scan) {
  const lanes = scan.lanes && typeof scan.lanes === 'object' && !Array.isArray(scan.lanes) ? scan.lanes : {};
  const tools = Object.entries(lanes).map(([name, lane]) => {
    const tool = lane?.tool ?? lane;
    const status = tool?.status ?? 'unavailable';
    const known = EXPECTED_LANES.includes(name);
    return {name, version: tool?.version ?? null, status: known ? status : 'unknown', coverage: known && status === 'ok' && lane?.coverage === 'complete' ? 'complete' : 'incomplete'};
  });
  for (const name of EXPECTED_LANES) {
    if (!Object.hasOwn(lanes, name)) tools.push({name, version: null, status: 'unavailable', coverage: 'incomplete'});
  }
  return tools;
}

function hasCitation(finding, scan) {
  return finding && finding.repository === scan.repository && finding.revision === scan.revision &&
    typeof finding.rule_id === 'string' && finding.rule_id.length > 0 &&
    typeof finding.path === 'string' && finding.path.length > 0 && !finding.path.startsWith('/') &&
    !finding.path.split('/').some(part => part === '..' || part === '.' || part === '');
}

/** Build a complete, provenance-bound triage inventory from normalized scanner output. */
export function assessCompliance(scan, {risks = [], now = new Date(), catalog = CONTROL_CATALOG} = {}) {
  if (scan?.schema_version !== 1 || !Array.isArray(scan.findings) || typeof scan.repository !== 'string' || typeof scan.revision !== 'string') {
    throw new Error('normalized scan required');
  }
  if (!Array.isArray(risks)) throw new Error('accepted risks must be an array');
  if (!catalog || catalog.schema_version !== 1 || typeof catalog.catalog_version !== 'string' || !Array.isArray(catalog.controls)) {
    throw new Error('versioned control catalog required');
  }
  const accepted = applyAcceptedRisks(scan.findings, risks, {repository: scan.repository, now});
  const suppressedIds = new Set(accepted.suppressed.map(item => item.finding_id));
  const findings = scan.findings.map(finding => {
    const cited = hasCitation(finding, scan);
    const control = catalog.controls.find(item => item.scanner === finding?.scanner && typeof item.rule_prefix === 'string' && finding.rule_id?.startsWith(item.rule_prefix));
    let disposition = 'unknown';
    if (cited && suppressedIds.has(finding?.finding_id)) disposition = 'suppressed';
    else if (cited && control) disposition = 'active';
    return {
      finding_id: finding?.finding_id ?? null,
      citation: cited ? {repository: finding.repository, revision: finding.revision, rule_id: finding.rule_id, path: finding.path} : null,
      citation_status: cited ? 'complete' : 'missing',
      control_id: control?.id ?? null,
      disposition,
    };
  });
  const tools = laneTools(scan);
  for (const finding of scan.findings) {
    if (!tools.some(tool => tool.name === finding?.scanner)) tools.push({name: finding?.scanner ?? 'unknown', version: null, status: 'unknown', coverage: 'unavailable'});
  }
  const counts = Object.fromEntries(['active', 'unknown', 'suppressed', 'accepted'].map(name => [name, findings.filter(item => item.disposition === name).length]));
  return {
    schema_version: 1,
    catalog: {version: catalog.catalog_version, disclaimer: catalog.disclaimer ?? 'Control mapping is triage context, not a certification audit.'},
    repository: scan.repository,
    revision: scan.revision,
    tool_coverage: tools,
    findings,
    accounting: {input_findings: scan.findings.length, reported_findings: findings.length, dispositions: counts},
    coverage: scan.coverage === 'complete' && scan.secret_coverage === 'complete' && Object.keys(scan.lanes ?? {}).length === EXPECTED_LANES.length && EXPECTED_LANES.every(name => tools.some(tool => tool.name === name && tool.coverage === 'complete' && tool.status === 'ok')) && accepted.coverage === 'complete' && tools.every(tool => tool.coverage === 'complete') && findings.every(item => item.citation_status === 'complete') ? 'complete' : 'incomplete',
  };
}
