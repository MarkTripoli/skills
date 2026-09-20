---
"@marktripoli/skills": patch
---

fix(iterate-evidence): structural reserved, reservation gate, frame self-check

F_NEW_PRIM: replace last-completed-step positive list in reserved() with structural rule —
accept any wording unless it explicitly declares the repair completed/done/resolved/finalized.
Parenthetical and prose forms (e.g., "reservation (consumed_rounds set to 1...)") accepted;
"repair completed" and "repair done" rejected.

F_CONT_V7: add reservation write checkpoint hard gate to SKILL.md step 4.1 — after writing
all reservation fields, save the receipt, read it back, confirm consumed_rounds before any
source/check edit or worker delegation; add "Reservation persisted before any edit: yes"
field to round record template; repeat gate in step 5 for continuation.

F_3R_BRESET: add frame completion self-check to SKILL.md steps 3 and 4.4 — before writing
any coverage or inspection row, enumerate every required frame (1 initial-zero + 1 per flow),
count them, and confirm the count matches; add self-check table to round history template.
