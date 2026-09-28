Hosted recordings: {direct URLs/types for captures actually uploaded and inspected, or "None—upload blocked"}
Tested revision: {full_tested_sha} | {Current PR head when one exists; otherwise "PR not created"}

Result: {failed or blocked; name exact failed target/host/revision blocker}
Check:
- {For every attempted target: actual result, test name, capture label if hosted, timestamp/output line if recorded}

Caveats:
- {Precise missing capture/permission/status or None.}

Posted to: {Only actual same-PR comment and supplied issue permalinks after readback; otherwise "Not published"}

The failure blocks PR readiness. Repair the implementation or recording environment, then capture the required surfaces again; do not describe the PR as ready. The next phase has not started.

Next action:
Open a new session in {run_location}, then run:

```text
/iterate-implementation @{plan_file}
```
