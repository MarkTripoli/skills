.PHONY: build test test-race lint

build:
	tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && go build -o "$$tmp/slack-coordinator" ./cmd/slack-coordinator

test:
	go test ./...

test-race:
	go test -race ./...

lint:
	go vet ./...
