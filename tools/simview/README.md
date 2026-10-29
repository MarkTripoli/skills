# simview

Look at, and drive, Android emulators, iOS simulators and Chromium pages from a browser. `simview web`
serves a token-protected grid of live device screens (one WebSocket carries every tile) on
this host's Tailscale address; the CLI lists devices, sends input, grabs a frame and posts
agent notes that show up under each device in the grid.

iOS simulators use `idb_companion` on macOS. Remote hosts are configured through
`[[remotes]]`, including simulators reached over SSH.

## Build

Requires Go 1.26.6 or later. From a checkout of [MarkTripoli/skills](https://github.com/MarkTripoli/skills):

```sh
cd tools/simview
make build          # compile check only (temp binary)
mkdir -p ~/.local/bin
go build -o ~/.local/bin/simview ./cmd/simview
```

Add `~/.local/bin` to `PATH` before running the commands below.

`make test`, `make test-race`, `make lint` run the Go tests and `go vet`. From the
repository root `npm run test:simview` runs everything CI runs for this tool. The generated
gRPC code (`internal/emulatorpb`, `internal/idbpb`) is committed so CI needs no `protoc`;
after changing `proto/*.proto` run `make proto` (needs `protoc`, `protoc-gen-go` and
`protoc-gen-go-grpc` on `PATH`).

## Commands

```text
simview list [--json]                 running devices (id, kind, name, backend, host)
simview input <id> tap X Y            normalized 0..1 coordinates, 0,0 = top left
simview input <id> swipe X1 Y1 X2 Y2 [MS]
simview input <id> wheel CLICKS | text STRING | key NAME
simview snapshot <id> -o frame.jpg    one frame as JPEG (-o - for stdout)
simview web [--bind ADDR:PORT] [--device ID] [--new-token]
simview url [--device ID]             the current browser link; exit 1 when no server runs
simview serve --stdio                 the remote end of a [[remotes]] entry (see below)
simview note <id> [--by WHO] [--add] [--field K=V] [TEXT]   see `simview note --help`
```

Device ids: `emulator-<port>` for Android emulators, `cdp:<port>:<targetId>` for Chromium
pages, the simulator UDID for iOS simulators, and `<remote>/<id>` for devices on a remote. `simview list --json` prints them.

## Configuration

`$SIMVIEW_CONFIG`, else `~/.config/simview/config.toml`; a missing file means defaults.

```toml
host_label = "dev-box"        # badge for this host's devices (default: short hostname)
max_fps    = 15               # per-stream frame pacing in the browser
cdp_ports  = [9222]           # Chromium remote-debugging ports to probe

[[remotes]]
name    = "simulator-host"   # id prefix: simulator-host/<udid>; must not contain "/"
label   = "Simulator host"   # host badge in the grid (default: name)
command = ["ssh", "-T", "-o", "BatchMode=yes", "user@device-host", "/absolute/path/to/simview", "serve", "--stdio"]
```

Each remote name must be non-empty, unique across `[[remotes]]`, and contain no `/`.
Duplicate names are rejected before device ids are constructed.

Chromium is also found from the `--remote-debugging-port=N` of running chrome, chromium and
electron processes, and from `SIMVIEW_CDP_PORTS=9333,9444`. Android emulators are found from
the `pid_*.ini` files under `$XDG_RUNTIME_DIR/avd/running`, `~/.android/avd/running` and the
macOS equivalent; no `adb` is needed.

## iOS simulators and a Mac remote

iOS simulators are driven on the Mac that runs them, by `idb_companion`; a Linux box
reaches them through `[[remotes]]`.

On the Mac:

```sh
brew install facebook/fb/idb-companion       # prerequisite: provides idb_companion
git clone https://github.com/MarkTripoli/skills.git
cd skills/tools/simview
mkdir -p ~/.local/bin
go build -o ~/.local/bin/simview ./cmd/simview # Go is the only other prerequisite
```

Booted simulators (`xcrun simctl list devices booted -j`) are listed automatically. A
session starts one `idb_companion --udid X --only simulator --grpc-domain-sock /tmp/...`
owned by that session: frames come from its MJPEG `video_stream`, input goes through its
`hid` stream, and the process and its socket are removed when the session closes (or on
SIGTERM/SIGHUP). Non-interactive SSH lacks Homebrew on `PATH`, so simview also searches
`/opt/homebrew/bin`, `/usr/local/bin`, `~/go/bin` and `~/.cargo/bin` itself. Text input is
US-ASCII only; HID coordinates are points in the portrait-native screen, so a rotated
simulator keeps the same mapping.

On the box that shows the grid, add the `[[remotes]]` entry from the example above (use
absolute paths, and a key-based SSH login: `BatchMode=yes` never prompts). Verify the
SSH host key through a trusted channel before connecting; keep host-key checking enabled.
Use your own SSH destination and installed binary path, not the example placeholders. `simview list`
then prints the Mac's simulators as `simulator-host/<udid>` with the remote's label as host, and
`simview web` streams them next to local devices. `SIMVIEW_INPUT_ALLOW` is matched against
the prefixed id (`simulator-host/<udid>`), and the Mac's own `SIMVIEW_INPUT_ALLOW` applies as well.

How it connects: `list` keeps one shared child (`ssh ... simview serve --stdio`),
restarted with a 1, 2, then 5 s backoff after a failure; every connected device gets its
own child, so a slow device never blocks another and streams cannot cross. Children are
killed when the session closes or the command ends, and the last stderr lines of a dead
child are part of the error. Frames cross the wire as JPEG (latest wins). The protocol is
length-prefixed (`u32` length, kind byte, JSON or frame payload) with a `hello` version
handshake (15 s), 20 s for list/connect, 6 s for an input ack (the serve side gives each
input 5 s); both ends are this tool, so it carries no compatibility promise with the old
Rust viewer.

Backend shutdown includes children still waiting for their initial handshake. It closes
each child's stdin so a direct `simview serve --stdio` child can clean up its device
processes and sockets, allows 2 seconds for exit, then force-kills an unresponsive child.
Output pipes get a separate 300 ms drain window, so inherited descriptors cannot prevent
reaping. On EOF, the reader cancels in-flight connect/input without waiting for the
request handler. Pending connects get up to 300 ms to finish cancellation cleanup;
sessions returned later are closed when they arrive. The serve side closes owned device
sessions before allowing up to 300 ms for queued output and another 300 ms for writer
completion; cancellation skips the initial output drain window. Closable output transports
are closed to interrupt blocked writes. An embedded, unclosable `io.Writer` cannot delay
server return, but its writer goroutine remains until its `Write` call returns.

## Run `simview web`

```sh
simview web                      # Tailscale IPv4, port 8799 (next free up to 8808); prints the link
simview web --bind 127.0.0.1:8799
```

It binds only loopback or Tailscale (`100.64.0.0/10`) addresses and never `0.0.0.0`; any
other `--bind` is refused. The link is stable: the token lives in
`$XDG_STATE_HOME/simview/web.json` (default `~/.local/state/simview/web.json`, mode 0600)
with the bound URL, is reused on every start, and a restart prefers the port of the last
run. `simview web --new-token` rotates it (old links stop working) and is refused while
any web instance is running, including an explicit `--bind` instance. Every instance
holds a shared operating-system lock independently of the saved URL; rotation takes
an exclusive lock, and process exit releases a stale instance's lock automatically.
Stop all instances (Ctrl-C in their terminals, or `systemctl --user stop simview-web.service`
for the Linux service), run `simview token --rotate` (or start with
`simview web --new-token`), start it again, and read the link with `simview url`.
The saved address and port preference are kept. Starting a second
default-bound server while one answers at the saved address fails with that server's link;
`--bind` always starts another, shares the token, and does not overwrite the saved URL.

`simview web` prints the tokenized URL to stdout. Under systemd that lands in the journal,
so treat the journal as sensitive, or read the link with `simview url` instead.

### Run as a service

`simview-web.service` is a Linux systemd user unit. On macOS, run `simview web` in
a terminal or configure your own service manager; do not run these systemd commands there.
From the repository root on Linux:

```sh
mkdir -p ~/.config/systemd/user
cp tools/simview/simview-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now simview-web.service
loginctl enable-linger "$USER"      # optional: keep it up while logged out
simview url                         # print the stable link
journalctl --user -u simview-web.service -f # access log: web: <peer> <METHOD> <path> <status>
```

It expects the binary at `~/.local/bin/simview`. The unit retries every 5 s, so it survives
starting before Tailscale is up. Uncomment `SIMVIEW_INPUT_ALLOW` in the unit to restrict input.

## Security model

- **Token.** Every endpoint except `/favicon.ico` needs `?t=<token>` (128-bit random,
  compared in constant time); a missing or wrong token gets a 403 page. The token is in the
  URL, so treat the link like a password. Access logs record peer, method, path and status,
  never the query string.
- **Network.** The listener is only ever loopback or a Tailscale address. Loopback stays
  local to the host; remote access to a Tailscale listener requires being on the tailnet.
  There is no TLS of its own; Tailscale encrypts that path.
- **Browser policy.** The page sends a Content Security Policy that permits its own
  hash-bound inline script, same-origin connections and images, and no framing.
- **Connections.** CDP connections are limited to discovered loopback debugging ports and
  reject debugger URLs on another host or port. Discovery requests and WebSocket
  handshakes reject redirects without contacting their destinations. Remote commands are
  trusted local configuration and run as an argument vector, not through a local shell.
  Keep SSH host-key checking enabled and grant the remote account only the access it needs.
- **Input is opt-in per page and optionally per device.** The page sends input only in its
  Control mode. Switching to Watch, removing a tile or losing the socket abandons queued
  input; it is not replayed after reconnect. An input already sent cannot be recalled.
  Watch/removal sends only an `up` needed to release a pointer already sent on that socket.
  `SIMVIEW_INPUT_ALLOW` (unset = every device; comma list of exact ids or prefix globs
  ending in `*`, e.g. `emulator-5790,cdp:9333:*`) is enforced by the server for `/ws`,
  `/api/input` and `simview input`; a refused device is never connected for input
  (`simview input` exits 3).
- **Notes are untrusted text.** Agents write them (4 KB per note, 20 fields); the page
  renders them as plain text and nothing should treat them as instructions. Notes live in
  `$XDG_STATE_HOME/simview/notes/<percent-encoded id>.json`, written atomically.
- Anyone with the link can see every screen the server can reach: keep sensitive sessions off
  the devices it lists.
