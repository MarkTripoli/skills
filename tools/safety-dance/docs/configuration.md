# Configuration

Global settings are read from `$SD_HOME/config.yaml`; repository settings are read from `.safety-dance.yaml` and override global values. Unknown safety-sensitive keys are rejected.

`SD_HOME` also contains the SQLite state database, gates, disposable worktrees, logs, IPC metadata, PID file, and singleton lock. Keep this directory private because it contains local control credentials.
