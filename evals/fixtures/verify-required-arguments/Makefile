.PHONY: build

build:
	@if [ -z "$(RUNTIME)" ]; then echo 'usage: make build RUNTIME=<runtime>' >&2; exit 2; fi
	@if [ "$(RUNTIME)" != "node" ]; then echo "unsupported runtime: $(RUNTIME)" >&2; exit 2; fi
	@node --check src/cli.mjs
	@mkdir -p dist
	@printf 'built for %s\n' "$(RUNTIME)" > dist/runtime.txt
	@echo "build complete for $(RUNTIME)"
