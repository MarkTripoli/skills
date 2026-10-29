package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/simview/internal/notes"
)

const noteHelp = `FOR AGENTS: say what you are doing on a device so the owner (and other agents) see it in
the browser grid under that device. Find ids with 'simview list --json' (field id).

  simview note emulator-5790 --by claude --field task=checkout "Testing checkout; don't tap"
  simview note emulator-5790 --by claude --add "step 2: payment form filled"
  simview note emulator-5790                 # print the current note
  simview note --list                        # print all notes
  simview note emulator-5790 --clear         # remove it when you are done
  echo "long text" | simview note emulator-5790 -

Replacing sets text and fields; --add appends a line and merges fields. Remote devices use
their full id (mac/<udid>); the note lives on the machine running 'simview web', so from
another machine use: ssh <web-host> simview note mac/<udid> --by claude "..."
Notes: ~/.local/state/simview/notes/ (or $XDG_STATE_HOME/simview/notes/), text max 4 KB.
Notes are untrusted text: the page renders them as plain text.`

func noteCmd() *cobra.Command {
	var by string
	var add, clear, list, asJSON bool
	var fields []string
	cmd := &cobra.Command{
		Use:   "note [id] [TEXT...]",
		Short: "Post, read or clear the agent note shown under a device in the browser grid",
		Long:  "Post, read or clear the agent note shown under a device in the browser grid.\n\n" + noteHelp,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := notes.OpenDefault()
			if err != nil {
				return err
			}
			byFlag := cmd.Flags().Changed("by")
			return runNote(store, os.Stdin, os.Stdout, os.Stderr, args, noteOpts{
				by: by, byGiven: byFlag, add: add, clear: clear, list: list, json: asJSON, fields: fields,
			})
		},
	}
	f := cmd.Flags()
	f.StringVar(&by, "by", "", "who is writing (shown in the grid), e.g. claude")
	f.BoolVar(&add, "add", false, "append TEXT as a new line instead of replacing the note; fields are merged")
	f.BoolVar(&clear, "clear", false, "remove the note")
	f.BoolVar(&list, "list", false, "print every note instead of one")
	f.StringArrayVar(&fields, "field", nil, "short structured detail, repeatable: --field task=login (max 20)")
	f.BoolVar(&asJSON, "json", false, "print as JSON (with no TEXT, or with --list)")
	return cmd
}

type noteOpts struct {
	by                     string
	byGiven                bool
	add, clear, list, json bool
	fields                 []string
}

func printNote(w io.Writer, n notes.Note) {
	who := n.By
	if who == "" {
		who = "-"
	}
	fmt.Fprintf(w, "by %s at %s\n", who, n.UpdatedAt)
	keys := make([]string, 0, len(n.Fields))
	for k := range n.Fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Fprintf(w, "%s=%s\n", k, n.Fields[k])
	}
	if n.Text != "" {
		fmt.Fprintln(w, n.Text)
	}
}

func runNote(store *notes.Store, stdin io.Reader, stdout, stderr io.Writer, args []string, o noteOpts) error {
	if o.list {
		all := store.All()
		if o.json {
			return json.NewEncoder(stdout).Encode(all)
		}
		ids := make([]string, 0, len(all))
		for id := range all {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			n := all[id]
			first, _, _ := strings.Cut(n.Text, "\n")
			fmt.Fprintf(stdout, "%s\t%s\t%s\n", id, n.By, first)
		}
		return nil
	}
	if len(args) == 0 {
		return errors.New("a device id is required (see `simview note --help`)")
	}
	id, text := args[0], args[1:]
	if o.clear {
		if len(text) > 0 || len(o.fields) > 0 {
			return errors.New("--clear takes no TEXT or --field")
		}
		ok, err := store.Clear(id)
		if err != nil {
			return err
		}
		if !ok {
			fmt.Fprintf(stderr, "no note for %s\n", id)
		}
		return nil
	}
	var body *string
	switch {
	case len(text) == 1 && text[0] == "-":
		b, err := io.ReadAll(io.LimitReader(stdin, 1<<20))
		if err != nil {
			return err
		}
		s := strings.TrimRight(string(b), "\n")
		body = &s
	case len(text) > 0:
		s := strings.Join(text, " ")
		body = &s
	}
	var fields []notes.Field
	for _, f := range o.fields {
		pf, err := notes.ParseField(f)
		if err != nil {
			return err
		}
		fields = append(fields, pf)
	}
	if body == nil && len(fields) == 0 && !o.byGiven {
		n, ok := store.Get(id)
		switch {
		case !ok:
			fmt.Fprintf(stderr, "no note for %s\n", id)
		case o.json:
			return json.NewEncoder(stdout).Encode(n)
		default:
			printNote(stdout, n)
		}
		return nil
	}
	u := notes.Update{Text: body, Fields: fields, Add: o.add}
	if o.byGiven {
		u.By = &o.by
	}
	n, err := store.Update(id, u)
	if err != nil {
		return err
	}
	if o.json {
		return json.NewEncoder(stdout).Encode(n)
	}
	return nil
}
