---
task: eng-xxxx-description
type: design-tdd
summary: "[Two to four sentences: what this document establishes, the decisions it fixes, and what a later phase needs from it. Downstream sessions read this instead of the full file.]"
repo: [repository name]
branch: [branch name]
sha: [current commit]
---

# [TDD Title]

### System Design

[Cross-component architecture: services, endpoints, schemas, queues, stores, external systems, and the delta from current behavior. Use takeaway-style subheadings and place diagrams or contracts next to the prose they support.]

#### [System takeaway title]

[Current behavior, target behavior, and boundary decision.]

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Service
    User->>UI: action
    UI->>Service: request
    Service-->>UI: result
```

### Program Design

[In-code structure: modules, call paths, component trees, dependency seams, internal signatures, pseudocode, and tests. Keep it selective; exhaustive task lists belong in the outline or plan.]

#### [Program takeaway title]

[Code-shape decision and rationale.]

```text
entrypoint
  validateInput
  applyChange
  reportResult
```

### Type Definitions

[Interfaces, schemas, message shapes, component props, command inputs, or returned values that define the implementation boundary.]

### Configuration

[Settings, environment variables, feature flags, migrations, generated files, or setup changes needed for the design.]

### Error Handling

[Expected failure modes, validation errors, retries, rollback behavior, empty states, and user-visible recovery paths.]

### What We're Not Doing

[Intentional technical non-goals. Omit this section when there are none.]

### Local Patterns

[Relevant repository examples, cited with paths and compact excerpts.]

### Engineering Work Breakdown

[The work as planned: stable work-item ids, a `subgraph` per independent track, verification points and human gates as nodes of their own, one `Critical path:` line naming the item ids in order, and a table whose proof column names an observable command, request, state, or review decision, never "code written".]

```mermaid
flowchart LR
  subgraph track1[Track 1]
    w1["w1 <first work item>"] --> w2["w2 <second work item>"]
  end
  subgraph track2[Track 2]
    w3["w3 <third work item>"] --> w4["w4 <fourth work item>"]
  end
  w2 --> w4
  w4 --> v1{{"v1 <verification step>"}}
  v1 --> g1[["g1 <human gate>"]]
```

Critical path: w1 -> w2 -> w4 -> v1 -> g1

| Item | Depends on | Can run in parallel with | Proof it is done |
|---|---|---|---|
| w1 <first work item> | - | w3 | `<observable command or state>` |
| w2 <second work item> | w1 | w3 | `<observable command or state>` |
| w3 <third work item> | - | w1 | `<observable command or state>` |
| w4 <fourth work item> | w2, w3 | - | `<observable command or state>` |
| v1 <verification step> | w4 | - | `<observable command or state>` |
| g1 <human gate> | v1 | - | `<observable command or state>` |

### Execution DAG

[How this work will be executed: the phases ahead, which pause for approval, what runs unattended, and what verification and review follow. When `index.json` has a current `orchestration.execution` artifact, embed its Mermaid flowchart here and name the phases it dropped with their probabilities. Otherwise describe the fixed chain from `task.md` and workflows/delivery.md, with no flowchart or probabilities.]

```mermaid
flowchart TD
  research["research"] --> design["design discussion<br/>gate: design"]
  design --> plan["plan<br/>gate: plan"]
  plan --> implement["implement<br/>gate: phases"]
  implement --> verify["verify"] --> review["review loop"] --> pr["pr<br/>gate: pr"]
```

## Human Review

### Review targets

- [System and program design boundaries the human should inspect.]

### Verify

- [ ] [Exact architecture, failure-path, or implementation-readiness check.]

### Known limits

- [Known limit, or `None.`]
