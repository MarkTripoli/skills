#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonicalRepository} from './security-check.mjs';
import {applyAcceptedRisks} from './accepted-risks.mjs';
import {reviewHighRisk, renderSecurityReport} from './reachability.mjs';

/** Assemble an opt-in assessment from a normalized scan and per-finding worker replies. */
export async function assessSecurity(scan, {entries = [], reviews = [], root, now = new Date()} = {}) {
  if (scan?.schema_version !== 1 || !Array.isArray(scan.findings) || typeof scan.repository !== 'string' || typeof scan.revision !== 'string') throw new Error('normalized scan required');
  if (!Array.isArray(reviews)) throw new Error('review replies must be an array');
  const risk = applyAcceptedRisks(scan.findings, entries, {repository: scan.repository, now});
  const byId = new Map(reviews.filter(item => typeof item?.finding_id === 'string').map(item => [item.finding_id, item]));
  const dispositions = await reviewHighRisk(scan.findings, {sourceRoot: root, reviewer: async ({finding}) => {
    const reply = byId.get(finding.finding_id);
    if (!reply) throw new Error('no worker reply for this finding');
    return reply;
  }});
  return {schema_version: 1, scan, accepted_risks: risk, dispositions, report: renderSecurityReport(scan, risk, dispositions)};
}

function usage() {
  return 'Usage: node assess.mjs --scan normalized-scan.json [--risks accepted-risks.json] [--reviews worker-replies.json] [--root repo] [--prompts]';
}
async function main(args) {
  const promptsOnly = args.includes('--prompts');
  const values = args.filter(value => value !== '--prompts');
  if (values.length % 2 || values.some((value, index) => index % 2 === 0 && !['--scan', '--risks', '--reviews', '--root'].includes(value))) throw new Error(usage());
  const options = Object.fromEntries(Array.from({length: values.length / 2}, (_, index) => values.slice(index * 2, index * 2 + 2)));
  if (!options['--scan']) throw new Error(usage());
  const root = path.resolve(options['--root'] ?? process.cwd());
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const scan = JSON.parse(fs.readFileSync(options['--scan'], 'utf8'));
  if (scan.revision !== revision || scan.repository !== canonicalRepository(remote)) throw new Error('scan belongs to another repository or revision');
  if (scan.schema_version !== 1 || !Array.isArray(scan.findings) ||
      applyAcceptedRisks(scan.findings, [], {repository: scan.repository}).coverage !== 'complete') {
    throw new Error('scan findings are not normalized');
  }
  if (promptsOnly) {
    const prompts = [];
    await reviewHighRisk(scan.findings, {reviewer: async ({finding, prompt}) => {
      prompts.push({finding_id: finding.finding_id, prompt});
      throw new Error('prompt generation only');
    }});
    console.log(JSON.stringify(prompts));
    return;
  }
  const entries = options['--risks'] ? JSON.parse(fs.readFileSync(options['--risks'], 'utf8')) : [];
  const reviews = options['--reviews'] ? JSON.parse(fs.readFileSync(options['--reviews'], 'utf8')) : [];
  const result = await assessSecurity(scan, {entries, reviews, root});
  console.log(JSON.stringify(result));
  process.exitCode = scan.coverage === 'complete' && result.accepted_risks.coverage === 'complete' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.log(JSON.stringify({status: 'incomplete', reason: 'assessment input invalid or stale; no clean report produced'}));
    process.exitCode = 1;
  });
}
