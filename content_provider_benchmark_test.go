package intentionalcode

import (
	"path/filepath"
	"testing"
)

const benchmarkSlug = "patterns/architectural/circuit-breaker"

func BenchmarkContentProviderGetLiveRender(b *testing.B) {
	contentDir := filepath.Clean("content")
	provider := newLiveMarkdownProvider(contentDir, StdlibMarkdownRenderer{})

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := provider.Get(benchmarkSlug); err != nil {
			b.Fatalf("live provider get: %v", err)
		}
	}
}

func BenchmarkContentProviderGetPreRender(b *testing.B) {
	contentDir := filepath.Clean("content")
	provider, err := newPreRenderedMarkdownProvider(contentDir, StdlibMarkdownRenderer{})
	if err != nil {
		b.Fatalf("new pre-render provider: %v", err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, getErr := provider.Get(benchmarkSlug); getErr != nil {
			b.Fatalf("pre-render provider get: %v", getErr)
		}
	}
}
