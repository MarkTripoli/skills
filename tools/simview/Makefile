MODULE := github.com/MarkTripoli/skills/tools/simview
PROTOC ?= protoc

.PHONY: build test test-race lint proto

build:
	tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && go build -o "$$tmp/simview" ./cmd/simview

test:
	go test ./...

test-race:
	go test -race ./...

lint:
	go vet ./...

# Regenerates the committed *.pb.go files. CI does not need protoc.
# Needs: protoc, and `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`
# and `go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest` on PATH.
proto:
	$(PROTOC) -Iproto \
		--go_out=internal/emulatorpb --go_opt=paths=source_relative --go_opt=Memulator_controller.proto=$(MODULE)/internal/emulatorpb \
		--go-grpc_out=internal/emulatorpb --go-grpc_opt=paths=source_relative --go-grpc_opt=Memulator_controller.proto=$(MODULE)/internal/emulatorpb \
		proto/emulator_controller.proto
	$(PROTOC) -Iproto \
		--go_out=internal/idbpb --go_opt=paths=source_relative --go_opt=Midb.proto=$(MODULE)/internal/idbpb \
		--go-grpc_out=internal/idbpb --go-grpc_opt=paths=source_relative --go-grpc_opt=Midb.proto=$(MODULE)/internal/idbpb \
		proto/idb.proto
