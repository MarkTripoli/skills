# Design it twice

Use when an interface is contested or the user wants alternatives. The first design is rarely the best (Ousterhout), so draft several radically different ones in parallel and compare.

1. **Frame the problem.** Show the user the constraints the interface must satisfy, its dependencies and their categories from [deepening.md](deepening.md), and a rough code sketch that makes the constraints concrete. It is not a proposal. Continue without waiting.
2. **Start three or four workers in parallel**, each in a fresh context. Give each the file paths, coupling details, dependency categories, what sits behind the seam, the SKILL.md vocabulary and any `GLOSSARY.md` terms, plus one constraint:
   - Minimize the interface: one to three entry points, maximum leverage each.
   - Maximize flexibility: support many uses and extension.
   - Optimize for the most common caller: the default case is trivial.
   - Ports and adapters for every cross-seam dependency (only when one exists).

   Without child workers, draft the designs yourself one at a time, finishing each before starting the next.
3. **Each design returns:** the interface (types, entry points, invariants, ordering, error modes), a caller example, what the implementation hides, the dependency strategy and adapters, and where leverage is high or thin.
4. **Compare.** Present the designs one by one, then contrast them on depth, locality and seam placement. Recommend one, or a named hybrid, and say why.
