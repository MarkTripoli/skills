.PHONY: build test test-race lint e2e

build:
	tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && go build -o "$$tmp/safety-dance" ./cmd/safety-dance

test:
	go test ./...

test-race:
	go test -race ./...

lint:
	go vet ./...

e2e: build
	go test ./internal/e2e/...
