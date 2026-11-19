# Engineering

Design, diagnosis and language practice for any codebase, outside a delivery task. Source: `skills/engineering/`.

| Skill | Use it to | Produces |
|---|---|---|
| [`codebase-design`](../skills/engineering/codebase-design/SKILL.md) | Design or deepen one module's interface, or survey a codebase for architecture improvements | An interface chosen from compared designs; or a ranked list of deepening opportunities, with no code changed |
| [`diagnosing-bugs`](../skills/engineering/diagnosing-bugs/SKILL.md) | Work a hard bug with discipline | A reproduction, the proven root cause, then the fix |
| [`typescript-best-practices`](../skills/engineering/typescript-best-practices/SKILL.md) | Hold TypeScript to type-level rules | Code whose types rule out illegal states |
| [`wizard`](../skills/engineering/wizard/SKILL.md) | Hand a person the steps only they can perform | An interactive bash script that opens each URL, captures values and writes them where they belong |

Inside a delivery task, `/reproduce-bug` and `/fix-bug` record the reproduction and the fix as task artifacts; see the [delivery workflow](delivery.md). `diagnosing-bugs` is the same discipline with no task around it. A survey item from `codebase-design` becomes a normal change through `/deliver`.
