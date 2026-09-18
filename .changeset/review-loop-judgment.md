---
"@marktripoli/skills": minor
---

The typed-judgment helper retries rate limits and server errors inside `JUDGE_TIMEOUT` (`JUDGE_RETRIES`, default 2), names an oversized request instead of reporting a generic outage, and prints the model version and token counts of every answered call so a skill can record them beside the verdict. The five gate questions the review, verification, and bugfix loops route on now state their true/false boundary. `review-code` scores how far each of its five axes was examined with the new `axis-coverage` command and re-examines an axis that comes back asserted or skipped, and it carries the previous round's finding identifiers forward as fixed, still open, or declined.
