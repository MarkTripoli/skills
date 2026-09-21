# Inspection proves only what was viewed

Open recorded media before diagnose visual bug and before fix. Keep viewer/tool result or trace ref with exact file, hash, session, surface, samples in receipt Inspection ledger. Image-open call show access only; review must also say what app pixels really show against cited expectation.

## Match the observation to the claim

| Claim | Required inspection | Boundary |
| --- | --- | --- |
| Static state | Readable recorded frame(s) with exact timestamps and visible expected/actual state. | Proves sampled states only, not what happened between them. |
| Transition, ordering, duration, flicker, or persistence | Relevant whole recorded interval through video playback or sequential frames; record start/end, playback rate or frame cadence, and capture limitations. | Temporal resolution must support the claim; disclose dropped, unreadable, or missing frames. |
| Absence of a transient defect | Entire claimed interval at adequate temporal resolution. | Sparse event frames cannot rule out flicker or prove persistence; mark the unsupported claim untested. |
| Business or nonvisual outcome | Recorded pixels plus independently observed application state or an appropriate probe, with command/result and revision. | A success toast alone cannot prove persistence, external side effects, or hidden state. |

Recorder `frames` pull event samples, not every frame. Open samples for static claim; use video viewer or sequential pull for time claim. Write exact pull/view commands and cadence when take more samples. Contact sheet too blurry need close frames. Fuzzy pixels need more look in same footage or blocker; no guess fix.

**Per-flow individual frame requirement:** Before mark any flow passed, failed, or untested in coverage table, open that flow own frame by name as own viewer call that give image bytes, and write what pixels show. Use bare kept PNG/JPEG path or bare kept video timestamp selector for this bind call. `?q=` image question give text only, no image-payload identity; if help read image, pair it with a separate bare image/video-timestamp read of same kept sample. Contact sheet or combo view over many flows no count as per-flow individual inspection; each coverage row need own named opened frame and watched pixel value. Flow whose frame not individually opened may only be `untested` with reason.

**Sequential viewer call requirement:** Every bare image-path read or bare video-timestamp read must be own lone tool call, no `bash`, `write`, `read`, browser, delegate, or other tool call in same tool window. Wait for image payload back before write observation, hash, trace bind, or coverage row, then next call. Parallel look no good evidence — viewer temp files must belong to one done read life.

**Frame identity:** Frame observation bind either (a) kept named PNG/JPEG frame pulled from recording and opened by bare path, or (b) kept video file read with explicit bare timestamp selector (e.g., `read video.webm:Ts` where T is the target time in seconds). Both same-good and must bind observation through returned image hash: in (a) write pulled file SHA-256 and good image-result trace entry from bare read; if viewer change image, keep and hash-bind that payload own way. In (b) write SHA-256 of image OMP from timestamp-selector read. For non-first flows, timestamp must sit at or after flow action `videoTime` from `capture.json`. For first-state frame, timestamp must sit strictly before first click action `videoTime`. Wrong hash, text-only `?q=` result, or out-of-window timestamp = observation fail.

DOM/accessibility trees, console output, probes, narration, overlays, assertion tallies, `verified: true`, and file exist are side-support, not recorded-pixel look. Passed label over failing app pixels stay failed; keep both observations, no rewrite labels to hide clash. Good recorder finalize prove media processing, not app correct.

## Preserve time and surface identity

For every observation, name raw or rendered media, its hash, timestamp coordinate system, and app pane/surface. Read session report and manifest timing before turn event time into video time.

Timestamp describe only event its maker saw. Cite maker metadata or source sampling point and keep exact seen field/event names; split reference clock from operation it come before. For browser capture where `startedAt` sample right before `context.newPage`, report that value as pre-page-creation capture reference for `video-started-at`, not navigation time or first encoded frame origin. Mark navigation or encoded-frame time unavailable unless seen own way; served-response identity give neither clock.

Clock read before save reservation is not its persist time, and baseline look time cannot date later reservation. Keep ordered receipt/trace boundary when exact operation timing missing; drop unavailable timestamp out loud, no guess. Use this rule when write observations, not only at final delivery.

- **Cards and overlays:** Count rendered title-card shift and summary card. Neither is app behavior. If overlays hide state, look at raw footage or other render through existing `render` options. Keep original render and label where-from.
- **External capture:** Keep supplied `video-started-at` reference, its maker-defined meaning, and recorder align; name raw video encoded time coordinate own way. Close recording context before import. Write any hand offset or align fix and its seen basis.
- **Offsets:** Use `video_t` and manifest timing, with `offset_applied`, not equate annotation wall clock with shown timestamp. Note if each cited sample is raw or rendered time.
- **Held tails:** Recorder-held last frame only repeat last seen state. It cannot prove persist or app still running through padded gap.
- **Segments and gaps:** Name segment edges, missing footage, and capture cadence limits. Gap cannot prove order, absence, or duration across it.
- **Multiple panes:** Write pane labels and their source sessions. Count wall-clock align, dark leading holds, and any `--no-align` composition. Composite timestamp alone no name source moment.
- **Initial-state frame:** Pull initial-zero frame at `initial` action `videoTime` from `capture.json` `actions` array — strictly before first click action `videoTime`. Do not use recorder-made `test_start` frame as initial-zero frame; that frame get marked right before first click and may show post-click app state from video encoding timing. Use read tool with explicit timestamp selector (e.g., `read video.webm:Ts` where T is `initial.videoTime`) or same kind of pull. Name pulled file to hold `initial` and cite timestamp (e.g., `initial-state-1.125s.png`). Frame pulled at or after first click action `videoTime` no show pre-click initial state.

Re-render or pair old footage help look but cannot prove behavior after source change. Keep raw recordings plus rendered media; optional before/after pair link to both originals. Fake sources, playback dressed as live capture, or cut clips cannot stand in for real recorded interaction.

## Tie proof to the application, not receipt commits

Each capture point to Revision ledger entry. For clean source, keep app SHA and served build/deploy identity. For dirty source, keep base SHA, patch path/hash, and relevant untracked source hashes. No Git — use source snapshot and hashes. Write the restart/reload or served-byte/build compare that show what running app loaded.

Later artifact commit is not new app build; other way too, changed Git file no prove served app changed. When source/environment identity differ from earlier evidence, keep that evidence as history and demand current proof. Media reuse need matching source, environment, reachable raw/rendered material, and required coverage. Write real file availability and post location; local-only evidence on one machine is missing elsewhere until supplied.

## Guardrails defend an observed gap

Before change a check or repo rule, cite the finding and seen gap: what original behavior slip past existing guardrail, with kept run evidence where possible. Name changed assertion/rule, unchanged expected behavior, and why it catch that same failure. Keep failing inputs, thresholds, expected outcomes, and required coverage whole; update baselines or mute failures to get green is not repair.

Run same strong guardrail against kept broken source and fixed source when possible. Keep its input/script hash, both source identities, exact commands, exit codes, stdout/stderr paths, and seen fail/pass. Run kept broken code in isolated spot; no overwrite current work to make the compare. If compare impractical, write reason as clear unverified limit and use direct recorded behavior with no claim guardrail was validated. Missing check required by scope stay blocker.

After any source or check change, look at new recordings of touched flows and whole regression charter. All other required targets must also have latest-revision proof for success. Old passing coverage stay history, not current acceptance. New in-scope defects get new IDs and block success; their repairs stay inside allowance.

## Fail closed and retain partial evidence

When capture, readable media, temporal resolution, or able pixel viewer missing, write the real failure or capability limit, keep reachable material, and stop blocked for touched required proof. Keep known failures next to untested coverage. Still-only fallback can write static observations but cannot finish this video contract. Probe-only result cannot turn required visual coverage into passed.

Write a denial or failed open try when it happen, with exact tool/result; no guess viewing from command name, no invent inspection. Use allowed viewers, never dodge a denied capability. Operational failures no grant extra capture pass or endless retry loop. Later authorized continue write restoration and resume at its saved boundary.

Finding reach `resolved` only after current-revision evidence prove its unchanged expected outcome. Evidence-backed `not-a-defect` disposition write source and reason with no delete history and no pretend repair happen; it is not progress. Unbacked suspicions stay observations. Required coverage, not lower finding count or severity, decide acceptance.

## Finalize the receipt against retained evidence

For passed, failed, and blocked outcomes, check each of template seven coverage columns against revision, recording, inspection, check, and finding ledgers. Overall failure or blocker no collapse the table or erase known per-flow outcomes. Missing current proof stay untested with its gap; older evidence stay historical.

Split current state from history: final summaries name real last done step and any truly incomplete blocked work and prerequisite. Superseded pending steps and reservations stay labeled historical at their original boundaries. Failed done round has no unfinished step just because its finding stay open; interrupted round keep first incomplete step for authorized continue.