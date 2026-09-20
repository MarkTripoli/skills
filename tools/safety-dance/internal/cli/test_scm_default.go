package cli

import (
	"context"
	"os"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
)

type e2eSCMHost struct{}

func (e2eSCMHost) Provider() scm.Provider                                  { return scm.ProviderGitHub }
func (e2eSCMHost) Capabilities() scm.Capabilities                          { return scm.Capabilities{} }
func (e2eSCMHost) Available(context.Context) error                         { return nil }
func (e2eSCMHost) FindPR(context.Context, string, string) (*scm.PR, error) { return nil, nil }
func (e2eSCMHost) CreatePR(_ context.Context, _, _ string, _ scm.PRContent) (*scm.PR, error) {
	return &scm.PR{Number: "1", URL: "https://safety-dance.test/pull/1"}, nil
}
func (e2eSCMHost) UpdatePR(context.Context, *scm.PR, scm.PRContent) (*scm.PR, error) {
	return nil, scm.ErrUnsupported
}
func (e2eSCMHost) GetPRState(context.Context, *scm.PR) (scm.PRState, error) {
	return scm.PRStateOpen, nil
}
func (e2eSCMHost) GetChecks(context.Context, *scm.PR) ([]scm.Check, error) { return nil, nil }
func (e2eSCMHost) GetMergeableState(context.Context, *scm.PR) (scm.MergeableState, error) {
	return scm.MergeableOK, nil
}
func (e2eSCMHost) FetchFailedCheckLogs(context.Context, *scm.PR, string, string, []string) (string, error) {
	return "", scm.ErrUnsupported
}

func newTestSCMHost() scm.Host {
	if os.Getenv("SD_E2E_SCM") == "1" {
		return e2eSCMHost{}
	}
	return nil
}
