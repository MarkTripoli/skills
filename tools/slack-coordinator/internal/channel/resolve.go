package channel

import (
	"context"
	"errors"
	"fmt"

	"github.com/slack-go/slack"
)

// Lookup is the slice of the Slack Web API resolution needs.
type Lookup interface {
	// ConversationInfo is conversations.info for one channel ID.
	ConversationInfo(ctx context.Context, id string) (*slack.Channel, error)
	// ListConversations is one conversations.list page over public and
	// private channels, archived included, 200 per page. An empty returned
	// cursor ends the listing.
	ListConversations(ctx context.Context, cursor string) ([]slack.Channel, string, error)
}

// Resolve returns the channel ID for ref after confirming the channel exists,
// is not archived, and has the bot as a member. Errors name the cause.
func Resolve(ctx context.Context, l Lookup, ref Ref) (string, error) {
	var ch *slack.Channel
	var err error
	if ref.ID != "" {
		ch, err = byID(ctx, l, ref.ID)
	} else {
		ch, err = byName(ctx, l, ref.Name)
	}
	if err != nil {
		return "", err
	}
	label := ref.String()
	if ch.Name != "" {
		label = "#" + ch.Name
	}
	if ch.IsArchived {
		return "", fmt.Errorf("channel %s is archived", label)
	}
	if !ch.IsMember {
		return "", fmt.Errorf("bot is not a member of %s", label)
	}
	return ch.ID, nil
}

func byID(ctx context.Context, l Lookup, id string) (*slack.Channel, error) {
	ch, err := l.ConversationInfo(ctx, id)
	if err != nil {
		var slackErr slack.SlackErrorResponse
		if errors.As(err, &slackErr) && slackErr.Err == "channel_not_found" {
			return nil, fmt.Errorf("channel %s not found", id)
		}
		return nil, fmt.Errorf("look up channel %s: %w", id, err)
	}
	return ch, nil
}

func byName(ctx context.Context, l Lookup, name string) (*slack.Channel, error) {
	cursor := ""
	for {
		page, next, err := l.ListConversations(ctx, cursor)
		if err != nil {
			return nil, fmt.Errorf("list channels for #%s: %w", name, err)
		}
		for i := range page {
			if page[i].Name == name {
				return &page[i], nil
			}
		}
		if next == "" {
			return nil, fmt.Errorf("channel #%s not found", name)
		}
		cursor = next
	}
}
