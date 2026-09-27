import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePublicationProof } from '../shared/publication-proof-policy.mjs';

const current = {
  mode: 'ready', head: 'code-a+artifact-1', tested: 'code-a', artifactOnlyAdvancement: true,
  indexedArtifactsOnly: true, substantiveChanged: false, reviewRequired: true, review: 'clean', reviewCurrent: true,
  verificationRequired: true, verification: 'passed', verificationCurrent: true,
  capture: 'passed', captureCurrent: true, captureHosted: true,
  commentVerified: true, commentDistinct: true, finalBodyPublished: true, finalBodyVerified: true, bypass: false,
};

const cases = [
  ['draft may host missing capture but never become ready', { ...current, mode: 'draft-host-capture', captureUploadMissing: true }, { allowed: true, ready: false, status: 'incomplete' }],
  ['indexed artifact-only HEAD advancement reuses tested-code proof', current, { allowed: true, ready: true, status: 'pass' }],
  ['substantive change after tested code is stale', { ...current, substantiveChanged: true }, { allowed: false, ready: false, status: 'stale' }],
  ['non-indexed advancement is not within the evidence exception', { ...current, artifactOnlyAdvancement: true, indexedArtifactsOnly: false }, { allowed: false, ready: false, status: 'stale' }],
  ['unclean required review blocks readiness', { ...current, review: 'changes-requested' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['stale required review blocks readiness', { ...current, reviewCurrent: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['verification blocks only when required', { ...current, verificationRequired: false, verification: 'missing' }, { allowed: true, ready: true, status: 'pass' }],
  ['missing required verification blocks readiness', { ...current, verification: 'missing' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['stale required verification blocks readiness', { ...current, verificationCurrent: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['untested capture stays incomplete despite caveats', { ...current, capture: 'untested', caveats: 'Behavior was not exercised.' }, { allowed: false, ready: false, status: 'incomplete' }],
  ['stale hosted capture blocks readiness', { ...current, captureCurrent: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['final body waits for verified distinct comment', { ...current, commentVerified: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['capture comment must have a distinct permalink', { ...current, commentDistinct: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['final body must be published after comment verification', { ...current, finalBodyPublished: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['published body must be verified by readback', { ...current, finalBodyVerified: false }, { allowed: false, ready: false, status: 'incomplete' }],
  ['bypass cannot convert missing proof to pass', { ...current, bypass: true, verification: 'missing' }, { allowed: false, ready: false, status: 'incomplete' }],
];

for (const [name, fixture, expected] of cases) {
  test(name, () => assert.deepEqual(decidePublicationProof(fixture), expected));
}
