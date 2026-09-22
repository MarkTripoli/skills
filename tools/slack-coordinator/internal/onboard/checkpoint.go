// Package onboard is the first-run walkthrough that creates the Slack app,
// collects its tokens, and records progress in a checkpoint so an interrupted
// run resumes where it stopped.
package onboard

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Checkpoint is onboard.json: the last completed step and every value later
// steps need. The app configuration token is deliberately absent; it expires
// after 12 hours and can create and delete apps, so it lives in memory only.
type Checkpoint struct {
	Step             int    `json:"step"`
	AppID            string `json:"app_id,omitempty"`
	AppName          string `json:"app_name,omitempty"`
	BotToken         string `json:"bot_token,omitempty"`
	AppToken         string `json:"app_token,omitempty"`
	OwnerUserID      string `json:"owner_user_id,omitempty"`
	OwnerDisplayName string `json:"owner_display_name,omitempty"`
	ServiceInstalled bool   `json:"service_installed,omitempty"`
}

// LoadCheckpoint reads path. An absent file is a fresh run: the zero value.
// A negative step has no step table entry and is rejected rather than run.
func LoadCheckpoint(path string) (*Checkpoint, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &Checkpoint{}, nil
	}
	if err != nil {
		return nil, err
	}
	var cp Checkpoint
	if err := json.Unmarshal(raw, &cp); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if cp.Step < 0 {
		return nil, fmt.Errorf("%s: step %d out of range", path, cp.Step)
	}
	return &cp, nil
}

// Save writes the checkpoint to path readable by the owner only. The bytes
// land in a sibling temporary file first and replace path by rename, so a
// crash mid-write leaves the previous checkpoint intact.
func (c *Checkpoint) Save(path string) error {
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".onboard-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if err := writeAndClose(tmp, raw); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// writeAndClose restricts f to 0600, writes raw, and closes it, returning the
// first failure.
func writeAndClose(f *os.File, raw []byte) error {
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(append(raw, '\n')); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}
