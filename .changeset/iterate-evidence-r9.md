---
"@marktripoli/skills": patch
---

fix(iterate-evidence): F_PRIM structural reservation rule, F_CONT uniform frame identity

F_PRIM: replace activeReservation exact-match list with structural rule — pending repair holds
when (a) next incomplete step names repair and (b) no declaration says repair is
completed/done/resolved/finalized/terminal. Current step may be any reservation/reserved/pending/
repair-pending wording. The combined slash line no longer pushes false when three labeled lines
are present and consistent; when only the combined line exists, parse by position.

F_CONT: make frame identity uniform across all consumers (reviewProblems, boundedEvidenceProblems,
stoppedEvidenceProblems). An observation binds either a retained PNG/JPEG frame path or a video
path with an explicit timestamp selector; both are verified through the returned image hash.
Non-initial video timestamps must fall within the flow's action window.

Receipt 16: add missing type:implementation frontmatter field.

Regressions: 'reservation persisted', 'reserved', arbitrary current-step prose with next=repair
accepted; 'repair completed' in any field rejected; video+timestamp form accepted; mismatched
hash/timestamp rejected.
