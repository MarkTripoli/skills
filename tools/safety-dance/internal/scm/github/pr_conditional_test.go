package github

import "testing"

func TestParseIncludedPRRequiresETagAndBody(t *testing.T) {
	etag, body, err := parseIncludedPR([]byte("HTTP/1.1 200 OK\r\nETag: \"abc\"\r\n\r\n{\"body\":\"authored\"}"))
	if err != nil || etag != `"abc"` || body != "authored" {
		t.Fatalf("parseIncludedPR() = %q, %q, %v", etag, body, err)
	}
	if _, _, err := parseIncludedPR([]byte("HTTP/1.1 200 OK\r\n\r\n{\"body\":\"authored\"}")); err == nil {
		t.Fatal("missing ETag was accepted")
	}
}
