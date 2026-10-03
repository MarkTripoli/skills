# Inspection proves only what was viewed

Contents: Match the observation to the claim; Preserve time and surface identity; Tie proof to the application; Guardrails defend an observed gap; Fail closed; Finalize the receipt.

Open the recorded media before you diagnose a visual bug and before you fix it. Keep the viewer's result or trace reference, with the exact file, hash, session, surface, and samples, in the receipt's Inspection ledger. A call that opened an image shows only that you had access. The review must also say what the app's pixels show against the cited expectation.

## Match the observation to the claim

| Claim | Required inspection | Boundary |
| --- | --- | --- |
| Static state | Readable recorded frames with exact timestamps and the visible expected and actual state. | Proves the sampled states only, not what happened between them. |
| Transition, ordering, duration, flicker, or persistence | The whole relevant interval, through video playback or sequential frames. Record start and end, playback rate or frame cadence, and capture limits. | The temporal resolution must support the claim. Disclose dropped, unreadable, or missing frames. |
| Absence of a transient defect | The entire claimed interval at adequate temporal resolution. | Sparse event frames cannot rule out flicker or prove persistence. Mark the unsupported claim untested. |
| Business or nonvisual outcome | Recorded pixels plus independently observed application state or a suitable probe, with its command, result, and revision. | A success toast cannot prove persistence, external side effects, or hidden state. |
| Non-UI command, API, performance, or agent outcome | The retained input, output, exit status, or transcript, with exact line references and source identity. | A report's result label is not captured output. Non-UI work needs no video. |

The recorder's `frames` command pulls event samples, not every frame. Open samples for a static claim. Use a video viewer or a sequential pull for a time claim, and write the exact pull or view commands and the cadence when you take more samples. If a contact sheet is too blurry, look at closer frames. If pixels are still unclear, look again at the same footage or record a blocker; do not guess a fix.

**Per-flow samples.** Open each required UI flow's retained result frame individually, and record what its pixels show. Also open the initial state of each session, a readable frame from strictly before the first interaction. Use a viewer that returns real image or video content. A text-only description, a contact sheet, or a URL string does not establish inspection. A required frame that is unavailable is untested, with its reason.

**Sample identity.** For each sample, retain these facts in the Inspection ledger or the receipt's ledgers:

- The extracted frame file, its SHA-256, the source video hash, and the exact timestamp coordinate.
- The viewer or tool trace. If the viewer transforms the image, retain its returned payload when available. Otherwise state the transformation limit instead of inventing a payload hash.
- The session, the surface or pane, and the revision ID from the Recording ledger.
- The expected outcome from the frozen charter, and any state probe's command, result, and output path.

Inspect each sample before you record its observation.

**Action timing.** Use the recorder's `manifest.json`, `events.jsonl`, and the observed action timing. An external capture script may supply `capture.json`; use its `videoTime` mapping, and its `initial.videoTime` for the initial-state sample. A recorder `test_start` event alone does not prove the pre-action state. If the timing is too thin for the claim, record a blocker instead of a guessed timestamp.

DOM or accessibility trees, console output, probes, narration, overlays, assertion tallies, and `verified: true` support a claim but do not replace looking at recorded pixels. If a passed label sits over failing app pixels, the result stays failed; keep both observations. A good recorder finalization proves media processing, not correct app behavior.

## Preserve time and surface identity

For every observation, name the raw or rendered media, its hash, the timestamp coordinate system, and the app pane or surface. A timestamp describes only the event its producer saw, so cite the producer's field and event names and sampling point. When a timestamp is unavailable, say so instead of guessing. A clock read before a reservation is saved is not its persistence time, and the initial inspection time cannot date a later reservation; when exact timing is missing, keep the ordered receipt or trace boundary.

- **Cards and overlays:** Title and summary cards shift rendered time and are not app behavior. If overlays hide state, look at the raw footage or re-render with other `render` options.
- **External capture:** Keep the supplied `video-started-at` reference and its producer-defined meaning (for example, a clock sampled just before the page was created, not navigation time). Close the recording context before import, and record any hand offset with its observed basis.
- **Offsets:** Use `video_t` and the manifest timing with `offset_applied`, not the annotation's wall clock. Note whether each sample is raw or rendered time.
- **Held tails and gaps:** A held last frame repeats the last seen state and cannot prove persistence. A gap cannot prove order, absence, or duration across it. Name segment edges and cadence limits.
- **Multiple panes:** Name each pane label and source session, and note wall-clock alignment, dark leading holds, and `--no-align`.

Re-rendered or paired old footage cannot prove behavior after a source change. Fake sources, playback presented as live capture, and cut clips are not recorded interaction.

## Tie proof to the application, not receipt state

Each capture points to a Revision ledger entry. For clean source, keep the app SHA and the served build identity. For dirty source, keep the base SHA, the patch path and hash, and hashes of relevant untracked files; without Git, use a source snapshot. Record the restart, reload, or served-byte comparison that shows what the running app loaded.

A saved task artifact or changed Git file does not prove the served app changed. When source or environment identity differs from earlier evidence, keep the earlier evidence as history and require current proof. Reuse media only when source, environment, reachable material, and required coverage match. Local-only evidence on one machine is unavailable elsewhere until supplied.

## Guardrails defend an observed gap

Before changing a check or repository rule, cite the finding and the gap: what original behavior slipped past the guardrail. Name the changed assertion, the unchanged expected behavior, and why the change catches that same failure. Keep failing inputs, thresholds, expected outcomes, and required coverage whole; updating baselines or muting failures is not repair.

When possible, run the same strengthened check against the retained broken source (in an isolated place, never over current work) and the fixed source, and keep both identities, commands, exit codes, and output paths. If that is impractical, record an explicit unverified limit and rely on direct recorded behavior. A required check that is missing stays a blocker.

After any source or check change, record new footage of the touched flows and the whole regression charter. Old passing coverage is history, not current acceptance. New in-scope defects get new IDs and block success.

## Fail closed and retain partial evidence

When capture, readable media, temporal resolution, or a pixel viewer is missing, record the real failure or capability limit, keep the reachable material, and stop blocked for the touched required proof. A still-only fallback or a probe-only result cannot satisfy required visual coverage.

Record a denied or failed open attempt with the exact tool and result. Never guess a view from a command name, and never work around a denied capability. Operational failures grant no extra capture pass or retry loop; a later authorized continuation records the restored prerequisite and resumes at its saved boundary.

A finding reaches `resolved` only when current-revision evidence proves its unchanged expected outcome. A `not-a-defect` disposition records its source and reason, deletes no history, and is not progress. Required coverage decides acceptance, not a lower finding count or severity.

## Finalize the receipt against retained evidence

For every outcome, check the template's seven coverage columns against the revision, recording, inspection, check, and finding ledgers. A failure or blocker does not collapse the table or erase known per-flow outcomes. Missing current proof stays untested with its gap, and older evidence stays historical.

Final summaries name the real last completed step and any truly incomplete work with its prerequisite. Superseded pending steps stay labeled historical. A completed failed round has no unfinished step just because its finding stays open; an interrupted round keeps its first incomplete step for authorized continuation.
