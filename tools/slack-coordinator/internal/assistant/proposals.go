package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/channel"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// pendingProposal is the JSON stored in dm_requests.pending_proposal: the
// resolved proposal (channel ids in Watch), confirmability, unresolved names,
// and the run that produced it.
type pendingProposal struct {
	Proposal    agent.Proposal `json:"proposal"`
	Confirmable bool           `json:"confirmable"`
	Unresolved  []string       `json:"unresolved,omitempty"`
	RunID       string         `json:"run_id"`
}

// renderProposal resolves watch channels, fills the trigger timezone, renders
// the proposal message, edits the ack, stores the pending proposal JSON, and
// finishes the run as done.
func (s *Service) renderProposal(ctx context.Context, run db.AssistantRun, req db.DMRequest, out agent.RunOutcome) error {
	writeCtx := context.WithoutCancel(ctx)
	now := stamp(s.Now())

	// Resolve each watch entry; track resolved ids and display names together.
	type watchResult struct {
		id          string
		displayName string // without leading #
	}
	var resolved []watchResult
	var unresolved []string
	confirmable := true

	for _, w := range out.Proposal.Watch {
		ref, parseErr := channel.ParseRef(w)
		if parseErr != nil {
			unresolved = append(unresolved, strings.TrimPrefix(w, "#"))
			confirmable = false
			continue
		}
		id, resolveErr := channel.Resolve(ctx, s.Slack, ref)
		if resolveErr != nil {
			name := ref.Name
			if name == "" {
				name = ref.ID
			}
			unresolved = append(unresolved, name)
			confirmable = false
			continue
		}
		// Display name: name-based refs already have the name; id-based refs
		// need one more ConversationInfo call (already cached by service).
		displayName := ref.Name
		if displayName == "" {
			if ch, err := s.Slack.ConversationInfo(ctx, id); err == nil && ch.Name != "" {
				displayName = ch.Name
			} else {
				displayName = id
			}
		}
		resolved = append(resolved, watchResult{id: id, displayName: displayName})
	}

	// Build the stored proposal with channel ids in Watch.
	p := *out.Proposal
	p.Watch = make([]string, 0, len(resolved))
	displayNames := make([]string, 0, len(resolved))
	for _, r := range resolved {
		p.Watch = append(p.Watch, r.id)
		displayNames = append(displayNames, r.displayName)
	}

	// Fill trigger TZ from owner's user info when schedule/daily and TZ unset.
	if p.Trigger.Kind == agent.TriggerSchedule && p.Trigger.Daily != "" && p.Trigger.TZ == "" {
		if u, err := s.Slack.UserInfo(ctx, s.Owner); err == nil {
			p.Trigger.TZ = u.TZ
		}
	}

	pending := pendingProposal{
		Proposal:    p,
		Confirmable: confirmable,
		Unresolved:  unresolved,
		RunID:       run.RunID,
	}

	text := buildProposalText(pending, displayNames, out.Result)

	if req.AckTS.Valid {
		if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, text); err != nil {
			slog.Error("renderProposal: update ack", "run", run.RunID, "error", err)
		}
	}

	proposalJSON, err := json.Marshal(pending)
	if err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "marshal proposal: "+err.Error(), now)
	}

	return s.DB.Transact(writeCtx, func(tx *db.DB) error {
		if req.AckTS.Valid {
			row := db.DMMessage{
				RootTS: req.RootTS,
				TS:     req.AckTS.String,
				Author: db.AuthorBot,
				Text:   text,
				RunID:  sql.NullString{String: run.RunID, Valid: true},
			}
			if err := tx.UpsertDMMessage(writeCtx, row); err != nil {
				return err
			}
		}
		if err := tx.SetPendingProposal(writeCtx, req.RootTS, string(proposalJSON)); err != nil {
			return err
		}
		return tx.FinishAssistantRun(writeCtx, run.RunID, db.RunDone, 0, false, out.ResultSource, "", now)
	})
}

// buildProposalText renders the Slack message for a pending proposal.
// displayNames holds the channel display names (without #) for each resolved
// Watch entry, in order; unresolved names are appended after them.
func buildProposalText(p pendingProposal, displayNames []string, result string) string {
	var sb strings.Builder
	sb.WriteString("*Proposed task*\n")
	sb.WriteString(p.Proposal.Summary)

	if result != "" {
		sb.WriteString("\n")
		sb.WriteString(result)
	}

	// Watch line.
	sb.WriteString("\nWatch: ")
	parts := make([]string, 0, len(displayNames)+len(p.Unresolved))
	for _, name := range displayNames {
		parts = append(parts, "#"+name)
	}
	for _, name := range p.Unresolved {
		parts = append(parts, "#"+name)
	}
	if len(parts) == 0 {
		sb.WriteString("(none)")
	} else {
		sb.WriteString(strings.Join(parts, ", "))
	}

	// Trigger line.
	sb.WriteString("\nTrigger: ")
	sb.WriteString(formatTrigger(p.Proposal.Trigger))

	// Deliver to line.
	sb.WriteString("\nDeliver to: ")
	switch {
	case p.Proposal.DeliverTo.DM:
		sb.WriteString("this DM")
	case p.Proposal.DeliverTo.ChannelID != "":
		sb.WriteString("#" + p.Proposal.DeliverTo.ChannelID)
		if p.Proposal.DeliverTo.ThreadTS != "" {
			sb.WriteString(" thread")
		}
	default:
		sb.WriteString("this DM")
	}

	// Not confirmable warnings (one per unresolved channel).
	for _, name := range p.Unresolved {
		sb.WriteString("\nNot confirmable yet: invite the bot to #")
		sb.WriteString(name)
		sb.WriteString(" first.")
	}

	sb.WriteString("\nReply yes to record this task, no to drop it, or tell me what to change.")
	return sb.String()
}

// formatTrigger renders the trigger descriptor for the proposal message.
func formatTrigger(t agent.Trigger) string {
	switch t.Kind {
	case agent.TriggerSchedule:
		if t.Daily != "" {
			parts := []string{"daily", t.Daily}
			if t.TZ != "" {
				parts = append(parts, t.TZ)
			}
			return strings.Join(parts, " ")
		}
		if t.EveryHours > 0 {
			return fmt.Sprintf("every %d hours", t.EveryHours)
		}
		return "schedule"
	case agent.TriggerWindowEnd:
		if t.At != "" {
			return "once at " + t.At
		}
		return "window end"
	case agent.TriggerEachMessage:
		debounce := t.DebounceSeconds
		if debounce == 0 {
			debounce = 300
		}
		return "each message (debounce " + strconv.Itoa(debounce) + "s)"
	default:
		return t.Kind
	}
}
