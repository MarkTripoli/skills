# Evidence commands

`deliver/contract.mjs` keeps evidence honest: nonempty captures, playable video, checksums, no synthetic fixtures, receipts bound to a commit. It does not gate phases. Missing Node is a visible blocker.

Set `CONTRACT` to `<skills-dir>/deliver/contract.mjs` and `TASK` to the absolute task directory; run from the task worktree. Receipt paths stay inside the task directory and select current indexed records. Capture/attachment/sample paths are absolute external scratch paths outside the task root, with symlinks rejected. Invalid indexes never fall back to scans.

```bash
node "$CONTRACT" revision "$TASK"     # source fingerprint
node "$CONTRACT" status "$TASK"       # read-only: latest artifact per type, currency, problems, what publication lacks
node "$CONTRACT" policy "$TASK" <policy.json>
node "$CONTRACT" seal "$TASK" <canonical-receipt-path> <record.json>
node "$CONTRACT" inspect "$TASK" <iteration-receipt.md> <inspection.json>
node "$CONTRACT" repair-begin "$TASK" <attempt-id>     # before a source repair after failed inspection
node "$CONTRACT" repair-complete "$TASK" <attempt-id>  # after the source work
```

## Policy

`policy.json` is `{"surfaces":[{"id","kind","behavior","target","expectation"}]}`. Kinds: `web ios android cli api agent docs`. `behavior` is `existing` or `new`; `new` also needs `exemption`. A later call may append surfaces with `amendment_reason`; existing surfaces and `max_repairs` (default none; a cap needs `repair_authorization` naming the owner's decision, set in the first `policy` call) never change. Amending changes the policy hash, so earlier seals must be redone.

## Seal

Record the immutable receipt first (`type: evidence-baseline` or `evidence`), then `record.json`:

```json
{
  "revision": "<revision output>",
  "baseline_commit": "<baseline only: commit the baseline ran>",
  "build_identity": "<observed build>",
  "build_proof": "<optional readback path>",
  "attachments": ["<report or manifest>"],
  "results": [{"surface": "id", "status": "passed|failed", "observed": "<actual state>"},
              {"surface": "id2", "status": "untested", "reason": "<why>"}],
  "captures": [{"surface": "id", "role": "baseline|after|composite|output", "path": "<file>",
                "inspection": {"observed": "<what was seen>", "samples": ["<frame>"]}}],
  "hosted": [{"url": "<direct URL>", "capture": "<file>"}]
}
```

- **Baseline** may be captured any time from a temporary `git worktree add <tmp> <base-sha>`; pass that SHA as `baseline_commit`, then remove the worktree. It must be an ancestor of the merge base with `task.md` `base:` (else the upstream, else origin's default branch); HEAD qualifies only with no tracked change outside the task directory. Existing UI: `baseline` video. Existing non-UI: `output`. New behavior: policy exemption, empty `results` and `captures`.
- **Final** existing UI: `after` plus `composite` (`sources` = baseline and after, `align: false`); new UI: `after`; non-UI: `output`. `revision` must equal the current `revision` output.
- **Untested** surfaces need a `reason`, appear in the PR `Known limits`, and are judged by the final reviewer.
- **Hosted** compares complete original bytes with the inspected local capture over supported direct HTTPS GitHub user-attachment/raw gist/media URLs. Credentialless redirects remain within the same supported allowlist. HTTP errors, login pages, mismatches, oversized or incomplete captures fail closed; no token is sent to arbitrary hosts. Current passed text captures reuse the strict publication parser for invocation, tested SHA, actual stdout and final successful status.
- **Publication** still uses the existing GitHub proof gate: one original capture per required surface, passing recorded tests/cues, matching tested/current-head SHAs, full body and distinct same-PR comment readback, and configured hooks. Contract sealing never bypasses it. Required untested surfaces block readiness.

The sealed record is `.delivery-evidence/<artifact_sha256>.json` and keeps `build_commit`. Keep sealed receipt bytes unchanged. A hash proves identity, not correctness.

The PR description's Evidence section links every verified hosted URL and a separate same-PR `#issuecomment-<id>` URL, never a capture URL with a comment fragment.

## Inspect

`inspection.json` is `{"revision","evidence_sha256":"<seal's artifact_sha256>","status":"passed|failed|blocked","findings":[{"id","observed","expected"}]}`. `passed` needs no findings and passing evidence. Keep finding IDs stable across rounds. A repair after a failed inspection runs between `repair-begin` and `repair-complete`, by the orchestrator or the repair skill. No progress on the same findings, or exhausting an owner cap on source-changing rounds (shared across sessions), makes `status` report a `stop`, not a missing item; the owner's `repair-extension +N: <reason>` line in `task.md` `## Decisions` continues it.
