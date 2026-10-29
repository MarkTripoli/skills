# Completion follow-up

After each current-head `submitted_verified` closure, reconcile automated PR review threads through the active owner session and record the result. This workflow adds no Slack bot, announcement daemon, audience defaults or scheduling dependency. Follow-up is separate from submission and landing; autonomous action stays within recorded correction, reply and resolution authority.

## Persist resumable follow-up state

Track per exact PR URL and source head: automated review (`pending`, `awaiting_owner`, `done`), native review receipt and each thread's verdict/action in the decision log. On resume read current remote state and continue incomplete steps. A new head revalidates findings and review receipts. Keep independent tickets moving while owner questions wait; an owner-ended run reports open questions rather than inventing completion.

## Triage automated review at the current effective change

1. Read the provider's authenticated discussion/review API. GitHub uses paginated PR review threads, checking `isResolved` and authenticated author metadata plus recognized generated markers. Optional GitLab uses discussions with at least one note where `resolvable == true` and `resolved == false`; system notes with `resolved: null` do not reopen a thread. Do not guess bot identity from display names alone. Human threads remain untouched unless explicitly assigned.
2. Pin source and target heads. Read claimed code from those Git objects, not an unrelated checkout, and evaluate only the effective merge delta against the target or immediate stack parent. Apply recorded owner decisions and repository compatibility rules.
3. Record a concrete verdict per claim. False, already-fixed or outside-delta claims receive an evidence-backed reason. Valid in-scope defects go to the same ticket owner in one coherent correction batch, preserving remote history. Low-value/trivial suggestions are fixed only when proportionate within already touched code; otherwise explain the no-change disposition. Automated severity labels inform priority, not truth.
4. Act autonomously only when standing authority covers the correction and external discussion action. A proposed product behavior or scope change, another repository/layer, destructive operation or missing reply/resolution authority requires an owner decision. Delivery alone never expands that authority. Do not open tracker tickets unless authorized.
5. Reverify and publish correction proof through current-head conformance and closure before posting a verified fixed-in-commit reply. Resolve only supported, authorized dispositions through provider-native thread operations and confirm resulting remote state. Unresolved owner questions stay `awaiting_owner`, not `done`. Report fixed, resolved-without-change, untouched-human and still-open threads separately.

## Ask in the active session

Present each precise question to the authorized owner with a non-blocking native input control when available, or save it as an immutable pending decision artifact and post it in the active conversation. Record actor, answer, revision/head and authority before applying it. Silence, elapsed time and worker statements are not consent. Continue independent work and reconcile pending decisions on resume. No Slack integration is required or added by this follow-up.
