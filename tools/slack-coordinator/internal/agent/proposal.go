package agent

// Proposal is the parsed proposal.json an agent may leave in its run
// directory. The schema and its validation land with the proposal child;
// until then the runner never fills RunOutcome.Proposal.
type Proposal struct{}
