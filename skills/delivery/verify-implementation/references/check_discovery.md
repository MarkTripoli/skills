# Check discovery

Take the repository's checks from its manifests and CI configuration, never from the receipts. Each check found becomes a `C` item.

- `package.json` scripts named `test`, `lint`, `typecheck`, `build`, or `check`, run with the package manager the lockfile names.
- `Makefile` targets `test`, `lint`, `check`.
- `Cargo.toml`: `cargo test`, and `cargo clippy` when CI runs it.
- `go.mod`: `go test ./...`, `go vet ./...`.
- `pyproject.toml`, `setup.cfg`, or `tox.ini`: `pytest`, plus `ruff` or `mypy` when configured.
- `Package.swift`: `swift test`.
- `build.gradle`: `./gradlew test`.
- The commands `.gitlab-ci.yml` and its included GitLab CI files run, minus deployment steps.
