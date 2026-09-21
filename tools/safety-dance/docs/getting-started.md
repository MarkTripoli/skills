# Getting started

Safety Dance protects a repository with a local bare gate and a durable daemon.

1. Build the command with `go build ./cmd/safety-dance`.
2. Run `safety-dance init` from a checkout with an `origin` remote.
3. Start the daemon with `safety-dance daemon start`.
4. Push normally. The `safety-dance` remote authenticates the receive hook before accepting a ref.

The runtime home is `SD_HOME`, defaulting to `~/.safety-dance`. Skill installation is owned by the repository installer and is separate from binary installation.
