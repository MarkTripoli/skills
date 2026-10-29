// Package config loads config.toml from $SIMVIEW_CONFIG or ~/.config/simview.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// Remote is a remote host reached by running Command (which speaks the remote protocol).
type Remote struct {
	// Name prefixes the remote's device ids as "<name>/<id>"; it must not contain "/".
	Name    string   `toml:"name"`
	Command []string `toml:"command"`
	// Label is shown as the machine badge instead of Name.
	Label string `toml:"label"`
}

// Config is the parsed file; absent keys keep their defaults.
type Config struct {
	// HostLabel names this host's devices in the browser grid; default: the short hostname.
	HostLabel string   `toml:"host_label"`
	MaxFPS    int      `toml:"max_fps"`
	CDPPorts  []int    `toml:"cdp_ports"`
	Remotes   []Remote `toml:"remotes"`
}

// Default returns the built-in configuration.
func Default() Config {
	return Config{MaxFPS: 15, CDPPorts: []int{9222}}
}

// Parse parses config text on top of the defaults.
func Parse(text string) (Config, error) {
	c := Default()
	if _, err := toml.Decode(text, &c); err != nil {
		return Config{}, err
	}
	if c.MaxFPS <= 0 {
		c.MaxFPS = 15
	}
	for _, r := range c.Remotes {
		if r.Name == "" || strings.Contains(r.Name, "/") {
			return Config{}, fmt.Errorf("remote name %q must be non-empty and contain no /", r.Name)
		}
		if len(r.Command) == 0 {
			return Config{}, fmt.Errorf("remote %q has no command", r.Name)
		}
	}
	return c, nil
}

// Path is the config file location, or "" when neither SIMVIEW_CONFIG nor HOME is set.
func Path() string {
	if p := os.Getenv("SIMVIEW_CONFIG"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "simview", "config.toml")
}

// Load reads the config file; a missing file gives the defaults, a broken one is an error.
func Load() (Config, error) {
	p := Path()
	if p == "" {
		return Default(), nil
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return Default(), nil
	}
	if err != nil {
		return Config{}, err
	}
	c, err := Parse(string(b))
	if err != nil {
		return Config{}, fmt.Errorf("%s: %w", p, err)
	}
	return c, nil
}

// ShortHostname is this machine's hostname up to the first dot.
func ShortHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "local"
	}
	if i := strings.IndexByte(h, '.'); i >= 0 {
		h = h[:i]
	}
	if h == "" {
		return "local"
	}
	return h
}

// Host is the machine label for local devices: HostLabel or the short hostname.
func (c Config) Host() string {
	if strings.TrimSpace(c.HostLabel) != "" {
		return c.HostLabel
	}
	return ShortHostname()
}
