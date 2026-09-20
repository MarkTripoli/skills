package tui

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type App struct {
	Model   Model
	In      io.Reader
	Out     io.Writer
	Refresh func() (Model, error)
	Respond func(action string) error
	Abort   func() error
	Width   func() int
}

func terminalWidth(out io.Writer) int {
	f, ok := out.(*os.File)
	if !ok {
		return 0
	}
	args := []string{"size", "-F", f.Name()}
	if runtime.GOOS == "darwin" {
		args = []string{"-f", f.Name(), "size"}
	}
	result, err := exec.Command("stty", args...).Output()
	if err != nil {
		return 0
	}
	parts := strings.Fields(string(result))
	if len(parts) != 2 {
		return 0
	}
	w, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0
	}
	return w

}

// Run is the interactive terminal loop. It polls durable state so daemon
// restarts do not lose the view. A response requires an explicit action.
func (a *App) Run(ctx context.Context) error {
	if a.In == nil {
		a.In = os.Stdin
	}
	if a.Out == nil {
		a.Out = os.Stdout
	}
	input := make(chan string, 4)
	go func() {
		scanner := bufio.NewScanner(a.In)
		for scanner.Scan() {
			input <- strings.TrimSpace(scanner.Text())
		}
		close(input)
	}()
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	lastModel := Model{}
	lastWidth := -1
	haveRendered := false
	render := func(force bool) error {
		if a.Refresh != nil {
			m, err := a.Refresh()
			if err != nil {
				return err
			}
			a.Model = m
		}
		width := 0
		if a.Width != nil {
			width = a.Width()
		} else {
			width = terminalWidth(a.Out)
		}
		if !force && haveRendered && reflect.DeepEqual(lastModel, a.Model) && lastWidth == width {
			return nil
		}
		lastModel, lastWidth, haveRendered = a.Model, width, true
		_, err := fmt.Fprintln(a.Out, Render(a.Model, width))
		return err
	}
	if err := render(true); err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case line, ok := <-input:
			if !ok {
				return nil
			}
			switch strings.ToLower(line) {
			case "q", "quit":
				return nil
			case "r", "respond":
				fmt.Fprintln(a.Out, "choose an explicit action: approve, fix, skip, or abort")
			case "a", "approve":
				if a.Respond != nil {
					if err := a.Respond("approve"); err != nil {
						return err
					}
				}
			case "f", "fix":
				if a.Respond != nil {
					if err := a.Respond("fix"); err != nil {
						return err
					}
				}
			case "s", "skip":
				if a.Respond != nil {
					if err := a.Respond("skip"); err != nil {
						return err
					}
				}
			case "x", "abort":
				if a.Abort != nil {
					if err := a.Abort(); err != nil {
						return err
					}
				}
			}
			if err := render(true); err != nil {
				return err
			}
		case <-ticker.C:
			if err := render(false); err != nil {
				return err
			}
		}
	}
}
