#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyPublicationCommand } from '../shared/publication-command.mjs';

const proofScript = fileURLToPath(new URL('../shared/publication-proof.mjs', import.meta.url));

function deny(reason) {
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason,
  } };
}

function command(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${bin} failed: ${result.stderr?.trim() || result.error?.message || 'nonzero exit'}`);
  return result.stdout.trim();
}

// Returns no decision outside the explicitly selected task and repository.
export function publicationDecision(input, env = process.env) {
  if (!env.SKILLS_PUBLICATION_TASK_DIR || input?.hook_event_name !== 'PreToolUse' || input?.tool_name !== 'Bash') return null;
  if (typeof input?.tool_input?.command !== 'string') return deny('Invalid Claude Bash command payload; publication cannot be authorized.');
  const classified = classifyPublicationCommand(input?.tool_input?.command);
  if (!classified) return null;
  const taskDir = path.resolve(env.SKILLS_PUBLICATION_TASK_DIR);
  const cwd = path.resolve(input.cwd || env.CLAUDE_PROJECT_DIR || process.cwd());
  let repo;
  try {
    repo = command('git', ['rev-parse', '--show-toplevel'], cwd);
    const taskRepo = command('git', ['rev-parse', '--show-toplevel'], taskDir);
    if (fs.realpathSync(repo) !== fs.realpathSync(taskRepo)) return null;
    if (!fs.statSync(path.join(taskDir, 'task.md')).isFile()) throw new Error('task.md is missing');
  } catch {
    return deny('Publication task scope cannot be verified; select a valid SKILLS_PUBLICATION_TASK_DIR.');
  }
  if (classified.action === 'unsupported-pr-command') return deny('Unsupported gh pr Bash syntax in the selected publication task; use direct gh pr create --draft or gh pr ready [number].');
  if (classified.action === 'ready-create') return deny('Ready PR creation has no hosted publication proof; create a draft first to host capture, then complete the shared proof.');
  if (classified.action === 'draft-create') return null; // Hosting only; no final-proof claim.

  try {
    const number = classified.number || JSON.parse(command('gh', ['pr', 'view', '--json', 'number,isDraft'], cwd)).number;
    if (!Number.isSafeInteger(Number(number)) || Number(number) <= 0) throw new Error('PR number is missing or invalid');
    const pr = JSON.parse(command('gh', ['pr', 'view', String(number), '--json', 'number,isDraft'], cwd));
    if (pr.number !== Number(number) || pr.isDraft !== true) return deny('Ready transition requires an existing draft PR in the selected repository.');
    const result = spawnSync(process.execPath, [proofScript, taskDir, repo, String(number)], { cwd: repo, env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    let proof;
    try { proof = JSON.parse(result.stdout); } catch { return deny('Publication proof returned invalid JSON; ready transition blocked.'); }
    if (!proof || typeof proof !== 'object' || !['pass', 'stale', 'incomplete'].includes(proof.status)
        || typeof proof.ready !== 'boolean' || typeof proof.allowed !== 'boolean' || typeof proof.reason !== 'string') {
      return deny('Publication proof returned an invalid decision; ready transition blocked.');
    }
    if ((proof.status === 'pass' && (!proof.ready || !proof.allowed)) || (proof.status !== 'pass' && proof.ready)) {
      return deny('Publication proof returned an inconsistent decision; ready transition blocked.');
    }
    if (result.error || (result.status !== 0 && proof.status === 'pass')) return deny('Publication proof inspection failed; ready transition blocked.');
    if (proof.status !== 'pass' || proof.ready !== true || proof.allowed !== true) return deny(proof.reason);
    return null;
  } catch {
    return deny('Publication proof inspection failed; ready transition blocked.');
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const decision = publicationDecision(input);
    if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`);
  } catch {
    if (process.env.SKILLS_PUBLICATION_TASK_DIR) process.stdout.write(`${JSON.stringify(deny('Invalid Claude PreToolUse payload; publication cannot be authorized.'))}\n`);
  }
}
