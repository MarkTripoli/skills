# Smell baseline

The Standards axis applies these code smells (Fowler, *Refactoring*, chapter 3) even when the repository documents nothing. Paste this whole file into the Standards worker's prompt.

Two rules bind the baseline:

- **The repository wins.** A documented rule overrides a smell; where the repository endorses a pattern this list would flag, drop the smell.
- **Each smell is a judgement call.** Label it "possible Feature Envy", never a violation. Skip anything tooling already enforces.

Each line reads: smell, what it looks like in a diff, the usual fix.

| Smell | In the diff | Fix |
|---|---|---|
| Mysterious Name | A function, variable or type whose name does not say what it does or holds | Rename it; if no honest name fits, the design is unclear |
| Duplicated Code | The same logic shape in more than one hunk or file | Extract the shared shape and call it from both |
| Feature Envy | A function that reads another object's data more than its own | Move it onto the data it reads |
| Data Clumps | The same few fields or parameters always travel together | Bundle them into one type |
| Primitive Obsession | A string or number standing in for a domain concept | Give the concept its own small type |
| Repeated Switches | The same `switch` or `if` chain on the same type in several places | One lookup table or polymorphism shared by every site |
| Shotgun Surgery | One logical change forces scattered edits across many files | Gather what changes together into one module |
| Divergent Change | One file edited for several unrelated reasons | Split it so each module changes for one reason |
| Speculative Generality | Parameters, hooks or abstractions the spec does not need | Delete them and inline until a real need appears |
| Message Chains | `a.b().c().d()` navigation the caller should not depend on | Hide the walk behind one method on the first object |
| Middle Man | A function or class that only delegates onward | Remove it and call the target directly |
| Refused Bequest | A subclass or implementer that ignores most of what it inherits | Replace inheritance with composition |
