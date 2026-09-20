package pipeline

type Result struct {
	Steps            []StepResult
	Candidate        string
	Published        bool
	PublicationError error
}

func (r Result) Failed() bool {
	for _, s := range r.Steps {
		if !s.Passed || s.Err != nil {
			return true
		}
	}
	return false
}
