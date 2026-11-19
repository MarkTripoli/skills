# Integrations

Each skill here operates one external tool or platform and is useful only where that tool is. Source: `skills/integrations/`. Install a single skill with `node scripts/install.mjs <runtime> --skill <name> --yes`.

| Skill | Tool | Use it to | Needs |
|---|---|---|---|
| [`jira-issue-hierarchy`](../skills/integrations/jira-issue-hierarchy/SKILL.md) | Jira | Draft Epics and Stories from approved requirements; start a Story; check QA readiness | A Jira connector and the selected project |
| [`jira-issue-refinement`](../skills/integrations/jira-issue-refinement/SKILL.md) | Jira | Turn a thin issue into functional specifications and a QA guide | A Jira connector; approval per issue before any rewrite |
| [`gitlab-inline-comments`](../skills/integrations/gitlab-inline-comments/SKILL.md) | GitLab | Post verified line-anchored review comments | Explicit GitLab selection, `glab`, posting authority |
| [`slack-coordinator`](../skills/integrations/slack-coordinator/SKILL.md) | Slack | Report one agent run to one thread and read the owner's replies | The separately built [daemon](../docs/slack-coordinator.md) |
| [`figma-design-system-sync`](../skills/integrations/figma-design-system-sync/SKILL.md) | Figma | Reconcile a repository's design system with a Figma Make export | The export ZIP and real render proof |
| [`flutter-ui-performance`](../skills/integrations/flutter-ui-performance/SKILL.md) | Flutter | Audit rebuilds, then fix one screen per slice with tests | A Flutter checkout |
| [`coasts`](../skills/integrations/coasts/SKILL.md) | Coasts | Run services and service-backed tests in the Coast for this worktree | The Coast CLI and a Coastfile |
| [`simview`](../skills/integrations/simview/SKILL.md) | Simulators and browsers | Make device and page work visible to the owner | The separately built [viewer](../tools/simview/README.md) |

GitHub pull requests through `gh` are the collection default and need no integration skill.
