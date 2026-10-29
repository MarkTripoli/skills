package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/MarkTripoli/skills/tools/bug-coordinator/internal/watch"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: bug-coordinator serve|attach|detach|ack|status [flags]")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	defaults := filepath.Join(home, ".local", "state", "bug-coordinator")
	cmd := args[0]
	f := flag.NewFlagSet(cmd, flag.ContinueOnError)
	epic := f.String("epic", "", "Jira epic key")
	stateDir := f.String("state-dir", defaults, "private durable state directory")
	thread := f.String("thread", "", "Codex thread ID (use CODEX_THREAD_ID inside a session)")
	issue := f.String("issue", "", "Bug key to acknowledge")
	workspace := f.String("workspace", "", "absolute project directory for new sessions")
	skillFile := f.String("skill-file", "", "absolute video orchestration SKILL.md path")
	jiraURL := f.String("jira-url", "", "Jira Cloud HTTPS base URL")
	jiraEmail := f.String("jira-email", "", "Jira account email")
	tokenFile := f.String("jira-token-file", "", "file containing Jira API token")
	codexSocket := f.String("codex-socket", "", "Codex app-server Unix socket; discovered by default")
	interval := f.Duration("interval", 5*time.Minute, "Jira polling interval")
	includeExisting := f.Bool("include-existing", false, "queue current eligible Bugs on the first poll")
	eligibleStatuses := f.String("eligible-statuses", "Backlog,Selected for Development,In Progress,Code Review", "comma-separated observed eligible Jira statuses")
	if err := f.Parse(args[1:]); err != nil {
		return err
	}
	if len(f.Args()) != 0 {
		return fmt.Errorf("unexpected arguments: %s", strings.Join(f.Args(), " "))
	}
	if !watch.ValidKey(*epic) {
		return fmt.Errorf("--epic must be a Jira key")
	}
	st := watch.Store{Dir: *stateDir, Epic: *epic}
	switch cmd {
	case "status":
		s, err := st.Snapshot()
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(s)
	case "attach":
		if *thread == "" {
			return errors.New("--thread is required")
		}
		return st.With(func(s *watch.State) error { s.ThreadID = *thread; return nil })
	case "detach":
		if *thread == "" {
			return errors.New("--thread is required")
		}
		return st.With(func(s *watch.State) error {
			if s.ThreadID != *thread {
				return fmt.Errorf("thread %s is not attached", *thread)
			}
			s.ThreadID = ""
			return nil
		})
	case "ack":
		if !watch.ValidKey(*issue) || *thread == "" {
			return errors.New("--issue and --thread are required")
		}
		return st.With(func(s *watch.State) error {
			e, ok := s.Pending[*issue]
			if !ok {
				return nil
			} // repeated acknowledgements are safe
			if e.NotifiedThread != *thread {
				return fmt.Errorf("%s was not assigned to thread %s", *issue, *thread)
			}
			delete(s.Pending, *issue)
			return nil
		})
	case "serve":
		return serve(st, *workspace, *skillFile, *jiraURL, *jiraEmail, *tokenFile, *codexSocket, *interval, *includeExisting, strings.Split(*eligibleStatuses, ","))
	default:
		return fmt.Errorf("unknown command %q", cmd)
	}
}

func serve(st watch.Store, workspace, skillFile, jiraURL, jiraEmail, tokenFile, socket string, interval time.Duration, includeExisting bool, eligibleStatuses []string) error {
	if interval < 30*time.Second {
		return errors.New("--interval must be at least 30s")
	}
	if !filepath.IsAbs(workspace) || !filepath.IsAbs(skillFile) {
		return errors.New("--workspace and --skill-file must be absolute paths")
	}
	if info, err := os.Stat(workspace); err != nil || !info.IsDir() {
		return errors.New("--workspace must be an existing directory")
	}
	if info, err := os.Stat(skillFile); err != nil || info.IsDir() {
		return errors.New("--skill-file must be an existing file")
	}
	if tokenFile == "" {
		return errors.New("--jira-token-file is required")
	}
	info, err := os.Stat(tokenFile)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0077 != 0 {
		return errors.New("Jira token file must not be readable by group or others")
	}
	token, err := os.ReadFile(tokenFile)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(token))) == 0 {
		return errors.New("Jira token file is empty")
	}
	lock, err := st.ServeLock()
	if err != nil {
		return err
	}
	defer lock.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if socket == "" {
		locateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		socket, err = watch.CodexSocket(locateCtx)
		cancel()
		if err != nil {
			return err
		}
	}
	r := watch.Runner{
		Store: st, Workspace: workspace, SkillFile: skillFile,
		IncludeExisting: includeExisting,
		Jira:            watch.Jira{BaseURL: jiraURL, Email: jiraEmail, Token: strings.TrimSpace(string(token)), EligibleStatuses: eligibleStatuses},
		Codex:           watch.AppServer{Socket: socket},
	}
	r.BinPath, err = os.Executable()
	if err != nil {
		return err
	}
	log.Printf("watching %s; first successful Jira read establishes the baseline", st.Epic)
	for {
		pollCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		added, pollErr := r.PollOnce(pollCtx)
		if pollErr != nil {
			log.Printf("Jira poll failed: %v", pollErr)
		}
		if added > 0 {
			log.Printf("%s: %d new Bugs queued", st.Epic, added)
		}
		result, deliveryErr := r.DeliverOnce(pollCtx)
		cancel()
		if deliveryErr != nil {
			log.Printf("Codex delivery failed: %v", deliveryErr)
		}
		if result != "none" {
			log.Printf("%s: %s orchestrator", st.Epic, result)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(interval):
		}
	}
}
