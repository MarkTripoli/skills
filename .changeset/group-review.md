---
"@marktripoli/skills": minor
---

Add a `/group-review` skill for reviewing another author's related pull or merge requests as one set. It maps the stack, gathers ticket and product-document requirements, runs one reviewer per request plus a whole-stack reviewer, verifies every major finding against the code, and posts inline comments on GitLab or GitHub only after the user chooses what goes out and approves a test post. Helper scripts pin each request's SHAs, reject anchors outside the diff, and stop posting when a request head moves.
