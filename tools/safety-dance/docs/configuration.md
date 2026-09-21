# Configuration

Global settings are read from `$SD_HOME/config.yaml`; repository settings are read from `.safety-dance.yaml`. Repository values overlay ordinary global values, while trust-sensitive command policy is resolved from the committed default-branch revision and the wizard's repository-bound bootstrap is used only until that policy exists. Unknown safety-sensitive keys are rejected.

`SD_HOME` also contains the SQLite state database, gates, disposable worktrees, logs, IPC metadata, PID file, and singleton lock. Keep this directory private because it contains local control credentials.
