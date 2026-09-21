---
"@marktripoli/skills": patch
---

fix(iterate-evidence): structural pending, concurrent lifetime, :Ts

pending(): remove includes()/exact-equality positive list; strip
parenthetical/bracketed annotations before evaluating step wording; a
step qualifies if it mentions repair or diagnos*; rejected only when
it explicitly declares repair completion. Table row handler updated to
structural repair mention and non-terminal state checks.

viewerTemporaryProof: bind temp-file lifetime to the owning read;
appearances in concurrent in-flight reads (reads whose start snapshot
precedes the owning read's end) are authorized regardless of boundary
type; non-concurrent appearances past owner's end still rejected; make
the seconds suffix optional in the timestamp regex so both
'video:3.297s' and 'video:3.297' are recognized as timestamp selectors.

tests: 185/185. Add concurrent overlapping-reads regression. Add R11
regressions for parenthetical next-incomplete-step accepted, non-repair
next-incomplete rejected, finalized table state rejected.
