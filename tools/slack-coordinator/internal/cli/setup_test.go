package cli

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

// Partial Jira settings fail before setup touches Slack, so a half-typed
// configuration never writes config.yaml. The error text is asserted because
// a check placed after auth.test would surface as a token rejection instead.
func TestSetupRequiresEveryJiraSettingOrNone(t *testing.T) {
	t.Setenv("SLACK_BOT_TOKEN", "xoxb-1")
	t.Setenv("SLACK_APP_TOKEN", "xapp-1")
	t.Setenv("SLACK_COORDINATOR_HOME", t.TempDir())

	cases := []struct {
		name string
		args []string
		env  string
		want string
	}{
		{name: "base url alone", args: []string{"--jira-base-url", "https://acme.atlassian.net"}, want: "all or none"},
		{name: "token alone", env: "tok", want: "all or none"},
		{name: "bad field id", args: []string{"--jira-base-url", "https://acme.atlassian.net", "--jira-email", "me@example.com", "--jira-field-id", "summary"}, env: "tok", want: "customfield_<digits>"},
		{name: "relative base url", args: []string{"--jira-base-url", "acme.atlassian.net", "--jira-email", "me@example.com", "--jira-field-id", "customfield_1"}, env: "tok", want: "absolute http(s) URL"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("JIRA_API_TOKEN", tc.env)
			SetOutput(&bytes.Buffer{})
			t.Cleanup(func() { output = os.Stdout })
			root := NewRoot()
			root.SetArgs(append([]string{"setup", "--owner", "U1"}, tc.args...))
			err := root.Execute()
			if code := exitCode(err); code != ExitUsage {
				t.Fatalf("exit %d, want %d (err %v)", code, ExitUsage, err)
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not name the cause %q", err, tc.want)
			}
		})
	}
}
