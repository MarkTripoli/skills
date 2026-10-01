# Configuration

Global settings are read from `$SD_HOME/config.yaml`; repository settings are read from `.safety-dance.yaml`. Repository values overlay ordinary global values, while trust-sensitive command policy is resolved from the committed default-branch revision and the wizard's repository-bound bootstrap is used only until that policy exists. Unknown safety-sensitive keys are rejected.

`SD_HOME` also contains the SQLite state database, gates, disposable worktrees, logs, IPC metadata, PID file, and singleton lock. Keep this directory private because it contains local control credentials.

Writable database opens serialize schema migrations in one immediate transaction.
Concurrent CLI and daemon writers take the write lock before reading and wait up
to five seconds for competing writers. The schema retains GitHub pull-request
columns and saved pipeline steps.

Daemon shutdown drains already dispatched IPC replies before exiting, with a
two-second deadline. Operator authorization still rejects unreadable process
environments inside its trusted session; an unreadable SSH login ancestor is
permitted only when its process session is verifiably outside that session.
