package wizard

type Model struct {
	Upstream, Gate     string
	ValidationCommands []string
	Provider           string
	ConfirmService     bool
}
