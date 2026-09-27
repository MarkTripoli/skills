---
name: skill-usage-lifecycle
description: Suggest local skill and agent usage lifecycle actions from consented supported-runtime events, with coverage-aware stale candidates and explicit pin or ignore controls.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Skill Usage Lifecycle

Produce a local suggestion report about installed skill/agent usage. This history is separate from immutable task artifact series: never inspect, rewrite, index, or infer usage from task artifacts or their receipts.

## Evidence and privacy

Use only lifecycle events emitted by a supported runtime (Claude Code, Codex, Oh My Pi, or Pi) and explicitly consented to by the user. Each event records only `name`, `version`, and `outcome` (`success`, `failure`, or `interrupted`), plus runtime `source` and `consent`. Do not infer events from shell history, task artifacts, install timestamps, or missing data. Do not collect prompts, arguments, paths, content, identity, or other telemetry. Keep input and report on the local machine; never send network requests or upload either.

Runtime event support is an explicit prerequisite: if no supported consented event source exists, report usage as unknown rather than inventing or backfilling events. Do not enable collection or change consent on the user's behalf.

## Report

Run `node <installed-skill-path>/scripts/skill-usage-lifecycle.mjs <local-events.json>` against a locally supplied JSON document containing `inventory`, `events`, and `coverage`. Inventory entries have `name`, `version`, and optional `pinned`/`ignored` booleans. Events use the fields described above. Coverage can authorize stale-candidate suggestions only when it declares `complete: true`, `consent: true`, a supported runtime `source`, and `observedFrom`/`observedThrough` timestamps spanning at least 30 days and ending no later than report time. Unsupported or non-consented coverage, invalid or future intervals, or missing coverage leave unobserved items `unknown`; no absence of events alone establishes staleness. A sufficient observation window with no matching event may produce `stale-candidate`. Pin takes precedence over ignore; either excludes the item from stale suggestions. Any observed matching usage may be reported active when coverage is incomplete.

Present the report as suggestions only. Never automatically uninstall, delete, disable, or modify any skill or agent. The user may pin or ignore items by updating their local inventory input and rerunning the report. Do not modify the supplied event history.

## Reply

State the report path, coverage determination, and each suggestion; explicitly distinguish `unknown` from `stale-candidate`. If runtime event support or consent is absent, state that lifecycle conclusions are unavailable. No publication, remote sync, or automatic action is authorized.
