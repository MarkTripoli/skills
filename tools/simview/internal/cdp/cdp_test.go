package cdp

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

func TestParsesPageTargetsOnly(t *testing.T) {
	body := `[
	  {"id":"A1","type":"page","title":"Hi","url":"http://x/","webSocketDebuggerUrl":"ws://127.0.0.1:9333/devtools/page/A1"},
	  {"id":"B2","type":"service_worker","title":"","url":"http://x/sw.js"},
	  {"id":"C3","type":"page","url":"about:blank"}]`
	ts, err := ParseTargets([]byte(body))
	if err != nil || len(ts) != 2 || ts[0].ID != "A1" || ts[0].WSURL != "ws://127.0.0.1:9333/devtools/page/A1" || ts[1].Title != "" {
		t.Fatalf("%v %+v", err, ts)
	}
	if _, err := ParseTargets([]byte("nope")); err == nil {
		t.Fatal("garbage accepted")
	}
}

func TestIDRoundTrip(t *testing.T) {
	if DeviceID(9333, "AB") != "cdp:9333:AB" {
		t.Fatal("DeviceID")
	}
	if p, tg, ok := ParseID("cdp:9333:AB"); !ok || p != 9333 || tg != "AB" {
		t.Fatal("ParseID")
	}
	for _, bad := range []string{"emulator-5554", "cdp:x:AB", "cdp:9333"} {
		if _, _, ok := ParseID(bad); ok {
			t.Fatal(bad)
		}
	}
}

func TestPortFromBrowserCmdline(t *testing.T) {
	c := []byte("/opt/google/chrome/chrome\x00--headless=new\x00--remote-debugging-port=9333\x00")
	if p, ok := PortFromCmdline(c); !ok || p != 9333 {
		t.Fatal(p, ok)
	}
	// Chrome rewrites its title: one entry, space-separated.
	if p, ok := PortFromCmdline([]byte("/opt/google/chrome/chrome --headless=new --remote-debugging-port=9444 --no-sandbox")); !ok || p != 9444 {
		t.Fatal(p, ok)
	}
	if _, ok := PortFromCmdline([]byte("/usr/bin/vim\x00--remote-debugging-port=1\x00")); ok {
		t.Fatal("vim")
	}
	if _, ok := PortFromCmdline([]byte("/usr/bin/chromium\x00--no-sandbox\x00")); ok {
		t.Fatal("no port")
	}
}

func TestKeyEventConstruction(t *testing.T) {
	ev := KeyEvents(device.KeyEnter)
	if ev[0]["type"] != "keyDown" || ev[0]["key"] != "Enter" || ev[0]["windowsVirtualKeyCode"] != 13 || ev[0]["text"] != "\r" || ev[1]["type"] != "keyUp" {
		t.Fatalf("%v", ev)
	}
	l := KeyEvents(device.KeyLeft)
	if l[0]["type"] != "rawKeyDown" || l[0]["code"] != "ArrowLeft" || l[0]["windowsVirtualKeyCode"] != 37 {
		t.Fatalf("%v", l)
	}
	if KeyEvents(device.KeyPower) != nil {
		t.Fatal("power is device-only")
	}
}

func TestMouseEventCSSPixels(t *testing.T) {
	v := MouseEvent("mousePressed", 0.5, 0.5, 801, 601, 0, true)
	if v["x"] != 400.0 || v["y"] != 300.0 || v["button"] != "left" || v["buttons"] != 1 {
		t.Fatalf("%v", v)
	}
	if w := MouseEvent("mouseWheel", 0.5, 0.5, 801, 601, 3, false); w["deltaY"] != 300 {
		t.Fatalf("%v", w)
	}
	if MouseEvent("mouseMoved", 0, 1, 10, 10, 0, false)["buttons"] != 0 {
		t.Fatal("moved")
	}
}

func TestToFrameDecodesJPEG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 8, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{R: 255, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	dec, err := jpeg.Decode(&buf)
	if err != nil {
		t.Fatal(err)
	}
	f := toFrame(dec)
	if f.Width != 8 || f.Height != 4 || len(f.RGB) != 8*4*3 || f.RGB[0] < 240 || f.RGB[1] > 20 || f.RGB[2] > 20 {
		t.Fatalf("%d %d %v", f.Width, f.Height, f.RGB[:3])
	}
}

func TestConnectRefusesUnlistedPortAndForeignWS(t *testing.T) {
	wsHost := "evil.example:1"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `[{"id":"A","type":"page","url":"http://x/","webSocketDebuggerUrl":"ws://%s/devtools/page/A"}]`, wsHost)
	}))
	defer srv.Close()
	port, _ := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
	ctx := context.Background()
	if _, err := (&Backend{}).Connect(ctx, DeviceID(port, "A")); err == nil || !strings.Contains(err.Error(), "not one this backend probes") {
		t.Fatalf("unlisted port: %v", err)
	}
	b := &Backend{Ports: []int{port}}
	for _, ws := range []string{"evil.example:1", "10.0.0.5:" + strconv.Itoa(port), "127.0.0.1:1"} {
		wsHost = ws
		if _, err := b.Connect(ctx, DeviceID(port, "A")); err == nil {
			t.Fatalf("accepted %s", ws)
		}
	}
	for _, ok := range []string{"127.0.0.1", "localhost", "[::1]"} {
		if err := checkWSURL("ws://"+ok+":"+strconv.Itoa(port)+"/x", port); err != nil {
			t.Fatalf("%s: %v", ok, err)
		}
	}
}

func TestDiscoveryRejectsRedirects(t *testing.T) {
	for _, status := range []int{
		http.StatusMovedPermanently,
		http.StatusFound,
		http.StatusSeeOther,
		http.StatusTemporaryRedirect,
		http.StatusPermanentRedirect,
	} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			var destinationRequests atomic.Int32
			destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				destinationRequests.Add(1)
				fmt.Fprintf(w, `[{"id":"A","type":"page","webSocketDebuggerUrl":"ws://%s/devtools/page/A"}]`, r.Host)
			}))
			defer destination.Close()

			var initialRequests atomic.Int32
			initial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				initialRequests.Add(1)
				http.Redirect(w, r, destination.URL+"/json/list", status)
			}))
			defer initial.Close()
			port, err := strconv.Atoi(initial.URL[strings.LastIndex(initial.URL, ":")+1:])
			if err != nil {
				t.Fatal(err)
			}
			b := &Backend{Ports: []int{port}}

			devices, err := b.List(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if len(devices) != 0 {
				t.Fatalf("redirected discovery returned devices: %+v", devices)
			}
			if session, err := b.Connect(context.Background(), DeviceID(port, "A")); err == nil {
				session.Close()
				t.Fatal("redirected discovery accepted by Connect")
			}
			if got := initialRequests.Load(); got != 2 {
				t.Fatalf("configured endpoint received %d requests, want 2", got)
			}
			if got := destinationRequests.Load(); got != 0 {
				t.Fatalf("redirect destination received %d requests, want 0", got)
			}
		})
	}
}

func TestSessionRejectsHandshakeRedirects(t *testing.T) {
	for _, status := range []int{
		http.StatusMovedPermanently,
		http.StatusFound,
		http.StatusSeeOther,
		http.StatusTemporaryRedirect,
		http.StatusPermanentRedirect,
	} {
		for _, scheme := range []string{"http", "ws"} {
			t.Run(strconv.Itoa(status)+"/"+scheme, func(t *testing.T) {
				var destinationRequests atomic.Int32
				destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					destinationRequests.Add(1)
					http.Error(w, "unexpected redirected handshake", http.StatusForbidden)
				}))
				defer destination.Close()
				location := scheme + strings.TrimPrefix(destination.URL, "http") + "/devtools/page/A"

				var handshakeRequests atomic.Int32
				initial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					switch r.URL.Path {
					case "/json/list":
						fmt.Fprintf(w, `[{"id":"A","type":"page","webSocketDebuggerUrl":"ws://%s/devtools/page/A"}]`, r.Host)
					case "/devtools/page/A":
						handshakeRequests.Add(1)
						http.Redirect(w, r, location, status)
					default:
						http.NotFound(w, r)
					}
				}))
				defer initial.Close()
				port, err := strconv.Atoi(initial.URL[strings.LastIndex(initial.URL, ":")+1:])
				if err != nil {
					t.Fatal(err)
				}
				b := &Backend{Ports: []int{port}}

				session, err := b.Connect(context.Background(), DeviceID(port, "A"))
				if err != nil {
					t.Fatalf("Connect should start the session asynchronously: %v", err)
				}
				defer session.Close()
				select {
				case <-session.(*Session).done:
				case <-time.After(2 * time.Second):
					t.Fatal("session did not end after its handshake was redirected")
				}
				if got := handshakeRequests.Load(); got != 1 {
					t.Fatalf("configured endpoint received %d handshakes, want 1", got)
				}
				if got := destinationRequests.Load(); got != 0 {
					t.Fatalf("redirect destination received %d requests, want 0", got)
				}
			})
		}
	}
}
