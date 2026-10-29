# New-feature Jira hierarchy and issue bodies

This file and linked Markdown bodies are portable authoring defaults, not a project's configured policy. Resolve the selected Jira project and inspect its issue hierarchy, required fields, labels and transitions first. Use the project's observed conventions where they differ. Set project, issue type, summary, Component when supported, parent, labels and attachments in Jira fields; Markdown alone does not set them. Replace placeholders with approved source evidence; never invent acceptance criteria or rewrite unrelated tickets to match a template.

## Break down an approved requirement document

1. Read entire approved RFC/spec. Identify all required behavior + constraints in requirement sections, not just motivation.
2. Create/update one [Epic](epic.md) per large feature piece and independently deliverable [Stories](story.md) beneath it, mapped to the project's observed hierarchy. Use its summary and Component conventions; absent a convention, use `<feature name>. <ticket summary>` and omit unsupported fields. Upfront breakdown creates Epics and Stories only.
3. Derive Story acceptance criteria from doc's own language. Deep-link each Story to sections it covers + Figma frame when design involved. Design ready → also attach relevant Figma screens in Jira; design not ready → don't block Story. Out-of-scope items name covering ticket or say explicitly none exists. Flag missing/ambiguous requirements, don't guess.
4. Hand off the breakdown for the project's grooming or development/QA review. Link design dependencies to their observed owner and tracking location. No Sub-tasks this pass.

`jira-issue-hierarchy` owns the upstream Epic/Story breakdown and Story-start Sub-task authoring. `video-iterative-orchestration` starts from an existing Jira Epic and uses this independent skill for child creation and Story QA checks.

## Start work on a Story

Check spec gives clear use cases, achievable acceptance criteria, ticket scope. Backend: check data model, API contract, critical business logic. Frontend: check API contract + feasible UX design. Flag missing prerequisite, don't guess.

Developer/agent starting Story creates only Sub-tasks needed for implementation, sized for one developer. Check existing children first, reuse matching work; preserve existing parentage. In this delivery flow, set each new Sub-task's Jira **parent** field to its Story. First decide if work independently testable:

- Testable: use [subtask.md](subtask.md). First line `## Acceptance Criteria`, then concrete, testable implementation outcomes.
- Not independently testable: use [subtask-not-testable.md](subtask-not-testable.md). First line says parent Story criteria cover the change. Use an existing project QA-exclusion label only after confirming its meaning (`no_qa` is an example, not a required label). Close after merge and developer self-test only when the project's workflow permits it.

Implementation notes, dependencies and links follow the first line. Sub-task criteria support, never replace, parent Story criteria. Check whether QA reviews Stories, children or both; follow that observed routing. Do not label testable work as QA-excluded. Report conflicts with project automation rather than claiming a template changes routing.

## Story QA readiness

Before QA handoff, update Story description with links to spec + design, acceptance criteria, out-of-scope items, impacted areas when relevant. Confirm related PRs **merged**, agent-owned children closed, other child tickets ready to test or closed, change deployed in QA env, required test data available. Submitted PRs + local video evidence alone ≠ QA ready. Skill does not merge or deploy without separate authorization.

## Other issue types

[Task](task.md) reflects portable placeholder body. [Bug / Pre-Release Bug](bug.md) follows recurring reproduction fields; remain distinct Jira issue types. These = local authoring aids, not new-feature hierarchy stages. Projects + additional configured issue types may differ; inspect fields + conventions before authoring. Local bodies not claims about Jira-configured defaults or proof historical issues follow them.