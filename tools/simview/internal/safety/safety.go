// Package safety is the input guard driven by SIMVIEW_INPUT_ALLOW.
package safety

import (
	"fmt"
	"os"
	"strings"
)

// Env names the allow-list variable.
const Env = "SIMVIEW_INPUT_ALLOW"

// AllowedBy reports whether id may receive input under the list. A nil list (variable
// unset) allows everything. Entries are exact ids; a trailing "*" makes a prefix match.
func AllowedBy(list *string, id string) bool {
	if list == nil {
		return true
	}
	for _, e := range strings.Split(*list, ",") {
		e = strings.TrimSpace(e)
		if e == "" {
			continue
		}
		if prefix, ok := strings.CutSuffix(e, "*"); ok {
			if strings.HasPrefix(id, prefix) {
				return true
			}
		} else if e == id {
			return true
		}
	}
	return false
}

// InputAllowed reads SIMVIEW_INPUT_ALLOW and checks id.
func InputAllowed(id string) bool {
	v, ok := os.LookupEnv(Env)
	if !ok {
		return AllowedBy(nil, id)
	}
	return AllowedBy(&v, id)
}

// Refusal is the error text for a refused device.
func Refusal(id string) string {
	return fmt.Sprintf("input to %s not allowed by %s", id, Env)
}

// Guarded runs connect only when id is allowed; the refusal error otherwise. The check
// happens before connect is called, so a refused device is never touched.
func Guarded[T any](list *string, id string, connect func() T) (T, error) {
	var zero T
	if !AllowedBy(list, id) {
		return zero, fmt.Errorf("%s", Refusal(id))
	}
	return connect(), nil
}
