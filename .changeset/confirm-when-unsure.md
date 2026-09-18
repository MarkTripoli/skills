---
"@marktripoli/skills": patch
---

`delivery-start` pauses once at `confirm` whenever the pack was judged unsure, including hands-off runs with `gates=none`, so an unattended run gets its one determination question instead of running `full` blind; an explicit `--input workflow=` still never confirms.
