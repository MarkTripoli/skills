# Runtime build fixture

The package build is supported in CI with an explicit runtime argument:

```sh
npm run build -- RUNTIME=node
```

The package script delegates to `make build`; `RUNTIME` is required. Running
`npm run build` without it prints usage and exits nonzero; that usage response
is expected interface behavior and not a product failure.
