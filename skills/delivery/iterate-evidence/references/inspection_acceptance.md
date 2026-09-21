# Inspection proves only what was viewed

Open recorded media before diagnosing a visual defect and before resolving it. Retain the viewer/tool result or trace reference with the exact file, hash, session, surface, and samples in the receipt's Inspection ledger. An image-opening call establishes access; the review must also state what the application pixels actually showed against the cited expectation.

## Match the observation to the claim

| Claim | Required inspection | Boundary |
| --- | --- | --- |
| Static state | Readable recorded frame(s) with exact timestamps and visible expected/actual state. | Proves sampled states only, not what happened between them. |
| Transition, ordering, duration, flicker, or persistence | Relevant whole recorded interval through video playback or sequential frames; record start/end, playback rate or frame cadence, and capture limitations. | Temporal resolution must support the claim; disclose dropped, unreadable, or missing frames. |
| Absence of a transient defect | Entire claimed interval at adequate temporal resolution. | Sparse event frames cannot rule out flicker or prove persistence; mark the unsupported claim untested. |
| Business or nonvisual outcome | Recorded pixels plus independently observed application state or an appropriate probe, with command/result and revision. | A success toast alone cannot prove persistence, external side effects, or hidden state. |

Recorder `frames` extracts event samples, not every frame of an interaction. Open those samples for static assertions; use an available video viewer or sequential extraction for a temporal claim. Record exact extraction/viewing commands and cadence when taking additional samples. A contact sheet with unreadable detail needs focused frames. Uncertain pixels require further inspection within the existing footage or a blocker; they do not justify guessing a repair.

**Per-flow individual frame requirement:** Before marking any required flow as passed, failed, or untested in the coverage table, open that flow's specific frame by name as a distinct viewer call that returns image bytes, and record what its pixels show. Use a bare retained PNG/JPEG path or a bare retained video timestamp selector for this binding call. A `?q=` image question returns text only and does not establish image-payload identity; if it helps interpret the image, pair it with a separate bare image/video-timestamp read of the same retained sample. A contact sheet or composite view covering multiple flows at once does not count as individual per-flow inspection; each coverage-table row must be backed by its own named opened frame and an observed pixel value. A flow whose frame was not individually opened may only be recorded as `untested` with the reason.

**Frame identity:** A frame observation binds either (a) a retained named PNG/JPEG frame extracted from the recording and opened by bare path, or (b) the retained video file read with an explicit bare timestamp selector (e.g., `read video.webm:Ts` where T is the target time in seconds). Both forms are equivalent and must bind the observation through the returned image hash: in form (a) record the extracted file's SHA-256 and the successful image-result trace entry from the bare read; if the viewer transforms the image, retain and hash-bind that returned payload separately. In form (b) record the SHA-256 of the image OMP returned from the timestamp-selector read. For non-initial flows, the timestamp must fall at or after the flow's action `videoTime` from `capture.json`. For the initial-state frame, the timestamp must be strictly before the first click action's `videoTime`. A mismatched hash, text-only `?q=` result, or out-of-window timestamp fails the observation.

DOM/accessibility trees, console output, probes, narration, overlays, assertion tallies, `verified: true`, and file existence are corroboration, not recorded-pixel inspection. A passed label over failing application pixels remains failed; retain both observations without rewriting labels to conceal disagreement. A successful recorder finalization proves media processing, not application correctness.

## Preserve time and surface identity

For every observation, name raw or rendered media, its hash, timestamp coordinate system, and the application pane/surface. Read the session report and manifest timing before translating event time into video time.

A timestamp describes only the event its producer observed. Cite the producer metadata or source sampling point and preserve exact observed field/event names; distinguish a reference clock from the operation it precedes. For browser capture whose `startedAt` is sampled immediately before `context.newPage`, report that existing value as the pre-page-creation capture reference used for `video-started-at`, not navigation time or the first encoded frame's origin. Record navigation or encoded-frame time as unavailable unless independently observed; served-response identity does not supply either clock.

A clock read before saving a reservation is not its persistence time, and a baseline inspection time cannot date a later reservation. Preserve the ordered receipt/trace boundary when exact operation timing is unavailable; explicitly omit the unavailable timestamp rather than infer one. Apply this attribution when recording observations, not only at terminal delivery.

- **Cards and overlays:** Account for the rendered title-card shift and summary card. Neither is application behavior. If overlays obscure state, inspect raw footage or an alternate render through the existing `render` options. Retain the original render and label provenance.
- **External capture:** Preserve the supplied `video-started-at` reference, its producer-defined meaning, and recorder alignment; identify the raw video's encoded time coordinate separately. Close the recording context before import. Record any manual offset or alignment correction and its observed basis.
- **Offsets:** Use `video_t` and manifest timing, including `offset_applied`, rather than equating an annotation's wall clock with a displayed timestamp. Note whether each cited sample is raw or rendered time.
- **Held tails:** A recorder-held last frame only repeats the last observed state. It cannot establish persistence or continued application execution through the padded interval.
- **Segments and gaps:** Identify segment boundaries, missing footage, and capture cadence limits. A gap cannot prove ordering, absence, or duration across it.
- **Multiple panes:** Record pane labels and their source sessions. Account for wall-clock alignment, dark leading holds, and any `--no-align` composition. A composite timestamp alone does not identify a source moment.
- **Initial-state frame:** Extract the initial-zero frame at the `initial` action's `videoTime` from `capture.json`'s `actions` array — strictly before the first click action's `videoTime`. Do not use the recorder-generated `test_start` frame as the initial-zero frame; that frame is annotated right before the first click and may show post-click application state due to video encoding timing. Use the read tool with an explicit timestamp selector (e.g., `read video.webm:Ts` where T is `initial.videoTime`) or equivalent extraction. Name the extracted file to include `initial` and cite the timestamp (e.g., `initial-state-1.125s.png`). A frame extracted at or after the first click action's `videoTime` does not show the pre-click initial state.

Re-rendering or pairing old footage aids inspection but cannot establish behavior after a source change. Keep raw recordings as well as rendered media; an optional before/after pair links to both originals. Synthetic sources, playback presented as live capture, or edited clips cannot substitute for the actual recorded interaction.

## Tie proof to the application, not receipt commits

Each capture references a Revision ledger entry. For clean source, retain the application SHA and served build/deployment identity. For dirty source, retain the base SHA, patch path/hash, and relevant untracked source hashes. Without Git, use the source snapshot and hashes. Record the restart/reload or served-byte/build comparison that shows what the running application loaded.

A subsequent artifact commit is not a new application build; conversely, a changed Git file does not prove the served app changed. When source/environment identity differs from earlier evidence, retain that evidence as history and require current proof. Media reuse requires matching source, environment, accessible raw/rendered material, and required coverage. Record actual file availability and posting location; local-only evidence on one machine is unavailable elsewhere until supplied.

## Guardrails defend an observed gap

Before changing a check or repository rule, cite the finding and observed gap: what original behavior escaped the existing guardrail, with retained execution evidence where available. Name the changed assertion/rule, unchanged expected behavior, and why it detects that same failure. Keep failing inputs, thresholds, expected outcomes, and required coverage intact; updating baselines or suppressing failures to get green is not a repair.

Run the same strengthened guardrail against the preserved faulty source and the repaired source when feasible. Retain its input/script hash, both source identities, exact commands, exit codes, stdout/stderr paths, and observed fail/pass. Execute preserved faulty code in an isolated location; do not overwrite current work to manufacture the comparison. If this comparison is impractical, record the reason as an explicit unverified limit and use direct recorded behavior without claiming that the guardrail was validated. An unavailable check required by the scope remains a blocker.

After any source or check change, inspect new recordings of affected flows and the complete regression charter. All other required targets must also have latest-revision proof for success. Old passing coverage remains history, not current acceptance. New in-scope defects receive new IDs and prevent success; their repairs remain within the allowance.

## Fail closed and retain partial evidence

When capture, readable media, temporal resolution, or a capable pixel viewer is unavailable, record the actual failure or capability limit, preserve reachable material, and stop blocked for the affected required proof. Keep known failures alongside untested coverage. Still-only fallback can document static observations but cannot complete this video contract. A probe-only result cannot turn required visual coverage into passed.

Record a denial or failed opening attempt when one occurs, including the exact tool/result; do not infer viewing from a command's name or invent an inspection. Use available permitted viewers, never evade a denied capability. Operational failures do not authorize an extra capture pass or an unlimited retry loop. A later authorized continuation records restoration and resumes its saved boundary.

A finding reaches `resolved` only after current-revision evidence proves its unchanged expected outcome. An evidence-backed `not-a-defect` disposition records the source and reason without deleting history or pretending a repair occurred; it is not progress. Unsupported suspicions stay observations. Required coverage, rather than a reduced finding count or severity, determines acceptance.

## Finalize the receipt against retained evidence

For passed, failed, and blocked outcomes, check each of the template's seven coverage columns against the revision, recording, inspection, check, and finding ledgers. An overall failure or blocker does not collapse the table or erase known per-flow outcomes. Missing current proof stays untested with its gap; older evidence stays historical.

Separate current state from history: terminal summaries name the actual last completed step and any genuinely incomplete blocked work and prerequisite. Superseded pending steps and reservations remain labeled historical at their original boundaries. A failed completed round has no unfinished step merely because its finding remains open; an interrupted round retains the first incomplete step for authorized continuation.
