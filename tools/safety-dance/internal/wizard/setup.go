package wizard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
)

type Setup struct {
	In    io.Reader
	Out   io.Writer
	Write func(Model) error
	// Compensate removes only state created by Write. It is called when a
	// later setup action fails, or when Write reports a partial failure.
	Compensate     func(Model) error
	InstallService func() error
	StopService    func() error
	// ServiceCreated reports whether this attempt created the service. A
	// repaired pre-existing service is never stopped during compensation.
	ServiceCreated func() bool
	AskService     bool
	PromptLabels   []string
}

func (s Setup) Run(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if s.In == nil || s.Out == nil || s.Write == nil {
		return fmt.Errorf("wizard requires input, output, and writer")
	}
	m := Model{}
	labels := s.PromptLabels
	if len(labels) == 0 {
		labels = []string{"upstream", "gate", "provider"}
	}
	prompts := make([]struct {
		dst   *string
		label string
	}, 0, len(labels))
	for _, label := range labels {
		var dst *string
		switch label {
		case "upstream":
			dst = &m.Upstream
		case "gate":
			dst = &m.Gate
		case "provider":
			dst = &m.Provider
		default:
			return fmt.Errorf("unknown wizard prompt %q", label)
		}
		prompts = append(prompts, struct {
			dst   *string
			label string
		}{dst, label})
	}
	for _, p := range prompts {
		fmt.Fprintf(s.Out, "%s: ", p.label)
		var v string
		if _, err := fmt.Fscanln(s.In, &v); err != nil {
			return err
		}
		*p.dst = strings.TrimSpace(v)
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	if s.AskService {
		fmt.Fprint(s.Out, "install service (yes/no): ")
		var answer string
		if _, err := fmt.Fscanln(s.In, &answer); err != nil {
			return err
		}
		answer = strings.TrimSpace(answer)
		m.ConfirmService = strings.EqualFold(answer, "yes") || strings.EqualFold(answer, "y")
	}
	if err := s.Write(m); err != nil {
		if s.Compensate != nil {
			return errors.Join(err, s.Compensate(m))
		}
		return err
	}
	if s.InstallService == nil || (s.AskService && !m.ConfirmService) {
		return nil
	}
	if err := s.InstallService(); err != nil {
		if s.StopService != nil && (s.ServiceCreated == nil || s.ServiceCreated()) {
			_ = s.StopService()
		}
		if s.Compensate != nil {
			return errors.Join(err, s.Compensate(m))
		}
		return err
	}
	return nil
}
