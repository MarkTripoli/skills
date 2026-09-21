.PHONY: build test test-race lint e2e

build:
	tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && go build -o "$$tmp/safety-dance" ./cmd/safety-dance

test:
	go test ./...

test-race:
	go test -race ./...

lint:
	go vet ./...

e2e:
	tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && go build -o "$$tmp/safety-dance" ./cmd/safety-dance && SD_E2E_BINARY="$$tmp/safety-dance" go test ./internal/e2e/...
