[{artifact_file}]({artifact_link})

{summary}

Result: `{status}` / `{stop_reason}`; repair rounds consumed: {consumed_rounds}/{limit}.
Application revision: {current_application_revision}

Unresolved findings and failed coverage:
- {unresolved_findings_and_failures}

Untested coverage and blockers:
- {untested_coverage_and_blockers}

Evidence:
- {evidence_links_and_availability}

Guardrails and known limits:
- {guardrail_results_and_known_limits}

Saved boundary: {last_completed_step_and_next_step}
{stop_basis_and_required_next_action}

<!-- Session stop: after emitting this filled template, make no further tool calls or turns. If another turn is forced, re-emit this entire filled template verbatim. Complete todo and commit operations before this turn, not after. -->
