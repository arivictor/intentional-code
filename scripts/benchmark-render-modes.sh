#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_FILE="${1:-/tmp/render-benchmark.txt}"
PKG="./"
BENCH_RE='BenchmarkContentProviderGet(LiveRender|PreRender)$'

printf 'Running provider benchmarks...\n'
go test "$PKG" -run '^$' -bench "$BENCH_RE" -benchmem -count=5 > "$OUT_FILE"

printf '\nRaw benchmark output written to %s\n\n' "$OUT_FILE"
cat "$OUT_FILE"

live_ns="$(awk '/BenchmarkContentProviderGetLiveRender/{v=$3} END{print v}' "$OUT_FILE")"
pre_ns="$(awk '/BenchmarkContentProviderGetPreRender/{v=$3} END{print v}' "$OUT_FILE")"

if [[ -z "$live_ns" || -z "$pre_ns" ]]; then
  printf '\nCould not parse benchmark output.\n' >&2
  exit 1
fi

speedup="$(awk -v live="$live_ns" -v pre="$pre_ns" 'BEGIN { if (pre == 0) { print "inf" } else { printf "%.2f", live / pre } }')"

printf '\nSummary\n'
printf 'LiveRender: %s ns/op\n' "$live_ns"
printf 'PreRender:  %s ns/op\n' "$pre_ns"
printf 'Speedup (LiveRender / PreRender): %sx\n' "$speedup"
