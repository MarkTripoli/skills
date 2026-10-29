// Package backends combines the device sources behind one device.Backend.
package backends

import (
	"context"
	"strings"
	"sync"

	"github.com/MarkTripoli/skills/tools/simview/internal/android"
	"github.com/MarkTripoli/skills/tools/simview/internal/cdp"
	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/ios"
)

// Named is a backend addressed by an id prefix "<name>/" (a remote host). Remote hosts
// stamp their own host label on the devices they list.
type Named interface {
	device.Backend
	Name() string
}

// Combined routes ids starting with "cdp:" to Chromium, "<remote>/..." to that remote,
// simulator UDIDs to iOS (idb), and everything else to Android.
type Combined struct {
	host    string
	android android.Backend
	cdp     *cdp.Backend
	ios     ios.Backend
	remotes []Named
}

// New builds the combined backend for a config.
func New(cfg config.Config, remotes ...Named) *Combined {
	return &Combined{host: cfg.Host(), cdp: cdp.New(cfg.CDPPorts), remotes: remotes}
}

// Failure is one backend that could not be listed.
type Failure struct{ Name, Reason string }

// ListParts lists every backend independently: one failing never hides the others.
func (c *Combined) ListParts(ctx context.Context) ([]device.Info, []Failure) {
	type result struct {
		name  string
		local bool
		devs  []device.Info
		err   error
	}
	var wg sync.WaitGroup
	results := make([]result, 3+len(c.remotes))
	run := func(i int, name string, local bool, b device.Backend) {
		defer wg.Done()
		d, err := b.List(ctx)
		results[i] = result{name, local, d, err}
	}
	wg.Add(3 + len(c.remotes))
	go run(0, "android", true, c.android)
	go run(1, "cdp", true, c.cdp)
	go run(2, "ios", true, c.ios)
	for i, r := range c.remotes {
		go run(3+i, r.Name(), false, r)
	}
	wg.Wait()
	var devices []device.Info
	var failures []Failure
	for _, r := range results {
		if r.err != nil {
			failures = append(failures, Failure{r.name, r.err.Error()})
			continue
		}
		for _, d := range r.devs {
			if r.local {
				d.Host = c.host
			}
			devices = append(devices, d)
		}
	}
	return devices, failures
}

// List returns every device; failing backends become disabled rows
// ("<name>: unreachable (<reason>)" for remotes, "<name>: unavailable (<reason>)" for local
// ones), never an error.
func (c *Combined) List(ctx context.Context) ([]device.Info, error) {
	devices, failures := c.ListParts(ctx)
	for _, f := range failures {
		what := "unavailable"
		for _, r := range c.remotes {
			if r.Name() == f.Name {
				what = "unreachable"
			}
		}
		devices = append(devices, device.Failure(f.Name, f.Name, what, f.Reason))
	}
	return devices, nil
}

// Connect opens id on the backend that owns it.
func (c *Combined) Connect(ctx context.Context, id string) (device.Session, error) {
	if name, rest, ok := strings.Cut(id, "/"); ok {
		for _, r := range c.remotes {
			if r.Name() == name {
				return r.Connect(ctx, rest)
			}
		}
	}
	if strings.HasPrefix(id, "cdp:") {
		return c.cdp.Connect(ctx, id)
	}
	if ios.IsUDID(id) {
		return c.ios.Connect(ctx, id)
	}
	return c.android.Connect(ctx, id)
}

// Close releases what the remote backends hold: their child processes. Local sessions are
// owned by whoever connected them.
func (c *Combined) Close() {
	for _, r := range c.remotes {
		if cl, ok := r.(interface{ Close() }); ok {
			cl.Close()
		}
	}
}
