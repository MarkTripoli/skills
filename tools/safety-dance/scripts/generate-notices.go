package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type module struct {
	Path    string
	Version string
	Dir     string
	Main    bool
}

func main() {
	cmd := exec.Command("go", "list", "-m", "-json", "all")
	out, err := cmd.StdoutPipe()
	if err != nil {
		panic(err)
	}
	if err := cmd.Start(); err != nil {
		panic(err)
	}
	var modules []module
	dec := json.NewDecoder(out)
	for {
		var m module
		err := dec.Decode(&m)
		if err == io.EOF {
			break
		}
		if err != nil {
			panic(err)
		}
		if !m.Main {
			modules = append(modules, m)
		}
	}
	if err := cmd.Wait(); err != nil {
		panic(err)
	}
	sort.Slice(modules, func(i, j int) bool { return modules[i].Path < modules[j].Path })
	fmt.Println("# Third-party notices")
	fmt.Println("Generated from `go list -m -json all` for the exact module graph used by the Safety Dance build.")
	for _, m := range modules {
		fmt.Printf("## %s %s\n\n", m.Path, m.Version)
		files, _ := filepath.Glob(filepath.Join(m.Dir, "LICENSE*"))
		if len(files) == 0 {
			files, _ = filepath.Glob(filepath.Join(m.Dir, "COPYING*"))
		}
		if len(files) == 0 {
			fmt.Println("No license file was present in the module cache. Consult the module source before redistribution.")
			continue
		}
		for _, file := range files {
			data, readErr := os.ReadFile(file)
			if readErr != nil {
				continue
			}
			fmt.Printf("### %s\n\n```text\n%s\n```\n\n", filepath.Base(file), strings.TrimSpace(string(data)))
		}
	}
}
