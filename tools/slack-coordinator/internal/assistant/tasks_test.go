package assistant

import (
	"testing"
	"time"
)

func TestNextDue(t *testing.T) {
	at := func(s string) time.Time {
		t.Helper()
		v, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	cases := []struct {
		name, schedule, now, want string
	}{
		{"daily after today's wall time rolls to tomorrow", `{"daily":"09:00","tz":"Europe/Berlin"}`, "2026-09-22T08:00:00Z", "2026-09-23T07:00:00Z"},
		{"daily before today's wall time fires today", `{"daily":"09:00","tz":"Europe/Berlin"}`, "2026-09-22T06:00:00Z", "2026-09-22T07:00:00Z"},
		{"daily exactly at the wall time is not after now", `{"daily":"09:00","tz":"Europe/Berlin"}`, "2026-09-22T07:00:00Z", "2026-09-23T07:00:00Z"},
		{"daily keeps the wall time across the DST end", `{"daily":"09:00","tz":"Europe/Berlin"}`, "2026-10-24T08:00:00Z", "2026-10-25T08:00:00Z"},
		{"daily keeps the wall time across the DST start", `{"daily":"09:00","tz":"Europe/Berlin"}`, "2027-03-27T09:00:00Z", "2027-03-28T07:00:00Z"},
		{"daily without tz reads UTC", `{"daily":"23:30"}`, "2026-09-22T08:00:00Z", "2026-09-22T23:30:00Z"},
		{"every_hours adds to now", `{"every_hours":6}`, "2026-09-22T08:00:00Z", "2026-09-22T14:00:00Z"},
		{"every_hours accepts fractions", `{"every_hours":0.5}`, "2026-09-22T08:00:00Z", "2026-09-22T08:30:00Z"},
		{"at in the future is that instant in UTC", `{"at":"2026-09-22T12:00:00+02:00"}`, "2026-09-22T08:00:00Z", "2026-09-22T10:00:00Z"},
		{"at in the past is the zero time", `{"at":"2026-09-20T12:00:00Z"}`, "2026-09-22T08:00:00Z", ""},
		{"at equal to now is the zero time", `{"at":"2026-09-22T08:00:00Z"}`, "2026-09-22T08:00:00Z", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NextDue(tc.schedule, at(tc.now))
			if err != nil {
				t.Fatalf("NextDue(%s, %s) error: %v", tc.schedule, tc.now, err)
			}
			if tc.want == "" {
				if !got.IsZero() {
					t.Fatalf("NextDue(%s, %s) = %s, want the zero time", tc.schedule, tc.now, got.Format(time.RFC3339))
				}
				return
			}
			if got.Location() != time.UTC {
				t.Errorf("NextDue(%s, %s) is in %s, want UTC", tc.schedule, tc.now, got.Location())
			}
			if !got.Equal(at(tc.want)) {
				t.Fatalf("NextDue(%s, %s) = %s, want %s", tc.schedule, tc.now, got.Format(time.RFC3339), tc.want)
			}
		})
	}
}

func TestNextDueRejectsMalformedSchedules(t *testing.T) {
	now := time.Date(2026, 9, 22, 8, 0, 0, 0, time.UTC)
	for _, schedule := range []string{
		`not json`,
		`{}`,
		`{"weekly":"monday"}`,
		`{"daily":"9am"}`,
		`{"daily":"09:00","tz":"Nowhere/City"}`,
		`{"every_hours":0}`,
		`{"every_hours":-2}`,
		`{"at":"tomorrow"}`,
	} {
		if got, err := NextDue(schedule, now); err == nil {
			t.Errorf("NextDue(%s) = %s, want an error", schedule, got.Format(time.RFC3339))
		}
	}
}
