package watch

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestJiraFindsEligibleDirectChildBugsAcrossPages(t *testing.T) {
	var requests int
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/rest/api/3/search/jql" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "reader@example.com" || pass != "secret" {
			t.Error("missing Jira basic auth")
		}
		body, _ := io.ReadAll(r.Body)
		var q struct{ JQL, NextPageToken string }
		if err := json.Unmarshal(body, &q); err != nil {
			t.Error(err)
		}
		if q.JQL != "parent = DEMO-123 AND issuetype = Bug" {
			t.Errorf("JQL = %q", q.JQL)
		}
		w.Header().Set("Content-Type", "application/json")
		if q.NextPageToken == "" {
			_, _ = io.WriteString(w, `{"issues":[{"key":"DEMO-2","fields":{"parent":{"key":"DEMO-123"},"issuetype":{"name":"Bug"},"status":{"name":"Backlog"}}},{"key":"DEMO-3","fields":{"parent":{"key":"DEMO-999"},"issuetype":{"name":"Bug"},"status":{"name":"Backlog"}}},{"key":"DEMO-6","fields":{"parent":{"key":"DEMO-123"},"issuetype":{"name":"Bug"},"status":{"name":"On Hold"}}}],"nextPageToken":"page2","isLast":false}`)
		} else {
			_, _ = io.WriteString(w, `{"issues":[{"key":"DEMO-4","fields":{"parent":{"key":"DEMO-123"},"issuetype":{"name":"Bug"},"status":{"name":"Done"}}},{"key":"DEMO-5","fields":{"parent":{"key":"DEMO-123"},"issuetype":{"name":"Bug"},"status":{"name":"In Progress"}}}],"isLast":true}`)
		}
	}))
	defer srv.Close()
	j := Jira{BaseURL: srv.URL, Email: "reader@example.com", Token: "secret", HTTP: srv.Client()}
	scan, err := j.ScanBugs(context.Background(), "DEMO-123")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(scan.Eligible, []string{"DEMO-2", "DEMO-5"}) || !reflect.DeepEqual(scan.OnHold, []string{"DEMO-6"}) || requests != 2 {
		t.Fatalf("scan = %+v, requests = %d", scan, requests)
	}
}

func TestOnHoldStatus(t *testing.T) {
	for _, status := range []string{"On Hold", "on-hold", " ON  HOLD "} {
		if !OnHoldStatus(status) {
			t.Errorf("status %q not recognized", status)
		}
	}
	if OnHoldStatus("Holding") || OnHoldStatus("Backlog") {
		t.Fatal("unrelated status recognized as On Hold")
	}
}

func TestJiraUsesObservedWorkflowAndAlwaysExcludesHolds(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"issues":[{"key":"PROJ-1","fields":{"parent":{"key":"PROJ-123"},"issuetype":{"name":"Bug"},"status":{"name":"Ready"}}},{"key":"PROJ-2","fields":{"parent":{"key":"PROJ-123"},"issuetype":{"name":"Bug"},"status":{"name":"Backlog"}}},{"key":"PROJ-3","fields":{"parent":{"key":"PROJ-123"},"issuetype":{"name":"Bug"},"status":{"name":"On-Hold"}}}],"isLast":true}`)
	}))
	defer srv.Close()
	j := Jira{BaseURL: srv.URL, Email: "reader@example.com", Token: "secret", HTTP: srv.Client(), EligibleStatuses: []string{" Ready "}}
	scan, err := j.ScanBugs(context.Background(), "PROJ-123")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(scan.Eligible, []string{"PROJ-1"}) || !reflect.DeepEqual(scan.OnHold, []string{"PROJ-3"}) {
		t.Fatalf("custom workflow scan = %+v", scan)
	}
	j.EligibleStatuses = []string{"On Hold"}
	if _, err := j.ScanBugs(context.Background(), "PROJ-123"); err == nil {
		t.Fatal("accepted On Hold as eligible")
	}
	j.EligibleStatuses = []string{""}
	if _, err := j.ScanBugs(context.Background(), "PROJ-123"); err == nil {
		t.Fatal("accepted empty status")
	}
}
