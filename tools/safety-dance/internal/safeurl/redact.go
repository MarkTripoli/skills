package safeurl

import (
	"net/url"
	"regexp"
	"strings"
)

var httpURLPattern = regexp.MustCompile(`https?://[^\s'"<>]+`)

// Redact hides userinfo and credential-bearing query parameters before values
// reach logs or persisted repository configuration.
func Redact(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return raw
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return raw
	}
	if parsed.User != nil {
		parsed.User = url.User("redacted")
	}
	if parsed.RawQuery != "" {
		query := parsed.Query()
		for key, values := range query {
			lower := strings.ToLower(key)
			if strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "key") || strings.Contains(lower, "signature") || strings.Contains(lower, "credential") {
				for i := range values {
					values[i] = "redacted"
				}
				query[key] = values
			}
		}
		parsed.RawQuery = query.Encode()
	}
	parsed.Fragment = ""
	return parsed.String()
}

func RedactText(text string) string {
	return httpURLPattern.ReplaceAllStringFunc(text, Redact)
}
