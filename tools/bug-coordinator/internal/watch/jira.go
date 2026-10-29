package watch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type Jira struct {
	BaseURL          string
	Email            string
	Token            string
	HTTP             *http.Client
	EligibleStatuses []string
}

type BugScan struct {
	Eligible []string
	OnHold   []string
}

type searchPage struct {
	Issues []struct {
		Key    string `json:"key"`
		Fields struct {
			Parent struct {
				Key string `json:"key"`
			} `json:"parent"`
			Type struct {
				Name string `json:"name"`
			} `json:"issuetype"`
			Status struct {
				Name string `json:"name"`
			} `json:"status"`
		} `json:"fields"`
	} `json:"issues"`
	NextPageToken string `json:"nextPageToken"`
	IsLast        bool   `json:"isLast"`
}

var eligibleStatus = map[string]bool{
	"Backlog": true, "Selected for Development": true,
	"In Progress": true, "Code Review": true,
}

func (j Jira) ScanBugs(ctx context.Context, epic string) (BugScan, error) {
	if !ValidKey(epic) {
		return BugScan{}, fmt.Errorf("invalid epic key %q", epic)
	}
	base, err := url.Parse(j.BaseURL)
	if err != nil || base == nil || base.Scheme != "https" || base.Host == "" || base.User != nil || (base.Path != "" && base.Path != "/") || base.RawQuery != "" || base.Fragment != "" {
		return BugScan{}, fmt.Errorf("Jira base URL must be an HTTPS origin")
	}
	if j.Email == "" || j.Token == "" {
		return BugScan{}, fmt.Errorf("Jira email and token are required")
	}
	statuses := eligibleStatus
	if j.EligibleStatuses != nil {
		statuses = make(map[string]bool, len(j.EligibleStatuses))
		for _, status := range j.EligibleStatuses {
			status = strings.TrimSpace(status)
			if status == "" {
				return BugScan{}, fmt.Errorf("eligible statuses must not be empty")
			}
			if OnHoldStatus(status) {
				return BugScan{}, fmt.Errorf("On Hold cannot be an eligible status")
			}
			statuses[status] = true
		}
		if len(statuses) == 0 {
			return BugScan{}, fmt.Errorf("at least one eligible status is required")
		}
	}
	client := j.HTTP
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	endpoint := base.JoinPath("rest", "api", "3", "search", "jql")
	all := map[string]bool{}
	held := map[string]bool{}
	seenPages := map[string]bool{}
	next := ""
	for {
		body := map[string]any{
			"jql":        "parent = " + epic + " AND issuetype = Bug",
			"fields":     []string{"parent", "issuetype", "status"},
			"maxResults": 100,
		}
		if next != "" {
			body["nextPageToken"] = next
		}
		payload, _ := json.Marshal(body)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
		if err != nil {
			return BugScan{}, err
		}
		req.SetBasicAuth(j.Email, j.Token)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return BugScan{}, fmt.Errorf("Jira search: %w", err)
		}
		var page searchPage
		if resp.StatusCode == http.StatusOK {
			err = json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&page)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return BugScan{}, fmt.Errorf("Jira search returned HTTP %d", resp.StatusCode)
		}
		if err != nil {
			return BugScan{}, fmt.Errorf("decode Jira search: %w", err)
		}
		for _, issue := range page.Issues {
			if !ValidKey(issue.Key) {
				return BugScan{}, fmt.Errorf("Jira returned invalid key %q", issue.Key)
			}
			if issue.Fields.Parent.Key != epic || !strings.EqualFold(issue.Fields.Type.Name, "Bug") {
				continue
			}
			if OnHoldStatus(issue.Fields.Status.Name) {
				held[issue.Key] = true
			} else if statuses[issue.Fields.Status.Name] {
				all[issue.Key] = true
			}
		}
		if page.IsLast {
			break
		}
		if page.NextPageToken == "" {
			return BugScan{}, fmt.Errorf("Jira search omitted nextPageToken before the last page")
		}
		if seenPages[page.NextPageToken] {
			return BugScan{}, fmt.Errorf("Jira repeated page token")
		}
		seenPages[page.NextPageToken] = true
		next = page.NextPageToken
	}
	keys := make([]string, 0, len(all))
	for key := range all {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	heldKeys := make([]string, 0, len(held))
	for key := range held {
		heldKeys = append(heldKeys, key)
	}
	sort.Strings(heldKeys)
	return BugScan{Eligible: keys, OnHold: heldKeys}, nil
}

func OnHoldStatus(status string) bool {
	return strings.EqualFold(strings.Join(strings.Fields(strings.ReplaceAll(status, "-", " ")), " "), "on hold")
}
