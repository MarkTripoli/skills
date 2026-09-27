import { spawnSync } from 'node:child_process';
import { inspect } from '../../shared/publication-proof.mjs';

// The task directory contains planning/review metadata, never a capture or evidence receipt.
// Every boundary reads the PR again so an interrupted run cannot trust an old in-memory result.
export async function hostedProof(task) {
  const result = spawnSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
    cwd: task.cwd, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  const number = result.stdout.trim();
  if (result.status !== 0 || !/^[1-9]\d*$/.test(number)) return null;
  return inspect({ taskDir: task.taskDir, repo: task.cwd, prNumber: number });
}

export function currentHostedCapture(proof) {
  return Boolean(proof?.captureCurrent && proof.captureHosted && proof.commentVerified && proof.reviewCurrent &&
    (!proof.verificationRequired || proof.verificationCurrent));
}
