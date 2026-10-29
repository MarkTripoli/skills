package web

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

// Default bind range: this host's Tailscale address, the first free port from DefaultPort.
const (
	DefaultPort  = 8799
	defaultCount = 10
)

var tailnet = netip.MustParsePrefix("100.64.0.0/10")

// ValidateBind allows only loopback and Tailscale (100.64.0.0/10) addresses; never 0.0.0.0.
func ValidateBind(ap netip.AddrPort) error {
	ip := ap.Addr().Unmap()
	if ip.IsLoopback() || (ip.Is4() && tailnet.Contains(ip)) {
		return nil
	}
	return fmt.Errorf("refusing to bind %s: only loopback or Tailscale (100.64.0.0/10) addresses are allowed", ap)
}

// TailscaleIP is this host's Tailscale IPv4 address.
func TailscaleIP(ctx context.Context) (netip.Addr, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "tailscale", "ip", "-4").Output()
	if err != nil {
		return netip.Addr{}, fmt.Errorf("running `tailscale ip -4` (pass --bind 127.0.0.1:PORT to skip Tailscale): %w", err)
	}
	line, _, _ := strings.Cut(string(out), "\n")
	ip, err := netip.ParseAddr(strings.TrimSpace(line))
	if err != nil || !ip.Is4() {
		return netip.Addr{}, errors.New("`tailscale ip -4` printed no IPv4 address")
	}
	return ip, nil
}

// Listen binds explicit (validated) or the default Tailscale address. prefer, when nonzero,
// is tried before the default ports so a restart keeps its link.
func Listen(ctx context.Context, explicit string, prefer int) (net.Listener, error) {
	if explicit != "" {
		ap, err := netip.ParseAddrPort(explicit)
		if err != nil {
			return nil, fmt.Errorf("bad --bind %q (want ADDR:PORT): %w", explicit, err)
		}
		if err := ValidateBind(ap); err != nil {
			return nil, err
		}
		return net.Listen("tcp", ap.String())
	}
	ip, err := TailscaleIP(ctx)
	if err != nil {
		return nil, err
	}
	ports := []int{}
	if prefer > 0 {
		ports = append(ports, prefer)
	}
	for p := DefaultPort; p < DefaultPort+defaultCount; p++ {
		if p != prefer {
			ports = append(ports, p)
		}
	}
	for _, p := range ports {
		ap := netip.AddrPortFrom(ip, uint16(p))
		if err := ValidateBind(ap); err != nil {
			return nil, err
		}
		l, err := net.Listen("tcp", ap.String())
		if err == nil {
			return l, nil
		}
		if !errors.Is(err, syscall.EADDRINUSE) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("ports %d-%d are all in use on %s", DefaultPort, DefaultPort+defaultCount-1, ip)
}
