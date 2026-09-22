package assistant

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// schedule is the decoded tasks.schedule JSON: exactly one of Daily (with an
// optional TZ), EveryHours, or At is set.
type schedule struct {
	Daily      string   `json:"daily"`
	TZ         string   `json:"tz"`
	EveryHours *float64 `json:"every_hours"`
	At         string   `json:"at"`
}

// parseSchedule decodes scheduleJSON and rejects a document that names none
// of the three schedule shapes.
func parseSchedule(scheduleJSON string) (schedule, error) {
	var s schedule
	if err := json.Unmarshal([]byte(scheduleJSON), &s); err != nil {
		return schedule{}, fmt.Errorf("schedule %q: %w", scheduleJSON, err)
	}
	if s.Daily == "" && s.EveryHours == nil && s.At == "" {
		return schedule{}, fmt.Errorf("schedule %q names no daily, every_hours, or at", scheduleJSON)
	}
	return s, nil
}

// location is the zone the schedule's wall times are read in: its tz, or UTC
// when it names none.
func (s schedule) location() (*time.Location, error) {
	if s.TZ == "" {
		return time.UTC, nil
	}
	loc, err := time.LoadLocation(s.TZ)
	if err != nil {
		return nil, fmt.Errorf("schedule tz %q: %w", s.TZ, err)
	}
	return loc, nil
}

// NextDue is the instant scheduleJSON next fires after now, in UTC.
// {"daily":"HH:MM","tz":"<IANA>"} is the next instant with that wall time in
// the zone (UTC without tz) strictly after now, computed on calendar days so a
// DST change does not shift the wall time; {"every_hours":n} is now plus n
// hours; {"at":"<RFC3339>"} is that instant, or the zero time once it is no
// longer after now.
func NextDue(scheduleJSON string, now time.Time) (time.Time, error) {
	s, err := parseSchedule(scheduleJSON)
	if err != nil {
		return time.Time{}, err
	}
	switch {
	case s.Daily != "":
		wall, err := time.Parse("15:04", s.Daily)
		if err != nil {
			return time.Time{}, fmt.Errorf("schedule daily %q: %w", s.Daily, err)
		}
		loc, err := s.location()
		if err != nil {
			return time.Time{}, err
		}
		local := now.In(loc)
		next := time.Date(local.Year(), local.Month(), local.Day(), wall.Hour(), wall.Minute(), 0, 0, loc)
		if !next.After(now) {
			next = time.Date(local.Year(), local.Month(), local.Day()+1, wall.Hour(), wall.Minute(), 0, 0, loc)
		}
		return next.UTC(), nil
	case s.EveryHours != nil:
		if *s.EveryHours <= 0 {
			return time.Time{}, fmt.Errorf("schedule every_hours %g is not positive", *s.EveryHours)
		}
		return now.Add(time.Duration(*s.EveryHours * float64(time.Hour))).UTC(), nil
	default:
		at, err := time.Parse(time.RFC3339, s.At)
		if err != nil {
			return time.Time{}, fmt.Errorf("schedule at %q: %w", s.At, err)
		}
		if !at.After(now) {
			return time.Time{}, nil
		}
		return at.UTC(), nil
	}
}

// scheduleText describes when t fires, as `!tasks` prints it: an each_message
// task by its debounce, the others by their schedule JSON. A schedule that
// does not parse is shown verbatim rather than hidden.
func scheduleText(t db.Task) string {
	if t.Trigger == db.TriggerEachMessage {
		return fmt.Sprintf("each message (debounce %ds)", t.DebounceSeconds.Int64)
	}
	s, err := parseSchedule(t.Schedule.String)
	if err != nil {
		return t.Schedule.String
	}
	switch {
	case s.Daily != "":
		tz := s.TZ
		if tz == "" {
			tz = "UTC"
		}
		return fmt.Sprintf("daily %s %s", s.Daily, tz)
	case s.EveryHours != nil:
		return fmt.Sprintf("every %g hours", *s.EveryHours)
	default:
		return "once at " + s.At
	}
}

// dueText formats the RFC 3339 UTC stamp due in the zone t's schedule names,
// so a daily Berlin task reads in Berlin time; without a zone, or when either
// side does not parse, due is returned as stored.
func dueText(t db.Task, due string) string {
	s, err := parseSchedule(t.Schedule.String)
	if err != nil || s.TZ == "" {
		return due
	}
	loc, err := s.location()
	if err != nil {
		return due
	}
	at, err := time.Parse(time.RFC3339, due)
	if err != nil {
		return due
	}
	return at.In(loc).Format(time.RFC3339)
}

// errMalformedTaskID reports an id argument that is neither `t<n>` nor `<n>`.
var errMalformedTaskID = errors.New("malformed task id")

// parseTaskID reads `t<n>` or a bare `<n>`; n must be a positive decimal integer.
func parseTaskID(arg string) (int64, error) {
	digits := strings.TrimPrefix(strings.ToLower(arg), "t")
	if digits == "" || digits[0] < '0' || digits[0] > '9' {
		return 0, errMalformedTaskID
	}
	id, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || id == 0 {
		return 0, errMalformedTaskID
	}
	return id, nil
}
