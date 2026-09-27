import assert from 'node:assert/strict';
import test from 'node:test';

// Descriptive fixture evaluator: policy only; deliberately not wired into runtime.
function decide(fixture) {
  if (fixture.mode === 'draft-host-capture') return { allowed: fixture.captureUploadMissing, ready: false, status: 'incomplete' };
  if (fixture.bypass) return { allowed: false, ready: false, status: 'incomplete' };
  if (fixture.substantiveChanged) return { allowed: false, ready: false, status: 'stale' };
  if (!fixture.artifactOnlyAdvancement && fixture.head !== fixture.tested) return { allowed: false, ready: false, status: 'stale' };
  if (!fixture.reviewRequired || fixture.review === 'clean') {
    if (fixture.reviewRequired && fixture.review !== 'clean') return { allowed: false, ready: false, status: 'incomplete' };
  } else return { allowed: false, ready: false, status: 'incomplete' };
  if (fixture.verificationRequired && fixture.verification !== 'passed') return { allowed: false, ready: false, status: 'incomplete' };
  if (!fixture.captureHosted || !fixture.commentVerified || !fixture.finalBodyPublished) return { allowed: false, ready: false, status: 'incomplete' };
  if (!fixture.indexedArtifactsOnly) return { allowed: false, ready: false, status: 'stale' };
  if (fixture.capture === 'untested') return { allowed: false, ready: false, status: 'incomplete' };
  if (fixture.capture !== 'passed') return { allowed: false, ready: false, status: 'incomplete' };
  return { allowed: true, ready: true, status: 'pass' };
}

const current = {
  mode: 'ready', head: 'code-a+artifact-1', tested: 'code-a', artifactOnlyAdvancement: true,
  indexedArtifactsOnly: true, substantiveChanged: false, reviewRequired: true, review: 'clean',
  verificationRequired: true, verification: 'passed', capture: 'passed', captureHosted: true,
  commentVerified: true, finalBodyPublished: true, bypass: false,
};

const cases = [
  ['draft may host missing capture but never become ready', { ...current, mode: 'draft-host-capture', captureUploadMissing: true }, { allowed: true, ready: false, status: 'incomplete' }],
  ['indexed artifact-only HEAD advancement reuses tested-code proof', current, { allowed: true, ready: true, status: 'pass' }],
  ['substantive change after tested code is stale', { ...current, substantiveChanged: true }, { allowed: false, ready: false, status: 'stale' }],
  ['non-indexed advancement is not within the evidence exception', { ...current, artifactOnlyAdvancement: true, indexedArtifactsOnly: false }, { allowed: false, ready: false, status: 'stale' }],
  ['unclean required review blocks readiness', { ...current, review: 'changes-requested' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['verification blocks only when required', { ...current, verificationRequired: false, verification: 'missing' }, { allowed: true, ready: true, status: 'pass' }],
  ['missing required verification blocks readiness', { ...current, verification: 'missing' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['untested capture stays incomplete despite caveats', { ...current, capture: 'untested', caveats: 'Behavior was not exercised.' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['final body waits for verified distinct comment', { ...current, commentVerified: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['final body must be published after comment verification', { ...current, finalBodyPublished: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['bypass cannot convert missing proof to pass', { ...current, bypass: true, verification: 'missing' }, { allowed: false, ready: false, status: 'incomplete' }],
];

for (const [name, fixture, expected] of cases) {
  test(name, () => assert.deepEqual(decide(fixture), expected));
}
