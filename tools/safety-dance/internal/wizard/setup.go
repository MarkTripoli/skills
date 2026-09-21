package wizard

import (
	"bufio"
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

func readAnswer(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil && len(line) == 0 {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func (s Setup) Run(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if s.In == nil || s.Out == nil || s.Write == nil {
		return fmt.Errorf("wizard requires input, output, and writer")
	}
	reader := bufio.NewReader(s.In)
	m := Model{}
	labels := s.PromptLabels
	if len(labels) == 0 {
		labels = []string{"upstream", "gate", "provider"}
	}
	for _, label := range labels {
		if err := ctx.Err(); err != nil {
			return err
		}
		fmt.Fprintf(s.Out, "%s: ", label)
		raw, err := readAnswer(reader)
		if err != nil {
			return err
		}
		switch label {
		case "upstream":
			m.Upstream = raw
		case "gate":
			m.Gate = raw
		case "provider":
			m.Provider = raw
		case "commands":
			parts := strings.Split(raw, ";")
			if len(parts) != 8 {
				return fmt.Errorf("validation commands require eight semicolon-separated commands")
			}
			m.ValidationCommands = m.ValidationCommands[:0]
			for _, part := range parts {
				m.ValidationCommands = append(m.ValidationCommands, strings.TrimSpace(part))
			}
		default:
			return fmt.Errorf("unknown wizard prompt %q", label)
		}
	}
	if s.AskService {
		fmt.Fprint(s.Out, "install service (yes/no): ")
		answer, err := readAnswer(reader)
		if err != nil {
			return err
		}
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
		var cleanupErr error
		if s.StopService != nil && (s.ServiceCreated == nil || s.ServiceCreated()) {
			cleanupErr = s.StopService()
		}
		if s.Compensate != nil {
			cleanupErr = errors.Join(cleanupErr, s.Compensate(m))
		}
		return errors.Join(err, cleanupErr)
	}
	return nil
}
