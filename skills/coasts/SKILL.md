---
name: coasts
description: Runs services, service-backed tests, logs and service shells in the Coast instance that matches the current worktree, and creates or assigns Coasts when none matches, while keeping lint, typechecks, git and browser tests on the host. Use when the user runs /coasts, the project has a Coastfile, or the user asks to run integration or database tests, read service logs, restart services, assign or reassign a Coast, create a Coast, check Coast ports, or open the Coast UI; not for writing the app's own tests or Docker Compose setups outside Coast.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Coasts

A Coast is a containerized runtime for one worktree of the project: its services, databases and caches run inside it. The host and the Coast share the filesystem, so an edit on either side is visible to both at once. Use the `coast` CLI directly; do not wrap it in scripts.

Requires the `coast` CLI on `PATH` (`coast --version`). If it is missing, stop and tell the user; do not start the project's services on the host instead.

Read applicable repository instructions, the actual Coastfile and its referenced compose or service configuration, and package scripts before choosing directories, service names, or commands. Discover the workspace root and current worktree from repository state. Never assume an app called backend or web, a package manager, database, port, or project name. Command examples below illustrate placement only.

## 1. Find the instance

Run this before the first runtime command of a session, and again after any change to which Coast holds which worktree:

```sh
coast lookup
```

It prints the instance name, its ports and example commands. Use that instance name in every later command (`<instance>` below).

- `coast lookup` matches an instance: go to step 2.
- It matches several: use the one marked checked out (★), or ask the user which one when none is.
- It matches nothing: go to step 3.
- `coast lookup` fails with a harness or worktree error: read the troubleshooting section of the harness doc, for example `coast docs --path harnesses/CLAUDE_CODE.md` (also `CODEX.md`, `CONDUCTOR.md`, `CURSOR.md`, `T3_CODE.md`, `SHEP.md`).

## 2. Run each command where it belongs

Use `coast exec` only for work that needs the container runtime. Everything else runs on the host, because the files are already there and the container adds nothing but latency.

Through `coast exec`:
- Tests that need running services: integration tests, API tests, unit tests wired to a database or cache.
- Service restarts and compose operations.
- Anything that talks to a database, cache or other container-only process.

On the host:
- Linting, typechecking and formatting (`eslint`, `tsc --noEmit`, `prettier`, `gofmt`, `go vet`, `rubocop`).
- Git.
- Package installs (`npm install`, `pip install`).
- File search, code generation and static analysis.
- Playwright and other browser tests. Point the browser at the Coast's dynamic port from `coast lookup` or `coast ports <instance>`. The canonical port (such as `localhost:3000`) also works when the Coast is checked out, but use the dynamic port unless the user says otherwise. Running a browser inside the Coast fails because the container has no browser or display set up for it.

```sh
coast exec <instance> -- sh -c "cd <dir> && npm test"   # needs the database
coast exec <instance> --service <service>               # shell in an app or service container
npm run lint                                             # host

coast ports <instance>
# SERVICE    CANONICAL  DYNAMIC
# ★ web      3000       62217
BASE_URL=http://localhost:62217 npx playwright test      # host, dynamic port
```

Use `--service <service>` when the command has to run inside a specific app or service container rather than the Coast's own container.

Runtime feedback:

```sh
coast ps <instance>
coast logs <instance> --service <service> --tail 50
```

Do not start the project's services on the host when the project expects a Coast; they would collide with the Coast's ports and data.

## 3. Create or assign a Coast

Run `coast ls` to see every instance, then:

- An unassigned Coast for this project is running: assign the worktree to it, `coast assign <instance> -w <worktree>`.
- Every Coast for this project is assigned or checked out: ask the user before reassigning one, because reassigning moves another worktree off its slot. Offer a new Coast as the default.
- No Coast is running: ask the user before creating one, because Coasts use a lot of memory. On approval, run `coast run <name> -w <worktree>`, which creates and assigns in one step.
- `coast run` fails because no build exists: run `coast build`, then `coast run` again.

The same question applies to `coast unassign` and `coast checkout` when they would disrupt a slot someone else is using. After any of these, rerun `coast lookup` to confirm the match before continuing with step 2.

To open the dashboard when the user asks for it, run `coast ui`.

## 4. Read the docs before guessing

When Coast behavior is unclear, read the docs instead of inferring from command names:

```sh
coast docs                                              # list every page
coast search-docs "your question"                       # semantic search
coast docs --path concepts_and_terminology/RUN.md
coast docs --path concepts_and_terminology/ASSIGN.md
coast docs --path concepts_and_terminology/BUILDS.md
coast docs --path concepts_and_terminology/PORTS.md
```

Before writing or changing a Coastfile (compose setup, ports, volumes, secrets, shared services, bare services, inheritance), read `coast docs --path coastfiles/README.md`.
