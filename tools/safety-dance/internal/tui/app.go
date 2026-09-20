package tui

import "context"

type App struct{ Model Model }

func (a *App) Run(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
