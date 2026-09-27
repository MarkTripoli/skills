package db

// RunMetrics is a local projection of one persisted run and its invocation evidence.
type RunMetrics struct {
	Run RunOutcome `json:"run"`
	Invocations []AgentInvocation `json:"invocations"`
	Tokens RunTokenTotals `json:"tokens"`
	MediaAttachments []RunMediaAttachment `json:"media_attachments"`
	Cost string `json:"cost"`
}

// RunOutcome exposes only report-safe run identity, outcome, and binary provenance.
type RunOutcome struct {
	ID string `json:"id"`
	Status string `json:"status"`
	Error *string `json:"error,omitempty"`
	SafetyDanceVersion *string `json:"safety_dance_version,omitempty"`
	SafetyDanceBuildSHA *string `json:"safety_dance_build_sha,omitempty"`
	CreatedAt int64 `json:"created_at"`
}

type RunTokenTotals struct {
	Invocations int `json:"invocations"`
	Input *int `json:"input_tokens,omitempty"`
	Output *int `json:"output_tokens,omitempty"`
	CacheRead *int `json:"cache_read_tokens,omitempty"`
	InputReported int `json:"input_reported_invocations"`
	OutputReported int `json:"output_reported_invocations"`
	CacheReadReported int `json:"cache_read_reported_invocations"`
}

// GetRunMetrics projects one exact run ID. Nullable counters preserve missing
// versus observed zero. Resumed sessions use per-round deltas, never cumulatives.
func (d *DB) GetRunMetrics(runID string) (*RunMetrics, error) {
	run, err := d.GetRun(runID)
	if err != nil || run == nil {
		return nil, err
	}
	invocations, err := d.GetAgentInvocationsByRun(runID)
	if err != nil {
		return nil, err
	}
	rows, err := d.sql.Query(`SELECT path, digest, url FROM run_media_attachments WHERE run_id = ? ORDER BY path`, runID)
	if err != nil {
		return nil, err
	}
	var attachments []RunMediaAttachment
	for rows.Next() {
		var a RunMediaAttachment
		if err := rows.Scan(&a.Path, &a.Digest, &a.URL); err != nil {
			rows.Close()
			return nil, err
		}
		attachments = append(attachments, a)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	out := &RunMetrics{
		Run: RunOutcome{ID: run.ID, Status: string(run.Status), Error: run.Error, SafetyDanceVersion: run.SafetyDanceVersion, SafetyDanceBuildSHA: run.SafetyDanceBuildSHA, CreatedAt: run.CreatedAt},
		Invocations: invocations, MediaAttachments: attachments, Cost: "not calculated; no provider-billed cost available",
	}
	out.Tokens.Invocations = len(invocations)
	var input, output, cache int
	for _, inv := range invocations {
		in, inKnown := reportToken(inv.InputTokens, inv.DeltaInputTokens, inv.SessionMode == InvocationModeResumed)
		outTokens, outKnown := reportToken(inv.OutputTokens, inv.DeltaOutputTokens, inv.SessionMode == InvocationModeResumed)
		cacheTokens, cacheKnown := reportToken(inv.CacheReadTokens, inv.DeltaCacheReadTokens, inv.SessionMode == InvocationModeResumed)
		if inKnown { input += in; out.Tokens.InputReported++ }
		if outKnown { output += outTokens; out.Tokens.OutputReported++ }
		if cacheKnown { cache += cacheTokens; out.Tokens.CacheReadReported++ }
	}
	if out.Tokens.InputReported > 0 { out.Tokens.Input = &input }
	if out.Tokens.OutputReported > 0 { out.Tokens.Output = &output }
	if out.Tokens.CacheReadReported > 0 { out.Tokens.CacheRead = &cache }
	return out, nil
}

func reportToken(raw, delta *int, resumed bool) (int, bool) {
	if delta != nil { return *delta, true }
	if resumed || raw == nil { return 0, false }
	return *raw, true
}
