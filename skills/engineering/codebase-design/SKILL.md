---
name: codebase-design
description: Designs deep modules with a fixed vocabulary (module, interface, depth, seam, adapter, leverage, locality), either shaping one module's interface or surveying a codebase for deepening opportunities and ranking them in a report. Use when the user runs /codebase-design, asks to "design this module's interface", "where should the seam go", "improve the codebase architecture" or "find refactoring opportunities"; not for implementing a chosen refactor (use /deliver) or reviewing a diff (use two-axis-review).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Codebase design

Aim for **deep modules**: much behavior behind a small interface, at a seam where something really varies, tested through that interface. Pick the job from the request:

- **Design** one module's interface or seam: follow [Design a module](#design-a-module).
- **Survey** a codebase or area for deepening opportunities: follow [Survey for deepening](#survey-for-deepening).

## Vocabulary

Use these terms exactly in every reply and report. Do not substitute component, service, unit, API, signature, boundary, layer or wrapper.

| Term | Meaning |
|---|---|
| Module | Anything with an interface and an implementation, at any scale: function, class, package, slice across tiers |
| Interface | Everything a caller must know to use the module: types, plus invariants, ordering, error modes, required config, performance |
| Implementation | The code inside the module |
| Depth | Behavior a caller or test can exercise per unit of interface learned. Deep: small interface, much behavior. Shallow: interface nearly as complex as the implementation |
| Seam | The place where behavior can change without editing there; where an interface lives. Placing it is its own decision |
| Adapter | A concrete thing filling a seam; names a role, not a size |
| Leverage | What callers gain from depth: one implementation pays back across every call site and test |
| Locality | What maintainers gain from depth: change, bugs and verification concentrate in one place |

Depth is measured as leverage, not as a ratio of implementation lines to interface lines, which rewards padding.

## Principles

- **Depth lives in the interface.** A deep module may be built from small swappable parts; they are internal seams, used by its own tests and never exposed.
- **Deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across callers, it earns its place.
- **The interface is the test surface.** Callers and tests cross the same seam. A test that has to reach past the interface means the module has the wrong shape.
- **One adapter is a hypothetical seam; two make a real one.** Add a seam only where something varies across it, usually production and test.
- **Accept dependencies, return results.** Pass collaborators in rather than constructing them inside; return values rather than mutating arguments. Both keep the module testable through its interface.

## Design a module

1. Read the module, its callers and tests. Read `GLOSSARY.md` and ADRs in `docs/adr/` when they exist; use their domain names for modules and do not reopen a recorded decision without new friction.
2. Classify each dependency with [deepening.md](references/deepening.md), which holds the four dependency categories, seam rules and the replace-don't-layer test strategy. Load it whenever a dependency crosses I/O or a network.
3. Write the interface: entry points, parameters, invariants, error modes, and a two-line caller example. Ask of each draft: can it have fewer entry points, simpler parameters, more hidden inside?
4. When the shape is contested or the user wants options, follow [design_it_twice.md](references/design_it_twice.md), which holds the parallel-worker pattern for drafting three or four radically different interfaces and comparing them.
5. Reply with the chosen interface, what it hides, the seam and its adapters, and which existing tests it replaces.

## Survey for deepening

The survey changes no file in the repository. It ends with a ranked list.

1. **Scope.** Take the area the user named. Otherwise run `git log --oneline -200 --name-only` and start from the files that change most; widen only when changes are scattered.
2. **Explore.** Read `GLOSSARY.md` and ADRs when present, then walk the area, in a fresh child worker when the runtime has one. Note friction: one concept spread over many small modules, interfaces as wide as their implementations, logic extracted for testing whose bugs live in the callers, coupling that leaks across seams, code untestable through its current interface. Apply the deletion test to each suspect.
3. **Rank.** For each candidate record files, problem, proposed deepening, dependency category from [deepening.md](references/deepening.md), wins in vocabulary terms, and strength `Strong`, `Worth exploring` or `Speculative`. Flag a candidate that contradicts an ADR only when the friction justifies reopening it.
4. **Report.** Reply with the ranked list, top candidate first, in this shape:

   ```markdown
   1. Fold `src/orders/OrderFacade.mjs` into the order intake module (Strong, in-process)
      Problem: OrderFacade forwards every call unchanged; deleting it moves no complexity.
      Wins: interface shrinks by one module; tests hit one seam.
   ```

   When the user asks for a visual report, or there are more than five candidates, also write the HTML page described in [html_report.md](references/html_report.md), which holds the page scaffold, before-and-after diagram patterns and style rules. Write it to the OS temp directory, never the repository, and give its absolute path.
5. **Stop.** Ask which candidate to explore. Designing its interface is the Design job above; implementing it is a normal change through `/deliver`.
