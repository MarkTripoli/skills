#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const now = () => Date.now();
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout;
}
function gh(args) { return run(process.env.GH_BIN || 'gh', args); }
function parse(text, label) { try { return JSON.parse(text); } catch { throw new Error(`${label} returned invalid JSON`); } }
function eligible(issue, labels) {
  return issue.state === 'OPEN' && (labels.length === 0 || labels.every(label => issue.labels?.some(item => item.name === label)));
}
function slug(title, number) {
  const words = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').filter(Boolean).slice(0, 3);
  return `${words.join('-') || 'github-issue'}-${number}`;
}
function taskMatches(root, number) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const file = path.join(root, entry.name, 'task.md');
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8');
    return new RegExp(`^issue: ${number}\\s*$`, 'm').test(text) ? [path.join(root, entry.name)] : [];
  });
}
function readState(file) {
  try { const state = JSON.parse(fs.readFileSync(file, 'utf8')); if (state.schema !== 1 || !Array.isArray(state.claims)) throw new Error('invalid claim state'); return state; }
  catch (error) { if (error.code === 'ENOENT') return { schema: 1, claims: [] }; throw error; }
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}
export function intake({ repo, taskRoot, stateFile, labels = [], dryRun = true, staleMs = 30 * 60_000, costReport = null, handoff = null, runGh = gh, runCommand = run, clock = now }) {
  const issues = parse(runGh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,body,state,labels,url']), 'gh issue list');
  const state = readState(stateFile);
  const outcomes = [];
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    if (!eligible(issue, labels)) { outcomes.push({ issue: issue.number, status: 'ineligible' }); continue; }
    const claim = state.claims.find(item => item.issue === issue.number);
    const matchingTasks = taskMatches(taskRoot, issue.number);
    const existingPr = parse(runGh(['pr', 'list', '--repo', repo, '--state', 'all', '--search', `#${issue.number}`, '--json', 'number,title,url,state']), 'gh pr list');
    const resumable = claim?.status === 'claimed' && matchingTasks.includes(claim.task);
    if ((matchingTasks.length || existingPr.length) && !resumable) { outcomes.push({ issue: issue.number, status: 'duplicate', tasks: matchingTasks, prs: existingPr }); continue; }
    if (claim?.status === 'complete') { outcomes.push({ issue: issue.number, status: 'duplicate-claim', task: claim.task }); continue; }
    if (claim?.status === 'claimed' && clock() - claim.updatedAt < staleMs) { outcomes.push({ issue: issue.number, status: 'claimed', task: claim.task }); continue; }
    const task = resumable ? claim.task : path.join(taskRoot, slug(issue.title, issue.number));
    const recovering = resumable && fs.existsSync(path.join(task, 'task.md'));
    if (dryRun) { outcomes.push({ issue: issue.number, status: claim ? 'recoverable' : 'eligible', task }); continue; }
    const active = { issue: issue.number, status: 'claimed', task, updatedAt: clock() };
    state.claims = state.claims.filter(item => item.issue !== issue.number).concat(active);
    saveState(stateFile, state);
    fs.mkdirSync(task, { recursive: true });
    if (!recovering) {
      const taskText = `---\nslug: ${path.basename(task)}\ntitle: ${JSON.stringify(issue.title)}\nworkflow: full\ncreated: ${new Date(clock()).toISOString().slice(0, 10)}\nissue: ${issue.number}\n---\n${issue.body || issue.title}\n\nSource: ${issue.url}\n`;
      fs.writeFileSync(path.join(task, 'task.md'), taskText, { flag: 'wx' });
      fs.writeFileSync(path.join(task, 'index.json'), `${JSON.stringify({ $schema: 'skills.task-index/v1', schemaVersion: 1, task: path.basename(task), generation: 0, artifactSeries: {} }, null, 2)}\n`, { flag: 'wx' });
    }
    const accrued = costReport ? `\nAccrued cost report (informational, not a cap): ${costReport}\n` : '\nAccrued cost: not available. No cost-cap guarantee.\n';
    try {
      if (!handoff) throw new Error('handoff command required for non-dry-run intake');
      runCommand(handoff[0], [...handoff.slice(1), task, accrued]);
      active.status = 'complete'; active.updatedAt = clock(); saveState(stateFile, state);
      outcomes.push({ issue: issue.number, status: 'handed-off', task });
    } catch (error) {
      active.error = error.message; active.updatedAt = clock(); saveState(stateFile, state);
      outcomes.push({ issue: issue.number, status: 'interrupted', task, error: error.message });
      break;
    }
  }
  return outcomes;
}
function main(argv) {
  const values = Object.fromEntries(argv.slice(2).map(arg => { const [key, ...parts] = arg.replace(/^--/, '').split('='); return [key, parts.join('=') || true]; }));
  if (!values.repo || !values['task-root']) throw new Error('usage: issue-intake.mjs --repo=OWNER/REPO --task-root=PATH [--state=PATH] [--label=NAME] [--execute --handoff=COMMAND]');
  const result = intake({ repo: values.repo, taskRoot: path.resolve(values['task-root']), stateFile: path.resolve(values.state || path.join(os.homedir(), '.local/state/skills/issue-intake.json')), labels: argv.filter(arg => arg.startsWith('--label=')).map(arg => arg.slice(8)), dryRun: !values.execute, handoff: values.handoff ? [values.handoff] : null, costReport: values['cost-report'] || null });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
