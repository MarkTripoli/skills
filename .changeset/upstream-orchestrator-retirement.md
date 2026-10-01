---
"@marktripoli/skills": major
---

Replace Atomic and First Sergent with the single `/deliver` orchestrator and independent builder/reviewer records. Remove `--atomic` and retired distribution entrypoints; installation cleans up only recognized collection-owned retired resources and preserves modified resources, unrelated workflows and task history.

Import recent portable upstream delivery, installation, review, visual-conformance and local-tool improvements while retaining the personal GitHub package/provider identity, immutable indexed artifacts, security checks, hosted publication guards and Slack assistant behavior.

Existing Atomic runs are historical state, not resumable through the retired controller. Resume delivery through `/deliver <task-dir>` using the task's current artifacts and recorded decisions.
