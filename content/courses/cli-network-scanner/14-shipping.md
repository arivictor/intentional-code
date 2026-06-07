---
title: "Module 14: Shipping a Single Binary"
description: "Build, version, cross-compile, and distribute netscan as a single self-contained binary. No install script. No runtime dependencies."
---

# Module 14: Shipping a Single Binary

One of Go's best features for CLI tools: you compile to a single binary with no runtime dependencies. No Python virtual environment. No Node modules directory. No JVM. Users download one file, make it executable, run it.

This module covers the practical steps to get there.

## Build basics

```bash
go build ./cmd/netscan
```

Produces a `netscan` binary in the current directory. Statically linked by default on Linux; dynamically linked on macOS (links against system libc, which is fine — every Mac has it).

```bash
# Run directly
./netscan host google.com
```

## Embedding the version

Right now `netscan --help` shows `dev` as the version. For a real release, you want the actual version embedded in the binary — set at build time, not stored in a config file.

```go
// cmd/netscan/main.go
var version = "dev" // overridden by -ldflags at build time
```

```bash
go build -ldflags "-X main.version=1.0.0" ./cmd/netscan
```

`-ldflags "-X package.variable=value"` sets a string variable at link time. The binary carries the version without reading it from anywhere at runtime.

For releases, derive the version from the git tag:

```bash
VERSION=$(git describe --tags --always --dirty)
go build -ldflags "-X main.version=${VERSION}" ./cmd/netscan
```

`git describe --tags` gives you `v1.0.0` if you're on the tag, or `v1.0.0-3-gabc1234` if you're three commits ahead. `--always` falls back to the commit hash if there are no tags. `--dirty` appends `-dirty` if there are uncommitted changes.

## Cross-compilation

Go compiles for any supported target from any host. Set `GOOS` and `GOARCH`:

```bash
# macOS Apple Silicon
GOOS=darwin  GOARCH=arm64 go build -o netscan-darwin-arm64  ./cmd/netscan

# macOS Intel
GOOS=darwin  GOARCH=amd64 go build -o netscan-darwin-amd64  ./cmd/netscan

# Linux amd64 (most servers)
GOOS=linux   GOARCH=amd64 go build -o netscan-linux-amd64   ./cmd/netscan

# Linux arm64 (Raspberry Pi, AWS Graviton)
GOOS=linux   GOARCH=arm64 go build -o netscan-linux-arm64   ./cmd/netscan

# Windows
GOOS=windows GOARCH=amd64 go build -o netscan-windows-amd64.exe ./cmd/netscan
```

No cross-compiler needed. Go ships all targets in the standard toolchain.

## Makefile

A `Makefile` keeps the build commands reproducible:

```makefile
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -ldflags "-X main.version=$(VERSION)"

.PHONY: build test clean release

build:
	go build $(LDFLAGS) -o netscan ./cmd/netscan

test:
	go test -race ./...

clean:
	rm -f netscan netscan-*

release:
	GOOS=darwin  GOARCH=arm64 go build $(LDFLAGS) -o netscan-darwin-arm64  ./cmd/netscan
	GOOS=darwin  GOARCH=amd64 go build $(LDFLAGS) -o netscan-darwin-amd64  ./cmd/netscan
	GOOS=linux   GOARCH=amd64 go build $(LDFLAGS) -o netscan-linux-amd64   ./cmd/netscan
	GOOS=linux   GOARCH=arm64 go build $(LDFLAGS) -o netscan-linux-arm64   ./cmd/netscan
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o netscan-windows-amd64.exe ./cmd/netscan
```

```bash
make build    # build for the current platform
make test     # run tests with race detector
make release  # build all targets
```

## GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go test -race ./...

  build:
    runs-on: ubuntu-latest
    needs: test
    if: startsWith(github.ref, 'refs/tags/')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: make release
      - uses: softprops/action-gh-release@v1
        with:
          files: netscan-*
```

On every push to `main`: run tests. On every tag push: build all targets and attach them to a GitHub release.

Tag a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions picks up the tag, runs the build job, and creates a release with all binaries attached.

## Distribution options

**`go install`** — for Go developers:

```bash
go install github.com/yourname/netscan/cmd/netscan@latest
```

Compiles from source and puts the binary in `$GOPATH/bin`. Requires Go to be installed.

**Direct binary download** — for everyone:

From the GitHub release page, users download the binary for their platform and put it in their PATH. No installation script needed.

```bash
# macOS example
curl -Lo netscan https://github.com/yourname/netscan/releases/latest/download/netscan-darwin-arm64
chmod +x netscan
mv netscan /usr/local/bin/
```

**Homebrew tap** (optional, later):

```ruby
# Formula/netscan.rb
class Netscan < Formula
  desc "Network scanner CLI built with Go"
  homepage "https://github.com/yourname/netscan"
  version "1.0.0"

  on_macos do
    on_arm do
      url "https://github.com/yourname/netscan/releases/download/v1.0.0/netscan-darwin-arm64"
      sha256 "..."
    end
    on_intel do
      url "https://github.com/yourname/netscan/releases/download/v1.0.0/netscan-darwin-amd64"
      sha256 "..."
    end
  end

  def install
    bin.install "netscan-darwin-arm64" => "netscan"
  end
end
```

Then users:

```bash
brew tap yourname/tools
brew install netscan
```

## Reduce binary size (optional)

The default Go binary includes the symbol table and debug information. For distribution, strip them:

```bash
go build -ldflags "-s -w -X main.version=1.0.0" ./cmd/netscan
```

`-s` strips the symbol table. `-w` strips DWARF debug information. Typically reduces binary size by 20–30%.

For further reduction, `upx` compresses the binary (at the cost of slightly slower startup):

```bash
upx --best netscan
```

For most CLI tools, the uncompressed size is fine. `netscan` will be under 10MB without compression.

## Verify the release

```bash
./netscan-linux-amd64 host google.com
./netscan-darwin-arm64 dns cloudflare.com --type=NS
./netscan-linux-arm64 --help
```

If the binary reports the correct version and commands work, the release is good.

---

## You've finished the course

Here's what you built:

- A **reusable CLI framework** (`internal/cli/`) with a command registry, middleware chain, typed context, and automatic help — applicable to any CLI tool, not just network scanners
- A **network scanner** that probes hosts, scans ports concurrently, discovers subnet hosts, resolves DNS, and continuously monitors — all with zero external dependencies
- **Ten patterns in context**, introduced at the moment the code needed them, with an explicit explanation of why that moment and not earlier
- **Tests that don't hit the network**, using injected interfaces and `bytes.Buffer` to achieve full coverage without flakiness

The framework lives in `internal/cli/`. When you build your next CLI tool, copy it over and adapt it. The patterns live in the [reference](/go) — use them when you feel the pain they solve.

That's the point of intentional code: not collecting patterns, but knowing when to reach for them.
