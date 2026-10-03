# New-feature Jira hierarchy and issue bodies

This file + linked Markdown bodies = local authoring policy for `jira-issue-hierarchy`. Use without fetching other policy doc. Set Jira project, issue type, summary, Component, parent, labels, attachments in Jira fields; pasting Markdown description does not set them. Replace every placeholder with evidence from approved requirement doc or selected Story. Never invent acceptance criteria or rewrite unrelated existing tickets to match new template.

## Break down an approved requirement document

1. Read entire approved RFC/spec. Identify all required behavior + constraints in requirement sections, not just motivation.
2. Create/update one [Epic](epic.md) per large feature piece. Create atomic, independently deliverable [Stories](story.md) under each Epic. Story summary starts `<feature name>. <ticket summary>`; Jira **Component** matches feature. Upfront breakdown creates **Epics and Stories only**.
3. Derive Story acceptance criteria from doc's own language. Deep-link each Story to sections it covers + Figma frame when design involved. Design ready → also attach relevant Figma screens in Jira; design not ready → don't block Story. Out-of-scope items name covering ticket or say explicitly none exists. Flag missing/ambiguous requirements, don't guess.
4. Hand off breakdown for grooming or announce to development, design, QA. Track design dependencies in design team's own Jira space; design tickets outside this hierarchy. No Sub-tasks this pass.

`jira-issue-hierarchy` owns the upstream Epic/Story breakdown and Story-start Sub-task authoring. `video-iterative-orchestration` starts from an existing Jira Epic and uses this independent skill for child creation and Story QA checks.

## Start work on a Story

Check spec gives clear use cases, achievable acceptance criteria, ticket scope. Backend: check data model, API contract, critical business logic. Frontend: check API contract + feasible UX design. Flag missing prerequisite, don't guess.

Developer/agent starting Story creates only Sub-tasks needed for implementation, sized for one developer. Check existing children first, reuse matching work; preserve existing parentage. In this delivery flow, set each new Sub-task's Jira **parent** field to its Story. First decide if work independently testable:

- Testable: use [subtask.md](subtask.md). First line `## Acceptance Criteria`, then concrete, testable implementation outcomes.
- Not independently testable: use [subtask-not-testable.md](subtask-not-testable.md). First line says parent Story criteria cover change. Apply Jira's existing `no_qa` label. After merge + developer self-test, may close without entering `Ready for QA` or `Ready to test`.

Implementation notes, dependencies, links go **after** first line. Sub-task criteria support, never replace, parent Story criteria. Developer self-tests + closes agent-owned Sub-tasks after merge; QA reviews Story, not Sub-tasks. Don't apply `no_qa` to testable Sub-task just to dodge QA; keep its acceptance evidence on Story. If Jira automation would route child to QA despite this rule, report workflow mismatch; don't claim Story-only routing works.

## Story QA readiness

Before QA handoff, update Story description with links to spec + design, acceptance criteria, out-of-scope items, impacted areas when relevant. Confirm related PRs **merged**, agent-owned children closed, other child tickets ready to test or closed, change deployed in QA env, required test data available. Submitted PRs + local video evidence alone ≠ QA ready. Skill does not merge or deploy without separate authorization.

## Other issue types

[Task](task.md) reflects portable placeholder body. [Bug / Pre-Release Bug](bug.md) follows recurring reproduction fields; remain distinct Jira issue types. These = local authoring aids, not new-feature hierarchy stages. Projects + additional configured issue types may differ; inspect fields + conventions before authoring. Local bodies not claims about Jira-configured defaults or proof historical issues follow them.