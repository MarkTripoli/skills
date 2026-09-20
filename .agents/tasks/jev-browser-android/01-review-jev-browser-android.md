---
type: code-review
summary: All findings are resolved, independent focused reviews are green, and 130 tests pass. The unchanged previously blocked Phone-selection goal now passes after correcting Spinner/value semantics.
revision: 3da7ded
status: passed
---

# Browser and Android release review

Base: `c5a6148`. Reviewed release: `1f5260a`. Reviewers authored no implementation, tests, temporary probes, or diagnostic programs. Main owns validation and publication; Luna-fast owns every code change and regression.

## Spec findings

1. **High: browser execution can wait indefinitely.** `skills/delivery/jev-ui/scripts/browser.mjs:71-79,122-123` has no deadline for browser subprocesses, CDP connection, or CDP request completion. Action/model counts do not bound an individual stalled call. Add finite command/setup/request failure handling, bounded output, and owned cleanup. Preserve origin interception until the owned browser closes; never convert timeout into an unguarded continuation. Reuse existing suitable process handling rather than introducing a second needless framework.
2. **High: helper descendants can survive timeout.** `scripts/text-helper.mjs:10-11` clears the pending group SIGKILL when the parent closes after SIGTERM. A same-process-group descendant with detached stdio can ignore SIGTERM and survive. Cleanup must complete even when the parent exits first. Add a real parent-obeys/descendant-ignores regression proving descendant disappearance, alongside the existing both-ignore case.
3. **Medium: Android observations retain XML encoding.** `scripts/android.mjs:4` leaves attribute entities encoded. Successful typing of `A & B` reads back as `A &amp; B` and fails exact independent comparison; quotes/angle brackets also differ. Decode XML attributes before interpreting values/names, preserving literal nested entity text rather than repeatedly decoding. Cover independent text readback and safe parsing boundaries.
4. **High: sensitive browser payload fields leak.** `scripts/browser.mjs:29-35` redacts a sensitive control's value/raw text but retains its accessible name and option values/labels. Names such as `API token: abc123` or token-valued selector options enter receipts and provider state. Sanitize sensitive payload fields without leaking them through alternate structured fields or inventing selectable values. Prove secrets absent while ordinary usable controls remain intact.

## Standards findings

5. **Medium: offline acceptance tests access the real Android device.** `scripts/test-acceptance.mjs:24-27,53-56` omit the screenshot injection, invoking default ADB and writing to fixed `/tmp/evidence`/`/tmp/green`. They are device-dependent and can capture live device content. Inject the external boundary, use isolated temporary directories, and prove the offline suite succeeds without native tools. Preserve observable status/cleanup assertions, not mock-forwarding assertions.
6. **Medium: browser runtime requirements conflict.** `scripts/browser.mjs:63-65` needs global WebSocket, but the repository advertises Node 20.12+, whose WebSocket is flag-gated. Keep the existing installer/collection Node requirement; explicitly document the JEV browser's Node 22+ prerequisite and its unavailable-transport outcome unless a simpler compatible packaged transport already exists. Do not add a dependency merely to avoid documenting this skill-specific prerequisite.
7. **Low: canned fixture-state test does not test the fixture.** `scripts/test-acceptance.mjs:19-22` asserts a string hardcoded by `fixtureSmoke()`. Changing the actual fixture status still passes. Remove this canned-state assertion/test rather than repinning it to implementation wording. Retain meaningful fixture and live UI proof.

## Repair and verification boundary

Repair the complete concrete set above in the release worktree only. Targeted Luna-fast-authored regressions may be run to establish failure before repair and passing behavior afterward; skip aggregate suites, builds, formatting, and live UI/device calls during this phase. Main will run final aggregate/focused checks and real acceptance after source is frozen. Do not commit, publish, or resume the old Atomic workflow.

The existing acceptance tests under the skill are currently outside `npm test`. Include the now-isolated acceptance suite in the repository's normal aggregate test command so CI covers the same regression contract; do not suppress or skip it.

Preserve existing green/non-green recordings and all iOS work. Current pre-repair release proof includes passed copied standalone execution without Atomic, browser CLI success/non-green cleanup, full-array recorded browser acceptance, and Android generic/label-equal runs. Those remain historical relative to the repairs; rerun affected paths on final source.

## Focused recheck of 9b8b809

The standards reviewer resolved findings 5–7. The spec reviewer resolved XML decoding (finding 3). Main ran the expanded aggregate suite: 126 passed; all four runtime builds and current browser/Android generic smoke paths passed. These successes do not resolve the remaining failure-path defects.

The next Luna-fast repair is limited to these three remaining issues:

1. **Await process-tree cleanup before settling.** `text-helper.mjs:10-16` resolves while an unreferenced SIGKILL timer is still pending. The real CLI immediately calls `process.exit`, so the escalation never runs. `browser.mjs:129` has the same reject-before-escalation issue. Complete the owned cleanup before returning/rejecting, not through a detached timer. The current test's additional 320ms wait masks the consumer-exit case. Use a real immediately-exiting consumer and a SIGTERM-ignoring descendant, establish readiness, and assert disappearance from outside that consumer. Test cleanup must also run when the regression fails.
2. **Handle late CDP setup failures.** `browser.mjs:76-81` appends popup setup promises after the initial `Promise.all(ready)` has already completed. A later Fetch.enable timeout can be an unhandled rejection that terminates the CLI before cleanup. Consume every setup rejection and propagate a controlled non-green failure with owned cleanup. Add a deferred post-readiness popup setup failure regression; do not release interception into an unguarded continuation.
3. **Redact raw sensitive option payloads.** `browser.mjs:37-38` removes structured options, but raw sanitization only collects the parent value. An API-key selector without that value can still expose raw option values/labels. Cover distinct secret option payloads with no parent value, both structured and raw/provider observations, while ordinary controls remain usable.

Preserve the resolved fixes and original findings. No unrelated audit, iOS work, budget increases, or extra retries. All live commands are finalized; source may now be repaired. Main will recheck these exact issues and rerun affected proof after the writer freezes the source.

## Focused recheck of c20e0b4

Main's aggregate check passes all 129 tests. The same current regression file was executed against isolated pre-fix source `9b8b809`: raw option redaction failed with the opaque value exposed, and the exiting browser consumer failed waiting for descendant disappearance. Both cases pass against `c20e0b4`. No new supervisor test program was authored.

The spec reviewer resolves awaited helper cleanup and raw option redaction. Two related browser cleanup defects remain:

1. `browser.mjs:106` health-gates the owned `close` command as well as normal commands. A late setup failure therefore prevents spawning browser close, after which closing CDP can leave the browser alive. Owned cleanup must bypass the failed normal-action gate; ordinary actions must remain blocked.
2. `browser.mjs:139,143` returns immediately from cleanup when termination is already in progress. Repeated output-overflow chunks can call failure again and settle before the first escalation completes. All failure paths must await the same cleanup promise, not a boolean early return.

The exiting-consumer regression also needs the reported parent-obeys/descendant-ignores variant. Its current helper ignores SIGTERM in both processes. Establish descendant readiness only after that descendant installs its handler; parent-written readiness immediately after spawn is not sufficient. Preserve the passing both-ignore coverage, externally check disappearance, and retain failure cleanup. Use the existing bounded command/test interfaces, not extra product hooks solely for testing.

## Final resolution

The standards reviewer resolved findings 5–7 at `9b8b809`. The spec reviewer resolved every remaining finding at product revision `4a364eb`, including owned browser closure after a failed action-health gate and one shared awaited cleanup promise across concurrent command failures. Both reviewers remained read-only and reported no remaining findings.

Two later commits change only the real-process regression: `073053a` observes consumer exit immediately after spawning, and `e2243c8` allows 1000ms for two real Node processes to start before exercising the configured timeout. The original 60ms allowance failed at readiness under concurrent validation; this was a test startup race, not a product cleanup failure. Production deadlines and budgets were not increased.

Main reran `npm test` at `e2243c8`: 129 passed, zero failed. The final regression file against isolated pre-fix product source `9b8b809` fails both selected cases: the raw opaque option remains exposed, and the SIGTERM-obeying parent leaves its SIGTERM-ignoring descendant alive. The latter fails at the descendant-disappearance assertion, after readiness and consumer exit; the generic polling error text still says “did not become ready.” Failure-path cleanup now runs without hanging or leaving the owned group behind. The same cases pass in the final aggregate suite.

All four runtime builds passed against unchanged product revision `4a364eb`. Live browser, Android, and copied standalone proof is recorded separately in the verification artifact. These reviews do not claim iOS readiness or resumed execution of the paused original Atomic workflow.

## Additional live Android finding

Main's final-source Casey-to-Jordan acceptance at `e2243c8` blocked during its seed transition: JEV typed Casey, opened Channel, then only had WAIT available on Email/Phone until the existing action budget expired. The blocked receipt and recording remain under `evidence/verified-4a364eb/android-replacement/`; they are not a passing replacement proof.

The captured real dropdown hierarchy identifies both rows as enabled, checkable `android.widget.CheckedTextView` controls with valid bounds and `clickable="false"`. `android.mjs:20` recognizes clickable/button controls but omits checkable semantics. Repair the capability mapping so enabled checkable rows expose TAP, without special-casing labels, widening budgets, bypassing JEV, or making disabled checkable-only rows actionable. Retain a focused normalization regression and rerun the affected native scenarios after source freezes.

Resolved in `a444c71`: an explicitly enabled, checkable control now advertises TAP while existing clickable/class-based behavior is unchanged. The focused regression failed before the fix and passed afterward; disabled checkable-only and static rows remain non-tappable. The independent spec reviewer reported correct with no findings on this narrow delta.

Main's complete aggregate suite passes 130 tests, and all four runtime builds pass. The same live Casey-to-Jordan scenario now passes both transitions without a relaunch between them: each transition genuinely opens and selects from the dropdown, types the requested name, confirms, and independently observes its exact status. The final evidence contains two passed assertions, zero failed assertions, and verified video. The earlier blocked attempt remains retained.

## Spinner value versus popup option

The additional `A & B` / Phone run at `a444c71` correctly typed and independently read back the XML-sensitive name, then successfully selected Phone. It subsequently reopened the menu and exhausted the action budget without confirming. This remains blocked, not passed, under `evidence/verified-a444c71/android-xml-phone/`.

The real hierarchy distinguishes the collapsed Spinner's non-clickable checked-text child from detached popup options. The new checkable-only capability branch exposed the collapsed displayed value as a second TAP control beside its clickable Spinner parent. Track actual ancestry: keep the parent actionable and its displayed value observational, while independent and popup checkable rows remain actionable. Do not tune prompts, add retries, raise budgets, or globally suppress checkable rows merely because a Spinner exists elsewhere.

Resolved in `3da7ded` with actual node ancestry, including closing and self-closing tags. The existing regression failed before correction and passed afterward. The independent reviewer confirmed that parent TAP, observational displayed values, detached/sibling options, disabled/static boundaries, and existing clickable/class-based behavior are preserved.

Main's unchanged `A & B` / Phone goal now exits zero, independently observes `Confirmed A & B via Phone.`, and records one passed assertion with verified media. No goal rewriting, retry policy, or budget increase was used. The earlier blocked run remains retained. Aggregate validation passes all 130 tests; all four runtime builds pass. Final native matrix and copied standalone receipts are recorded in the verification artifact.
