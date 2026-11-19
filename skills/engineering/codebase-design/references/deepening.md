# Deepening

How to deepen shallow modules safely given their dependencies. Terms follow the SKILL.md vocabulary.

## Dependency categories

The category decides how the deepened module is tested across its seam.

1. **In-process.** Pure computation or in-memory state, no I/O. Always deepenable: merge the modules and test through the new interface. No adapter.
2. **Local-substitutable.** A local stand-in exists (PGlite for Postgres, an in-memory filesystem). Test with the stand-in in the suite. The seam stays internal; no port at the external interface.
3. **Remote but owned (ports and adapters).** Services the team owns across a network. Define a port at the seam; the deep module owns the logic and receives the transport as an adapter: HTTP or queue in production, in-memory in tests.
4. **True external (mock).** Third-party services such as a payment or SMS provider. The module takes the dependency as an injected port; tests pass a mock adapter.

## Seam rules

- Add a port only when at least two adapters are justified, usually production and test. A single-adapter seam is indirection.
- Keep internal seams internal. Do not widen the interface because a test uses an internal part.

## Tests: replace, do not layer

- Write new tests at the deepened module's interface; they assert observable outcomes, not internal state.
- Delete the old unit tests on the absorbed shallow modules once the interface tests cover them.
- A test that must change when the implementation changes is testing past the interface.
