# Repository setup receipt

- Mode: [reconcile or reset-managed]
- Observed state: [absent, current, or conflict]
- Observed version: [old schema version and applied revision, or none]
- New version: [planned schema version and applied revision, or none]
- Changed owned fields: [exact onboarding paths, or none]
- Preserved user fields: [exact existing top-level paths preserved, or none]
- Planned paths: [exact repository-relative paths, or none]
- Written: [exact paths, or none]
- Skipped: [items skipped and why, or none]
- Provider outcomes: [each provider logical key, preserved stable ID, preserved last-applied digest, and unsupported status, or none]
- Unresolved choices: [exact user-owned choices, or none]
- Conflicts: [JSON path, observed type or non-secret value class, supported expectation, or none]
- Verification: [written bytes match plan, unchanged bytes match observation, or failed]
- Verification bytes: [planned bytes match reread bytes, observed bytes remain unchanged, or failed]
- External operations: 0
- Safe rerun: [one inline `/setup-repository` or `/setup-repository reset-managed` command when useful, or none]
