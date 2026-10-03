# Daemon lifecycle

One daemon owns each `SD_HOME`. It acquires the singleton lock before binding the authenticated local IPC socket. A second daemon exits without replacing the first daemon's socket or PID record.

`daemon stop` waits for the old daemon to release the ownership lock after its IPC socket stops answering. `daemon restart` therefore starts its replacement only after ownership is available, avoiding a false "daemon already owns runtime home" during shutdown. If the lock remains held for five seconds after IPC stops, the command fails instead of starting a competing daemon.

The daemon owns admission, run persistence, cancellation, and service integration. Hooks only ask the daemon to admit or notify; an accepted Git ref is never reported as rolled back when notification fails.

Service definitions bind the executable and exact `SD_HOME`, use restart-on-failure, and are generated through an injectable executor for offline tests.
