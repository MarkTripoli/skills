package agent

import "fmt"

type Verdict string

const (
	VerdictPass Verdict = "pass"
	VerdictFail Verdict = "fail"
)

type Finding struct {
	Severity string `json:"severity"`
	Message  string `json:"message"`
	File     string `json:"file,omitempty"`
}

func ValidateVerdict(v Verdict) error {
	if v != VerdictPass && v != VerdictFail {
		return fmt.Errorf("invalid verdict %q", v)
	}
	return nil
}
