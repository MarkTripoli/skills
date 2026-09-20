package tui

import (
    "bufio"
    "context"
    "fmt"
    "io"
    "os"
    "strings"
    "time"
)

type App struct {
    Model Model
    In io.Reader
    Out io.Writer
    Refresh func() (Model, error)
    Respond func() error
    Abort func() error
}

// Run is the interactive terminal loop. It polls durable state so daemon
// restarts do not lose the view, and accepts r (respond), a (abort), and q.
func (a *App) Run(ctx context.Context) error {
    if a.In == nil { a.In = os.Stdin }
    if a.Out == nil { a.Out = os.Stdout }
    input := make(chan string, 4)
    go func() {
        scanner := bufio.NewScanner(a.In)
        for scanner.Scan() { input <- strings.TrimSpace(scanner.Text()) }
        close(input)
    }()
    ticker := time.NewTicker(250 * time.Millisecond); defer ticker.Stop()
    render := func() error {
        if a.Refresh != nil { m, err := a.Refresh(); if err != nil { return err }; a.Model = m }
        _, err := fmt.Fprintln(a.Out, Render(a.Model, 0)); return err
    }
    if err := render(); err != nil { return err }
    for {
        select {
        case <-ctx.Done(): return ctx.Err()
        case line, ok := <-input:
            if !ok { return nil }
            switch strings.ToLower(line) { case "q", "quit": return nil; case "r", "respond": if a.Respond != nil { if err := a.Respond(); err != nil { return err } }; case "a", "abort": if a.Abort != nil { if err := a.Abort(); err != nil { return err } } }
            if err := render(); err != nil { return err }
        case <-ticker.C:
            if err := render(); err != nil { return err }
        }
    }
}
